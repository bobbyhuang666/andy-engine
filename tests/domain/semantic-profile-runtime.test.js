import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import campusDomain from '../../presets/campus/index.js';
import tavernDomain from '../../presets/tavern/index.js';

describe('Semantic Profile Runtime Behavior', () => {
  it('should use campus Chinese semantic profile', () => {
    const engine = new AndyEngine({ domain: campusDomain });
    
    // Create character
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    
    // Place in campus location
    engine.world.regions.place('alice', '图书馆');
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Verify narrative contains Chinese
    const narrative = engine.getNarrative('alice');
    expect(narrative).toBeDefined();
    
    // Verify domain is campus
    expect(engine.domain.id).toBe('campus');
  });
  
  it('should use tavern Chinese semantic profile', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    
    // Create character
    const bob = engine.createCharacter({
      id: 'bob',
      name: 'Bob',
      mbti: 'ESTJ',
      schedule: 'blacksmith',
    });
    
    // Place in tavern location
    engine.world.regions.place('bob', '铁匠铺');
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Verify narrative exists
    const narrative = engine.getNarrative('bob');
    expect(narrative).toBeDefined();
    
    // Verify domain is tavern
    expect(engine.domain.id).toBe('tavern');
  });
  
  it('should use custom domain without Chinese fallback', () => {
    // Create custom domain with English semantic profile
    const customDomain = {
      id: 'custom-en',
      name: 'Custom English Domain',
      version: '1.0.0',
      regions: ['home', 'office'],
      adjacency: [['home', 'office', 1]],
      regionCoords: {
        home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 },
        office: { shape: 'rect', x: 200, y: 0, w: 100, h: 100 },
      },
      placeTypes: {
        rest: ['home'],
        work: ['office'],
      },
      states: {
        'at_home': { activity: 0.3, sociality: 0.2, focus: 0.4, expressiveness: 0.3, next: ['at_office'] },
        'at_office': { activity: 0.7, sociality: 0.4, focus: 0.8, expressiveness: 0.5, next: ['at_home'] },
      },
      stateCenters: {
        'at_home': [0.3, 0.2, 0.4, 0.3],
        'at_office': [0.7, 0.4, 0.8, 0.5],
      },
      roleArchetypes: {
        worker: {
          schedule: [
            { hour: 9, state: 'at_office', region: 'office' },
            { hour: 18, state: 'at_home', region: 'home' },
          ],
        },
      },
      semanticProfile: {
        language: 'en',
        eventMeaningRules: [
          { keywords: ['rest', 'sleep'], meaningType: 'rest', weight: 0.3 },
          { keywords: ['work', 'study'], meaningType: 'work', weight: 0.3 },
        ],
        emotionKeywords: {
          happy: ['happy', 'glad'],
          sad: ['sad', 'sorrowful'],
        },
      },
    };
    
    const engine = new AndyEngine({ domain: customDomain });
    
    // Create character
    const charlie = engine.createCharacter({
      id: 'charlie',
      name: 'Charlie',
      mbti: 'INFP',
      schedule: 'worker',
    });
    
    // Place in custom location
    engine.world.regions.place('charlie', 'office');
    
    // Run ticks
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    // Verify narrative exists
    const narrative = engine.getNarrative('charlie');
    expect(narrative).toBeDefined();
    
    // Verify domain is custom
    expect(engine.domain.id).toBe('custom-en');
    
    // Verify semantic profile is used
    const profile = engine.domain.semanticProfile;
    expect(profile).toBeDefined();
    expect(profile.language).toBe('en');
  });
  
  it('should maintain runtime behavior across domains', () => {
    // Test campus domain
    const campusEngine = new AndyEngine({ domain: campusDomain });
    const campusAlice = campusEngine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    campusEngine.world.regions.place('alice', '图书馆');
    
    // Test tavern domain
    const tavernEngine = new AndyEngine({ domain: tavernDomain });
    const tavernBob = tavernEngine.createCharacter({
      id: 'bob',
      name: 'Bob',
      mbti: 'ESTJ',
      schedule: 'blacksmith',
    });
    tavernEngine.world.regions.place('bob', '铁匠铺');
    
    // Run ticks on both
    for (let i = 0; i < 5; i++) {
      campusEngine.tick();
      tavernEngine.tick();
    }
    
    // Verify both work
    const campusNarrative = campusEngine.getNarrative('alice');
    const tavernNarrative = tavernEngine.getNarrative('bob');
    
    expect(campusNarrative).toBeDefined();
    expect(tavernNarrative).toBeDefined();
    
    // Verify domains are different
    expect(campusEngine.domain.id).toBe('campus');
    expect(tavernEngine.domain.id).toBe('tavern');
  });
});
