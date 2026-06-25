/**
 * migration.js v0→v1 branch coverage — Wave 5 batch 3
 *
 * world-tooling.test.js 已覆盖 rich v0 fixture 的 happy path + non-mutating。
 * 本文件补 v0→v1 迁移中所有 fallback/coalesce 分支(缺失字段、非标准类型)。
 *
 * 纯函数:无 DB / 无 engine,全部用 hand-crafted v0 fixture。
 */

import { describe, it, expect } from 'vitest';
import { migrateWorldState } from '../../../src/store/world/migration.js';
import { validateWorldState, CURRENT_SCHEMA_VERSION } from '../../../src/store/world/validator.js';

describe('migrateWorldState — input type guard branches', () => {
  it('returns same ref migrated=false for non-object inputs', () => {
    for (const input of ['string', 42, undefined]) {
      const { state, migrated } = migrateWorldState(input);
      expect(migrated).toBe(false);
      expect(state).toBe(input);
    }
  });
});

describe('migrateV0ToV1 — missing/empty fields fallback', () => {
  it('v0 with no agents/socialGraph/events → empty arrays + empty runtimeSnapshot.agents', () => {
    const { state, migrated } = migrateWorldState({ time: '2026-01-01', tickCount: 5 });
    expect(migrated).toBe(true);
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(state.characters).toEqual([]);
    expect(state.relationships).toEqual([]);
    expect(state.events).toEqual([]);
    expect(state.runtimeSnapshot.agents).toEqual({});
    expect(state.runtimeSnapshot.socialGraph).toEqual([]);
    expect(state.worldClock.tickCount).toBe(5);
  });

  it('v0 with completely empty object uses all defaults', () => {
    const { state, migrated } = migrateWorldState({});
    expect(migrated).toBe(true);
    expect(state.worldClock.tickCount).toBe(0);
    expect(typeof state.worldClock.time).toBe('string'); // Date.now() ISO
    expect(state.runtimeSnapshot.environment).toEqual({
      weather: 'sunny', timeOfDay: 'afternoon', season: 'autumn',
    });
    expect(state.runtimeSnapshot.agents).toEqual({});
    expect(state.runtimeSnapshot.socialGraph).toEqual([]);
    expect(state.worldId).toMatch(/^world_migrated_/);
  });
});

describe('migrateV0ToV1 — character field coalescing', () => {
  it('agent missing name defaults to id; missing position defaults to unknown', () => {
    const { state } = migrateWorldState({
      agents: {
        x: {},              // no name, no position
        y: { name: 'Y' },   // no position
      },
    });
    expect(state.characters).toContainEqual({ id: 'x', name: 'x', position: 'unknown' });
    expect(state.characters).toContainEqual({ id: 'y', name: 'Y', position: 'unknown' });
  });
});

describe('migrateV0ToV1 — socialGraph fallback', () => {
  it('non-array socialGraph → relationships=[]', () => {
    const { state } = migrateWorldState({ socialGraph: 'not-an-array' });
    expect(state.relationships).toEqual([]);
  });

  it('edge missing type/strength defaults to stranger/0', () => {
    const { state } = migrateWorldState({
      socialGraph: [{ agentA: 'a', agentB: 'b' }],
    });
    expect(state.relationships).toEqual([{ from: 'a', to: 'b', type: 'stranger', strength: 0 }]);
  });

  it('edge with non-number strength defaults to 0', () => {
    const { state } = migrateWorldState({
      socialGraph: [{ agentA: 'a', agentB: 'b', type: 'friend', strength: 'high' }],
    });
    expect(state.relationships[0].strength).toBe(0);
  });
});

describe('migrateV0ToV1 — events fallback', () => {
  it('missing/empty events → empty array', () => {
    expect(migrateWorldState({ events: {} }).state.events).toEqual([]);
    expect(migrateWorldState({ events: null }).state.events).toEqual([]);
  });

  it('event missing id generates evt_ prefix; missing type defaults to general; missing content defaults to empty', () => {
    const { state } = migrateWorldState({
      events: { eventLog: [{ type: 'social' }] },
    });
    expect(state.events).toHaveLength(1);
    expect(state.events[0].id).toMatch(/^evt_/);
    expect(state.events[0].type).toBe('social');
    expect(state.events[0].content).toBe('');
  });

  it('event with non-string time is converted to String()', () => {
    const { state } = migrateWorldState({
      events: { eventLog: [{ id: 'e1', time: 12345, type: 'x', content: 'c' }] },
    });
    // envelope-level event: time stays as string per L89 typeof check
    expect(state.events[0].time).toBe('12345');
    // runtimeSnapshot.events preserves time as-is (number) per L99 false branch
    expect(state.runtimeSnapshot.events.eventLog[0].time).toBe(12345);
  });
});

describe('migrateV0ToV1 — version boundary', () => {
  it('unknown numeric/string schemaVersion is pass-through not migrated', () => {
    const future = { schemaVersion: '0.0.9', worldId: 'x' };
    const { state, migrated } = migrateWorldState(future);
    expect(migrated).toBe(false);
    expect(state).toBe(future);
  });

  it('current schemaVersion is pass-through not migrated', () => {
    const current = { schemaVersion: CURRENT_SCHEMA_VERSION, worldId: 'x' };
    const { state, migrated } = migrateWorldState(current);
    expect(migrated).toBe(false);
    expect(state).toBe(current);
  });

  it('migrated output passes validateWorldState', () => {
    const { state } = migrateWorldState({
      time: '2026-01-01T00:00:00Z',
      tickCount: 10,
      agents: {
        a: { name: 'A', position: 'home' },
        b: { name: 'B', position: 'work' },
      },
      socialGraph: [{ agentA: 'a', agentB: 'b', type: 'friend', strength: 0.5 }],
      events: { eventLog: [{ id: 'e1', time: '2026-01-01', type: 'social', content: 'hi' }] },
    });
    const result = validateWorldState(state);
    expect(result.valid).toBe(true);
  });
});
