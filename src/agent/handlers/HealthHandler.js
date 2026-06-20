/**
 * HealthHandler - 健康系统更新
 *
 * 封装 Agent._updateHealth()。
 * 身体健康受睡眠、压力、天气、营养等因素影响。
 * 参考: Cohen et al. (2012), Irwin (2015)
 */
class HealthHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行健康系统更新
   * @param {Object} context - tick 上下文
   * @param {number} context.hoursElapsed - 本 tick 经过的小时数
   * @param {Object} context.env - 环境状态
   */
  tick(context) {
    this.agent._updateHealth(context.hoursElapsed, context.env);
  }
}

module.exports = HealthHandler;
