/**
 * Shared utilities coverage — Wave 5 hardening
 *
 * 针对 src/shared/ 下三个低覆盖纯工具模块补充分支覆盖:
 *   - errors.js (10%): 4 个错误类实例化 + code/name 字段
 *   - ids.js (33%):    generateId 的 rng/无 rng 两条路径 + isValidId 边界
 *   - time.js (36%):    ticksToHours / hoursToTicks / formatSimTime 边界
 *
 * 这些是 shared 工具,无副作用,补测试纯收益(不改变行为)。
 */

import { describe, it, expect } from 'vitest';
import { AndyError, ConfigError, DomainError, AgentError } from '../../src/shared/errors.js';
import { generateId, isValidId } from '../../src/shared/ids.js';
import {
  TICK_INTERVAL_MINUTES,
  TICKS_PER_HOUR,
  TICKS_PER_DAY,
  ticksToHours,
  hoursToTicks,
  formatSimTime,
} from '../../src/shared/time.js';

// ═══════════════════════════════════════════
// errors.js
// ═══════════════════════════════════════════
describe('shared/errors — error type hierarchy', () => {
  it('AndyError carries default code ANDY_ERROR', () => {
    const e = new AndyError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AndyError);
    expect(e.message).toBe('boom');
    expect(e.code).toBe('ANDY_ERROR');
    expect(e.name).toBe('AndyError');
  });

  it('AndyError accepts a custom code', () => {
    const e = new AndyError('boom', 'CUSTOM_CODE');
    expect(e.code).toBe('CUSTOM_CODE');
    expect(e.name).toBe('AndyError');
  });

  it('ConfigError extends AndyError with CONFIG_ERROR code', () => {
    const e = new ConfigError('bad config');
    expect(e).toBeInstanceOf(AndyError);
    expect(e.code).toBe('CONFIG_ERROR');
    expect(e.name).toBe('ConfigError');
    expect(e.message).toBe('bad config');
  });

  it('DomainError extends AndyError with DOMAIN_ERROR code', () => {
    const e = new DomainError('bad domain');
    expect(e).toBeInstanceOf(AndyError);
    expect(e.code).toBe('DOMAIN_ERROR');
    expect(e.name).toBe('DomainError');
  });

  it('AgentError extends AndyError with AGENT_ERROR code', () => {
    const e = new AgentError('bad agent');
    expect(e).toBeInstanceOf(AndyError);
    expect(e.code).toBe('AGENT_ERROR');
    expect(e.name).toBe('AgentError');
  });

  it('all error types are throwable and catchable by AndyError', () => {
    for (const Err of [ConfigError, DomainError, AgentError]) {
      try {
        throw new Err('test');
      } catch (caught) {
        expect(caught).toBeInstanceOf(AndyError);
      }
    }
  });
});

// ═══════════════════════════════════════════
// ids.js
// ═══════════════════════════════════════════
describe('shared/ids — id generation', () => {
  it('generateId uses default prefix "id"', () => {
    const id = generateId();
    expect(id).toMatch(/^id_/);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generateId accepts a custom prefix', () => {
    const id = generateId('agent');
    expect(id).toMatch(/^agent_/);
  });

  it('generateId routes to rng.next when rng provided (deterministic)', () => {
    // 固定 rng:next() 返回已知值,验证被用于 id 后缀
    const fixedValue = 0.5;
    const rng = { next: () => fixedValue };
    const id = generateId('x', rng);
    // toString(36).slice(2,8) of 0.5
    const expectedSuffix = fixedValue.toString(36).slice(2, 8);
    expect(id.endsWith(expectedSuffix)).toBe(true);
  });

  it('generateId without rng falls back to Math.random (still produces id)', () => {
    const id = generateId('y', null);
    expect(id).toMatch(/^y_/);
    // 含 4 段: prefix_timestamp_counter_randomsuffix
    const parts = id.split('_');
    expect(parts.length).toBe(4);
  });

  it('generateId increments internal counter (monotonic prefix-agnostic)', () => {
    const before = generateId('seq');
    const after = generateId('seq');
    // counter 段递增
    const beforeCounter = Number(before.split('_')[2]);
    const afterCounter = Number(after.split('_')[2]);
    expect(afterCounter).toBeGreaterThan(beforeCounter);
  });

  it('isValidId returns true for non-empty string', () => {
    expect(isValidId('a')).toBe(true);
    expect(isValidId('agent_123')).toBe(true);
  });

  it('isValidId returns false for empty/non-string', () => {
    expect(isValidId('')).toBe(false);
    expect(isValidId(null)).toBe(false);
    expect(isValidId(undefined)).toBe(false);
    expect(isValidId(123)).toBe(false);
    expect(isValidId({})).toBe(false);
  });
});

// ═══════════════════════════════════════════
// time.js
// ═══════════════════════════════════════════
describe('shared/time — time conversion helpers', () => {
  it('exports correct constants for 5-min tick interval', () => {
    expect(TICK_INTERVAL_MINUTES).toBe(5);
    expect(TICKS_PER_HOUR).toBe(12);
    expect(TICKS_PER_DAY).toBe(12 * 24);
  });

  it('ticksToHours converts ticks to fractional hours', () => {
    expect(ticksToHours(0)).toBe(0);
    expect(ticksToHours(12)).toBe(1);
    expect(ticksToHours(6)).toBe(0.5);
    expect(ticksToHours(TICKS_PER_DAY)).toBe(24);
  });

  it('hoursToTicks rounds hours to nearest tick count', () => {
    expect(hoursToTicks(0)).toBe(0);
    expect(hoursToTicks(1)).toBe(12);
    expect(hoursToTicks(0.5)).toBe(6);
    expect(hoursToTicks(24)).toBe(TICKS_PER_DAY);
    // 舍入:0.04h < 0.5 tick → 0;0.05h > 0.5 tick → 1
    expect(hoursToTicks(0.04)).toBe(0);
    expect(hoursToTicks(0.05)).toBe(1);
  });

  it('formatSimTime returns empty string for non-Date input', () => {
    expect(formatSimTime(null)).toBe('');
    expect(formatSimTime(undefined)).toBe('');
    expect(formatSimTime('not a date')).toBe('');
    expect(formatSimTime(12345)).toBe('');
  });

  it('formatSimTime formats Date as HH:MM with zero-padding', () => {
    expect(formatSimTime(new Date('2026-09-01T08:00:00Z'))).toMatch(/^\d{2}:\d{2}$/);
    // 用本地时间构造确保 0 填充:9:05 → "09:05"
    const d = new Date(2026, 8, 1, 9, 5);
    expect(formatSimTime(d)).toBe('09:05');
  });

  it('ticksToHours / hoursToTicks are inverse for whole-hour values', () => {
    for (const h of [0, 1, 2, 5, 12, 24]) {
      expect(ticksToHours(hoursToTicks(h))).toBeCloseTo(h, 10);
    }
  });
});
