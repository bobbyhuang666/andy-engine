/**
 * SocialHandler - 社交能量更新
 *
 * 封装 Agent._updateSocialEnergy()。
 * 基于 BehaviorField 的 sociality 维度连续变化社交能量。
 */
const { DIM_SOCIALITY } = require('../../../agent/BehaviorLabeler');

class SocialHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行社交能量更新
   * @param {Object} context - tick 上下文
   * @param {number} context.hoursElapsed - 本 tick 经过的小时数
   */
  tick(context) {
    this.agent._updateSocialEnergy(context.hoursElapsed);
  }
}

module.exports = SocialHandler;
