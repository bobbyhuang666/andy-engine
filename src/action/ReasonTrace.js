/**
 * ReasonTrace — full audit trail of an action selection decision
 *
 * Captures:
 *   - Which agent made the decision
 *   - Which candidate was selected and why
 *   - Score breakdown across all dimensions
 *   - Key reasons (human-readable)
 *   - Pressure context snapshot
 *   - RNG state for reproducibility
 *   - State deltas placeholder (filled by EffectResult)
 *
 * Design invariants:
 *   - Pure data, no live references
 *   - stateDeltas is null until filled by the effect layer
 *   - Deterministic: same inputs → same trace
 */

class ReasonTrace {
  /**
   * @param {Object} params
   * @param {string} params.agentId - agent identifier
   * @param {Object} params.candidate - selected ActionCandidate
   * @param {Object} params.scoreBreakdown - score dimensions
   * @param {string[]} params.keyReasons - human-readable reasons
   * @param {Object} [params.pressureContext] - pressure snapshot
   * @param {Object} [params.rngInfo] - { rngStateBefore, randomDraw, rngStateAfter }
   * @param {number} [params.temperature] - selection temperature
   * @param {Object[]} [params.candidateAlternatives] - all candidates with scores
   */
  constructor({ agentId, candidate, scoreBreakdown, keyReasons, pressureContext, rngInfo, temperature, candidateAlternatives }) {
    this.agentId = agentId;
    this.candidate = candidate;
    this.scoreBreakdown = scoreBreakdown;
    this.keyReasons = keyReasons || [];
    this.pressureContext = pressureContext || null;
    this.rngInfo = rngInfo || { rngStateBefore: null, randomDraw: null, rngStateAfter: null };
    this.temperature = temperature ?? 0;
    this.candidateAlternatives = candidateAlternatives || [];
    this.stateDeltas = null;
  }

  get selectedAction() { return this.candidate ? this.candidate.type : null; }
  get selectedCandidate() { return this.candidate; }
  get rngStateBefore() { return this.rngInfo ? this.rngInfo.rngStateBefore : null; }
  get randomDraw() { return this.rngInfo ? this.rngInfo.randomDraw : null; }
  get rngStateAfter() { return this.rngInfo ? this.rngInfo.rngStateAfter : null; }

  toJSON() {
    return {
      agentId: this.agentId,
      candidate: this.candidate ? (this.candidate.toJSON ? this.candidate.toJSON() : this.candidate) : null,
      selectedAction: this.selectedAction,
      selectedCandidate: this.selectedCandidate,
      scoreBreakdown: this.scoreBreakdown,
      keyReasons: this.keyReasons,
      pressureContext: this.pressureContext,
      rngInfo: this.rngInfo,
      rngStateBefore: this.rngStateBefore,
      randomDraw: this.randomDraw,
      rngStateAfter: this.rngStateAfter,
      temperature: this.temperature,
      candidateAlternatives: this.candidateAlternatives,
      stateDeltas: this.stateDeltas,
    };
  }
}

module.exports = { ReasonTrace };
