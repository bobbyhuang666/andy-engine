/**
 * FactConsistencyChecker - 一致性校验器（实验性）
 *
 * 第一版实现：基于正则的硬校验。
 * 已知局限：中文名字/地名检测有误报风险。
 * 未来可升级为基于 KnowledgeStore 的精确校验。
 */

const { FactType, FactScope } = require('./FactSchema');

class FactConsistencyChecker {
  /**
   * @param {import('./WorldFactStore')} worldFactStore
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
   * 计算严重程度
   * @private
   */
  _computeSeverity(violations) {
    if (violations.length === 0) return 'pass';

    // 新事件或新关系 → reject
    if (violations.some(v => v.type === 'new_event' || v.type === 'new_relationship')) {
      return 'reject';
    }

    // 未知角色或地点或不支持的声明 → rewrite
    if (violations.some(v => v.type === 'unknown_character' || v.type === 'unknown_location' || v.type === 'unsupported_claim')) {
      return 'rewrite';
    }

    // 其他 → degrade_to_template
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
      }
    }

    return suggestions.join('；');
  }
}

module.exports = FactConsistencyChecker;
