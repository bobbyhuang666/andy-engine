/**
 * SaveLoad — 统一保存/加载接口
 *
 * 职责：
 *   - save(): 将世界状态通过 Serialization 序列化后存入 store
 *   - load(): 从 store 加载信封并通过 Serialization 反序列化
 *   - listSnapshots(): 列出可用快照
 *
 * 设计原则：
 *   - store 是 SnapshotStore 或 SQLiteStore 等实现
 *   - SaveLoad 不关心底层存储细节
 *   - 所有序列化边界通过 Serialization 模块
 */

const { Serialization } = require('./Serialization');

class SaveLoad {
  /**
   * @param {Object} store - 存储实现（必须有 save/load/list 方法）
   */
  constructor(store) {
    if (!store) {
      throw new Error('SaveLoad: store 不能为空');
    }
    this.store = store;
  }

  /**
   * 保存世界状态
   *
   * @param {Object} world - AndyWorld 实例
   * @param {Object} [metadata] - 额外元数据
   * @returns {*} store.save 的返回值
   */
  save(world, metadata = {}) {
    const envelope = Serialization.serialize(world);
    return this.store.save(envelope, metadata);
  }

  /**
   * 加载世界状态
   *
   * @param {string} snapshotId - 快照标识
   * @param {Object} [config] - 引擎配置
   * @returns {Object} 不透明的运行时快照
   */
  load(snapshotId, config) {
    const envelope = this.store.load(snapshotId);
    return Serialization.deserialize(envelope, config);
  }

  /**
   * 列出可用快照
   *
   * @returns {Array} 快照列表
   */
  listSnapshots() {
    return this.store.list();
  }
}

module.exports = { SaveLoad };
