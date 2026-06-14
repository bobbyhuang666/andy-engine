/**
 * SocializeCandidateProvider — 基于附近人物生成社交候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class SocializeCandidateProvider extends CandidateProvider {
  constructor() { super('SocializeCandidateProvider'); }

  generate(context) {
    if (!context.relationships || context.relationships.length === 0) return [];

    // 附近有关系人物 → 可社交
    const nearby = context.relationships.filter(r => r.strength > 0.1);
    if (nearby.length === 0) return [];

    return [createCandidate({
      type: 'socialize',
      source: 'relationship',
      label: '与附近的人社交',
      metadata: { nearbyCount: nearby.length },
    })];
  }
}

module.exports = { SocializeCandidateProvider };
