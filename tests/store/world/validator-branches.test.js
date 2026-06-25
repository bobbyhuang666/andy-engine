/**
 * validator.js branch coverage — Wave 5 batch 3
 *
 * schema-validator.test.js 已覆盖 happy path + 主要负分支。
 * 本文件补 per-field 的边缘负分支:非对象元素、空字符串、非数组、超出范围等。
 *
 * 纯函数:无 DB / 无 engine。
 */

import { describe, it, expect } from 'vitest';
import { validateWorldSpec, validateWorldState, CURRENT_SCHEMA_VERSION } from '../../../src/store/world/validator.js';

// 一个合法的 WorldState 基线,每个测试在此基础上扰动单字段
function validState() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    worldId: 'w1',
    domainRef: 'campus',
    worldClock: { time: '2026-09-01T08:00:00Z', tickCount: 0 },
    characters: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    relationships: [{ from: 'a', to: 'b', type: 'friend', strength: 0.5 }],
    events: [{ id: 'e1', time: '2026-09-01T08:00:00Z', type: 'social' }],
    runtimeSnapshot: { opaque: true },
  };
}

// 一个合法的 WorldSpec 基线
function validSpec() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    domainRef: 'campus',
    worldName: 'Test World',
    characters: [{ id: 'a', name: 'A' }],
  };
}

// ═══════════════════════════════════════════
// validateWorldSpec — 字符元素分支
// ═══════════════════════════════════════════
describe('validateWorldSpec — character element branches', () => {
  it('rejects non-object character element with path characters[i]', () => {
    const spec = validSpec();
    spec.characters = ['nope', { id: 'a', name: 'A' }];
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'characters[0]' && e.message === '必须是对象')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// validateWorldState — worldId / domainRef 空字符串
// ═══════════════════════════════════════════
describe('validateWorldState — empty-string worldId/domainRef', () => {
  it('rejects empty-string worldId', () => {
    const s = validState(); s.worldId = '';
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'worldId')).toBe(true);
  });
  it('rejects empty-string domainRef', () => {
    const s = validState(); s.domainRef = '';
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'domainRef')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// validateWorldState — worldClock.time 边界
// ═══════════════════════════════════════════
describe('validateWorldState — worldClock.time branches', () => {
  it('rejects empty-string worldClock.time', () => {
    const s = validState(); s.worldClock.time = '';
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'worldClock.time' && e.message.includes('非空字符串'))).toBe(true);
  });
  it('rejects invalid ISO date worldClock.time', () => {
    const s = validState(); s.worldClock.time = '2026-13-99';
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'worldClock.time' && e.message.includes('有效的 ISO 8601'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// validateWorldState — characters 非对象/空字符串
// ═══════════════════════════════════════════
describe('validateWorldState — character element branches', () => {
  it('rejects non-object character element', () => {
    const s = validState();
    s.characters = [{ id: 'a', name: 'A' }, 'bad'];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'characters[1]' && e.message === '必须是对象')).toBe(true);
  });
  it('rejects empty-string char id and name', () => {
    const s = validState();
    s.characters = [{ id: '', name: '' }];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'characters[0].id')).toBe(true);
    expect(r.errors.some(e => e.path === 'characters[0].name')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// validateWorldState — relationships 非数组/非对象元素
// ═══════════════════════════════════════════
describe('validateWorldState — relationships branches', () => {
  it('rejects non-array relationships', () => {
    const s = validState(); s.relationships = 'nope';
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'relationships' && e.message === '必须是数组')).toBe(true);
  });
  it('rejects non-object relationship element', () => {
    const s = validState();
    s.relationships = ['bad'];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'relationships[0]' && e.message === '必须是对象')).toBe(true);
  });
  it('rejects empty-string from/to', () => {
    const s = validState();
    s.relationships = [{ from: '', to: '' }];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'relationships[0].from')).toBe(true);
    expect(r.errors.some(e => e.path === 'relationships[0].to')).toBe(true);
  });
  it('rejects non-string type', () => {
    const s = validState();
    s.relationships = [{ from: 'a', to: 'b', type: 123 }];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'relationships[0].type' && e.message === '必须是字符串')).toBe(true);
  });
  it('rejects out-of-range and non-numeric strength', () => {
    for (const strength of [-0.1, 1.1, 'high']) {
      const s = validState();
      s.relationships = [{ from: 'a', to: 'b', strength }];
      const r = validateWorldState(s);
      expect(r.errors.some(e => e.path === 'relationships[0].strength')).toBe(true);
    }
  });
  it('rejects from/to referencing nonexistent when characters is non-array', () => {
    const s = validState();
    s.characters = 'nope';
    s.relationships = [{ from: 'a', to: 'b' }];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'relationships[0].from' && e.message.includes('不存在的角色'))).toBe(true);
    expect(r.errors.some(e => e.path === 'relationships[0].to' && e.message.includes('不存在的角色'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// validateWorldState — events 非数组/非对象元素/空字符串
// ═══════════════════════════════════════════
describe('validateWorldState — events branches', () => {
  it('rejects non-array events', () => {
    const s = validState(); s.events = 'nope';
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'events' && e.message === '必须是数组')).toBe(true);
  });
  it('rejects non-object event element', () => {
    const s = validState();
    s.events = ['bad'];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'events[0]' && e.message === '必须是对象')).toBe(true);
  });
  it('rejects empty-string event id/time/type', () => {
    const s = validState();
    s.events = [{ id: '', time: '', type: '' }];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'events[0].id')).toBe(true);
    expect(r.errors.some(e => e.path === 'events[0].time')).toBe(true);
    expect(r.errors.some(e => e.path === 'events[0].type')).toBe(true);
  });
  it('rejects invalid ISO event time', () => {
    const s = validState();
    s.events = [{ id: 'e1', time: 'not-a-date', type: 'social' }];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'events[0].time' && e.message.includes('有效的 ISO 8601'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// validateWorldState — runtimeSnapshot 边界
// ═══════════════════════════════════════════
describe('validateWorldState — runtimeSnapshot branches', () => {
  it('accepts undefined runtimeSnapshot', () => {
    const s = validState(); delete s.runtimeSnapshot;
    expect(validateWorldState(s).valid).toBe(true);
  });
  it('accepts null runtimeSnapshot', () => {
    const s = validState(); s.runtimeSnapshot = null;
    expect(validateWorldState(s).valid).toBe(true);
  });
  it('rejects array runtimeSnapshot', () => {
    const s = validState(); s.runtimeSnapshot = [1, 2, 3];
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'runtimeSnapshot')).toBe(true);
  });
  it('rejects string runtimeSnapshot', () => {
    const s = validState(); s.runtimeSnapshot = 'nope';
    const r = validateWorldState(s);
    expect(r.errors.some(e => e.path === 'runtimeSnapshot')).toBe(true);
  });
});
