/**
 * MindWanderHandler - 心智游移（Default Mode Network）
 *
 * 封装 Agent._mindWander()。
 * 在空闲状态下（低活跃 + 低专注），Agent 思绪自发飘向记忆、幻想、担忧等。
 * 参考: Raichle (2001), Killingsworth & Gilbert (2010), Bower (1981)
 */
const { DIM_ACTIVITY, DIM_FOCUS } = require('../../../agent/BehaviorLabeler');
const { ANDY_DEFAULTS } = require('../../../config/defaults');

class MindWanderHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行心智游移检查
   * @param {Object} context - tick 上下文
   * @param {Object} context.result - Agent tick 结果（会被修改）
   */
  tick(context) {
    const agent = this.agent;
    const B = agent.behaviorField.B;
    const isQuiet = B[DIM_ACTIVITY] < 0.3 && B[DIM_FOCUS] < 0.3;

    if (isQuiet) {
      if (agent._rand() < (ANDY_DEFAULTS.mindWander?.quietProbability || 0.25)) {
        const thought = agent._mindWander();
        if (thought) {
          context.result.newEvents.push(thought);
        }
      }
    }
  }
}

module.exports = MindWanderHandler;
