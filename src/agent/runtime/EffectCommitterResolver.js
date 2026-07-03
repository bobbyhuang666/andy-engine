const { EffectCommitter } = require('../../effects/EffectCommitter');

function getEffectCommitter(agent, env = null) {
  if (env && env.effectCommitter) return env.effectCommitter;

  const world = env?.effectWorld || { time: env?.simTime || null };
  if (!agent._effectCommitter) {
    agent._effectCommitter = new EffectCommitter({
      world,
      agents: new Map([[agent.id, agent]]),
    });
  } else {
    if (agent._effectCommitter.agents && typeof agent._effectCommitter.agents.set === 'function') {
      agent._effectCommitter.agents.set(agent.id, agent);
    }
    agent._effectCommitter.world = world;
    if (!agent._effectCommitter.world.time) {
      agent._effectCommitter.world.time = env?.simTime || null;
    }
  }
  return agent._effectCommitter;
}

module.exports = { getEffectCommitter };
