import { describe, it, expect } from 'vitest';
import { compile } from '../../src/agent/psychology/AffectCompiler.js';

describe('AffectFrame Integration', () => {
  it('should compile affect frame from agent', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.6,
        getDominant: () => [
          { dimension: 'joy', value: 0.5 },
          { dimension: 'sadness', value: -0.2 },
        ],
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

    const frame = compile(agent);

    expect(frame).toBeDefined();
    expect(frame.version).toBe('0.2-basic');
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
    expect(frame.visibleMicroBehaviors).toBeInstanceOf(Array);
    expect(frame.forbiddenExpressionModes).toBeInstanceOf(Array);
    expect(frame.sourceSignals).toBeDefined();
    expect(frame.sourceSignals.emotion).toBeInstanceOf(Array);
    expect(frame.sourceSignals.needs).toBeInstanceOf(Array);
  });

  it('should produce different results for different arousal', () => {
    const lowArousalAgent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.2,
        getDominant: () => [{ dimension: 'joy', value: 0.3 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };

    const highArousalAgent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.8,
        getDominant: () => [{ dimension: 'joy', value: 0.3 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };

    const lowFrame = compile(lowArousalAgent);
    const highFrame = compile(highArousalAgent);

    expect(lowFrame.valenceBand).toBe('positive');
    expect(highFrame.valenceBand).toBe('positive');
    expect(lowFrame.arousalBand).toBe('low');
    expect(highFrame.arousalBand).toBe('high');
    expect(highFrame.initiative).toBeGreaterThan(lowFrame.initiative);
    expect(highFrame.emotionalExplicitness).toBeGreaterThan(lowFrame.emotionalExplicitness);
  });
});
