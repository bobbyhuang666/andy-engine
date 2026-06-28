/**
 * WorldPressure — 世界压力（只读输入）
 *
 * 计算环境对行为的压力信号。
 * 只读取世界状态，不修改任何状态。
 * 输出供 UtilityScorer 使用。
 */

class WorldPressure {
  /**
   * 计算世界压力
   * @param {Object} world - World 实例（只读）
   * @param {Object} agent - Agent 实例（只读）
   * @param {Object} env - 环境状态 { hour, weather, timeOfDay }
   * @returns {Object} pressure signals
   */
  static compute(world, agent, env) {
    return {
      time: WorldPressure._computeTimePressure(env),
      location: WorldPressure._computeLocationPressure(agent, world),
      social: WorldPressure._computeSocialPressure(agent, world),
      event: WorldPressure._computeEventPressure(world),
    };
  }

  /**
   * 时间压力：深夜/工作时间/用餐时间
   * @private
   */
  static _computeTimePressure(env) {
    if (!env) return { isLateNight: false, isWorkHours: false, isMealTime: false, pressure: 0 };

    const hour = env.hour || 12;
    const isLateNight = hour >= 23 || hour < 6;
    const isWorkHours = hour >= 9 && hour < 17;
    const isMealTime = (hour >= 7 && hour < 9) || (hour >= 12 && hour < 14) || (hour >= 18 && hour < 20);

    let pressure = 0;
    if (isLateNight) pressure = 0.8;
    else if (isMealTime) pressure = 0.5;
    else if (isWorkHours) pressure = 0.3;

    return { isLateNight, isWorkHours, isMealTime, pressure };
  }

  /**
   * 位置压力：拥挤度、天气暴露
   * @private
   */
  static _computeLocationPressure(agent, world) {
    if (!agent || !world) return { crowding: 0, weatherExposure: 0, pressure: 0 };

    const region = agent.position;
    const neighbors = world.regions ? world.regions.getNeighbors(agent.id, 0) : [];
    const crowding = Math.min(1, neighbors.length / 10);

    // 天气暴露
    const weather = world.environment ? world.environment.weather : 'sunny';
    const outdoorRegions = (agent._domain && agent._domain.placeTypes && agent._domain.placeTypes.outdoor) || [];
    const isOutdoor = outdoorRegions.includes(region);
    const weatherExposure = isOutdoor && (weather === 'rain' || weather === 'cold') ? 0.6 : 0;

    return { crowding, weatherExposure, pressure: (crowding + weatherExposure) / 2 };
  }

  /**
   * 社交压力：附近强关系/紧张关系
   * @private
   */
  static _computeSocialPressure(agent, world) {
    if (!agent || !world || !world.socialGraph) return { strongRelations: 0, tension: 0, pressure: 0 };

    const neighbors = world.regions ? world.regions.getNeighbors(agent.id, 0) : [];
    let strongRelations = 0;
    let tension = 0;

    for (const neighborId of neighbors) {
      const rel = world.socialGraph.getRelationship(agent.id, neighborId);
      if (rel) {
        if (rel.strength > 0.6) strongRelations++;
        if (rel.impression && rel.impression.negative > rel.impression.positive * 0.5) tension++;
      }
    }

    const pressure = Math.min(1, (strongRelations * 0.1 + tension * 0.2));
    return { strongRelations, tension, pressure };
  }

  /**
   * 事件压力：最近公共事件
   * @private
   */
  static _computeEventPressure(world) {
    if (!world || !world.eventDispatcher) return { recentEvents: 0, pressure: 0 };

    const recentEvents = world.eventDispatcher.eventLog.slice(-10);
    const publicEvents = recentEvents.filter(e => e.scope === 'public');
    const pressure = Math.min(1, publicEvents.length * 0.1);

    return { recentEvents: publicEvents.length, pressure };
  }
}

module.exports = { WorldPressure };
