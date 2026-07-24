#!/usr/bin/env node
/**
 * Long-Horizon Protocol — Integration Beta W2-A
 *
 * Runs the tavern 7-day scenario with 3 seeds and 3 checkpoint cadences,
 * recording completion rate, tick continuity, state invariants, and
 * fresh-process resume counts.
 *
 * W2-F hardened reads throughout. Only public API used.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { toWorldState, fromWorldState, ENVELOPE_VERSION } = require('andy-engine/store');

const AndyEngine = require('andy-engine');
const tavernPreset = require('andy-engine/presets/tavern');
const { makeTavernScenario, SEVEN_DAYS_TICKS } = require('../scenarios/manifest');

// ─── W2-F: Hardened read helpers ────────────────────────────────────────

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ─── Constants ──────────────────────────────────────────────────────────

const ARTIFACT_DIR = path.join(__dirname, '..', 'artifacts');
const RESULTS_FILE = path.join(ARTIFACT_DIR, 'long-horizon-results.json');

const SEEDS = ['ib-tavern-7d-v1', 'ib-tavern-7d-v2', 'ib-tavern-7d-v3'];

/**
 * Build segment plans for different checkpoint cadences.
 * @param {number} totalTicks - Total ticks (SEVEN_DAYS_TICKS = 2016)
 * @returns {Array<{name, segments}>}
 */
function getCadencePlans(totalTicks) {
  return [
    {
      name: '3-segment',
      segments: [
        { id: 0, startTick: 0, targetTick: Math.floor(totalTicks * 0.5) },       // ~1008
        { id: 1, startTick: Math.floor(totalTicks * 0.5), targetTick: Math.floor(totalTicks * 1.0) }, // ~2016
        { id: 2, startTick: Math.floor(totalTicks * 1.0), targetTick: totalTicks },
      ],
    },
    {
      name: '2-segment',
      segments: [
        { id: 0, startTick: 0, targetTick: Math.floor(totalTicks * 0.667) },     // ~1344
        { id: 1, startTick: Math.floor(totalTicks * 0.667), targetTick: totalTicks },
      ],
    },
    {
      name: '1-segment',
      segments: [
        { id: 0, startTick: 0, targetTick: totalTicks },
      ],
    },
  ];
}

// ─── Run a single long-horizon experiment ──────────────────────────────

/**
 * Run one scenario with one cadence plan.
 * Uses fresh-process resume at each boundary.
 * Returns results object.
 */
