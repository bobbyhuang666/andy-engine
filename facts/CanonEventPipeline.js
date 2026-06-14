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

class CanonEventPipeline {
  /**
   * @param {import('./WorldFactStore')} factStore
   * @param {import('./KnowledgeStore')} knowledgeStore
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
    const FALLBACK_EPOCH = new Date('2024-01-01T00:00:00Z');
    const eventTime = event.time instanceof Date ? event.time : (event.time ? new Date(event.time) : FALLBACK_EPOCH);
    const eventId = event.id || `evt_${event.type}_${eventTime.getTime()}_${this._eventCounter++}`;
    const scope = FACT_SCOPES.includes(event.scope) ? event.scope : FactScope.PUBLIC;
    return createEventFact({
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
  }

  /**
   * 传播知识
   * @private
   */
  _propagateKnowledge(fact, agents) {
    const updates = [];
    const seen = new Set();

    if (fact.participants) {
      for (const agentId of fact.participants) {
        if (seen.has(agentId)) continue;
        seen.add(agentId);
        this.knowledgeStore.addKnowledge(agentId, fact.id, 'direct');
        updates.push({ agentId, source: 'direct' });
      }
    }

    if (fact.observers) {
      for (const agentId of fact.observers) {
        if (seen.has(agentId)) continue;
        seen.add(agentId);
        this.knowledgeStore.addKnowledge(agentId, fact.id, 'observed');
        updates.push({ agentId, source: 'observed' });
      }
    }

    if (fact.scope === FactScope.PUBLIC && fact.location) {
      for (const [agentId, agent] of agents) {
        if (seen.has(agentId)) continue;
        if (agent.position === fact.location &&
            !this.knowledgeStore.hasKnowledge(agentId, fact.id)) {
          seen.add(agentId);
          this.knowledgeStore.addKnowledge(agentId, fact.id, 'overheard');
          updates.push({ agentId, source: 'overheard' });
        }
      }
    }

    return updates;
  }
}

module.exports = CanonEventPipeline;
