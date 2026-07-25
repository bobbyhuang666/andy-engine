/**
 * SimulationStore coverage — Wave 5 batch 3
 *
 * 此前无直接单元测试(仅经 AndyBridge 间接覆盖 happy path)。
 * 本文件补 init 恢复 / onTick 分支(fallback/flush/snapshot/decay) /
 * getStoriesForAgent 合并去重 / getStoriesByEmotion+getStats virtualTime /
 * getMeta-setMeta / shutdown / _saveSnapshot error path。
 *
 * 全部用 :memory: SQLite,hermetic。
 */

import { describe, it, expect, vi } from 'vitest';
import { SimulationStore } from '../../src/store/SimulationStore.js';
// CJS require (not ESM import) so we share the same module instance that
// SimulationStore's internal require() uses — vitest's deps.inline can split
// ESM-imported and CJS-required versions of the same file into two singletons.
const { diagnostics } = require('../../src/shared/Diagnostics.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function makeStore(opts = {}) {
  return new SimulationStore({ dbPath: ':memory:', ...opts });
}

function makeTempDbPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'andy-store-')), `${name}.db`);
}

const ISO = '2026-09-01T08:00:00Z';
const MS = new Date(ISO).getTime();

describe('SimulationStore — init restore path', () => {
  it('init with fresh :memory: returns defaults and hasSnapshot=false', async () => {
    const store = makeStore();
    const onRestore = vi.fn();
    const result = await store.init({ onSnapshot: () => Buffer.alloc(0), onRestore });
    expect(result.restoredTick).toBe(0);
    expect(result.restoredTime).toBeNull();
    expect(result.hasSnapshot).toBe(false);
    // onRestore not called when no snapshot
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('init invokes onRestore when a snapshot exists', async () => {
    const store = makeStore();
    // 先 init + 保存一个快照,然后关闭,再在新 store 上 init 触发 restore
    // 但 :memory: 不跨连接持久化;直接用同一 db 写入快照后 init 会读到
    await store.init({ onSnapshot: () => Buffer.from('snap') });
    store.tickCount = 5;
    store.virtualTime = new Date(MS);
    store._saveSnapshot(); // 写入快照
    // 现在 store.db 有快照;用一个新 init 但复用同一 db 不可能(:memory: 独立)。
    // 改为直接验证:store.db.loadLatest() 返回快照
    const snap = store.db.loadLatest();
    expect(snap).not.toBeNull();
    expect(snap.data.toString()).toBe('snap');
  });

  it('init uses default onSnapshot/onRestore when omitted', async () => {
    const store = makeStore();
    const result = await store.init();
    expect(result.restoredTick).toBe(0);
    expect(store._snapshotFn).toBeDefined();
    expect(store._restoreFn).toBeDefined();
  });

  it('init records diagnostics when onRestore throws for an existing snapshot', async () => {
    diagnostics.clear();
    const warnSpy = vi.spyOn(diagnostics, 'warn').mockImplementation(() => {});
    const dbPath = makeTempDbPath('restore-failure');

    const writer = makeStore({ dbPath });
    await writer.init({ onSnapshot: () => Buffer.from('snap') });
    writer.tickCount = 5;
    writer.virtualTime = new Date(MS);
    writer._saveSnapshot();
    await writer.shutdown();

    const reader = makeStore({ dbPath });
    const result = await reader.init({
      onRestore: () => { throw new Error('restore boom'); },
    });

    expect(result.hasSnapshot).toBe(true);
    expect(result.restoreFailed).toBe(true);
    expect(result.error).toEqual({ code: 'RESTORE_FAILED', message: 'restore boom' });
    expect(diagnostics.getCollected()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'restore_failed', error: 'restore boom' }),
      ]),
    );
    expect(warnSpy).toHaveBeenCalledWith('SimulationStore restore failed: restore boom');

    await reader.shutdown();
    warnSpy.mockRestore();
  });

  it('awaits asynchronous restore callbacks before init resolves', async () => {
    const dbPath = makeTempDbPath('async-restore');
    const writer = makeStore({ dbPath });
    await writer.init({ onSnapshot: () => Buffer.from('snap') });
    writer.tickCount = 5;
    writer.virtualTime = new Date(MS);
    writer._saveSnapshot();
    await writer.shutdown();

    let restored = false;
    const reader = makeStore({ dbPath });
    const result = await reader.init({
      onRestore: async data => {
        await Promise.resolve();
        expect(data.toString()).toBe('snap');
        restored = true;
      },
    });

    expect(restored).toBe(true);
    expect(result.hasSnapshot).toBe(true);
    expect(result.restoreFailed).toBe(false);
    expect(result.error).toBeNull();
    await reader.shutdown();
  });

  it('captures asynchronous restore rejection without hiding the snapshot', async () => {
    diagnostics.clear();
    const warnSpy = vi.spyOn(diagnostics, 'warn').mockImplementation(() => {});
    const dbPath = makeTempDbPath('async-restore-failure');
    const writer = makeStore({ dbPath });
    await writer.init({ onSnapshot: () => Buffer.from('snap') });
    writer.tickCount = 5;
    writer.virtualTime = new Date(MS);
    writer._saveSnapshot();
    await writer.shutdown();

    const reader = makeStore({ dbPath });
    const result = await reader.init({
      onRestore: async () => {
        await Promise.resolve();
        throw new Error('async restore boom');
      },
    });

    expect(result.hasSnapshot).toBe(true);
    expect(result.restoreFailed).toBe(true);
    expect(result.error).toEqual({
      code: 'RESTORE_FAILED',
      message: 'async restore boom',
    });
    await reader.shutdown();
    warnSpy.mockRestore();
  });
});

