#!/usr/bin/env node
/**
 * Andy Engine 过夜批量数据生成
 *
 * 总预算：~6-8 小时
 * 预计产出：100M+ 训练样本
 *
 * 策略：
 *   Phase 1: 超大规模单场景 (50K agents, ~1h)
 *   Phase 2: 多随机种子 × 多场景 (~4h)
 *   Phase 3: 长周期年度数据 (~2h)
 *
 * 用法：
 *   cd server/andy
 *   node data_generator/run_overnight.js
 *
 * 日志同时输出到 data_generator/overnight.log
 */

const fs = require('fs');
const path = require('path');

const { SoaBatchEngine } = require('../native');
const { MBTI_TO_OCEAN, ALL_MBTI, oceanToBehavior } = require('./scenarios');

const NUM_DIMS = 30;
const TICKS_PER_DAY = 288;
const outputRoot = path.join(__dirname, 'output');
if (!fs.existsSync(outputRoot)) fs.mkdirSync(outputRoot, { recursive: true });

const LOG_FILE = path.join(__dirname, 'overnight.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function buildGraph(n, k, rewireProb, groups) {
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= k / 2; j++) {
      const l = (i - j + n) % n, r = (i + j) % n;
      adj[i].add(l); adj[l].add(i);
      adj[i].add(r); adj[r].add(i);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const j of [...adj[i]]) {
      if (Math.random() < rewireProb) {
        adj[i].delete(j); adj[j].delete(i);
        let t = null;
        if (groups && Math.random() < 0.6) {
          const same = groups.map((g, idx) => g === groups[i] && idx !== i ? idx : -1).filter(x => x >= 0);
          t = same.length > 0 ? same[Math.floor(Math.random() * same.length)] : null;
        }
        if (t == null) { do { t = Math.floor(Math.random() * n); } while (t === i); }
        adj[i].add(t); adj[t].add(i);
      }
    }
  }
  const offsets = new Uint32Array(n + 1);
  const nb = [], lv = [], st = [];
  for (let i = 0; i < n; i++) {
    offsets[i] = nb.length;
    const edges = [...adj[i]].map(j => ({ j, s: 0.1 + Math.random() * 0.3 }));
    edges.sort((a, b) => b.s - a.s);
    for (let idx = 0; idx < edges.length; idx++) {
      nb.push(edges[idx].j);
      lv.push(idx < 5 ? 0 : idx < 15 ? 1 : 2);
      st.push(edges[idx].s);
    }
  }
  offsets[n] = nb.length;
  return { offsets, neighbors: new Uint32Array(nb), levels: new Uint8Array(lv), strengths: new Float32Array(st), totalEdges: nb.length / 2 };
}

function generateAgents(numAgents, groups) {
  const agents = [];
  const labels = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const mbti = g.mbtiPool[i % g.mbtiPool.length];
      const ocean = { ...MBTI_TO_OCEAN[mbti] };
      if (g.oceanOverride) {
        for (const [dim, range] of Object.entries(g.oceanOverride)) {
          ocean[dim] = range[0] + Math.random() * (range[1] - range[0]);
        }
      }
      agents.push({ id: `${g.prefix}_${String(i).padStart(5, '0')}`, group: g.label, mbti, ocean });
      labels.push(g.label);
    }
  }
  return { agents, labels };
}

// 事件注入
const DIM_NAMES = ['joy','sadness','anger','fear','surprise','disgust','amusement','awe','contentment','desire','embarrassment','guilt','horror','interest','love','nervousness','pride','relief','satisfaction','shame','sympathy','triumph','boredom','calm','confusion','excitement','frustration','gratitude','hope','loneliness'];

const WEATHER_EFFECTS = {
  sunny:  { joy: 0.025, calm: 0.018, sadness: -0.012 },
  cloudy: { boredom: 0.012, calm: -0.006 },
  rain:   { sadness: 0.03, frustration: 0.018, calm: -0.022, joy: -0.018 },
  cold:   { nervousness: 0.025, calm: -0.012 },
};

