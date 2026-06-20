/**
 * FutureTendencyDelta — typed delta for future-tendency updates.
 *
 * Describes a change to an agent's behavioral tendency at a specific location.
 */

const { StateDelta } = require('./StateDelta');

class FutureTendencyDelta extends StateDelta {
  /**
   * @param {string} agentId
   * @param {Object} payload
   * @param {string} payload.location — location the tendency applies to
   * @param {number[]} payload.delta — 4D tendency offset [activity, sociality, focus, expressiveness]
   * @param {number} payload.importance — [0, 1] importance of this tendency update
   */
  constructor(agentId, payload) {
    super('futureTendency', 'agent', agentId);
    this.location = payload.location;
    this.delta = payload.delta || [0, 0, 0, 0];
    this.importance = payload.importance || 0.3;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      location: this.location,
      delta: this.delta,
      importance: this.importance,
    };
  }
}

module.exports = { FutureTendencyDelta };
