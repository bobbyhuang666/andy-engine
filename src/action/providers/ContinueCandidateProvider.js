/**
 * ContinueCandidateProvider — generates continue candidate
 *
 * Continues current behavior from behaviorField label.
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

class ContinueCandidateProvider extends CandidateProvider {
  constructor() { super('ContinueCandidateProvider'); }

  generate(context) {
    if (!context.behaviorField || !context.behaviorField.label) return [];
    return [new ActionCandidate({
      type: 'continue',
      source: 'behaviorField',
      label: `continue ${context.behaviorField.label}`,
    })];
  }
}

module.exports = { ContinueCandidateProvider };
