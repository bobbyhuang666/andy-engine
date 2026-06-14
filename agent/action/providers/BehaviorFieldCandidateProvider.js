/**
 * BehaviorFieldCandidateProvider — 基于行为场状态生成候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class BehaviorFieldCandidateProvider extends CandidateProvider {
  constructor() { super('BehaviorFieldCandidateProvider'); }

  generate(context) {
    if (!context.behaviorField || !context.behaviorField.B) return [];
    const B = context.behaviorField.B;
    const [activity, sociality, focus, expressiveness] = B;
    const candidates = [];

    // 低活跃 → rest
    if (activity < 0.3) {
      candidates.push(createCandidate({ type: 'rest', source: 'behaviorField', label: '低活跃休息' }));
    }

    // 高社交 → socialize
    if (sociality > 0.6) {
      candidates.push(createCandidate({ type: 'socialize', source: 'behaviorField', label: '社交倾向' }));
    }

    // 高专注 → work
    if (focus > 0.6) {
      candidates.push(createCandidate({ type: 'work', source: 'behaviorField', label: '专注工作' }));
    }

    // 高表达 → observe（表达欲高时观察环境）
    if (expressiveness > 0.6) {
      candidates.push(createCandidate({ type: 'observe', source: 'behaviorField', label: '观察环境' }));
    }

    return candidates;
  }
}

module.exports = { BehaviorFieldCandidateProvider };
