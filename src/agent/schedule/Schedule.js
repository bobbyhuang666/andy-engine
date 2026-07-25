/**
 * Schedule - 日程表系统
 *
 * 每个 Agent 有固定的日程模式 + 随机扰动
 * 日程决定了 Agent 在不同时间应该出现在哪个区域、做什么
 */

const { RNG } = require('../../shared/rng');
class Schedule {
  /**
   * @param {Object} config
   * @param {Object[]} config.entries - 日程条目列表
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [rng] - RNG 实例（可选）
   */
  constructor(config = {}, savedState = null, rng = null) {
    this._rng = rng || new RNG(0);
    this.entries = (config.entries || []).map(e => ({
      startHour: Number.isFinite(e.startHour) ? e.startHour : 0,
      endHour: Number.isFinite(e.endHour) ? e.endHour : 0,
      region: e.region || '',
      activity: e.activity || '',
      days: e.days || [0, 1, 2, 3, 4, 5, 6],
      probability: Number.isFinite(e.probability) ? e.probability : 1.0,
      noise: Number.isFinite(e.noise) ? e.noise : 30,
    }));

    // 为每个条目生成当天的实际时间（加入扰动）
    this._todayVariations = {};
    this._tomorrowVariations = {};

    if (savedState) {
      // R19: deep-copy variations to prevent shared reference from savedState
      const vars = savedState._todayVariations || {};
      this._todayVariations = {};
      for (const [k, v] of Object.entries(vars)) {
        this._todayVariations[k] = v ? { ...v } : null;
      }
      const tVars = savedState._tomorrowVariations || {};
      this._tomorrowVariations = {};
      for (const [k, v] of Object.entries(tVars)) {
        this._tomorrowVariations[k] = v ? { ...v } : null;
      }
      this._lastVariationDate = savedState._lastVariationDate || null;
    }
  }

  /**
   * 获取指定时间应该做什么
   * @param {number} hour - 当前小时 (0-23.99)
   * @param {number} dayOfWeek - 星期几 (0-6)
   * @param {string} [simDate] - 模拟日期字符串（用于判断是否新的一天）
   * @returns {{ region: string|null, activity: string|null, inSchedule: boolean }}
   */
  getCurrentActivity(hour, dayOfWeek, simDate) {
    // 每天重新生成扰动
    this._maybeRegenerateVariations(dayOfWeek, simDate);

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (!entry.days.includes(dayOfWeek)) continue;

      const variation = this._todayVariations[i];
      if (!variation) continue;

      const startHour = variation.startHour;
      const endHour = variation.endHour;

      const inRange = startHour <= endHour
        ? (hour >= startHour && hour < endHour)
        : (hour >= startHour || hour < endHour);
      if (inRange) {
        return {
          region: entry.region,
          activity: entry.activity,
          inSchedule: true,
        };
      }
    }

