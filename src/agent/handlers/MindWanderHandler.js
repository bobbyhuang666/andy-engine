/**
 * MindWanderHandler - Mind wandering (Default Mode Network)
 *
 * Delegates to MindWanderRuntime.
 * Retains the gate condition (quiet check + probability).
 */
const { DIM_ACTIVITY, DIM_FOCUS } = require('../psychology/BehaviorLabeler');
const { ANDY_DEFAULTS } = require('../../config/defaults');
const { mindWander } = require('../runtime/MindWanderRuntime');

class MindWanderHandler {
  constructor(agent) {
    this.agent = agent;
  }

  tick(context) {
    const agent = this.agent;
    const B = agent.behaviorField.B;
    const isQuiet = B[DIM_ACTIVITY] < 0.3 && B[DIM_FOCUS] < 0.3;

    if (isQuiet) {
      if (agent._rand() < (ANDY_DEFAULTS.mindWander?.quietProbability || 0.25)) {
        const thought = mindWander(agent);
        if (thought) {
          context.result.newEvents.push(thought);
        }
      }
    }
  }
}

module.exports = MindWanderHandler;
