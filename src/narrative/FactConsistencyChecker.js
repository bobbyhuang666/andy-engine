/**
 * FactConsistencyChecker - 一致性校验器
 *
 * v2 facade：默认调用 GroundingChecker v2（结构化 claim 校验），
 * 保留全部 9 个 regex 子检查器作为 fallback。
 * 返回兼容 shape：{ valid, violations, severity, suggestion }
 * 附加可选字段：claims, checkerVersion: 'v2-structured', groundingVersion: 'v3-semantic-alpha'
 */

const { FactType, FactScope } = require('../canon/FactSchema');
const GroundingChecker = require('./GroundingChecker');
const FactProvider = require('./FactProvider');

class FactConsistencyChecker {
  /**
   * Escape display names before embedding them into RegExp patterns.
   * @private
   */
  static _escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * @param {import('../canon/WorldFactStore')} worldFactStore
   * @param {Object} domain - DomainRegistry 实例
   */
  constructor(worldFactStore, domain) {
    this.store = worldFactStore;
    this.domain = domain;
  }

  /**
   * R18 CONSIST-001 + CONSIST-003 fix: Build a unified name lookup structure
   * that maps both agent IDs and display names (lowercased) to canonical info.
   * This fixes:
   * - Case mismatch: IDs stored as-is but looked up with toLowerCase()
   * - ID vs display name: FactConsistencyChecker was using agentIds to build
   *   regex patterns, but LLM output uses display names
   *
   * @param {Object} grounding - grounding package with metadata
   * @returns {Object} { nameToId: Map<string, string>, idToDisplayName: Map<string, string> }
   * @private
   */
  _buildNameLookup(grounding) {
    const nameToId = new Map(); // lowercase name → agentId
    const idToDisplayName = new Map(); // agentId → display name

    // Primary source: grounding.metadata.agentNames (agentId → displayName mapping)
    const agentNames = grounding.metadata?.agentNames || {};
    for (const [agentId, displayName] of Object.entries(agentNames)) {
      nameToId.set(agentId.toLowerCase(), agentId);
      if (displayName) {
        nameToId.set(displayName.toLowerCase(), agentId);
        idToDisplayName.set(agentId, displayName);
      }
    }

    // Secondary: extract from facts (fallback when agentNames not provided)
    for (const fact of grounding.allowedFacts || []) {
      const ids = [];
      if (fact.agentId) ids.push(fact.agentId);
      if (fact.participants) ids.push(...fact.participants);
      if (fact.observers) ids.push(...fact.observers);
      if (fact.observerId) ids.push(fact.observerId);
      if (fact.targetId) ids.push(fact.targetId);
      if (fact.agentA) ids.push(fact.agentA);
      if (fact.agentB) ids.push(fact.agentB);
      for (const id of ids) {
        const key = id.toLowerCase();
        if (!nameToId.has(key)) nameToId.set(key, id);
      }
    }

    // Add self from metadata
    if (grounding.metadata?.agentId) {
      const selfId = grounding.metadata.agentId;
      nameToId.set(selfId.toLowerCase(), selfId);
    }

    return { nameToId, idToDisplayName };
  }

