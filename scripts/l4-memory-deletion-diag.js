#!/usr/bin/env node

/**
 * L4 Memory Deletion Divergence Diagnosis (v2.2-W0c)
 *
 * instrument PersonalMemory 的 memory 变动路径（_prune/splice/截断）+ memory.tick，
 * dump tick 50-59 每 tick memory 数组变化，定位 full 删除而 restored 保留的 memory。
 *
 * Usage: node scripts/l4-memory-deletion-diag.js
 */

const AndyEngine = require('../index.js');
const { toWorldState, fromWorldState } = require('../store/index.js');
const PersonalMemory = require('../src/agent/memory/PersonalMemory');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 60;
const RESUME_AT = 50;

// instrument: 记录每 tick 的 memory ids 快照 + _prune/splice 调用
const diag = { prunes: [], ticks: [], memSnaps: [] };

const origPrune = PersonalMemory.prototype._prune;
PersonalMemory.prototype._prune = function () {
  const before = this.memories.map(m => m.id);
  const beforeLen = before.length;
  origPrune.call(this);
  const after = this.memories.map(m => m.id);
  const removed = before.filter(id => !after.includes(id));
  diag.prunes.push({
    agent: this.agentId,
    beforeLen,
    afterLen: after.length,
    removed: removed.slice(0, 10),
    removedCount: removed.length,
  });
};

const origTick = PersonalMemory.prototype.tick;
PersonalMemory.prototype.tick = function (hoursElapsed) {
  const beforeIds = this.memories.map(m => m.id);
  const beforeLen = beforeIds.length;
  origTick.call(this, hoursElapsed);
  const afterIds = this.memories.map(m => m.id);
  const added = afterIds.filter(id => !beforeIds.includes(id));
  const removed = beforeIds.filter(id => !afterIds.includes(id));
  diag.ticks.push({
    agent: this.agentId,
    hoursElapsed,
    beforeLen,
    afterLen: afterIds.length,
    addedCount: added.length,
    removedCount: removed.length,
    removedSample: removed.slice(0, 5),
  });
};

// 也 instrument splice 直接
const origSplice = Array.prototype.splice;
// 不全局 patch Array.splice（太宽），靠 _prune instrument 已覆盖

function buildEngine() {
  const e = new AndyEngine({ seed: SEED, startTime: START_TIME });
  e.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  e.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return e;
}

function memSnap(e, label) {
  const maya = e.getAllAgents().find(a => a.id === 'maya');
  return {
    label,
    tick: e.world.clock.tickCount,
    memLen: maya.memory.memories.length,
    memIds: maya.memory.memories.map(m => m.id),
    nextMemId: maya.memory._nextMemId,
    rngState: e.toJSON().rngState,
    // memory 关键字段采样（前5条）
    memSample: maya.memory.memories.slice(0, 5).map(m => ({
      id: m.id, imp: +m.importance.toFixed(4), acc: m.accessCount,
      ts: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
    })),
  };
}

console.log('=== L4 Memory Deletion Divergence Diagnosis (v2.2-W0c) ===');
console.log(`seed=${SEED} ticks=${TICKS} resumeAt=${RESUME_AT}`);
console.log('');

// ── full run ──
diag.prunes.length = 0; diag.ticks.length = 0; diag.memSnaps.length = 0;
console.error('[diag] full run...');
const fullE = buildEngine();
const fullSnaps = [];
for (let i = 0; i < TICKS; i++) {
  fullE.tick();
  if (i >= 54) fullSnaps.push(memSnap(fullE, `full t${i + 1}`));
}
const fullPrunes = diag.prunes.filter(p => p.agent === 'maya');
const fullTicks = diag.ticks.filter(t => t.agent === 'maya');

