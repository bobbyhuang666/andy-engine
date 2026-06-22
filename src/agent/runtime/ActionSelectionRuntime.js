/**
 * ActionSelectionRuntime — Shadow action selection logic
 *
 * Extracted from Agent._runShadowActionSelection / _buildActionSelectedEvent /
 * _applyActionStateDeltas / _buildActionContext.
 *
 * All functions take an `agent` instance as first argument.
 * This module may import from src/action and src/effects.
 */

const { applyActionEffect } = require('../../effects/EventEffectPipeline');
const { EffectResult } = require('../../effects/EffectResult');
const { EffectCommitter } = require('../../effects/EffectCommitter');
const { NeedDelta } = require('../../effects/NeedDelta');
const { EmotionDelta } = require('../../effects/EmotionDelta');
const { MemoryDelta } = require('../../effects/MemoryDelta');
const { PositionDelta } = require('../../effects/PositionDelta');
const { RelationshipDelta } = require('../../effects/RelationshipDelta');
const { diagnostics } = require('../../shared/Diagnostics');

/**
 * Validate action selection config at agent construction time.
 * Throws if mode is 'active' with temperature > 0 but no seeded RNG.
 * @param {Object} actionCfg - merged actionSelection config
 * @param {Object|null} rng - agent's RNG instance
 * @param {string} agentId - agent identifier for error message
 */
function validateActionSelectionConfig(actionCfg, rng, agentId) {
  if (!actionCfg || !actionCfg.enabled) return;
  if (actionCfg.mode === 'active' && actionCfg.temperature > 0 && (!rng || typeof rng.next !== 'function')) {
    throw new Error(
      `ActionSelection config error for agent "${agentId}": ` +
      'UtilitySelector requires a seeded RNG when temperature > 0. ' +
      'Provide a seed in AndyEngineConfig or set actionSelection.temperature to 0.'
    );
  }
}

/**
 * Build action selection context (read-only snapshot of agent state).
 * @param {Object} agent
 * @param {Object} env
 * @returns {Object}
 */
function buildActionContext(agent, env) {
  return {
    agent: {
      id: agent.id,
      position: agent.position,
      state: agent.stateMachine.currentState,
      socialEnergy: agent.socialEnergy,
      health: agent.health,
    },
    behaviorField: {
      B: [...agent.behaviorField.B],
      label: agent.behaviorField.label,
      velocity: [...agent.behaviorField.velocity],
    },
    needs: { ...agent.needs.needs },
    emotion: {
      current: { ...agent.emotion.current },
      valence: agent.emotion.getValence(),
      arousal: agent.emotion.getArousal(),
    },
    memories: agent.memory.memories.slice(-10),
    relationships: agent._socialGraphRef
      ? agent._socialGraphRef.getRelationships(agent.id)
      : [],
    goals: [],
    worldPressure: null,
    schedule: agent.schedule.getCurrentActivity(env.hour, env.dayOfWeek, env.simDate),
    intrinsic: {
      curiosity: agent.intrinsicMotivation.curiosity,
    },
    environment: {
      hour: env.hour,
      dayOfWeek: env.dayOfWeek,
      weather: env.weather,
    },
    domain: agent._domain,
    rng: agent._rng,
  };
}

/**
 * Run shadow action selection pipeline.
 * Returns an event object or null.
 * @param {Object} agent
 * @param {Object} env
 * @returns {Object|null}
 */
function runShadowActionSelection(agent, env) {
  const actionCfg = agent._actionSelectionConfig;
  if (!actionCfg || !actionCfg.enabled) return null;
  try {
    // Lazy init
    if (!agent._candidateProviderManager) {
      const { CandidateProviderManager } = require('../../action/providers/CandidateProviderManager');
      agent._candidateProviderManager = new CandidateProviderManager();
    }
    const { scoreCandidates } = require('../../action/UtilityScorer');
    const { selectAction } = require('../../action/UtilitySelector');

    // 1. Build context (with cloned RNG so shadow pipeline never drains the main tick's RNG)
    const shadowRng = agent._rng ? agent._rng.clone() : null;
    const context = buildActionContext(agent, env);
    if (shadowRng) context.rng = shadowRng;
    // 2. Generate candidates
    const candidates = agent._candidateProviderManager.generateAll(context);
    // 3. Score (empty candidates → empty scored list → selectAction returns empty trace)
    const scored = candidates.length > 0 ? scoreCandidates(candidates, context) : [];
    // 4. Select
    const { selected, trace } = selectAction(scored, {
      temperature: actionCfg.temperature,
      rng: shadowRng,
    });
    // 5. Compute stateDeltas for dryRunEffects/active modes (pure computation)
    let stateDeltas = null;
    if ((actionCfg.mode === 'dryRunEffects' || actionCfg.mode === 'active') && selected) {
      const agentSnapshot = buildActionContext(agent, env);
      const pipelineResult = applyActionEffect({
        agentSnapshot,
        selectedCandidate: selected,
        reasonTrace: trace,
        simTime: env.simTime,
      });
      stateDeltas = pipelineResult.toLegacyFormat().stateDeltas;
      // Attach stateDeltas to trace
      trace.stateDeltas = stateDeltas;
    }

    // 6. Active writeback: apply allowed deltas to live state
    if (actionCfg.mode === 'active' && stateDeltas) {
      applyActionStateDeltas(agent, stateDeltas, env);
    }

    // 7. Record trace
    if (actionCfg.recordTraces) {
      agent._actionTraceHistory.push(trace);
      if (agent._actionTraceHistory.length > actionCfg.maxTraceHistory) {
        agent._actionTraceHistory.shift();
      }
    }

    // 8. Emit event for event/dryRunEffects/active modes
    if (actionCfg.mode === 'event' || actionCfg.mode === 'dryRunEffects' || actionCfg.mode === 'active') {
      return buildActionSelectedEvent(agent, trace, env, stateDeltas);
    }
  } catch (e) {
    diagnostics.warn(`Action selection error for ${agent.id}: ${e.message}`);
    diagnostics.collect({ type: 'action_selection_error', agentId: agent.id, error: e.message });
  }
  return null;
}

