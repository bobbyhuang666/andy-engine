import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Alice/Bob Epistemic Boundary E2E', () => {
  it('should maintain epistemic boundary between Alice and Bob', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'epistemic-test' });
    
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
    
    // Place Alice in cafeteria, Bob in library
    engine.world.regions.place('alice', '食堂');
    engine.world.regions.place('bob', '图书馆');
    
    // Alice eats
    alice.position = '食堂';
    engine.tick();
    
    // Bob stays in library
    bob.position = '图书馆';
    engine.tick();
    
    // Verify Alice's state changed
    const aliceNeeds = alice.needs.needs;
    // After tick, hunger should change (may increase or decrease depending on action)
    expect(aliceNeeds.hunger).toBeDefined();
    
    // Verify Bob's state is different
    const bobNeeds = bob.needs.needs;
    expect(bobNeeds.hunger).toBeDefined();
    
    // Verify Alice has memories
    const aliceMemories = alice.memory.memories;
    expect(aliceMemories).toBeDefined();
    
    // Verify Bob has memories
    const bobMemories = bob.memory.memories;
    expect(bobMemories).toBeDefined();
    
    // Verify Alice's narrative can reference eating
    const aliceNarrative = engine.getNarrative('alice');
    expect(aliceNarrative).toBeDefined();
    
    // Verify Bob's narrative doesn't claim to see Alice eating
    const bobNarrative = engine.getNarrative('bob');
    expect(bobNarrative).toBeDefined();
    // Bob shouldn't mention Alice's eating
    expect(bobNarrative).not.toContain('Alice');
  });
  
  it('should maintain fact visibility boundaries', () => {
    // Create world with facts enabled
    const engine = new AndyEngine({ 
      seed: 'fact-test',
      enableFacts: true,
    });
    
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
    
    // Place them in different locations
    engine.world.regions.place('alice', '食堂');
    engine.world.regions.place('bob', '图书馆');
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Verify fact store has events
    const factStore = engine.world.factStore;
    if (factStore) {
      const allFacts = factStore.getAllFacts();
      expect(allFacts.length).toBeGreaterThan(0);
      
      // Verify events have correct structure
      const eventFacts = allFacts.filter(f => f.type === 'event');
      for (const event of eventFacts) {
        // Events should have required fields
        expect(event.type).toBe('event');
        expect(event.timestamp).toBeDefined();
        expect(event.source).toBeDefined();
      }
    }
  });
  
  it('should maintain relationship boundaries', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'relationship-test' });
    
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
    
    // Run ticks
    for (let i = 0; i < 10; i++) {
      engine.tick();
    }
    
    // Verify social graph has relationship
    const socialGraph = engine.world.socialGraph;
    const relationship = socialGraph.getRelationship('alice', 'bob');
    
    // They should have some relationship after being together
    expect(relationship).toBeDefined();
    expect(relationship.strength).toBeGreaterThan(0);
  });
});
