/**
 * AndyEngine — 多智能体社会模拟引擎
 *
 * 离散时间步进的多智能体社会模拟引擎。
 * 每个角色由 6 个心理学模块驱动：人格、情绪、需求、评价、记忆、社交。
 * 角色在共享世界中按时间步长自主演化，产生可解释的行为和事件。
 *
 * @example 5 分钟快速上手
 *   const { AndyEngine } = require('andy-engine');
 *
 *   const engine = new AndyEngine();
 *   engine.createCharacter({ id: 'alice', name: '小爱', mbti: 'ENFJ' });
 *
 *   // 推进模拟
 *   engine.tick();
 *
 *   // 获取角色内心叙事（注入 LLM 的 system prompt）
 *   const narrative = engine.getNarrative('alice', {
 *     userText: '今天跟老板吵架了',
 *     relationship: 60,
 *   });
 *   // → "你最近心情不太好，昨晚失眠了。听到对方跟老板吵架，你有些担心……"
 */

const AndyWorld = require('./core/World');
const Simulator = require('./core/Simulator');
const Agent = require('./agent/Agent');
const Schedule = require('./agent/Schedule');
const { ANDY_DEFAULTS } = require('./config/defaults');
const { validateConfig, validateAgentConfig } = require('./config/validate');

// ═══════════════════════════════════════════
// 种子记忆 → 文本
// ═══════════════════════════════════════════

/**
 * 将简写背景文本转为种子记忆对象
 * @private
 */
function backgroundToMemories(background) {
  if (!background || !Array.isArray(background)) return [];
  return background.map((text, i) => ({
    content: text,
    category: 'background',
    importance: Math.max(0.5, 1.0 - i * 0.05),
    emotionTag: 'neutral',
  }));
}

class AndyEngine {
  /**
   * @param {Object} [config]
   * @param {Date}   [config.startTime] - 初始模拟时间（默认当前）
   * @param {string} [config.weather]   - 初始天气（默认 'sunny'）
   * @param {Object} [savedState]       - 从持久化恢复的世界状态
   */
  constructor(config = {}, savedState = null) {
    validateConfig(config);

    this.config = { ...ANDY_DEFAULTS, ...config };
    this.world = new AndyWorld(config, savedState);
    this.simulator = new Simulator(this.world);

    // 恢复已保存的 Agent
    if (savedState && savedState.agents) {
      for (const [agentId, agentData] of Object.entries(savedState.agents)) {
        const agent = new Agent(
          { id: agentId, name: agentData.name || agentId, schedule: {} },
          agentData
        );
        this.world.addAgent(agent);
      }
    }
  }

  // ═══════════════════════════════════════════
  // 角色管理（高级 API）
  // ═══════════════════════════════════════════

  /**
   * 创建角色 — 一行代码创建一个有灵魂的角色
   *
   * @param {Object} config
   * @param {string}   config.id         - 唯一 ID
   * @param {string}   config.name       - 角色名
   * @param {string}   [config.mbti]     - MBTI 类型，如 'INFP'、'ENTJ'
   * @param {Object}   [config.personality] - 完整人格配置（与 mbti 二选一）
   * @param {string[]} [config.background]  - 背景文本数组，自动转为种子记忆
   * @param {Object[]} [config.seedMemories] - 完整种子记忆（与 background 二选一）
   * @param {string|Object} [config.schedule] - 日程预设名或配置对象
   *   预设: 'student' | 'worker' | 'freelancer' | 'home'
   * @param {string}   [config.initialPosition] - 初始位置
   * @param {string}   [config.initialState]    - 初始状态
   * @returns {Agent}
   *
   * @example
   *   engine.createCharacter({
   *     id: 'alice',
   *     name: '小爱',
   *     mbti: 'ENFJ',
   *     background: ['是一名心理咨询师', '喜欢瑜伽', '养了一只猫叫豆豆'],
   *     schedule: 'worker',
   *   });
   */
  createCharacter(config) {
    const { id, name, mbti, personality, background, seedMemories, schedule, initialPosition, initialState } = config;

    if (!id) throw new Error('createCharacter: id 是必需的');
    if (!name) throw new Error('createCharacter: name 是必需的');

    // 解析人格
    const personalityConfig = { ...(personality || {}) };
    if (mbti && !personalityConfig.mbti) {
      personalityConfig.mbti = mbti;
    }

    // 解析种子记忆（background 是简写）
    const memories = seedMemories || backgroundToMemories(background);

    // 解析日程（支持预设名）
    const scheduleConfig = typeof schedule === 'string'
      ? Schedule.resolvePreset(schedule).toJSON()
      : (schedule || {});

    const agent = new Agent({
      id,
      name,
      personality: personalityConfig,
      schedule: scheduleConfig,
      seedMemories: memories,
      initialPosition: initialPosition || '宿舍',
      initialState,
    });

    this.world.addAgent(agent);
    return agent;
  }

