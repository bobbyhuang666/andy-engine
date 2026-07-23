import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

const require = createRequire(import.meta.url);
const sqliteStorePath = require.resolve('../../src/store/SQLiteStore.js');
const simulationStorePath = require.resolve('../../src/store/SimulationStore.js');
const storeIndexPath = require.resolve('../../src/store/index.js');
const originalLoad = Module._load;

function clearStoreCache() {
  delete require.cache[sqliteStorePath];
  delete require.cache[simulationStorePath];
  delete require.cache[storeIndexPath];
}

afterEach(() => {
  Module._load = originalLoad;
  clearStoreCache();
});

describe('SQLite optional dependency behavior', () => {
  it('throws a clear error when better-sqlite3 is missing', () => {
    clearStoreCache();
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        throw new Error('simulated missing better-sqlite3');
      }
      return originalLoad.apply(this, arguments);
    };

    const { SQLiteStore } = require('../../src/store/SQLiteStore.js');
    expect(() => new SQLiteStore(':memory:')).toThrow(
      expect.objectContaining({
        code: 'SQLITE_BINDING_UNAVAILABLE',
        message: expect.stringMatching(/SQLite persistence requires a working optional dependency better-sqlite3/),
      })
    );
  });

  it('throws a clear error when better-sqlite3 native binding is broken', () => {
    clearStoreCache();
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        return function BrokenDatabase() {
          throw new Error('simulated missing native binding');
        };
      }
      return originalLoad.apply(this, arguments);
    };

    const { SQLiteStore } = require('../../src/store/SQLiteStore.js');
    expect(() => new SQLiteStore(':memory:')).toThrow(
      expect.objectContaining({
        code: 'SQLITE_BINDING_UNAVAILABLE',
        message: expect.stringMatching(/simulated missing native binding/),
      })
    );
  });

  it('does not disguise a genuine database open failure as a missing binding', () => {
    clearStoreCache();
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        return function BrokenDatabase() {
          throw new Error('permission denied');
        };
      }
      return originalLoad.apply(this, arguments);
    };

    const { SQLiteStore } = require('../../src/store/SQLiteStore.js');
    expect(() => new SQLiteStore(':memory:')).toThrow(
      expect.objectContaining({
        code: 'SQLITE_OPEN_FAILED',
        message: expect.stringMatching(/permission denied/),
      })
    );
  });

  it.each([
    [{ code: 'ERR_DLOPEN_FAILED', message: 'dlopen failed' }],
    [{ message: 'invalid ELF header' }],
    [{ message: 'mach-o file, but is an incompatible architecture' }],
    [{ message: 'The module was compiled against NODE_MODULE_VERSION 115' }],
  ])('classifies native binary incompatibility as an unavailable binding', errorShape => {
    clearStoreCache();
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        return function BrokenDatabase() {
          const error = new Error(errorShape.message);
          if (errorShape.code) error.code = errorShape.code;
          throw error;
        };
      }
      return originalLoad.apply(this, arguments);
    };

    const { SQLiteStore } = require('../../src/store/SQLiteStore.js');
    expect(() => new SQLiteStore(':memory:')).toThrow(
      expect.objectContaining({ code: 'SQLITE_BINDING_UNAVAILABLE' })
    );
  });

  it('MemoryStore works without SQLite', async () => {
    clearStoreCache();
    const { MemoryStore } = require('../../src/store/MemoryStore.js');
    const store = new MemoryStore();

    // 测试 StoryStore 接口
    store.saveStories([{ tick: 1, timestamp: Date.now(), agentId: 'test', content: 'story' }]);
    const stories = store.getRecent('test', 24, 10);
    expect(stories.length).toBe(1);

    // 测试 SnapshotStore 接口
    store.saveSnapshot(1, Date.now(), Buffer.from('data'));
    const snapshot = store.loadLatest();
    expect(snapshot).toBeDefined();

    // 测试 MetaStore 接口
    store.set('key', 'value');
    expect(store.get('key')).toBe('value');

    store.close();
  });

  it('createMemoryStore falls back to MemoryStore when SQLite unavailable', () => {
    clearStoreCache();
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        throw new Error('simulated missing better-sqlite3');
      }
      return originalLoad.apply(this, arguments);
    };

    const { createMemoryStore } = require('../../src/store/index.js');
    const store = createMemoryStore();

    // 应该是 MemoryStore 实例
    expect(store.constructor.name).toBe('MemoryStore');

    // 应该可以正常工作
    store.set('test', 'value');
    expect(store.get('test')).toBe('value');

    store.close();
  });

  it('store implementations keep deprecated public aliases wired to canonical methods', () => {
    const { MemoryStore } = require('../../src/store/MemoryStore');
    const store = new MemoryStore();

    store.saveSnapshot(1, 1000, Buffer.from('one'));
    store.saveSnapshot(2, 2000, Buffer.from('two'));
    expect(store.loadLatestSnapshot().tick).toBe(2);
    expect(store.loadSnapshotByTick(1).data.toString()).toBe('one');

    store.saveMeta('legacy', 'ok');
    expect(store.loadMeta('legacy')).toBe('ok');
    expect(store.get('legacy')).toBe('ok');
  });

  it('createStore auto mode falls back after init when SQLite is unavailable', async () => {
    clearStoreCache();
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        throw new Error('simulated missing better-sqlite3');
      }
      return originalLoad.apply(this, arguments);
    };

    const { createStore } = require('../../src/store/index.js');
    const store = createStore({ dbPath: ':memory:' });
    const result = await store.init({
      onSnapshot: () => Buffer.from('snapshot'),
      onRestore: () => {},
    });

    expect(store.db.constructor.name).toBe('MemoryStore');
    expect(result).toMatchObject({
      requestedStoreType: 'auto',
      actualStoreType: 'memory',
      degraded: true,
      restoredTick: 0,
      hasSnapshot: false,
    });

    await store.shutdown();
  });

  it('explicit sqlite mode fails closed when the binding is unavailable', async () => {
    clearStoreCache();
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        throw new Error('simulated missing better-sqlite3');
      }
      return originalLoad.apply(this, arguments);
    };

    const { createStore } = require('../../src/store/index.js');
    const store = createStore({ type: 'sqlite', dbPath: ':memory:' });

    await expect(store.init()).rejects.toMatchObject({
      code: 'SQLITE_BINDING_UNAVAILABLE',
    });
  });
});
