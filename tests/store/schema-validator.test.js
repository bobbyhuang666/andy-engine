/**
 * Schema Validator 测试
 *
 * 覆盖 validateWorldSpec 和 validateWorldState 的校验逻辑。
 * 只测试 Stable World Envelope 的公共 Schema，不测试 runtimeSnapshot 内部细节。
 */

import { describe, it, expect } from 'vitest';
import { validateWorldSpec, validateWorldState, CURRENT_SCHEMA_VERSION } from '../../src/store/world/validator.js';

// ═══════════════════════════════════════════
// validateWorldSpec
// ═══════════════════════════════════════════

describe('validateWorldSpec', () => {
  const validSpec = {
    schemaVersion: '0.1.0',
    domainRef: 'campus',
    worldName: '测试世界',
    characters: [
      { id: 'maya', name: 'Maya' },
      { id: 'alice', name: 'Alice' },
    ],
  };

  it('接受合法的 World Spec', () => {
    const result = validateWorldSpec(validSpec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('拒绝非对象输入', () => {
    expect(validateWorldSpec(null).valid).toBe(false);
    expect(validateWorldSpec('string').valid).toBe(false);
    expect(validateWorldSpec(42).valid).toBe(false);
  });

  // schemaVersion 强校验

  it('拒绝缺少 schemaVersion', () => {
    const spec = { ...validSpec };
    delete spec.schemaVersion;
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'schemaVersion')).toBe(true);
  });

  it('拒绝空 schemaVersion', () => {
    const spec = { ...validSpec, schemaVersion: '' };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'schemaVersion')).toBe(true);
  });

  it('拒绝不匹配的 schemaVersion', () => {
    const spec = { ...validSpec, schemaVersion: '99.99.99' };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'schemaVersion' && e.message.includes('版本不匹配'))).toBe(true);
  });

  it('接受匹配的 schemaVersion', () => {
    const spec = { ...validSpec, schemaVersion: CURRENT_SCHEMA_VERSION };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('拒绝缺少 domainRef', () => {
    const spec = { ...validSpec };
    delete spec.domainRef;
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'domainRef')).toBe(true);
  });

  it('拒绝缺少 worldName', () => {
    const spec = { ...validSpec };
    delete spec.worldName;
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'worldName')).toBe(true);
  });

  it('拒绝空 characters 数组', () => {
    const spec = { ...validSpec, characters: [] };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
  });

  it('拒绝非数组 characters', () => {
    const spec = { ...validSpec, characters: 'not-array' };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
  });

  it('拒绝 character 缺少 id', () => {
    const spec = { ...validSpec, characters: [{ name: 'Maya' }] };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('id'))).toBe(true);
  });

  it('拒绝 character 缺少 name', () => {
    const spec = { ...validSpec, characters: [{ id: 'maya' }] };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('name'))).toBe(true);
  });

  it('拒绝重复的 character id', () => {
    const spec = {
      ...validSpec,
      characters: [
        { id: 'maya', name: 'Maya' },
        { id: 'maya', name: 'Maya2' },
      ],
    };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('重复'))).toBe(true);
  });

  it('拒绝空 id 的 character', () => {
    const spec = { ...validSpec, characters: [{ id: '', name: 'Maya' }] };
    const result = validateWorldSpec(spec);
    expect(result.valid).toBe(false);
  });
});

// ═══════════════════════════════════════════
// validateWorldState
// ═══════════════════════════════════════════

