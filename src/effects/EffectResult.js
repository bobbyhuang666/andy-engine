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
   * Commit this EffectResult's typed deltas directly to live state,
   * skipping the legacy toLegacyFormat() → applyActionStateDeltas() round-trip.
   *
   * Phase D-1: canonical commit path for ActionSelectionRuntime active mode.
   *
   * @param {Object} agent — the agent whose state should be mutated
   * @param {Object} env — environment (for time, world ref)
   * @returns {{ applied: Array, skipped: Array, errors: Array }}
   */
  directCommit(agent, env) {
    const { getEffectCommitter } = require('../agent/runtime/EffectCommitterResolver');
    const committer = getEffectCommitter(agent, env);
    return committer.commit(this);
  }

  /**
   * Convert to the legacy { event, stateDeltas, updatedReasonTrace } shape
   * for backward compatibility with callers that haven't migrated yet.
   *
   * @deprecated Phase D-3: use directCommit() instead. This method is retained
   *   only for tests and any callers not yet migrated.
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
          // R139: additive merge — multiple NeedDeltas targeting the same need
          // must sum their changes, not overwrite. Object.assign replaces.
          // R158: guard against NaN/Infinity values in delta changes to prevent
          // corruption of legacy format output consumed by ActionSelectionRuntime.
          for (const [key, val] of Object.entries(delta.changes)) {
            if (!Number.isFinite(val)) continue;
            stateDeltas.need[key] = (stateDeltas.need[key] || 0) + val;
          }
          break;
        case 'emotion':
          // R139: additive merge — multiple EmotionDeltas targeting the same
          // dimension must sum their changes, not overwrite.
          // R146-1 fix: clamp summed emotion values to [-1, 1] to prevent
          // unbounded accumulation in legacy format output.
          for (const [key, val] of Object.entries(delta.changes)) {
            stateDeltas.emotion[key] = Math.max(-1, Math.min(1, (stateDeltas.emotion[key] || 0) + val));
          }
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
          // Only set location from LocationMeaningDelta if no PositionDelta
          // has already set it (PositionDelta takes precedence for position).
          if (!stateDeltas.location) {
            stateDeltas.location = {
              from: delta.from || null,
              to: delta.to || delta.location,
              reason: delta.reason,
            };
          }
          break;
        case 'position':
          // R20 M17: PositionDelta directly sets location state.
          // Takes precedence over LocationMeaningDelta for the to/from fields.
          stateDeltas.location = {
            from: delta.from || null,
            to: delta.to,
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
