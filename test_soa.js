/**
 * SoA f32 Engine 验证测试
 *
 * 策略: 使用极小 noise_amplitude=0 来消除 RNG 差异，
 *       纯测 f32 vs f64 数值精度。
 *       然后再测带 noise 的性能。
 */

'use strict';

const native = require('./native/index');

const NUM_AGENTS = 5000;
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

function createRng(seed) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function randomBaseline(rng) {
  const baseline = {};
  for (const dim of DIM_NAMES) {
    baseline[dim] = (rng() - 0.5) * 0.6;
  }
  return baseline;
}

function randomBehavior(rng) {
  return {
    emotion_decay_rate: 0.3 + rng() * 0.4,
    emotional_inertia: 0.2 + rng() * 0.4,
    susceptibility: 0.3 + rng() * 0.4,
    expressiveness: 0.3 + rng() * 0.5,
  };
}

// 零噪声 config — 消除 RNG 差异，纯测精度
const ZERO_NOISE_CONFIG = JSON.stringify({
  decay_lambda: 1.0,
  inertia: 0.5,
  max_delta_per_tick: 0.10,
  noise_amplitude: 0.0,       // ← 关键: 关闭 pink noise
  co_activation_weight: 0.3,
  baseline_drift_rate: 0.0001,
  circadian: {
    positive_affect_peak: 14.0,
    positive_affect_amp: 0.15,
    negative_affect_peak: 4.0,
    negative_affect_amp: 0.10,
  },
});

const NORMAL_CONFIG = JSON.stringify({
  decay_lambda: 1.0,
  inertia: 0.5,
  max_delta_per_tick: 0.10,
  noise_amplitude: 0.015,
  co_activation_weight: 0.3,
  baseline_drift_rate: 0.0001,
  circadian: {
    positive_affect_peak: 14.0,
    positive_affect_amp: 0.15,
    negative_affect_peak: 4.0,
    negative_affect_amp: 0.10,
  },
});

// ── Input builders ──
function buildF64Input(baselines) {
  const n = baselines.length;
  const buf = Buffer.alloc(n * 31 * 8);
  for (let i = 0; i < n; i++) {
    const off = i * 31 * 8;
    for (let d = 0; d < 30; d++) {
      buf.writeDoubleLE(baselines[i][DIM_NAMES[d]] || 0, off + d * 8);
    }
    buf.writeDoubleLE(2.0, off + 30 * 8);
  }
  return buf;
}

function buildF32Input(baselines) {
  const n = baselines.length;
  const buf = Buffer.alloc(n * 31 * 4);
  for (let i = 0; i < n; i++) {
    const off = i * 31 * 4;
    for (let d = 0; d < 30; d++) {
      buf.writeFloatLE(baselines[i][DIM_NAMES[d]] || 0, off + d * 4);
    }
    buf.writeFloatLE(2.0, off + 30 * 4);
  }
  return buf;
}

function extractF64Current(buf, n) {
  const perAgent = 107;
  const states = [];
  for (let i = 0; i < n; i++) {
    const off = i * perAgent * 8;
    const current = new Float64Array(30);
    for (let d = 0; d < 30; d++) current[d] = buf.readDoubleLE(off + d * 8);
    states.push(current);
  }
  return states;
}

function extractF32Current(buf, n) {
  const perAgent = 107;
  const states = [];
  for (let i = 0; i < n; i++) {
    const off = i * perAgent * 4;
    const current = new Float32Array(30);
    for (let d = 0; d < 30; d++) current[d] = buf.readFloatLE(off + d * 4);
    states.push(current);
  }
  return states;
}

function outputToInputF64(outBuf, n) {
  const input = Buffer.alloc(n * 31 * 8);
  for (let i = 0; i < n; i++) {
    outBuf.copy(input, i * 31 * 8, i * 107 * 8, i * 107 * 8 + 31 * 8);
  }
  return input;
}

function outputToInputF32(outBuf, n) {
  const input = Buffer.alloc(n * 31 * 4);
  for (let i = 0; i < n; i++) {
    outBuf.copy(input, i * 31 * 4, i * 107 * 4, i * 107 * 4 + 31 * 4);
  }
  return input;
}

