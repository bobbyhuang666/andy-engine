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
 * Evidence binding for the structured grounding pipeline.
 */

const { FactType } = require('../../canon/FactSchema');
const { canonicalEmotion } = require('../EmotionVocabulary');
const { observationAssertion } = require('../ObservationAssertion');

function normalizeComparableText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

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
    // Keep the fact id alongside every index key. EvidenceTrace is a
    // host-facing read projection, so a supported fact-bound claim must be
    // able to identify the fact that supplied its support.
    const selfAgentStateLocations = new Map(); // location → factId
    const agentKnownLocations = new Map();     // agentId → Map<location, factId>
    const agentKnownEvents = new Map();        // agentId → Map<descLower, factId>
    const knownEventDescriptions = new Map();  // descLower → factId
    const knownRelationships = new Map();      // 'agentA:agentB' → { relationType, factId }
    const knownObservations = new Map();       // observerId + assertion → factId
    const knownMemories = new Map();           // agentId → Map<contentLower, factId>
    const knownIntentions = new Map();         // agentId → { intent, region, factId }
    const selfAgentStates = [];                // { state, factId }
    const toldFacts = [];                      // facts with _evidence.source === 'told'
    const inferredFacts = [];                  // facts with _evidence.source === 'inferred'

    for (const fact of allowedFacts) {
      if (!fact || fact._invalidated) continue;

      // Self AGENT_STATE for location/state support
      if (fact.type === FactType.AGENT_STATE && fact.agentId === selfId) {
        if (fact.position) selfAgentStateLocations.set(fact.position, fact.id || null);
        if (fact.region) selfAgentStateLocations.set(fact.region, fact.id || null);
        selfAgentStates.push({
          state: fact.state || '',
          emotionSummary: fact.emotionSummary || '',
          factId: fact.id || null,
        });
      }

      // EVENT facts: build agent→location map
      // 关键规则：只读 participants / observers，不读 propagatedFrom
      if (fact.type === FactType.EVENT) {
        if (fact.location) {
          if (fact.participants) {
            for (const pid of fact.participants) {
              if (!agentKnownLocations.has(pid)) agentKnownLocations.set(pid, new Map());
              agentKnownLocations.get(pid).set(fact.location, fact.id || null);
            }
          }
          if (fact.observers) {
            for (const oid of fact.observers) {
              if (!agentKnownLocations.has(oid)) agentKnownLocations.set(oid, new Map());
              agentKnownLocations.get(oid).set(fact.location, fact.id || null);
            }
          }
        }
        // EVENT facts: index description
        if (fact.description) {
          knownEventDescriptions.set(normalizeComparableText(fact.description), fact.id || null);
          // agentKnownEvents: participants/observers → description.toLowerCase()
          if (fact.participants) {
            for (const pid of fact.participants) {
              if (!agentKnownEvents.has(pid)) agentKnownEvents.set(pid, new Map());
              agentKnownEvents.get(pid).set(normalizeComparableText(fact.description), fact.id || null);
            }
          }
          if (fact.observers) {
            for (const oid of fact.observers) {
              if (!agentKnownEvents.has(oid)) agentKnownEvents.set(oid, new Map());
              agentKnownEvents.get(oid).set(normalizeComparableText(fact.description), fact.id || null);
            }
          }
        }
      }

      // OBSERVATION facts: observer→target→context (location stored in context)
      if (fact.type === FactType.OBSERVATION && fact.context && fact.observerId) {
        if (!agentKnownLocations.has(fact.observerId)) agentKnownLocations.set(fact.observerId, new Map());
        agentKnownLocations.get(fact.observerId).set(fact.context, fact.id || null);
      }
      if (fact.type === FactType.OBSERVATION && fact.observerId && fact.targetId && fact.action) {
        const key = `${fact.observerId}\u0000${observationAssertion(fact.targetId, fact.action, fact.context)}`;
        knownObservations.set(key, fact.id || null);
      }

      // RELATIONSHIP facts
      if (fact.type === FactType.RELATIONSHIP && fact.agentA && fact.agentB) {
        const key = `${fact.agentA}:${fact.agentB}`;
        knownRelationships.set(key, { relationType: fact.relationType, factId: fact.id || null });
        // Also store reverse
        const reverseKey = `${fact.agentB}:${fact.agentA}`;
        knownRelationships.set(reverseKey, { relationType: fact.relationType, factId: fact.id || null });
      }

      // R8.6: MEMORY facts — index by agentId → content (lowercased) → factId.
      // Memory facts are LOCAL scope owned by the agent (participants=[agentId]),
      // so only the owning agent sees them. Binding matches self-memory content.
      if (fact.type === FactType.MEMORY && fact.agentId && fact.content) {
        if (!knownMemories.has(fact.agentId)) knownMemories.set(fact.agentId, new Map());
        knownMemories.get(fact.agentId).set(normalizeComparableText(fact.content), fact.id || null);
      }

      // R8.7: INTENTION facts — index by agentId → { intent, region, factId }.
      // Intention facts are LOCAL scope owned by the agent. Binding matches
      // self-intent (the agent's own next planned activity).
      if (fact.type === FactType.INTENTION && fact.agentId && fact.intent) {
        knownIntentions.set(fact.agentId, { intent: fact.intent, region: fact.region || '', factId: fact.id || null });
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
      knownObservations,
      knownMemories,
      knownIntentions,
      selfAgentStates,
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
      case 'memory':
        bindings.push(...this._bindMemoryClaim(claim, index, ctx));
        break;
      case 'intention':
        bindings.push(...this._bindIntentionClaim(claim, index, ctx));
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

  /**
   * Extract a comparable string from v2 string objects or v3 {kind,id,raw} objects.
   *
   * @private
   */
  _objectValue(claim, preferred = 'id') {
    const object = claim?.object;
    if (object == null) return '';
    if (typeof object === 'string') return object;
    if (typeof object === 'object') {
      return object[preferred] || object.id || object.raw || '';
    }
    return String(object);
  }

  /**
   * Extract all comparable string candidates from claim.object.
   *
   * @private
   */
  _objectValues(claim, preferred = 'id') {
    const values = [];
    const add = (value) => {
      if (value == null) return;
      const str = String(value);
      if (str && !values.includes(str)) values.push(str);
    };
    const object = claim?.object;
    if (object && typeof object === 'object' && !Array.isArray(object)) {
      add(object[preferred]);
      add(object.id);
      add(object.raw);
    } else {
      add(this._objectValue(claim, preferred));
    }
    return values;
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
      (index.agentKnownLocations.get(subjectId) || new Map()).has(canonical);

    if (!hasEvidence) return null; // alias 不能单独造支持

    return {
      canonical,
      factId: index.selfAgentStateLocations.get(canonical)
        ?? index.agentKnownLocations.get(subjectId)?.get(canonical)
        ?? null,
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
    const locationCandidates = this._objectValues(claim, 'id');
    const location = locationCandidates[0] || '';
    const confidence = claim.confidence || 0.7;

    if (isSelf) {
      // Self location: 查 selfAgentStateLocations
      const matchedLocation = locationCandidates.find(loc => selfAgentStateLocations.has(loc));
      if (matchedLocation) {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: selfAgentStateLocations.get(matchedLocation) || null,
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'self_agent_state',
          confidence,
          reason: `self location matched in selfAgentStateLocations index for "${matchedLocation}"`,
        });
      } else {
        // 严格未命中 → 尝试 alias 旁路
        const aliasResult = this._tryParaphraseSupport(location, index, subjectId, selfId);
        if (aliasResult) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: aliasResult.factId,
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
      const matchedLocation = knownLocs
        ? locationCandidates.find(loc => knownLocs.has(loc))
        : null;
      if (matchedLocation) {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: knownLocs.get(matchedLocation) || null,
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'agent_known_locations',
          confidence,
          reason: `agent "${subjectId}" location "${matchedLocation}" matched in agentKnownLocations index`,
        });
      } else {
        // 严格未命中 → 尝试 alias 旁路
        const aliasResult = this._tryParaphraseSupport(location, index, subjectId, selfId);
        if (aliasResult) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: aliasResult.factId,
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
    const objectCandidates = this._objectValues(claim, 'raw');
    const object = objectCandidates[0] || '';

    // predicate 'observed' — a direct observation. The object is a stable
    // assertion tuple built only from an allowed OBSERVATION fact.
    if (claim.predicate === 'observed') {
      const subjectId = this._subjectId(claim);
      const key = `${subjectId}\u0000${object}`;
      const factId = index.knownObservations.get(key);
      if (factId !== undefined) {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId,
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'direct_observation',
          confidence,
          reason: 'observation assertion exactly matched an allowed OBSERVATION fact',
        });
      } else {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null,
          support: SUPPORT.UNSUPPORTED,
          evidenceSource: null,
          confidence,
          reason: 'observation assertion is not present in the allowed OBSERVATION facts',
        });
      }
      return bindings;
    }

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
      const eventRefs = objectCandidates.map(normalizeComparableText);
      const matched = eventRefs.find(eventRef => knownEventDescriptions.has(eventRef));
      const found = matched !== undefined;
      const matchedDesc = found ? matched : null;
      const matchedFactId = found ? knownEventDescriptions.get(matched) : null;
      if (found) {
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: matchedFactId,
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
    const relationship = knownRelationships.get(key) || knownRelationships.get(reverseKey);
    const exists = Boolean(relationship);

    if (exists) {
      // 关系已存在
      if (claim.polarity === 'negative') {
        // 否认现有关系 → contradicts
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: relationship.factId,
          support: SUPPORT.CONTRADICTS,
          evidenceSource: 'known_relationships',
          confidence,
          reason: `known relationship ${key} exists but claim denies it`,
        });
      } else if (claim.predicate === 'is_relation') {
        const requestedRelation = normalizeComparableText(claim.relationType);
        const knownRelation = normalizeComparableText(relationship.relationType);
        if (!requestedRelation || requestedRelation !== knownRelation) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: relationship.factId,
            support: SUPPORT.UNSUPPORTED,
            evidenceSource: 'known_relationships',
            confidence,
            reason: `relationship type "${claim.relationType || ''}" does not exactly match known type "${relationship.relationType || ''}"`,
          });
          return bindings;
        }
        // R8.5: predicate 'is_relation' references an EXISTING relationship
        // (mirrors 'observed'/'refers_to' referencing existing facts). It does
        // not create or change the relationship, so it is supported by the
        // existing RELATIONSHIP fact with a real factId.
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: relationship.factId,
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'known_relationships',
          confidence,
          reason: `relationship ${key} referenced via is_relation exists in known relationships`,
        });
      } else {
        // 肯定已有关系（默认/创建谓词）→ 仍 unsupported（LLM 不能造关系变化）
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: relationship.factId,
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
    const selfAgentStates = index.selfAgentStates || [];
    const { selfId } = ctx;
    const confidence = claim.confidence || 0.7;
    const subjectId = this._subjectId(claim);
    const isSelf = subjectId === selfId;

    if (isSelf) {
      if (claim.stateType === 'activity' || claim.predicate === 'activity') {
        const activity = String(claim.object || '').toLowerCase();
        const stateMatch = selfAgentStates.find(entry => {
          const state = String(entry.state || '').toLowerCase();
          return activity && state && (state.includes(activity) || activity.includes(state));
        });
        if (!stateMatch) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: null,
            support: SUPPORT.UNSUPPORTED,
            evidenceSource: null,
            confidence,
            reason: `self activity "${claim.object}" not found in current AGENT_STATE`,
          });
          return bindings;
        }
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: stateMatch.factId,
          support: SUPPORT.SUPPORTS,
          evidenceSource: 'self_agent_state',
          confidence,
          reason: `self activity "${claim.object}" matched current AGENT_STATE`,
        });
        return bindings;
      }
      if (claim.stateType === 'emotion' || claim.predicate === 'feels') {
        const claimedEmotion = canonicalEmotion(claim.object);
        const emotionMatch = selfAgentStates.find(entry => {
          const actualEmotion = canonicalEmotion(entry.emotionSummary);
          return claimedEmotion && actualEmotion && claimedEmotion === actualEmotion;
        });
        if (emotionMatch) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: emotionMatch.factId,
            support: SUPPORT.SUPPORTS,
            evidenceSource: 'self_agent_state',
            confidence,
            reason: `self emotion "${claim.object}" matched current AGENT_STATE`,
          });
          return bindings;
        }
        // Legacy serialized states did not include emotionSummary. The checker
        // retains its historical self-knowledge behaviour for those states;
        // never manufacture a fact id in that case.
        const hasEmotionSummary = selfAgentStates.some(entry => entry.emotionSummary);
        if (!hasEmotionSummary) {
          bindings.push({
            claimId: claim.id || 'unknown',
            factId: null,
            support: SUPPORT.SUPPORTS,
            evidenceSource: 'self_knowledge',
            confidence,
            reason: 'legacy self state has no emotion summary',
          });
          return bindings;
        }
        bindings.push({
          claimId: claim.id || 'unknown',
          factId: null,
          support: SUPPORT.UNSUPPORTED,
          evidenceSource: null,
          confidence,
          reason: `self emotion "${claim.object}" not found in current AGENT_STATE`,
        });
        return bindings;
      }
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
        factId: knownLocs.values().next().value || null,
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
  // R8.6: Memory claim binding
  // ═══════════════════════════════════════════

  /**
   * 绑定 self-memory 引用 claim。predicate 'remembers' references an
   * EXISTING LOCAL MEMORY fact owned by the agent (mirrors observed/refers_to/
   * is_relation referencing existing facts). Only self-memory is bound —
   * other agents' memories are forbidden and remain unsupported.
   *
   * @private
   */
  _bindMemoryClaim(claim, index, ctx) {
    const bindings = [];
    const knownMemories = index.knownMemories;
    const confidence = claim.confidence || 0.7;
    const subjectId = this._subjectId(claim);
    const { selfId } = ctx;

    // Only self-memory is bindable. Other agents' memories are forbidden.
    if (subjectId !== selfId) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `memory claim subject "${subjectId}" is not the speaker; other-agent memory is forbidden`,
      });
      return bindings;
    }

    // object is the memory content (string). Match against the agent's known
    // memory contents (lowercased). Exact or contained match accepted.
    const objectCandidates = this._objectValues(claim, 'raw');
    const contentRaw = objectCandidates[0] || '';
    if (!contentRaw) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `memory claim has no content to match`,
      });
      return bindings;
    }

    const contentLower = normalizeComparableText(contentRaw);
    const agentMemories = knownMemories.get(selfId);
    if (!agentMemories || agentMemories.size === 0) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `no allowed memory facts for agent ${selfId}`,
      });
      return bindings;
    }

    const matchedFactId = agentMemories.get(contentLower);

    if (matchedFactId !== null && matchedFactId) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: matchedFactId,
        support: SUPPORT.SUPPORTS,
        evidenceSource: 'known_memories',
        confidence,
        reason: `self-memory content matched an allowed MEMORY fact`,
      });
    } else {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `self-memory content not found in allowed memory facts`,
      });
    }

    return bindings;
  }

  // ═══════════════════════════════════════════
  // R8.7: Intention claim binding
  // ═══════════════════════════════════════════

  /**
   * 绑定 self-intention 引用 claim。predicate 'plans_to' references an
   * EXISTING LOCAL INTENTION fact owned by the agent (mirrors remembers/
   * is_relation referencing existing facts). Only self-intention is bound —
   * other agents' intentions are forbidden and remain unsupported.
   *
   * @private
   */
  _bindIntentionClaim(claim, index, ctx) {
    const bindings = [];
    const knownIntentions = index.knownIntentions;
    const confidence = claim.confidence || 0.7;
    const subjectId = this._subjectId(claim);
    const { selfId } = ctx;

    if (subjectId !== selfId) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `intention claim subject "${subjectId}" is not the speaker; other-agent intention is forbidden`,
      });
      return bindings;
    }

    const intention = knownIntentions.get(selfId);
    if (!intention || !intention.intent) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `no allowed intention facts for agent ${selfId}`,
      });
      return bindings;
    }

    // object is the intent activity (string). Exact or contained match.
    const objectCandidates = this._objectValues(claim, 'raw');
    const intentRaw = objectCandidates[0] || '';
    const intentLower = normalizeComparableText(intentRaw);
    const factIntentLower = normalizeComparableText(intention.intent);
    const matched = intentLower === factIntentLower;

    if (matched && intention.factId) {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: intention.factId,
        support: SUPPORT.SUPPORTS,
        evidenceSource: 'known_intentions',
        confidence,
        reason: `self-intention "${intention.intent}" matched an allowed INTENTION fact`,
      });
    } else {
      bindings.push({
        claimId: claim.id || 'unknown',
        factId: null,
        support: SUPPORT.UNSUPPORTED,
        evidenceSource: null,
        confidence,
        reason: `self-intention content not found in allowed intention facts`,
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
