/**
 * WorldFactStore - 世界事实存储
 *
 * 统一的事实存储层，管理所有世界事实的增删查改。
 * 支持按类型、按角色视角、按时间查询。
 *
 * 事实生命周期：
 *   - EventFact: append-only，不可修改
 *   - MemoryFact: 可更新（记忆再巩固）
 *   - AgentStateFact: 每 tick 覆盖（最新状态）
 *   - RelationshipFact: 更新时保留 previousType
 */

const {
  FactType,
  FACT_TYPES,
  FactSource,
  FactScope,
  validateFact,
  validateTypeFields,
  createInvalidatedFact,
  createLocationMeaningFact,
} = require('./FactSchema');

/** Maximum number of event facts to retain before eviction */
const MAX_EVENT_FACTS = 2000;

class WorldFactStore {
  constructor() {
    /** @type {Map<string, Object>} id → fact */
    this._facts = new Map();

    /** @type {Map<string, Set<string>>} FactType → Set<factId> */
    this._byType = new Map();
    for (const t of FACT_TYPES) {
      this._byType.set(t, new Set());
    }

    /** @type {Map<string, Set<string>>} agentId → Set<factId> */
    this._byAgent = new Map();

    /** @type {Map<string, string>} eventId → factId */
    this._eventIndex = new Map();

    /** @type {number} 确定性 ID 计数器 */
    this._nextId = 0;

    /** @type {Date|null} 模拟时间 */
    this._simTime = null;

    /** @type {import('../knowledge/KnowledgeStore')|null} R7: wired by AndyWorld for eviction sync */
    this._knowledgeStore = null;
  }

  /**
   * R7 fix: Wire the knowledge store so that _evictEventFacts() can purge
   * stale knowledge entries. Called by AndyWorld after constructing both.
   * @param {import('../knowledge/KnowledgeStore')} knowledgeStore
   */
  setKnowledgeStore(knowledgeStore) {
    this._knowledgeStore = knowledgeStore;
  }

  // ═══════════════════════════════════════════
  // 时间管理
  // ═══════════════════════════════════════════

  /**
   * 设置模拟时间
   * @param {Date|string|number} time - 模拟时间
   */
  setSimTime(time) {
    this._simTime = time instanceof Date ? time : new Date(time);
  }

  /**
   * 获取模拟时间
   * @returns {Date|null}
   */
  getSimTime() {
    return this._simTime;
  }

  // ═══════════════════════════════════════════
  // 写入
  // ═══════════════════════════════════════════

  /**
   * 添加一条事实
   * @param {Object} fact
   * @returns {Object} 添加后的事实（含生成的 id）
   */
  addFact(fact) {
    if (!fact.id) {
      fact.id = `fact_${fact.source || 'engine'}_${this._nextId++}`;
    }

    const baseCheck = validateFact(fact);
    if (!baseCheck.valid) {
      throw new Error(`Invalid fact: ${baseCheck.errors.join('; ')}`);
    }

    const typeCheck = validateTypeFields(fact);
    if (!typeCheck.valid) {
      throw new Error(`Invalid type fields: ${typeCheck.errors.join('; ')}`);
    }

    if (fact.type === FactType.EVENT && this._eventIndex.has(fact.eventId)) {
      throw new Error(`EventFact ${fact.eventId} already exists (append-only)`);
    }

    // R19: store a deep copy to prevent external mutation of store internals
    const stored = this._deepCopyFact(fact);
    this._facts.set(fact.id, stored);
    this._byType.get(fact.type).add(fact.id);

    this._indexAgents(stored);

    if (fact.type === FactType.EVENT) {
      this._eventIndex.set(fact.eventId, fact.id);
      // Evict oldest event facts when exceeding limit
      this._evictEventFacts();
    }

    return this._deepCopyFact(stored);
  }

  /**
   * 批量添加事实
   * @param {Object[]} facts
   * @returns {Object[]} 添加后的事实列表
   */
  addFacts(facts) {
    return facts.map(f => this.addFact(f));
  }