const LIFE_EVENTS = [
  { name: '好消息', effects: { joy: 0.10, hope: 0.06, satisfaction: 0.05 }, prob: 0.010 },
  { name: '社交冲突', effects: { anger: 0.08, frustration: 0.06, sadness: 0.04 }, prob: 0.006 },
  { name: '孤独感', effects: { loneliness: 0.09, sadness: 0.05, calm: -0.04 }, prob: 0.008 },
  { name: '成就感', effects: { pride: 0.08, satisfaction: 0.06, excitement: 0.04 }, prob: 0.005 },
  { name: '焦虑', effects: { nervousness: 0.09, fear: 0.05, calm: -0.05 }, prob: 0.009 },
  { name: '意外惊喜', effects: { surprise: 0.10, joy: 0.06, excitement: 0.05 }, prob: 0.004 },
  { name: '无聊', effects: { boredom: 0.08 }, prob: 0.012 },
  { name: '感恩', effects: { gratitude: 0.08, love: 0.05, calm: 0.04 }, prob: 0.005 },
  { name: '失恋', effects: { sadness: 0.12, loneliness: 0.10, love: -0.08, joy: -0.06 }, prob: 0.002 },
  { name: '升职', effects: { pride: 0.10, joy: 0.08, satisfaction: 0.07, excitement: 0.05 }, prob: 0.001 },
  { name: '争吵', effects: { anger: 0.10, frustration: 0.08, calm: -0.06 }, prob: 0.004 },
  { name: '重逢', effects: { joy: 0.08, love: 0.06, surprise: 0.05, gratitude: 0.04 }, prob: 0.002 },
];

const WEATHER_CYCLE = ['sunny','sunny','cloudy','rain','cold','sunny','sunny','cloudy','rain','rain','sunny','cloudy'];

