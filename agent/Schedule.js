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
   *
   * 每个 entry 格式:
   * {
   *   startHour: 8,        // 开始时间（小时）
   *   endHour: 10,         // 结束时间
   *   region: '工作区',     // 应在的区域
   *   activity: '在工作',   // 对应的状态
   *   days: [1,2,3,4,5],   // 适用的星期几（0=周日，1=周一...）
   *   probability: 0.9,    // 执行概率（0-1，模拟偶尔缺勤）
   *   noise: 30,           // 时间扰动范围（分钟）
   * }
   */
  constructor(config = {}, savedState = null) {
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

        if (Math.random() > entry.probability) continue;

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
      if (Math.random() > entry.probability) {
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
    // Clamp u1 away from 0 to avoid log(0) = -Infinity
    const u1 = Math.max(0.0001, Math.random());
    const u2 = Math.random();
    return stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ═══════════════════════════════════════════
  // 静态工厂方法
  // ═══════════════════════════════════════════
  // Campus Legacy Presets（仅供 campus domain 使用）
  // 自定义 domain 应使用 domain.roleArchetypes
  // ═══════════════════════════════════════════

  /**
   * 创建日程模板（campus legacy preset）
   * @deprecated 自定义 domain 应使用 domain.roleArchetypes
   * @param {Object} options
   * @returns {Schedule}
   */
  static createStudentSchedule(options = {}) {
    const {
      morningClass = 8,
      afternoonClass = 14,
      workDays = [1, 3, 5],   // 周一三五打工
      workStart = 17,
      workEnd = 21,
    } = options;

    return new Schedule({
      entries: [
        // 早晨洗漱
        { startHour: 7, endHour: 7.5, region: '住处', activity: '在洗漱',
          days: [1, 2, 3, 4, 5], probability: 0.95, noise: 15 },
        // 早餐
        { startHour: 7.5, endHour: 8, region: '餐厅', activity: '在餐厅',
          days: [1, 2, 3, 4, 5], probability: 0.6, noise: 20 },
        // 上午工作
        { startHour: morningClass, endHour: morningClass + 2, region: '工作区', activity: '在工作',
          days: [1, 2, 3, 4, 5], probability: 0.85, noise: 10 },
        // 上午第二轮工作
        { startHour: morningClass + 2.5, endHour: morningClass + 4.5, region: '工作区', activity: '在工作',
          days: [1, 2, 3, 4, 5], probability: 0.8, noise: 10 },
        // 午饭
        { startHour: 12, endHour: 13, region: '餐厅', activity: '在餐厅',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.9, noise: 30 },
        // 午休/休息
        { startHour: 13, endHour: 14, region: '住处', activity: '先躺一会',
          days: [1, 2, 3, 4, 5], probability: 0.5, noise: 20 },
        // 下午工作
        { startHour: afternoonClass, endHour: afternoonClass + 2, region: '工作区', activity: '在工作',
          days: [1, 2, 3, 4], probability: 0.75, noise: 15 },
        // 阅览室专注
        { startHour: afternoonClass + 2, endHour: 17, region: '阅览室', activity: '在专注做事',
          days: [1, 2, 3, 4, 5], probability: 0.5, noise: 30 },
        // 打工
        { startHour: workStart, endHour: workEnd, region: '打工处', activity: '在打工',
          days: workDays, probability: 0.9, noise: 15 },
        // 晚饭
        { startHour: 18, endHour: 19, region: '餐厅', activity: '在餐厅',
          days: [0, 2, 4, 6], probability: 0.7, noise: 30 }, // 非打工日
      ],
    });
  }

  /**
   * 创建上班族日程模板（campus legacy preset）
   * @deprecated 自定义 domain 应使用 domain.roleArchetypes
   */
  static createWorkerSchedule(options = {}) {
    const { workStart = 9, workEnd = 18 } = options;

    return new Schedule({
      entries: [
        { startHour: 7, endHour: 7.5, region: '家', activity: '在洗漱',
          days: [1, 2, 3, 4, 5], probability: 0.95, noise: 15 },
        { startHour: 8, endHour: 8.5, region: '路上', activity: '在路上',
          days: [1, 2, 3, 4, 5], probability: 0.9, noise: 20 },
        { startHour: workStart, endHour: 12, region: '工作地', activity: '在工作',
          days: [1, 2, 3, 4, 5], probability: 0.95, noise: 10 },
        { startHour: 12, endHour: 13, region: '餐厅', activity: '在餐厅',
          days: [1, 2, 3, 4, 5], probability: 0.8, noise: 20 },
        { startHour: 13, endHour: workEnd, region: '工作地', activity: '在工作',
          days: [1, 2, 3, 4, 5], probability: 0.95, noise: 10 },
        { startHour: 19, endHour: 20, region: '家', activity: '在做饭',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.6, noise: 30 },
      ],
    });
  }

  /**
   * 创建自由职业者日程模板
   */
  static createFreelancerSchedule(options = {}) {
    return new Schedule({
      entries: [
        { startHour: 9, endHour: 10, region: '家', activity: '在洗漱',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.7, noise: 60 },
        { startHour: 10, endHour: 12, region: '家', activity: '在工作',
          days: [1, 2, 3, 4, 5], probability: 0.7, noise: 60 },
        { startHour: 12, endHour: 13, region: '餐厅', activity: '在餐厅',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 30 },
        { startHour: 14, endHour: 18, region: '咖啡店', activity: '在工作',
          days: [1, 2, 3, 4, 5], probability: 0.6, noise: 60 },
        { startHour: 19, endHour: 20, region: '家', activity: '在做饭',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.5, noise: 30 },
      ],
    });
  }

  /**
   * 创建退休/居家日程模板
   */
  static createHomeSchedule(options = {}) {
    return new Schedule({
      entries: [
        { startHour: 6, endHour: 7, region: '家', activity: '在洗漱',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 30 },
        { startHour: 7, endHour: 8, region: '家', activity: '在做饭',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.7, noise: 30 },
        { startHour: 9, endHour: 11, region: '公园', activity: '在散步',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.5, noise: 60 },
        { startHour: 12, endHour: 13, region: '家', activity: '在吃饭',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 20 },
        { startHour: 14, endHour: 16, region: '家', activity: '在看剧',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.6, noise: 60 },
      ],
    });
  }

  /**
   * 从预设名称解析日程
   *
   * @param {string|Object} preset - 预设名称 ('student'|'worker'|'freelancer'|'home') 或 Schedule 配置对象
   * @param {Object} [options] - 预设参数
   * @returns {Schedule}
   */
  static resolvePreset(preset, options = {}) {
    // 已经是配置对象，直接构造
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
