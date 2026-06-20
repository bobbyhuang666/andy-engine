/**
 * SelectedAction — wraps a chosen ActionCandidate with selection metadata
 *
 * Pure data object. Captures the full decision context for explainability:
 *   - Which candidate was selected
 *   - Its score
 *   - The temperature used
 *   - Alternative candidates and their scores
 *   - The ReasonTrace for full auditability
 *
 * Design invariants:
 *   - Immutable after construction
 *   - Serializable to JSON
 *   - Accessor properties delegate to inner candidate
 */

class SelectedAction {
  /**
   * @param {Object} params
   * @param {Object} params.candidate - the chosen ActionCandidate
   * @param {Object} params.score - score breakdown from UtilityScorer
   * @param {number} params.temperature - selection temperature
   * @param {Object[]} params.alternatives - other candidates with scores
   * @param {Object} params.reasonTrace - full ReasonTrace
   */
  constructor({ candidate, score, temperature, alternatives, reasonTrace }) {
    this.candidate = candidate;
    this.score = score;
    this.temperature = temperature;
    this.alternatives = alternatives || [];
    this.reasonTrace = reasonTrace;
  }

  get type() { return this.candidate.type; }
  get target() { return this.candidate.target; }
  get source() { return this.candidate.source; }
  get label() { return this.candidate.label; }

  toJSON() {
    return {
      candidate: this.candidate.toJSON ? this.candidate.toJSON() : this.candidate,
      score: this.score,
      temperature: this.temperature,
      alternatives: this.alternatives,
      reasonTrace: this.reasonTrace,
    };
  }
}

module.exports = { SelectedAction };
