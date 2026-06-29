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

    // R22 P1 fix: select a target agent for socialize action.
    // Without target, EventEffectPipeline.computeDeltas() skips
    // RelationshipDelta production (line 147: if (candidate.target)),
    // making socialize actions have zero relationship effect.
    const targetRel = nearby[0];
    const targetId = targetRel.getOther
      ? targetRel.getOther(context.agentId)
      : (targetRel.agentB || targetRel.from || targetRel.target);

    return [new ActionCandidate({
      type: 'socialize',
      source: 'relationship',
      label: 'socialize with nearby',
      target: targetId || null,
      metadata: { nearbyCount: nearby.length },
    })];
  }
}

module.exports = { SocializeCandidateProvider };
