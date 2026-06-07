/**
 * LLM 评估实验 — 情绪轨迹心理真实性
 *
 * 场景: 20 个 agent 的社交聚会
 * - 初始状态: 大部分人平静/轻微兴奋
 * - 事件: 3 个 agent 受到负面事件冲击（情绪骤变）
 * - 观察: 情绪如何在社交网络中传播
 *
 * 对比: Full Sync vs Hierarchical Contagion
 */

'use strict';

const native = require('../native/index');

const NUM_AGENTS = 20;
const NUM_TICKS = 80;
const HOURS_ELAPSED = 5 / 60; // 5 min per tick
const INITIAL_HOUR = 19.0;    // 7pm evening gathering

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

const DIM_NAMES = [
  'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
  'amusement', 'awe', 'contentment', 'desire', 'embarrassment', 'guilt',
  'horror', 'interest', 'love', 'nervousness', 'pride', 'relief',
  'satisfaction', 'shame', 'sympathy', 'triumph', 'boredom', 'calm',
  'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness',
];

const POSITIVE = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm', 'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'];
const NEGATIVE = ['sadness', 'anger', 'fear', 'disgust', 'loneliness', 'nervousness', 'frustration', 'guilt', 'shame', 'horror'];

const INPUT_PER_AGENT = 31;
const OUTPUT_PER_AGENT = 107;

// Agent persona definitions
const AGENTS = [
  { id: 0,  name: 'Alice',   baseline: { joy: 0.3, calm: 0.2, interest: 0.2 }, behavior: { emotion_decay_rate: 0.4, emotional_inertia: 0.4, susceptibility: 0.5, expressiveness: 0.7 } },
  { id: 1,  name: 'Bob',     baseline: { joy: 0.2, excitement: 0.3 }, behavior: { emotion_decay_rate: 0.5, emotional_inertia: 0.3, susceptibility: 0.4, expressiveness: 0.6 } },
  { id: 2,  name: 'Carol',   baseline: { calm: 0.3, contentment: 0.2 }, behavior: { emotion_decay_rate: 0.3, emotional_inertia: 0.5, susceptibility: 0.6, expressiveness: 0.8 } },
  { id: 3,  name: 'David',   baseline: { excitement: 0.3, interest: 0.2, joy: 0.1 }, behavior: { emotion_decay_rate: 0.6, emotional_inertia: 0.2, susceptibility: 0.3, expressiveness: 0.5 } },
  { id: 4,  name: 'Eve',     baseline: { calm: 0.2, satisfaction: 0.2 }, behavior: { emotion_decay_rate: 0.4, emotional_inertia: 0.4, susceptibility: 0.7, expressiveness: 0.9 } },
  { id: 5,  name: 'Frank',   baseline: { interest: 0.3, excitement: 0.1 }, behavior: { emotion_decay_rate: 0.5, emotional_inertia: 0.3, susceptibility: 0.3, expressiveness: 0.4 } },
  { id: 6,  name: 'Grace',   baseline: { joy: 0.2, love: 0.2, gratitude: 0.2 }, behavior: { emotion_decay_rate: 0.3, emotional_inertia: 0.5, susceptibility: 0.8, expressiveness: 0.9 } },
  { id: 7,  name: 'Henry',   baseline: { calm: 0.3, boredom: 0.1 }, behavior: { emotion_decay_rate: 0.4, emotional_inertia: 0.6, susceptibility: 0.2, expressiveness: 0.3 } },
  { id: 8,  name: 'Iris',    baseline: { excitement: 0.2, joy: 0.3, amusement: 0.2 }, behavior: { emotion_decay_rate: 0.5, emotional_inertia: 0.3, susceptibility: 0.5, expressiveness: 0.7 } },
  { id: 9,  name: 'Jack',    baseline: { interest: 0.2, calm: 0.2 }, behavior: { emotion_decay_rate: 0.4, emotional_inertia: 0.4, susceptibility: 0.4, expressiveness: 0.5 } },
  { id: 10, name: 'Karen',   baseline: { contentment: 0.3, calm: 0.2 }, behavior: { emotion_decay_rate: 0.3, emotional_inertia: 0.5, susceptibility: 0.6, expressiveness: 0.8 } },
  { id: 11, name: 'Leo',     baseline: { excitement: 0.2, pride: 0.2 }, behavior: { emotion_decay_rate: 0.6, emotional_inertia: 0.2, susceptibility: 0.3, expressiveness: 0.6 } },
  { id: 12, name: 'Mia',     baseline: { joy: 0.3, love: 0.1, calm: 0.2 }, behavior: { emotion_decay_rate: 0.4, emotional_inertia: 0.4, susceptibility: 0.5, expressiveness: 0.7 } },
  { id: 13, name: 'Nathan',  baseline: { calm: 0.3, satisfaction: 0.1 }, behavior: { emotion_decay_rate: 0.5, emotional_inertia: 0.3, susceptibility: 0.4, expressiveness: 0.5 } },
  { id: 14, name: 'Olivia',  baseline: { joy: 0.2, gratitude: 0.2, contentment: 0.2 }, behavior: { emotion_decay_rate: 0.3, emotional_inertia: 0.5, susceptibility: 0.7, expressiveness: 0.9 } },
  { id: 15, name: 'Paul',    baseline: { interest: 0.3, excitement: 0.2 }, behavior: { emotion_decay_rate: 0.5, emotional_inertia: 0.3, susceptibility: 0.3, expressiveness: 0.4 } },
  { id: 16, name: 'Quinn',   baseline: { calm: 0.2, amusement: 0.2 }, behavior: { emotion_decay_rate: 0.4, emotional_inertia: 0.4, susceptibility: 0.5, expressiveness: 0.6 } },
  { id: 17, name: 'Rachel',  baseline: { joy: 0.3, excitement: 0.2, love: 0.1 }, behavior: { emotion_decay_rate: 0.4, emotional_inertia: 0.3, susceptibility: 0.6, expressiveness: 0.8 } },
  { id: 18, name: 'Sam',     baseline: { calm: 0.3, contentment: 0.2 }, behavior: { emotion_decay_rate: 0.3, emotional_inertia: 0.5, susceptibility: 0.4, expressiveness: 0.5 } },
  { id: 19, name: 'Tina',    baseline: { excitement: 0.2, joy: 0.2, interest: 0.2 }, behavior: { emotion_decay_rate: 0.5, emotional_inertia: 0.3, susceptibility: 0.5, expressiveness: 0.7 } },
];

