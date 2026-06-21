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
  SimulationStore,
  StoryStore,
  createStore,
  createMemoryStore,
} = require('../src/store');

module.exports = {
  Serialization,
  ENVELOPE_VERSION,
  SaveLoad,
  StoryStore,
  SnapshotStore,
  MetaStore,
  SQLiteStore,
  SimulationStore,
  createStore,
  createMemoryStore,
};
