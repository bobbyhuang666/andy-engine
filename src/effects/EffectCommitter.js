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

const { diagnostics } = require('../shared/Diagnostics');

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
    const result = { applied: [], skipped: [], errors: [] };
    if (!effectResult || !effectResult.deltas) return result;

    const now = this.world?.time || null;

    for (const delta of effectResult.deltas) {
      delta.timestamp = now;
      try {
        const outcome = this._applyDelta(delta);
        if (outcome === 'skipped') {
          result.skipped.push(delta);
          // P2 fix: log skipped deltas for debugging
          diagnostics.warn?.('delta_skipped', {
            agentId: delta.agentId,
            type: delta.type,
            reason: 'guard_failure_or_invalid_delta',
          });
        } else {
          result.applied.push(delta);
        }
      } catch (err) {
        result.errors.push({ delta, error: err });
      }
    }

    return result;
  }

  /**
   * @param {import('./StateDelta').StateDelta} delta
   * @returns {'applied'|'skipped'}
   * @private
   */
  _applyDelta(delta) {
    switch (delta.type) {
      case 'need':
        return this._applyNeedDelta(delta) ? 'applied' : 'skipped';
      case 'emotion':
        return this._applyEmotionDelta(delta) ? 'applied' : 'skipped';
      case 'memory':
        return this._applyMemoryDelta(delta) ? 'applied' : 'skipped';
      case 'relationship':
        return this._applyRelationshipDelta(delta) ? 'applied' : 'skipped';
      case 'position':
        return this._applyPositionDelta(delta) ? 'applied' : 'skipped';
      case 'locationMeaning':
        return this._applyLocationMeaningDelta(delta) ? 'applied' : 'skipped';
      case 'futureTendency':
        return this._applyFutureTendencyDelta(delta) ? 'applied' : 'skipped';
      default:
        return 'skipped';
    }
  }

  /**
   * @private
   */
  _applyNeedDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.needs || !agent.needs.needs) {
      this.world?.diagnostics?.warn?.('applyNeedDelta: agent.needs.needs missing, delta skipped');
      return false;
    }
    // R113-001: guard against null/undefined delta.changes (e.g. corrupted JSON).
    if (!delta.changes || typeof delta.changes !== 'object') return false;

    for (const [name, value] of Object.entries(delta.changes)) {
      // R135-A2-008: recover from NaN-corrupted need values so the delta isn't silently lost.
      const existing = agent.needs.needs[name];
      if (!Number.isFinite(existing)) {
        agent.needs.needs[name] = 0.5; // reset corrupted need to neutral
      }
      // R33 P0 fix: typeof NaN === 'number' is true, so NaN values passed
      // through, making Math.max(0, Math.min(1, NaN)) = NaN permanently.
      // Use Number.isFinite to reject NaN/Infinity.
      if (Number.isFinite(value)) {
        const result = agent.needs.needs[name] + value;
        if (Number.isFinite(result)) {
          agent.needs.needs[name] = Math.max(0, Math.min(1, result));
        } else {
          agent.needs.needs[name] = 0.5; // R137: re-validate addition result
        }
      }
    }
    return true;
  }

  /**
   * @private
   */
  _applyEmotionDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.emotion) return false;

    let emotionApplied = false;
    let stressApplied = false;

    if (typeof agent.emotion.applyEffect === 'function' &&
      delta.changes && Object.keys(delta.changes).length > 0) {
      const multiplier = Number.isFinite(delta.multiplier) ? delta.multiplier : 1;
      const appraisalModifiers = delta.appraisalModifiers && typeof delta.appraisalModifiers === 'object'
        ? { ...delta.appraisalModifiers }
        : null;

      // R136-A3-001: clamp changes to [-1, 1] and reject non-finite values
      const safeChanges = {};
      for (const [dim, val] of Object.entries(delta.changes)) {
        if (Number.isFinite(val)) safeChanges[dim] = Math.max(-1, Math.min(1, val));
      }
      if (Object.keys(safeChanges).length > 0) {
        agent.emotion.applyEffect(safeChanges, multiplier, appraisalModifiers);
        emotionApplied = true;
      }
    }

    if (Number.isFinite(delta.stress) && typeof agent.emotion.setStress === 'function') {
      agent.emotion.setStress(delta.stress);
      stressApplied = true;
    }
    // R161: return based on what was actually applied (safeChanges), not
    // what delta.changes contained. Previously checked delta.changes which
    // could have keys but produce empty safeChanges (NaN values filtered),
    // causing false-positive 'applied' classification.
    return emotionApplied || stressApplied;
  }

  /**
   * @private
   */
  _applyMemoryDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.memory) return false;
    if (delta.kind === 'appraisalBias') {
      if (typeof agent.memory.addAppraisalBias !== 'function') return false;
      if (!delta.bias || typeof delta.bias !== 'object') return false;
      agent.memory.addAppraisalBias({ ...delta.bias });
      return true;
    }

    if (typeof agent.memory.addExperience !== 'function') return false;
    if (delta.kind === 'candidate') {
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
      return true;
    }
    this.world?.diagnostics?.warn?.('unknown_memory_kind', { kind: delta.kind, agentId: delta.agentId });
    return false;
  }

  /**
   * @private
   */
  _applyRelationshipDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent) return false;

    const graph = agent.socialGraph;
    if (!graph) return false;
    if (typeof delta.targetAgentId !== 'string') return false;
    if (delta.targetAgentId === delta.agentId) return false;
    if (typeof graph.hasAgent !== 'function') return false;
    if (!graph.hasAgent(delta.agentId) || !graph.hasAgent(delta.targetAgentId)) return false;

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
    return true;
  }

  /**
   * @private
   */
  _applyPositionDelta(delta) {
    if (!delta.agentId) {
      this.world?.diagnostics?.warn?.('position_delta_missing_agent', { delta });
      return false;
    }
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent) return false;
    if (typeof delta.to !== 'string' || !delta.to) return false;

    const domain = agent.domain;
    if (domain && typeof domain.hasRegion === 'function' && !domain.hasRegion(delta.to)) return false;

    if (delta.to !== agent.position) {
      agent.position = delta.to;
      // R9 fix: sync RegionGrid when position changes via EffectCommitter.
      // Without this, agent.position and RegionGrid occupancy diverge,
      // causing encounter detection to use stale region data.
      if (this.world?.regions && typeof this.world.regions.place === 'function') {
        this.world.regions.place(agent.id, delta.to);
      }
    }
    return true;
  }

  /**
   * @private
   */
  _applyLocationMeaningDelta(delta) {
    const factStore = this.world?.factStore;
    if (!factStore || typeof factStore.updateLocationMeaning !== 'function') return false;
    if (!delta.location) return false;

    // R34 P2 fix: validate weight is finite before passing to factStore.
    // This was the one delta path without downstream NaN protection.
    const weight = typeof delta.weight === 'number' && Number.isFinite(delta.weight)
      ? delta.weight : 0;

    factStore.updateLocationMeaning(delta.location, {
      type: delta.meaningType,
      weight,
      reason: delta.reason,
    });
    return true;
  }

  /**
   * @private
   */
  _applyFutureTendencyDelta(delta) {
    const agent = this.agents?.get(delta.agentId);
    if (!agent || !agent.futureTendency || typeof agent.futureTendency.updateTendency !== 'function') return false;
    if (!delta.location) return false;

    // R35 P1 fix: validate importance with Number.isFinite. NaN importance
    // causes `dv * NaN = NaN` in updateTendency, and Math.max(-1, NaN) = NaN,
    // permanently corrupting the tendency array (decay preserves NaN).
    const importance = typeof delta.importance === 'number' && Number.isFinite(delta.importance)
      ? delta.importance : 0.1;
    agent.futureTendency.updateTendency(delta.location, delta.delta, importance);
    return true;
  }
}

module.exports = { EffectCommitter };