// Social graph: close friends, friends, acquaintances
// Close friends (level 0): strong emotional bonds
// Friends (level 1): regular social contact
// Acquaintances (level 2): casual connections
const SOCIAL_GRAPH = [
  // Alice: close with Bob, Carol; friends with Eve, Grace, Mia
  { agent: 0, neighbors: [
    { id: 1, level: 0, strength: 0.8 }, { id: 2, level: 0, strength: 0.75 },
    { id: 4, level: 1, strength: 0.5 }, { id: 6, level: 1, strength: 0.5 }, { id: 12, level: 1, strength: 0.45 },
    { id: 8, level: 2, strength: 0.2 }, { id: 14, level: 2, strength: 0.2 },
  ]},
  // Bob: close with Alice, David; friends with Frank, Henry, Leo
  { agent: 1, neighbors: [
    { id: 0, level: 0, strength: 0.8 }, { id: 3, level: 0, strength: 0.7 },
    { id: 5, level: 1, strength: 0.5 }, { id: 7, level: 1, strength: 0.45 }, { id: 11, level: 1, strength: 0.5 },
    { id: 9, level: 2, strength: 0.2 }, { id: 15, level: 2, strength: 0.15 },
  ]},
  // Carol: close with Alice, Eve; friends with Grace, Karen, Olivia
  { agent: 2, neighbors: [
    { id: 0, level: 0, strength: 0.75 }, { id: 4, level: 0, strength: 0.7 },
    { id: 6, level: 1, strength: 0.5 }, { id: 10, level: 1, strength: 0.45 }, { id: 14, level: 1, strength: 0.5 },
    { id: 12, level: 2, strength: 0.2 }, { id: 16, level: 2, strength: 0.15 },
  ]},
  // David: close with Bob, Frank; friends with Leo, Paul, Nathan
  { agent: 3, neighbors: [
    { id: 1, level: 0, strength: 0.7 }, { id: 5, level: 0, strength: 0.65 },
    { id: 11, level: 1, strength: 0.5 }, { id: 15, level: 1, strength: 0.45 }, { id: 13, level: 1, strength: 0.4 },
    { id: 7, level: 2, strength: 0.2 }, { id: 18, level: 2, strength: 0.15 },
  ]},
  // Eve: close with Carol, Grace; friends with Alice, Olivia, Tina
  { agent: 4, neighbors: [
    { id: 2, level: 0, strength: 0.7 }, { id: 6, level: 0, strength: 0.75 },
    { id: 0, level: 1, strength: 0.5 }, { id: 14, level: 1, strength: 0.5 }, { id: 19, level: 1, strength: 0.45 },
    { id: 10, level: 2, strength: 0.2 }, { id: 17, level: 2, strength: 0.15 },
  ]},
  // Frank: close with David, Henry; friends with Bob, Jack, Sam
  { agent: 5, neighbors: [
    { id: 3, level: 0, strength: 0.65 }, { id: 7, level: 0, strength: 0.6 },
    { id: 1, level: 1, strength: 0.5 }, { id: 9, level: 1, strength: 0.45 }, { id: 18, level: 1, strength: 0.4 },
    { id: 11, level: 2, strength: 0.2 }, { id: 15, level: 2, strength: 0.15 },
  ]},
  // Grace: close with Eve, Iris; friends with Carol, Alice, Rachel
  { agent: 6, neighbors: [
    { id: 4, level: 0, strength: 0.75 }, { id: 8, level: 0, strength: 0.7 },
    { id: 2, level: 1, strength: 0.5 }, { id: 0, level: 1, strength: 0.5 }, { id: 17, level: 1, strength: 0.45 },
    { id: 14, level: 2, strength: 0.2 }, { id: 12, level: 2, strength: 0.15 },
  ]},
  // Henry: close with Frank, Jack; friends with Bob, Sam, Quinn
  { agent: 7, neighbors: [
    { id: 5, level: 0, strength: 0.6 }, { id: 9, level: 0, strength: 0.55 },
    { id: 1, level: 1, strength: 0.45 }, { id: 18, level: 1, strength: 0.4 }, { id: 16, level: 1, strength: 0.4 },
    { id: 3, level: 2, strength: 0.2 }, { id: 13, level: 2, strength: 0.15 },
  ]},
  // Iris: close with Grace, Rachel; friends with Eve, Tina, Alice
  { agent: 8, neighbors: [
    { id: 6, level: 0, strength: 0.7 }, { id: 17, level: 0, strength: 0.65 },
    { id: 4, level: 1, strength: 0.5 }, { id: 19, level: 1, strength: 0.45 }, { id: 0, level: 1, strength: 0.4 },
    { id: 12, level: 2, strength: 0.2 }, { id: 14, level: 2, strength: 0.15 },
  ]},
  // Jack: close with Henry, Sam; friends with Frank, Nathan, Quinn
  { agent: 9, neighbors: [
    { id: 7, level: 0, strength: 0.55 }, { id: 18, level: 0, strength: 0.6 },
    { id: 5, level: 1, strength: 0.45 }, { id: 13, level: 1, strength: 0.4 }, { id: 16, level: 1, strength: 0.4 },
    { id: 15, level: 2, strength: 0.2 }, { id: 11, level: 2, strength: 0.15 },
  ]},
  // Karen: close with Olivia, Quinn; friends with Carol, Mia, Rachel
  { agent: 10, neighbors: [
    { id: 14, level: 0, strength: 0.7 }, { id: 16, level: 0, strength: 0.6 },
    { id: 2, level: 1, strength: 0.45 }, { id: 12, level: 1, strength: 0.45 }, { id: 17, level: 1, strength: 0.4 },
    { id: 4, level: 2, strength: 0.2 }, { id: 8, level: 2, strength: 0.15 },
  ]},
  // Leo: close with Paul, David; friends with Bob, Nathan, Tina
  { agent: 11, neighbors: [
    { id: 15, level: 0, strength: 0.65 }, { id: 3, level: 0, strength: 0.5 },
    { id: 1, level: 1, strength: 0.5 }, { id: 13, level: 1, strength: 0.4 }, { id: 19, level: 1, strength: 0.4 },
    { id: 5, level: 2, strength: 0.2 }, { id: 9, level: 2, strength: 0.15 },
  ]},
  // Mia: close with Alice, Rachel; friends with Carol, Karen, Tina
  { agent: 12, neighbors: [
    { id: 0, level: 0, strength: 0.7 }, { id: 17, level: 0, strength: 0.65 },
    { id: 2, level: 1, strength: 0.45 }, { id: 10, level: 1, strength: 0.45 }, { id: 19, level: 1, strength: 0.4 },
    { id: 6, level: 2, strength: 0.2 }, { id: 14, level: 2, strength: 0.15 },
  ]},
  // Nathan: close with Sam, Olivia; friends with David, Jack, Leo
  { agent: 13, neighbors: [
    { id: 18, level: 0, strength: 0.6 }, { id: 14, level: 0, strength: 0.55 },
    { id: 3, level: 1, strength: 0.4 }, { id: 9, level: 1, strength: 0.4 }, { id: 11, level: 1, strength: 0.4 },
    { id: 7, level: 2, strength: 0.2 }, { id: 15, level: 2, strength: 0.15 },
  ]},
  // Olivia: close with Carol, Nathan; friends with Eve, Karen, Grace
  { agent: 14, neighbors: [
    { id: 2, level: 0, strength: 0.7 }, { id: 13, level: 0, strength: 0.55 },
    { id: 4, level: 1, strength: 0.5 }, { id: 10, level: 1, strength: 0.5 }, { id: 6, level: 1, strength: 0.45 },
    { id: 8, level: 2, strength: 0.2 }, { id: 0, level: 2, strength: 0.15 },
  ]},
  // Paul: close with Leo, Tina; friends with David, Quinn, Frank
  { agent: 15, neighbors: [
    { id: 11, level: 0, strength: 0.65 }, { id: 19, level: 0, strength: 0.6 },
    { id: 3, level: 1, strength: 0.45 }, { id: 16, level: 1, strength: 0.4 }, { id: 5, level: 1, strength: 0.4 },
    { id: 9, level: 2, strength: 0.2 }, { id: 13, level: 2, strength: 0.15 },
  ]},
  // Quinn: close with Karen, Paul; friends with Henry, Jack, Tina
  { agent: 16, neighbors: [
    { id: 10, level: 0, strength: 0.6 }, { id: 15, level: 0, strength: 0.6 },
    { id: 7, level: 1, strength: 0.4 }, { id: 9, level: 1, strength: 0.4 }, { id: 19, level: 1, strength: 0.4 },
    { id: 2, level: 2, strength: 0.15 }, { id: 12, level: 2, strength: 0.15 },
  ]},
  // Rachel: close with Iris, Mia; friends with Grace, Karen, Tina
  { agent: 17, neighbors: [
    { id: 8, level: 0, strength: 0.65 }, { id: 12, level: 0, strength: 0.65 },
    { id: 6, level: 1, strength: 0.45 }, { id: 10, level: 1, strength: 0.4 }, { id: 19, level: 1, strength: 0.4 },
    { id: 4, level: 2, strength: 0.15 }, { id: 14, level: 2, strength: 0.15 },
  ]},
  // Sam: close with Jack, Nathan; friends with Frank, Henry, Tina
  { agent: 18, neighbors: [
    { id: 9, level: 0, strength: 0.6 }, { id: 13, level: 0, strength: 0.6 },
    { id: 5, level: 1, strength: 0.4 }, { id: 7, level: 1, strength: 0.4 }, { id: 19, level: 1, strength: 0.4 },
    { id: 3, level: 2, strength: 0.15 }, { id: 15, level: 2, strength: 0.15 },
  ]},
  // Tina: close with Paul, Quinn; friends with Eve, Iris, Leo
  { agent: 19, neighbors: [
    { id: 15, level: 0, strength: 0.6 }, { id: 16, level: 0, strength: 0.55 },
    { id: 4, level: 1, strength: 0.45 }, { id: 8, level: 1, strength: 0.45 }, { id: 11, level: 1, strength: 0.4 },
    { id: 12, level: 2, strength: 0.2 }, { id: 17, level: 2, strength: 0.15 },
  ]},
];

