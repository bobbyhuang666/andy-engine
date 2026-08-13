/**
 * Store Contract Suite (RFC W1 / Patch B)
 *
 * Parameterized contract tests run identical assertions against both
 * MemoryStore and SQLiteStore. Previously the two backends had independent
 * test files with duplicated intent but no shared coverage, so cross-backend
 * regressions (binary isolation, transaction rollback, prune(0) divergence)
 * went undetected.
 *
 * Test matrix (RFC §5.W1):
 *   - Buffer copy-in/copy-out
 *   - Uint8Array copy-in/copy-out
 *   - Story query isolation
 *   - Meta round-trip
 *   - Transaction commit
 *   - Transaction rollback
 *   - prune 0/1/N
 *   - Same-tick checkpoint conflict
 *   - Close/error behavior
 *
 * SQLite tests are skipped when better-sqlite3 is unavailable (optional dep).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { MemoryStore } = require('../../src/store/MemoryStore.js');
const { SQLiteStore } = require('../../src/store/SQLiteStore.js');

function canUseSQLiteStore() {
  try {
    const store = new SQLiteStore(':memory:');
    store.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the parameterized contract suite for a given backend.
 * @param {string} name - backend label
 * @param {() => Object} factory - returns a fresh store instance
 * @param {() => void} [cleanup] - optional cleanup after each test
 */
