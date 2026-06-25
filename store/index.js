/**
 * store — Andy 模拟持久化层（Phase 10: 兼容性层）
 *
 * Pointing all imports to the canonical src/store equivalents.
 */

const {
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
} = require('../src/store');

module.exports = {
  Serialization,
  ENVELOPE_VERSION,
  SaveLoad,
  StoryStore,
  SnapshotStore,
  MetaStore,
  SQLiteStore,
  MemoryStore,
  SimulationStore,
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
