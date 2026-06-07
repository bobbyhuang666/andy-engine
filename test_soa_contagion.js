/**
 * SoA f32 + Dunbar 分频传染 性能测试
 * 对比: f64+full contagion vs f32+hierarchical contagion
 */

'use strict';

const native = require('./native/index');

const NUM_AGENTS = 50000;
const NUM_TICKS = 20;
const HOURS_ELAPSED = 5 / 60;
const INITIAL_HOUR = 8.0;

const DIM_NAMES = [
  'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
  'amusement', 'awe', 'contentment', 'desire', 'embarrassment', 'guilt',
  'horror', 'interest', 'love', 'nervousness', 'pride', 'relief',
  'satisfaction', 'shame', 'sympathy', 'triumph', 'boredom', 'calm',
  'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness',
];

const CLOSE_FRIENDS = 5;
const FRIENDS = 10;
const ACQUAINTANCES = 30;

function createRng(seed) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function randomBaseline(rng) {
  const b = {};
  for (const dim of DIM_NAMES) b[dim] = (rng() - 0.5) * 0.6;
  return b;
}

function randomBehavior(rng) {
  return {
    emotion_decay_rate: 0.3 + rng() * 0.4,
    emotional_inertia: 0.2 + rng() * 0.4,
    susceptibility: 0.3 + rng() * 0.4,
    expressiveness: 0.3 + rng() * 0.5,
  };
}

const EMOTION_CONFIG = JSON.stringify({
  decay_lambda: 1.0, inertia: 0.5, max_delta_per_tick: 0.10,
  noise_amplitude: 0.015, co_activation_weight: 0.3, baseline_drift_rate: 0.0001,
  circadian: { positive_affect_peak: 14.0, positive_affect_amp: 0.15,
               negative_affect_peak: 4.0, negative_affect_amp: 0.10 },
});

function generateDunbarGraph(n, rng) {
  const edgesPerAgent = CLOSE_FRIENDS + FRIENDS + ACQUAINTANCES;
  const totalEdges = n * edgesPerAgent;
  const offsets = new Uint32Array(n + 1);
  const neighbors = new Uint32Array(totalEdges);
  const levels = new Uint8Array(totalEdges);
  const strengths = new Float32Array(totalEdges);

  let idx = 0;
  for (let i = 0; i < n; i++) {
    offsets[i] = idx;
    for (let k = 0; k < CLOSE_FRIENDS; k++) {
      let nb; do { nb = Math.floor(rng() * n); } while (nb === i);
      neighbors[idx] = nb; levels[idx] = 0;
      strengths[idx] = 0.6 + rng() * 0.35; idx++;
    }
    for (let k = 0; k < FRIENDS; k++) {
      let nb; do { nb = Math.floor(rng() * n); } while (nb === i);
      neighbors[idx] = nb; levels[idx] = 1;
      strengths[idx] = 0.3 + rng() * 0.3; idx++;
    }
    for (let k = 0; k < ACQUAINTANCES; k++) {
      let nb; do { nb = Math.floor(rng() * n); } while (nb === i);
      neighbors[idx] = nb; levels[idx] = 2;
      strengths[idx] = 0.1 + rng() * 0.2; idx++;
    }
  }
  offsets[n] = idx;
  return { offsets, neighbors, levels, strengths };
}

function buildF64Input(baselines) {
  const n = baselines.length;
  const buf = Buffer.alloc(n * 31 * 8);
  for (let i = 0; i < n; i++) {
    const off = i * 31 * 8;
    for (let d = 0; d < 30; d++) buf.writeDoubleLE(baselines[i][DIM_NAMES[d]] || 0, off + d * 8);
    buf.writeDoubleLE(2.0, off + 30 * 8);
  }
  return buf;
}

function buildF32Input(baselines) {
  const n = baselines.length;
  const buf = Buffer.alloc(n * 31 * 4);
  for (let i = 0; i < n; i++) {
    const off = i * 31 * 4;
    for (let d = 0; d < 30; d++) buf.writeFloatLE(baselines[i][DIM_NAMES[d]] || 0, off + d * 4);
    buf.writeFloatLE(2.0, off + 30 * 4);
  }
  return buf;
}

function outputToInputF64(outBuf, n) {
  const input = Buffer.alloc(n * 31 * 8);
  for (let i = 0; i < n; i++) outBuf.copy(input, i * 31 * 8, i * 107 * 8, i * 107 * 8 + 31 * 8);
  return input;
}

