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
    // R137: clone to avoid mutating caller's object — EmotionDelta/NeedDelta
    // follow the same defensive pattern. Without cloning, the caller (and any
    // other participants sharing the same delta array from _createFutureTendencyDeltas)
    // would see mutations if this instance's delta is ever modified downstream.
    const deltaCopy = Array.isArray(payload.delta) && payload.delta.length === 4
      && payload.delta.every(v => Number.isFinite(v)) ? payload.delta.slice() : [0, 0, 0, 0];
    this.delta = deltaCopy;
    // R116-009: typeof 0 === 'number' and 0 is falsy, so `|| 0.3` would
    // coerce legitimate importance:0 to 0.3. Use Number.isFinite check instead.
    this.importance = typeof payload.importance === 'number' && Number.isFinite(payload.importance)
      ? payload.importance : 0.3;
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
