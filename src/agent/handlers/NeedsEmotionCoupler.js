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

  tick(context = null) {
    applyNeedsToEmotion(this.agent, context?.env || null);
  }
}

module.exports = NeedsEmotionCoupler;