/**
 * Build action_selected audit event.
 * @param {Object} agent
 * @param {Object} trace
 * @param {Object} env
 * @param {Object|null} stateDeltas
 * @returns {Object|null}
 */
function buildActionSelectedEvent(agent, trace, env, stateDeltas = null) {
  if (!trace || !trace.selectedAction) return null;

  const selected = trace.selectedCandidate || {};
  const event = {
    type: 'action_selected',
    scope: 'internal',
    agentId: agent.id,
    participants: [],
    observers: [],
    time: env.simTime?.toISOString(),
    content: `action_selected:${trace.selectedAction}`,
    action: {
      type: selected.type || trace.selectedAction,
      source: selected.source || null,
      target: selected.target || null,
      label: selected.label || '',
    },
    reasonTrace: JSON.parse(JSON.stringify(trace)),
    effects: [],
  };
  if (stateDeltas) {
    event.stateDeltas = stateDeltas;
  }
  return event;
}

/**
 * Apply action stateDeltas to live state via EffectCommitter (active mode only).
 *
 * Builds typed deltas from legacy stateDeltas and commits through EffectCommitter.
 * This replaces direct agent state mutation with the canonical delta pipeline.
 *
 * @param {Object} agent
 * @param {Object} stateDeltas
 * @param {Object} env
 */
function applyActionStateDeltas(agent, stateDeltas, env) {
  if (!stateDeltas) return;

  const deltas = [];

  // 1. Need deltas (only energy allowed)
  if (stateDeltas.need && typeof stateDeltas.need.energy === 'number') {
    deltas.push(new NeedDelta(agent.id, { energy: stateDeltas.need.energy }));
  }

  // 2. Emotion deltas
  if (stateDeltas.emotion && Object.keys(stateDeltas.emotion).length > 0) {
    deltas.push(new EmotionDelta(agent.id, stateDeltas.emotion));
  }

  // 3. Memory candidate delta
  if (stateDeltas.memory && stateDeltas.memory.kind === 'candidate') {
    deltas.push(new MemoryDelta(agent.id, {
      kind: stateDeltas.memory.kind,
      type: stateDeltas.memory.type || 'action',
      content: stateDeltas.memory.content || 'action_memory',
    }));
  }

  // 4. Location delta (position change)
  if (stateDeltas.location && stateDeltas.location.to) {
    const target = stateDeltas.location.to;
    const valid = agent._domain && typeof agent._domain.hasRegion === 'function'
      ? agent._domain.hasRegion(target)
      : false;
    if (valid && target !== agent.position) {
      deltas.push(new PositionDelta(agent.id, {
        to: target,
        from: agent.position,
        reason: stateDeltas.location.reason || 'action_move',
      }));
    }
  }

  // 5. Relationship delta
  if (stateDeltas.relationship && stateDeltas.relationship.targetAgentId) {
    const rel = stateDeltas.relationship;
    if (
      agent._socialGraphRef &&
      typeof rel.targetAgentId === 'string' &&
      rel.targetAgentId !== agent.id &&
      typeof agent._socialGraphRef.hasAgent === 'function' &&
      agent._socialGraphRef.hasAgent(agent.id) &&
      agent._socialGraphRef.hasAgent(rel.targetAgentId)
    ) {
      deltas.push(new RelationshipDelta(agent.id, {
        targetAgentId: rel.targetAgentId,
        interactionType: rel.interactionType || 'action_socialize',
        valence: typeof rel.valence === 'number' ? rel.valence : 0,
        content: rel.content || '',
      }));
    }
  }

  // Commit all deltas through EffectCommitter
  if (deltas.length > 0) {
    // Reuse agent-cached committer to reduce GC pressure; update world ref for current simTime
    if (!agent._effectCommitter) {
      const agents = new Map([[agent.id, agent]]);
      agent._effectCommitter = new EffectCommitter({
        world: { time: env.simTime || null },
        agents,
      });
    } else {
      agent._effectCommitter.world.time = env.simTime || null;
    }
    agent._effectCommitter.commit(new EffectResult({ event: {}, deltas, reasonTrace: {} }));
  }
}

module.exports = {
  buildActionContext,
  runShadowActionSelection,
  buildActionSelectedEvent,
  applyActionStateDeltas,
  validateActionSelectionConfig,
};
