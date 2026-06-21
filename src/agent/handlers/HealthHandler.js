/**
 * HealthHandler - Health system update
 *
 * Delegates to PhysiologyRuntime.
 */
const { updateHealth } = require('../runtime/PhysiologyRuntime');

class HealthHandler {
  constructor(agent) {
    this.agent = agent;
  }

  tick(context) {
    updateHealth(this.agent, context.hoursElapsed, context.env);
  }
}

module.exports = HealthHandler;
