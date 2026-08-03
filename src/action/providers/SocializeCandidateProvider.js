/**
 * SocializeCandidateProvider — generates socialize candidates from nearby relationships
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

class SocializeCandidateProvider extends CandidateProvider {
  constructor() { super('SocializeCandidateProvider'); }

  generate(context) {
    if (!context.relationships || context.relationships.length === 0) return [];

    const coPresentAgentIds = new Set(
      Array.isArray(context.coPresentAgentIds) ? context.coPresentAgentIds : []
    );
    const myId = context.agent?.id || context.agentId;
    const nearby = context.relationships
      .map(relationship => {
        const targetId = relationship.getOther
          ? relationship.getOther(myId)
          : (relationship.agentB || relationship.from || relationship.target);
        return { relationship, targetId };
      })
      .filter(({ relationship, targetId }) => (
        relationship.strength > 0.1 && coPresentAgentIds.has(targetId)
      ));
    if (nearby.length === 0) return [];

    // R22 P1 fix: select a target agent for socialize action.
    // Without target, EventEffectPipeline.computeDeltas() skips
    // RelationshipDelta production (line 147: if (candidate.target)),
    // making socialize actions have zero relationship effect.
    // R23 P1 fix: use context.agent.id (not context.agentId which is undefined).
    const targetId = nearby[0].targetId;

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
