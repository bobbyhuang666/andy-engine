/**
 * CandidateProviderManager — 聚合所有 provider，去重，确定性顺序
 *
 * 设计原则：
 *   - Provider 顺序固定（确定性）
 *   - 按 candidate.id 去重
 *   - 返回纯 JSON
 *   - 不修改 context
 */

const { ContinueCandidateProvider } = require('./ContinueCandidateProvider');
const { NeedCandidateProvider } = require('./NeedCandidateProvider');
const { ScheduleCandidateProvider } = require('./ScheduleCandidateProvider');
const { BehaviorFieldCandidateProvider } = require('./BehaviorFieldCandidateProvider');
const { ExploreCandidateProvider } = require('./ExploreCandidateProvider');
const { SocializeCandidateProvider } = require('./SocializeCandidateProvider');

// TODO: Phase 28+ — MemoryCandidateProvider
// TODO: Phase 29+ — HabitCandidateProvider
// TODO: Phase 26.8+ — WorldPressureCandidateProvider

class CandidateProviderManager {
  constructor() {
    // 确定性顺序
    this.providers = [
      new ContinueCandidateProvider(),
      new NeedCandidateProvider(),
      new ScheduleCandidateProvider(),
      new BehaviorFieldCandidateProvider(),
      new ExploreCandidateProvider(),
      new SocializeCandidateProvider(),
    ];
  }

  /**
   * 生成所有候选（去重，确定性顺序）
   *
   * @param {Object} context - 评分上下文快照
   * @returns {Object[]} 去重后的 ActionCandidate[]
   */
  generateAll(context) {
    const seen = new Set();
    const result = [];

    for (const provider of this.providers) {
      const candidates = provider.generate(context);
      for (const cand of candidates) {
        if (!seen.has(cand.id)) {
          seen.add(cand.id);
          result.push(cand);
        }
      }
    }

    return result;
  }
}

module.exports = { CandidateProviderManager };
