/**
 * UtilityScorer 测试套件
 */

import { describe, it, expect } from 'vitest';
import { scoreCandidate, scoreCandidates } from '../../src/action/UtilityScorer.js';
import { ActionCandidate } from '../../src/action/ActionCandidate.js';

function createCandidate(opts) {
  return new ActionCandidate(opts).toJSON();
}

describe('UtilityScorer', () => {
  const baseContext = {
    agent: { position: 'dorm' },
    world: { time: '2026-09-01T14:00:00Z' },
    behaviorField: { B: [0.5, 0.5, 0.5, 0.5] },
    needs: { hunger: 0.8, energy: 0.3, social: 0.6, stimulation: 0.7 },
    emotion: { valence: 0.1, arousal: 0.4 },
    memories: [],
    relationships: [],
    goals: {},
    worldPressure: {},
  };

  describe('scoreCandidate', () => {
    it('返回完整 score breakdown', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const score = scoreCandidate(cand, baseContext);

      expect(score).toHaveProperty('need');
      expect(score).toHaveProperty('emotion');
      expect(score).toHaveProperty('behavior');
      expect(score).toHaveProperty('memory');
      expect(score).toHaveProperty('relationship');
      expect(score).toHaveProperty('habit');
      expect(score).toHaveProperty('goal');
      expect(score).toHaveProperty('location');
      expect(score).toHaveProperty('world');
      expect(score).toHaveProperty('time');
      expect(score).toHaveProperty('constraint');
      expect(score).toHaveProperty('total');
    });

    it('需求匮乏时 consume 分数更高', () => {
      const lowHunger = { ...baseContext, needs: { ...baseContext.needs, hunger: 0.1 } };
      const highHunger = { ...baseContext, needs: { ...baseContext.needs, hunger: 0.9 } };

      const cand = createCandidate({ type: 'consume', source: 'need', target: 'food' });
      const scoreLow = scoreCandidate(cand, lowHunger);
      const scoreHigh = scoreCandidate(cand, highHunger);

      expect(scoreLow.need).toBeGreaterThan(scoreHigh.need);
    });

    it('纯读取，不修改 context', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const contextCopy = JSON.parse(JSON.stringify(baseContext));
      scoreCandidate(cand, baseContext);

      expect(baseContext.agent.position).toBe(contextCopy.agent.position);
      expect(baseContext.needs.hunger).toBe(contextCopy.needs.hunger);
    });

    it('constraint 违反时返回负分', () => {
      const cand = createCandidate({
        type: 'work',
        source: 'schedule',
        constraints: { timeRange: [9, 18] },
      });

      // 使用 local time 2 AM（确保不在 9-18 范围内）
      const nightContext = { ...baseContext, world: { time: new Date(2026, 8, 1, 2, 0, 0).toISOString() } };
      const score = scoreCandidate(cand, nightContext);
      expect(score.constraint).toBeLessThan(0);
    });
  });

  describe('scoreCandidates', () => {
    it('批量评分返回正确数量', () => {
      const candidates = [
        createCandidate({ type: 'rest', source: 'need' }),
        createCandidate({ type: 'work', source: 'schedule' }),
        createCandidate({ type: 'explore', source: 'intrinsic' }),
      ];

      const results = scoreCandidates(candidates, baseContext);
      expect(results.length).toBe(3);
      expect(results[0]).toHaveProperty('candidate');
      expect(results[0]).toHaveProperty('score');
    });
  });

  describe('scoreWorld — worldPressure 影响', () => {
    it('无 worldPressure 时返回 0', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const ctx = { ...baseContext, worldPressure: null };
      const score = scoreCandidate(cand, ctx);
      expect(score.world).toBe(0);
    });

    it('正压力时 rest 分数增加', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const noPressure = { ...baseContext, worldPressure: { total: 0 } };
      const highPressure = { ...baseContext, worldPressure: { total: 0.8 } };

      const s1 = scoreCandidate(cand, noPressure);
      const s2 = scoreCandidate(cand, highPressure);

      expect(s2.world).toBeGreaterThan(s1.world);
    });

    it('正压力时 work 分数减少', () => {
      const cand = createCandidate({ type: 'work', source: 'schedule' });
      const noPressure = { ...baseContext, worldPressure: { total: 0 } };
      const highPressure = { ...baseContext, worldPressure: { total: 0.8 } };

      const s1 = scoreCandidate(cand, noPressure);
      const s2 = scoreCandidate(cand, highPressure);

      expect(s2.world).toBeLessThan(s1.world);
    });

    it('scoreWorld 影响 total', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const noPressure = { ...baseContext, worldPressure: { total: 0 } };
      const highPressure = { ...baseContext, worldPressure: { total: 0.8 } };

      const s1 = scoreCandidate(cand, noPressure);
      const s2 = scoreCandidate(cand, highPressure);

      expect(s2.total).not.toBe(s1.total);
    });

    it('scoreWorld clamp 到 [-0.5, 0.5]', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const extremePressure = { ...baseContext, worldPressure: { total: 10 } };
      const score = scoreCandidate(cand, extremePressure);
      expect(score.world).toBeLessThanOrEqual(0.5);
      expect(score.world).toBeGreaterThanOrEqual(-0.5);
    });

    it('纯读取，不修改 context', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const ctx = { ...baseContext, worldPressure: { total: 0.5 } };
      const ctxCopy = JSON.parse(JSON.stringify(ctx));
      scoreCandidate(cand, ctx);
      expect(ctx.worldPressure.total).toBe(ctxCopy.worldPressure.total);
    });
  });
});
