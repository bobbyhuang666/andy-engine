import { describe, it, expect, vi } from 'vitest';
import AndyEngine from '../../index.js';

const TEST_START = new Date('2026-09-01T08:00:00Z');
const FULL_RELATION_EFFECT = 0.012 * (1 + 0.3) * 0.6;

function encounterEvent() {
  return {
    type: 'social',
    content: 'controlled encounter',
    effects: [
      {
        target: 'alice',
        type: 'relationship',
        delta: { target: 'bob', valence: 0.3 },
      },
      {
        target: 'alice',
        type: 'emotion',
        delta: { joy: 0.06, calm: 0.04 },
      },
      {
        target: 'alice',
        type: 'memory',
        delta: { kind: 'candidate', memoryType: 'social', content: 'encounter memory' },
      },
    ],
  };
}

function emotionEncounter(delta) {
  const effect = { target: 'alice', type: 'emotion', delta };
  return {
    type: 'social',
    content: 'controlled emotion encounter',
    effects: [effect],
    effect,
  };
}

function createEncounterEngine(seed = 'encounter-duration') {
  const engine = new AndyEngine({ seed, startTime: new Date(TEST_START) });
  engine.createCharacter({
    id: 'alice', name: 'Alice', mbti: 'INFP',
    schedule: { entries: [] }, initialPosition: '宿舍',
  });
  engine.createCharacter({
    id: 'bob', name: 'Bob', mbti: 'ISTJ',
    schedule: { entries: [] }, initialPosition: '宿舍',
  });
  const relation = engine.world.socialGraph.getOrCreateRelationship('alice', 'bob');
  relation.strength = 0.2;
  return engine;
}

function applyControlledEncounter(engine) {
  const alice = engine.getAgent('alice');
  const relation = engine.world.socialGraph.getRelationship('alice', 'bob');
  const before = {
    strength: relation.strength,
    positive: relation.impression.positive,
    joy: alice.emotion.current.joy,
    calm: alice.emotion.current.calm,
    memories: alice.memory.memories.length,
  };
  const emotionScale = 1 - alice.personality.behavior.emotionalInertia * 0.5;
  const count = engine.world._applyEncounterEffects([encounterEvent()]);

  return {
    count,
    strengthEffect: relation.strength - before.strength,
    positiveEffect: relation.impression.positive - before.positive,
    joyEffect: alice.emotion.current.joy - before.joy,
    calmEffect: alice.emotion.current.calm - before.calm,
    emotionScale,
    memoryEffect: alice.memory.memories.length - before.memories,
    interactionCount: relation.interactionCount,
    historyLength: relation.history.length,
    lastInteraction: relation.lastInteraction,
  };
}

describe('natural encounter discrete effects', () => {
  it.each([
    {},
    { joy: Number.NaN, calm: Number.POSITIVE_INFINITY },
  ])('does not commit an empty encounter emotion delta (%j) but marks it handled', delta => {
    const engine = createEncounterEngine('encounter-empty-emotion');
    const event = emotionEncounter(delta);
    const commit = vi.spyOn(engine.world.effectCommitter, 'commit');

    expect(engine.world._applyEncounterEffects([event])).toBe(0);

    expect(commit).not.toHaveBeenCalled();
    expect(event.effect._committedByEncounterEffects).toBe(true);
  });

  it('commits valid encounter emotion changes at full discrete strength', () => {
    const engine = createEncounterEngine('encounter-valid-emotion');
    const event = emotionEncounter({ joy: 0.06, calm: 0.04 });
    const commit = vi.spyOn(engine.world.effectCommitter, 'commit');

    expect(engine.world._applyEncounterEffects([event])).toBe(1);

    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0][0].deltas).toHaveLength(1);
    expect(commit.mock.calls[0][0].deltas[0].changes).toEqual({
      joy: 0.06,
      calm: 0.04,
    });
    expect(event.effect._committedByEncounterEffects).toBe(true);
  });

  it('direct encounter without duration preserves full relationship and emotion effects', () => {
    const result = applyControlledEncounter(createEncounterEngine('encounter-legacy'));

    expect(result.count).toBe(3);
    expect(result.strengthEffect).toBeCloseTo(FULL_RELATION_EFFECT, 12);
    expect(result.positiveEffect).toBeCloseTo(0.3, 12);
    expect(result.joyEffect).toBeCloseTo(0.06 * result.emotionScale, 12);
    expect(result.calmEffect).toBeCloseTo(0.04 * result.emotionScale, 12);
    expect(result.memoryEffect).toBe(1);
    expect(result.interactionCount).toBe(1);
    expect(result.historyLength).toBe(1);
    expect(result.lastInteraction).toEqual(TEST_START);
  });

  it('active engine encounter replay remains deterministic', () => {
    function createActive(seed) {
      const engine = new AndyEngine({
        seed,
        startTime: new Date(TEST_START),
        actionSelection: {
          enabled: true,
          mode: 'active',
          temperature: 0,
          recordTraces: true,
          maxTraceHistory: 20,
        },
      });
      engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP', schedule: { entries: [] }, initialPosition: '宿舍' });
      engine.createCharacter({ id: 'bob', name: 'Bob', mbti: 'ISTJ', schedule: { entries: [] }, initialPosition: '宿舍' });
      return engine;
    }

    function snapshot(engine) {
      const relation = engine.world.socialGraph.getRelationship('alice', 'bob');
      return {
        alice: {
          emotion: engine.getAgent('alice').emotion.current,
          trace: engine.getAgent('alice')._actionTraceHistory,
        },
        relation: relation && {
          strength: relation.strength,
          impression: relation.impression,
          interactionCount: relation.interactionCount,
          history: relation.history,
        },
      };
    }

    const first = createActive('encounter-replay');
    const second = createActive('encounter-replay');
    for (let i = 0; i < 10; i++) {
      first.tick();
      second.tick();
    }

    expect(snapshot(first)).toEqual(snapshot(second));
  });
});
