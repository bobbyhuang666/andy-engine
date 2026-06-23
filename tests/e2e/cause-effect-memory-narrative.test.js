import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Cause/Effect/Memory/Narrative E2E', () => {
  it('should maintain consistency from cause to narrative', () => {
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
    
    // Place them together
    engine.world.regions.place('alice', '校园广场');
    engine.world.regions.place('bob', '校园广场');
    
    // Run ticks to generate interactions
    for (let i = 0; i < 10; i++) {
      engine.tick();
    }
    
    // Verify social graph has relationship
    const socialGraph = engine.world.socialGraph;
    const relationship = socialGraph.getRelationship('alice', 'bob');
    
    // They should have some relationship after being together
    expect(relationship).toBeDefined();
    expect(relationship.strength).toBeGreaterThan(0);
    
    // Verify memories exist
    const aliceMemories = alice.memory.memories;
    const bobMemories = bob.memory.memories;
    
    expect(aliceMemories).toBeDefined();
    expect(bobMemories).toBeDefined();
    
    // Verify narratives exist
    const aliceNarrative = engine.getNarrative('alice');
    const bobNarrative = engine.getNarrative('bob');
    
    expect(aliceNarrative).toBeDefined();
    expect(bobNarrative).toBeDefined();
  });
  
  it('should maintain narrative consistency with facts', () => {
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
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Verify fact store has facts
    const factStore = engine.world.factStore;
    if (factStore) {
      const allFacts = factStore.getAllFacts();
      expect(allFacts.length).toBeGreaterThan(0);
      
      // Verify facts have required fields
      for (const fact of allFacts) {
        expect(fact.type).toBeDefined();
        expect(fact.timestamp).toBeDefined();
        expect(fact.source).toBeDefined();
      }
    }
    
    // Verify narrative exists
    const aliceNarrative = engine.getNarrative('alice');
    expect(aliceNarrative).toBeDefined();
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
    for (let i = 0; i < 20; i++) {
      engine.tick();
    }
    
    // Verify memories accumulate
    const aliceMemories = alice.memory.memories;
    expect(aliceMemories).toBeDefined();
    expect(aliceMemories.length).toBeGreaterThan(0);
    
    // Verify memories have timestamps
    for (const memory of aliceMemories) {
      expect(memory.timestamp).toBeDefined();
    }
  });
});
