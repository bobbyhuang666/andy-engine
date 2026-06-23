/**
 * BasicAffectFrame — Extended structured affect snapshot
 *
 * Extends the basic AffectFrame with additional fields for
 * expression constraints and interpersonal posture.
 *
 * This is a SEAM, not a full AffectCompiler. It does NOT include:
 * - full commercial AffectCompiler features
 * - LLM decision-making for real psychology
 * - direct EmotionVector natural language conversion
 *
 * @module src/shared/BasicAffectFrame
 */

const { buildAffectFrame } = require('./AffectFrame');

/**
 * Build a BasicAffectFrame from an agent's existing psychology subsystems.
 *
 * @param {Object} agent - Agent with .emotion, .needs, .behaviorField, .socialGraph
 * @returns {Object} BasicAffectFrame snapshot
 */
function buildBasicAffectFrame(agent) {
  if (!agent) {
    return _emptyFrame();
  }

  // Get base AffectFrame
  const baseFrame = buildAffectFrame(agent);
  
  // Extract additional fields
  const valenceBand = _extractValenceBand(baseFrame.valence);
  const arousalBand = _extractArousalBand(baseFrame.arousal);
  const interpersonalPosture = _extractInterpersonalPosture(agent, baseFrame);
  const warmth = _extractWarmth(agent, baseFrame);
  const directness = _extractDirectness(agent, baseFrame);
  const initiative = _extractInitiative(agent, baseFrame);
  const defensiveness = _extractDefensiveness(agent, baseFrame);
  const emotionalExplicitness = _extractEmotionalExplicitness(agent, baseFrame);
  const forbiddenModes = _extractForbiddenModes(agent, baseFrame);
  const visibleMicroBehaviors = _extractVisibleMicroBehaviors(agent, baseFrame);

  return {
    ...baseFrame,
    valenceBand,
    arousalBand,
    interpersonalPosture,
    warmth,
    directness,
    initiative,
    defensiveness,
    emotionalExplicitness,
    forbiddenModes,
    visibleMicroBehaviors,
    _meta: { version: '0.2-basic-seam' },
  };
}

function _extractValenceBand(valence) {
  if (valence < -0.2) return 'negative';
  if (valence > 0.2) return 'positive';
  return 'neutral';
}

function _extractArousalBand(arousal) {
  if (arousal < 0.3) return 'low';
  if (arousal > 0.7) return 'high';
  return 'medium';
}

function _extractInterpersonalPosture(agent, frame) {
  // Simple heuristic based on sociality and warmth
  const sociality = frame.behavior.sociality;
  const warmth = _extractWarmth(agent, frame);
  
  if (sociality > 0.6 && warmth > 0.5) return 'open';
  if (sociality < 0.4 && warmth < 0.4) return 'guarded';
  if (sociality > 0.5 && warmth > 0.6) return 'attached';
  if (sociality < 0.3 && warmth < 0.3) return 'avoidant';
  return 'neutral';
}

function _extractWarmth(agent, frame) {
  // Based on positive emotions and sociality
  const positiveEmotions = frame.emotions.filter(e => e.intensity > 0);
  const positiveSum = positiveEmotions.reduce((sum, e) => sum + e.intensity, 0);
  const sociality = frame.behavior.sociality;
  
  return Math.min(1, (positiveSum * 0.5 + sociality * 0.5));
}

function _extractDirectness(agent, frame) {
  // Based on expressiveness and focus
  const expressiveness = frame.behavior.expressiveness;
  const focus = frame.behavior.focus;
  
  return Math.min(1, (expressiveness * 0.6 + focus * 0.4));
}

function _extractInitiative(agent, frame) {
  // Based on activity and arousal
  const activity = frame.behavior.activity;
  const arousal = frame.arousal;
  
  return Math.min(1, (activity * 0.5 + arousal * 0.5));
}

function _extractDefensiveness(agent, frame) {
  // Based on negative emotions and low sociality
  const negativeEmotions = frame.emotions.filter(e => e.intensity < 0);
  const negativeSum = negativeEmotions.reduce((sum, e) => sum + Math.abs(e.intensity), 0);
  const sociality = frame.behavior.sociality;
  
  return Math.min(1, (negativeSum * 0.6 + (1 - sociality) * 0.4));
}

function _extractEmotionalExplicitness(agent, frame) {
  // Based on arousal and expressiveness
  const arousal = frame.arousal;
  const expressiveness = frame.behavior.expressiveness;
  
  return Math.min(1, (arousal * 0.5 + expressiveness * 0.5));
}

function _extractForbiddenModes(agent, frame) {
  const modes = [];
  
  // High defensiveness forbids direct emotional expression
  const defensiveness = _extractDefensiveness(agent, frame);
  if (defensiveness > 0.7) {
    modes.push('direct_emotional_expression');
  }
  
  // Low warmth forbids intimate expression
  const warmth = _extractWarmth(agent, frame);
  if (warmth < 0.3) {
    modes.push('intimate_expression');
  }
  
  // High arousal forbids calm expression
  if (frame.arousal > 0.8) {
    modes.push('calm_expression');
  }
  
  return modes;
}

function _extractVisibleMicroBehaviors(agent, frame) {
  const behaviors = [];
  
  // High arousal → fidgeting
  if (frame.arousal > 0.7) {
    behaviors.push('fidgeting');
  }
  
  // Low focus → looking around
  if (frame.behavior.focus < 0.3) {
    behaviors.push('looking_around');
  }
  
  // High expressiveness → gesturing
  if (frame.behavior.expressiveness > 0.6) {
    behaviors.push('gesturing');
  }
  
  // Low sociality → avoiding eye contact
  if (frame.behavior.sociality < 0.3) {
    behaviors.push('avoiding_eye_contact');
  }
  
  return behaviors;
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
    valenceBand: 'neutral',
    arousalBand: 'medium',
    interpersonalPosture: 'neutral',
    warmth: 0.5,
    directness: 0.5,
    initiative: 0.5,
    defensiveness: 0.5,
    emotionalExplicitness: 0.5,
    forbiddenModes: [],
    visibleMicroBehaviors: [],
    _meta: { version: '0.2-basic-seam' },
  };
}

module.exports = { buildBasicAffectFrame };
