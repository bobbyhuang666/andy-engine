/**
 * AffectFrame — Structured affect snapshot (seam)
 *
 * Pure function module that derives a structured affect snapshot
 * from already-existing agent subsystems (EmotionVector, NeedsSystem,
 * BehaviorField).
 *
 * This is a SEAM, not a full AffectCompiler. It does NOT include:
 * - trend detection (no history buffer yet)
 * - social energy (no SocialGraph access yet)
 * - regulation state (no EmotionRegulation access yet)
 * - stability computation (placeholder 0.5)
 *
 * @module src/shared/AffectFrame
 */

const BEHAVIOR_DIMS = ['activity', 'sociality', 'focus', 'expressiveness'];

/**
 * Build a structured AffectFrame from an agent's existing psychology subsystems.
 *
 * @param {Object} agent - Agent with .emotion, .needs, .behaviorField
 * @returns {Object} AffectFrame snapshot
 */
function buildAffectFrame(agent) {
  if (!agent) {
    return _emptyFrame();
  }

  const emotions = _extractEmotions(agent);
  const valence = _extractValence(agent);
  const arousal = _extractArousal(agent);
  const needs = _extractNeeds(agent);
  const behavior = _extractBehavior(agent);
  const behaviorSpeed = _extractBehaviorSpeed(agent);

  return {
    emotions,
    valence,
    arousal,
    needs,
    behavior,
    behaviorSpeed,
    stability: 0.5,
    _meta: { version: '0.1-seam' },
  };
}

function _extractEmotions(agent) {
  if (!agent.emotion || typeof agent.emotion.getDominant !== 'function') {
    return [];
  }
  const dominant = agent.emotion.getDominant(5);
  return dominant
    .filter(e => Math.abs(e.value) >= 0.1)
    .map(e => ({ dimension: e.dimension, intensity: e.value }));
}

function _extractValence(agent) {
  if (!agent.emotion || typeof agent.emotion.getValence !== 'function') {
    return 0;
  }
  return agent.emotion.getValence();
}

function _extractArousal(agent) {
  if (!agent.emotion || typeof agent.emotion.getArousal !== 'function') {
    return 0.5;
  }
  return agent.emotion.getArousal();
}

function _extractNeeds(agent) {
  if (!agent.needs || !agent.needs.needs) {
    return [];
  }
  const result = [];
  for (const [need, value] of Object.entries(agent.needs.needs)) {
    const urgency = 1 - value;
    if (urgency >= 0.3) {
      result.push({ need, urgency });
    }
  }
  return result;
}

function _extractBehavior(agent) {
  if (!agent.behaviorField || !agent.behaviorField.B) {
    return { activity: 0, sociality: 0, focus: 0, expressiveness: 0 };
  }
  const B = agent.behaviorField.B;
  return {
    activity: B[0] || 0,
    sociality: B[1] || 0,
    focus: B[2] || 0,
    expressiveness: B[3] || 0,
  };
}

function _extractBehaviorSpeed(agent) {
  if (!agent.behaviorField || typeof agent.behaviorField.speed !== 'number') {
    return 0;
  }
  return agent.behaviorField.speed;
}

function _emptyFrame() {
  return {
    emotions: [],
    valence: 0,
    arousal: 0.5,
    needs: [],
    behavior: { activity: 0, sociality: 0, focus: 0, expressiveness: 0 },
    behaviorSpeed: 0,
    stability: 0.5,
    _meta: { version: '0.1-seam' },
  };
}

module.exports = { buildAffectFrame };
