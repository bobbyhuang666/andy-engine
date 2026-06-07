#!/usr/bin/env node
/**
 * 单场景运行器 — 由 run_batch.js 调用
 *
 * 接收 JSON 配置参数，运行单个模拟场景，输出 JSON 结果到 stdout。
 *
 * 用法: node run_single.js '{"id":"test","numAgents":100,...}'
 */

const fs = require('fs');
const path = require('path');
const { SoaBatchEngine } = require('../native');
const { MBTI_TO_OCEAN, ALL_MBTI, oceanToBehavior } = require('./scenarios');

const NUM_DIMS = 30;
const TICKS_PER_DAY = 288;

const config = JSON.parse(process.argv[2]);
const { id, numAgents, durationDays, sampleInterval, k, rewireProb, extreme } = config;
const totalTicks = durationDays * TICKS_PER_DAY;
const numSamples = Math.floor(totalTicks / sampleInterval);
const outputRoot = path.join(__dirname, 'output');

// ═══════════════════════════════════════════
// 图构建
// ═══════════════════════════════════════════

function buildGraph(n, k, rewireProb, labels) {
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
        if (labels && Math.random() < 0.6) {
          const same = labels.map((g, idx) => g === labels[i] && idx !== i ? idx : -1).filter(x => x >= 0);
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

// ═══════════════════════════════════════════
// Agent 生成
// ═══════════════════════════════════════════

function generateAgents(numAgents, extreme) {
  const agents = [];
  const labels = [];
  let groups;

  if (extreme) {
    groups = [
      { prefix: 'highN', count: Math.floor(numAgents * 0.25), mbtiPool: ['INFP','INFJ','ISFP','ENFP'], label: '高神经质', oceanOverride: { neuroticism: [0.8, 0.99] } },
      { prefix: 'lowN', count: Math.floor(numAgents * 0.25), mbtiPool: ['ISTJ','ESTJ','INTJ','ENTJ'], label: '低神经质', oceanOverride: { neuroticism: [0.05, 0.25] } },
      { prefix: 'highE', count: Math.floor(numAgents * 0.25), mbtiPool: ['ENFP','ENTP','ESFP','ESTP'], label: '高外向', oceanOverride: { extraversion: [0.8, 0.99] } },
      { prefix: 'lowE', count: numAgents - 3 * Math.floor(numAgents * 0.25), mbtiPool: ['INFP','INTP','ISFP','ISTP'], label: '低外向', oceanOverride: { extraversion: [0.05, 0.25] } },
    ];
  } else {
    groups = [
      { prefix: 'stu', count: Math.floor(numAgents * 0.6), mbtiPool: ALL_MBTI, label: '学生' },
      { prefix: 'wrk', count: Math.floor(numAgents * 0.25), mbtiPool: ALL_MBTI, label: '教职工' },
      { prefix: 'fre', count: numAgents - Math.floor(numAgents * 0.6) - Math.floor(numAgents * 0.25), mbtiPool: ALL_MBTI, label: '周边居民' },
    ];
  }

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

// ═══════════════════════════════════════════
// 事件注入
// ═══════════════════════════════════════════

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
// 主流程
// ═══════════════════════════════════════════

const { agents, labels } = generateAgents(numAgents, extreme);
const graph = buildGraph(numAgents, k, rewireProb, labels);

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

const KEY_DIMS = [0, 1, 2, 3, 15, 22, 23, 26];
const samplesPerSnap = numAgents * (2 + KEY_DIMS.length);
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
      const dims = new Float32Array(NUM_DIMS);
      for (let d = 0; d < NUM_DIMS; d++) dims[d] = statesBuf.readFloatLE(i * (NUM_DIMS + 1) * 4 + d * 4);

      const posIdx = [0, 6, 8, 13, 15, 17, 18, 21, 27, 28];
      const negIdx = [1, 2, 3, 4, 9, 10, 11, 16, 19, 26, 29];
      let p = 0, ng = 0;
      for (const d of posIdx) p += Math.max(0, dims[d]);
      for (const d of negIdx) ng += Math.max(0, -dims[d]);

      const agentOff = snapOff + i * (2 + KEY_DIMS.length);
      allSamples[agentOff] = p / posIdx.length - ng / negIdx.length;
      allSamples[agentOff + 1] = 0;
      for (let k = 0; k < KEY_DIMS.length; k++) {
        allSamples[agentOff + 2 + k] = dims[KEY_DIMS[k]];
      }
    }
    sampleIdx++;
  }
}

const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
const msPerTick = ((Date.now() - t0) / totalTicks).toFixed(2);

// 保存二进制数据
const outDir = path.join(outputRoot, id);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const binPath = path.join(outDir, 'emotion_data.f32');
const header = Buffer.alloc(32);
header.writeUInt32LE(numAgents, 0);
header.writeUInt32LE(sampleIdx, 4);
header.writeUInt32LE(2 + KEY_DIMS.length, 8);
header.writeUInt32LE(sampleInterval, 12);
fs.writeFileSync(binPath, header);
fs.appendFileSync(binPath, Buffer.from(allSamples.buffer, 0, sampleIdx * samplesPerSnap * 4));

// 保存 agent 信息（前 1000 个）
fs.writeFileSync(path.join(outDir, 'agents.json'), JSON.stringify(
  agents.slice(0, 1000).map(a => ({
    id: a.id, group: a.group, mbti: a.mbti,
    ocean: Object.fromEntries(Object.entries(a.ocean).map(([k, v]) => [k, +v.toFixed(2)]))
  })), null, 2));

// 保存统计
const groupMap = {};
agents.forEach((a, i) => { if (!groupMap[a.group]) groupMap[a.group] = []; groupMap[a.group].push(i); });

const lastSnapOff = (sampleIdx - 1) * samplesPerSnap;
const groupStats = {};
for (const [group, indices] of Object.entries(groupMap)) {
  let vSum = 0;
  for (const i of indices) vSum += allSamples[lastSnapOff + i * (2 + KEY_DIMS.length)];
  groupStats[group] = { meanValence: +(vSum / indices.length).toFixed(6), count: indices.length };
}

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
  scenario: id, numAgents, durationDays, totalTicks, totalTime, msPerTick,
  sampleInterval, snapshots: sampleIdx,
  graph: { totalEdges: graph.totalEdges, avgDegree: +(graph.totalEdges * 2 / numAgents).toFixed(1) },
  groupFinalStats: groupStats,
  valenceTimeline: valenceTimeline.filter((_, i) => i % 24 === 0 || i === valenceTimeline.length - 1),
};
const personalityDist = {};
for (const a of agents) personalityDist[a.mbti] = (personalityDist[a.mbti] || 0) + 1;
stats.personalityDistribution = personalityDist;

fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify(stats, null, 2));

// 输出结果到 stdout（供 run_batch.js 解析）
const result = { id, numAgents, durationDays, msPerTick, totalTime, dataPoints: sampleIdx * numAgents, binSize: (fs.statSync(binPath).size / 1024 / 1024).toFixed(1) };
console.log(JSON.stringify(result));