  /**
   * Evict oldest event facts when exceeding MAX_EVENT_FACTS.
   * Prevents unbounded growth of append-only event facts.
   * @private
   */
  _evictEventFacts() {
    const eventIds = this._byType.get(FactType.EVENT);
    if (eventIds.size <= MAX_EVENT_FACTS) return;

    // Collect event facts sorted by timestamp (oldest first)
    const events = [];
    for (const id of eventIds) {
      const fact = this._facts.get(id);
      if (fact) events.push(fact);
    }
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const removeCount = eventIds.size - Math.floor(MAX_EVENT_FACTS * 0.8);
    const evictedIds = [];
    for (let i = 0; i < removeCount && i < events.length; i++) {
      const fact = events[i];
      this._facts.delete(fact.id);
      eventIds.delete(fact.id);
      if (fact.eventId) this._eventIndex.delete(fact.eventId);
      this._unindexAgents(fact);
      evictedIds.push(fact.id);
    }

    // R7 fix: Notify knowledge store to purge stale entries for evicted facts,
    // preventing hasKnowledge() returning true for evicted facts and
    // preventing unbounded _knowledge/_evidence Map growth.
    if (evictedIds.length > 0 && this._knowledgeStore) {
      this._knowledgeStore.purgeEvictedFacts(evictedIds);
    }
  }

  /**
   * 更新一条事实（仅 MEMORY 和 AGENT_STATE 类型允许更新）
   * @param {string} id
   * @param {Partial<Object>} updates
   * @returns {Object} 更新后的事实
   */
  updateFact(id, updates) {
    const existing = this._facts.get(id);
    if (!existing) {
      throw new Error(`Fact ${id} not found`);
    }

    if (existing.type === FactType.EVENT) {
      throw new Error('EventFact is immutable (append-only)');
    }

    if (existing.type === FactType.STATIC_ENV) {
      throw new Error('StaticEnvFact is immutable');
    }

    if (existing.type === FactType.RELATIONSHIP && updates.relationType && updates.relationType !== existing.relationType) {
      updates.previousType = existing.relationType;
    }

    const updated = { ...existing, ...updates, id: existing.id, type: existing.type };

    const baseCheck = validateFact(updated);
    if (!baseCheck.valid) {
      throw new Error(`Invalid fact after update: ${baseCheck.errors.join('; ')}`);
    }

    // R13 C4 fix: validate type-specific fields after update, same as addFact().
    // Without this, a RELATIONSHIP update with invalid relationType or an
    // AGENT_STATE update with invalid agentId would be silently accepted.
    const typeCheck = validateTypeFields(updated);
    if (!typeCheck.valid) {
      throw new Error(`Invalid type fields after update: ${typeCheck.errors.join('; ')}`);
    }

    this._unindexAgents(existing);
    this._facts.set(id, updated);
    this._indexAgents(updated);

    // R19: return deep copy to prevent external mutation of store internals
    return this._deepCopyFact(updated);
  }

  // ═══════════════════════════════════════════
  // 查询（按类型）
  // ═══════════════════════════════════════════

  /**
   * 获取所有事实
   * @param {string[]} [types] - 过滤类型
   * @returns {Object[]}
   */
  getAllFacts(types) {
    if (types) {
      const result = [];
      for (const t of types) {
        const ids = this._byType.get(t);
        if (ids) {
          // R19: return deep copies to prevent external mutation of store internals
          for (const id of ids) result.push(this._deepCopyFact(this._facts.get(id)));
        }
      }
      return result;
    }
    // R19: return deep copies to prevent external mutation of store internals
    return Array.from(this._facts.values()).map(f => this._deepCopyFact(f));
  }

  /**
   * 获取静态环境事实
   * @returns {Object[]}
   */
  getStaticFacts() {
    return this._getByType(FactType.STATIC_ENV);
  }

  /**
   * 获取角色状态事实
   * @returns {Object[]}
   */
  getAgentStateFacts() {
    return this._getByType(FactType.AGENT_STATE);
  }

