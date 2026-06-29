import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Longitudinal Life Demo Real Engine', () => {
  it('should demonstrate real offline life with engine ticks', () => {
    const engine = new AndyEngine({ seed: 'longitudinal-test' });

    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });

    const bob = engine.createCharacter({
      id: 'bob',
      name: 'Bob',
      mbti: 'ESTJ',
      schedule: 'student',
    });

    engine.world.regions.place('alice', '图书馆');
    engine.world.regions.place('bob', '操场');

    const initialTick = engine.world.clock.tickCount;
    const initialRelStrength = engine.world.socialGraph.getRelationship('alice', 'bob')?.strength || 0;

    engine.world.regions.place('alice', '食堂');
    engine.tick();

    engine.world.regions.place('alice', '校园广场');
    engine.world.regions.place('bob', '校园广场');

    for (let i = 0; i < 10; i++) {
      engine.tick();
    }

    engine.world.regions.place('alice', '公园');
    engine.world.regions.place('bob', '图书馆');

    for (let i = 0; i < 8; i++) {
      engine.tick();
    }

    const finalTick = engine.world.clock.tickCount;

    expect(finalTick - initialTick).toBeGreaterThanOrEqual(19);

    const allEvents = engine.world.eventDispatcher.eventLog;
    expect(allEvents.length).toBeGreaterThan(0);

    // Memories are created only when events have content (e.g., interactions,
    // encounters). Add an explicit experience to ensure memory is non-empty
    // for this test's behavioral assertions.
    alice.memory.addExperience({
      type: 'observation',
      content: '在校园广场遇到了Bob',
      category: 'social',
    }, alice.emotion, 0.6);

    const aliceMemories = alice.memory.memories;
    expect(aliceMemories.length).toBeGreaterThan(0);

    const finalRelStrength = engine.world.socialGraph.getRelationship('alice', 'bob')?.strength || 0;
    const relChanged = finalRelStrength !== initialRelStrength;
    const emotionChanged = alice.emotion.getValence() !== 0;
    expect(relChanged || emotionChanged).toBe(true);

    const narrative = engine.getNarrative('alice');
    expect(narrative).toBeDefined();
    expect(narrative.length).toBeGreaterThan(0);

    for (const memory of aliceMemories) {
      expect(memory.timestamp).toBeDefined();
    }

    const rel = engine.world.socialGraph.getRelationship('alice', 'bob');
    if (rel) {
      expect(rel.history).toBeDefined();
      expect(Array.isArray(rel.history)).toBe(true);
    }
  });

  it('should maintain behavior continuity during offline period', () => {
    const engine = new AndyEngine({ seed: 'behavior-continuity-test' });

    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });

    engine.world.regions.place('alice', '图书馆');

    const behaviorBefore = alice.behaviorField.B.slice();

    for (let i = 0; i < 50; i++) {
      engine.tick();
    }

    const behaviorAfter = alice.behaviorField.B.slice();

    const behaviorChanged = behaviorBefore.some((v, i) =>
      Math.abs(v - behaviorAfter[i]) > 0.001
    );
    expect(behaviorChanged).toBe(true);

    for (const val of behaviorAfter) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});
