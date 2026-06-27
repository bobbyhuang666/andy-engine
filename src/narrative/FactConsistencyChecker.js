/**
 * FactConsistencyChecker - 一致性校验器（实验性）
 *
 * 第一版实现：基于正则的硬校验。
 * 已知局限：中文名字/地名检测有误报风险。
 * 未来可升级为基于 KnowledgeStore 的精确校验。
 */

const { FactType, FactScope } = require('../canon/FactSchema');

class FactConsistencyChecker {
  /**
   * @param {import('../canon/WorldFactStore')} worldFactStore
   * @param {Object} domain - DomainRegistry 实例
   */
  constructor(worldFactStore, domain) {
    this.store = worldFactStore;
    this.domain = domain;
  }

  /**
   * 校验 LLM 输出
   * @param {string} llmOutput - LLM 生成的文本
   * @param {Object} grounding - 角色的 grounding package
   * @returns {Object} { valid, violations, severity, suggestion }
   */
  check(llmOutput, grounding) {
    if (!llmOutput || !grounding) {
      return { valid: true, violations: [], severity: 'pass', suggestion: null };
    }

    const violations = [];

    // 1. 角色名校验
    violations.push(...this._checkCharacterNames(llmOutput, grounding));

    // 2. 地名校验
    violations.push(...this._checkLocationNames(llmOutput, grounding));

    // 3. 事件知识校验
    violations.push(...this._checkEventKnowledge(llmOutput, grounding));

    // 4. 时间冲突校验
    violations.push(...this._checkTimeConflicts(llmOutput, grounding));

    // 5. 新内容校验
    violations.push(...this._checkNewContent(llmOutput, grounding));

    // 6. Agent-location 声明校验
    violations.push(...this._checkAgentLocationClaims(llmOutput, grounding));

    // 7. 来源标注校验 (v2.5-W1)
    violations.push(...this._checkMissingSourceAttribution(llmOutput, grounding));

    // 8. 其他角色内心状态泄漏校验 (v2.5-W2)
    violations.push(...this._checkAgentStateLeak(llmOutput, grounding));

    // 9. LOCAL 事件知识泄漏校验 (v2.5-W2)
    violations.push(...this._checkLocalScopeLeak(llmOutput, grounding));

    return {
      valid: violations.length === 0,
      violations,
      severity: this._computeSeverity(violations),
      suggestion: violations.length > 0 ? this._suggestFix(violations) : null,
    };
  }

