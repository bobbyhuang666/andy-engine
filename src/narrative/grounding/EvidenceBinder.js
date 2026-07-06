/**
 * EvidenceBinder — v3 Evidence Binding Module
 *
 * 职责：
 *   - 从 allowedFacts 构建索引（selfAgentStateLocations, agentKnownLocations,
 *     agentKnownEvents, knownEventDescriptions, knownRelationships, toldFacts,
 *     inferredFacts, forbiddenFacts）。
 *   - 将 v3 claim 数组绑定到候选 facts，产出 EvidenceBinding[]。
 *   - 纯函数式：只读 allowedFacts / forbiddenFacts，绝不写入 WorldFactStore / KnowledgeStore。
 *
 * 设计原则：
 *   - 不引入新 npm 依赖。
 *   - CommonJS require，JSDoc 注释，与 GroundingChecker.js 同风格。
 *   - _evidence.propagatedFrom 仅作来源元数据（"谁告诉了我"），
 *     绝不能当作 agent 在场的物理证据。索引构建时只读 participants / observers 字段。
 *
 * 对应 RFC GROUNDING_CHECKER_V3_SEMANTIC_PLAN §5.2 / W4 / §9 / Risk Register。
 */

const { FactType } = require('../../canon/FactSchema');

// ─── Support levels ──────────────────────────────────────────────────────────

const SUPPORT = {
  SUPPORTS: 'supports',
  PARAPHRASE_SUPPORTS: 'paraphrase_supports',
  CONTRADICTS: 'contradicts',
  UNSUPPORTED: 'unsupported',
};

/**
 * EvidenceBinder — 从 allowedFacts 构建索引并将 claims 绑定到证据。
 */
class EvidenceBinder {
  /**
   * @param {Object} [options]
   * @param {string} [options.selfId] - 当前 agent id
   * @param {Object} [options.agentNames] - agentId → displayName 映射
   * @param {Array<Object>} [options.forbiddenFacts] - 禁止提及的 facts
   */
  constructor(options = {}) {
    this.selfId = options.selfId || null;
    this.agentNames = options.agentNames || {};
    this.forbiddenFacts = options.forbiddenFacts || [];
  }

  /**
   * 主入口：绑定 claims 到证据。
   *
   * @param {Array<Object>} claims - v3 claim 数组
   * @param {Array<Object>} allowedFacts - 与 GroundingChecker.check 接收的同源
   * @param {Object} [bindOptions]
   * @param {string} [bindOptions.selfId] - 覆盖构造器的 selfId
   * @param {Object} [bindOptions.agentNames] - 覆盖构造器的 agentNames
   * @param {Array<Object>} [bindOptions.forbiddenFacts] - 覆盖构造器的 forbiddenFacts
   * @param {Object} [bindOptions.locationAliases] - canonical → alias[] 映射（Record 或 Map 或 Array<{canonical, aliases}>）
   * @returns {{ bindings: Array<EvidenceBinding>, index: Object }}
   */
  bind(claims, allowedFacts, bindOptions = {}) {
    const selfId = (bindOptions.selfId != null ? bindOptions.selfId : this.selfId) || '';
    const agentNames = bindOptions.agentNames || this.agentNames || {};
    const forbiddenFacts = bindOptions.forbiddenFacts || this.forbiddenFacts || [];
    const locationAliases = bindOptions.locationAliases || null;

    // 1. 构建索引
    const index = this._buildIndex(allowedFacts, selfId);

    // 1b. 构建 alias 索引（仅当提供了 locationAliases 时）
    let aliasIndex = null;
    if (locationAliases) {
      aliasIndex = EvidenceBinder.__buildAliasIndex(locationAliases);
      // 存入 index 供 _bindLocationClaim 使用
      index._aliasIndex = aliasIndex;
    }

    // 2. 逐个 claim 绑定
    const bindings = [];
    for (const claim of claims) {
      if (!claim || typeof claim !== 'object') continue;
      const claimBindings = this._bindClaim(claim, index, { selfId, agentNames, forbiddenFacts });
      bindings.push(...claimBindings);
    }

    return { bindings, index };
  }

  // ═══════════════════════════════════════════
  // Index building
  // ═══════════════════════════════════════════

