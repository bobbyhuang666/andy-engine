/**
 * WorldCanon 测试 - Phase W8 扩展
 *
 * 测试失效/覆盖、地点意义、有效事实查询、事实历史查询
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorldFactStore,
  FactType,
  createEventFact,
  createRuleFact,
  createLocationMeaningFact,
} from '../../facts';

describe('WorldCanon - Phase W8', () => {
  let store;

  beforeEach(() => {
    store = new WorldFactStore();
  });

  // ═══════════════════════════════════════════
  // 事实失效/覆盖
  // ═══════════════════════════════════════════

  describe('invalidateFact', () => {
    it('should mark a fact as invalidated', () => {
      const fact = store.addFact({
        id: 'test_fact_1',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt1',
        description: '测试事件',
      });

      const invalidation = store.invalidateFact('test_fact_1', '被新事件替代');

      expect(invalidation).toBeDefined();
      expect(invalidation.type).toBe(FactType.INVALIDATED);
      expect(invalidation.originalFactId).toBe('test_fact_1');
      expect(invalidation.reason).toBe('被新事件替代');
      expect(invalidation.supersededBy).toBeNull();

      const updatedFact = store.getFactById('test_fact_1');
      expect(updatedFact._invalidated).toBe(true);
      expect(updatedFact._invalidationId).toBe(invalidation.id);
    });

    it('should mark a fact as invalidated with supersededBy', () => {
      store.addFact({
        id: 'old_fact',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt_old',
        description: '旧事件',
      });

      store.addFact({
        id: 'new_fact',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt_new',
        description: '新事件',
      });

      const invalidation = store.invalidateFact('old_fact', '被替代', 'new_fact');

      expect(invalidation.supersededBy).toBe('new_fact');
    });

    it('should throw error if fact not found', () => {
      expect(() => {
        store.invalidateFact('nonexistent', '原因');
      }).toThrow('Fact nonexistent not found');
    });
  });

  describe('getActiveFacts', () => {
    it('should return only active facts', () => {
      store.addFact({
        id: 'active_1',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt_active',
        description: '活跃事件',
      });

      store.addFact({
        id: 'inactive_1',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt_inactive',
        description: '失效事件',
      });

      store.invalidateFact('inactive_1', '测试失效');

      const activeFacts = store.getActiveFacts();
      expect(activeFacts.length).toBe(1);
      expect(activeFacts[0].id).toBe('active_1');
    });

    it('should filter by type', () => {
      store.addFact({
        id: 'event_1',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt1',
        description: '事件',
      });

      store.addFact({
        id: 'memory_1',
        type: 'memory',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        agentId: 'agent1',
        content: '记忆内容',
      });

      const eventFacts = store.getActiveFacts([FactType.EVENT]);
      expect(eventFacts.length).toBe(1);
      expect(eventFacts[0].type).toBe(FactType.EVENT);
    });
  });

  describe('getFactHistory', () => {
    it('should return fact history for active fact', () => {
      store.addFact({
        id: 'history_test',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt_history',
        description: '历史测试',
      });

      const history = store.getFactHistory('history_test');

      expect(history).toBeDefined();
      expect(history.current.id).toBe('history_test');
      expect(history.invalidated).toBe(false);
      expect(history.invalidation).toBeNull();
    });

    it('should return fact history for invalidated fact', () => {
      store.addFact({
        id: 'invalidated_test',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt_inv',
        description: '失效测试',
      });

      const invalidation = store.invalidateFact('invalidated_test', '测试原因');

      const history = store.getFactHistory('invalidated_test');

      expect(history).toBeDefined();
      expect(history.current.id).toBe('invalidated_test');
      expect(history.invalidated).toBe(true);
      expect(history.invalidation).toBeDefined();
      expect(history.invalidation.id).toBe(invalidation.id);
    });

    it('should return null for nonexistent fact', () => {
      const history = store.getFactHistory('nonexistent');
      expect(history).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // 地点意义
  // ═══════════════════════════════════════════

  describe('updateLocationMeaning', () => {
    it('should create new location meaning', () => {
      store.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.8, reason: '安静' });

      const meaning = store.getLocationMeaning('图书馆');
      expect(meaning).toBeDefined();
      expect(meaning.location).toBe('图书馆');
      expect(meaning.meaningType).toBe('rest');
      expect(meaning.weight).toBe(0.8);
      expect(meaning.reason).toBe('安静');
    });

    it('should update existing location meaning', () => {
      store.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.8, reason: '安静' });
      store.updateLocationMeaning('图书馆', { type: 'work', weight: 0.9, reason: '学习' });

      const meaning = store.getLocationMeaning('图书馆');
      expect(meaning.meaningType).toBe('work');
      expect(meaning.weight).toBe(0.9);
      expect(meaning.reason).toBe('学习');
    });

    it('should handle multiple locations', () => {
      store.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.8, reason: '安静' });
      store.updateLocationMeaning('食堂', { type: 'social', weight: 0.6, reason: '聚餐' });

      const allMeanings = store.getAllLocationMeanings();
      expect(allMeanings.length).toBe(2);
    });
  });

  describe('getLocationMeaning', () => {
    it('should return null for nonexistent location', () => {
      const meaning = store.getLocationMeaning('不存在的地点');
      expect(meaning).toBeNull();
    });
  });

  describe('getAllLocationMeanings', () => {
    it('should return empty array when no meanings', () => {
      const meanings = store.getAllLocationMeanings();
      expect(meanings).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════
  // 规则事实
  // ═══════════════════════════════════════════

  describe('Rule facts', () => {
    it('should create and store rule facts', () => {
      const rule = createRuleFact({
        ruleId: 'rule_1',
        description: '晚上10点后不能大声喧哗',
        category: 'social',
        priority: 0.8,
        active: true,
      });

      store.addFact(rule);

      const rules = store.getAllFacts([FactType.RULE]);
      expect(rules.length).toBe(1);
      expect(rules[0].ruleId).toBe('rule_1');
      expect(rules[0].category).toBe('social');
    });

    it('should validate rule required fields', () => {
      expect(() => {
        store.addFact({
          type: FactType.RULE,
          timestamp: new Date(),
          source: 'engine',
          confidence: 1.0,
          scope: 'public',
          participants: [],
          observers: [],
        });
      }).toThrow('rule: ruleId is required');
    });
  });

  // ═══════════════════════════════════════════
  // 统计信息
  // ═══════════════════════════════════════════

  describe('getStats', () => {
    it('should include new fact types in stats', () => {
      store.addFact({
        id: 'rule_1',
        type: FactType.RULE,
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        ruleId: 'r1',
        description: '测试规则',
      });

      store.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.8 });

      const stats = store.getStats();
      expect(stats.byType[FactType.RULE]).toBe(1);
      expect(stats.byType[FactType.LOCATION_MEANING]).toBe(1);
    });
  });

  // ═══════════════════════════════════════════
  // 序列化
  // ═══════════════════════════════════════════

  describe('serialization', () => {
    it('should serialize and deserialize with new fact types', () => {
      store.addFact({
        id: 'rule_1',
        type: FactType.RULE,
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        ruleId: 'r1',
        description: '测试规则',
      });

      store.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.8 });

      const json = store.toJSON();
      const restored = WorldFactStore.fromJSON(json);

      expect(restored.size).toBe(2);
      expect(restored.getAllFacts([FactType.RULE]).length).toBe(1);
      expect(restored.getAllLocationMeanings().length).toBe(1);
    });

    it('should preserve invalidation state after serialization', () => {
      store.addFact({
        id: 'fact_1',
        type: 'event',
        timestamp: new Date(),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
        eventId: 'evt1',
        description: '测试',
      });

      store.invalidateFact('fact_1', '失效原因');

      const json = store.toJSON();
      const restored = WorldFactStore.fromJSON(json);

      const history = restored.getFactHistory('fact_1');
      expect(history.invalidated).toBe(true);
      expect(history.invalidation).toBeDefined();
    });
  });
});
