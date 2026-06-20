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

module.exports = {
  Serialization,
  ENVELOPE_VERSION,
  SaveLoad,
  SnapshotStore,
};
