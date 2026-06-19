/**
 * Schedule - 日程表系统
 *
 * 每个 Agent 有固定的日程模式 + 随机扰动
 * 日程决定了 Agent 在不同时间应该出现在哪个区域、做什么
 */

class Schedule {
  /**
   * @param {Object} config
   * @param {Object[]} config.entries - 日程条目列表
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [rng] - RNG 实例（可选）
   */
  constructor(config = {}, savedState = null, rng = null) {
    this._rng = rng;
    this.entries = (config.entries || []).map(e => ({
      startHour: e.startHour ?? 0,
      endHour: e.endHour ?? 0,
      region: e.region || '',
      activity: e.activity || '',
      days: e.days || [0, 1, 2, 3, 4, 5, 6],
      probability: e.probability ?? 1.0,
      noise: e.noise ?? 30,
    }));

    // 为每个条目生成当天的实际时间（加入扰动）
    this._todayVariations = {};

    if (savedState) {
      this._todayVariations = savedState._todayVariations || {};
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

      if (hour >= startHour && hour < endHour) {
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
      const tomorrowDay = (dayOfWeek + 1) % 7;
      // 临时生成明天的扰动
      for (let i = 0; i < this.entries.length; i++) {
        const entry = this.entries[i];
        if (!entry.days.includes(tomorrowDay)) continue;

        if ((this._rng ? this._rng.next() : Math.random()) > entry.probability) continue;

        const noiseHours = this._gaussianNoise(entry.noise) / 60;
        const tomorrowStart = Math.max(0, Math.min(24, entry.startHour + noiseHours));
        const delay = (24 - hour) + tomorrowStart;

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
    const today = simDate || new Date().toDateString();
    if (this._lastVariationDate === today) return;

    this._todayVariations = {};
    this._lastVariationDate = today;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // 概率检查（模拟偶尔旷工）
      if ((this._rng ? this._rng.next() : Math.random()) > entry.probability) {
        this._todayVariations[i] = null;
        continue;
      }

      // 时间扰动（正态分布近似）
      const noiseMinutes = this._gaussianNoise(entry.noise);
      const noiseHours = noiseMinutes / 60;

      this._todayVariations[i] = {
        startHour: Math.max(0, Math.min(24, entry.startHour + noiseHours)),
        endHour: Math.max(0, Math.min(24, entry.endHour + noiseHours)),
      };
    }
  }

  /**
   * Box-Muller 正态分布采样
   * @private
   */
  _gaussianNoise(stddev) {
    const rand = this._rng ? this._rng.next.bind(this._rng) : Math.random;
    // Clamp u1 away from 0 to avoid log(0) = -Infinity
    const u1 = Math.max(0.0001, rand());
    const u2 = rand();
    return stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ═══════════════════════════════════════════
  // 静态工厂方法 (deprecated compatibility wrappers)
  // ═══════════════════════════════════════════
  // Data lives in presets/campus/schedules.js.
  // These wrappers lazily load that module and return Schedule instances.
  // Custom domains should use domain.roleArchetypes instead.
  // ═══════════════════════════════════════════

  static _campusSchedules() {
    if (!Schedule._campusSchedulesCache) {
      Schedule._campusSchedulesCache = require('../presets/campus/schedules');
    }
    return Schedule._campusSchedulesCache;
  }

  /**
   * @deprecated Use domain.roleArchetypes or presets/campus/schedules directly
   */
  static createStudentSchedule(options = {}) {
    const config = Schedule._campusSchedules().createStudentScheduleConfig(options);
    return new Schedule(config);
  }

  /**
   * @deprecated Use domain.roleArchetypes or presets/campus/schedules directly
   */
  static createWorkerSchedule(options = {}) {
    const config = Schedule._campusSchedules().createWorkerScheduleConfig(options);
    return new Schedule(config);
  }

  /**
   * @deprecated Use domain.roleArchetypes or presets/campus/schedules directly
   */
  static createFreelancerSchedule(options = {}) {
    const config = Schedule._campusSchedules().createFreelancerScheduleConfig(options);
    return new Schedule(config);
  }

  /**
   * @deprecated Use domain.roleArchetypes or presets/campus/schedules directly
   */
  static createHomeSchedule(options = {}) {
    const config = Schedule._campusSchedules().createHomeScheduleConfig(options);
    return new Schedule(config);
  }

  /**
   * 从预设名称解析日程
   *
   * @param {string|Object} preset - 预设名称 ('student'|'worker'|'freelancer'|'home') 或 Schedule 配置对象
   * @param {Object} [options] - 预设参数
   * @returns {Schedule}
   */
  static resolvePreset(preset, options = {}) {
    if (typeof preset === 'object' && preset !== null) {
      return new Schedule(preset);
    }

    const presets = {
      student:    () => Schedule.createStudentSchedule(options),
      worker:     () => Schedule.createWorkerSchedule(options),
      freelancer: () => Schedule.createFreelancerSchedule(options),
      home:       () => Schedule.createHomeSchedule(options),
    };

    const factory = presets[preset];
    if (!factory) {
      console.warn(`未知的日程预设: "${preset}"，使用空日程。可选: ${Object.keys(presets).join(', ')}`);
      return new Schedule({});
    }
    return factory();
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      entries: this.entries,
      _todayVariations: this._todayVariations,
      _lastVariationDate: this._lastVariationDate,
    };
  }
}

module.exports = Schedule;
