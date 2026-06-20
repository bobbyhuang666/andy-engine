/**
 * src/sdk — SDK Layer
 *
 * High-level API for character interaction.
 * Replaces sdk/ as the canonical location.
 */

const Character = require('./Character');
const Andy = require('./Andy');
const NarrativeBuilder = require('./NarrativeBuilder');
const LLMAdapter = require('./LLMAdapter');
const AutoTick = require('./AutoTick');
const ConversationLog = require('./ConversationLog');
const AndyEngine = require('./AndyEngine');

function create(config) {
  return new Character(config);
}

module.exports = {
  Character,
  Andy,
  create,
  NarrativeBuilder,
  LLMAdapter,
  AutoTick,
  ConversationLog,
  AndyEngine,
};
