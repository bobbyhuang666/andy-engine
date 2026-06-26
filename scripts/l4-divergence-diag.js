#!/usr/bin/env node

/**
 * L4 Divergence Diagnosis (v2.2-W0)
 *
 * 逐 tick dump full run vs restored run 状态，定位首个分叉 tick + 字段。
 * 仅诊断，不改 production code。
 *
 * 方法：
 *   1. full run: seed42/100ticks，逐 tick 采状态快照。
 *   2. restored run: tick 50 序列化→恢复→续跑到 100，逐 tick 采状态。
 *   3. 逐 tick 比对，定位首个分叉 tick + 字段。
 *   4. dump 分叉 tick 的字段级 diff + RNG state + EventDispatcher 内部。
 *
 * Usage: node scripts/l4-divergence-diag.js [--tick N] [--full-dump]
 *   --tick N     dump 指定 tick 的完整状态（默认只 dump 首个分叉 tick）
 *   --full-dump   dump 全部分叉 tick（量大）
 */

const AndyEngine = require('../index.js');
const { toWorldState, fromWorldState } = require('../store/index.js');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 100;
const RESUME_AT = 50;

function buildEngine() {
  const e = new AndyEngine({ seed: SEED, startTime: START_TIME });
  e.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  e.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return e;
}

/**
 * 采单 tick 状态快照（字段级，便于 diff）。
 * 访问 engine.world 内部实例字段诊断未持久化运行期结构。
 */
function snapshot(e) {
  const w = e.world;
  const ed = w.eventDispatcher;
  const maya = e.getAllAgents().find(a => a.id === 'maya');
  const leo = e.getAllAgents().find(a => a.id === 'leo');
  const json = e.toJSON();

  function agentSnap(a) {
    if (!a) return null;
    return {
      position: a.position,
      state: a.stateMachine.current,
      memLen: a.memory.memories.length,
      memIds: a.memory.memories.map(m => m.id).join(','),
      emotionJoy: +a.emotion.current.joy?.toFixed(9),
      behB: a.behaviorField.B.map(x => +x.toFixed(9)),
      socialEnergy: a.socialEnergy,
      health: a.health,
    };
  }

  return {
    tick: w.clock.tickCount,
    time: w.clock.toISOString(),
    rngState: json.rngState,
    // EventDispatcher 运行期结构（诊断重点）
    edPendingLen: ed.pendingEvents.length,
    edPendingIds: ed.pendingEvents.map(ev => ev.id || ev.type).join(','),
    edNextId: ed._nextId,
    edEventLogLen: (json.events?.eventLog || []).length,
    // AndyWorld._scheduledEvents
    scheduledLen: w._scheduledEvents.length,
    scheduledKeys: w._scheduledEvents.map(s => `${s.time || s.tick}/${s.type || s.eventType || '?'}`).join(','),
    // agents
    maya: agentSnap(maya),
    leo: agentSnap(leo),
    // socialGraph
    socialEdges: json.socialGraph?.length || 0,
    socialEdgeKeys: (json.socialGraph || []).map(e => `${e.agentA}-${e.agentB}:${+(e.strength || 0).toFixed(9)}`).join(','),
  };
}

function diffSnapshots(a, b) {
  const diffs = [];
  function cmp(path, x, y) {
    if (x === y) return;
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) {
      diffs.push({ path, full: x, restored: y });
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      cmp(`${path}.${k}`, x[k], y[k]);
    }
  }
  cmp('', a, b);
  return diffs;
}

