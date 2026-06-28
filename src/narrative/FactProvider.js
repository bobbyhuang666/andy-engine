/**
 * FactProvider - 事实查询（按角色视角）
 *
 * 为 LLM 提供按角色视角过滤的事实。
 * 区分 allowedFacts（确定知道）、inferredFacts（可推断）、forbiddenFacts（不应该知道）。
 */

const { FactType, FactScope } = require('../canon/FactSchema');

class FactProvider {
  /**
   * @param {import('../canon/WorldFactStore')} worldFactStore
   * @param {Object} socialGraph - SocialGraph 实例
   * @param {Map<string, Object>} personalMemories - agentId → PersonalMemory
   * @param {import('../knowledge/KnowledgeStore')} [knowledgeStore] - 可选的知识存储
   */
  constructor(worldFactStore, socialGraph, personalMemories, knowledgeStore) {
    this.store = worldFactStore;
    this.socialGraph = socialGraph;
    this.memories = personalMemories || new Map();
    this.knowledgeStore = knowledgeStore || null;
  }

  /**
   * 判断事实是否仍然有效（未被失效）
   * @param {Object} fact
   * @returns {boolean}
   * @private
   */
  _isActiveFact(fact) {
    if (!fact) return false;
    if (fact._invalidated) return false;
    if (fact.type === FactType.INVALIDATED) return false;
    return true;
  }

  /**
   * Attach _evidence annotation to a fact.
   *
   * When this.knowledgeStore exists and the agent has an explicit evidence
   * entry in KnowledgeStore, the fact carries a read-only _evidence object
   * derived from KnowledgeStore.getEvidence().
   *
   * If no evidence entry exists (e.g. PUBLIC scope fact without explicit KS
   * entry), NO _evidence is attached. This prevents PUBLIC facts visible
   * without explicit knowledge from being treated as 'direct' evidence,
   * which would incorrectly justify AGENT_STATE expressions about other
   * agents. (v2.6-W4b fix)
   *
   * When no knowledgeStore, returns fact unchanged.
   *
   * @param {string} agentId
   * @param {Object} fact
   * @returns {Object} fact with _evidence (if KS entry exists) or unchanged
   * @private
   */
  _attachEvidence(agentId, fact) {
    if (!this.knowledgeStore) return fact;

    const evidence = this.knowledgeStore.getEvidence(agentId, fact.id);
    if (evidence) {
      return { ...fact, _evidence: { source: evidence.source, confidence: evidence.confidence, propagatedFrom: evidence.propagatedFrom } };
    }
    // No KS evidence entry → do NOT fabricate default evidence.
    // PUBLIC facts visible without explicit knowledge should not be treated
    // as 'direct' evidence for AGENT_STATE expression justification.
    return fact;
  }

  /**
   * 获取角色的 grounding package
   * @param {string} agentId
   * @param {Object} [options]
   * @param {Date} [options.time] - 当前时间
   * @param {string} [options.topic] - 当前话题（可选）
   * @param {number} [options.maxFacts] - 最大事实数（默认 50）
   * @returns {Object} groundingPackage
   */
  getGroundingPackage(agentId, options = {}) {
    const maxFacts = options.maxFacts || 50;
    const allowedFacts = this._getAllowedFacts(agentId, options).slice(0, maxFacts);
    const inferredFacts = this._getInferredFacts(agentId, options).slice(0, maxFacts);
    const forbiddenFacts = this._getForbiddenFacts(agentId, options).slice(0, maxFacts);

    const metadata = {
      agentId,
      currentTime: options.time || null,
      factCount: {
        allowed: allowedFacts.length,
        inferred: 0, // v2.5 B1 downgrade: always 0
        forbidden: forbiddenFacts.length,
      },
    };

    // Compute evidenceSummary when knowledgeStore exists
    if (this.knowledgeStore && allowedFacts.length > 0) {
      const counts = {};
      for (const fact of allowedFacts) {
        if (fact._evidence) {
          const src = fact._evidence.source;
          counts[src] = (counts[src] || 0) + 1;
        }
      }
      // Only include sources with count > 0
      const summary = {};
      for (const [source, count] of Object.entries(counts)) {
        if (count > 0) {
          summary[source] = count;
        }
      }
      if (Object.keys(summary).length > 0) {
        metadata.evidenceSummary = summary;
      }
    }

    const grounding = {
      allowedFacts,
      inferredFacts,
      forbiddenFacts,
      metadata,
    };

    if (options.currentRegion && this.store) {
      const meaning = this.store.getLocationMeaning(options.currentRegion);
      if (meaning) {
        const typeNames = {
          rest: '适合休息的地方',
          work: '适合工作的地方',
          social: '适合社交的地方',
          explore: '适合探索的地方',
          neutral: '普通地方',
        };
        grounding.locationMeaning = `你现在在${options.currentRegion}，这里${typeNames[meaning.meaningType] || '普通地方'}`;
      }
    }

    if (options.agent && options.agent.futureTendency) {
      const tendency = options.agent.futureTendency.getTendencyGradient(options.currentRegion || '');
      const tendencyDesc = [];
      if (Math.abs(tendency[0]) > 0.1) {
        tendencyDesc.push(tendency[0] > 0 ? '想要活跃起来' : '想要休息');
      }
      if (Math.abs(tendency[1]) > 0.1) {
        tendencyDesc.push(tendency[1] > 0 ? '想要社交' : '想要独处');
      }
      if (tendencyDesc.length > 0) {
        grounding.behaviorTendency = tendencyDesc.join('，');
      }
    }

    return grounding;
  }

