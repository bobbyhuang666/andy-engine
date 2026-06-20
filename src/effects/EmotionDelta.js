/**
 * EmotionDelta — typed delta for emotion-vector changes.
 *
 * Payload is a plain object mapping emotion dimension names to offsets:
 *   { calm: 0.1, joy: 0.05 }
 */

const { StateDelta } = require('./StateDelta');

class EmotionDelta extends StateDelta {
  /**
   * @param {string} agentId
   * @param {Object<string, number>} changes — { dimension: deltaValue }
   */
  constructor(agentId, changes) {
    super('emotion', 'agent', agentId);
    this.changes = changes;
  }

  toJSON() {
    return { ...super.toJSON(), changes: this.changes };
  }
}

module.exports = { EmotionDelta };
