#!/usr/bin/env node
/**
 * 可视化场景运行器
 *
 * 运行小规模模拟，计算力导向布局，输出每 tick 快照供 visual.html 渲染。
 *
 * 用法: node run_visual.js [--agents 80] [--days 3] [--tick-step 6] [--output vis_demo]
 */

const fs = require('fs');
const path = require('path');
const { SoaBatchEngine } = require('../native');
const { MBTI_TO_OCEAN, ALL_MBTI, oceanToBehavior } = require('./scenarios');

const NUM_DIMS = 30;
const TICKS_PER_DAY = 288;
const OUTPUT_ROOT = path.join(__dirname, 'visual_output');

// ─── 参数解析 ───
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace('--', '')] = process.argv[i + 1];
}
const NUM_AGENTS = parseInt(args.agents || '80', 10);
const DAYS = parseInt(args.days || '3', 10);
const TICK_STEP = parseInt(args['tick-step'] || '6', 10);   // 每 6 tick 采一次 ≈ 30min
const SCENARIO = args.output || 'vis_demo';
const EXTREME = args.extreme === 'true' || args.extreme === '1';
const TOTAL_TICKS = DAYS * TICKS_PER_DAY;

console.log(`╔═══════════════════════════════════════════════╗`);
console.log(`║  Andy Engine 可视化数据生成器                 ║`);
console.log(`╠═══════════════════════════════════════════════╣`);
console.log(`║  Agents: ${NUM_AGENTS}  Days: ${DAYS}  TickStep: ${TICK_STEP}      ║`);
console.log(`║  总 ticks: ${TOTAL_TICKS}  快照数: ~${Math.floor(TOTAL_TICKS / TICK_STEP)}            ║`);
console.log(`╚═══════════════════════════════════════════════╝\n`);

// ═══════════════════════════════════════════
// 图构建（同 run_single.js）
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
    const edges = [...adj[i]].map(j => ({ j, s: 0.15 + Math.random() * 0.55 }));
    edges.sort((a, b) => b.s - a.s);
    for (let idx = 0; idx < edges.length; idx++) {
      nb.push(edges[idx].j);
      lv.push(idx < 5 ? 0 : idx < 15 ? 1 : 2);
      st.push(edges[idx].s);
    }
  }
  offsets[n] = nb.length;
  return { offsets, neighbors: new Uint32Array(nb), levels: new Uint8Array(lv), strengths: new Float32Array(st), adj };
}

// ═══════════════════════════════════════════
// Agent 生成（带组标签）
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
      agents.push({ id: `${g.prefix}_${String(i).padStart(3, '0')}`, group: g.label, mbti, ocean });
      labels.push(g.label);
    }
  }
  return { agents, labels };
}

// ═══════════════════════════════════════════
// 力导向布局（简化版 Fruchterman-Reingold）
// ═══════════════════════════════════════════

function computeLayout(n, adj, groups, width = 900, height = 700) {
  // 初始位置：按组聚类 + 随机抖动
  const groupList = [...new Set(groups)];
  const groupCenters = {};
  const cols = Math.ceil(Math.sqrt(groupList.length));
  groupList.forEach((g, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    groupCenters[g] = {
      x: (col + 0.5) / cols * width,
      y: (row + 0.5) / Math.ceil(groupList.length / cols) * height,
    };
  });

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = groupCenters[groups[i]];
    x[i] = c.x + (Math.random() - 0.5) * 120;
    y[i] = c.y + (Math.random() - 0.5) * 120;
  }

  // 迭代
  const area = width * height;
  const k = Math.sqrt(area / n) * 0.85;
  const iterations = 300;
  let temp = width * 0.15;

  for (let iter = 0; iter < iterations; iter++) {
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);

    // 排斥力（所有节点对 — O(n²)，n<200 没问题）
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = x[i] - x[j];
        let ddy = y[i] - y[j];
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
        const force = (k * k) / dist;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i] += fx; dy[i] += fy;
        dx[j] -= fx; dy[j] -= fy;
      }
    }

    // 吸引力（有边的节点对）
    for (let i = 0; i < n; i++) {
      for (const j of adj[i]) {
        if (j <= i) continue; // 避免重复
        let ddx = x[i] - x[j];
        let ddy = y[i] - y[j];
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
        const force = (dist * dist) / k;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i] -= fx; dy[i] -= fy;
        dx[j] += fx; dy[j] += fy;
      }
    }

    // 组聚类力（轻柔地拉向组中心）
    for (let i = 0; i < n; i++) {
      const c = groupCenters[groups[i]];
      dx[i] += (c.x - x[i]) * 0.005;
      dy[i] += (c.y - y[i]) * 0.005;
    }

    // 应用位移（受温度限制）
    for (let i = 0; i < n; i++) {
      const disp = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01;
      const scale = Math.min(disp, temp) / disp;
      x[i] += dx[i] * scale;
      y[i] += dy[i] * scale;
      // 边界约束
      x[i] = Math.max(40, Math.min(width - 40, x[i]));
      y[i] = Math.max(40, Math.min(height - 40, y[i]));
    }

    temp *= 0.95; // 退火
  }

  // 归一化到 [0.05, 0.95]（留边距）
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i]; if (x[i] > maxX) maxX = x[i];
    if (y[i] < minY) minY = y[i]; if (y[i] > maxY) maxY = y[i];
  }
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const positions = [];
  for (let i = 0; i < n; i++) {
    positions.push({
      x: 0.05 + (x[i] - minX) / rangeX * 0.90,
      y: 0.05 + (y[i] - minY) / rangeY * 0.90,
    });
  }
  return { positions, width, height };
}

