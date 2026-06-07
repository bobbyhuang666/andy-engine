/**
 * Dunbar Hierarchical Contagion 实验
 *
 * 验证目标:
 *   1. 分频传染 vs 全量同步，情绪轨迹偏差 < 5%
 *   2. 分频传染计算量降低 ~10x
 *
 * 实验设计:
 *   - 10,000 agents，每人 ~15 条社交边（Dunbar 分层）
 *   - 100 ticks 模拟，每 tick 推进 5 分钟
 *   - 对比: tickAllFullContagionBinary vs tickAllHierarchicalBinary
 *   - 度量: MAE / 最大偏差 / 每 tick 耗时
 */

'use strict';

const native = require('../native/index');

// ═══════════════════════════════════════════
// 实验参数
// ═══════════════════════════════════════════

const NUM_AGENTS = parseInt(process.env.AGENTS || '50000', 10);
const NUM_TICKS = parseInt(process.env.TICKS || '50', 10);
const HOURS_ELAPSED = 5 / 60; // 5 minutes per tick
const INITIAL_HOUR = 8.0;     // start at 8am
const WARMUP_TICKS = 5;

// Dunbar layer distribution per agent
const CLOSE_FRIENDS = 5;
const FRIENDS = 10;
const ACQUAINTANCES = NUM_AGENTS >= 10000 ? 30 : 0; // acquaintances only at scale
const EDGES_PER_AGENT = CLOSE_FRIENDS + FRIENDS + ACQUAINTANCES;

