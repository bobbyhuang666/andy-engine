/**
 * AffectCompiler — 从 EmotionVector / Needs / BehaviorField 提取并计算 AffectFrame
 *
 * 纯函数模块：不修改任何状态
 * 所有 number clamp 到 [0,1]
 * 不包含 raw emotion vector
 * sourceSignals 只是解释 trace
 */

const POSITIVE_DIMS = new Set([
  'joy', 'contentment', 'satisfaction', 'excitement', 'calm',
  'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'
]);

const NEGATIVE_DIMS = new Set([
  'sadness', 'anger', 'fear', 'disgust', 'loneliness',
  'nervousness', 'frustration', 'guilt', 'shame', 'horror'
]);

/**
 * 计算 AffectFrame
 *
 * @param {Object} input
 * @param {Object} input.emotion - EmotionVector 实例
 * @param {Object} input.needs - NeedsSystem 实例
 * @param {Object} input.behaviorField - BehaviorField 实例
 * @param {Object} [input.socialGraph] - SocialGraph 实例 (optional)
 * @param {Object} [input.memory] - Memory 实例 (optional)
 * @param {Array}  [input.recentEvents] - 最近事件 (optional)
 * @param {Object} [input.domain] - Domain 实例 (optional)
 * @returns {Object} AffectFrame
 */
function compile(input) {
  const { emotion, needs, behaviorField, socialGraph, memory, recentEvents } = input;

  // 提取基础信号
  const valence = emotion.getValence();
  const arousal = emotion.getArousal();
  const emotions = emotion.getDominant(10);

  const B = behaviorField.B;
  const activity = B[0];
  const sociality = B[1];
  const focus = B[2];
  const expressiveness = B[3];

  // 提取需求
  const needsArray = [];
  if (needs && needs.needs) {
    for (const [need, value] of Object.entries(needs.needs)) {
      needsArray.push({ need, urgency: 1 - value });
    }
  }

  // 计算 warmth (基于 positive emotions 和 sociality)
  const positiveEmotions = emotions.filter(e => e.value > 0);
  const positiveSum = positiveEmotions.reduce((sum, e) => sum + e.value, 0);
  const warmth = clamp(positiveSum * 0.5 + sociality * 0.5);

  // 计算 directness (基于 expressiveness 和 focus)
  const directness = clamp(expressiveness * 0.6 + focus * 0.4);

  // 计算 initiative (基于 activity 和 arousal)
  const initiative = clamp(activity * 0.5 + arousal * 0.5);

  // 计算 defensiveness (基于 negative emotions 和 low sociality)
  const negativeEmotions = emotions.filter(e => e.value < 0);
  const negativeSum = negativeEmotions.reduce((sum, e) => sum + Math.abs(e.value), 0);
  const defensiveness = clamp(negativeSum * 0.6 + (1 - sociality) * 0.4);

  // 计算 emotionalExplicitness (基于 arousal 和 expressiveness)
  const emotionalExplicitness = clamp(arousal * 0.5 + expressiveness * 0.5);

  // 计算 stability (基于情绪波动和行为稳定性)
  const stability = clamp(1 - (Math.abs(valence) * 0.4 + defensiveness * 0.6));

  // 计算 valenceBand
  let valenceBand;
  if (valence < -0.2) valenceBand = 'negative';
  else if (valence > 0.2) valenceBand = 'positive';
  else valenceBand = 'neutral';

  // 计算 arousalBand
  let arousalBand;
  if (arousal < 0.3) arousalBand = 'low';
  else if (arousal > 0.7) arousalBand = 'high';
  else arousalBand = 'medium';

  // 计算 interpersonalPosture
  let interpersonalPosture;
  if (sociality > 0.6 && warmth > 0.5) interpersonalPosture = 'open';
  else if (sociality < 0.4 && warmth < 0.4) interpersonalPosture = 'guarded';
  else if (sociality > 0.5 && warmth > 0.6) interpersonalPosture = 'attached';
  else if (sociality < 0.3 && warmth < 0.3) interpersonalPosture = 'avoidant';
  else if (sociality < 0.4 && warmth > 0.5) interpersonalPosture = 'guarded_closeness';
  else interpersonalPosture = 'neutral';

  // 计算 visibleMicroBehaviors
  const visibleMicroBehaviors = [];
  if (arousal > 0.7) visibleMicroBehaviors.push('fidgeting');
  if (focus < 0.3) visibleMicroBehaviors.push('looking_around');
  if (expressiveness > 0.6) visibleMicroBehaviors.push('gesturing');
  if (sociality < 0.3) visibleMicroBehaviors.push('avoiding_eye_contact');

  // 计算 forbiddenExpressionModes
  const forbiddenExpressionModes = [];
  if (defensiveness > 0.7) forbiddenExpressionModes.push('direct_emotional_expression');
  if (warmth < 0.3) forbiddenExpressionModes.push('intimate_expression');
  if (arousal > 0.8) forbiddenExpressionModes.push('calm_expression');

  // 计算 sourceSignals
  const sourceSignals = {
    emotion: emotions.map(e => `${e.dimension}:${e.value.toFixed(2)}`),
    needs: needsArray.map(n => `${n.need}:${n.urgency.toFixed(2)}`),
    relationship: [],
    memoryPressure: []
  };

  // 添加 relationship 信息 (如果存在)
  if (socialGraph) {
    sourceSignals.relationship.push(`graph:available`);
  }

  // 添加 memoryPressure 信息 (如果存在)
  if (recentEvents && recentEvents.length > 0) {
    sourceSignals.memoryPressure.push(`activated:${recentEvents.length}`);
  }

  return {
    version: '0.2-basic',

    // 原始信号（供 NarrativeBuilder 使用）
    valence,
    arousal,
    emotions: emotions.map(e => ({ dimension: e.dimension, intensity: e.value })),
    needs: needsArray,

    // 情绪带
    valenceBand,
    arousalBand,

    // 人际姿态
    interpersonalPosture,

    // 表达约束 (0-1)
    warmth,
    directness,
    initiative,
    defensiveness,
    emotionalExplicitness,
    stability,

    // 表达限制
    visibleMicroBehaviors,
    forbiddenExpressionModes,

    // 溯源 (debug only, 不进入 LLM prompt)
    sourceSignals,

    // 元数据
    _meta: {
      version: '0.2-basic',
      compilerVersion: '1.0.0'
    }
  };
}

/**
 * 将数字 clamp 到 [0,1] 范围
 * @param {number} value
 * @returns {number}
 */
function clamp(value) {
  // R114-001: guard against NaN/Infinity (Math.max(0, NaN) returns NaN).
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

module.exports = {
  compile,
  POSITIVE_DIMS,
  NEGATIVE_DIMS
};
