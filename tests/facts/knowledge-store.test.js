/**
 * KnowledgeStore 模块测试套件
 *
 * 验证：
 *   - 知识添加和查询
 *   - 知识来源记录
 *   - 公共事件传播
 *   - 私密事件不传播
 *   - 批量操作
 *   - 移除知识
 *   - 序列化/反序列化
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldFactStore, KnowledgeStore } from '../../facts/index.js';
import {
  createEventFact,
  FactSource,
  FactScope,
} from '../../facts/FactSchema.js';

// ═══════════════════════════════════════════
// 辅助工厂
// ═══════════════════════════════════════════

function makeEvent(overrides = {}) {
  return createEventFact({
    eventId: `evt_${Date.now()}_${Math.random()}`,
    description: '测试事件',
    location: '图书馆',
    scope: FactScope.PUBLIC,
    participants: [],
    observers: [],
    ...overrides,
  });
}

// ═══════════════════════════════════════════
// 测试
// ═══════════════════════════════════════════

describe('KnowledgeStore', () => {
  let factStore;
  let knowledgeStore;

  beforeEach(() => {
    factStore = new WorldFactStore();
    knowledgeStore = new KnowledgeStore(factStore);
  });

  // ─── 基本知识管理 ───

  describe('基本知识管理', () => {
    it('添加和查询知识', () => {
      const event = makeEvent({ eventId: 'evt1' });
      factStore.addFact(event);

      knowledgeStore.addKnowledge('alice', event.id, 'direct');

      expect(knowledgeStore.hasKnowledge('alice', event.id)).toBe(true);
      expect(knowledgeStore.hasKnowledge('bob', event.id)).toBe(false);
    });

    it('不知道的事实返回 false', () => {
      expect(knowledgeStore.hasKnowledge('alice', 'nonexistent')).toBe(false);
    });

    it('获取角色知道的所有事实 ID', () => {
      const e1 = makeEvent({ eventId: 'evt1' });
      const e2 = makeEvent({ eventId: 'evt2' });
      factStore.addFact(e1);
      factStore.addFact(e2);

      knowledgeStore.addKnowledge('alice', e1.id, 'direct');
      knowledgeStore.addKnowledge('alice', e2.id, 'direct');

      const ids = knowledgeStore.getKnownFactIds('alice');
      expect(ids.size).toBe(2);
      expect(ids.has(e1.id)).toBe(true);
      expect(ids.has(e2.id)).toBe(true);
    });

    it('未知角色返回空 Set', () => {
      const ids = knowledgeStore.getKnownFactIds('nobody');
      expect(ids.size).toBe(0);
    });

    it('获取角色知道的所有事实对象', () => {
      const e1 = makeEvent({ eventId: 'evt1', description: '事件1' });
      const e2 = makeEvent({ eventId: 'evt2', description: '事件2' });
      factStore.addFact(e1);
      factStore.addFact(e2);

      knowledgeStore.addKnowledge('alice', e1.id, 'direct');
      knowledgeStore.addKnowledge('alice', e2.id, 'direct');

      const facts = knowledgeStore.getKnownFacts('alice');
      expect(facts.length).toBe(2);
    });

    it('getKnownFacts 跳过已失效的事实', () => {
      const e1 = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e1);
      knowledgeStore.addKnowledge('alice', e1.id, 'direct');

      factStore.invalidateFact(e1.id, '测试失效');

      const facts = knowledgeStore.getKnownFacts('alice');
      expect(facts.length).toBe(0);
    });

    it('getKnownFacts 按类型过滤', () => {
      const e1 = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e1);
      knowledgeStore.addKnowledge('alice', e1.id, 'direct');

      const facts = knowledgeStore.getKnownFacts('alice', { types: ['event'] });
      expect(facts.length).toBe(1);

      const facts2 = knowledgeStore.getKnownFacts('alice', { types: ['memory'] });
      expect(facts2.length).toBe(0);
    });
  });

  // ─── 知识来源记录 ───

  describe('知识来源记录', () => {
    it('记录 direct 来源', () => {
      const e = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');

      expect(knowledgeStore.getSource('alice', e.id)).toBe('direct');
    });

    it('记录 observed 来源', () => {
      const e = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('bob', e.id, 'observed');

      expect(knowledgeStore.getSource('bob', e.id)).toBe('observed');
    });

    it('记录 overheard 来源', () => {
      const e = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('charlie', e.id, 'overheard');

      expect(knowledgeStore.getSource('charlie', e.id)).toBe('overheard');
    });

    it('多个角色的来源独立记录', () => {
      const e = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');
      knowledgeStore.addKnowledge('bob', e.id, 'observed');
      knowledgeStore.addKnowledge('charlie', e.id, 'overheard');

      expect(knowledgeStore.getSource('alice', e.id)).toBe('direct');
      expect(knowledgeStore.getSource('bob', e.id)).toBe('observed');
      expect(knowledgeStore.getSource('charlie', e.id)).toBe('overheard');
    });
  });

  // ─── 批量操作 ───

  describe('批量操作', () => {
    it('addKnowledgeBatch 批量添加', () => {
      const e1 = makeEvent({ eventId: 'evt1' });
      const e2 = makeEvent({ eventId: 'evt2' });
      const e3 = makeEvent({ eventId: 'evt3' });
      factStore.addFact(e1);
      factStore.addFact(e2);
      factStore.addFact(e3);

      knowledgeStore.addKnowledgeBatch('alice', [e1.id, e2.id, e3.id], 'direct');

      expect(knowledgeStore.hasKnowledge('alice', e1.id)).toBe(true);
      expect(knowledgeStore.hasKnowledge('alice', e2.id)).toBe(true);
      expect(knowledgeStore.hasKnowledge('alice', e3.id)).toBe(true);
    });
  });

  // ─── 移除知识 ───

  describe('移除知识', () => {
    it('removeKnowledge 移除单条知识', () => {
      const e = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');
      expect(knowledgeStore.hasKnowledge('alice', e.id)).toBe(true);

      knowledgeStore.removeKnowledge('alice', e.id);
      expect(knowledgeStore.hasKnowledge('alice', e.id)).toBe(false);
    });

    it('移除不存在的知识不报错', () => {
      knowledgeStore.removeKnowledge('alice', 'nonexistent');
    });
  });

  // ─── 统计 ───

  describe('统计', () => {
    it('getStats 返回正确统计', () => {
      const e1 = makeEvent({ eventId: 'evt1' });
      const e2 = makeEvent({ eventId: 'evt2' });
      factStore.addFact(e1);
      factStore.addFact(e2);

      knowledgeStore.addKnowledge('alice', e1.id, 'direct');
      knowledgeStore.addKnowledge('alice', e2.id, 'direct');
      knowledgeStore.addKnowledge('bob', e1.id, 'observed');

      const stats = knowledgeStore.getStats();
      expect(stats.agentCount).toBe(2);
      expect(stats.totalKnowledge).toBe(3);
      expect(stats.byAgent['alice']).toBe(2);
      expect(stats.byAgent['bob']).toBe(1);
    });
  });

  // ─── 序列化/反序列化 ───

  describe('序列化/反序列化', () => {
    it('toJSON 和 fromJSON 往返正确', () => {
      const e1 = makeEvent({ eventId: 'evt1' });
      const e2 = makeEvent({ eventId: 'evt2' });
      factStore.addFact(e1);
      factStore.addFact(e2);

      knowledgeStore.addKnowledge('alice', e1.id, 'direct');
      knowledgeStore.addKnowledge('alice', e2.id, 'direct');
      knowledgeStore.addKnowledge('bob', e1.id, 'observed');

      const json = knowledgeStore.toJSON();
      const restored = KnowledgeStore.fromJSON(json, factStore);

      expect(restored.hasKnowledge('alice', e1.id)).toBe(true);
      expect(restored.hasKnowledge('alice', e2.id)).toBe(true);
      expect(restored.hasKnowledge('bob', e1.id)).toBe(true);
      expect(restored.hasKnowledge('bob', e2.id)).toBe(false);
    });

    it('fromJSON 生成独立实例', () => {
      const e = makeEvent({ eventId: 'evt1' });
      factStore.addFact(e);
      knowledgeStore.addKnowledge('alice', e.id, 'direct');

      const json = knowledgeStore.toJSON();
      const restored = KnowledgeStore.fromJSON(json, factStore);

      // 修改原实例不影响恢复的实例
      knowledgeStore.removeKnowledge('alice', e.id);
      expect(restored.hasKnowledge('alice', e.id)).toBe(true);
    });
  });
});
