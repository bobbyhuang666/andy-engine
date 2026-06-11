/**
 * WorldStateAdapter 测试
 *
 * 验证 "Serialize → Adapter → Deserialize → Tick" 外围数据闭环。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import { toWorldState, fromWorldState } from '../world/WorldStateAdapter.js';
import { validateWorldState, CURRENT_SCHEMA_VERSION } from '../world/validator.js';

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function createTestEngine() {
  const engine = new AndyEngine({
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

// ═══════════════════════════════════════════
// toWorldState
// ═══════════════════════════════════════════

describe('WorldStateAdapter.toWorldState', () => {
  it('生成的 World State 通过 validateWorldState 验证', () => {
    const engine = createTestEngine();
    engine.tick();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_001');
    const result = validateWorldState(worldState);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('Stable Envelope 包含正确的公共字段', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_002');

    expect(worldState.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(worldState.worldId).toBe('world_test_002');
    expect(worldState.domainRef).toBe('campus');
    expect(worldState.worldClock).toBeDefined();
    expect(typeof worldState.worldClock.time).toBe('string');
    expect(typeof worldState.worldClock.tickCount).toBe('number');
  });

  it('characters 包含正确的公共字段', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_003');

    expect(Array.isArray(worldState.characters)).toBe(true);
    expect(worldState.characters.length).toBe(2);

    const maya = worldState.characters.find(c => c.id === 'maya');
    expect(maya).toBeDefined();
    expect(maya.name).toBe('Maya');
    expect(typeof maya.position).toBe('string');

    // 不包含内部状态
    expect(maya.personality).toBeUndefined();
    expect(maya.emotion).toBeUndefined();
  });

  it('relationships 包含正确的公共字段', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_004');

    expect(Array.isArray(worldState.relationships)).toBe(true);

    // 每条关系只包含公共字段
    for (const rel of worldState.relationships) {
      expect(typeof rel.from).toBe('string');
      expect(typeof rel.to).toBe('string');
      expect(typeof rel.type).toBe('string');
      expect(typeof rel.strength).toBe('number');

      // 不包含内部字段
      expect(rel.impression).toBeUndefined();
      expect(rel.history).toBeUndefined();
    }
  });

  it('events 包含正确的公共字段', () => {
    const engine = createTestEngine();
    engine.tick();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_005');

    expect(Array.isArray(worldState.events)).toBe(true);

    for (const evt of worldState.events) {
      expect(typeof evt.id).toBe('string');
      expect(typeof evt.time).toBe('string');
      expect(typeof evt.type).toBe('string');

      // 不包含内部字段
      expect(evt.effects).toBeUndefined();
      expect(evt.semanticCategory).toBeUndefined();
    }
  });

  it('runtimeSnapshot 是 object 类型的不透明载荷', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_006');

    expect(worldState.runtimeSnapshot).toBeDefined();
    expect(typeof worldState.runtimeSnapshot).toBe('object');
    expect(Array.isArray(worldState.runtimeSnapshot)).toBe(false);

    // 包含原始快照数据（但适配器不做深入断言）
    expect(worldState.runtimeSnapshot.agents).toBeDefined();
    expect(worldState.runtimeSnapshot.socialGraph).toBeDefined();
    expect(worldState.runtimeSnapshot.events).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// fromWorldState
// ═══════════════════════════════════════════

describe('WorldStateAdapter.fromWorldState', () => {
  it('恢复的引擎能继续执行 tick', () => {
    const engine = createTestEngine();
    engine.tick();
    engine.tick();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_101');
    const restoredEngine = fromWorldState(worldState);

    // 恢复后能继续执行 tick
    expect(() => {
      restoredEngine.tick();
      restoredEngine.tick();
    }).not.toThrow();
  });

  it('恢复后状态维持在合理区间', () => {
    const engine = createTestEngine();
    // 运行足够多的 tick 让状态稳定
    for (let i = 0; i < 10; i++) {
      engine.tick();
    }

    const worldState = toWorldState(engine, 'world_test_102');
    const restoredEngine = fromWorldState(worldState);

    // 恢复后继续运行
    for (let i = 0; i < 5; i++) {
      restoredEngine.tick();
    }

    // 验证基本状态合理
    const agents = restoredEngine.getAllAgents();
    for (const agent of agents) {
      expect(agent.health).toBeGreaterThan(0);
      expect(agent.health).toBeLessThanOrEqual(1);
      expect(agent.socialEnergy).toBeGreaterThanOrEqual(0);
      expect(agent.socialEnergy).toBeLessThanOrEqual(1);
      expect(agent.position).toBeDefined();
      expect(typeof agent.position).toBe('string');
    }
  });

  it('恢复后保留角色信息', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_103');
    const restoredEngine = fromWorldState(worldState);

    const maya = restoredEngine.getAgent('maya');
    expect(maya).toBeDefined();
    expect(maya.name).toBe('Maya');

    const alice = restoredEngine.getAgent('alice');
    expect(alice).toBeDefined();
    expect(alice.name).toBe('Alice');
  });

  it('恢复后保留世界时间', () => {
    const engine = createTestEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    const worldState = toWorldState(engine, 'world_test_104');
    const originalTime = worldState.worldClock.time;

    const restoredEngine = fromWorldState(worldState);
    const restoredTime = restoredEngine.world.time.toISOString();

    // 时间应该一致（允许毫秒级差异）
    expect(Math.abs(new Date(restoredTime) - new Date(originalTime))).toBeLessThan(1000);
  });

  it('完整闭环：Serialize → Deserialize → Tick → Serialize', () => {
    const engine = createTestEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    // 第一次序列化
    const state1 = toWorldState(engine, 'world_test_105');
    expect(validateWorldState(state1).valid).toBe(true);

    // 恢复
    const restored = fromWorldState(state1);

    // 继续运行
    for (let i = 0; i < 3; i++) restored.tick();

    // 第二次序列化
    const state2 = toWorldState(restored, 'world_test_105');
    expect(validateWorldState(state2).valid).toBe(true);

    // 第二次序列化的 tickCount 应该更大
    expect(state2.worldClock.tickCount).toBeGreaterThan(state1.worldClock.tickCount);
  });
});

// ═══════════════════════════════════════════
// 边界情况
// ═══════════════════════════════════════════

describe('WorldStateAdapter 边界情况', () => {
  it('没有角色的引擎也能正确序列化/恢复', () => {
    const engine = new AndyEngine({
      startTime: new Date('2026-09-01T08:00:00Z'),
    });
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_201');
    expect(validateWorldState(worldState).valid).toBe(true);
    expect(worldState.characters).toHaveLength(0);

    const restored = fromWorldState(worldState);
    expect(() => restored.tick()).not.toThrow();
    expect(restored.getAllAgents()).toHaveLength(0);
  });

  it('runtimeSnapshot 内部结构适配器不深入断言', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_202');

    // runtimeSnapshot 是 Opaque Payload，适配器只检查类型
    expect(typeof worldState.runtimeSnapshot).toBe('object');

    // 内部结构由 Runtime 决定，适配器不做断言
    // 这里只验证它确实是原始快照
    expect(worldState.runtimeSnapshot.time).toBeDefined();
    expect(worldState.runtimeSnapshot.tickCount).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// 恢复安全性
// ═══════════════════════════════════════════

describe('WorldStateAdapter 恢复安全性', () => {
  it('拒绝 domainConfig.id 与 worldState.domainRef 不匹配的恢复', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_301');
    const fakeDomain = { id: 'tavern' };

    expect(() => {
      fromWorldState(worldState, { domain: fakeDomain });
    }).toThrow(/不匹配/);
  });

  it('拒绝未提供 domainConfig 且 domainRef 非 campus 的恢复', () => {
    const worldState = {
      schemaVersion: '0.1.0',
      worldId: 'world_custom',
      domainRef: 'tavern',
      worldClock: { time: '2026-09-15T14:30:00Z', tickCount: 0 },
      characters: [],
      relationships: [],
      events: [],
      runtimeSnapshot: {
        time: '2026-09-15T14:30:00Z',
        tickCount: 0,
        environment: { weather: 'sunny', timeOfDay: 'afternoon', season: 'autumn' },
        agents: {},
        socialGraph: [],
        events: { eventLog: [] },
      },
    };

    expect(() => {
      fromWorldState(worldState);
    }).toThrow(/必须在 config.domain 中传入/);
  });

  it('campus domain 恢复无需显式传入 domainConfig', () => {
    const engine = createTestEngine();
    engine.tick();

    const worldState = toWorldState(engine, 'world_test_303');

    expect(() => {
      fromWorldState(worldState);
    }).not.toThrow();
  });
});
