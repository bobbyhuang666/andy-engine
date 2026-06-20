/**
 * SocializeCandidateProvider — generates socialize candidates from nearby relationships
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

class SocializeCandidateProvider extends CandidateProvider {
  constructor() { super('SocializeCandidateProvider'); }

  generate(context) {
    if (!context.relationships || context.relationships.length === 0) return [];

    const nearby = context.relationships.filter(r => r.strength > 0.1);
    if (nearby.length === 0) return [];

    return [new ActionCandidate({
      type: 'socialize',
      source: 'relationship',
      label: 'socialize with nearby',
      metadata: { nearbyCount: nearby.length },
    })];
  }
}

module.exports = { SocializeCandidateProvider };
