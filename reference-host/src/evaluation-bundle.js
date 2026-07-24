/**
 * Evaluation Bundle — Host-owned tooling for blinded evidence assembly
 *
 * Assembles public Engine API outputs into a structured, blinded package
 * for automated metrics and human review. Addresses A4 gap.
 *
 * This module NEVER accesses engine internals (engine.world, regions,
 * dispatcher, EffectCommitter, etc.), NEVER modifies engine state, and
 * NEVER imports from src/ paths. It consumes only public API outputs.
 *
 * Per IB_EVALUATION_BUNDLE_CONTRACT.md:
 *   - Fact content is NOT included (only counts)
 *   - Raw LLM output is NOT included
 *   - Memory content is NOT included
 *   - Snapshot hashes, not full snapshots
 *   - Narrative text IS included (for human review)
 */

'use strict';

const crypto = require('crypto');

/**
 * Compute a SHA-256 content hash of a value.
 * @param {*} value - Any JSON-serializable value
 * @returns {string} Hex-encoded SHA-256 hash
 */
function contentHash(value) {
  const serialized = JSON.stringify(value);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Create an evaluation bundle from a diagnostic run.
 *
 * @param {Object} params
 * @param {Object} params.engine - AndyEngine instance (public APIs only)
 * @param {string} params.worldId - World identifier from the run manifest
 * @param {Object} params.tickRange - { start, end } tick numbers
 * @param {Object[]} [params.tickResults] - TickResult[] from runTicks()
 * @param {Object[]} [params.snapshots] - { tickNumber, snapshot } at key boundaries
 * @param {string|number} [params.seed] - Seed used for the run
 * @returns {Object} EvaluationBundle
 */
function createEvaluationBundle(params) {
  const {
    engine,
    worldId,
    tickRange,
    tickResults = [],
    snapshots = [],
    seed = 'unknown',
  } = params;

  if (!engine || !worldId || !tickRange) {
    throw new Error('createEvaluationBundle requires engine, worldId, and tickRange');
  }

  // ─── Character summaries (from snapshot, not live handles) ───
  const snapshot = engine.snapshot();
  const characters = Object.entries(snapshot.agents || {}).map(([id, status]) => ({
    id,
    name: status.name,
    position: status.position,
  }));

  // ─── Engine version ───
  let engineVersion = 'unknown';
  try {
    const pkgPath = require.resolve('andy-engine/package.json');
    const pkg = require(pkgPath);
    engineVersion = pkg.version || 'unknown';
  } catch (_) {
    // Fallback: version not determinable
  }

  // ─── Evidence chain (per-tick summaries) ───
  const evidenceChain = tickResults.map((tr) => {
    const entry = {
      tickNumber: tr.tickNumber,
      time: tr.time,
      snapshotHash: '', // populated below if matching snapshot exists
    };

    // A1: effectSummary from tick result
    if (tr.phase && tr.phase.effectSummary) {
      entry.effectSummary = {
        counts: { ...tr.phase.effectSummary.counts },
        byType: { ...tr.phase.effectSummary.byType },
      };
    }

    // Grounding fact counts (only for agents present in this tick)
    if (tr.phase && tr.phase.agentThink && tr.phase.agentThink.results) {
      const agentIds = Object.keys(tr.phase.agentThink.results);
      if (agentIds.length > 0) {
        // Sample first agent for grounding counts (not all agents for brevity)
        const sampleAgentId = agentIds[0];
        const gp = engine.getGroundingPackage(sampleAgentId);
        if (gp && gp.metadata && gp.metadata.factCount) {
          entry.groundingFactCounts = {
            allowed: gp.metadata.factCount.allowed || 0,
            inferred: gp.metadata.factCount.inferred || 0,
            forbidden: gp.metadata.factCount.forbidden || 0,
          };
        }
      }
    }

    // Snapshot hash for this tick
    const matchingSnapshot = snapshots.find(s => s.tickNumber === tr.tickNumber);
    if (matchingSnapshot && matchingSnapshot.snapshot) {
      entry.snapshotHash = contentHash(matchingSnapshot.snapshot);
    } else {
      // No explicit snapshot for this tick; record absence
      entry.snapshotHash = 'no_snapshot_captured';
    }

    return entry;
  });

  // ─── Blinded outputs (narrative + counts for human review) ───
  const blindedOutputs = [];
  for (const tr of tickResults) {
    if (!tr.phase || !tr.phase.agentThink || !tr.phase.agentThink.results) continue;

    for (const [agentId, agentResult] of Object.entries(tr.phase.agentThink.results)) {
      // Only include if there's narrative text available
      let narrative = '';
      try {
        narrative = engine.getNarrative(agentId);
      } catch (_) {
        // Narrative not available for this agent/tick
        continue;
      }

      if (typeof narrative !== 'string' || narrative.length === 0) continue;

      const entry = {
        agentId,
        tickNumber: tr.tickNumber,
        narrative,
        groundingSummary: { allowed: 0, inferred: 0, forbidden: 0 },
        consistency: { valid: true, violationCount: 0, severity: 'pass' },
      };

      // Grounding summary (counts only, no fact content)
      const gp = engine.getGroundingPackage(agentId);
      if (gp && gp.metadata && gp.metadata.factCount) {
        entry.groundingSummary = {
          allowed: gp.metadata.factCount.allowed || 0,
          inferred: gp.metadata.factCount.inferred || 0,
          forbidden: gp.metadata.factCount.forbidden || 0,
        };
      }

      // Effect summary for this tick
      if (tr.phase.effectSummary) {
        entry.effectSummary = {
          counts: { ...tr.phase.effectSummary.counts },
        };
      }

      blindedOutputs.push(entry);
    }
  }

  // ─── Bundle metadata ───
  const metadata = {
    domainId: engine.domain ? engine.domain.id : 'unknown',
    seed,
    agentCount: characters.length,
    totalTicks: tickRange.end - tickRange.start + 1,
    bundleSchemaVersion: '1.0.0',
  };

  // ─── Assemble bundle ───
  return {
    bundleId: crypto.randomUUID(),
    worldId,
    tickRange: { start: tickRange.start, end: tickRange.end },
    createdAt: new Date().toISOString(),
    engineVersion,
    characters,
    evidenceChain,
    blindedOutputs,
    metadata,
  };
}

/**
 * Verify that an evaluation bundle conforms to the contract schema.
 * Returns { valid, errors[] }.
 *
 * @param {Object} bundle - Evaluation bundle to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBundle(bundle) {
  const errors = [];

  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, errors: ['bundle is not an object'] };
  }

  // Required top-level fields
  const requiredFields = ['bundleId', 'worldId', 'tickRange', 'createdAt',
    'engineVersion', 'characters', 'evidenceChain', 'blindedOutputs', 'metadata'];
  for (const field of requiredFields) {
    if (!(field in bundle)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  // tickRange shape
  if (bundle.tickRange) {
    if (typeof bundle.tickRange.start !== 'number') errors.push('tickRange.start is not a number');
    if (typeof bundle.tickRange.end !== 'number') errors.push('tickRange.end is not a number');
  }

  // metadata schema version
  if (bundle.metadata && bundle.metadata.bundleSchemaVersion !== '1.0.0') {
    errors.push(`unexpected bundleSchemaVersion: ${bundle.metadata.bundleSchemaVersion}`);
  }

  // Blinding check: no fact content should appear
  const serialized = JSON.stringify(bundle);
  // Check for patterns that indicate leaked internal content
  // (This is a heuristic check, not a guarantee)
  const forbiddenPatterns = [
    /"allowedFacts"\s*:\s*\[/,  // raw fact arrays
    /"inferredFacts"\s*:\s*\[/,
    /"forbiddenFacts"\s*:\s*\[/,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) {
      errors.push(`blinding violation: pattern ${pattern.source} found in bundle`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { createEvaluationBundle, validateBundle, contentHash };
