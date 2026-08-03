import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { toWorldState, fromWorldState } from '../../src/store/world/WorldStateAdapter.js';

const START_TIME = new Date('2026-01-01T00:00:00Z');
const TICK_COUNT = 30 * 24 * 60 / 5;
const SPLIT_TICK = TICK_COUNT / 2;
const ENCOUNTER_COOLDOWN_MINUTES = 120;
const EVENT_CONFIG = {
  encounterCooldownMinutes: ENCOUNTER_COOLDOWN_MINUTES,
  eventLifespan: 31 * 24 * 60,
  randomEventProbability: 0,
};

function createEngine() {
  return new AndyEngine({
    seed: 'long-horizon-social-reality',
    startTime: new Date(START_TIME),
    // Retain the complete 30-day event history for timestamp assertions.
    events: EVENT_CONFIG,
    actionSelection: { enabled: false },
  });
}

function addCoPresentPair(engine) {
  engine.createCharacter({
    id: 'alice',
    name: 'Alice',
    mbti: 'INFP',
    schedule: { entries: [] },
    initialPosition: '校园广场',
  });
  engine.createCharacter({
    id: 'bob',
    name: 'Bob',
    mbti: 'ISTJ',
    schedule: { entries: [] },
    initialPosition: '校园广场',
  });
}

function runTicks(engine, count) {
  let degradedTicks = 0;
  for (let i = 0; i < count; i++) {
    if (engine.tick().status !== 'committed') degradedTicks++;
  }
  return degradedTicks;
}

function pairEncounterTimes(state) {
  const ids = new Set(['alice', 'bob']);
  return state.runtimeSnapshot.events.eventLog
    .filter(event => event.type === 'social'
      && event.participants.length === 2
      && event.participants.every(id => ids.has(id)))
    .map(event => new Date(event.time).getTime())
    .filter(time => Number.isFinite(time))
    .sort((a, b) => a - b);
}

function pairRelationship(state) {
  return state.runtimeSnapshot.socialGraph.edges.find(edge =>
    new Set([edge.agentA, edge.agentB]).size === 2
    && new Set([edge.agentA, edge.agentB]).has('alice')
    && new Set([edge.agentA, edge.agentB]).has('bob'));
}

function persistentPairState(state) {
  const relationship = pairRelationship(state);
  const runtimeState = state.runtimeSnapshot;
  return {
    time: runtimeState.time,
    tickCount: runtimeState.tickCount,
    relationship,
    agents: Object.fromEntries(['alice', 'bob'].map(id => {
      const agent = runtimeState.agents[id];
      return [id, {
        position: agent.position,
        needs: agent.needs,
        emotion: agent.emotion,
        memory: agent.memory,
      }];
    })),
  };
}

function runScenario(split = false) {
  const engine = createEngine();
  addCoPresentPair(engine);
  const degradedTicks = runTicks(engine, split ? SPLIT_TICK : TICK_COUNT);

  if (split) {
    const checkpoint = toWorldState(engine, 'long-horizon-social');
    const restored = fromWorldState(checkpoint, { events: EVENT_CONFIG }, AndyEngine);
    return {
      degradedTicks: degradedTicks + runTicks(restored, TICK_COUNT - SPLIT_TICK),
      state: toWorldState(restored, 'long-horizon-social'),
    };
  }

  return { degradedTicks, state: toWorldState(engine, 'long-horizon-social') };
}

describe('30-day social reality characterization', () => {
  it('keeps natural encounters time-gated and save/resume equivalent', () => {
    const continuous = runScenario();
    const segmented = runScenario(true);
    const encounterTimes = pairEncounterTimes(continuous.state);
    const gaps = encounterTimes.slice(1).map((time, index) =>
      (time - encounterTimes[index]) / (60 * 1000)
    );
    const relationship = pairRelationship(continuous.state);
    const validTypes = new Set(['stranger', 'acquaintance', 'friend', 'closeFriend']);

    expect(continuous.degradedTicks).toBe(0);
    expect(segmented.degradedTicks).toBe(0);
    expect(encounterTimes.length).toBeGreaterThan(1);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(ENCOUNTER_COOLDOWN_MINUTES);

    // Safety bounds characterize the model without prescribing a social outcome.
    expect(relationship.interactionCount).toBe(encounterTimes.length);
    expect(relationship.strength).toBeGreaterThanOrEqual(0);
    expect(relationship.strength).toBeLessThanOrEqual(1);
    expect(validTypes.has(relationship.type)).toBe(true);
    expect(relationship.history.length).toBeLessThanOrEqual(20);
    expect(relationship.impression.positive).toBeLessThanOrEqual(5);
    expect(relationship.impression.negative).toBeLessThanOrEqual(5);
    for (const id of ['alice', 'bob']) {
      expect(continuous.state.runtimeSnapshot.agents[id].memory.memories.length).toBeLessThanOrEqual(200);
    }

    expect(persistentPairState(segmented.state)).toEqual(persistentPairState(continuous.state));
    expect(pairEncounterTimes(segmented.state)).toEqual(encounterTimes);
  }, 30_000);
});
