import { describe, it, expect } from 'vitest';
import {
  GOAL_SOURCES,
  GOAL_STATUSES,
  createGoal,
  tickGoals,
  cancelGoal,
  completeGoal,
  getActiveGoals,
  toJSON,
  fromJSON,
} from '../../experimental/action/GoalSystem.js';
import { scoreCandidate } from '../../src/action/UtilityScorer.js';
import { ActionCandidate } from '../../src/action/ActionCandidate.js';

function createCandidate(opts) {
  return new ActionCandidate(opts).toJSON();
}

describe('GoalSystem', () => {
  describe('createGoal', () => {
    it('creates goal with domain-agnostic fields', () => {
      const goal = createGoal({
        source: 'self',
        actionType: 'explore',
        target: 'forest',
        priority: 0.7,
      });

      expect(goal.source).toBe('self');
      expect(goal.actionType).toBe('explore');
      expect(goal.target).toBe('forest');
      expect(goal.priority).toBe(0.7);
      expect(goal.status).toBe('active');
      expect(goal.progress).toBe(0);
      expect(goal.id).toBeTruthy();
    });

    it('preserves caller-provided id', () => {
      const goal = createGoal({
        id: 'goal_custom_1',
        source: 'external',
        actionType: 'work',
      });

      expect(goal.id).toBe('goal_custom_1');
    });

    it('generates deterministic fallback id without global counters', () => {
      const input = {
        source: 'self',
        actionType: 'explore',
        target: 'forest',
        priority: 0.7,
        createdAt: 1000,
      };

      const g1 = createGoal(input);
      const g2 = createGoal(input);

      expect(g1.id).toBe(g2.id);
    });

    it('invalid source throws', () => {
      expect(() => createGoal({ source: 'invalid' })).toThrow();
    });

    it('priority clamped to [0, 1]', () => {
      const g1 = createGoal({ source: 'self', priority: -1 });
      const g2 = createGoal({ source: 'self', priority: 2 });
      expect(g1.priority).toBe(0);
      expect(g2.priority).toBe(1);
    });

    it('non-finite priority and weight fall back to safe defaults', () => {
      const goal = createGoal({ source: 'self', priority: NaN, weight: Infinity });

      expect(goal.priority).toBe(0.5);
      expect(goal.weight).toBe(1);
    });
  });

  describe('tickGoals', () => {
    it('uses passed nowMs, not Date.now', () => {
      const goals = [createGoal({
        source: 'self',
        createdAt: 1000,
        expiresAt: 5000,
      })];

      const r1 = tickGoals(goals, {}, 3000);
      expect(r1[0].status).toBe('active');

      const r2 = tickGoals(goals, {}, 6000);
      expect(r2[0].status).toBe('expired');
    });

    it('region_reached completion', () => {
      const goals = [createGoal({
        source: 'self',
        completionConditions: { region_reached: 'forest' },
      })];

      const ctx = { agent: { position: 'forest', state: 'idle' } };
      const result = tickGoals(goals, ctx, 1000);
      expect(result[0].status).toBe('completed');
    });

    it('state_entered completion', () => {
      const goals = [createGoal({
        source: 'self',
        completionConditions: { state_entered: 'working' },
      })];

      const ctx = { agent: { position: 'office', state: 'working' } };
      const result = tickGoals(goals, ctx, 1000);
      expect(result[0].status).toBe('completed');
    });

    it('need_above completion', () => {
      const goals = [createGoal({
        source: 'self',
        completionConditions: { need_above: { need: 'hunger', threshold: 0.8 } },
      })];

      const ctx = { agent: { position: 'home' }, needs: { hunger: 0.9 } };
      const result = tickGoals(goals, ctx, 1000);
      expect(result[0].status).toBe('completed');
    });

    it('need_above not met stays active', () => {
      const goals = [createGoal({
        source: 'self',
        completionConditions: { need_above: { need: 'hunger', threshold: 0.8 } },
      })];

      const ctx = { agent: { position: 'home' }, needs: { hunger: 0.5 } };
      const result = tickGoals(goals, ctx, 1000);
      expect(result[0].status).toBe('active');
    });

    it('non-active goals not modified', () => {
      const goals = [{ ...createGoal({ source: 'self' }), status: 'completed' }];
      const result = tickGoals(goals, {}, 99999);
      expect(result[0].status).toBe('completed');
    });

    it('empty goals returns empty', () => {
      expect(tickGoals([], {}, 1000)).toEqual([]);
      expect(tickGoals(null, {}, 1000)).toEqual([]);
    });

    it('non-finite nowMs does not write NaN progress', () => {
      const goals = [createGoal({ source: 'self', createdAt: 0, dueAt: 1000 })];
      const result = tickGoals(goals, {}, NaN);

      expect(Number.isFinite(result[0].progress)).toBe(true);
      expect(result[0].progress).toBe(0);
    });
  });

  describe('cancelGoal / completeGoal', () => {
    it('cancelGoal sets status to cancelled', () => {
      const goals = [createGoal({ source: 'self' })];
      const result = cancelGoal(goals, goals[0].id);
      expect(result[0].status).toBe('cancelled');
    });

    it('completeGoal sets status to completed', () => {
      const goals = [createGoal({ source: 'self' })];
      const result = completeGoal(goals, goals[0].id);
      expect(result[0].status).toBe('completed');
      expect(result[0].progress).toBe(1);
    });
  });

  describe('getActiveGoals', () => {
    it('filters active goals', () => {
      const goals = [
        createGoal({ source: 'self' }),
        { ...createGoal({ source: 'self' }), status: 'completed' },
        { ...createGoal({ source: 'self' }), status: 'cancelled' },
      ];
      expect(getActiveGoals(goals).length).toBe(1);
    });
  });

  describe('toJSON / fromJSON roundtrip', () => {
    it('preserves goals', () => {
      const goals = [createGoal({ source: 'self', actionType: 'explore' })];
      const json = toJSON(goals);
      const restored = fromJSON(json);

      expect(restored.length).toBe(1);
      expect(restored[0].id).toBe(goals[0].id);
      expect(restored[0].actionType).toBe('explore');
    });

    it('null input returns empty', () => {
      expect(fromJSON(null)).toEqual([]);
      expect(toJSON(null)).toEqual([]);
    });
  });

  describe('no mutation', () => {
    it('tickGoals does not mutate input', () => {
      const goals = [createGoal({ source: 'self', createdAt: 0, expiresAt: 5000 })];
      const goalsCopy = JSON.parse(JSON.stringify(goals));
      tickGoals(goals, {}, 3000);
      expect(goals).toEqual(goalsCopy);
    });

    it('cancelGoal does not mutate input', () => {
      const goals = [createGoal({ source: 'self' })];
      const goalsCopy = JSON.parse(JSON.stringify(goals));
      cancelGoal(goals, goals[0].id);
      expect(goals).toEqual(goalsCopy);
    });
  });

  describe('time field bug fix: ?? preserves 0', () => {
    it('createdAt: 0 is preserved (not nullified)', () => {
      const goal = createGoal({ source: 'self', createdAt: 0, dueAt: 1000 });
      expect(goal.createdAt).toBe(0);
      expect(goal.dueAt).toBe(1000);
    });

    it('createdAt: 0 + dueAt: 1000 → progress 0.5 at nowMs=500', () => {
      const goals = [createGoal({ source: 'self', createdAt: 0, dueAt: 1000 })];
      const result = tickGoals(goals, {}, 500);
      expect(result[0].progress).toBeCloseTo(0.5, 5);
    });

    it('expiresAt: 0 is preserved (not nullified)', () => {
      const goal = createGoal({ source: 'self', expiresAt: 0 });
      expect(goal.expiresAt).toBe(0);
    });

    it('expiresAt: 0 expires when nowMs reaches 0', () => {
      const goals = [createGoal({ source: 'self', expiresAt: 0 })];
      const result = tickGoals(goals, {}, 0);
      expect(result[0].status).toBe('expired');
    });
  });

  describe('deep clone boundary', () => {
    it('modifying input metadata does not affect goal', () => {
      const meta = { key: 'value', nested: { a: 1 } };
      const goal = createGoal({ source: 'self', metadata: meta });
      meta.key = 'changed';
      meta.nested.a = 999;
      expect(goal.metadata.key).toBe('value');
      expect(goal.metadata.nested.a).toBe(1);
    });

    it('modifying input completionConditions does not affect goal', () => {
      const cond = { region_reached: 'forest' };
      const goal = createGoal({ source: 'self', completionConditions: cond });
      cond.region_reached = 'changed';
      expect(goal.completionConditions.region_reached).toBe('forest');
    });

    it('toJSON output is independent from original goals', () => {
      const goals = [createGoal({ source: 'self', metadata: { k: 'v' } })];
      const json = toJSON(goals);
      json[0].metadata.k = 'changed';
      expect(goals[0].metadata.k).toBe('v');
    });

    it('fromJSON restored is independent from source data', () => {
      const data = [{ id: 'g1', source: 'self', metadata: { k: 'v' } }];
      const restored = fromJSON(data);
      data[0].metadata.k = 'changed';
      expect(restored[0].metadata.k).toBe('v');
    });
  });

  describe('constants', () => {
    it('GOAL_SOURCES are abstract', () => {
      expect(GOAL_SOURCES).toContain('self');
      expect(GOAL_SOURCES).toContain('external');
      expect(GOAL_SOURCES).toContain('background');
      expect(GOAL_SOURCES).toContain('world_event');
      expect(GOAL_SOURCES).toContain('system');
    });

    it('GOAL_STATUSES cover lifecycle', () => {
      expect(GOAL_STATUSES).toContain('active');
      expect(GOAL_STATUSES).toContain('completed');
      expect(GOAL_STATUSES).toContain('expired');
      expect(GOAL_STATUSES).toContain('cancelled');
    });
  });
});

