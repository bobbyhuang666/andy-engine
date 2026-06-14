/**
 * WorldPressure — 只读纯模块
 *
 * 从 world context/events/location pressure 计算 score deltas。
 * 不修改输入对象，domain-agnostic，无 hidden domain semantics。
 *
 * 设计原则:
 *   - 纯函数，不修改任何输入
 *   - 不使用 Date.now()，时间从 context 获取
 *   - 位置压力读 agent.locationPressure / agent.locationValence，不解析 position 字符串
 *   - 事件压力读 event.pressure / event.valence，不匹配事件类型名称
 */

/**
 * 计算世界压力
 *
 * @param {Object} context
 * @param {Object} context.world - world 状态快照
 * @param {Object} context.agent - agent 状态快照
 * @param {Object[]} context.events - 最近事件列表
 * @returns {Object} pressureDeltas
 */
function computeWorldPressure(context) {
  const { world, agent, events } = context;

  const pressure = {
    time: computeTimePressure(world),
    location: computeLocationPressure(agent),
    crowding: computeCrowdingPressure(agent),
    event: computeEventPressure(events),
    total: 0,
  };

  pressure.total = pressure.time + pressure.location + pressure.crowding + pressure.event;

  return pressure;
}

/**
 * 时间压力（只读）— 基于 UTC hour，core concept
 */
function computeTimePressure(world) {
  if (!world || !world.time) return 0;

  const hour = new Date(world.time).getUTCHours();

  if (hour >= 23 || hour < 6) return 0.6;
  if (hour >= 6 && hour < 9) return 0.2;
  if (hour >= 18 && hour < 23) return 0.3;

  return 0;
}

/**
 * 位置压力（只读）— 读 agent 结构化字段，不解析 position 字符串
 *
 * 如果 agent 挂载了 locationPressure 或 locationValence 则使用；
 * 否则返回 0（不猜测位置语义）。
 */
function computeLocationPressure(agent) {
  if (!agent) return 0;

  if (typeof agent.locationPressure === 'number') return agent.locationPressure;
  if (typeof agent.locationValence === 'number') return -agent.locationValence;

  return 0;
}

/**
 * 拥挤压力（只读）— 基于 nearbyAgents 长度，结构化数据
 */
function computeCrowdingPressure(agent) {
  if (!agent || !agent.nearbyAgents) return 0;

  const count = agent.nearbyAgents.length;
  if (count > 5) return 0.4;
  if (count > 2) return 0.2;

  return 0;
}

/**
 * 事件压力（只读）— 读 event.pressure 或 event.valence，不匹配事件类型名
 *
 * 每个事件可带:
 *   event.pressure: 直接压力值（数字）
 *   event.valence:  效价（负值增加压力，正值减少压力）
 */
function computeEventPressure(events) {
  if (!events || events.length === 0) return 0;

  let total = 0;
  for (const evt of events) {
    if (typeof evt.pressure === 'number') {
      total += evt.pressure;
    } else if (typeof evt.valence === 'number') {
      // 负 valence → 正压力，正 valence → 负压力
      total -= evt.valence;
    }
  }

  return Math.max(-1, Math.min(1, total));
}

module.exports = {
  computeWorldPressure,
  computeTimePressure,
  computeLocationPressure,
  computeCrowdingPressure,
  computeEventPressure,
};
