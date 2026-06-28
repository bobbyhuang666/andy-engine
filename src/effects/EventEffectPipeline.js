/**
 * EventEffectPipeline — typed delta version (canonical).
 *
 * This is the canonical implementation that produces EffectResult with
 * typed StateDelta[] arrays.  The legacy effects/EventEffectPipeline.js
 * re-exports from here for backward compatibility.
 *
 * Design principles:
 *   - Pure function: no live-state mutation
 *   - No Date.now(): time from context.simTime
 *   - Produces EffectResult (typed) + toLegacyFormat() for callers not yet migrated
 *
 * Dependency leaf: must NOT import from core/, agent/, sdk/, or facts/.
 * May only import from config/ and sibling files in src/effects/.
 */

const { EffectResult } = require('./EffectResult');
const { NeedDelta } = require('./NeedDelta');
const { EmotionDelta } = require('./EmotionDelta');
const { MemoryDelta } = require('./MemoryDelta');
const { RelationshipDelta } = require('./RelationshipDelta');
const { LocationMeaningDelta } = require('./LocationMeaningDelta');
const { FutureTendencyDelta } = require('./FutureTendencyDelta');

/**
 * Generate a structured action_selected event and typed deltas.
 *
 * @param {Object} params
 * @param {Object} params.agentSnapshot — agent state snapshot (read-only)
 * @param {Object} params.selectedCandidate — UtilitySelector selected candidate
 * @param {Object} params.reasonTrace — ReasonTrace (read-only)
 * @param {Date|string} params.simTime — simulation time
 * @returns {EffectResult}
 */
function applyActionEffect({ agentSnapshot, selectedCandidate, reasonTrace, simTime }) {
  const simTimeISO = simTime instanceof Date ? simTime.toISOString() : (simTime || null);
  // R8 fix: throw on missing agentId instead of using 'unknown' fallback.
  // The 'unknown' fallback caused all deltas to be silently dropped by
  // EffectCommitter (which looks up agents by ID), masking data integrity bugs.
  // Note: buildActionContext returns { agent: { id, ... }, ... }, so id may be
  // nested under agentSnapshot.agent.id or directly at agentSnapshot.id.
  const agentId = agentSnapshot?.id ?? agentSnapshot?.agent?.id;
  if (!agentId) {
    throw new Error('EventEffectPipeline.applyActionEffect(): agentSnapshot.id is required');
  }

  if (!selectedCandidate) {
    const event = {
      type: 'action_none',
      time: simTimeISO,
      agentId,
      action: null,
      reasonTraceSummary: {
        keyReasons: reasonTrace?.keyReasons || [],
        totalScore: reasonTrace?.scoreBreakdown?.total || 0,
      },
    };
    const reasonTraceCopy = reasonTrace ? { ...reasonTrace } : {};
    return new EffectResult({ event, deltas: [], reasonTrace: reasonTraceCopy });
  }

  const event = {
    type: 'action_selected',
    time: simTimeISO,
    agentId,
    action: {
      type: selectedCandidate.type,
      source: selectedCandidate.source,
      target: selectedCandidate.target || null,
      label: selectedCandidate.label || '',
    },
    reasonTraceSummary: {
      keyReasons: reasonTrace?.keyReasons || [],
      totalScore: reasonTrace?.scoreBreakdown?.total || 0,
    },
  };

  const deltas = computeDeltas(selectedCandidate, agentSnapshot);

  const reasonTraceCopy = reasonTrace ? { ...reasonTrace } : {};
  return new EffectResult({ event, deltas, reasonTrace: reasonTraceCopy });
}

/**
 * Compute typed deltas (pure computation).
 *
 * @param {Object} candidate — selected candidate
 * @param {Object} agentSnapshot — agent snapshot
 * @returns {import('./StateDelta').StateDelta[]}
 */
function computeDeltas(candidate, agentSnapshot) {
  // R8 fix: throw on missing agentId (same as applyActionEffect)
  // Note: id may be at agentSnapshot.id or agentSnapshot.agent.id
  const agentId = agentSnapshot?.id ?? agentSnapshot?.agent?.id;
  if (!agentId) {
    throw new Error('EventEffectPipeline.computeDeltas(): agentSnapshot.id is required');
  }
  const deltas = [];

  switch (candidate.type) {
    case 'rest':
      deltas.push(new NeedDelta(agentId, { energy: 0.4 }));
      deltas.push(new EmotionDelta(agentId, { calm: 0.1, joy: 0.05 }));
      break;
    case 'observe':
      deltas.push(new MemoryDelta(agentId, {
        kind: 'candidate',
        type: 'observation',
        target: candidate.target || null,
        content: candidate.label || 'observe',
      }));
      break;
    case 'reflect':
      deltas.push(new MemoryDelta(agentId, {
        kind: 'candidate',
        type: 'reflection',
        target: candidate.target || null,
        content: candidate.label || 'reflect',
      }));
      deltas.push(new EmotionDelta(agentId, { calm: 0.03 }));
      break;
    case 'move':
      if (candidate.target) {
        deltas.push(new LocationMeaningDelta(agentId, {
          location: candidate.target,
          meaningType: 'movement_target',
          weight: 0,
          reason: 'action_move',
          from: agentSnapshot?.agent?.position || null,
          to: candidate.target,
        }));
      }
      break;
    case 'socialize':
      if (candidate.target) {
        deltas.push(new RelationshipDelta(agentId, {
          targetAgentId: candidate.target,
          interactionType: 'action_socialize',
          valence: 0.3,
          content: candidate.label || 'socialize',
        }));
      }
      break;
    case 'continue':
    default:
      break;
  }

  return deltas;
}

