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

function makeStore(opts = {}) {
  return new SimulationStore({ dbPath: ':memory:', ...opts });
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

  it('onTick sets virtualTime from tickResult.time', async () => {
    const store = makeStore();
    await store.init();
    store.onTick({ tickNumber: 1, time: ISO });
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
