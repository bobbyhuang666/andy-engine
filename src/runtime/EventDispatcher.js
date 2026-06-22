/**
 * EventDispatcher - 事件系统
 *
 * 事件产生方式：
 *   1. 环境触发 - 天气变化、季节更替
 *   2. 状态触发 - Agent 位置匹配导致相遇
 *   3. 日程触发 - 时间到了该做某事
 *   4. 随机触发 - 概率 + 位置匹配
 *   5. 因果触发 - 前一个事件引发后一个事件
 *
 * 事件分发：
 *   - 局部事件：只有相关角色知道
 *   - 公共事件：全城角色可感知
 */

const { ANDY_DEFAULTS, SEMANTIC_EVENT_CATEGORIES } = require('../config/defaults');
const cfg = ANDY_DEFAULTS.events;
const { getDefaultDomain } = require('../domain/DomainRegistry');

class EventDispatcher {
  constructor(domain = null, rng = null) {
    this.domain = domain || getDefaultDomain();
    this._rng = rng;

    /** @type {Object[]} 有序事件日志 */
    this.eventLog = [];
    /** @type {Object[]} 本 tick 待分发的事件 */
    this.pendingEvents = [];
    /** @type {Map<string, Object>} 事件 ID → 事件 */
    this.eventIndex = new Map();
    /** @type {number} 自增事件 ID */
    this._nextId = 0;
    /** @type {Map<string, string[]>} agentId → 最近事件内容列表（去重用） */
    this._recentContentByAgent = new Map();
    /** @type {Set<string>} 最近的交互对键（每 tick 清理） */
    this._recentEncounterPairs = new Set();
    /** @type {Date|null} 模拟时间（由 Simulator 每 tick 注入） */
    this._simTime = null;

    // 从 domain 取事件模板
    this._regionEvents = this.domain.eventTemplates.regionEvents || {};

    // 语义分类：优先用 domain 的 semanticCategories，回退到 neutral defaults
    this._semanticCategories = this.domain?.memoryTemplates?.semanticCategories || SEMANTIC_EVENT_CATEGORIES;
  }

  /**
   * 获取随机数（路由到 RNG 或回退 Math.random）
   * @private
   */
  _rand() {
    return this._rng ? this._rng.next() : Math.random();
  }

  // ═══════════════════════════════════════════
  // 事件生成
  // ═══════════════════════════════════════════

  /**
   * 创建一个新事件
   * @param {Object} params
   * @returns {Object} 事件对象
   */
  createEvent(params) {
    const event = {
      id: `evt_${this._nextId++}`,
      time: params.time || this._simTime || new Date(),
      type: params.type || 'general',
      scope: params.scope || 'local',
      participants: params.participants || [],
      observers: params.observers || [],
      content: params.content || '',
      effects: params.effects || [],
      cause: params.cause || null,  // 因果链：指向引发此事件的事件 ID
      semanticCategory: this._classifySemanticCategory(params.type, params.content),
    };

    // Phase 34: action_selected audit metadata.
    // These fields are copied only when present and do not affect dispatch semantics.
    if (params.agentId !== undefined) event.agentId = params.agentId;
    if (params.action !== undefined) event.action = params.action;
    if (params.reasonTrace !== undefined) event.reasonTrace = params.reasonTrace;
    if (params.stateDeltas !== undefined) event.stateDeltas = params.stateDeltas;
    if (params.metadata !== undefined) event.metadata = params.metadata;

    this.pendingEvents.push(event);
    return event;
  }

