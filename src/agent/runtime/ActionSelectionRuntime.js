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
const { NeedDelta } = require('../../effects/NeedDelta');
const { EmotionDelta } = require('../../effects/EmotionDelta');
const { MemoryDelta } = require('../../effects/MemoryDelta');
const { PositionDelta } = require('../../effects/PositionDelta');
const { RelationshipDelta } = require('../../effects/RelationshipDelta');
const { LocationMeaningDelta } = require('../../effects/LocationMeaningDelta');
const { diagnostics } = require('../../shared/Diagnostics');
const { getEffectCommitter } = require('./EffectCommitterResolver');

const IM_GOAL_TYPE_TO_ACTION = {
  explore_new: 'explore',
  deepen_skill: 'work',
  break_routine: 'explore',
};

function _resolveGoals(agent) {
  if (!agent.intrinsicMotivation || !Array.isArray(agent.intrinsicMotivation.activeGoals)) return [];
  return agent.intrinsicMotivation.activeGoals
    .filter(g => g && g.status === 'active')
    .map(g => ({
      actionType: IM_GOAL_TYPE_TO_ACTION[g.type] || null,
      target: g.target || null,
      priority: 0.5,
      weight: 1.0,
      status: 'active',
      metadata: g.domain ? { semanticCategory: g.domain } : {},
    }));
}

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
 * R21 P0-3: complete all fields required by providers and scorers.
 * Previously missing: proceduralMemory, currentHour, dayOfWeek,
 * currentPosition, currentValence (HabitCandidateProvider dead code),
 * worldPressure (WorldPressureCandidateProvider dead code),
 * pressureContext, futureTendency, locationMeaning, world (5 scorer
 * dimensions always returning 0), and schedule.currentActivity.
 * @param {Object} agent
 * @param {Object} env
 * @returns {Object}
 */
