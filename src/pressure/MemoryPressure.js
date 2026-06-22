/**
 * MemoryPressure — 记忆压力层
 *
 * 纯函数/只读模块，从 agent memories 快照计算记忆压力。
 *
 * 压力来源：
 *   - 高重要性负面记忆 → 正压力
 *   - 高激活度记忆 → 增强压力
 *   - 最近的负面经历 → 时间衰减后仍贡献压力
 */

class MemoryPressure {
  /**
   * @param {Object} agentSnapshot - agent 状态快照（只读）
   * @param {Object[]} agentSnapshot.memories - memories 数组
   * @param {Object} [options]
   * @param {Date|string} [options.simTime] - simulation time. When omitted, falls back to Date.now()
   *   which produces incorrect recency calculations during fast-forward simulation.
   * @returns {Object} pressure - { negative, positive, recency, total }
   */
  static compute(agentSnapshot, options = {}) {
    if (!agentSnapshot || !agentSnapshot.memories || agentSnapshot.memories.length === 0) {
      return { negative: 0, positive: 0, recency: 0, total: 0 };
    }

    const memories = agentSnapshot.memories;
    let negativeSum = 0;
    let positiveSum = 0;
    let recencySum = 0;
    let count = 0;

    if (!options.simTime) {
      console.warn('[andy-engine] MemoryPressure.compute() called without simTime — falling back to Date.now(). This produces incorrect recency during fast-forward simulation.');
    }
    const now = options.simTime ? new Date(options.simTime).getTime() : Date.now();

    for (const mem of memories) {
      if (!mem) continue;

      const importance = typeof mem.importance === 'number' ? mem.importance : 0.5;
      const activation = typeof mem.activation === 'number' ? mem.activation : 0.5;
      const valence = typeof mem.valence === 'number' ? mem.valence : 0;

      const weight = importance * activation;

      if (valence < 0) {
        negativeSum += Math.abs(valence) * weight;
      } else if (valence > 0) {
        positiveSum += valence * weight;
      }

      // 最近记忆的时间衰减贡献
      if (mem.timestamp) {
        const age = now - new Date(mem.timestamp).getTime();
        const hoursAge = age / (1000 * 60 * 60);
        const recencyWeight = Math.exp(-hoursAge / 24);
        recencySum += recencyWeight * Math.abs(valence) * importance;
      }

      count++;
    }

    if (count === 0) return { negative: 0, positive: 0, recency: 0, total: 0 };

    const negative = Math.min(1, negativeSum / count);
    const positive = Math.min(1, positiveSum / count);
    const recency = Math.min(1, recencySum / count);
    const total = Math.max(0, Math.min(1, negative - positive * 0.5 + recency * 0.3));

    return { negative, positive, recency, total };
  }

  /**
   * 计算是否有显著负面记忆（压力超过阈值）
   * @param {Object} agentSnapshot
   * @param {number} [threshold=0.3]
   * @param {Object} [options]
   * @param {Date|string} [options.simTime] - simulation time (recommended for deterministic results)
   * @returns {boolean}
   */
  static hasSignificantNegativeMemory(agentSnapshot, threshold = 0.3, options = {}) {
    const pressure = MemoryPressure.compute(agentSnapshot, options);
    return pressure.negative > threshold;
  }
}

module.exports = { MemoryPressure };
