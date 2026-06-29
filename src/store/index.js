/**
 * src/store — Phase 10 持久化边界层
 *
 * 分层架构:
 *   序列化契约: Serialization (Stable World Envelope)
 *   统一接口:   SaveLoad (save/load/listSnapshots)
 *   抽象接口:   SnapshotStore (快照存储接口)
 *
 * 原 store/ 目录保留为兼容性层，从本模块重新导出。
 */

const { Serialization, ENVELOPE_VERSION } = require('./Serialization');
const { SaveLoad } = require('./SaveLoad');
const { SnapshotStore } = require('./SnapshotStore');
const { MetaStore } = require('./MetaStore');
const { SQLiteStore } = require('./SQLiteStore');
const { MemoryStore } = require('./MemoryStore');
const { SimulationStore } = require('./SimulationStore');
const { StoryStore } = require('./StoryStore');
const { toWorldState, fromWorldState } = require('./world/WorldStateAdapter');
const { validateWorldSpec, validateWorldState, CURRENT_SCHEMA_VERSION } = require('./world/validator');
const { compile } = require('./world/compiler');
const { migrateWorldState } = require('./world/migration');

/**
 * 创建默认的 SimulationStore（SQLite 实现）
 * @param {Object} options - SimulationStore 选项
 * @returns {SimulationStore}
 */
function createStore(options = {}) {
  const { type = 'auto', ...rest } = options;

  if (type === 'memory') {
    // R19: Use pure MemoryStore (no SQLite dependency) when type='memory'
    const store = new SimulationStore({ ...rest, storeType: 'memory' });
    return store;
  }

  if (type === 'sqlite') {
    return new SimulationStore({ ...rest, dbPath: rest.dbPath || ':memory:' });
  }

  // auto: 尝试 SQLite，失败则使用 MemoryStore
  try {
    return new SimulationStore({ ...rest, dbPath: rest.dbPath || ':memory:' });
  } catch (e) {
    if (e.message && e.message.includes('better-sqlite3')) {
      console.warn('SQLite not available, using memory store');
      return new SimulationStore({ ...rest, storeType: 'memory' });
    }
    throw e;
  }
}

/**
 * 创建内存 SQLiteStore（测试用）
 * @returns {SQLiteStore|MemoryStore}
 */
function createMemoryStore() {
  try {
    return new SQLiteStore(':memory:');
  } catch (e) {
    if (e.message && e.message.includes('better-sqlite3')) {
      console.warn('SQLite not available, using memory store');
      return new MemoryStore();
    }
    throw e;
  }
}

module.exports = {
  Serialization,
  ENVELOPE_VERSION,
  SaveLoad,
  SnapshotStore,
  MetaStore,
  SQLiteStore,
  MemoryStore,
  SimulationStore,
  StoryStore,
  createStore,
  createMemoryStore,
  toWorldState,
  fromWorldState,
  validateWorldSpec,
  validateWorldState,
  CURRENT_SCHEMA_VERSION,
  compile,
  migrateWorldState,
};
