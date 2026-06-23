import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

const require = createRequire(import.meta.url);
const sqliteStorePath = require.resolve('../../src/store/SQLiteStore.js');
const storeIndexPath = require.resolve('../../src/store/index.js');
const originalLoad = Module._load;

function clearStoreCache() {
  delete require.cache[sqliteStorePath];
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
      /SQLite persistence requires a working optional dependency better-sqlite3/
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
      /SQLite persistence requires a working optional dependency better-sqlite3.*simulated missing native binding/
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
});
