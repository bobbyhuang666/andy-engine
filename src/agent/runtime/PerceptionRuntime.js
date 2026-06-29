/**
 * PerceptionRuntime — Event perception pipeline
 *
 * Extracted from Agent._perceiveEvents.
 * All functions take an `agent` instance as first argument.
 */

const Appraisal = require('../psychology/Appraisal');

/**
 * Perceive and process events (cognitive appraisal pipeline).
 * @param {Object} agent
 * @param {Object[]} events
 */
function perceiveEvents(agent, events) {
  // P0: rebuild recent event types set at tick start (for Appraisal._evalSuddenness O(1) lookup)
  agent._recentEventTypes.clear();
  for (const event of events) {
    if (event.type) agent._recentEventTypes.add(event.type);
  }

  for (const event of events) {
    // Step 1: Cognitive Appraisal
    const appraisal = Appraisal.evaluate(event, agent);

    // Step 2: Appraisal-modulated emotion reaction
    // R34 P2 fix: defensive guard against events without effects array.
    // EventDispatcher always sets effects: [], but events from other sources
    // (injected, deserialized) may lack this field, which would crash the
    // entire perception loop for that agent.
    for (const effect of (event.effects || [])) {
      if (effect.target === agent.id && effect.type === 'emotion') {
        agent.emotion.applyEffect(effect.delta, 1, appraisal.emotionModifier);
      }
    }

    // High-importance events directly affect emotion
    if (appraisal.importance > 0.5) {
      const importantDelta = {};
      if (appraisal.dimensions.suddenness > 0.6) {
        importantDelta.surprise = appraisal.dimensions.suddenness * 0.03;
      }
      if (appraisal.dimensions.copingPotential < 0.3) {
        importantDelta.nervousness = 0.02;
      }
      if (Object.keys(importantDelta).length > 0) {
        agent.emotion.applyEffect(importantDelta);
      }
    }

    // Step 3: Appraisal-tagged memory storage
    agent.personality.recordEventForDrift({
      type: event.type || 'general',
      valence: appraisal.dimensions.pleasantness,
      isNegative: appraisal.dimensions.pleasantness < -0.15,
      highStress: agent.emotion.stress > 6,
    });

    // Significant event → create Appraisal Bias
    if (appraisal.importance > 0.7 && appraisal.dimensions.pleasantness < -0.2) {
      const eventType = event.type || 'general';
      agent.memory.addAppraisalBias({
        eventType: eventType === 'interaction' ? 'social' : eventType,
        valenceShift: appraisal.dimensions.pleasantness * 0.3,
        decay: 0.0005,
        reason: (event.content || '').slice(0, 30),
      });
    }

    if (event.content) {
      const enrichedEvent = {
        ...event,
        _appraisal: {
          valence: appraisal.dimensions.pleasantness,
          suddenness: appraisal.dimensions.suddenness,
          goalRelevance: appraisal.dimensions.goalRelevance,
          copingPotential: appraisal.dimensions.copingPotential,
          agency: appraisal.dimensions.agency.label,
          importance: appraisal.importance,
        },
        _region: agent.position,
        _currentState: agent.stateMachine.currentState,
      };
      agent.memory.addExperience(enrichedEvent, agent.emotion, appraisal.importance);
    }

    // Stress update
    if (appraisal.dimensions.pleasantness < 0) {
      const stressIncrease = Math.abs(appraisal.dimensions.pleasantness) * appraisal.importance * 0.8;
      agent.emotion.setStress(agent.emotion.stress + Math.max(0.05, stressIncrease));
    } else if (appraisal.dimensions.pleasantness > 0.2) {
      agent.emotion.setStress(agent.emotion.stress - 0.15);
    }
  }
}

module.exports = { perceiveEvents };
