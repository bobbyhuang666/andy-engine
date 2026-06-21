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
    position: agent.position,
    socialEnergy: agent.socialEnergy,
    health: agent.health,
    isOnline: agent.isOnline,
    _actionTraceHistory: agent._actionTraceHistory,
  };
}

module.exports = { toJSON };
