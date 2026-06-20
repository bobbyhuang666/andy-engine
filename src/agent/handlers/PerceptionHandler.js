/**
 * PerceptionHandler - 感知事件处理
 *
 * 封装 Agent._perceiveEvents() + futureTendency 衰减。
 * 事件处理管线：认知评价 → 情绪反应 → 记忆存储。
 */
class PerceptionHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行感知处理
   * @param {Object} context - tick 上下文
   * @param {Object[]} context.safeEvents - 安全事件数组
   */
  tick(context) {
    this.agent._perceiveEvents(context.safeEvents);

    if (this.agent.futureTendency) {
      this.agent.futureTendency.decay();
    }
  }
}

module.exports = PerceptionHandler;
