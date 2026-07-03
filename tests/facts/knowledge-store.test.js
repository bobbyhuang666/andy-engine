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
 *   - Evidence 结构化
 *   - 向后兼容
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldFactStore, KnowledgeStore } from '../../facts/index.js';
import {
  createEventFact,
  createAgentStateFact,
  FactSource,
  FactScope,
} from '../../src/canon/FactSchema.js';

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

    it('hasKnowledge/getKnownFactIds use zero-copy active fact checks', () => {
      const e1 = makeEvent({ eventId: 'evt1' });
      const e2 = makeEvent({ eventId: 'evt2' });
      factStore.addFact(e1);
      factStore.addFact(e2);
      knowledgeStore.addKnowledge('alice', e1.id, 'direct');
      knowledgeStore.addKnowledge('alice', e2.id, 'direct');

      const getFactSpy = vi.spyOn(factStore, 'getFactById');
      const activeSpy = vi.spyOn(factStore, '_hasActiveFact');

      expect(knowledgeStore.hasKnowledge('alice', e1.id)).toBe(true);
      const ids = knowledgeStore.getKnownFactIds('alice');
      expect(ids.size).toBe(2);

      expect(activeSpy).toHaveBeenCalledTimes(3);
      expect(getFactSpy).not.toHaveBeenCalled();
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

    it('factStore.removeFact 同步清理 knowledge/evidence 内部索引', () => {
      factStore.setKnowledgeStore(knowledgeStore);
      const stateFact = createAgentStateFact({
        agentId: 'alice',
        state: 'focused',
        region: 'room_a',
        emotionSummary: 'calm',
        scope: FactScope.LOCAL,
        participants: ['alice'],
      });
      const added = factStore.addFact(stateFact);
      knowledgeStore.addKnowledge('alice', added.id, 'direct');

      expect(knowledgeStore.hasKnowledge('alice', added.id)).toBe(true);
      expect(factStore.removeFact(added.id)).toBe(true);

      expect(knowledgeStore.hasKnowledge('alice', added.id)).toBe(false);
      expect(knowledgeStore.getStats()).toEqual({
        agentCount: 0,
        totalKnowledge: 0,
        byAgent: {},
      });
      expect(knowledgeStore.toJSON().evidence).toEqual({});
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

    it('fromJSON 清理已不存在事实的 knowledge 和 evidence', () => {
      const e = makeEvent({ eventId: 'evt_active' });
      factStore.addFact(e);

      const restored = KnowledgeStore.fromJSON({
        knowledge: {
          alice: [e.id, 'fact_missing_1'],
          bob: ['fact_missing_2'],
        },
        evidence: {
          [`alice:${e.id}`]: { source: 'direct' },
          'alice:fact_missing_1': { source: 'observed' },
          'bob:fact_missing_2': { source: 'told' },
          'orphan:fact_missing_3': { source: 'inferred' },
        },
      }, factStore);

      expect(restored.hasKnowledge('alice', e.id)).toBe(true);
      expect(restored.hasKnowledge('alice', 'fact_missing_1')).toBe(false);
      expect(restored.hasKnowledge('bob', 'fact_missing_2')).toBe(false);
      expect(restored.getStats()).toEqual({
        agentCount: 1,
        totalKnowledge: 1,
        byAgent: { alice: 1 },
      });
      expect(Object.keys(restored.toJSON().evidence)).toEqual([`alice:${e.id}`]);
    });
  });

  // ─── Evidence 结构化 ───

  describe('Evidence 结构化', () => {
    it('addKnowledge 传 string → 内部 Evidence 包含 source+confidence+learnedAt=0', () => {
      const e = makeEvent({ eventId: 'evt_evidence_1' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');

      const evidence = knowledgeStore.getEvidence('alice', e.id);
      expect(evidence).toBeDefined();
      expect(typeof evidence).toBe('object');
      expect(evidence.source).toBe('direct');
      expect(evidence.confidence).toBe(1.0);
      expect(evidence.learnedAt).toBe(0);
      expect(evidence.propagatedFrom).toBeNull();
      expect(evidence.eventId).toBeNull();
    });

    it('addKnowledge 传 Evidence object → 原样存储', () => {
      const e = makeEvent({ eventId: 'evt_evidence_2' });
      factStore.addFact(e);

      const evidenceObj = {
        source: 'overheard',
        confidence: 0.7,
        learnedAt: 12345,
        propagatedFrom: 'bob',
        eventId: 'evt_social_1',
      };
      knowledgeStore.addKnowledge('alice', e.id, evidenceObj);

      const evidence = knowledgeStore.getEvidence('alice', e.id);
      expect(evidence.source).toBe('overheard');
      expect(evidence.confidence).toBe(0.7);
      expect(evidence.learnedAt).toBe(12345);
      expect(evidence.propagatedFrom).toBe('bob');
      expect(evidence.eventId).toBe('evt_social_1');
    });

    it('addKnowledge 传 Evidence object 缺字段 → 默认值填充', () => {
      const e = makeEvent({ eventId: 'evt_evidence_3' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, { source: 'observed' });

      const evidence = knowledgeStore.getEvidence('alice', e.id);
      expect(evidence.source).toBe('observed');
      expect(evidence.confidence).toBe(0.9);
      expect(evidence.learnedAt).toBe(0);
      expect(evidence.propagatedFrom).toBeNull();
      expect(evidence.eventId).toBeNull();
    });

    it('getSource 返回 source string（向后兼容）', () => {
      const e = makeEvent({ eventId: 'evt_evidence_4' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');
      expect(knowledgeStore.getSource('alice', e.id)).toBe('direct');

      knowledgeStore.addKnowledge('alice', e.id, { source: 'told', confidence: 0.6 });
      expect(knowledgeStore.getSource('alice', e.id)).toBe('told');
    });

    it('getEvidence 返回完整 Evidence', () => {
      const e = makeEvent({ eventId: 'evt_evidence_5' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');

      const evidence = knowledgeStore.getEvidence('alice', e.id);
      expect(evidence).toBeDefined();
      expect(evidence.confidence).toBe(1.0);
      expect(evidence.source).toBe('direct');
    });

    it('未知 agent/fact → getEvidence 返回 null', () => {
      expect(knowledgeStore.getEvidence('nobody', 'nonexistent')).toBeNull();
      expect(knowledgeStore.getEvidence('alice', 'nonexistent')).toBeNull();
    });

    it('toJSON 包含 evidence key', () => {
      const e = makeEvent({ eventId: 'evt_evidence_6' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');

      const json = knowledgeStore.toJSON();
      expect(json).toHaveProperty('evidence');
      expect(typeof json.evidence).toBe('object');
      const key = `alice:${e.id}`;
      expect(json.evidence[key]).toBeDefined();
      expect(json.evidence[key].source).toBe('direct');
      expect(json.evidence[key].confidence).toBe(1.0);
    });

    it('toJSON 也包含 sources 兼容 key', () => {
      const e = makeEvent({ eventId: 'evt_evidence_7' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');

      const json = knowledgeStore.toJSON();
      expect(json).toHaveProperty('sources');
      // sources 内容应与 evidence 一致
      const key = `alice:${e.id}`;
      expect(json.sources[key]).toBeDefined();
      expect(json.sources[key].source).toBe('direct');
      expect(json.sources[key].confidence).toBe(1.0);
    });

    it('fromJSON 新格式 → 正确恢复 Evidence', () => {
      const e = makeEvent({ eventId: 'evt_evidence_8' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');
      const json = knowledgeStore.toJSON();

      const restored = KnowledgeStore.fromJSON(json, factStore);
      expect(restored.hasKnowledge('alice', e.id)).toBe(true);
      const evidence = restored.getEvidence('alice', e.id);
      expect(evidence).toBeDefined();
      expect(evidence.source).toBe('direct');
      expect(evidence.confidence).toBe(1.0);
    });

    it('fromJSON 旧格式（sources 为 string）→ 归一化为 Evidence', () => {
      const e = makeEvent({ eventId: 'evt_evidence_9' });
      factStore.addFact(e);

      const oldFormat = {
        knowledge: { alice: [e.id] },
        sources: { [`alice:${e.id}`]: 'direct' },
      };

      const restored = KnowledgeStore.fromJSON(oldFormat, factStore);
      expect(restored.hasKnowledge('alice', e.id)).toBe(true);
      expect(restored.getSource('alice', e.id)).toBe('direct');
      const evidence = restored.getEvidence('alice', e.id);
      expect(evidence).toBeDefined();
      expect(evidence.source).toBe('direct');
      expect(evidence.confidence).toBe(1.0);
      expect(evidence.learnedAt).toBe(0);
    });

    it('fromJSON 旧格式（sources 为 object）→ 直接使用', () => {
      const e = makeEvent({ eventId: 'evt_evidence_10' });
      factStore.addFact(e);

      const oldUpgradedFormat = {
        knowledge: { alice: [e.id] },
        sources: {
          [`alice:${e.id}`]: {
            source: 'overheard',
            confidence: 0.7,
            learnedAt: 5000,
            propagatedFrom: null,
            eventId: null,
          },
        },
      };

      const restored = KnowledgeStore.fromJSON(oldUpgradedFormat, factStore);
      expect(restored.hasKnowledge('alice', e.id)).toBe(true);
      const evidence = restored.getEvidence('alice', e.id);
      expect(evidence).toBeDefined();
      expect(evidence.source).toBe('overheard');
      expect(evidence.confidence).toBe(0.7);
      expect(evidence.learnedAt).toBe(5000);
    });

    it('新旧格式 round-trip 不影响数据完整性', () => {
      const e1 = makeEvent({ eventId: 'evt_rt_1' });
      const e2 = makeEvent({ eventId: 'evt_rt_2' });
      factStore.addFact(e1);
      factStore.addFact(e2);

      knowledgeStore.addKnowledge('alice', e1.id, 'direct');
      knowledgeStore.addKnowledge('alice', e2.id, {
        source: 'told',
        confidence: 0.6,
        learnedAt: 100000,
        propagatedFrom: 'bob',
        eventId: 'evt_social_2',
      });

      const json1 = knowledgeStore.toJSON();
      const restored = KnowledgeStore.fromJSON(json1, factStore);
      const json2 = restored.toJSON();

      // Compare knowledge
      expect(json2.knowledge).toEqual(json1.knowledge);
      // Compare evidence
      expect(json2.evidence).toEqual(json1.evidence);
      // Compare sources alias
      expect(json2.sources).toEqual(json1.sources);
    });

    it('旧格式 JSON 能正常加载（backward compat）', () => {
      const e = makeEvent({ eventId: 'evt_bc_1' });
      factStore.addFact(e);

      const oldJson = {
        knowledge: { alice: [e.id] },
        sources: { [`alice:${e.id}`]: 'direct' },
      };

      const restored = KnowledgeStore.fromJSON(oldJson, factStore);
      expect(restored.hasKnowledge('alice', e.id)).toBe(true);
      expect(restored.getSource('alice', e.id)).toBe('direct');
    });

    it('旧 addKnowledge 调用（传 string）仍有效', () => {
      const e = makeEvent({ eventId: 'evt_bc_2' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'overheard');

      expect(knowledgeStore.getSource('alice', e.id)).toBe('overheard');
      const evidence = knowledgeStore.getEvidence('alice', e.id);
      expect(evidence.confidence).toBe(0.7);
      expect(evidence.source).toBe('overheard');
    });

    it('addKnowledgeBatch 传 string 仍有效', () => {
      const e1 = makeEvent({ eventId: 'evt_bc_3' });
      const e2 = makeEvent({ eventId: 'evt_bc_4' });
      factStore.addFact(e1);
      factStore.addFact(e2);

      knowledgeStore.addKnowledgeBatch('alice', [e1.id, e2.id], 'observed');

      expect(knowledgeStore.getSource('alice', e1.id)).toBe('observed');
      expect(knowledgeStore.getSource('alice', e2.id)).toBe('observed');
      expect(knowledgeStore.getEvidence('alice', e1.id).confidence).toBe(0.9);
    });

    it('removeKnowledge 同步清理 evidence', () => {
      const e = makeEvent({ eventId: 'evt_rm_ev' });
      factStore.addFact(e);

      knowledgeStore.addKnowledge('alice', e.id, 'direct');
      expect(knowledgeStore.getEvidence('alice', e.id)).toBeDefined();

      knowledgeStore.removeKnowledge('alice', e.id);
      expect(knowledgeStore.getEvidence('alice', e.id)).toBeNull();
    });
  });
});