function createEngine(seed) {
  const engine = new native.BatchEmotionEngine(seed);
  for (const agent of AGENTS) {
    const baseline = {};
    for (const dim of DIM_NAMES) baseline[dim] = 0;
    Object.assign(baseline, agent.baseline);
    engine.addAgent(
      JSON.stringify(agent.behavior),
      EMOTION_CONFIG,
      JSON.stringify({ current: baseline }),
    );
  }
  return engine;
}

function buildGraph(engine) {
  const n = NUM_AGENTS;
  let totalEdges = 0;
  for (const g of SOCIAL_GRAPH) totalEdges += g.neighbors.length;

  const offsets = new Uint32Array(n + 1);
  const neighbors = new Uint32Array(totalEdges);
  const levels = new Uint8Array(totalEdges);
  const strengths = new Float32Array(totalEdges);

  let idx = 0;
  for (let i = 0; i < n; i++) {
    offsets[i] = idx;
    const agentGraph = SOCIAL_GRAPH[i];
    for (const nb of agentGraph.neighbors) {
      neighbors[idx] = nb.id;
      levels[idx] = nb.level;
      strengths[idx] = nb.strength;
      idx++;
    }
  }
  offsets[n] = idx;

  engine.setupSocialGraphBinary(
    Buffer.from(offsets.buffer),
    Buffer.from(neighbors.buffer),
    Buffer.from(levels.buffer),
    Buffer.from(strengths.buffer),
  );
}

