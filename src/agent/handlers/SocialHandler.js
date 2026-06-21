/**
 * SocialHandler - Social energy update
 *
 * Delegates to PhysiologyRuntime.
 */
const { updateSocialEnergy } = require('../runtime/PhysiologyRuntime');

class SocialHandler {
  constructor(agent) {
    this.agent = agent;
  }

  tick(context) {
    updateSocialEnergy(this.agent, context.hoursElapsed);
  }
}

module.exports = SocialHandler;