describe('validateWorldState', () => {
  const validState = {
    schemaVersion: '0.1.0',
    worldId: 'world_abc123',
    domainRef: 'campus',
    worldClock: {
      time: '2026-09-15T14:30:00Z',
      tickCount: 1234,
    },
    characters: [
      { id: 'maya', name: 'Maya', position: '图书馆' },
      { id: 'alice', name: 'Alice', position: '食堂' },
    ],
    relationships: [
      { from: 'maya', to: 'alice', type: 'friend', strength: 0.65 },
    ],
    events: [
      { id: 'evt_1', time: '2026-09-15T14:00:00Z', type: 'social', content: '聊天' },
    ],
    runtimeSnapshot: {
      _runtimeVersion: '0.2.0',
      agents: {},
    },
  };

  it('接受合法的 World State', () => {
    const result = validateWorldState(validState);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('拒绝非对象输入', () => {
    expect(validateWorldState(null).valid).toBe(false);
    expect(validateWorldState('string').valid).toBe(false);
    expect(validateWorldState(42).valid).toBe(false);
  });

  // schemaVersion 强校验

  it('拒绝缺少 schemaVersion', () => {
    const state = { ...validState };
    delete state.schemaVersion;
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'schemaVersion')).toBe(true);
  });

  it('拒绝空 schemaVersion', () => {
    const state = { ...validState, schemaVersion: '' };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'schemaVersion')).toBe(true);
  });

  it('拒绝不匹配的 schemaVersion', () => {
    const state = { ...validState, schemaVersion: '99.99.99' };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'schemaVersion' && e.message.includes('版本不匹配'))).toBe(true);
  });

  it('接受匹配的 schemaVersion', () => {
    const state = { ...validState, schemaVersion: CURRENT_SCHEMA_VERSION };
    const result = validateWorldState(state);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('拒绝缺少 worldId', () => {
    const state = { ...validState };
    delete state.worldId;
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'worldId')).toBe(true);
  });

  it('拒绝缺少 domainRef', () => {
    const state = { ...validState };
    delete state.domainRef;
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'domainRef')).toBe(true);
  });

  it('拒绝缺少 worldClock', () => {
    const state = { ...validState };
    delete state.worldClock;
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'worldClock')).toBe(true);
  });

  it('拒绝无效的 worldClock.time', () => {
    const state = { ...validState, worldClock: { time: 'not-a-date', tickCount: 0 } };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'worldClock.time')).toBe(true);
  });

  it('拒绝负数 tickCount', () => {
    const state = { ...validState, worldClock: { time: '2026-09-15T14:30:00Z', tickCount: -1 } };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'worldClock.tickCount')).toBe(true);
  });

  it('拒绝非整数 tickCount', () => {
    const state = { ...validState, worldClock: { time: '2026-09-15T14:30:00Z', tickCount: 1.5 } };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
  });

  it('拒绝非数组 characters', () => {
    const state = { ...validState, characters: 'not-array' };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
  });

  it('拒绝重复的 character id', () => {
    const state = {
      ...validState,
      characters: [
        { id: 'maya', name: 'Maya' },
        { id: 'maya', name: 'Maya2' },
      ],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('重复'))).toBe(true);
  });

  it('拒绝 relationship 引用不存在的角色', () => {
    const state = {
      ...validState,
      relationships: [
        { from: 'maya', to: 'nonexistent', type: 'friend', strength: 0.5 },
      ],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('nonexistent'))).toBe(true);
  });

  it('拒绝 relationship 的 strength 超出范围', () => {
    const state = {
      ...validState,
      relationships: [
        { from: 'maya', to: 'alice', strength: 1.5 },
      ],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('strength'))).toBe(true);
  });

  it('接受 strength=0 和 strength=1 的边界值', () => {
    const state = {
      ...validState,
      relationships: [
        { from: 'maya', to: 'alice', strength: 0 },
        { from: 'alice', to: 'maya', strength: 1 },
      ],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(true);
  });

  it('拒绝 event 缺少 id', () => {
    const state = {
      ...validState,
      events: [{ time: '2026-09-15T14:00:00Z', type: 'social' }],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('events') && e.path.includes('id'))).toBe(true);
  });

  it('拒绝 event 缺少 time', () => {
    const state = {
      ...validState,
      events: [{ id: 'evt_1', type: 'social' }],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('events') && e.path.includes('time'))).toBe(true);
  });

  it('拒绝 event 缺少 type', () => {
    const state = {
      ...validState,
      events: [{ id: 'evt_1', time: '2026-09-15T14:00:00Z' }],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('events') && e.path.includes('type'))).toBe(true);
  });

  it('拒绝 event 的无效 time', () => {
    const state = {
      ...validState,
      events: [{ id: 'evt_1', time: 'not-a-date', type: 'social' }],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('events') && e.path.includes('time'))).toBe(true);
  });

  // runtimeSnapshot — required opaque payload tests

  it('拒绝没有 runtimeSnapshot 的 State', () => {
    const state = { ...validState };
    delete state.runtimeSnapshot;
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'runtimeSnapshot')).toBe(true);
  });

  it('拒绝 runtimeSnapshot 为 null', () => {
    const state = { ...validState, runtimeSnapshot: null };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'runtimeSnapshot')).toBe(true);
  });

  it('接受 runtimeSnapshot 为任意对象（Opaque Payload）', () => {
    const state = {
      ...validState,
      runtimeSnapshot: {
        _runtimeVersion: '0.2.0',
        agents: {
          maya: {
            emotion: { current: { joy: 0.5 } },
            needs: { hunger: 0.3 },
            behaviorField: { B: [0.5, 0.3, 0.7, 0.2] },
          },
        },
        someArbitraryField: [1, 2, 3],
      },
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(true);
  });

  it('拒绝 runtimeSnapshot 为非对象类型', () => {
    const state = { ...validState, runtimeSnapshot: 'not-an-object' };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'runtimeSnapshot')).toBe(true);
  });

  it('拒绝 runtimeSnapshot 为数组', () => {
    const state = { ...validState, runtimeSnapshot: [1, 2, 3] };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'runtimeSnapshot')).toBe(true);
  });

  // 完整性测试

  it('收集多个错误', () => {
    const state = {
      schemaVersion: '',
      worldId: '',
      domainRef: '',
      worldClock: { time: 'bad', tickCount: -1 },
      characters: 'not-array',
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('拒绝 relationships 字段缺失的 State', () => {
    const state = {
      schemaVersion: '0.1.0',
      worldId: 'world_abc',
      domainRef: 'campus',
      worldClock: { time: '2026-09-15T14:30:00Z', tickCount: 0 },
      characters: [{ id: 'maya', name: 'Maya' }],
      events: [],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'relationships')).toBe(true);
  });

  it('拒绝 events 字段缺失的 State', () => {
    const state = {
      schemaVersion: '0.1.0',
      worldId: 'world_abc',
      domainRef: 'campus',
      worldClock: { time: '2026-09-15T14:30:00Z', tickCount: 0 },
      characters: [{ id: 'maya', name: 'Maya' }],
      relationships: [],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'events')).toBe(true);
  });

  it('拒绝 relationships 和 events 均缺失的 State', () => {
    const state = {
      schemaVersion: '0.1.0',
      worldId: 'world_abc',
      domainRef: 'campus',
      worldClock: { time: '2026-09-15T14:30:00Z', tickCount: 0 },
      characters: [{ id: 'maya', name: 'Maya' }],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'relationships')).toBe(true);
    expect(result.errors.some(e => e.path === 'events')).toBe(true);
  });

  it('拒绝空 characters 列表下有 relationship 关系的 State', () => {
    const state = {
      schemaVersion: '0.1.0',
      worldId: 'world_abc',
      domainRef: 'campus',
      worldClock: { time: '2026-09-15T14:30:00Z', tickCount: 0 },
      characters: [],
      relationships: [
        { from: 'maya', to: 'alice', type: 'friend', strength: 0.5 },
      ],
      events: [],
    };
    const result = validateWorldState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'relationships[0].from' && e.message.includes('不存在'))).toBe(true);
    expect(result.errors.some(e => e.path === 'relationships[0].to' && e.message.includes('不存在'))).toBe(true);
  });
});