    return { region: null, activity: null, inSchedule: false };
  }

  /**
   * 获取下一个日程项
   *
   * 支持跨天查询：如果今天没有更多活动，自动查找明天的活动。
   * 解决深夜时段（如23:00）查不到明天早晨活动的问题。
   *
   * @param {number} hour
   * @param {number} dayOfWeek
   * @param {string} [simDate] - 模拟日期字符串
   * @returns {{ entry: Object, startsIn: number, isTomorrow: boolean }|null}
   */
  getNextActivity(hour, dayOfWeek, simDate) {
    this._maybeRegenerateVariations(dayOfWeek, simDate);

    let closest = null;
    let closestDelay = Infinity;

    // 先查找今天的剩余活动
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (!entry.days.includes(dayOfWeek)) continue;

      const variation = this._todayVariations[i];
      if (!variation) continue;

      if (variation.startHour > hour) {
        const delay = variation.startHour - hour;
        if (delay < closestDelay) {
          closestDelay = delay;
          closest = { entry, startsIn: delay, isTomorrow: false };
        }
      }
    }

    // 今天没有更多活动时，查找明天的第一个活动
    if (!closest) {
      for (let i = 0; i < this.entries.length; i++) {
        const variation = this._tomorrowVariations[i];
        if (!variation) continue;

        const entry = this.entries[i];
        const delay = (24 - hour) + variation.startHour;

        if (delay < closestDelay) {
          closestDelay = delay;
          closest = { entry, startsIn: delay, isTomorrow: true };
        }
      }
    }

    return closest;
  }

  /**
   * 每天重新生成时间扰动
   * @private
   */
  _maybeRegenerateVariations(dayOfWeek, simDate) {
    // 使用 epoch sentinel (new Date(0)) 作为确定性 fallback，参见 R84 模式
    const today = simDate || new Date(0).toISOString().slice(0, 10);
    if (this._lastVariationDate === today) return;

    this._todayVariations = {};
    this._tomorrowVariations = {};
    this._lastVariationDate = today;

    const tomorrowDay = (dayOfWeek + 1) % 7;

    // Pass 1: generate today's variations using this._rng
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.days.includes(dayOfWeek)) {
        if (this._rng.next() > entry.probability) {
          this._todayVariations[i] = null;
        } else {
          const noiseMinutes = this._gaussianNoise(entry.noise);
          const noiseHours = noiseMinutes / 60;
          this._todayVariations[i] = {
            startHour: Math.max(0, Math.min(24, entry.startHour + noiseHours)),
            endHour: Math.max(0, Math.min(24, entry.endHour + noiseHours)),
          };
        }
      }
    }

    // Clone RNG AFTER today's consumption so tomorrow's prediction matches actual tomorrow state
    const tomorrowRng = typeof this._rng.clone === 'function' ? this._rng.clone() : new RNG(0);

    // Pass 2: generate tomorrow's variations using cloned RNG at post-today state
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.days.includes(tomorrowDay)) {
        if (tomorrowRng.next() > entry.probability) {
          this._tomorrowVariations[i] = null;
        } else {
          const noiseMinutes = this._gaussianNoiseWithRng(entry.noise, tomorrowRng);
          const noiseHours = noiseMinutes / 60;
          this._tomorrowVariations[i] = {
            startHour: Math.max(0, Math.min(24, entry.startHour + noiseHours)),
            endHour: Math.max(0, Math.min(24, entry.endHour + noiseHours)),
          };
        }
      }
    }
  }

  /**
   * Box-Muller 正态分布采样
   * @private
   */
  _gaussianNoise(stddev) {
    return this._gaussianNoiseWithRng(stddev, this._rng);
  }

  _gaussianNoiseWithRng(stddev, rng) {
    const rand = rng.next.bind(rng);
    const u1 = Math.max(0.0001, rand());
    const u2 = rand();
    return stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * 从配置对象构造 Schedule。
   *
   * Core 不再内置 campus 日程预设名解析 —— 字符串 preset 名属于具体域
   * 语义,应由入口层 / preset 模块解析后传入 config 对象。
   *
   * @param {Object} preset - Schedule 配置对象 `{ entries: [...] }`
   * @returns {Schedule}
   * @throws {Error} 当 preset 不是配置对象时(string preset 需调用方提供域工厂)
   */
  static resolvePreset(preset) {
    if (typeof preset === 'object' && preset !== null) {
      return new Schedule(preset);
    }
    throw new Error(
      'Schedule.resolvePreset string preset requires domain-provided factory'
    );
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      entries: this.entries.map(e => ({ ...e })),
      _todayVariations: this._todayVariations ? { ...this._todayVariations } : null,
      _tomorrowVariations: this._tomorrowVariations ? { ...this._tomorrowVariations } : null,
      _lastVariationDate: this._lastVariationDate,
    };
  }

  /**
   * 从 toJSON 输出反序列化为 Schedule 实例。
   * toJSON 同时包含 entries 与运行期变体数据，fromJSON 将其同时作为 config 与 savedState 传入，
   * 使 entries 与 _todayVariations / _lastVariationDate 均能还原。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [rng] - RNG 实例
   * @returns {Schedule}
   */
  static fromJSON(json, rng = null) {
    return new Schedule(json, json, rng);
  }
}

module.exports = Schedule;