/**
 * Apply event consequences: memory creation, location meaning, future tendency.
 * This is the "write-back" half of event processing.
 *
 * Returns an array of typed deltas instead of the legacy triple-object shape.
 *
 * @param {Object} params
 * @param {Object} params.fact — EventFact from CanonEventPipeline
 * @param {Map<string, Object>} params.agents — agentId → Agent
 * @param {Object} params.factStore — WorldFactStore instance
 * @param {Object} params.domain — optional domain config
 * @returns {import('./StateDelta').StateDelta[]}
 */
function applyEventConsequences({ fact, agents, factStore, domain }) {
  if (!fact) return [];

  const rules = domain
    ? domain.eventConsequenceRules
    : require('../config/defaults').ANDY_DEFAULTS.eventConsequenceRules;

  const deltas = [];

  // Memory creation
  if (fact.participants || fact.observers) {
    deltas.push(..._createMemoryDeltasFromFact(fact, agents, rules));
  }

  // Location meaning update
  if (fact.location && factStore) {
    deltas.push(..._createLocationMeaningDeltas(fact, factStore, rules));
  }

  // Future tendency update
  if (fact.location && fact.participants) {
    deltas.push(..._createFutureTendencyDeltas(fact, agents, rules));
  }

  return deltas;
}

function _createMemoryDeltasFromFact(fact, agents, rules) {
  const deltas = [];
  const seen = new Set();
  const allRelevant = [];
  if (fact.participants) {
    for (const id of fact.participants) {
      if (!seen.has(id)) { seen.add(id); allRelevant.push(id); }
    }
  }
  if (fact.observers) {
    for (const id of fact.observers) {
      if (!seen.has(id)) { seen.add(id); allRelevant.push(id); }
    }
  }
  const importance = _calculateImportance(fact);
  const emotionTag = _inferEmotionTag(fact, rules);
  for (const agentId of allRelevant) {
    const agent = agents.get(agentId);
    if (agent && agent.memory) {
      deltas.push(new MemoryDelta(agentId, {
        kind: 'candidate',
        type: 'event',
        category: 'event',
        target: fact.location || null,
        content: fact.description || 'event',
        importance,
        emotionTag,
      }));
    }
  }
  return deltas;
}

function _createLocationMeaningDeltas(fact, factStore, rules) {
  const deltas = [];
  const desc = fact.description || '';
  const meaningRules = (rules && rules.eventMeaningRules) || [];
  for (const rule of meaningRules) {
    if (rule.keywords.some(kw => desc.includes(kw))) {
      deltas.push(new LocationMeaningDelta(null, {
        location: fact.location,
        meaningType: rule.meaningType,
        weight: rule.weight,
        reason: desc,
      }));
      break;
    }
  }
  return deltas;
}

function _createFutureTendencyDeltas(fact, agents, rules) {
  const deltas = [];
  const delta = _computeTendencyDelta(fact, rules);
  const importance = _calculateImportance(fact);
  for (const agentId of fact.participants) {
    const agent = agents.get(agentId);
    if (agent && agent.futureTendency) {
      deltas.push(new FutureTendencyDelta(agentId, {
        location: fact.location,
        delta,
        importance,
      }));
    }
  }
  return deltas;
}

function _calculateImportance(fact) {
  let importance = 0.3;
  if (fact.participants && fact.participants.length > 2) importance += 0.2;
  if (fact.scope === 'public') importance += 0.1;
  return Math.min(1.0, importance);
}

function _inferEmotionTag(fact, rules) {
  const desc = fact.description || '';
  const keywords = (rules && rules.emotionKeywords) || {};
  for (const [tag, kws] of Object.entries(keywords)) {
    if (kws.some(kw => desc.includes(kw))) return tag;
  }
  return 'neutral';
}

function _computeTendencyDelta(fact, rules) {
  const delta = [0, 0, 0, 0];
  const desc = fact.description || '';
  const tendencyRules = (rules && rules.tendencyRules) || [];
  for (const rule of tendencyRules) {
    if (rule.keywords.some(kw => desc.includes(kw))) {
      for (let i = 0; i < 4; i++) delta[i] = rule.delta[i];
      break;
    }
  }
  return delta;
}

module.exports = {
  applyActionEffect,
  computeDeltas,
  computeStateDeltas: computeDeltas, // alias for backward compat
  applyEventConsequences,
};