function injectEvents(statesBuf, numAgents, tick, agentNeuroticism) {
  if (tick % 12 !== 0) return;

  // 天气
  let weather = 'sunny';
  if (tick % 72 === 0 && Math.random() < 0.3) {
    weather = WEATHER_CYCLE[Math.floor(Math.random() * WEATHER_CYCLE.length)];
  }
  const wEff = WEATHER_EFFECTS[weather] || {};
  for (let i = 0; i < numAgents; i++) {
    const off = i * (NUM_DIMS + 1) * 4;
    const nf = 1 + agentNeuroticism[i] * 0.5;
    for (const [dim, delta] of Object.entries(wEff)) {
      const d = DIM_NAMES.indexOf(dim);
      if (d >= 0) {
        const cur = statesBuf.readFloatLE(off + d * 4);
        statesBuf.writeFloatLE(Math.max(-1, Math.min(1, cur + delta * nf)), off + d * 4);
      }
    }
  }

  // 人生事件
  for (let i = 0; i < numAgents; i++) {
    const nm = 1 + agentNeuroticism[i] * 0.5;
    for (const evt of LIFE_EVENTS) {
      if (Math.random() < evt.prob * nm) {
        const off = i * (NUM_DIMS + 1) * 4;
        for (const [dim, delta] of Object.entries(evt.effects)) {
          const d = DIM_NAMES.indexOf(dim);
          if (d >= 0) {
            const cur = statesBuf.readFloatLE(off + d * 4);
            statesBuf.writeFloatLE(Math.max(-1, Math.min(1, cur + delta)), off + d * 4);
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════
// 模拟运行器
// ═══════════════════════════════════════════

function runSim(config) {
  const { id, name, numAgents, durationDays, sampleInterval, groups, k, rewireProb } = config;
  const totalTicks = durationDays * TICKS_PER_DAY;
  const numSamples = Math.floor(totalTicks / sampleInterval);

  log(`\n${'═'.repeat(60)}`);
  log(`场景: ${name} [${id}]`);
  log(`${'═'.repeat(60)}`);

  const { agents, labels } = generateAgents(numAgents, groups);
  const graph = buildGraph(numAgents, k, rewireProb, labels);
  log(`图: ${graph.totalEdges} 条边, 平均度 ${(graph.totalEdges * 2 / numAgents).toFixed(1)}`);

  const engine = new SoaBatchEngine(Math.floor(Math.random() * 100000));
  const cfgJson = JSON.stringify({
    decay_lambda: 1.0, inertia: 0.5, max_delta_per_tick: 0.10,
    noise_amplitude: 0.015, co_activation_weight: 0.3, baseline_drift_rate: 0.0001,
    circadian: { positive_affect_peak: 14, positive_affect_amp: 0.15, negative_affect_peak: 4, negative_affect_amp: 0.10 },
  });
  for (const a of agents) engine.addAgent(JSON.stringify(oceanToBehavior(a.ocean)), cfgJson);
  engine.setupSocialGraphBinary(
    Buffer.from(graph.offsets.buffer), Buffer.from(graph.neighbors.buffer),
    Buffer.from(graph.levels.buffer), Buffer.from(graph.strengths.buffer),
  );

  const statesBuf = Buffer.alloc(numAgents * (NUM_DIMS + 1) * 4);
  const agentN = agents.map(a => a.ocean.neuroticism);

  // 采样数据：只保存 valence + arousal + 8 个关键维度
  const KEY_DIMS = [0, 1, 2, 3, 15, 22, 23, 26]; // joy, sadness, anger, fear, nervousness, boredom, calm, frustration
  const samplesPerSnap = numAgents * (2 + KEY_DIMS.length); // valence, arousal, 8 dims
  const allSamples = new Float32Array(numSamples * samplesPerSnap);
  let sampleIdx = 0;

  const t0 = Date.now();

  for (let tick = 0; tick < totalTicks; tick++) {
    const hourOfDay = (8 + tick * 5 / 60) % 24;
    const outBuf = engine.tickSoaContagionBinary(statesBuf, 5 / 60, hourOfDay);
    outBuf.copy(statesBuf);

    injectEvents(statesBuf, numAgents, tick, agentN);

    if ((tick + 1) % sampleInterval === 0 && sampleIdx < numSamples) {
      const snapOff = sampleIdx * samplesPerSnap;
      for (let i = 0; i < numAgents; i++) {
        const srcOff = i * 107 * 4;
        const dims = new Float32Array(NUM_DIMS);
        for (let d = 0; d < NUM_DIMS; d++) dims[d] = statesBuf.readFloatLE(i * (NUM_DIMS + 1) * 4 + d * 4);

        // valence
        const posIdx = [0, 6, 8, 13, 15, 17, 18, 21, 27, 28];
        const negIdx = [1, 2, 3, 4, 9, 10, 11, 16, 19, 26, 29];
        let p = 0, ng = 0;
        for (const d of posIdx) p += Math.max(0, dims[d]);
        for (const d of negIdx) ng += Math.max(0, -dims[d]);

        const agentOff = snapOff + i * (2 + KEY_DIMS.length);
        allSamples[agentOff] = p / posIdx.length - ng / negIdx.length; // valence
        allSamples[agentOff + 1] = 0; // placeholder arousal
        for (let k = 0; k < KEY_DIMS.length; k++) {
          allSamples[agentOff + 2 + k] = dims[KEY_DIMS[k]];
        }
      }
      sampleIdx++;
    }

    if ((tick + 1) % (TICKS_PER_DAY * 10) === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const day = Math.floor((tick + 1) / TICKS_PER_DAY) + 1;
      const msTick = ((Date.now() - t0) / (tick + 1)).toFixed(2);
      log(`  D${day}: ${elapsed}s, ${msTick}ms/tick, ${sampleIdx} 快照`);
    }
  }

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  const msPerTick = ((Date.now() - t0) / totalTicks).toFixed(2);
  log(`完成: ${totalTime}s, ${msPerTick}ms/tick`);

  // 输出
  const outDir = path.join(outputRoot, id);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 保存 agent 信息
  fs.writeFileSync(path.join(outDir, 'agents.json'), JSON.stringify(
    agents.slice(0, 1000).map(a => ({
      id: a.id, group: a.group, mbti: a.mbti,
      ocean: Object.fromEntries(Object.entries(a.ocean).map(([k, v]) => [k, +v.toFixed(2)]))
    })), null, 2));

  // 保存统计
  const groupMap = {};
  agents.forEach((a, i) => { if (!groupMap[a.group]) groupMap[a.group] = []; groupMap[a.group].push(i); });

  // 计算最终快照的组别统计
  const lastSnapOff = (sampleIdx - 1) * samplesPerSnap;
  const groupStats = {};
  for (const [group, indices] of Object.entries(groupMap)) {
    let vSum = 0;
    for (const i of indices) vSum += allSamples[lastSnapOff + i * (2 + KEY_DIMS.length)];
    groupStats[group] = { meanValence: +(vSum / indices.length).toFixed(6), count: indices.length };
  }

  // 效价时间线
  const valenceTimeline = [];
  for (let s = 0; s < sampleIdx; s++) {
    const snapOff = s * samplesPerSnap;
    let vSum = 0;
    for (let i = 0; i < numAgents; i++) vSum += allSamples[snapOff + i * (2 + KEY_DIMS.length)];
    valenceTimeline.push({
      tick: (s + 1) * sampleInterval,
      day: Math.floor((s + 1) * sampleInterval / TICKS_PER_DAY) + 1,
      meanValence: +(vSum / numAgents).toFixed(6),
    });
  }

  const stats = {
    scenario: id, name, numAgents, durationDays, totalTicks, totalTime, msPerTick,
    sampleInterval, snapshots: sampleIdx,
    graph: { totalEdges: graph.totalEdges, avgDegree: +(graph.totalEdges * 2 / numAgents).toFixed(1) },
    personalityDistribution: {},
    groupFinalStats: groupStats,
    valenceTimeline: valenceTimeline.filter((_, i) => i % 24 === 0 || i === valenceTimeline.length - 1), // 每天一个
  };
  for (const a of agents) stats.personalityDistribution[a.mbti] = (stats.personalityDistribution[a.mbti] || 0) + 1;

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify(stats, null, 2));

  // 保存二进制数据（比 CSV 紧凑 10x）
  const binPath = path.join(outDir, 'emotion_data.f32');
  const header = Buffer.alloc(32);
  header.writeUInt32LE(numAgents, 0);
  header.writeUInt32LE(sampleIdx, 4);
  header.writeUInt32LE(2 + KEY_DIMS.length, 8); // floats per agent per sample
  header.writeUInt32LE(sampleInterval, 12);
  fs.writeFileSync(binPath, header);
  fs.appendFileSync(binPath, Buffer.from(allSamples.buffer, 0, sampleIdx * samplesPerSnap * 4));

  const binSize = (fs.statSync(binPath).size / 1024 / 1024).toFixed(1);
  const totalDataPoints = sampleIdx * numAgents;
  log(`输出: ${outDir}`);
  log(`  二进制: ${binSize}MB (${totalDataPoints.toLocaleString()} 数据点)`);

  // 释放 Rust 原生内存（依赖 GC 触发 Drop）
  engine.free?.();
  statesBuf.fill(0);
  allSamples.fill(0);

  return { id, numAgents, durationDays, msPerTick, totalTime, totalDataPoints, binSize };
}

// ═══════════════════════════════════════════
// 过夜批次
// ═══════════════════════════════════════════

const BATCH = [];

// Phase 1: 中等规模（5K agents，安全内存范围）
BATCH.push({
  id: 'mega_5k_30d',
  name: '中等规模校园 (5K agents, 30天)',
  numAgents: 5000, durationDays: 30, sampleInterval: 24,
  k: 20, rewireProb: 0.15,
  groups: [
    { prefix: 'stu', count: 3000, mbtiPool: ALL_MBTI, label: '学生' },
    { prefix: 'wrk', count: 1250, mbtiPool: ALL_MBTI, label: '教职工' },
    { prefix: 'fre', count: 750, mbtiPool: ALL_MBTI, label: '周边居民' },
  ],
});

// Phase 2: 多随机种子（50 轮，每轮 ~4s ≈ 3min）
for (let seed = 0; seed < 50; seed++) {
  // 校园 2000 agents × 15 天
  BATCH.push({
    id: `campus_2k_seed${String(seed).padStart(3, '0')}`,
    name: `校园多子 seed${seed}`,
    numAgents: 2000, durationDays: 15, sampleInterval: 12,
    k: 18 + Math.floor(Math.random() * 6), rewireProb: 0.10 + Math.random() * 0.15,
    groups: [
      { prefix: 'stu', count: 1200, mbtiPool: ALL_MBTI, label: '学生' },
      { prefix: 'wrk', count: 500, mbtiPool: ALL_MBTI, label: '教职工' },
      { prefix: 'fre', count: 300, mbtiPool: ALL_MBTI, label: '周边居民' },
    ],
  });
}

// Phase 3: 年度长周期数据（3K agents）
BATCH.push({
  id: 'yearlong_3k',
  name: '年度数据 (3K agents, 365天)',
  numAgents: 3000, durationDays: 365, sampleInterval: 24,
  k: 20, rewireProb: 0.12,
  groups: [
    { prefix: 'stu', count: 1800, mbtiPool: ALL_MBTI, label: '学生' },
    { prefix: 'wrk', count: 750, mbtiPool: ALL_MBTI, label: '教职工' },
    { prefix: 'fre', count: 450, mbtiPool: ALL_MBTI, label: '周边居民' },
  ],
});

// Phase 4: 极端人格实验（10 种子，~5min）
for (let seed = 0; seed < 10; seed++) {
  BATCH.push({
    id: `extreme_seed${String(seed).padStart(3, '0')}`,
    name: `极端人格 seed${seed}`,
    numAgents: 200, durationDays: 15, sampleInterval: 4,
    k: 15, rewireProb: 0.20,
    groups: [
      { prefix: 'highN', count: 50, mbtiPool: ['INFP','INFJ','ISFP','ENFP'], label: '高神经质', oceanOverride: { neuroticism: [0.8, 0.99] } },
      { prefix: 'lowN', count: 50, mbtiPool: ['ISTJ','ESTJ','INTJ','ENTJ'], label: '低神经质', oceanOverride: { neuroticism: [0.05, 0.25] } },
      { prefix: 'highE', count: 50, mbtiPool: ['ENFP','ENTP','ESFP','ESTP'], label: '高外向', oceanOverride: { extraversion: [0.8, 0.99] } },
      { prefix: 'lowE', count: 50, mbtiPool: ['INFP','INTP','ISFP','ISTP'], label: '低外向', oceanOverride: { extraversion: [0.05, 0.25] } },
    ],
  });
}

// ═══════════════════════════════════════════
// 执行
// ═══════════════════════════════════════════

log('╔═══════════════════════════════════════════════════════════╗');
log('║  Andy Engine 过夜批量数据生成                              ║');
log(`║  ${new Date().toISOString()}${' '.repeat(30)}║`);
log(`║  场景: ${BATCH.length} 个${' '.repeat(43)}║`);
log('╚═══════════════════════════════════════════════════════════╝');

const totalT0 = Date.now();
const results = [];
let totalDataPoints = 0;

for (let i = 0; i < BATCH.length; i++) {
  const config = BATCH[i];
  log(`\n[${i + 1}/${BATCH.length}] ${config.name}`);

  try {
    const result = runSim(config);
    results.push(result);
    totalDataPoints += result.totalDataPoints;

    // 定期汇报进度
    if ((i + 1) % 10 === 0 || i === BATCH.length - 1) {
      const elapsed = ((Date.now() - totalT0) / 1000 / 60).toFixed(1);
      log(`\n  📊 进度: ${i + 1}/${BATCH.length}, ${elapsed}min, ${(totalDataPoints / 1e6).toFixed(0)}M 数据点`);
    }
  } catch (err) {
    log(`❌ ${config.id} 失败: ${err.message}`);
    results.push({ id: config.id, error: err.message });
  }

  // 强制 GC 释放 Rust 原生内存
  if (global.gc) global.gc();
}

const totalElapsed = ((Date.now() - totalT0) / 1000).toFixed(1);

log('\n╔═══════════════════════════════════════════════════════════╗');
log('║  最终汇总                                                  ║');
log('╠═══════════════════════════════════════════════════════════╣');
const success = results.filter(r => !r.error);
const failed = results.filter(r => r.error);
log(`║  成功: ${success.length}, 失败: ${failed.length}`);
log(`║  总数据点: ${(totalDataPoints / 1e6).toFixed(0)}M`);
log(`║  总耗时: ${(totalElapsed / 3600).toFixed(1)}h`);
log('╚═══════════════════════════════════════════════════════════╝');

fs.writeFileSync(path.join(outputRoot, 'overnight_summary.json'), JSON.stringify({
  date: new Date().toISOString(), totalElapsed, totalDataPoints,
  successCount: success.length, failCount: failed.length,
  results: results.map(r => ({ id: r.id, dataPoints: r.totalDataPoints, error: r.error })),
}, null, 2));

logStream.end();
