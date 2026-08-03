/**
 * config/validate.js coverage — Wave 5 batch 4
 *
 * 此前 0 测试直接调用 validateConfig/validateAgentConfig(仅模块加载覆盖)。
 * 本文件覆盖所有 checkRange 分支 + 各参数块 + 一致性检查 + Agent 配置验证。
 *
 * 纯函数:无 DB / 无 LLM / 无 domain fixture。
 */

import { describe, it, expect } from 'vitest';
import { validateConfig, validateAgentConfig } from '../../../src/config/validate.js';
import RuntimeConfig from '../../../src/runtime/RuntimeConfig.js';

// ═══════════════════════════════════════════
// validateConfig — 输入守卫
// ═══════════════════════════════════════════
describe('validateConfig — input guard', () => {
  it('returns silently for null', () => {
    expect(() => validateConfig(null)).not.toThrow();
  });
  it('returns silently for non-object', () => {
    expect(() => validateConfig('string')).not.toThrow();
    expect(() => validateConfig(42)).not.toThrow();
  });
  it('passes for empty object', () => {
    expect(() => validateConfig({})).not.toThrow();
  });
});

describe('validateConfig — encounter cooldown', () => {
  it('accepts zero and finite non-negative cooldowns', () => {
    expect(() => validateConfig({ events: { encounterCooldownMinutes: 0 } })).not.toThrow();
    expect(() => validateConfig({ events: { encounterCooldownMinutes: 120.5 } })).not.toThrow();
    expect(() => new RuntimeConfig({ events: { encounterCooldownMinutes: 0 } })).not.toThrow();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '120'])('rejects invalid cooldown %j', value => {
    expect(() => validateConfig({ events: { encounterCooldownMinutes: value } }))
      .toThrow(/events\.encounterCooldownMinutes/);
    expect(() => new RuntimeConfig({ events: { encounterCooldownMinutes: value } }))
      .toThrow(/events\.encounterCooldownMinutes/);
  });
});

describe('validateConfig — boolean feature switches', () => {
  it('accepts explicit true and false values', () => {
    expect(() => validateConfig({
      enableFacts: false,
      actionSelection: { enabled: true, recordTraces: false },
    })).not.toThrow();
  });

  it.each([
    [{ enableFacts: 'false' }, /enableFacts must be a boolean/],
    [{ enableFacts: null }, /enableFacts must be a boolean/],
    [{ actionSelection: { enabled: 1 } }, /actionSelection\.enabled must be a boolean/],
    [{ actionSelection: { recordTraces: 'yes' } }, /actionSelection\.recordTraces must be a boolean/],
  ])('rejects non-boolean switches', (config, pattern) => {
    expect(() => validateConfig(config)).toThrow(pattern);
  });

  it('applies the same validation to direct RuntimeConfig construction', () => {
    expect(() => new RuntimeConfig({ enableFacts: 'false' })).toThrow(/enableFacts must be a boolean/);
    expect(() => new RuntimeConfig({
      actionSelection: { enabled: 'false' },
    })).toThrow(/actionSelection\.enabled must be a boolean/);
  });
});

