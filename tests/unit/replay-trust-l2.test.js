/**
 * L2 Replay Trust — 多 seed 跨 run 一致性 (REPLAY_TRUST_ROADMAP §7)
 *
 * L2 语义：3 个不同 seed 各自跨 run 稳定（非 seed 间产出相同——不同 seed 产出不同轨迹，
 * 但同 seed 跨 run 必须一致）。组合证明 seed 参数化下回放稳定。
 *
 * 配置与 golden-seed-replay.test.js 一致（startTime/角色/ticks），仅 seed 参数化。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { toWorldState } from '../../store/index.js';
const { computeTickHash } = require('../../src/store/world/tickHash');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const TICKS = 100;
const SEEDS = [42, 7, 100];

function buildSeededEngine(seed) {
  const engine = new AndyEngine({ seed, startTime: START_TIME });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return engine;
}

function runReplayHashes(seed) {
  const engine = buildSeededEngine(seed);
  const hashes = [];
  for (let i = 0; i < TICKS; i++) {
    engine.tick();
    const envelope = toWorldState(engine, `l2-seed${seed}`);
    hashes.push(computeTickHash(envelope, i).hash);
  }
  return hashes;
}

describe('L2 Replay Trust — 多 seed 跨 run 一致性', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: 两次 run 的 per-tick hash 序列完全一致`, () => {
      const run1 = runReplayHashes(seed);
      const run2 = runReplayHashes(seed);
      expect(run1).toEqual(run2);
      expect(run1.length).toBe(TICKS);
    });
  }

  it('3 个 seed 之间产出的 hash 序列不全等（证明 seed 参数化生效）', () => {
    const h42 = runReplayHashes(42);
    const h7 = runReplayHashes(7);
    const h100 = runReplayHashes(100);
    // 任一两 seed 不应产出相同序列（否则 seed 无意义）
    expect(h42).not.toEqual(h7);
    expect(h42).not.toEqual(h100);
    expect(h7).not.toEqual(h100);
  });

  it('各 seed 序列长度均为 TICKS', () => {
    for (const seed of SEEDS) {
      expect(runReplayHashes(seed).length).toBe(TICKS);
    }
  });
});
