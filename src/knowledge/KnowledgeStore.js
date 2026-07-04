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
        confidence: EVIDENCE_CONFIDENCE[sourceOrEvidence] ?? 0.5,
        learnedAt: 0,
        propagatedFrom: null,
        eventId: null,
      };
    }
    if (!sourceOrEvidence || typeof sourceOrEvidence !== 'object') {
      return {
        source: 'direct',
        confidence: 1.0,
        learnedAt: 0,
        propagatedFrom: null,
        eventId: null,
      };
    }
    // 已经是 object，补全默认值
    return {
      source: sourceOrEvidence.source || 'direct',
      // R35 P2 fix: clamp confidence to [0,1]. Number.isFinite rejects NaN but
      // allows out-of-range values (e.g., 2.0, -0.5) which corrupt downstream
      // probability calculations and weighted decisions.
      confidence: Number.isFinite(sourceOrEvidence.confidence)
        ? Math.max(0, Math.min(1, sourceOrEvidence.confidence))
        : (EVIDENCE_CONFIDENCE[sourceOrEvidence.source] ?? 1.0),
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
    if (!agentId || typeof agentId !== 'string') return;
    if (!factId || typeof factId !== 'string') return;
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
    // Verify the fact still exists (may have been evicted) without deep-copying
    // the fact. getFactById() is public and intentionally defensive; this hot
    // path only needs a boolean.
    return this.factStore._hasActiveFact(factId);
  }

  /**
   * 获取知识来源字符串
   * @param {string} agentId
   * @param {string} factId
   * @returns {string|null}
   */
  getSource(agentId, factId) {
    // R18 KNOW-001 fix: check if fact still exists in store (consistent with hasKnowledge)
    // R39 P1 fix: also reject invalidated facts, consistent with hasKnowledge().
    // 原 getSource 只检查 fact 存在,不检查 _invalidated,导致失效 fact 的 source
    // 仍可被读取,与 hasKnowledge() 语义不一致。
    const fact = this.factStore.getFactById(factId);
    if (!fact || fact._invalidated) return null;
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
    // R39 P1 fix: also reject invalidated facts, consistent with hasKnowledge().
    const fact = this.factStore.getFactById(factId);
    if (!fact || fact._invalidated) return null;
    // R14 fix: return shallow copy to prevent external mutation of store internals
    const ev = this._evidence.get(`${agentId}:${factId}`);
    return ev ? { ...ev } : null;
  }

  /**
   * 获取角色知道的所有事实 ID
   * R20 M14: return a defensive copy instead of the internal Set reference.
   * Without this, callers can directly mutate the store's internal state.
   * R39 P1 fix: filter out invalidated facts, consistent with hasKnowledge().
   * 原 getKnownFactIds 返回内部 Set 的拷贝但不过滤 invalidated,导致调用方拿到的
   * ID 集合包含已失效的 fact,与 hasKnowledge() 返回 false 的 fact 矛盾。
   */
  getKnownFactIds(agentId) {
    const internal = this._knowledge.get(agentId);
    if (!internal) return new Set();
    const filtered = new Set();
    for (const factId of internal) {
      if (this.factStore._hasActiveFact(factId)) {
        filtered.add(factId);
      }
    }
    return filtered;
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
   * Remove internal knowledge/evidence entries for facts that are missing or
   * invalidated in the backing fact store. Public read APIs already filter
   * these; this keeps restored and manually removed snapshots compact.
   */
  purgeInactiveFacts() {
    if (!this.factStore?._hasActiveFact) return;

    for (const [agentId, factIds] of this._knowledge) {
      for (const factId of Array.from(factIds)) {
        if (!this.factStore._hasActiveFact(factId)) {
          factIds.delete(factId);
          this._evidence.delete(`${agentId}:${factId}`);
        }
      }
      if (factIds.size === 0) {
        this._knowledge.delete(agentId);
      }
    }

    for (const key of Array.from(this._evidence.keys())) {
      const separator = key.indexOf(':');
      if (separator === -1) {
        this._evidence.delete(key);
        continue;
      }
      const agentId = key.slice(0, separator);
      const factId = key.slice(separator + 1);
      const factIds = this._knowledge.get(agentId);
      if (!factIds?.has(factId) || !this.factStore._hasActiveFact(factId)) {
        this._evidence.delete(key);
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
    const payload = data && typeof data === 'object' ? data : {};
    const knowledgeData = (payload.knowledge && typeof payload.knowledge === 'object') ? payload.knowledge : payload;
    for (const [agentId, factIds] of Object.entries(knowledgeData)) {
      // R41 fix: only restore array-typed values as factId sets.
      // Without this guard, when data.knowledge is missing and we fall
      // back to `data` itself, non-knowledge keys (evidence, sources) get
      // their values passed to new Set(), producing corrupt knowledge entries.
      if (Array.isArray(factIds)) {
        store._knowledge.set(agentId, new Set(factIds));
      }
    }

    if (payload.evidence && typeof payload.evidence === 'object') {
      for (const [key, ev] of Object.entries(payload.evidence)) {
        if (ev == null) continue;
        // R9 fix: normalize evidence objects to ensure all fields have proper
        // defaults (null instead of undefined for propagatedFrom/eventId)
        store._evidence.set(key, store._normalizeEvidence(ev));
      }
    } else if (payload.sources && typeof payload.sources === 'object') {
      for (const [key, source] of Object.entries(payload.sources)) {
        if (source == null) continue;
        if (typeof source === 'string') {
          store._evidence.set(key, store._normalizeEvidence(source));
        } else {
          // R104-3: normalize Evidence objects in legacy sources path
          // to ensure confidence, learnedAt, propagatedFrom have proper defaults.
          store._evidence.set(key, store._normalizeEvidence(source));
        }
      }
    }
    // 两者都不存在 → 空 _evidence（默认）

    store.purgeInactiveFacts();

    return store;
  }
}

module.exports = KnowledgeStore;
