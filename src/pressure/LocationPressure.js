/**
 * LocationPressure — 地点压力层
 *
 * 纯函数/只读模块，从 agent 位置信息计算地点压力。
 *
 * 压力来源：
 *   - 位置固有压力（locationPressure 字段）
 *   - 位置效价（locationValence 字段，取反）
 *   - 拥挤度（nearbyAgents 数量）
 */

class LocationPressure {
  /**
   * @param {Object} agentSnapshot - agent 状态快照（只读）
   * @returns {Object} pressure - { inherent, crowding, total }
   */
  static compute(agentSnapshot) {
    if (!agentSnapshot) {
      return { inherent: 0, crowding: 0, total: 0 };
    }

    const inherent = LocationPressure.computeInherent(agentSnapshot);
    const crowding = LocationPressure.computeCrowding(agentSnapshot);
    const total = Math.max(0, Math.min(1, inherent + crowding));

    return { inherent, crowding, total };
  }

  /**
   * 计算位置固有压力
   */
  static computeInherent(agent) {
    // R22 P1 fix: use Number.isFinite() to block NaN
    if (typeof agent.locationPressure === 'number' && Number.isFinite(agent.locationPressure)) return agent.locationPressure;
    if (typeof agent.locationValence === 'number' && Number.isFinite(agent.locationValence)) return -agent.locationValence;
    return 0;
  }

  /**
   * 计算拥挤压力
   */
  static computeCrowding(agent) {
    if (!agent || !agent.nearbyAgents) return 0;
    const count = agent.nearbyAgents.length;
    if (count > 5) return 0.4;
    if (count > 2) return 0.2;
    return 0;
  }
}

module.exports = { LocationPressure };
