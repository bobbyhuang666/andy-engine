/**
 * Phase 37: Minimal Movement Writeback Gate
 *
 * active mode can write back movement for action type 'move'
 * when candidate.target is a valid domain region.
 *
 * dryRunEffects computes location delta but does not mutate position.
 * Invalid targets no-op without throwing.
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const tavernDomain = require('../../presets/tavern/index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

const SHADOW = { enabled: true, mode: 'shadow', temperature: 0, recordTraces: true, maxTraceHistory: 100 };
const DRY_RUN = { ...SHADOW, mode: 'dryRunEffects' };
const ACTIVE = { ...SHADOW, mode: 'active' };

function createEngine(seed, actionSelection, domain = null) {
  const config = { seed, startTime: new Date(TEST_START), actionSelection };
  if (domain) config.domain = domain;
  const engine = new AndyEngine(config);
  engine.createCharacter({
    id: 'char_1',
    name: 'TestChar',
    mbti: 'INFP',
    schedule: { entries: [] },
  });
  return engine;
}

function stubProvider(candidates) {
  return { generateAll() { return candidates; } };
}

function makeMoveCandidate(target) {
  return { id: `cand_move_${target}`, type: 'move', source: 'schedule', target, label: `move to ${target}`, constraints: {}, metadata: {} };
}

const REST_CANDIDATE = { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} };
const CONTINUE_CANDIDATE = { id: 'cand_continue_1', type: 'continue', source: 'behaviorField', target: '', label: 'continue', constraints: {}, metadata: {} };

// ═══════════════════════════════════════════
// Phase 37: Movement Writeback
// ═══════════════════════════════════════════

describe('Phase 37: Minimal Movement Writeback Gate', () => {
  // @characterization — direct state injection; not Beta evidence

  // ─── 1. Active move with valid target changes position ───
  it('active move: valid target changes position, event has location delta with target', () => {
    const dry = createEngine('move-valid', DRY_RUN);
    const engine = createEngine('move-valid', ACTIVE);
    const dryAgent = dry.getAgent('char_1');
    const agent = engine.getAgent('char_1');
    const target = '图书馆';
    const stub = stubProvider([makeMoveCandidate(target)]);
    dryAgent._candidateProviderManager = stub;
    agent._candidateProviderManager = stub;

    dry.tick();
    engine.tick();

    expect(agent.position).toBe(target);

    const dryTrace = dryAgent._actionTraceHistory[0];
    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('move');
    expect(trace.stateDeltas).not.toBeNull();
    expect(trace.stateDeltas.location).toBeDefined();
    expect(trace.stateDeltas.location.to).toBe(target);
    expect(trace.stateDeltas.location.reason).toBe('action_move');
    expect(trace.stateDeltas.location).toEqual(dryTrace.stateDeltas.location);

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);
    expect(events[0].stateDeltas.location.to).toBe(target);
  });

  // ─── 2. dryRunEffects move: same location delta, position NOT at target ───
  it('dryRunEffects move: location delta computed, position does NOT change to target', () => {
    const dry = createEngine('move-dry', DRY_RUN);
    const agent = dry.getAgent('char_1');
    const target = agent.position === '食堂' ? '图书馆' : '食堂';
    agent._candidateProviderManager = stubProvider([makeMoveCandidate(target)]);

    dry.tick();

    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('move');
    expect(trace.stateDeltas.location).toBeDefined();
    expect(trace.stateDeltas.location.to).toBe(target);
    expect(trace.stateDeltas.location.reason).toBe('action_move');
    expect(agent.position).toBe(trace.stateDeltas.location.from);
    expect(agent.position).not.toBe(target);
  });

  // ─── 3. Active move with invalid target: no-op, no throw ───
  it('active move: invalid target no-ops, position does NOT change to target, event emitted', () => {
    const baseline = createEngine('move-invalid', DRY_RUN);
    const engine = createEngine('move-invalid', ACTIVE);
    const baselineAgent = baseline.getAgent('char_1');
    const agent = engine.getAgent('char_1');
    const invalidTarget = '不存在的区域_xyz';
    const stub = stubProvider([makeMoveCandidate(invalidTarget)]);
    baselineAgent._candidateProviderManager = stub;
    agent._candidateProviderManager = stub;

    baseline.tick();
    expect(() => engine.tick()).not.toThrow();

    expect(agent.position).toBe(baselineAgent.position);

    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('move');
    expect(trace.stateDeltas).not.toBeNull();
    expect(trace.stateDeltas.location.to).toBe(invalidTarget);
    expect(trace.stateDeltas.location).toEqual(baselineAgent._actionTraceHistory[0].stateDeltas.location);

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);
  });

  // ─── 4. Same seed determinism: identical traces and final position ───
  it('same seed: identical traces and final position for move action', () => {
    const e1 = createEngine('move-det', ACTIVE);
    const e2 = createEngine('move-det', ACTIVE);
    const stub = stubProvider([makeMoveCandidate('图书馆'), REST_CANDIDATE, CONTINUE_CANDIDATE]);
    e1.getAgent('char_1')._candidateProviderManager = stub;
    e2.getAgent('char_1')._candidateProviderManager = stub;

    for (let i = 0; i < 3; i++) {
      e1.tick();
      e2.tick();
    }

    const t1 = e1.getAgent('char_1')._actionTraceHistory;
    const t2 = e2.getAgent('char_1')._actionTraceHistory;
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
    expect(e1.getAgent('char_1').position).toBe(e2.getAgent('char_1').position);
  });

  // ─── 5. Tavern domain: valid move, no campus forbidden terms ───
  it('tavern domain: valid move target works, event contains no campus forbidden terms', () => {
    const dry = createEngine('move-tavern', DRY_RUN, tavernDomain);
    const engine = createEngine('move-tavern', ACTIVE, tavernDomain);
    const dryAgent = dry.getAgent('char_1');
    const agent = engine.getAgent('char_1');
    const target = '铁匠铺';
    const stub = stubProvider([makeMoveCandidate(target)]);
    dryAgent._candidateProviderManager = stub;
    agent._candidateProviderManager = stub;

    dry.tick();
    engine.tick();

    expect(agent.position).toBe(target);
    const trace = agent._actionTraceHistory[0];
    expect(trace.stateDeltas.location.from).toBe(dryAgent._actionTraceHistory[0].stateDeltas.location.from);
    expect(trace.stateDeltas.location.to).toBe(target);

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);

    const text = JSON.stringify(events);
    for (const term of tavernDomain.forbiddenTerms) {
      expect(text).not.toContain(term);
    }
  });

  // ─── 6. Non-move actions must not change position via action writeback ───
  it('rest/continue: position not changed to any move target vs dryRun baseline', () => {
    for (const cand of [REST_CANDIDATE, CONTINUE_CANDIDATE]) {
      const baseline = createEngine(`nonmove-${cand.type}`, DRY_RUN);
      const active = createEngine(`nonmove-${cand.type}`, ACTIVE);
      const stub = stubProvider([cand]);
      baseline.getAgent('char_1')._candidateProviderManager = stub;
      active.getAgent('char_1')._candidateProviderManager = stub;

      baseline.tick();
      active.tick();

      // non-move actions produce no location delta → position should match baseline
      expect(active.getAgent('char_1').position)
        .toBe(baseline.getAgent('char_1').position);

      // verify no location delta in trace
      const trace = active.getAgent('char_1')._actionTraceHistory[0];
      expect(trace.stateDeltas.location).toBeNull();
    }
  });

  // ─── 7. action_selected remains internal, not perceived next tick ───
  it('move action_selected is internal and not perceived on next tick', () => {
    const engine = createEngine('move-internal', ACTIVE);
    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = stubProvider([makeMoveCandidate('图书馆')]);

    engine.tick();

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);
    expect(events[0].scope).toBe('internal');

    const recentEvents = engine.world.eventDispatcher.eventLog.slice(-10);
    const perceived = engine.world.eventDispatcher.filterEventsForAgent('char_1', recentEvents);
    expect(perceived.some(e => e.type === 'action_selected')).toBe(false);
  });

  // ─── 8. Active move same position: no-op (already at target) ───
  it('active move: target same as current position → no-op, position unchanged', () => {
    const dry = createEngine('move-same', DRY_RUN);
    const dryAgent = dry.getAgent('char_1');
    dryAgent._candidateProviderManager = stubProvider([makeMoveCandidate('图书馆')]);
    dry.tick();
    const actionTimePosition = dryAgent._actionTraceHistory[0].stateDeltas.location.from;

    const engine = createEngine('move-same', ACTIVE);
    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = stubProvider([makeMoveCandidate(actionTimePosition)]);

    engine.tick();

    expect(agent.position).toBe(actionTimePosition);
    const trace = agent._actionTraceHistory[0];
    expect(trace.stateDeltas.location).toEqual({
      from: actionTimePosition,
      to: actionTimePosition,
      reason: 'action_move',
    });
  });
});