// ═══════════════════════════════════════════
// Test
// ═══════════════════════════════════════════

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  SoA f32 Engine 验证测试');
  console.log('═══════════════════════════════════════════\n');

  // ══════════════════════════════════════════
  // Part A: 精度测试 (noise_amplitude=0, 消除 RNG 差异)
  // ══════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Part A: 精度测试 (零噪声)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rngA = createRng(42);
  const engineF64A = new native.BatchEmotionEngine(42);
  const engineF32A = new native.SoaBatchEngine(42);
  const configsA = [];

  for (let i = 0; i < NUM_AGENTS; i++) {
    const c = {
      behavior: JSON.stringify(randomBehavior(rngA)),
      savedState: JSON.stringify({ current: randomBaseline(rngA) }),
    };
    configsA.push(c);
    engineF64A.addAgent(c.behavior, ZERO_NOISE_CONFIG, c.savedState);
    engineF32A.addAgent(c.behavior, ZERO_NOISE_CONFIG, c.savedState);
  }

  const baselinesA = configsA.map(c => JSON.parse(c.savedState).current);
  let f64InA = buildF64Input(baselinesA);
  let f32InA = buildF32Input(baselinesA);

  let f64OutA, f32OutA;
  for (let t = 0; t < 10; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    f64OutA = engineF64A.tickAllBinary(f64InA, HOURS_ELAPSED, hour);
    f32OutA = engineF32A.tickSoaBinary(f32InA, HOURS_ELAPSED, hour);
    f64InA = outputToInputF64(f64OutA, NUM_AGENTS);
    f32InA = outputToInputF32(f32OutA, NUM_AGENTS);
  }

  const f64sA = extractF64Current(f64OutA, NUM_AGENTS);
  const f32sA = extractF32Current(f32OutA, NUM_AGENTS);

  let rawMAE_A = 0;
  let maxErr = 0;
  for (let i = 0; i < NUM_AGENTS; i++) {
    for (let d = 0; d < 30; d++) {
      const err = Math.abs(f64sA[i][d] - f32sA[i][d]);
      rawMAE_A += err;
      if (err > maxErr) maxErr = err;
    }
  }
  rawMAE_A /= (NUM_AGENTS * 30);

  console.log('  样本对比 (Agent 0, 前5维度):');
  for (let d = 0; d < 5; d++) {
    console.log(`    ${DIM_NAMES[d].padEnd(12)} f64=${f64sA[0][d].toFixed(8)}  f32=${f32sA[0][d].toFixed(8)}  Δ=${Math.abs(f64sA[0][d] - f32sA[0][d]).toFixed(8)}`);
  }
  console.log(`\n  全局 MAE: ${rawMAE_A.toFixed(8)}`);
  console.log(`  最大误差: ${maxErr.toFixed(8)}`);
  console.log(`  目标 (<0.01): ${rawMAE_A < 0.01 ? '✅ PASS' : '❌ FAIL'}`);

  // ══════════════════════════════════════════
  // Part B: 性能测试 (正常 noise)
  // ══════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Part B: 性能对比 (5000 agents, 20 ticks)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rngB = createRng(42);
  const engineF64B = new native.BatchEmotionEngine(42);
  const engineF32B = new native.SoaBatchEngine(42);
  const configsB = [];

  for (let i = 0; i < NUM_AGENTS; i++) {
    const c = {
      behavior: JSON.stringify(randomBehavior(rngB)),
      savedState: JSON.stringify({ current: randomBaseline(rngB) }),
    };
    configsB.push(c);
    engineF64B.addAgent(c.behavior, NORMAL_CONFIG, c.savedState);
    engineF32B.addAgent(c.behavior, NORMAL_CONFIG, c.savedState);
  }

  const baselinesB = configsB.map(c => JSON.parse(c.savedState).current);

  // Warmup
  let wF64 = buildF64Input(baselinesB);
  let wF32 = buildF32Input(baselinesB);
  for (let t = 0; t < 3; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    wF64 = outputToInputF64(engineF64B.tickAllBinary(wF64, HOURS_ELAPSED, hour), NUM_AGENTS);
    wF32 = outputToInputF32(engineF32B.tickSoaBinary(wF32, HOURS_ELAPSED, hour), NUM_AGENTS);
  }

  // Benchmark f64
  let benchF64 = buildF64Input(baselinesB);
  const f64Times = [];
  for (let t = 0; t < NUM_TICKS; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    const start = performance.now();
    const out = engineF64B.tickAllBinary(benchF64, HOURS_ELAPSED, hour);
    f64Times.push(performance.now() - start);
    benchF64 = outputToInputF64(out, NUM_AGENTS);
  }

  // Benchmark f32
  let benchF32 = buildF32Input(baselinesB);
  const f32Times = [];
  for (let t = 0; t < NUM_TICKS; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    const start = performance.now();
    const out = engineF32B.tickSoaBinary(benchF32, HOURS_ELAPSED, hour);
    f32Times.push(performance.now() - start);
    benchF32 = outputToInputF32(out, NUM_AGENTS);
  }

  f64Times.sort((a, b) => a - b);
  f32Times.sort((a, b) => a - b);
  const f64Median = f64Times[Math.floor(f64Times.length / 2)];
  const f32Median = f32Times[Math.floor(f32Times.length / 2)];

  console.log(`  f64 Median: ${f64Median.toFixed(1)}ms`);
  console.log(`  f32 Median: ${f32Median.toFixed(1)}ms`);
  console.log(`  加速比: ${(f64Median / f32Median).toFixed(2)}x`);

  // ══════════════════════════════════════════
  // Part C: 大规模性能 (50K agents)
  // ══════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Part C: 大规模性能 (50,000 agents, 10 ticks)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const BIG_AGENTS = 50000;
  const BIG_TICKS = 10;

  const rngC = createRng(42);
  const engineF64C = new native.BatchEmotionEngine(42);
  const engineF32C = new native.SoaBatchEngine(42);
  const configsC = [];

  for (let i = 0; i < BIG_AGENTS; i++) {
    const c = {
      behavior: JSON.stringify(randomBehavior(rngC)),
      savedState: JSON.stringify({ current: randomBaseline(rngC) }),
    };
    configsC.push(c);
    engineF64C.addAgent(c.behavior, NORMAL_CONFIG, c.savedState);
    engineF32C.addAgent(c.behavior, NORMAL_CONFIG, c.savedState);
  }

  const baselinesC = configsC.map(c => JSON.parse(c.savedState).current);

  // Warmup
  let wF64C = buildF64Input(baselinesC);
  let wF32C = buildF32Input(baselinesC);
  for (let t = 0; t < 2; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    wF64C = outputToInputF64(engineF64C.tickAllBinary(wF64C, HOURS_ELAPSED, hour), BIG_AGENTS);
    wF32C = outputToInputF32(engineF32C.tickSoaBinary(wF32C, HOURS_ELAPSED, hour), BIG_AGENTS);
  }

  // Benchmark
  let bF64C = buildF64Input(baselinesC);
  const f64TimesC = [];
  for (let t = 0; t < BIG_TICKS; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    const start = performance.now();
    const out = engineF64C.tickAllBinary(bF64C, HOURS_ELAPSED, hour);
    f64TimesC.push(performance.now() - start);
    bF64C = outputToInputF64(out, BIG_AGENTS);
  }

  let bF32C = buildF32Input(baselinesC);
  const f32TimesC = [];
  for (let t = 0; t < BIG_TICKS; t++) {
    const hour = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;
    const start = performance.now();
    const out = engineF32C.tickSoaBinary(bF32C, HOURS_ELAPSED, hour);
    f32TimesC.push(performance.now() - start);
    bF32C = outputToInputF32(out, BIG_AGENTS);
  }

  f64TimesC.sort((a, b) => a - b);
  f32TimesC.sort((a, b) => a - b);
  const f64MedianC = f64TimesC[Math.floor(f64TimesC.length / 2)];
  const f32MedianC = f32TimesC[Math.floor(f32TimesC.length / 2)];

  console.log(`  f64 Median: ${f64MedianC.toFixed(1)}ms`);
  console.log(`  f32 Median: ${f32MedianC.toFixed(1)}ms`);
  console.log(`  加速比: ${(f64MedianC / f32MedianC).toFixed(2)}x`);
  console.log(`  I/O buffer: f64=${(BIG_AGENTS * 31 * 8 / 1e6).toFixed(1)}MB, f32=${(BIG_AGENTS * 31 * 4 / 1e6).toFixed(1)}MB`);

  // ══════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════');
  console.log('  总结');
  console.log('═══════════════════════════════════════════');
  console.log(`  精度 (零噪声): MAE=${rawMAE_A.toFixed(8)}, 最大=${maxErr.toFixed(8)}`);
  console.log(`  精度目标 (<0.01): ${rawMAE_A < 0.01 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  5K 加速比: ${(f64Median / f32Median).toFixed(2)}x`);
  console.log(`  50K 加速比: ${(f64MedianC / f32MedianC).toFixed(2)}x`);
  console.log(`  内存: f32 省 ${(920/480).toFixed(1)}x`);
  console.log('═══════════════════════════════════════════');
}

run().catch(console.error);
