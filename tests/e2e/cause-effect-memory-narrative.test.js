import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Cause/Effect/Memory/Narrative E2E', () => {
  it('should maintain consistency: interaction → relationship change → memory → narrative', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'cause-effect-test' });
    
    // Create Alice and Bob
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
    
    // Place them together to enable interaction
    engine.world.regions.place('alice', '校园广场');
    engine.world.regions.place('bob', '校园广场');
    
    // Record initial relationship
    const socialGraph = engine.world.socialGraph;
    const relBefore = socialGraph.getRelationship('alice', 'bob');
    const strengthBefore = relBefore ? relBefore.strength : 0;
    
    // Run ticks to generate interactions
    for (let i = 0; i < 20; i++) {
      engine.tick();
    }
    
    // === ASSERTION 1: Relationship should change after interaction ===
    const relAfter = socialGraph.getRelationship('alice', 'bob');
    expect(relAfter).toBeDefined();
    expect(relAfter.strength).toBeGreaterThan(strengthBefore);
    
    // === ASSERTION 2: Relationship should have history ===
    expect(relAfter.history).toBeDefined();
    expect(Array.isArray(relAfter.history)).toBe(true);
    
    // === ASSERTION 3: Memories should be formed ===
    const aliceMemories = alice.memory.memories;
    const bobMemories = bob.memory.memories;
    
    expect(aliceMemories).toBeDefined();
    expect(bobMemories).toBeDefined();
    expect(Array.isArray(aliceMemories)).toBe(true);
    expect(Array.isArray(bobMemories)).toBe(true);
    
    // === ASSERTION 4: Memories should have timestamps ===
    if (aliceMemories.length > 0) {
      const mem = aliceMemories[0];
      expect(mem.timestamp).toBeDefined();
      expect(mem.timestamp instanceof Date || typeof mem.timestamp === 'number').toBe(true);
    }
    
    // === ASSERTION 5: Narratives should exist ===
    const aliceNarrative = engine.getNarrative('alice');
    const bobNarrative = engine.getNarrative('bob');
    
    expect(aliceNarrative).toBeDefined();
    expect(bobNarrative).toBeDefined();
    expect(typeof aliceNarrative).toBe('string');
    expect(typeof bobNarrative).toBe('string');
    expect(aliceNarrative.length).toBeGreaterThan(0);
    expect(bobNarrative.length).toBeGreaterThan(0);
  });
  
  it('should maintain narrative consistency with facts enabled', () => {
    // Create world with facts enabled
    const engine = new AndyEngine({ 
      seed: 'narrative-fact-test',
      enableFacts: true,
    });
    
    // Create Alice
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place Alice in a location
    engine.world.regions.place('alice', '图书馆');
    
    // Run ticks to generate events
    for (let i = 0; i < 15; i++) {
      engine.tick();
    }
    
    // === ASSERTION 1: Fact store should have events ===
    const factStore = engine.world.factStore;
    if (factStore) {
      const allFacts = factStore.getAllFacts();
      expect(allFacts.length).toBeGreaterThan(0);
      
      // Verify event facts have required fields
      const eventFacts = allFacts.filter(f => f.type === 'event');
      for (const event of eventFacts) {
        expect(event.eventId).toBeDefined();
        expect(event.description).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.source).toBeDefined();
      }
    }
    
    // === ASSERTION 2: Narrative should exist ===
    const aliceNarrative = engine.getNarrative('alice');
    expect(aliceNarrative).toBeDefined();
    expect(typeof aliceNarrative).toBe('string');
    expect(aliceNarrative.length).toBeGreaterThan(0);
  });
  
  it('should maintain memory consistency across ticks', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'memory-consistency-test' });
    
    // Create Alice
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place Alice in a location
    engine.world.regions.place('alice', '宿舍');
    
    // Run multiple ticks
    for (let i = 0; i < 25; i++) {
      engine.tick();
    }
    
    // === ASSERTION 1: Memories should accumulate ===
    const aliceMemories = alice.memory.memories;
    expect(aliceMemories).toBeDefined();
    expect(Array.isArray(aliceMemories)).toBe(true);
    expect(aliceMemories.length).toBeGreaterThan(0);
    
    // === ASSERTION 2: Memories should have valid structure ===
    for (const memory of aliceMemories) {
      expect(memory).toBeDefined();
      expect(memory.timestamp).toBeDefined();
      // Memory should have either content or category
      expect(memory.content || memory.category).toBeDefined();
    }
    
    // === ASSERTION 3: Emotion state should be valid ===
    const emotion = alice.emotion;
    expect(emotion).toBeDefined();
    expect(typeof emotion.getValence()).toBe('number');
    expect(typeof emotion.getArousal()).toBe('number');
    expect(emotion.getValence()).toBeGreaterThanOrEqual(-1);
    expect(emotion.getValence()).toBeLessThanOrEqual(1);
    expect(emotion.getArousal()).toBeGreaterThanOrEqual(0);
    expect(emotion.getArousal()).toBeLessThanOrEqual(1);
  });
  
  it('should maintain needs evolution consistency', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'needs-evolution-test' });
    
    // Create Alice
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place Alice in a location
    engine.world.regions.place('alice', '食堂');
    
    // Record initial needs
    const needsBefore = { ...alice.needs.needs };
    
    // Run ticks
    for (let i = 0; i < 15; i++) {
      engine.tick();
    }
    
    // Record final needs
    const needsAfter = { ...alice.needs.needs };
    
    // === ASSERTION 1: Needs should change over time ===
    const needsChanged = Object.keys(needsBefore).some(key => 
      Math.abs(needsBefore[key] - needsAfter[key]) > 0.001
    );
    expect(needsChanged).toBe(true);
    
    // === ASSERTION 2: Needs should stay in valid range [0, 1] ===
    for (const [key, value] of Object.entries(needsAfter)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    
    // === ASSERTION 3: All standard needs should exist ===
    expect(needsAfter.hunger).toBeDefined();
    expect(needsAfter.energy).toBeDefined();
    expect(needsAfter.social).toBeDefined();
  });
});
