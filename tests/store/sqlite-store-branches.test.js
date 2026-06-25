/**
 * SQLiteStore branch coverage — Wave 5 batch 3
 *
 * serialization-roundtrip.test.js 已覆盖 snapshot/meta/story 的 happy path。
 * 本文件补 saveStories 默认值 / getByEmotion / decay / stats(virtualTime) / transaction / prune 边界。
 *
 * 全部用 :memory: SQLite(better-sqlite3 已安装),hermetic。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SQLiteStore } from '../../src/store/SQLiteStore.js';

function makeStore() {
  return new SQLiteStore(':memory:');
}

describe('SQLiteStore — saveStories branches', () => {
  let store;
  beforeEach(() => { store = makeStore(); });

  it('saveStories([]) and saveStories(null) return 0 without writing', () => {
    expect(store.saveStories([])).toBe(0);
    expect(store.saveStories(null)).toBe(0);
    expect(store.getRecent('x')).toEqual([]);
  });

  it('saveStories fills category/emotionTag/importance/source defaults', () => {
    store.saveStories([{ tick: 1, timestamp: Date.now(), agentId: 'a', content: 'c' }]);
    const rows = store.getRecent('a');
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('daily_life');
    expect(rows[0].emotionTag).toBeNull();
    expect(rows[0].importance).toBe(0.5);
    expect(rows[0].source).toBe('simulation');
  });
});

describe('SQLiteStore — getRecent with virtualTime now', () => {
  let store;
  beforeEach(() => { store = makeStore(); });

  it('filters by virtualTime now param (stories older than window excluded)', () => {
    const now = 1000000000000; // fixed virtualTime
    store.saveStories([
      { tick: 1, timestamp: now - 1000, agentId: 'a', content: 'recent', importance: 0.9 },
      { tick: 2, timestamp: now - 200 * 3600 * 1000, agentId: 'a', content: 'old', importance: 0.9 }, // >72h
    ]);
    // now param filters: only 'recent' within 72h
    const rows = store.getRecent('a', 72, 5, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('recent');
  });
});

describe('SQLiteStore — getByEmotion', () => {
  let store;
  beforeEach(() => { store = makeStore(); });

  it('filters by emotionTag + hours + now', () => {
    const now = 1000000000000;
    store.saveStories([
      { tick: 1, timestamp: now - 1000, agentId: 'a', content: 'happy1', emotionTag: 'joy', importance: 0.8 },
      { tick: 2, timestamp: now - 1000, agentId: 'a', content: 'sad1', emotionTag: 'sad', importance: 0.7 },
      { tick: 3, timestamp: now - 200 * 3600 * 1000, agentId: 'a', content: 'happy-old', emotionTag: 'joy', importance: 0.9 }, // >168h
    ]);
    const joy = store.getByEmotion('a', 'joy', 168, 10, now);
    expect(joy).toHaveLength(1);
    expect(joy[0].content).toBe('happy1');
  });

  it('returns [] when no matching emotionTag', () => {
    store.saveStories([{ tick: 1, timestamp: Date.now(), agentId: 'a', content: 'c', emotionTag: 'joy' }]);
    expect(store.getByEmotion('a', 'sad')).toEqual([]);
  });
});

describe('SQLiteStore — decay', () => {
  let store;
  let now;
  beforeEach(() => {
    store = makeStore();
    now = 1000000000000;
  });

  it('decays old stories importance and deletes below-min/over-maxAge', () => {
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const maxAge = now - 30 * 24 * 3600 * 1000;
    store.saveStories([
      // old + high importance → decayed (importance * 0.95)
      { tick: 1, timestamp: weekAgo - 1000, agentId: 'a', content: 'decay-me', importance: 0.9 },
      // over maxAge → deleted
      { tick: 2, timestamp: maxAge - 1000, agentId: 'a', content: 'too-old', importance: 0.9 },
      // recent → untouched
      { tick: 3, timestamp: now - 1000, agentId: 'a', content: 'recent', importance: 0.5 },
    ]);
    const result = store.decay(0.95, 0.05, 30, now);
    expect(result.decayed).toBeGreaterThanOrEqual(1); // the weekAgo one
    expect(result.deleted).toBeGreaterThanOrEqual(1); // the maxAge one
    const remaining = store.getRecent('a', 99999, 100, now);
    expect(remaining.find(r => r.content === 'too-old')).toBeUndefined();
    const decayed = remaining.find(r => r.content === 'decay-me');
    if (decayed) {
      expect(decayed.importance).toBeCloseTo(0.9 * 0.95, 5);
    }
  });

  it('returns {decayed:0, deleted:0} on empty store', () => {
    const result = store.decay(0.95, 0.05, 30, now);
    expect(result.decayed).toBe(0);
    expect(result.deleted).toBe(0);
  });
});

describe('SQLiteStore — stats with virtualTime now', () => {
  let store;
  beforeEach(() => { store = makeStore(); });

  it('reports recentDay/recentWeek/total buckets', () => {
    const now = 1000000000000;
    store.saveStories([
      { tick: 1, timestamp: now - 3600 * 1000, agentId: 'a', content: 'today', importance: 0.5 }, // <1 day
      { tick: 2, timestamp: now - 3 * 24 * 3600 * 1000, agentId: 'a', content: 'week', importance: 0.5 }, // <7 day
      { tick: 3, timestamp: now - 9 * 24 * 3600 * 1000, agentId: 'a', content: 'old', importance: 0.5 }, // >7 day
    ]);
    const s = store.stats('a', now);
    expect(s.total).toBe(3);
    expect(s.recentDay).toBe(1);
    expect(s.recentWeek).toBe(2);
  });

  it('returns {total:0,...} for agent with no stories', () => {
    const s = store.stats('ghost', Date.now());
    expect(s.total).toBe(0);
  });
});

describe('SQLiteStore — prune boundary & list default & transaction', () => {
  let store;
  beforeEach(() => { store = makeStore(); });

  it('prune returns 0 when keepCount >= snapshot count', () => {
    store.saveSnapshot(1, 1000, Buffer.from('a'));
    store.saveSnapshot(2, 2000, Buffer.from('b'));
    const deleted = store.prune(10);
    expect(deleted).toBe(0);
    expect(store.list().length).toBe(2);
  });

  it('list() default limit=20', () => {
    for (let i = 0; i < 25; i++) {
      store.saveSnapshot(i, i * 1000, Buffer.from(`s${i}`));
    }
    expect(store.list().length).toBe(20);
  });

  it('transaction(fn) wraps operations atomically', () => {
    let executed = false;
    const result = store.transaction(() => {
      store.set('k1', 'v1');
      store.set('k2', 'v2');
      executed = true;
      return 'done';
    });
    expect(executed).toBe(true);
    expect(result).toBe('done');
    expect(store.get('k1')).toBe('v1');
    expect(store.get('k2')).toBe('v2');
  });
});
