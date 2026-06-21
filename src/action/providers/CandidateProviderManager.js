/**
 * CandidateProviderManager — aggregates all providers, deduplicates, deterministic order
 *
 * Design invariants:
 *   - Provider order is fixed (deterministic)
 *   - Deduplicates by candidate.id
 *   - Returns plain JSON
 *   - Does not modify context
 */

const { ContinueCandidateProvider } = require('./ContinueCandidateProvider');
const { NeedCandidateProvider } = require('./NeedCandidateProvider');
const { ScheduleCandidateProvider } = require('./ScheduleCandidateProvider');
const { BehaviorFieldCandidateProvider } = require('./BehaviorFieldCandidateProvider');
const { ExploreCandidateProvider } = require('./ExploreCandidateProvider');
const { SocializeCandidateProvider } = require('./SocializeCandidateProvider');
const { MemoryCandidateProvider } = require('./MemoryCandidateProvider');
const { HabitCandidateProvider } = require('./HabitCandidateProvider');
const { WorldPressureCandidateProvider } = require('./WorldPressureCandidateProvider');

class CandidateProviderManager {
  constructor() {
    this.providers = [
      new ContinueCandidateProvider(),
      new NeedCandidateProvider(),
      new ScheduleCandidateProvider(),
      new BehaviorFieldCandidateProvider(),
      new ExploreCandidateProvider(),
      new SocializeCandidateProvider(),
      new MemoryCandidateProvider(),
      new HabitCandidateProvider(),
      new WorldPressureCandidateProvider(),
    ];
  }

  /**
   * Generate all candidates (deduplicated, deterministic order)
   *
   * @param {Object} context - scoring context snapshot
   * @returns {Object[]} deduplicated ActionCandidate[]
   */
  generateAll(context) {
    const seen = new Set();
    const result = [];

    for (const provider of this.providers) {
      const candidates = provider.generate(context);
      for (const cand of candidates) {
        if (!seen.has(cand.id)) {
          seen.add(cand.id);
          result.push(cand);
        }
      }
    }

    return result;
  }
}

module.exports = { CandidateProviderManager };
