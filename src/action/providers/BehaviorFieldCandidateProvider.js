/**
 * BehaviorFieldCandidateProvider — generates candidates from behavior field state
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

class BehaviorFieldCandidateProvider extends CandidateProvider {
  constructor() { super('BehaviorFieldCandidateProvider'); }

  generate(context) {
    if (!context.behaviorField || !context.behaviorField.B) return [];
    const B = context.behaviorField.B;
    const [activity, sociality, focus, expressiveness] = B;
    const candidates = [];

    if (activity < 0.3) {
      candidates.push(new ActionCandidate({ type: 'rest', source: 'behaviorField', label: 'low activity rest' }));
    }

    if (sociality > 0.6) {
      candidates.push(new ActionCandidate({ type: 'socialize', source: 'behaviorField', label: 'social tendency' }));
    }

    if (focus > 0.6) {
      candidates.push(new ActionCandidate({ type: 'work', source: 'behaviorField', label: 'focused work' }));
    }

    if (expressiveness > 0.6) {
      candidates.push(new ActionCandidate({ type: 'observe', source: 'behaviorField', label: 'observe environment' }));
    }

    return candidates;
  }
}

module.exports = { BehaviorFieldCandidateProvider };