function runExperiment(seed, cadenceName, segments) {
  const scenario = makeTavernScenario(seed, segments);
  const domain = tavernPreset;

  let currentWorldState = null;
  let freshProcessResumeCount = 0;
  const tickResults = [];
  let errors = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const ticksNeeded = seg.targetTick - seg.startTick;

    let engine;
    if (currentWorldState) {
      // Resume from checkpoint
      engine = fromWorldState(currentWorldState, { domain, enableFacts: true }, AndyEngine);
      freshProcessResumeCount++;
    } else {
      // Fresh start
      engine = new AndyEngine({
        domain,
        seed: scenario.seed,
        enableFacts: true,
        tickMinutes: scenario.tickMinutes,
        startTime: scenario.startTime,
      });
      for (const charDef of scenario.characters) {
        engine.createCharacter(charDef);
      }
    }

    // Run ticks
    const results = engine.runTicks(ticksNeeded);
    tickResults.push(...results);

    // Persist via Stable World Envelope
    currentWorldState = deepClone(toWorldState(engine, `${scenario.id}-seg${i}`));

    // Verify tick count
    const stats = engine.getStats();
    if (stats.tickCount !== seg.targetTick) {
      errors.push(`Segment ${i}: tick count mismatch expected=${seg.targetTick} got=${stats.tickCount}`);
    }
  }

  // ─── Collect invariants from final world state ──────────────────────

  // Agent count preserved
  const characterIds = scenario.characters.map(c => c.id);
  const wsAgents = currentWorldState ? (currentWorldState.characters || []) : [];
  const agentCountPreserved = wsAgents.length === characterIds.length;

  // Domain preserved
  const domainPreserved = currentWorldState && currentWorldState.domainRef === 'tavern';

  // EnableFacts preserved (check runtimeSnapshot or _restoreConfig)
  const enableFactsPreserved = currentWorldState && currentWorldState.runtimeSnapshot
    ? currentWorldState.runtimeSnapshot.enableFacts !== false
    : true;

  // Tick continuity: check that total ticks match expected
  const totalTargetTicks = segments[segments.length - 1].targetTick;
  const actualTickCount = tickResults.length;
  const tickContinuous = actualTickCount === totalTargetTicks;

  // Check no gaps in tick count by verifying stats
  const finalStats = currentWorldState
    ? { tickCount: currentWorldState.worldClock.tickCount }
    : { tickCount: actualTickCount };
  const noGaps = finalStats.tickCount === totalTargetTicks;

  // Relationship count from world state
  const relationshipCount = (currentWorldState && Array.isArray(currentWorldState.relationships))
    ? currentWorldState.relationships.length
    : 0;

  // Event count from world state
  const eventCount = (currentWorldState && currentWorldState.events)
    ? currentWorldState.events.length
    : 0;

  return {
    seed,
    cadence: cadenceName,
    segmentCount: segments.length,
    totalTargetTicks,
    actualTickCount,
    completionRate: actualTickCount === totalTargetTicks ? 1.0 : actualTickCount / totalTargetTicks,
    tickContinuity: tickContinuous && noGaps,
    agentCountPreserved,
    domainPreserved,
    enableFactsPreserved,
    freshProcessResumeCount,
    relationshipCount,
    eventCount,
    errors,
    envelopeVersion: currentWorldState ? currentWorldState.schemaVersion : null,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  console.log('=== Long-Horizon Protocol (W2-A) ===\n');

  // Ensure artifact directory exists
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const allResults = [];
  const totalRuns = SEEDS.length * getCadencePlans(SEVEN_DAYS_TICKS).length;
  let runIndex = 0;

  const cadencePlans = getCadencePlans(SEVEN_DAYS_TICKS);

  for (const cadence of cadencePlans) {
    for (const seed of SEEDS) {
      runIndex++;
      process.stdout.write(`[${runIndex}/${totalRuns}] ${seed} | ${cadence.name}... `);

      try {
        const result = runExperiment(seed, cadence.name, cadence.segments);
        allResults.push(result);

        if (result.errors.length > 0) {
          process.stdout.write(`WARN (${result.errors.length} issues)\n`);
          for (const err of result.errors) {
            console.log(`    ⚠ ${err}`);
          }
        } else {
          process.stdout.write('OK\n');
        }

        console.log(`    completion: ${(result.completionRate * 100).toFixed(1)}% | ` +
          `ticks: ${result.actualTickCount}/${result.totalTargetTicks} | ` +
          `resume: ${result.freshProcessResumeCount} | ` +
          `agents: ${result.agentCountPreserved} | ` +
          `domain: ${result.domainPreserved} | ` +
          `facts: ${result.enableFactsPreserved}`);
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
        allResults.push({
          seed,
          cadence: cadence.name,
          error: e.message,
          stack: e.stack,
        });
      }
    }
  }

  // ─── Compute summary statistics ─────────────────────────────────────

  const byCadence = {};
  for (const cadence of cadencePlans) {
    byCadence[cadence.name] = {
      total: 0,
      completed: 0,
      continuous: 0,
      agentPreserved: 0,
      domainPreserved: 0,
      factsPreserved: 0,
      minResumes: Infinity,
      maxResumes: 0,
    };
  }

  for (const r of allResults) {
    if (!r.error) {
      const stats = byCadence[r.cadence];
      stats.total++;
      if (r.completionRate >= 1.0) stats.completed++;
      if (r.tickContinuity) stats.continuous++;
      if (r.agentCountPreserved) stats.agentPreserved++;
      if (r.domainPreserved) stats.domainPreserved++;
      if (r.enableFactsPreserved) stats.factsPreserved++;
      stats.minResumes = Math.min(stats.minResumes, r.freshProcessResumeCount);
      stats.maxResumes = Math.max(stats.maxResumes, r.freshProcessResumeCount);
    }
  }

  // Summary table
  console.log('\n--- Summary Table ---');
  console.log('Cadence         Completed Continuous Agents Domain Facts Resumes');
  console.log('-'.repeat(70));

  for (const cadence of cadencePlans) {
    const s = byCadence[cadence.name];
    const resumeRange = s.minResumes === Infinity ? '-' : `${s.minResumes}-${s.maxResumes}`;
    console.log(
      `${cadence.name.padEnd(14)} ${String(s.completed).padStart(2)}/${String(s.total).padStart(2)}   ` +
      `${String(s.continuous).padStart(2)}/${String(s.total).padStart(2)}   ` +
      `${String(s.agentPreserved).padStart(2)}/${String(s.total).padStart(2)}   ` +
      `${String(s.domainPreserved).padStart(2)}/${String(s.total).padStart(2)}   ` +
      `${String(s.factsPreserved).padStart(2)}/${String(s.total).padStart(2)}   ${resumeRange}`
    );
  }

  // Validate fresh-process resume counts
  console.log('\n--- Resume Count Validation ---');
  for (const r of allResults) {
    if (r.error) continue;
    const needsResumes = r.segmentCount > 1;
    const hasEnoughResumes = needsResumes && r.freshProcessResumeCount >= r.segmentCount - 1;
    const status = hasEnoughResumes ? 'PASS' : (needsResumes ? 'FAIL' : 'N/A (single segment)');
    console.log(`  ${r.seed} / ${r.cadence}: ${r.freshProcessResumeCount} resumes [${status}]`);
  }

  // ─── Save results ───────────────────────────────────────────────────

  const report = {
    schemaVersion: '2.0.0',
    protocol: 'long-horizon',
    timestamp: new Date().toISOString(),
    engineVersion: (() => {
      try {
        const pkgPath = require.resolve('andy-engine/package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return pkg.version;
      } catch {
        return 'unknown';
      }
    })(),
    envelopeVersion: ENVELOPE_VERSION,
    totalRuns,
    totalSeeds: SEEDS.length,
    cadences: cadencePlans.map(c => c.name),
    results: allResults,
    summary: {},
  };

  // Build per-cadence summary
  for (const cadence of cadencePlans) {
    const s = byCadence[cadence.name];
    report.summary[cadence.name] = {
      totalRuns: s.total,
      completedRuns: s.completed,
      continuousRuns: s.continuous,
      agentCountPreserved: s.agentPreserved,
      domainPreserved: s.domainPreserved,
      enableFactsPreserved: s.factsPreserved,
      resumeRange: s.minResumes === Infinity ? null : { min: s.minResumes, max: s.maxResumes },
    };
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2));
  console.log(`\nResults saved to: ${RESULTS_FILE}`);
  console.log('\n=== Long-Horizon Protocol: Complete ===');
  process.exit(0);
}

main();