// Emotion config (matching defaults.js)
const EMOTION_CONFIG = JSON.stringify({
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

// 30 emotion dimension names (matching Rust DIM_NAMES order)
const DIM_NAMES = [
  'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
  'amusement', 'awe', 'contentment', 'desire', 'embarrassment', 'guilt',
  'horror', 'interest', 'love', 'nervousness', 'pride', 'relief',
  'satisfaction', 'shame', 'sympathy', 'triumph', 'boredom', 'calm',
  'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness',
];

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

/** 简单的 PRNG (xorshift32) — 可重复 */
function createRng(seed) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** 生成随机 emotion baseline (每个维度 [-0.3, 0.3]) */
function randomBaseline(rng) {
  const baseline = {};
  for (const dim of DIM_NAMES) {
    baseline[dim] = (rng() - 0.5) * 0.6;
  }
  return baseline;
}

/** 生成随机 behavior params */
function randomBehavior(rng) {
  return {
    emotion_decay_rate: 0.3 + rng() * 0.4,    // [0.3, 0.7]
    emotional_inertia: 0.2 + rng() * 0.4,      // [0.2, 0.6]
    susceptibility: 0.3 + rng() * 0.4,          // [0.3, 0.7]
    expressiveness: 0.3 + rng() * 0.5,          // [0.3, 0.8]
  };
}

/**
 * 生成 Dunbar 分层社交图 (CSR 格式)
 *
 * 返回 { offsets: Uint32Array, neighbors: Uint32Array, levels: Uint8Array, strengths: Float32Array }
 */
function generateDunbarGraph(numAgents, rng) {
  const closeFriends = CLOSE_FRIENDS;
  const friends = FRIENDS;
  const acquaintances = ACQUAINTANCES;
  const edgesPerAgent = closeFriends + friends + acquaintances;
  const totalEdges = numAgents * edgesPerAgent;

  const offsets = new Uint32Array(numAgents + 1);
  const neighbors = new Uint32Array(totalEdges);
  const levels = new Uint8Array(totalEdges);
  const strengths = new Float32Array(totalEdges);

  let edgeIdx = 0;

  for (let i = 0; i < numAgents; i++) {
    offsets[i] = edgeIdx;

    // Close friends (level 0): strong ties
    for (let k = 0; k < closeFriends; k++) {
      let nb;
      do { nb = Math.floor(rng() * numAgents); } while (nb === i);
      neighbors[edgeIdx] = nb;
      levels[edgeIdx] = 0; // close_friend
      strengths[edgeIdx] = 0.6 + rng() * 0.35; // [0.6, 0.95]
      edgeIdx++;
    }

    // Friends (level 1): medium ties
    for (let k = 0; k < friends; k++) {
      let nb;
      do { nb = Math.floor(rng() * numAgents); } while (nb === i);
      neighbors[edgeIdx] = nb;
      levels[edgeIdx] = 1; // friend
      strengths[edgeIdx] = 0.3 + rng() * 0.3; // [0.3, 0.6]
      edgeIdx++;
    }

    // Acquaintances (level 2): weak ties
    for (let k = 0; k < acquaintances; k++) {
      let nb;
      do { nb = Math.floor(rng() * numAgents); } while (nb === i);
      neighbors[edgeIdx] = nb;
      levels[edgeIdx] = 2; // acquaintance
      strengths[edgeIdx] = 0.1 + rng() * 0.2; // [0.1, 0.3]
      edgeIdx++;
    }
  }

  offsets[numAgents] = edgeIdx;
  console.log(`  图生成完成: ${numAgents} agents, ${edgeIdx} edges, ${edgesPerAgent} edges/agent`);

  return { offsets, neighbors, levels, strengths };
}

/**
 * 将 states 打包为 binary buffer (N × 31 × 8 bytes)
 * 每个 agent: current[30] + stress[1]
 */
function packStates(agents, numAgents) {
  const buf = Buffer.alloc(numAgents * 31 * 8);
  for (let i = 0; i < numAgents; i++) {
    const offset = i * 31 * 8;
    const state = agents[i].getCurrentState();
    for (let d = 0; d < 30; d++) {
      buf.writeDoubleLE(state[DIM_NAMES[d]] || 0, offset + d * 8);
    }
    buf.writeDoubleLE(state.stress || 2.0, offset + 30 * 8);
  }
  return buf;
}

/**
 * 从 binary output buffer 解析当前情绪状态
 * 输出格式: current[30] + mood[30] + baseline[30] + stress[1] + pink[16] = 107 doubles
 */
function unpackOutput(buf, numAgents) {
  const outputPerAgent = 107;
  const states = new Array(numAgents);
  for (let i = 0; i < numAgents; i++) {
    const offset = i * outputPerAgent * 8;
    const current = new Float64Array(30);
    for (let d = 0; d < 30; d++) {
      current[d] = buf.readDoubleLE(offset + d * 8);
    }
    states[i] = current;
  }
  return states;
}

/** 计算两组状态之间的 MAE (每个 agent 每个维度的平均绝对误差) */
function computeMAE(statesA, statesB) {
  let totalAbsError = 0;
  let totalValues = 0;
  let maxAgentMAE = 0;

  for (let i = 0; i < statesA.length; i++) {
    let agentError = 0;
    for (let d = 0; d < 30; d++) {
      const err = Math.abs(statesA[i][d] - statesB[i][d]);
      totalAbsError += err;
      agentError += err;
      totalValues++;
    }
    const agentMAE = agentError / 30;
    if (agentMAE > maxAgentMAE) maxAgentMAE = agentMAE;
  }

  return {
    globalMAE: totalAbsError / totalValues,
    maxAgentMAE,
  };
}

/** 计算情绪值域范围 (用于计算相对误差) */
function computeValueRange(states) {
  let min = Infinity, max = -Infinity;
  for (const s of states) {
    for (let d = 0; d < 30; d++) {
      if (s[d] < min) min = s[d];
      if (s[d] > max) max = s[d];
    }
  }
  return max - min;
}

// ═══════════════════════════════════════════
// 主实验流程
// ═══════════════════════════════════════════

async function runExperiment() {
  console.log('═══════════════════════════════════════════');
  console.log('  Dunbar Hierarchical Contagion 实验');
  console.log('═══════════════════════════════════════════\n');

  const rng = createRng(42);

  // ── Step 1: 创建两组完全相同的 engines ──
  console.log('[1/6] 创建 engines...');
  const engineFull = new native.BatchEmotionEngine(42);
  const engineHier = new native.BatchEmotionEngine(42);

  for (let i = 0; i < NUM_AGENTS; i++) {
    const behavior = JSON.stringify(randomBehavior(rng));
    const savedState = JSON.stringify({ current: randomBaseline(rng) });

    engineFull.addAgent(behavior, EMOTION_CONFIG, savedState);
    engineHier.addAgent(behavior, EMOTION_CONFIG, savedState);
  }
  console.log(`  ${NUM_AGENTS} agents 已创建`);

  // ── Step 2: 生成社交图 ──
  console.log('\n[2/6] 生成 Dunbar 社交图...');
  const graphRng = createRng(123);
  const graph = generateDunbarGraph(NUM_AGENTS, graphRng);

  // 将图设为 Buffer（原始二进制）
  const offsetsBuf = Buffer.from(graph.offsets.buffer);
  const neighborsBuf = Buffer.from(graph.neighbors.buffer);
  const levelsBuf = Buffer.from(graph.levels.buffer);
  const strengthsBuf = Buffer.from(graph.strengths.buffer);

  engineFull.setupSocialGraphBinary(offsetsBuf, neighborsBuf, levelsBuf, strengthsBuf);
  engineHier.setupSocialGraphBinary(offsetsBuf, neighborsBuf, levelsBuf, strengthsBuf);
  console.log(`  图已加载到两个 engines`);

  // ── Step 3: Warmup + 构建共同起点 ──
  // tick_*_binary: 读 input (31×8/agent) → 更新内部状态 → 写 output (107×8/agent)
  // output 的前 31 个 doubles 就是 current[30]+stress[1]，可直接作为下一轮 input
  console.log('\n[3/6] Warmup (无传染，同步起点)...');
  const INPUT_PER_AGENT = 31;
  const OUTPUT_PER_AGENT = 107;
  const inputBytes = NUM_AGENTS * INPUT_PER_AGENT * 8;
  const outputBytes = NUM_AGENTS * OUTPUT_PER_AGENT * 8;

  const warmupBuf = Buffer.alloc(inputBytes);
  for (let i = 0; i < NUM_AGENTS; i++) {
    warmupBuf.writeDoubleLE(2.0, i * INPUT_PER_AGENT * 8 + 30 * 8); // stress=2
  }

  // Warmup engineFull: tickAllBinary (无传染)
  for (let t = 0; t < WARMUP_TICKS; t++) {
    const out = engineFull.tickAllBinary(warmupBuf, HOURS_ELAPSED, INITIAL_HOUR + t * HOURS_ELAPSED);
    // out = 107×8 bytes/agent, warmupBuf = 31×8 bytes/agent
    // 复制前 31×8×N bytes（current + stress）作为下一轮 input
    out.copy(warmupBuf, 0, 0, inputBytes);
  }

  // Warmup engineHier: 相同 input
  const hierWarmupBuf = Buffer.alloc(inputBytes);
  warmupBuf.copy(hierWarmupBuf);
  for (let t = 0; t < WARMUP_TICKS; t++) {
    const out = engineHier.tickAllBinary(hierWarmupBuf, HOURS_ELAPSED, INITIAL_HOUR + t * HOURS_ELAPSED);
    out.copy(hierWarmupBuf, 0, 0, inputBytes);
  }
  console.log('  Warmup 完成');

  /** 从 107×8 bytes/agent 的 output 提取前 31×8 bytes/agent 作为下一轮 input */
  function outputToInput(outBuf) {
    const input = Buffer.alloc(inputBytes);
    for (let i = 0; i < NUM_AGENTS; i++) {
      outBuf.copy(input, i * INPUT_PER_AGENT * 8, i * OUTPUT_PER_AGENT * 8, i * OUTPUT_PER_AGENT * 8 + INPUT_PER_AGENT * 8);
    }
    return input;
  }

  // ── Step 4: 运行全量同步实验 ──
  console.log(`\n[4/6] 全量同步 (Full Contagion) × ${NUM_TICKS} ticks...`);
  const fullTimes = [];
  let fullFinalStates = null;

  let inputBufFull = Buffer.alloc(inputBytes);
  warmupBuf.copy(inputBufFull);
  let lastFullOut = null;

  for (let t = 0; t < NUM_TICKS; t++) {
    const hourOfDay = (INITIAL_HOUR + (WARMUP_TICKS + t) * HOURS_ELAPSED) % 24;

    const start = performance.now();
    lastFullOut = engineFull.tickAllFullContagionBinary(
      inputBufFull, HOURS_ELAPSED, hourOfDay,
    );
    const elapsed = performance.now() - start;
    fullTimes.push(elapsed);

    inputBufFull = outputToInput(lastFullOut);

    if (t % 20 === 0) {
      console.log(`  tick ${t}: ${elapsed.toFixed(1)}ms`);
    }
  }

  fullFinalStates = unpackOutput(lastFullOut, NUM_AGENTS);
  const fullTimesSorted = [...fullTimes].sort((a, b) => a - b);
  const fullMedian = fullTimesSorted[Math.floor(fullTimesSorted.length / 2)];
  const fullMean = fullTimes.reduce((a, b) => a + b) / fullTimes.length;
  console.log(`  完成. Median: ${fullMedian.toFixed(1)}ms, Mean: ${fullMean.toFixed(1)}ms`);

  // ── Step 5: 运行分频传染实验 ──
  console.log(`\n[5/6] 分频传染 (Hierarchical Contagion) × ${NUM_TICKS} ticks...`);
  const hierTimes = [];
  let hierFinalStates = null;

  let inputBufHier = Buffer.alloc(inputBytes);
  hierWarmupBuf.copy(inputBufHier);
  let lastHierOut = null;

  for (let t = 0; t < NUM_TICKS; t++) {
    const hourOfDay = (INITIAL_HOUR + (WARMUP_TICKS + t) * HOURS_ELAPSED) % 24;

    const start = performance.now();
    lastHierOut = engineHier.tickAllHierarchicalBinary(
      inputBufHier, HOURS_ELAPSED, hourOfDay,
    );
    const elapsed = performance.now() - start;
    hierTimes.push(elapsed);

    inputBufHier = outputToInput(lastHierOut);

    if (t % 20 === 0) {
      console.log(`  tick ${t}: ${elapsed.toFixed(1)}ms`);
    }
  }

  hierFinalStates = unpackOutput(lastHierOut, NUM_AGENTS);
  const hierTimesSorted = [...hierTimes].sort((a, b) => a - b);
  const hierMedian = hierTimesSorted[Math.floor(hierTimesSorted.length / 2)];
  const hierMean = hierTimes.reduce((a, b) => a + b) / hierTimes.length;
  console.log(`  完成. Median: ${hierMedian.toFixed(1)}ms, Mean: ${hierMean.toFixed(1)}ms`);

  // ── Step 6: 分析结果 ──
  console.log('\n[6/6] 分析结果...\n');

  const { globalMAE, maxAgentMAE } = computeMAE(fullFinalStates, hierFinalStates);
  const valueRange = computeValueRange(fullFinalStates);
  const relativeMAE = (globalMAE / valueRange) * 100;
  const relativeMaxMAE = (maxAgentMAE / valueRange) * 100;

  const speedup = fullMedian / hierMedian;

  // 计算每个 tick 的边处理量差异
  const fullEdgesPerTick = NUM_AGENTS * EDGES_PER_AGENT;
  // Hierarchical: close(1/1) + friend(1/3) + acquaintance(1/12)
  const hierEdgesAvg = NUM_AGENTS * (
    CLOSE_FRIENDS * (1 / 1) +
    FRIENDS * (1 / 3) +
    ACQUAINTANCES * (1 / 12)
  );
  const theoreticalReduction = fullEdgesPerTick / hierEdgesAvg;

  console.log('═══════════════════════════════════════════');
  console.log('  实验结果');
  console.log('═══════════════════════════════════════════');
  console.log(`  Agents:              ${NUM_AGENTS.toLocaleString()}`);
  console.log(`  Edges/agent:         ${EDGES_PER_AGENT} (${CLOSE_FRIENDS} close + ${FRIENDS} friends + ${ACQUAINTANCES} acquaintances)`);
  console.log(`  Ticks:               ${NUM_TICKS}`);
  console.log('');
  console.log('── 精度对比 ──');
  console.log(`  全局 MAE:            ${globalMAE.toFixed(6)}`);
  console.log(`  相对 MAE:            ${relativeMAE.toFixed(2)}% (of value range ${valueRange.toFixed(3)})`);
  console.log(`  最大 Agent MAE:      ${maxAgentMAE.toFixed(6)}`);
  console.log(`  相对最大 MAE:        ${relativeMaxMAE.toFixed(2)}%`);
  console.log(`  目标 (<5%):          ${relativeMAE < 5 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  console.log('── 性能对比 ──');
  console.log(`  Full Median:         ${fullMedian.toFixed(1)}ms`);
  console.log(`  Hierarchical Median: ${hierMedian.toFixed(1)}ms`);
  console.log(`  加速比:              ${speedup.toFixed(2)}x`);
  console.log(`  理论边缩减:          ${theoreticalReduction.toFixed(1)}x`);
  console.log(`  目标 (≥3x):          ${speedup >= 3 ? '✅ PASS' : '⚠️  NEEDS MORE AGENTS'}`);
  console.log('');
  console.log('── 每 tick 边处理量 ──');
  console.log(`  Full:                ${(fullEdgesPerTick / 1e6).toFixed(1)}M edges`);
  console.log(`  Hierarchical (avg):  ${(hierEdgesAvg / 1e6).toFixed(1)}M edges`);
  console.log('');

  // 情绪维度级别的偏差分析
  console.log('── 每维度 MAE ──');
  const dimMAE = new Float64Array(30);
  for (let i = 0; i < NUM_AGENTS; i++) {
    for (let d = 0; d < 30; d++) {
      dimMAE[d] += Math.abs(fullFinalStates[i][d] - hierFinalStates[i][d]);
    }
  }
  for (let d = 0; d < 30; d++) {
    dimMAE[d] /= NUM_AGENTS;
    const bar = '█'.repeat(Math.min(20, Math.round(dimMAE[d] * 200)));
    console.log(`  ${DIM_NAMES[d].padEnd(15)} ${dimMAE[d].toFixed(5)} ${bar}`);
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  实验完成');
  console.log('═══════════════════════════════════════════');
}

runExperiment().catch(console.error);
