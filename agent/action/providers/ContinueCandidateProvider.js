/**
 * ContinueCandidateProvider — 继续当前行为
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class ContinueCandidateProvider extends CandidateProvider {
  constructor() {
    super('continue');
  }

  generate(context) {
    const label = context.behavior && context.behavior.label
      ? `继续${context.behavior.label}`
      : '继续当前行为';

    return [createCandidate({
      id: 'cand_continue',
      type: 'continue',
      source: 'behaviorField',
      label,
    })];
  }
}

module.exports = { ContinueCandidateProvider };
