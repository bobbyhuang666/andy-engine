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
    // R137: validate per-value is finite — corrupted delta payloads (e.g., JSON
    // deserialization) could contain NaN/Infinity that passes the factory but
    // corrupts downstream arithmetic. Filter to finite numbers only.
    for (const [key, val] of Object.entries(this.changes)) {
      if (!Number.isFinite(val)) {
        delete this.changes[key];
      }
    }
  }

  toJSON() {
    return { ...super.toJSON(), changes: this.changes };
  }
}

module.exports = { NeedDelta };
