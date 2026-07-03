/**
 * AutoTick — 自动时间管理
 *
 * 在对话间自动推进模拟时间，让角色"活"起来。
 * 用户不需要手动调用 engine.tick()。
 *
 * 时间策略：
 *   - 对话间：根据实际经过时间推进 tick（1 tick = 5 分钟模拟时间）
 *   - 长时间不对话：快速推进到当前模拟时间（最多 288 tick = 24 小时）
 *   - 对话中：每条消息间推进 1-3 tick（模拟思考和反应时间）
 */

const { RNG } = require('../shared/rng');

class AutoTick {
  /**
   * @param {Object} options
   * @param {number} options.tickIntervalMinutes - 每 tick 推进的模拟分钟数（默认 5）
   * @param {number} options.maxCatchupTicks - 最大追赶 tick 数（默认 288 = 24 小时）
   * @param {number} options.chatTickMin - 对话中每条消息最少 tick 数（默认 1）
   * @param {number} options.chatTickMax - 对话中每条消息最多 tick 数（默认 3）
   */
  constructor(options = {}) {
    this.tickIntervalMinutes = Math.max(1, options.tickIntervalMinutes || 5);
    this.maxCatchupTicks = Math.max(1, options.maxCatchupTicks || 288);
    this.chatTickMin = Math.max(0, options.chatTickMin ?? 1);
    this.chatTickMax = Math.max(this.chatTickMin, options.chatTickMax ?? 3);
    // R28 P1-002 fix: use seeded RNG fallback instead of Math.random.
    // Raw Math.random breaks determinism — same conversation replayed with
    // the same engine seed produces different tick counts between messages.
    // R29 P1-001 fix: create single RNG instance and bind its next method.
    // Previous pattern new RNG(0).next.bind(new RNG(0)) created two instances
    // where the first was orphaned garbage. Callers should pass their own
    // seeded RNG for full determinism.
    if (options.rng) {
      this._rng = AutoTick._normalizeRng(options.rng);
    } else {
      const fallbackRng = new RNG(0);
      this._rng = fallbackRng.next.bind(fallbackRng);
    }

    this._lastMessageTime = null;
    this._lastSimTime = null;
  }

  /**
   * 计算在处理用户消息前需要推进的 tick 数
   *
   * 当提供 `now` 参数时，计算结果仅依赖于输入状态，与墙钟时间无关，
   * 确保可重现性。不传 `now` 时使用 Date.now() 保持向后兼容。
   *
   * @param {Object} engine - AndyEngine 实例
   * @param {number} [now] - 可选的时间戳（ms since epoch），用于替代 Date.now()
   *                         传入 engine.world.time.getTime() 可实现确定性 tick 计算
   * @returns {number} 需要推进的 tick 数
   */
  calculateTicksToAdvance(engine, now) {
    if (now === undefined) {
      now = Date.now();
    }

    if (this._lastMessageTime === null) {
      // 第一条消息，不推进（null = 无记录, 0 是合法的时间戳）
      this._lastMessageTime = now;
      this._lastSimTime = engine.world.time.getTime();
      return 0;
    }

    // 计算实际经过的时间（毫秒）
    const elapsedMs = now - this._lastMessageTime;
    const elapsedMinutes = elapsedMs / 60000;

    // 对话中：每条消息推进 1-3 tick
    if (elapsedMinutes < 5) {
      const ticks = this.chatTickMin + Math.floor(this._rng() * (this.chatTickMax - this.chatTickMin + 1));
      this._lastMessageTime = now;
      return ticks;
    }

    // 对话间：根据实际时间推进
    const elapsedTicks = Math.floor(elapsedMinutes / this.tickIntervalMinutes);
    const cappedTicks = Math.min(elapsedTicks, this.maxCatchupTicks);

    this._lastMessageTime = now;
    return cappedTicks;
  }

  /**
   * 在处理用户消息前推进引擎
   *
   * @param {Object} engine - AndyEngine 实例
   * @param {number} [now] - 可选的时间戳（ms since epoch），传给 calculateTicksToAdvance
   * @returns {number} 实际推进的 tick 数
   */
  advance(engine, now) {
    if (!engine || !engine.world) {
      throw new Error('AutoTick.advance(): engine 必须是有效的 AndyEngine 实例');
    }
    const ticks = this.calculateTicksToAdvance(engine, now);
    if (ticks > 0) {
      engine.runTicks(ticks);
    }
    return ticks;
  }

  /**
   * 重置时间跟踪
   */
  reset() {
    this._lastMessageTime = null;
    this._lastSimTime = null;
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      lastMessageTime: this._lastMessageTime,
      lastSimTime: this._lastSimTime,
      tickIntervalMinutes: this.tickIntervalMinutes,
      maxCatchupTicks: this.maxCatchupTicks,
      chatTickMin: this.chatTickMin,
      chatTickMax: this.chatTickMax,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(data) {
    const at = new AutoTick({
      tickIntervalMinutes: data.tickIntervalMinutes,
      maxCatchupTicks: data.maxCatchupTicks,
      chatTickMin: data.chatTickMin,
      chatTickMax: data.chatTickMax,
    });
    // 使用 ?? 而非 ||：0 是合法的时间戳，不应被 coalesce 为 null
    at._lastMessageTime = data.lastMessageTime ?? null;
    at._lastSimTime = data.lastSimTime ?? null;
    return at;
  }

  static _normalizeRng(rng) {
    if (typeof rng === 'function') {
      return rng;
    }
    if (rng && typeof rng.next === 'function') {
      return rng.next.bind(rng);
    }
    const fallbackRng = new RNG(0);
    return fallbackRng.next.bind(fallbackRng);
  }
}

module.exports = AutoTick;
