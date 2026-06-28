/**
 * BehaviorFieldCandidateProvider — 行为场倾向驱动的候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class BehaviorFieldCandidateProvider extends CandidateProvider {
  constructor() {
    super('behaviorField');
  }

  generate(context) {
    if (!context.behavior || !context.behavior.B) return [];

    const B = context.behavior.B;
    const candidates = [];

    // 低活跃度 → 休息
    if (B[0] < 0.3) {
      candidates.push(createCandidate({
        id: 'cand_bf_rest',
        type: 'rest',
        source: 'behaviorField',
        label: '休息',
      }));
    }

    // 高社交性 → 社交
    if (B[1] > 0.5) {
      candidates.push(createCandidate({
        id: 'cand_bf_socialize',
        type: 'socialize',
        source: 'behaviorField',
        label: '社交',
      }));
    }

    // 高专注 → 工作/观察
    if (B[2] > 0.6) {
      candidates.push(createCandidate({
        id: 'cand_bf_work',
        type: 'work',
        source: 'behaviorField',
        label: '专注工作',
      }));
    }

    // 高表达欲 → 社交/探索
    if (B[3] > 0.5) {
      candidates.push(createCandidate({
        id: 'cand_bf_express',
        type: 'socialize',
        source: 'behaviorField',
        label: '表达自我',
      }));
    }

    return candidates;
  }
}

module.exports = { BehaviorFieldCandidateProvider };
