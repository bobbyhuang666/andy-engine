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
    emotion: (() => {
      const raw = agent.emotion.toJSON();
      // R117-008: sanitize NaN values in emotion dimensions (defense-in-depth;
      // _clamp() repairs NaN each tick, but toJSON() can be called outside the tick cycle).
      const sanitized = {};
      for (const dim of Object.keys(raw.current || {})) {
        const v = raw.current[dim];
        sanitized[dim] = Number.isFinite(v) ? v : 0;
      }
      const sanitizedMood = {};
      for (const dim of Object.keys(raw.mood || {})) {
        const v = raw.mood[dim];
        sanitizedMood[dim] = Number.isFinite(v) ? v : 0;
      }
      return { ...raw, current: sanitized, mood: sanitizedMood };
    })(),
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
    // R117-009: guard against NaN in scalar agent properties.
    socialEnergy: Number.isFinite(agent.socialEnergy) ? agent.socialEnergy : 0.7,
    health: Number.isFinite(agent.health) ? agent.health : 1,
    isOnline: agent.isOnline,
    _actionTraceHistory: (agent._actionTraceHistory || []).map(t => JSON.parse(JSON.stringify(t))),
    _perceivedEventIds: Array.from(agent._perceivedEventIds || []).slice(-500),
    // W1: 持久化 reflection 周期计数器（恢复后续跑 consolidate/drift 时机一致）
    _ticksSinceReflection: agent._ticksSinceReflection,
    _ticksSinceDriftCheck: agent._ticksSinceDriftCheck,
  };
}

module.exports = { toJSON };
