/**
 * SnapshotStore — 模拟快照持久化接口（Phase 10 规范位置）
 *
 * 从 store/SnapshotStore.js 迁移。
 * 接口不变，位置移至 src/store/ 以隔离持久化与运行时。
 */

/**
 * @interface SnapshotStore
 */
class SnapshotStore {
  /**
   * 保存快照
   * @param {number} tick - tick 序号
   * @param {number} virtualTime - 虚拟世界时间 (Unix ms)
   * @param {Buffer} data - 序列化的 agent states (binary)
   * @param {Object} [meta] - 额外元数据 (JSON)
   * @returns {void}
   */
  async saveSnapshot(tick, virtualTime, data, meta = null) {
    throw new Error('Not implemented');
  }

  /**
   * 加载最新快照
   * @returns {Snapshot|null}
   */
  async loadLatest() {
    throw new Error('Not implemented');
  }

  /**
   * 加载指定 tick 的快照
   * @param {number} tick
   * @returns {Snapshot|null}
   */
  async loadAt(tick) {
    throw new Error('Not implemented');
  }

  /**
   * 保留最近 N 个快照，删除更早的
   * @param {number} keepCount
   * @returns {number} 删除的快照数
   */
  async prune(keepCount = 720) {
    throw new Error('Not implemented');
  }

  /**
   * 获取快照列表（不包含 data，用于调试）
   * @param {number} limit
   * @returns {SnapshotMeta[]}
   */
  async list(limit = 20) {
    throw new Error('Not implemented');
  }

  async close() {
    throw new Error('Not implemented');
  }
}

/**
 * @typedef {Object} Snapshot
 * @property {number} tick
 * @property {number} virtualTime
 * @property {Buffer} data - binary agent states
 * @property {Object} [meta]
 * @property {number} createdAt - Unix ms (实际保存时间)
 */

/**
 * @typedef {Object} SnapshotMeta
 * @property {number} tick
 * @property {number} virtualTime
 * @property {number} createdAt
 * @property {number} dataSize - bytes
 */

module.exports = { SnapshotStore };
