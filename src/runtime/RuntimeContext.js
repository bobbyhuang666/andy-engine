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
    const env = {
      hour: this.clock.time.getHours() + this.clock.time.getMinutes() / 60,
      dayOfWeek: this.clock.dayOfWeek,
      weather: this.world.environment.weather,
      minutesElapsed,
      simTime: this.clock.time,
      simDate: this.clock.time.toDateString(),
      effectCommitter: this.world.effectCommitter,
      effectWorld: this.world,
    };

    // R19: Provide a callback for ActionSelectionRuntime to signal position
    // changes. This directly syncs RegionGrid so the agent's spatial state
    // stays consistent regardless of whether AndyWorld.step() reads result.
    env._setRegionChanged = (agentId, newPosition) => {
      if (this.world.regions && typeof this.world.regions.place === 'function') {
        this.world.regions.place(agentId, newPosition);
      }
      // R40/B1 fix: continuous spatial 模式下，active writeback 只同步 RegionGrid，
      // 不同步 SpatialEngine._coords，导致 Phase 5 SpatialEngine.tick()→_syncRegions()
      // 用陈旧坐标反推出旧区域，用 PositionDelta(to:旧区域) 把 agent.position 回滚。
      // 这里把连续坐标对齐到目标区域中心 (regionCenter 不消费 RNG，不破坏确定性，
      // 不漂移 golden fixture)，使 pointToRegion(coords)===newPosition，回滚消失。
      // R41 fix: use _setCoordRaw to avoid per-agent full grid rebuild;
      // spatial.tick() in Phase 5 does the single rebuild.
      if (this.world.spatial && typeof this.world.spatial._setCoordRaw === 'function') {
        const center = this.world.spatial.worldMap.regionCenter(newPosition);
        // R41 P1 fix: handle null from regionCenter (unknown region).
        if (center) {
          this.world.spatial._setCoordRaw(agentId, center.x, center.y);
        }
      }
    };

    return env;
  }
}

module.exports = RuntimeContext;
