/**
 * FactEmitter - 事实生成器
 *
 * 从引擎各子系统提取事实，写入 WorldFactStore。
 * 是纯函数，不修改引擎状态。
 */

const {
  FactType, FactSource, FactScope, FACT_SCOPES,
  createStaticEnvFact,
  createAgentStateFact,
  createEventFact,
  createObservationFact,
  createRelationshipFact,
  createMemoryFact,
} = require('./FactSchema');

class FactEmitter {
  /**
   * @param {import('./WorldFactStore')} factStore
   * @param {Object} [options]
   * @param {Object} [options.rng] - 可选的 RNG 实例
   * @param {import('../knowledge/KnowledgeStore')} [options.knowledgeStore] - 可选的知识存储
   */
  constructor(factStore, options = {}) {
    this.store = factStore;
    this.knowledgeStore = options.knowledgeStore || null;
    this._rng = options.rng || null;
    this._emittedStatic = false;
    this._eventFallbackId = 0;
  }

  /**
   * 从 Domain Config 提取静态环境事实
   * 只在首次调用时发射，后续调用跳过
   *
   * @param {Object} domain - DomainRegistry 实例
   * @returns {Object[]} 发射的事实
   */
  emitStaticFacts(domain) {
    if (this._emittedStatic) return [];
    if (!domain) return [];

    const facts = [];
    const now = this._getSimTime();

    if (domain.regions && Array.isArray(domain.regions)) {
      for (const region of domain.regions) {
        const fact = createStaticEnvFact({
          area: '世界',
          object: region,
          description: '存在此区域',
          timestamp: now,
          source: FactSource.ENGINE,
          confidence: 1.0,
          scope: FactScope.PUBLIC,
        });
        this.store.addFact(fact);
        facts.push(fact);
      }
    }

    if (domain.adjacency && Array.isArray(domain.adjacency)) {
      for (const [from, to] of domain.adjacency) {
        const fact = createStaticEnvFact({
          area: from,
          object: to,
          description: '相邻',
          timestamp: now,
          source: FactSource.ENGINE,
          confidence: 1.0,
          scope: FactScope.PUBLIC,
        });
        this.store.addFact(fact);
        facts.push(fact);
      }
    }

    this._emittedStatic = true;
    return facts;
  }

  /**
   * 从 Agent 状态提取动态状态事实
   * 每 tick 调用，覆盖旧 of agent_state 事实
   *
   * @param {Map<string, Object>} agents - agentId → Agent 实例
   * @returns {Object[]} 发射的事实
   */
  emitAgentStateFacts(agents) {
    if (!agents || agents.size === 0) return [];

    const facts = [];
    const now = this._getSimTime();
    const existingByAgentId = new Map(
      this.store.getAgentStateFacts().map(f => [f.agentId, f]),
    );

    for (const [agentId, agent] of agents) {
      const stateLabel = agent.stateMachine?.currentState || '未知';
      const position = agent.position || '未知';

      let emotionSummary = '平静';
      if (agent.emotion) {
        const dominant = agent.emotion.getDominant?.(1) || [];
        if (dominant.length > 0 && dominant[0].value > 0.1) {
          emotionSummary = dominant[0].dimension;
        }
      }

      const fact = createAgentStateFact({
        agentId,
        state: stateLabel,
        region: position,
        emotionSummary,
        timestamp: now,
        source: FactSource.ENGINE,
        confidence: 1.0,
        // R22 P1 fix: AGENT_STATE facts are semantically private — only the owning
        // agent should perceive their own state. PUBLIC scope leaked agent state
        // into getAllFacts/getFactsSince/getActiveFacts, requiring fragile type-specific
        // filtering in downstream code. LOCAL + participants restricts visibility
        // through the scope mechanism in getFactsForAgent Phase 2.
        scope: FactScope.LOCAL,
        participants: [agentId],
      });

      const existing = existingByAgentId.get(agentId);
      if (existing) {
        const updated = this.store.updateFact(existing.id, {
          state: stateLabel,
          region: position,
          emotionSummary,
          timestamp: now,
        });
        if (updated) existingByAgentId.set(agentId, updated);
        facts.push(updated || fact);
      } else {
        const added = this.store.addFact(fact);
        existingByAgentId.set(agentId, added);
        facts.push(fact);
      }
    }

    return facts;
  }