// ═══════════════════════════════════════════
// 事件注入（同 run_single.js）
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
  return weather;
}

// ═══════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════

const { agents, labels } = generateAgents(NUM_AGENTS, EXTREME);
const graph = buildGraph(NUM_AGENTS, 16, 0.3, labels);

// 计算布局
console.log('计算力导向布局...');
const layout = computeLayout(NUM_AGENTS, graph.adj, labels);

// 初始化引擎
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

const statesBuf = Buffer.alloc(NUM_AGENTS * (NUM_DIMS + 1) * 4);
const agentN = agents.map(a => a.ocean.neuroticism);

// ─── 提取边列表 + 关系演化状态 ───
const edges = [];
for (let i = 0; i < NUM_AGENTS; i++) {
  const start = graph.offsets[i];
  const end = graph.offsets[i + 1];
  for (let e = start; e < end; e++) {
    const j = graph.neighbors[e];
    if (j > i) {
      edges.push({
        source: i,
        target: j,
        baseLevel: graph.levels[e],      // 初始 Dunbar 层级
        baseStrength: graph.strengths[e], // 初始强度
        strength: graph.strengths[e],     // 当前强度（会动态变化）
      });
    }
  }
}

// ─── 运行模拟 + 关系演化 + 采集快照 ───
const POS_IDX = [0, 6, 8, 13, 15, 17, 18, 21, 27, 28];
const NEG_IDX = [1, 2, 3, 4, 9, 10, 11, 16, 19, 26, 29];
const KEY_DIMS = [0, 1, 2, 3, 15, 22, 23, 26];
const OUTPUT_PER_AGENT = NUM_DIMS * 3 + 1 + 16;  // 107 floats

const snapshots = [];
let lastWeather = 'sunny';

const t0 = Date.now();

