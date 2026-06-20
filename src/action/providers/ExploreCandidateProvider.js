/**
 * ExploreCandidateProvider — generates explore candidates from intrinsic curiosity
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

class ExploreCandidateProvider extends CandidateProvider {
  constructor() { super('ExploreCandidateProvider'); }

  generate(context) {
    if (!context.intrinsic || typeof context.intrinsic.curiosity !== 'number') return [];
    if (context.intrinsic.curiosity < 0.3) return [];

    return [new ActionCandidate({
      type: 'explore',
      source: 'intrinsic',
      label: 'explore surroundings',
      metadata: { curiosity: context.intrinsic.curiosity },
    })];
  }
}

module.exports = { ExploreCandidateProvider };
