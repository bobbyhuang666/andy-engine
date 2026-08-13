/**
 * CanonEventPipeline - 事件→事实→知识 闭合管线
 *
 * 将引擎事件转化为 WorldCanon 事实，
 * 然后传播给相关角色的知识。
 *
 * 职责边界：
 *   - 事件→事实→知识（世界法则，本模块）
 *   - 事件→记忆/地点意义/行为倾向（角色后果，见 EventEffectPipeline.applyEventConsequences）
 */

const {
  createEventFact,
  createLocationMeaningFact,
  FactSource,
  FactScope,
  FactType,
  FACT_SCOPES,
} = require('./FactSchema');
const { normalizeEventTimeMs, FALLBACK_EPOCH } = require('./timeHelpers');

class CanonEventPipeline {
  /**
   * @param {import('./WorldFactStore')} factStore
   * @param {import('../knowledge/KnowledgeStore')} knowledgeStore
   * @param {import('./FactEmitter')} factEmitter
   */
  constructor(factStore, knowledgeStore, factEmitter) {
    this.factStore = factStore;
    this.knowledgeStore = knowledgeStore;
    this.factEmitter = factEmitter;
    this._eventCounter = 0;
  }

  /**
   * 处理一个事件，转化为事实并传播知识
   * @param {Object} event - 引擎事件
   * @param {Map<string, Object>} agents - agentId → Agent
   * @returns {{ fact: Object|null, knowledgeUpdates: Object[] }}
   */
  processEvent(event, agents) {
    const result = {
      fact: null,
      knowledgeUpdates: [],
    };

    if (!event || !event.type) return result;

    // 1. 将事件转化为 EventFact
    const fact = this._createEventFact(event);
    try {
      this.factStore.addFact(fact);
    } catch (e) {
      if (e.message.includes('already exists')) return result;
      throw e;
    }
    result.fact = fact;

    // 2. 传播知识
    if (this.knowledgeStore) {
      const knowledgeUpdates = this._propagateKnowledge(fact, agents);
      result.knowledgeUpdates = knowledgeUpdates;

      // 3. Told propagation (social events only)
      const gossipUpdates = this._propagateGossip(event, agents, fact);
      result.knowledgeUpdates.push(...gossipUpdates);

      // 4. Inferred propagation (safety net for same-location agents)
      const inferredUpdates = this._propagateInferred(fact, agents);
      result.knowledgeUpdates.push(...inferredUpdates);
    }

    return result;
  }

  /**
   * 批量处理事件
   * @param {Object[]} events
   * @param {Map<string, Object>} agents
   * @returns {Object[]}
   */
  processEvents(events, agents) {
    if (!events || !Array.isArray(events)) return [];
    return events.map(event => this.processEvent(event, agents));
  }

  /**
   * 将事件转化为 EventFact
   * @private
   */
  _createEventFact(event) {
    // RFC W2 / Patch C: single normalization via normalizeEventTimeMs.
    const eventTimeMs = normalizeEventTimeMs(event.time);
    const eventTime = new Date(eventTimeMs);
    const eventId = event.id || `evt_${event.type}_${eventTimeMs}_${this._eventCounter++}`;
    const scope = FACT_SCOPES.includes(event.scope) ? event.scope : FactScope.PUBLIC;
    const fact = createEventFact({
      eventId,
      description: event.content || `${event.type}事件`,
      location: event.location || '',
      timestamp: eventTime,
      source: FactSource.ENGINE,
      confidence: 1.0,
      scope,
      participants: event.participants || [],
      observers: event.observers || [],
    });

    fact.eventType = event.type;
    fact.originalScope = event.scope || null;
    if (event.scope === 'internal' || event.type === 'action_selected') {
      fact.auditOnly = true;
    }

    return fact;
  }

