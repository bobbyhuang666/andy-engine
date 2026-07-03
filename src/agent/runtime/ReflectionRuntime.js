/**
 * ReflectionRuntime — Reflection and state consequence assessment
 *
 * Extracted from Agent._reflect, _assessStateConsequences, _stateToKeywords.
 * All functions take an `agent` instance as first argument.
 */

const { STATES } = require('../psychology/StateMachine');
const { EMOTION_DIMENSIONS } = require('../../config/defaults');

/**
 * Periodic deep reflection — integrate memories, adjust baselines.
 * @param {Object} agent
 */
function commitStress(agent, stress, env = null) {
  const committer = env?.effectCommitter || null;
  if (committer && typeof committer.commit === 'function') {
    committer.commit({
      deltas: [{
        type: 'emotion',
        target: 'agent',
        agentId: agent.id,
        changes: {},
        multiplier: 1,
        appraisalModifiers: null,
        stress,
      }],
    });
    return;
  }
  agent.emotion.setStress(stress);
}

function commitEmotion(agent, changes, env = null, options = {}) {
  const committer = env?.effectCommitter || null;
  const multiplier = Number.isFinite(options.multiplier) ? options.multiplier : 1;
  const appraisalModifiers = options.appraisalModifiers || null;
  if (committer && typeof committer.commit === 'function') {
    committer.commit({
      deltas: [{
        type: 'emotion',
        target: 'agent',
        agentId: agent.id,
        changes,
        multiplier,
        appraisalModifiers,
        stress: null,
      }],
    });
    return;
  }
  agent.emotion.applyEffect(changes, multiplier, appraisalModifiers);
}

function reflect(agent, env = null) {
  // 1. Memory consolidation
  if (agent.memory.consolidate) {
    agent.memory.consolidate();
  }

  // 1.5 Intrinsic motivation reflection
  if (agent.intrinsicMotivation.curiosity > 0.6) {
    const imStatus = agent.intrinsicMotivation.getStatus();
    if (imStatus.activeGoals > 0) {
      agent.intrinsicMotivation.satisfyCuriosity(0.02);
    }
  }

  // 2. Emotion pattern recognition → baseline adaptation
  // R28 P1-001 fix: route through EmotionVector.adaptBaseline() instead of
  // directly writing emotion.baseline[dim]. Direct writes bypassed EmotionVector's
  // ownership and created undocumented dual drift (20x rate vs _baselineDrift).
  const currentValence = agent.emotion.getValence();
  const adaptRate = 0.002;
  const baselineDrift = {};
  for (const dim of ['joy', 'sadness', 'anger', 'fear', 'calm', 'nervousness']) {
    const current = agent.emotion.current[dim] || 0;
    const base = agent.emotion.baseline[dim] || 0;
    const diff = current - base;

    if (Math.abs(diff) > 0.2) {
      baselineDrift[dim] = diff * adaptRate;
    }
  }
  // Baseline reset protection (clamp) is now handled by adaptBaseline's clampMax param
  agent.emotion.adaptBaseline(baselineDrift, 0.4);

  // 3. Stress reappraisal
  if (currentValence > 0.1 && agent.socialEnergy > 0.3) {
    commitStress(agent, agent.emotion.stress - 0.2, env);
  }
  if (agent.emotion.current.loneliness > 0.3 || agent.emotion.current.sadness > 0.3) {
    commitStress(agent, agent.emotion.stress + 0.1, env);
  }

  // R28 P1-001 fix: baseline reset protection is now handled by
  // adaptBaseline's clampMax parameter, so the direct write loop is removed.
  // Previously: for (dim of EMOTION_DIMENSIONS) agent.emotion.baseline[dim] = Math.max(-0.4, Math.min(0.4, base))
}

/**
 * Assess potential behavior options based on past experience.
 * @param {Object} agent
 * @returns {Object|null}
 */
function assessStateConsequences(agent, env = null) {
  const stateDef = STATES[agent.stateMachine.currentState];
  if (!stateDef || !stateDef.next || stateDef.next.length === 0) return null;

  const candidateStates = stateDef.next;
  const consequences = {};
  let hasData = false;

  const allKeywordsSet = new Set();
  const stateKeywordsMap = {};
  for (const nextState of candidateStates) {
    const kws = stateToKeywords(nextState);
    stateKeywordsMap[nextState] = kws;
    for (const kw of kws) allKeywordsSet.add(kw);
  }

  const batchContext = {
    keywords: [...allKeywordsSet],
    emotion: agent.emotion.current,
    region: agent.position,
  };

  const { memories: allMemories, recallEmotionDelta: consequenceRecallDelta } = agent.memory.retrieve(batchContext, candidateStates.length * 3);

  if (consequenceRecallDelta && Object.keys(consequenceRecallDelta).length > 0) {
    commitEmotion(agent, consequenceRecallDelta, env, { multiplier: 0.5 });
  }

  for (const nextState of candidateStates) {
    const nextStateDef = STATES[nextState];
    if (!nextStateDef) continue;

    const stateKws = stateKeywordsMap[nextState];
    const relevantMemories = allMemories.filter(mem => {
      const content = (mem.content || '').toLowerCase();
      return stateKws.some(kw => content.includes(kw.toLowerCase()));
    }).slice(0, 3);

    if (relevantMemories.length === 0) continue;

    let totalWeight = 0;
    let weightedValence = 0;

    for (const mem of relevantMemories) {
      const memValence = agent.memory._getValence(mem.emotionSnapshot);
      const weight = (mem.importance || 0.5) * (1 + agent.memory._getArousal(mem.emotionSnapshot) * 0.3);
      weightedValence += memValence * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0 && Number.isFinite(weightedValence)) {
      consequences[nextState] = {
        expectedValue: weightedValence / totalWeight,
        sampleSize: relevantMemories.length,
      };
      hasData = true;
    }
  }

  const neuroticism = agent.personality?.ocean?.neuroticism;
  const dampeningFactor = Number.isFinite(neuroticism)
    ? 1.0 - (neuroticism * 0.2)
    : 1.0;
  if (hasData) {
    for (const [, data] of Object.entries(consequences)) {
      if (Number.isFinite(data.expectedValue)) {
        data.expectedValue *= dampeningFactor;
      }
    }
  }

  return hasData ? consequences : null;
}

/**
 * Convert state name to retrieval keywords.
 * @param {string} state
 * @returns {string[]}
 */
function stateToKeywords(state) {
  const keywords = [];
  const parts = state.replace(/^(在|刚|快|还没|困了)/, '').split(/[\s,，]+/);
  for (const p of parts) {
    if (p.length >= 2) keywords.push(p);
  }
  keywords.push(state);
  return keywords;
}

module.exports = { reflect, assessStateConsequences, stateToKeywords };
