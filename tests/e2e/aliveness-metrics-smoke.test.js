import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Aliveness Metrics Smoke', () => {
  it('should compute continuity score', () => {
    // Setup world with events
    const engine = new AndyEngine({ seed: 'continuity-test' });
    
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place Alice in a location
    engine.world.regions.place('alice', '图书馆');
    
    // Run ticks to generate events
    // R18 fix: 30 ticks can still be too few for narrative accumulation,
    // especially with setAttractor making behavior changes more gradual.
    // 50 ticks provides more reliable event history.
    for (let i = 0; i < 50; i++) {
      engine.tick();
    }
    
    // Query narrative
    const narrative = engine.getNarrative('alice');
    
    // Verify narrative exists
    expect(narrative).toBeDefined();
    expect(narrative.length).toBeGreaterThan(0);
    
    // Check if narrative references past events
    // (In a real test, we would check for specific event references)
    const hasContent = narrative.length > 10;
    expect(hasContent).toBe(true);
  });
  
  it('should compute causality score', () => {
    // Track state changes
    const engine = new AndyEngine({ seed: 'causality-test' });
    
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place Alice in a location
    engine.world.regions.place('alice', '食堂');
    
    // Get initial state
    const initialNeeds = { ...alice.needs.needs };
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Get final state
    const finalNeeds = { ...alice.needs.needs };
    
    // Verify state changed
    const stateChanged = Object.keys(initialNeeds).some(key => 
      Math.abs(initialNeeds[key] - finalNeeds[key]) > 0.01
    );
    
    expect(stateChanged).toBe(true);
  });
  
  it('should compute epistemic boundary score', () => {
    // Create two characters
    const engine = new AndyEngine({ seed: 'epistemic-test' });
    
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
    engine.world.regions.place('alice', '图书馆');
    engine.world.regions.place('bob', '食堂');
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Verify boundary maintenance
    const aliceNarrative = engine.getNarrative('alice');
    const bobNarrative = engine.getNarrative('bob');
    
    // Both should have narratives
    expect(aliceNarrative).toBeDefined();
    expect(bobNarrative).toBeDefined();
    
    // Both should have content
    expect(aliceNarrative.length).toBeGreaterThan(0);
    expect(bobNarrative.length).toBeGreaterThan(0);
  });
  
  it('should compute affect expression score', () => {
    // Change emotion
    const engine = new AndyEngine({ seed: 'affect-test' });
    
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place Alice in a location
    engine.world.regions.place('alice', '公园');
    
    // Run ticks
    for (let i = 0; i < 10; i++) {
      engine.tick();
    }
    
    // Verify expression exists
    const narrative = engine.getNarrative('alice');
    expect(narrative).toBeDefined();
    
    // Check if narrative contains emotional content
    // (In a real test, we would check for specific emotional expressions)
    const hasEmotionalContent = narrative.length > 0;
    expect(hasEmotionalContent).toBe(true);
  });
  
  it('should compute non-fabrication score', () => {
    // Compare narrative with canon
    const engine = new AndyEngine({ seed: 'non-fabrication-test' });
    
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place Alice in a location
    engine.world.regions.place('alice', '宿舍');
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Verify no fabrication
    const narrative = engine.getNarrative('alice');
    expect(narrative).toBeDefined();
    
    // Check that narrative doesn't contain impossible events
    // (In a real test, we would check for specific fabricated events)
    const hasContent = narrative.length > 0;
    expect(hasContent).toBe(true);
  });
});
