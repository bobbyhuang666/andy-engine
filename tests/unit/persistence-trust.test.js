/**
 * Persistence Trust — P1 持久化信任基线
 *
 * 锁定 Stable World Envelope 的关键不变量，防止退化：
 *   G1. fromWorldState 不深入解析 runtimeSnapshot，原样转发给 engine ctor (opacity)。
 *   G2. Envelope 在零 tick 下幂等：toWorldState → fromWorldState → toWorldState deep-equal。
 *   G3. 未知未来 schemaVersion 行为锁定（migrateWorldState pass-through + validateWorldState 拒绝）。
 *   G6. schemaVersion / ENVELOPE_VERSION 是冻结常量，防止意外 bump。
 *
 * 护栏：本文件只锁定【当前实际行为】，不改 src/store。若发现 opacity 违规，
 * 据 docs/rfc/PERSISTENCE_OPACITY_RFC.md 处理，不在此处擅自改代码。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { toWorldState, fromWorldState } from '../../src/store/world/WorldStateAdapter.js';
import { validateWorldState, CURRENT_SCHEMA_VERSION } from '../../src/store/world/validator.js';
import { migrateWorldState } from '../../src/store/world/migration.js';
import { ENVELOPE_VERSION } from '../../src/store/Serialization.js';

const START_TIME = new Date('2026-09-01T08:00:00Z');

function buildEngine() {
  const engine = new AndyEngine({ startTime: START_TIME });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  // 跑几 tick 让 events/relationships/runtimeSnapshot 非平凡
  for (let i = 0; i < 10; i++) engine.tick();
  return engine;
}

// ═══════════════════════════════════════════
// G1: fromWorldState opacity forwarding
// ═══════════════════════════════════════════
describe('G1: fromWorldState forwards runtimeSnapshot opaquely', () => {
  it('passes runtimeSnapshot by reference to the engine constructor (no introspection)', () => {
    const engine = buildEngine();
    const state = toWorldState(engine, 'opacity-test');

    // 用 spy 替换 engineConstructor：断言它收到与 state.runtimeSnapshot 同一对象引用
    let received = null;
    const SpyCtor = function (config, savedState) {
      received = savedState;
      return new AndyEngine(config, savedState);
    };

    fromWorldState(state, {}, SpyCtor);
    expect(received).toBe(state.runtimeSnapshot);
  });
});

// ═══════════════════════════════════════════
// G2: idempotent Envelope round-trip (zero intervening ticks)
// ═══════════════════════════════════════════
describe('G2: Envelope is idempotent under restore without ticking', () => {
  it('toWorldState → fromWorldState → toWorldState produces deep-equal envelope', () => {
    const engine = buildEngine();
    const before = toWorldState(engine, 'idempotent-test');

    const restored = fromWorldState(before, {}, AndyEngine);
    const after = toWorldState(restored, 'idempotent-test');

    expect(after).to.deep.equal(before);
  });
});

// ═══════════════════════════════════════════
// G3: unknown future schemaVersion behavior
// ═══════════════════════════════════════════
describe('G3: unknown future schemaVersion is pass-through then rejected by validate', () => {
  it('migrateWorldState passes through unknown version unchanged (migrated=false)', () => {
    const futureState = { schemaVersion: '99.0.0', worldId: 'x', domainRef: 'campus' };
    const { state, migrated } = migrateWorldState(futureState);
    expect(migrated).toBe(false);
    expect(state).toBe(futureState); // same reference, untouched
  });

  it('validateWorldState rejects unknown schemaVersion', () => {
    const futureState = {
      schemaVersion: '99.0.0',
      worldId: 'x',
      domainRef: 'campus',
      worldClock: { time: START_TIME.toISOString(), tickCount: 0 },
      characters: [],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };
    const result = validateWorldState(futureState);
    expect(result.valid).toBe(false);
  });
});

// ═══════════════════════════════════════════
// G6: schema/version frozen constants
// ═══════════════════════════════════════════
describe('G6: persistence version constants are frozen', () => {
  it('CURRENT_SCHEMA_VERSION is pinned to 0.1.0', () => {
    // bump 需配套 migration 测试；此断言防止意外 bump 破坏存档兼容
    expect(CURRENT_SCHEMA_VERSION).toBe('0.1.0');
  });

  it('ENVELOPE_VERSION is pinned to 0.2.0', () => {
    expect(ENVELOPE_VERSION).toBe('0.2.0');
  });
});
