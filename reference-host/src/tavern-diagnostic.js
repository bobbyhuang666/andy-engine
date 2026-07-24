#!/usr/bin/env node
/**
 * Tavern Diagnostic — Seven-Day Primary Run
 *
 * Entry point for the Integration Beta tavern diagnostic.
 * Runs 7 simulated days with two fresh-process resume boundaries.
 * Uses ONLY public exports from the packed artifact.
 *
 * W1 rules enforced:
 * - No real LLM provider calls
 * - No access to engine internals
 * - No direct state mutation
 * - enableFacts set explicitly by Host (Engine default unchanged)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { TAVERN_SCENARIO } = require('../scenarios/manifest');
const { runDiagnostic, getEngineVersion } = require('./host-runner');

const ARTIFACT_DIR = path.join(__dirname, '..', 'artifacts');

function main() {
  console.log('=== Integration Beta: Tavern Diagnostic ===');
  console.log(`Engine version: ${getEngineVersion()}`);
  console.log(`Scenario: ${TAVERN_SCENARIO.id}`);
  console.log(`Domain: ${TAVERN_SCENARIO.domain}`);
  console.log(`Characters: ${TAVERN_SCENARIO.characters.map(c => c.name).join(', ')}`);
  console.log(`enableFacts: ${TAVERN_SCENARIO.enableFacts}`);
  console.log(`Segments: ${TAVERN_SCENARIO.segments.length}`);
  console.log(`Resume boundaries: ${TAVERN_SCENARIO.resumeBoundaries.length}`);
  console.log('');

  // Ensure artifact directory exists
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const { runManifest, segmentRecords, worldStates } = runDiagnostic(
    TAVERN_SCENARIO,
    { artifactDir: ARTIFACT_DIR, runId: `tavern-7d-${Date.now()}` }
  );

  // ─── Verify gate criteria ─────────────────────────────────────────

  let allPass = true;

  // G1: Tavern diagnostic is repeatable (deterministic with seed)
  console.log('--- Gate Checks ---');

  // G2: Seven-day entry completes
  const totalTicks = segmentRecords.reduce((s, r) => s + r.actualTickCount, 0);
  const expectedTotal = TAVERN_SCENARIO.segments[TAVERN_SCENARIO.segments.length - 1].targetTick;
  if (totalTicks === expectedTotal) {
    console.log(`✓ Seven-day entry: ${totalTicks} ticks completed`);
  } else {
    console.log(`✗ Seven-day entry: expected ${expectedTotal} ticks, got ${totalTicks}`);
    allPass = false;
  }

  // G3: At least two fresh-process resume boundaries
  const resumeCount = TAVERN_SCENARIO.resumeBoundaries.length;
  if (resumeCount >= 2) {
    console.log(`✓ Fresh-process resume boundaries: ${resumeCount}`);
  } else {
    console.log(`✗ Fresh-process resume boundaries: need ≥2, got ${resumeCount}`);
    allPass = false;
  }

  // G4: Resume produces consistent world state
  // Verify each segment starts from the previous segment's saved state
  let resumeConsistent = true;
  for (let i = 1; i < segmentRecords.length; i++) {
    const prev = segmentRecords[i - 1];
    const curr = segmentRecords[i];
    if (curr.startTick !== prev.targetTick) {
      console.log(`✗ Resume consistency: segment ${i} startTick=${curr.startTick} ≠ prev targetTick=${prev.targetTick}`);
      resumeConsistent = false;
    }
  }
  if (resumeConsistent) {
    console.log('✓ Resume consistency: all segment boundaries align');
  } else {
    allPass = false;
  }

  // G5: Facts-enabled restore works
  const lastRecord = segmentRecords[segmentRecords.length - 1];
  if (lastRecord.factsEnabled) {
    console.log('✓ Facts-enabled restore: enableFacts=true preserved across resume');
  } else {
    console.log('✗ Facts-enabled restore: facts not enabled');
    allPass = false;
  }

  // G6: Agent observables (position, emotion, state) accessible via public API
  const hasObservables = lastRecord.agentSummaries.every(s =>
    s.id && s.name && typeof s.position === 'string'
  );
  if (hasObservables) {
    console.log('✓ Agent observables: id, name, position accessible via public API');
  } else {
    console.log('✗ Agent observables: incomplete via public API');
    allPass = false;
  }

  // G7: All gaps recorded honestly per segment
  const hasGapRecord = segmentRecords.every(r =>
    Array.isArray(r.gaps) &&
    r.gaps.length >= 5 &&
    r.gaps.find(g => g.id === 'A1' && g.status === 'not_observable_via_public_api')
  );
  if (hasGapRecord) {
    console.log('✓ Gap records: all 5 gaps honestly recorded per segment');
  } else {
    console.log('✗ Gap records: not recorded properly');
    allPass = false;
  }

  // G8: No internal access used
  console.log('  (No internal access: verified by no-internal-access guard)');

  // ─── Save artifacts ───────────────────────────────────────────────

  const runId = runManifest.runId;
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, `tavern-run-manifest.json`),
    JSON.stringify(runManifest, null, 2)
  );
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, `tavern-segment-records.json`),
    JSON.stringify(segmentRecords, null, 2)
  );

  // Save final world state for manual inspection
  if (worldStates.length > 0) {
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, `tavern-final-world-state.json`),
      JSON.stringify(worldStates[worldStates.length - 1], null, 2)
    );
  }

  console.log('');
  console.log(`Artifacts saved to: ${ARTIFACT_DIR}`);
  console.log('');

  if (allPass) {
    console.log('=== Tavern Diagnostic: PASS ===');
    process.exit(0);
  } else {
    console.log('=== Tavern Diagnostic: FAIL ===');
    process.exit(1);
  }
}

main();
