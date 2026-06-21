/**
 * LocationMeaningInfluence 测试套件
 */

import { describe, it, expect, beforeEach } from 'vitest';
import LocationMeaningInfluence from '../../src/agent/psychology/LocationMeaningInfluence.js';
import WorldFactStore from '../../src/canon/WorldFactStore.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

describe('LocationMeaningInfluence', () => {
  let factStore;
  let influence;
  let domain;

  beforeEach(() => {
    factStore = new WorldFactStore();
    domain = getDefaultDomain();
    influence = new LocationMeaningInfluence(factStore, domain);
  });

  describe('computeGradient', () => {
    it('无 factStore 时返回零梯度', () => {
      const noStoreInfluence = new LocationMeaningInfluence(null, domain);
      const grad = noStoreInfluence.computeGradient('图书馆', [0.5, 0.5, 0.5, 0.5]);
      expect(grad).toEqual([0, 0, 0, 0]);
    });

    it('无地点意义时返回零梯度', () => {
      const grad = influence.computeGradient('未知地点', [0.5, 0.5, 0.5, 0.5]);
      expect(grad).toEqual([0, 0, 0, 0]);
    });

    it('rest 类型地点降低活动度和社交性', () => {
      factStore.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.8, reason: '安静' });
      const grad = influence.computeGradient('图书馆', [0.5, 0.5, 0.5, 0.5]);

      expect(grad[0]).toBeLessThan(0); // activity 降低
      expect(grad[1]).toBeLessThan(0); // sociality 降低
      expect(grad[2]).toBeLessThan(0); // focus 降低
      expect(grad[3]).toBeLessThan(0); // expressiveness 降低
    });

    it('work 类型地点提高活动度和专注度', () => {
      factStore.updateLocationMeaning('办公室', { type: 'work', weight: 0.7, reason: '工作' });
      const grad = influence.computeGradient('办公室', [0.5, 0.5, 0.5, 0.5]);

      expect(grad[0]).toBeGreaterThan(0); // activity 提高
      expect(grad[2]).toBeGreaterThan(0); // focus 提高
      expect(grad[1]).toBe(0);           // sociality 不变
      expect(grad[3]).toBe(0);           // expressiveness 不变
    });

    it('social 类型地点提高社交性和表达欲', () => {
      factStore.updateLocationMeaning('食堂', { type: 'social', weight: 0.6, reason: '人多' });
      const grad = influence.computeGradient('食堂', [0.5, 0.5, 0.5, 0.5]);

      expect(grad[0]).toBe(0);           // activity 不变
      expect(grad[1]).toBeGreaterThan(0); // sociality 提高
      expect(grad[2]).toBe(0);           // focus 不变
      expect(grad[3]).toBeGreaterThan(0); // expressiveness 提高
    });

    it('explore 类型地点提高活动度和专注度', () => {
      factStore.updateLocationMeaning('公园', { type: 'explore', weight: 0.5, reason: '有趣' });
      const grad = influence.computeGradient('公园', [0.5, 0.5, 0.5, 0.5]);

      expect(grad[0]).toBeGreaterThan(0); // activity 提高
      expect(grad[1]).toBe(0);           // sociality 不变
      expect(grad[2]).toBeGreaterThan(0); // focus 提高
      expect(grad[3]).toBe(0);           // expressiveness 不变
    });

    it('权重影响梯度大小', () => {
      factStore.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.3, reason: '安静' });
      const gradLow = influence.computeGradient('图书馆', [0.5, 0.5, 0.5, 0.5]);

      factStore.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.9, reason: '非常安静' });
      const gradHigh = influence.computeGradient('图书馆', [0.5, 0.5, 0.5, 0.5]);

      expect(Math.abs(gradHigh[0])).toBeGreaterThan(Math.abs(gradLow[0]));
      expect(Math.abs(gradHigh[1])).toBeGreaterThan(Math.abs(gradLow[1]));
    });

    it('梯度与当前行为向量无关（仅基于地点意义）', () => {
      factStore.updateLocationMeaning('食堂', { type: 'social', weight: 0.6, reason: '人多' });

      const grad1 = influence.computeGradient('食堂', [0.1, 0.1, 0.1, 0.1]);
      const grad2 = influence.computeGradient('食堂', [0.9, 0.9, 0.9, 0.9]);

      expect(grad1).toEqual(grad2);
    });
  });

  describe('getMeaningSummary', () => {
    it('无地点意义时返回空字符串', () => {
      expect(influence.getMeaningSummary('未知地点')).toBe('');
    });

    it('返回正确的中文摘要', () => {
      factStore.updateLocationMeaning('图书馆', { type: 'rest', weight: 0.8, reason: '安静' });
      expect(influence.getMeaningSummary('图书馆')).toBe('适合休息');

      factStore.updateLocationMeaning('办公室', { type: 'work', weight: 0.7, reason: '工作' });
      expect(influence.getMeaningSummary('办公室')).toBe('适合工作');

      factStore.updateLocationMeaning('食堂', { type: 'social', weight: 0.6, reason: '人多' });
      expect(influence.getMeaningSummary('食堂')).toBe('适合社交');

      factStore.updateLocationMeaning('公园', { type: 'explore', weight: 0.5, reason: '有趣' });
      expect(influence.getMeaningSummary('公园')).toBe('适合探索');
    });
  });
});
