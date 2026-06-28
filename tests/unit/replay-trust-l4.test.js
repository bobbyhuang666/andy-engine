/**
 * L4 Replay Trust — 截断续跑一致性 (REPLAY_TRUST_ROADMAP §7)
 *
 * L4 语义：从 tick N 的快照续跑到 tick M，与全程回放的 tick M hash 一致。
 * 证明世界可持续（停服续跑不丢演化）。
 *
 * v2.2-W1 修复：EventDispatcher._nextId + Agent._ticksSinceReflection/_ticksSinceDriftCheck
 * 持久化恢复。此前因这些 runtime state 未持久化，restore 后续跑行为漂移。
 *
 * 根因诊断见 docs/current/PERSISTENCE_FIDELITY_ROOT_CAUSE_REPORT.md (W0, _nextId)
 * 与 docs/current/MEMORY_DELETION_ROOT_CAUSE_REPORT.md (W0c, reflection counters)。
 * W6 旧诊断"toWorldState 丢失 memory"已证伪（W0/W0c），memory 序列化正常。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { toWorldState, fromWorldState } from '../../store/index.js';
const { computeTickHash } = require('../../src/store/world/tickHash');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 100;
const RESUME_AT = 50;

function buildSeededEngine(seed = SEED) {
  const engine = new AndyEngine({ seed, startTime: START_TIME });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return engine;
}

describe('L4 Replay Trust — 截断续跑一致性', () => {
  it('从 tick 50 快照续跑到 100，续跑段 hash 与全程回放一致', () => {
    const fullEngine = buildSeededEngine();
    const fullHashes = [];
    for (let i = 0; i < TICKS; i++) {
      fullEngine.tick();
      fullHashes.push(computeTickHash(toWorldState(fullEngine, 'l4-full'), i).hash);
    }

    const resumeEngine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) {
      resumeEngine.tick();
    }

    // 恢复点状态一致性
    const hashAtResumeBefore = computeTickHash(toWorldState(resumeEngine, 'l4-resume'), RESUME_AT - 1).hash;
    const envelope50 = toWorldState(resumeEngine, 'l4-resume');
    const restoredEngine = fromWorldState(envelope50, {}, AndyEngine);

    const hashAtResumeAfter = computeTickHash(toWorldState(restoredEngine, 'l4-resume'), RESUME_AT - 1).hash;
    expect(hashAtResumeAfter, 'restore 前后 tick 50 hash 应一致').toBe(hashAtResumeBefore);
    expect(hashAtResumeAfter, '恢复点应与全程回放 tick 50 一致').toBe(fullHashes[RESUME_AT - 1]);

    const resumedHashes = [];
    for (let i = RESUME_AT; i < TICKS; i++) {
      restoredEngine.tick();
      resumedHashes.push(computeTickHash(toWorldState(restoredEngine, 'l4-resume'), i).hash);
    }

    const fullResumeSegment = fullHashes.slice(RESUME_AT);
    expect(resumedHashes, '续跑段 hash 应与全程回放一致').toEqual(fullResumeSegment);
  });

  it('续跑段长度正确', () => {
    const resumeEngine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) resumeEngine.tick();
    const envelope50 = toWorldState(resumeEngine, 'l4-len');
    const restored = fromWorldState(envelope50, {}, AndyEngine);

    const resumedHashes = [];
    for (let i = RESUME_AT; i < TICKS; i++) {
      restored.tick();
      resumedHashes.push(computeTickHash(toWorldState(restored, 'l4-len'), i).hash);
    }
    expect(resumedHashes.length).toBe(TICKS - RESUME_AT);
  });
});

// W1 regression: runtime state restore fidelity
describe('W1 regression: runtime state restore fidelity', () => {
  it('EventDispatcher._nextId 在 toJSON→fromJSON 后一致', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) engine.tick();
    const beforeNextId = engine.world.eventDispatcher._nextId;

    const env = toWorldState(engine, 'reg');
    const restored = fromWorldState(env, {}, AndyEngine);
    const afterNextId = restored.world.eventDispatcher._nextId;

    expect(afterNextId, '_nextId 应恢复为 ' + beforeNextId).toBe(beforeNextId);
  });

  it('Agent._ticksSinceReflection 在 toJSON→fromJSON 后一致', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) engine.tick();
    const before = engine.getAllAgents().find(a => a.id === 'maya')._ticksSinceReflection;

    const env = toWorldState(engine, 'reg');
    const restored = fromWorldState(env, {}, AndyEngine);
    const after = restored.getAllAgents().find(a => a.id === 'maya')._ticksSinceReflection;

    expect(after, '_ticksSinceReflection 应恢复为 ' + before).toBe(before);
  });

  it('Agent._ticksSinceDriftCheck 在 toJSON→fromJSON 后一致', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) engine.tick();
    const before = engine.getAllAgents().find(a => a.id === 'leo')._ticksSinceDriftCheck;

    const env = toWorldState(engine, 'reg');
    const restored = fromWorldState(env, {}, AndyEngine);
    const after = restored.getAllAgents().find(a => a.id === 'leo')._ticksSinceDriftCheck;

    expect(after, '_ticksSinceDriftCheck 应恢复为 ' + before).toBe(before);
  });

  it('memory 序列化包含 memories 数组和 _nextMemId (R8 fix)', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) engine.tick();

    const agent = engine.getAllAgents().find(a => a.id === 'maya');
    const runtimeMemCount = agent.memory.memories.length;
    expect(runtimeMemCount, 'tick 50 运行时应已有累积 memory').toBeGreaterThan(0);

    const env = toWorldState(engine, 'reg');
    // R8: memory serialization is now {memories: [...], _nextMemId: N}
    // (was plain array before, missing _nextMemId caused ID collision after prune+restore)
    const snapMem = env.runtimeSnapshot?.agents?.maya?.memory;
    expect(typeof snapMem, 'envelope memory 应是对象').toBe('object');
    expect(Array.isArray(snapMem.memories), 'envelope memory.memories 应是数组').toBe(true);
    expect(snapMem.memories.length, 'envelope 应序列化全部累积 memory').toBe(runtimeMemCount);
    expect(typeof snapMem._nextMemId, 'envelope memory._nextMemId 应是数字').toBe('number');
  });

  it('旧存档缺 _nextId 时 best-effort 推算（从 eventLog 最大 id）', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) engine.tick();
    const env = toWorldState(engine, 'reg');

    // 模拟旧存档：删除 _nextId 字段
    const oldArchive = JSON.parse(JSON.stringify(env));
    delete oldArchive.runtimeSnapshot.events._nextId;

    const restored = fromWorldState(oldArchive, {}, AndyEngine);
    const restoredNextId = restored.world.eventDispatcher._nextId;

    // best-effort: 从 eventLog 最大 evt_<n> 推算
    let maxN = -1;
    for (const evt of oldArchive.runtimeSnapshot.events.eventLog || []) {
      const m = /^evt_(\d+)$/.exec(evt.id || '');
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    const expected = maxN >= 0 ? maxN + 1 : 0;
    expect(restoredNextId, '旧存档应 best-effort 推算 _nextId').toBe(expected);
  });

  it('旧存档缺 _ticksSinceReflection 时 best-effort 默认 0', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) engine.tick();
    const env = toWorldState(engine, 'reg');

    // 模拟旧存档：删除计数器字段
    const oldArchive = JSON.parse(JSON.stringify(env));
    for (const id of Object.keys(oldArchive.runtimeSnapshot.agents || {})) {
      delete oldArchive.runtimeSnapshot.agents[id]._ticksSinceReflection;
      delete oldArchive.runtimeSnapshot.agents[id]._ticksSinceDriftCheck;
    }

    const restored = fromWorldState(oldArchive, {}, AndyEngine);
    const maya = restored.getAllAgents().find(a => a.id === 'maya');
    expect(maya._ticksSinceReflection, '旧存档缺字段应默认 0').toBe(0);
    expect(maya._ticksSinceDriftCheck, '旧存档缺字段应默认 0').toBe(0);
  });
});