console.log('=== full maya tick 55-59 memory 变动 ===');
for (let i = 0; i < fullSnaps.length; i++) {
  const s = fullSnaps[i];
  const prev = i > 0 ? fullSnaps[i - 1] : null;
  const added = prev ? s.memIds.filter(id => !prev.memIds.includes(id)) : [];
  const removed = prev ? prev.memIds.filter(id => !s.memIds.includes(id)) : [];
  console.log(`${s.label}: memLen=${s.memLen} nextMemId=${s.nextMemId} added=${added.length} removed=${removed.length}`);
  if (removed.length > 0) console.log(`  removed: ${removed.slice(0, 8).join(',')}`);
  if (added.length > 0) console.log(`  added: ${added.slice(0, 8).join(',')}`);
}
console.log('');
console.log(`full maya _prune calls (tick 55-59): ${fullPrunes.length}`);
for (const p of fullPrunes) console.log(`  _prune: before=${p.beforeLen} after=${p.afterLen} removed=${p.removedCount} sample=${p.removed.join(',')}`);
console.log('');
console.log(`full maya memory.tick calls: ${fullTicks.length}`);
for (const t of fullTicks.slice(-6)) console.log(`  tick: hours=${t.hoursElapsed} before=${t.beforeLen} after=${t.afterLen} removed=${t.removedCount} sample=${t.removedSample.join(',')}`);

// ── restored run ──
diag.prunes.length = 0; diag.ticks.length = 0;
console.error('[diag] restored run...');
const resumeE = buildEngine();
for (let i = 0; i < RESUME_AT; i++) resumeE.tick();
const env = toWorldState(resumeE, 'diag');
const restoredE = fromWorldState(env, {}, AndyEngine);
const restoredSnaps = [];
// 恢复后立即采一 snap
restoredSnaps.push(memSnap(restoredE, 'restored after-restore'));
for (let i = RESUME_AT; i < TICKS; i++) {
  restoredE.tick();
  if (i >= 54) restoredSnaps.push(memSnap(restoredE, `restored t${i + 1}`));
}
const restoredPrunes = diag.prunes.filter(p => p.agent === 'maya');
const restoredTicks = diag.ticks.filter(t => t.agent === 'maya');

console.log('');
console.log('=== restored maya tick 55-59 memory 变动 ===');
for (let i = 1; i < restoredSnaps.length; i++) {
  const s = restoredSnaps[i];
  const prev = restoredSnaps[i - 1];
  const added = s.memIds.filter(id => !prev.memIds.includes(id));
  const removed = prev.memIds.filter(id => !s.memIds.includes(id));
  console.log(`${s.label}: memLen=${s.memLen} nextMemId=${s.nextMemId} added=${added.length} removed=${removed.length}`);
  if (removed.length > 0) console.log(`  removed: ${removed.slice(0, 8).join(',')}`);
  if (added.length > 0) console.log(`  added: ${added.slice(0, 8).join(',')}`);
}
console.log('');
console.log(`restored maya _prune calls (tick 55-59): ${restoredPrunes.length}`);
for (const p of restoredPrunes) console.log(`  _prune: before=${p.beforeLen} after=${p.afterLen} removed=${p.removedCount} sample=${p.removed.join(',')}`);
console.log('');
console.log(`restored maya memory.tick calls: ${restoredTicks.length}`);
for (const t of restoredTicks.slice(-6)) console.log(`  tick: hours=${t.hoursElapsed} before=${t.beforeLen} after=${t.afterLen} removed=${t.removedCount} sample=${t.removedSample.join(',')}`);

// 恢复点 memory 内容对比
console.log('');
console.log('=== 恢复点对比 ===');
const fullAt50 = memSnap(buildEngine_runTo(50), 'full t50');
console.log('full t50 memLen:', fullAt50.memLen, 'nextMemId:', fullAt50.nextMemId);
console.log('restored after-restore memLen:', restoredSnaps[0].memLen, 'nextMemId:', restoredSnaps[0].nextMemId);

function buildEngine_runTo(n) {
  const e = buildEngine();
  for (let i = 0; i < n; i++) e.tick();
  return e;
}
