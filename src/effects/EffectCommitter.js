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
   */
  commit(effectResult) {
    if (!effectResult || !effectResult.deltas) return;

    const now = this.world?.time || null;

    for (const delta of effectResult.deltas) {
      delta.timestamp = now;
      this._applyDelta(delta);
    }
  }

  /**
   * @param {import('./StateDelta').StateDelta} delta
   * @private
   */
  _applyDelta(delta) {
    switch (delta.type) {
      case 'need':
        return this._applyNeedDelta(delta);
      case 'emotion':
        return this._applyEmotionDelta(delta);
      case 'memory':
        return this._applyMemoryDelta(delta);
      case 'relationship':
        return this._applyRelationshipDelta(delta);
      case 'locationMeaning':
        return this._applyLocationMeaningDelta(delta);
      case 'futureTendency':
        return this._applyFutureTendencyDelta(delta);
      default:
        return;
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
