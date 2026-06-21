/**
 * ActionSelectionHandler - Shadow Action Selection
 *
 * Delegates to ActionSelectionRuntime.
 */
const { runShadowActionSelection } = require('../runtime/ActionSelectionRuntime');

class ActionSelectionHandler {
  constructor(agent) {
    this.agent = agent;
  }

  tick(context) {
    const actionSelectionEvent = runShadowActionSelection(this.agent, context.env);
    if (actionSelectionEvent) {
      context.result.newEvents.push(actionSelectionEvent);
    }
  }
}

module.exports = ActionSelectionHandler;
