/**
 * CandidateProviderManager — 候选提供者管理器
 *
 * 聚合所有 CandidateProvider，统一生成候选列表。
 * 不修改状态，不选择行为。
 */

const { ContinueCandidateProvider } = require('./ContinueCandidateProvider');
const { NeedCandidateProvider } = require('./NeedCandidateProvider');
const { ScheduleCandidateProvider } = require('./ScheduleCandidateProvider');
const { BehaviorFieldCandidateProvider } = require('./BehaviorFieldCandidateProvider');
const { ExploreCandidateProvider } = require('./ExploreCandidateProvider');
const { SocializeCandidateProvider } = require('./SocializeCandidateProvider');
const { WorldObjectCandidateProvider } = require('./WorldObjectCandidateProvider');
const { ReflectCandidateProvider } = require('./ReflectCandidateProvider');

class CandidateProviderManager {
  constructor() {
    this.providers = [
      new ContinueCandidateProvider(),
      new NeedCandidateProvider(),
      new ScheduleCandidateProvider(),
      new BehaviorFieldCandidateProvider(),
      new ExploreCandidateProvider(),
      new SocializeCandidateProvider(),
      new WorldObjectCandidateProvider(),
      new ReflectCandidateProvider(),
    ];
  }

  /**
   * 生成所有候选
   * @param {Object} context - 行为上下文
   * @returns {Object[]} ActionCandidate 列表
   */
  generateAll(context) {
    const candidates = [];
    for (const provider of this.providers) {
      try {
        const result = provider.generate(context);
        if (Array.isArray(result)) {
          candidates.push(...result);
        }
      } catch (e) {
        // 单个 provider 失败不影响其他 provider
      }
    }
    return candidates;
  }

  /**
   * 添加自定义 provider
   * @param {CandidateProvider} provider
   */
  addProvider(provider) {
    this.providers.push(provider);
  }
}

module.exports = { CandidateProviderManager };
