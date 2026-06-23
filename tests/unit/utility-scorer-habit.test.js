import { describe, it, expect } from 'vitest';
import { scoreCandidates } from '../../src/action/UtilityScorer.js';

describe('scoreHabit', () => {
  it('should return 0 for non-habit candidates', () => {
    const candidates = [{
      type: 'work',
      source: 'need',
      target: 'office',
      label: 'work',
      priority: 0.5,
      metadata: {},
    }];
    
    const context = {
      currentHour: 10,
      dayOfWeek: 1,
      currentPosition: 'office',
      currentValence: 0,
    };
    
    const result = scoreCandidates(candidates, context);
    expect(result[0].score.habit).toBe(0);
  });
  
  it('should return positive score for habit candidates', () => {
    const candidates = [{
      type: 'work',
      source: 'habit',
      target: 'office',
      label: 'habit:work',
      priority: 0.8,
      metadata: {
        confidence: 0.8,
        patternKey: 'test',
        habitState: 'work',
        habitRegion: 'office',
      },
    }];
    
    const context = {
      currentHour: 10,
      dayOfWeek: 1,
      currentPosition: 'office',
      currentValence: 0,
    };
    
    const result = scoreCandidates(candidates, context);
    expect(result[0].score.habit).toBeGreaterThan(0);
  });
  
  it('should scale with confidence', () => {
    const candidates = [
      {
        type: 'work',
        source: 'habit',
        target: 'office',
        label: 'habit:work',
        priority: 0.8,
        metadata: { confidence: 0.6 },
      },
      {
        type: 'rest',
        source: 'habit',
        target: 'home',
        label: 'habit:rest',
        priority: 0.9,
        metadata: { confidence: 0.9 },
      },
    ];
    
    const context = {
      currentHour: 10,
      dayOfWeek: 1,
      currentPosition: 'office',
      currentValence: 0,
    };
    
    const result = scoreCandidates(candidates, context);
    expect(result[1].score.habit).toBeGreaterThan(result[0].score.habit);
  });
  
  it('should clamp to maximum 0.4', () => {
    const candidates = [{
      type: 'work',
      source: 'habit',
      target: 'office',
      label: 'habit:work',
      priority: 1.0,
      metadata: { confidence: 1.0 },
    }];
    
    const context = {
      currentHour: 10,
      dayOfWeek: 1,
      currentPosition: 'office',
      currentValence: 0,
    };
    
    const result = scoreCandidates(candidates, context);
    expect(result[0].score.habit).toBeLessThanOrEqual(0.4);
  });
  
  it('should use default confidence if not provided', () => {
    const candidates = [{
      type: 'work',
      source: 'habit',
      target: 'office',
      label: 'habit:work',
      priority: 0.5,
      metadata: {},
    }];
    
    const context = {
      currentHour: 10,
      dayOfWeek: 1,
      currentPosition: 'office',
      currentValence: 0,
    };
    
    const result = scoreCandidates(candidates, context);
    expect(result[0].score.habit).toBeGreaterThan(0);
  });
});
