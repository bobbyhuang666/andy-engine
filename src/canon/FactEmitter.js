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
        scope: FactScope.PUBLIC,
        participants: [agentId],
      });

      const existingFacts = this.store.getAgentStateFacts();
      const existing = existingFacts.find(f => f.agentId === agentId);
      if (existing) {
        this.store.updateFact(existing.id, {
          state: stateLabel,
          region: position,
          emotionSummary,
          timestamp: now,
        });
      } else {
        this.store.addFact(fact);
      }
      facts.push(fact);
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

    const agents = socialGraph._adjacency || new Map();
    for (const [agentId, rels] of agents) {
      for (const [otherId, rel] of rels) {
        if (agentId > otherId) continue;

        const fact = createRelationshipFact({
          agentA: agentId,
          agentB: otherId,
          relationType: rel.type || 'stranger',
          strength: rel.strength || 0,
          previousType: rel._previousType || null,
          timestamp: now,
          source: FactSource.ENGINE,
          confidence: 1.0,
          scope: FactScope.PUBLIC,
          participants: [agentId, otherId],
        });

        const existingFacts = this.store.getRelationshipFacts();
        const existing = existingFacts.find(
          f => (f.agentA === agentId && f.agentB === otherId) ||
               (f.agentA === otherId && f.agentB === agentId)
        );

        if (existing) {
          this.store.updateFact(existing.id, {
            relationType: rel.type || 'stranger',
            strength: rel.strength || 0,
            timestamp: now,
          });
        } else {
          this.store.addFact(fact);
        }
        facts.push(fact);
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

        const existingFacts = this.store.getMemoryFacts();
        const existing = existingFacts.find(
          f => f.agentId === agentId && f.content === mem.content
        );

        if (existing) {
          this.store.updateFact(existing.id, {
            importance: mem.importance,
            timestamp: now,
          });
        } else {
          this.store.addFact(fact);
        }
        facts.push(fact);
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
}

module.exports = FactEmitter;
