/**
 * ExploreCandidateProvider — generates explore candidates from intrinsic curiosity
 *
 * R20/R21 P0 fix: uses seeded RNG to pick a target region for exploration,
 * making no-schedule agent movement seed-dependent (deterministic).
 * Without a target, explore actions produce no position change in the
 * effect pipeline, and the agent's trajectory becomes seed-independent.
 *
 * R21: fixed method name — DomainRegistry.getRegions(), not getRegionNames().
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

class ExploreCandidateProvider extends CandidateProvider {
  constructor() { super('ExploreCandidateProvider'); }

  generate(context) {
    if (!context.intrinsic || typeof context.intrinsic.curiosity !== 'number') return [];
    if (context.intrinsic.curiosity < 0.3) return [];

    // R20/R21 P0: pick a seeded-random target region so explore actions
    // produce seed-dependent position changes. Without this, no-schedule
    // agents always traverse regions in the same list order regardless of seed.
    let target = null;
    if (context.rng && context.domain && typeof context.domain.getRegions === 'function') {
      const regions = context.domain.getRegions();
      const currentPos = context.agent?.position || null;
      // Prefer regions different from current position
      const candidates = currentPos
        ? regions.filter(r => r !== currentPos)
        : regions;
      if (candidates.length > 0) {
        const idx = Math.floor(context.rng.next() * candidates.length);
        target = candidates[idx];
      } else if (regions.length > 0) {
        target = regions[0];
      }
    }

    return [new ActionCandidate({
      type: 'explore',
      source: 'intrinsic',
      target: target || null,
      label: target ? `explore ${target}` : 'explore surroundings',
      metadata: { curiosity: context.intrinsic.curiosity },
    })];
  }
}

module.exports = { ExploreCandidateProvider };
