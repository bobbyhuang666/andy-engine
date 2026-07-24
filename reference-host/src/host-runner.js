/**
 * Host Runner — Explicit catch-up engine orchestration
 *
 * Implements the scheduling model from REFERENCE_HOST_ARCHITECTURE.md:
 *   load checkpoint → choose bounded target segment → runTicks/advanceTo
 *   → persist stable world envelope → append redacted evidence metadata
 *   → close process
 *
 * This module NEVER calls a real LLM provider, NEVER accesses engine
 * internals (engine.world, regions, dispatcher, EffectCommitter, etc.),
 * and NEVER writes directly to memory, relationship, facts, knowledge,
 * position, emotion, or needs.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const {
  toWorldState,
  fromWorldState,
  Serialization,
  ENVELOPE_VERSION,
} = require('andy-engine/store');

const AndyEngine = require('andy-engine');
const campusPreset = require('andy-engine/presets/campus');
const tavernPreset = require('andy-engine/presets/tavern');

// ─── W2-F: Hardened read helpers (serialize immediately, no live references) ──

/**
 * Deep-clone a value via JSON round-trip for read-only evidence.
 */
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Extract agent summaries from a snapshot (W2-F hardened).
 * Replaces live agent handle reads with serialized snapshot data.
 */
function extractAgentSummariesFromSnapshot(snapshot) {
  if (!snapshot || !snapshot.agents) return [];
  const agents = snapshot.agents;
  return Object.entries(agents).map(([id, status]) => ({
    id,
    name: status.name,
    position: status.position,
    state: status.state,
    behavior: status.behavior ? status.behavior.vector : undefined,
    emotion: status.emotion,
  }));
}

/**
 * Extract social edge count from toWorldState output (W2-F hardened).
 * Replaces engine.getSocialGraph().toJSON() with envelope-based read.
 */
function extractEdgeCountFromWorldState(worldState) {
  if (!worldState || !Array.isArray(worldState.relationships)) return 0;
  return worldState.relationships.length;
}

/**
 * Extract fact count from grounding package (public API, already read-only).
 */
function extractFactCount(engine, agentId) {
  if (!engine.getGroundingPackage) return undefined;
  const gp = engine.getGroundingPackage(agentId);
  return gp ? (gp.allowedFacts || []).length : 0;
}

// ─── Domain resolution (only uses public preset exports) ────────────────

function resolveDomain(domainId) {
  switch (domainId) {
    case 'tavern': return tavernPreset;
    case 'campus': return campusPreset;
    default: throw new Error(`Unknown domain: ${domainId}`);
  }
}

// ─── Segment execution ─────────────────────────────────────────────────

/**
 * Run a single segment of the diagnostic.
 *
 * @param {Object} scenario  - scenario manifest entry
 * @param {Object} segment   - { id, startTick, targetTick }
 * @param {Object} [options] - { artifactDir, runId }
 * @param {Object|null} [worldState] - saved world state for resume, null for fresh
 * @returns {{ engine, worldState, tickResults, segmentRecord }}
 */