  // ═══════════════════════════════════════════
  // 角色管理（底层 API）
  // ═══════════════════════════════════════════

  /**
   * 添加 Agent（底层接口，需要完整 config）
   * @param {Object} config
   * @returns {Agent}
   */
  addAgent(config) {
    validateAgentConfig(config);
    const agent = new Agent(config);
    this.world.addAgent(agent);
    return agent;
  }

  /**
   * 批量添加 Agent
   * @param {Object[]} configs
   * @returns {Agent[]}
   */
  addAgents(configs) {
    return configs.map(config => this.addAgent(config));
  }

  /**
   * 获取 Agent
   * @param {string} agentId
   * @returns {Agent|undefined}
   */
  getAgent(agentId) {
    return this.world.getAgent(agentId);
  }

  /**
   * 获取所有 Agent
   * @returns {Agent[]}
   */
  getAllAgents() {
    return this.world.getAllAgents();
  }

  // ═══════════════════════════════════════════
  // 内心叙事（核心 API）
  // ═══════════════════════════════════════════

  /**
   * 获取角色内心叙事
   *
   * 从 6 个心理学子系统提取关键信号，合成为 60-120 字的连贯叙事。
   * 可选传入用户消息，引擎会临时模拟角色对用户情绪的共情反应后再生成叙事。
   *
   * @param {string} agentId
   * @param {Object} [options]
   * @param {string} [options.userText]     - 用户当前消息（触发共情反应）
   * @param {number} [options.relationship]  - 与用户的关系强度 0-100（影响共情深度）
   * @returns {string} 叙事文本，失败时返回空字符串
   *
   * @example
   *   // 基础用法：获取角色当前内心状态
   *   const text = engine.getNarrative('alice');
   *
   *   // 带共情：角色感知到用户情绪后的内心状态
   *   const text = engine.getNarrative('alice', {
   *     userText: '今天被裁员了',
   *     relationship: 80,
   *   });
   */
  getNarrative(agentId, options = {}) {
    const agent = this.world.getAgent(agentId);
    if (!agent) return '';

    const { userText, relationship = 0 } = options;

    // 如果有用户消息，做一次关系感知的共情反应
    let emotionBackup = null;
    if (userText) {
      try {
        const { EmotionEffectClassifier } = require('./core/EmotionEffectClassifier');
        const rawEffect = EmotionEffectClassifier.classify(userText);
        if (rawEffect && Object.keys(rawEffect).length > 0) {
          const empathyScale = AndyEngine._computeEmpathy(agent, relationship);
          if (empathyScale > 0.05) {
            emotionBackup = { ...agent.emotion.current };
            agent.emotion.applyEffect(rawEffect, empathyScale);
          }
        }
      } catch (e) {
        // 分类失败不影响叙事生成
      }
    }

    let narrative = '';
    try {
      narrative = agent.toNarrative();
    } catch (e) {
      narrative = '';
    }

    // 还原情绪（共情是临时的）
    if (emotionBackup) {
      Object.assign(agent.emotion.current, emotionBackup);
    }

    return narrative;
  }