  /**
   * 从 allowedFacts 构建证据索引。
   *
   * 关键规则：_evidence.propagatedFrom 仅作来源元数据（"谁告诉了我"），
   * 绝不能当作 agent 在场的物理证据。索引构建时只读 participants / observers 字段，
   * 不读 propagatedFrom。
   *
   * @private
   */
  _buildIndex(allowedFacts, selfId) {
    const selfAgentStateLocations = new Set(); // selfId → position/region
    const agentKnownLocations = new Map();     // agentId → Set<location>
    const agentKnownEvents = new Map();        // agentId → Set<descLower>
    const knownEventDescriptions = new Set();  // lowercased description fragments
    const knownRelationships = new Map();      // 'agentA:agentB' → relationType（双向）
    const toldFacts = [];                      // facts with _evidence.source === 'told'
    const inferredFacts = [];                  // facts with _evidence.source === 'inferred'

    for (const fact of allowedFacts) {
      if (!fact || fact._invalidated) continue;

      // Self AGENT_STATE for location/state support
      if (fact.type === FactType.AGENT_STATE && fact.agentId === selfId) {
        if (fact.position) selfAgentStateLocations.add(fact.position);
        if (fact.region) selfAgentStateLocations.add(fact.region);
      }

      // EVENT facts: build agent→location map
      // 关键规则：只读 participants / observers，不读 propagatedFrom
      if (fact.type === FactType.EVENT && fact.location) {
        if (fact.participants) {
          for (const pid of fact.participants) {
            if (!agentKnownLocations.has(pid)) agentKnownLocations.set(pid, new Set());
            agentKnownLocations.get(pid).add(fact.location);
          }
        }
        if (fact.observers) {
          for (const oid of fact.observers) {
            if (!agentKnownLocations.has(oid)) agentKnownLocations.set(oid, new Set());
            agentKnownLocations.get(oid).add(fact.location);
          }
        }
        // EVENT facts: index description
        if (fact.description) {
          knownEventDescriptions.add(fact.description.toLowerCase());
          // agentKnownEvents: participants/observers → description.toLowerCase()
          if (fact.participants) {
            for (const pid of fact.participants) {
              if (!agentKnownEvents.has(pid)) agentKnownEvents.set(pid, new Set());
              agentKnownEvents.get(pid).add(fact.description.toLowerCase());
            }
          }
          if (fact.observers) {
            for (const oid of fact.observers) {
              if (!agentKnownEvents.has(oid)) agentKnownEvents.set(oid, new Set());
              agentKnownEvents.get(oid).add(fact.description.toLowerCase());
            }
          }
        }
      }

      // OBSERVATION facts: observer→target→context (location stored in context)
      if (fact.type === FactType.OBSERVATION && fact.context && fact.observerId) {
        if (!agentKnownLocations.has(fact.observerId)) agentKnownLocations.set(fact.observerId, new Set());
        agentKnownLocations.get(fact.observerId).add(fact.context);
      }

      // RELATIONSHIP facts
      if (fact.type === FactType.RELATIONSHIP && fact.agentA && fact.agentB) {
        const key = `${fact.agentA}:${fact.agentB}`;
        knownRelationships.set(key, fact.relationType);
        // Also store reverse
        const reverseKey = `${fact.agentB}:${fact.agentA}`;
        knownRelationships.set(reverseKey, fact.relationType);
      }

      // Evidence tracking for source attribution
      if (fact._evidence) {
        if (fact._evidence.source === 'told') toldFacts.push(fact);
        if (fact._evidence.source === 'inferred') inferredFacts.push(fact);
      }
    }

    return {
      selfAgentStateLocations,
      agentKnownLocations,
      agentKnownEvents,
      knownEventDescriptions,
      knownRelationships,
      toldFacts,
      inferredFacts,
      forbiddenFacts: this.forbiddenFacts || [],
    };
  }

  // ═══════════════════════════════════════════
  // Claim binding
  // ═══════════════════════════════════════════

  /**
   * 对单个 claim 进行证据绑定。
   *
   * @private
   */
  _bindClaim(claim, index, ctx) {
    const bindings = [];
    const claimId = claim.id || 'unknown';
    const claimType = claim.type || 'unknown';

    switch (claimType) {
      case 'location':
        bindings.push(...this._bindLocationClaim(claim, index, ctx));
        break;
      case 'event':
        bindings.push(...this._bindEventClaim(claim, index, ctx));
        break;
      case 'relationship':
        bindings.push(...this._bindRelationshipClaim(claim, index, ctx));
        break;
      case 'state':
        bindings.push(...this._bindStateClaim(claim, index, ctx));
        break;
      case 'source_attribution':
        bindings.push(...this._bindSourceClaim(claim, index, ctx));
        break;
      case 'time':
        bindings.push(...this._bindTimeClaim(claim, index, ctx));
        break;
      default:
        // 未知 claim type → unsupported
        bindings.push({
          claimId,
          factId: null,
          support: SUPPORT.UNSUPPORTED,
          evidenceSource: null,
          confidence: claim.confidence || 0,
          reason: `unknown claim type: ${claimType}`,
        });
    }

    return bindings;
  }

