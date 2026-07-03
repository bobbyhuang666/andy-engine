/**
 * CanonEventPipeline 测试套件
 *
 * 验证：
 *   - 事件转化为事实
 *   - 知识传播（参与者、观察者、公共事件）
 *   - 批量处理
 *   - 边界情况
 *
 * 记忆创建、地点意义更新、情绪标签等角色后果
 * 已移至 EventEffectPipeline.applyEventConsequences（见 event-effect-pipeline.test.js）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldFactStore, KnowledgeStore, FactEmitter, CanonEventPipeline } from '../../facts/index.js';
import { FactScope } from '../../src/canon/FactSchema.js';
import { applyEventConsequences as _applyEventConsequences } from '../../src/effects/EventEffectPipeline.js';
import { EffectCommitter } from '../../src/effects/EffectCommitter.js';

function applyEventConsequences({ fact, agents, factStore, domain }) {
  const deltas = _applyEventConsequences({ fact, agents, factStore, domain });
  const committer = new EffectCommitter({ world: { factStore, time: null }, agents });
  for (const delta of deltas) {
    committer._applyDelta(delta);
  }
  const results = { memoryUpdates: [], locationMeaningUpdates: [], tendencyUpdates: [] };
  for (const delta of deltas) {
    switch (delta.type) {
      case 'memory':
        results.memoryUpdates.push({ agentId: delta.agentId, type: 'memory_add' });
        break;
      case 'locationMeaning':
        results.locationMeaningUpdates.push({ location: delta.location, meaningType: delta.meaningType, weight: delta.weight });
        break;
      case 'futureTendency':
        results.tendencyUpdates.push({ agentId: delta.agentId, location: delta.location, delta: delta.delta });
        break;
    }
  }
  return results;
}

// ═══════════════════════════════════════════
// 辅助工厂
// ═══════════════════════════════════════════

function makeEvent(overrides = {}) {
  return {
    id: `evt_${Date.now()}_${Math.random()}`,
    type: 'encounter',
    content: '小明和小红在图书馆聊天',
    location: '图书馆',
    scope: FactScope.PUBLIC,
    participants: ['xiaoming', 'xiaohong'],
    observers: [],
    time: new Date(),
    ...overrides,
  };
}

function makeAgent(id, position = '图书馆') {
  const memories = [];
  return {
    id,
    name: id,
    position,
    emotion: { current: { joy: 0.3, sadness: 0.1 } },
    memory: {
      memories,
      addExperience(memory, emotionState) {
        memories.push({ ...memory, emotionState, timestamp: new Date() });
      },
    },
  };
}

function makeAgents(positions = {}) {
  const agents = new Map();
  const defaults = { xiaoming: '图书馆', xiaohong: '图书馆', xiaogang: '食堂' };
  const pos = { ...defaults, ...positions };

  for (const [id, position] of Object.entries(pos)) {
    agents.set(id, makeAgent(id, position));
  }
  return agents;
}

// ═══════════════════════════════════════════
// 测试
// ═══════════════════════════════════════════

describe('CanonEventPipeline', () => {
  let factStore;
  let knowledgeStore;
  let factEmitter;
  let pipeline;

  beforeEach(() => {
    factStore = new WorldFactStore();
    knowledgeStore = new KnowledgeStore(factStore);
    factEmitter = new FactEmitter(factStore, { knowledgeStore });
    pipeline = new CanonEventPipeline(factStore, knowledgeStore, factEmitter);
  });

  // ─── 事件转化为事实 ───

  describe('事件转化为事实', () => {
    it('将事件转化为 EventFact 并存入 factStore', () => {
      const event = makeEvent();
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      expect(result.fact).toBeDefined();
      expect(result.fact.type).toBe('event');
      expect(result.fact.description).toBe('小明和小红在图书馆聊天');
      expect(factStore.getEventFacts().length).toBe(1);
    });

    it('生成唯一 ID', () => {
      const event = makeEvent();
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      expect(result.fact.id).toBeDefined();
      expect(result.fact.id.length).toBeGreaterThan(0);
    });

    it('使用事件的 scope', () => {
      const event = makeEvent({ scope: FactScope.LOCAL });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      expect(result.fact.scope).toBe(FactScope.LOCAL);
    });

    it('跳过无类型事件', () => {
      const event = { content: '无类型事件' };
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      expect(result.fact).toBeNull();
    });

    it('跳过 null 事件', () => {
      const agents = makeAgents();
      const result = pipeline.processEvent(null, agents);

      expect(result.fact).toBeNull();
    });

    it('重复事件 ID 不报错（幂等）', () => {
      const event = makeEvent({ id: 'fixed_id' });
      const agents = makeAgents();

      pipeline.processEvent(event, agents);
      const result2 = pipeline.processEvent(event, agents);

      expect(result2.fact).toBeNull();
      expect(factStore.getEventFacts().length).toBe(1);
    });
  });

  // ─── 知识传播 ───

  describe('知识传播', () => {
    it('参与者直接获得知识', () => {
      const event = makeEvent();
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      expect(result.knowledgeUpdates.length).toBeGreaterThanOrEqual(2);
      expect(knowledgeStore.hasKnowledge('xiaoming', result.fact.id)).toBe(true);
      expect(knowledgeStore.hasKnowledge('xiaohong', result.fact.id)).toBe(true);
    });

    it('观察者获得 observed 知识', () => {
      const event = makeEvent({ observers: ['xiaogang'], scope: FactScope.LOCAL });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(true);
      expect(knowledgeStore.getSource('xiaogang', result.fact.id)).toBe('observed');
    });

    it('公共事件：同区域角色获得 overheard 知识', () => {
      const event = makeEvent({ scope: FactScope.PUBLIC, location: '图书馆' });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(true);
      expect(knowledgeStore.getSource('xiaogang', result.fact.id)).toBe('overheard');
    });

    it('公共事件：不同区域角色不知道', () => {
      const event = makeEvent({ scope: FactScope.PUBLIC, location: '图书馆' });
      const agents = makeAgents({ xiaogang: '食堂' });
      const result = pipeline.processEvent(event, agents);

      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(false);
    });

    it('私密事件：同区域角色不知道', () => {
      const event = makeEvent({ scope: FactScope.LOCAL, location: '图书馆' });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(false);
    });

    it('参与者已有知识时不重复添加', () => {
      const event = makeEvent({ participants: ['xiaoming', 'xiaoming'] });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const xiaomingUpdates = result.knowledgeUpdates.filter(u => u.agentId === 'xiaoming');
      expect(xiaomingUpdates.length).toBe(1);
      expect(knowledgeStore.getKnownFactIds('xiaoming').size).toBe(1);
    });
  });

  // ─── processEvent 结果结构 ───

  describe('processEvent 结果结构', () => {
    it('结果只包含 fact 和 knowledgeUpdates', () => {
      const event = makeEvent();
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      expect(result).toHaveProperty('fact');
      expect(result).toHaveProperty('knowledgeUpdates');
      expect(result).not.toHaveProperty('memoryUpdates');
      expect(result).not.toHaveProperty('locationMeaningUpdates');
      expect(result).not.toHaveProperty('tendencyUpdates');
    });
  });

  // ─── 批量处理 ───

  describe('批量处理', () => {
    it('processEvents 处理多个事件', () => {
      const events = [
        makeEvent({ content: '事件1' }),
        makeEvent({ content: '事件2' }),
        makeEvent({ content: '事件3' }),
      ];
      const agents = makeAgents();
      const results = pipeline.processEvents(events, agents);

      expect(results.length).toBe(3);
      expect(factStore.getEventFacts().length).toBe(3);
    });

    it('空数组返回空结果', () => {
      const agents = makeAgents();
      const results = pipeline.processEvents([], agents);

      expect(results.length).toBe(0);
    });

    it('null 返回空结果', () => {
      const agents = makeAgents();
      const results = pipeline.processEvents(null, agents);

      expect(results.length).toBe(0);
    });

    it('部分事件失败不影响其他事件', () => {
      const events = [
        makeEvent({ content: '正常事件' }),
        null,
        makeEvent({ content: '另一个正常事件' }),
      ];
      const agents = makeAgents();
      const results = pipeline.processEvents(events, agents);

      expect(results.length).toBe(3);
      expect(results[0].fact).toBeDefined();
      expect(results[1].fact).toBeNull();
      expect(results[2].fact).toBeDefined();
    });
  });

  // ─── eventId fallback 唯一性 ───

  describe('eventId fallback 唯一性', () => {
    it('两个同 type/time/no-id 事件生成不同 eventId', () => {
      const fixedTime = new Date('2024-06-15T12:00:00Z');
      const agents = makeAgents();

      const result1 = pipeline.processEvent(
        { type: 'encounter', content: '事件1', time: fixedTime, participants: ['xiaoming'], location: '图书馆' },
        agents
      );
      const result2 = pipeline.processEvent(
        { type: 'encounter', content: '事件2', time: fixedTime, participants: ['xiaohong'], location: '图书馆' },
        agents
      );

      expect(result1.fact).toBeDefined();
      expect(result2.fact).toBeDefined();
      expect(result1.fact.eventId).not.toBe(result2.fact.eventId);
    });

    it('两个 fresh pipeline 同样输入顺序生成相同 eventId 序列', () => {
      const fixedTime = new Date('2024-06-15T12:00:00Z');

      const store1 = new WorldFactStore();
      const ks1 = new KnowledgeStore(store1);
      const pipeline1 = new CanonEventPipeline(store1, ks1, null);

      const store2 = new WorldFactStore();
      const ks2 = new KnowledgeStore(store2);
      const pipeline2 = new CanonEventPipeline(store2, ks2, null);

      const events = [
        { type: 'encounter', content: 'A', time: fixedTime, participants: ['xiaoming'], location: '图书馆' },
        { type: 'encounter', content: 'B', time: fixedTime, participants: ['xiaohong'], location: '图书馆' },
        { type: 'social', content: 'C', time: fixedTime, participants: ['xiaogang'], location: '食堂' },
      ];

      const results1 = events.map(e => pipeline1.processEvent(e, makeAgents()));
      const results2 = events.map(e => pipeline2.processEvent(e, makeAgents()));

      const ids1 = results1.map(r => r.fact.eventId);
      const ids2 = results2.map(r => r.fact.eventId);

      expect(ids1).toEqual(ids2);
    });
  });

  // ─── applyEventConsequences（角色后果）───

  describe('applyEventConsequences', () => {
    it('为参与者创建记忆', () => {
      const event = makeEvent();
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.memoryUpdates.length).toBe(2);
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories.length).toBe(1);
      expect(xiaoming.memory.memories[0].content).toBe('小明和小红在图书馆聊天');
    });

    it('记忆包含情绪标签', () => {
      const event = makeEvent({ content: 'xiaoming was very happy chatting with xiaohong' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('happy');
    });

    it('为观察者也创建记忆', () => {
      const event = makeEvent({ observers: ['xiaogang'], scope: FactScope.LOCAL });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.memoryUpdates.length).toBe(3);
      const xiaogang = agents.get('xiaogang');
      expect(xiaogang.memory.memories.length).toBe(1);
    });

    it('internal-scoped facts are audit-only and produce no world consequences', () => {
      const agents = makeAgents();
      const fact = {
        type: 'EVENT',
        scope: 'internal',
        description: 'action_selected:explore',
        location: '图书馆',
        participants: ['xiaoming'],
        observers: ['xiaohong'],
      };

      const consequences = applyEventConsequences({ fact, agents, factStore });
      expect(consequences.memoryUpdates).toEqual([]);
      expect(consequences.locationMeaningUpdates).toEqual([]);
      expect(consequences.tendencyUpdates).toEqual([]);
      expect(agents.get('xiaoming').memory.memories).toHaveLength(0);
      expect(agents.get('xiaohong').memory.memories).toHaveLength(0);
    });

    it('无 memory 的 agent 不创建记忆', () => {
      const event = makeEvent();
      const agents = makeAgents();
      agents.get('xiaoming').memory = null;
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.memoryUpdates.length).toBe(1);
    });

    it('识别休息类事件的地点意义', () => {
      const event = makeEvent({ content: 'xiaoming took a rest at the library' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates.length).toBe(1);
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('rest');
    });

    it('识别工作类事件的地点意义', () => {
      const event = makeEvent({ content: 'xiaoming focused on work at the library' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('work');
    });

    it('识别社交类事件的地点意义', () => {
      const event = makeEvent({ content: 'xiaoming and xiaohong chatted at the library' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('social');
    });

    it('识别运动类事件的地点意义', () => {
      const event = makeEvent({ content: 'xiaoming did exercise at the field', location: '操场' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('exercise');
    });

    it('识别餐饮类事件的地点意义', () => {
      const event = makeEvent({ content: 'xiaoming ate lunch at the cafeteria', location: '餐厅' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('dining');
    });

    it('无匹配规则的事件不更新地点意义', () => {
      const event = makeEvent({ content: '天气变好了' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates.length).toBe(0);
    });

    it('无 location 的事件不更新地点意义', () => {
      const event = makeEvent({ location: '' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates.length).toBe(0);
    });

    it('累积地点意义（同一地点多次事件）', () => {
      const agents = makeAgents();

      const r1 = pipeline.processEvent(makeEvent({ content: 'xiaoming focused on work at the library' }), agents);
      applyEventConsequences({ fact: r1.fact, agents, factStore });
      const r2 = pipeline.processEvent(makeEvent({ content: 'xiaohong focused on work at the library' }), agents);
      applyEventConsequences({ fact: r2.fact, agents, factStore });

      const meaning = factStore.getLocationMeaning('图书馆');
      expect(meaning).toBeDefined();
      expect(meaning.meaningType).toBe('work');
    });

    it('情绪标签: happy', () => {
      const event = makeEvent({ content: 'xiaoming felt happy' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('happy');
    });

    it('情绪标签: sad', () => {
      const event = makeEvent({ content: 'xiaoming felt sad' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('sad');
    });

    it('情绪标签: angry', () => {
      const event = makeEvent({ content: 'xiaoming was angry' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('angry');
    });

    it('情绪标签: fear', () => {
      const event = makeEvent({ content: 'xiaoming felt afraid' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('fear');
    });

    it('情绪标签: neutral', () => {
      const event = makeEvent({ content: '小明走路' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('neutral');
    });

    it('基础重要性 0.3', () => {
      const event = makeEvent({ participants: ['xiaoming'], scope: FactScope.LOCAL });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].importance).toBe(0.3);
    });

    it('多人事件增加重要性', () => {
      const event = makeEvent({ participants: ['xiaoming', 'xiaohong', 'xiaogang'] });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].importance).toBe(0.6);
    });

    it('公共事件增加重要性', () => {
      const event = makeEvent({ scope: FactScope.PUBLIC, participants: ['xiaoming'] });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].importance).toBe(0.4);
    });

    it('重要性不超过 1.0', () => {
      const event = makeEvent({
        participants: ['xiaoming', 'xiaohong', 'xiaogang', 'xiaoli'],
        scope: FactScope.PUBLIC,
      });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].importance).toBeLessThanOrEqual(1.0);
    });

    it('fact 为 null 时返回空结果', () => {
      const agents = makeAgents();
      const consequences = applyEventConsequences({ fact: null, agents, factStore });
      expect(consequences.memoryUpdates).toEqual([]);
      expect(consequences.locationMeaningUpdates).toEqual([]);
      expect(consequences.tendencyUpdates).toEqual([]);
    });
  });

  // ─── 集成测试 ───

  describe('集成', () => {
    it('完整管线：事件→事实→知识→记忆→地点意义', () => {
      const event = makeEvent({
        content: 'xiaoming and xiaohong had a happy chat at the library',
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        scope: FactScope.PUBLIC,
        location: '图书馆',
      });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      // 事实已创建
      expect(result.fact).toBeDefined();
      expect(factStore.getEventFacts().length).toBe(1);

      // 知识已传播
      expect(knowledgeStore.hasKnowledge('xiaoming', result.fact.id)).toBe(true);
      expect(knowledgeStore.hasKnowledge('xiaohong', result.fact.id)).toBe(true);
      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(true);

      // 角色后果通过 applyEventConsequences
      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });

      // 记忆已创建
      expect(agents.get('xiaoming').memory.memories.length).toBe(1);
      expect(agents.get('xiaohong').memory.memories.length).toBe(1);

      // 地点意义已更新
      const meaning = factStore.getLocationMeaning('图书馆');
      expect(meaning).toBeDefined();
      expect(meaning.meaningType).toBe('social');
    });
  });

  // ─── Told 传播（W1）───

  describe('Told 传播', () => {
    /**
     * 辅助：处理一个种子事件让某 agent 获得知识
     */
    function seedKnowledge(agentId, content, overrides = {}) {
      const event = {
        id: `seed_${Date.now()}_${Math.random()}`,
        type: 'encounter',
        content,
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: [agentId],
        observers: [],
        time: new Date(),
        ...overrides,
      };
      return pipeline.processEvent(event, agentsMap);
    }

    let agentsMap;

    beforeEach(() => {
      // xiaohong at '食堂' to avoid overhearing seed events at '图书馆'
      agentsMap = makeAgents({ xiaohong: '食堂' });
    });

    it('社交事件触发 told 传播', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice found a treasure');
      const seedFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'xiaoming and xiaohong chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.hasKnowledge('xiaohong', seedFactId)).toBe(true);
    });

    it('被告知者 getSource 返回 told', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice found a gem');
      const seedFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.getSource('xiaohong', seedFactId)).toBe('told');
    });

    it('被告知者 getEvidence.confidence === 0.6', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice saw a comet');
      const seedFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      const evidence = knowledgeStore.getEvidence('xiaohong', seedFactId);
      expect(evidence.confidence).toBe(0.6);
    });

    it('被告知者 getEvidence.propagatedFrom === 告知者 ID', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice met a stranger');
      const seedFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      const evidence = knowledgeStore.getEvidence('xiaohong', seedFactId);
      expect(evidence.propagatedFrom).toBe('xiaoming');
    });

    it('非社交事件不触发 told', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice found a key');
      const seedFactId = seedResult.fact.id;

      const encounterEvent = {
        id: `enc_${Date.now()}_${Math.random()}`,
        type: 'encounter',
        content: 'xiaoming and xiaohong meet',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(encounterEvent, agentsMap);

      expect(knowledgeStore.hasKnowledge('xiaohong', seedFactId)).toBe(false);
    });

    it('只传播 PUBLIC scope 的事实', () => {
      const localEvent = {
        id: `local_${Date.now()}_${Math.random()}`,
        type: 'encounter',
        content: 'xiaoming private moment',
        location: '图书馆',
        scope: FactScope.LOCAL,
        participants: ['xiaoming'],
        observers: [],
        time: new Date(),
      };
      const localResult = pipeline.processEvent(localEvent, agentsMap);
      const localFactId = localResult.fact.id;

      const pubResult = seedKnowledge('xiaoming', 'alice public event');
      const pubFactId = pubResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.hasKnowledge('xiaohong', localFactId)).toBe(false);
      expect(knowledgeStore.hasKnowledge('xiaohong', pubFactId)).toBe(true);
    });

    it('不传播他人 AGENT_STATE', () => {
      const stateFact = {
        id: `state_${Date.now()}_${Math.random()}`,
        type: 'agent_state',
        agentId: 'some_other_agent',
        state: 'hungry',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: FactScope.PUBLIC,
        participants: [],
        observers: [],
      };
      factStore.addFact(stateFact);
      knowledgeStore.addKnowledge('xiaoming', stateFact.id, 'direct');

      const seedResult = seedKnowledge('xiaoming', 'alice found a map');
      const pubFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.hasKnowledge('xiaohong', stateFact.id)).toBe(false);
      expect(knowledgeStore.hasKnowledge('xiaohong', pubFactId)).toBe(true);
    });

    it('告知者必须 hasKnowledge', () => {
      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      const result = pipeline.processEvent(socialEvent, agentsMap);

      expect(result.fact).toBeDefined();
      const toldUpdates = result.knowledgeUpdates.filter(u => u.source === 'told');
      expect(toldUpdates.length).toBe(0);
    });

    it('被告知者已知道 → 不重复传播', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice found a treasure');
      const seedFactId = seedResult.fact.id;

      knowledgeStore.addKnowledge('xiaohong', seedFactId, 'direct');

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      const result = pipeline.processEvent(socialEvent, agentsMap);

      const toldUpdates = result.knowledgeUpdates.filter(u => u.source === 'told');
      expect(toldUpdates.length).toBe(0);
    });

    it('每方向每交互最多 1 条 fact', () => {
      seedKnowledge('xiaoming', 'fact one');
      seedKnowledge('xiaoming', 'fact two');
      seedKnowledge('xiaoming', 'fact three');

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      const result = pipeline.processEvent(socialEvent, agentsMap);

      const toldToXiaohong = result.knowledgeUpdates.filter(
        u => u.source === 'told' && u.agentId === 'xiaohong'
      );
      expect(toldToXiaohong.length).toBeLessThanOrEqual(1);

      const toldToXiaoming = result.knowledgeUpdates.filter(
        u => u.source === 'told' && u.agentId === 'xiaoming'
      );
      expect(toldToXiaoming.length).toBe(0);
    });

    it('失效事实不传播', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice found a cursed item');
      const seedFactId = seedResult.fact.id;
      factStore.invalidateFact(seedFactId, '测试失效');

      const validResult = seedKnowledge('xiaoming', 'alice found a healing potion');
      const validFactId = validResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.hasKnowledge('xiaohong', seedFactId)).toBe(false);
      expect(knowledgeStore.hasKnowledge('xiaohong', validFactId)).toBe(true);
    });

    it('完整管线：社交事件 → fact → direct → told', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice witnessed a meteor');
      const seedFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'xiaoming and xiaohong discussing astronomy',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      const socialResult = pipeline.processEvent(socialEvent, agentsMap);

      expect(socialResult.fact).toBeDefined();
      const socialFactId = socialResult.fact.id;

      expect(knowledgeStore.getSource('xiaoming', socialFactId)).toBe('direct');
      expect(knowledgeStore.getSource('xiaohong', socialFactId)).toBe('direct');
      expect(knowledgeStore.hasKnowledge('xiaohong', seedFactId)).toBe(true);
      expect(knowledgeStore.getSource('xiaohong', seedFactId)).toBe('told');
    });

    it('多 agent：alice direct → bob told (alice 告知)', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice knows a secret');
      const seedFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'sharing secrets',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.getSource('xiaohong', seedFactId)).toBe('told');
      expect(knowledgeStore.getSource('xiaoming', seedFactId)).toBe('direct');
    });

    it('多 agent：charlie 非交互 → 不知', () => {
      const seedResult = seedKnowledge('xiaoming', 'alice found a hidden passage');
      const seedFactId = seedResult.fact.id;

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.hasKnowledge('xiaogang', seedFactId)).toBe(false);
      expect(knowledgeStore.hasKnowledge('xiaohong', seedFactId)).toBe(true);
    });

    it('双向传播：双方各自分享一条 fact', () => {
      const seed1 = seedKnowledge('xiaoming', 'alice knows fact A');
      const factId1 = seed1.fact.id;

      const fact2 = { id: `fact2_${Date.now()}_${Math.random()}`, type: 'event', eventId: `fact2_evt_${Date.now()}_${Math.random()}`, timestamp: new Date(), source: 'engine', confidence: 1.0, scope: FactScope.PUBLIC, participants: [], observers: [], description: 'fact B' };
      factStore.addFact(fact2);
      knowledgeStore.addKnowledge('xiaohong', fact2.id, 'direct');

      const socialEvent = {
        id: `social_${Date.now()}_${Math.random()}`,
        type: 'social',
        content: 'chatting',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
        time: new Date(),
      };
      const result = pipeline.processEvent(socialEvent, agentsMap);

      expect(knowledgeStore.hasKnowledge('xiaohong', factId1)).toBe(true);
      expect(knowledgeStore.hasKnowledge('xiaoming', fact2.id)).toBe(true);
      expect(knowledgeStore.getSource('xiaohong', factId1)).toBe('told');
      expect(knowledgeStore.getSource('xiaoming', fact2.id)).toBe('told');
      expect(knowledgeStore.getEvidence('xiaohong', factId1).propagatedFrom).toBe('xiaoming');
      expect(knowledgeStore.getEvidence('xiaoming', fact2.id).propagatedFrom).toBe('xiaohong');
    });
  });

  // ─── Inferred 传播（W2）───
  //
  // Inferred 是 safety net：确保在 PUBLIC 事件发生地点的每个角色
  // 无论是否参与/观察/偷听，都能获得至少 0.5 置信度的知识。
  //
  // 优先级：direct(1.0) > observed(0.9) > overheard(0.7) > inferred(0.5)
  // 在正常管线中，同位置 agent 通过 overheard(0.7) 获得知识，
  // inferred 仅在 edge case（如知识被清除）时起作用。

  describe('Inferred 传播', () => {
    it('直接调用 _propagateInferred 验证机制', () => {
      const event = makeEvent({
        content: 'test inferred mechanism',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming'],
        observers: [],
      });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      // xiaogang 通过 overheard 获得知识（0.7）
      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(true);
      expect(knowledgeStore.getSource('xiaogang', result.fact.id)).toBe('overheard');

      // 移除知识后直接调用 _propagateInferred 测试 inferred 机制
      knowledgeStore.removeKnowledge('xiaogang', result.fact.id);
      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(false);

      const updates = pipeline._propagateInferred(result.fact, agents);
      expect(updates.length).toBe(1);
      expect(updates[0].source).toBe('inferred');
      expect(knowledgeStore.getSource('xiaogang', result.fact.id)).toBe('inferred');
      expect(knowledgeStore.getEvidence('xiaogang', result.fact.id).confidence).toBe(0.5);
    });

    it('propagatedFrom 为 null', () => {
      const event = makeEvent({
        content: 'inferred event',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming'],
        observers: [],
      });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      knowledgeStore.removeKnowledge('xiaogang', result.fact.id);
      pipeline._propagateInferred(result.fact, agents);

      const evidence = knowledgeStore.getEvidence('xiaogang', result.fact.id);
      expect(evidence.propagatedFrom).toBeNull();
    });

    it('LOCAL scope → 没有 inferred', () => {
      const event = makeEvent({
        content: 'local event no inference',
        location: '图书馆',
        scope: FactScope.LOCAL,
        participants: ['xiaoming'],
        observers: [],
      });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(false);
    });

    it('不同位置 agent → 没有 inferred', () => {
      const event = makeEvent({
        content: 'far away event',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming'],
        observers: [],
      });
      const agents = makeAgents({ xiaogang: '食堂' });
      const result = pipeline.processEvent(event, agents);

      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(false);
    });

    it('已存在知识不重复添加 inferred', () => {
      const event = makeEvent({
        content: 'already known event',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming'],
        observers: [],
      });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      // xiaogang 已有 overheard(0.7)，inferred 不应覆盖
      const evidence = knowledgeStore.getEvidence('xiaogang', result.fact.id);
      expect(evidence.source).toBe('overheard');
      expect(evidence.confidence).toBe(0.7);

      // 直接调用 inferred 应返回空（已有知识）
      const updates = pipeline._propagateInferred(result.fact, agents);
      expect(updates.length).toBe(0);

      // source 仍为 overheard，未被 inferred 覆盖
      expect(knowledgeStore.getSource('xiaogang', result.fact.id)).toBe('overheard');
    });

    it('全管线优先级：participants direct > 同位置 overheard > inferred safety net', () => {
      const event = makeEvent({
        content: 'priority chain test',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming', 'xiaohong'],
        observers: [],
      });
      const agents = makeAgents({ xiaogang: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      const factId = result.fact.id;

      // 参与者 direct（1.0）
      expect(knowledgeStore.getSource('xiaoming', factId)).toBe('direct');
      expect(knowledgeStore.getSource('xiaohong', factId)).toBe('direct');
      expect(knowledgeStore.getEvidence('xiaoming', factId).confidence).toBe(1.0);

      // 同位置未参与者 overheard（0.7）
      expect(knowledgeStore.getSource('xiaogang', factId)).toBe('overheard');
      expect(knowledgeStore.getEvidence('xiaogang', factId).confidence).toBe(0.7);

      // inferred 作为 safety net：如果清除知识后调用 inferred 仍能工作
      knowledgeStore.removeKnowledge('xiaogang', factId);
      pipeline._propagateInferred(result.fact, agents);
      expect(knowledgeStore.getSource('xiaogang', factId)).toBe('inferred');
      expect(knowledgeStore.getEvidence('xiaogang', factId).confidence).toBe(0.5);
    });

    it('auditOnly fact (action_selected + scope public) 不产生 inferred knowledge', () => {
      // type: action_selected forces auditOnly=true even when scope is public.
      // _propagateKnowledge guards auditOnly, but _propagateInferred must too,
      // otherwise same-location agents still receive inferred knowledge.
      const event = makeEvent({
        id: 'evt_audit_inferred',
        type: 'action_selected',
        content: 'action_selected:explore',
        location: '图书馆',
        scope: FactScope.PUBLIC,
        participants: ['xiaoming'],
        observers: [],
      });
      const agents = makeAgents({ xiaogang: '图书馆', xiaoming: '图书馆' });
      const result = pipeline.processEvent(event, agents);

      expect(result.fact.auditOnly).toBe(true);
      expect(result.fact.scope).toBe(FactScope.PUBLIC);

      // No agent — participant or same-location bystander — should know.
      expect(knowledgeStore.hasKnowledge('xiaoming', result.fact.id)).toBe(false);
      expect(knowledgeStore.hasKnowledge('xiaogang', result.fact.id)).toBe(false);

      // No inferred updates in the returned knowledgeUpdates.
      const inferred = result.knowledgeUpdates.filter(u => u.source === 'inferred');
      expect(inferred).toHaveLength(0);

      // Direct call to _propagateInferred should also be a no-op.
      const direct = pipeline._propagateInferred(result.fact, agents);
      expect(direct).toHaveLength(0);
    });
  });
});
