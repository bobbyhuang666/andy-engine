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

const AndyWorld = require('./src/runtime/AndyWorld');
const Agent = require('./agent/Agent');
const { ANDY_DEFAULTS } = require('./src/config/defaults');
const { validateConfig, validateAgentConfig } = require('./src/config/validate');
const { DomainRegistry } = require('./src/domain/DomainRegistry');
const { validateDomain } = require('./src/domain/validateDomain');
const { RNG } = require('./src/shared/rng');
const FactProvider = require('./src/narrative/FactProvider');
const FactConsistencyChecker = require('./src/narrative/FactConsistencyChecker');
const Schedule = require('./src/agent/schedule/Schedule');
const {
  backgroundToMemories,
  buildNarrative,
  buildWorldContext,
} = require('./src/sdk/AndyEngineHelpers');

class AndyEngine {
  /**
   * @param {Object} [config]
   * @param {Date}   [config.startTime] - 初始模拟时间（默认当前）
   * @param {string} [config.weather]   - 初始天气（默认 'sunny'）
   * @param {Object} [config.domain]    - 自定义 domain 配置（默认 campus）
   * @param {string|number} [config.seed] - 可播种 RNG 种子（可选）
   * @param {Object} [config.rng]       - 预构建的 RNG 实例（可选，优先于 seed）
   * @param {Object} [savedState]       - 从持久化恢复的世界状态
   */
  constructor(config = {}, savedState = null) {
    validateConfig(config);

    // 初始化 RNG
    if (config.rng) {
      this.rng = config.rng;
    } else if (config.seed !== undefined) {
      this.rng = new RNG(config.seed);
    } else if (savedState && savedState.rngState !== undefined) {
      // 从 savedState 恢复 RNG（无需 seed）
      this.rng = new RNG(0);
      this.rng.setState(savedState.rngState);
    } else {
      this.rng = null; // 回退到 Math.random
    }

    // 初始化 domain
    if (config.domain) {
      // 校验 custom domain，抛出包含字段路径的错误
      const result = validateDomain(config.domain, { strict: false, throwOnError: false });
      if (!result.valid) {
        const errorMessages = result.errors.map(e => e.path ? `${e.path}: ${e.message}` : e.message);
        throw new Error(`Invalid domain config: ${errorMessages.join('; ')}`);
      }
      this.domain = new DomainRegistry(config.domain, { validate: false });
    } else {
      this.domain = new DomainRegistry();
    }

    this.config = {
      ...ANDY_DEFAULTS,
      ...config,
      enableFacts: config.enableFacts ?? false,
      actionSelection: {
        ...ANDY_DEFAULTS.actionSelection,
        ...(config.actionSelection || {}),
      },
    };
    this.world = new AndyWorld({ ...config, enableFacts: this.config.enableFacts }, savedState, this.domain, this.rng);

    // 恢复已保存的 Agent
    if (savedState && savedState.agents) {
      for (const [agentId, agentData] of Object.entries(savedState.agents)) {
        const agent = new Agent(
          { id: agentId, name: agentData.name || agentId, schedule: agentData.schedule || {}, domain: this.domain, rng: this.rng, actionSelection: this.config.actionSelection, factStore: this.world.factStore || null },
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
    let scheduleConfig;
    if (typeof schedule === 'string') {
      // 先查 domain 的 roleArchetypes
      const archetype = this.domain.roleArchetypes[schedule];
      if (archetype) {
        // 直接使用 archetype 构造 Schedule，不走 resolvePreset
        scheduleConfig = new Schedule(archetype).toJSON();
      } else if (this.domain.id === 'campus') {
        // 只有 campus domain 才 fallback 到旧 preset
        scheduleConfig = Schedule.resolvePreset(schedule).toJSON();
      } else {
        // custom domain 找不到时使用空 schedule，不 fallback 到 campus
        scheduleConfig = {};
      }
    } else {
      scheduleConfig = schedule || {};
    }

    const agent = new Agent({
      id,
      name,
      personality: personalityConfig,
      schedule: scheduleConfig,
      seedMemories: memories,
      initialPosition: initialPosition || this.domain.fallback.defaultRegion,
      initialState,
      domain: this.domain,
      rng: this.rng,
      actionSelection: this.config.actionSelection,
      factStore: this.world.factStore || null,
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
    const agent = new Agent({ ...config, domain: this.domain, rng: this.rng, actionSelection: this.config.actionSelection, factStore: this.world.factStore || null });
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
    return buildNarrative(agent, options);
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
    return buildWorldContext(this, agent, agentId);
  }

  // ═══════════════════════════════════════════
  // 事实系统
  // ═══════════════════════════════════════════

  /**
   * 获取角色的 grounding package
   *
   * @param {string} agentId
   * @param {Object} [options]
   * @param {Date} [options.time] - 当前时间
   * @param {string} [options.topic] - 当前话题
   * @param {number} [options.maxFacts] - 最大事实数
   * @returns {Object|null} groundingPackage，如果未启用事实系统则返回 null
   */
  getGroundingPackage(agentId, options = {}) {
    if (!this.world.factStore) return null;

    const agent = this.world.getAgent(agentId);
    const provider = new FactProvider(
      this.world.factStore,
      this.world.socialGraph,
      null,  // personalMemories 暂时不传
      this.world.knowledgeStore
    );

    return provider.getGroundingPackage(agentId, {
      time: this.world.time,
      ...options,
      currentRegion: options.currentRegion || (agent ? agent.position : null),
      agent,
    });
  }

  /**
   * 校验 LLM 输出是否与世界事实一致
   *
   * @param {string} llmOutput - LLM 生成的文本
   * @param {string} agentId - 角色 ID
   * @returns {Object} { valid, violations, severity, suggestion }
   */
  checkConsistency(llmOutput, agentId) {
    if (!this.world.factStore) {
      return { valid: true, violations: [], severity: 'pass', suggestion: null };
    }

    const grounding = this.getGroundingPackage(agentId);
    const checker = new FactConsistencyChecker(this.world.factStore, this.domain);
    return checker.check(llmOutput, grounding);
  }

  // ═══════════════════════════════════════════
  // 模拟控制
  // ═══════════════════════════════════════════

  /**
   * 执行一个 tick
   * @returns {Object} tick 结果
   */
  tick() {
    return this.world.step();
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
      ...this.world.getStats(),
      worldTime: this.world.time.toISOString(),
      environment: { ...this.world.environment },
    };
  }

  /**
   * 注册 tick 回调
   * @param {Function} callback
   */
  onTick(callback) {
    this.world.onTick(callback);
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
   * Legacy compatibility snapshot.
   * Retained for public compatibility.
   * Recommended persistence path: engine.snapshot() + WorldStateAdapter
   */
  toJSON() {
    return this.world.toJSON();
  }

  /**
   * Legacy compatibility restore.
   * Retained for public compatibility.
   * Recommended persistence path: WorldStateAdapter.fromWorldState()
   * @param {Object} data
   * @param {Object} config
   * @returns {AndyEngine}
   */
  static fromJSON(data, config = {}) {
    return new AndyEngine(config, data);
  }
}

module.exports = AndyEngine;
