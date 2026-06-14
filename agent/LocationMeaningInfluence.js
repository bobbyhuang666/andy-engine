/**
 * LocationMeaningInfluence - 地点意义对行为场的影响
 *
 * 读取 WorldFactStore 中的地点意义，
 * 从 Domain Config 读取 meaning type → B_delta 映射，
 * 计算对 BehaviorField 的梯度贡献。
 */

class LocationMeaningInfluence {
  /**
   * @param {Object} factStore - WorldFactStore 实例
   * @param {Object} domain - DomainRegistry 实例（含 locationMeaningTypes）
   */
  constructor(factStore, domain) {
    this.factStore = factStore;
    this.meaningTypes = (domain && domain.locationMeaningTypes) || {};
  }

  /**
   * 计算地点意义梯度
   * @param {string} currentRegion - 当前区域
   * @param {number[]} currentB - 当前行为向量（未使用，保留接口兼容）
   * @returns {number[]} 4D 梯度向量
   */
  computeGradient(currentRegion, currentB) {
    const gradient = [0, 0, 0, 0];

    if (!this.factStore) return gradient;

    const meaning = this.factStore.getLocationMeaning(currentRegion);
    if (!meaning) return gradient;

    const config = this.meaningTypes[meaning.meaningType];
    if (!config || !config.B_delta) return gradient;

    for (let d = 0; d < 4; d++) {
      gradient[d] = config.B_delta[d] * meaning.weight;
    }

    return gradient;
  }

  /**
   * 获取地点意义摘要（用于叙事）
   * @param {string} region
   * @returns {string}
   */
  getMeaningSummary(region) {
    const meaning = this.factStore.getLocationMeaning(region);
    if (!meaning) return '';

    const config = this.meaningTypes[meaning.meaningType];
    return config ? config.description : '普通';
  }
}

module.exports = LocationMeaningInfluence;
