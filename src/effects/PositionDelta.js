/**
 * PositionDelta — typed delta for agent position changes.
 *
 * Describes a movement action that changes agent.position.
 */

const { StateDelta } = require('./StateDelta');

class PositionDelta extends StateDelta {
  /**
   * @param {string} agentId — agent who is moving
   * @param {Object} payload
   * @param {string} payload.to — destination position
   * @param {string} [payload.from] — origin position (informational)
   * @param {string} [payload.reason] — why the position changed
   */
  constructor(agentId, payload) {
    super('position', 'agent', agentId);
    this.to = payload.to;
    this.from = payload.from || null;
    this.reason = payload.reason || '';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      to: this.to,
      from: this.from,
      reason: this.reason,
    };
  }
}

module.exports = { PositionDelta };