  /**
   * 角色确定知道的事实：
   * 1. 公共事实（scope: 'public'）
   * 2. 参与者包含该角色的事实
   * 3. 观察者包含该角色的事实
   * 4. 该角色的记忆事实
   * 5. 别人告诉该角色的事实（perspective: 'told'）
   * @private
   */
  _getAllowedFacts(agentId, options) {
    const result = [];
    const seenIds = new Set();

    // 1. Use WorldFactStore.getFactsForAgent() — index-accelerated (R4 optimization).
    //    This replaces the previous O(N) full scan of allFacts.
    const agentFacts = this.store.getFactsForAgent(agentId, options);
    for (const fact of agentFacts) {
      if (!this._isActiveFact(fact)) continue;
      if (this.knowledgeStore) {
        result.push(this._attachEvidence(agentId, fact));
      } else {
        result.push(fact);
      }
      seenIds.add(fact.id);
    }

    // 2. Knowledge-store facts (explicit knowledge: direct/observed/told/inferred)
    //    These may include facts not in the _byAgent index yet (e.g., inferred)
    if (this.knowledgeStore) {
      const knownFacts = this.knowledgeStore.getKnownFacts(agentId, options);
      for (const fact of knownFacts) {
        if (!seenIds.has(fact.id) && this._isActiveFact(fact)) {
          result.push(this._attachEvidence(agentId, fact));
          seenIds.add(fact.id);
        }
      }
    }

    return result;
  }

  /**
   * v2.5 B1 Downgrade: _getInferredFacts returns an empty array.
   *
   * All inferred knowledge now flows through KnowledgeStore -> allowedFacts.
   * The inferredFacts field is retained in the output structure for API
   * compatibility but will always be empty in v2.5.
   *
   * Rationale: Dual-source inferred knowledge (KnowledgeStore AND inference
   * heuristics) caused inconsistencies. The single KnowledgeStore path is
   * the canonical source for all agent knowledge.
   *
   * @private
   */
  _getInferredFacts(agentId, options) {
    return [];
  }

  /**
   * 角色不应该知道的事实：
   * 1. 其他区域的私密事件
   * 2. 其他角色的内心状态
   * 3. 未被观察到的事件细节
   * @private
   */
  _getForbiddenFacts(agentId, options) {
    const result = [];

    // Forbidden facts are LOCAL-scope facts that the agent does NOT know about.
    // Instead of scanning all facts, only scan LOCAL EVENT and MEMORY types
    // which are the only categories that can be forbidden.
    const localEventFacts = this.store.getAllFacts([FactType.EVENT]);
    const memoryFacts = this.store.getAllFacts([FactType.MEMORY]);

    for (const fact of [...localEventFacts, ...memoryFacts]) {
      // Skip invalid facts
      if (!this._isActiveFact(fact)) continue;
      // Skip PUBLIC facts (always visible)
      if (fact.scope === FactScope.PUBLIC) continue;
      // Skip if agent is a participant
      if (fact.participants && fact.participants.includes(agentId)) continue;
      // Skip if agent is an observer
      if (fact.observers && fact.observers.includes(agentId)) continue;
      // Skip if knowledgeStore knows about it
      if (this.knowledgeStore && this.knowledgeStore.hasKnowledge(agentId, fact.id)) continue;

      // Other agents' private memories
      if (fact.type === FactType.MEMORY && fact.agentId !== agentId) {
        result.push(fact);
        continue;
      }

      // Local-scope events the agent didn't participate in
      if (fact.scope === FactScope.LOCAL &&
          fact.type === FactType.EVENT &&
          !fact.participants?.includes(agentId)) {
        result.push(fact);
      }
    }

    return result;
  }
}

module.exports = FactProvider;
