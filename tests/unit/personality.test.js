/**
 * Personality 模块测试套件
 *
 * 迁移自 test.js 行 67-107
 * 原始 assert 数量：17 个
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Personality from '../../src/agent/psychology/Personality.js';

describe('Personality 模块', () => {
  describe('MBTI 映射', () => {
    let infp;

    beforeAll(() => {
      infp = new Personality({ mbti: 'INFP' });
    });

    it('INFP 应该有高开放性', () => {
      expect(infp.ocean.openness).toBeGreaterThan(0.7);
    });

    it('INFP 应该有低外向性', () => {
      expect(infp.ocean.extraversion).toBeLessThan(0.3);
    });

    it('INFP 应该有中高情绪惯性', () => {
      expect(infp.behavior.emotionalInertia).toBeGreaterThan(0.4);
    });

    it('默认 MBTI 应该是 INFP', () => {
      const p = new Personality();
      expect(p.mbti).toBe('INFP');
    });
  });

  describe('直接 OCEAN 值', () => {
    it('应该保持显式的 OCEAN 值', () => {
      const p = new Personality({
        ocean: { openness: 0.9, extraversion: 0.8 },
      });
      expect(p.ocean.openness).toBe(0.9);
      expect(p.ocean.extraversion).toBe(0.8);
    });
  });

  describe('序列化/反序列化', () => {
    it('应该保持 OCEAN 值', () => {
      const p1 = new Personality({ mbti: 'INFP' });
      const json = p1.toJSON();
      const p2 = Personality.fromJSON(json);

      expect(p2.ocean.openness).toBe(p1.ocean.openness);
      expect(p2.mbti).toBe('INFP');
    });
  });

  describe('行为参数范围检查', () => {
    let p;

    beforeAll(() => {
      p = new Personality({ mbti: 'INFP' });
    });

    it('emotionalInertia 应该在 [0,1]', () => {
      expect(p.behavior.emotionalInertia).toBeGreaterThanOrEqual(0);
      expect(p.behavior.emotionalInertia).toBeLessThanOrEqual(1);
    });

    it('susceptibility 应该在 [0,1]', () => {
      expect(p.behavior.susceptibility).toBeGreaterThanOrEqual(0);
      expect(p.behavior.susceptibility).toBeLessThanOrEqual(1);
    });

    it('expressiveness 应该在 [0,1]', () => {
      expect(p.behavior.expressiveness).toBeGreaterThanOrEqual(0);
      expect(p.behavior.expressiveness).toBeLessThanOrEqual(1);
    });

    it('socialInitiative 应该在 [0,1]', () => {
      expect(p.behavior.socialInitiative).toBeGreaterThanOrEqual(0);
      expect(p.behavior.socialInitiative).toBeLessThanOrEqual(1);
    });
  });

  describe('MBTI + OCEAN 覆盖', () => {
    it('显式 ocean 应该覆盖 MBTI 默认值', () => {
      const p = new Personality({
        mbti: 'INFJ',
        ocean: { neuroticism: 0.85 },
      });
      expect(p.ocean.neuroticism).toBe(0.85);
    });

    it('未覆盖的维度应该保持 MBTI 默认值', () => {
      const p = new Personality({
        mbti: 'INFJ',
        ocean: { neuroticism: 0.85 },
      });
      expect(p.ocean.openness).toBe(0.80); // INFJ 默认
    });

    it('MBTI 应该被保留', () => {
      const p = new Personality({
        mbti: 'INFJ',
        ocean: { neuroticism: 0.85 },
      });
      expect(p.mbti).toBe('INFJ');
    });

    it('高神经质应该产生更高的情绪惯性', () => {
      const pHigh = new Personality({
        mbti: 'INFJ',
        ocean: { neuroticism: 0.85 },
      });
      const pLow = new Personality({ mbti: 'INFJ' }); // neuroticism=0.50

      expect(pHigh.behavior.emotionalInertia).toBeGreaterThan(
        pLow.behavior.emotionalInertia
      );
    });
  });
});
