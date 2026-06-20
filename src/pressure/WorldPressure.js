/**
 * WorldPressure — 世界压力层
 *
 * 纯函数/只读模块，从 world context/events 计算压力向量。
 * 不修改输入，domain-agnostic。
 */

class WorldPressure {
  /**
   * @param {Object} context
   * @param {Object} context.world - world 状态快照
   * @param {Object} context.agent - agent 状态快照
   * @param {Object[]} context.events - 最近事件列表
   * @returns {Object} pressure { time, location, crowding, event, total }
   */
  static compute(context) {
    const { world, agent, events } = context;

    const pressure = {
      time: WorldPressure.computeTime(world),
      location: WorldPressure.computeLocation(agent),
      crowding: WorldPressure.computeCrowding(agent),
      event: WorldPressure.computeEvent(events),
      total: 0,
    };

    pressure.total = pressure.time + pressure.location + pressure.crowding + pressure.event;

    return pressure;
  }

  static computeTime(world) {
    if (!world || !world.time) return 0;
    const hour = new Date(world.time).getUTCHours();
    if (hour >= 23 || hour < 6) return 0.6;
    if (hour >= 6 && hour < 9) return 0.2;
    if (hour >= 18 && hour < 23) return 0.3;
    return 0;
  }

  static computeLocation(agent) {
    if (!agent) return 0;
    if (typeof agent.locationPressure === 'number') return agent.locationPressure;
    if (typeof agent.locationValence === 'number') return -agent.locationValence;
    return 0;
  }

  static computeCrowding(agent) {
    if (!agent || !agent.nearbyAgents) return 0;
    const count = agent.nearbyAgents.length;
    if (count > 5) return 0.4;
    if (count > 2) return 0.2;
    return 0;
  }

  static computeEvent(events) {
    if (!events || events.length === 0) return 0;
    let total = 0;
    for (const evt of events) {
      if (typeof evt.pressure === 'number') {
        total += evt.pressure;
      } else if (typeof evt.valence === 'number') {
        total -= evt.valence;
      }
    }
    return Math.max(-1, Math.min(1, total));
  }
}

module.exports = { WorldPressure };