function outputToInput(outBuf) {
  const input = Buffer.alloc(NUM_AGENTS * INPUT_PER_AGENT * 8);
  for (let i = 0; i < NUM_AGENTS; i++) {
    outBuf.copy(input, i * INPUT_PER_AGENT * 8, i * OUTPUT_PER_AGENT * 8, i * OUTPUT_PER_AGENT * 8 + INPUT_PER_AGENT * 8);
  }
  return input;
}

function unpackSnapshots(outBuf) {
  const snapshots = [];
  for (let i = 0; i < NUM_AGENTS; i++) {
    const offset = i * OUTPUT_PER_AGENT * 8;
    const state = {};
    for (let d = 0; d < 30; d++) {
      state[DIM_NAMES[d]] = outBuf.readDoubleLE(offset + d * 8);
    }
    state.stress = outBuf.readDoubleLE(offset + 30 * 8);
    snapshots.push(state);
  }
  return snapshots;
}

function getDominant(state, n = 3) {
  return DIM_NAMES
    .map(dim => ({ dim, value: state[dim] }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, n);
}

function getValence(state) {
  let pos = 0, neg = 0;
  for (const dim of POSITIVE) pos += Math.max(0, state[dim]);
  for (const dim of NEGATIVE) neg += Math.max(0, state[dim]);
  return pos - neg;
}

function runSimulation(engine, mode, label) {
  const inputBytes = NUM_AGENTS * INPUT_PER_AGENT * 8;
  let inputBuf = Buffer.alloc(inputBytes);
  for (let i = 0; i < NUM_AGENTS; i++) {
    inputBuf.writeDoubleLE(2.0, i * INPUT_PER_AGENT * 8 + 30 * 8);
  }

  const trajectory = []; // [tick][agentId] = { ...state, valence, dominant }

  // Event injection: at tick 20, agents 0,1,2 receive negative shock
  // Simulates: "Alice, Bob, Carol witness an upsetting incident"

  for (let t = 0; t < NUM_TICKS; t++) {
    const hourOfDay = (INITIAL_HOUR + t * HOURS_ELAPSED) % 24;

    let outBuf;
    if (mode === 'full') {
      outBuf = engine.tickAllFullContagionBinary(inputBuf, HOURS_ELAPSED, hourOfDay);
    } else {
      outBuf = engine.tickAllHierarchicalBinary(inputBuf, HOURS_ELAPSED, hourOfDay);
    }

    const snapshots = unpackSnapshots(outBuf);

    // Inject negative event at tick 20
    if (t === 20) {
      // Apply negative emotion shock to agents 0, 1, 2
      // This requires re-running the tick with modified input...
      // Instead, we'll modify the output and use it as next input
      for (const victimId of [0, 1, 2]) {
        const s = snapshots[victimId];
        s.sadness = Math.min(1.0, (s.sadness || 0) + 0.6);
        s.fear = Math.min(1.0, (s.fear || 0) + 0.4);
        s.anger = Math.min(1.0, (s.anger || 0) + 0.3);
        s.joy = Math.max(-1.0, (s.joy || 0) - 0.5);
        s.calm = Math.max(-1.0, (s.calm || 0) - 0.4);
      }
    }

    // Record trajectory at key moments
    if ([0, 5, 10, 15, 19, 20, 21, 22, 23, 25, 30, 35, 40, 50, 60, 70, 80].includes(t)) {
      const tickRecord = snapshots.map((s, i) => ({
        agent: AGENTS[i].name,
        valence: getValence(s),
        dominant: getDominant(s, 3),
        stress: s.stress,
        raw: s,
      }));
      trajectory.push({ tick: t, hour: hourOfDay.toFixed(1), data: tickRecord });
    }

    // Reconstruct input from output (including event modifications)
    inputBuf = Buffer.alloc(inputBytes);
    for (let i = 0; i < NUM_AGENTS; i++) {
      const base = i * OUTPUT_PER_AGENT * 8;
      // Copy current[30] + stress[1]
      for (let d = 0; d < 30; d++) {
        inputBuf.writeDoubleLE(snapshots[i][DIM_NAMES[d]] || 0, i * INPUT_PER_AGENT * 8 + d * 8);
      }
      inputBuf.writeDoubleLE(snapshots[i].stress || 2.0, i * INPUT_PER_AGENT * 8 + 30 * 8);
    }
  }

  return trajectory;
}

function formatTrajectory(trajectory, label) {
  const lines = [];
  lines.push(`=== ${label} ===`);
  lines.push('');

  // Focus on key agents: victims (0,1,2), close friends of victims, and control agents
  const focusAgents = [0, 1, 2, 4, 6, 8, 12, 17, 7, 15]; // victims + their friends + controls

  for (const snap of trajectory) {
    lines.push(`--- Tick ${snap.tick} (Hour ${snap.hour}) ---`);
    for (const i of focusAgents) {
      const d = snap.data[i];
      const domStr = d.dominant.map(e => `${e.dim}=${e.value.toFixed(3)}`).join(', ');
      lines.push(`  ${d.agent.padEnd(10)} valence=${d.valence.toFixed(3).padStart(7)} stress=${d.stress.toFixed(2)} [${domStr}]`);
    }
    lines.push('');
  }

  // Summary: emotion spread analysis
  lines.push(`--- 最终状态对比 (Tick ${trajectory[trajectory.length - 1].tick}) ---`);
  const final = trajectory[trajectory.length - 1];

  // Victims
  const victimValence = [0, 1, 2].map(i => final.data[i].valence);
  const friendValence = [4, 6, 8, 12, 17].map(i => final.data[i].valence);
  const controlValence = [7, 15].map(i => final.data[i].valence);

  lines.push(`  受害者平均 valence:     ${victimValence.reduce((a, b) => a + b, 0).toFixed(3)}`);
  lines.push(`  受害者朋友平均 valence: ${friendValence.reduce((a, b) => a + b, 0).toFixed(3)}`);
  lines.push(`  控制组平均 valence:     ${controlValence.reduce((a, b) => a + b, 0).toFixed(3)}`);
  lines.push('');

  return lines.join('\n');
}

// ═══════════════════════════════════════════
// Main
// ═══════════════════════════════════════════

console.log('═══════════════════════════════════════════');
console.log('  LLM 评估实验: Full Sync vs Hierarchical');
console.log('═══════════════════════════════════════════\n');

// Create engines
const engineFull = createEngine(42);
const engineHier = createEngine(42);

// Build identical graphs
buildGraph(engineFull);
buildGraph(engineHier);

// Run simulations
console.log('运行 Full Sync 模拟...');
const fullTrajectory = runSimulation(engineFull, 'full', 'Full Sync');
console.log('运行 Hierarchical 模拟...');
const hierTrajectory = runSimulation(engineHier, 'hierarchical', 'Hierarchical');

// Format output
const fullReport = formatTrajectory(fullTrajectory, 'Full Sync (全量同步)');
const hierReport = formatTrajectory(hierTrajectory, 'Hierarchical Contagion (分频传染)');

// Write to file for LLM evaluation
const report = [
  '# LLM 评估: 社交情绪传染质量对比',
  '',
  '## 实验场景',
  '20 个 agent 参加晚间社交聚会。',
  '- Tick 0-19: 正常社交，情绪稳定',
  '- Tick 20: Alice, Bob, Carol 目睹令人不安的事件（情绪冲击: sadness+0.6, fear+0.4, anger+0.3, joy-0.5）',
  '- Tick 20-80: 观察负面情绪如何在社交网络中传播',
  '',
  '## 评估维度',
  '1. 情绪传染的真实性（close friends 是否比 acquaintances 受影响更大？）',
  '2. 情绪恢复的合理性（负面情绪是否随时间衰减？）',
  '3. 个体差异的表现（高 susceptibility 的 agent 是否变化更大？）',
  '4. 情绪极性的一致性（正面/负面情绪是否合理地相互抑制？）',
  '',
  '## Full Sync 数据',
  '```',
  fullReport,
  '```',
  '',
  '## Hierarchical Contagion 数据',
  '```',
  hierReport,
  '```',
  '',
].join('\n');

require('fs').writeFileSync('/Users/huangweijie/bobby-open-source/server/andy/experiments/llm_eval_data.md', report);
console.log('\n评估数据已写入 experiments/llm_eval_data.md');
console.log('开始 LLM 评估...\n');
