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
const { diagnostics } = require('./src/shared/Diagnostics');
const FactProvider = require('./src/narrative/FactProvider');
const FactConsistencyChecker = require('./src/narrative/FactConsistencyChecker');
const Schedule = require('./src/agent/schedule/Schedule');
const {
  backgroundToMemories,
  buildNarrative,
  buildWorldContext,
} = require('./src/sdk/AndyEngineHelpers');
const { compile } = require('./src/agent/psychology/AffectCompiler');

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
    if (config === null) {
      throw new Error('AndyEngine: config must be an object, got null. Use {} for defaults.');
    }
    if (typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`AndyEngine: config must be an object, got ${Array.isArray(config) ? 'array' : typeof config}. Use {} for defaults.`);
    }
    validateConfig(config);

    // 初始化 RNG
    if (config.rng) {
      if (typeof config.rng.next !== 'function') {
        throw new Error('AndyEngine: config.rng must be an RNG instance with a .next() method.');
      }
      this.rng = config.rng;
    } else if (config.seed !== undefined) {
      this.rng = new RNG(config.seed);
    } else if (savedState && savedState.rngState !== undefined) {
      // 从 savedState 恢复 RNG（无需 seed）
      this.rng = new RNG(0);
      this.rng.setState(savedState.rngState);
    } else {
      this.rng = null; // 回退到 Math.random（world 内部恒持自动种子 RNG）
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
    } else if (savedState && savedState.domain) {
      // R144: restore domain from serialized state for round-trip fidelity
      this.domain = new DomainRegistry(savedState.domain, { validate: false });
    } else {
      const campusDomain = require('./presets/campus');
      this.domain = new DomainRegistry(campusDomain, { validate: false });
    }

    // R138 P0 fix: deep-clone ANDY_DEFAULTS to prevent nested object mutation
    // from leaking across engine instances. Shallow spread shares nested refs.
    const clonedDefaults = JSON.parse(JSON.stringify(ANDY_DEFAULTS));
    this.config = {
      ...clonedDefaults,
      // R41 fix: merge _restoreConfig BEFORE building this.config so that
      // restored values (enableFacts, needs, etc.) flow into both engine.config
      // and the subsystem constructor chain.  Do NOT mutate savedState.
      ...(savedState?._restoreConfig || {}),
      ...config,
      weather: config.weather ?? savedState?._restoreConfig?.weather ?? savedState?.environment?.weather ?? 'sunny',
      // P1-2 fix: explicit config > _restoreConfig > default(false).
      // Previously `config.enableFacts ?? false` silently overrode a
      // _restoreConfig.enableFacts=true when the caller passed an explicit
      // config object without enableFacts, dropping the factStore on restore.
      enableFacts: config.enableFacts ?? savedState?._restoreConfig?.enableFacts ?? false,
      actionSelection: {
        ...ANDY_DEFAULTS.actionSelection,
        ...(savedState?._restoreConfig?.actionSelection || {}),
        ...(config.actionSelection || {}),
      },
    };
    const restoredConfig = savedState?._restoreConfig || {};
    const worldConfig = {
      ...restoredConfig,
      ...config,
      enableFacts: this.config.enableFacts,
      weather: this.config.weather,
    };
    if (config.actionSelection || restoredConfig.actionSelection) {
      worldConfig.actionSelection = this.config.actionSelection;
    }
    this.world = new AndyWorld(worldConfig, savedState, this.domain, this.rng);

    // 恢复已保存的 Agent
    if (savedState && savedState.agents) {
      for (const [agentId, agentData] of Object.entries(savedState.agents)) {
        const agent = new Agent(
          {
            id: agentId,
            name: agentData.name || agentId,
            schedule: agentData.schedule || {},
            domain: this.domain,
            rng: this.rng,
            actionSelection: this.config.actionSelection,
            factStore: this.world.factStore || null,
            ...this._agentSubsystemConfig(),
          },
          agentData
        );
        this.world.addAgent(agent);
      }
    }
  }

  /**
   * Agent subsystem config follows priority: per-agent override > engine config > defaults.
   * Subsystem constructors own the default merge, so partial objects are safe here.
   * @private
   */
  _agentSubsystemConfig(agentConfig = {}) {
    const pick = (key) => Object.prototype.hasOwnProperty.call(agentConfig, key)
      ? agentConfig[key]
      : this.config[key];
    return {
      emotion: pick('emotion'),
      contagion: pick('contagion'),
      memory: pick('memory'),
      needs: pick('needs'),
      intrinsicMotivation: pick('intrinsicMotivation'),
      behavior: pick('behavior'),
      mindWander: pick('mindWander'),
    };
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
    // 传入 simTime 作为 seed-memory timestamp,消除 Date.now() wall-clock 依赖
    // (见 docs/rfc/SEED_MEMORY_DETERMINISM_RFC.md 方案 B)
    const memories = seedMemories || backgroundToMemories(background, this.world.clock.time);

    // 解析日程（支持预设名）
    let scheduleConfig;
    if (typeof schedule === 'string') {
      // R13 fix: archetype 有三种形态：
      //   1. 含 entries 的完整日程（如 tavern blacksmith）→ 直接使用
      //   2. 只有配置参数 + scheduleFactories（如 campus student）→ 通过 factory 生成
      //   3. 只有配置参数无 factory → campus fallback 或空 schedule
      const archetype = this.domain.roleArchetypes[schedule];
      const factory = this.domain.scheduleFactories && this.domain.scheduleFactories[schedule];
      if (archetype && archetype.entries && archetype.entries.length > 0) {
        // Archetype 自带完整 entries（如 tavern），直接使用
        scheduleConfig = archetype;
      } else if (factory) {
        // 有 factory 时用 factory + archetype 配置生成日程
        scheduleConfig = factory(archetype || {}).toJSON();
      } else if (this.domain.id === 'campus') {
        // campus domain fallback:由 preset 模块解析 campus 预设名(core 不内置 campus role 名)
        const campusSchedules = require('./presets/campus/schedules');
        const campusFactory = {
          student: campusSchedules.createStudentSchedule,
          worker: campusSchedules.createWorkerSchedule,
          freelancer: campusSchedules.createFreelancerSchedule,
          home: campusSchedules.createHomeSchedule,
        }[schedule];
        scheduleConfig = campusFactory ? campusFactory(archetype || {}).toJSON() : {};
      } else {
        // custom domain 找不到时使用空 schedule，不 fallback 到 campus
        scheduleConfig = {};
      }
    } else {
      scheduleConfig = schedule || {};
    }

    // R12: validate duplicate ID BEFORE constructing Agent (avoids wasted resources)
    if (this.world.getAgent(config.id)) {
      throw new Error(`createCharacter: character "${config.id}" already exists. Use a unique ID.`);
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
      ...this._agentSubsystemConfig(config),
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
    const agent = new Agent({
      ...config,
      domain: this.domain,
      rng: this.rng,
      actionSelection: this.config.actionSelection,
      factStore: this.world.factStore || null,
      ...this._agentSubsystemConfig(config),
    });
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
  getNarrative(agentId, options) {
    options = options ?? {};
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
    const affectFrame = compile({
      emotion: agent.emotion,
      needs: agent.needs,
      behaviorField: agent.behaviorField,
      socialGraph: agent.socialGraph,
      memory: agent.memory,
    });
    return buildWorldContext(this, agent, agentId, affectFrame);
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
  getGroundingPackage(agentId, options) {
    options = options ?? {};
    if (!this.world.factStore) return null;

    const agent = this.world.getAgent(agentId);
    if (!agent) return null;
    const provider = new FactProvider(
      this.world.factStore,
      this.world.socialGraph,
      null,  // personalMemories 暂时不传
      this.world.knowledgeStore
    );

    // R19: Build agentId→displayName mapping so consistency checker
    // can match Chinese names (e.g. "鲍勃") in LLM output.
    const agentNames = {};
    for (const [id, a] of this.world.agents) {
      if (a.name) agentNames[id] = a.name;
    }

    const grounding = provider.getGroundingPackage(agentId, {
      time: this.world.time,
      ...options,
      currentRegion: options.currentRegion || (agent ? agent.position : null),
      agent,
      agentNames,
    });

    if (agent) {
      grounding.affectFrame = compile({
        emotion: agent.emotion,
        needs: agent.needs,
        behaviorField: agent.behaviorField,
        socialGraph: agent.socialGraph,
        memory: agent.memory,
      });
    }

    return grounding;
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
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      throw new TypeError(`runTicks: count must be a non-negative integer, got ${count}`);
    }
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
   * @returns {Object[]} results array with `_completed` and `_ticksUsed` metadata
   */
  advanceTo(targetTime, maxTicks = 10000) {
    const results = [];
    let count = 0;
    while (this.world.time < targetTime && count < maxTicks) {
      results.push(this.tick());
      count++;
    }
    const completed = this.world.time >= targetTime;
    results._completed = completed;
    results._ticksUsed = count;
    if (!completed) {
      diagnostics.warn(
        `advanceTo() truncated: used ${count} ticks without reaching targetTime. ` +
        `Current time: ${this.world.time}, target: ${targetTime}`
      );
      diagnostics.collect({
        type: 'advanceTo_truncated',
        ticksUsed: count,
        maxTicks,
        currentTime: this.world.time,
        targetTime,
      });
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
    const env = this.world.environment;
    return {
      ...this.world.getStats(),
      worldTime: this.world.time.toISOString(),
      // R12: deep-copy weatherChangedAt to prevent shared Date reference
      environment: {
        ...env,
        weatherChangedAt: env.weatherChangedAt instanceof Date
          ? env.weatherChangedAt.toISOString()
          : env.weatherChangedAt,
      },
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
  /**
   * 从 JSON 恢复引擎实例
   *
   * R13 C3 fix: validate input data to prevent crashes from corrupted/empty payloads.
   * Without this, passing null/undefined/string would throw cryptic errors deep
   * in AndyWorld constructor instead of a clear message at the boundary.
   *
   * @param {Object} data - 之前 toJSON() 的输出
   * @param {Object} [config] - 可选配置覆盖
   * @returns {AndyEngine}
   * @throws {Error} on invalid or corrupted input data
   */
  static fromJSON(data, config = {}) {
    // R20 M15: throw on invalid input instead of returning null.
    // Returning null forced every caller to add null checks, and missing
    // checks produced confusing downstream TypeErrors. Throwing gives
    // immediate, clear feedback at the boundary.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('AndyEngine.fromJSON(): invalid input — expected a non-null object');
    }
    try {
      return new AndyEngine(config, data);
    } catch (e) {
      throw new Error(`AndyEngine.fromJSON(): reconstruction failed — ${e.message}`);
    }
  }
}

module.exports = AndyEngine;
