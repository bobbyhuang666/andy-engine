/**
 * ReflectionHandler - Periodic reflection
 *
 * Delegates to ReflectionRuntime for core logic.
 * Retains scheduling/timing logic (tick counters).
 */
const { reflect } = require('../runtime/ReflectionRuntime');

class ReflectionHandler {
  constructor(agent) {
    this.agent = agent;
  }

  tick() {
    const agent = this.agent;

    // Periodic reflection
    agent._ticksSinceReflection++;
    if (agent._ticksSinceReflection >= agent._reflectionInterval) {
      reflect(agent);
      agent._ticksSinceReflection = 0;
    }

    // Appraisal bias decay
    agent.memory.tickAppraisalBiases();

    // Personality drift check (every 100 ticks)
    agent._ticksSinceDriftCheck = (agent._ticksSinceDriftCheck || 0) + 1;
    if (agent._ticksSinceDriftCheck >= 100) {
      agent.personality.drift();
      agent._ticksSinceDriftCheck = 0;
    }
  }
}

module.exports = ReflectionHandler;
