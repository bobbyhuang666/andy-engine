/**
 * Deterministic Replay 测试 (RFC RNG_STRICTNESS — Wave 2)
 *
 * 验证核心不变量：核心模拟路径的所有随机源均路由到注入的 seeded RNG，
 * 故「同 seed → 同模拟轨迹」。配套验证「无 seed 仍可初始化并 tick」。
 *
 * 见 docs/rfc/RNG_STRICTNESS_RFC.md §5 Test Plan。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

const START_TIME = new Date('2026-09-01T08:00:00Z');

function buildSeededEngine(seed) {
  const engine = new AndyEngine({ seed, startTime: START_TIME });
  engine.createCharacter({
    id: 'maya',
    name: 'Maya',
    mbti: 'INFP',
    schedule: 'student',
  });
  engine.createCharacter({
    id: 'leo',
    name: 'Leo',
    mbti: 'ESTP',
    schedule: 'student',
  });
  return engine;
}

function snapshotAgent(agent) {
  return {
    position: agent.position,
    valence: agent.emotion.getValence(),
    drive: agent.needs.getDrive(),
    health: agent.health,
    socialEnergy: agent.socialEnergy,
  };
}

function snapshotEngine(engine) {
  // 按 id 排序保证两个引擎的 agent 顺序一致
  return engine
    .getAllAgents()
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map(snapshotAgent);
}

describe('Deterministic Replay (RFC RNG_STRICTNESS Wave 2)', () => {
  it('same seed → identical agent states after 100 ticks', () => {
    const engine1 = buildSeededEngine(42);
    const engine2 = buildSeededEngine(42);

    for (let i = 0; i < 100; i++) {
      engine1.tick();
      engine2.tick();
    }

    const snap1 = snapshotEngine(engine1);
    const snap2 = snapshotEngine(engine2);

    expect(snap1).toHaveLength(snap2.length);
    for (let i = 0; i < snap1.length; i++) {
      expect(snap1[i].position).toEqual(snap2[i].position);
      expect(snap1[i].valence).toBe(snap2[i].valence);
      expect(snap1[i].drive).toEqual(snap2[i].drive);
      expect(snap1[i].health).toBe(snap2[i].health);
      expect(snap1[i].socialEnergy).toBe(snap2[i].socialEnergy);
    }
  });

  it('same seed → identical trajectory at a mid-run checkpoint', () => {
    const engine1 = buildSeededEngine(7);
    const engine2 = buildSeededEngine(7);

    for (let i = 0; i < 50; i++) {
      engine1.tick();
      engine2.tick();
    }
    expect(snapshotEngine(engine1)).toEqual(snapshotEngine(engine2));

    // 继续跑完，验证 RNG 流连续推进下仍一致
    for (let i = 0; i < 50; i++) {
      engine1.tick();
      engine2.tick();
    }
    expect(snapshotEngine(engine1)).toEqual(snapshotEngine(engine2));
  });

  it('no seed → still initializes and ticks without crashing', () => {
    const engine = new AndyEngine({ startTime: START_TIME });
    engine.createCharacter({
      id: 'maya',
      name: 'Maya',
      mbti: 'INFP',
      schedule: 'student',
    });

    // world 恒持 RNG（unseeded mode 内部自动种子），核心路径不再回退 Math.random
    expect(engine.world.rng).not.toBeNull();
    expect(typeof engine.world.rng.next).toBe('function');

    expect(() => {
      for (let i = 0; i < 10; i++) engine.tick();
    }).not.toThrow();
  });
});