  /**
   * 从 EventDispatcher 提取事件事实
   *
   * **BOUNDARY**: 当 CanonEventPipeline 启用时，事件事实由 CanonEventPipeline 负责创建。
   * 此方法仅在 CanonEventPipeline 未启用时作为 fallback 使用。
   * 新代码必须使用 CanonEventPipeline，不要调用此方法创建事件事实。
   *
   * @deprecated Use CanonEventPipeline for dispatched event → fact conversion.
   * This method is a legacy fallback. New code must not call it.
   *
   * @param {Object[]} events - EventDispatcher.eventLog 中的事件
   * @returns {Object[]} 发射的事实
   */
  emitEventFacts(events) {
    if (!events || !Array.isArray(events) || events.length === 0) return [];

    const facts = [];

    for (const event of events) {
      if (!event || !event.type) continue;

      const scope = FACT_SCOPES.includes(event.scope) ? event.scope : FactScope.PUBLIC;
      const fact = createEventFact({
        eventId: event.id || this._makeEventId(event),
        description: event.content || `${event.type}事件`,
        location: event.location || '',
        timestamp: event.time || this._getSimTime(),
        source: FactSource.ENGINE,
        confidence: 1.0,
        scope,
        participants: event.participants || [],
        observers: event.observers || [],
      });

      // R41 P2 fix: match CanonEventPipeline behaviour — mark internal-scope
      // and action_selected events as auditOnly so they don't leak through
      // knowledge propagation or effect pipelines.
      if (event.scope === 'internal' || event.type === 'action_selected') {
        fact.auditOnly = true;
        fact.eventType = event.type;
        fact.originalScope = event.scope || null;
      }

      try {
        this.store.addFact(fact);
        facts.push(fact);
      } catch (e) {
        if (e.message.includes('already exists')) continue;
        throw e;
      }
    }

    return facts;
  }

  /**
   * 从交互事件提取观察事实
   *
   * @param {Object[]} interactionEvents - Simulator 的交互事件
   * @returns {Object[]}
   */
  emitObservationFacts(interactionEvents) {
    if (!interactionEvents || !Array.isArray(interactionEvents)) return [];

    const facts = [];
    const now = this._getSimTime();

    for (const event of interactionEvents) {
      if (!event || !event.participants || event.participants.length < 2) continue;

      for (let i = 0; i < event.participants.length; i++) {
        const observerId = event.participants[i];
        const targetId = event.participants[(i + 1) % event.participants.length];

        const fact = createObservationFact({
          observerId,
          targetId,
          action: event.content || '互动',
          context: event.location || '',
          timestamp: event.time || now,
          source: FactSource.OBSERVATION,
          confidence: 0.9,
          scope: FactScope.LOCAL,
          participants: [observerId, targetId],
          observers: [observerId],
        });

        this.store.addFact(fact);
        facts.push(fact);
      }
    }

    return facts;
  }

  /**
   * 从 SocialGraph 提取关系事实
   *
   * @param {Object} socialGraph - SocialGraph 实例
   * @returns {Object[]}
   */
  emitRelationshipFacts(socialGraph) {
    if (!socialGraph) return [];

    const facts = [];
    const now = this._getSimTime();

    const agentIds = socialGraph.getAllAgentIds ? socialGraph.getAllAgentIds() : [];

    // R39 perf fix: 原实现把 this.store.getRelationshipFacts() 放在双重循环内部,
    // 每对关系都全量取 + 深拷贝 + 线性 find,导致 O(关系数 × fact数) 乘法爆炸。
    // 50 agents ≈ 1225 对关系,每 tick 调 1225 次 getRelationshipFacts(),实测
    // 50a×50t 耗时 23-31s(审计性能测试超 30s 阈值)。
    // 修复:循环外取一次,建 agent pair → fact 索引,循环内 O(1) 查。
    const existingFacts = this.store.getRelationshipFacts();
    const pairIndex = new Map();
    for (const f of existingFacts) {
      // 用有序 pair 作 key,使 (A,B) 与 (B,A) 命中同一条
      const key = f.agentA < f.agentB ? `${f.agentA}|${f.agentB}` : `${f.agentB}|${f.agentA}`;
      pairIndex.set(key, f);
    }

    for (const agentId of agentIds) {
      const rels = socialGraph.getRelationships(agentId);
      for (const rel of rels) {
        const otherId = rel.getOther(agentId);
        if (agentId > otherId) continue;

        const fact = createRelationshipFact({
          agentA: agentId,
          agentB: otherId,
          relationType: rel.type || 'stranger',
          strength: rel.strength || 0,
          previousType: null,
          timestamp: now,
          source: FactSource.ENGINE,
          confidence: 1.0,
          scope: FactScope.PUBLIC,
          participants: [agentId, otherId],
        });

        const pairKey = agentId < otherId ? `${agentId}|${otherId}` : `${otherId}|${agentId}`;
        const existing = pairIndex.get(pairKey);

        if (existing) {
          const updated = this.store.updateFact(existing.id, {
            relationType: rel.type || 'stranger',
            strength: rel.strength || 0,
            timestamp: now,
          });
          facts.push(updated || fact);
        } else {
          this.store.addFact(fact);
          // 新增的 fact 加入索引,避免同 tick 后续重复添加
          pairIndex.set(pairKey, fact);
          facts.push(fact);
        }
      }
    }

    return facts;
  }

