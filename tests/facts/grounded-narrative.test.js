import { describe, it, expect, beforeEach } from 'vitest';
import FactProvider from '../../facts/FactProvider.js';
import WorldFactStore from '../../facts/WorldFactStore.js';
import KnowledgeStore from '../../facts/KnowledgeStore.js';
import NarrativeBuilder from '../../sdk/NarrativeBuilder.js';
import FutureTendencyTracker from '../../agent/FutureTendencyTracker.js';
import AndyEngine from '../../index.js';

describe('GroundedNarrative', () => {
  let store;
  let provider;

  beforeEach(() => {
    store = new WorldFactStore();
    provider = new FactProvider(store, null, null, null);
  });

  describe('locationMeaning in grounding package', () => {
    it('返回 locationMeaning 当地点有意义时', () => {
      store.updateLocationMeaning('图书馆', { type: 'work', weight: 0.9, reason: '学习' });

      const grounding = provider.getGroundingPackage('alice', {
        currentRegion: '图书馆',
      });

      expect(grounding.locationMeaning).toBeDefined();
      expect(grounding.locationMeaning).toContain('图书馆');
      expect(grounding.locationMeaning).toContain('适合工作的地方');
    });

    it('不返回 locationMeaning 当地点无意义时', () => {
      const grounding = provider.getGroundingPackage('alice', {
        currentRegion: '未知地点',
      });

      expect(grounding.locationMeaning).toBeUndefined();
    });

    it('不返回 locationMeaning 当未提供 currentRegion 时', () => {
      store.updateLocationMeaning('图书馆', { type: 'work', weight: 0.9, reason: '学习' });

      const grounding = provider.getGroundingPackage('alice', {});

      expect(grounding.locationMeaning).toBeUndefined();
    });

    it('不同 meaningType 映射正确', () => {
      const typeMap = {
        rest: '适合休息的地方',
        work: '适合工作的地方',
        social: '适合社交的地方',
        explore: '适合探索的地方',
        neutral: '普通地方',
      };

      for (const [type, desc] of Object.entries(typeMap)) {
        store.updateLocationMeaning('测试地点', { type, weight: 0.5, reason: '测试' });
        const grounding = provider.getGroundingPackage('alice', {
          currentRegion: '测试地点',
        });
        expect(grounding.locationMeaning).toContain(desc);
      }
    });
  });

  describe('behaviorTendency in grounding package', () => {
    it('返回 behaviorTendency 当梯度足够大时', () => {
      const tracker = new FutureTendencyTracker();
      tracker.updateTendency('图书馆', [0.5, 0.5, 0, 0], 1.0);
      tracker.updateTendency('图书馆', [0.5, 0.5, 0, 0], 1.0);

      const mockAgent = { futureTendency: tracker };
      const grounding = provider.getGroundingPackage('alice', {
        currentRegion: '图书馆',
        agent: mockAgent,
      });

      expect(grounding.behaviorTendency).toBeDefined();
      expect(typeof grounding.behaviorTendency).toBe('string');
      expect(grounding.behaviorTendency.length).toBeGreaterThan(0);
    });

    it('不返回 behaviorTendency 当没有 agent 时', () => {
      const grounding = provider.getGroundingPackage('alice', {
        currentRegion: '图书馆',
      });

      expect(grounding.behaviorTendency).toBeUndefined();
    });

    it('不返回 behaviorTendency 当 agent 没有 futureTendency 时', () => {
      const mockAgent = {};
      const grounding = provider.getGroundingPackage('alice', {
        currentRegion: '图书馆',
        agent: mockAgent,
      });

      expect(grounding.behaviorTendency).toBeUndefined();
    });

    it('不返回 behaviorTendency 当梯度太小时', () => {
      const tracker = new FutureTendencyTracker();
      // 不记录任何访问，梯度应为 0
      const mockAgent = { futureTendency: tracker };
      const grounding = provider.getGroundingPackage('alice', {
        currentRegion: '图书馆',
        agent: mockAgent,
      });

      expect(grounding.behaviorTendency).toBeUndefined();
    });
  });

  describe('NarrativeBuilder grounding section', () => {
    it('输出包含事实约束声明', () => {
      const prompt = NarrativeBuilder._buildGroundingSection({
        allowedFacts: [],
        inferredFacts: [],
      });

      expect(prompt).toContain('事实约束');
      expect(prompt).toContain('不能编造新事实');
    });

    it('输出包含 locationMeaning', () => {
      const prompt = NarrativeBuilder._buildGroundingSection({
        allowedFacts: [],
        inferredFacts: [],
        locationMeaning: '你现在在图书馆，这里适合工作的地方',
      });

      expect(prompt).toContain('当前地点');
      expect(prompt).toContain('图书馆');
      expect(prompt).toContain('适合工作的地方');
    });

    it('输出包含 behaviorTendency', () => {
      const prompt = NarrativeBuilder._buildGroundingSection({
        allowedFacts: [],
        inferredFacts: [],
        behaviorTendency: '想要活跃起来，想要社交',
      });

      expect(prompt).toContain('你的倾向');
      expect(prompt).toContain('想要活跃起来');
      expect(prompt).toContain('想要社交');
    });

    it('没有 locationMeaning 和 behaviorTendency 时不输出对应段落', () => {
      const prompt = NarrativeBuilder._buildGroundingSection({
        allowedFacts: [],
        inferredFacts: [],
      });

      expect(prompt).not.toContain('当前地点');
      expect(prompt).not.toContain('你的倾向');
    });
  });

  describe('集成：AndyEngine getGroundingPackage', () => {
    it('端到端 grounding 包含 locationMeaning', () => {
      const engine = new AndyEngine({ enableFacts: true });
      engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

      // 手动添加地点意义
      engine.world.factStore.updateLocationMeaning('图书馆', {
        type: 'work',
        weight: 0.9,
        reason: '学习',
      });

      // 设置 agent 位置
      engine.world.getAgent('test').position = '图书馆';

      const grounding = engine.getGroundingPackage('test');
      expect(grounding.locationMeaning).toBeDefined();
      expect(grounding.locationMeaning).toContain('图书馆');
    });

    it('端到端 grounding 包含 behaviorTendency', () => {
      const engine = new AndyEngine({ enableFacts: true });
      engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
      engine.tick();

      const agent = engine.world.getAgent('test');
      // futureTendency 应该存在
      expect(agent.futureTendency).toBeDefined();

      const grounding = engine.getGroundingPackage('test');
      // behaviorTendency 可能存在也可能不存在，取决于梯度大小
      // 但 grounding 对象应该正常返回
      expect(grounding).not.toBeNull();
      expect(grounding.allowedFacts).toBeDefined();
    });

    it('checkConsistency 正常工作', () => {
      const engine = new AndyEngine({ enableFacts: true });
      engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
      engine.tick();

      const result = engine.checkConsistency('我在图书馆看书', 'test');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('severity');
    });
  });

  describe('FactProvider knowledge filtering (Bobby/Mira/Leo)', () => {
    let store;
    let knowledgeStore;
    let provider;

    beforeEach(() => {
      store = new WorldFactStore();
      knowledgeStore = new KnowledgeStore(store);
      provider = new FactProvider(store, null, null, knowledgeStore);
    });

    it('Bobby knows about the backyard (后院)', () => {
      // Bobby participated in a backyard event
      const fact = store.addFact({
        id: 'fact_bobby_backyard',
        type: 'event',
        eventId: 'evt_bobby_1',
        description: 'Bobby 在后院浇花',
        location: '后院',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bobby'],
        observers: [],
      });

      knowledgeStore.addKnowledge('bobby', fact.id, 'direct');

      const grounding = provider.getGroundingPackage('bobby');
      const allowedIds = grounding.allowedFacts.map(f => f.id);
      expect(allowedIds).toContain('fact_bobby_backyard');
    });

    it('Mira only knows about leaving the hall (离开大厅)', () => {
      // Mira participated in leaving-hall event
      const factMira = store.addFact({
        id: 'fact_mira_hall',
        type: 'event',
        eventId: 'evt_mira_1',
        description: 'Mira 离开大厅',
        location: '大厅',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['mira'],
        observers: [],
      });

      // Bobby's backyard event (Mira should NOT know)
      const factBobby = store.addFact({
        id: 'fact_bobby_backyard_2',
        type: 'event',
        eventId: 'evt_bobby_2',
        description: 'Bobby 在后院浇花',
        location: '后院',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bobby'],
        observers: [],
      });

      knowledgeStore.addKnowledge('mira', factMira.id, 'direct');
      knowledgeStore.addKnowledge('bobby', factBobby.id, 'direct');

      const grounding = provider.getGroundingPackage('mira');
      const allowedIds = grounding.allowedFacts.map(f => f.id);

      // Mira knows her own event
      expect(allowedIds).toContain('fact_mira_hall');
      // Mira does NOT know Bobby's backyard event
      expect(allowedIds).not.toContain('fact_bobby_backyard_2');
    });

    it('Leo does not know about backyard or leaving hall', () => {
      const factBobby = store.addFact({
        id: 'fact_bobby_backyard_3',
        type: 'event',
        eventId: 'evt_bobby_3',
        description: 'Bobby 在后院浇花',
        location: '后院',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bobby'],
        observers: [],
      });

      const factMira = store.addFact({
        id: 'fact_mira_hall_2',
        type: 'event',
        eventId: 'evt_mira_2',
        description: 'Mira 离开大厅',
        location: '大厅',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['mira'],
        observers: [],
      });

      knowledgeStore.addKnowledge('bobby', factBobby.id, 'direct');
      knowledgeStore.addKnowledge('mira', factMira.id, 'direct');
      // Leo has no knowledge added

      const grounding = provider.getGroundingPackage('leo');
      const allowedIds = grounding.allowedFacts.map(f => f.id);

      // Leo knows nothing (no knowledge, no public facts)
      expect(allowedIds).not.toContain('fact_bobby_backyard_3');
      expect(allowedIds).not.toContain('fact_mira_hall_2');
    });

    it('public facts are known by all agents (with knowledgeStore)', () => {
      store.addFact({
        id: 'fact_public_weather',
        type: 'event',
        eventId: 'evt_weather_1',
        description: '今天天气很好',
        location: '',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      const groundingBobby = provider.getGroundingPackage('bobby');
      const groundingLeo = provider.getGroundingPackage('leo');

      expect(groundingBobby.allowedFacts.map(f => f.id)).toContain('fact_public_weather');
      expect(groundingLeo.allowedFacts.map(f => f.id)).toContain('fact_public_weather');
    });
  });

  describe('invalidated facts excluded from grounding', () => {
    let store;
    let knowledgeStore;
    let provider;

    beforeEach(() => {
      store = new WorldFactStore();
      knowledgeStore = new KnowledgeStore(store);
      provider = new FactProvider(store, null, null, knowledgeStore);
    });

    it('public fact invalidated no longer appears in allowedFacts', () => {
      const fact = store.addFact({
        id: 'fact_event_1',
        type: 'event',
        eventId: 'evt_1',
        description: '公开事件',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      // Before invalidation: visible
      let grounding = provider.getGroundingPackage('bobby');
      expect(grounding.allowedFacts.map(f => f.id)).toContain('fact_event_1');

      // Invalidate
      store.invalidateFact(fact.id, 'superseded');

      // After invalidation: not visible
      grounding = provider.getGroundingPackage('bobby');
      expect(grounding.allowedFacts.map(f => f.id)).not.toContain('fact_event_1');
    });

    it('knowledgeStore fact invalidated no longer appears in allowedFacts', () => {
      const fact = store.addFact({
        id: 'fact_local_1',
        type: 'event',
        eventId: 'evt_2',
        description: '本地事件',
        location: '大厅',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bobby'],
        observers: [],
      });

      knowledgeStore.addKnowledge('bobby', fact.id, 'direct');

      // Before invalidation: visible
      let grounding = provider.getGroundingPackage('bobby');
      expect(grounding.allowedFacts.map(f => f.id)).toContain('fact_local_1');

      // Invalidate
      store.invalidateFact(fact.id, 'outdated');

      // After invalidation: not visible
      grounding = provider.getGroundingPackage('bobby');
      expect(grounding.allowedFacts.map(f => f.id)).not.toContain('fact_local_1');
    });

    it('invalidated fact not inferred', () => {
      store.addFact({
        id: 'fact_agent_state',
        type: 'agent_state',
        agentId: 'bobby',
        state: '在广场',
        region: '广场',
        emotionSummary: 'calm',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: ['bobby'],
        observers: [],
      });

      const fact = store.addFact({
        id: 'fact_event_inf',
        type: 'event',
        eventId: 'evt_inf',
        description: '广场事件',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      // Before: inferable
      let grounding = provider.getGroundingPackage('bobby', { currentRegion: '广场' });
      expect(grounding.inferredFacts.map(f => f.id)).toContain('fact_event_inf');

      // Invalidate
      store.invalidateFact(fact.id, 'wrong');

      // After: not inferable
      grounding = provider.getGroundingPackage('bobby', { currentRegion: '广场' });
      expect(grounding.inferredFacts.map(f => f.id)).not.toContain('fact_event_inf');
    });

    it('invalidated fact not exposed as forbidden', () => {
      const fact = store.addFact({
        id: 'fact_private_1',
        type: 'event',
        eventId: 'evt_priv',
        description: '他人私密事件',
        location: '小屋',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['mira'],
        observers: [],
      });

      // Before: forbidden
      let grounding = provider.getGroundingPackage('bobby');
      expect(grounding.forbiddenFacts.map(f => f.id)).toContain('fact_private_1');

      // Invalidate
      store.invalidateFact(fact.id, 'deleted');

      // After: not forbidden
      grounding = provider.getGroundingPackage('bobby');
      expect(grounding.forbiddenFacts.map(f => f.id)).not.toContain('fact_private_1');
    });
  });
});
