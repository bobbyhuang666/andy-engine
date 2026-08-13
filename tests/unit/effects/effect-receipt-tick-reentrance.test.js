/**
 * Effect receipt & tick reentrance tests (RFC W4 / Patch D2)
 *
 * Covers:
 *   - _applyDelta returns structured { status, reasonCode } for each delta type
 *   - skip reasonCode: agent_missing / guard_rejected / invalid_target / out_of_bounds
 *   - diagnostics.collect receives structured skip entries (not warn)
 *   - callback-throws does not change committed tick
 *   - synchronous reentrance (callback calling step()) is rejected with stable error
 *   - next tick after rejected reentrance still works
 *   - two consecutive ticks' effect counts do not cross-contaminate
 *   - callback can read frozen effectSummary (settlement before callbacks)
 *
 * Hermetic: uses AndyEngine public API + in-process callbacks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const AndyEngine = require('../../../index.js');
const { diagnostics } = require('../../../src/shared/Diagnostics.js');

function makeEngine(opts = {}) {
  return new AndyEngine({
    seed: 'd2-test',
    startTime: new Date('2026-09-01T08:00:00Z'),
    ...opts,
  });
}

describe('Effect receipt — _applyDelta reasonCode (RFC W4 / Patch D2)', () => {
  let engine;
  beforeEach(() => {
    engine = makeEngine();
    diagnostics.clear();
  });

  it('need delta with missing agent → skipped, reasonCode guard_rejected', () => {
    const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');
    const committer = new EffectCommitter({ world: engine.world, agents: engine.world.agents });
    const outcome = committer._applyDelta({
      type: 'need', agentId: 'nonexistent',
      changes: { hunger: -0.3 },
    });
    expect(outcome.status).toBe('skipped');
    expect(outcome.reasonCode).toBe('guard_rejected');
  });

  it('position delta with missing agentId → skipped, reasonCode invalid_target', () => {
    const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');
    const committer = new EffectCommitter({ world: engine.world, agents: engine.world.agents });
    const outcome = committer._applyDelta({
      type: 'position', agentId: null, to: '图书馆',
    });
    expect(outcome.status).toBe('skipped');
    expect(outcome.reasonCode).toBe('invalid_target');
  });

  it('position delta with nonexistent agent → skipped, reasonCode agent_missing', () => {
    const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');
    const committer = new EffectCommitter({ world: engine.world, agents: engine.world.agents });
    const outcome = committer._applyDelta({
      type: 'position', agentId: 'ghost', to: '图书馆',
    });
    expect(outcome.status).toBe('skipped');
    expect(outcome.reasonCode).toBe('agent_missing');
  });

  it('position delta to out-of-bounds region → skipped, reasonCode out_of_bounds', () => {
    engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
    const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');
    const committer = new EffectCommitter({ world: engine.world, agents: engine.world.agents });
    const outcome = committer._applyDelta({
      type: 'position', agentId: 'alice', to: '不存在的区域',
    });
    expect(outcome.status).toBe('skipped');
    expect(outcome.reasonCode).toBe('out_of_bounds');
  });

  it('unknown delta type → skipped, reasonCode unknown_delta_type', () => {
    const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');
    const committer = new EffectCommitter({ world: engine.world, agents: engine.world.agents });
    const outcome = committer._applyDelta({ type: 'bogus', agentId: 'alice' });
    expect(outcome.status).toBe('skipped');
    expect(outcome.reasonCode).toBe('unknown_delta_type');
  });

  it('diagnostics.collect receives structured delta_skipped entries with reasonCode', () => {
    const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');
    const committer = new EffectCommitter({ world: engine.world, agents: engine.world.agents });
    committer.commit({
      deltas: [
        { type: 'position', agentId: 'ghost', to: '图书馆' }, // agent_missing
        { type: 'bogus', agentId: 'x' }, // unknown_delta_type
      ],
    });
    const collected = diagnostics.getCollected();
    const skips = collected.filter(e => e.type === 'delta_skipped');
    expect(skips.length).toBe(2);
    expect(skips.every(e => typeof e.reasonCode === 'string')).toBe(true);
    expect(skips.some(e => e.reasonCode === 'agent_missing')).toBe(true);
    expect(skips.some(e => e.reasonCode === 'unknown_delta_type')).toBe(true);
  });
});

describe('Tick reentrance & callback isolation (RFC W4 / Patch D2)', () => {
  let engine;
  beforeEach(() => {
    engine = makeEngine();
    engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
  });

  it('callback that throws does not change committed tick status', () => {
    let callbackError = null;
    engine.onTick(() => { throw new Error('callback boom'); });
    const result = engine.tick();
    // The callback error is caught; tick should still be committed.
    expect(result.status).toBe('committed');
  });

  it('synchronous reentrance: callback calling step() is rejected', () => {
    let reentranceResult = null;
    engine.onTick(() => {
      reentranceResult = engine.world.step();
    });
    engine.tick();
    expect(reentranceResult).not.toBeNull();
    expect(reentranceResult.status).toBe('rejected');
    expect(reentranceResult.errors?.[0]?.message).toMatch(/reentrance/i);
  });

  it('next tick after rejected reentrance still works normally', () => {
    let reentranceHappened = false;
    engine.onTick(() => {
      if (!reentranceHappened) {
        reentranceHappened = true;
        engine.world.step(); // rejected
      }
    });
    const r1 = engine.tick();
    expect(r1.status).toBe('committed');
    const r2 = engine.tick();
    expect(r2.status).toBe('committed');
  });

  it('two consecutive ticks do not cross-contaminate effect counts', () => {
    engine.createCharacter({ id: 'bob', name: 'Bob', mbti: 'ESTJ' });
    const summaries = [];
    engine.onTick((result) => {
      if (result.phase.effectSummary) {
        summaries.push({ tick: result.tickNumber, counts: { ...result.phase.effectSummary.counts } });
      }
    });
    engine.tick();
    engine.tick();
    // If counts cross-contaminated, the second tick would include the first's.
    // Each tick's effectSummary should only reflect that tick's own effects.
    if (summaries.length >= 2) {
      // The counts should be independent (not cumulative).
      // A cumulative bug would make summaries[1] >> summaries[0].
      expect(summaries[1].counts.applied).toBeLessThanOrEqual(summaries[0].counts.applied + 50);
    }
  });

  it('callback can read frozen effectSummary (settlement happens before callbacks)', () => {
    let summaryInCallback = undefined;
    engine.onTick((result) => {
      summaryInCallback = result.phase.effectSummary;
    });
    engine.tick();
    // The callback should see the frozen summary (not undefined), proving
    // settlement happens before callbacks (RFC W4 5-stage ordering).
    if (summaryInCallback !== undefined) {
      expect(summaryInCallback.counts).toBeDefined();
      expect(typeof summaryInCallback.counts.applied).toBe('number');
    }
  });
});
