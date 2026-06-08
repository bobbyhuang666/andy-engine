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

class EventDispatcher {
  constructor() {
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
      if (Math.random() > 0.6) return null;
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
    if (Math.random() > Math.max(0.05, Math.min(0.95, interactionProb))) {
      return null;
    }

    // 根据关系类型 + 区域 + 情绪选择交互内容
    let content, valence;
    const positiveInteractions = [
      '一起聊了会天，气氛很愉快',
      '分享了最近的趣事，相视而笑',
      '在同一个地方遇到，一起待了一会',
      '聊到了共同感兴趣的话题',
      '互相鼓励了几句，心情变好了',
    ];
    const neutralInteractions = [
      '打了个招呼',
      '简单聊了几句',
      '微笑点头致意',
      '擦肩而过，互相看了一眼',
    ];
    const negativeInteractions = [
      '感觉对方态度有些冷淡',
      '聊天中有些小摩擦',
      '对方似乎不太想被打扰',
      '话不投机，气氛有点尴尬',
      '因为小事起了点争执',
    ];

    if (strength > 0.6) {
      // 好朋友：大部分正面，但偶尔也会有冲突
      const negChance = 0.08; // 8% 概率产生负面互动
      if (Math.random() < negChance) {
        content = negativeInteractions[Math.floor(Math.random() * negativeInteractions.length)];
        valence = -(0.2 + Math.random() * 0.3);
      } else {
        content = positiveInteractions[Math.floor(Math.random() * positiveInteractions.length)];
        valence = 0.5 + Math.random() * 0.3;
      }

      // 区域加成
      if (['食堂', '咖啡店'].includes(region)) {
        if (valence > 0) {
          content = '和好朋友一起' + (region === '食堂' ? '吃饭' : '喝咖啡') + '，聊得很开心';
          valence += 0.1;
        }
      }
    } else if (strength > 0.3) {
      // 认识的人：温和社交，偶有摩擦
      const negChance = 0.12;
      if (Math.random() < negChance) {
        content = negativeInteractions[Math.floor(Math.random() * negativeInteractions.length)];
        valence = -(0.1 + Math.random() * 0.2);
      } else {
        content = neutralInteractions[Math.floor(Math.random() * neutralInteractions.length)];
        valence = 0.2 + Math.random() * 0.2;
      }
    } else if (strength > 0.1) {
      // 陌生人但有一些接触
      content = '在附近注意到有人，没什么特别的';
      valence = 0.05 + Math.random() * 0.05;
    } else {
      // 完全陌生
      if (Math.random() > 0.5) return null; // 陌生人互动概率很低
      content = '在附近注意到有人';
      valence = 0.03;
    }

    // 情绪传染：如果一方情绪极端，互动可能偏正面或负面
    if (agentInstances) {
      const agentAInst = agentInstances.get(agentA);
      if (agentAInst) {
        const aValence = agentAInst.emotion.getValence();
        if (aValence < -0.4 && Math.random() > 0.5) {
          // 一方心情很差时，互动可能不愉快
          content = negativeInteractions[Math.floor(Math.random() * negativeInteractions.length)];
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
    if (strength > 0.2 && agentInstances && Math.random() < 0.35) {
      const gossiper = Math.random() > 0.5 ? agentA : agentB;
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
            // 八卦给接收方添加"二手记忆"（重要性降低 30%）
            listenerInst.memory.addExperience({
              content: gossipContent,
              type: 'gossip',
              participants: [gossiper],
              effects: [],
            }, listenerInst.emotion, memory.importance * 0.7);
          }
        }
      }
    }

    const event = this.createEvent({
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
      ],
    });

    // 记录去重键
    this._recentEncounterPairs.add(pairKey);

    // 记录关系交互（使用模拟时间）
    rel.recordInteraction('encounter', valence, content, this._simTime || null);

