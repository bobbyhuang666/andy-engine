/**
 * EffectResult — typed container for pipeline output.
 *
 * Replaces the implicit { event, stateDeltas, updatedReasonTrace } shape
 * with a formal contract.  Deltas are stored as a StateDelta[] array
 * instead of a bag-of-plain-objects.
 *
 * Filtering uses `delta.type` discriminator (not instanceof) to avoid
 * cross-boundary identity issues between CJS require and ESM import.
 */

class EffectResult {
  /**
   * @param {Object} params
   * @param {Object} params.event — structured event object
   * @param {import('./StateDelta').StateDelta[]} params.deltas — typed delta array
   * @param {Object} params.reasonTrace — updated reason trace
   */
  constructor({ event, deltas, reasonTrace }) {
    this.event = event;
    this.deltas = deltas || [];
    this.reasonTrace = reasonTrace || {};
  }

  /** Whether any deltas were produced. */
  get hasChanges() {
    return this.deltas.length > 0;
  }

  /** Subset: memory deltas. */
  get memoryDeltas() {
    return this.deltas.filter(d => d.type === 'memory');
  }

  /** Subset: relationship deltas. */
  get relationshipDeltas() {
    return this.deltas.filter(d => d.type === 'relationship');
  }

  /** Subset: need deltas. */
  get needDeltas() {
    return this.deltas.filter(d => d.type === 'need');
  }

  /** Subset: emotion deltas. */
  get emotionDeltas() {
    return this.deltas.filter(d => d.type === 'emotion');
  }

  /** Subset: location-meaning deltas. */
  get locationMeaningDeltas() {
    return this.deltas.filter(d => d.type === 'locationMeaning');
  }

  /** Subset: future-tendency deltas. */
  get futureTendencyDeltas() {
    return this.deltas.filter(d => d.type === 'futureTendency');
  }

  /**
   * Convert to the legacy { event, stateDeltas, updatedReasonTrace } shape
   * for backward compatibility with callers that haven't migrated yet.
   */
  toLegacyFormat() {
    const stateDeltas = {
      need: {},
      emotion: {},
      memory: null,
      relationship: null,
      location: null,
      world: null,
    };

    for (const delta of this.deltas) {
      switch (delta.type) {
        case 'need':
          Object.assign(stateDeltas.need, delta.changes);
          break;
        case 'emotion':
          Object.assign(stateDeltas.emotion, delta.changes);
          break;
        case 'memory':
          stateDeltas.memory = {
            kind: delta.kind,
            type: delta.memoryType,
            target: delta.target,
            content: delta.content,
          };
          break;
        case 'relationship':
          stateDeltas.relationship = {
            targetAgentId: delta.targetAgentId,
            interactionType: delta.interactionType,
            valence: delta.valence,
            content: delta.content,
          };
          break;
        case 'locationMeaning':
          stateDeltas.location = {
            from: delta.from || null,
            to: delta.to || delta.location,
            reason: delta.reason,
          };
          break;
      }
    }

    return {
      event: this.event,
      stateDeltas,
      updatedReasonTrace: this.reasonTrace,
    };
  }
}

module.exports = { EffectResult };
