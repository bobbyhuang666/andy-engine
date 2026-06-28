/**
 * FutureTendencyTracker - 未来行为倾向跟踪器
 *
 * 基于过去的事件和地点意义，计算对未来行为的倾向影响。
 * 这是行为闭环的关键组件：事件 → 记忆 → 倾向 → 未来行为
 *
 * 设计原理：
 *   过去的事件会在特定地点留下"行为印记"，
 *   这些印记会影响 agent 在该地点的未来行为倾向。
 *   例如：在某地点多次学习后，agent 在该地点会更倾向于专注。
 */

const { DIM_ACTIVITY, DIM_SOCIALITY, DIM_FOCUS, DIM_EXPRESSIVENESS, DIMS } = require('./BehaviorLabeler');

class FutureTendencyTracker {
  constructor() {
    /** @type {Map<string, number[]>} region → 4D 倾向向量 */
    this._tendencies = new Map();

    /** @type {number} 倾向衰减率（每 tick） */
    this.decayRate = 0.95;

    /** @type {number} 倾向最大值 */
    this.maxTendency = 1.0;
  }

  /**
   * 更新倾向（基于事件记忆）
   * @param {string} region - 区域
   * @param {number[]} delta - 4D 倾向增量
   * @param {number} importance - 重要性权重
   */
  updateTendency(region, delta, importance = 0.1) {
    if (!this._tendencies.has(region)) {
      this._tendencies.set(region, [0, 0, 0, 0]);
    }

    const current = this._tendencies.get(region);
    for (let d = 0; d < DIMS; d++) {
      current[d] += delta[d] * importance;
      current[d] = Math.max(-this.maxTendency, Math.min(this.maxTendency, current[d]));
    }
  }

  /**
   * 获取倾向梯度
   * @param {string} region
   * @returns {number[]}
   */
  getTendencyGradient(region) {
    const tendency = this._tendencies.get(region);
    return tendency ? [...tendency] : [0, 0, 0, 0];
  }

  /**
   * 衰减所有倾向（每 tick 调用）
   */
  decay() {
    for (const [region, tendency] of this._tendencies) {
      let allZero = true;
      for (let d = 0; d < DIMS; d++) {
        tendency[d] *= this.decayRate;
        // R12: prune entries that have fully decayed to near-zero
        if (Math.abs(tendency[d]) > 1e-6) allZero = false;
      }
      if (allZero) {
        this._tendencies.delete(region);
      }
    }
  }

  /**
   * 获取所有倾向（用于调试/叙事）
   * @returns {Object}
   */
  getAllTendencies() {
    const result = {};
    for (const [region, tendency] of this._tendencies) {
      result[region] = [...tendency];
    }
    return result;
  }

  /**
   * 序列化
   * @returns {Object}
   */
  toJSON() {
    const data = {};
    for (const [region, tendency] of this._tendencies) {
      data[region] = [...tendency];  // R11: spread to avoid shared reference
    }
    return { tendencies: data, decayRate: this.decayRate };
  }

  /**
   * 反序列化
   * @param {Object} data
   * @returns {FutureTendencyTracker}
   */
  static fromJSON(data) {
    const tracker = new FutureTendencyTracker();
    tracker.decayRate = data.decayRate || 0.95;
    for (const [region, tendency] of Object.entries(data.tendencies || {})) {
      tracker._tendencies.set(region, [...tendency]);  // R11: spread to avoid shared reference
    }
    return tracker;
  }
}

module.exports = FutureTendencyTracker;