  /**
   * 生成位置匹配事件（两个 Agent 在同一区域）
   * @param {string} agentA
   * @param {string} agentB
   * @param {string} region
   * @param {Object} socialGraph - 用于评估关系
   * @returns {Object|null}
   */
  generateEncounterEvent(agentA, agentB, region, socialGraph, agentInstances = null) {
    let rel = socialGraph.getRelationship(agentA, agentB);
    // 首次相遇时概率性创建关系（60% 概率，模拟"不一定每次都会认识"）
    if (!rel) {
      if (this._rand() > 0.6) return null;
      rel = socialGraph.getOrCreateRelationship(agentA, agentB);
    }
    const strength = rel.strength;

    // 去重：避免同一对 Agent 同时产生多个交互事件
    const pairKey = [agentA, agentB].sort().join('_');
    if (this._recentEncounterPairs.has(pairKey)) {
      return null;
    }

    // 关系越强，越可能产生有意义的交互
    // 情绪状态也影响交互概率（开心时更愿意社交）
    let interactionProb = 0.3 + strength * 0.5;
    if (agentInstances) {
      const agentAInst = agentInstances.get(agentA);
      const agentBInst = agentInstances.get(agentB);
      if (agentAInst && agentBInst) {
        const valenceA = agentAInst.emotion.getValence();
        const valenceB = agentBInst.emotion.getValence();
        // 双方情绪都好 → 更可能互动
        interactionProb += (valenceA + valenceB) * 0.1;
        // 一方社交能量低 → 降低概率
        interactionProb -= (1 - Math.min(agentAInst.socialEnergy, agentBInst.socialEnergy)) * 0.2;
      }
    }
    if (this._rand() > Math.max(0.05, Math.min(0.95, interactionProb))) {
      return null;
    }

    // 根据关系类型 + 区域 + 情绪选择交互内容
    let content, valence;
    const si = this.domain.socialInteractions || {};
    const positiveInteractions = si.positive || [
      '一起聊了会天，气氛很愉快',
      '分享了最近的趣事，相视而笑',
      '在同一个地方遇到，一起待了一会',
      '聊到了共同感兴趣的话题',
      '互相鼓励了几句，心情变好了',
    ];
    const neutralInteractions = si.neutral || [
      '打了个招呼',
      '简单聊了几句',
      '微笑点头致意',
      '擦肩而过，互相看了一眼',
    ];
    const negativeInteractions = si.negative || [
      '感觉对方态度有些冷淡',
      '聊天中有些小摩擦',
      '对方似乎不太想被打扰',
      '话不投机，气氛有点尴尬',
      '因为小事起了点争执',
    ];

    if (strength > 0.6) {
      const negChance = 0.08;
      if (this._rand() < negChance) {
        content = negativeInteractions[Math.floor(this._rand() * negativeInteractions.length)];
        valence = -(0.2 + this._rand() * 0.3);
      } else {
        content = positiveInteractions[Math.floor(this._rand() * positiveInteractions.length)];
        valence = 0.5 + this._rand() * 0.3;
      }

      // 区域加成（从 domain 取社交区域）
      const socialRegions = this.domain.placeTypes.social || ['酒馆', '广场'];
      if (socialRegions.includes(region)) {
        if (valence > 0) {
          const tpl = si.withGoodFriendTemplate || ((r) => `和好朋友一起在${r}，聊得很开心`);
          content = tpl(region);
          valence += 0.1;
        }
      }
    } else if (strength > 0.3) {
      // 认识的人：温和社交，偶有摩擦
      const negChance = 0.12;
      if (this._rand() < negChance) {
        content = negativeInteractions[Math.floor(this._rand() * negativeInteractions.length)];
        valence = -(0.1 + this._rand() * 0.2);
      } else {
        content = neutralInteractions[Math.floor(this._rand() * neutralInteractions.length)];
        valence = 0.2 + this._rand() * 0.2;
      }
    } else if (strength > 0.1) {
      // 陌生人但有一些接触
      content = si.strangerBrief || '在附近注意到有人，没什么特别的';
      valence = 0.05 + this._rand() * 0.05;
    } else {
      // 完全陌生
      if (this._rand() > 0.5) return null; // 陌生人互动概率很低
      content = si.strangerNotice || '在附近注意到有人';
      valence = 0.03;
    }

    // 情绪传染：如果一方情绪极端，互动可能偏正面或负面
    if (agentInstances) {
      const agentAInst = agentInstances.get(agentA);
      if (agentAInst) {
        const aValence = agentAInst.emotion.getValence();
        if (aValence < -0.4 && this._rand() > 0.5) {
          // 一方心情很差时，互动可能不愉快
          content = negativeInteractions[Math.floor(this._rand() * negativeInteractions.length)];
          valence = Math.abs(valence) * -0.3;
        } else if (aValence > 0.4) {
          // 一方心情很好时，互动更愉快
          valence += 0.1;
        }
      }
    }

    // ─── 八卦 / 社交信息传播 ───
    // Dunbar (2004): 人类约 65% 的对话时间用于社交信息交换（gossip）
    // 当关系足够强且有 agentInstances 时，Agent 可能分享关于第三方的信息
    // NOTE: gossip memory is deferred as an event effect, applied through EffectCommitter.
    const gossipEffects = [];
    if (strength > 0.2 && agentInstances && this._rand() < 0.35) {
      const gossiper = this._rand() > 0.5 ? agentA : agentB;
      const listener = gossiper === agentA ? agentB : agentA;
      const gossiperInst = agentInstances.get(gossiper);
      const listenerInst = agentInstances.get(listener);

      if (gossiperInst && listenerInst) {
        // 找到八卦素材：重要且有情绪标签的记忆
        // 包括八卦记忆（支持多跳传播，但重要性阈值更高）
        const shareable = gossiperInst.memory.memories
          .filter(m => {
            if (m.emotionTag === 'neutral') return false;
            if (m.category === 'gossip') return m.importance > 0.5; // 八卦需要更高阈值
            return m.importance > 0.25;
          })
          .sort((a, b) => b.importance - a.importance);

        if (shareable.length > 0) {
          const memory = shareable[0];
          const gossiperName = gossiperInst.name;
          content += `。${gossiperName}还提到了：${memory.content}`;

          // 去重：检查接收方是否已经知道这条八卦
          const gossipContent = `${gossiperName}说：${memory.content}`;
          const existingGossip = listenerInst.memory.memories.find(
            m => m.category === 'gossip' && m.content === gossipContent
          );
          if (!existingGossip) {
            // Defer gossip memory creation as event effect
            gossipEffects.push({
              target: listener,
              type: 'memory',
              delta: {
                kind: 'candidate',
                memoryType: 'gossip',
                content: gossipContent,
                category: 'gossip',
                importance: memory.importance * 0.7,
              },
            });
          }
        }
      }
    }

    const event = {
      type: 'social',
      scope: 'local',
      participants: [agentA, agentB],
      content,
      effects: [
        { target: agentA, type: 'relationship', delta: { target: agentB, valence } },
        { target: agentB, type: 'relationship', delta: { target: agentA, valence } },
        { target: agentA, type: 'emotion', delta: {
          joy: valence > 0 ? valence * 0.08 : 0,
          loneliness: -Math.abs(valence) * 0.05,
          sadness: valence < 0 ? Math.abs(valence) * 0.04 : 0,
        }},
        { target: agentB, type: 'emotion', delta: {
          joy: valence > 0 ? valence * 0.08 : 0,
          loneliness: -Math.abs(valence) * 0.05,
          sadness: valence < 0 ? Math.abs(valence) * 0.04 : 0,
        }},
        ...gossipEffects,
      ],
    };

    // 记录去重键
    this._recentEncounterPairs.add(pairKey);

    // NOTE: relationship recordInteraction is NOT called here.
    // Encounter relationship effects are applied through EffectCommitter
    // in AndyWorld._applyEncounterEffects() after event dispatch.

    return event;
  }

