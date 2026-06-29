/**
 * KnowledgeStore - 角色知识管理
 *
 * 管理每个角色知道什么、推断什么、不应该知道什么。
 * 与 Memory 的区别：Knowledge 是事实性的，Memory 是主观的。
 */

/**
 * @typedef {Object} Evidence
 * @property {string}   source           - 'direct'|'observed'|'overheard'|'told'|'inferred'
 * @property {number}   confidence       - [0-1], direct=1.0 observed=0.9 overheard=0.7 told=0.6 inferred=0.5
 * @property {number}   learnedAt        - simTime ms (0 = unknown, backward compat)
 * @property {string|null} propagatedFrom - told: 告知者 ID; 其他: null
 * @property {string|null} eventId       - 触发事件 ID (optional)
 */

const EVIDENCE_CONFIDENCE = {
  direct: 1.0,
  observed: 0.9,
  overheard: 0.7,
  told: 0.6,
  inferred: 0.5,
};

class KnowledgeStore {
  constructor(factStore) {
    this.factStore = factStore;
    /** @type {Map<string, Set<string>>} agentId → Set<factId> */
    this._knowledge = new Map();
    /** @type {Map<string, Evidence>} 'agentId:factId' → Evidence */
    this._evidence = new Map();
  }

  /**
   * 归一化 sourceOrEvidence 为 Evidence 对象
   * @param {string|Evidence} sourceOrEvidence
   * @returns {Evidence}
   */
  _normalizeEvidence(sourceOrEvidence) {
    if (typeof sourceOrEvidence === 'string') {
      return {
        source: sourceOrEvidence,
        confidence: EVIDENCE_CONFIDENCE[sourceOrEvidence] ?? 1.0,
        learnedAt: 0,
        propagatedFrom: null,
        eventId: null,
      };
    }
    // 已经是 object，补全默认值
    return {
      source: sourceOrEvidence.source || 'direct',
      confidence: Number.isFinite(sourceOrEvidence.confidence) ? sourceOrEvidence.confidence : (EVIDENCE_CONFIDENCE[sourceOrEvidence.source] ?? 1.0),
      learnedAt: Number.isFinite(sourceOrEvidence.learnedAt) ? sourceOrEvidence.learnedAt : 0,
      propagatedFrom: sourceOrEvidence.propagatedFrom ?? null,
      eventId: sourceOrEvidence.eventId ?? null,
    };
  }

  /**
   * 让角色知道一个事实
   * @param {string} agentId
   * @param {string} factId
   * @param {string|Evidence} sourceOrEvidence - 知识来源字符串或 Evidence 对象
   */
  addKnowledge(agentId, factId, sourceOrEvidence = 'direct') {
    if (!this._knowledge.has(agentId)) {
      this._knowledge.set(agentId, new Set());
    }
    this._knowledge.get(agentId).add(factId);
    this._evidence.set(`${agentId}:${factId}`, this._normalizeEvidence(sourceOrEvidence));
  }

  /**
   * 检查角色是否知道某个事实
   * R7 fix: also verify the fact still exists in the fact store. After
   * WorldFactStore eviction, stale knowledge entries would otherwise return
   * true even though the fact is gone, creating an inconsistency between
   * hasKnowledge() and getKnownFacts() (which already filters evicted facts).
   */
  hasKnowledge(agentId, factId) {
    const agentKnowledge = this._knowledge.get(agentId);
    if (!agentKnowledge || !agentKnowledge.has(factId)) return false;
    // Verify the fact still exists (may have been evicted)
    const fact = this.factStore.getFactById(factId);
    if (!fact || fact._invalidated) return false;
    return true;
  }

  /**
   * 获取知识来源字符串
   * @param {string} agentId
   * @param {string} factId
   * @returns {string|null}
   */
  getSource(agentId, factId) {
    // R18 KNOW-001 fix: check if fact still exists in store (consistent with hasKnowledge)
    if (!this.factStore.getFactById(factId)) return null;
    const evidence = this._evidence.get(`${agentId}:${factId}`);
    return evidence ? evidence.source : null;
  }

  /**
   * 获取完整 Evidence 对象
   * @param {string} agentId
   * @param {string} factId
   * @returns {Evidence|null}
   */
  getEvidence(agentId, factId) {
    // R18 KNOW-001 fix: check if fact still exists in store (consistent with hasKnowledge)
    if (!this.factStore.getFactById(factId)) return null;
    // R14 fix: return shallow copy to prevent external mutation of store internals
    const ev = this._evidence.get(`${agentId}:${factId}`);
    return ev ? { ...ev } : null;
  }

