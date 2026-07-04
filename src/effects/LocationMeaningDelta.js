/**
 * LocationMeaningDelta — typed delta for location-meaning updates and movement.
 *
 * Describes a change to how a location is perceived (via WorldFactStore),
 * or a position change (movement action).
 */

const { StateDelta } = require('./StateDelta');

class LocationMeaningDelta extends StateDelta {
  /**
   * @param {string|null} agentId — agent who triggered the change (null for world events)
   * @param {Object} payload
   * @param {string} payload.location — location identifier
   * @param {string} payload.meaningType — semantic meaning type
   * @param {number} payload.weight — meaning weight
   * @param {string} payload.reason — why the meaning changed
   * @param {string|null} [payload.from] — origin position (movement only)
   * @param {string|null} [payload.to] — destination position (movement only)
   */
  constructor(agentId, payload) {
    super('locationMeaning', 'world', agentId);
    this.location = payload.location;
    this.meaningType = payload.meaningType;
    this.weight = Number.isFinite(payload.weight) ? payload.weight : 0;
    this.reason = payload.reason || '';
    this.from = payload.from || null;
    this.to = payload.to || null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      location: this.location,
      meaningType: this.meaningType,
      weight: this.weight,
      reason: this.reason,
      from: this.from,
      to: this.to,
    };
  }
}

module.exports = { LocationMeaningDelta };