for (let tick = 0; tick < TOTAL_TICKS; tick++) {
  const hourOfDay = (8 + tick * 5 / 60) % 24;
  const outBuf = engine.tickSoaContagionBinary(statesBuf, 5 / 60, hourOfDay);

  // 从 outBuf 提取 current[30] 写回 statesBuf
  for (let i = 0; i < NUM_AGENTS; i++) {
    const srcOff = i * OUTPUT_PER_AGENT * 4;
    const dstOff = i * (NUM_DIMS + 1) * 4;
    for (let d = 0; d < NUM_DIMS; d++) {
      statesBuf.writeFloatLE(outBuf.readFloatLE(srcOff + d * 4), dstOff + d * 4);
    }
  }

  lastWeather = injectEvents(statesBuf, NUM_AGENTS, tick, agentN) || lastWeather;

  // ─── 关系演化：每 12 tick 更新一次 ───
  if (tick % 12 === 0 && tick > 0) {
    // 先算所有边的相似度
    const sims = [];
    for (const edge of edges) {
      const sOffA = edge.source * OUTPUT_PER_AGENT * 4;
      const sOffB = edge.target * OUTPUT_PER_AGENT * 4;
      let dot = 0, normA = 0, normB = 0;
      for (const d of KEY_DIMS) {
        const a = outBuf.readFloatLE(sOffA + d * 4);
        const b = outBuf.readFloatLE(sOffB + d * 4);
        dot += a * b; normA += a * a; normB += b * b;
      }
      sims.push((normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0);
    }
    // 相似度均值（同环境 agent 天然相似，要减去基线）
    const meanSim = sims.reduce((a, b) => a + b, 0) / sims.length;

    for (let ei = 0; ei < edges.length; ei++) {
      const edge = edges[ei];
      const relativeSim = sims[ei] - meanSim;
      const noise = (Math.random() - 0.5) * 0.01;
      const decay = (edge.strength - edge.baseStrength) * 0.008;  // 弱回归
      const drift = relativeSim * 0.015 + noise - decay;
      edge.strength = Math.max(0.02, Math.min(0.92, edge.strength + drift));
    }
  }

  // ─── 采集快照 ───
  if ((tick + 1) % TICK_STEP === 0) {
    const day = Math.floor(tick / TICKS_PER_DAY);
    const hour = Math.floor((8 + tick * 5 / 60) % 24);
    const minute = Math.floor(((8 + tick * 5 / 60) % 1) * 60);

    const agentStates = [];
    for (let i = 0; i < NUM_AGENTS; i++) {
      const srcOff = i * OUTPUT_PER_AGENT * 4;
      const dims = [];
      for (let d = 0; d < NUM_DIMS; d++) dims.push(outBuf.readFloatLE(srcOff + d * 4));

      let p = 0, ng = 0;
      for (const d of POS_IDX) p += Math.max(0, dims[d]);
      for (const d of NEG_IDX) ng += Math.max(0, -dims[d]);
      const valence = p / POS_IDX.length - ng / NEG_IDX.length;

      const keyEmotions = {};
      for (let k = 0; k < KEY_DIMS.length; k++) {
        keyEmotions[DIM_NAMES[KEY_DIMS[k]]] = +dims[KEY_DIMS[k]].toFixed(4);
      }

      const degree = graph.offsets[i + 1] - graph.offsets[i];

      agentStates.push({
        v: +valence.toFixed(4),
        e: keyEmotions,
        d: degree,
      });
    }

    // 边快照：强度 + 动态层级
    const edgeSnap = edges.map(e => {
      const s = e.strength;
      // 动态层级：强度阈值决定关系等级
      const level = s > 0.5 ? 0 : s > 0.2 ? 1 : 2;
      return +s.toFixed(3);
    });

    snapshots.push({
      tick,
      day,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      weather: lastWeather,
      agents: agentStates,
      edges: edgeSnap,  // 每条边的当前强度
    });
  }

  if ((tick + 1) % (TICKS_PER_DAY) === 0) {
    console.log(`  Day ${Math.floor((tick + 1) / TICKS_PER_DAY)}/${DAYS} 完成`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n模拟完成: ${elapsed}s, ${snapshots.length} 个快照`);

// ═══════════════════════════════════════════
// 输出
// ═══════════════════════════════════════════

const outDir = path.join(OUTPUT_ROOT, SCENARIO);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const visualData = {
  meta: {
    scenario: SCENARIO,
    numAgents: NUM_AGENTS,
    days: DAYS,
    tickStep: TICK_STEP,
    totalSnapshots: snapshots.length,
    generatedAt: new Date().toISOString(),
  },
  agents: agents.map((a, i) => ({
    id: a.id,
    group: a.group,
    mbti: a.mbti,
    ocean: Object.fromEntries(Object.entries(a.ocean).map(([k, v]) => [k, +v.toFixed(2)])),
    x: +layout.positions[i].x.toFixed(4),
    y: +layout.positions[i].y.toFixed(4),
    degree: graph.offsets[i + 1] - graph.offsets[i],
  })),
  edges: edges.map(e => [e.source, e.target, e.baseLevel, +e.baseStrength.toFixed(3)]),
  snapshots,
};

const outPath = path.join(outDir, 'visual_data.json');
fs.writeFileSync(outPath, JSON.stringify(visualData));

const sizeMB = (Buffer.byteLength(JSON.stringify(visualData)) / 1024 / 1024).toFixed(1);
console.log(`\n输出: ${outPath} (${sizeMB} MB)`);
console.log(`快照数: ${snapshots.length}`);
console.log(`边数: ${edges.length}`);

// 复制 HTML
const htmlSrc = path.join(__dirname, 'visual.html');
const htmlDst = path.join(outDir, 'visual.html');
if (fs.existsSync(htmlSrc)) {
  fs.copyFileSync(htmlSrc, htmlDst);
  console.log(`HTML: ${htmlDst}`);
} else {
  console.log(`提示: 将 visual.html 放到 ${outDir}/ 即可在浏览器中查看`);
}

console.log(`\n打开方式: open ${htmlDst}`);