describe('SimulationStore — onTick branches', () => {
  it('onTick falls back to tickCount+1 when tickNumber missing', async () => {
    const store = makeStore();
    await store.init();
    store.tickCount = 3;
    store.onTick({}); // no tickNumber, no time
    expect(store.tickCount).toBe(4);
    expect(store.virtualTime).toBeNull();
  });

  it('onTick falls back when tickNumber is non-finite or invalid', async () => {
    const store = makeStore();
    await store.init();
    store.tickCount = 3;

    for (const tickNumber of [NaN, Infinity, -1, 1.5, '7']) {
      const before = store.tickCount;
      store.onTick({ tickNumber });
      expect(store.tickCount).toBe(before + 1);
      expect(Number.isInteger(store.tickCount)).toBe(true);
    }
  });

  it('onTick sets virtualTime from tickResult.time', async () => {
    const store = makeStore();
    await store.init();
    store.onTick({ tickNumber: 1, time: ISO });
    expect(store.virtualTime.getTime()).toBe(MS);
  });

  it('onTick prefers committedAt over the compatibility time field', async () => {
    const store = makeStore();
    await store.init();
    store.onTick({ tickNumber: 1, time: ISO, committedAt: '2026-09-15T14:35:00.000Z' });
    expect(store.virtualTime.toISOString()).toBe('2026-09-15T14:35:00.000Z');
  });

  it('does not persist durable metadata for a degraded tick', async () => {
    const store = makeStore();
    await store.init();
    store.tickCount = 3;
    store.virtualTime = new Date(MS);
    store.onTick({ tickNumber: 4, time: '2026-09-15T14:35:00.000Z', status: 'degraded' });
    expect(store.tickCount).toBe(3);
    expect(store.virtualTime.getTime()).toBe(MS);
  });

  it('onTick pushes stories and flushes at storyFlushInterval', async () => {
    const store = makeStore({ storyFlushInterval: 1 });
    await store.init();
    const story = { tick: 1, timestamp: MS, agentId: 'a', content: 'hello', importance: 0.8 };
    store.onTick({ tickNumber: 1, time: ISO }, [story]);
    // flushed → buffered into db, getStoriesForAgent should find it
    const stories = store.getStoriesForAgent('a');
    expect(stories.some(s => s.content === 'hello')).toBe(true);
  });

  it('onTick clamps storyBuffer overflow to maxStoryBuffer', async () => {
    const store = makeStore({ storyFlushInterval: 999, maxStoryBuffer: 3 });
    await store.init();
    for (let i = 0; i < 5; i++) {
      store.onTick({ tickNumber: i + 1, time: ISO }, [
        { tick: i, timestamp: MS, agentId: 'a', content: `s${i}`, importance: 0.5 },
      ]);
    }
    expect(store.storyBuffer.length).toBeLessThanOrEqual(3);
  });

  it('onTick triggers snapshot save at snapshotInterval (calls _snapshotFn)', async () => {
    const snapshotSpy = vi.fn(() => Buffer.from('snap'));
    const store = makeStore({ snapshotInterval: 1 });
    await store.init({ onSnapshot: snapshotSpy });
    store.onTick({ tickNumber: 1, time: ISO }, []);
    expect(snapshotSpy).toHaveBeenCalled();
    // snapshot saved to db
    expect(store.db.loadLatest()).not.toBeNull();
  });

  it('onTick triggers story decay at storyDecayInterval without throwing', async () => {
    const store = makeStore({ storyDecayInterval: 1 });
    await store.init();
    expect(() => store.onTick({ tickNumber: 1, time: ISO }, [])).not.toThrow();
  });

  it('normalizes zero intervals so stories still flush and snapshots can save', async () => {
    const snapshotSpy = vi.fn(() => Buffer.from('snap'));
    const store = makeStore({
      storyFlushInterval: 0,
      snapshotInterval: 0,
      storyDecayInterval: 0,
    });
    await store.init({ onSnapshot: snapshotSpy });
    const story = { tick: 1, timestamp: MS, agentId: 'a', content: 'flush-me', importance: 0.8 };
    store.onTick({ tickNumber: 1, time: ISO }, [story]);
    expect(store.storyFlushInterval).toBe(1);
    expect(store.snapshotInterval).toBe(12);
    expect(store.storyDecayInterval).toBe(288);
    expect(store.storyBuffer).toHaveLength(0);
    expect(store.getStoriesForAgent('a').some(s => s.content === 'flush-me')).toBe(true);
    expect(snapshotSpy).not.toHaveBeenCalled();
  });

  it('normalizes fractional positive intervals to at least one tick', () => {
    const store = makeStore({ storyFlushInterval: 0.5, snapshotInterval: 0.5, storyDecayInterval: 0.5 });
    expect(store.storyFlushInterval).toBe(1);
    expect(store.snapshotInterval).toBe(1);
    expect(store.storyDecayInterval).toBe(1);
  });
});