// ═══════════════════════════════════════════
// validateConfig — emotion 块
// ═══════════════════════════════════════════
describe('validateConfig — emotion block', () => {
  it('rejects decayLambda out of range', () => {
    expect(() => validateConfig({ emotion: { decayLambda: 20 } })).toThrow(/emotion\.decayLambda.*0.01-10/);
  });
  it('rejects inertia out of range', () => {
    expect(() => validateConfig({ emotion: { inertia: 5 } })).toThrow(/emotion\.inertia/);
  });
  it('rejects maxDeltaPerTick out of range', () => {
    expect(() => validateConfig({ emotion: { maxDeltaPerTick: 1 } })).toThrow(/emotion\.maxDeltaPerTick/);
  });
  it('rejects noiseAmplitude above 0.2', () => {
    expect(() => validateConfig({ emotion: { noiseAmplitude: 0.5 } })).toThrow(/emotion\.noiseAmplitude/);
  });
  it('rejects coActivationWeight out of range', () => {
    expect(() => validateConfig({ emotion: { coActivationWeight: 2 } })).toThrow(/emotion\.coActivationWeight/);
  });
  it('rejects baselineDriftRate above 0.01', () => {
    expect(() => validateConfig({ emotion: { baselineDriftRate: 0.1 } })).toThrow(/emotion\.baselineDriftRate/);
  });
  it('rejects circadian values out of range', () => {
    expect(() => validateConfig({ emotion: { circadian: { positiveAffectPeak: 30 } } })).toThrow(/emotion\.circadian\.positiveAffectPeak/);
    expect(() => validateConfig({ emotion: { circadian: { negativeAffectAmp: 2 } } })).toThrow(/emotion\.circadian\.negativeAffectAmp/);
  });
  it('allows partial circadian overrides', () => {
    expect(() => validateConfig({ emotion: { circadian: { positiveAffectAmp: 0.2 } } })).not.toThrow();
  });
  it('accepts valid emotion config', () => {
    expect(() => validateConfig({
      emotion: { decayLambda: 0.5, inertia: 0.5, maxDeltaPerTick: 0.1, noiseAmplitude: 0.1, coActivationWeight: 0.5, baselineDriftRate: 0.005 },
    })).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// validateConfig — memory 块
// ═══════════════════════════════════════════
describe('validateConfig — memory block', () => {
  it('rejects maxMemories below 10', () => {
    expect(() => validateConfig({ memory: { maxMemories: 5 } })).toThrow(/memory\.maxMemories/);
  });
  it('rejects decayRate above 5', () => {
    expect(() => validateConfig({ memory: { decayRate: 10 } })).toThrow(/memory\.decayRate/);
  });
  it('rejects retrievalThreshold below -5', () => {
    expect(() => validateConfig({ memory: { retrievalThreshold: -10 } })).toThrow(/memory\.retrievalThreshold/);
  });
  it('rejects non-number retrievalThreshold (checkRange non-number branch)', () => {
    expect(() => validateConfig({ memory: { retrievalThreshold: 'x' } })).toThrow(/memory\.retrievalThreshold.*必须是数字/);
  });
  it('rejects retrievalNoise above 2', () => {
    expect(() => validateConfig({ memory: { retrievalNoise: 5 } })).toThrow(/memory\.retrievalNoise/);
  });
  it('rejects nested memory config values out of range', () => {
    expect(() => validateConfig({ memory: { spreadingActivation: { W: 11 } } })).toThrow(/memory\.spreadingActivation\.W/);
    expect(() => validateConfig({ memory: { recallEmotionDelta: { sad: { sadness: 2 } } } })).toThrow(/memory\.recallEmotionDelta\.sad\.sadness/);
  });
  it('allows partial nested memory overrides', () => {
    expect(() => validateConfig({
      memory: {
        spreadingActivation: { W: 2 },
        recallEmotionDelta: { sad: { sadness: 0.02 } },
      },
    })).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// validateConfig — needs 块
// ═══════════════════════════════════════════
describe('validateConfig — needs block', () => {
  it('rejects per-need decayRate out of range', () => {
    expect(() => validateConfig({ needs: { decayRate: { hunger: 2 } } })).toThrow(/needs\.decayRate\.hunger/);
  });
  it('rejects per-need threshold out of range', () => {
    expect(() => validateConfig({ needs: { threshold: { social: -0.1 } } })).toThrow(/needs\.threshold\.social/);
  });
  it('rejects zero need thresholds because gate math divides by threshold', () => {
    expect(() => validateConfig({ needs: { threshold: { hunger: 0 } } })).toThrow(/needs\.threshold\.hunger/);
  });
  it('accepts valid per-need rates', () => {
    expect(() => validateConfig({ needs: { decayRate: { hunger: 0.5 }, threshold: { social: 0.3 } } })).not.toThrow();
  });

  // ── recoveryRate per-field validation ──
  it('accepts valid per-need recoveryRate', () => {
    expect(() => validateConfig({ needs: { recoveryRate: { hunger: 0.5, energy: 0.15, social: 0.3, comfort: 0.2, stimulation: 0.25 } } })).not.toThrow();
  });
  it('rejects per-need recoveryRate above 1', () => {
    expect(() => validateConfig({ needs: { recoveryRate: { hunger: 999 } } })).toThrow(/needs\.recoveryRate\.hunger/);
  });
  it('rejects per-need recoveryRate NaN', () => {
    expect(() => validateConfig({ needs: { recoveryRate: { hunger: NaN } } })).toThrow(/needs\.recoveryRate\.hunger/);
  });
  it('rejects per-need recoveryRate Infinity', () => {
    expect(() => validateConfig({ needs: { recoveryRate: { hunger: Infinity } } })).toThrow(/needs\.recoveryRate\.hunger/);
  });
  it('rejects per-need recoveryRate string', () => {
    expect(() => validateConfig({ needs: { recoveryRate: { hunger: 'fast' } } })).toThrow(/needs\.recoveryRate\.hunger/);
  });
  it('rejects per-need recoveryRate negative', () => {
    expect(() => validateConfig({ needs: { recoveryRate: { hunger: -0.5 } } })).toThrow(/needs\.recoveryRate\.hunger/);
  });
  it('does not affect decayRate / threshold validation', () => {
    // recoveryRate valid but decayRate invalid → still rejects decayRate
    expect(() => validateConfig({ needs: { decayRate: { hunger: 5 }, recoveryRate: { hunger: 0.5 } } })).toThrow(/needs\.decayRate\.hunger/);
    // recoveryRate valid, threshold invalid → still rejects threshold
    expect(() => validateConfig({ needs: { threshold: { hunger: 5 }, recoveryRate: { hunger: 0.5 } } })).toThrow(/needs\.threshold\.hunger/);
    // all valid → no throw
    expect(() => validateConfig({ needs: { decayRate: { hunger: 0.5 }, threshold: { hunger: 0.3 }, recoveryRate: { hunger: 0.5 } } })).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// validateConfig — behavior 块
// ═══════════════════════════════════════════
describe('validateConfig — behavior block', () => {
  it('rejects behavior scalar values out of range', () => {
    expect(() => validateConfig({ behavior: { gamma: -1 } })).toThrow(/behavior\.gamma/);
    expect(() => validateConfig({ behavior: { dt: 2 } })).toThrow(/behavior\.dt/);
  });

  it('rejects behavior weight values out of range', () => {
    expect(() => validateConfig({ behavior: { weights: { needs: NaN } } })).toThrow(/behavior\.weights\.needs/);
    expect(() => validateConfig({ behavior: { weights: { emotion: 30 } } })).toThrow(/behavior\.weights\.emotion/);
  });

  it('allows partial behavior weight overrides', () => {
    expect(() => validateConfig({ behavior: { weights: { needs: 4 } } })).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// validateConfig — relationship 块
// ═══════════════════════════════════════════
describe('validateConfig — relationship block', () => {
  it('rejects initialStrength out of range', () => {
    expect(() => validateConfig({ relationship: { initialStrength: 2 } })).toThrow(/relationship\.initialStrength/);
  });
  it('rejects strengthIncrement above 0.5', () => {
    expect(() => validateConfig({ relationship: { strengthIncrement: 1 } })).toThrow(/relationship\.strengthIncrement/);
  });
  it('rejects decayRate above 0.1', () => {
    expect(() => validateConfig({ relationship: { decayRate: 0.5 } })).toThrow(/relationship\.decayRate/);
  });
  it('rejects maxStrongTies below 1', () => {
    expect(() => validateConfig({ relationship: { maxStrongTies: 0 } })).toThrow(/relationship\.maxStrongTies/);
  });
  it('rejects maxMediumTies below 1', () => {
    expect(() => validateConfig({ relationship: { maxMediumTies: 0 } })).toThrow(/relationship\.maxMediumTies/);
  });
  it('rejects threshold values outside 0..1', () => {
    expect(() => validateConfig({ relationship: { threshold: { acquaintance: 2 } } })).toThrow(/relationship\.threshold\.acquaintance/);
  });
  it('allows partial threshold overrides', () => {
    expect(() => validateConfig({ relationship: { threshold: { acquaintance: 0.2 } } })).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// validateConfig — intrinsicMotivation 块
// ═══════════════════════════════════════════
describe('validateConfig — intrinsicMotivation block', () => {
  it('rejects curiosityDecayRate above 0.5', () => {
    expect(() => validateConfig({ intrinsicMotivation: { curiosityDecayRate: 1 } })).toThrow(/intrinsicMotivation\.curiosityDecayRate/);
  });
  it('rejects curiosityThreshold out of range', () => {
    expect(() => validateConfig({ intrinsicMotivation: { curiosityThreshold: 2 } })).toThrow(/intrinsicMotivation\.curiosityThreshold/);
  });
  it('rejects needGateThreshold out of range', () => {
    expect(() => validateConfig({ intrinsicMotivation: { needGateThreshold: -1 } })).toThrow(/intrinsicMotivation\.needGateThreshold/);
  });
  it('rejects maxActiveGoals below 1', () => {
    expect(() => validateConfig({ intrinsicMotivation: { maxActiveGoals: 0 } })).toThrow(/intrinsicMotivation\.maxActiveGoals/);
  });
  it('rejects additional intrinsicMotivation numeric values out of range', () => {
    expect(() => validateConfig({ intrinsicMotivation: { forgettingHours: 0 } })).toThrow(/intrinsicMotivation\.forgettingHours/);
    expect(() => validateConfig({ intrinsicMotivation: { goalGenerationInterval: 0 } })).toThrow(/intrinsicMotivation\.goalGenerationInterval/);
    expect(() => validateConfig({ intrinsicMotivation: { goalDeadlineHours: 0 } })).toThrow(/intrinsicMotivation\.goalDeadlineHours/);
    expect(() => validateConfig({ intrinsicMotivation: { curiositySatisfyOnNovelty: 2 } })).toThrow(/intrinsicMotivation\.curiositySatisfyOnNovelty/);
  });
  it('validates intrinsicMotivation domain maps and exploration states', () => {
    expect(() => validateConfig({ intrinsicMotivation: { domainRegionMap: [] } })).toThrow(/intrinsicMotivation\.domainRegionMap/);
    expect(() => validateConfig({ intrinsicMotivation: { domainRegionMap: { study: 123 } } })).toThrow(/intrinsicMotivation\.domainRegionMap\.study/);
    expect(() => validateConfig({ intrinsicMotivation: { explorationStates: 'study' } })).toThrow(/intrinsicMotivation\.explorationStates/);
    expect(() => validateConfig({ intrinsicMotivation: { explorationStates: ['study', 123] } })).toThrow(/intrinsicMotivation\.explorationStates\.1/);
  });
  it('allows partial intrinsicMotivation domainRegionMap overrides', () => {
    expect(() => validateConfig({
      intrinsicMotivation: {
        domainRegionMap: { customStudy: '图书馆' },
        explorationStates: ['在图书馆'],
      },
    })).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// validateConfig — mindWander 块
// ═══════════════════════════════════════════
describe('validateConfig — mindWander block', () => {
  it('rejects quietProbability out of range', () => {
    expect(() => validateConfig({ mindWander: { quietProbability: -0.1 } })).toThrow(/mindWander\.quietProbability/);
    expect(() => validateConfig({ mindWander: { quietProbability: 2 } })).toThrow(/mindWander\.quietProbability/);
  });

  it('rejects malformed effects', () => {
    expect(() => validateConfig({ mindWander: { effects: [] } })).toThrow(/mindWander\.effects/);
    expect(() => validateConfig({ mindWander: { effects: { worry: [] } } })).toThrow(/mindWander\.effects\.worry/);
    expect(() => validateConfig({ mindWander: { effects: { worry: { nervousness: 2 } } } })).toThrow(/mindWander\.effects\.worry\.nervousness/);
  });

  it('accepts partial mindWander overrides including zero probability', () => {
    expect(() => validateConfig({
      mindWander: {
        quietProbability: 0,
        effects: { nostalgia: { joy: 0.02 } },
      },
    })).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// validateConfig — weather block
// ═══════════════════════════════════════════
describe('validateConfig — weather block', () => {
  it('rejects transitionProb out of range', () => {
    expect(() => validateConfig({ weatherConfig: { transitionProb: 2 } })).toThrow(/weatherConfig\.transitionProb/);
  });

  it('rejects negative season probabilities', () => {
    expect(() => validateConfig({
      weatherConfig: {
        seasonProbabilities: {
          spring: { sunny: -1, rain: 2 },
        },
      },
    })).toThrow(/weatherConfig\.seasonProbabilities\.spring\.sunny/);
  });

  it('rejects non-finite season probabilities', () => {
    expect(() => validateConfig({
      weatherConfig: {
        seasonProbabilities: {
          spring: { sunny: NaN, rain: 1 },
        },
      },
    })).toThrow(/weatherConfig\.seasonProbabilities\.spring\.sunny/);
  });

  it('rejects non-object season probability tables', () => {
    expect(() => validateConfig({
      weatherConfig: {
        seasonProbabilities: {
          spring: null,
        },
      },
    })).toThrow(/weatherConfig\.seasonProbabilities\.spring/);
  });
});

// ═══════════════════════════════════════════
// validateConfig — 一致性检查 + 聚合错误
// ═══════════════════════════════════════════
describe('validateConfig — consistency & aggregation', () => {
  it('consistency low-recovery check throws (treated as error, not just warning)', () => {
    // recovery 0.001 < threshold 0.5 * 0.1 = 0.05 → pushed to errors array → throws
    expect(() => validateConfig({ needs: { threshold: { hunger: 0.5 }, recoveryRate: { hunger: 0.001 } } }))
      .toThrow(/recovery rate.*very low/);
  });
  it('consistency check passes when recovery rate is sufficient', () => {
    expect(() => validateConfig({ needs: { threshold: { hunger: 0.5 }, recoveryRate: { hunger: 0.1 } } }))
      .not.toThrow();
  });
  it('aggregates multiple errors into one throw', () => {
    try {
      validateConfig({ emotion: { inertia: 5 }, memory: { maxMemories: 1 } });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toContain('emotion.inertia');
      expect(e.message).toContain('memory.maxMemories');
    }
  });
});

// ═══════════════════════════════════════════
// validateAgentConfig
// ═══════════════════════════════════════════
describe('validateAgentConfig', () => {
  it('rejects missing id', () => {
    expect(() => validateAgentConfig({ name: 'X' })).toThrow(/id/);
  });
  it('rejects non-string id', () => {
    expect(() => validateAgentConfig({ id: 123, name: 'X' })).toThrow(/id/);
  });
  it('rejects missing name', () => {
    expect(() => validateAgentConfig({ id: 'a' })).toThrow(/name/);
  });
  it('rejects non-string name', () => {
    expect(() => validateAgentConfig({ id: 'a', name: 123 })).toThrow(/name/);
  });
  it('rejects invalid MBTI', () => {
    expect(() => validateAgentConfig({ id: 'a', name: 'X', personality: { mbti: 'XYZQ' } })).toThrow(/无效的 MBTI/);
  });
  it('accepts lowercase mbti (upper-cased internally)', () => {
    expect(() => validateAgentConfig({ id: 'a', name: 'X', personality: { mbti: 'infp' } })).not.toThrow();
  });
  it('rejects ocean trait out of range', () => {
    expect(() => validateAgentConfig({ id: 'a', name: 'X', personality: { ocean: { neuroticism: 1.5 } } })).toThrow(/personality\.ocean\.neuroticism.*0-1/);
  });
  it('rejects non-number ocean trait', () => {
    expect(() => validateAgentConfig({ id: 'a', name: 'X', personality: { ocean: { openness: 'high' } } })).toThrow(/personality\.ocean\.openness.*0-1/);
  });
  it('passes for fully valid config', () => {
    expect(() => validateAgentConfig({
      id: 'a', name: 'X',
      personality: { mbti: 'INFP', ocean: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 } },
    })).not.toThrow();
  });
});