    return event;
  }

  /**
   * 生成环境事件
   * @param {string} weatherType
   * @param {string[]} affectedAgentIds
   * @returns {Object}
   */
  generateEnvironmentEvent(weatherType, affectedAgentIds) {
    const weatherEvents = {
      rain: {
        content: '下雨了',
        effects: [
          { target: '*', type: 'emotion', delta: { frustration: 0.04, sadness: 0.03, calm: 0.02 } },
        ],
      },
      sunny: {
        content: '天气晴朗',
        effects: [
          { target: '*', type: 'emotion', delta: { joy: 0.06, calm: 0.04, excitement: 0.02 } },
        ],
      },
      cold: {
        content: '天气很冷',
        effects: [
          { target: '*', type: 'emotion', delta: { frustration: 0.04, calm: -0.03, sadness: 0.02 } },
        ],
      },
      hot: {
        content: '天气很热',
        effects: [
          { target: '*', type: 'emotion', delta: { frustration: 0.06, anger: 0.02, calm: -0.03 } },
        ],
      },
    };

    const weatherEvent = weatherEvents[weatherType] || {
      content: `天气变化: ${weatherType}`,
      effects: [],
    };

    // 将 * 替换为所有受影响的 Agent
    const effects = [];
    for (const effect of weatherEvent.effects) {
      for (const agentId of affectedAgentIds) {
        effects.push({ ...effect, target: agentId });
      }
    }

    return this.createEvent({
      type: 'weather',
      scope: 'public',
      participants: [],
      observers: affectedAgentIds,
      content: weatherEvent.content,
      effects,
    });
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
    if (Math.random() > cfg.randomEventProbability) return null;

    // 根据上下文选择合适的事件池
    const candidates = [];

    // ─── 通用事件（任何时间地点）───
    const generic = [
      { content: '在路边看到一只流浪猫', delta: { interest: 0.04, calm: 0.03 }, tags: ['outdoor'] },
      { content: '手机突然响了一下，是条无聊的推送', delta: { boredom: 0.03 }, tags: [] },
      { content: '闻到了一股好闻的味道', delta: { joy: 0.03, contentment: 0.02 }, tags: [] },
      { content: '路过了一个卖唱的人', delta: { interest: 0.03, calm: 0.02 }, tags: ['outdoor'] },
      { content: '看到一对情侣在路边吵架', delta: { nervousness: 0.02, sympathy: 0.03 }, tags: ['outdoor'] },
      { content: '发现食堂出了新菜', delta: { excitement: 0.03, interest: 0.02 }, tags: ['canteen'] },
      { content: '突然想起明天还有作业没写', delta: { nervousness: 0.04, frustration: 0.03 }, tags: [] },
      { content: '天空很美，忍不住看了一眼', delta: { calm: 0.03, awe: 0.03 }, tags: ['outdoor'] },
      { content: '踩到了一个水坑', delta: { frustration: 0.03, surprise: 0.02 }, tags: ['outdoor'] },
      { content: '发现耳机里正在播的歌特别好听', delta: { joy: 0.03, calm: 0.02 }, tags: [] },
      { content: '手机电量只剩 5% 了，没带充电器', delta: { nervousness: 0.04, frustration: 0.03 }, tags: [] },
      { content: '被蚊子咬了一口，好痒', delta: { frustration: 0.03, anger: 0.01 }, tags: [] },
      { content: '想起一件很久以前的尴尬事', delta: { shame: 0.03, embarrassment: 0.02 }, tags: [] },
      { content: '被路上的陌生人白了一眼', delta: { anger: 0.03, frustration: 0.02 }, tags: [] },
      { content: '突然觉得生活很没意思', delta: { sadness: 0.04, loneliness: 0.03, boredom: 0.02 }, tags: [] },
      { content: '钱包好像忘在什么地方了', delta: { nervousness: 0.05, frustration: 0.04 }, tags: [] },
      { content: '发的消息已读不回，有点在意', delta: { sadness: 0.03, nervousness: 0.02 }, tags: [] },
      { content: '今天什么都不想做', delta: { boredom: 0.04, frustration: 0.02, sadness: 0.02 }, tags: [] },
    ];
    candidates.push(...generic);

    // ─── 区域特定事件 ───
    const regionEvents = {
      '宿舍': [
        { content: '室友带了好吃的回来分享', delta: { joy: 0.04, gratitude: 0.03 } },
        { content: '隔壁宿舍太吵了', delta: { frustration: 0.04, anger: 0.02 } },
        { content: '发现宿舍的WiFi修好了', delta: { relief: 0.03, joy: 0.02 } },
      ],
      '教室': [
        { content: '老师讲了个有趣的例子', delta: { interest: 0.04, amusement: 0.02 } },
        { content: '课堂太无聊了，忍不住走神', delta: { boredom: 0.04 } },
        { content: '突然被老师点名回答问题', delta: { nervousness: 0.05, surprise: 0.03 } },
      ],
      '图书馆': [
        { content: '找到了一本很有趣的书', delta: { interest: 0.05, excitement: 0.02 } },
        { content: '旁边的人一直在小声说话', delta: { frustration: 0.03, anger: 0.01 } },
        { content: '图书馆很安静，感觉很舒服', delta: { calm: 0.04, contentment: 0.02 } },
      ],
      '食堂': [
        { content: '今天的菜特别好吃', delta: { satisfaction: 0.04, joy: 0.03 } },
        { content: '排了很长的队', delta: { frustration: 0.03, boredom: 0.02 } },
        { content: '在食堂偶遇了好久没见的朋友', delta: { joy: 0.05, surprise: 0.03 } },
      ],
      '操场': [
        { content: '跑步跑到一半突然下雨了', delta: { frustration: 0.03, surprise: 0.02 } },
        { content: '打球赢了一局', delta: { joy: 0.05, triumph: 0.04 } },
        { content: '运动后感觉神清气爽', delta: { calm: 0.04, satisfaction: 0.03 } },
      ],
      '咖啡店': [
        { content: '咖啡师拉花拉得很好看', delta: { interest: 0.03, calm: 0.02 } },
        { content: '咖啡店放的音乐很好听', delta: { calm: 0.04, contentment: 0.02 } },
      ],
      '便利店': [
        { content: '便利店来了限定零食', delta: { excitement: 0.03, interest: 0.02 } },
        { content: '有个客人很难缠', delta: { frustration: 0.04, anger: 0.02 } },
      ],
      '公园': [
        { content: '看到老人家在下棋', delta: { calm: 0.03, interest: 0.02 } },
        { content: '公园里的花开了', delta: { calm: 0.04, awe: 0.02 } },
      ],
      '家': [
        { content: '窝在沙发上看了会电视', delta: { calm: 0.03, contentment: 0.02 } },
        { content: '突然想起来小时候的事', delta: { calm: 0.02, loneliness: 0.02 } },
      ],
    };
    if (regionEvents[region]) {
      candidates.push(...regionEvents[region]);
    }

    // ─── 时间特定事件 ───
    const hour = context.hour || 12;
    if (hour >= 23 || hour < 5) {
      candidates.push(
        { content: '深夜刷到一条让人心酸的帖子', delta: { sadness: 0.04, loneliness: 0.03 } },
        { content: '深夜突然很想吃宵夜', delta: { desire: 0.03, boredom: 0.02 } },
        { content: '凌晨了还没睡，思绪万千', delta: { loneliness: 0.03, calm: 0.02 } },
        { content: '深夜突然感到一种空虚感', delta: { loneliness: 0.04, sadness: 0.02 } },
      );
    } else if (hour >= 5 && hour < 8) {
      candidates.push(
        { content: '早起看到日出了', delta: { calm: 0.04, awe: 0.03 } },
        { content: '清晨的空气很清新', delta: { calm: 0.03, contentment: 0.02 } },
      );
    } else if (hour >= 17 && hour < 20) {
      candidates.push(
        { content: '傍晚的夕阳很美', delta: { calm: 0.04, awe: 0.03 } },
        { content: '下班/放学高峰期人很多', delta: { frustration: 0.02 } },
      );
    }

    // ─── 天气特定事件 ───
    const weather = context.weather;
    if (weather === 'rain') {
      candidates.push(
        { content: '没带伞被淋湿了', delta: { frustration: 0.05, sadness: 0.02 } },
        { content: '听着雨声发了一会呆', delta: { calm: 0.04, boredom: 0.02 } },
      );
    } else if (weather === 'sunny') {
      candidates.push(
        { content: '阳光正好，心情也好了', delta: { joy: 0.04, calm: 0.02 } },
        { content: '太阳太晒了，有点烦躁', delta: { frustration: 0.02 } },
      );
    }

    // 去重
    const recent = this._recentContentByAgent.get(agentId) || [];
    const available = candidates.filter(e => !recent.includes(e.content));
    if (available.length === 0) return null;

    const chosen = available[Math.floor(Math.random() * available.length)];

    // 更新去重缓冲
    const updatedRecent = [...recent, chosen.content].slice(-8);
    this._recentContentByAgent.set(agentId, updatedRecent);

    return this.createEvent({
      type: 'random',
      scope: 'local',
      participants: [agentId],
      content: chosen.content,
      effects: [
        { target: agentId, type: 'emotion', delta: chosen.delta },
      ],
    });
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
    while (cutoffIdx < this.eventLog.length && this.eventLog[cutoffIdx].time.getTime() < cutoff) {
      cutoffIdx++;
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
    const cats = SEMANTIC_EVENT_CATEGORIES;

    // 1. 基于事件类型的直接映射
    if (type && cats.typeMap[type]) {
      return cats.typeMap[type];
    }

    // 2. 基于内容关键词的分类
    const text = (content || '').toLowerCase();
    if (text) {
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
