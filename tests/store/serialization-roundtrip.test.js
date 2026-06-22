/**
 * Serialization Roundtrip Tests (Stage 11)
 *
 * Verify:
 *   - Seeded engine serialize → restore → same continuation (deterministic restore)
 *   - Facts/knowledge serialize → restore → grounded narrative works after restore
 *   - Store create/write/read/close smoke
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { Serialization, ENVELOPE_VERSION } from '../../src/store/index.js';
import { SQLiteStore } from '../../src/store/SQLiteStore.js';

function canUseSQLiteStore() {
  try {
    const store = new SQLiteStore(':memory:');
    store.close();
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════

function createSeededEngine(seed, opts = {}) {
  const engine = new AndyEngine({
    seed,
    startTime: new Date('2026-09-01T08:00:00Z'),
    weather: 'sunny',
    enableFacts: opts.enableFacts ?? false,
  });

  engine.createCharacter({
    id: 'maya',
    name: 'Maya',
    mbti: 'INFP',
    background: ['安静的图书馆管理员', '喜欢看星星'],
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

// ═══════════════════════════════════════════
// Seeded engine serialize → restore → same continuation
// ═══════════════════════════════════════════

describe('Seeded engine deterministic restore', () => {
  it('serialize → restore → tick produces same B trajectory as continuous run', () => {
    const engine1 = createSeededEngine('roundtrip_test_1');
    const engine2 = createSeededEngine('roundtrip_test_1');

    // Run engine1 for 10 ticks (baseline)
    for (let i = 0; i < 10; i++) engine1.tick();

    // Run engine2 for 5 ticks, serialize, restore, then run 5 more
    for (let i = 0; i < 5; i++) engine2.tick();

    // Serialize at tick 5
    const envelope = Serialization.serialize(engine2.world);
    const snapshot = Serialization.deserialize(envelope);

    // Restore
    const restored = new AndyEngine({ seed: 'roundtrip_test_1' }, snapshot);

    // Run restored for 5 more ticks
    for (let i = 0; i < 5; i++) restored.tick();

    // Compare B trajectories at tick 10
    const maya1 = engine1.getAgent('maya');
    const maya2 = restored.getAgent('maya');
    const alice1 = engine1.getAgent('alice');
    const alice2 = restored.getAgent('alice');

    for (let d = 0; d < 4; d++) {
      expect(maya1.behaviorField.B[d]).toBeCloseTo(maya2.behaviorField.B[d], 10);
      expect(alice1.behaviorField.B[d]).toBeCloseTo(alice2.behaviorField.B[d], 10);
    }
  });

  it('RNG state is preserved through serialize → restore', () => {
    const engine = createSeededEngine('rng_roundtrip');
    for (let i = 0; i < 5; i++) engine.tick();

    // Capture RNG state before serialize
    const rngStateBefore = engine.rng.getState();

    // Serialize
    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);

    // Verify rngState is in the snapshot
    expect(snapshot.rngState).toBeDefined();
    expect(snapshot.rngState).toBe(rngStateBefore);

    // Restore
    const restored = new AndyEngine({ seed: 'rng_roundtrip' }, snapshot);
    expect(restored.rng.getState()).toBe(rngStateBefore);
  });

  it('tickCount is preserved through serialize → restore', () => {
    const engine = createSeededEngine('tickcount_roundtrip');
    for (let i = 0; i < 7; i++) engine.tick();

    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);

    const restored = new AndyEngine({ seed: 'tickcount_roundtrip' }, snapshot);
    expect(restored.world.tickCount).toBe(7);

    // Continuing ticks should start from 7
    restored.tick();
    expect(restored.world.tickCount).toBe(8);
  });

  it('schedule state is preserved through serialize → restore', () => {
    const engine = createSeededEngine('schedule_roundtrip');
    for (let i = 0; i < 10; i++) engine.tick();

    const maya = engine.getAgent('maya');
    const scheduleJSON = maya.schedule.toJSON();

    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);
    const restored = new AndyEngine({ seed: 'schedule_roundtrip' }, snapshot);

    const restoredMaya = restored.getAgent('maya');
    const restoredSchedule = restoredMaya.schedule.toJSON();

    // Schedule variations should be preserved
    expect(restoredSchedule._todayVariations).toEqual(scheduleJSON._todayVariations);
    expect(restoredSchedule._lastVariationDate).toBe(scheduleJSON._lastVariationDate);
  });

  it('emotion state is preserved through serialize → restore', () => {
    const engine = createSeededEngine('emotion_roundtrip');
    for (let i = 0; i < 10; i++) engine.tick();

    const maya = engine.getAgent('maya');
    const emotionJSON = maya.emotion.toJSON();

    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);
    const restored = new AndyEngine({ seed: 'emotion_roundtrip' }, snapshot);

    const restoredMaya = restored.getAgent('maya');
    const restoredEmotion = restoredMaya.emotion.toJSON();

    // Emotion current values should be preserved
    for (const dim of Object.keys(emotionJSON.current)) {
      expect(restoredEmotion.current[dim]).toBeCloseTo(emotionJSON.current[dim], 10);
    }
  });

  it('needs state is preserved through serialize → restore', () => {
    const engine = createSeededEngine('needs_roundtrip');
    for (let i = 0; i < 10; i++) engine.tick();

    const maya = engine.getAgent('maya');
    const needsJSON = maya.needs.toJSON();

    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);
    const restored = new AndyEngine({ seed: 'needs_roundtrip' }, snapshot);

    const restoredMaya = restored.getAgent('maya');
    const restoredNeeds = restoredMaya.needs.toJSON();

    // Needs values should be preserved
    for (const key of Object.keys(needsJSON.needs)) {
      expect(restoredNeeds.needs[key]).toBeCloseTo(needsJSON.needs[key], 10);
    }
  });

  it('memory is preserved through serialize → restore', () => {
    const engine = createSeededEngine('memory_roundtrip');
    for (let i = 0; i < 10; i++) engine.tick();

    const maya = engine.getAgent('maya');
    const memoryJSON = maya.memory.toJSON();

    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);
    const restored = new AndyEngine({ seed: 'memory_roundtrip' }, snapshot);

    const restoredMaya = restored.getAgent('maya');
    const restoredMemory = restoredMaya.memory.toJSON();

    // Memory count should be preserved
    const originalCount = Array.isArray(memoryJSON) ? memoryJSON.length : (memoryJSON.memories || []).length;
    const restoredCount = Array.isArray(restoredMemory) ? restoredMemory.length : (restoredMemory.memories || []).length;
    expect(restoredCount).toBe(originalCount);
  });
});

// ═══════════════════════════════════════════
// Facts/knowledge serialize → restore → grounded narrative
// ═══════════════════════════════════════════

describe('Facts/knowledge serialize → restore → grounded narrative', () => {
  it('factStore is preserved through serialize → restore', () => {
    const engine = createSeededEngine('facts_roundtrip', { enableFacts: true });
    for (let i = 0; i < 5; i++) engine.tick();

    // Facts should have been generated
    const factStats = engine.world.factStore.getStats();
    expect(factStats.total).toBeGreaterThan(0);

    // Serialize
    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);

    // Verify factStore is in the snapshot
    expect(snapshot.factStore).toBeDefined();

    // Restore
    const restored = new AndyEngine(
      { seed: 'facts_roundtrip', enableFacts: true },
      snapshot
    );

    // FactStore should be restored
    expect(restored.world.factStore).toBeDefined();
    const restoredStats = restored.world.factStore.getStats();
    expect(restoredStats.total).toBe(factStats.total);
  });

  it('knowledgeStore is preserved through serialize → restore', () => {
    const engine = createSeededEngine('knowledge_roundtrip', { enableFacts: true });
    for (let i = 0; i < 5; i++) engine.tick();

    // Knowledge should exist
    expect(engine.world.knowledgeStore).toBeDefined();

    // Serialize
    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);

    // Verify knowledgeStore is in the snapshot
    expect(snapshot.knowledgeStore).toBeDefined();

    // Restore
    const restored = new AndyEngine(
      { seed: 'knowledge_roundtrip', enableFacts: true },
      snapshot
    );

    // KnowledgeStore should be restored
    expect(restored.world.knowledgeStore).toBeDefined();
  });

  it('getGroundingPackage works after restore', () => {
    const engine = createSeededEngine('grounding_roundtrip', { enableFacts: true });
    for (let i = 0; i < 5; i++) engine.tick();

    // Get grounding before serialize
    const groundingBefore = engine.getGroundingPackage('maya');
    expect(groundingBefore).not.toBeNull();
    expect(groundingBefore.allowedFacts).toBeDefined();

    // Serialize → restore
    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);
    const restored = new AndyEngine(
      { seed: 'grounding_roundtrip', enableFacts: true },
      snapshot
    );

    // Get grounding after restore
    const groundingAfter = restored.getGroundingPackage('maya');
    expect(groundingAfter).not.toBeNull();
    expect(groundingAfter.allowedFacts).toBeDefined();

    // Same number of allowed facts
    expect(groundingAfter.allowedFacts.length).toBe(groundingBefore.allowedFacts.length);
  });

  it('checkConsistency works after restore', () => {
    const engine = createSeededEngine('consistency_roundtrip', { enableFacts: true });
    for (let i = 0; i < 5; i++) engine.tick();

    // Serialize → restore
    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);
    const restored = new AndyEngine(
      { seed: 'consistency_roundtrip', enableFacts: true },
      snapshot
    );

    // checkConsistency should work
    const result = restored.checkConsistency('我在图书馆看书', 'maya');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('severity');
  });

  it('tick works after fact/knowledge restore', () => {
    const engine = createSeededEngine('tick_after_restore', { enableFacts: true });
    for (let i = 0; i < 5; i++) engine.tick();

    // Serialize → restore
    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);
    const restored = new AndyEngine(
      { seed: 'tick_after_restore', enableFacts: true },
      snapshot
    );

    // Should be able to continue ticking without errors
    expect(() => {
      for (let i = 0; i < 5; i++) restored.tick();
    }).not.toThrow();

    // Facts should continue to be generated
    const stats = restored.world.factStore.getStats();
    expect(stats.total).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// Store create/write/read/close smoke
// ═══════════════════════════════════════════

const sqliteDescribe = canUseSQLiteStore() ? describe : describe.skip;

sqliteDescribe('SQLiteStore create/write/read/close smoke', () => {
  it('createMemoryStore creates a working store', () => {
    const store = new SQLiteStore(':memory:');
    expect(store).toBeDefined();
    store.close();
  });

  it('saveSnapshot and loadLatest roundtrip', () => {
    const store = new SQLiteStore(':memory:');
    const data = Buffer.from(JSON.stringify({ test: 'hello' }));

    store.saveSnapshot(1, Date.now(), data, { tag: 'test' });
    const loaded = store.loadLatest();

    expect(loaded).not.toBeNull();
    expect(loaded.tick).toBe(1);
    expect(loaded.data).toEqual(data);
    expect(loaded.meta).toEqual({ tag: 'test' });

    store.close();
  });

  it('saveSnapshot and loadAt roundtrip', () => {
    const store = new SQLiteStore(':memory:');
    const data1 = Buffer.from(JSON.stringify({ tick: 1 }));
    const data2 = Buffer.from(JSON.stringify({ tick: 2 }));

    store.saveSnapshot(1, Date.now(), data1);
    store.saveSnapshot(2, Date.now(), data2);

    const loaded1 = store.loadAt(1);
    const loaded2 = store.loadAt(2);

    expect(loaded1.tick).toBe(1);
    expect(loaded2.tick).toBe(2);

    store.close();
  });

  it('loadLatest returns null when empty', () => {
    const store = new SQLiteStore(':memory:');
    expect(store.loadLatest()).toBeNull();
    store.close();
  });

  it('loadAt returns null for missing tick', () => {
    const store = new SQLiteStore(':memory:');
    expect(store.loadAt(999)).toBeNull();
    store.close();
  });

  it('list returns snapshot metadata', () => {
    const store = new SQLiteStore(':memory:');
    const data = Buffer.from('test');

    store.saveSnapshot(1, Date.now(), data);
    store.saveSnapshot(2, Date.now(), data);
    store.saveSnapshot(3, Date.now(), data);

    const list = store.list();
    expect(list.length).toBe(3);
    expect(list[0].tick).toBe(3); // ordered by tick DESC
    expect(list[0].dataSize).toBe(data.length);

    store.close();
  });

  it('prune removes old snapshots', () => {
    const store = new SQLiteStore(':memory:');
    const data = Buffer.from('test');

    for (let i = 1; i <= 10; i++) {
      store.saveSnapshot(i, Date.now(), data);
    }

    const removed = store.prune(3);
    expect(removed).toBeGreaterThan(0);

    const list = store.list(20);
    expect(list.length).toBeLessThanOrEqual(4); // keepCount boundary + 1

    store.close();
  });

  it('meta get/set roundtrip', () => {
    const store = new SQLiteStore(':memory:');

    store.set('tick_count', '42');
    expect(store.get('tick_count')).toBe('42');
    expect(store.get('nonexistent')).toBeNull();

    store.close();
  });

  it('meta setMany/getAll', () => {
    const store = new SQLiteStore(':memory:');

    store.setMany({ key1: 'val1', key2: 'val2' });
    const all = store.getAll();

    expect(all.key1).toBe('val1');
    expect(all.key2).toBe('val2');

    store.close();
  });

  it('meta delete', () => {
    const store = new SQLiteStore(':memory:');

    store.set('to_delete', 'value');
    expect(store.get('to_delete')).toBe('value');

    store.delete('to_delete');
    expect(store.get('to_delete')).toBeNull();

    store.close();
  });

  it('stories saveStories/getRecent roundtrip', () => {
    const store = new SQLiteStore(':memory:');

    const count = store.saveStories([
      { tick: 1, timestamp: Date.now(), agentId: 'maya', content: 'Maya went to the library', importance: 0.8 },
      { tick: 2, timestamp: Date.now(), agentId: 'maya', content: 'Maya read a book', importance: 0.6 },
    ]);

    expect(count).toBe(2);

    const recent = store.getRecent('maya', 24, 5);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe('Maya went to the library'); // higher importance first

    store.close();
  });

  it('stories stats', () => {
    const store = new SQLiteStore(':memory:');

    store.saveStories([
      { tick: 1, timestamp: Date.now(), agentId: 'maya', content: 'story 1', importance: 0.5 },
      { tick: 2, timestamp: Date.now(), agentId: 'maya', content: 'story 2', importance: 0.5 },
    ]);

    const stats = store.stats('maya');
    expect(stats.total).toBe(2);

    store.close();
  });

  it('close is safe to call multiple times', () => {
    const store = new SQLiteStore(':memory:');
    store.close();
    expect(() => store.close()).not.toThrow();
  });
});
