/**
 * RelationshipDelta — typed delta for social-relationship changes.
 *
 * Describes an interaction effect on the SocialGraph edge between two agents.
 */

const { StateDelta } = require('./StateDelta');

class RelationshipDelta extends StateDelta {
  /**
   * @param {string} agentId — source agent
   * @param {Object} payload
   * @param {string} payload.targetAgentId — other agent in the relationship
   * @param {string} payload.interactionType — e.g. 'action_socialize'
   * @param {number} payload.valence — [-1, 1] effect on relationship strength
   * @param {string} payload.content — interaction description
 * @param {number} [payload.durationHours] — optional simulated interaction
 *   duration; omitted for legacy full-effect behavior
   */
  constructor(agentId, payload) {
    super('relationship', 'relationship', agentId);
    this.targetAgentId = payload.targetAgentId;
    this.interactionType = payload.interactionType || 'unknown';
    // R34 P2 fix: use Number.isFinite instead of falsy coercion.
    // `payload.valence || 0` replaces both NaN and 0 with 0, losing the
    // semantic intent of a neutral (valence=0) interaction.
    this.valence = typeof payload.valence === 'number' && Number.isFinite(payload.valence)
      ? payload.valence : 0;
    this.content = payload.content || '';
    if (payload.durationHours !== undefined) {
      this.durationHours = payload.durationHours;
    }
  }

  toJSON() {
    const json = {
      ...super.toJSON(),
      targetAgentId: this.targetAgentId,
      interactionType: this.interactionType,
      valence: this.valence,
      content: this.content,
    };
    if (this.durationHours !== undefined) json.durationHours = this.durationHours;
    return json;
  }
}

module.exports = { RelationshipDelta };
