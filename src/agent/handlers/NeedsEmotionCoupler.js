/**
 * NeedsEmotionCoupler - Needs-to-emotion coupling
 *
 * Delegates to PhysiologyRuntime.
 */
const { applyNeedsToEmotion } = require('../runtime/PhysiologyRuntime');

class NeedsEmotionCoupler {
  constructor(agent) {
    this.agent = agent;
  }

  tick() {
    applyNeedsToEmotion(this.agent);
  }
}

module.exports = NeedsEmotionCoupler;