describe('UtilityScorer scoreGoal integration', () => {
  const baseContext = {
    agent: { position: 'dorm' },
    world: { time: '2026-09-01T14:00:00Z' },
    behaviorField: { B: [0.5, 0.5, 0.5, 0.5] },
    needs: { hunger: 0.8, energy: 0.8, social: 0.8, stimulation: 0.8 },
    emotion: { valence: 0, arousal: 0.5 },
    memories: [],
    relationships: [],
    goals: [],
    worldPressure: {},
  };

  it('matching active goal boosts candidate', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const ctx = {
      ...baseContext,
      goals: [{
        actionType: 'explore',
        priority: 0.8,
        weight: 1.0,
        status: 'active',
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.goal).toBeGreaterThan(0);
  });

  it('non-matching goal has no effect', () => {
    const cand = createCandidate({ type: 'work', source: 'schedule' });
    const ctx = {
      ...baseContext,
      goals: [{
        actionType: 'explore',
        priority: 0.8,
        weight: 1.0,
        status: 'active',
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.goal).toBe(0);
  });

  it('inactive goal has no effect', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const ctx = {
      ...baseContext,
      goals: [{
        actionType: 'explore',
        priority: 0.8,
        weight: 1.0,
        status: 'completed',
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.goal).toBe(0);
  });

  it('scoreBreakdown.goal is independent from habit/memory/world', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const ctxWithGoal = {
      ...baseContext,
      goals: [{ actionType: 'explore', priority: 0.8, weight: 1.0, status: 'active' }],
      memories: [{ actionType: 'explore', importance: 0.8, activation: 0.7, valence: 0.3 }],
    };
    const ctxNoGoal = { ...ctxWithGoal, goals: [] };

    const s1 = scoreCandidate(cand, ctxWithGoal);
    const s2 = scoreCandidate(cand, ctxNoGoal);

    expect(s1.goal).not.toBe(s2.goal);
    expect(s1.memory).toBe(s2.memory);
    expect(s1.world).toBe(s2.world);
    expect(s1.habit).toBe(s2.habit);
  });

  it('no goals returns 0', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const score = scoreCandidate(cand, baseContext);
    expect(score.goal).toBe(0);
  });

  it('score is clamped', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const ctx = {
      ...baseContext,
      goals: Array.from({ length: 20 }, () => ({
        actionType: 'explore',
        priority: 1.0,
        weight: 10.0,
        status: 'active',
      })),
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.goal).toBeLessThanOrEqual(0.5);
    expect(score.goal).toBeGreaterThanOrEqual(-0.5);
  });

  it('no mutation of context', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const goals = [{ actionType: 'explore', priority: 0.8, weight: 1.0, status: 'active' }];
    const ctx = { ...baseContext, goals };
    const ctxCopy = JSON.parse(JSON.stringify(ctx));
    scoreCandidate(cand, ctx);
    expect(ctx).toEqual(ctxCopy);
  });
});
