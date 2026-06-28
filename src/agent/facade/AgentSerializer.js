/**
 * AgentSerializer — Serialization output
 *
 * Extracted from Agent.toJSON.
 * Produces the exact same snapshot shape as the original method.
 */

/**
 * Serialize agent state to JSON.
 * @param {Object} agent
 * @returns {Object}
 */
function toJSON(agent) {
  return {
    id: agent.id,
    name: agent.name,
    personality: agent.personality.toJSON(),
    emotion: agent.emotion.toJSON(),
    stateMachine: agent.stateMachine.toJSON(),
    behaviorField: agent.behaviorField.toJSON(),
    memory: agent.memory.toJSON(),
    appraisalBiases: agent.memory.biasesToJSON(),
    proceduralMemory: agent.proceduralMemory.toJSON(),
    schedule: agent.schedule.toJSON(),
    needs: agent.needs.toJSON(),
    emotionRegulation: agent.emotionRegulation.toJSON(),
    intrinsicMotivation: agent.intrinsicMotivation.toJSON(),
    // R15 fix: persist futureTendency to preserve behavioral tendencies across save/restore.
    // Without this, all accumulated location-based behavioral tendencies are lost after
    // a serialization round-trip, breaking continuity in long-running simulations.
    futureTendency: agent.futureTendency ? agent.futureTendency.toJSON() : null,
    position: agent.position,
    socialEnergy: agent.socialEnergy,
    health: agent.health,
    isOnline: agent.isOnline,
    _actionTraceHistory: (agent._actionTraceHistory || []).map(t => ({ ...t })),
    // W1: 持久化 reflection 周期计数器（恢复后续跑 consolidate/drift 时机一致）
    _ticksSinceReflection: agent._ticksSinceReflection,
    _ticksSinceDriftCheck: agent._ticksSinceDriftCheck,
  };
}

module.exports = { toJSON };
