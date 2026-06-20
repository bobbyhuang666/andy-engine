/**
 * EventEffectPipeline — compatibility wrapper.
 *
 * Canonical implementation lives in src/effects/EventEffectPipeline.js.
 * This module re-exports the legacy interface { event, stateDeltas, updatedReasonTrace }
 * by wrapping the typed EffectResult from the canonical implementation.
 *
 * Dependency leaf: must NOT import from core/, agent/, sdk/, or facts/.
 * It may only import from config/ and src/effects/.
 */

const {
  applyActionEffect: typedApplyActionEffect,
  computeDeltas,
  applyEventConsequences: typedApplyEventConsequences,
} = require('../src/effects/EventEffectPipeline');
const { EffectCommitter } = require('../src/effects/EffectCommitter');

/**
 * Legacy wrapper: returns { event, stateDeltas, updatedReasonTrace }.
 */
function applyActionEffect({ agentSnapshot, selectedCandidate, reasonTrace, simTime }) {
  const effectResult = typedApplyActionEffect({ agentSnapshot, selectedCandidate, reasonTrace, simTime });
  const legacy = effectResult.toLegacyFormat();
  // Inject stateDeltas into reasonTrace (matching old behavior)
  legacy.updatedReasonTrace = reasonTrace ? { ...reasonTrace, stateDeltas: legacy.stateDeltas } : { stateDeltas: legacy.stateDeltas };
  return legacy;
}

/**
 * Legacy wrapper: returns the old { need, emotion, memory, relationship, location, world } shape.
 */
function computeStateDeltas(candidate, agentSnapshot) {
  const typed = computeDeltas(candidate, agentSnapshot);
  const result = {
    need: {},
    emotion: {},
    memory: null,
    relationship: null,
    location: null,
    world: null,
  };

  for (const delta of typed) {
    switch (delta.type) {
      case 'need':
        Object.assign(result.need, delta.changes);
        break;
      case 'emotion':
        Object.assign(result.emotion, delta.changes);
        break;
      case 'memory':
        result.memory = {
          kind: delta.kind,
          type: delta.memoryType,
          target: delta.target,
          content: delta.content,
        };
        break;
      case 'relationship':
        result.relationship = {
          targetAgentId: delta.targetAgentId,
          interactionType: delta.interactionType,
          valence: delta.valence,
          content: delta.content,
        };
        break;
      case 'locationMeaning':
        result.location = {
          from: delta.from || agentSnapshot?.agent?.position || null,
          to: delta.to || delta.location,
          reason: delta.reason,
        };
        break;
    }
  }

  return result;
}

/**
 * Legacy wrapper: applies deltas via EffectCommitter, returns count shape.
 */
function applyEventConsequences({ fact, agents, factStore, domain }) {
  const deltas = typedApplyEventConsequences({ fact, agents, factStore, domain });

  // Apply deltas to live state via committer
  const committer = new EffectCommitter({ world: { factStore, time: null }, agents });
  for (const delta of deltas) {
    committer._applyDelta(delta);
  }

  // Build legacy count shape
  const results = { memoryUpdates: [], locationMeaningUpdates: [], tendencyUpdates: [] };
  for (const delta of deltas) {
    switch (delta.type) {
      case 'memory':
        results.memoryUpdates.push({ agentId: delta.agentId, type: 'memory_add' });
        break;
      case 'locationMeaning':
        results.locationMeaningUpdates.push({ location: delta.location, meaningType: delta.meaningType, weight: delta.weight });
        break;
      case 'futureTendency':
        results.tendencyUpdates.push({ agentId: delta.agentId, location: delta.location, delta: delta.delta });
        break;
    }
  }

  return results;
}

module.exports = {
  applyActionEffect,
  computeStateDeltas,
  applyEventConsequences,
};