  /**
   * 校验 LLM 输出
   *
   * v2 facade：默认调用 GroundingChecker v2（结构化 claim 校验），
   * 保留全部 9 个 regex 子检查器作为 fallback。
   * 返回兼容 shape：{ valid, violations, severity, suggestion }
   * 附加可选字段：claims, checkerVersion: 'v2-structured', groundingVersion: 'v3-semantic-alpha'
   *
   * @param {string} llmOutput - LLM 生成的文本
   * @param {Object|string} grounding - 角色的 grounding package；旧调用可传 agentId string
   * @param {Object} [options={}] - 可选参数（如 structuredClaims）
   * @returns {Object} { valid, violations, severity, suggestion, claims?, checkerVersion?, groundingVersion? }
   */
  check(llmOutput, grounding, options = {}) {
    if (!llmOutput || !grounding) {
      return { valid: true, violations: [], severity: 'pass', suggestion: null };
    }

    const normalizedGrounding = this._normalizeGroundingArg(grounding, options);
    if (!normalizedGrounding) {
      return { valid: true, violations: [], severity: 'pass', suggestion: null };
    }

    // v2 structured checker — primary path
    const v2Checker = new GroundingChecker(this.store, this.domain);
    const v2Result = v2Checker.check(llmOutput, normalizedGrounding, options);

    // v1 regex fallback — for patterns not yet covered by structured claims
    const regexViolations = [];
    regexViolations.push(...this._checkCharacterNames(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkLocationNames(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkEventKnowledge(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkTimeConflicts(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkNewContent(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkAgentLocationClaims(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkMissingSourceAttribution(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkAgentStateLeak(llmOutput, normalizedGrounding));
    regexViolations.push(...this._checkLocalScopeLeak(llmOutput, normalizedGrounding));

    // Merge: v2 blocking violations first, then regex-only violations (no duplicates)
    const merged = [...v2Result.violations];
    const existingTypes = new Set(v2Result.violations.map(v => `${v.type}:${v.agent || ''}:${v.location || ''}:${v.event || ''}`));

    for (const rv of regexViolations) {
      const key = `${rv.type}:${rv.agent || ''}:${rv.location || ''}:${rv.event || ''}`;
      if (!existingTypes.has(key)) {
        merged.push(rv);
      }
    }

    const severity = merged.length > 0 ? this._computeSeverity(merged) : 'pass';
    const suggestion = merged.length > 0 ? this._suggestFix(merged) : null;

    return {
      valid: merged.length === 0,
      violations: merged,
      severity,
      suggestion,
      claims: v2Result.claims,
      checkerVersion: 'v2-structured',
      groundingVersion: 'v3-semantic-alpha',
      ...(v2Result.evidenceTrace !== undefined ? { evidenceTrace: v2Result.evidenceTrace } : {}),
      ...(v2Result.coreferenceNotes !== undefined ? { coreferenceNotes: v2Result.coreferenceNotes } : {}),
      ...(v2Result.verifierDecisions !== undefined ? { verifierDecisions: v2Result.verifierDecisions } : {}),
    };
  }

  /**
   * Keep the historical direct checker signature working:
   *   check(text, agentId, options)
   *
   * Public engine.checkConsistency(text, agentId) already builds grounding before
   * calling this class, but external users may instantiate FactConsistencyChecker
   * directly from `andy-engine/facts`.
   *
   * @param {Object|string} groundingOrAgentId
   * @param {Object} options
   * @returns {Object|null}
   * @private
   */
  _normalizeGroundingArg(groundingOrAgentId, options = {}) {
    if (groundingOrAgentId && typeof groundingOrAgentId === 'object') {
      return groundingOrAgentId;
    }
    if (typeof groundingOrAgentId !== 'string') return null;
    if (!this.store || typeof this.store.getFactsForAgent !== 'function') return null;

    try {
      const provider = new FactProvider(this.store, null, new Map());
      return provider.getGroundingPackage(groundingOrAgentId, options);
    } catch (_err) {
      return null;
    }
  }

  /**
   * 角色名硬校验
   * @private
   */
  _checkCharacterNames(text, grounding) {
    const violations = [];

    // R18 CONSIST-003 fix: use unified name lookup (handles both IDs and display names)
    const { nameToId } = this._buildNameLookup(grounding);

    // Match Chinese names (2-4 chars) before action verbs or at sentence boundaries
    const namePattern = /[，。！？\s]([一-龥]{2,4})(?=[说聊问答告诉来了去了见到])/g;
    const mentionedNames = [];
    let nameMatch;
    while ((nameMatch = namePattern.exec(text)) !== null) {
      mentionedNames.push(nameMatch[1]);
    }

    for (const name of mentionedNames) {
      // 跳过常见动词/名词
      const commonWords = ['大家', '别人', '对方', '朋友', '人们'];
      if (commonWords.includes(name)) continue;

      // R18 fix: lookup with lowercase to handle case-insensitive matching
      if (!nameToId.has(name.toLowerCase())) {
        violations.push({
          type: 'unknown_character',
          name,
          message: `提到了未知角色"${name}"`,
        });
      }
    }

    return violations;
  }

  /**
   * Check if a position in the text falls within a source-attributed region
   * (i.e., after a source marker like "听说", "告诉我", "据说", etc.).
   * Locations inside such regions are source-attributed claims, not direct
   * world claims, so they should not trigger unknown_location violations.
   * @private
   */
  _isInSourceAttributedRegion(text, index) {
    const sourceMarkers = ['听说', '告诉我', '告诉过', '说的', '跟我说的', '跟我讲', '说是', '据说', '风闻', '传闻'];
    for (const marker of sourceMarkers) {
      const markerPos = text.lastIndexOf(marker, index);
      if (markerPos >= 0 && markerPos < index) {
        return true;
      }
    }
    return false;
  }

  /**
   * 地名硬校验
   * @private
   */
  _checkLocationNames(text, grounding) {
    const violations = [];

    // 收集已知地名
    const knownLocations = new Set();

    // 从 domain 获取所有区域
    if (this.domain && this.domain.regions) {
      for (const region of this.domain.regions) {
        knownLocations.add(region);
      }
    }

    // 从 allowedFacts 中提取
    for (const fact of grounding.allowedFacts) {
      if (!fact) continue; // R113-007: guard against null entries in allowedFacts
      if (fact.type === FactType.STATIC_ENV && fact.object) {
        knownLocations.add(fact.object);
      }
      if (fact.region) knownLocations.add(fact.region);
      if (fact.location) knownLocations.add(fact.location);
      if (fact.position) knownLocations.add(fact.position);
    }

    // Build the full domain location set
    const allDomainLocations = new Set();
    if (this.domain && this.domain.regions) {
      for (const r of this.domain.regions) allDomainLocations.add(r);
    }

    // Check for location patterns: 在XX, 去XX, 到XX, 从XX
    const locationPattern = /[在去到从]([一-龥]{2,6})/g;
    let match;
    while ((match = locationPattern.exec(text)) !== null) {
      const location = match[1];
      const matchIndex = match.index;
      // Filter: must be a plausible location (not a verb/adj suffix)
      const nonLocationSuffixes = ['看书', '学习', '吃饭', '聊天', '休息', '睡觉', '工作', '运动', '跑步'];
      if (nonLocationSuffixes.some(suffix => location.endsWith(suffix))) continue;
      // Skip common non-location words
      const commonNonLocations = ['这里', '那里', '哪里', '外面', '里面', '旁边', '对面', '上面', '下面'];
      if (commonNonLocations.includes(location)) continue;
      // Skip locations inside source-attributed regions (e.g. "鲍勃告诉我他去了图书馆")
      if (this._isInSourceAttributedRegion(text, matchIndex)) continue;
      // Only flag if the location is NOT in the domain's region list AND NOT in known facts
      if (!allDomainLocations.has(location) && !knownLocations.has(location)) {
        violations.push({
          type: 'unknown_location',
          location,
          message: `提到了未知地点"${location}"`,
        });
      }
    }

    return violations;
  }

  /**
   * 事件知识校验
   * @private
   */
  _checkEventKnowledge(text, grounding) {
    const violations = [];

    // 收集已知事件描述
    const knownEvents = new Set();
    for (const fact of grounding.allowedFacts || []) {
      if (!fact) continue; // R113-007: guard against null entries in allowedFacts
      if (fact.type === FactType.EVENT && fact.description) {
        knownEvents.add(fact.description);
      }
    }

    // 检查是否引用了具体事件（简单匹配）
    const eventPatterns = [
      /那次(.{2,20})/g,
      /上次(.{2,20})/g,
    ];

    for (const pattern of eventPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const eventRef = match[1];
        // 检查是否在已知事件中
        let found = false;
        for (const known of knownEvents) {
          if (known.includes(eventRef) || eventRef.includes(known)) {
            found = true;
            break;
          }
        }
        if (!found && eventRef.length > 3) {
          violations.push({
            type: 'unknown_event',
            event: eventRef,
            message: `引用了未知事件"${eventRef}"`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * 时间冲突校验
   * @private
   */
  _checkTimeConflicts(text, grounding) {
    const violations = [];

    // 简单的时间冲突检测
    const currentTime = grounding.metadata?.currentTime;
    if (!currentTime) return violations;

    const hour = currentTime.getHours ? currentTime.getHours() : 12;

    // 检查时间描述冲突
    if (hour >= 6 && hour < 18) {
      // 白天
      if (text.includes('深夜') || text.includes('凌晨')) {
        violations.push({
          type: 'time_conflict',
          message: '白天提到了深夜/凌晨',
        });
      }
    } else {
      // 夜晚
      if (text.includes('中午') || text.includes('下午')) {
        violations.push({
          type: 'time_conflict',
          message: '夜晚提到了中午/下午',
        });
      }
    }

    return violations;
  }

  /**
   * 新内容校验
   * @private
   */
  _checkNewContent(text, grounding) {
    const violations = [];

    // 检查是否生成了新的关系变化
    const relationshipPatterns = [
      /成为(.{2,6}?朋友)/g,
      /变成(.{2,6}?关系)/g,
      /分手了/g,
      /在一起了/g,
      /结婚了/g,
    ];

    for (const pattern of relationshipPatterns) {
      if (pattern.test(text)) {
        violations.push({
          type: 'new_relationship',
          message: '生成了新的关系变化',
        });
        break;
      }
    }

    // 检查是否编造了新事件
    const eventCreationPatterns = [
      /刚刚(.{2,20})了/g,
    ];

    for (const pattern of eventCreationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const newEvent = match[1];
        // 检查是否在已知事件中
        let found = false;
        for (const fact of grounding.allowedFacts || []) {
          if (!fact) continue; // R113-007: guard against null entries in allowedFacts
          if (fact.type === FactType.EVENT && fact.description && fact.description.includes(newEvent)) {
            found = true;
            break;
          }
        }
        if (!found && newEvent.length >= 2) {
          violations.push({
            type: 'new_event',
            event: newEvent,
            message: `编造了新事件"${newEvent}"`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Agent-location 声明校验
   *
   * 检查文本中 "AgentName在LocationName" 类型的声明
   * 是否被 grounding.allowedFacts 支撑。
   *
   * 支撑来源（仅限说话者自己能推断的知识）：
   *   - 自身 AGENT_STATE fact: fact.agentId === selfId
   *   - EVENT fact: fact.participants / fact.observers at fact.location
   *   - OBSERVATION fact: fact.observerId at fact.location
   *
   * 注意：其他 agent 的 AGENT_STATE 虽然可能因 PUBLIC scope 出现在
   * allowedFacts 中，但不代表说话者真正知道对方的位置——除非有
   * EVENT/OBSERVATION 事实支撑。
   *
   * @private
   */
  _checkAgentLocationClaims(text, grounding) {
    const violations = [];
    if (!grounding || !grounding.allowedFacts) return violations;

    const agentKnownLocations = new Map(); // agentId → Set<location>
    const selfId = grounding.metadata && grounding.metadata.agentId;

    for (const fact of grounding.allowedFacts) {
      if (!fact) continue; // R113-007: guard against null entries in allowedFacts
      // 仅添加 SELF 的 agent_state（私有知识）
      if (fact.type === FactType.AGENT_STATE && fact.agentId === selfId && (fact.position || fact.region)) {
        if (!agentKnownLocations.has(selfId)) agentKnownLocations.set(selfId, new Set());
        agentKnownLocations.get(selfId).add(fact.position || fact.region);
      }
      // EventFact: 添加参与者和观察者的位置
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
      }
      // ObservationFact: 添加观察者的位置
      // R24 P1 fix: ObservationFacts store location in fact.context, not fact.location.
      // createObservationFact (FactSchema.js:243-259) puts location in context field.
      if (fact.type === FactType.OBSERVATION && fact.context && fact.observerId) {
        if (!agentKnownLocations.has(fact.observerId)) agentKnownLocations.set(fact.observerId, new Set());
        agentKnownLocations.get(fact.observerId).add(fact.context);
      }
    }

    // 构建已知角色名集合
    // R18 CONSIST-001 fix: use _buildNameLookup for case-insensitive matching
    const { nameToId } = this._buildNameLookup(grounding);
    const knownAgentNames = nameToId; // Map: lowercase name → agentId

    // 匹配 "AgentName在LocationName" 模式
    const claimPattern = /([一-龥]{2,4}|[A-Za-z]{2,10})\s*[在去了到]\s*([一-龥]{2,6})/g;
    let match;
    while ((match = claimPattern.exec(text)) !== null) {
      const agentName = match[1];
      const location = match[2];

      const commonNonAgents = ['大家', '别人', '对方', '朋友', '人们', '我们', '他们', '她们'];
      if (commonNonAgents.includes(agentName)) continue;

      const commonNonLocations = ['这里', '那里', '哪里', '外面', '里面', '旁边', '对面', '上面', '下面'];
      if (commonNonLocations.includes(location)) continue;

      const nonLocationSuffixes = ['看书', '学习', '吃饭', '聊天', '休息', '睡觉', '工作', '运动', '跑步'];
      if (nonLocationSuffixes.some(suffix => location.endsWith(suffix))) continue;

      const normalizedName = agentName.toLowerCase();

      // R18 CONSIST-001 fix: use nameToId for case-insensitive matching.
      // nameToId maps lowercase names to canonical agentIds.
      const canonicalId = knownAgentNames.get(normalizedName);
      if (!canonicalId) continue;

      // 检查该 agent-location 声明是否被 allowedFacts 支撑
      const knownLocs = agentKnownLocations.get(canonicalId);
      if (!knownLocs || !knownLocs.has(location)) {
        violations.push({
          type: 'unsupported_claim',
          agent: agentName,
          location,
          message: `没有证据表明${agentName}在${location}`,
        });
      }
    }

    return violations;
  }


  /**
   * 其他角色内心状态泄漏校验 (v2.5-W2, evidence fix W3)
   *
   * AGENT_STATE 即使是 public scope，在 epistemic reasoning 中也应视为私有知识。
   * 其他 agent 需要 direct/observed 证据才能表达其状态。told/inferred EVENT
   * 不能 justify 他人 AGENT_STATE 表达（知道"Bob 参加了某事件"不等于知道
   * "Bob 很伤心/很累/想吃饭"）。
   *
   * 两层判定 (v2.5-W3):
   *   - activityJustifiable: 可表达"可见行为"（activity）的 agent
   *     → narrator 亲身参与/观察事件，或 EVENT evidence 为 direct/observed/overheard
   *   - emotionNeedsJustifiable: 可表达"内在状态"（emotion/needs）的 agent
   *     → narrator 亲身参与/观察事件（亲眼在场可推断可观察的情绪表现）
   *     → told/inferred EVENT 绝不 justify emotion/needs
   *
   * @private
   */
  _checkAgentStateLeak(text, grounding) {
    const violations = [];
    if (!grounding || !grounding.allowedFacts) return violations;

    const selfId = grounding.metadata && grounding.metadata.agentId;

    // Two-tier justification sets
    const activityJustifiable = new Set();      // can express visible activity
    const emotionNeedsJustifiable = new Set();  // can express emotion/needs

    if (selfId) {
      activityJustifiable.add(selfId);
      emotionNeedsJustifiable.add(selfId);
    }

    // Collect all known agent names from allowedFacts
    // R18 CONSIST-003 fix: use _buildNameLookup to get both IDs and display names
    const { nameToId, idToDisplayName } = this._buildNameLookup(grounding);

    // Build justification sets from evidence
    for (const fact of grounding.allowedFacts) {
      if (!fact) continue; // R113-007: guard against null entries in allowedFacts
      if (fact.type === FactType.EVENT) {
        // narrator physically present at the event → can infer emotion/needs from observed behavior
        const narratorPresent =
          (fact.participants && fact.participants.includes(selfId)) ||
          (fact.observers && fact.observers.includes(selfId));

        // direct/observed/overheard evidence → can express visible activity
        const hasDirectEvidence = fact._evidence &&
          ['direct', 'observed', 'overheard'].includes(fact._evidence.source);

        if (narratorPresent) {
          // Physically present → all tiers for other participants/observers
          if (fact.participants) for (const p of fact.participants) {
            activityJustifiable.add(p);
            emotionNeedsJustifiable.add(p);
          }
          if (fact.observers) for (const o of fact.observers) {
            activityJustifiable.add(o);
            emotionNeedsJustifiable.add(o);
          }
        } else if (hasDirectEvidence) {
          // Has direct/observed/overheard evidence but not physically present
          // → can only express visible activity, NOT emotion/needs
          if (fact.participants) for (const p of fact.participants) activityJustifiable.add(p);
          if (fact.observers) for (const o of fact.observers) activityJustifiable.add(o);
        }
        // told/inferred EVENT → does NOT justify any AGENT_STATE expression
        // No _evidence → backward compat, does NOT justify
      }

      if (fact.type === FactType.OBSERVATION) {
        // narrator is the observer → all tiers for the target
        const narratorIsObserver = fact.observerId === selfId;
        // direct/observed/overheard evidence → activity only
        const hasDirectEvidence = fact._evidence &&
          ['direct', 'observed', 'overheard'].includes(fact._evidence.source);

        if (narratorIsObserver && fact.targetId) {
          activityJustifiable.add(fact.targetId);
          emotionNeedsJustifiable.add(fact.targetId);
        } else if (hasDirectEvidence && fact.targetId) {
          activityJustifiable.add(fact.targetId);
        }
        // told/inferred OBSERVATION → does NOT justify
      }
    }

    // Emotion vocabulary (deduplicated, v2.5-W3)
    const emotionWords = [
      '开心', '难过', '生气', '害怕', '惊讶', '紧张', '沮丧', '无聊', '孤独',
      '兴奋', '满足', '烦躁', '焦虑', '疲惫', '害羞', '尴尬', '内疚', '失落',
      '感动', '愤怒', '伤心', '心烦', '郁闷', '寂寞', '委屈', '痛苦',
      '快乐', '幸福', '感激', '后悔', '绝望', '崩溃',
    ];

    // Needs vocabulary
    const needsWords = ['饿了', '困了', '累了', '想休息', '想吃', '想睡', '口渴', '头疼', '不舒服'];
    // Needs with "想" prefix that can also match "Name想XX" pattern
    const needsWithPrefix = ['休息', '吃', '睡'];

    // Activity vocabulary
    const activityWords = [
      '看书', '学习', '休息', '工作', '运动', '吃饭', '聊天', '散步', '睡觉',
      '跑步', '锻炼', '做饭', '打扫', '练琴', '画画', '写作业', '上网', '打游戏',
    ];

    // Patterns for state expressions about other agents
    const commonNonAgents = ['大家', '别人', '对方', '朋友', '人们', '我们', '他们', '她们', '自己'];

    // Check each known agent
    // R18 CONSIST-003 fix: iterate over unique agent IDs and use display names
    // for regex pattern matching (LLM output uses display names, not IDs)
    const uniqueAgentIds = new Set(nameToId.values());
    for (const agentId of uniqueAgentIds) {
      if (agentId === selfId) continue; // Self is always ok
      if (commonNonAgents.includes(agentId)) continue;

      // Use display name if available, otherwise fall back to agentId
      const matchName = idToDisplayName.get(agentId) || agentId;
      const safeMatchName = FactConsistencyChecker._escapeRegExp(matchName);

      // Check emotion expressions: Name[很/有点/非常/挺/比较]emotion
      // R18 CONSIST-003 fix: use matchName (display name) for regex patterns,
      // agentId for justifiable set lookups and violation agent field.
      if (!emotionNeedsJustifiable.has(agentId)) {
        for (const emotion of emotionWords) {
          const emotionPatterns = [
            new RegExp(`${safeMatchName}(很|有点|非常|挺|比较|极度|特别|真)${emotion}`),
            new RegExp(`${safeMatchName}感到${emotion}`),
            new RegExp(`${safeMatchName}觉得${emotion}`),
          ];
          for (const pattern of emotionPatterns) {
            if (pattern.test(text)) {
              violations.push({
                type: 'agent_state_leak',
                agent: matchName,
                stateType: 'emotion',
                message: `表达了${matchName}的情绪状态，但你没有证据知道对方的情绪`,
              });
              break;
            }
          }
          if (violations.some(v => v.agent === matchName && v.type === 'agent_state_leak')) break;
        }
      }

      if (violations.some(v => v.agent === matchName && v.type === 'agent_state_leak')) continue;

      // Check needs expressions: Name + needsWord
      if (!emotionNeedsJustifiable.has(agentId)) {
        for (const needs of needsWords) {
          const needsPatterns = [
            new RegExp(`${safeMatchName}${needs}`),
          ];
          for (const pattern of needsPatterns) {
            if (pattern.test(text)) {
              violations.push({
                type: 'agent_state_leak',
                agent: matchName,
                stateType: 'needs',
                message: `表达了${matchName}的需求状态，但你没有证据知道对方的需求`,
              });
              break;
            }
          }
          if (violations.some(v => v.agent === matchName && v.type === 'agent_state_leak')) break;
        }

        // Also check "Name想XX" for needsWithPrefix
        if (!violations.some(v => v.agent === matchName && v.type === 'agent_state_leak')) {
          for (const needs of needsWithPrefix) {
            const pattern = new RegExp(`${safeMatchName}想${needs}`);
            if (pattern.test(text)) {
              violations.push({
                type: 'agent_state_leak',
                agent: matchName,
                stateType: 'needs',
                message: `表达了${matchName}的需求状态，但你没有证据知道对方的需求`,
              });
              break;
            }
          }
        }
      }

      if (violations.some(v => v.agent === matchName && v.type === 'agent_state_leak')) continue;

      // Check activity expressions: Name正在/在+activity
      if (!activityJustifiable.has(agentId)) {
        for (const activity of activityWords) {
          const activityPatterns = [
            new RegExp(`${safeMatchName}正在${activity}`),
            new RegExp(`${safeMatchName}在${activity}`),
          ];
          for (const pattern of activityPatterns) {
            if (pattern.test(text)) {
              violations.push({
                type: 'agent_state_leak',
                agent: matchName,
                stateType: 'activity',
                message: `表达了${matchName}的活动状态，但你没有证据知道对方的活动`,
              });
              break;
            }
          }
          if (violations.some(v => v.agent === matchName && v.type === 'agent_state_leak')) break;
        }
      }
    }

    return violations;
  }

  /**
   * LOCAL 事件/观测知识泄漏校验 (v2.5-W2)
   *
   * 检测 narrative 是否提到了 forbiddenFacts 中 scope=LOCAL 的事件或观测。
   * 这些是其他区域发生的本地事件/观测，agent 不应该知道。
   *
   * 需要 grounding.forbiddenFacts 提供（FactProvider 已填充）。
   * 如果 forbiddenFacts 不可用则跳过（向后兼容）。
   *
   * @private
   */
  _checkLocalScopeLeak(text, grounding) {
    const violations = [];
    if (!grounding || !grounding.forbiddenFacts) return violations;

    for (const fact of grounding.forbiddenFacts) {
      if (!fact || fact._invalidated) continue;
      if (fact.type !== FactType.EVENT && fact.type !== FactType.OBSERVATION) continue;
      if (fact.scope !== FactScope.LOCAL) continue;

      const desc = fact.description || '';
      if (desc.length < 2) continue;

      if (this._textContainsFactContent(text, desc)) {
        violations.push({
          type: 'local_scope_leak',
          fact: desc,
          location: fact.location || '',
          message: `提到了你不知道的本地事件"${desc}"`,
        });
      }
    }

    return violations;
  }

  /**
   * 来源标注校验 (v2.5-W1)
   *
   * 反向检查：grounding 中有 told/inferred 级别事实，但 narrative
   * 无任何来源标记语（"我听说"/"XX告诉我"/"我推测"/"大概"等），
   * 则触发 warning。
   *
   * Known limitation (v2.5-W2): This checker uses reverse full-text marker
   * detection, not per-fact attribution tracking. If a told/inferred fact
   * appears in text but the attribution marker is on a different sentence,
   * the checker may miss the violation (false negative). Conversely, if a
   * told marker appears in text for a different reason, it may suppress a
   * legitimate violation (false positive suppression). Per-fact attribution
   * tracking would require LLM-side cooperation (structured output), which
   * is out of scope for the current regex-based approach.
   *
   * @private
   */
  _checkMissingSourceAttribution(text, grounding) {
    const violations = [];
    if (!grounding || !grounding.allowedFacts) return violations;

    // Source markers in text that indicate attribution
    const toldMarkers = ['听说', '告诉我', '告诉过', '说的', '跟我说的', '跟我讲', '说是', '听讲', '据说', '风闻', '传'];
    const inferredMarkers = ['推测', '大概', '可能', '估计', '猜测', '也许', '应该', '看来', '想必', '八成', '十有八九', '按理'];

    // Collect told/inferred facts from grounding
    const toldFacts = [];
    const inferredFacts = [];

    for (const fact of grounding.allowedFacts) {
      if (!fact) continue; // R113-007: guard against null entries in allowedFacts
      if (!fact._evidence) continue;
      const src = fact._evidence.source;
      const desc = fact.description || '';

      if (src === 'told') {
        toldFacts.push(desc);
      } else if (src === 'inferred') {
        inferredFacts.push(desc);
      }
    }

    // Check: told facts must have attribution markers in text
    for (const desc of toldFacts) {
      if (desc.length < 2) continue;
      // If the description content appears in text but without attribution
      if (this._textContainsFactContent(text, desc)) {
        const hasAttribution = toldMarkers.some(m => text.includes(m));
        if (!hasAttribution) {
          violations.push({
            type: 'missing_source_attribution',
            source: 'told',
            fact: desc,
            message: `听闻级别事实"${desc}"未标注来源`,
          });
        }
      }
    }

    // Check: inferred facts must have hedging markers in text
    for (const desc of inferredFacts) {
      if (desc.length < 2) continue;
      if (this._textContainsFactContent(text, desc)) {
        const hasHedging = inferredMarkers.some(m => text.includes(m)) ||
                           toldMarkers.some(m => text.includes(m));
        if (!hasHedging) {
          violations.push({
            type: 'missing_source_attribution',
            source: 'inferred',
            fact: desc,
            message: `推断级别事实"${desc}"未标注"推测"或"大概"`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * 检查文本是否包含事实描述的关键内容
   * @private
   */
  _textContainsFactContent(text, description) {
    // Require the full description to appear in text.
    // 4-char fragment matching caused false positives:
    //   text "我没有在图书馆" contains 4-char fragment "在图书" from
    //   told fact "鲍勃在图书馆" → spurious missing_source_attribution.
    // The v2 structured checker handles paraphrased matches; v1 regex
    // should only flag exact description repetitions without attribution.
    if (text.includes(description)) return true;
    return false;
  }

  /**
   * 计算严重程度 (v2.5: 4-layer)
   *
   * Severity tiers (highest → lowest priority):
   *   reject              — new_event, new_relationship
   *   rewrite             — unknown_character, unknown_location, unsupported_claim,
   *                         agent_state_leak, local_scope_leak
   *   warning             — missing_source_attribution
   *   degrade_to_template — time_conflict, unknown_event (implicit)
   *   pass                — no violations
   *
   * @private
   */
  _computeSeverity(violations) {
    if (violations.length === 0) return 'pass';

    // 新事件或新关系 → reject
    if (violations.some(v => v.type === 'new_event' || v.type === 'new_relationship')) {
      return 'reject';
    }

    // 未知角色或地点或不支持的声明或状态泄漏 → rewrite
    if (violations.some(v =>
      v.type === 'unknown_character' ||
      v.type === 'unknown_location' ||
      v.type === 'unsupported_claim' ||
      v.type === 'agent_state_leak' ||
      v.type === 'local_scope_leak'
    )) {
      return 'rewrite';
    }

    // 来源标注缺失 → warning (v2.5)
    if (violations.some(v => v.type === 'missing_source_attribution')) {
      return 'warning';
    }

    // 其他（time_conflict, unknown_event）→ degrade_to_template
    return 'degrade_to_template';
  }

  /**
   * 生成修复建议
   * @private
   */
  _suggestFix(violations) {
    if (violations.length === 0) return null;

    const suggestions = [];

    for (const v of violations) {
      switch (v.type) {
        case 'unknown_character':
          suggestions.push(`移除未知角色"${v.name}"`);
          break;
        case 'unknown_location':
          suggestions.push(`移除未知地点"${v.location}"`);
          break;
        case 'unknown_event':
          suggestions.push(`移除未知事件引用"${v.event}"`);
          break;
        case 'time_conflict':
          suggestions.push('修正时间描述');
          break;
        case 'new_relationship':
          suggestions.push('移除新的关系变化');
          break;
        case 'new_event':
          suggestions.push(`移除编造的事件"${v.event}"`);
          break;
        case 'unsupported_claim':
          suggestions.push(`移除不支持的声明"${v.agent}在${v.location}"`);
          break;
        case 'missing_source_attribution':
          suggestions.push(`为"${v.fact}"添加来源标注（${v.source === 'told' ? '听说/XX告诉我' : '推测/大概'}）`);
          break;
        case 'agent_state_leak':
          suggestions.push(`移除对${v.agent}内心状态的表达（你不应该知道对方的状态）`);
          break;
        case 'local_scope_leak':
          suggestions.push(`移除你不知道的事件"${v.fact}"`);
          break;
      }
    }

    return suggestions.join('；');
  }
}

module.exports = FactConsistencyChecker;