  /**
   * 传播知识
   * @private
   */
  _propagateKnowledge(fact, agents) {
    const updates = [];
    const seen = new Set();

    // R41 P1 fix: auditOnly facts are internal bookkeeping and must not
    // enter agent knowledge. Without this guard, action_selected facts with
    // scope 'local' still propagate to participants/observers/overheard,
    // leaking internal engine state into the epistemic layer.
    if (fact.auditOnly) return updates;

    // RFC W2 / Patch C: build full Evidence with learnedAt + eventId for
    // direct/observed/overheard, matching told/inferred which already do.
    // Previously these three paths passed only a string source, causing
    // KnowledgeStore to normalize learnedAt to 0 and eventId to null.
    const eventTimeMs = normalizeEventTimeMs(fact.timestamp);
    const eventId = fact.eventId || null;

    if (fact.participants) {
      for (const agentId of fact.participants) {
        if (seen.has(agentId)) continue;
        seen.add(agentId);
        this.knowledgeStore.addKnowledge(agentId, fact.id, {
          source: 'direct',
          confidence: 1.0,
          learnedAt: eventTimeMs,
          propagatedFrom: null,
          eventId,
        });
        updates.push({ agentId, source: 'direct' });
      }
    }

    if (fact.observers) {
      for (const agentId of fact.observers) {
        if (seen.has(agentId)) continue;
        seen.add(agentId);
        this.knowledgeStore.addKnowledge(agentId, fact.id, {
          source: 'observed',
          confidence: 0.9,
          learnedAt: eventTimeMs,
          propagatedFrom: null,
          eventId,
        });
        updates.push({ agentId, source: 'observed' });
      }
    }

    if (fact.scope === FactScope.PUBLIC && fact.location) {
      for (const [agentId, agent] of agents) {
        if (seen.has(agentId)) continue;
        if (agent.position === fact.location &&
          !this.knowledgeStore.hasKnowledge(agentId, fact.id)) {
          seen.add(agentId);
          this.knowledgeStore.addKnowledge(agentId, fact.id, {
            source: 'overheard',
            confidence: 0.7,
            learnedAt: eventTimeMs,
            propagatedFrom: null,
            eventId,
          });
          updates.push({ agentId, source: 'overheard' });
        }
      }
    }

    return updates;
  }

