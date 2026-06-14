/**
 * FutureTendencyTracker 测试套件
 */

import { describe, it, expect, beforeEach } from 'vitest';
import FutureTendencyTracker from '../../agent/FutureTendencyTracker.js';

describe('FutureTendencyTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new FutureTendencyTracker();
  });

  describe('constructor', () => {
    it('初始化为空倾向', () => {
      expect(tracker.getAllTendencies()).toEqual({});
    });

    it('默认衰减率为 0.95', () => {
      expect(tracker.decayRate).toBe(0.95);
    });

    it('默认最大倾向为 1.0', () => {
      expect(tracker.maxTendency).toBe(1.0);
    });
  });

  describe('updateTendency', () => {
    it('为新区域创建倾向向量', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      const tendency = tracker.getTendencyGradient('图书馆');
      expect(tendency).toEqual([0.05, 0.1, 0.15, 0.2]);
    });

    it('累加已有区域的倾向', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      const tendency = tracker.getTendencyGradient('图书馆');
      expect(tendency).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('边界裁剪：不超过 maxTendency', () => {
      tracker.updateTendency('图书馆', [1.0, 1.0, 1.0, 1.0], 2.0);
      const tendency = tracker.getTendencyGradient('图书馆');
      expect(tendency[0]).toBe(1.0);
      expect(tendency[1]).toBe(1.0);
      expect(tendency[2]).toBe(1.0);
      expect(tendency[3]).toBe(1.0);
    });

    it('边界裁剪：不低于 -maxTendency', () => {
      tracker.updateTendency('图书馆', [-1.0, -1.0, -1.0, -1.0], 2.0);
      const tendency = tracker.getTendencyGradient('图书馆');
      expect(tendency[0]).toBe(-1.0);
      expect(tendency[1]).toBe(-1.0);
      expect(tendency[2]).toBe(-1.0);
      expect(tendency[3]).toBe(-1.0);
    });

    it('不同区域独立', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      tracker.updateTendency('食堂', [0.4, 0.3, 0.2, 0.1], 0.5);
      
      const library = tracker.getTendencyGradient('图书馆');
      const cafeteria = tracker.getTendencyGradient('食堂');
      
      expect(library).toEqual([0.05, 0.1, 0.15, 0.2]);
      expect(cafeteria).toEqual([0.2, 0.15, 0.1, 0.05]);
    });

    it('默认 importance 为 0.1', () => {
      tracker.updateTendency('图书馆', [0.5, 0.5, 0.5, 0.5]);
      const tendency = tracker.getTendencyGradient('图书馆');
      expect(tendency).toEqual([0.05, 0.05, 0.05, 0.05]);
    });
  });

  describe('getTendencyGradient', () => {
    it('未知区域返回零向量', () => {
      const tendency = tracker.getTendencyGradient('未知地点');
      expect(tendency).toEqual([0, 0, 0, 0]);
    });

    it('返回副本而非引用', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      const tendency1 = tracker.getTendencyGradient('图书馆');
      const tendency2 = tracker.getTendencyGradient('图书馆');
      
      tendency1[0] = 999;
      expect(tendency2[0]).not.toBe(999);
    });
  });

  describe('decay', () => {
    it('衰减所有倾向', () => {
      tracker.updateTendency('图书馆', [0.5, 0.5, 0.5, 0.5], 1.0);
      tracker.decay();
      
      const tendency = tracker.getTendencyGradient('图书馆');
      expect(tendency[0]).toBeCloseTo(0.475, 3);
      expect(tendency[1]).toBeCloseTo(0.475, 3);
      expect(tendency[2]).toBeCloseTo(0.475, 3);
      expect(tendency[3]).toBeCloseTo(0.475, 3);
    });

    it('多次衰减', () => {
      tracker.updateTendency('图书馆', [1.0, 1.0, 1.0, 1.0], 1.0);
      
      for (let i = 0; i < 10; i++) {
        tracker.decay();
      }
      
      const tendency = tracker.getTendencyGradient('图书馆');
      const expected = Math.pow(0.95, 10);
      expect(tendency[0]).toBeCloseTo(expected, 3);
    });

    it('衰减不影响零向量', () => {
      tracker.decay();
      expect(tracker.getTendencyGradient('图书馆')).toEqual([0, 0, 0, 0]);
    });

    it('衰减不同区域', () => {
      tracker.updateTendency('图书馆', [0.5, 0.5, 0.5, 0.5], 1.0);
      tracker.updateTendency('食堂', [0.3, 0.3, 0.3, 0.3], 1.0);
      
      tracker.decay();
      
      const library = tracker.getTendencyGradient('图书馆');
      const cafeteria = tracker.getTendencyGradient('食堂');
      
      expect(library[0]).toBeCloseTo(0.475, 3);
      expect(cafeteria[0]).toBeCloseTo(0.285, 3);
    });
  });

  describe('getAllTendencies', () => {
    it('返回空对象当无倾向', () => {
      expect(tracker.getAllTendencies()).toEqual({});
    });

    it('返回所有区域的倾向', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      tracker.updateTendency('食堂', [0.4, 0.3, 0.2, 0.1], 0.5);
      
      const all = tracker.getAllTendencies();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all['图书馆']).toEqual([0.05, 0.1, 0.15, 0.2]);
      expect(all['食堂']).toEqual([0.2, 0.15, 0.1, 0.05]);
    });

    it('返回副本而非引用', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      const all = tracker.getAllTendencies();
      
      all['图书馆'][0] = 999;
      expect(tracker.getTendencyGradient('图书馆')[0]).not.toBe(999);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('序列化空倾向', () => {
      const json = tracker.toJSON();
      expect(json).toEqual({ tendencies: {}, decayRate: 0.95 });
    });

    it('序列化有倾向', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      tracker.updateTendency('食堂', [0.4, 0.3, 0.2, 0.1], 0.5);
      
      const json = tracker.toJSON();
      expect(json.tendencies['图书馆']).toEqual([0.05, 0.1, 0.15, 0.2]);
      expect(json.tendencies['食堂']).toEqual([0.2, 0.15, 0.1, 0.05]);
    });

    it('反序列化', () => {
      tracker.updateTendency('图书馆', [0.1, 0.2, 0.3, 0.4], 0.5);
      tracker.updateTendency('食堂', [0.4, 0.3, 0.2, 0.1], 0.5);
      
      const json = tracker.toJSON();
      const restored = FutureTendencyTracker.fromJSON(json);
      
      expect(restored.getTendencyGradient('图书馆')).toEqual([0.05, 0.1, 0.15, 0.2]);
      expect(restored.getTendencyGradient('食堂')).toEqual([0.2, 0.15, 0.1, 0.05]);
      expect(restored.decayRate).toBe(0.95);
    });

    it('反序列化自定义衰减率', () => {
      const data = { tendencies: {}, decayRate: 0.8 };
      const restored = FutureTendencyTracker.fromJSON(data);
      expect(restored.decayRate).toBe(0.8);
    });

    it('反序列化默认衰减率', () => {
      const data = { tendencies: {} };
      const restored = FutureTendencyTracker.fromJSON(data);
      expect(restored.decayRate).toBe(0.95);
    });

    it('序列化后衰减行为一致', () => {
      tracker.updateTendency('图书馆', [0.5, 0.5, 0.5, 0.5], 1.0);
      
      const json = tracker.toJSON();
      const restored = FutureTendencyTracker.fromJSON(json);
      
      tracker.decay();
      restored.decay();
      
      expect(restored.getTendencyGradient('图书馆')).toEqual(tracker.getTendencyGradient('图书馆'));
    });
  });
});
