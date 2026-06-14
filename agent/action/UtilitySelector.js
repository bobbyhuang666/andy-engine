/**
 * UtilitySelector — 加权选择器
 *
 * 从候选列表中选择一个行为。
 * 使用温度参数控制探索/利用平衡。
 * 使用 seeded RNG 进行采样。
 * 产生完整 ReasonTrace。
 *
 * 设计原则：
 *   - 不总是选 argmax（temperature > 0 时）
 *   - 使用 seeded RNG 确保可复现
 *   - 产生完整 ReasonTrace
 */

/**
 * @typedef {Object} ReasonTrace
 * @property {string} selectedAction - 选中的 action type
 * @property {Object} selectedCandidate - 选中的候选
 * @property {Object[]} candidateAlternatives - 所有候选及其分数
 * @property {Object} scoreBreakdown - 选中候选的分数明细
 * @property {string[]} keyReasons - 关键选择原因
 * @property {number|null} rngStateBefore - 选择前 RNG 状态
 * @property {number|null} randomDraw - 随机抽取值
 * @property {number|null} rngStateAfter - 选择后 RNG 状态
 * @property {number} temperature - 使用的温度
 * @property {Object|null} stateDeltas - 状态变化占位符
 */

/**
 * 从候选列表中选择一个行为
 *
 * @param {Object[]} scoredCandidates - [{ candidate, score }] 列表
 * @param {Object} options
 * @param {number} [options.temperature=0.5] - 温度参数（0=argmax, 1=均匀采样）
 * @param {Object|null} [options.rng] - seeded RNG（temperature > 0 时必需）
 * @returns {{ selected: Object, trace: ReasonTrace }}
 */
function selectAction(scoredCandidates, { temperature = 0.5, rng = null } = {}) {
  if (!scoredCandidates || scoredCandidates.length === 0) {
    return {
      selected: null,
      trace: buildEmptyTrace(temperature),
    };
  }

  // 过滤无效候选
  const valid = scoredCandidates.filter(sc => sc.score && typeof sc.score.total === 'number' && !isNaN(sc.score.total));
  if (valid.length === 0) {
    return {
      selected: null,
      trace: buildEmptyTrace(temperature),
    };
  }

  // 温度为 0 时直接选 argmax
  if (temperature <= 0) {
    const best = valid.reduce((a, b) => a.score.total > b.score.total ? a : b);
    return {
      selected: best.candidate,
      trace: buildTrace(best, valid, { rngStateBefore: null, randomDraw: null, rngStateAfter: null }, temperature),
    };
  }

  if (!rng || typeof rng.next !== 'function') {
    throw new Error('UtilitySelector requires a seeded RNG when temperature > 0');
  }

  // 加权采样
  const traceDraw = typeof rng.traceDraw === 'function'
    ? rng.traceDraw()
    : fallbackTraceDraw(rng);
  const stateBefore = traceDraw.rngStateBefore;
  const draw = traceDraw.randomDraw;
  const stateAfter = traceDraw.rngStateAfter;

  // softmax 加权
  const weights = valid.map(sc => Math.exp(sc.score.total / temperature));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const probabilities = weights.map(w => w / totalWeight);

  // 累积分布采样
  let cumulative = 0;
  let selectedIndex = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (draw < cumulative) {
      selectedIndex = i;
      break;
    }
  }

  const selected = valid[selectedIndex];

  return {
    selected: selected.candidate,
    trace: buildTrace(selected, valid, { rngStateBefore: stateBefore, randomDraw: draw, rngStateAfter: stateAfter }, temperature),
  };
}

function fallbackTraceDraw(rng) {
  const rngStateBefore = typeof rng.getState === 'function' ? rng.getState() : null;
  const randomDraw = rng.next();
  const rngStateAfter = typeof rng.getState === 'function' ? rng.getState() : null;
  return { rngStateBefore, randomDraw, rngStateAfter };
}

/**
 * 构建 ReasonTrace
 * @private
 */
function buildTrace(selected, allCandidates, rngInfo, temperature) {
  const keyReasons = [];

  // 提取关键原因
  const score = selected.score;
  if (score.need > 0.3) keyReasons.push('need-drive');
  if (score.emotion > 0.2) keyReasons.push('emotion-influence');
  if (score.behavior > 0.5) keyReasons.push('behavior-alignment');
  if (score.time > 0.3) keyReasons.push('time-appropriate');
  if (score.constraint < -0.3) keyReasons.push('constraint-penalty');

  return {
    selectedAction: selected.candidate.type,
    selectedCandidate: selected.candidate,
    candidateAlternatives: allCandidates.map(sc => ({
      candidate: sc.candidate,
      score: sc.score,
    })),
    scoreBreakdown: score,
    keyReasons,
    rngStateBefore: rngInfo.rngStateBefore,
    randomDraw: rngInfo.randomDraw,
    rngStateAfter: rngInfo.rngStateAfter,
    temperature,
    stateDeltas: null, // 由 EventEffectPipeline 填充
  };
}

/**
 * 构建空 trace
 * @private
 */
function buildEmptyTrace(temperature) {
  return {
    selectedAction: null,
    selectedCandidate: null,
    candidateAlternatives: [],
    scoreBreakdown: null,
    keyReasons: ['no-valid-candidates'],
    rngStateBefore: null,
    randomDraw: null,
    rngStateAfter: null,
    temperature,
    stateDeltas: null,
  };
}

module.exports = {
  selectAction,
};