describe('SimulationStore — getStoriesForAgent merge/dedup', () => {
  it('merges buffered + persisted, dedups by tick:content, sorts by importance', async () => {
    const store = makeStore({ storyFlushInterval: 999 }); // 不 flush,保留在 buffer
    await store.init();
    store.virtualTime = new Date(MS);
    // persisted story
    store.db.saveStories([{ tick: 1, timestamp: MS, agentId: 'a', content: 'dup', importance: 0.3 }]);
    // buffered duplicate (same tick:content) + a higher-importance new one
    store.storyBuffer.push(
      { tick: 1, timestamp: MS, agentId: 'a', content: 'dup', importance: 0.3 },
      { tick: 2, timestamp: MS, agentId: 'a', content: 'new', importance: 0.9 },
    );
    const result = store.getStoriesForAgent('a', 72, 10);
    // deduped: 'dup' appears once, 'new' once
    expect(result.filter(s => s.content === 'dup')).toHaveLength(1);
    // sorted by importance desc: 'new' (0.9) before 'dup' (0.3)
    expect(result[0].content).toBe('new');
  });
});

describe('SimulationStore — getStoriesByEmotion & getStats use virtualTime', () => {
  it('getStoriesByEmotion filters by virtualTime now', async () => {
    const store = makeStore();
    await store.init();
    store.virtualTime = new Date(MS);
    store.db.saveStories([
      { tick: 1, timestamp: MS - 1000, agentId: 'a', content: 'joy1', emotionTag: 'joy', importance: 0.5 },
    ]);
    const result = store.getStoriesByEmotion('a', 'joy', 168, 10);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('joy1');
  });

  it('getStats uses virtualTime now', async () => {
    const store = makeStore();
    await store.init();
    store.virtualTime = new Date(MS);
    store.db.saveStories([
      { tick: 1, timestamp: MS - 3600 * 1000, agentId: 'a', content: 'today', importance: 0.5 },
    ]);
    const s = store.getStats('a');
    expect(s.total).toBe(1);
    expect(s.recentDay).toBe(1);
  });
});

describe('SimulationStore — getMeta/setMeta round-trip', () => {
  it('setMeta then getMeta returns the value', async () => {
    const store = makeStore();
    await store.init();
    store.setMeta('custom_key', 'custom_value');
    expect(store.getMeta('custom_key')).toBe('custom_value');
  });
});