  /**
   * 生成环境事件
   * @param {string} weatherType
   * @param {string[]} affectedAgentIds
   * @returns {Object}
   */
  generateEnvironmentEvent(weatherType, affectedAgentIds) {
    // 从 domain 取天气事件模板（唯一来源）
    const domainWeatherEvents = this.domain.eventTemplates.weatherEvents || {};
    const domainEvent = domainWeatherEvents[weatherType];

    // 如果 domain 没有配置该天气事件，使用中性内容
    const weatherEvent = domainEvent || {
      content: `天气变化: ${weatherType}`,
      effects: [{ target: '*', type: 'emotion', delta: {} }],
    };

    // 将 * 替换为所有受影响的 Agent
    const effects = [];
    for (const effect of (weatherEvent.effects || [])) {
      for (const agentId of affectedAgentIds) {
        effects.push({ ...effect, target: agentId });
      }
    }

    return {
      type: 'weather',
      scope: 'public',
      participants: [],
      observers: affectedAgentIds,
      content: weatherEvent.content,
      effects,
    };
  }

  /**
   * 生成上下文感知的随机事件
   *
   * 事件会考虑：
   *   - 当前区域（location-aware）
   *   - 时间段（time-of-day-aware）
   *   - 天气（weather-aware）
   *
   * @param {string} agentId
   * @param {string} region
   * @param {Object} [context] - 上下文信息 { hour, weather, timeOfDay }
   * @returns {Object|null}
   */
  generateRandomEvent(agentId, region, context = {}) {
    if (this._rand() > cfg.randomEventProbability) return null;

    const candidates = [];

    // ─── 通用事件（从 domain 取）───
    const genericEvents = this.domain.eventTemplates.genericEvents || [];
    candidates.push(...genericEvents);

    // ─── 区域特定事件（从 domain 取）───
    if (this._regionEvents[region]) {
      candidates.push(...this._regionEvents[region]);
    }

    // ─── 时间特定事件（从 domain 取）───
    const hour = context.hour || 12;
    const timeEvents = this.domain.eventTemplates.timeEvents || {};
    if (hour >= 23 || hour < 5) {
      if (timeEvents.lateNight) candidates.push(...timeEvents.lateNight);
    } else if (hour >= 5 && hour < 8) {
      if (timeEvents.morning) candidates.push(...timeEvents.morning);
    } else if (hour >= 17 && hour < 20) {
      if (timeEvents.evening) candidates.push(...timeEvents.evening);
    }

    // ─── 天气特定事件（从 domain 取）───
    const weather = context.weather;
    const weatherEvents = this.domain.eventTemplates.weatherEvents || {};
    if (weather && weatherEvents[weather]) {
      candidates.push(...weatherEvents[weather]);
    }

    if (candidates.length === 0) return null;

    // 去重
    const recent = this._recentContentByAgent.get(agentId) || [];
    const available = candidates.filter(e => !recent.includes(e.content));
    if (available.length === 0) return null;

    const chosen = available[Math.floor(this._rand() * available.length)];

    const updatedRecent = [...recent, chosen.content].slice(-8);
    this._recentContentByAgent.set(agentId, updatedRecent);

    return {
      type: 'random',
      scope: 'local',
      participants: [agentId],
      content: chosen.content,
      effects: [
        { target: agentId, type: 'emotion', delta: chosen.delta },
      ],
    };
  }

