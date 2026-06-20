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
      if (value >= 0.3) continue;
      const mapping = NEED_ACTION_MAP[needKey];
      if (!mapping) continue;

      candidates.push(new ActionCandidate({
        type: mapping.type,
        source: 'need',
        target: needKey,
        label: mapping.label,
        metadata: { needKey, needValue: value },
      }));
    }

    return candidates;
  }
}

module.exports = { NeedCandidateProvider };
