/**
 * CandidateProvider — base class for candidate generators
 *
 * Pure interface. All providers inherit from this.
 * generate(context) -> ActionCandidate[]
 *
 * Design invariants:
 *   - generate() is a pure function (no side effects)
 *   - Does not modify context
 *   - Returns plain JSON-compatible objects
 */

class CandidateProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Generate candidates (pure, no state modification)
   * @param {Object} context - scoring context snapshot
   * @returns {Object[]} ActionCandidate[]
   */
  generate(context) {
    throw new Error(`${this.name}.generate() not implemented`);
  }
}

module.exports = { CandidateProvider };