function createStoreContractSuite(name, factory, cleanup) {
  describe(`Store contract — ${name}`, () => {
    let store;
    beforeEach(() => { store = factory(); });
    afterEach(() => { if (cleanup) cleanup(); });

    // ─── Binary copy-in/copy-out ────────────────────────────────────────

    describe('Buffer copy-in/copy-out', () => {
      it('saveSnapshot(Buffer) then mutate input does not change stored snapshot', () => {
        const data = Buffer.from('hello');
        store.saveSnapshot(1, 1000, data);
        data[0] = 88; // mutate input after save

        const loaded = store.loadLatest();
        expect(loaded.data).toEqual(Buffer.from('hello'));
        expect(loaded.data[0]).toBe(104); // 'h', not 88
      });

      it('loadLatest returns an independent copy (mutate load result does not affect store)', () => {
        store.saveSnapshot(1, 1000, Buffer.from('hello'));
        const loaded1 = store.loadLatest();
        loaded1.data[0] = 88;
        const loaded2 = store.loadLatest();
        expect(loaded2.data).toEqual(Buffer.from('hello'));
      });

      it('loadAt returns an independent copy', () => {
        store.saveSnapshot(1, 1000, Buffer.from('aaa'));
        const loaded1 = store.loadAt(1);
        loaded1.data[0] = 90;
        const loaded2 = store.loadAt(1);
        expect(loaded2.data).toEqual(Buffer.from('aaa'));
      });
    });

    describe('Uint8Array copy-in/copy-out', () => {
      it('saveSnapshot(Uint8Array) then mutate input does not change stored snapshot', () => {
        const data = new Uint8Array([1, 2, 3, 4]);
        store.saveSnapshot(1, 1000, data);
        data[0] = 99;

        const loaded = store.loadLatest();
        // loaded.data is a Buffer (binaryCopy normalizes to Buffer); compare bytes
        expect(Array.from(loaded.data)).toEqual([1, 2, 3, 4]);
      });

      it('saveSnapshot(Uint8Array view) with byteOffset copies only the viewed region', () => {
        const buf = new ArrayBuffer(8);
        const view = new Uint8Array(buf, 2, 4); // view bytes 2..5
        for (let i = 0; i < 4; i++) view[i] = 10 + i;
        store.saveSnapshot(1, 1000, view);

        const loaded = store.loadLatest();
        expect(Array.from(loaded.data)).toEqual([10, 11, 12, 13]);
      });

      it('loadLatest(Uint8Array-stored) returns independent copy', () => {
        store.saveSnapshot(1, 1000, new Uint8Array([5, 6, 7]));
        const a = store.loadLatest();
        a.data[0] = 0;
        const b = store.loadLatest();
        expect(Array.from(b.data)).toEqual([5, 6, 7]);
      });
    });

    // ─── Story query isolation ──────────────────────────────────────────

    describe('Story query isolation', () => {
      it('getRecent returns objects whose mutation does not affect the store', () => {
        const now = Date.now();
        store.saveStories([{ tick: 1, timestamp: now, agentId: 'a', content: 'orig', importance: 0.9 }]);
        const rows = store.getRecent('a', 72, 10, now);
        expect(rows).toHaveLength(1);
        rows[0].content = 'MUTATED';
        rows[0].importance = 0;

        const rows2 = store.getRecent('a', 72, 10, now);
        expect(rows2[0].content).toBe('orig');
        expect(rows2[0].importance).toBe(0.9);
      });

      it('getByEmotion returns objects whose mutation does not affect the store', () => {
        const now = Date.now();
        store.saveStories([{ tick: 1, timestamp: now, agentId: 'a', content: 'orig', emotionTag: 'joy', importance: 0.8 }]);
        const rows = store.getByEmotion('a', 'joy', 168, 10, now);
        rows[0].content = 'MUTATED';
        const rows2 = store.getByEmotion('a', 'joy', 168, 10, now);
        expect(rows2[0].content).toBe('orig');
      });
    });

    // ─── Meta round-trip ────────────────────────────────────────────────

    describe('Meta round-trip', () => {
      it('set/get string round-trips', () => {
        store.set('k', 'v');
        expect(store.get('k')).toBe('v');
      });

      it('setMany + getAll round-trips', () => {
        store.setMany({ a: '1', b: '2' });
        expect(store.getAll()).toEqual({ a: '1', b: '2' });
      });

      it('delete removes key', () => {
        store.set('k', 'v');
        store.delete('k');
        expect(store.get('k')).toBeNull();
      });
    });

    // ─── Transaction commit / rollback ──────────────────────────────────

    describe('Transaction commit', () => {
      it('commits writes on success and returns fn result', () => {
        const result = store.transaction(() => {
          store.set('k1', 'v1');
          store.saveSnapshot(1, 1000, Buffer.from('tx'));
          return 'done';
        });
        expect(result).toBe('done');
        expect(store.get('k1')).toBe('v1');
        expect(store.loadLatest().tick).toBe(1);
      });
    });

    describe('Transaction rollback', () => {
      it('restores state when fn throws (meta)', () => {
        store.set('before', 'yes');
        expect(() => store.transaction(() => {
          store.set('before', 'no');
          store.set('added', 'temp');
          throw new Error('boom');
        })).toThrow('boom');

        expect(store.get('before')).toBe('yes');
        expect(store.get('added')).toBeNull();
      });

      it('restores state when fn throws (snapshots)', () => {
        store.saveSnapshot(1, 1000, Buffer.from('keep'));
        expect(() => store.transaction(() => {
          store.saveSnapshot(2, 2000, Buffer.from('temp'));
          throw new Error('boom');
        })).toThrow('boom');

        const latest = store.loadLatest();
        expect(latest.tick).toBe(1);
        expect(latest.data).toEqual(Buffer.from('keep'));
        expect(store.loadAt(2)).toBeNull();
      });

      it('restores state when fn throws (stories + counter)', () => {
        store.saveStories([{ tick: 1, timestamp: Date.now(), agentId: 'a', content: 'keep' }]);
        const beforeCount = store.stats('a').total;
        expect(() => store.transaction(() => {
          store.saveStories([{ tick: 2, timestamp: Date.now(), agentId: 'a', content: 'temp' }]);
          throw new Error('boom');
        })).toThrow('boom');

        expect(store.stats('a').total).toBe(beforeCount);
        const rows = store.getRecent('a', 99999, 100, Date.now());
        expect(rows.every(r => r.content !== 'temp')).toBe(true);
      });
    });

    // ─── prune 0/1/N ────────────────────────────────────────────────────

    describe('prune', () => {
      it('prune(0) deletes ALL snapshots', () => {
        store.saveSnapshot(1, 1000, Buffer.from('a'));
        store.saveSnapshot(2, 2000, Buffer.from('b'));
        store.saveSnapshot(3, 3000, Buffer.from('c'));
        const deleted = store.prune(0);
        expect(deleted).toBe(3);
        expect(store.loadLatest()).toBeNull();
        expect(store.list().length).toBe(0);
      });

      it('prune(0) on empty store returns 0', () => {
        expect(store.prune(0)).toBe(0);
      });

      it('prune(-1) deletes ALL snapshots (negative aligns with 0)', () => {
        store.saveSnapshot(1, 1000, Buffer.from('a'));
        store.saveSnapshot(2, 2000, Buffer.from('b'));
        const deleted = store.prune(-1);
        expect(deleted).toBe(2);
        expect(store.loadLatest()).toBeNull();
      });

      it('prune(1) keeps only the newest snapshot', () => {
        for (let i = 1; i <= 5; i++) store.saveSnapshot(i, i * 1000, Buffer.from(`s${i}`));
        const deleted = store.prune(1);
        expect(deleted).toBe(4);
        const latest = store.loadLatest();
        expect(latest.tick).toBe(5);
      });

      it('prune(N) keeps the N newest', () => {
        for (let i = 1; i <= 10; i++) store.saveSnapshot(i, i * 1000, Buffer.from(`s${i}`));
        const deleted = store.prune(3);
        expect(deleted).toBe(7);
        const list = store.list(100).sort((a, b) => b.tick - a.tick);
        expect(list.map(s => s.tick)).toEqual([10, 9, 8]);
      });

      it('prune(keepCount >= count) returns 0 and keeps all', () => {
        store.saveSnapshot(1, 1000, Buffer.from('a'));
        store.saveSnapshot(2, 2000, Buffer.from('b'));
        expect(store.prune(10)).toBe(0);
        expect(store.list().length).toBe(2);
      });
    });

    // ─── Same-tick checkpoint conflict ──────────────────────────────────

    describe('Same-tick checkpoint conflict', () => {
      it('saveCheckpoint rejects older tick', () => {
        store.saveCheckpoint(5, 5000, Buffer.from('a'), null);
        expect(() => store.saveCheckpoint(4, 4000, Buffer.from('b'), null)).toThrow(/older/);
      });

      it('saveCheckpoint rejects same-tick with different data', () => {
        store.saveCheckpoint(5, 5000, Buffer.from('a'), null);
        expect(() => store.saveCheckpoint(5, 5000, Buffer.from('different'), null)).toThrow(/conflict/);
      });

      it('saveCheckpoint accepts same-tick with identical data (idempotent)', () => {
        store.saveCheckpoint(5, 5000, Buffer.from('same'), null);
        expect(() => store.saveCheckpoint(5, 5000, Buffer.from('same'), null)).not.toThrow();
      });
    });

    // ─── Close/error behavior ───────────────────────────────────────────

    describe('Close/error behavior', () => {
      it('close() does not throw', () => {
        expect(() => store.close()).not.toThrow();
      });
    });
  });
}

// ═══════════════════════════════════════════
// Run the suite against each backend
// ═══════════════════════════════════════════

createStoreContractSuite('MemoryStore', () => new MemoryStore());

const sqliteAvailable = canUseSQLiteStore();
if (sqliteAvailable) {
  let currentStore;
  createStoreContractSuite(
    'SQLiteStore',
    () => { currentStore = new SQLiteStore(':memory:'); return currentStore; },
    () => { try { currentStore && currentStore.close(); } catch (_) {} },
  );
} else {
  describe('Store contract — SQLiteStore (skipped: better-sqlite3 unavailable)', () => {
    it.skip('SQLiteStore contract suite (optional dependency not installed)', () => {});
  });
}
