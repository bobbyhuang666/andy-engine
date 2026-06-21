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
      if (typeof agent.needs.needs[name] === 'number' && typeof value === 'number') {
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

    agent.emotion.applyEffect(delta.changes);
  }

  /**
   * @private
   */
  _applyMemoryDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.memory || typeof agent.memory.addExperience !== 'function') return;
    if (delta.kind !== 'candidate') return;

    const memEvent = {
      content: delta.content || 'action_memory',
      type: delta.memoryType || 'action',
      participants: [delta.agentId],
    };
    if (delta.category) memEvent.category = delta.category;
    if (typeof delta.importance === 'number') memEvent.importance = delta.importance;
    if (delta.emotionTag) memEvent.emotionTag = delta.emotionTag;
    agent.memory.addExperience(memEvent, agent.emotion);
  }

  /**
   * @private
   */
  _applyRelationshipDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent) return;

    const graph = agent._socialGraphRef;
    if (!graph) return;
    if (typeof delta.targetAgentId !== 'string') return;
    if (delta.targetAgentId === delta.agentId) return;
    if (typeof graph.hasAgent !== 'function') return;
    if (!graph.hasAgent(delta.agentId) || !graph.hasAgent(delta.targetAgentId)) return;

    const relationship = graph.getOrCreateRelationship(delta.agentId, delta.targetAgentId);
    if (typeof relationship.recordInteraction === 'function') {
      relationship.recordInteraction(
        delta.interactionType || 'unknown',
        typeof delta.valence === 'number' ? delta.valence : 0,
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

    const domain = agent._domain;
    if (domain && typeof domain.hasRegion === 'function' && !domain.hasRegion(delta.to)) return;

    if (delta.to !== agent.position) {
      agent.position = delta.to;
    }
  }

  /**
   * @private
   */
  _applyLocationMeaningDelta(delta) {
    const factStore = this.world?.factStore;
    if (!factStore || typeof factStore.updateLocationMeaning !== 'function') return;
    if (!delta.location) return;

    factStore.updateLocationMeaning(delta.location, {
      type: delta.meaningType,
      weight: delta.weight,
      reason: delta.reason,
    });
  }

  /**
   * @private
   */
  _applyFutureTendencyDelta(delta) {
    const agent = this.agents?.get?.(delta.agentId);
    if (!agent || !agent.futureTendency || typeof agent.futureTendency.updateTendency !== 'function') return;
    if (!delta.location) return;

    agent.futureTendency.updateTendency(delta.location, delta.delta, delta.importance);
  }
}

module.exports = { EffectCommitter };
