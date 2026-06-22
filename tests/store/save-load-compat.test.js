/**
 * Save/Load Compatibility Tests (beta.2)
 *
 * Verify persistence roundtrip for each world configuration:
 *   1. Minimal world (1 agent, default domain)
 *   2. Campus world (2 agents, campus preset)
 *   3. Tavern world (2 agents, tavern preset)
 *   4. Custom mini-domain world (1 agent, minimal custom domain)
 *   5. World with facts enabled (1 agent, enableFacts: true)
 *   6. World with action selection enabled (1 agent, actionSelection.active)
 *
 * Each test proves:
 *   - load → tick works (no crash)
 *   - snapshot → load → snapshot preserves envelope fields
 *   - unsupported schema version gives clear error
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { Serialization, ENVELOPE_VERSION } from '../../src/store/index.js';
import { toWorldState, fromWorldState } from '../../src/store/world/WorldStateAdapter.js';
import { validateWorldState, CURRENT_SCHEMA_VERSION } from '../../src/store/world/validator.js';
import { migrateWorldState } from '../../src/store/world/migration.js';
import tavernDomain from '../../presets/tavern/index.js';

// ═══════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════

function createMinimalEngine() {
  const engine = new AndyEngine({
    seed: 'compat_minimal',
    startTime: new Date('2026-09-01T08:00:00Z'),
  });
  engine.createCharacter({
    id: 'solo',
    name: 'Solo',
    mbti: 'ISTJ',
    background: ['一个人住在山里'],
    schedule: 'student',
  });
  return engine;
}

function createCampusEngine() {
  const engine = new AndyEngine({
    seed: 'compat_campus',
    startTime: new Date('2026-09-01T08:00:00Z'),
  });
  engine.createCharacter({
    id: 'maya',
    name: 'Maya',
    mbti: 'INFP',
    background: ['安静的图书馆管理员'],
    schedule: 'student',
  });
  engine.createCharacter({
    id: 'alice',
    name: 'Alice',
    mbti: 'ENFP',
    background: ['活泼的社交达人'],
    schedule: 'student',
  });
  return engine;
}

function createTavernEngine() {
  const engine = new AndyEngine({
    seed: 'compat_tavern',
    startTime: new Date('2026-09-01T08:00:00Z'),
    domain: tavernDomain,
  });
  engine.createCharacter({
    id: 'grog',
    name: 'Grog',
    mbti: 'ESTP',
    background: ['矮人铁匠，喜欢喝麦酒'],
    schedule: 'worker',
  });
  engine.createCharacter({
    id: 'elara',
    name: 'Elara',
    mbti: 'INFJ',
    background: ['精灵旅人，路过酒馆'],
    schedule: 'freelancer',
  });
  return engine;
}

function createCustomDomainEngine() {
  const miniDomain = {
    id: 'mini',
    name: 'Mini Domain',
    version: '1.0.0',
    regions: ['hut', 'clearing'],
    adjacency: [['hut', 'clearing', 1]],
    regionCoords: {
      hut: { shape: 'rect', x: 0, y: 0, w: 50, h: 50 },
      clearing: { shape: 'circle', cx: 100, cy: 100, radius: 30 },
    },
    placeTypes: { rest: ['hut'], social: ['clearing'], default: ['clearing'] },
    placeMapping: { defaultRegion: 'hut' },
    states: {
      idle: { next: ['walking', 'talking'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'rest' },
      walking: { next: ['idle', 'talking'], hours: [8,9,10,11,12,13,14,15,16,17,18,19], category: 'active' },
      talking: { next: ['idle', 'walking'], hours: [8,9,10,11,12,13,14,15,16,17,18,19,20,21], category: 'social' },
    },
    stateCenters: {
      idle: [0.1, 0.1, 0.1, 0.1],
      walking: [0.6, 0.3, 0.2, 0.3],
      talking: [0.3, 0.8, 0.4, 0.7],
    },
    statePositions: { idle: 'hut', walking: 'clearing', talking: 'clearing' },
    needSatisfactionMap: {
      hunger: { states: [], regions: [] },
      energy: { states: ['idle'], regions: ['hut'] },
      social: { states: ['talking'], regions: ['clearing'] },
      comfort: { states: ['idle'], regions: ['hut'] },
      stimulation: { states: ['walking'], regions: ['clearing'] },
    },
    roleArchetypes: {
      hermit: {
        blocks: {
          morning: [{ region: 'clearing', duration: 2 }],
          afternoon: [{ region: 'hut', duration: 3 }],
        },
      },
    },
    fallback: { defaultRegion: 'hut', defaultState: 'idle' },
    forbiddenTerms: ['校园', 'campus'],
    weather: { types: ['sunny', 'rainy'] },
    eventTemplates: {},
  };

  const engine = new AndyEngine({
    seed: 'compat_custom',
    startTime: new Date('2026-09-01T08:00:00Z'),
    domain: miniDomain,
  });
  engine.createCharacter({
    id: 'hermit',
    name: 'Hermit',
    mbti: 'ISTP',
    background: ['独居山林的人'],
    schedule: 'hermit',
  });
  return engine;
}

function createFactsEngine() {
  const engine = new AndyEngine({
    seed: 'compat_facts',
    startTime: new Date('2026-09-01T08:00:00Z'),
    enableFacts: true,
  });
  engine.createCharacter({
    id: 'thinker',
    name: 'Thinker',
    mbti: 'INTJ',
    background: ['哲学家，喜欢思考存在主义'],
    schedule: 'student',
  });
  return engine;
}

function createActionSelectionEngine() {
  const engine = new AndyEngine({
    seed: 'compat_action',
    startTime: new Date('2026-09-01T08:00:00Z'),
    actionSelection: { active: true },
  });
  engine.createCharacter({
    id: 'actor',
    name: 'Actor',
    mbti: 'ESFP',
    background: ['热爱表演的人'],
    schedule: 'student',
  });
  return engine;
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function snapshotToEnvelope(engine, worldId) {
  return toWorldState(engine, worldId);
}

function restoreFromEnvelope(envelope, config = {}) {
  return fromWorldState(envelope, config, AndyEngine);
}

function assertEnvelopeFieldsPreserved(before, after) {
  expect(after.schemaVersion).toBe(before.schemaVersion);
  expect(after.worldId).toBe(before.worldId);
  expect(after.domainRef).toBe(before.domainRef);
  expect(after.worldClock.tickCount).toBe(before.worldClock.tickCount);
  expect(after.characters.length).toBe(before.characters.length);
  for (let i = 0; i < before.characters.length; i++) {
    expect(after.characters[i].id).toBe(before.characters[i].id);
    expect(after.characters[i].name).toBe(before.characters[i].name);
  }
  expect(after.relationships.length).toBe(before.relationships.length);
}

// ═══════════════════════════════════════════
// 1. Minimal world (1 agent, default domain)
// ═══════════════════════════════════════════

describe('Fixture 1: Minimal world (1 agent, default domain)', () => {
  it('load → tick works (no crash)', () => {
    const engine = createMinimalEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const envelope = snapshotToEnvelope(engine, 'world_minimal');
    const restored = restoreFromEnvelope(envelope);
    expect(() => restored.tick()).not.toThrow();
  });

  it('snapshot → load → snapshot preserves envelope fields', () => {
    const engine = createMinimalEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const before = snapshotToEnvelope(engine, 'world_minimal');
    const restored = restoreFromEnvelope(before);
    const after = snapshotToEnvelope(restored, 'world_minimal');

    assertEnvelopeFieldsPreserved(before, after);
  });

  it('unsupported schema version gives clear error', () => {
    const engine = createMinimalEngine();
    engine.tick();

    const badState = {
      schemaVersion: '99.0.0',
      worldId: 'world_bad',
      domainRef: 'campus',
      worldClock: { time: '2026-09-01T08:00:00Z', tickCount: 1 },
      characters: [],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };

    const result = validateWorldState(badState);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('99.0.0'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 2. Campus world (2 agents, campus preset)
// ═══════════════════════════════════════════

describe('Fixture 2: Campus world (2 agents, campus preset)', () => {
  it('load → tick works (no crash)', () => {
    const engine = createCampusEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    const envelope = snapshotToEnvelope(engine, 'world_campus');
    const restored = restoreFromEnvelope(envelope);
    expect(() => restored.tick()).not.toThrow();
  });

  it('snapshot → load → snapshot preserves envelope fields', () => {
    const engine = createCampusEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    const before = snapshotToEnvelope(engine, 'world_campus');
    const restored = restoreFromEnvelope(before);
    const after = snapshotToEnvelope(restored, 'world_campus');

    assertEnvelopeFieldsPreserved(before, after);
    expect(after.domainRef).toBe('campus');
  });

  it('unsupported schema version gives clear error', () => {
    const engine = createCampusEngine();
    engine.tick();

    const badState = {
      schemaVersion: '2.0.0',
      worldId: 'world_bad',
      domainRef: 'campus',
      worldClock: { time: '2026-09-01T08:00:00Z', tickCount: 1 },
      characters: [{ id: 'maya', name: 'Maya' }],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };

    const result = validateWorldState(badState);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('2.0.0'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 3. Tavern world (2 agents, tavern preset)
// ═══════════════════════════════════════════

describe('Fixture 3: Tavern world (2 agents, tavern preset)', () => {
  it('load → tick works (no crash)', () => {
    const engine = createTavernEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    const envelope = snapshotToEnvelope(engine, 'world_tavern');
    const restored = restoreFromEnvelope(envelope, { domain: tavernDomain });
    expect(() => restored.tick()).not.toThrow();
  });

  it('snapshot → load → snapshot preserves envelope fields', () => {
    const engine = createTavernEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    const before = snapshotToEnvelope(engine, 'world_tavern');
    const restored = restoreFromEnvelope(before, { domain: tavernDomain });
    const after = snapshotToEnvelope(restored, 'world_tavern');

    assertEnvelopeFieldsPreserved(before, after);
    expect(after.domainRef).toBe('tavern');
  });

  it('unsupported schema version gives clear error', () => {
    const badState = {
      schemaVersion: '0.0.5',
      worldId: 'world_bad',
      domainRef: 'tavern',
      worldClock: { time: '2026-09-01T08:00:00Z', tickCount: 0 },
      characters: [],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };

    const result = validateWorldState(badState);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('0.0.5'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 4. Custom mini-domain world (1 agent, minimal custom domain)
// ═══════════════════════════════════════════

describe('Fixture 4: Custom mini-domain world (1 agent, minimal custom domain)', () => {
  it('load → tick works (no crash)', () => {
    const engine = createCustomDomainEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const rawDomain = engine.domain.domain;
    const envelope = snapshotToEnvelope(engine, 'world_mini');
    const restored = restoreFromEnvelope(envelope, { domain: rawDomain });
    expect(() => restored.tick()).not.toThrow();
  });

  it('snapshot → load → snapshot preserves envelope fields', () => {
    const engine = createCustomDomainEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const rawDomain = engine.domain.domain;
    const before = snapshotToEnvelope(engine, 'world_mini');
    const restored = restoreFromEnvelope(before, { domain: rawDomain });
    const after = snapshotToEnvelope(restored, 'world_mini');

    assertEnvelopeFieldsPreserved(before, after);
    expect(after.domainRef).toBe('mini');
  });

  it('unsupported schema version gives clear error', () => {
    const badState = {
      schemaVersion: '0.0.1',
      worldId: 'world_bad',
      domainRef: 'mini',
      worldClock: { time: '2026-09-01T08:00:00Z', tickCount: 0 },
      characters: [{ id: 'hermit', name: 'Hermit' }],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };

    const result = validateWorldState(badState);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('0.0.1'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 5. World with facts enabled (1 agent, enableFacts: true)
// ═══════════════════════════════════════════

describe('Fixture 5: World with facts enabled (1 agent, enableFacts: true)', () => {
  it('load → tick works (no crash)', () => {
    const engine = createFactsEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const envelope = snapshotToEnvelope(engine, 'world_facts');
    const restored = restoreFromEnvelope(envelope, { enableFacts: true });
    expect(() => restored.tick()).not.toThrow();
  });

  it('snapshot → load → snapshot preserves envelope fields', () => {
    const engine = createFactsEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const before = snapshotToEnvelope(engine, 'world_facts');
    const restored = restoreFromEnvelope(before, { enableFacts: true });
    const after = snapshotToEnvelope(restored, 'world_facts');

    assertEnvelopeFieldsPreserved(before, after);
  });

  it('facts are preserved through roundtrip', () => {
    const engine = createFactsEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    const envelope = snapshotToEnvelope(engine, 'world_facts');
    const restored = restoreFromEnvelope(envelope, { enableFacts: true });

    expect(restored.world.factStore).toBeDefined();
    expect(restored.world.knowledgeStore).toBeDefined();
  });

  it('unsupported schema version gives clear error', () => {
    const badState = {
      schemaVersion: '1.0.0-rc1',
      worldId: 'world_bad',
      domainRef: 'campus',
      worldClock: { time: '2026-09-01T08:00:00Z', tickCount: 0 },
      characters: [],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };

    const result = validateWorldState(badState);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('1.0.0-rc1'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 6. World with action selection enabled
// ═══════════════════════════════════════════

describe('Fixture 6: World with action selection enabled', () => {
  it('load → tick works (no crash)', () => {
    const engine = createActionSelectionEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const envelope = snapshotToEnvelope(engine, 'world_action');
    const restored = restoreFromEnvelope(envelope, { actionSelection: { active: true } });
    expect(() => restored.tick()).not.toThrow();
  });

  it('snapshot → load → snapshot preserves envelope fields', () => {
    const engine = createActionSelectionEngine();
    for (let i = 0; i < 3; i++) engine.tick();

    const before = snapshotToEnvelope(engine, 'world_action');
    const restored = restoreFromEnvelope(before, { actionSelection: { active: true } });
    const after = snapshotToEnvelope(restored, 'world_action');

    assertEnvelopeFieldsPreserved(before, after);
  });

  it('unsupported schema version gives clear error', () => {
    const badState = {
      schemaVersion: '0.1.0-beta',
      worldId: 'world_bad',
      domainRef: 'campus',
      worldClock: { time: '2026-09-01T08:00:00Z', tickCount: 0 },
      characters: [],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };

    const result = validateWorldState(badState);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('0.1.0-beta'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// Migration compatibility
// ═══════════════════════════════════════════

describe('Migration: v0.0.0 → v0.1.0', () => {
  it('migrates legacy snapshot (no schemaVersion) to current envelope', () => {
    const legacyState = {
      time: '2026-09-01T08:00:00Z',
      tickCount: 5,
      environment: { weather: 'sunny', timeOfDay: 'morning', season: 'autumn' },
      agents: {
        maya: { name: 'Maya', position: '图书馆' },
        alice: { name: 'Alice', position: '食堂' },
      },
      socialGraph: [{ agentA: 'maya', agentB: 'alice', type: 'acquaintance', strength: 0.3 }],
      events: { eventLog: [{ id: 'evt_1', time: '2026-09-01T08:00:00Z', type: 'social', content: '打招呼' }] },
    };

    const { state, migrated } = migrateWorldState(legacyState);
    expect(migrated).toBe(true);
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(state.worldId).toMatch(/^world_migrated_/);
    expect(state.domainRef).toBe('campus');
    expect(state.characters.length).toBe(2);
    expect(state.relationships.length).toBe(1);

    const validation = validateWorldState(state);
    expect(validation.valid).toBe(true);
  });

  it('current version passes through without migration', () => {
    const engine = createMinimalEngine();
    engine.tick();
    const envelope = snapshotToEnvelope(engine, 'world_current');

    const { state, migrated } = migrateWorldState(envelope);
    expect(migrated).toBe(false);
    expect(state).toBe(envelope);
  });
});
