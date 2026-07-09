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

  // ── Valence band branches ──────────────────────────────────────────

  it('should classify valenceBand as negative when valence < -0.2', () => {
    const agent = {
      emotion: {
        getValence: () => -0.5,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'sadness', value: -0.6 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.valenceBand).toBe('negative');
    expect(frame.valence).toBe(-0.5);
  });

  it('should classify valenceBand as neutral when -0.2 <= valence <= 0.2', () => {
    const agent = {
      emotion: {
        getValence: () => 0,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.1 }, { dimension: 'sadness', value: -0.1 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.valenceBand).toBe('neutral');
  });

  it('should classify valenceBand as positive when valence > 0.2', () => {
    const agent = {
      emotion: {
        getValence: () => 0.5,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.6 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.valenceBand).toBe('positive');
  });

  // ── Arousal band boundaries ────────────────────────────────────────

  it('should classify arousalBand as low when arousal < 0.3', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.2,
        getDominant: () => [{ dimension: 'calm', value: 0.4 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.arousalBand).toBe('low');
  });

  it('should classify arousalBand as medium when 0.3 <= arousal <= 0.7', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.4 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.arousalBand).toBe('medium');
  });

  it('should classify arousalBand as high when arousal > 0.7', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.85,
        getDominant: () => [{ dimension: 'excitement', value: 0.7 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.arousalBand).toBe('high');
  });

  // ── Interpersonal posture branches ─────────────────────────────────

  it('should classify interpersonalPosture as open when sociality > 0.6 and warmth > 0.5', () => {
    const agent = {
      emotion: {
        getValence: () => 0.5,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.8 }, { dimension: 'love', value: 0.7 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.7, 0.5, 0.5], speed: 0 }, // sociality=0.7
    };
    const frame = compile(agent);
    expect(frame.interpersonalPosture).toBe('open');
  });

  it('should classify interpersonalPosture as guarded when sociality < 0.4 and warmth < 0.4', () => {
    const agent = {
      emotion: {
        getValence: () => -0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'fear', value: -0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.3, 0.5, 0.3], speed: 0 }, // sociality=0.3
    };
    const frame = compile(agent);
    expect(frame.interpersonalPosture).toBe('guarded');
  });

  it('should classify interpersonalPosture as attached when sociality > 0.5 and warmth > 0.6 (but sociality <= 0.6 so open does not match first)', () => {
    // Branch ordering: open (sociality>0.6 && warmth>0.5) is checked BEFORE attached.
    // To reach attached we need sociality <= 0.6 but > 0.5, and warmth > 0.6.
    // warmth = clamp(positiveSum*0.5 + sociality*0.5). With sociality=0.55,
    // we need positiveSum*0.5 + 0.55*0.5 > 0.6 → positiveSum > 0.65.
    const agent = {
      emotion: {
        getValence: () => 0.6,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'love', value: 0.8 }, { dimension: 'joy', value: 0.7 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.55, 0.5, 0.5], speed: 0 }, // sociality=0.55
    };
    const frame = compile(agent);
    expect(frame.interpersonalPosture).toBe('attached');
  });

  it('should classify interpersonalPosture as guarded (not avoidant) when sociality < 0.3 and warmth < 0.3 due to branch ordering', () => {
    // Branch ordering in AffectCompiler:
    //   guarded  (sociality<0.4 && warmth<0.4) is checked BEFORE avoidant (sociality<0.3 && warmth<0.3).
    // Since avoidant's condition is a strict subset of guarded's, guarded always fires first.
    // This test documents the actual reachable behavior.
    const agent = {
      emotion: {
        getValence: () => -0.5,
        getArousal: () => 0.2,
        getDominant: () => [{ dimension: 'loneliness', value: -0.6 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.2, 0.2, 0.3, 0.2], speed: 0 }, // sociality=0.2
    };
    const frame = compile(agent);
    expect(frame.interpersonalPosture).toBe('guarded');
  });

  it('should classify interpersonalPosture as guarded_closeness when sociality < 0.4 and warmth > 0.5', () => {
    // This branch: low sociality but high warmth — e.g., shy attachment
    const agent = {
      emotion: {
        getValence: () => 0.4,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'love', value: 0.7 }, { dimension: 'nervousness', value: -0.3 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.3, 0.35, 0.5, 0.6], speed: 0 }, // sociality=0.35 (< 0.4), warmth will be high from positive emotions
    };
    const frame = compile(agent);
    expect(frame.interpersonalPosture).toBe('guarded_closeness');
  });

  it('should classify interpersonalPosture as neutral when no other branch matches', () => {
    // sociality=0.5, warmth=0.45: doesn't hit open (>0.6 & >0.5), guarded (<0.4 & <0.4),
    // attached (>0.5 & >0.6), avoidant (<0.3 & <0.3), guarded_closeness (<0.4 & >0.5)
    const agent = {
      emotion: {
        getValence: () => 0.1,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'contentment', value: 0.4 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.4], speed: 0 }, // sociality=0.5
    };
    const frame = compile(agent);
    expect(frame.interpersonalPosture).toBe('neutral');
  });

  // ── visibleMicroBehaviors content ──────────────────────────────────

  it('should include fidgeting when arousal > 0.7', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.8,
        getDominant: () => [{ dimension: 'excitement', value: 0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.visibleMicroBehaviors).toContain('fidgeting');
  });

  it('should include looking_around when focus < 0.3', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'curiosity', value: 0.3 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.2, 0.5], speed: 0 }, // focus=0.2
    };
    const frame = compile(agent);
    expect(frame.visibleMicroBehaviors).toContain('looking_around');
  });

  it('should include gesturing when expressiveness > 0.6', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'excitement', value: 0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.7], speed: 0 }, // expressiveness=0.7
    };
    const frame = compile(agent);
    expect(frame.visibleMicroBehaviors).toContain('gesturing');
  });

  it('should include avoiding_eye_contact when sociality < 0.3', () => {
    const agent = {
      emotion: {
        getValence: () => -0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'fear', value: -0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.2, 0.5, 0.5], speed: 0 }, // sociality=0.2
    };
    const frame = compile(agent);
    expect(frame.visibleMicroBehaviors).toContain('avoiding_eye_contact');
  });

  it('should include multiple microBehaviors when multiple conditions met', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.85,
        getDominant: () => [{ dimension: 'excitement', value: 0.6 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.2, 0.2, 0.7], speed: 0 }, // arousal>0.7, sociality<0.3, focus<0.3, expressiveness>0.6
    };
    const frame = compile(agent);
    expect(frame.visibleMicroBehaviors).toContain('fidgeting');
    expect(frame.visibleMicroBehaviors).toContain('looking_around');
    expect(frame.visibleMicroBehaviors).toContain('gesturing');
    expect(frame.visibleMicroBehaviors).toContain('avoiding_eye_contact');
  });

  // ── forbiddenExpressionModes content ───────────────────────────────

  it('should include direct_emotional_expression when defensiveness > 0.7', () => {
    const agent = {
      emotion: {
        getValence: () => -0.5,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'anger', value: -0.8 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.3, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.forbiddenExpressionModes).toContain('direct_emotional_expression');
  });

  it('should include intimate_expression when warmth < 0.3', () => {
    const agent = {
      emotion: {
        getValence: () => -0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'disgust', value: -0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.2, 0.5, 0.3], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.forbiddenExpressionModes).toContain('intimate_expression');
  });

  it('should include calm_expression when arousal > 0.8', () => {
    const agent = {
      emotion: {
        getValence: () => 0.5,
        getArousal: () => 0.9,
        getDominant: () => [{ dimension: 'excitement', value: 0.7 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.forbiddenExpressionModes).toContain('calm_expression');
  });

  // ── Stability formula ──────────────────────────────────────────────

  it('should compute stability from valence and defensiveness', () => {
    // stability = clamp(1 - (|valence| * 0.4 + defensiveness * 0.6))
    // With valence=0.3, defensiveness will be moderate from negative emotions
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.5 }, { dimension: 'sadness', value: -0.1 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.stability).toBeGreaterThanOrEqual(0);
    expect(frame.stability).toBeLessThanOrEqual(1);
    // High valence magnitude + high defensiveness -> lower stability
    const highTensionAgent = {
      emotion: {
        getValence: () => -0.8,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'anger', value: -0.7 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.3, 0.5, 0.5], speed: 0 },
    };
    const tenseFrame = compile(highTensionAgent);
    expect(tenseFrame.stability).toBeLessThan(frame.stability);
  });

  // ── Source signals population ──────────────────────────────────────

  it('should populate sourceSignals.emotion with dominant emotions', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [
          { dimension: 'joy', value: 0.5 },
          { dimension: 'sadness', value: -0.2 },
        ],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.sourceSignals.emotion).toHaveLength(2);
    expect(frame.sourceSignals.emotion[0]).toMatch(/joy:-?\d+\.\d{2}/);
    expect(frame.sourceSignals.emotion[1]).toMatch(/sadness:-?\d+\.\d{2}/);
  });

  it('should populate sourceSignals.needs with need urgencies', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.5 }],
      },
      needs: { needs: { hunger: 0.8, social: 0.3 } },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame.sourceSignals.needs).toHaveLength(2);
    expect(frame.sourceSignals.needs[0]).toMatch(/hunger:\d+\.\d{2}/);
    expect(frame.sourceSignals.needs[1]).toMatch(/social:\d+\.\d{2}/);
  });

  it('should include relationship info when socialGraph is provided', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
      socialGraph: {},
    };
    const frame = compile(agent);
    expect(frame.sourceSignals.relationship).toContain('graph:available');
  });

  it('should include memoryPressure info when recentEvents is non-empty', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
      recentEvents: [{ type: 'conversation' }, { type: 'conflict' }],
    };
    const frame = compile(agent);
    expect(frame.sourceSignals.memoryPressure).toContain('activated:2');
  });

  // ── Edge cases: empty / missing inputs ─────────────────────────────

  it('should handle completely empty emotion vector', () => {
    const agent = {
      emotion: {
        getValence: () => 0,
        getArousal: () => 0,
        getDominant: () => [],
      },
      needs: { needs: {} },
      behaviorField: { B: [0, 0, 0, 0], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame).toBeDefined();
    expect(frame.valenceBand).toBe('neutral');
    expect(frame.arousalBand).toBe('low');
    expect(frame.warmth).toBe(0);
    expect(frame.directness).toBe(0);
    expect(frame.initiative).toBe(0);
    // defensiveness = clamp(0*0.6 + (1-0)*0.4) = 0.4 (from low sociality alone)
    expect(frame.defensiveness).toBe(0.4);
    expect(frame.emotionalExplicitness).toBe(0);
    expect(frame.stability).toBe(0.76);
    expect(frame.visibleMicroBehaviors).toContain('looking_around');
    expect(frame.visibleMicroBehaviors).toContain('avoiding_eye_contact');
    expect(frame.forbiddenExpressionModes).toEqual(['intimate_expression']);
    expect(frame.sourceSignals.emotion).toEqual([]);
  });

  it('should clamp NaN/Infinity inputs to 0 via clamp()', () => {
    const agent = {
      emotion: {
        getValence: () => NaN,
        getArousal: () => Infinity,
        getDominant: () => [],
      },
      needs: { needs: {} },
      behaviorField: { B: [NaN, Infinity, -1, 2], speed: 0 },
    };
    const frame = compile(agent);
    // NaN valence -> clamp to 0 -> neutral band
    expect(frame.valenceBand).toBe('neutral');
    // Infinity arousal -> clamp to 1 -> high band
    expect(frame.arousalBand).toBe('high');
    // All clamped values should be in [0,1]
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
  });

  it('should handle missing needs object', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.5 }],
      },
      needs: null,
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
    };
    const frame = compile(agent);
    expect(frame).toBeDefined();
    expect(frame.needs).toEqual([]);
    expect(frame.sourceSignals.needs).toEqual([]);
  });

  it('should handle missing socialGraph and recentEvents gracefully', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
      // no socialGraph, no recentEvents
    };
    const frame = compile(agent);
    expect(frame.sourceSignals.relationship).toEqual([]);
    expect(frame.sourceSignals.memoryPressure).toEqual([]);
  });

  it('should handle empty recentEvents array', () => {
    const agent = {
      emotion: {
        getValence: () => 0.3,
        getArousal: () => 0.5,
        getDominant: () => [{ dimension: 'joy', value: 0.5 }],
      },
      needs: { needs: {} },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5], speed: 0 },
      recentEvents: [],
    };
    const frame = compile(agent);
    expect(frame.sourceSignals.memoryPressure).toEqual([]);
  });
});
