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
 *   world.addCharacter({ name: 'Maya', personality: 'INFP', backstory: ['图书馆管理员'] });
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

const AndyEngine = require('../index');
const Character = require('./Character');

class Andy {
  /**
   * @param {Object} config
   * @param {Object} [config.llm] - 默认 LLM 配置
   * @param {Date} [config.startTime] - 模拟开始时间
   * @param {string} [config.weather] - 初始天气
   */
  constructor(config = {}) {
    this._engine = new AndyEngine({
      startTime: config.startTime || new Date(),
      weather: config.weather || 'sunny',
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
    const character = this._characters.get(characterId);
    if (!character) throw new Error(`Character not found: ${characterId}`);
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
      engineState: this._engine.toJSON(),
      characters,
      defaultLLM: this._defaultLLM,
    };
  }

  /**
   * 从保存的状态恢复
   * @param {Object} state
   * @returns {Andy}
   */
  static load(state) {
    const world = new Andy({ llm: state.defaultLLM });
    // 恢复引擎状态
    world._engine = AndyEngine.fromJSON(state.engineState);
    // 恢复角色
    for (const [id, charState] of Object.entries(state.characters)) {
      const character = Character.load(charState, state.defaultLLM);
      world._characters.set(id, character);
    }
    return world;
  }
}

module.exports = Andy;
