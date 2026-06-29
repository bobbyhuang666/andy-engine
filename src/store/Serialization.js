/**
 * Serialization — Stable World Envelope 序列化契约
 *
 * 职责：
 *   - serialize(): 将 AndyWorld 实例序列化为 Stable World Envelope
 *   - deserialize(): 从 Stable World Envelope 反序列化
 *
 * 设计原则：
 *   - Envelope 是跨版本稳定的公共契约
 *   - runtimeSnapshot 是不透明载荷（Opaque Payload），本模块不解析其内部结构
 *   - 不泄漏私有 agent 状态到稳定信封
 *   - 迁移必须是显式的外部管线，不在序列化中隐式执行
 */

// R21 P0-2: align with CURRENT_SCHEMA_VERSION in validator.js (0.1.0).
// Mismatch caused validateWorldSpec to reject all serialized envelopes.
const ENVELOPE_VERSION = '0.1.0';

class Serialization {
  /**
   * 将世界状态序列化为稳定信封
   *
   * @param {Object} world - AndyWorld 实例（必须有 toJSON() 方法）
   * @returns {Object} Stable World Envelope
   */
  static serialize(world) {
    if (!world || typeof world.toJSON !== 'function') {
      throw new Error('Serialization.serialize: world 必须有 toJSON() 方法');
    }

    return {
      version: ENVELOPE_VERSION,
      timestamp: new Date().toISOString(),
      runtimeSnapshot: world.toJSON(),
    };
  }

  /**
   * 从稳定信封反序列化
   *
   * 运行时快照是不透明的，直接传递给 runtime 恢复逻辑。
   * 本函数只做信封结构校验，不解析 runtimeSnapshot 内部。
   *
   * @param {Object} envelope - Stable World Envelope
   * @param {Object} [config] - 引擎配置
   * @returns {Object} 不透明的运行时快照（直接传给 AndyWorld 构造函数）
   */
  static deserialize(envelope, config) {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error('Serialization.deserialize: envelope 必须是对象');
    }
    if (!envelope.version) {
      throw new Error('Serialization.deserialize: envelope 缺少 version 字段');
    }
    if (!envelope.runtimeSnapshot) {
      throw new Error('Serialization.deserialize: envelope 缺少 runtimeSnapshot 字段');
    }

    // 运行时快照是不透明的，直接返回
    return envelope.runtimeSnapshot;
  }

  /**
   * 获取当前信封版本
   * @returns {string}
   */
  static getVersion() {
    return ENVELOPE_VERSION;
  }
}

module.exports = { Serialization, ENVELOPE_VERSION };
