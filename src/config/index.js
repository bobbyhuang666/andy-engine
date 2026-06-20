/**
 * src/config — Configuration Layer
 *
 * Centralized configuration management for Andy Engine.
 * All tunable parameters live here.
 */

const {
  ANDY_DEFAULTS,
  EMOTION_DIMENSIONS,
  CO_ACTIVATION,
  EMOTION_OPPOSITES,
  personalityToBehavior,
  SEMANTIC_EVENT_CATEGORIES,
} = require('./defaults');

const { validateConfig, validateAgentConfig } = require('./validate');

module.exports = {
  ANDY_DEFAULTS,
  EMOTION_DIMENSIONS,
  CO_ACTIVATION,
  EMOTION_OPPOSITES,
  personalityToBehavior,
  SEMANTIC_EVENT_CATEGORIES,
  validateConfig,
  validateAgentConfig,
};
