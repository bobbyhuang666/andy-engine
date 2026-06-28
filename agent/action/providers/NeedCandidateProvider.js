/**
 * NeedCandidateProvider — 需求驱动的候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

const NEED_ACTION_MAP = {
  hunger: { type: 'consume', label: '进食' },
  energy: { type: 'rest', label: '休息' },
  social: { type: 'socialize', label: '社交' },
  comfort: { type: 'rest', label: '放松' },
  stimulation: { type: 'explore', label: '探索' },
};

class NeedCandidateProvider extends CandidateProvider {
  constructor() {
    super('need');
  }

  generate(context) {
    if (!context.needs) return [];

    const candidates = [];
    for (const [need, value] of Object.entries(context.needs)) {
      const deficit = 1 - value;
      if (deficit < 0.3) continue; // 需求充足时不生成候选

      const mapping = NEED_ACTION_MAP[need];
      if (!mapping) continue;

      const targetRegion = this._findNeedRegion(need, context);

      candidates.push(createCandidate({
        id: `cand_need_${need}`,
        type: mapping.type,
        source: 'need',
        label: mapping.label,
        targetRegion,
        expectedEffects: { needDelta: { [need]: 0.3 } },
        metadata: { need, deficit },
      }));
    }

    return candidates;
  }

  _findNeedRegion(need, context) {
    if (!context.domain) return null;
    const needRegionConfig = context.domain.needRegionConfig;
    if (!needRegionConfig || !needRegionConfig[need]) return null;

    const config = needRegionConfig[need];
    if (config.any) return config.any;
    if (config.student) return config.student;
    if (config.worker) return config.worker;
    return null;
  }
}

module.exports = { NeedCandidateProvider };
