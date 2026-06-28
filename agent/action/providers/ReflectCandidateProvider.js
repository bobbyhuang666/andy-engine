/**
 * ReflectCandidateProvider — 定期反思候选
 *
 * 当反思定时器到期时，生成 reflect 候选。
 * 反思是定时触发的，不与行为场竞争。
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class ReflectCandidateProvider extends CandidateProvider {
  constructor() {
    super('reflect');
  }

  /**
   * 仅当 context._reflectionDue === true 时生成候选
   * @param {Object} context
   * @returns {Object[]}
   */
  generate(context) {
    if (!context._reflectionDue) return [];

    return [createCandidate({
      id: 'cand_reflect',
      type: 'reflect',
      source: 'timer',
      label: '定期反思',
      expectedEffects: {
        memory: { consolidate: true },
        emotion: { baselineAdjust: true },
      },
      metadata: {
        reason: 'reflection_interval_elapsed',
        interval: context._reflectionInterval || 12,
        ticksSince: context._ticksSinceReflection || 0,
      },
    })];
  }
}

module.exports = { ReflectCandidateProvider };
