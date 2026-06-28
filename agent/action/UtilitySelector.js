/**
 * UtilitySelector — 基于效用的加权选择器
 *
 * 输入：评分后的候选列表
 * 输出：选中的候选 + 候选替代方案 + ReasonTrace
 *
 * 使用 softmax/温度采样，不是 argmax。
 * 支持确定性回放（通过 RNG 状态记录）。
 */

const { createFallbackCandidate } = require('./ActionCandidate');
const { scoreCandidate } = require('./UtilityScorer');
const { RNG } = require('../../src/shared/rng');

/**
 * @typedef {Object} SelectionResult
 * @property {Object} selected - 选中的候选
 * @property {Array} alternatives - 候选替代方案 [{candidate, score, weight}]
 * @property {Object} reasonTrace - 选择原因追踪
 */

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  temperature: 0.3,        // 温度：0=argmax, 高=更随机
  minScore: 0.01,          // 最低有效分数
  maxCandidates: 10,       // 最大候选数
  fallbackType: 'continue', // 无有效候选时的回退类型
};

/**
 * 从候选列表中选择一个行为
 *
 * @param {Object[]} candidates - 候选列表
 * @param {Object} context - 行为上下文
 * @param {Object} [config] - 配置覆盖
 * @param {Object} [rng] - RNG 实例（可选，用于确定性采样）
 * @returns {SelectionResult}
 */
function select(candidates, context, config = {}, rng = null) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. 评分
  const scored = candidates.map(c => ({
    candidate: c,
    score: scoreCandidate(c, context),
  }));

  // 2. 过滤无效候选（总分 <= 0 或 NaN）
  const valid = scored.filter(s => {
    const total = s.score.total;
    return typeof total === 'number' && isFinite(total) && total > 0;
  });

  // 3. 如果没有有效候选，使用 fallback
  if (valid.length === 0) {
    const fallback = createFallbackCandidate();
    const fallbackScore = scoreCandidate(fallback, context);
    return {
      selected: fallback,
      alternatives: [],
      reasonTrace: buildReasonTrace(fallback, fallbackScore, [], cfg, rng),
    };
  }

  // 4. 排序并截取 top candidates
  valid.sort((a, b) => b.score.total - a.score.total);
  const topCandidates = valid.slice(0, cfg.maxCandidates);

  // 5. 如果只有一个候选或温度为 0，直接选择最高分
  if (topCandidates.length === 1 || cfg.temperature <= 0) {
    const best = topCandidates[0];
    return {
      selected: best.candidate,
      alternatives: formatAlternatives(topCandidates),
      reasonTrace: buildReasonTrace(best.candidate, best.score, topCandidates, cfg, rng),
    };
  }

  // 6. Softmax 温度采样
  const weights = topCandidates.map(s => {
    const normalizedScore = s.score.total / (cfg.temperature || 1);
    return Math.exp(normalizedScore);
  });
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const probabilities = weights.map(w => w / totalWeight);

  // 7. 使用 RNG 记录完整轨迹（inline drawTrace since RNG.drawTrace doesn't exist）
  const rngStateBefore = rng ? rng.getState() : null;
  const draw = rng ? rng.next() : 0.5; // deterministic fallback when no RNG
  let cumulative = 0;
  let selectedIndex = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (draw < cumulative) {
      selectedIndex = i;
      break;
    }
  }
  const rngStateAfter = rng ? rng.getState() : null;

  const selected = topCandidates[selectedIndex];

  return {
    selected: selected.candidate,
    alternatives: formatAlternatives(topCandidates),
    reasonTrace: {
      traceId: null,
      selectedActionId: selected.candidate.id,
      selectedActionType: selected.candidate.type,
      selectedActionLabel: selected.candidate.label,
      candidateAlternatives: topCandidates.slice(0, 3).map(a => ({
        id: a.candidate.id,
        type: a.candidate.type,
        label: a.candidate.label,
        score: a.score.total,
        scoreBreakdown: {
          need: a.score.need,
          emotion: a.score.emotion,
          behavior: a.score.behavior,
          total: a.score.total,
        },
      })),
      scoreBreakdown: selected.score,
      keyReasons: extractKeyReasons(selected.score, context),
      rngStateBefore,
      rngStateAfter,
      randomDraw: draw,
      probabilities,
      temperature: cfg.temperature,
      stateDeltas: null,
      behaviorFieldAlignment: context?.behavior ? {
        bfLabel: context.behavior.label || null,
        selectedLabel: selected.candidate.label,
        aligned: context.behavior.label === selected.candidate.label,
        divergence: selected.score.behavior > 0 ? Math.max(0, 1 - selected.score.behavior * 2) : 1,
      } : null,
    },
  };
}

/**
 * 从分数分解中提取关键原因（带具体数值）
 */
function extractKeyReasons(score, context) {
  const reasons = [];
  if (score.need > 0.3) {
    const detail = context?.needs ? Object.entries(context.needs)
      .filter(([_, v]) => v < 0.5)
      .map(([k, v]) => `${k}=${v.toFixed(2)}`)
      .join(', ') : '';
    reasons.push(detail ? `需求驱动 (${detail})` : '需求驱动');
  }
  if (score.emotion > 0.3) reasons.push(`情绪倾向 (score=${score.emotion.toFixed(2)})`);
  if (score.behavior > 0.6) reasons.push(`行为场一致 (score=${score.behavior.toFixed(2)})`);
  if (score.time > 0.6) reasons.push('时间适宜');
  if (score.location > 0.8) reasons.push('位置便利');
  if (score.constraint < -0.5) reasons.push('约束限制');
  if (score.memory > 0.2) reasons.push(`记忆影响 (score=${score.memory.toFixed(2)})`);
  if (score.goal > 0.2) reasons.push(`目标压力 (score=${score.goal.toFixed(2)})`);
  return reasons;
}

/**
 * 格式化候选替代方案
 */
function formatAlternatives(scored) {
  const totalWeight = scored.reduce((sum, s) => sum + Math.max(0, s.score.total), 0);
  return scored.map(s => ({
    candidate: s.candidate,
    score: s.score,
    weight: totalWeight > 0 ? Math.max(0, s.score.total) / totalWeight : 0,
  }));
}

/**
 * 构建 ReasonTrace（fallback 路径，无 RNG 抽样）
 */
function buildReasonTrace(selected, selectedScore, alternatives, config, rng) {
  return {
    traceId: null,
    selectedActionId: selected.id,
    selectedActionType: selected.type,
    selectedActionLabel: selected.label,
    candidateAlternatives: alternatives.slice(0, 3).map(a => ({
      id: a.candidate.id,
      type: a.candidate.type,
      label: a.candidate.label,
      score: a.score.total,
      scoreBreakdown: {
        need: a.score.need,
        emotion: a.score.emotion,
        behavior: a.score.behavior,
        total: a.score.total,
      },
    })),
    scoreBreakdown: selectedScore,
    keyReasons: extractKeyReasons(selectedScore),
    rngStateBefore: rng ? rng.getState() : null,
    rngStateAfter: rng ? rng.getState() : null,
    randomDraw: null,
    probabilities: null,
    temperature: config.temperature,
    stateDeltas: null,
    behaviorFieldAlignment: null,
  };
}

module.exports = {
  select,
  DEFAULT_CONFIG,
};
