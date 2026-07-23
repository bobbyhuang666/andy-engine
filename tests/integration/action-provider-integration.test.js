/**
 * Stage 37: Provider Integration Matrix
 *
 * Verifies that the three new providers (Memory, Habit, WorldPressure)
 * integrate correctly with all action selection modes:
 *   - shadow: trace only, no event, no state mutation
 *   - event: trace + event, no state mutation
 *   - dryRunEffects: trace + event + stateDeltas metadata, no state mutation
 *   - active: trace + event + stateDeltas + EffectCommitter writeback
 *
 * Also verifies:
 *   - Action selection pipeline is read-only before EffectCommitter
 *   - enableFacts defaults to false
 *   - Seed determinism across modes
 *   - Custom tavern domain has no campus terms
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const tavernDomain = require('../../presets/tavern/index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

const SHADOW = { enabled: true, mode: 'shadow', temperature: 0, recordTraces: true, maxTraceHistory: 100 };
const EVENT = { ...SHADOW, mode: 'event' };
const DRY_RUN = { ...SHADOW, mode: 'dryRunEffects' };
const ACTIVE = { ...SHADOW, mode: 'active' };

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
    emotion: { ...agent.emotion.current },
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
  for (let i = 0; i < 4; i++) {
    expect(a.B[i]).toBe(b.B[i]);
  }
  for (const key of Object.keys(a.needs)) {
    expect(a.needs[key]).toBe(b.needs[key]);
  }
}

const CAMPUS_TERMS = ['宿舍', '教学楼', '图书馆', '食堂', '便利店', '操场',
  '校园广场', '打工地点', '回家路上', '教室', '自习室', '网吧',
  '上课', '下课', '翘课', '学生', '老师', '同学', '宿舍楼'];

// ═══════════════════════════════════════════
// 1. Shadow mode: only records trace, no action_selected event
// ═══════════════════════════════════════════

describe('Shadow mode integration', () => {
  // @characterization — direct state injection; not Beta evidence
  it('records trace but emits no action_selected event', () => {
    const engine = createEngine('shadow-integ', SHADOW);
    for (let i = 0; i < 5; i++) engine.tick();

    const agent = engine.getAgent('char_1');
    expect(agent._actionTraceHistory.length).toBe(5);

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(actionEvents.length).toBe(0);
  });

  it('shadow does not mutate agent state beyond normal tick evolution', () => {
    const eDisabled = createEngine('shadow-state', { enabled: false, mode: 'shadow', temperature: 0, recordTraces: true, maxTraceHistory: 100 });
    const eShadow = createEngine('shadow-state', SHADOW);

    for (let i = 0; i < 15; i++) {
      eDisabled.tick();
      eShadow.tick();
    }

    expectSameState(
      snapshotAgentState(eDisabled.getAgent('char_1')),
      snapshotAgentState(eShadow.getAgent('char_1'))
    );
  });

  it('shadow trace has stateDeltas null', () => {
    const engine = createEngine('shadow-deltas', SHADOW);
    engine.tick();

    const trace = engine.getAgent('char_1')._actionTraceHistory[0];
    expect(trace.stateDeltas).toBeNull();
  });
});

// ═══════════════════════════════════════════
// 2. Event mode: can generate action_selected event
// ═══════════════════════════════════════════

describe('Event mode integration', () => {
  it('emits action_selected event in eventLog', () => {
    const engine = createEngine('event-integ', EVENT);
    engine.tick();

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(actionEvents.length).toBe(1);
    expect(actionEvents[0].scope).toBe('internal');
    expect(actionEvents[0].agentId).toBe('char_1');
  });

  it('event mode does not mutate agent state beyond normal tick evolution', () => {
    const eShadow = createEngine('event-state', SHADOW);
    const eEvent = createEngine('event-state', EVENT);

    for (let i = 0; i < 10; i++) {
      eShadow.tick();
      eEvent.tick();
    }

    expectSameState(
      snapshotAgentState(eShadow.getAgent('char_1')),
      snapshotAgentState(eEvent.getAgent('char_1'))
    );
  });

  it('event mode trace has stateDeltas null', () => {
    const engine = createEngine('event-deltas', EVENT);
    engine.tick();

    const trace = engine.getAgent('char_1')._actionTraceHistory[0];
    expect(trace.stateDeltas).toBeNull();
  });
});

// ═══════════════════════════════════════════
// 3. dryRunEffects: has stateDeltas metadata but does not write state
// ═══════════════════════════════════════════

describe('dryRunEffects mode integration', () => {
  it('has stateDeltas in trace but does not mutate live state', () => {
    const eShadow = createEngine('dry-state', SHADOW);
    const eDry = createEngine('dry-state', DRY_RUN);

    for (let i = 0; i < 10; i++) {
      eShadow.tick();
      eDry.tick();
    }

    // Live state identical between shadow and dryRun (no writeback)
    expectSameState(
      snapshotAgentState(eShadow.getAgent('char_1')),
      snapshotAgentState(eDry.getAgent('char_1'))
    );

    // dryRun trace has stateDeltas
    const dryTrace = eDry.getAgent('char_1')._actionTraceHistory[0];
    expect(dryTrace.stateDeltas).not.toBeNull();
    expect(typeof dryTrace.stateDeltas).toBe('object');
  });

  it('emits action_selected event with stateDeltas', () => {
    const engine = createEngine('dry-event', DRY_RUN);
    engine.tick();

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(actionEvents.length).toBe(1);
    expect(actionEvents[0].stateDeltas).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// 4. Active mode: only writes state through EffectCommitter
// ═══════════════════════════════════════════

describe('Active mode integration', () => {
  it('active mode writes state through EffectCommitter (energy differs from dryRun after rest)', () => {
    const eDry = createEngine('active-write', DRY_RUN);
    const eActive = createEngine('active-write', ACTIVE);

    // Inject a rest candidate to guarantee a rest action
    const restCandidate = { id: 'cand_need_rest_target', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} };
    const stub = { generateAll() { return [restCandidate]; } };
    eDry.getAgent('char_1')._candidateProviderManager = stub;
    eActive.getAgent('char_1')._candidateProviderManager = stub;

    eDry.tick();
    eActive.tick();

    const dryAgent = eDry.getAgent('char_1');
    const activeAgent = eActive.getAgent('char_1');

    // Active should have applied rest delta: energy +0.4, calm +0.1, joy +0.05
    expect(activeAgent.needs.needs.energy).toBeGreaterThan(dryAgent.needs.needs.energy);
    expect(activeAgent.emotion.current.calm).toBeGreaterThan(dryAgent.emotion.current.calm || 0);
  });

  it('active emits action_selected event', () => {
    const engine = createEngine('active-event', ACTIVE);
    engine.tick();

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(actionEvents.length).toBe(1);
  });

  it('active mode energy clamped to [0,1]', () => {
    const engine = createEngine('active-clamp', ACTIVE);
    const agent = engine.getAgent('char_1');
    agent.needs.needs.energy = 0.95;

    const restCandidate = { id: 'cand_need_rest_target', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} };
    agent._candidateProviderManager = { generateAll() { return [restCandidate]; } };

    engine.tick();

    expect(agent.needs.needs.energy).toBeLessThanOrEqual(1);
    expect(agent.needs.needs.energy).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════
// 5. Seed determinism: same seed -> same candidate order / selected action
// ═══════════════════════════════════════════

describe('Seed determinism across modes', () => {
  it('same seed produces byte-equivalent traces in shadow mode', () => {
    const e1 = createEngine('det-shadow', SHADOW);
    const e2 = createEngine('det-shadow', SHADOW);

    for (let i = 0; i < 5; i++) {
      e1.tick();
      e2.tick();
    }

    const t1 = e1.getAgent('char_1')._actionTraceHistory;
    const t2 = e2.getAgent('char_1')._actionTraceHistory;
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
  });

  it('same seed produces byte-equivalent traces in active mode', () => {
    const e1 = createEngine('det-active', ACTIVE);
    const e2 = createEngine('det-active', ACTIVE);

    for (let i = 0; i < 5; i++) {
      e1.tick();
      e2.tick();
    }

    const t1 = e1.getAgent('char_1')._actionTraceHistory;
    const t2 = e2.getAgent('char_1')._actionTraceHistory;
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
  });

  it('same seed produces identical live state in active mode', () => {
    const e1 = createEngine('det-active-state', ACTIVE);
    const e2 = createEngine('det-active-state', ACTIVE);

    for (let i = 0; i < 10; i++) {
      e1.tick();
      e2.tick();
    }

    expectSameState(
      snapshotAgentState(e1.getAgent('char_1')),
      snapshotAgentState(e2.getAgent('char_1'))
    );
  });
});

// ═══════════════════════════════════════════
// 6. Custom tavern domain: no campus words in candidates or traces
// ═══════════════════════════════════════════

describe('Custom tavern domain integration', () => {
  it('shadow traces contain no campus terms', () => {
    const engine = createEngine('tavern-shadow', SHADOW, tavernDomain);
    for (let i = 0; i < 5; i++) engine.tick();

    const traces = engine.getAgent('char_1')._actionTraceHistory;
    const traceJson = JSON.stringify(traces);
    for (const term of CAMPUS_TERMS) {
      expect(traceJson).not.toContain(term);
    }
  });

  it('active events contain no campus terms', () => {
    const engine = createEngine('tavern-active', ACTIVE, tavernDomain);
    engine.tick();

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);

    const eventJson = JSON.stringify(events);
    for (const term of CAMPUS_TERMS) {
      expect(eventJson).not.toContain(term);
    }
  });

  it('tavern domain produces valid candidates (no errors)', () => {
    const engine = createEngine('tavern-candidates', SHADOW, tavernDomain);
    for (let i = 0; i < 10; i++) engine.tick();

    const traces = engine.getAgent('char_1')._actionTraceHistory;
    expect(traces.length).toBe(10);
    // At least some traces should have a selected action
    const hasAction = traces.some(t => t.selectedAction !== null);
    expect(hasAction).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 7. Action selection read-only before EffectCommitter
// ═══════════════════════════════════════════

describe('Action selection pipeline is read-only before EffectCommitter', () => {
  it('shadow mode does not mutate agent state (shadow vs disabled identical)', () => {
    // Shadow mode does NOT emit events to eventLog, so no indirect state effects.
    // Shadow vs disabled must be identical in all state dimensions.
    const eDisabled = createEngine('readonly-disabled', { enabled: false, mode: 'shadow', temperature: 0, recordTraces: true, maxTraceHistory: 100 });
    const eShadow = createEngine('readonly-disabled', SHADOW);

    for (let i = 0; i < 15; i++) {
      eDisabled.tick();
      eShadow.tick();
    }

    const sOff = snapshotAgentState(eDisabled.getAgent('char_1'));
    const sShadow = snapshotAgentState(eShadow.getAgent('char_1'));

    expect(sOff.position).toBe(sShadow.position);
    expect(sOff.health).toBe(sShadow.health);
    expect(sOff.socialEnergy).toBe(sShadow.socialEnergy);
    expect(sOff.memoryCount).toBe(sShadow.memoryCount);
    for (let i = 0; i < 4; i++) {
      expect(sOff.B[i]).toBe(sShadow.B[i]);
    }
    for (const key of Object.keys(sOff.needs)) {
      expect(sOff.needs[key]).toBe(sShadow.needs[key]);
    }
    for (const key of Object.keys(sOff.emotion)) {
      expect(sOff.emotion[key]).toBe(sShadow.emotion[key]);
    }
  });

  it('dryRun and active produce identical stateDeltas (pipeline is deterministic)', () => {
    // Both dryRun and active compute the same stateDeltas through the same pipeline.
    // Only active commits them. This proves the pipeline itself is pure.
    const eDry = createEngine('readonly-dryrun', DRY_RUN);
    const eActive = createEngine('readonly-dryrun', ACTIVE);

    eDry.tick();
    eActive.tick();

    const dryTrace = eDry.getAgent('char_1')._actionTraceHistory[0];
    const activeTrace = eActive.getAgent('char_1')._actionTraceHistory[0];

    // Same candidate selected (same seed)
    expect(dryTrace.selectedAction).toBe(activeTrace.selectedAction);
    // Same stateDeltas computed
    expect(dryTrace.stateDeltas).toEqual(activeTrace.stateDeltas);
    // Same score breakdown
    expect(dryTrace.scoreBreakdown.total).toBe(activeTrace.scoreBreakdown.total);
  });

  it('providers generateAll does not modify context', () => {
    const { CandidateProviderManager } = require('../../src/action/providers/CandidateProviderManager');
    const manager = new CandidateProviderManager();

    const context = {
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], label: 'resting', velocity: [0, 0, 0, 0] },
      needs: { hunger: 0.3, energy: 0.3, social: 0.5, stimulation: 0.5 },
      schedule: null,
      intrinsic: { curiosity: 0.1 },
      relationships: [],
      agent: { id: 'test', position: 'home', state: 'resting', socialEnergy: 0.5, health: 1 },
      world: { time: '2026-09-01T14:00:00Z' },
      memories: [],
      emotion: { current: {}, valence: 0, arousal: 0 },
      goals: [],
      worldPressure: null,
      domain: null,
    };
    const contextCopy = JSON.parse(JSON.stringify(context));

    manager.generateAll(context);

    // Context must be unchanged after generateAll
    expect(JSON.stringify(context)).toBe(JSON.stringify(contextCopy));
  });
});

// ═══════════════════════════════════════════
// 8. enableFacts defaults to false
// ═══════════════════════════════════════════

describe('enableFacts default', () => {
  it('enableFacts defaults to false when not specified', () => {
    const engine = new AndyEngine({ seed: 'facts-default', startTime: new Date(TEST_START) });
    expect(engine.config.enableFacts).toBe(false);
  });

  it('enableFacts=false means no factStore/knowledgeStore', () => {
    const engine = new AndyEngine({ seed: 'facts-null', startTime: new Date(TEST_START) });
    expect(engine.world.factStore).toBeNull();
    expect(engine.world.knowledgeStore).toBeNull();
    expect(engine.world.canonEventPipeline).toBeNull();
  });
});

// ═══════════════════════════════════════════
// 9. Provider count verification
// ═══════════════════════════════════════════

describe('Provider count', () => {
  it('CandidateProviderManager has 9 providers', () => {
    const { CandidateProviderManager } = require('../../src/action/providers/CandidateProviderManager');
    const manager = new CandidateProviderManager();
    expect(manager.providers.length).toBe(9);
  });
});
