/**
 * SocialGraph 模块测试套件
 *
 * 迁移自 test.js 行 276-335
 * 原始 assert 数量：15 个
 */

import { describe, it, expect, beforeEach } from 'vitest';
import SocialGraph from '../../src/social/SocialGraph.js';
import { ANDY_DEFAULTS } from '../../src/config/defaults.js';

describe('SocialGraph 模块', () => {
  let graph;
  let relAB;

  beforeEach(() => {
    graph = new SocialGraph();
    graph.addAgent('A');
    graph.addAgent('B');
    graph.addAgent('C');
    relAB = graph.getOrCreateRelationship('A', 'B');
  });

  describe('关系创建', () => {
    it('新关系应该有正强度', () => {
      expect(relAB.strength).toBeGreaterThan(0);
    });

    it('关系应该是双向的（同一对象）', () => {
      const relBA = graph.getRelationship('B', 'A');
      expect(relBA).toBe(relAB);
    });

    it('Agent 应该有关系', () => {
      const relsA = graph.getRelationships('A');
      expect(relsA.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('交互记录', () => {
    it('交互次数应该增加', () => {
      relAB.recordInteraction('talk', 0.5, '聊天');
      expect(relAB.interactionCount).toBe(1);
    });

    it('正面交互应该增加强度', () => {
      relAB.recordInteraction('talk', 0.5, '聊天');
      expect(relAB.strength).toBeGreaterThan(0.05);
    });

    it('多次交互应该达到 acquaintance 级别', () => {
      for (let i = 0; i < 8; i++) {
        relAB.recordInteraction('talk', 0.5, '聊天');
      }
      expect(relAB.strength).toBeGreaterThan(0.15);
    });
  });

  describe('关系类型', () => {
    it('应该是有效类型', () => {
      relAB.recordInteraction('talk', 0.5, '聊天');
      expect(['stranger', 'acquaintance', 'friend', 'closeFriend']).toContain(relAB.type);
    });
  });

  describe('关系衰减', () => {
    it('无交互时强度应该下降', () => {
      relAB.recordInteraction('talk', 0.5, '聊天');
      const prevStrength = relAB.strength;
      graph.tick(24); // 24 小时
      expect(relAB.strength).toBeLessThanOrEqual(prevStrength);
    });
  });

  describe('社交距离', () => {
    it('应该正确计算社交距离', () => {
      // 建立 A-B 关系（需要足够交互达到 acquaintance 级别）
      for (let i = 0; i < 12; i++) {
        relAB.recordInteraction('talk', 0.5, '聊天');
      }
      expect(relAB.strength).toBeGreaterThan(0.15);

      // 建立 B-C 关系
      const relBC = graph.getOrCreateRelationship('B', 'C');
      for (let i = 0; i < 12; i++) {
        relBC.recordInteraction('talk', 0.5);
      }
      expect(relBC.strength).toBeGreaterThan(0.15);

      // A-C 距离应该是 2
      const distAC = graph.getSocialDistance('A', 'C');
      expect(distAC).toBe(2);
    });
  });

  describe('自定义关系配置', () => {
    it('applies a partial threshold override consistently across graph queries', () => {
      const g = new SocialGraph(null, { threshold: { acquaintance: 0.9 } });
      const ab = g.getOrCreateRelationship('A', 'B');
      const bc = g.getOrCreateRelationship('B', 'C');
      ab.strength = 0.5;
      bc.strength = 0.5;

      expect(g.getCommonFriends('A', 'C')).toEqual([]);
      expect(g.isTwoHopsAway('A', 'C')).toBe(false);
      expect(g.getSocialDistance('A', 'C')).toBe(-1);
    });

    it('passes merged config into relationships without dropping nested defaults', () => {
      const g = new SocialGraph(null, {
        initialStrength: 0.22,
        threshold: { acquaintance: 0.2 },
      });
      const rel = g.getOrCreateRelationship('A', 'B');

      expect(rel.strength).toBe(0.22);
      expect(rel._cfg.threshold.friend).toBe(ANDY_DEFAULTS.relationship.threshold.friend);
      expect(rel._cfg.threshold.closeFriend).toBe(ANDY_DEFAULTS.relationship.threshold.closeFriend);

      rel.strength = 0.95;
      rel._updateType();
      expect(rel.type).toBe('closeFriend');
    });

    it('restores saved edges with the graph relationship config', () => {
      const saved = {
        edges: [{
          agentA: 'A',
          agentB: 'B',
          type: 'stranger',
          strength: 0.35,
          lastInteraction: '2026-06-01T00:00:00.000Z',
          impression: { positive: 0, negative: 0 },
          history: [],
        }],
        _tickCount: 0,
      };
      const g = SocialGraph.fromJSON(saved, { threshold: { friend: 0.3 } });
      const rel = g.getRelationship('A', 'B');

      rel._updateType();
      expect(rel.type).toBe('friend');
    });
  });

  describe('共同朋友', () => {
    it('应该找到共同朋友', () => {
      // 建立 A-B 关系
      for (let i = 0; i < 12; i++) {
        relAB.recordInteraction('talk', 0.5, '聊天');
      }
      expect(relAB.strength).toBeGreaterThan(0.15);

      // 建立 B-C 关系
      const relBC = graph.getOrCreateRelationship('B', 'C');
      for (let i = 0; i < 12; i++) {
        relBC.recordInteraction('talk', 0.5);
      }
      expect(relBC.strength).toBeGreaterThan(0.15);

      const common = graph.getCommonFriends('A', 'C');
      expect(common).toContain('B');
    });
  });

  describe('影响传播', () => {
    it('应该找到影响目标', () => {
      for (let i = 0; i < 5; i++) {
        relAB.recordInteraction('talk', 0.5, '聊天');
      }

      const targets = graph.getInfluenceTargets('A');
      expect(targets.length).toBeGreaterThan(0);
      expect(targets[0].weight).toBeGreaterThan(0);
    });
  });

  describe('Dunbar 层级限制', () => {
    it('downgraded strong ties are counted against medium tie cap in the same pass', () => {
      const g = new SocialGraph();
      g.addAgent('A');
      const total = ANDY_DEFAULTS.relationship.maxStrongTies + ANDY_DEFAULTS.relationship.maxMediumTies + 5;

      for (let i = 0; i < total; i++) {
        const other = `B${i}`;
        g.addAgent(other);
        const rel = g.getOrCreateRelationship('A', other);
        rel.strength = 0.65 - i * 0.001;
        rel._updateType();
      }

      g._enforceDunbarLimits();

      const layers = g.getLayers('A');
      const strongCount = layers.closeFriends.length + layers.friends.length;
      const mediumCount = layers.acquaintances.length;
      expect(strongCount).toBeLessThanOrEqual(ANDY_DEFAULTS.relationship.maxStrongTies);
      expect(mediumCount).toBeLessThanOrEqual(ANDY_DEFAULTS.relationship.maxMediumTies);
    });

    it('does not mutate a shared relationship when only one agent exceeds capacity', () => {
      const g = new SocialGraph();
      g.addAgent('A');
      g.addAgent('B');

      let relAB;
      for (let i = 0; i <= ANDY_DEFAULTS.relationship.maxStrongTies; i++) {
        const other = i === ANDY_DEFAULTS.relationship.maxStrongTies ? 'B' : `A_friend_${i}`;
        g.addAgent(other);
        const rel = g.getOrCreateRelationship('A', other);
        rel.strength = 0.8 - i * 0.01;
        rel._updateType();
        if (other === 'B') relAB = rel;
      }

      const beforeStrength = relAB.strength;
      const beforeType = relAB.type;

      g._enforceDunbarLimits();

      expect(relAB.strength).toBe(beforeStrength);
      expect(relAB.type).toBe(beforeType);

      const layersA = g.getLayers('A');
      const strongA = layersA.closeFriends.length + layersA.friends.length;
      expect(strongA).toBe(ANDY_DEFAULTS.relationship.maxStrongTies);
      expect(layersA.acquaintances).toContain(relAB);

      const layersB = g.getLayers('B');
      const strongB = layersB.closeFriends.length + layersB.friends.length;
      expect(strongB).toBe(1);
      expect([...layersB.closeFriends, ...layersB.friends]).toContain(relAB);
    });
  });
});
