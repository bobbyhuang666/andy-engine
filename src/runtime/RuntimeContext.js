/**
 * RuntimeContext — 运行时上下文
 *
 * 每个 tick 传递给子系统的上下文对象。
 * 聚合了 world、clock、config、domain、rng 的只读视图。
 */

class RuntimeContext {
  /**
   * @param {Object} params
   * @param {import('./AndyWorld')} params.world - 世界实例
   * @param {import('./WorldClock')} params.clock - 时钟
   * @param {import('./RuntimeConfig')} params.config - 配置
   * @param {Object} params.domain - DomainRegistry
   * @param {Object|null} params.rng - RNG 实例
   */
  constructor({ world, clock, config, domain, rng }) {
    this.world = world;
    this.clock = clock;
    this.config = config;
    this.domain = domain;
    this.rng = rng;
  }

  /** @returns {Date} 当前模拟时间 */
  get simTime() { return this.clock.time; }

  /** @returns {import('../../agent/Agent')[]} 所有 Agent */
  get agents() { return this.world.getAllAgents(); }

  /**
   * 构建 Agent.tick() 所需的环境参数
   * @param {number} minutesElapsed
   * @returns {Object}
   */
  buildAgentEnv(minutesElapsed) {
    return {
      hour: this.clock.time.getHours() + this.clock.time.getMinutes() / 60,
      dayOfWeek: this.clock.dayOfWeek,
      weather: this.world.environment.weather,
      minutesElapsed,
      simTime: this.clock.time,
      simDate: this.clock.time.toDateString(),
    };
  }
}

module.exports = RuntimeContext;