function outputToInputF32(outBuf, n) {
  const input = Buffer.alloc(n * 31 * 4);
  for (let i = 0; i < n; i++) outBuf.copy(input, i * 31 * 4, i * 107 * 4, i * 107 * 4 + 31 * 4);
  return input;
}

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  SoA f32 + Dunbar 传染 性能对比');
  console.log('═══════════════════════════════════════════\n');

  const rng = createRng(42);
  const configs = [];
  for (let i = 0; i < NUM_AGENTS; i++) {
    configs.push({
      behavior: JSON.stringify(randomBehavior(rng)),
      savedState: JSON.stringify({ current: randomBaseline(rng) }),
    });
  }

  // Create engines
  console.log(`[1/5] 创建 engines (${NUM_AGENTS.toLocaleString()} agents)...`);
  const f64Full = new native.BatchEmotionEngine(42);
  const f32Hier = new native.SoaBatchEngine(42);
  for (const c of configs) {
    f64Full.addAgent(c.behavior, EMOTION_CONFIG, c.savedState);
    f32Hier.addAgent(c.behavior, EMOTION_CONFIG, c.savedState);
  }

  // Generate graph
  console.log('[2/5] 生成 Dunbar 社交图...');
  const graphRng = createRng(123);
  const graph = generateDunbarGraph(NUM_AGENTS, graphRng);

  // Load graph into both engines
  f64Full.setupSocialGraphBinary(
    Buffer.from(graph.offsets.buffer),
    Buffer.from(graph.neighbors.buffer),
    Buffer.from(graph.levels.buffer),
    Buffer.from(graph.strengths.buffer),
  );
  f32Hier.setupSocialGraphBinary(
    Buffer.from(graph.offsets.buffer),
    Buffer.from(graph.neighbors.buffer),
    Buffer.from(graph.levels.buffer),
    Buffer.from(graph.strengths.buffer),
  );

  const baselines = configs.map(c => JSON.parse(c.savedState).current);

  // Warmup
  console.log('[3/5] Warmup...');
  let wF64 = buildF64Input(baselines);
  let wF32 = buildF32Input(baselines);
  for (let t = 0; t < 3; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    wF64 = outputToInputF64(f64Full.tickAllFullContagionBinary(wF64, HOURS_ELAPSED, hour), NUM_AGENTS);
    wF32 = outputToInputF32(f32Hier.tickSoaContagionBinary(wF32, HOURS_ELAPSED, hour), NUM_AGENTS);
  }

  // Benchmark: f64 + full contagion
  console.log(`\n[4/5] f64 + Full Contagion × ${NUM_TICKS} ticks...`);
  let bF64 = buildF64Input(baselines);
  const f64Times = [];
  for (let t = 0; t < NUM_TICKS; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    const start = performance.now();
    const out = f64Full.tickAllFullContagionBinary(bF64, HOURS_ELAPSED, hour);
    f64Times.push(performance.now() - start);
    bF64 = outputToInputF64(out, NUM_AGENTS);
  }

  // Benchmark: f32 + hierarchical contagion
  console.log(`[5/5] f32 + Hierarchical Contagion × ${NUM_TICKS} ticks...`);
  let bF32 = buildF32Input(baselines);
  const f32Times = [];
  for (let t = 0; t < NUM_TICKS; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    const start = performance.now();
    const out = f32Hier.tickSoaContagionBinary(bF32, HOURS_ELAPSED, hour);
    f32Times.push(performance.now() - start);
    bF32 = outputToInputF32(out, NUM_AGENTS);
  }

  f64Times.sort((a, b) => a - b);
  f32Times.sort((a, b) => a - b);
  const f64Median = f64Times[Math.floor(f64Times.length / 2)];
  const f32Median = f32Times[Math.floor(f32Times.length / 2)];

  console.log('\n═══════════════════════════════════════════');
  console.log('  结果');
  console.log('═══════════════════════════════════════════');
  console.log(`  Agents:      ${NUM_AGENTS.toLocaleString()}`);
  console.log(`  Edges/agent: ${CLOSE_FRIENDS + FRIENDS + ACQUAINTANCES} (Dunbar)`);
  console.log('');
  console.log(`  f64 + Full Contagion:       ${f64Median.toFixed(1)}ms`);
  console.log(`  f32 + Hierarchical Contagion: ${f32Median.toFixed(1)}ms`);
  console.log(`  综合加速比:                  ${(f64Median / f32Median).toFixed(2)}x`);
  console.log('');
  console.log(`  f32 I/O: ${(NUM_AGENTS * 31 * 4 / 1e6).toFixed(1)}MB input, ${(NUM_AGENTS * 107 * 4 / 1e6).toFixed(1)}MB output`);
  console.log(`  f64 I/O: ${(NUM_AGENTS * 31 * 8 / 1e6).toFixed(1)}MB input, ${(NUM_AGENTS * 107 * 8 / 1e6).toFixed(1)}MB output`);
  console.log(`  内存缩减: 1.9x (agent) + 2x (I/O buffer)`);
  console.log('═══════════════════════════════════════════');
}

run().catch(console.error);
