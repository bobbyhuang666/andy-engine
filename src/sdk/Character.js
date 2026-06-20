/**
 * Character — 高层角色 API
 *
 * 隐藏引擎内部复杂度，提供简洁的角色交互接口。
 *
 * @example
 *   const { Character } = require('./sdk');
 *
 *   const maya = new Character({
 *     name: 'Maya',
 *     personality: 'INFP',
 *     backstory: ['一个安静的阅览处管理员', '喜欢看星星'],
 *     llm: { provider: 'openai', apiKey: 'sk-...' },
 *   });
 *
 *   // 一键对话
 *   const reply = await maya.chat('我今天好累');
 *
 *   // 获取角色内心状态（用于自定义 prompt）
 *   const context = maya.getContext();
 *
 *   // 保存/恢复
 *   const state = maya.save();
 *   const restored = Character.load(state);
 */

const AndyEngine = require('../../index');
const NarrativeBuilder = require('./NarrativeBuilder');
const LLMAdapter = require('./LLMAdapter');
const AutoTick = require('./AutoTick');
const ConversationLog = require('./ConversationLog');

class Character {
  /**
   * @param {Object} config
   * @param {string} config.name - 角色名
   * @param {string} [config.id] - 角色 ID（默认自动生成）
   * @param {string} [config.personality] - MBTI 类型，如 'INFP'
   * @param {Object} [config.ocean] - 直接指定大五人格
   * @param {string[]} [config.backstory] - 背景故事
   * @param {string|Object} [config.schedule] - 日程预设或配置
   * @param {string} [config.initialPosition] - 初始位置
   * @param {Object|string|Function} [config.llm] - LLM 配置
   * @param {string} [config.scenario] - 场景描述
   * @param {Object} [config.engine] - 共享的 AndyEngine 实例（多角色场景）
   */
  constructor(config = {}) {
    if (typeof config !== 'object' || config === null) {
      throw new Error('Character: config 必须是一个对象。用法: new Character({ name: "Maya", personality: "INFP", llm: ... })');
    }
    if (!config.name && !config.id) {
      throw new Error('Character: 至少需要 name 或 id。用法: new Character({ name: "Maya", llm: ... })');
    }

    this.id = config.id || `char_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.name = config.name || '角色';
    this.backstory = config.backstory || [];
    this.scenario = config.scenario || '';

    // 创建或复用引擎
    if (config.engine) {
      this._engine = config.engine;
      this._ownsEngine = false;
    } else {
      this._engine = new AndyEngine({
        startTime: config.startTime || new Date(),
        weather: config.weather || 'sunny',
        domain: config.domain,
        seed: config.seed,
        rng: config.rng,
      });
      this._ownsEngine = true;
    }

    // 创建角色
    // schedule 策略：如果未传，根据 engine domain 决定默认值
    // - campus domain: 默认 'student'
    // - 其他 domain: 使用 domain 的 roleArchetypes 或空 schedule
    let scheduleConfig = config.schedule;
    if (scheduleConfig === undefined) {
      const domain = this._engine.domain;
      if (domain.id === 'campus') {
        scheduleConfig = 'student';
      } else {
        // 尝试从 domain 的 roleArchetypes 取第一个，否则空 schedule
        const archetypes = Object.keys(domain.roleArchetypes || {});
        scheduleConfig = archetypes.length > 0 ? archetypes[0] : {};
      }
    }

    this._agent = this._engine.createCharacter({
      id: this.id,
      name: this.name,
      mbti: config.personality,
      personality: config.ocean ? { ocean: config.ocean } : undefined,
      background: this.backstory,
      schedule: scheduleConfig,
      initialPosition: config.initialPosition || undefined,
    });

    // LLM 适配器
    this._llm = new LLMAdapter(config.llm || {});

    // 自动 tick
    this._autoTick = new AutoTick(config.autoTick || {});

    // 对话历史
    this._conversation = new ConversationLog({
      characterName: this.name,
      maxMessages: config.maxMessages || 50,
    });

    // 首次 tick（初始化状态）
    this._engine.tick();
  }

  // ═══════════════════════════════════════════
  // 核心 API
  // ═══════════════════════════════════════════

  /**
   * 与角色对话
   *
   * 自动处理：
   *   1. 时间推进（根据距离上次消息的时间）
   *   2. 构建 system prompt（从角色状态）
   *   3. 调用 LLM
   *   4. 更新对话历史
   *   5. 角色记忆更新（对话内容被记住）
   *
   * @param {string} message - 用户消息
   * @param {Object} [options]
   * @param {Object} [options.llm] - 临时覆盖 LLM 配置
   * @param {number} [options.relationship] - 与角色的关系强度 0-100
   * @returns {Promise<string>} 角色回复
   */
  async chat(message, options = {}) {
    if (typeof message !== 'string' || message.trim().length === 0) {
      return '...';
    }

    // 1. 自动推进时间
    try {
      this._autoTick.advance(this._engine);
    } catch (e) {
      // 时间推进失败不应阻断对话
    }

    // 2. 记录用户消息
    this._conversation.addUserMessage(message);

    // 3. 构建 system prompt
    const worldContext = this._engine.getWorldContext(this.id);
    const groundingPackage = this._engine.getGroundingPackage
      ? this._engine.getGroundingPackage(this.id, {
          time: this._engine.world.time,
          topic: message,
        })
      : null;
    const systemPrompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: this.name,
      backstory: this.backstory,
      scenario: this.scenario,
      conversationHistory: this._conversation.getSummary(),
      domain: this._engine.domain,
      groundingPackage,
    });

    // 4. 构建 messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this._conversation.toMessages(),
    ];

    // 5. 调用 LLM
    let reply;
    try {
      const llm = options.llm ? new LLMAdapter(options.llm) : this._llm;
      reply = await llm.chat(messages);
    } catch (e) {
      throw new Error(`Character.chat() LLM 调用失败: ${e.message}`);
    }
    if (!reply || reply.trim().length === 0) {
      return "...";
    }

    // 5.5 一致性校验（如果启用事实系统）
    if (this._engine.checkConsistency) {
      const consistency = this._engine.checkConsistency(reply, this.id);
      if (!consistency.valid && consistency.severity === 'reject') {
        reply = `[${this.name}沉默了一会儿]`;
      }
    }

    // 6. 记录角色回复
    this._conversation.addAssistantMessage(reply);

    // 7. 更新角色记忆（把这次对话记为经历）
    this._recordConversation(message, reply);

    return reply;
  }

  /**
   * 获取角色当前状态（用于自定义 LLM 集成）
   *
   * @param {Object} [options]
   * @param {string} [options.userText] - 用户消息（用于共情反应）
   * @returns {Object} { systemPrompt, narrative, worldContext, emotion, needs }
   */

  /**
   * 流式对话（逐 token 产出，适合 Web 实时显示）
   *
   * @param {string} message - 用户消息
   * @param {Object} [options]
   * @returns {AsyncGenerator<string>} 逐 token 产出
   *
   * @example
   *   for await (const token of maya.chatStream("你好")) {
   *     process.stdout.write(token);
   *   }
   */
  async *chatStream(message, options = {}) {
    this._autoTick.advance(this._engine);
    this._conversation.addUserMessage(message);

    const worldContext = this._engine.getWorldContext(this.id);
    const groundingPackage = this._engine.getGroundingPackage
      ? this._engine.getGroundingPackage(this.id, {
          time: this._engine.world.time,
          topic: message,
        })
      : null;
    const systemPrompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: this.name,
      backstory: this.backstory,
      scenario: this.scenario,
      conversationHistory: this._conversation.getSummary(),
      domain: this._engine.domain,
      groundingPackage,
    });

    const messages = [
      { role: "system", content: systemPrompt },
      ...this._conversation.toMessages(),
    ];

    const llm = options.llm ? new LLMAdapter(options.llm) : this._llm;
    let fullReply = "";

    for await (const token of llm.chatStream(messages)) {
      fullReply += token;
      yield token;
    }

    if (fullReply.trim().length > 0) {
      this._conversation.addAssistantMessage(fullReply);
      this._recordConversation(message, fullReply);
    }
  }
  getContext(options = {}) {
    const worldContext = this._engine.getWorldContext(this.id);
    const narrative = this._engine.getNarrative(this.id, options);

    return {
      systemPrompt: NarrativeBuilder.buildSystemPrompt(worldContext, {
        characterName: this.name,
        backstory: this.backstory,
        scenario: this.scenario,
        conversationHistory: this._conversation.getSummary(),
        domain: this._engine.domain,
      }),
      narrative,
      worldContext,
      conversationHistory: this._conversation.toMessages(),
    };
  }

  /**
   * 获取角色的对话历史
   */
  getConversation() {
    return this._conversation;
  }

  // ═══════════════════════════════════════════
  // 状态管理
  // ═══════════════════════════════════════════

  /**
   * 保存角色完整状态
   * @returns {Object} 可序列化的状态对象
   */
  save() {
    if (!this._engine) {
      throw new Error('Character.save(): 引擎未初始化，无法保存');
    }
    return {
      version: 1,
      id: this.id,
      name: this.name,
      domainRef: this._engine.domain ? this._engine.domain.id : 'campus',
      backstory: this.backstory,
      scenario: this.scenario,
      engineState: this._engine.toJSON(),
      conversation: this._conversation.toJSON(),
      autoTick: this._autoTick.toJSON(),
    };
  }

  /**
   * 从保存的状态恢复角色
   * @param {Object} state - save() 返回的状态对象
   * @param {Object} [options] - 配置选项（可以为 llmConfig 或包含 domain/llm 的 options）
   * @returns {Character}
   */
  static load(state, options = {}) {
    if (!state || typeof state !== 'object') {
      throw new Error('Character.load(): state 必须是 save() 返回的对象');
    }
    if (!state.engineState) {
      throw new Error('Character.load(): state 缺少 engineState，是否用 save() 生成的？');
    }

    let domainConfig;
    let llmConfig;

    if (typeof options === 'function') {
      llmConfig = options;
    } else if (options && typeof options === 'object') {
      if ('domain' in options || 'llm' in options) {
        domainConfig = options.domain;
        llmConfig = options.llm;
      } else {
        llmConfig = options;
      }
    }

    const domainRef = state.domainRef || 'campus';
    if (domainRef !== 'campus') {
      if (!domainConfig) {
        throw new Error(`非 campus domain "${domainRef}" 必须在 load 时传入对应的 domain 配置`);
      }
      if (domainConfig.id !== domainRef) {
        throw new Error(`domain 不匹配：期望 "${domainRef}"，但传入了 "${domainConfig.id}"`);
      }
    }

    // 不走构造函数——构造函数会 createCharacter()（覆盖已恢复的 Agent）+ tick()（推进时间）
    // 手动组装实例，保留引擎中已恢复的 Agent 完整状态（情绪/记忆/关系/需求）
    const engine = AndyEngine.fromJSON(state.engineState, { domain: domainConfig });

    const character = Object.create(Character.prototype);
    character.id = state.id;
    character.name = state.name;
    character.backstory = state.backstory || [];
    character.scenario = state.scenario || '';
    character._engine = engine;
    character._ownsEngine = true;
    character._agent = engine.getAgent(state.id);
    character._llm = new LLMAdapter(llmConfig || {});
    character._autoTick = AutoTick.fromJSON(state.autoTick || {});
    character._conversation = ConversationLog.fromJSON(state.conversation);
    return character;
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /**
   * 将对话内容记录为角色记忆
   * @private
   */
  _recordConversation(userMsg, agentReply) {
    try {
      const agent = this._engine.world.getAgent(this.id);
      if (!agent || typeof agent.recordExternalExperience !== 'function') return;

      // 用户说的话
      agent.recordExternalExperience({
        content: `对方说："${userMsg.substring(0, 150)}"`,
        category: 'social',
        emotionTag: 'neutral',
        importance: 0.6,
      });

      // 自己的回复
      agent.recordExternalExperience({
        content: `我说了："${agentReply.substring(0, 150)}"`,
        category: 'social',
        emotionTag: 'neutral',
        importance: 0.5,
      });
    } catch (e) {
      // 记忆失败不影响对话
    }
  }
}

module.exports = Character;
