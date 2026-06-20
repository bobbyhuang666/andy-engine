/**
 * store — Andy 模拟持久化层（Phase 10: 兼容性层）
 *
 * Phase 10: 序列化契约和统一接口已移至 src/store/。
 * 本文件保持向后兼容，从 src/store/ 重新导出新模块，并保留原有实现。
 *
 * 分层架构:
 *   序列化契约: src/store/Serialization (Stable World Envelope)
 *   统一接口:   src/store/SaveLoad (save/load/listSnapshots)
 *   接口层:     StoryStore, SnapshotStore, MetaStore (纯抽象)
 *   实现层:     SQLiteStore (当前), PostgreSQLStore (将来)
 *   管理层:     SimulationStore (生命周期 + 缓冲 + 策略)
 */

const { StoryStore } = require('./StoryStore');
const { SnapshotStore } = require('./SnapshotStore');
const { MetaStore } = require('./MetaStore');
const { SQLiteStore } = require('./SQLiteStore');
const { SimulationStore } = require('./SimulationStore');

// Phase 10: 从 src/store/ 导入新模块
const { Serialization, ENVELOPE_VERSION, SaveLoad } = require('../src/store');

/**
 * 创建默认的 SimulationStore（SQLite 实现）
 * @param {Object} options - SimulationStore 选项
 * @returns {SimulationStore}
 */
function createStore(options = {}) {
  return new SimulationStore(options);
}

/**
 * 创建内存 SQLiteStore（测试用）
 * @returns {SQLiteStore}
 */
function createMemoryStore() {
  return new SQLiteStore(':memory:');
}

module.exports = {
  // Phase 10: 新模块
  Serialization,
  ENVELOPE_VERSION,
  SaveLoad,

  // 接口（供其他实现参考）
  StoryStore,
  SnapshotStore,
  MetaStore,

  // 实现
  SQLiteStore,
  SimulationStore,

  // 工厂函数
  createStore,
  createMemoryStore,
};