  /**
   * 角色名硬校验
   * @private
   */
  _checkCharacterNames(text, grounding) {
    const violations = [];

    // 收集已知角色名
    const knownNames = new Set();

    // 从 allowedFacts 中提取
    for (const fact of grounding.allowedFacts) {
      if (fact.type === FactType.AGENT_STATE && fact.agentId) {
        knownNames.add(fact.agentId);
      }
      if (fact.type === FactType.RELATIONSHIP) {
        if (fact.agentA) knownNames.add(fact.agentA);
        if (fact.agentB) knownNames.add(fact.agentB);
        if (fact.from) knownNames.add(fact.from);
        if (fact.to) knownNames.add(fact.to);
      }
      if (fact.participants) {
        for (const p of fact.participants) knownNames.add(p);
      }
    }

    // 从 grounding metadata 中添加当前角色
    if (grounding.metadata && grounding.metadata.agentId) {
      knownNames.add(grounding.metadata.agentId);
    }

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

      if (!knownNames.has(name)) {
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
      // Filter: must be a plausible location (not a verb/adj suffix)
      const nonLocationSuffixes = ['看书', '学习', '吃饭', '聊天', '休息', '睡觉', '工作', '运动', '跑步'];
      if (nonLocationSuffixes.some(suffix => location.endsWith(suffix))) continue;
      // Skip common non-location words
      const commonNonLocations = ['这里', '那里', '哪里', '外面', '里面', '旁边', '对面', '上面', '下面'];
      if (commonNonLocations.includes(location)) continue;
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
    for (const fact of grounding.allowedFacts) {
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
        for (const fact of grounding.allowedFacts) {
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
      if (fact.type === FactType.OBSERVATION && fact.location && fact.observerId) {
        if (!agentKnownLocations.has(fact.observerId)) agentKnownLocations.set(fact.observerId, new Set());
        agentKnownLocations.get(fact.observerId).add(fact.location);
      }
    }

    // 构建已知角色名集合
    const knownAgentNames = new Set();
    for (const fact of grounding.allowedFacts) {
      if (fact.type === FactType.AGENT_STATE && fact.agentId) knownAgentNames.add(fact.agentId);
      if (fact.participants) for (const p of fact.participants) knownAgentNames.add(p);
      if (fact.observers) for (const o of fact.observers) knownAgentNames.add(o);
    }
    if (selfId) knownAgentNames.add(selfId);

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

      // 不是已知角色 → 交给 _checkCharacterNames 处理
      if (!knownAgentNames.has(normalizedName)) continue;

      // 检查该 agent-location 声明是否被 allowedFacts 支撑
      const knownLocs = agentKnownLocations.get(normalizedName);
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
   * 其他角色内心状态泄漏校验 (v2.5-W2)
   *
   * AGENT_STATE 即使是 public scope，在 epistemic reasoning 中也应视为私有知识。
   * 其他 agent 需要 direct/observed/told/inferred 证据才能表达其状态。
   *
   * 检测逻辑：
   *   1. 找出"可表达状态的 agent"集合（self + 有 EVENT/OBSERVATION 支撑的 other）
   *   2. 匹配文本中"其他角色 + 内心状态表达"模式
   *   3. 不在可表达集合中的 → agent_state_leak violation
   *
   * @private
   */
  _checkAgentStateLeak(text, grounding) {
    const violations = [];
    if (!grounding || !grounding.allowedFacts) return violations;

    const selfId = grounding.metadata && grounding.metadata.agentId;

    // Build set of "justifiable" agents whose state the narrator can express.
    // Self is always justifiable. Other agents are justifiable only if there's
    // an EVENT or OBSERVATION fact in allowedFacts involving them (with evidence).
    const justifiableAgents = new Set();
    if (selfId) justifiableAgents.add(selfId);

    // Collect all known agent names from allowedFacts
    const knownAgentNames = new Set();
    for (const fact of grounding.allowedFacts) {
      if (fact.type === FactType.AGENT_STATE && fact.agentId) knownAgentNames.add(fact.agentId);
      if (fact.participants) for (const p of fact.participants) knownAgentNames.add(p);
      if (fact.observers) for (const o of fact.observers) knownAgentNames.add(o);
      if (fact.observerId) knownAgentNames.add(fact.observerId);
      if (fact.targetId) knownAgentNames.add(fact.targetId);
    }
    if (selfId) knownAgentNames.add(selfId);

    // Other agents with EVENT/OBSERVATION evidence are justifiable
    for (const fact of grounding.allowedFacts) {
      if (fact.type === FactType.EVENT) {
        // If the narrator is participant/observer of this event, other participants are visible
        const narratorInvolved =
          (fact.participants && fact.participants.includes(selfId)) ||
          (fact.observers && fact.observers.includes(selfId)) ||
          (fact._evidence && ['direct', 'observed', 'overheard', 'told', 'inferred'].includes(fact._evidence.source));
        if (narratorInvolved) {
          if (fact.participants) for (const p of fact.participants) justifiableAgents.add(p);
          if (fact.observers) for (const o of fact.observers) justifiableAgents.add(o);
        }
      }
      if (fact.type === FactType.OBSERVATION) {
        // Observation about a target — if narrator is observer or has evidence
        const narratorKnows =
          fact.observerId === selfId ||
          (fact._evidence && ['direct', 'observed', 'overheard', 'told', 'inferred'].includes(fact._evidence.source));
        if (narratorKnows && fact.targetId) {
          justifiableAgents.add(fact.targetId);
        }
      }
    }

    // Emotion vocabulary
    const emotionWords = [
      '开心', '难过', '生气', '害怕', '惊讶', '紧张', '沮丧', '无聊', '孤独',
      '兴奋', '满足', '烦躁', '焦虑', '疲惫', '害羞', '尴尬', '内疚', '失落',
      '感动', '愤怒', '伤心', '心烦', '郁闷', '寂寞', '委屈', '伤心', '痛苦',
      '快乐', '幸福', '感激', '后悔', '绝望', '崩溃',
    ];

    // Needs vocabulary
    const needsWords = ['饿了', '困了', '累了', '想休息', '想吃', '想睡', '口渴', '头疼', '不舒服'];

    // Activity vocabulary
    const activityWords = [
      '看书', '学习', '休息', '工作', '运动', '吃饭', '聊天', '散步', '睡觉',
      '跑步', '锻炼', '做饭', '打扫', '练琴', '画画', '写作业', '上网', '打游戏',
    ];

    // Patterns for state expressions about other agents
    const commonNonAgents = ['大家', '别人', '对方', '朋友', '人们', '我们', '他们', '她们', '自己'];

    // Pattern 1: AgentName + emotion (Name很/有点/非常/挺/比较/比较+emotion)
    // Use known agent names from grounding for matching
    for (const agentName of knownAgentNames) {
      if (agentName === selfId) continue; // Self is always ok
      if (commonNonAgents.includes(agentName)) continue;
      if (justifiableAgents.has(agentName)) continue; // Justified by evidence

      // Check emotion expressions: Name[很/有点/非常/挺/比较]emotion
      for (const emotion of emotionWords) {
        const emotionPatterns = [
          new RegExp(`${agentName}(很|有点|非常|挺|比较|极度|特别|真)${emotion}`),
          new RegExp(`${agentName}感到${emotion}`),
          new RegExp(`${agentName}觉得${emotion}`),
        ];
        for (const pattern of emotionPatterns) {
          if (pattern.test(text)) {
            violations.push({
              type: 'agent_state_leak',
              agent: agentName,
              stateType: 'emotion',
              message: `表达了${agentName}的情绪状态，但你没有证据知道对方的状态`,
            });
            break; // One violation per agent is enough
          }
        }
        if (violations.some(v => v.agent === agentName && v.type === 'agent_state_leak')) break;
      }

      if (violations.some(v => v.agent === agentName && v.type === 'agent_state_leak')) continue;

      // Check needs expressions: Name + needsWord
      for (const needs of needsWords) {
        const needsPatterns = [
          new RegExp(`${agentName}${needs}`),
          new RegExp(`${agentName}想${needs.replace('想', '')}`),
        ];
        for (const pattern of needsPatterns) {
          if (pattern.test(text)) {
            violations.push({
              type: 'agent_state_leak',
              agent: agentName,
              stateType: 'needs',
              message: `表达了${agentName}的需求状态，但你没有证据知道对方的状态`,
            });
            break;
          }
        }
        if (violations.some(v => v.agent === agentName && v.type === 'agent_state_leak')) break;
      }

      if (violations.some(v => v.agent === agentName && v.type === 'agent_state_leak')) continue;

      // Check activity expressions: Name正在/在+activity
      for (const activity of activityWords) {
        const activityPatterns = [
          new RegExp(`${agentName}正在${activity}`),
          new RegExp(`${agentName}在${activity}`),
        ];
        for (const pattern of activityPatterns) {
          if (pattern.test(text)) {
            violations.push({
              type: 'agent_state_leak',
              agent: agentName,
              stateType: 'activity',
              message: `表达了${agentName}的活动状态，但你没有证据知道对方的状态`,
            });
            break;
          }
        }
        if (violations.some(v => v.agent === agentName && v.type === 'agent_state_leak')) break;
      }
    }

    return violations;
  }

  /**
   * LOCAL 事件知识泄漏校验 (v2.5-W2)
   *
   * 检测 narrative 是否提到了 forbiddenFacts 中 scope=LOCAL 的事件。
   * 这些是其他区域发生的本地事件，agent 不应该知道。
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
      if (fact.type !== FactType.EVENT) continue;
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
    // Simple substring check — if description appears in text
    if (text.includes(description)) return true;
    // Check partial match for longer descriptions (at least 4 chars overlap)
    if (description.length >= 4) {
      for (let i = 0; i <= description.length - 4; i++) {
        const fragment = description.substring(i, i + 4);
        if (text.includes(fragment)) return true;
      }
    }
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
