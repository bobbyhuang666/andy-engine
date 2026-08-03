/**
 * NeedCandidateProvider — generates candidates based on need deprivation
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

const NEED_ACTION_MAP = {
  hunger: { type: 'consume', label: 'eat' },
  energy: { type: 'rest', label: 'rest' },
  social: { type: 'socialize', label: 'socialize' },
  stimulation: { type: 'explore', label: 'explore' },
  comfort: { type: 'rest', label: 'relax' },
};

class NeedCandidateProvider extends CandidateProvider {
  constructor() { super('NeedCandidateProvider'); }

  generate(context) {
    if (!context.needs) return [];
    const candidates = [];

    for (const [needKey, value] of Object.entries(context.needs)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value >= 0.3) continue;
      const mapping = NEED_ACTION_MAP[needKey];
      if (!mapping) continue;

      let target = needKey;
      if (needKey === 'social') {
        const selfId = context.agent?.id || context.agentId;
        target = (Array.isArray(context.coPresentAgentIds) ? context.coPresentAgentIds : [])
          .filter(id => typeof id === 'string' && id.length > 0 && id !== selfId)
          .sort()[0];
        if (!target) continue;
      }

      candidates.push(new ActionCandidate({
        type: mapping.type,
        source: 'need',
        target,
        label: mapping.label,
        metadata: { needKey, needValue: value },
      }));
    }

    return candidates;
  }
}

module.exports = { NeedCandidateProvider };
