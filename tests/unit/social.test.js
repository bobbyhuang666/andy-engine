/**
 * SocialGraph 模块测试套件
 *
 * 迁移自 test.js 行 276-335
 * 原始 assert 数量：15 个
 */

import { describe, it, expect, beforeEach } from 'vitest';
import SocialGraph from '../../social/SocialGraph.js';

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
});
