/**
 * StateDelta — base class for all typed deltas.
 *
 * Every delta describes a single atomic change to live state.
 * The EffectCommitter is the only consumer that applies deltas;
 * pipeline code only constructs them.
 */

class StateDelta {
  /**
   * @param {string} type — delta discriminator ('need','emotion','memory','relationship','location','world')
   * @param {string} target — which subsystem owns the state ('agent','world','relationship')
   * @param {string} agentId — affected agent (null for world-scoped deltas)
   */
  constructor(type, target, agentId) {
    this.type = type;
    this.target = target;
    this.agentId = agentId || null;
    this.timestamp = null; // set by EffectCommitter at commit time
  }

  toJSON() {
    return {
      type: this.type,
      target: this.target,
      agentId: this.agentId,
      timestamp: this.timestamp,
    };
  }
}

module.exports = { StateDelta };