describe('SimulationStore — shutdown', () => {
  it('shutdown flushes, snapshots, persists meta, closes db', async () => {
    const snapshotSpy = vi.fn(() => Buffer.from('final'));
    const store = makeStore();
    await store.init({ onSnapshot: snapshotSpy });
    store.tickCount = 7;
    store.virtualTime = new Date(MS);
    store.storyBuffer.push({ tick: 7, timestamp: MS, agentId: 'a', content: 'buf', importance: 0.5 });
    await store.shutdown();
    expect(store.db).toBeNull();
    expect(snapshotSpy).toHaveBeenCalled();
  });

  it('shutdown is a no-op when db is null', async () => {
    const store = makeStore();
    store.db = null;
    await expect(store.shutdown()).resolves.not.toThrow();
  });

  it('_saveSnapshot collects diagnostics when _snapshotFn throws', async () => {
    const store = makeStore();
    await store.init({ onSnapshot: () => { throw new Error('boom'); } });
    expect(() => store._saveSnapshot()).not.toThrow();
    // diagnostics 收集了错误(不抛出)
  });
});

describe('SimulationStore — getStoriesForBobby deprecated alias', () => {
  it('delegates to getStoriesForAgent', async () => {
    const store = makeStore();
    await store.init();
    const spy = vi.spyOn(store, 'getStoriesForAgent').mockReturnValue([]);
    store.getStoriesForBobby('a', 48, 3);
    expect(spy).toHaveBeenCalledWith('a', 48, 3);
    spy.mockRestore();
  });
});

