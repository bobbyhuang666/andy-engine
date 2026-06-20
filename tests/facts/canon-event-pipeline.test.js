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
import { FactScope } from '../../facts/FactSchema.js';
import { applyEventConsequences } from '../../effects/EventEffectPipeline.js';

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
      const event = makeEvent({ content: '小明很高兴地和小红聊天' });
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

    it('无 memory 的 agent 不创建记忆', () => {
      const event = makeEvent();
      const agents = makeAgents();
      agents.get('xiaoming').memory = null;
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.memoryUpdates.length).toBe(1);
    });

    it('识别休息类事件的地点意义', () => {
      const event = makeEvent({ content: '小明在图书馆休息' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates.length).toBe(1);
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('rest');
    });

    it('识别工作类事件的地点意义', () => {
      const event = makeEvent({ content: '小明在图书馆专注工作' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('work');
    });

    it('识别社交类事件的地点意义', () => {
      const event = makeEvent({ content: '小明和小红在图书馆聊天' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('social');
    });

    it('识别运动类事件的地点意义', () => {
      const event = makeEvent({ content: '小明在操场运动', location: '操场' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      const consequences = applyEventConsequences({ fact: result.fact, agents, factStore });
      expect(consequences.locationMeaningUpdates[0].meaningType).toBe('exercise');
    });

    it('识别餐饮类事件的地点意义', () => {
      const event = makeEvent({ content: '小明在餐厅吃饭', location: '餐厅' });
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

      const r1 = pipeline.processEvent(makeEvent({ content: '小明在图书馆专注工作' }), agents);
      applyEventConsequences({ fact: r1.fact, agents, factStore });
      const r2 = pipeline.processEvent(makeEvent({ content: '小红在图书馆专注工作' }), agents);
      applyEventConsequences({ fact: r2.fact, agents, factStore });

      const meaning = factStore.getLocationMeaning('图书馆');
      expect(meaning).toBeDefined();
      expect(meaning.meaningType).toBe('work');
    });

    it('情绪标签: happy', () => {
      const event = makeEvent({ content: '小明很高兴' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('happy');
    });

    it('情绪标签: sad', () => {
      const event = makeEvent({ content: '小明很难过' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('sad');
    });

    it('情绪标签: angry', () => {
      const event = makeEvent({ content: '小明生气了' });
      const agents = makeAgents();
      const result = pipeline.processEvent(event, agents);

      applyEventConsequences({ fact: result.fact, agents, factStore });
      const xiaoming = agents.get('xiaoming');
      expect(xiaoming.memory.memories[0].emotionTag).toBe('angry');
    });

    it('情绪标签: fear', () => {
      const event = makeEvent({ content: '小明感到害怕' });
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
        content: '小明和小红在图书馆高兴地聊天',
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
});
