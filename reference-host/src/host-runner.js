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

  // Build segment record (redacted evidence — no raw LLM output, no internals)
  const agents = engine.getAllAgents();
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
    // Observable agent summaries (public API only)
    agentSummaries: agents.map(a => {
      const status = a.getStatus ? a.getStatus() : {};
      return {
        id: a.id,
        name: a.name,
        position: a.position,
        state: status.state,
        // Behavior vector is observable via getStatus()
        behavior: status.behavior ? status.behavior.vector : undefined,
        // Emotion summary is observable via getStatus()
        emotion: status.emotion,
      };
    }),
    // Social graph is observable via public API
    socialEdgeCount: engine.getSocialGraph().toJSON().edges.length,
    // Facts system status — only observable if enableFacts
    factsEnabled: scenario.enableFacts,
    factCount: scenario.enableFacts && engine.getGroundingPackage
      ? (engine.getGroundingPackage(agents[0]?.id) || {}).facts?.length
      : undefined,
    // Tick result phase keys (observability of effect pipeline output)
    tickResultPhases: tickResults.length > 0
      ? Object.keys(tickResults[tickResults.length - 1] || {})
      : [],
    // Gap observations: committed effects are NOT publicly observable
    // in TickResult (A1 observability gap)
    effectObservability: 'not_observable_via_public_api',
    gapId: 'A1',
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
