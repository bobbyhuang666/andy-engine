/**
 * Seedable Simulation 测试
 *
 * 验证核心随机源路由后的种子级可复现性与发散性。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function createSeededEngine(seed) {
  const engine = new AndyEngine({
    seed,
    startTime: new Date('2026-09-01T08:00:00Z'),
    weather: 'sunny',
  });

  engine.createCharacter({
    id: 'maya',
    name: 'Maya',
    mbti: 'INFP',
    background: ['安静的图书馆管理员', '喜欢看星星'],
    schedule: 'student',
  });

  engine.createCharacter({
    id: 'alice',
    name: 'Alice',
    mbti: 'ENFP',
    background: ['活泼的社交达人'],
    schedule: 'student',
  });

  return engine;
}

function collectTrajectory(engine, ticks) {
  const trajectory = {
    maya: [],
    alice: [],
    events: [],
  };

  for (let i = 0; i < ticks; i++) {
    const result = engine.tick();
    const maya = engine.getAgent('maya');
    const alice = engine.getAgent('alice');

    trajectory.maya.push([...maya.behaviorField.B]);
    trajectory.alice.push([...alice.behaviorField.B]);

    // 收集事件类型
    if (result.phase && result.phase.eventDispatch) {
      trajectory.events.push(result.phase.eventDispatch.eventCount);
    }
  }

  return trajectory;
}

// ═══════════════════════════════════════════
// 相同种子轨迹可重复性
// ═══════════════════════════════════════════

describe('相同种子轨迹可重复性', () => {
  it('相同 seed 产生完全一致的 B 轨迹', () => {
    const engine1 = createSeededEngine('stable_run_123');
    const engine2 = createSeededEngine('stable_run_123');

    const traj1 = collectTrajectory(engine1, 50);
    const traj2 = collectTrajectory(engine2, 50);

    // maya 的 B 轨迹完全一致
    for (let i = 0; i < 50; i++) {
      for (let d = 0; d < 4; d++) {
        expect(traj1.maya[i][d]).toBe(traj2.maya[i][d]);
      }
    }

    // alice 的 B 轨迹完全一致
    for (let i = 0; i < 50; i++) {
      for (let d = 0; d < 4; d++) {
        expect(traj1.alice[i][d]).toBe(traj2.alice[i][d]);
      }
    }
  });

  it('相同 seed 产生完全一致的事件数量序列', () => {
    const engine1 = createSeededEngine('events_test_456');
    const engine2 = createSeededEngine('events_test_456');

    const traj1 = collectTrajectory(engine1, 50);
    const traj2 = collectTrajectory(engine2, 50);

    for (let i = 0; i < traj1.events.length; i++) {
      expect(traj1.events[i]).toBe(traj2.events[i]);
    }
  });

  it('相同 seed 产生一致的情绪效价轨迹', () => {
    const engine1 = createSeededEngine('emotion_test_789');
    const engine2 = createSeededEngine('emotion_test_789');

    const valences1 = [];
    const valences2 = [];

    for (let i = 0; i < 50; i++) {
      engine1.tick();
      engine2.tick();
      valences1.push(engine1.getAgent('maya').emotion.getValence());
      valences2.push(engine2.getAgent('maya').emotion.getValence());
    }

    for (let i = 0; i < 50; i++) {
      expect(valences1[i]).toBe(valences2[i]);
    }
  });

  it('相同 seed 产生一致的健康值轨迹', () => {
    const engine1 = createSeededEngine('health_test_101');
    const engine2 = createSeededEngine('health_test_101');

    const health1 = [];
    const health2 = [];

    for (let i = 0; i < 50; i++) {
      engine1.tick();
      engine2.tick();
      health1.push(engine1.getAgent('maya').health);
      health2.push(engine2.getAgent('maya').health);
    }

    for (let i = 0; i < 50; i++) {
      expect(health1[i]).toBe(health2[i]);
    }
  });
});

// ═══════════════════════════════════════════
// 不同种子轨迹发散性
// ═══════════════════════════════════════════

describe('不同种子轨迹发散性', () => {
  it('不同 seed 产生不同的 B 轨迹', () => {
    const engine1 = createSeededEngine('seed_alpha');
    const engine2 = createSeededEngine('seed_omega');

    const traj1 = collectTrajectory(engine1, 50);
    const traj2 = collectTrajectory(engine2, 50);

    // 至少有一个 tick 的 B 距离 > 0
    let maxDistance = 0;
    for (let i = 0; i < 50; i++) {
      let dist = 0;
      for (let d = 0; d < 4; d++) {
        dist += Math.abs(traj1.maya[i][d] - traj2.maya[i][d]);
      }
      maxDistance = Math.max(maxDistance, dist);
    }

    expect(maxDistance).toBeGreaterThan(0);
  });

  it('不同 seed 产生不同的事件序列', () => {
    const engine1 = createSeededEngine('events_alpha');
    const engine2 = createSeededEngine('events_omega');

    const traj1 = collectTrajectory(engine1, 50);
    const traj2 = collectTrajectory(engine2, 50);

    // 事件数量序列不应完全一致
    let sameCount = 0;
    for (let i = 0; i < traj1.events.length; i++) {
      if (traj1.events[i] === traj2.events[i]) sameCount++;
    }

    // 不应全部相同（允许部分偶然相同）
    expect(sameCount).toBeLessThan(50);
  });
});

// ═══════════════════════════════════════════
// 向后兼容性
// ═══════════════════════════════════════════

describe('向后兼容性', () => {
  it('无 seed 时引擎正常 tick', () => {
    const engine = new AndyEngine({
      startTime: new Date('2026-09-01T08:00:00Z'),
    });

    engine.createCharacter({
      id: 'maya',
      name: 'Maya',
      mbti: 'INFP',
      schedule: 'student',
    });

    expect(() => {
      for (let i = 0; i < 20; i++) engine.tick();
    }).not.toThrow();
  });

  it('无 seed 时 agent.rng 为 null', () => {
    const engine = new AndyEngine({
      startTime: new Date('2026-09-01T08:00:00Z'),
    });

    engine.createCharacter({
      id: 'maya',
      name: 'Maya',
      mbti: 'INFP',
      schedule: 'student',
    });

    const agent = engine.getAgent('maya');
    expect(agent._rng).toBeNull();
  });

  it('有 seed 时 agent.rng 被挂载', () => {
    const engine = createSeededEngine('test_rng_mount');

    const agent = engine.getAgent('maya');
    expect(agent._rng).not.toBeNull();
    expect(agent._rng).toBeDefined();
  });

  it('seed 注入不影响行为场数值稳定性', () => {
    const engine = createSeededEngine('stability_check');

    for (let i = 0; i < 100; i++) engine.tick();

    for (const id of ['maya', 'alice']) {
      const agent = engine.getAgent(id);
      const B = agent.behaviorField.B;

      for (let d = 0; d < 4; d++) {
        expect(B[d]).toBeGreaterThanOrEqual(0);
        expect(B[d]).toBeLessThanOrEqual(1);
      }

      expect(agent.health).toBeGreaterThan(0);
      expect(agent.health).toBeLessThanOrEqual(1);
      expect(agent.socialEnergy).toBeGreaterThanOrEqual(0);
      expect(agent.socialEnergy).toBeLessThanOrEqual(1);
    }
  });
});