function buildActionContext(agent, env) {
  const currentActivity = agent.schedule
    ? agent.schedule.getCurrentActivity(env.hour, env.dayOfWeek, env.simDate)
    : null;

  // Build PressureContext from snapshot for scorers
  let pressureContext = null;
  try {
    const { PressureContext } = require('../../pressure/PressureContext');
    pressureContext = PressureContext.fromSnapshot({
      world: { time: env.simTime, weather: env.weather },
      agent: {
        id: agent.id,
        position: agent.position,
        needs: agent.needs ? agent.needs.needs : {},
        emotion: agent.emotion ? agent.emotion.current : {},
        memory: agent.memory,
        socialGraph: agent.socialGraph,
        behaviorField: agent.behaviorField,
        futureTendency: agent.futureTendency,
        locationMeaningInfluence: agent.behaviorField._locationMeaningInfluence,
      },
      events: [],
      simTime: env.simTime,
    });
  } catch (_) {
    // PressureContext construction is best-effort; scorers handle null
  }

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
    relationships: agent.socialGraph
      ? agent.socialGraph.getRelationships(agent.id)
      : [],
    coPresentAgentIds: Array.isArray(env.coPresentAgentIdsByAgent?.[agent.id])
      ? env.coPresentAgentIdsByAgent[agent.id]
      : Object.freeze([]),
    goals: _resolveGoals(agent),
    // R21 P0-3: provide real worldPressure (previously null → WorldPressureCandidateProvider dead code)
    worldPressure: pressureContext ? pressureContext.world : null,
    // R21 P0-3: provide pressureContext for 5 scorer dimensions (need, relationship,
    // memory, location, world) that always returned 0 without it
    pressureContext: pressureContext ? pressureContext.toScorerContext() : null,
    // R21 P0-3: provide schedule with currentActivity (ScheduleCandidateProvider
    // expects context.schedule.currentActivity, not a bare string)
    schedule: {
      currentActivity: currentActivity,
    },
    intrinsic: {
      curiosity: agent.intrinsicMotivation.curiosity,
    },
    environment: {
      hour: env.hour,
      dayOfWeek: env.dayOfWeek,
      weather: env.weather,
    },
    // R21 P0-3: fields required by HabitCandidateProvider (was dead code)
    proceduralMemory: agent.proceduralMemory || null,
    currentHour: env.hour,
    dayOfWeek: env.dayOfWeek,
    currentPosition: agent.position,
    currentValence: agent.emotion.getValence(),
    // R21 P0-3: fields required by scorer tendency/location dimensions
    futureTendency: agent.futureTendency || null,
    locationMeaning: agent.behaviorField._locationMeaningInfluence || null,
    domain: agent.domain,
    rng: agent._rng,
    // R21 P0-3: world context for scoreTime/scoreConstraint (previously missing)
    world: {
      time: env.simTime ? env.simTime.toISOString() : null,
      weather: env.weather,
    },
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
    let pipelineResult = null;
    let stateDeltas = null;
    if ((actionCfg.mode === 'dryRunEffects' || actionCfg.mode === 'active') && selected) {
      const agentSnapshot = buildActionContext(agent, env);
      const durationHours = Number.isFinite(env?.minutesElapsed) && env.minutesElapsed >= 0
        ? env.minutesElapsed / 60
        : 0;
      pipelineResult = applyActionEffect({
        agentSnapshot,
        selectedCandidate: selected,
        reasonTrace: trace,
        simTime: env.simTime,
        coPresentAgentIds: agentSnapshot.coPresentAgentIds,
        durationHours,
        needsRecoveryRate: agent.needs?._cfg?.recoveryRate
          ? { ...agent.needs._cfg.recoveryRate }
          : {},
        locationMeaningAvailable: Boolean(
          env?.effectWorld?.factStore &&
          typeof env.effectWorld.factStore.updateLocationMeaning === 'function'
        ),
      });
      // Phase D-2: Keep legacy stateDeltas on trace for backward compat
      trace.stateDeltas = pipelineResult.toLegacyFormat().stateDeltas;
      stateDeltas = trace.stateDeltas;
    }

    // 6. Active writeback: commit typed deltas directly (reuse Step 5 pipelineResult, skip redundant applyActionEffect)
    if (actionCfg.mode === 'active' && pipelineResult) {
      const positionBeforeCommit = agent.position;
      pipelineResult.directCommit(agent, env);
      // Keep the continuous spatial index in lockstep with the canonical
      // position delta. SpatialEngine.tick() derives region ownership from
      // coordinates; without this sync it can immediately emit a compensating
      // move back to the stale region in the same tick.
      if (
        agent.position !== positionBeforeCommit &&
        typeof env?._setRegionChanged === 'function'
      ) {
        env._setRegionChanged(agent.id, agent.position);
      }
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
 * @deprecated Phase D-3: Use EffectResult.directCommit(agent, env) instead.
 *   This function is retained for tests only. The legacy typed→legacy→typed
 *   round-trip has been replaced by direct typed-delta commit in
 *   runShadowActionSelection().
 *
 * @param {Object} agent
 * @param {Object} stateDeltas
 * @param {Object} env
 * @returns {void}
 */
function applyActionStateDeltas(agent, stateDeltas, env) {
  if (!stateDeltas) return;

  const deltas = [];

  // 1. Need deltas — forward all need fields, not just energy
  // R23 P1 fix: previously only forwarded energy, which silently dropped
  // hunger (consume), stimulation (work/explore), social (socialize),
  // and comfort deltas. This negated R22 P0-1 fix in active mode.
  if (stateDeltas.need && Object.keys(stateDeltas.need).length > 0) {
    deltas.push(new NeedDelta(agent.id, { ...stateDeltas.need }));
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
    const valid = agent.domain && typeof agent.domain.hasRegion === 'function'
      ? agent.domain.hasRegion(target)
      : false;
    if (valid && target !== agent.position) {
      deltas.push(new PositionDelta(agent.id, {
        to: target,
        from: agent.position,
        reason: stateDeltas.location.reason || 'action_move',
      }));
      deltas.push(new LocationMeaningDelta(agent.id, {
        location: target,
        meaningType: 'movement_target',
        weight: 0,
        reason: stateDeltas.location.reason || 'action_move',
        from: agent.position,
        to: target,
      }));
    }
  }

  // 5. Relationship delta
  if (stateDeltas.relationship && stateDeltas.relationship.targetAgentId) {
    const rel = stateDeltas.relationship;
    if (
      agent.socialGraph &&
      typeof rel.targetAgentId === 'string' &&
      rel.targetAgentId !== agent.id &&
      typeof agent.socialGraph.hasAgent === 'function' &&
      agent.socialGraph.hasAgent(agent.id) &&
      agent.socialGraph.hasAgent(rel.targetAgentId)
    ) {
      deltas.push(new RelationshipDelta(agent.id, {
        targetAgentId: rel.targetAgentId,
        interactionType: rel.interactionType || 'action_socialize',
        // R38 P2 fix: Number.isFinite rejects NaN, matching RelationshipDelta constructor
        valence: typeof rel.valence === 'number' && Number.isFinite(rel.valence) ? rel.valence : 0,
        content: rel.content || '',
      }));
    }
  }

  // Commit all deltas through EffectCommitter
  if (deltas.length > 0) {
    // R18 AUDIT-003 fix: track position changes so caller can sync RegionGrid.
    const positionBefore = agent.position;
    const committer = getEffectCommitter(agent, env);
    committer.commit(new EffectResult({ event: {}, deltas, reasonTrace: {} }));
    // R18 AUDIT-003 fix: EffectCommitter._applyPositionDelta updates agent.position
    // but the stub world lacks regions/spatial, so RegionGrid is not synced.
    // Set env._regionChanged flag so AndyWorld.step() can sync after this tick.
    if (agent.position !== positionBefore && env && typeof env._setRegionChanged === 'function') {
      env._setRegionChanged(agent.id, agent.position);
    }
  }
}

module.exports = {
  buildActionContext,
  runShadowActionSelection,
  buildActionSelectedEvent,
  applyActionStateDeltas, // @deprecated Phase D-3 — use EffectResult.directCommit() instead
  validateActionSelectionConfig,
};
