/**
 * RelationshipPressure — 关系压力层
 *
 * 纯函数/只读模块，从 agent relationships 快照计算关系压力。
 *
 * 压力来源：
 *   - 孤立（无关系或关系很少）→ 社交匮乏压力
 *   - 负面关系（impression.negative > positive）→ 冲突压力
 *   - 关系衰减（长时间无互动）→ 关系疏远压力
 */

const DEFAULT_THRESHOLDS = {
  isolationCount: 2,
  conflictRatio: 0.6,
  decayHours: 72,
};

class RelationshipPressure {
  /**
   * @param {Object} agentSnapshot - agent 状态快照（只读）
   * @param {Object[]} agentSnapshot.relationships - relationships 数组
   * @param {Object} [thresholds] - 阈值配置
   * @returns {Object} pressure - { isolation, conflict, decay, total }
   */
  static compute(agentSnapshot, thresholds = DEFAULT_THRESHOLDS) {
    if (!agentSnapshot || !agentSnapshot.relationships || agentSnapshot.relationships.length === 0) {
      // R21 P1-14: new agents have no relationships yet — this is normal,
      // not pathological. Return 0 isolation instead of hardcoded 0.8 to
      // avoid excessive pressure on newly created agents.
      return { isolation: 0, conflict: 0, decay: 0, total: 0 };
    }

    const relationships = agentSnapshot.relationships;
    const { isolationCount, conflictRatio, decayHours } = { ...DEFAULT_THRESHOLDS, ...thresholds };

    // 孤立压力
    // R22 P1 fix: treat NaN strength as active (don't silently drop)
    const activeCount = relationships.filter(r => {
      if (typeof r.strength !== 'number' || !Number.isFinite(r.strength)) return true; // treat NaN as potentially active
      return r.strength > 0.1;
    }).length;
    const isolation = activeCount < isolationCount
      ? Math.max(0, 1 - activeCount / isolationCount)
      : 0;

    // 冲突压力
    let conflictSum = 0;
    let conflictCount = 0;
    for (const rel of relationships) {
      if (!rel.impression) continue;
      const { positive = 0, negative = 0 } = rel.impression;
      // R22 P1 fix: NaN guard for impression values
      const pos = (typeof positive === 'number' && Number.isFinite(positive)) ? positive : 0;
      const neg = (typeof negative === 'number' && Number.isFinite(negative)) ? negative : 0;
      const total = pos + neg;
      if (total > 0 && (neg / total) > conflictRatio) {
        conflictSum += neg / total;
        conflictCount++;
      }
    }
    const conflict = conflictCount > 0 ? Math.min(1, conflictSum / relationships.length) : 0;

    // 衰减压力（长时间无互动的关系）
    let decaySum = 0;
    let decayCount = 0;
    for (const rel of relationships) {
      if (typeof rel._hoursSinceLastInteraction === 'number' && rel._hoursSinceLastInteraction > decayHours) {
        decaySum += Math.min(1, (rel._hoursSinceLastInteraction - decayHours) / decayHours);
        decayCount++;
      }
    }
    const decay = decayCount > 0 ? Math.min(1, decaySum / relationships.length) : 0;

    const total = Math.max(0, Math.min(1, isolation * 0.5 + conflict * 0.3 + decay * 0.2));

    return { isolation, conflict, decay, total };
  }
}

module.exports = { RelationshipPressure };
