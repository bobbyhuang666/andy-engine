/**
 * @andy-engine/sdk — 让 AI 角色拥有灵魂
 *
 * 三行代码创建一个有记忆、有情绪、有性格的角色：
 *
 *   const { Character } = require('./sdk');
 *
 *   const maya = new Character({
 *     name: 'Maya',
 *     personality: 'INFP',
 *     backstory: ['一个安静的阅览处管理员', '喜欢看星星'],
 *     llm: { provider: 'openai', apiKey: 'sk-...' },
 *   });
 *
 *   const reply = await maya.chat('我今天好累');
 *
 * @module @andy-engine/sdk
 */

const Character = require('./Character');
const Andy = require('./Andy');
const NarrativeBuilder = require('./NarrativeBuilder');
const LLMAdapter = require('./LLMAdapter');
const AutoTick = require('./AutoTick');
const ConversationLog = require('./ConversationLog');
const AndyEngine = require('../index');

/**
 * 快速创建角色（最简 API）
 *
 * @param {Object} config
 * @param {string} config.name - 角色名
 * @param {string} [config.personality='INFP'] - MBTI 类型
 * @param {string[]} [config.backstory=[]] - 背景故事
 * @param {Object|string|Function} [config.llm] - LLM 配置
 * @returns {Character}
 */
function create(config) {
  return new Character(config);
}

module.exports = {
  // 主要 API
  Character,
  Andy,
  create,

  // 底层（高级用户）
  NarrativeBuilder,
  LLMAdapter,
  AutoTick,
  ConversationLog,
  AndyEngine,
};
