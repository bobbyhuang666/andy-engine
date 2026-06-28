/**
 * Andy — 多角色引擎包装
 *
 * 用于多角色共同生活的场景（AI Town、AI 社区等）。
 * 管理多个 Character 实例，共享同一个引擎。
 *
 * @example
 *   const { Andy } = require('./sdk');
 *
 *   const world = new Andy({ llm: { provider: 'openai', apiKey: 'sk-...' } });
 *
 *   world.addCharacter({ name: 'Maya', personality: 'INFP', backstory: ['阅览处管理员'] });
 *   world.addCharacter({ name: 'Bob', personality: 'ENTP', backstory: ['程序员'] });
 *
 *   // 与某个角色对话
 *   const reply = await world.chat('maya', '你好');
 *
 *   // 推进模拟（角色自主互动）
 *   world.tick();
 *
 *   // 获取所有角色状态
 *   const states = world.getStates();
 */

const AndyEngine = require('./AndyEngine');
const Character = require('./Character');
const { DEFAULT_DOMAIN_ID } = require('../config/defaults');

class Andy {
  /**
   * @param {Object} config
   * @param {Object} [config.llm] - 默认 LLM 配置
   * @param {Date} [config.startTime] - 模拟开始时间
   * @param {string} [config.weather] - 初始天气
   */
  constructor(config = {}) {
    if (typeof config !== 'object' || config === null) {
      throw new Error('Andy: config 必须是一个对象');
    }

    this._engine = new AndyEngine({
      startTime: config.startTime || new Date(),
      weather: config.weather || 'sunny',
      domain: config.domain,
      seed: config.seed,
      rng: config.rng,
    });
    this._characters = new Map();
    this._defaultLLM = config.llm || {};
  }

  /**
   * 添加角色
   *
   * @param {Object} config - Character 配置（不含 engine）
   * @returns {Character}
   */
  addCharacter(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Andy.addCharacter(): config 必须是对象');
    }
    if (!config.name) {
      throw new Error('Andy.addCharacter(): config.name 是必需的');
    }

    const id = config.id || `char_${this._characters.size}`;
    const character = new Character({
      ...config,
      id,
      llm: config.llm || this._defaultLLM,
      engine: this._engine,
    });
    this._characters.set(id, character);
    return character;
  }

  /**
   * 获取角色
   * @param {string} id
   * @returns {Character|undefined}
   */
  getCharacter(id) {
    return this._characters.get(id);
  }

  /**
   * 与指定角色对话
   *
   * @param {string} characterId
   * @param {string} message
   * @param {Object} [options]
   * @returns {Promise<string>}
   */
  async chat(characterId, message, options = {}) {
    if (!characterId) throw new Error('Andy.chat(): characterId 是必需的');
    const character = this._characters.get(characterId);
    if (!character) {
      const available = [...this._characters.keys()].join(', ') || '(无)';
      throw new Error(`Andy.chat(): 角色 "${characterId}" 不存在。可用角色: ${available}`);
    }
    return character.chat(message, options);
  }

  /**
   * 推进一个模拟 tick（所有角色自主演化）
   * @returns {Object} tick 结果
   */
  tick() {
    return this._engine.tick();
  }

  /**
   * 推进多个 tick
   * @param {number} count
   */
  runTicks(count) {
    return this._engine.runTicks(count);
  }

  /**
   * 获取所有角色状态
   * @returns {Object} { id: { name, emotion, needs, position, ... } }
   */
  getStates() {
    const states = {};
    for (const [id, character] of this._characters) {
      const ctx = this._engine.getWorldContext(id);
      states[id] = {
        name: character.name,
        ...ctx,
      };
    }
    return states;
  }

  /**
   * 获取社交图谱
   */
  getSocialGraph() {
    return this._engine.getSocialGraph();
  }

  /**
   * 获取引擎统计
   */
  getStats() {
    return this._engine.getStats();
  }

  /**
   * 保存完整世界状态
   */
  save() {
    const characters = {};
    for (const [id, character] of this._characters) {
      characters[id] = character.save();
    }
    return {
      version: 1,
      domainRef: this._engine.domain ? this._engine.domain.id : DEFAULT_DOMAIN_ID,
      engineState: this._engine.toJSON(),
      characters,
      defaultLLM: this._defaultLLM,
    };
  }

  /**
   * 从保存的状态恢复
   * @param {Object} state
   * @param {Object} [options]
   * @returns {Andy}
   */
  static load(state, options = {}) {
    if (!state || typeof state !== 'object') {
      throw new Error('Andy.load(): state 必须是 save() 返回的对象');
    }
    if (!state.engineState) {
      throw new Error('Andy.load(): state 缺少 engineState');
    }

    const domainRef = state.domainRef || DEFAULT_DOMAIN_ID;
    if (domainRef !== DEFAULT_DOMAIN_ID) {
      if (!options.domain) {
        throw new Error(`非 ${DEFAULT_DOMAIN_ID} domain "${domainRef}" 必须在 load 时传入对应的 domain 配置`);
      }
      if (options.domain.id !== domainRef) {
        throw new Error(`domain 不匹配：期望 "${domainRef}"，但传入了 "${options.domain.id}"`);
      }
    }

    // 手动组装，不走构造函数（避免创建临时引擎再丢弃）
    const world = Object.create(Andy.prototype);
    world._engine = AndyEngine.fromJSON(state.engineState, { domain: options.domain });
    world._characters = new Map();
    world._defaultLLM = state.defaultLLM || options.llm || {};

    // 恢复每个角色（Character.load 不走构造函数，保留 Agent 内在状态）
    const llm = state.defaultLLM || options.llm || {};
    for (const [id, charState] of Object.entries(state.characters)) {
      const character = Character.load(charState, { llm, domain: options.domain });
      // 修复 engine 共享：所有角色必须指向同一个 Andy 引擎
      character._engine = world._engine;
      character._ownsEngine = false;
      character._agent = world._engine.getAgent(character.id);
      world._characters.set(id, character);
    }
    return world;
  }
}

module.exports = Andy;
