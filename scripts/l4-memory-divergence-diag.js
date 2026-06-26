#!/usr/bin/env node

/**
 * L4 Memory Divergence Diagnosis (v2.2-W0b)
 *
 * Instrument PersonalMemory.addExperience 调用，dump full vs restored memory creation timeline。
 * 定位 restored 在 tick 50-59 续跑期间生成的额外 memory。
 *
 * 方法：monkey-patch PersonalMemory.prototype.addExperience（不改 src/），记录每次调用：
 *   - caller（堆栈关键帧）
 *   - event（id/type/content）
 *   - tick
 *   - agentId
 *
 * Usage: node scripts/l4-memory-divergence-diag.js
 */

const AndyEngine = require('../index.js');
const { toWorldState, fromWorldState } = require('../store/index.js');
const PersonalMemory = require('../src/agent/memory/PersonalMemory');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 60; // 只跑到 60（覆盖 tick 50-59 分叉区间）
const RESUME_AT = 50;

// monkey-patch addExperience 捕获调用
const creationLog = [];
const origAddExperience = PersonalMemory.prototype.addExperience;
PersonalMemory.prototype.addExperience = function (event, emotionState, appraisalImportance = null) {
  // 提取 caller（跳过 addExperience 自身）
  const stack = new Error().stack.split('\n').slice(2, 6).map(l => l.trim());
  const callerFrame = stack.find(l => l.includes('src/')) || stack[0] || '?';
  const tick = this._simTime; // PersonalMemory 持有 simTime 引用
  creationLog.push({
    agentId: this.agentId,
    tick,
    eventId: event?.id || event?.type || '?',
    eventType: event?.type || '?',
    content: (event?.content || '').slice(0, 50),
    caller: callerFrame.replace(/.*\(([^)]+)\)/, '$1').replace(process.cwd() + '/', ''),
    memId: `mem_${this.agentId}_${this._nextMemId}`,
  });
  return origAddExperience.call(this, event, emotionState, appraisalImportance);
};

function buildEngine() {
  const e = new AndyEngine({ seed: SEED, startTime: START_TIME });
  e.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  e.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return e;
}

function runFull() {
  creationLog.length = 0;
  const e = buildEngine();
  for (let i = 0; i < TICKS; i++) e.tick();
  return creationLog.filter(c => c.agentId === 'maya' && c.tick >= 50 && c.tick < 60);
}

function runRestored() {
  creationLog.length = 0;
  const e = buildEngine();
  for (let i = 0; i < RESUME_AT; i++) e.tick();
  // 清掉恢复前的 log，只看续跑段
  creationLog.length = 0;
  const env = toWorldState(e, 'diag');
  const restored = fromWorldState(env, {}, AndyEngine);
  for (let i = RESUME_AT; i < TICKS; i++) restored.tick();
  return creationLog.filter(c => c.agentId === 'maya' && c.tick >= 50 && c.tick < 60);
}

console.log('=== L4 Memory Divergence Diagnosis (v2.2-W0b) ===');
console.log(`seed=${SEED} resumeAt=${RESUME_AT} ticks=${TICKS} (覆盖 tick 50-59)`);
console.log('');

const fullCreations = runFull();
const restoredCreations = runRestored();

console.log(`full maya memory creations (tick 50-59): ${fullCreations.length}`);
console.log(`restored maya memory creations (tick 50-59): ${restoredCreations.length}`);
console.log('');

// 对比：按 tick + eventId 找额外 memory
console.log('=== full creations ===');
for (const c of fullCreations) {
  console.log(`  tick${c.tick} ${c.memId} evt=${c.eventId} type=${c.eventType} caller=${c.caller} content="${c.content}"`);
}
console.log('');

console.log('=== restored creations ===');
for (const c of restoredCreations) {
  console.log(`  tick${c.tick} ${c.memId} evt=${c.eventId} type=${c.eventType} caller=${c.caller} content="${c.content}"`);
}
console.log('');

// 找 restored 第一条 full 没有的（按 tick+eventId 比对）
const fullKeys = new Set(fullCreations.map(c => `${c.tick}|${c.eventId}`));
const extra = restoredCreations.filter(c => !fullKeys.has(`${c.tick}|${c.eventId}`));
console.log(`=== restored 额外 memory (full 没有的): ${extra.length} 条 ===`);
if (extra.length > 0) {
  const first = extra[0];
  console.log('第一条额外 memory:');
  console.log(`  memId: ${first.memId}`);
  console.log(`  tick: ${first.tick}`);
  console.log(`  eventId: ${first.eventId}`);
  console.log(`  eventType: ${first.eventType}`);
  console.log(`  content: ${first.content}`);
  console.log(`  caller: ${first.caller}`);

  // 同 tick 的 full creation 对比（若有）
  const sameTickFull = fullCreations.filter(c => c.tick === first.tick);
  console.log(`  同 tick ${first.tick} full creations: ${sameTickFull.length}`);
  for (const f of sameTickFull) {
    console.log(`    full: ${f.memId} evt=${f.eventId} type=${f.eventType} caller=${f.caller}`);
  }
}

console.log('');
console.log('=== caller 分布 ===');
function callerStats(creations) {
  const m = {};
  for (const c of creations) m[c.caller] = (m[c.caller] || 0) + 1;
  return m;
}
console.log('full:', JSON.stringify(callerStats(fullCreations)));
console.log('restored:', JSON.stringify(callerStats(restoredCreations)));
