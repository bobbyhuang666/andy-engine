/**
 * PressureContext — 压力上下文
 *
 * 将所有压力层聚合为统一上下文，传递给 UtilityScorer。
 * 不暴露内部状态，只提供只读访问。
 */

const { WorldPressure } = require('./WorldPressure');
const { NeedPressure } = require('./NeedPressure');
const { MemoryPressure } = require('./MemoryPressure');
const { RelationshipPressure } = require('./RelationshipPressure');
const { LocationPressure } = require('./LocationPressure');

class PressureContext {
  /**
   * @param {Object} params
   * @param {Object} params.worldPressure - WorldPressure.compute() 输出
   * @param {Object} params.needPressure - NeedPressure.compute() 输出
   * @param {Object} params.memoryPressure - MemoryPressure.compute() 输出
   * @param {Object} params.relationshipPressure - RelationshipPressure.compute() 输出
   * @param {Object} params.locationPressure - LocationPressure.compute() 输出
   */
  constructor({ worldPressure, needPressure, memoryPressure, relationshipPressure, locationPressure }) {
    this.world = worldPressure;
    this.needs = needPressure;
    this.memory = memoryPressure;
    this.relationship = relationshipPressure;
    this.location = locationPressure;
  }

  /**
   * 从 agent + world 快照构建完整 PressureContext
   *
   * @param {Object} context
   * @param {Object} context.world - world 状态快照
   * @param {Object} context.agent - agent 状态快照
   * @param {Object[]} context.events - 最近事件列表
   * @returns {PressureContext}
   */
  static fromSnapshot(context) {
    const { world, agent, events } = context;

    return new PressureContext({
      worldPressure: WorldPressure.compute({ world, agent, events }),
      needPressure: NeedPressure.compute(agent),
      memoryPressure: MemoryPressure.compute(agent),
      relationshipPressure: RelationshipPressure.compute(agent),
      locationPressure: LocationPressure.compute(agent),
    });
  }

  /**
   * 传递给 UtilityScorer 的只读上下文
   * @returns {Object}
   */
  toScorerContext() {
    return {
      world: this.world,
      needs: this.needs,
      memory: this.memory,
      relationship: this.relationship,
      location: this.location,
    };
  }

  /**
   * 获取所有压力层的总压力
   * @returns {number}
   */
  getTotalPressure() {
    return (
      (this.world?.total || 0) +
      (this.needs?.total || 0) +
      (this.memory?.total || 0) +
      (this.relationship?.total || 0) +
      (this.location?.total || 0)
    ) / 5;
  }
}

module.exports = { PressureContext };
