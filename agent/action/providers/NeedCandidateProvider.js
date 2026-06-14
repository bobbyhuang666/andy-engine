/**
 * NeedCandidateProvider — 基于需求匮乏生成候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

const NEED_ACTION_MAP = {
  hunger: { type: 'consume', label: '进食' },
  energy: { type: 'rest', label: '休息' },
  social: { type: 'socialize', label: '社交' },
  stimulation: { type: 'explore', label: '探索' },
  comfort: { type: 'rest', label: '放松' },
};

class NeedCandidateProvider extends CandidateProvider {
  constructor() { super('NeedCandidateProvider'); }

  generate(context) {
    if (!context.needs) return [];
    const candidates = [];

    for (const [needKey, value] of Object.entries(context.needs)) {
      if (value >= 0.3) continue; // 需求充足时不生成候选
      const mapping = NEED_ACTION_MAP[needKey];
      if (!mapping) continue;

      candidates.push(createCandidate({
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
