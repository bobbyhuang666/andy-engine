/**
 * ExternalExperience — External experience injection facade
 *
 * Extracted from Agent.recordExternalExperience.
 */

const { diagnostics } = require('../../shared/Diagnostics');

/**
 * Record an external experience as a memory.
 * @param {Object} agent
 * @param {Object} event
 * @param {Object} [options]
 * @returns {Object|null}
 */
function recordExternalExperience(agent, event, options = {}) {
  try {
    if (!event || typeof event !== 'object') return null;
    if (!event.content || typeof event.content !== 'string') return null;

    const normalized = { ...event };
    normalized.content = event.content;
    normalized.type = event.type || event.category || 'social';
    normalized.category = event.category || event.type || 'social';
    normalized.emotionTag = event.emotionTag || 'neutral';
    normalized.importance = typeof event.importance === 'number' ? event.importance : 0.5;
    normalized.participants = event.participants || [agent.id];
    normalized._region = agent.position;
    normalized._currentState = agent.stateMachine.currentState;

    const importance = typeof options.importance === 'number'
      ? options.importance
      : normalized.importance;

    const memory = agent.memory.addExperience(normalized, agent.emotion, importance);
    if (memory) {
      const _reserved = new Set([
        'content', 'type', 'category', 'emotionTag', 'importance',
        'participants', '_region', '_currentState', 'timestamp', 'id',
        'activation', 'accessCount', 'lastAccessed', 'createdAt',
      ]);
      // R33 P0 fix: reject prototype-polluting keys from untrusted input.
      // Setting memory.__proto__ replaces the object's prototype (prototype
      // pollution). Also reject 'constructor' and 'prototype' for safety.
      for (const key of Object.keys(event)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        if (!_reserved.has(key) && !(key in memory)) memory[key] = event[key];
      }
    }
    return memory;
  } catch (e) {
    diagnostics.warn(`External experience injection error: ${e.message}`);
    diagnostics.collect({ type: 'external_experience_error', agentId: agent?.id, error: e.message });
    return null;
  }
}

module.exports = { recordExternalExperience };
