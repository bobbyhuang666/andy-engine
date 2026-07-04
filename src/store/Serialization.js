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

// R22 P0-4 fix: import CURRENT_SCHEMA_VERSION from validator to avoid
// independent declaration that can drift out of sync.
const { CURRENT_SCHEMA_VERSION } = require('./world/validator');

// Keep ENVELOPE_VERSION as alias for backward compatibility
const ENVELOPE_VERSION = CURRENT_SCHEMA_VERSION;

function cloneConfigValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());

  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (const item of value) {
      out.push(cloneConfigValue(item, seen));
    }
    return out;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }

  const out = {};
  seen.set(value, out);
  for (const [key, child] of Object.entries(value)) {
    out[key] = cloneConfigValue(child, seen);
  }
  return out;
}

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
      // R22 P0-4 fix: emit both 'version' (legacy) and 'schemaVersion' (canonical)
      // to ensure compatibility with both Serialization.deserialize and
      // validateWorldState. Previously only 'version' was emitted, but
      // WorldStateAdapter.toWorldState() emits 'schemaVersion', and
      // validateWorldState requires 'schemaVersion'.
      version: ENVELOPE_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
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
    // R22 P0-4 fix: accept both 'version' and 'schemaVersion' keys
    const ver = envelope.version || envelope.schemaVersion;
    if (!ver) {
      throw new Error('Serialization.deserialize: envelope 缺少 version/schemaVersion 字段');
    }
    if (ver !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`Serialization.deserialize: envelope 版本 ${ver} 不匹配当前版本 ${CURRENT_SCHEMA_VERSION}`);
    }
    if (!envelope.runtimeSnapshot) {
      throw new Error('Serialization.deserialize: envelope 缺少 runtimeSnapshot 字段');
    }

    // 运行时快照是不透明的，直接返回。
    // Layer caller config on top of the snapshot's own _restoreConfig as
    // an explicit override. Filter out known non-config keys (seed, domain,
    // rng) that belong only at engine constructor level and should not
    // pollute persisted state.
    const NON_CONFIG_KEYS = new Set(['seed', 'domain', 'rng', 'id', 'name']);
    if (config && typeof config === 'object') {
      const filteredConfig = Object.fromEntries(
        Object.entries(config).filter(([key]) => !NON_CONFIG_KEYS.has(key))
      );
      // Deep-copy plain config containers without JSON stripping Date values or
      // structuredClone throwing on function-valued extension hooks.
      const deepFilteredConfig = cloneConfigValue(filteredConfig);
      return {
        ...envelope.runtimeSnapshot,
        _restoreConfig: {
          ...(envelope.runtimeSnapshot._restoreConfig || {}),
          ...deepFilteredConfig,
        },
      };
    }
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
