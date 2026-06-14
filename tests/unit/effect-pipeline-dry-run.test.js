/**
 * Phase 35: Effect Pipeline Dry-Run Gate
 *
 * dryRunEffects mode computes stateDeltas via EventEffectPipeline,
 * attaches them to reasonTrace and action_selected event,
 * but does NOT mutate live Agent/World state.
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const { applyActionEffect } = require('../../core/EventEffectPipeline.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

const SHADOW = { enabled: true, mode: 'shadow', temperature: 0, recordTraces: true, maxTraceHistory: 100 };
const EVENT = { ...SHADOW, mode: 'event' };
const DRY_RUN = { ...SHADOW, mode: 'dryRunEffects' };

function createEngine(seed, actionSelection, domain = null) {
  const config = { seed, startTime: new Date(TEST_START), actionSelection };
  if (domain) config.domain = domain;
  const engine = new AndyEngine(config);
  engine.createCharacter({ id: 'char_1', name: 'TestChar', mbti: 'INFP', schedule: 'student' });
  return engine;
}

function snapshotAgentState(agent) {
  return {
    position: agent.position,
    health: agent.health,
    socialEnergy: agent.socialEnergy,
    B: [...agent.behaviorField.B],
    needs: { ...agent.needs.needs },
    emotionSnapshot: { ...agent.emotion.current },
    state: agent.stateMachine.currentState,
    memoryCount: agent.memory.memories.length,
  };
}

function expectSameState(a, b) {
  expect(a.position).toBe(b.position);
  expect(a.health).toBe(b.health);
  expect(a.socialEnergy).toBe(b.socialEnergy);
  expect(a.state).toBe(b.state);
  expect(a.memoryCount).toBe(b.memoryCount);
  for (let i = 0; i < a.B.length; i++) {
    expect(a.B[i]).toBe(b.B[i]);
  }
  for (const key of Object.keys(a.needs)) {
    expect(a.needs[key]).toBe(b.needs[key]);
  }
  for (const key of Object.keys(a.emotionSnapshot)) {
    expect(a.emotionSnapshot[key]).toBe(b.emotionSnapshot[key]);
  }
}

// ═══════════════════════════════════════════
// EventEffectPipeline pure function tests
// ═══════════════════════════════════════════

describe('EventEffectPipeline: pure function contract', () => {
  it('rest candidate produces need/emotion deltas', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'test', needs: { energy: 0.3 }, emotion: { calm: 0.1 } },
      selectedCandidate: { type: 'rest', source: 'behaviorField', target: '', label: '休息' },
      reasonTrace: { selectedAction: 'rest', keyReasons: [], scoreBreakdown: { total: 1 } },
      simTime: new Date('2026-09-01T10:00:00Z'),
    });

    expect(result.stateDeltas).toBeDefined();
    expect(result.stateDeltas.need.energy).toBeGreaterThan(0);
    expect(result.stateDeltas.emotion.calm).toBeGreaterThan(0);
    expect(result.stateDeltas.emotion.joy).toBeGreaterThan(0);
    expect(result.updatedReasonTrace.stateDeltas).toEqual(result.stateDeltas);
    expect(result.event.type).toBe('action_selected');
  });

  it('continue candidate produces no-op deltas', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'test', needs: {}, emotion: {} },
      selectedCandidate: { type: 'continue', source: 'behaviorField', target: '', label: '继续' },
      reasonTrace: { selectedAction: 'continue', keyReasons: [], scoreBreakdown: { total: 1 } },
      simTime: new Date('2026-09-01T10:00:00Z'),
    });

    expect(result.stateDeltas.need).toEqual({});
    expect(result.stateDeltas.emotion).toEqual({});
    expect(result.stateDeltas.memory).toBeNull();
    expect(result.stateDeltas.relationship).toBeNull();
  });

  it('null candidate returns action_none event', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'test' },
      selectedCandidate: null,
      reasonTrace: null,
      simTime: new Date('2026-09-01T10:00:00Z'),
    });

    expect(result.event.type).toBe('action_none');
    expect(result.stateDeltas).toBeDefined();
  });

  it('stateDeltas are JSON-serializable', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'test' },
      selectedCandidate: { type: 'rest', source: 'test', target: '', label: '' },
      reasonTrace: { selectedAction: 'rest', keyReasons: [], scoreBreakdown: { total: 1 } },
      simTime: new Date('2026-09-01T10:00:00Z'),
    });

    expect(() => JSON.stringify(result.stateDeltas)).not.toThrow();
    expect(() => JSON.stringify(result.updatedReasonTrace)).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// Phase 35: dryRunEffects mode integration
// ═══════════════════════════════════════════

describe('Phase 35: Effect Pipeline Dry-Run Gate', () => {
  it('dryRunEffects: trace.stateDeltas is not null for rest action', () => {
    const engine = createEngine('dry-rest', DRY_RUN);

    // Stub provider to return a fixed rest candidate
    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = {
      generateAll() {
        return [
          { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} },
        ];
      },
    };

    engine.tick();

    const traces = agent._actionTraceHistory;
    expect(traces.length).toBe(1);

    const trace = traces[0];
    expect(trace.selectedAction).toBe('rest');
    expect(trace.stateDeltas).not.toBeNull();
    expect(trace.stateDeltas.need).toBeDefined();
    expect(trace.stateDeltas.need.energy).toBeGreaterThan(0);
    expect(trace.stateDeltas.emotion).toBeDefined();
  });

  it('event mode: trace.stateDeltas remains null', () => {
    const engine = createEngine('event-null', EVENT);

    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = {
      generateAll() {
        return [
          { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} },
        ];
      },
    };

    engine.tick();

    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('rest');
    expect(trace.stateDeltas).toBeNull();
  });

  it('dryRunEffects vs event: live agent state is identical', () => {
    const dry = createEngine('dry-invariant', DRY_RUN);
    const evt = createEngine('dry-invariant', EVENT);

    const stubProvider = {
      generateAll() {
        return [
          { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} },
        ];
      },
    };

    dry.getAgent('char_1')._candidateProviderManager = stubProvider;
    evt.getAgent('char_1')._candidateProviderManager = stubProvider;

    for (let i = 0; i < 5; i++) {
      dry.tick();
      evt.tick();
    }

    expectSameState(
      snapshotAgentState(dry.getAgent('char_1')),
      snapshotAgentState(evt.getAgent('char_1'))
    );

    // Both have traces, but dryRun has stateDeltas and event does not
    const dryTraces = dry.getAgent('char_1')._actionTraceHistory;
    const evtTraces = evt.getAgent('char_1')._actionTraceHistory;
    expect(dryTraces.length).toBe(5);
    expect(evtTraces.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      expect(dryTraces[i].stateDeltas).not.toBeNull();
      expect(evtTraces[i].stateDeltas).toBeNull();
    }
  });

  it('dryRunEffects action_selected event has stateDeltas, scope internal, no effects', () => {
    const engine = createEngine('dry-event', DRY_RUN);

    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = {
      generateAll() {
        return [
          { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} },
        ];
      },
    };

    engine.tick();

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);

    const event = events[0];
    expect(event.scope).toBe('internal');
    expect(event.participants).toEqual([]);
    expect(event.observers).toEqual([]);
    expect(event.effects).toEqual([]);
    expect(event.stateDeltas).toBeDefined();
    expect(event.stateDeltas.need.energy).toBeGreaterThan(0);
    expect(event.reasonTrace.stateDeltas).not.toBeNull();
  });

  it('dryRunEffects event is not perceived by agents', () => {
    const engine = createEngine('dry-perceived', DRY_RUN);

    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = {
      generateAll() {
        return [
          { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} },
        ];
      },
    };

    engine.tick();

    const recentEvents = engine.world.eventDispatcher.eventLog.slice(-10);
    const perceived = engine.world.eventDispatcher.filterEventsForAgent('char_1', recentEvents);

    expect(recentEvents.some(e => e.type === 'action_selected')).toBe(true);
    expect(perceived.some(e => e.type === 'action_selected')).toBe(false);
  });

  it('continue / unsupported action produces no-op delta, no crash', () => {
    const engine = createEngine('dry-noop', DRY_RUN);

    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = {
      generateAll() {
        return [
          { id: 'cand_continue_1', type: 'continue', source: 'behaviorField', target: '', label: 'continue', constraints: {}, metadata: {} },
        ];
      },
    };

    expect(() => engine.tick()).not.toThrow();

    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('continue');
    expect(trace.stateDeltas).not.toBeNull();
    expect(trace.stateDeltas.need).toEqual({});
    expect(trace.stateDeltas.emotion).toEqual({});
  });

  it('shadow mode: trace.stateDeltas remains null, no event', () => {
    const engine = createEngine('shadow-no-delta', SHADOW);

    const agent = engine.getAgent('char_1');
    agent._candidateProviderManager = {
      generateAll() {
        return [
          { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} },
        ];
      },
    };

    engine.tick();

    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('rest');
    expect(trace.stateDeltas).toBeNull();

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(0);
  });

  it('dryRunEffects determinism: same seed produces identical stateDeltas', () => {
    const e1 = createEngine('dry-det', DRY_RUN);
    const e2 = createEngine('dry-det', DRY_RUN);

    const stub = {
      generateAll() {
        return [
          { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} },
        ];
      },
    };
    e1.getAgent('char_1')._candidateProviderManager = stub;
    e2.getAgent('char_1')._candidateProviderManager = stub;

    for (let i = 0; i < 3; i++) {
      e1.tick();
      e2.tick();
    }

    const t1 = e1.getAgent('char_1')._actionTraceHistory;
    const t2 = e2.getAgent('char_1')._actionTraceHistory;
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
  });
});