  /**
   * 获取关系事实
   * @returns {Object[]}
   */
  getRelationshipFacts() {
    return this._getByType(FactType.RELATIONSHIP);
  }

  /**
   * 获取事件事实
   * @param {number} [limit] - 返回数量限制
   * @param {Date} [since] - 起始时间
   * @returns {Object[]}
   */
  getEventFacts(limit, since) {
    let events = this._getByType(FactType.EVENT);

    if (since) {
      const sinceTime = since instanceof Date ? since.getTime() : since;
      events = events.filter(e => e.timestamp.getTime() >= sinceTime);
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (limit && limit > 0) {
      events = events.slice(0, limit);
    }

    return events;
  }

  /**
   * 获取观察事实
   * @returns {Object[]}
   */
  getObservationFacts() {
    return this._getByType(FactType.OBSERVATION);
  }

  /**
   * 获取记忆事实
   * @returns {Object[]}
   */
  getMemoryFacts() {
    return this._getByType(FactType.MEMORY);
  }

  // ═══════════════════════════════════════════
  // 查询（按角色视角）
  // ═══════════════════════════════════════════

  /**
   * 获取某个 Agent 知道的所有事实
   *
   * Agent 知道的事实包括：
   *   - 所有 public scope 的事实
   *   - 该 agent 作为 participant 或 observer 的 local 事实
   *   - 该 agent 的 memory 事实
   *   - 该 agent 的 agent_state 事实
   *
   * @param {string} agentId
   * @param {Object} [options]
   * @param {string[]} [options.types] - 过滤类型
   * @param {number} [options.limit] - 数量限制
   * @returns {Object[]}
   */
  getFactsForAgent(agentId, options = {}) {
    const knownIds = this._byAgent.get(agentId);
    const result = [];
    const seen = new Set();

    // Phase 1: PUBLIC facts (visible to all, except AGENT_STATE for other agents)
    for (const [id, fact] of this._facts) {
      if (fact.scope !== FactScope.PUBLIC) continue;
      // AGENT_STATE is epistemically private: only the owning agent sees their own state
      if (fact.type === FactType.AGENT_STATE && fact.agentId !== agentId) continue;
      if (fact._invalidated) continue;
	      if (options.types && !options.types.includes(fact.type)) continue;
	      seen.add(id);
	      result.push(this._deepCopyFact(fact));
	    }

    // Phase 2: Non-public facts known to this agent (use _byAgent index instead of full scan)
    if (knownIds) {
      for (const id of knownIds) {
        if (seen.has(id)) continue; // already added as PUBLIC
        const fact = this._facts.get(id);
        if (!fact || fact._invalidated) continue;
        // AGENT_STATE epistemic privacy: even if this fact is indexed for
        // this agent (e.g., via observers), only the owning agent should see it.
        if (fact.type === FactType.AGENT_STATE && fact.agentId !== agentId) continue;
	        if (options.types && !options.types.includes(fact.type)) continue;
		        result.push(this._deepCopyFact(fact));
	      }
	    }

    result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit && options.limit > 0) {
      return result.slice(0, options.limit);
    }

    return result;
  }

  // ═══════════════════════════════════════════
  // 查询（按时间）
  // ═══════════════════════════════════════════

  /**
   * 获取指定时间之后的事实
   * @param {Date} timestamp
   * @param {string[]} [types] - 过滤类型
   * @returns {Object[]}
   */
  getFactsSince(timestamp, types) {
    const sinceTime = timestamp instanceof Date ? timestamp.getTime() : timestamp;
    const result = [];

    for (const fact of this._facts.values()) {
      if (fact.timestamp.getTime() < sinceTime) continue;
      if (types && !types.includes(fact.type)) continue;
	      result.push(this._deepCopyFact(fact));
	    }

	    result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	    return result;
  }

  /**
   * 根据 ID 获取单条事实
   * @param {string} id
   * @returns {Object|null}
   */
  getFactById(id) {
    // R19: return deep copy to prevent external mutation of store internals
    const fact = this._facts.get(id);
    return fact ? this._deepCopyFact(fact) : null;
  }

