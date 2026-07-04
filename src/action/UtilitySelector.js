/**
 * UtilitySelector — weighted action selector
 *
 * Selects one action from scored candidates using softmax with temperature.
 * Uses seeded RNG for reproducibility.
 * Produces a full ReasonTrace for explainability.
 *
 * Design invariants:
 *   - Pure function: no side effects
 *   - Deterministic with seeded RNG
 *   - Produces complete ReasonTrace
 */

const { ReasonTrace } = require('./ReasonTrace');

/**
 * @param {Object[]} scoredCandidates - [{ candidate, score }]
 * @param {Object} options
 * @param {number} [options.temperature=0.5] - 0=argmax, 1=uniform
 * @param {Object|null} [options.rng] - seeded RNG (required when temperature > 0)
 * @param {string} [options.agentId] - agent identifier for trace
 * @returns {{ selected: Object|null, trace: ReasonTrace }}
 */
function selectAction(scoredCandidates, { temperature = 0.5, rng = null, agentId = '' } = {}) {
  if (!scoredCandidates || scoredCandidates.length === 0) {
    return {
      selected: null,
      trace: buildEmptyTrace(temperature, agentId),
    };
  }

  const valid = scoredCandidates.filter(sc => sc.score && typeof sc.score.total === 'number' && Number.isFinite(sc.score.total));
  if (valid.length === 0) {
    return {
      selected: null,
      trace: buildEmptyTrace(temperature, agentId),
    };
  }

  if (temperature <= 0) {
    const best = valid.reduce((a, b) => a.score.total > b.score.total ? a : b);
    return {
      selected: best.candidate,
      trace: buildTrace(best, valid, { rngStateBefore: null, randomDraw: null, rngStateAfter: null }, temperature, agentId),
    };
  }

  if (!rng || typeof rng.next !== 'function') {
    throw new Error('UtilitySelector requires a seeded RNG when temperature > 0. Provide a seed in AndyEngineConfig or set actionSelection.temperature to 0.');
  }

  const traceDraw = typeof rng.traceDraw === 'function'
    ? rng.traceDraw()
    : fallbackTraceDraw(rng);
  const stateBefore = traceDraw.rngStateBefore;
  const draw = traceDraw.randomDraw;
  const stateAfter = traceDraw.rngStateAfter;

  const maxScore = Math.max(...valid.map(sc => sc.score.total));
  const weights = valid.map(sc => Math.exp((sc.score.total - maxScore) / temperature));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const probabilities = weights.map(w => w / totalWeight);

  let cumulative = 0;
  let selectedIndex = -1;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (draw < cumulative) {
      selectedIndex = i;
      break;
    }
  }
  // R23 P1 fix: floating-point rounding can make cumulative < 1.0,
  // so draw may fall in the gap after the last probability.
  // Fallback to the last candidate instead of silently selecting [0].
  if (selectedIndex === -1) {
    selectedIndex = valid.length - 1;
  }

  const selected = valid[selectedIndex];

  return {
    selected: selected.candidate,
    trace: buildTrace(selected, valid, { rngStateBefore: stateBefore, randomDraw: draw, rngStateAfter: stateAfter }, temperature, agentId),
  };
}

function fallbackTraceDraw(rng) {
  const rngStateBefore = typeof rng.getState === 'function' ? rng.getState() : null;
  const randomDraw = rng.next();
  const rngStateAfter = typeof rng.getState === 'function' ? rng.getState() : null;
  return { rngStateBefore, randomDraw, rngStateAfter };
}

function buildTrace(selected, allCandidates, rngInfo, temperature, agentId) {
  const keyReasons = [];

  const score = selected.score;
  if (score.need > 0.3) keyReasons.push('need-drive');
  if (score.emotion > 0.2) keyReasons.push('emotion-influence');
  if (score.behavior > 0.5) keyReasons.push('behavior-alignment');
  if (score.time > 0.3) keyReasons.push('time-appropriate');
  if (score.constraint < -0.3) keyReasons.push('constraint-penalty');

  return new ReasonTrace({
    agentId,
    candidate: selected.candidate,
    scoreBreakdown: score,
    keyReasons,
    pressureContext: null,
    rngInfo,
    temperature,
    candidateAlternatives: allCandidates.map(sc => ({
      candidate: sc.candidate,
      score: sc.score,
    })),
  });
}

function buildEmptyTrace(temperature, agentId) {
  return new ReasonTrace({
    agentId,
    candidate: null,
    scoreBreakdown: null,
    keyReasons: ['no-valid-candidates'],
    pressureContext: null,
    rngInfo: { rngStateBefore: null, randomDraw: null, rngStateAfter: null },
    temperature,
    candidateAlternatives: [],
  });
}

module.exports = {
  selectAction,
};