  /**
   * 从 PersonalMemory 提取记忆事实
   *
   * @param {Map<string, Object>} agents - agentId → Agent 实例
   * @returns {Object[]}
   */
  emitMemoryFacts(agents) {
    if (!agents || agents.size === 0) return [];

    const facts = [];
    const now = this._getSimTime();
    const existingByAgentAndContent = new Map();
    for (const fact of this.store.getMemoryFacts()) {
      existingByAgentAndContent.set(`${fact.agentId}\u0000${fact.content}`, fact);
    }

    for (const [agentId, agent] of agents) {
      if (!agent.memory || !agent.memory.memories) continue;

      const recentMemories = agent.memory.memories
        .filter(m => m.importance > 0.3)
        .slice(-10);

      for (const mem of recentMemories) {
        const fact = createMemoryFact({
          agentId,
          content: mem.content || '',
          importance: mem.importance || 0.5,
          emotionTag: mem.emotionTag || 'neutral',
          category: mem.category || 'general',
          timestamp: mem.timestamp || now,
          source: FactSource.ENGINE,
          confidence: 0.8,
          scope: FactScope.LOCAL,
          participants: [agentId],
        });

        const key = `${agentId}\u0000${mem.content}`;
        const existing = existingByAgentAndContent.get(key);

        if (existing) {
          const updated = this.store.updateFact(existing.id, {
            importance: mem.importance,
            timestamp: now,
          });
          const result = updated || fact;
          facts.push(result);
          existingByAgentAndContent.set(key, result);
        } else {
          const added = this.store.addFact(fact);
          facts.push(added);
          existingByAgentAndContent.set(key, added);
        }
      }
    }

    return facts;
  }

  /**
   * 传播事件知识给相关角色
   *
   * **BOUNDARY**: 当 CanonEventPipeline 启用时，知识传播由 CanonEventPipeline 负责。
   * 此方法仅在 CanonEventPipeline 未启用时作为 fallback 使用。
   * 新代码必须使用 CanonEventPipeline，不要调用此方法传播知识。
   *
   * @deprecated Use CanonEventPipeline for dispatched event → fact conversion.
   * This method is a legacy fallback. New code must not call it.
   *
   * @param {Object} eventFact - 事件事实
   * @param {Map<string, Object>} agents - agentId → Agent
   */
  propagateEventKnowledge(eventFact, agents) {
    if (!this.knowledgeStore) return;

    // P2-1 fix: match CanonEventPipeline._propagateKnowledge — auditOnly facts
    // (internal / action_selected) are engine bookkeeping and must not enter
    // agent knowledge. Without this guard the deprecated fallback would leak
    // internal state into the epistemic layer, diverging from the canon path.
    if (eventFact.auditOnly) return;

    if (eventFact.participants) {
      for (const agentId of eventFact.participants) {
        this.knowledgeStore.addKnowledge(agentId, eventFact.id, 'direct');
      }
    }

    if (eventFact.observers) {
      for (const agentId of eventFact.observers) {
        this.knowledgeStore.addKnowledge(agentId, eventFact.id, 'observed');
      }
    }

    if (eventFact.scope === 'public') {
      for (const [agentId, agent] of agents) {
        if (agent.position === eventFact.location) {
          if (!this.knowledgeStore.hasKnowledge(agentId, eventFact.id)) {
            this.knowledgeStore.addKnowledge(agentId, eventFact.id, 'overheard');
          }
        }
      }
    }
  }

  /**
   * 获取模拟时间（不使用 wall clock）
   * @private
   * @returns {Date}
   */
  _getSimTime() {
    return this._simTime || new Date('2024-01-01T00:00:00Z');
  }

  /**
   * 设置模拟时间
   * @param {Date} time
   */
  setSimTime(time) {
    this._simTime = time;
  }

  /**
   * 为缺失 id 的外部事件生成确定性 fallback id。
   * 不使用 wall clock；同一输入顺序和 simTime 会生成同一序列。
   * @private
   */
  _makeEventId(event) {
    const time = event.time || this._getSimTime();
    const stamp = time instanceof Date ? time.toISOString() : String(time || '');
    const type = String(event.type || 'event').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `evt_${type}_${stamp}_${this._eventFallbackId++}`;
  }

  /**
   * 序列化
   * R41 B2: persist _emittedStatic so static facts are not duplicated
   * after save/restore.
   * @returns {Object}
   */
  toJSON() {
    return { _emittedStatic: this._emittedStatic };
  }

  /**
   * 反序列化
   * @param {Object} data - toJSON() 的输出
   */
  fromJSON(data) {
    if (data && typeof data._emittedStatic === 'boolean') {
      this._emittedStatic = this._emittedStatic || data._emittedStatic;
    }
  }
}

module.exports = FactEmitter;