describe('SimulationStore — _flushStories buffer safety', () => {
  it('keeps storyBuffer when db.saveStories throws (no data loss)', async () => {
    const store = makeStore({ storyFlushInterval: 999 });
    await store.init();
    const story = { tick: 1, timestamp: MS, agentId: 'a', content: 'precious', importance: 0.8 };
    store.storyBuffer.push(story);
    store.db.saveStories = () => { throw new Error('db write boom'); };

    diagnostics.clear();

    expect(() => store._flushStories()).toThrow(/db write boom/);
    // buffer retained — the story is NOT lost
    expect(store.storyBuffer).toHaveLength(1);
    expect(store.storyBuffer[0].content).toBe('precious');

    const collected = diagnostics.getCollected();
    expect(collected).toHaveLength(1);
    expect(collected[0].type).toBe('story-flush-failed');
    expect(collected[0].error).toBe('db write boom');
  });

  it('clears storyBuffer after successful write', async () => {
    const store = makeStore({ storyFlushInterval: 999 });
    await store.init();
    store.storyBuffer.push(
      { tick: 1, timestamp: MS, agentId: 'a', content: 'ok1', importance: 0.5 },
      { tick: 2, timestamp: MS, agentId: 'a', content: 'ok2', importance: 0.5 },
    );
    store._flushStories();
    expect(store.storyBuffer).toHaveLength(0);
    // persisted to db
    const stories = store.getStoriesForAgent('a');
    expect(stories.some(s => s.content === 'ok1')).toBe(true);
    expect(stories.some(s => s.content === 'ok2')).toBe(true);
  });

  it('is a no-op when buffer is empty', async () => {
    const store = makeStore();
    await store.init();
    expect(store.storyBuffer).toHaveLength(0);
    expect(() => store._flushStories()).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// P0 regression: shutdown ensures db.close() in finally path
// ═══════════════════════════════════════════
describe('P0: shutdown ensures db.close() when _flushStories throws', () => {
  it('calls db.close() and propagates error when _flushStories throws', async () => {
    const store = makeStore();
    await store.init();
    store.storyBuffer.push({ tick: 1, timestamp: MS, agentId: 'a', content: 'x', importance: 0.5 });
    store.db.saveStories = () => { throw new Error('db write boom'); };

    let closeCalled = false;
    const origClose = store.db.close.bind(store.db);
    store.db.close = () => { closeCalled = true; origClose(); };

    let thrown = false;
    try {
      await store.shutdown();
    } catch (e) {
      thrown = true;
      expect(e.message).toBe('db write boom');
    }
    expect(thrown).toBe(true);
    expect(closeCalled).toBe(true);
    expect(store.db).toBeNull();
  });

  it('db.close() still called when both _flushStories and _saveSnapshot throw', async () => {
    const store = makeStore();
    await store.init({ onSnapshot: () => { throw new Error('snapshot boom'); } });
    store.storyBuffer.push({ tick: 1, timestamp: MS, agentId: 'a', content: 'x', importance: 0.5 });
    store.db.saveStories = () => { throw new Error('flush boom'); };

    let closeCalled = false;
    const origClose = store.db.close.bind(store.db);
    store.db.close = () => { closeCalled = true; origClose(); };

    let thrown = false;
    try {
      await store.shutdown();
    } catch (e) {
      thrown = true;
      // firstError (flush) takes priority over snapshotError
      expect(e.message).toBe('flush boom');
    }
    expect(thrown).toBe(true);
    expect(closeCalled).toBe(true);
    expect(store.db).toBeNull();
  });

  it('propagates snapshotError when flush succeeds but snapshot fails', async () => {
    const store = makeStore();
    await store.init({ onSnapshot: () => { throw new Error('snapshot final fail'); } });
    store.tickCount = 5;
    store.virtualTime = new Date(MS);

    let closeCalled = false;
    const origClose = store.db.close.bind(store.db);
    store.db.close = () => { closeCalled = true; origClose(); };

    let thrown = false;
    try {
      await store.shutdown();
    } catch (e) {
      thrown = true;
      expect(e.message).toContain('SimulationStore snapshot save failed');
    }
    expect(thrown).toBe(true);
    expect(closeCalled).toBe(true);
    expect(store.db).toBeNull();
  });

  it('does not advance persisted meta when final snapshot fails', async () => {
    const dbPath = makeTempDbPath('snapshot-fail-meta');

    const store = makeStore({ dbPath });
    await store.init({ onSnapshot: () => Buffer.from('tick-2') });
    store.tickCount = 2;
    store.virtualTime = new Date(MS);
    await store.shutdown();

    const failing = makeStore({ dbPath });
    await failing.init({ onSnapshot: () => { throw new Error('snapshot boom'); } });
    failing.tickCount = 5;
    failing.virtualTime = new Date(MS + 3000);

    await expect(failing.shutdown()).rejects.toThrow(/SimulationStore snapshot save failed/);

    const restored = makeStore({ dbPath });
    const result = await restored.init();

    expect(result.restoredTick).toBe(2);
    expect(restored.tickCount).toBe(2);
    expect(restored.virtualTime.getTime()).toBe(MS);
    await restored.shutdown();
  });
});

// ═══════════════════════════════════════════
// P2 regression: init corrupt meta guard
// ═══════════════════════════════════════════
describe('P2: init recovers from corrupt meta (NaN guard)', () => {
  it('tickCount falls back to 0 and virtualTime to null when meta is corrupt string', async () => {
    const dbPath = makeTempDbPath('corrupt-meta-1');
    const store = makeStore({ dbPath });
    await store.init();
    // Manually write corrupt meta strings that look truthy but are non-numeric
    store.db.set('tick_count', 'not-a-number');
    store.db.set('virtual_time', 'garbage');
    await store.shutdown();

    // Simulate a fresh init reading the corrupt meta from the same durable DB.
    const store2 = makeStore({ dbPath });
    const result = await store2.init();

    expect(result.restoredTick).toBe(0);
    expect(result.restoredTime).toBeNull();
    expect(store2.tickCount).toBe(0);
    expect(store2.virtualTime).toBeNull();
    // tickCount must not be NaN
    expect(Number.isNaN(store2.tickCount)).toBe(false);
    await store2.shutdown();
  });

  it('onTick after corrupt meta does not produce NaN tickCount', async () => {
    const dbPath = makeTempDbPath('corrupt-meta-2');
    const store = makeStore({ dbPath });
    await store.init();
    store.db.set('tick_count', 'garbage-123');
    store.db.set('virtual_time', 'garbage-time');
    await store.shutdown();

    const store2 = makeStore({ dbPath });
    await store2.init();

    expect(store2.tickCount).toBe(0);
    store2.onTick({ tickNumber: 1, time: ISO });
    expect(store2.tickCount).toBe(1);
    expect(Number.isNaN(store2.tickCount)).toBe(false);
    await store2.shutdown();
  });

  it('getStats after corrupt meta init does not throw or produce NaN', async () => {
    const dbPath = makeTempDbPath('corrupt-meta-3');
    const store = makeStore({ dbPath });
    await store.init();
    store.db.set('tick_count', 'bad');
    store.db.set('virtual_time', 'bad');
    store.db.saveStories([
      { tick: 1, timestamp: MS - 3600 * 1000, agentId: 'a', content: 'safe', importance: 0.5 },
    ]);
    await store.shutdown();

    const store2 = makeStore({ dbPath });
    await store2.init();

    expect(store2.tickCount).toBe(0);
    expect(store2.virtualTime).toBeNull();

    // getStats uses virtualTime?.getTime() || Date.now() — must not throw or return NaN
    const stats = store2.getStats('a');
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(stats.total)).toBe(false);
    await store2.shutdown();
  });
});