  // ═══════════════════════════════════════════
  // 事件分发
  // ═══════════════════════════════════════════

  /**
   * 分发本 tick 的所有待处理事件
   * @returns {Object[]} 分发的事件列表
   */
  dispatch() {
    const dispatched = [...this.pendingEvents];
    this.pendingEvents = [];
    this._recentEncounterPairs.clear(); // 每 tick 清理去重缓冲
    this._recentContentByAgent.clear(); // 每 tick 清理事件去重缓冲（防止长时间模拟内存泄漏）

    for (const event of dispatched) {
      // 写入事件日志
      this.eventLog.push(event);
      this.eventIndex.set(event.id, event);
    }

    // 清理过期事件（从循环中移出，避免 O(n²) 的 shift 操作）
    this._cleanupOldEvents();

    // 性能优化：eventLog 上限 2000 条，防止长期模拟内存膨胀
    if (this.eventLog.length > 2000) {
      const removed = this.eventLog.splice(0, this.eventLog.length - 2000);
      for (const evt of removed) {
        this.eventIndex.delete(evt.id);
      }
    }

    return dispatched;
  }

  /**
   * 获取某个 Agent 可感知的事件
   * @param {string} agentId
   * @param {Object[]} events - 事件列表
   * @returns {Object[]}
   */
  filterEventsForAgent(agentId, events) {
    return events.filter(event => {
      // 直接参与者
      if (event.participants.includes(agentId)) return true;
      // 观察者
      if (event.observers.includes(agentId)) return true;
      // 公共事件（所有人都能感知）
      if (event.scope === 'public') return true;
      return false;
    });
  }

  /**
   * 获取因果链（某个事件引发的所有后续事件）
   * @param {string} rootEventId
   * @returns {Object[]}
   */
  getCausalChain(rootEventId) {
    const chain = [];
    const visited = new Set();

    const traverse = (eventId) => {
      if (visited.has(eventId)) return;
      visited.add(eventId);

      const event = this.eventIndex.get(eventId);
      if (!event) return;

      chain.push(event);

      // 查找由这个事件引发的后续事件
      for (const [id, evt] of this.eventIndex) {
        if (evt.cause === eventId) {
          traverse(id);
        }
      }
    };

    traverse(rootEventId);
    return chain;
  }

  /**
   * 清理过期事件
   * @private
   */
  _cleanupOldEvents() {
    // 使用模拟时间而非 Date.now()，否则快速模拟时事件永远不被清理
    const now = this._simTime ? this._simTime.getTime() : Date.now();
    const cutoff = now - cfg.eventLifespan * 60 * 1000;

    // 找到第一个未过期的事件索引（eventLog 按时间有序）
    let cutoffIdx = 0;
    while (cutoffIdx < this.eventLog.length) {
      const evtTime = this.eventLog[cutoffIdx].time;
      const evtTimeMs = evtTime instanceof Date ? evtTime.getTime() : new Date(evtTime).getTime();
      if (evtTimeMs < cutoff) {
        cutoffIdx++;
      } else {
        break;
      }
    }

    // 硬上限：保留最新的 maxEventLogSize 条
    const maxKeep = cfg.maxEventLogSize;
    const removeCount = Math.max(cutoffIdx, this.eventLog.length - maxKeep);

    if (removeCount > 0) {
      // 用 splice 一次性移除（O(n) 而非 O(n²)）
      const removed = this.eventLog.splice(0, removeCount);
      for (const evt of removed) {
        this.eventIndex.delete(evt.id);
      }
    }
  }

  /**
   * 语义事件分类
   * @param {string} type - 事件类型
   * @param {string} content - 事件内容
   * @returns {string} 语义分类标签
   * @private
   */
  _classifySemanticCategory(type, content) {
    const cats = this._semanticCategories;

    // 1. 基于事件类型的直接映射
    if (type && cats.typeMap && cats.typeMap[type]) {
      return cats.typeMap[type];
    }

    // 2. 基于内容关键词的分类
    const text = (content || '').toLowerCase();
    if (text && cats.keywordMap) {
      for (const [category, keywords] of Object.entries(cats.keywordMap)) {
        for (const kw of keywords) {
          if (text.includes(kw)) return category;
        }
      }
    }

    return '日常琐事';
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      eventLog: this.eventLog.slice(-100).map(e => ({
        ...e,
        semanticCategory: e.semanticCategory,
      })),
    };
  }
}

module.exports = EventDispatcher;
