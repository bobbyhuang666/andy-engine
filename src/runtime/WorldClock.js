/**
 * WorldClock — 世界时钟
 *
 * 管理模拟时间和 tick 计数。
 * 每次 advance() 推进指定分钟数并递增 tickCount。
 */

class WorldClock {
  /**
   * @param {Date} [startTime] - 初始模拟时间
   */
  constructor(startTime = new Date(0)) {
    this.time = new Date(startTime);
    if (isNaN(this.time.getTime())) {
      throw new Error(
        `Invalid startTime: ${startTime}. Must be a valid Date, ISO string, or timestamp.`
      );
    }
    this.tickCount = 0;
  }

  /**
   * 推进时钟
   * @param {number} [minutes=5] - 推进的分钟数
   * @returns {Date} 推进后的时间
   */
  advance(minutes = 5) {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) minutes = 0;
    this.time = new Date(this.time.getTime() + minutes * 60 * 1000);
    this.tickCount++;
    return this.time;
  }

  /** @returns {number} 当前模拟小时（UTC，0-23） */
  get hour() { return this.time.getUTCHours(); }

  /** @returns {number} 当前模拟星期（UTC，0=周日） */
  get dayOfWeek() { return this.time.getUTCDay(); }

  /**
   * ISO 字符串表示
   * @returns {string}
   */
  toISOString() { return this.time.toISOString(); }

  /**
   * 序列化
   * @returns {Object}
   */
  toJSON() {
    return {
      time: this.time.toISOString(),
      tickCount: this.tickCount,
    };
  }

  /**
   * 从 JSON 恢复
   * @param {Object} data
   * @returns {WorldClock}
   */
  static fromJSON(data) {
    const clock = new WorldClock(new Date(data.time));
    clock.tickCount = Number.isInteger(data.tickCount) && data.tickCount >= 0 ? data.tickCount : 0;
    return clock;
  }
}

module.exports = WorldClock;