  /**
   * 获取角色知道的所有事实 ID
   */
  getKnownFactIds(agentId) {
    return this._knowledge.get(agentId) || new Set();
  }

  /**
   * 获取角色知道的所有事实
   */
  getKnownFacts(agentId, options = {}) {
    const factIds = this.getKnownFactIds(agentId);
    const facts = [];

    for (const id of factIds) {
      const fact = this.factStore.getFactById(id);
      if (fact && !fact._invalidated) {
        if (options.types && !options.types.includes(fact.type)) continue;
        facts.push(fact);
      }
    }

    return facts;
  }

  /**
   * 批量添加知识
   */
  addKnowledgeBatch(agentId, factIds, sourceOrEvidence = 'direct') {
    for (const factId of factIds) {
      this.addKnowledge(agentId, factId, sourceOrEvidence);
    }
  }

  /**
   * 移除角色对某个事实的知识
   */
  removeKnowledge(agentId, factId) {
    const agentKnowledge = this._knowledge.get(agentId);
    if (agentKnowledge) {
      agentKnowledge.delete(factId);
    }
    this._evidence.delete(`${agentId}:${factId}`);
  }

  /**
   * R7 fix: Remove knowledge entries for fact IDs that no longer exist in
   * the fact store (e.g., after WorldFactStore eviction). Called by
   * WorldFactStore._evictEventFacts() to keep knowledge consistent and
   * prevent unbounded growth of _knowledge/_evidence Maps.
   * @param {string[]} evictedFactIds - fact IDs that were just evicted
   */
  purgeEvictedFacts(evictedFactIds) {
    if (!evictedFactIds || evictedFactIds.length === 0) return;
    const evictedSet = new Set(evictedFactIds);

    for (const [agentId, factIds] of this._knowledge) {
      for (const factId of evictedSet) {
        if (factIds.has(factId)) {
          factIds.delete(factId);
          this._evidence.delete(`${agentId}:${factId}`);
        }
      }
      // Clean up empty agent entries
      if (factIds.size === 0) {
        this._knowledge.delete(agentId);
      }
    }
  }

  /**
   * 获取知识统计
   */
  getStats() {
    const stats = {
      agentCount: this._knowledge.size,
      totalKnowledge: 0,
      byAgent: {},
    };

    for (const [agentId, factIds] of this._knowledge) {
      stats.byAgent[agentId] = factIds.size;
      stats.totalKnowledge += factIds.size;
    }

    return stats;
  }

  /**
   * 序列化
   */
  toJSON() {
    const knowledge = {};
    for (const [agentId, factIds] of this._knowledge) {
      knowledge[agentId] = Array.from(factIds);
    }
    const evidence = Object.fromEntries(this._evidence);
    // sources 保留作为 evidence 的别名（相同内容），便于下游读取旧结构
    return { knowledge, evidence, sources: { ...evidence } };
  }

  /**
   * 反序列化
   * 兼容新旧格式：
   *   1. 优先读 data.evidence（Evidence 对象）
   *   2. fallback 读 data.sources（string 或 Evidence 对象）
   *   3. 两者都不存在 → 空 _evidence
   */
  static fromJSON(data, factStore) {
    const store = new KnowledgeStore(factStore);
    const knowledgeData = data.knowledge || data;
    for (const [agentId, factIds] of Object.entries(knowledgeData)) {
      store._knowledge.set(agentId, new Set(factIds));
    }

    if (data.evidence) {
      for (const [key, ev] of Object.entries(data.evidence)) {
        // R9 fix: normalize evidence objects to ensure all fields have proper
        // defaults (null instead of undefined for propagatedFrom/eventId)
        store._evidence.set(key, store._normalizeEvidence(ev));
      }
    } else if (data.sources) {
      for (const [key, source] of Object.entries(data.sources)) {
        if (typeof source === 'string') {
          store._evidence.set(key, store._normalizeEvidence(source));
        } else {
          // 已经是 Evidence 对象（旧升级格式）
          store._evidence.set(key, source);
        }
      }
    }
    // 两者都不存在 → 空 _evidence（默认）

    return store;
  }
}

module.exports = KnowledgeStore;
