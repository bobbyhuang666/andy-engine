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
   */
  constructor(agentId, payload) {
    super('relationship', 'relationship', agentId);
    this.targetAgentId = payload.targetAgentId;
    this.interactionType = payload.interactionType || 'unknown';
    this.valence = payload.valence || 0;
    this.content = payload.content || '';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      targetAgentId: this.targetAgentId,
      interactionType: this.interactionType,
      valence: this.valence,
      content: this.content,
    };
  }
}

module.exports = { RelationshipDelta };
