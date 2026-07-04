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

    // R134-A2-001: deep-merge object config sections so partial user overrides
    // (e.g. { mode: 'normal' }) do not drop default keys (temperature, etc.).
    this.actionSelection =
      typeof config.actionSelection === 'object' && config.actionSelection !== null
        ? { ...ANDY_DEFAULTS.actionSelection, ...config.actionSelection }
        : { ...ANDY_DEFAULTS.actionSelection };

    this.weather = config.weather || 'sunny';

    // R134-A2-016: whitelist-filter weatherConfig to prevent prototype pollution
    // from untrusted config keys leaking through the spread.
    const KNOWN_WEATHER_KEYS = new Set([
      'transitionProb',
      'seasonProbabilities',
      'baseTemp',
      'variance',
    ]);
    const rawWeather = config.weatherConfig || {};
    const filteredWeather = {};
    for (const key of Object.keys(rawWeather)) {
      if (KNOWN_WEATHER_KEYS.has(key)) {
        filteredWeather[key] = rawWeather[key];
      }
    }
    this.weatherConfig = {
      ...ANDY_DEFAULTS.weather,
      ...filteredWeather,
      seasonProbabilities: deepMergeSeasonProbs(
        ANDY_DEFAULTS.weather.seasonProbabilities,
        filteredWeather.seasonProbabilities || {}
      ),
    };

    this.spatial =
      typeof config.spatial === 'object' && config.spatial !== null
        ? { ...ANDY_DEFAULTS.spatial, ...config.spatial }
        : null;

    this.events =
      typeof config.events === 'object' && config.events !== null
        ? { ...ANDY_DEFAULTS.events, ...config.events }
        : null;

    this.needs =
      typeof config.needs === 'object' && config.needs !== null
        ? { ...ANDY_DEFAULTS.needs, ...config.needs }
        : null;

    // 保留完整 defaults 供需要时引用
    this._defaults = ANDY_DEFAULTS;
  }
}

module.exports = RuntimeConfig;