  // ─── Subject helper: 兼容 string 和 {kind, id, raw} 两种表示 ───

  /**
   * 从 claim.subject 提取 agent id string。
   * subject 可能是 string（v2 风格）或 {kind:'agent', id:'bob', raw:'鲍勃'}（v3 风格）。
   * @private
   */
  _subjectId(claim) {
    if (!claim.subject) return null;
    if (typeof claim.subject === 'string') return claim.subject;
    if (typeof claim.subject === 'object' && claim.subject.id) return claim.subject.id;
    return null;
  }

  /**
   * 从 claim.subject 提取 raw string。
   * @private
   */
  _subjectRaw(claim) {
    if (!claim.subject) return null;
    if (typeof claim.subject === 'string') return claim.subject;
    if (typeof claim.subject === 'object' && claim.subject.raw) return claim.subject.raw;
    return null;
  }

  // ═══════════════════════════════════════════
  // Alias index building (M3-R3 paraphrase support)
  // ═══════════════════════════════════════════

  /**
   * 从 locationAliases 配置构建双向索引。
   *
   * 接受的格式：
   *   - Record<string, string[]>: { '图书馆': ['lib','Library','图'] }
   *   - Map<string, string[]>: 同上但以 Map 形式
   *   - Array<{canonical, aliases: string[]}>: [{ canonical: '图书馆', aliases: ['lib'] }]
   *
   * 返回 { aliasesByCanonical: Map<canonical, Set<alias>>, canonicalByAlias: Map<alias, canonical|null> }
   * 若某 alias 映射到多个 canonical → canonicalByAlias.set(alias, null)（歧义，跳过）。
   *
   * @static
   * @private
   */
  static __buildAliasIndex(locationAliases) {
    const aliasesByCanonical = new Map(); // canonical → Set<alias>
    const canonicalByAlias = new Map();   // alias → canonical | null (null = 歧义)

    // 统一成 canonical → alias[] 列表
    const entries = [];
    if (Array.isArray(locationAliases)) {
      for (const item of locationAliases) {
        if (item && item.canonical && Array.isArray(item.aliases)) {
          entries.push([item.canonical, item.aliases]);
        }
      }
    } else if (locationAliases instanceof Map) {
      for (const [canonical, aliases] of locationAliases) {
        if (Array.isArray(aliases)) entries.push([canonical, aliases]);
      }
    } else if (typeof locationAliases === 'object' && locationAliases !== null) {
      for (const [canonical, aliases] of Object.entries(locationAliases)) {
        if (Array.isArray(aliases)) entries.push([canonical, aliases]);
      }
    }

    // 第一遍：构建 canonical → alias 集合 + alias → canonical 映射
    for (const [canonical, aliases] of entries) {
      if (!aliasesByCanonical.has(canonical)) {
        aliasesByCanonical.set(canonical, new Set());
      }
      for (const alias of aliases) {
        if (alias === canonical) continue; // 忽略自映射
        aliasesByCanonical.get(canonical).add(alias);
        if (canonicalByAlias.has(alias)) {
          // 多对一歧义 → 标记为 null
          canonicalByAlias.set(alias, null);
        } else {
          canonicalByAlias.set(alias, canonical);
        }
      }
    }

    return { aliasesByCanonical, canonicalByAlias };
  }

  /**
   * 尝试 alias 匹配：当严格匹配失败时，检查 location 是否是某 canonical 的已知 alias，
   * 且该 canonical 在证据中存在（selfAgentStateLocations 或 agentKnownLocations）。
   *
   * @private
   */
  _tryParaphraseSupport(location, index, subjectId, selfId) {
    const aliasIndex = index._aliasIndex;
    if (!aliasIndex) return null;

    const canonical = aliasIndex.canonicalByAlias.get(location);
    if (!canonical) return null; // alias 未配置或歧义(null)

    // 检查 canonical 是否在证据中存在
    const hasEvidence =
      index.selfAgentStateLocations.has(canonical) ||
      (index.agentKnownLocations.get(subjectId) || new Set()).has(canonical);

    if (!hasEvidence) return null; // alias 不能单独造支持

    return {
      canonical,
      hasEvidence: true,
    };
  }

