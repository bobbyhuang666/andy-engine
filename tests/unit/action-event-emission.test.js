/**
 * Phase 34: Action Event Emission Gate
 *
 * Event mode emits internal action_selected audit events without applying effects
 * or making the event perceptible to agents.
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const tavernDomain = require('../../presets/tavern/index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

const SHADOW_ENABLED = {
  enabled: true,
  mode: 'shadow',
  temperature: 0.35,
  recordTraces: true,
  maxTraceHistory: 100,
};

const EVENT_ENABLED = {
  ...SHADOW_ENABLED,
  mode: 'event',
};

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

describe('Phase 34: Action Event Emission Gate', () => {
  it('shadow mode records traces but emits no action_selected events', () => {
    const engine = createEngine('phase34-shadow', SHADOW_ENABLED);
    for (let i = 0; i < 3; i++) engine.tick();

    const agent = engine.getAgent('char_1');
    expect(agent._actionTraceHistory.length).toBe(3);

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(actionEvents.length).toBe(0);
  });

  it('event mode emits internal action_selected event with reasonTrace', () => {
    const engine = createEngine('phase34-event', EVENT_ENABLED);
    engine.tick();

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(1);

    const event = events[0];
    expect(event.scope).toBe('internal');
    expect(event.participants).toEqual([]);
    expect(event.observers).toEqual([]);
    expect(event.effects).toEqual([]);
    expect(event.agentId).toBe('char_1');
    expect(event.action).toBeDefined();
    expect(event.action.type).toBe(event.reasonTrace.selectedAction);
    expect(event.reasonTrace).toBeDefined();
    expect(event.reasonTrace.stateDeltas).toBeNull();
    expect(event.reasonTrace.candidateAlternatives.length).toBeGreaterThan(0);
  });

  it('event mode does not change live agent state compared with shadow mode', () => {
    const shadow = createEngine('phase34-invariant', SHADOW_ENABLED);
    const event = createEngine('phase34-invariant', EVENT_ENABLED);

    for (let i = 0; i < 5; i++) {
      shadow.tick();
      event.tick();
    }

    expectSameState(
      snapshotAgentState(shadow.getAgent('char_1')),
      snapshotAgentState(event.getAgent('char_1'))
    );

    expect(shadow.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected').length).toBe(0);
    expect(event.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected').length).toBe(5);
  });

  it('internal action_selected events are not perceived on the next tick', () => {
    const event = createEngine('phase34-internal', EVENT_ENABLED);
    event.tick();

    const agent = event.getAgent('char_1');
    const before = snapshotAgentState(agent);
    const recentEvents = event.world.eventDispatcher.eventLog.slice(-10);
    const perceived = event.world.eventDispatcher.filterEventsForAgent('char_1', recentEvents);

    expect(recentEvents.some(e => e.type === 'action_selected')).toBe(true);
    expect(perceived.some(e => e.type === 'action_selected')).toBe(false);

    event.tick();
    const after = snapshotAgentState(agent);

    // This does not require the whole state to be unchanged after a tick.
    // It only verifies the action event was not converted into a memory.
    expect(after.memoryCount).toBe(before.memoryCount);
  });

  it('tavern domain action_selected event contains no campus forbidden terms', () => {
    const engine = createEngine('phase34-tavern', EVENT_ENABLED, tavernDomain);
    for (let i = 0; i < 3; i++) engine.tick();

    const events = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
    expect(events.length).toBe(3);

    const text = JSON.stringify(events);
    for (const term of tavernDomain.forbiddenTerms) {
      expect(text).not.toContain(term);
    }
  });
});
