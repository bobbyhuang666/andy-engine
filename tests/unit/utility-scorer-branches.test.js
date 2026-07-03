/**
 * UtilityScorer branch coverage — Wave 5 batch 6
 *
 * utility-scorer.test.js / utility-scorer-habit.test.js / memory-influence-scorer.test.js /
 * goalsystem.test.js 已覆盖主路径。本文件补 pressureContext / scoreTendency / scoreLocation /
 * scoreTime 夜间分支 / scoreWorld QUIET-ACTIVE / scoreConstraint in-range / scoreEmotion 类型分支。
 *
 * 纯函数:无 DB / 无 LLM / 无 domain / 无 agent。全部 context 字面量。
 */

import { describe, it, expect } from 'vitest';
// CJS require:与运行时同一模块实例,确保 v8 coverage 正确归因
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { scoreCandidate } = require('../../src/action/UtilityScorer.js');

function makeCandidate(type = 'rest', overrides = {}) {
  return { type, source: 'need', ...overrides };
}

function baseContext(overrides = {}) {
  const world = overrides.world || { time: '2026-09-01T14:00:00Z' };
  const hour = overrides.environment?.hour ?? (world.time ? new Date(world.time).getUTCHours() : 14);
  return {
    behaviorField: { B: [0.5, 0.5, 0.5, 0.5] },
    needs: { hunger: 0.5, energy: 0.5, social: 0.5, stimulation: 0.5 },
    emotion: { valence: 0.1, arousal: 0.4 },
    world,
    environment: overrides.environment ?? { hour },
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// scoreNeed — pressureContext 分支
// ═══════════════════════════════════════════
describe('scoreNeed — pressureContext branch', () => {
  it('uses pressureContext.needs when present (clamped 0-1)', () => {
    const ctx = baseContext({ pressureContext: { needs: { hunger: 0.9 } } });
    delete ctx.needs;
    const score = scoreCandidate(makeCandidate('consume'), ctx);
    expect(score.need).toBe(0.9);
  });
  it('clamps pressureContext.needs above 1 to 1', () => {
    const ctx = baseContext({ pressureContext: { needs: { hunger: 1.5 } } });
    delete ctx.needs;
    expect(scoreCandidate(makeCandidate('consume'), ctx).need).toBe(1);
  });
  it('returns 0 when needKey not in pressureContext.needs', () => {
    const ctx = baseContext({ pressureContext: { needs: { hunger: 0.9 } } });
    delete ctx.needs;
    expect(scoreCandidate(makeCandidate('rest'), ctx).need).toBe(0);
  });
});

// ═══════════════════════════════════════════
// scoreEmotion — 类型分支
// ═══════════════════════════════════════════
describe('scoreEmotion — type-specific branches', () => {
  it('rest + valence<-0.1 returns abs(valence)', () => {
    const ctx = baseContext({ emotion: { valence: -0.5, arousal: 0.4 } });
    expect(scoreCandidate(makeCandidate('rest'), ctx).emotion).toBe(0.5);
  });
  it('explore + valence>0.1 returns valence', () => {
    const ctx = baseContext({ emotion: { valence: 0.4, arousal: 0.4 } });
    expect(scoreCandidate(makeCandidate('explore'), ctx).emotion).toBe(0.4);
  });
  it('socialize + arousal>0.3 returns arousal*0.5', () => {
    const ctx = baseContext({ emotion: { valence: 0.1, arousal: 0.6 } });
    expect(scoreCandidate(makeCandidate('socialize'), ctx).emotion).toBe(0.3);
  });
  it('work returns 0 (no emotion mapping)', () => {
    const ctx = baseContext({ emotion: { valence: 0.5, arousal: 0.5 } });
    expect(scoreCandidate(makeCandidate('work'), ctx).emotion).toBe(0);
  });
});

// ═══════════════════════════════════════════
// scoreBehavior — idealMap 各类型 + guard
// ═══════════════════════════════════════════
describe('scoreBehavior — idealMap branches', () => {
  it('work near ideal center yields high score', () => {
    const ctx = baseContext({ behaviorField: { B: [0.8, 0.3, 0.8, 0.3] } });
    expect(scoreCandidate(makeCandidate('work'), ctx).behavior).toBeGreaterThan(0.8);
  });
  it('continue mirrors current B (score ~1)', () => {
    const ctx = baseContext({ behaviorField: { B: [0.5, 0.5, 0.5, 0.5] } });
    expect(scoreCandidate(makeCandidate('continue'), ctx).behavior).toBe(1);
  });
  it('B.length<4 returns 0', () => {
    const ctx = baseContext({ behaviorField: { B: [0.5, 0.5, 0.5] } });
    expect(scoreCandidate(makeCandidate('work'), ctx).behavior).toBe(0);
  });
  it('unknown type returns 0', () => {
    const ctx = baseContext();
    expect(scoreCandidate(makeCandidate('dance'), ctx).behavior).toBe(0);
  });
});

// ═══════════════════════════════════════════
// scoreMemory — pressureContext.memory 分支
// ═══════════════════════════════════════════
describe('scoreMemory — pressureContext.memory branch', () => {
  it('uses pressureContext.memory (positive-negative)*0.3 clamped', () => {
    const ctx = baseContext({ pressureContext: { memory: { positive: 0.6, negative: 0.2 } } });
    delete ctx.memories;
    expect(scoreCandidate(makeCandidate('consume'), ctx).memory).toBeCloseTo((0.6 - 0.2) * 0.3, 5);
  });
  it('clamps to [-0.5, 0.5]', () => {
    const ctx = baseContext({ pressureContext: { memory: { positive: 5, negative: 0 } } });
    delete ctx.memories;
    expect(scoreCandidate(makeCandidate('consume'), ctx).memory).toBe(0.5);
  });
});

// ═══════════════════════════════════════════
// scoreTime — 夜间 vs 白天 vs 晚间
// ═══════════════════════════════════════════
describe('scoreTime — hour bands', () => {
  it('night hour (02:00) boosts rest, penalizes work', () => {
    const ctx = baseContext({ world: { time: '2026-09-01T02:00:00Z' } });
    const rest = scoreCandidate(makeCandidate('rest'), ctx);
    const work = scoreCandidate(makeCandidate('work'), ctx);
    expect(rest.time).toBeGreaterThan(0);
    expect(work.time).toBeLessThan(0);
  });
  it('day hour (12:00) boosts work/explore', () => {
    const ctx = baseContext({ world: { time: '2026-09-01T12:00:00Z' } });
    expect(scoreCandidate(makeCandidate('work'), ctx).time).toBeGreaterThan(0);
    expect(scoreCandidate(makeCandidate('explore'), ctx).time).toBeGreaterThan(0);
  });
  it('evening hour (20:00) returns 0 for both', () => {
    const ctx = baseContext({ world: { time: '2026-09-01T20:00:00Z' } });
    expect(scoreCandidate(makeCandidate('work'), ctx).time).toBe(0);
    expect(scoreCandidate(makeCandidate('rest'), ctx).time).toBe(0);
  });
});

// ═══════════════════════════════════════════
// scoreWorld — QUIET vs ACTIVE 类型集
// ═══════════════════════════════════════════
describe('scoreWorld — QUIET/ACTIVE type sets', () => {
  it('observe/reflect (QUIET) get positive boost under world pressure', () => {
    const ctx = baseContext({ worldPressure: { total: 0.8 } });
    expect(scoreCandidate(makeCandidate('observe'), ctx).world).toBeGreaterThan(0);
    expect(scoreCandidate(makeCandidate('reflect'), ctx).world).toBeGreaterThan(0);
  });
  it('explore/move (ACTIVE) get negative under world pressure', () => {
    const ctx = baseContext({ worldPressure: { total: 0.8 } });
    expect(scoreCandidate(makeCandidate('explore'), ctx).world).toBeLessThan(0);
    expect(scoreCandidate(makeCandidate('move'), ctx).world).toBeLessThan(0);
  });
  it('consume (neither set) returns 0', () => {
    const ctx = baseContext({ worldPressure: { total: 0.8 } });
    expect(scoreCandidate(makeCandidate('consume'), ctx).world).toBe(0);
  });
});

// ═══════════════════════════════════════════
// scoreConstraint — in-range returns 0
// ═══════════════════════════════════════════
describe('scoreConstraint — in-range branch', () => {
  it('in-range constraint returns 0', () => {
    const ctx = baseContext({ constraints: { timeRange: [9, 18] }, world: { time: '2026-09-01T12:00:00Z' } });
    expect(scoreCandidate(makeCandidate('work'), ctx).constraint).toBe(0);
  });
  it('no constraints returns 0', () => {
    const ctx = baseContext();
    expect(scoreCandidate(makeCandidate('work'), ctx).constraint).toBe(0);
  });
});

// ═══════════════════════════════════════════
// P1-3 回归: scoreTime fallback 时区中立 (getUTCHours)
// 优先用 environment.hour, fallback 用 getUTCHours 避免 TZ 依赖
// ═══════════════════════════════════════════
describe('P1-3: scoreTime fallback timezone-neutral', () => {
  it('uses environment.hour when available (primary path)', () => {
    const ctx = baseContext({
      world: { time: '2026-09-01T20:00:00Z' },    // UTC 20:00 would be evening
      environment: { hour: 12 },                     // but env says noon
    });
    // environment.hour=12 → day hour, rest应该拿不到夜间加分
    const restScore = scoreCandidate(makeCandidate('rest'), ctx).time;
    expect(restScore).toBe(0); // day hour, rest gets no boost
    const workScore = scoreCandidate(makeCandidate('work'), ctx).time;
    expect(workScore).toBeGreaterThan(0); // day hour, work boosted
  });

  it('fallback uses getUTCHours when environment.hour missing', () => {
    // No environment set → falls back to world.time via getUTCHours()
    const ctxNight = baseContext({
      world: { time: '2026-09-01T02:00:00Z' },
    });
    delete ctxNight.environment;
    const nightRest = scoreCandidate(makeCandidate('rest'), ctxNight).time;
    expect(nightRest).toBeGreaterThan(0); // night → rest+0.8

    const ctxDay = baseContext({
      world: { time: '2026-09-01T12:00:00Z' },
    });
    delete ctxDay.environment;
    const dayWork = scoreCandidate(makeCandidate('work'), ctxDay).time;
    expect(dayWork).toBeGreaterThan(0); // day → work+0.5
  });
});