function runSegment(scenario, segment, options = {}, worldState = null) {
  const { artifactDir, runId } = options;
  const domain = resolveDomain(scenario.domain);

  // Build engine config — enableFacts is set EXPLICITLY by the Host,
  // NOT changing the Engine default (which remains false).
  const engineConfig = {
    domain,
    seed: scenario.seed,
    enableFacts: scenario.enableFacts,
    tickMinutes: scenario.tickMinutes,
    startTime: scenario.startTime,
  };

  let engine;
  if (worldState) {
    // Resume from checkpoint — fromWorldState requires the constructor
    engine = fromWorldState(worldState, { domain, enableFacts: scenario.enableFacts }, AndyEngine);
  } else {
    // Fresh start
    engine = new AndyEngine(engineConfig);
    for (const charDef of scenario.characters) {
      engine.createCharacter(charDef);
    }
  }

  // Explicit catch-up: run bounded ticks
  const ticksNeeded = segment.targetTick - segment.startTick;
  const tickResults = engine.runTicks(ticksNeeded);

  // Persist via Stable World Envelope
  const savedState = toWorldState(engine, runId || scenario.id);

  // ─── W2-F: Hardened read patterns ────────────────────────────────────
  // Use snapshot() for world-level reads, toWorldState() for projections.
  // Immediately serialize to JSON + deep-clone for read-only evidence.

  const snapshot = engine.snapshot();
  const serializedSnapshot = deepClone(snapshot);

  const worldStateForEvidence = savedState;
  const serializedWorldState = deepClone(worldStateForEvidence);

  // Extract agent summaries from snapshot (not live handles)
  const agentSummaries = extractAgentSummariesFromSnapshot(serializedSnapshot);

  // Extract social edge count from toWorldState relationships (not live graph)
  const socialEdgeCount = extractEdgeCountFromWorldState(serializedWorldState);

  // Facts: use getGroundingPackage (already a public read-only API)
  const firstAgentId = serializedSnapshot.agents
    ? Object.keys(serializedSnapshot.agents)[0]
    : undefined;
  const factCount = scenario.enableFacts && firstAgentId
    ? extractFactCount(engine, firstAgentId)
    : undefined;

  const segmentRecord = {
    runId: runId || scenario.id,
    scenarioId: scenario.id,
    segmentId: segment.id,
    startTick: segment.startTick,
    targetTick: segment.targetTick,
    actualTickCount: tickResults.length,
    domain: scenario.domain,
    enableFacts: scenario.enableFacts,
    envelopeVersion: ENVELOPE_VERSION,
    engineVersion: getEngineVersion(),
    seed: scenario.seed,
    // W2-F: Evidence uses serialized/read-only projections, not live object identity
    snapshotEvidence: serializedSnapshot,
    worldStateEvidence: serializedWorldState,
    // Observable agent summaries from snapshot (public API only)
    agentSummaries,
    // Social graph edge count from toWorldState relationships (W2-F hardened)
    socialEdgeCount,
    // Facts system status — only observable if enableFacts
    factsEnabled: scenario.enableFacts,
    factCount,
    // Tick result phase keys (observability of effect pipeline output)
    tickResultPhases: tickResults.length > 0
      ? Object.keys(tickResults[tickResults.length - 1] || {})
      : [],
    // Gap observations: all public observability gaps recorded per segment
    gaps: [
      { id: 'A1', label: 'effect/trace observability', status: 'not_observable_via_public_api' },
      { id: 'A2', label: 'live Agent/read-model risk', status: 'not_observable' },
      { id: 'A3', label: 'movement/external-event command gap', status: 'not_observable' },
      { id: 'A4', label: 'evaluation-bundle capability gap', status: 'not_observable' },
      { id: 'A5', label: 'buffered streaming limitation', status: 'not_observable' },
    ],
    timestamp: new Date().toISOString(),
  };

  return { engine, worldState: savedState, tickResults, segmentRecord };
}

// ─── Full diagnostic run (multi-segment with fresh-process resume) ──────

/**
 * Run a complete diagnostic across all segments with fresh-process
 * resume boundaries.
 *
 * Between segments, the engine is destroyed and recreated from the
 * saved world state, simulating a fresh-process resume.
 *
 * @param {Object} scenario - scenario manifest entry
 * @param {Object} [options] - { artifactDir, runId }
 * @returns {{ runManifest, segmentRecords, worldStates }}
 */
function runDiagnostic(scenario, options = {}) {
  const { artifactDir, runId = scenario.id } = options;
  const segmentRecords = [];
  const worldStates = [];
  let currentWorldState = null;

  for (const segment of scenario.segments) {
    const result = runSegment(scenario, segment, options, currentWorldState);

    segmentRecords.push(result.segmentRecord);
    worldStates.push(result.worldState);
    currentWorldState = result.worldState;

    // Verify: after resume, tick count must be at expected position
    if (result.engine) {
      const stats = result.engine.getStats();
      if (stats.tickCount !== segment.targetTick) {
        console.warn(
          `[host-runner] Tick count mismatch after segment ${segment.id}: ` +
          `expected ${segment.targetTick}, got ${stats.tickCount}`
        );
      }
    }
  }

  // Build run manifest
  const runManifest = {
    schemaVersion: '1.0.0',
    runId,
    scenarioId: scenario.id,
    domain: scenario.domain,
    seed: scenario.seed,
    enableFacts: scenario.enableFacts,
    engineVersion: getEngineVersion(),
    envelopeVersion: ENVELOPE_VERSION,
    tickMinutes: scenario.tickMinutes,
    startTime: scenario.startTime.toISOString(),
    segmentCount: scenario.segments.length,
    resumeBoundaryCount: scenario.resumeBoundaries.length,
    totalTargetTicks: scenario.segments[scenario.segments.length - 1].targetTick,
    characterCount: scenario.characters.length,
    characterIds: scenario.characters.map(c => c.id),
    // No provider/model info — no real LLM calls in W1
    providerSnapshot: { type: 'mock', model: 'none', notes: 'W1 deterministic diagnostic — no real provider calls' },
    timestamp: new Date().toISOString(),
  };

  return { runManifest, segmentRecords, worldStates };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getEngineVersion() {
  try {
    // When installed from tarball, andy-engine resolves to
    // node_modules/andy-engine/ — package.json is there
    const pkgPath = require.resolve('andy-engine/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    // Fallback: try index.js parent directory
    try {
      const pkgPath = path.join(
        path.dirname(require.resolve('andy-engine')),
        'package.json'
      );
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version;
    } catch {
      return 'unknown';
    }
  }
}

module.exports = {
  resolveDomain,
  runSegment,
  runDiagnostic,
  getEngineVersion,
};
