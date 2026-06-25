/**
 * Schedule branch coverage — Wave 5 batch 7
 *
 * statemachine.test.js 已覆盖部分 happy path。本文件补 getNextActivity(跨天)/
 * _maybeRegenerateVariations(新一天)/ resolvePreset(string 抛错)/ days 边界 /
 * probability skip / fromJSON round-trip。
 *
 * 纯逻辑:无 DB / 无 LLM。注入 RNG 控制概率/扰动。
 */

import { describe, it, expect } from 'vitest';
// CJS require:与运行时同一模块实例,确保 v8 coverage 正确归因
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const Schedule = require('../../../src/agent/schedule/Schedule.js');
const { RNG } = require('../../../src/shared/rng.js');

function makeEntries() {
  return [
    { startHour: 8, endHour: 12, region: '教室', activity: '上课', days: [1, 2, 3, 4, 5], probability: 1.0, noise: 10 },
    { startHour: 19, endHour: 22, region: '图书馆', activity: '自习', days: [1, 2, 3, 4, 5], probability: 1.0, noise: 15 },
  ];
}

// 固定 RNG:next() 总返回 0.5(中等值,保证概率通过、扰动可预测)
function makeSchedule(entries = makeEntries(), rng = new RNG(42)) {
  return new Schedule({ entries }, null, rng);
}

// ═══════════════════════════════════════════
// getCurrentActivity — days/viation/inSchedule 边界
// ═══════════════════════════════════════════
describe('Schedule.getCurrentActivity', () => {
  it('returns inSchedule activity when hour within variation window', () => {
    const s = makeSchedule();
    // 用固定 simDate 触发首次 variation 生成
    const act = s.getCurrentActivity(9, 1, '2026-09-01');
    expect(act.inSchedule).toBe(true);
  });
  it('returns inSchedule:false when day not in entry.days', () => {
    const s = makeSchedule();
    // Sunday (0) not in [1-5]
    const act = s.getCurrentActivity(9, 0, '2026-09-06');
    expect(act.inSchedule).toBe(false);
    expect(act.region).toBeNull();
  });
  it('returns inSchedule:false when hour outside all windows', () => {
    const s = makeSchedule();
    const act = s.getCurrentActivity(3, 1, '2026-09-01');
    expect(act.inSchedule).toBe(false);
  });
  it('regenerates variations on new simDate', () => {
    const s = makeSchedule();
    s.getCurrentActivity(9, 1, '2026-09-01');
    const firstVariations = { ...s._todayVariations };
    // 新一天触发重新生成
    s.getCurrentActivity(9, 2, '2026-09-02');
    expect(s._lastVariationDate).toBe('2026-09-02');
    // variations 可能不同(因 RNG 推进),但 _lastVariationDate 已更新
  });
});

// ═══════════════════════════════════════════
// getNextActivity — 跨天查询
// ═══════════════════════════════════════════
describe('Schedule.getNextActivity', () => {
  it('returns today next activity when available', () => {
    const s = makeSchedule();
    // at hour 6, next is 8am class
    const next = s.getNextActivity(6, 1, '2026-09-01');
    expect(next).not.toBeNull();
    expect(next.isTomorrow).toBe(false);
    expect(next.startsIn).toBeGreaterThan(0);
  });
  it('returns tomorrow first activity when no more today', () => {
    const s = makeSchedule();
    // at hour 23, no more today → tomorrow's 8am
    const next = s.getNextActivity(23, 1, '2026-09-01');
    expect(next).not.toBeNull();
    expect(next.isTomorrow).toBe(true);
  });
  it('returns null when no entries match any day', () => {
    const s = new Schedule({ entries: [] }, null, new RNG(0));
    expect(s.getNextActivity(10, 1, '2026-09-01')).toBeNull();
  });
});

// ═══════════════════════════════════════════
// _maybeRegenerateVariations — probability skip
// ═══════════════════════════════════════════
describe('Schedule._maybeRegenerateVariations — probability skip', () => {
  it('skips entry when rng > probability (旷工)', () => {
    // probability 0.0 + rng.next() 总 > 0 → 该 entry variation 为 null
    const s = new Schedule({ entries: [
      { startHour: 8, endHour: 12, region: 'r', activity: 'a', days: [1], probability: 0.0, noise: 10 },
    ] }, null, new RNG(42));
    s.getCurrentActivity(9, 1, '2026-09-01');
    expect(s._todayVariations[0]).toBeNull();
  });
  it('uses Date().toDateString() when simDate omitted', () => {
    const s = makeSchedule();
    s.getCurrentActivity(9, 1); // no simDate
    expect(s._lastVariationDate).toBe(new Date().toDateString());
  });
});

// ═══════════════════════════════════════════
// resolvePreset — string 抛错 / object 构造
// ═══════════════════════════════════════════
describe('Schedule.resolvePreset', () => {
  it('constructs Schedule from object config', () => {
    const s = Schedule.resolvePreset({ entries: makeEntries() });
    expect(s).toBeInstanceOf(Schedule);
    expect(s.entries).toHaveLength(2);
  });
  it('throws for string preset (requires domain factory)', () => {
    expect(() => Schedule.resolvePreset('student')).toThrow(/string preset requires domain-provided factory/);
  });
  it('throws for null preset', () => {
    expect(() => Schedule.resolvePreset(null)).toThrow(/string preset requires domain-provided factory/);
  });
});

// ═══════════════════════════════════════════
// constructor — 默认值
// ═══════════════════════════════════════════
describe('Schedule constructor — defaults', () => {
  it('fills default days/probability/noise when omitted', () => {
    const s = new Schedule({ entries: [{ startHour: 8, endHour: 12, region: 'r', activity: 'a' }] });
    expect(s.entries[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.entries[0].probability).toBe(1.0);
    expect(s.entries[0].noise).toBe(30);
  });
  it('restores savedState variations when provided', () => {
    const saved = { _todayVariations: { 0: { startHour: 9, endHour: 13 } }, _lastVariationDate: '2026-09-01' };
    const s = new Schedule({ entries: makeEntries() }, saved);
    expect(s._todayVariations[0]).toEqual({ startHour: 9, endHour: 13 });
    expect(s._lastVariationDate).toBe('2026-09-01');
  });
});

// ═══════════════════════════════════════════
// fromJSON round-trip
// ═══════════════════════════════════════════
describe('Schedule.fromJSON — round-trip', () => {
  it('restores entries + variations from toJSON', () => {
    const s = makeSchedule();
    s.getCurrentActivity(9, 1, '2026-09-01'); // 触发 variation 生成
    const json = s.toJSON();
    const restored = Schedule.fromJSON(json);
    expect(restored.entries).toEqual(s.entries);
    expect(restored._todayVariations).toEqual(s._todayVariations);
    expect(restored._lastVariationDate).toBe(s._lastVariationDate);
  });
});

// ═══════════════════════════════════════════
// _gaussianNoise — 不抛错且有限
// ═══════════════════════════════════════════
describe('Schedule._gaussianNoise', () => {
  it('returns a finite number for given stddev', () => {
    const s = makeSchedule();
    const noise = s._gaussianNoise(30);
    expect(typeof noise).toBe('number');
    expect(Number.isFinite(noise)).toBe(true);
  });
});
