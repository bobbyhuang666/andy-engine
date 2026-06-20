/**
 * ActionSelectionHandler - Shadow Action Selection
 *
 * 封装 Agent._runShadowActionSelection()。
 * 只记录 reasonTrace，不应用 stateDeltas（除非 active 模式）。
 */
class ActionSelectionHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行 shadow action selection
   * @param {Object} context - tick 上下文
   * @param {Object} context.env - 环境状态
   * @param {Object} context.result - Agent tick 结果（会被修改）
   */
  tick(context) {
    const actionSelectionEvent = this.agent._runShadowActionSelection(context.env);
    if (actionSelectionEvent) {
      context.result.newEvents.push(actionSelectionEvent);
    }
  }
}

module.exports = ActionSelectionHandler;
