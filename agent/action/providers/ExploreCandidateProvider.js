/**
 * ExploreCandidateProvider — 基于好奇心生成探索候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class ExploreCandidateProvider extends CandidateProvider {
  constructor() { super('ExploreCandidateProvider'); }

  generate(context) {
    if (!context.intrinsic || typeof context.intrinsic.curiosity !== 'number') return [];
    if (context.intrinsic.curiosity < 0.3) return [];

    return [createCandidate({
      type: 'explore',
      source: 'intrinsic',
      label: '探索周围',
      metadata: { curiosity: context.intrinsic.curiosity },
    })];
  }
}

module.exports = { ExploreCandidateProvider };
