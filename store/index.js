/**
 * store — Andy 模拟持久化层
 *
 * 分层架构:
 *   接口层: StoryStore, SnapshotStore, MetaStore (纯抽象)
 *   实现层: SQLiteStore (当前), PostgreSQLStore (将来)
 *   管理层: SimulationStore (生命周期 + 缓冲 + 策略)
 *
 * 迁移到分布式存储时:
 *   1. 新建 PostgreSQLStore 实现相同接口
 *   2. 修改 SimulationStore 构造函数接受不同的 store 实例
 *   3. 业务代码一行不动
 */

const { StoryStore } = require('./StoryStore');
const { SnapshotStore } = require('./SnapshotStore');
const { MetaStore } = require('./MetaStore');
const { SQLiteStore } = require('./SQLiteStore');
const { SimulationStore } = require('./SimulationStore');

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
