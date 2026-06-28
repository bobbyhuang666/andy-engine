/**
 * ExploreCandidateProvider — 好奇心驱动的探索候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class ExploreCandidateProvider extends CandidateProvider {
  constructor() {
    super('explore');
  }

  generate(context) {
    if (!context.intrinsic) return [];
    if (context.intrinsic.curiosity < 0.4) return [];

    return [createCandidate({
      id: 'cand_explore',
      type: 'explore',
      source: 'intrinsic',
      label: '探索新地方',
      metadata: { curiosity: context.intrinsic.curiosity },
    })];
  }
}

module.exports = { ExploreCandidateProvider };
