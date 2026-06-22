import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

const require = createRequire(import.meta.url);
const sqliteStorePath = require.resolve('../../src/store/SQLiteStore.js');
const originalLoad = Module._load;

function clearSQLiteStoreCache() {
  delete require.cache[sqliteStorePath];
}

afterEach(() => {
  Module._load = originalLoad;
  clearSQLiteStoreCache();
});

describe('SQLite optional dependency behavior', () => {
  it('throws a clear error when better-sqlite3 is missing', () => {
    clearSQLiteStoreCache();
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
    clearSQLiteStoreCache();
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
});