  /**
   * 计算共情系数
   *
   * 角色对用户情绪的反应强度 = 关系 × 人格 × 状态
   *
   * - 关系（0-100 → 0-1）：陌生人几乎不受影响，亲密的人明显共情
   * - 人格（宜人性）：高宜人性更容易共情
   * - 状态（社交能量/情绪/精力）：自顾不暇时共情能力下降
   *
   * @param {Agent} agent
   * @param {number} relationship - 关系强度 0-100
   * @returns {number} 共情系数 0-1
   * @private
   */
  static _computeEmpathy(agent, relationship) {
    // 关系因子：sigmoid 曲线，中间段变化最快
    const relationshipFactor = 1 / (1 + Math.exp(-(relationship - 25) / 15));

    // 人格因子：宜人性直接影响共情
    const personalityFactor = agent.personality
      ? agent.personality.ocean.agreeableness
      : 0.5;

    // 状态因子：自顾不暇时没精力共情
    let stateFactor = 1.0;
    if (agent.socialEnergy < 0.3) stateFactor *= 0.5;
    if (agent.emotion && agent.emotion.getValence() < -0.15) stateFactor *= 0.6;
    if (agent.needs && agent.needs.needs.energy < 0.3) stateFactor *= 0.7;

    return Math.min(1, relationshipFactor * personalityFactor * stateFactor);
  }

  // ═══════════════════════════════════════════
  // 世界上下文（通用 API）
  // ═══════════════════════════════════════════

  /**
   * 获取角色的完整世界上下文
   *
   * 返回角色当前可感知的所有信息：事件、附近的人、情绪、需求、记忆等。
   * 可直接注入 LLM 的 system prompt。
   *
   * @param {string} agentId
   * @returns {Object|null} 上下文对象，角色不存在时返回 null
   *
   * @example
   *   const ctx = engine.getWorldContext('alice');
   *   // ctx.time, ctx.weather, ctx.emotionState, ctx.recentEvents, ...
   */
  getWorldContext(agentId) {
    const agent = this.world.getAgent(agentId);
    if (!agent) return null;

    // 最近可感知事件
    const recentEvents = this.world.eventDispatcher.eventLog.slice(-20);
    const perceivedEvents = this.world.eventDispatcher.filterEventsForAgent(
      agentId, recentEvents
    );
    const eventTexts = perceivedEvents
      .filter(e => e.content)
      .map(e => `- ${e.content}`)
      .join('\n');

    // 附近的人（含关系摘要）
    const neighbors = this.world.regions.getNeighbors(agentId, 0);
    const nearbyPeople = neighbors
      .map(id => {
        const a = this.world.getAgent(id);
        if (!a) return null;
        const rel = this.world.socialGraph.getRelationship(agentId, id);
        if (rel && rel.strength > 0.05) {
          const typeNames = { closeFriend: '亲密朋友', friend: '朋友', acquaintance: '认识的人', stranger: '陌生人' };
          const typeName = typeNames[rel.type] || '认识的人';
          const historyNote = rel.history.length > 0
            ? `，最近互动：${rel.history[rel.history.length - 1].content || rel.type}`
            : '';
          const conflictNote = rel.impression.negative > rel.impression.positive * 0.5
            ? '，有些摩擦' : '';
          return `${a.name}（${typeName}，关系强度${rel.strength.toFixed(2)}${conflictNote}${historyNote}）`;
        }
        return `${a.name}（陌生人）`;
      })
      .filter(Boolean)
      .join('\n');

    // 最近事件的评价摘要
    let lastAppraisal = '';
    const recentMemories = agent.memory.memories;
    if (recentMemories && recentMemories.length > 0) {
      for (let i = recentMemories.length - 1; i >= Math.max(0, recentMemories.length - 10); i--) {
        const mem = recentMemories[i];
        if (mem && mem.appraisal) {
          const ad = mem.appraisal;
          const parts = [];
          if (ad.valence !== undefined) {
            parts.push(ad.valence > 0.2 ? '令人愉快' : ad.valence < -0.2 ? '令人不快' : '中性');
          }
          if (ad.goalRelevance !== undefined && ad.goalRelevance > 0.4) {
            parts.push('高度相关');
          }
          if (ad.agency !== undefined) {
            if (ad.agency === 'other') parts.push('别人造成的');
            else if (ad.agency === 'self') parts.push('自己造成的');
            else if (ad.agency === 'chance') parts.push('偶然的');
            else parts.push('环境因素');
          }
          if (parts.length > 0) {
            lastAppraisal = `对最近的事(${(mem.content || '未知').substring(0, 15)})的感受：${parts.join('，')}`;
          }
          break;
        }
      }
    }

    return {
      time: this.world.time.toISOString(),
      hour: this.world.time.getHours(),
      dayOfWeek: this.world.time.getDay(),
      weather: this.world.environment.weather,
      timeOfDay: this.world.environment.timeOfDay,
      season: this.world.environment.season,
      currentRegion: agent.position,
      personalityAnchor: agent.personality ? agent.personality.toPromptString() : '',
      agentStatus: agent.getStatus(),
      recentEvents: eventTexts || '没有特别的事情发生',
      lastAppraisal,
      nearbyPeople: nearbyPeople || '附近没有人',
      emotionState: agent.emotion.toPromptString(),
      needsState: agent.needs ? agent.needs.toPromptString() : '',
      emotionRegulation: agent.emotionRegulation ? agent.emotionRegulation.toPromptString() : '',
      memoryContext: agent.memory.toPromptString(5),
      health: Math.round((agent.health || 1) * 100),
    };
  }

