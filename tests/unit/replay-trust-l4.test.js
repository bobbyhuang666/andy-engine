/**
 * L4 Replay Trust — 截断续跑一致性 (REPLAY_TRUST_ROADMAP §7)
 *
 * L4 语义：从 tick N 的快照续跑到 tick M，与全程回放的 tick M hash 一致。
 * 证明世界可持续（停服续跑不丢演化）。
 *
 * 触及 Stable World Envelope 边界：若 restore 有损，停下排查；
 * 若需改 schema/restore 语义回总规划师（W6 任务卡 §5）。
 *
 * ── W6 实测结论（2026-06-26）：L4 降级 v2.2，根因已定位 ──
 *
 * 实测：续跑段 tick 50-62 hash 一致，tick 63 起漂移。根因：
 *   toWorldState() 序列化丢失累积 memory。
 *   tick 50 时 maya 运行时有 18 条 memory，但 envelope.runtimeSnapshot
 *   .agents.maya.memory.memories 为空数组（[]）。restore 自然无法还原
 *   未序列化的 memory，续跑后 memory 驱动的行为逐步偏离全程回放。
 *
 * 这是 Stable World Envelope 的序列化缺陷，触及边界。
 * 按 W6 任务卡 §5：不强行改 schema/测试掩盖，L4 降级 v2.2，回总规划师
 * 裁定是否在后续波次修复 toWorldState 序列化（需触碰 Stable Envelope）。
 *
 * 测试保留为 skip，记录诊断证据，待修复后取消 skip 验证。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { toWorldState, fromWorldState } from '../../store/index.js';
const { computeTickHash } = require('../../src/store/world/tickHash');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 100;
const RESUME_AT = 50; // 截断点

function buildSeededEngine(seed = SEED) {
  const engine = new AndyEngine({ seed, startTime: START_TIME });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return engine;
}

describe.skip('L4 Replay Trust — 截断续跑一致性 (W6: 降级 v2.2, toWorldState 丢失累积 memory)', () => {
  // ── 以下测试因 Stable Envelope 序列化缺陷 skip，详见文件头 W6 实测结论 ──

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

// ── W6 诊断证据测试（不 skip，证明根因，待修复后会失败促使取消 skip）──
describe('W6 诊断: toWorldState 序列化丢失累积 memory (L4 阻塞根因)', () => {
  it('tick 50 运行时 memory 数 > 0，但 envelope 序列化后 memory.memories 为空', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < RESUME_AT; i++) engine.tick();

    const agent = engine.getAllAgents().find(a => a.id === 'maya');
    const runtimeMemCount = agent.memory.memories.length;

    const env = toWorldState(engine, 'l4-diag');
    const snapMemCount = (env.runtimeSnapshot?.agents?.maya?.memory?.memories || []).length;

    // 记录根因：运行时有累积 memory，序列化丢失
    expect(runtimeMemCount, 'tick 50 运行时应已有累积 memory').toBeGreaterThan(0);
    // 当前缺陷：envelope 序列化后 memory.memories 为空
    // 修复后此断言会 fail，提示取消 L4 主测试的 skip
    expect(snapMemCount, 'envelope 应序列化累积 memory（当前缺陷：为空）').toBe(0);
  });
});

