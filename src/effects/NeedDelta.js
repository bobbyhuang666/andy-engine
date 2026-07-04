/**
 * NeedDelta — typed delta for need-system changes.
 *
 * Payload is a plain object mapping need names to numeric offsets:
 *   { energy: 0.4, hunger: -0.1 }
 */

const { StateDelta } = require('./StateDelta');

class NeedDelta extends StateDelta {
  /**
   * @param {string} agentId
   * @param {Object<string, number>} changes — { needName: deltaValue }
   */
  constructor(agentId, changes) {
    super('need', 'agent', agentId);
    this.changes = (changes && typeof changes === 'object' && !Array.isArray(changes)) ? changes : {};
  }

  toJSON() {
    return { ...super.toJSON(), changes: this.changes };
  }
}

module.exports = { NeedDelta };