  // ═══════════════════════════════════════════
  // 模拟控制
  // ═══════════════════════════════════════════

  /**
   * 执行一个 tick
   * @returns {Object} tick 结果
   */
  tick() {
    return this.simulator.tick();
  }

  /**
   * 执行多个 tick
   * @param {number} count
   * @returns {Object[]}
   */
  runTicks(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(this.tick());
    }
    return results;
  }

  /**
   * 推进到指定时间
   * @param {Date} targetTime
   * @param {number} [maxTicks=10000]
   * @returns {Object[]}
   */
  advanceTo(targetTime, maxTicks = 10000) {
    const results = [];
    let count = 0;
    while (this.world.time < targetTime && count < maxTicks) {
      results.push(this.tick());
      count++;
    }
    return results;
  }

  // ═══════════════════════════════════════════
  // 查询和调试
  // ═══════════════════════════════════════════

  /**
   * 获取世界状态快照
   */
  snapshot() {
    return this.world.snapshot();
  }

  /**
   * 获取引擎统计信息
   */
  getStats() {
    return {
      ...this.simulator.getStats(),
      worldTime: this.world.time.toISOString(),
      environment: { ...this.world.environment },
    };
  }

  /**
   * 注册 tick 回调
   * @param {Function} callback
   */
  onTick(callback) {
    this.simulator.onTick(callback);
  }

  /**
   * 设置天气
   * @param {string} weather
   */
  setWeather(weather) {
    this.world.setWeather(weather);
  }

  /**
   * 获取社交图谱
   */
  getSocialGraph() {
    return this.world.socialGraph;
  }

  /**
   * 序列化完整状态（用于持久化）
   */
  toJSON() {
    return this.world.toJSON();
  }

  /**
   * 从 JSON 恢复引擎
   * @param {Object} data
   * @param {Object} config
   * @returns {AndyEngine}
   */
  static fromJSON(data, config = {}) {
    return new AndyEngine(config, data);
  }
}

module.exports = AndyEngine;