  /**
   * Told 传播：社交事件中参与者互相告知已知事实
   * @private
   * @param {Object} event - 引擎事件
   * @param {Map<string, Object>} agents - agentId → Agent
   * @param {Object} fact - 事件对应的事实
   * @returns {Object[]} knowledgeUpdates
   */
  _propagateGossip(event, agents, fact) {
    // 仅社交事件触发
    if (event.type !== 'social') return [];

    const participants = event.participants || [];
    if (participants.length < 2) return [];

    const updates = [];
    const processedPairs = new Set();

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        // A → B direction
        const pair1 = `${participants[i]}→${participants[j]}`;
        if (!processedPairs.has(pair1)) {
          processedPairs.add(pair1);
          const result = this._tryToldPropagation(
            participants[i], participants[j], event
          );
          if (result) updates.push(result);
        }

        // B → A direction
        const pair2 = `${participants[j]}→${participants[i]}`;
        if (!processedPairs.has(pair2)) {
          processedPairs.add(pair2);
          const result = this._tryToldPropagation(
            participants[j], participants[i], event
          );
          if (result) updates.push(result);
        }
      }
    }

    return updates;
  }

  /**
   * 尝试让 teller 告知 listener 一条事实
   * @private
   * @param {string} tellerId - 告知者
   * @param {string} listenerId - 被告知者
   * @param {Object} event - 触发事件
   * @returns {Object|null} knowledgeUpdate 或 null
   */
  _tryToldPropagation(tellerId, listenerId, event) {
    const tellerFacts = this.knowledgeStore.getKnownFactIds(tellerId);
    // RFC W2 / Patch C: use normalizeEventTimeMs so ISO strings are parsed
    // correctly. Previously `Number.isFinite(eventTime)` on a raw ISO string
    // was always false, discarding the real timestamp and falling back to
    // FALLBACK_EPOCH for every told propagation.
    const safeEventTime = normalizeEventTimeMs(event.time);

    for (const factId of tellerFacts) {
      // 1. Listener 不知
      if (this.knowledgeStore.hasKnowledge(listenerId, factId)) continue;

      // 2. 事实有效
      const fact = this.factStore.getFactById(factId);
      if (!fact || fact._invalidated) continue;

      // 3. 仅 PUBLIC scope
      if (fact.scope !== FactScope.PUBLIC) continue;

      // 4. 不传播 AGENT_STATE（无论是自己还是他人的）
      // R21 P1-6: AGENT_STATE 是私有知识，即使自己的也不应通过
      // gossip 的 "told" 路径传播给听者。旧代码只跳过他人的，
      // 允许自己的 AGENT_STATE 泄漏给听者，违反认知边界设计。
      if (fact.type === FactType.AGENT_STATE) continue;

      // 5. 告知者必须 hasKnowledge（已经通过 tellerFacts 确保）

      // 选择第一个符合条件的 fact（最多传播 1 条）
      this.knowledgeStore.addKnowledge(listenerId, factId, {
        source: 'told',
        confidence: 0.6,
        learnedAt: safeEventTime,
        propagatedFrom: tellerId,
        eventId: event.id || null,
      });

      return { agentId: listenerId, source: 'told', propagatedFrom: tellerId, factId };
    }

    return null;
  }

  /**
   * Inferred 传播：同一地点的角色通过环境推断得知
   *
   * 作为 safety net，确保在 PUBLIC 事件发生地点的每个角色
   * 无论是否参与/观察/偷听，都能获得至少 0.5 置信度的知识。
   *
   * 约束：
   *   - 仅 PUBLIC scope + 有 location 的事件
   *   - 仅写入 KnowledgeStore，不写入 WorldFactStore（不创建新事实）
   *   - 独立检查 hasKnowledge，不使用 _propagateKnowledge 的 seen 集合
   *
   * @private
   * @param {Object} fact - EventFact
   * @param {Map<string, Object>} agents - agentId → Agent
   * @returns {Object[]} knowledgeUpdates
   */
  _propagateInferred(fact, agents) {
    // auditOnly facts (action_selected / internal) must not produce inferred
    // knowledge. _propagateKnowledge already guards auditOnly, but without
    // this guard a `type: action_selected, scope: public, auditOnly: true`
    // fact would still reach same-location agents via the inferred safety net,
    // leaking internal engine bookkeeping into the epistemic layer.
    if (fact.auditOnly) return [];
    if (fact.scope !== FactScope.PUBLIC || !fact.location) return [];
    const updates = [];

    for (const [agentId, agent] of agents) {
      // 已有知识则不重复添加
      if (this.knowledgeStore.hasKnowledge(agentId, fact.id)) continue;

      // 必须在同一地点
      if (agent.position === fact.location) {
        const eventTime = fact.timestamp instanceof Date ? fact.timestamp.getTime() : (typeof fact.timestamp === 'number' ? fact.timestamp : 0);
        this.knowledgeStore.addKnowledge(agentId, fact.id, {
          source: 'inferred',
          confidence: 0.5,
          learnedAt: eventTime,
          propagatedFrom: null,
          eventId: fact.eventId || null,
        });
        updates.push({ agentId, source: 'inferred' });
      }
    }
    return updates;
  }

  /**
   * 序列化
   * R41 M2 fix: persist _eventCounter so event IDs don't collide after
   * save/restore. Without this, the counter resets to 0 and may produce
   * duplicate fact IDs that cause "EventFact already exists" errors.
   * @returns {Object}
   */
  toJSON() {
    return { _eventCounter: this._eventCounter };
  }

  /**
   * 反序列化
   * @param {Object} data - toJSON() 的输出
   */
  fromJSON(data) {
    // R41 B4 fix: clamp _eventCounter to prevent unbounded growth across
    // repeated save/restore cycles (each restore takes Math.max).
    const MAX_EVENT_COUNTER = Number.MAX_SAFE_INTEGER - 1000;
    if (data && typeof data._eventCounter === 'number' && Number.isFinite(data._eventCounter)) {
      this._eventCounter = Math.min(Math.max(this._eventCounter, data._eventCounter), MAX_EVENT_COUNTER);
    }
  }
}

module.exports = CanonEventPipeline;
