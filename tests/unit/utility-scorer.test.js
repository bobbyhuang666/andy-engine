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

  describe('NaN safety — scorers must return finite numbers', () => {
    // Regression: pressureContext fields containing NaN used to propagate
    // through Math.max/min and produce total: NaN, causing UtilitySelector
    // to silently drop the candidate. All scorers must coerce NaN/Infinity
    // to a safe fallback.

    function expectAllFinite(score, label) {
      for (const [k, v] of Object.entries(score)) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }

    it('pressureContext.needs.hunger = NaN → scoreNeed finite', () => {
      const cand = createCandidate({ type: 'consume', source: 'need', target: 'food' });
      const ctx = { pressureContext: { needs: { hunger: NaN } } };
      const score = scoreCandidate(cand, ctx);
      expectAllFinite(score, 'need');
      expect(Number.isFinite(score.need)).toBe(true);
    });

    it('pressureContext.location.total = NaN → scoreLocation finite', () => {
      const cand = createCandidate({ type: 'move', source: 'need', target: 'dorm' });
      const ctx = { agent: { position: 'library' }, pressureContext: { location: { total: NaN } } };
      const score = scoreCandidate(cand, ctx);
      expectAllFinite(score, 'location');
      expect(Number.isFinite(score.location)).toBe(true);
    });

    it('pressureContext.world.total = NaN → scoreWorld finite', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const ctx = { pressureContext: { world: { total: NaN } } };
      const score = scoreCandidate(cand, ctx);
      expectAllFinite(score, 'world');
      expect(Number.isFinite(score.world)).toBe(true);
    });

    it('pressureContext.relationship isolation/conflict/total = NaN → scoreRelationship finite', () => {
      const socialize = createCandidate({ type: 'socialize', source: 'need' });
      const ctx = { pressureContext: { relationship: { isolation: NaN, conflict: NaN, total: NaN } } };
      const score = scoreCandidate(socialize, ctx);
      expectAllFinite(score, 'relationship');
      expect(Number.isFinite(score.relationship)).toBe(true);

      // non-socialize path uses relPressure.total
      const rest = createCandidate({ type: 'rest', source: 'need' });
      const score2 = scoreCandidate(rest, ctx);
      expect(Number.isFinite(score2.relationship)).toBe(true);
    });

    it('candidate.constraints.timeRange 含 NaN → scoreConstraint finite', () => {
      const cand = createCandidate({
        type: 'work',
        source: 'schedule',
        constraints: { timeRange: [NaN, NaN] },
      });
      const ctx = { world: { time: '2026-09-01T14:00:00Z' } };
      const score = scoreCandidate(cand, ctx);
      expectAllFinite(score, 'constraint');
      expect(Number.isFinite(score.constraint)).toBe(true);
    });

    it('NaN pressureContext across multiple fields → total finite', () => {
      const cand = createCandidate({ type: 'socialize', source: 'need' });
      const ctx = {
        agent: { position: 'library' },
        world: { time: '2026-09-01T14:00:00Z' },
        pressureContext: {
          needs: { hunger: NaN, social: NaN },
          location: { total: NaN },
          world: { total: NaN },
          relationship: { isolation: NaN, conflict: NaN, total: NaN },
        },
        constraints: { timeRange: [NaN, NaN] },
      };
      const score = scoreCandidate(Object.assign(cand, { constraints: { timeRange: [NaN, NaN] } }), ctx);
      expectAllFinite(score, 'combined');
      expect(Number.isFinite(score.total)).toBe(true);
    });

    // P1 regression: B 向量元素 NaN 不污染 scoreBehavior
    it('behaviorField.B 各维度 NaN/Infinity → scoreBehavior finite', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      // rest ideal: { activity:0.1, sociality:0.2, focus:0.1, expressiveness:0.2 }
      const ctx = { behaviorField: { B: [NaN, Infinity, undefined, -Infinity] } };
      const score = scoreCandidate(cand, ctx);
      expectAllFinite(score, 'behavior-NaN');
      expect(Number.isFinite(score.behavior)).toBe(true);
      expect(score.behavior).toBeGreaterThanOrEqual(0);
    });

    it('behaviorField.B 全部 NaN → scoreBehavior 仍 finite 且不污染 total', () => {
      const cand = createCandidate({ type: 'work', source: 'schedule' });
      const ctx = {
        ...baseContext,
        behaviorField: { B: [NaN, NaN, NaN, NaN] },
      };
      const score = scoreCandidate(cand, ctx);
      expectAllFinite(score, 'behavior-all-NaN');
      expect(Number.isFinite(score.total)).toBe(true);
    });

    it('non-finite total marks a corrupted candidate invalid instead of neutral', () => {
      const cand = createCandidate({ type: 'explore', source: 'intrinsic', target: 'library' });
      const ctx = {
        ...baseContext,
        emotion: { valence: Infinity, arousal: 0 },
      };

      const score = scoreCandidate(cand, ctx);
      expect(score.emotion).toBe(Infinity);
      expect(score.total).toBe(Number.NEGATIVE_INFINITY);
    });
  });
});