  // ═══════════════════════════════════════════
  // 删除
  // ═══════════════════════════════════════════

  /**
   * 删除一条事实（EventFact 不可删除）
   * @param {string} id
   * @returns {boolean}
   */
  removeFact(id) {
    const fact = this._facts.get(id);
    if (!fact) return false;

    if (fact.type === FactType.EVENT) {
      throw new Error('EventFact cannot be removed (append-only)');
    }

    this._facts.delete(id);
    this._byType.get(fact.type).delete(id);

    this._unindexAgents(fact);

    return true;
  }

  // ═══════════════════════════════════════════
  // 持久化
  // ═══════════════════════════════════════════

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    const facts = Array.from(this._facts.values()).map(f => {
      const serialized = { ...f };
      if (serialized.timestamp instanceof Date) {
        serialized.timestamp = serialized.timestamp.toISOString();
      }
      return serialized;
    });

    return {
      version: 1,
      nextId: this._nextId,
      facts,
    };
  }

  /**
   * 从 JSON 恢复
   * @param {Object} data
   * @returns {WorldFactStore}
   */
  static fromJSON(data) {
    const store = new WorldFactStore();
    store._nextId = data.nextId || 0;

    for (const f of data.facts) {
      // R12: deep-copy each fact to prevent mutating input + shared reference
      const fact = { ...f };
      if (typeof fact.timestamp === 'string') {
        fact.timestamp = new Date(fact.timestamp);
      }
      // R18 AE-002 fix: validate deserialized facts to prevent invalid data
      // from bypassing the addFact validation pipeline.
      const baseCheck = validateFact(fact);
      if (!baseCheck.valid) {
        continue; // skip invalid facts rather than crash
      }
      const typeCheck = validateTypeFields(fact);
      if (!typeCheck.valid) {
        continue; // skip facts with invalid type-specific fields
      }
      store._facts.set(fact.id, fact);
      store._byType.get(f.type).add(f.id);
      store._indexAgents(fact);
      if (f.type === FactType.EVENT) {
        store._eventIndex.set(f.eventId, f.id);
      }
    }

    return store;
  }

  // ═══════════════════════════════════════════
  // 统计
  // ═══════════════════════════════════════════

  /**
   * 获取存储统计信息
   * @returns {Object}
   */
  getStats() {
    const byType = {};
    for (const t of FACT_TYPES) {
      byType[t] = this._byType.get(t).size;
    }

    return {
      total: this._facts.size,
      byType,
      agentCount: this._byAgent.size,
      nextId: this._nextId,
    };
  }

  /**
   * 事实总数
   * @returns {number}
   */
  get size() {
    return this._facts.size;
  }

  // ═══════════════════════════════════════════
  // 失效/覆盖
  // ═══════════════════════════════════════════

  /**
   * 标记事实为失效
   * @param {string} factId - 要失效的事实 ID
   * @param {string} reason - 失效原因
   * @param {string} [supersededBy] - 替代事实 ID（可选）
   * @returns {Object} 失效记录
   */
  invalidateFact(factId, reason, supersededBy = null) {
    const fact = this._facts.get(factId);
    if (!fact) throw new Error(`Fact ${factId} not found`);

    const FALLBACK_EPOCH = new Date('2024-01-01T00:00:00Z');
    const invalidation = createInvalidatedFact({
      originalFactId: factId,
      reason,
      supersededBy,
      timestamp: this._simTime || FALLBACK_EPOCH,
      source: 'engine',
    });

    this.addFact(invalidation);

    fact._invalidated = true;
    fact._invalidationId = invalidation.id;

    return invalidation;
  }

  /**
   * 获取有效事实（排除失效的）
   * @param {string[]} [types] - 过滤类型
   * @returns {Object[]}
   */
  getActiveFacts(types) {
    return this.getAllFacts(types).filter(f => !f._invalidated && f.type !== FactType.INVALIDATED);
  }

  /**
   * 获取某个事实的完整历史（包括失效记录）
   * @param {string} factId
   * @returns {Object|null}
   */
  getFactHistory(factId) {
    const fact = this._facts.get(factId);
    if (!fact) return null;

    // R19: return deep copies to prevent external mutation of store internals
    return {
      current: this._deepCopyFact(fact),
      invalidated: fact._invalidated || false,
      invalidation: fact._invalidationId ? this._deepCopyFact(this._facts.get(fact._invalidationId)) : null,
    };
  }

  // ═══════════════════════════════════════════
  // 地点意义
  // ═══════════════════════════════════════════

  /**
   * 更新地点意义
   * @param {string} location - 地点名称
   * @param {Object} meaning - 意义数据
   * @param {string} meaning.type - 意义类型（rest/work/social/explore）
   * @param {number} meaning.weight - 权重 (0-1)
   * @param {string} [meaning.reason] - 变化原因
   */
  updateLocationMeaning(location, meaning) {
    const FALLBACK_EPOCH = new Date('2024-01-01T00:00:00Z');
    const existing = this.getLocationMeaning(location);

    if (existing) {
      this.updateFact(existing.id, {
        meaningType: meaning.type,
        weight: meaning.weight,
        reason: meaning.reason,
        timestamp: this._simTime || FALLBACK_EPOCH,
      });
    } else {
      const fact = createLocationMeaningFact({
        location,
        meaningType: meaning.type,
        weight: meaning.weight,
        reason: meaning.reason,
        timestamp: this._simTime || FALLBACK_EPOCH,
        source: 'engine',
      });
      this.addFact(fact);
    }
  }

  /**
   * 获取地点意义
   * @param {string} location
   * @returns {Object|null}
   */
  getLocationMeaning(location) {
    return this._getByType(FactType.LOCATION_MEANING).find(f => f.location === location) || null;
  }

  /**
   * 获取所有地点意义
   * @returns {Object[]}
   */
  getAllLocationMeanings() {
    return this._getByType(FactType.LOCATION_MEANING);
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /** @private */
  _getByType(type) {
    const ids = this._byType.get(type);
    if (!ids) return [];
    // Filter out undefined entries (can occur if fact was evicted but index
    // not yet cleaned, or during partial mutation). R6 fix.
    // R18 AE-001 fix: return deep copies to prevent external mutation.
    return Array.from(ids).map(id => this._facts.get(id)).filter(Boolean).map(f => this._deepCopyFact(f));
  }

  /**
   * Deep copy a fact object, cloning nested arrays (participants, observers, tags).
   * Prevents external mutation of store internals via shared references.
   * @private
   * @param {Object} fact
   * @returns {Object}
   */
  _deepCopyFact(fact) {
    const copy = { ...fact };
    if (Array.isArray(copy.participants)) copy.participants = [...copy.participants];
    if (Array.isArray(copy.observers)) copy.observers = [...copy.observers];
    if (Array.isArray(copy.tags)) copy.tags = [...copy.tags];
    return copy;
  }

  /** @private */
  _indexAgents(fact) {
    const agents = new Set();

    if (fact.participants) {
      for (const p of fact.participants) agents.add(p);
    }
    if (fact.observers) {
      for (const o of fact.observers) agents.add(o);
    }
    if (fact.agentId) agents.add(fact.agentId);
    if (fact.agentA) agents.add(fact.agentA);
    if (fact.agentB) agents.add(fact.agentB);
    if (fact.observerId) agents.add(fact.observerId);
    if (fact.targetId) agents.add(fact.targetId);

    for (const agentId of agents) {
      if (!this._byAgent.has(agentId)) {
        this._byAgent.set(agentId, new Set());
      }
      this._byAgent.get(agentId).add(fact.id);
    }
  }

  /** @private */
  _unindexAgents(fact) {
    for (const [, ids] of this._byAgent) {
      ids.delete(fact.id);
    }
  }
}

module.exports = WorldFactStore;
