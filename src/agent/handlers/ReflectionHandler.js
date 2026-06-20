/**
 * ReflectionHandler - 定期反思
 *
 * 封装 Agent._reflect() + 人格漂移检查。
 * 整合近期记忆、生成洞察、调整基线。
 * 参考: Sentipolis (2025), PIANO (Project Sid), Zhang et al. (2025)
 */
class ReflectionHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行反思检查
   * @param {Object} context - tick 上下文
   */
  tick() {
    const agent = this.agent;

    // 定期反思
    agent._ticksSinceReflection++;
    if (agent._ticksSinceReflection >= agent._reflectionInterval) {
      agent._reflect();
      agent._ticksSinceReflection = 0;
    }

    // 评价偏移衰减
    agent.memory.tickAppraisalBiases();

    // 人格漂移检查（每 100 tick）
    agent._ticksSinceDriftCheck = (agent._ticksSinceDriftCheck || 0) + 1;
    if (agent._ticksSinceDriftCheck >= 100) {
      agent.personality.drift();
      agent._ticksSinceDriftCheck = 0;
    }
  }
}

module.exports = ReflectionHandler;
