/**
 * WorldPressure — 兼容性包装层
 *
 * 从 src/pressure/WorldPressure.js 重新导出。
 * 保持原有函数签名不变，确保向后兼容。
 *
 * @deprecated 使用 require('../src/pressure').WorldPressure 代替
 */

const { WorldPressure } = require('../src/pressure/WorldPressure');

/**
 * 计算世界压力（兼容旧接口）
 *
 * @param {Object} context
 * @param {Object} context.world - world 状态快照
 * @param {Object} context.agent - agent 状态快照
 * @param {Object[]} context.events - 最近事件列表
 * @returns {Object} pressureDeltas
 */
function computeWorldPressure(context) {
  return WorldPressure.compute(context);
}

function computeTimePressure(world) {
  return WorldPressure.computeTime(world);
}

function computeLocationPressure(agent) {
  return WorldPressure.computeLocation(agent);
}

function computeCrowdingPressure(agent) {
  return WorldPressure.computeCrowding(agent);
}

function computeEventPressure(events) {
  return WorldPressure.computeEvent(events);
}

module.exports = {
  computeWorldPressure,
  computeTimePressure,
  computeLocationPressure,
  computeCrowdingPressure,
  computeEventPressure,
};
