/**
 * RNG 注入测试
 *
 * 验证 core/RNG.js 的数值确定性与 AndyEngine/AndyWorld 的注入机制。
 */

import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG.js';
import AndyEngine from '../index.js';

// ═══════════════════════════════════════════
// core/RNG.js 确定性测试
// ═══════════════════════════════════════════

describe('RNG 数值确定性', () => {
  it('相同 seed 产生完全一致的序列', () => {
    const rng1 = new RNG(42);
    const rng2 = new RNG(42);

    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('不同 seed 产生不同序列', () => {
    const rng1 = new RNG(42);
    const rng2 = new RNG(99);

    let sameCount = 0;
    for (let i = 0; i < 100; i++) {
      if (rng1.next() === rng2.next()) sameCount++;
    }
    // 相同值不应超过 2 个（概率极低）
    expect(sameCount).toBeLessThan(3);
  });

  it('字符串 seed 也能产生确定性序列', () => {
    const rng1 = new RNG('hello');
    const rng2 = new RNG('hello');

    for (let i = 0; i < 50; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('不同字符串 seed 产生不同序列', () => {
    const rng1 = new RNG('hello');
    const rng2 = new RNG('world');

    let sameCount = 0;
    for (let i = 0; i < 100; i++) {
      if (rng1.next() === rng2.next()) sameCount++;
    }
    expect(sameCount).toBeLessThan(3);
  });

  it('next() 返回值在 (0, 1) 范围内', () => {
    const rng = new RNG(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(min, max) 返回 [min, max) 范围内的整数', () => {
    const rng = new RNG(456);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextFloat(min, max) 返回 [min, max] 范围内的浮点数', () => {
    const rng = new RNG(789);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat(2.5, 7.5);
      expect(v).toBeGreaterThanOrEqual(2.5);
      expect(v).toBeLessThanOrEqual(7.5);
    }
  });

  it('clone() 产生独立的 RNG 实例', () => {
    const rng1 = new RNG(42);
    rng1.next(); // 推进一步
    rng1.next();

    const rng2 = rng1.clone();

    // 克隆后序列一致
    for (let i = 0; i < 50; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('clone() 不影响原实例', () => {
    const rng1 = new RNG(42);
    // 记录 rng1 的前两个值
    const v1 = rng1.next();
    const v2 = rng1.next();

    // 克隆后，rng2 从 rng1 当前状态开始
    const rng2 = rng1.clone();
    const v3 = rng2.next();

    // rng1 不受 rng2 操作影响——rng1 的下一个值应等于 rng2 克隆前的下一个值
    // 因为 clone 时状态相同，rng2.next() 就是 rng1 本该产生的下一个值
    const v4 = rng1.next();
    expect(v4).toBe(v3);

    // 创建一个全新的 rng3，推进到和 rng1 克隆前相同的位置
    const rng3 = new RNG(42);
    rng3.next(); // = v1
    rng3.next(); // = v2
    // rng3.next() 应等于 v3 和 v4（相同的第 3 个值）
    expect(rng3.next()).toBe(v3);
  });

  it('getState/setState 支持状态保存恢复', () => {
    const rng1 = new RNG(42);
    for (let i = 0; i < 10; i++) rng1.next();

    const state = rng1.getState();
    const rng2 = new RNG(0);
    rng2.setState(state);

    for (let i = 0; i < 50; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('fromSeed 工厂方法等价于构造函数', () => {
    const rng1 = new RNG(42);
    const rng2 = RNG.fromSeed(42);

    for (let i = 0; i < 50; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });
});

// ═══════════════════════════════════════════
// AndyEngine & World RNG 注入测试
// ═══════════════════════════════════════════

describe('AndyEngine RNG 注入', () => {
  it('提供 seed 后 engine.rng 和 world.rng 均被挂载', () => {
    const engine = new AndyEngine({ seed: 'test-seed' });

    expect(engine.rng).toBeDefined();
    expect(engine.rng).not.toBeNull();
    expect(engine.world.rng).toBeDefined();
    expect(engine.world.rng).not.toBeNull();
    expect(engine.rng).toBe(engine.world.rng);
  });

  it('提供 rng 实例后直接挂载', () => {
    const rng = new RNG('custom');
    const engine = new AndyEngine({ rng });

    expect(engine.rng).toBe(rng);
    expect(engine.world.rng).toBe(rng);
  });

  it('不提供 seed 时 rng 为 null', () => {
    const engine = new AndyEngine();

    expect(engine.rng).toBeNull();
    expect(engine.world.rng).toBeNull();
  });

  it('相同 seed 产生相同的 RNG 序列', () => {
    const engine1 = new AndyEngine({ seed: 42 });
    const engine2 = new AndyEngine({ seed: 42 });

    for (let i = 0; i < 50; i++) {
      expect(engine1.rng.next()).toBe(engine2.rng.next());
    }
  });

  it('有 seed 的引擎能正常执行 tick', () => {
    const engine = new AndyEngine({
      seed: 'deterministic',
      startTime: new Date('2026-09-01T08:00:00Z'),
    });

    engine.createCharacter({
      id: 'maya',
      name: 'Maya',
      mbti: 'INFP',
      schedule: 'student',
    });

    expect(() => {
      engine.tick();
      engine.tick();
      engine.tick();
    }).not.toThrow();
  });

  it('无 seed 的引擎也能正常执行 tick（回退 Math.random）', () => {
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
      engine.tick();
      engine.tick();
    }).not.toThrow();
  });

  it('seed 注入不影响现有行为场数值稳定性', () => {
    const engine = new AndyEngine({
      seed: 'stability-test',
      startTime: new Date('2026-09-01T08:00:00Z'),
    });

    engine.createCharacter({
      id: 'maya',
      name: 'Maya',
      mbti: 'INFP',
      schedule: 'student',
    });

    for (let i = 0; i < 50; i++) engine.tick();

    const agent = engine.getAgent('maya');
    const B = agent.behaviorField.B;

    // B 向量应在 [0, 1] 范围内
    for (let d = 0; d < 4; d++) {
      expect(B[d]).toBeGreaterThanOrEqual(0);
      expect(B[d]).toBeLessThanOrEqual(1);
    }

    // 健康和社交能量应在合理范围
    expect(agent.health).toBeGreaterThan(0);
    expect(agent.health).toBeLessThanOrEqual(1);
    expect(agent.socialEnergy).toBeGreaterThanOrEqual(0);
    expect(agent.socialEnergy).toBeLessThanOrEqual(1);
  });
});
