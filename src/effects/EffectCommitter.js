/**
 * EffectCommitter — unified delta applier.
 *
 * This is the ONLY component that writes EffectResult deltas to live state.
 * It receives a world reference and an agents map, and dispatches each
 * StateDelta to the appropriate subsystem.
 *
 * Committer invariants:
 *   - Sets `delta.timestamp` at commit time.
 *   - Never throws; silently skips invalid deltas.
 *   - All writes are bounded (clamped, guarded).
 */

class EffectCommitter {
  /**
   * @param {Object} params
   * @param {Object} params.world — World instance (for factStore, time, etc.)
   * @param {Map<string, Object>} params.agents — agentId → Agent instance
   */
  constructor({ world, agents }) {
    this.world = world;
    this.agents = agents;
  }

  /**
   * Commit all deltas in an EffectResult to live state.
   *
   * @param {import('./EffectResult').EffectResult} effectResult
   * @returns {{ applied: Array, skipped: Array, errors: Array }}
   */
  commit(effectResult) {
    const diagnostics = { applied: [], skipped: [], errors: [] };
    if (!effectResult || !effectResult.deltas) return diagnostics;

    const now = this.world?.time || null;

    for (const delta of effectResult.deltas) {
      delta.timestamp = now;
      try {
        const result = this._applyDelta(delta);
        if (result === 'skipped') {
          diagnostics.skipped.push(delta);
        } else {
          diagnostics.applied.push(delta);
        }
      } catch (err) {
        diagnostics.errors.push({ delta, error: err });
      }
    }

    return diagnostics;
  }

  /**
   * @param {import('./StateDelta').StateDelta} delta
   * @returns {'applied'|'skipped'}
   * @private
   */
  _applyDelta(delta) {
    switch (delta.type) {
      case 'need':
        this._applyNeedDelta(delta);
        return 'applied';
      case 'emotion':
        this._applyEmotionDelta(delta);
        return 'applied';
      case 'memory':
        this._applyMemoryDelta(delta);
        return 'applied';
      case 'relationship':
        this._applyRelationshipDelta(delta);
        return 'applied';
      case 'position':
        this._applyPositionDelta(delta);
        return 'applied';
      case 'locationMeaning':
        this._applyLocationMeaningDelta(delta);
        return 'applied';
      case 'futureTendency':
        this._applyFutureTendencyDelta(delta);
        return 'applied';
      default:
        return 'skipped';
    }
  }

