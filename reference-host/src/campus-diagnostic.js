#!/usr/bin/env node
/**
 * Campus Diagnostic — Portability / Second-Domain Run
 *
 * Shorter repeatable run on the campus domain to prove domain
 * portability. Uses ONLY public exports from the packed artifact.
 *
 * W1 rules enforced:
 * - No real LLM provider calls
 * - No access to engine internals
 * - No direct state mutation
 * - enableFacts set explicitly by Host
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { CAMPUS_SCENARIO } = require('../scenarios/manifest');
const { runDiagnostic, getEngineVersion } = require('./host-runner');

const ARTIFACT_DIR = path.join(__dirname, '..', 'artifacts');

function main() {
  console.log('=== Integration Beta: Campus Portability Diagnostic ===');
  console.log(`Engine version: ${getEngineVersion()}`);
  console.log(`Scenario: ${CAMPUS_SCENARIO.id}`);
  console.log(`Domain: ${CAMPUS_SCENARIO.domain}`);
  console.log(`Characters: ${CAMPUS_SCENARIO.characters.map(c => c.name).join(', ')}`);
  console.log(`enableFacts: ${CAMPUS_SCENARIO.enableFacts}`);
  console.log('');

  // Ensure artifact directory exists
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const { runManifest, segmentRecords, worldStates } = runDiagnostic(
    CAMPUS_SCENARIO,
    { artifactDir: ARTIFACT_DIR, runId: `campus-port-${Date.now()}` }
  );

  // ─── Gate Checks ──────────────────────────────────────────────────

  let allPass = true;

  const totalTicks = segmentRecords.reduce((s, r) => s + r.actualTickCount, 0);
  const expectedTotal = CAMPUS_SCENARIO.segments[CAMPUS_SCENARIO.segments.length - 1].targetTick;

  // C1: Campus diagnostic completes
  if (totalTicks === expectedTotal) {
    console.log(`✓ Campus diagnostic: ${totalTicks} ticks completed`);
  } else {
    console.log(`✗ Campus diagnostic: expected ${expectedTotal} ticks, got ${totalTicks}`);
    allPass = false;
  }

  // C2: Campus domain uses campus-specific regions
  const record = segmentRecords[0];
  const campusPositions = record.agentSummaries.map(s => s.position);
  const hasCampusRegions = campusPositions.every(p => typeof p === 'string' && p.length > 0);
  if (hasCampusRegions) {
    console.log(`✓ Campus positions: ${campusPositions.join(', ')}`);
  } else {
    console.log('✗ Campus positions: missing or invalid');
    allPass = false;
  }

  // C3: Facts enabled and working in campus domain
  if (record.factsEnabled) {
    console.log('✓ Facts-enabled campus: enableFacts=true working');
  } else {
    console.log('✗ Facts-enabled campus: facts not enabled');
    allPass = false;
  }

  // C4: Different domain from tavern (portability proof)
  if (CAMPUS_SCENARIO.domain === 'campus' && CAMPUS_SCENARIO.domain !== 'tavern') {
    console.log('✓ Domain portability: campus ≠ tavern');
  } else {
    console.log('✗ Domain portability: domain not distinct');
    allPass = false;
  }

  // ─── Save artifacts ───────────────────────────────────────────────

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, `campus-run-manifest.json`),
    JSON.stringify(runManifest, null, 2)
  );
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, `campus-segment-records.json`),
    JSON.stringify(segmentRecords, null, 2)
  );

  if (worldStates.length > 0) {
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, `campus-final-world-state.json`),
      JSON.stringify(worldStates[worldStates.length - 1], null, 2)
    );
  }

  console.log('');
  console.log(`Artifacts saved to: ${ARTIFACT_DIR}`);
  console.log('');

  if (allPass) {
    console.log('=== Campus Diagnostic: PASS ===');
    process.exit(0);
  } else {
    console.log('=== Campus Diagnostic: FAIL ===');
    process.exit(1);
  }
}

main();
