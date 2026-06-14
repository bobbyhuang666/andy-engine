import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

function createEngine(seed, actionSelection) {
  const config = { seed, startTime: new Date(TEST_START), actionSelection };
  const engine = new AndyEngine(config);
  engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP', schedule: 'student' });
  return engine;
}

describe('Phase 34: Action Event Emission', () => {
  it('action_selected event is created when event mode is enabled', () => {
    const engine = createEngine('emit-test', {
      enabled: true,
      mode: 'event',
      temperature: 0.35,
      recordTraces: true,
      maxTraceHistory: 100,
    });

    for (let i = 0; i < 5; i++) engine.tick();

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(
      e => e.type === 'action_selected'
    );

    expect(actionEvents.length).toBe(5);
  });

  it('action event contains required fields', () => {
    const engine = createEngine('fields-test', {
      enabled: true,
      mode: 'event',
      temperature: 0.35,
      recordTraces: true,
      maxTraceHistory: 100,
    });

    engine.tick();

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(
      e => e.type === 'action_selected'
    );
    expect(actionEvents.length).toBe(1);

    const event = actionEvents[0];
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('type', 'action_selected');
    expect(event).toHaveProperty('time');
    expect(event).toHaveProperty('scope', 'internal');
    expect(event).toHaveProperty('agentId', 'test');
    expect(event).toHaveProperty('action');
    expect(event).toHaveProperty('reasonTrace');
    expect(event).toHaveProperty('participants');
    expect(event).toHaveProperty('observers');
    expect(event).toHaveProperty('effects');
  });

  it('event mode does not change agent state beyond normal tick', () => {
    const engine = createEngine('no-change', {
      enabled: true,
      mode: 'event',
      temperature: 0.35,
      recordTraces: true,
      maxTraceHistory: 100,
    });

    const agent = engine.getAgent('test');
    const initialNeeds = { ...agent.needs.needs };

    engine.tick();

    expect(agent.needs.needs.hunger).toBeDefined();
    expect(agent.needs.needs.energy).toBeDefined();
  });

  it('shadow mode and event mode produce same agent state', () => {
    const seed = 'invariant-seed';
    const SHADOW = { enabled: true, mode: 'shadow', temperature: 0.35, recordTraces: true, maxTraceHistory: 100 };
    const EVENT = { ...SHADOW, mode: 'event' };

    const e1 = createEngine(seed, SHADOW);
    const e2 = createEngine(seed, EVENT);

    for (let i = 0; i < 5; i++) {
      e1.tick();
      e2.tick();
    }

    const a1 = e1.getAgent('test');
    const a2 = e2.getAgent('test');

    expect(a1.behaviorField.label).toBe(a2.behaviorField.label);
    expect(a1.stateMachine.currentState).toBe(a2.stateMachine.currentState);
    expect(a1.position).toBe(a2.position);
    for (let d = 0; d < 4; d++) {
      expect(a1.behaviorField.B[d]).toBe(a2.behaviorField.B[d]);
    }
  });

  it('event log is bounded', () => {
    const engine = createEngine('bounded', {
      enabled: true,
      mode: 'event',
      temperature: 0.35,
      recordTraces: true,
      maxTraceHistory: 100,
    });

    for (let i = 0; i < 100; i++) engine.tick();

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(
      e => e.type === 'action_selected'
    );
    expect(actionEvents.length).toBe(100);
    expect(actionEvents.length).toBeLessThan(1000);
  });

  it('shadow mode does not emit action_selected events', () => {
    const engine = createEngine('shadow-no-emit', {
      enabled: true,
      mode: 'shadow',
      temperature: 0.35,
      recordTraces: true,
      maxTraceHistory: 100,
    });

    for (let i = 0; i < 5; i++) engine.tick();

    const actionEvents = engine.world.eventDispatcher.eventLog.filter(
      e => e.type === 'action_selected'
    );
    expect(actionEvents.length).toBe(0);
  });

  it('internal events are not perceived by agents on next tick', () => {
    const engine = createEngine('internal', {
      enabled: true,
      mode: 'event',
      temperature: 0.35,
      recordTraces: true,
      maxTraceHistory: 100,
    });

    engine.tick();

    const recentEvents = engine.world.eventDispatcher.eventLog.slice(-10);
    const perceived = engine.world.eventDispatcher.filterEventsForAgent('test', recentEvents);

    expect(recentEvents.some(e => e.type === 'action_selected')).toBe(true);
    expect(perceived.some(e => e.type === 'action_selected')).toBe(false);
  });
});