  /**
   * @private
   */
  _applyNeedDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.needs || !agent.needs.needs) return;

    for (const [name, value] of Object.entries(delta.changes)) {
      // R33 P0 fix: typeof NaN === 'number' is true, so NaN values passed
      // through, making Math.max(0, Math.min(1, NaN)) = NaN permanently.
      // Use Number.isFinite to reject NaN/Infinity.
      if (Number.isFinite(agent.needs.needs[name]) && Number.isFinite(value)) {
        agent.needs.needs[name] = Math.max(0, Math.min(1, agent.needs.needs[name] + value));
      }
    }
  }

  /**
   * @private
   */
  _applyEmotionDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.emotion || typeof agent.emotion.applyEffect !== 'function') return;

    if (delta.changes && Object.keys(delta.changes).length > 0) {
      const multiplier = Number.isFinite(delta.multiplier) ? delta.multiplier : 1;
      const appraisalModifiers = delta.appraisalModifiers && typeof delta.appraisalModifiers === 'object'
        ? delta.appraisalModifiers
        : null;
      agent.emotion.applyEffect(delta.changes, multiplier, appraisalModifiers);
    }

    if (Number.isFinite(delta.stress) && typeof agent.emotion.setStress === 'function') {
      agent.emotion.setStress(delta.stress);
    }
  }

  /**
   * @private
   */
  _applyMemoryDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.memory) return;
    if (delta.kind === 'appraisalBias') {
      if (typeof agent.memory.addAppraisalBias !== 'function') return;
      if (!delta.bias || typeof delta.bias !== 'object') return;
      agent.memory.addAppraisalBias({ ...delta.bias });
      return;
    }

    if (typeof agent.memory.addExperience !== 'function') return;
    if (delta.kind !== 'candidate') return;

    const memEvent = delta.event && typeof delta.event === 'object'
      ? { ...delta.event }
      : {
          content: delta.content || 'action_memory',
          type: delta.memoryType || 'action',
          participants: [delta.agentId],
        };
    if (!Array.isArray(memEvent.participants)) memEvent.participants = [delta.agentId];
    if (delta.category && !memEvent.category) memEvent.category = delta.category;
    // R34 P2 fix: Number.isFinite rejects NaN importance before it reaches
    // PersonalMemory.addExperience (typeof NaN === 'number' is true).
    if (typeof delta.importance === 'number' && Number.isFinite(delta.importance)) {
      memEvent.importance = delta.importance;
    }
    if (delta.emotionTag) memEvent.emotionTag = delta.emotionTag;
    const importance = typeof delta.importance === 'number' && Number.isFinite(delta.importance)
      ? delta.importance : null;
    const memory = agent.memory.addExperience(memEvent, agent.emotion, importance);
    Object.defineProperty(delta, 'committedMemory', {
      value: memory || null,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  /**
   * @private
   */
  _applyRelationshipDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent) return;

    const graph = agent.socialGraph;
    if (!graph) return;
    if (typeof delta.targetAgentId !== 'string') return;
    if (delta.targetAgentId === delta.agentId) return;
    if (typeof graph.hasAgent !== 'function') return;
    if (!graph.hasAgent(delta.agentId) || !graph.hasAgent(delta.targetAgentId)) return;

    const relationship = graph.getOrCreateRelationship(delta.agentId, delta.targetAgentId);
    if (typeof relationship.recordInteraction === 'function') {
      // R34 P2 fix: Number.isFinite rejects NaN (typeof NaN === 'number' is true)
      const valence = typeof delta.valence === 'number' && Number.isFinite(delta.valence)
        ? delta.valence : 0;
      relationship.recordInteraction(
        delta.interactionType || 'unknown',
        valence,
        delta.content || '',
        this.world?.time || null
      );
    }
  }

  /**
   * @private
   */
  _applyPositionDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent) return;
    if (typeof delta.to !== 'string' || !delta.to) return;

    const domain = agent.domain;
    if (domain && typeof domain.hasRegion === 'function' && !domain.hasRegion(delta.to)) return;

    if (delta.to !== agent.position) {
      agent.position = delta.to;
      // R9 fix: sync RegionGrid when position changes via EffectCommitter.
      // Without this, agent.position and RegionGrid occupancy diverge,
      // causing encounter detection to use stale region data.
      if (this.world?.regions && typeof this.world.regions.place === 'function') {
        this.world.regions.place(agent.id, delta.to);
      }
    }
  }

  /**
   * @private
   */
  _applyLocationMeaningDelta(delta) {
    const factStore = this.world?.factStore;
    if (!factStore || typeof factStore.updateLocationMeaning !== 'function') return;
    if (!delta.location) return;

    // R34 P2 fix: validate weight is finite before passing to factStore.
    // This was the one delta path without downstream NaN protection.
    const weight = typeof delta.weight === 'number' && Number.isFinite(delta.weight)
      ? delta.weight : 0;

    factStore.updateLocationMeaning(delta.location, {
      type: delta.meaningType,
      weight,
      reason: delta.reason,
    });
  }

  /**
   * @private
   */
  _applyFutureTendencyDelta(delta) {
    const agent = this.agents?.get(delta.agentId);
    if (!agent || !agent.futureTendency || typeof agent.futureTendency.updateTendency !== 'function') return;
    if (!delta.location) return;

    // R35 P1 fix: validate importance with Number.isFinite. NaN importance
    // causes `dv * NaN = NaN` in updateTendency, and Math.max(-1, NaN) = NaN,
    // permanently corrupting the tendency array (decay preserves NaN).
    const importance = typeof delta.importance === 'number' && Number.isFinite(delta.importance)
      ? delta.importance : 0.1;
    agent.futureTendency.updateTendency(delta.location, delta.delta, importance);
  }
}

module.exports = { EffectCommitter };
