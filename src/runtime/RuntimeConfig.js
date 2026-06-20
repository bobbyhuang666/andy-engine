/**
 * RuntimeConfig — 运行时配置
 *
 * 从 ANDY_DEFAULTS 和用户 config 中提取运行时编排所需的参数。
 * 不包含 Agent 内部参数（那些留在 defaults.js）。
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');

class RuntimeConfig {
  /**
   * @param {Object} [config] - 用户配置（覆盖 defaults）
   */
  constructor(config = {}) {
    this.tickMinutes = config.tickMinutes ?? ANDY_DEFAULTS.tick.intervalMinutes;
    this.enableFacts = config.enableFacts ?? false;
    this.actionSelection = {
      ...ANDY_DEFAULTS.actionSelection,
      ...(config.actionSelection || {}),
    };
    this.weather = config.weather || 'sunny';
    this.spatial = config.spatial || null;

    // 保留完整 defaults 供需要时引用
    this._defaults = ANDY_DEFAULTS;
  }
}

module.exports = RuntimeConfig;
