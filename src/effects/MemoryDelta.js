/**
 * MemoryDelta — typed delta for memory-system changes.
 *
 * Represents a candidate memory to be stored via PersonalMemory.addExperience.
 * The committer decides whether/how to persist based on agent state.
 */

const { StateDelta } = require('./StateDelta');

class MemoryDelta extends StateDelta {
  /**
   * @param {string} agentId
   * @param {Object} payload
   * @param {string} payload.kind — 'candidate' | 'consolidated'
   * @param {string} payload.type — 'observation' | 'reflection' | 'event' | ...
   * @param {string|null} payload.target — memory target (object, location, agent)
   * @param {string} payload.content — memory text content
   * @param {string} [payload.category] — memory category (e.g. 'event')
   * @param {number} [payload.importance] — [0, 1] memory importance
   * @param {string} [payload.emotionTag] — emotion label (e.g. 'happy', 'neutral')
   */
  constructor(agentId, payload) {
    super('memory', 'agent', agentId);
    this.kind = payload.kind || 'candidate';
    this.memoryType = payload.type || 'observation';
    this.target = payload.target || null;
    this.content = payload.content || '';
    this.category = payload.category || null;
    this.importance = typeof payload.importance === 'number' ? payload.importance : null;
    this.emotionTag = payload.emotionTag || null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      kind: this.kind,
      memoryType: this.memoryType,
      target: this.target,
      content: this.content,
      category: this.category,
      importance: this.importance,
      emotionTag: this.emotionTag,
    };
  }
}

module.exports = { MemoryDelta };
