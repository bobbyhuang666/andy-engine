#!/usr/bin/env node

/**
 * L4 Consolidation Merge Decision Divergence Diagnosis (v2.2-W0f)
 *
 * instrument PersonalMemory.consolidate 捕获每次 merge pair + similarity + importance +
 * 桶候选顺序 + memory array order，对比 full vs restored。
 *
 * Usage: node scripts/l4-consolidation-divergence-diag.js
 */

const AndyEngine = require('../index.js');
const { toWorldState, fromWorldState } = require('../store/index.js');
const PersonalMemory = require('../src/agent/memory/PersonalMemory');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 84;

// instrument consolidate: 捕获 merge pair + similarity + 候选顺序
const consolidateLog = [];
const origConsolidate = PersonalMemory.prototype.consolidate;
PersonalMemory.prototype.consolidate = function () {
  const before = this.memories.map(m => ({ id: m.id, imp: m.importance, acc: m.accessCount, pres: m.presentations.length, cat: m.category }));
  const merges = origConsolidate.call(this);
  const after = this.memories.map(m => m.id);
  consolidateLog.push({
    agent: this.agentId,
    simTime: this._simTime,
    beforeCount: before.length,
    afterCount: after.length,
    merges: merges.map(m => ({ kept: m.kept, removed: m.removed })),
    beforeOrder: before.map(b => `${b.id}(imp=${+b.imp.toFixed(6)},acc=${b.acc},pres=${b.pres})`),
    afterOrder: after,
  });
  return merges;
};

// 也 instrument _memorySimilarity 捕获分数
const simLog = [];
const origSim = PersonalMemory.prototype._memorySimilarity;
PersonalMemory.prototype._memorySimilarity = function (a, b) {
  const s = origSim.call(this, a, b);
  if (s > 0.3) { // 只记可能触发合并的
    simLog.push({ agent: this.agentId, a: a.id, b: b.id, sim: +s.toFixed(9), aImp: +a.importance.toFixed(6), bImp: +b.importance.toFixed(6) });
  }
  return s;
};

function buildEngine() {
  const e = new AndyEngine({ seed: SEED, startTime: START_TIME });
  e.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  e.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return e;
}

console.log('=== L4 Consolidation Divergence Diagnosis (v2.2-W0f) ===');
console.log('');

// full run
consolidateLog.length = 0; simLog.length = 0;
const fullE = buildEngine();
for (let i = 0; i < TICKS; i++) fullE.tick();
const fullCons = consolidateLog.filter(c => c.agent === 'leo');
const fullSims = simLog.filter(s => s.agent === 'leo');

// restored run
consolidateLog.length = 0; simLog.length = 0;
const resumeE = buildEngine();
for (let i = 0; i < 50; i++) resumeE.tick();
const env = toWorldState(resumeE, 'diag');
const restoredE = fromWorldState(env, {}, AndyEngine);
for (let i = 50; i < TICKS; i++) restoredE.tick();
const restCons = consolidateLog.filter(c => c.agent === 'leo');
const restSims = simLog.filter(s => s.agent === 'leo');

console.log(`full leo consolidate calls: ${fullCons.length}`);
console.log(`restored leo consolidate calls: ${restCons.length}`);
console.log('');

// 找首个不同 consolidate call
console.log('=== consolidate calls 对比 ===');
const maxCalls = Math.max(fullCons.length, restCons.length);
let firstDiffCall = -1;
for (let i = 0; i < maxCalls; i++) {
  const f = fullCons[i];
  const r = restCons[i];
  if (!f || !r) {
    firstDiffCall = i;
    console.log(`call #${i}: 一边缺失 (full=${f ? 'present' : 'MISSING'} restored=${r ? 'present' : 'MISSING'})`);
    break;
  }
  // 对比 merges（续跑段只看 tick 50+）
  const fMerges = JSON.stringify(f.merges);
  const rMerges = JSON.stringify(r.merges);
  if (fMerges !== rMerges) {
    firstDiffCall = i;
    console.log(`首个不同 consolidate call #${i}:`);
    console.log(`  full simTime: ${new Date(f.simTime).toISOString()} before=${f.beforeCount} after=${f.afterCount}`);
    console.log(`  restored simTime: ${new Date(r.simTime).toISOString()} before=${r.beforeCount} after=${r.afterCount}`);
    console.log(`  full merges: ${JSON.stringify(f.merges)}`);
    console.log(`  restored merges: ${JSON.stringify(r.merges)}`);
    console.log(`  full beforeOrder (前10): ${f.beforeOrder.slice(0, 10).join(' | ')}`);
    console.log(`  restored beforeOrder (前10): ${r.beforeOrder.slice(0, 10).join(' | ')}`);
    break;
  }
}
if (firstDiffCall === -1) console.log('consolidate merges 全一致');

console.log('');
console.log('=== 各 consolidate call merges 摘要 ===');
for (let i = 0; i < maxCalls; i++) {
  const f = fullCons[i];
  const r = restCons[i];
  if (!f && !r) break;
  const fM = f ? `${f.merges.length} merges` : 'MISSING';
  const rM = r ? `${r.merges.length} merges` : 'MISSING';
  const fT = f ? new Date(f.simTime).toISOString().slice(11, 19) : '?';
  const rT = r ? new Date(r.simTime).toISOString().slice(11, 19) : '?';
  const diff = f && r && JSON.stringify(f.merges) !== JSON.stringify(r.merges) ? ' ← DIFF' : '';
  console.log(`  call#${i}: full ${fT} ${fM} | restored ${rT} ${rM}${diff}`);
}

console.log('');
console.log('=== similarity scores 对比 (续跑段) ===');
// 找首个不同 sim
let firstDiffSim = -1;
const maxSims = Math.max(fullSims.length, restSims.length);
for (let i = 0; i < maxSims; i++) {
  const f = fullSims[i];
  const r = restSims[i];
  if (!f || !r) { firstDiffSim = i; console.log(`sim #${i}: 一边缺失`); break; }
  if (f.sim !== r.sim || f.a !== r.a || f.b !== r.b) {
    firstDiffSim = i;
    console.log(`首个不同 sim #${i}:`);
    console.log(`  full: ${f.a} vs ${f.b} sim=${f.sim} aImp=${f.aImp} bImp=${f.bImp}`);
    console.log(`  restored: ${r.a} vs ${r.b} sim=${r.sim} aImp=${r.aImp} bImp=${r.bImp}`);
    break;
  }
}
if (firstDiffSim === -1) console.log('similarity scores 全一致');
console.log(`total full sims: ${fullSims.length}, restored: ${restSims.length}`);
