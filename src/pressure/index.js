/**
 * src/pressure — 压力层模块
 *
 * 每个压力层都是纯函数/只读，不修改任何状态。
 * 压力层不选择动作，只提供压力向量。
 */

const { WorldPressure } = require('./WorldPressure');
const { NeedPressure } = require('./NeedPressure');
const { MemoryPressure } = require('./MemoryPressure');
const { RelationshipPressure } = require('./RelationshipPressure');
const { LocationPressure } = require('./LocationPressure');
const { PressureContext } = require('./PressureContext');

module.exports = {
  WorldPressure,
  NeedPressure,
  MemoryPressure,
  RelationshipPressure,
  LocationPressure,
  PressureContext,
};
