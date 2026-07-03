/**
 * WorldFactStore 模块测试套件
 *
 * 验证：
 *   - 事实的增删查改
 *   - 按类型查询
 *   - 按角色视角查询
 *   - 按时间查询
 *   - EventFact 的 append-only 约束
 *   - RelationshipFact 的 previousType 保留
 *   - AgentStateFact 的覆盖语义
 *   - 持久化（toJSON / fromJSON）
 *   - 统计信息
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldFactStore } from '../../facts/index.js';
import {
  FactType,
  FactSource,
  FactScope,
  createStaticEnvFact,
  createAgentStateFact,
  createRelationshipFact,
  createEventFact,
  createObservationFact,
  createMemoryFact,
} from '../../src/canon/FactSchema.js';

// ═══════════════════════════════════════════
// 辅助工厂
// ═══════════════════════════════════════════

function makeEvent(overrides = {}) {
  return createEventFact({
    eventId: `evt_${Date.now()}_${Math.random()}`,
    description: '测试事件',
    ...overrides,
  });
}

function makeAgentState(overrides = {}) {
  return createAgentStateFact({
    agentId: 'alice',
    state: '看书',
    ...overrides,
  });
}

function makeRelationship(overrides = {}) {
  return createRelationshipFact({
    agentA: 'alice',
    agentB: 'bob',
    relationType: '朋友',
    strength: 0.5,
    ...overrides,
  });
}

function makeObservation(overrides = {}) {
  return createObservationFact({
    observerId: 'alice',
    targetId: 'bob',
    action: '在跑步',
    ...overrides,
  });
}

function makeMemory(overrides = {}) {
  return createMemoryFact({
    agentId: 'alice',
    content: '今天很开心',
    ...overrides,
  });
}

function makeStaticEnv(overrides = {}) {
  return createStaticEnvFact({
    area: '图书馆',
    object: '书架',
    ...overrides,
  });
}

// ═══════════════════════════════════════════
// 基础 CRUD
// ═══════════════════════════════════════════

describe('WorldFactStore - 基础 CRUD', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  it('初始状态应该为空', () => {
    expect(store.size).toBe(0);
    expect(store.getAllFacts()).toEqual([]);
  });

  it('addFact 应该返回带 id 的事实', () => {
    const fact = makeEvent();
    const added = store.addFact(fact);
    expect(added.id).toBeTruthy();
    expect(store.size).toBe(1);
  });

  it('addFact 应该自动生成确定性 ID', () => {
    const f1 = store.addFact(makeEvent());
    const f2 = store.addFact(makeEvent());
    expect(f1.id).not.toBe(f2.id);
    expect(f1.id).toMatch(/^fact_engine_/);
  });

  it('addFacts 应该批量添加', () => {
    const facts = [makeEvent(), makeEvent(), makeEvent()];
    const added = store.addFacts(facts);
    expect(added).toHaveLength(3);
    expect(store.size).toBe(3);
  });

  it('addFact 应该拒绝无效事实', () => {
    expect(() => store.addFact({})).toThrow();
  });

  it('removeFact 应该删除事实', () => {
    const f = store.addFact(makeMemory());
    expect(store.size).toBe(1);
    const removed = store.removeFact(f.id);
    expect(removed).toBe(true);
    expect(store.size).toBe(0);
  });

  it('removeFact 应该清理空的 agent 索引', () => {
    const f = store.addFact(makeMemory({ agentId: 'alice' }));
    expect(store.getStats().agentCount).toBe(1);

    store.removeFact(f.id);

    expect(store.getStats().agentCount).toBe(0);
  });

  it('removeFact 对不存在的 id 返回 false', () => {
    expect(store.removeFact('nonexistent')).toBe(false);
  });

  it('getFactById 应该返回事实', () => {
    const f = store.addFact(makeEvent());
    expect(store.getFactById(f.id)).toEqual(f);
  });

  it('getFactById 对不存在的 id 返回 null', () => {
    expect(store.getFactById('nonexistent')).toBeNull();
  });
});

// ═══════════════════════════════════════════
// 按类型查询
// ═══════════════════════════════════════════

describe('WorldFactStore - 按类型查询', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
    store.addFact(makeStaticEnv());
    store.addFact(makeAgentState());
    store.addFact(makeRelationship());
    store.addFact(makeEvent());
    store.addFact(makeObservation());
    store.addFact(makeMemory());
  });

  it('getStaticFacts 应该返回静态环境事实', () => {
    const facts = store.getStaticFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].type).toBe(FactType.STATIC_ENV);
  });

  it('getAgentStateFacts 应该返回角色状态事实', () => {
    const facts = store.getAgentStateFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].type).toBe(FactType.AGENT_STATE);
  });

  it('getRelationshipFacts 应该返回关系事实', () => {
    const facts = store.getRelationshipFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].type).toBe(FactType.RELATIONSHIP);
  });

  it('getEventFacts 应该返回事件事实', () => {
    const facts = store.getEventFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].type).toBe(FactType.EVENT);
  });

  it('getObservationFacts 应该返回观察事实', () => {
    const facts = store.getObservationFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].type).toBe(FactType.OBSERVATION);
  });

  it('getMemoryFacts 应该返回记忆事实', () => {
    const facts = store.getMemoryFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].type).toBe(FactType.MEMORY);
  });

  it('getAllFacts(types) 应该支持多类型过滤', () => {
    const facts = store.getAllFacts([FactType.EVENT, FactType.MEMORY]);
    expect(facts).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════
// EventFact 的 append-only 约束
// ═══════════════════════════════════════════

describe('WorldFactStore - EventFact append-only', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  it('相同 eventId 不能添加两次', () => {
    store.addFact(createEventFact({ eventId: 'evt_001', description: '事件A' }));
    expect(() => {
      store.addFact(createEventFact({ eventId: 'evt_001', description: '事件B' }));
    }).toThrow(/append-only/);
  });

  it('不同 eventId 可以添加', () => {
    store.addFact(createEventFact({ eventId: 'evt_001', description: '事件A' }));
    store.addFact(createEventFact({ eventId: 'evt_002', description: '事件B' }));
    expect(store.getEventFacts()).toHaveLength(2);
  });

  it('EventFact 不能更新', () => {
    const f = store.addFact(createEventFact({ eventId: 'evt_001', description: '事件A' }));
    expect(() => store.updateFact(f.id, { description: '修改' })).toThrow(/immutable/);
  });

  it('EventFact 不能删除', () => {
    const f = store.addFact(createEventFact({ eventId: 'evt_001', description: '事件A' }));
    expect(() => store.removeFact(f.id)).toThrow(/append-only/);
  });
});

// ═══════════════════════════════════════════
// MemoryFact 可更新
// ═══════════════════════════════════════════

describe('WorldFactStore - MemoryFact 可更新', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  it('MemoryFact 可以更新内容', () => {
    const f = store.addFact(makeMemory({ content: '原始记忆' }));
    const updated = store.updateFact(f.id, { content: '更新后的记忆', importance: 0.9 });
    expect(updated.content).toBe('更新后的记忆');
    expect(updated.importance).toBe(0.9);
  });
});

describe('WorldFactStore - high-volume fact eviction', () => {
  it('bounds observation facts and purges evicted knowledge entries', () => {
    const store = new WorldFactStore();
    const purged = [];
    store.setKnowledgeStore({
      purgeEvictedFacts(ids) {
        purged.push(...ids);
      },
    });

    let firstId;
    let lastId;
    for (let i = 0; i < 2001; i++) {
      const added = store.addFact(makeObservation({
        action: `obs-${i}`,
        timestamp: new Date(1000 + i),
      }));
      if (i === 0) firstId = added.id;
      if (i === 2000) lastId = added.id;
    }

    const observations = store.getObservationFacts();
    expect(observations.length).toBeLessThanOrEqual(2000);
    expect(store.getFactById(firstId)).toBeNull();
    expect(store.getFactById(lastId)).not.toBeNull();
    expect(purged).toContain(firstId);
  });

  it('bounds memory facts and keeps recent memories', () => {
    const store = new WorldFactStore();
    let firstId;
    let lastId;
    for (let i = 0; i < 5001; i++) {
      const added = store.addFact(makeMemory({
        content: `memory-${i}`,
        timestamp: new Date(1000 + i),
      }));
      if (i === 0) firstId = added.id;
      if (i === 5000) lastId = added.id;
    }

    const memories = store.getMemoryFacts();
    expect(memories.length).toBeLessThanOrEqual(5000);
    expect(store.getFactById(firstId)).toBeNull();
    expect(store.getFactById(lastId)).not.toBeNull();
  });

  it('bounds invalidated facts and purges knowledge for invalidated originals', () => {
    const store = new WorldFactStore();
    const purged = [];
    store.setKnowledgeStore({
      purgeEvictedFacts(ids) {
        purged.push(...ids);
      },
    });

    let firstMemoryId;
    let firstInvalidationId;
    let lastInvalidationId;
    for (let i = 0; i < 2001; i++) {
      const added = store.addFact(makeMemory({
        content: `invalidated-memory-${i}`,
        timestamp: new Date(1000 + i),
      }));
      store.setSimTime(new Date(2000 + i));
      const invalidation = store.invalidateFact(added.id, `superseded-${i}`);
      if (i === 0) {
        firstMemoryId = added.id;
        firstInvalidationId = invalidation.id;
      }
      if (i === 2000) lastInvalidationId = invalidation.id;
    }

    const invalidations = store.getAllFacts([FactType.INVALIDATED]);
    expect(invalidations.length).toBeLessThanOrEqual(2000);
    expect(store.getFactById(firstInvalidationId)).toBeNull();
    expect(store.getFactById(lastInvalidationId)).not.toBeNull();
    expect(purged).toContain(firstMemoryId);
  });
});

// ═══════════════════════════════════════════
// AgentStateFact 覆盖语义
// ═══════════════════════════════════════════

describe('WorldFactStore - AgentStateFact 覆盖', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  it('AgentStateFact 可以更新', () => {
    const f = store.addFact(makeAgentState({ state: '看书' }));
    const updated = store.updateFact(f.id, { state: '跑步', region: '操场' });
    expect(updated.state).toBe('跑步');
    expect(updated.region).toBe('操场');
  });
});

// ═══════════════════════════════════════════
// RelationshipFact 的 previousType 保留
// ═══════════════════════════════════════════

describe('WorldFactStore - RelationshipFact previousType', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  it('更新 relationType 时应该保留 previousType', () => {
    const f = store.addFact(makeRelationship({ relationType: '朋友' }));
    const updated = store.updateFact(f.id, { relationType: '恋人' });
    expect(updated.relationType).toBe('恋人');
    expect(updated.previousType).toBe('朋友');
  });

  it('更新 strength 时不应该改变 previousType', () => {
    const f = store.addFact(makeRelationship({ relationType: '朋友' }));
    const updated = store.updateFact(f.id, { strength: 0.8 });
    expect(updated.relationType).toBe('朋友');
    expect(updated.previousType).toBeNull();
  });
});

// ═══════════════════════════════════════════
// StaticEnvFact 不可变
// ═══════════════════════════════════════════

describe('WorldFactStore - StaticEnvFact 不可变', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  it('StaticEnvFact 不能更新', () => {
    const f = store.addFact(makeStaticEnv());
    expect(() => store.updateFact(f.id, { object: '桌子' })).toThrow(/immutable/);
  });
});

// ═══════════════════════════════════════════
// 按角色视角查询
// ═══════════════════════════════════════════

describe('WorldFactStore - getFactsForAgent', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
    store.addFact(makeStaticEnv()); // public
    store.addFact(makeEvent()); // public
    store.addFact(makeObservation({ observerId: 'alice', targetId: 'bob' }));
    store.addFact(makeObservation({ observerId: 'charlie', targetId: 'dave' }));
    store.addFact(makeMemory({ agentId: 'alice' }));
  });

  it('alice 应该看到 public 事实和自己的事实', () => {
    const facts = store.getFactsForAgent('alice');
    const types = facts.map(f => f.type);
    expect(types).toContain(FactType.STATIC_ENV);
    expect(types).toContain(FactType.EVENT);
    expect(types).toContain(FactType.MEMORY);
    expect(types).toContain(FactType.OBSERVATION);
  });

  it('alice 不应该看到 charlie 的 local 观察', () => {
    const facts = store.getFactsForAgent('alice');
    const charlieObs = facts.filter(f => f.type === FactType.OBSERVATION && f.observerId === 'charlie');
    expect(charlieObs).toHaveLength(0);
  });

  it('charlie 应该看到自己的观察', () => {
    const facts = store.getFactsForAgent('charlie');
    const charlieObs = facts.filter(f => f.type === FactType.OBSERVATION && f.observerId === 'charlie');
    expect(charlieObs).toHaveLength(1);
  });

  it('types 过滤应该生效', () => {
    const facts = store.getFactsForAgent('alice', { types: [FactType.EVENT] });
    expect(facts.every(f => f.type === FactType.EVENT)).toBe(true);
  });

  it('limit 应该限制返回数量', () => {
    const facts = store.getFactsForAgent('alice', { limit: 2 });
    expect(facts.length).toBeLessThanOrEqual(2);
  });

  it('结果应该按时间降序排列', () => {
    const facts = store.getFactsForAgent('alice');
    for (let i = 1; i < facts.length; i++) {
      expect(facts[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(facts[i].timestamp.getTime());
    }
  });

  it('Alice 的 AGENT_STATE 对 bob 不可见', () => {
    // Add an AGENT_STATE fact for alice
    const stateFact = store.addFact(makeAgentState({ agentId: 'alice', state: '看书' }));
    
    // bob should NOT see alice's AGENT_STATE
    const bobFacts = store.getFactsForAgent('bob');
    const bobStateFacts = bobFacts.filter(f => f.type === FactType.AGENT_STATE && f.agentId === 'alice');
    expect(bobStateFacts).toHaveLength(0);
  });

  it('Alice 自己的 AGENT_STATE 对 alice 可见', () => {
    const stateFact = store.addFact(makeAgentState({ agentId: 'alice', state: '跑步' }));
    
    // alice SHOULD see her own AGENT_STATE
    const aliceFacts = store.getFactsForAgent('alice');
    const aliceStateFacts = aliceFacts.filter(f => f.type === FactType.AGENT_STATE && f.agentId === 'alice');
    expect(aliceStateFacts).toHaveLength(1);
    expect(aliceStateFacts[0].state).toBe('跑步');
  });

  it('非 AGENT_STATE 的 public 事实对其他 agent 仍然可见', () => {
    const stateFact = store.addFact(makeAgentState({ agentId: 'alice', state: '看书' }));
    
    // bob should still see non-AGENT_STATE public facts
    const bobFacts = store.getFactsForAgent('bob');
    const bobEventFacts = bobFacts.filter(f => f.type === FactType.EVENT);
    expect(bobEventFacts.length).toBeGreaterThanOrEqual(1);
    
    // bob should NOT see alice's AGENT_STATE
    const bobStateFacts = bobFacts.filter(f => f.type === FactType.AGENT_STATE);
    expect(bobStateFacts).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// 按时间查询
// ═══════════════════════════════════════════

describe('WorldFactStore - getFactsSince', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  it('应该返回指定时间之后的事实', () => {
    const t1 = new Date('2024-01-01');
    const t2 = new Date('2024-06-01');
    const t3 = new Date('2024-12-01');

    store.addFact(createEventFact({ eventId: 'evt_1', description: 'A', timestamp: t1 }));
    store.addFact(createEventFact({ eventId: 'evt_2', description: 'B', timestamp: t2 }));
    store.addFact(createEventFact({ eventId: 'evt_3', description: 'C', timestamp: t3 }));

    const facts = store.getFactsSince(new Date('2024-03-01'));
    expect(facts).toHaveLength(2);
    expect(facts[0].description).toBe('B');
    expect(facts[1].description).toBe('C');
  });

  it('结果应该按时间升序', () => {
    const t1 = new Date('2024-01-01');
    const t2 = new Date('2024-06-01');
    store.addFact(createEventFact({ eventId: 'evt_1', description: 'A', timestamp: t2 }));
    store.addFact(createEventFact({ eventId: 'evt_2', description: 'B', timestamp: t1 }));

    const facts = store.getFactsSince(new Date('2024-01-01'));
    expect(facts[0].description).toBe('B');
    expect(facts[1].description).toBe('A');
  });

  it('types 过滤应该生效', () => {
    store.addFact(createEventFact({ eventId: 'evt_1', description: 'A' }));
    store.addFact(makeMemory());

    const facts = store.getFactsSince(new Date(0), [FactType.MEMORY]);
    expect(facts.every(f => f.type === FactType.MEMORY)).toBe(true);
  });
});

// ═══════════════════════════════════════════
// getEventFacts (limit + since)
// ═══════════════════════════════════════════

describe('WorldFactStore - getEventFacts 限制', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
    for (let i = 0; i < 5; i++) {
      store.addFact(createEventFact({
        eventId: `evt_${i}`,
        description: `事件${i}`,
        timestamp: new Date(2024, 0, i + 1),
      }));
    }
  });

  it('limit 应该限制返回数量', () => {
    const events = store.getEventFacts(3);
    expect(events).toHaveLength(3);
  });

  it('since 应该过滤时间', () => {
    const events = store.getEventFacts(undefined, new Date(2024, 0, 3));
    expect(events).toHaveLength(3);
  });

  it('limit + since 应该组合使用', () => {
    const events = store.getEventFacts(2, new Date(2024, 0, 2));
    expect(events).toHaveLength(2);
  });

  it('结果应该按时间降序', () => {
    const events = store.getEventFacts();
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(events[i].timestamp.getTime());
    }
  });
});

// ═══════════════════════════════════════════
// 持久化
// ═══════════════════════════════════════════

describe('WorldFactStore - 持久化', () => {
  it('toJSON 应该序列化所有事实', () => {
    const store = new WorldFactStore();
    store.addFact(makeEvent());
    store.addFact(makeMemory());

    const json = store.toJSON();
    expect(json.version).toBe(1);
    expect(json.facts).toHaveLength(2);
    expect(typeof json.facts[0].timestamp).toBe('string');
  });

  it('fromJSON 应该恢复所有事实', () => {
    const store = new WorldFactStore();
    store.addFact(makeEvent());
    store.addFact(makeMemory());
    store.addFact(makeAgentState());

    const json = store.toJSON();
    const restored = WorldFactStore.fromJSON(json);

    expect(restored.size).toBe(3);
    expect(restored.getEventFacts()).toHaveLength(1);
    expect(restored.getMemoryFacts()).toHaveLength(1);
    expect(restored.getAgentStateFacts()).toHaveLength(1);
  });

  it('恢复后时间应该是 Date 实例', () => {
    const store = new WorldFactStore();
    store.addFact(makeEvent());

    const json = store.toJSON();
    const restored = WorldFactStore.fromJSON(json);
    const facts = restored.getAllFacts();
    expect(facts[0].timestamp).toBeInstanceOf(Date);
  });

  it('恢复后 nextId 应该正确', () => {
    const store = new WorldFactStore();
    store.addFact(makeEvent());
    store.addFact(makeEvent());

    const json = store.toJSON();
    const restored = WorldFactStore.fromJSON(json);
    const f = restored.addFact(makeEvent());
    expect(f.id).toMatch(/fact_engine_2/);
  });

  it('恢复后应该支持按角色查询', () => {
    const store = new WorldFactStore();
    store.addFact(makeObservation({ observerId: 'alice', targetId: 'bob' }));

    const json = store.toJSON();
    const restored = WorldFactStore.fromJSON(json);
    const facts = restored.getFactsForAgent('alice');
    expect(facts).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════
// _getByTypeReadOnly — zero-copy hot path
// ═══════════════════════════════════════════

describe('WorldFactStore - _getByTypeReadOnly zero-copy', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
    store.addFact(makeAgentState({ agentId: 'alice', state: '看书' }));
    store.addFact(makeAgentState({ agentId: 'bob', state: '跑步' }));
    store.addFact(makeRelationship({ agentA: 'alice', agentB: 'bob', relationType: '朋友' }));
    store.addFact(makeMemory({ agentId: 'alice', content: '今天很开心' }));
  });

  it('应该返回与 _getByType 相同数量的事实', () => {
    const readOnly = store._getByTypeReadOnly(FactType.AGENT_STATE);
    const safeCopy = store.getAgentStateFacts();
    expect(readOnly).toHaveLength(safeCopy.length);
    expect(readOnly).toHaveLength(2);
  });

  it('应该返回与 _getByType 相同的事实 ID', () => {
    const readOnly = store._getByTypeReadOnly(FactType.RELATIONSHIP);
    const safeCopy = store.getRelationshipFacts();
    expect(readOnly[0].id).toBe(safeCopy[0].id);
  });

  it('应该返回与 _getByType 相同的字段值', () => {
    const readOnly = store._getByTypeReadOnly(FactType.AGENT_STATE);
    const safeCopy = store.getAgentStateFacts();
    for (let i = 0; i < readOnly.length; i++) {
      expect(readOnly[i].agentId).toBe(safeCopy[i].agentId);
      expect(readOnly[i].state).toBe(safeCopy[i].state);
      expect(readOnly[i].type).toBe(safeCopy[i].type);
    }
  });

  it('非变异操作对两种路径结果一致', () => {
    // Filter/built-in read operations should behave identically
    const readOnly = store._getByTypeReadOnly(FactType.MEMORY);
    const safeCopy = store.getMemoryFacts();
    const roFiltered = readOnly.filter(f => f.agentId === 'alice');
    const scFiltered = safeCopy.filter(f => f.agentId === 'alice');
    expect(roFiltered).toHaveLength(scFiltered.length);
  });

  it('对不存在的类型返回空数组', () => {
    expect(store._getByTypeReadOnly('NONEXISTENT')).toEqual([]);
  });

  it('_getByTypeReadOnly 返回内部引用（变异会污染 store）', () => {
    // This test demonstrates zero-copy: mutating the returned object affects
    // the store. This is the documented risk — callers must not mutate.
    const readOnly = store._getByTypeReadOnly(FactType.AGENT_STATE);
    const originalState = readOnly[0].state;
    readOnly[0].state = '被污染';
    // The store's internal fact is also mutated (zero-copy)
    const verify = store._getByTypeReadOnly(FactType.AGENT_STATE);
    expect(verify[0].state).toBe('被污染');
    // Clean up: restore state
    readOnly[0].state = originalState;
  });
});

// ═══════════════════════════════════════════
// 统计
// ═══════════════════════════════════════════

describe('WorldFactStore - getStats', () => {
  it('应该返回正确的统计信息', () => {
    const store = new WorldFactStore();
    store.addFact(makeEvent());
    store.addFact(makeEvent());
    store.addFact(makeMemory());
    store.addFact(makeAgentState());

    const stats = store.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byType[FactType.EVENT]).toBe(2);
    expect(stats.byType[FactType.MEMORY]).toBe(1);
    expect(stats.byType[FactType.AGENT_STATE]).toBe(1);
    expect(stats.byType[FactType.STATIC_ENV]).toBe(0);
  });

  it('应该统计 agent 数量', () => {
    const store = new WorldFactStore();
    store.addFact(makeAgentState({ agentId: 'alice' }));
    store.addFact(makeAgentState({ agentId: 'bob' }));

    const stats = store.getStats();
    expect(stats.agentCount).toBe(2);
  });
});
