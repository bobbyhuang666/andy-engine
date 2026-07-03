/**
 * RuntimeConfig — 运行时配置
 *
 * 从 ANDY_DEFAULTS 和用户 config 中提取运行时编排所需的参数。
 * 不包含 Agent 内部参数（那些留在 defaults.js）。
 */

const { ANDY_DEFAULTS } = require('../config/defaults');

/**
 * R41 A4 fix: deep-merge season probability overrides so that specifying
 * a single season (e.g. { spring: { sunny: 0.5 } }) does not delete the
 * other weather types (rain, cold, hot) for that season.
 */
function deepMergeSeasonProbs(defaults, overrides) {
  const result = {};
  for (const season of Object.keys(defaults)) {
    result[season] = { ...defaults[season], ...(overrides[season] || {}) };
  }
  return result;
}

class RuntimeConfig {
  /**
   * @param {Object} [config] - 用户配置（覆盖 defaults）
   */
  constructor(config = {}) {
    const tickMinutes = config.tickMinutes ?? ANDY_DEFAULTS.tick.intervalMinutes;
    if (typeof tickMinutes !== 'number' || !Number.isFinite(tickMinutes) || tickMinutes <= 0) {
      throw new Error(
        `Invalid tickMinutes: ${tickMinutes}. Must be a positive finite number.`
      );
    }
    this.tickMinutes = tickMinutes;
    this.enableFacts = config.enableFacts ?? false;
    this.actionSelection = {
      ...ANDY_DEFAULTS.actionSelection,
      ...(config.actionSelection || {}),
    };
    this.weather = config.weather || 'sunny';
    // R41 fix: merge user weather config with defaults so weather transitions
    // are injectable, not just read from the static ANDY_DEFAULTS.
    this.weatherConfig = {
      ...ANDY_DEFAULTS.weather,
      ...(config.weatherConfig || {}),
      seasonProbabilities: deepMergeSeasonProbs(
        ANDY_DEFAULTS.weather.seasonProbabilities,
        config.weatherConfig?.seasonProbabilities || {}
      ),
    };
    this.spatial = config.spatial || null;
    this.needs = config.needs || null;

    // 保留完整 defaults 供需要时引用
    this._defaults = ANDY_DEFAULTS;
  }
}

module.exports = RuntimeConfig;
