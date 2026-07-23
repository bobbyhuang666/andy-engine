/**
 * Phase 36: Minimal Active Writeback Gate (Hardened)
 *
 * active mode applies allowed stateDeltas to live agent state:
 *   - rest: need.energy +0.4, emotion calm/joy
 *   - observe: memory candidate delta
 *   - reflect: memory candidate delta + tiny calm
 *   - continue/default: no-op
 *
 * No location/relationship/socialize/consume/work/explore writeback.
 *
 * Phase 36.1: Test hardening — assertions prove actual writeback, not just trace presence.
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const tavernDomain = require('../../presets/tavern/index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

const SHADOW = { enabled: true, mode: 'shadow', temperature: 0, recordTraces: true, maxTraceHistory: 100 };
const EVENT = { ...SHADOW, mode: 'event' };
const DRY_RUN = { ...SHADOW, mode: 'dryRunEffects' };
const ACTIVE = { ...SHADOW, mode: 'active' };
const DISABLED = { enabled: false, mode: 'active', temperature: 0, recordTraces: true, maxTraceHistory: 100 };

function createEngine(seed, actionSelection, domain = null, extraConfig = {}) {
  const config = { seed, startTime: new Date(TEST_START), actionSelection, ...extraConfig };
  if (domain) config.domain = domain;
  const engine = new AndyEngine(config);
  engine.createCharacter({ id: 'char_1', name: 'TestChar', mbti: 'INFP', schedule: 'student' });
  return engine;
}

function stubProvider(candidates) {
  return { generateAll() { return candidates; } };
}

function snapshotState(agent) {
  return {
    energy: agent.needs.needs.energy,
    hunger: agent.needs.needs.hunger,
    social: agent.needs.needs.social,
    comfort: agent.needs.needs.comfort,
    stimulation: agent.needs.needs.stimulation,
    calm: agent.emotion.current.calm || 0,
    joy: agent.emotion.current.joy || 0,
    sadness: agent.emotion.current.sadness || 0,
    memoryCount: agent.memory.memories.length,
  };
}

const REST_CANDIDATE = { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} };
const OBSERVE_CANDIDATE = { id: 'cand_observe_1', type: 'observe', source: 'intrinsic', target: '', label: 'observe surroundings', constraints: {}, metadata: {} };
const REFLECT_CANDIDATE = { id: 'cand_reflect_1', type: 'reflect', source: 'intrinsic', target: '', label: 'reflect on day', constraints: {}, metadata: {} };
const CONTINUE_CANDIDATE = { id: 'cand_continue_1', type: 'continue', source: 'behaviorField', target: '', label: 'continue', constraints: {}, metadata: {} };
const UNKNOWN_CANDIDATE = { id: 'cand_unknown_1', type: 'customAction', source: 'test', target: '', label: 'unknown', constraints: {}, metadata: {} };
const MOVE_CANDIDATE = { id: 'cand_move_1', type: 'move', source: 'test', target: '操场', label: 'move to field', constraints: {}, metadata: {} };

// ═══════════════════════════════════════════
// Phase 36: Active Writeback (Hardened)
// ═══════════════════════════════════════════

describe('Phase 36: Minimal Active Writeback Gate', () => {
  // @characterization — direct state injection; not Beta evidence

  // ─── 1. Rest active vs dry-run: same stateDeltas, active energy/calm/joy > dryRun ───
  it('rest: active and dryRun produce identical stateDeltas; active energy, calm, joy all > dryRun', () => {
    const dry = createEngine('rest-vs-dry', DRY_RUN);
    const act = createEngine('rest-vs-dry', ACTIVE);
    const stub = stubProvider([REST_CANDIDATE]);
    dry.getAgent('char_1')._candidateProviderManager = stub;
    act.getAgent('char_1')._candidateProviderManager = stub;

    dry.tick();
    act.tick();

    const dryTrace = dry.getAgent('char_1')._actionTraceHistory[0];
    const actTrace = act.getAgent('char_1')._actionTraceHistory[0];

    // identical stateDeltas
    expect(dryTrace.stateDeltas).toEqual(actTrace.stateDeltas);
    expect(dryTrace.stateDeltas.need.energy).toBe(0.4);
    expect(dryTrace.stateDeltas.emotion.calm).toBe(0.1);
    expect(dryTrace.stateDeltas.emotion.joy).toBe(0.05);

    // active applied deltas → live state strictly greater
    const dryAgent = dry.getAgent('char_1');
    const actAgent = act.getAgent('char_1');

    expect(actAgent.needs.needs.energy).toBeGreaterThan(dryAgent.needs.needs.energy);
    expect(actAgent.emotion.current.calm).toBeGreaterThan(dryAgent.emotion.current.calm);
    expect(actAgent.emotion.current.joy).toBeGreaterThan(dryAgent.emotion.current.joy);

    // trace and event present
    expect(actTrace.selectedAction).toBe('rest');
    const events = act.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);
    expect(events[0].stateDeltas.need.energy).toBe(0.4);
  });

  // ─── 2. Unsupported active no-op: compare against dryRun baseline, no extra writeback ───
  it('unsupported action: active stateDeltas empty; energy/emotion/memory identical to dryRun baseline', () => {
    const baseline = createEngine('unknown-noop', DRY_RUN);
    const active = createEngine('unknown-noop', ACTIVE);
    const stub = stubProvider([UNKNOWN_CANDIDATE]);
    baseline.getAgent('char_1')._candidateProviderManager = stub;
    active.getAgent('char_1')._candidateProviderManager = stub;

    baseline.tick();
    active.tick();

    // active trace has empty deltas
    const actTrace = active.getAgent('char_1')._actionTraceHistory[0];
    expect(actTrace.selectedAction).toBe('customAction');
    expect(actTrace.stateDeltas.need).toEqual({});
    expect(actTrace.stateDeltas.emotion).toEqual({});
    expect(actTrace.stateDeltas.memory).toBeNull();

    // live state identical to baseline (no-op applied)
    const bState = snapshotState(baseline.getAgent('char_1'));
    const aState = snapshotState(active.getAgent('char_1'));
    expect(aState.energy).toBe(bState.energy);
    expect(aState.calm).toBe(bState.calm);
    expect(aState.joy).toBe(bState.joy);
    expect(aState.memoryCount).toBe(bState.memoryCount);
  });

  // ─── 3. Continue active no-op: compare against dryRun baseline, no extra writeback ───
  it('continue: active stateDeltas empty; energy/emotion/memory identical to dryRun baseline', () => {
    const baseline = createEngine('continue-noop', DRY_RUN);
    const active = createEngine('continue-noop', ACTIVE);
    const stub = stubProvider([CONTINUE_CANDIDATE]);
    baseline.getAgent('char_1')._candidateProviderManager = stub;
    active.getAgent('char_1')._candidateProviderManager = stub;

    baseline.tick();
    active.tick();

    const actTrace = active.getAgent('char_1')._actionTraceHistory[0];
    expect(actTrace.selectedAction).toBe('continue');
    expect(actTrace.stateDeltas.need).toEqual({});
    expect(actTrace.stateDeltas.emotion).toEqual({});
    expect(actTrace.stateDeltas.memory).toBeNull();

    const bState = snapshotState(baseline.getAgent('char_1'));
    const aState = snapshotState(active.getAgent('char_1'));
    expect(aState.energy).toBe(bState.energy);
    expect(aState.calm).toBe(bState.calm);
    expect(aState.joy).toBe(bState.joy);
    expect(aState.memoryCount).toBe(bState.memoryCount);
  });

  // ─── 4. Determinism: same seed → identical traces AND live state ───
  it('determinism: same seed produces byte-equivalent traces and identical live state', () => {
    const e1 = createEngine('det-active', ACTIVE);
    const e2 = createEngine('det-active', ACTIVE);
    const stub = stubProvider([REST_CANDIDATE, OBSERVE_CANDIDATE, CONTINUE_CANDIDATE]);
    e1.getAgent('char_1')._candidateProviderManager = stub;
    e2.getAgent('char_1')._candidateProviderManager = stub;

    for (let i = 0; i < 5; i++) {
      e1.tick();
      e2.tick();
    }

    // traces byte-equivalent
    const t1 = e1.getAgent('char_1')._actionTraceHistory;
    const t2 = e2.getAgent('char_1')._actionTraceHistory;
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));

    // live state identical
    const s1 = snapshotState(e1.getAgent('char_1'));
    const s2 = snapshotState(e2.getAgent('char_1'));
    expect(s1.energy).toBe(s2.energy);
    expect(s1.calm).toBe(s2.calm);
    expect(s1.joy).toBe(s2.joy);
    expect(s1.memoryCount).toBe(s2.memoryCount);

    // memory content identical
    const mems1 = e1.getAgent('char_1').memory.memories;
    const mems2 = e2.getAgent('char_1').memory.memories;
    expect(mems1.length).toBe(mems2.length);
    for (let i = 0; i < mems1.length; i++) {
      expect(mems1[i].content).toBe(mems2[i].content);
      expect(mems1[i].category).toBe(mems2[i].category);
    }
  });

  // ─── 5a. Observe memory: timestamp based on simTime, not wall clock ───
  it('observe: memory timestamp is based on simTime, not wall clock', () => {
    const engine = createEngine('observe-time', ACTIVE);
    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = stubProvider([OBSERVE_CANDIDATE]);

    engine.tick();

    const newMem = agent.memory.memories[agent.memory.memories.length - 1];
    expect(newMem.content).toBe('observe surroundings');
    expect(newMem.category).toBe('observation');

    // timestamp is simTime-derived (within same second as TEST_START + 5min tick)
    const memTime = newMem.timestamp.getTime();
    const simTime = engine.world.time.getTime();
    // memory timestamp should be close to simTime (within 60s), not Date.now()
    expect(Math.abs(memTime - simTime)).toBeLessThan(60000);
  });

  // ─── 5b. Observe memory: event remains internal, no double-write after extra tick ───
  it('observe: action_selected event remains internal; one more tick does not create a second memory from event', () => {
    const engine = createEngine('observe-nodouble', ACTIVE);
    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = stubProvider([OBSERVE_CANDIDATE]);

    engine.tick();
    const memCountAfterFirst = agent.memory.memories.length;

    // event is internal
    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);
    expect(events[0].scope).toBe('internal');

    // one more tick: event perception should not add a second memory
    engine.tick();
    const memCountAfterSecond = agent.memory.memories.length;
    // memory count may increase by 1 (from the second tick's own action), but NOT from perceiving the event
    // the action_selected event is internal → not perceived → no double-write
    // we verify no extra memory from the event by checking the event wasn't in perceived list
    const recentEvents = engine.world.eventDispatcher.eventLog.slice(-10);
    const perceived = engine.world.eventDispatcher.filterEventsForAgent('char_1', recentEvents);
    expect(perceived.some(e => e.type === 'action_selected')).toBe(false);
  });

  // ─── 5c. Reflect memory: timestamp based on simTime ───
  it('reflect: memory timestamp is simTime-based; calm delta applied', () => {
    const engine = createEngine('reflect-time', ACTIVE);
    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = stubProvider([REFLECT_CANDIDATE]);

    const calmBefore = agent.emotion.current.calm || 0;
    engine.tick();

    const newMem = agent.memory.memories[agent.memory.memories.length - 1];
    expect(newMem.content).toBe('reflect on day');
    expect(newMem.category).toBe('reflection');

    // timestamp near simTime
    const memTime = newMem.timestamp.getTime();
    const simTime = engine.world.time.getTime();
    expect(Math.abs(memTime - simTime)).toBeLessThan(60000);

    // calm increased
    expect(agent.emotion.current.calm).toBeGreaterThan(calmBefore);
  });

  // ─── 6. Disabled mode: no trace, no event, no writeback ───
  it('disabled: no trace, no event, no writeback', () => {
    const baseline = createEngine('disabled-noop', DRY_RUN);
    const disabled = createEngine('disabled-noop', DISABLED);
    const stub = stubProvider([REST_CANDIDATE]);
    baseline.getAgent('char_1')._candidateProviderManager = stub;
    disabled.getAgent('char_1')._candidateProviderManager = stub;

    baseline.tick();
    disabled.tick();

    // disabled has no traces/events
    expect(disabled.getAgent('char_1')._actionTraceHistory.length).toBe(0);
    const events = disabled.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(0);

    // disabled state matches baseline (no writeback applied)
    const bState = snapshotState(baseline.getAgent('char_1'));
    const dState = snapshotState(disabled.getAgent('char_1'));
    expect(dState.energy).toBe(bState.energy);
    expect(dState.calm).toBe(bState.calm);
    expect(dState.memoryCount).toBe(bState.memoryCount);
  });

  // ─── 7. Tavern domain: no campus forbidden terms ───
  it('tavern: action_selected event contains no campus forbidden terms', () => {
    const engine = createEngine('tavern-active', ACTIVE, tavernDomain);
    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = stubProvider([REST_CANDIDATE]);

    engine.tick();

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);

    const text = JSON.stringify(events);
    for (const term of tavernDomain.forbiddenTerms) {
      expect(text).not.toContain(term);
    }
  });

  // ─── 8. Active rest energy clamped [0,1] ───
  it('rest clamp: energy stays [0,1] even at 0.95', () => {
    const engine = createEngine('clamp-rest', ACTIVE);
    const agent = engine.getAgent('char_1');
    agent.needs.needs.energy = 0.95;
    agent._candidateProviderManager = stubProvider([REST_CANDIDATE]);

    engine.tick();

    expect(agent.needs.needs.energy).toBeLessThanOrEqual(1);
    expect(agent.needs.needs.energy).toBeGreaterThanOrEqual(0);
  });

  // ─── 9. Reflect vs dryRun: same stateDeltas, active calm > dryRun calm ───
  it('reflect: active and dryRun same stateDeltas; active calm > dryRun calm', () => {
    const dry = createEngine('reflect-dry', DRY_RUN);
    const act = createEngine('reflect-dry', ACTIVE);
    const stub = stubProvider([REFLECT_CANDIDATE]);
    dry.getAgent('char_1')._candidateProviderManager = stub;
    act.getAgent('char_1')._candidateProviderManager = stub;

    dry.tick();
    act.tick();

    const dryTrace = dry.getAgent('char_1')._actionTraceHistory[0];
    const actTrace = act.getAgent('char_1')._actionTraceHistory[0];
    expect(dryTrace.stateDeltas).toEqual(actTrace.stateDeltas);
    expect(dryTrace.stateDeltas.memory).not.toBeNull();
    expect(dryTrace.stateDeltas.emotion.calm).toBe(0.03);

    // active applied calm delta, dryRun did not
    expect(act.getAgent('char_1').emotion.current.calm)
      .toBeGreaterThan(dry.getAgent('char_1').emotion.current.calm);

    // dryRun computed memory delta but didn't write; active wrote it
    expect(act.getAgent('char_1').memory.memories.length)
      .toBeGreaterThan(dry.getAgent('char_1').memory.memories.length);
  });

  it('move: active writeback applies position and location meaning through EffectCommitter', () => {
    const engine = createEngine('move-location-meaning', ACTIVE, null, { enableFacts: true });
    const agent = engine.getAgent('char_1');
    agent.position = '宿舍';
    engine.world.regions.place(agent.id, '宿舍');
    agent._candidateProviderManager = stubProvider([MOVE_CANDIDATE]);

    engine.tick();

    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('move');
    expect(trace.stateDeltas.location).toMatchObject({
      to: '操场',
      reason: 'action_move',
    });
    expect(trace.stateDeltas.location.from).not.toBe('操场');
    expect(agent.position).toBe('操场');
    expect(engine.world.regions.getRegion(agent.id)).toBe('操场');

    const meaning = engine.world.factStore.getLocationMeaning('操场');
    expect(meaning).toBeTruthy();
    expect(meaning.meaningType).toBe('movement_target');
    expect(meaning.weight).toBe(0);
    expect(meaning.reason).toBe('action_move');
  });
});
