/**
 * MemoryDelta — typed delta for memory-system changes.
 *
 * Represents a candidate memory to be stored via PersonalMemory.addExperience
 * or a memory-side appraisal bias to be stored via addAppraisalBias.
 * The committer decides whether/how to persist based on agent state.
 */

const { StateDelta } = require('./StateDelta');

class MemoryDelta extends StateDelta {
  /**
   * @param {string} agentId
   * @param {Object} payload
   * @param {string} payload.kind — 'candidate' | 'consolidated' | 'appraisalBias'
   * @param {string} payload.type — 'observation' | 'reflection' | 'event' | ...
   * @param {string|null} payload.target — memory target (object, location, agent)
   * @param {string} payload.content — memory text content
   * @param {Object} [payload.event] — full source event to preserve memory context
   * @param {string} [payload.category] — memory category (e.g. 'event')
   * @param {number} [payload.importance] — [0, 1] memory importance
   * @param {string} [payload.emotionTag] — emotion label (e.g. 'happy', 'neutral')
   * @param {Object} [payload.bias] — appraisal bias payload
   */
  constructor(agentId, payload) {
    super('memory', 'agent', agentId);
    this.kind = payload.kind || 'candidate';
    this.memoryType = payload.type || 'observation';
    this.target = payload.target || null;
    this.content = payload.content || '';
    this.event = payload.event && typeof payload.event === 'object' ? { ...payload.event } : null;
    this.category = payload.category || null;
    // R34 P2 fix: Number.isFinite rejects NaN (typeof NaN === 'number' is true).
    // NaN importance propagates to PersonalMemory.addExperience, corrupting
    // memory ranking and retrieval priority.
    this.importance = typeof payload.importance === 'number' && Number.isFinite(payload.importance)
      ? payload.importance : null;
    this.emotionTag = payload.emotionTag || null;
    this.bias = payload.bias && typeof payload.bias === 'object' ? { ...payload.bias } : null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      kind: this.kind,
      memoryType: this.memoryType,
      target: this.target,
      content: this.content,
      event: this.event,
      category: this.category,
      importance: this.importance,
      emotionTag: this.emotionTag,
      bias: this.bias,
    };
  }
}

module.exports = { MemoryDelta };
