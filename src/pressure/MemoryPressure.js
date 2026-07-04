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
      const { diagnostics } = require('../shared/Diagnostics');
      diagnostics.warnOnce('memory-pressure-simtime', '[andy-engine] MemoryPressure.compute() called without simTime — using 0 as fallback. This produces incorrect recency during fast-forward simulation.');
    }
    const parsedNow = options.simTime ? new Date(options.simTime).getTime() : 0;
    // R129-001: invalid Date strings produce NaN; recency math must not poison
    // pressure totals when callers pass corrupted or user-provided timestamps.
    const now = Number.isFinite(parsedNow) ? parsedNow : 0;

    for (const mem of memories) {
      if (!mem) continue;

      // R21 P1-8: NaN guard. typeof NaN === 'number' is true, so NaN values
      // would pass the type check and propagate to all outputs (sum/average).
      const importance = (typeof mem.importance === 'number' && Number.isFinite(mem.importance)) ? mem.importance : 0.5;
      const activation = (typeof mem.activation === 'number' && Number.isFinite(mem.activation)) ? mem.activation : 0.5;
      const valence = (typeof mem.valence === 'number' && Number.isFinite(mem.valence)) ? mem.valence : 0;

      const weight = importance * activation;

      if (valence < 0) {
        negativeSum += Math.abs(valence) * weight;
      } else if (valence > 0) {
        positiveSum += valence * weight;
      }

      // 最近记忆的时间衰减贡献
      if (mem.timestamp) {
        const timestampMs = new Date(mem.timestamp).getTime();
        if (!Number.isFinite(timestampMs)) continue;
        const age = now - timestampMs;
        // R22 P1 fix: clamp hoursAge to >= 0 to prevent recencyWeight explosion
        // when simTime is absent/earlier than mem.timestamp (causes negative age).
        const hoursAge = Math.max(0, age / (1000 * 60 * 60));
        const recencyWeight = Math.exp(-hoursAge / 24);
        recencySum += recencyWeight * Math.abs(valence) * importance;
      }

      count++;
    }

    if (count === 0) return { negative: 0, positive: 0, recency: 0, total: 0 };

    const negative = Number.isFinite(negativeSum) ? Math.min(1, negativeSum / count) : 0;
    const positive = Number.isFinite(positiveSum) ? Math.min(1, positiveSum / count) : 0;
    const recency = Number.isFinite(recencySum) ? Math.min(1, recencySum / count) : 0;
    const rawTotal = negative - positive * 0.5 + recency * 0.3;
    const total = Number.isFinite(rawTotal) ? Math.max(0, Math.min(1, rawTotal)) : 0;

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
