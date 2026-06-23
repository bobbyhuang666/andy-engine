import { describe, it, expect } from 'vitest';
import { StoryGenerator } from '../../src/narrative/StoryGenerator.js';

describe('StoryGenerator Tick Contract', () => {
  it('should generate stories from world tick result', () => {
    const generator = new StoryGenerator();
    
    // Mock world tick result
    const worldTickResult = {
      tickNumber: 1,
      phase: {
        agentThink: {
          results: {
            'test-agent': {
              stateChanged: true,
              oldState: 'resting',
              newState: 'working',
              interaction: null,
              mindWander: null,
            },
          },
        },
      },
    };
    
    const stories = generator.generateFromWorldTick(worldTickResult, 'test-agent');
    
    // Should generate at least one story
    expect(stories).toBeDefined();
    if (stories && stories.length > 0) {
      expect(stories[0].tick).toBe(1);
      expect(stories[0].agentId).toBe('test-agent');
      expect(stories[0].source).toBe('simulation');
    }
  });
  
  it('should generate stories from tick result', () => {
    const generator = new StoryGenerator();
    
    // Mock tick result
    const tickResult = {
      tickNumber: 2,
      phase: {
        agentThink: {
          results: {
            'test-agent': {
              stateChanged: true,
              oldState: 'working',
              newState: 'resting',
              interaction: null,
              mindWander: null,
            },
          },
        },
      },
    };
    
    const stories = generator.generateFromTick(tickResult, 'test-agent');
    
    // Should generate at least one story
    expect(stories).toBeDefined();
    if (stories && stories.length > 0) {
      expect(stories[0].tick).toBe(2);
      expect(stories[0].agentId).toBe('test-agent');
      expect(stories[0].source).toBe('simulation');
    }
  });
  
  it('should return null for invalid tick result', () => {
    const generator = new StoryGenerator();
    
    // Invalid tick result
    const invalidTickResult = null;
    
    const stories = generator.generateFromTick(invalidTickResult, 'test-agent');
    expect(stories).toBeNull();
  });
  
  it('should return null for missing agent result', () => {
    const generator = new StoryGenerator();
    
    // Tick result without agent
    const tickResult = {
      tickNumber: 3,
      phase: {
        agentThink: {
          results: {},
        },
      },
    };
    
    const stories = generator.generateFromTick(tickResult, 'test-agent');
    expect(stories).toBeNull();
  });
  
  it('should generate stories with simTime', () => {
    const generator = new StoryGenerator();
    
    // Mock tick result
    const tickResult = {
      tickNumber: 4,
      phase: {
        agentThink: {
          results: {
            'test-agent': {
              stateChanged: true,
              oldState: 'resting',
              newState: 'working',
              interaction: null,
              mindWander: null,
            },
          },
        },
      },
    };
    
    const simTime = new Date('2026-06-22T12:00:00Z');
    const stories = generator.generateFromTick(tickResult, 'test-agent', { simTime });
    
    // Should generate at least one story
    expect(stories).toBeDefined();
    if (stories && stories.length > 0) {
      expect(stories[0].timestamp).toBe(simTime.getTime());
    }
  });
});
