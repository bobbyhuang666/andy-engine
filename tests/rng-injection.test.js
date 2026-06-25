/**
 * RNG 注入测试
 *
 * 验证 src/shared/rng.js 的数值确定性与 AndyEngine/AndyWorld 的注入机制。
 */

import { describe, it, expect } from 'vitest';
import { RNG } from '../src/shared/rng.js';
import AndyEngine from '../index.js';

// ═══════════════════════════════════════════
// src/shared/rng.js 确定性测试
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

  it('不提供 seed 时 world 恒持自动种子 RNG', () => {
    const engine = new AndyEngine();

    // facade 仍可选注入：未提供 seed 时 engine.rng 为 null（向后兼容，不变）
    expect(engine.rng).toBeNull();
    // 但 world 恒持 RNG（RFC RNG_STRICTNESS：unseeded mode 内部自动种子）
    // （ESM/CJS 双模块下 toBeInstanceOf 不可靠，改用 duck-type）
    expect(engine.world.rng).not.toBeNull();
    expect(typeof engine.world.rng.next).toBe('function');
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

// ═══════════════════════════════════════════
// RNG Trace Helper 测试
// ═══════════════════════════════════════════

describe('RNG traceDraw', () => {
  it('记录 before/draw/after 三个状态', () => {
    const rng = new RNG(42);
    const result = rng.traceDraw();

    expect(result.rngStateBefore).toBeDefined();
    expect(result.randomDraw).toBeDefined();
    expect(result.rngStateAfter).toBeDefined();
    expect(result.value).toBeDefined();
  });

  it('rngStateBefore 与调用前 getState() 一致', () => {
    const rng = new RNG(42);
    const stateBefore = rng.getState();
    const result = rng.traceDraw();

    expect(result.rngStateBefore).toBe(stateBefore);
  });

  it('rngStateAfter 与调用后 getState() 一致', () => {
    const rng = new RNG(42);
    rng.traceDraw();
    const stateAfter = rng.getState();
    const result = rng.traceDraw();

    // 第二次 traceDraw 的 before 应等于第一次的 after
    expect(result.rngStateBefore).toBe(stateAfter);
  });

  it('相同 seed 产生完全相同的 traceDraw 序列', () => {
    const rng1 = new RNG(42);
    const rng2 = new RNG(42);

    for (let i = 0; i < 20; i++) {
      const t1 = rng1.traceDraw();
      const t2 = rng2.traceDraw();

      expect(t1.value).toBe(t2.value);
      expect(t1.rngStateBefore).toBe(t2.rngStateBefore);
      expect(t1.randomDraw).toBe(t2.randomDraw);
      expect(t1.rngStateAfter).toBe(t2.rngStateAfter);
    }
  });

  it('traceDraw 支持 min/max 范围', () => {
    const rng = new RNG(42);
    const result = rng.traceDraw(5, 10);

    expect(result.value).toBeGreaterThanOrEqual(5);
    expect(result.value).toBeLessThan(10);
  });

  it('traceDraw 不影响 next() 序列连续性', () => {
    const rng1 = new RNG(42);
    const rng2 = new RNG(42);

    // rng1: next, next, next
    const a = rng1.next();
    const b = rng1.next();
    const c = rng1.next();

    // rng2: traceDraw, traceDraw, traceDraw (same sequence)
    const t1 = rng2.traceDraw();
    const t2 = rng2.traceDraw();
    const t3 = rng2.traceDraw();

    expect(t1.value).toBe(a);
    expect(t2.value).toBe(b);
    expect(t3.value).toBe(c);
  });
});

// ═══════════════════════════════════════════
// RNG Snapshot/Restore 测试
// ═══════════════════════════════════════════

describe('RNG Snapshot/Restore', () => {
  it('toJSON 包含 rngState', () => {
    const engine = new AndyEngine({
      seed: 'snapshot-test',
      startTime: new Date('2026-09-01T08:00:00Z'),
    });

    engine.createCharacter({
      id: 'maya',
      name: 'Maya',
      mbti: 'INFP',
      schedule: 'student',
    });

    engine.tick();
    const json = engine.toJSON();

    expect(json.rngState).toBeDefined();
    expect(typeof json.rngState).toBe('number');
  });

  it('fromJSON 恢复 RNG 状态后序列一致', () => {
    const engine1 = new AndyEngine({
      seed: 'restore-test',
      startTime: new Date('2026-09-01T08:00:00Z'),
    });

    engine1.createCharacter({
      id: 'maya',
      name: 'Maya',
      mbti: 'INFP',
      schedule: 'student',
    });

    // 运行几步
    for (let i = 0; i < 5; i++) engine1.tick();

    // 保存
    const json = engine1.toJSON();
    const rngStateAtSave = json.rngState;

    // 恢复
    const engine2 = AndyEngine.fromJSON(json);

    // 恢复后的 RNG 状态应一致
    expect(engine2.rng.getState()).toBe(rngStateAtSave);

    // 继续生成序列应一致
    const rng1Continued = engine1.rng.next();
    const rng2Continued = engine2.rng.next();
    expect(rng1Continued).toBe(rng2Continued);
  });

  it('无 seed 时 toJSON 仍包含 rngState（world 恒持 RNG）', () => {
    const engine = new AndyEngine({
      startTime: new Date('2026-09-01T08:00:00Z'),
    });

    const json = engine.toJSON();
    // world 恒持 RNG（unseeded 自动种子），故 rngState 恒存在
    expect(json.rngState).toBeDefined();
  });
});
