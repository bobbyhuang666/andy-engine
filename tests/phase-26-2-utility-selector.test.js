/**
 * Phase 26.2: canonical UtilitySelector tests
 *
 * Verifies:
 * - ActionCandidate construction
 * - UtilityScorer dimensions
 * - selectAction deterministic argmax / seeded sampling
 * - ReasonTrace serializability
 */

import { describe, it, expect } from 'vitest';
import { ActionCandidate } from '../src/action/ActionCandidate.js';
import { scoreCandidate } from '../src/action/UtilityScorer.js';
import { selectAction } from '../src/action/UtilitySelector.js';
import { ReasonTrace } from '../src/action/ReasonTrace.js';
import { RNG } from '../src/shared/rng.js';

function candidate(type, source = 'need', target = '') {
  return new ActionCandidate({ type, source, target, label: `${source}:${type}` });
}

function fullScore(total, overrides = {}) {
  return {
    need: 0,
    emotion: 0,
    behavior: 0,
    memory: 0,
    relationship: 0,
    habit: 0,
    goal: 0,
    location: 0,
    world: 0,
    time: 0,
    constraint: 0,
    tendency: 0,
    total,
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    agent: { id: 'a', position: 'library' },
    environment: { hour: 14 },
    behaviorField: { B: [0.5, 0.3, 0.7, 0.2] },
    needs: { hunger: 0.8, energy: 0.3, social: 0.6, comfort: 0.7, stimulation: 0.5 },
    emotion: { valence: 0.1, arousal: 0.5 },
    relationships: [{ strength: 0.6 }],
    memories: [],
    goals: [],
    ...overrides,
  };
}

function isSerializable(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

describe('Phase 26.2: canonical UtilitySelector', () => {
  describe('ActionCandidate', () => {
    it('creates deterministic candidate ids', () => {
      const a = candidate('rest', 'need', 'energy');
      const b = candidate('rest', 'need', 'energy');
      expect(a.id).toBe(b.id);
      expect(a.type).toBe('rest');
      expect(a.source).toBe('need');
    });
  });

  describe('UtilityScorer', () => {
    it('scores need satisfaction higher when deficit is large', () => {
      const c = candidate('rest', 'need', 'energy');
      const score = scoreCandidate(c, makeContext({ needs: { energy: 0.1 } }));
      expect(score.need).toBeGreaterThan(0);
    });

    it('scores zero when no matching need dimension exists', () => {
      const c = candidate('observe', 'behaviorField');
      const score = scoreCandidate(c, makeContext());
      expect(score.need).toBe(0);
    });

    it('scores behavior consistency', () => {
      const rest = candidate('rest', 'behaviorField');
      const work = candidate('work', 'behaviorField');
      const context = makeContext({ behaviorField: { B: [0.1, 0.1, 0.1, 0.1] } });
      expect(scoreCandidate(rest, context).behavior).toBeGreaterThan(scoreCandidate(work, context).behavior);
    });
  });

  describe('UtilitySelector', () => {
    it('selects highest score when temperature is 0', () => {
      const rest = candidate('rest');
      const work = candidate('work', 'schedule');
      const result = selectAction([
        { candidate: rest, score: fullScore(0.8, { need: 0.8 }) },
        { candidate: work, score: fullScore(0.3, { time: 0.3 }) },
      ], { temperature: 0, agentId: 'a' });

      expect(result.selected).toBe(rest);
      expect(result.trace.selectedAction).toBe('rest');
    });

    it('returns null selection when all scores are invalid', () => {
      const result = selectAction([
        { candidate: candidate('rest'), score: { total: NaN } },
      ], { temperature: 0 });

      expect(result.selected).toBeNull();
      expect(result.trace.keyReasons).toContain('no-valid-candidates');
    });

    it('same RNG state produces same selection', () => {
      const candidates = [
        { candidate: candidate('rest'), score: fullScore(0.4) },
        { candidate: candidate('work', 'schedule'), score: fullScore(0.5) },
        { candidate: candidate('socialize', 'relationship'), score: fullScore(0.6) },
      ];

      const r1 = selectAction(candidates, { temperature: 0.8, rng: new RNG(42), agentId: 'a' });
      const r2 = selectAction(candidates, { temperature: 0.8, rng: new RNG(42), agentId: 'a' });

      expect(r1.selected.id).toBe(r2.selected.id);
      expect(r1.trace.randomDraw).toBe(r2.trace.randomDraw);
    });

    it('requires seeded RNG when temperature is positive', () => {
      expect(() => selectAction([
        { candidate: candidate('rest'), score: fullScore(0.4) },
      ], { temperature: 0.8 })).toThrow('requires a seeded RNG');
    });

    it('trace includes alternatives and score breakdown', () => {
      const rest = candidate('rest');
      const result = selectAction([
        { candidate: rest, score: fullScore(0.8, { need: 0.8 }) },
      ], { temperature: 0, agentId: 'a' });

      expect(result.trace.candidateAlternatives).toHaveLength(1);
      expect(result.trace.scoreBreakdown.total).toBe(0.8);
      expect(isSerializable(result.trace)).toBe(true);
    });
  });

  describe('ReasonTrace', () => {
    it('constructs serializable traces', () => {
      const trace = new ReasonTrace({
        agentId: 'a',
        candidate: candidate('rest'),
        scoreBreakdown: fullScore(0.5, { need: 0.5 }),
        keyReasons: ['need-drive'],
        rngInfo: { rngStateBefore: 1, randomDraw: 0.2, rngStateAfter: 2 },
        temperature: 0,
        candidateAlternatives: [],
      });

      expect(trace.selectedAction).toBe('rest');
      expect(trace.randomDraw).toBe(0.2);
      expect(isSerializable(trace)).toBe(true);
    });
  });
});
