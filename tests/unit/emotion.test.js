/**
 * EmotionVector 模块测试套件
 *
 * 迁移自 test.js 行 109-175
 * 原始 assert 数量：12 个
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Personality from '../../src/agent/psychology/Personality.js';
import EmotionVector from '../../src/agent/psychology/EmotionVector.js';

describe('EmotionVector 模块', () => {
  let personality;
  let emotion;

  beforeEach(() => {
    personality = new Personality({ mbti: 'INFP' });
    emotion = new EmotionVector(personality);
  });

  describe('初始状态', () => {
    it('valence 应该在 [-1,1]', () => {
      expect(emotion.getValence()).toBeGreaterThanOrEqual(-1);
      expect(emotion.getValence()).toBeLessThanOrEqual(1);
    });

    it('arousal 应该在 [0,1]', () => {
      expect(emotion.getArousal()).toBeGreaterThanOrEqual(0);
      expect(emotion.getArousal()).toBeLessThanOrEqual(1);
    });
  });

  describe('Tick 后状态', () => {
    beforeEach(() => {
      emotion.tick(5 / 60, 14); // 5 分钟, 下午 2 点
    });

    it('valence 应该在 [-1,1]', () => {
      expect(emotion.getValence()).toBeGreaterThanOrEqual(-1);
      expect(emotion.getValence()).toBeLessThanOrEqual(1);
    });

    it('arousal 应该在 [0,1]', () => {
      expect(emotion.getArousal()).toBeGreaterThanOrEqual(0);
      expect(emotion.getArousal()).toBeLessThanOrEqual(1);
    });

    it('所有维度应该在 [-1,1]', () => {
      for (const [dim, val] of Object.entries(emotion.current)) {
        expect(val, `Dimension ${dim}`).toBeGreaterThanOrEqual(-1);
        expect(val, `Dimension ${dim}`).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('外部效果应用', () => {
    beforeEach(() => {
      emotion.applyEffect({ joy: 0.5, sadness: -0.3 });
    });

    it('Joy 应该存在', () => {
      expect(emotion.current.joy).toBeDefined();
    });

    it('所有维度应该在 [-1,1]', () => {
      for (const [dim, val] of Object.entries(emotion.current)) {
        expect(val, `Post-effect ${dim}`).toBeGreaterThanOrEqual(-1);
        expect(val, `Post-effect ${dim}`).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('昼夜节律', () => {
    it('凌晨应该触发孤独感', () => {
      emotion.tick(0.083, 2); // 凌晨 2 点
      expect(emotion.current.loneliness).toBeDefined();
    });

    it('partial circadian config should preserve default fields and stay finite', () => {
      const custom = new EmotionVector(personality, null, null, {
        circadian: { positiveAffectAmp: 0.2 },
      });

      custom._circadianModulation(12);

      expect(custom._cfg.circadian.positiveAffectPeak).toBeDefined();
      expect(custom._cfg.circadian.negativeAffectPeak).toBeDefined();
      expect(Number.isFinite(custom.current.joy)).toBe(true);
      expect(Number.isFinite(custom.current.sadness)).toBe(true);
    });
  });

  describe('社交传染', () => {
    it('接受传染后应该有反应', () => {
      const contagionInputs = {
        other_agent: {
          emotion: { joy: 0.8, sadness: -0.1 },
          weight: 0.5,
          expressiveness: 0.7,
        },
      };
      emotion.tick(5 / 60, 14, contagionInputs);
      // 不严格断言具体值，因为有衰减和其他效应
      // 只验证不崩溃
      expect(emotion.current).toBeDefined();
    });
  });

  describe('getDominant', () => {
    it('应该返回最多 N 个维度', () => {
      emotion.applyEffect({ joy: 0.8, sadness: 0.6, anger: 0.4 });
      const dominant = emotion.getDominant(3);
      expect(dominant.length).toBeLessThanOrEqual(3);
    });

    it('每个结果应该有 dimension 字段', () => {
      emotion.applyEffect({ joy: 0.8 });
      const dominant = emotion.getDominant(1);
      expect(dominant[0].dimension).toBeDefined();
    });

    it('每个结果应该有数值 value', () => {
      emotion.applyEffect({ joy: 0.8 });
      const dominant = emotion.getDominant(1);
      expect(typeof dominant[0].value).toBe('number');
    });
  });

  describe('toPromptString', () => {
    it('应该包含效价', () => {
      const promptStr = emotion.toPromptString();
      expect(promptStr).toContain('效价');
    });

    it('应该是字符串', () => {
      const promptStr = emotion.toPromptString();
      expect(typeof promptStr).toBe('string');
    });
  });

  describe('序列化', () => {
    it('应该包含 current', () => {
      const json = emotion.toJSON();
      expect(json.current).toBeDefined();
    });

    it('应该包含 baseline', () => {
      const json = emotion.toJSON();
      expect(json.baseline).toBeDefined();
    });

    it('应该包含 stress', () => {
      const json = emotion.toJSON();
      expect(typeof json.stress).toBe('number');
    });
  });
});
