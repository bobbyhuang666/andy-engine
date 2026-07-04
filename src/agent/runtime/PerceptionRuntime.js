/**
 * PerceptionRuntime — Event perception pipeline
 *
 * Extracted from Agent._perceiveEvents.
 * All functions take an `agent` instance as first argument.
 */

const Appraisal = require('../psychology/Appraisal');
const { EffectResult } = require('../../effects/EffectResult');
const { EmotionDelta } = require('../../effects/EmotionDelta');
const { MemoryDelta } = require('../../effects/MemoryDelta');
const { getEffectCommitter } = require('./EffectCommitterResolver');

function commitDeltas(agent, env, deltas) {
  const committer = getEffectCommitter(agent, env);
  committer.commit(new EffectResult({
    event: {},
    deltas,
    reasonTrace: {},
  }));
}

function memoryDelta(agent, event, importance) {
  return new MemoryDelta(agent.id, {
    kind: 'candidate',
    type: event.type,
    content: event.content,
    event,
    importance,
  });
}

/**
 * Perceive and process events (cognitive appraisal pipeline).
 * @param {Object} agent
 * @param {Object[]} events
 */
function perceiveEvents(agent, events, env = null) {
  if (!agent._perceivedEventIds) agent._perceivedEventIds = new Set();
  if (!agent._recentEventTypes) agent._recentEventTypes = new Set();
  agent._recentEventTypes.clear();
  const newEvents = [];
  for (const event of events) {
    if (event && event.id) {
      if (agent._perceivedEventIds.has(event.id)) continue;
      agent._perceivedEventIds.add(event.id);
      if (agent._perceivedEventIds.size > 500) {
        const oldest = agent._perceivedEventIds.values().next().value;
        agent._perceivedEventIds.delete(oldest);
      }
    }
    newEvents.push(event);
    if (event.type) agent._recentEventTypes.add(event.type);
  }

  for (const event of newEvents) {
    const deltas = [];
    // Step 1: Cognitive Appraisal
    const appraisal = Appraisal.evaluate(event, agent);

    // Step 2: Appraisal-modulated emotion reaction
    // R34 P2 fix: defensive guard against events without effects array.
    // EventDispatcher always sets effects: [], but events from other sources
    // (injected, deserialized) may lack this field, which would crash the
    // entire perception loop for that agent.
    for (const effect of (event.effects || [])) {
      if (effect.target === agent.id && effect.type === 'emotion') {
        deltas.push(new EmotionDelta(agent.id, effect.delta, {
          multiplier: 1,
          appraisalModifiers: appraisal.emotionModifier,
        }));
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
        deltas.push(new EmotionDelta(agent.id, importantDelta));
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
      deltas.push(new MemoryDelta(agent.id, {
        kind: 'appraisalBias',
        bias: {
          eventType: eventType === 'interaction' ? 'social' : eventType,
          valenceShift: appraisal.dimensions.pleasantness * 0.3,
          decay: 0.0005,
          reason: (event.content || '').slice(0, 30),
        },
      }));
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
      deltas.push(memoryDelta(agent, enrichedEvent, appraisal.importance));
    }

    // Stress update
    if (appraisal.dimensions.pleasantness < 0) {
      const stressIncrease = Math.abs(appraisal.dimensions.pleasantness) * appraisal.importance * 0.8;
      deltas.push(new EmotionDelta(agent.id, {}, {
        stress: agent.emotion.stress + Math.max(0.05, stressIncrease),
      }));
    } else if (appraisal.dimensions.pleasantness > 0.2) {
      deltas.push(new EmotionDelta(agent.id, {}, {
        stress: Math.max(0, agent.emotion.stress - 0.15),
      }));
    }

    if (deltas.length > 0) {
      commitDeltas(agent, env, deltas);
    }
  }
}

module.exports = { perceiveEvents };
