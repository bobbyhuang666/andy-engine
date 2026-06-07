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
 *     backstory: ['一个安静的图书馆管理员', '喜欢看星星'],
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

const AndyEngine = require('../index');
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
      });
      this._ownsEngine = true;
    }

    // 创建角色
    this._agent = this._engine.createCharacter({
      id: this.id,
      name: this.name,
      mbti: config.personality,
      personality: config.ocean ? { ocean: config.ocean } : undefined,
      background: this.backstory,
      schedule: config.schedule || 'student',
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
    // 1. 自动推进时间
    this._autoTick.advance(this._engine);

    // 2. 记录用户消息
    this._conversation.addUserMessage(message);

    // 3. 构建 system prompt
    const worldContext = this._engine.getWorldContext(this.id);
    const systemPrompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: this.name,
      backstory: this.backstory,
      scenario: this.scenario,
      conversationHistory: this._conversation.getSummary(),
    });

    // 4. 构建 messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this._conversation.toMessages(),
    ];

    // 5. 调用 LLM
    const llm = options.llm ? new LLMAdapter(options.llm) : this._llm;
    const reply = await llm.chat(messages);
    if (!reply || reply.trim().length === 0) {
      return "...";
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
  getContext(options = {}) {
    const worldContext = this._engine.getWorldContext(this.id);
    const narrative = this._engine.getNarrative(this.id, options);

    return {
      systemPrompt: NarrativeBuilder.buildSystemPrompt(worldContext, {
        characterName: this.name,
        backstory: this.backstory,
        scenario: this.scenario,
        conversationHistory: this._conversation.getSummary(),
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
    return {
      version: 1,
      id: this.id,
      name: this.name,
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
   * @param {Object} [llmConfig] - LLM 配置
   * @returns {Character}
   */
  static load(state, llmConfig = {}) {
    const engine = AndyEngine.fromJSON(state.engineState);
    const character = new Character({
      id: state.id,
      name: state.name,
      backstory: state.backstory,
      scenario: state.scenario,
      llm: llmConfig,
      engine,
    });
    character._conversation = ConversationLog.fromJSON(state.conversation);
    character._autoTick = AutoTick.fromJSON(state.autoTick);
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
      if (!agent || !agent.memory) return;

      // 用户说的话
      agent.memory.addExperience({
        content: `对方说："${userMsg.substring(0, 50)}"`,
        category: 'social',
        emotionTag: 'neutral',
        importance: 0.6,
      }, agent.emotion);

      // 自己的回复
      agent.memory.addExperience({
        content: `我说了："${agentReply.substring(0, 50)}"`,
        category: 'social',
        emotionTag: 'neutral',
        importance: 0.5,
      }, agent.emotion);
    } catch (e) {
      // 记忆失败不影响对话
    }
  }
}

module.exports = Character;
