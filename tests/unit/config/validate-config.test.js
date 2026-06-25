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
  it('accepts valid per-need rates', () => {
    expect(() => validateConfig({ needs: { decayRate: { hunger: 0.5 }, threshold: { social: 0.3 } } })).not.toThrow();
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
