#!/usr/bin/env node

/**
 * L4 Valence Divergence Diagnosis (v2.2-W0d)
 *
 * 定位 tick 67 valence 分叉的首个源头。
 * instrument RNG.next() 记录每次 draw（value + caller），对比 full vs restored。
 * dump tick 66 全字段验证一致，tick 67 逐字段找首个分叉。
 *
 * Usage: node scripts/l4-valence-divergence-diag.js
 */

const AndyEngine = require('../index.js');
const { toWorldState, fromWorldState } = require('../store/index.js');
const { RNG } = require('../src/shared/rng');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 67;
const RESUME_AT = 50;

// instrument RNG.next()
let drawLog = [];
const origNext = RNG.prototype.next;
RNG.prototype.next = function () {
  const v = origNext.call(this);
  const stack = new Error().stack.split('\n').slice(2, 8).map(l => l.trim().replace(process.cwd() + '/', ''));
  const caller = stack.find(l => l.includes('src/') || l.includes('agent/')) || stack[0] || '?';
  // 提取 file:line
  const loc = caller.replace(/.*\(([^)]+)\)/, '$1').replace(/^at /, '');
  drawLog.push({ value: v, caller: loc });
  return v;
};

function buildEngine() {
  const e = new AndyEngine({ seed: SEED, startTime: START_TIME });
  e.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  e.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return e;
}

function fullLeoState(e) {
  const leo = e.getAllAgents().find(a => a.id === 'leo');
  const ec = leo.emotion.current;
  return {
    behB: leo.behaviorField.B.map(x => +x.toFixed(12)),
    valence: +leo.emotion.getValence().toFixed(12),
    joy: +ec.joy.toFixed(12),
    sadness: +ec.sadness.toFixed(12),
    anger: +ec.anger.toFixed(12),
    fear: +ec.fear.toFixed(12),
    interest: +ec.interest.toFixed(12),
    excitement: +ec.excitement.toFixed(12),
    drive: +leo.needs.getDrive()?.toFixed(12),
    socialEnergy: +leo.socialEnergy.toFixed(12),
    memLen: leo.memory.memories.length,
    tsr: leo._ticksSinceReflection,
    rngState: e.toJSON().rngState,
  };
}

console.log('=== L4 Valence Divergence Diagnosis (v2.2-W0d) ===');
console.log('');

// ── tick 66 全字段一致性 ──
console.log('=== tick 66 全字段一致性 ===');
drawLog = [];
const fullE = buildEngine();
for (let i = 0; i < 66; i++) fullE.tick();
const full66 = fullLeoState(fullE);

const resumeE = buildEngine();
for (let i = 0; i < RESUME_AT; i++) resumeE.tick();
const env = toWorldState(resumeE, 'diag');
const restoredE = fromWorldState(env, {}, AndyEngine);
for (let i = RESUME_AT; i < 66; i++) restoredE.tick();
const restored66 = fullLeoState(restoredE);

let t66Match = true;
for (const k of Object.keys(full66)) {
  const f = JSON.stringify(full66[k]);
  const r = JSON.stringify(restored66[k]);
  if (f !== r) {
    console.log(`  ${k}: DIFF full=${f} restored=${r}`);
    t66Match = false;
  }
}
console.log(`tick 66 一致: ${t66Match}`);
console.log('');

// ── tick 67 RNG draw 序列对比 ──
console.log('=== tick 67 RNG draw 序列对比 ===');
drawLog = [];
fullE.tick();
const fullDraws = [...drawLog];

drawLog = [];
restoredE.tick();
const restoredDraws = [...drawLog];

console.log(`full tick 67 draws: ${fullDraws.length}`);
console.log(`restored tick 67 draws: ${restoredDraws.length}`);
console.log('');

// 找首个不同 draw
let firstDiffDraw = -1;
const maxLen = Math.max(fullDraws.length, restoredDraws.length);
for (let i = 0; i < maxLen; i++) {
  const f = fullDraws[i];
  const r = restoredDraws[i];
  if (!f || !r) {
    firstDiffDraw = i;
    console.log(`首个不同 draw #${i}: 一边缺失 (full=${f ? f.value : 'MISSING'} restored=${r ? r.value : 'MISSING'})`);
    break;
  }
  if (f.value !== r.value) {
    firstDiffDraw = i;
    console.log(`首个不同 draw #${i}:`);
    console.log(`  full value:     ${f.value} caller: ${f.caller}`);
    console.log(`  restored value: ${r.value} caller: ${r.caller}`);
    break;
  }
}
if (firstDiffDraw === -1) {
  console.log('RNG draw 序列完全一致');
}
console.log('');

// draw 数量不同
if (fullDraws.length !== restoredDraws.length) {
  console.log(`draw 数量不同: full=${fullDraws.length} restored=${restoredDraws.length}`);
  console.log(`full 最后3 draw:`);
  for (const d of fullDraws.slice(-3)) console.log(`  ${d.value} @ ${d.caller}`);
  console.log(`restored 最后3 draw:`);
  for (const d of restoredDraws.slice(-3)) console.log(`  ${d.value} @ ${d.caller}`);
  console.log('');
}

// tick 67 后状态
console.log('=== tick 67 后状态 ===');
const full67 = fullLeoState(fullE);
const restored67 = fullLeoState(restoredE);
for (const k of Object.keys(full67)) {
  const f = JSON.stringify(full67[k]);
  const r = JSON.stringify(restored67[k]);
  if (f !== r) console.log(`  ${k}: DIFF full=${f} restored=${r}`);
}
console.log('');

// 首个不同 draw 前后的 draw 详情
if (firstDiffDraw >= 0 && firstDiffDraw < maxLen) {
  console.log(`=== draw #${firstDiffDraw - 2}..${firstDiffDraw + 2} 详情 ===`);
  for (let i = Math.max(0, firstDiffDraw - 2); i < Math.min(maxLen, firstDiffDraw + 3); i++) {
    const f = fullDraws[i];
    const r = restoredDraws[i];
    console.log(`draw#${i}: full=${f ? f.value : '-'}(${f ? f.caller : '?'}) restored=${r ? r.value : '-'}(${r ? r.caller : '?'})`);
  }
}

// 若 RNG 一致但 valence 仍分叉，dump valence 更新路径
if (firstDiffDraw === -1 && JSON.stringify(full67.valence) !== JSON.stringify(restored67.valence)) {
  console.log('=== RNG 一致但 valence 仍分叉 ===');
  console.log('full valence:', full67.valence, 'restored valence:', restored67.valence);
  console.log('需查 valence 更新函数的输入是否一致（浮点/ordering/simTime）');
}
