/**
 * SocializeCandidateProvider — 社交关系驱动的候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class SocializeCandidateProvider extends CandidateProvider {
  constructor() {
    super('socialize');
  }

  generate(context) {
    if (!context.relationships || context.relationships.length === 0) return [];

    const strongRelations = context.relationships.filter(r => r.strength > 0.3);
    if (strongRelations.length === 0) return [];

    return strongRelations.slice(0, 3).map(rel =>
      createCandidate({
        id: `cand_social_${rel.agentId}`,
        type: 'socialize',
        source: 'relationship',
        label: `与${rel.agentId}社交`,
        targetAgentId: rel.agentId,
        metadata: { strength: rel.strength, type: rel.type },
      })
    );
  }
}

module.exports = { SocializeCandidateProvider };
