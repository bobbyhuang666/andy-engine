/**
 * KnowledgeStore - 角色知识管理
 *
 * 管理每个角色知道什么、推断什么、不应该知道什么。
 * 与 Memory 的区别：Knowledge 是事实性的，Memory 是主观的。
 */

class KnowledgeStore {
  constructor(factStore) {
    this.factStore = factStore;
    /** @type {Map<string, Set<string>>} agentId → Set<factId> */
    this._knowledge = new Map();
    /** @type {Map<string, string>} 'agentId:factId' → source */
    this._sources = new Map();
  }

  /**
   * 让角色知道一个事实
   * @param {string} agentId
   * @param {string} factId
   * @param {string} source - 知识来源：direct/overheard/told/inferred/observed
   */
  addKnowledge(agentId, factId, source = 'direct') {
    if (!this._knowledge.has(agentId)) {
      this._knowledge.set(agentId, new Set());
    }
    this._knowledge.get(agentId).add(factId);
    this._sources.set(`${agentId}:${factId}`, source);
  }

  /**
   * 检查角色是否知道某个事实
   */
  hasKnowledge(agentId, factId) {
    const agentKnowledge = this._knowledge.get(agentId);
    return agentKnowledge ? agentKnowledge.has(factId) : false;
  }

  getSource(agentId, factId) {
    return this._sources.get(`${agentId}:${factId}`) || null;
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
  addKnowledgeBatch(agentId, factIds, source = 'direct') {
    for (const factId of factIds) {
      this.addKnowledge(agentId, factId, source);
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
    const sources = Object.fromEntries(this._sources);
    return { knowledge, sources };
  }

  /**
   * 反序列化
   */
  static fromJSON(data, factStore) {
    const store = new KnowledgeStore(factStore);
    const knowledgeData = data.knowledge || data;
    for (const [agentId, factIds] of Object.entries(knowledgeData)) {
      store._knowledge.set(agentId, new Set(factIds));
    }
    if (data.sources) {
      for (const [key, source] of Object.entries(data.sources)) {
        store._sources.set(key, source);
      }
    }
    return store;
  }
}

module.exports = KnowledgeStore;
