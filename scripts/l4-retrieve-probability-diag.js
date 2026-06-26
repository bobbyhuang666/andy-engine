#!/usr/bin/env node

/**
 * L4 Retrieve Probability Divergence Diagnosis (v2.2-W0e)
 *
 * instrument PersonalMemory.retrieve 的 P 值分量计算，
 * dump mem_leo_97 / mem_leo_185 / mem_leo_51 的各分量（full vs restored tick 67 leo）。
 *
 * Usage: node scripts/l4-retrieve-probability-diag.js
 */

const AndyEngine = require('../index.js');
const { toWorldState, fromWorldState } = require('../store/index.js');
const PersonalMemory = require('../src/agent/memory/PersonalMemory');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TARGET_MEMS = new Set(['mem_leo_97', 'mem_leo_185', 'mem_leo_51']);

// instrument 各分量函数
const componentLog = [];
const origBase = PersonalMemory.prototype._baseLevelActivation;
PersonalMemory.prototype._baseLevelActivation = function (memory, now) {
  const v = origBase.call(this, memory, now);
  if (TARGET_MEMS.has(memory.id)) {
    componentLog.push({ id: memory.id, comp: 'baseLevel', value: v, now });
  }
  return v;
};
const origSpread = PersonalMemory.prototype._spreadingActivation;
PersonalMemory.prototype._spreadingActivation = function (memory, context) {
  const v = origSpread.call(this, memory, context);
  if (TARGET_MEMS.has(memory.id)) {
    componentLog.push({ id: memory.id, comp: 'spreading', value: v });
  }
  return v;
};
const origMood = PersonalMemory.prototype._moodCongruence;
PersonalMemory.prototype._moodCongruence = function (valence, memory) {
  const v = origMood.call(this, valence, memory);
  if (TARGET_MEMS.has(memory.id)) {
    componentLog.push({ id: memory.id, comp: 'moodCongruence', value: v });
  }
  return v;
};
const origInvol = PersonalMemory.prototype._involuntaryRecall;
PersonalMemory.prototype._involuntaryRecall = function (memory, arousal) {
  const v = origInvol.call(this, memory, arousal);
  if (TARGET_MEMS.has(memory.id)) {
    componentLog.push({ id: memory.id, comp: 'involuntary', value: v });
  }
  return v;
};

function buildEngine() {
  const e = new AndyEngine({ seed: SEED, startTime: START_TIME });
  e.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  e.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return e;
}

function getLeoMemoryField(e, id, field) {
  const leo = e.getAllAgents().find(a => a.id === 'leo');
  const m = leo.memory.memories.find(x => x.id === id);
  return m ? m[field] : 'NOT_FOUND';
}

console.log('=== L4 Retrieve Probability Divergence Diagnosis (v2.2-W0e) ===');
console.log(`target memories: ${[...TARGET_MEMS].join(', ')}`);
console.log('');

// ── full run ──
componentLog.length = 0;
const fullE = buildEngine();
for (let i = 0; i < 66; i++) fullE.tick();
componentLog.length = 0;
fullE.tick(); // tick 67
const fullComps = [...componentLog];

// ── restored run ──
componentLog.length = 0;
const resumeE = buildEngine();
for (let i = 0; i < 50; i++) resumeE.tick();
const env = toWorldState(resumeE, 'diag');
const restoredE = fromWorldState(env, {}, AndyEngine);
for (let i = 50; i < 66; i++) restoredE.tick();
componentLog.length = 0;
restoredE.tick(); // tick 67
const restoredComps = [...componentLog];

// 按 memory id 分组各分量
function groupByMem(log) {
  const g = {};
  for (const e of log) {
    if (!g[e.id]) g[e.id] = {};
    g[e.id][e.comp] = e.value;
    if (e.now !== undefined) g[e.id]._now = e.now;
  }
  return g;
}

const fullG = groupByMem(fullComps);
const restoredG = groupByMem(restoredComps);

console.log('=== P 分量对比 (tick 67 leo retrieve) ===');
for (const memId of ['mem_leo_97', 'mem_leo_185', 'mem_leo_51']) {
  console.log(`\n--- ${memId} ---`);
  const f = fullG[memId] || {};
  const r = restoredG[memId] || {};
  const comps = ['baseLevel', 'spreading', 'moodCongruence', 'involuntary'];
  for (const c of comps) {
    const fv = f[c];
    const rv = r[c];
    const diff = (fv !== undefined && rv !== undefined && fv !== rv);
    console.log(`  ${c}: full=${fv} restored=${rv}${diff ? '  ← DIFF' : ''}`);
  }
  // emotionalBoost (来自 memory.appraisal.importance * 0.3, 不经函数, 直接读字段)
  const fullAppr = getLeoMemoryField(fullE, memId, 'appraisal');
  const restAppr = getLeoMemoryField(restoredE, memId, 'appraisal');
  const fBoost = fullAppr ? fullAppr.importance * 0.3 : 0;
  const rBoost = restAppr ? restAppr.importance * 0.3 : 0;
  console.log(`  emotionalBoost: full=${fBoost} restored=${rBoost}${fBoost !== rBoost ? '  ← DIFF' : ''}`);
  if (f._now !== undefined) console.log(`  _now: full=${f._now} restored=${r._now}`);
}

// memory 关键字段对比（找依赖字段）
console.log('');
console.log('=== memory 关键字段对比 ===');
for (const memId of ['mem_leo_97', 'mem_leo_185', 'mem_leo_51']) {
  console.log(`\n--- ${memId} ---`);
  for (const field of ['importance', 'accessCount', 'timestamp', 'lastAccessed', 'presentations', 'emotionTag']) {
    const fv = getLeoMemoryField(fullE, memId, field);
    const rv = getLeoMemoryField(restoredE, memId, field);
    const fvs = fv instanceof Date ? fv.toISOString() : (Array.isArray(fv) ? fv.length : fv);
    const rvs = rv instanceof Date ? rv.toISOString() : (Array.isArray(rv) ? rv.length : rv);
    const diff = JSON.stringify(fvs) !== JSON.stringify(rvs);
    console.log(`  ${field}: full=${fvs} restored=${rvs}${diff ? '  ← DIFF' : ''}`);
  }
}
