/**
 * PerceptionHandler - Event perception
 *
 * Delegates to PerceptionRuntime.
 */
const { perceiveEvents } = require('../runtime/PerceptionRuntime');

class PerceptionHandler {
  constructor(agent) {
    this.agent = agent;
  }

  tick(context) {
    perceiveEvents(this.agent, context.safeEvents, context.env);

    if (this.agent.futureTendency) {
      this.agent.futureTendency.decay();
    }
  }
}

module.exports = PerceptionHandler;
