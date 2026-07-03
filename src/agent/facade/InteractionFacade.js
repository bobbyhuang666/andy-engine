/**
 * InteractionFacade — Agent interaction logic
 *
 * Extracted from Agent.interact, _calculateInteractionValence, _personalityCompatibility.
 */

const { EmotionDelta } = require('../../effects/EmotionDelta');
const { MemoryDelta } = require('../../effects/MemoryDelta');
const { RelationshipDelta } = require('../../effects/RelationshipDelta');
const { getEffectCommitter } = require('../runtime/EffectCommitterResolver');

/**
 * Interact with another agent (passive receiver).
 * @param {Object} agent
 * @param {Object} other
 * @param {string} interactionType
 * @returns {Object}
 */
function interact(agent, other, interactionType = 'talk') {
  const valence = calculateInteractionValence(agent, other, interactionType);

  // R37 P1 fix: NaN ?? 0 = NaN (nullish coalescing doesn't catch NaN).
  // If getValence returns NaN from corrupted emotion, NaN propagates into
  // moodInfluence and emotionDelta, silently producing zero emotional effect
  // (applyEffect rejects NaN deltas). Use Number.isFinite to default to 0.
  const otherMood = (() => {
    const v = other.emotion?.getValence?.();
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  })();
  const moodInfluence = otherMood * 0.3;

  const emotionDelta = {
    joy: valence > 0 ? valence * 0.2 : 0,
    loneliness: -Math.abs(valence) * 0.1,
    interest: valence * 0.1,
  };

  if (moodInfluence > 0.05) {
    emotionDelta.joy += moodInfluence * 0.1;
    emotionDelta.contentment = moodInfluence * 0.05;
  } else if (moodInfluence < -0.05) {
    emotionDelta.sadness = Math.abs(moodInfluence) * 0.05;
    emotionDelta.nervousness = Math.abs(moodInfluence) * 0.03;
  }

  const memoryEvent = {
    content: `和${other.name}${interactionType === 'talk' ? '聊了天' : interactionType === 'help' ? '互相帮助' : interactionType === 'conflict' ? '发生了冲突' : '擦肩而过'}`,
    type: 'social',
    effects: [],
    _region: agent.position,
    _currentState: agent.stateMachine.currentState,
  };

  const deltas = [
    new EmotionDelta(agent.id, emotionDelta),
    new MemoryDelta(agent.id, {
      kind: 'candidate',
      type: 'social',
      content: memoryEvent.content,
      event: memoryEvent,
    }),
  ];

  if (other?.id) {
    deltas.push(new RelationshipDelta(agent.id, {
      targetAgentId: other.id,
      interactionType,
      valence,
      content: memoryEvent.content,
    }));
  }

  getEffectCommitter(agent).commit({ deltas });

  return {
    valence: valence + moodInfluence,
    type: interactionType,
    myEmotionChange: emotionDelta,
  };
}

/**
 * Calculate interaction valence.
 * @param {Object} agent
 * @param {Object} other
 * @param {string} type
 * @returns {number}
 */
function calculateInteractionValence(agent, other, type) {
  // R37 P1 fix: same NaN guard as otherMood above
  const myValence = (() => {
    const v = agent.emotion?.getValence?.();
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  })();

  let baseValence = 0.3;
  baseValence += myValence * 0.2;

  const compat = personalityCompatibility(agent, other);
  baseValence += compat * 0.3;

  switch (type) {
    case 'talk': baseValence *= 1.0; break;
    case 'help': baseValence *= 1.3; break;
    case 'conflict': baseValence = -0.5; break;
    case 'ignore': baseValence = -0.1; break;
  }

  return Math.max(-1, Math.min(1, baseValence));
}

/**
 * Personality compatibility calculation.
 * @param {Object} agent
 * @param {Object} other
 * @returns {number}
 */
function personalityCompatibility(agent, other) {
  const myO = agent.personality?.ocean;
  const otherO = other.personality?.ocean;
  if (!myO || !otherO) return 0.5;

  const opennessDiff = Math.abs(myO.openness - otherO.openness);
  const agreeDiff = Math.abs(myO.agreeableness - otherO.agreeableness);
  const extraDiff = Math.abs(myO.extraversion - otherO.extraversion);
  const consDiff = Math.abs(myO.conscientiousness - otherO.conscientiousness);
  const neuroDiff = Math.abs(myO.neuroticism - otherO.neuroticism);

  const similarity = 1 - (
    opennessDiff * 0.25 +
    agreeDiff * 0.25 +
    extraDiff * 0.15 +
    consDiff * 0.15 +
    neuroDiff * 0.20
  );

  const mbtiBonus = (agent.personality?.mbti && agent.personality.mbti === other.personality?.mbti) ? 0.1 : 0;

  return Math.max(0, Math.min(1, similarity + mbtiBonus));
}

module.exports = { interact, calculateInteractionValence, personalityCompatibility };