  // ═══════════════════════════════════════════
  // Location claim binding
  // ═══════════════════════════════════════════

  /**
   * @private
   */
  _bindLocationClaim(claim, index, ctx) {
    const bindings = [];
    const { selfId } = ctx;
    const selfAgentStateLocations = index.selfAgentStateLocations;
    const agentKnownLocations = index.agentKnownLocations;
    const subjectId = this._subjectId(claim);
    const isSelf = subjectId === selfId;
    const location = claim.object;
    const confidence = claim.confidence || 0.7;

    if (isSelf) {
      // Self location: 查 selfAgentStateLocations
      if (selfAgentStateLocations.has(location)) {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null, // self state 可能对应多个 fact
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'self_agent_state',
          confidence,
          reason: `self location matched in selfAgentStateLocations index for "${location}"`,
        });
      } else {
        // 严格未命中 → 尝试 alias 旁路
        const aliasResult = this._tryParaphraseSupport(location, index, subjectId, selfId);
        if (aliasResult) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: null,
            support: SUPPORT.PARAPHRASE_SUPPORTS,
            evidenceSource: 'self_agent_state',
            confidence: 0.6,
            reason: `alias "${location}" matches canonical "${aliasResult.canonical}" which has evidence in selfAgentStateLocations`,
            paraphraseAlias: location,
            paraphraseCanonical: aliasResult.canonical,
          });
        } else {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: null,
            support: SUPPORT.UNSUPPORTED,
            evidenceSource: null,
            confidence,
            reason: `self location "${location}" not found in selfAgentStateLocations index`,
          });
        }
      }
    } else {
      // Other-agent location: 查 agentKnownLocations
      const knownLocs = agentKnownLocations.get(subjectId);
      if (knownLocs && knownLocs.has(location)) {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null,
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'agent_known_locations',
          confidence,
          reason: `agent "${subjectId}" location "${location}" matched in agentKnownLocations index`,
        });
      } else {
        // 严格未命中 → 尝试 alias 旁路
        const aliasResult = this._tryParaphraseSupport(location, index, subjectId, selfId);
        if (aliasResult) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: null,
            support: SUPPORT.PARAPHRASE_SUPPORTS,
            evidenceSource: 'agent_known_locations',
            confidence: 0.6,
            reason: `alias "${location}" matches canonical "${aliasResult.canonical}" which has evidence in agentKnownLocations("${subjectId}")`,
            paraphraseAlias: location,
            paraphraseCanonical: aliasResult.canonical,
          });
        } else {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: null,
            support: SUPPORT.UNSUPPORTED,
            evidenceSource: null,
            confidence,
            reason: `agent "${subjectId}" location "${location}" not found in agentKnownLocations index`,
          });
        }
      }
    }

    return bindings;
  }

  // ═══════════════════════════════════════════
  // Event claim binding
  // ═══════════════════════════════════════════

  /**
   * @private
   */
  _bindEventClaim(claim, index, ctx) {
    const bindings = [];
    const knownEventDescriptions = index.knownEventDescriptions;
    const confidence = claim.confidence || 0.7;
    const object = claim.object || '';

    // predicate 'did' — 新事件创建，永远 unsupported（由上层 policy 拒绝）
    if (claim.predicate === 'did') {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `new event claim (predicate 'did') is always unsupported; rejected by policy`,
      });
      return bindings;
    }

    // predicate 'refers_to' — 引用过去事件
    if (claim.predicate === 'refers_to') {
      const eventRef = object.toLowerCase();
      let found = false;
      let matchedDesc = null;
      for (const desc of knownEventDescriptions) {
        if (desc.includes(eventRef) || eventRef.includes(desc)) {
          found = true;
          matchedDesc = desc;
          break;
        }
      }
      if (found) {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null,
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'known_event_descriptions',
          confidence,
          reason: `event reference "${object}" matched known event description "${matchedDesc}"`,
        });
      } else {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null,
          support: SUPPORT.UNSUPPORTED,
          evidenceSource: null,
          confidence,
          reason: `event reference "${object}" not found in knownEventDescriptions index`,
        });
      }
      return bindings;
    }

    // 默认 unsupported
    bindings.push({
      claimId: claim.id || 'unknown',
      factId: null,
      support: SUPPORT.UNSUPPORTED,
      evidenceSource: null,
      confidence,
      reason: `event claim without recognized predicate`,
    });
    return bindings;
  }

  // ═══════════════════════════════════════════
  // Relationship claim binding
  // ═══════════════════════════════════════════

  /**
   * @private
   */
  _bindRelationshipClaim(claim, index, ctx) {
    const bindings = [];
    const knownRelationships = index.knownRelationships;
    const confidence = claim.confidence || 0.7;
    const subjectId = this._subjectId(claim);
    const object = claim.object; // relationType 或描述

    // 获取第二个 agent — relationship claim 需要两个 agent
    // 尝试从 claim.subject 和 claim.object 推断
    const secondAgent = this._extractSecondAgent(claim, subjectId);

    if (!secondAgent) {
      // 无法确定关系双方 → unsupported
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `relationship claim cannot determine both agents`,
      });
      return bindings;
    }

    // 查 knownRelationships（双向）
    const key = `${subjectId}:${secondAgent}`;
    const reverseKey = `${secondAgent}:${subjectId}`;
    const exists = knownRelationships.has(key) || knownRelationships.has(reverseKey);

    if (exists) {
      // 关系已存在
      if (claim.polarity === 'negative') {
        // 否认现有关系 → contradicts
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null,
          support: SUPPORT.CONTRADICTS,
          evidenceSource: 'known_relationships',
          confidence,
          reason: `known relationship ${key} exists but claim denies it`,
        });
      } else {
        // 肯定已有关系 → 仍 unsupported（LLM 不能造关系）
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null,
          support: SUPPORT.UNSUPPORTED,
          evidenceSource: 'known_relationships',
          confidence,
          reason: `relationship ${key} already exists; LLM cannot create new relationship changes`,
        });
      }
    } else {
      // 关系不存在 → unsupported
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `relationship ${key} not found in knownRelationships index`,
      });
    }

    return bindings;
  }

  /**
   * 从 claim 中提取关系的第二个 agent id。
   * 如果 object 是 {kind:'agent', id:..., raw:...} 则提取 id。
   * @private
   */
  _extractSecondAgent(claim, subjectId) {
    if (!claim.object) return null;
    if (typeof claim.object === 'string') {
      // object 是字符串（relationType），无法从中提取 agent
      // 尝试从 claim.rawSubject 或其他字段找
      return null;
    }
    if (typeof claim.object === 'object' && claim.object.kind === 'agent' && claim.object.id) {
      return claim.object.id;
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // State claim binding
  // ═══════════════════════════════════════════

  /**
   * @private
   */
  _bindStateClaim(claim, index, ctx) {
    const bindings = [];
    const agentKnownLocations = index.agentKnownLocations;
    const { selfId } = ctx;
    const confidence = claim.confidence || 0.7;
    const subjectId = this._subjectId(claim);
    const isSelf = subjectId === selfId;

    if (isSelf) {
      // Self state claims are always supported (self-knowledge)
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.SUPPORTS,
        evidenceSource: 'self_knowledge',
        confidence,
        reason: `self state claim is always supported (self-knowledge)`,
      });
      return bindings;
    }

    // Other-agent state: 查 agentKnownLocations 是否有直接知识
    const knownLocs = agentKnownLocations.get(subjectId);
    if (knownLocs && knownLocs.size > 0) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.SUPPORTS,
        evidenceSource: 'agent_known_locations',
        confidence,
        reason: `direct knowledge exists for agent "${subjectId}" via agentKnownLocations`,
      });
    } else {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `no direct knowledge for agent "${subjectId}" state; potential agent_state_leak`,
      });
    }

    return bindings;
  }

  // ═══════════════════════════════════════════
  // Source attribution claim binding
  // ═══════════════════════════════════════════

  /**
   * @private
   */
  _bindSourceClaim(claim, index, ctx) {
    // source_attribution 不需要 fact binding — self-attested
    return [{
      claimId: claim.id || 'unknown',
      factId: null,
      support: SUPPORT.SUPPORTS,
      evidenceSource: 'self_attested',
      confidence: claim.confidence || 0.8,
      reason: 'source marker self-attested',
    }];
  }

  // ═══════════════════════════════════════════
  // Time claim binding
  // ═══════════════════════════════════════════

  /**
   * @private
   */
  _bindTimeClaim(claim, index, ctx) {
    // time 不需要 fact binding
    return [{
      claimId: claim.id || 'unknown',
      factId: null,
      support: SUPPORT.SUPPORTS,
      evidenceSource: 'no_fact_needed',
      confidence: claim.confidence || 0.9,
      reason: 'time marker no fact needed',
    }];
  }
}

module.exports = { EvidenceBinder, SUPPORT };
