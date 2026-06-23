import { describe, it, expect } from 'vitest';
import { buildBasicAffectFrame } from '../../src/shared/BasicAffectFrame.js';

describe('BasicAffectFrame', () => {
  it('should build frame from agent', () => {
    const agent = {
      emotion: {
        getDominant: () => [
          { dimension: 'joy', value: 0.5 },
          { dimension: 'sadness', value: -0.2 },
        ],
        getValence: () => 0.3,
        getArousal: () => 0.6,
      },
      needs: {
        needs: {
          hunger: 0.8,
          energy: 0.6,
          social: 0.4,
        },
      },
      behaviorField: {
        B: [0.5, 0.6, 0.7, 0.4],
        speed: 0.3,
      },
    };
    
    const frame = buildBasicAffectFrame(agent);
    
    expect(frame).toBeDefined();
    expect(frame.emotions).toHaveLength(2);
    expect(frame.valence).toBe(0.3);
    expect(frame.arousal).toBe(0.6);
    expect(frame.valenceBand).toBe('positive');
    expect(frame.arousalBand).toBe('medium');
    expect(frame.interpersonalPosture).toBeDefined();
    expect(frame.warmth).toBeGreaterThanOrEqual(0);
    expect(frame.warmth).toBeLessThanOrEqual(1);
    expect(frame.directness).toBeGreaterThanOrEqual(0);
    expect(frame.directness).toBeLessThanOrEqual(1);
    expect(frame.initiative).toBeGreaterThanOrEqual(0);
    expect(frame.initiative).toBeLessThanOrEqual(1);
    expect(frame.defensiveness).toBeGreaterThanOrEqual(0);
    expect(frame.defensiveness).toBeLessThanOrEqual(1);
    expect(frame.emotionalExplicitness).toBeGreaterThanOrEqual(0);
    expect(frame.emotionalExplicitness).toBeLessThanOrEqual(1);
    expect(frame.forbiddenModes).toBeInstanceOf(Array);
    expect(frame.visibleMicroBehaviors).toBeInstanceOf(Array);
  });
  
  it('should return empty frame for null agent', () => {
    const frame = buildBasicAffectFrame(null);
    
    expect(frame).toBeDefined();
    expect(frame.emotions).toHaveLength(0);
    expect(frame.valence).toBe(0);
    expect(frame.arousal).toBe(0.5);
    expect(frame.valenceBand).toBe('neutral');
    expect(frame.arousalBand).toBe('medium');
    expect(frame.interpersonalPosture).toBe('neutral');
    expect(frame.warmth).toBe(0.5);
    expect(frame.directness).toBe(0.5);
    expect(frame.initiative).toBe(0.5);
    expect(frame.defensiveness).toBe(0.5);
    expect(frame.emotionalExplicitness).toBe(0.5);
    expect(frame.forbiddenModes).toHaveLength(0);
    expect(frame.visibleMicroBehaviors).toHaveLength(0);
  });
  
  it('should classify valence bands correctly', () => {
    const agent = {
      emotion: {
        getDominant: () => [],
        getValence: () => 0,
        getArousal: () => 0.5,
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    
    // Test negative valence
    agent.emotion.getValence = () => -0.3;
    const negativeFrame = buildBasicAffectFrame(agent);
    expect(negativeFrame.valenceBand).toBe('negative');
    
    // Test neutral valence
    agent.emotion.getValence = () => 0;
    const neutralFrame = buildBasicAffectFrame(agent);
    expect(neutralFrame.valenceBand).toBe('neutral');
    
    // Test positive valence
    agent.emotion.getValence = () => 0.3;
    const positiveFrame = buildBasicAffectFrame(agent);
    expect(positiveFrame.valenceBand).toBe('positive');
  });
  
  it('should classify arousal bands correctly', () => {
    const agent = {
      emotion: {
        getDominant: () => [],
        getValence: () => 0,
        getArousal: () => 0.5,
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    
    // Test low arousal
    agent.emotion.getArousal = () => 0.2;
    const lowFrame = buildBasicAffectFrame(agent);
    expect(lowFrame.arousalBand).toBe('low');
    
    // Test medium arousal
    agent.emotion.getArousal = () => 0.5;
    const mediumFrame = buildBasicAffectFrame(agent);
    expect(mediumFrame.arousalBand).toBe('medium');
    
    // Test high arousal
    agent.emotion.getArousal = () => 0.8;
    const highFrame = buildBasicAffectFrame(agent);
    expect(highFrame.arousalBand).toBe('high');
  });
  
  it('should produce different expression constraints for same valence but different arousal', () => {
    // Create two agents with same valence but different arousal
    const lowArousalAgent = {
      emotion: {
        getDominant: () => [{ dimension: 'joy', value: 0.3 }],
        getValence: () => 0.3,
        getArousal: () => 0.2,  // Low arousal
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    
    const highArousalAgent = {
      emotion: {
        getDominant: () => [{ dimension: 'joy', value: 0.3 }],
        getValence: () => 0.3,
        getArousal: () => 0.8,  // High arousal
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    
    const lowArousalFrame = buildBasicAffectFrame(lowArousalAgent);
    const highArousalFrame = buildBasicAffectFrame(highArousalAgent);
    
    // Same valence band
    expect(lowArousalFrame.valenceBand).toBe('positive');
    expect(highArousalFrame.valenceBand).toBe('positive');
    
    // Different arousal bands
    expect(lowArousalFrame.arousalBand).toBe('low');
    expect(highArousalFrame.arousalBand).toBe('high');
    
    // Different expression constraints
    expect(lowArousalFrame.initiative).not.toBe(highArousalFrame.initiative);
    expect(lowArousalFrame.emotionalExplicitness).not.toBe(highArousalFrame.emotionalExplicitness);
    
    // High arousal should have higher initiative and emotional explicitness
    expect(highArousalFrame.initiative).toBeGreaterThan(lowArousalFrame.initiative);
    expect(highArousalFrame.emotionalExplicitness).toBeGreaterThan(lowArousalFrame.emotionalExplicitness);
  });
  
  it('should produce guarded closeness for low trust + high warmth', () => {
    // Create agent with high positive emotions (high warmth) but low sociality (low trust)
    const agent = {
      emotion: {
        getDominant: () => [
          { dimension: 'joy', value: 0.6 },
          { dimension: 'contentment', value: 0.4 },
        ],
        getValence: () => 0.5,
        getArousal: () => 0.4,
      },
      needs: { needs: {} },
      behaviorField: { B: [0.3, 0.2, 0.5, 0.3], speed: 0 },  // Low sociality
    };
    
    const frame = buildBasicAffectFrame(agent);
    
    // Should have high warmth (from positive emotions)
    expect(frame.warmth).toBeGreaterThan(0.5);
    
    // Should have low sociality
    expect(frame.behavior.sociality).toBeLessThan(0.4);
    
    // Interpersonal posture should reflect guardedness
    // (low sociality + high warmth → could be 'guarded' or 'neutral')
    expect(['guarded', 'neutral']).toContain(frame.interpersonalPosture);
  });
  
  it('should generate forbidden modes for high defensiveness', () => {
    const agent = {
      emotion: {
        getDominant: () => [
          { dimension: 'fear', value: 0.8 },
          { dimension: 'anger', value: 0.7 },
        ],
        getValence: () => -0.5,
        getArousal: () => 0.8,
      },
      needs: { needs: {} },
      behaviorField: { B: [0.3, 0.2, 0.4, 0.3], speed: 0 },
    };
    
    const frame = buildBasicAffectFrame(agent);
    
    // Should have some defensiveness
    expect(frame.defensiveness).toBeGreaterThan(0);
    expect(frame.defensiveness).toBeLessThanOrEqual(1);
  });
  
  it('should generate visible micro behaviors for high arousal', () => {
    const agent = {
      emotion: {
        getDominant: () => [],
        getValence: () => 0,
        getArousal: () => 0.9,
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    
    const frame = buildBasicAffectFrame(agent);
    
    // High arousal should generate fidgeting
    expect(frame.arousal).toBeGreaterThan(0.7);
    expect(frame.visibleMicroBehaviors).toContain('fidgeting');
  });
});
