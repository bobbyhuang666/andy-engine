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

    const grounding = {
      allowedFacts,
      inferredFacts,
      forbiddenFacts,
      metadata: {
        agentId,
        currentTime: options.time || null,
        factCount: {
          allowed: allowedFacts.length,
          inferred: inferredFacts.length,
          forbidden: forbiddenFacts.length,
        },
      },
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

    // 1. Public facts are visible to all agents, EXCEPT:
    //    - AGENT_STATE for other agents (private knowledge: an agent's location is not public)
    //    - Only self's own AGENT_STATE enters allowedFacts via this path
    const allFacts = this.store.getAllFacts();
    for (const fact of allFacts) {
      if (!seenIds.has(fact.id) && this._isActiveFact(fact) && fact.scope === FactScope.PUBLIC) {
        // AGENT_STATE is private: only self's own state is visible
        if (fact.type === FactType.AGENT_STATE && fact.agentId !== agentId) {
          continue;
        }
        result.push(fact);
        seenIds.add(fact.id);
      }
    }

    // 2. Knowledge-store facts (explicit knowledge: direct/observed/told/inferred)
    if (this.knowledgeStore) {
      const knownFacts = this.knowledgeStore.getKnownFacts(agentId, options);
      for (const fact of knownFacts) {
        if (!seenIds.has(fact.id) && this._isActiveFact(fact)) {
          result.push(fact);
          seenIds.add(fact.id);
        }
      }
    } else {
      // 3. Fallback: scope/role-based filtering when no knowledgeStore
      for (const fact of allFacts) {
        if (seenIds.has(fact.id) || !this._isActiveFact(fact)) continue;

        if (fact.participants && fact.participants.includes(agentId)) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.observers && fact.observers.includes(agentId)) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.type === FactType.MEMORY && fact.agentId === agentId) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.type === FactType.OBSERVATION && fact.observerId === agentId) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.type === FactType.RELATIONSHIP &&
            (fact.agentA === agentId || fact.agentB === agentId)) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
      }
    }

    return result;
  }

  /**
   * 角色可以推断的事实：
   * 1. 同一区域的公共事件（可能观察到）
   * 2. 关系变化（通过社交互动推断）
   * @private
   */
  _getInferredFacts(agentId, options) {
    const result = [];
    const agentStateFacts = this.store.getAgentStateFacts();
    const agentState = agentStateFacts.find(f => f.agentId === agentId);
    const currentRegion = agentState?.region;

    if (!currentRegion) return result;

    const knownIds = this.knowledgeStore
      ? this.knowledgeStore.getKnownFactIds(agentId)
      : new Set();

    const eventFacts = this.store.getEventFacts();
    for (const fact of eventFacts) {
      if (!this._isActiveFact(fact)) continue;
      if (knownIds.has(fact.id)) continue;
      if (fact.scope === FactScope.PUBLIC && fact.location === currentRegion) {
        result.push({
          ...fact,
          confidence: 0.6,
          _inferred: true,
        });
      }
    }

    return result;
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
    const allFacts = this.store.getAllFacts();

    for (const fact of allFacts) {
      // 跳过已失效的事实
      if (!this._isActiveFact(fact)) continue;
      // 跳过已经知道的
      if (fact.scope === FactScope.PUBLIC) continue;
      if (fact.participants && fact.participants.includes(agentId)) continue;
      if (fact.observers && fact.observers.includes(agentId)) continue;

      // 其他角色的私密记忆
      if (fact.type === FactType.MEMORY && fact.agentId !== agentId) {
        result.push(fact);
        continue;
      }

      // 其他区域的本地事件
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
