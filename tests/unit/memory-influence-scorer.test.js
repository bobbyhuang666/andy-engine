import { describe, it, expect } from 'vitest';
import { scoreCandidate, scoreCandidates } from '../../src/action/UtilityScorer.js';
import { ActionCandidate } from '../../src/action/ActionCandidate.js';

function createCandidate(opts) {
  return new ActionCandidate(opts).toJSON();
}

describe('Memory influence on scoring', () => {
  const baseContext = {
    agent: { position: 'dorm' },
    world: { time: '2026-09-01T14:00:00Z' },
    behaviorField: { B: [0.5, 0.5, 0.5, 0.5] },
    needs: { hunger: 0.8, energy: 0.8, social: 0.8, stimulation: 0.8 },
    emotion: { valence: 0, arousal: 0.5 },
    memories: [],
    relationships: [],
    goals: {},
    worldPressure: {},
  };

  it('high-importance positive memory boosts matching candidate', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic', target: 'forest' });
    const ctx = {
      ...baseContext,
      memories: [{
        actionType: 'explore',
        importance: 0.9,
        activation: 0.8,
        valence: 0.5,
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBeGreaterThan(0);
  });

  it('negative memory penalizes matching candidate', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic', target: 'forest' });
    const ctx = {
      ...baseContext,
      memories: [{
        actionType: 'explore',
        importance: 0.9,
        activation: 0.8,
        valence: -0.5,
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBeLessThan(0);
  });

  it('unrelated memory has no effect', () => {
    const cand = createCandidate({ type: 'work', source: 'schedule' });
    const ctx = {
      ...baseContext,
      memories: [{
        actionType: 'explore',
        target: 'forest',
        importance: 0.9,
        activation: 0.8,
        valence: 0.5,
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBe(0);
  });

  it('associations matching works', () => {
    const cand = createCandidate({ type: 'socialize', source: 'relationship', target: 'friend_1' });
    const ctx = {
      ...baseContext,
      memories: [{
        associations: ['socialize', 'friend_1'],
        importance: 0.7,
        activation: 0.6,
        valence: 0.3,
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBeGreaterThan(0);
  });

  it('tags matching works', () => {
    const cand = createCandidate({ type: 'rest', source: 'need' });
    const ctx = {
      ...baseContext,
      memories: [{
        tags: ['rest', 'energy'],
        importance: 0.6,
        activation: 0.5,
        valence: 0.2,
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBeGreaterThan(0);
  });

  it('target matching works', () => {
    const cand = createCandidate({ type: 'consume', source: 'need', target: 'hunger' });
    const ctx = {
      ...baseContext,
      memories: [{
        target: 'hunger',
        importance: 0.8,
        activation: 0.7,
        valence: 0.1,
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBeGreaterThan(0);
  });

  it('semanticCategory matching works', () => {
    const cand = createCandidate({ type: 'work', source: 'schedule', metadata: { semanticCategory: 'study' } });
    const ctx = {
      ...baseContext,
      memories: [{
        semanticCategory: 'study',
        importance: 0.7,
        activation: 0.6,
        valence: 0.2,
      }],
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBeGreaterThan(0);
  });

  it('score is clamped to [-0.5, 0.5]', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const ctx = {
      ...baseContext,
      memories: Array.from({ length: 20 }, () => ({
        actionType: 'explore',
        importance: 1.0,
        activation: 1.0,
        valence: 1.0,
      })),
    };
    const score = scoreCandidate(cand, ctx);
    expect(score.memory).toBeLessThanOrEqual(0.5);
    expect(score.memory).toBeGreaterThanOrEqual(-0.5);
  });

  it('context and memories are not mutated', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const memories = [{
      actionType: 'explore',
      importance: 0.8,
      activation: 0.7,
      valence: 0.3,
    }];
    const ctx = { ...baseContext, memories };
    const ctxCopy = JSON.parse(JSON.stringify(ctx));
    const memCopy = JSON.parse(JSON.stringify(memories));

    scoreCandidate(cand, ctx);

    expect(ctx).toEqual(ctxCopy);
    expect(memories).toEqual(memCopy);
  });

  it('scoreBreakdown.memory is independent from goal/habit/world', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const ctx = {
      ...baseContext,
      memories: [{ actionType: 'explore', importance: 0.8, activation: 0.7, valence: 0.3 }],
      worldPressure: { total: 0.5 },
    };
    const ctxNoMem = { ...ctx, memories: [] };

    const withMem = scoreCandidate(cand, ctx);
    const withoutMem = scoreCandidate(cand, ctxNoMem);

    // memory score changes
    expect(withMem.memory).not.toBe(withoutMem.memory);
    // goal/habit/world remain the same
    expect(withMem.goal).toBe(withoutMem.goal);
    expect(withMem.habit).toBe(withoutMem.habit);
    expect(withMem.world).toBe(withoutMem.world);
  });

  it('no memories returns 0', () => {
    const cand = createCandidate({ type: 'explore', source: 'intrinsic' });
    const score = scoreCandidate(cand, baseContext);
    expect(score.memory).toBe(0);
  });
});
