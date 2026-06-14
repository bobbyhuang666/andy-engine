/**
 * ContinueCandidateProvider — 生成 continue 候选
 *
 * 当前行为持续候选，来自 behaviorField 当前标签。
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class ContinueCandidateProvider extends CandidateProvider {
  constructor() { super('ContinueCandidateProvider'); }

  generate(context) {
    if (!context.behaviorField || !context.behaviorField.label) return [];
    return [createCandidate({
      type: 'continue',
      source: 'behaviorField',
      label: `继续${context.behaviorField.label}`,
    })];
  }
}

module.exports = { ContinueCandidateProvider };