function main() {
  const args = process.argv.slice(2);
  const dumpTickArg = args.indexOf('--tick');
  const dumpTick = dumpTickArg !== -1 ? parseInt(args[dumpTickArg + 1], 10) : null;
  const fullDump = args.includes('--full-dump');

  console.log('=== L4 Divergence Diagnosis (v2.2-W0) ===');
  console.log(`seed=${SEED} ticks=${TICKS} resumeAt=${RESUME_AT}`);
  console.log('');

  // full run
  console.error('[diag] full run...');
  const fullEngine = buildEngine();
  const fullSnaps = [];
  for (let i = 0; i < TICKS; i++) {
    fullEngine.tick();
    fullSnaps.push(snapshot(fullEngine));
  }

  // restored run
  console.error('[diag] restored run...');
  const resumeEngine = buildEngine();
  for (let i = 0; i < RESUME_AT; i++) resumeEngine.tick();
  const env50 = toWorldState(resumeEngine, 'diag');
  const restoredEngine = fromWorldState(env50, {}, AndyEngine);
  const restoredSnaps = [];
  // restored 从 tick 50 续跑，对照 full[50..99]
  for (let i = RESUME_AT; i < TICKS; i++) {
    restoredEngine.tick();
    restoredSnaps.push(snapshot(restoredEngine));
  }

  // 找首个分叉 tick（restoredSnaps[0] 对照 fullSnaps[RESUME_AT]）
  let firstDiverge = -1;
  let firstDiffs = [];
  for (let i = 0; i < restoredSnaps.length; i++) {
    const fullTick = RESUME_AT + i;
    const diffs = diffSnapshots(fullSnaps[fullTick], restoredSnaps[i]);
    if (diffs.length > 0) {
      firstDiverge = fullTick;
      firstDiffs = diffs;
      break;
    }
  }

  // 恢复点 tick 50 一致性（fullSnaps[49] vs restored 恢复后首采）
  const resumePointFull = fullSnaps[RESUME_AT - 1];
  // restored 恢复后未 tick 前的快照
  const restoredFresh = fromWorldState(env50, {}, AndyEngine);
  const resumePointRestored = snapshot(restoredFresh);
  const resumeDiffs = diffSnapshots(resumePointFull, resumePointRestored);

  console.log('=== 恢复点 tick 50 一致性 ===');
  console.log(`full rngState: ${resumePointFull.rngState}`);
  console.log(`restored rngState: ${resumePointRestored.rngState}`);
  console.log(`rng 一致: ${resumePointFull.rngState === resumePointRestored.rngState}`);
  console.log(`恢复点 diff 数: ${resumeDiffs.length}`);
  if (resumeDiffs.length > 0) {
    console.log('恢复点差异:');
    for (const d of resumeDiffs) console.log(`  ${d.path}: full=${JSON.stringify(d.full)} restored=${JSON.stringify(d.restored)}`);
  }
  console.log('');

  console.log('=== 首个分叉 tick ===');
  if (firstDiverge === -1) {
    console.log('无分叉（续跑段全一致）');
  } else {
    console.log(`首个分叉 tick: ${firstDiverge}`);
    console.log(`分叉字段数: ${firstDiffs.length}`);
    console.log('分叉字段:');
    for (const d of firstDiffs) {
      console.log(`  ${d.path}`);
      console.log(`    full:     ${JSON.stringify(d.full).slice(0, 200)}`);
      console.log(`    restored: ${JSON.stringify(d.restored).slice(0, 200)}`);
    }

    // 分叉 tick 前一 tick RNG 一致性
    if (firstDiverge > RESUME_AT) {
      const prevFull = fullSnaps[firstDiverge - 1];
      const prevRestored = restoredSnaps[firstDiverge - 1 - RESUME_AT];
      console.log('');
      console.log(`=== 分叉前 tick ${firstDiverge - 1} RNG 一致性 ===`);
      console.log(`full rng: ${prevFull.rngState}`);
      console.log(`restored rng: ${prevRestored.rngState}`);
      console.log(`一致: ${prevFull.rngState === prevRestored.rngState}`);
      const prevDiffs = diffSnapshots(prevFull, prevRestored);
      if (prevDiffs.length > 0) {
        console.log(`前 tick 已有 diff (${prevDiffs.length}):`);
        for (const d of prevDiffs) console.log(`  ${d.path}: full=${JSON.stringify(d.full)} restored=${JSON.stringify(d.restored)}`);
      } else {
        console.log('前 tick 无 diff（分叉在本 tick 首次出现）');
      }
    }

    // 分叉 tick 的 EventDispatcher 内部详情
    console.log('');
    console.log(`=== 分叉 tick ${firstDiverge} EventDispatcher 内部 ===`);
    console.log('full:', JSON.stringify({
      edPendingLen: fullSnaps[firstDiverge].edPendingLen,
      edPendingIds: fullSnaps[firstDiverge].edPendingIds,
      edNextId: fullSnaps[firstDiverge].edNextId,
      scheduledLen: fullSnaps[firstDiverge].scheduledLen,
      scheduledKeys: fullSnaps[firstDiverge].scheduledKeys,
    }));
    console.log('restored:', JSON.stringify({
      edPendingLen: restoredSnaps[firstDiverge - RESUME_AT].edPendingLen,
      edPendingIds: restoredSnaps[firstDiverge - RESUME_AT].edPendingIds,
      edNextId: restoredSnaps[firstDiverge - RESUME_AT].edNextId,
      scheduledLen: restoredSnaps[firstDiverge - RESUME_AT].scheduledLen,
      scheduledKeys: restoredSnaps[firstDiverge - RESUME_AT].scheduledKeys,
    }));
  }

  // dump 指定 tick
  if (dumpTick !== null && dumpTick >= 0 && dumpTick < TICKS) {
    console.log('');
    console.log(`=== dump tick ${dumpTick} ===`);
    console.log('full:', JSON.stringify(fullSnaps[dumpTick], null, 2));
    if (dumpTick >= RESUME_AT) {
      console.log('restored:', JSON.stringify(restoredSnaps[dumpTick - RESUME_AT], null, 2));
    }
  }

  // 恢复点前 full pendingEvents 非空情况（验证 pendingEvents 是否在 tick 50 末尾非空）
  console.log('');
  console.log('=== 恢复点前 full pendingEvents/scheduledEvents 状态 ===');
  for (let t = RESUME_AT - 3; t < RESUME_AT; t++) {
    const s = fullSnaps[t];
    console.log(`tick ${t}: pending=${s.edPendingLen} scheduled=${s.scheduledLen} nextId=${s.edNextId}`);
  }
}

main();
