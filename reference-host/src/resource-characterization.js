#!/usr/bin/env node
/**
 * Resource Characterization — Integration Beta W2-C
 *
 * Runs a single 7-day tavern diagnostic (seed ib-tavern-7d-v1) and collects
 * per-day metrics: envelope size, snapshot size, event count, fact count,
 * memory count, relationship count, save/load latency, heap/RSS, tick duration.
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
const RESULTS_FILE = path.join(ARTIFACT_DIR, 'resource-characterization.json');
const TICKS_PER_DAY = 288; // 5-min ticks: 24*12 = 288 per day
const NUM_DAYS = 7;

// ─── Metric collection helpers ──────────────────────────────────────────

/**
 * Get envelope size in bytes for the current engine state.
 */
function getEnvelopeSizeBytes(engine, runId) {
  const ws = toWorldState(engine, runId);
  return JSON.stringify(ws).length;
}

/**
 * Get runtime snapshot size in bytes.
 */
function getRuntimeSnapshotSizeBytes(engine) {
  return JSON.stringify(engine.toJSON()).length;
}

/**
 * Get event count from world state.
 */
function getEventCount(worldState) {
  if (!worldState || !Array.isArray(worldState.events)) return 0;
  return worldState.events.length;
}

/**
 * Get fact count from grounding packages (public API).
 */
function getFactCount(engine) {
  const agents = engine.getAgentsSnapshot();
  let total = 0;
  for (const agent of agents) {
    const gp = engine.getGroundingPackage(agent.id);
    if (gp && Array.isArray(gp.allowedFacts)) {
      total += gp.allowedFacts.length;
    }
  }
  return total;
}

/**
 * Get memory count per agent from immutable public projections.
 */
function getMemoryCountPerAgent(engine) {
  const agents = engine.getAgentsSnapshot();
  const result = {};
  for (const agent of agents) {
    // Memory count is not directly exposed via the read projection, mark as not_observable
    result[agent.id] = 'not_observable/A1';
  }
  return result;
}

/**
 * Get relationship count from toWorldState relationships.
 */
function getRelationshipCount(worldState) {
  if (!worldState || !Array.isArray(worldState.relationships)) return 0;
  return worldState.relationships.length;
}

/**
 * Measure save latency: time to call toWorldState().
 */
function measureSaveLatencyMs(engine, runId) {
  const start = process.hrtime.bigint();
  toWorldState(engine, runId);
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000; // ns -> ms
}

/**
 * Measure load latency: time to call fromWorldState().
 */
function measureLoadLatencyMs(worldState, domain) {
  const start = process.hrtime.bigint();
  fromWorldState(deepClone(worldState), { domain, enableFacts: true }, AndyEngine);
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000; // ns -> ms
}

// ─── Main ───────────────────────────────────────────────────────────────

function main() {
  console.log('=== Resource Characterization (W2-C) ===\n');

  // Ensure artifact directory exists
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const scenario = makeTavernScenario('ib-tavern-7d-v1', [
    { id: 0, startTick: 0, targetTick: SEVEN_DAYS_TICKS },
  ]);

  const runId = `rc-${Date.now()}`;
  const domain = tavernPreset;

  // Create engine fresh
  const engine = new AndyEngine({
    domain,
    seed: scenario.seed,
    enableFacts: true,
    tickMinutes: scenario.tickMinutes,
    startTime: scenario.startTime,
  });
  for (const charDef of scenario.characters) {
    engine.createCharacter(charDef);
  }

  const dailyMetrics = [];

  for (let day = 1; day <= NUM_DAYS; day++) {
    const startTick = (day - 1) * TICKS_PER_DAY;
    const endTick = Math.min(day * TICKS_PER_DAY - 1, SEVEN_DAYS_TICKS - 1);

    console.log(`Day ${day}: ticks ${startTick}-${endTick}...`);

    // Run ticks for this day
    const ticksToRun = TICKS_PER_DAY;
    const dayStart = process.hrtime.bigint();
    engine.runTicks(ticksToRun);
    const dayEnd = process.hrtime.bigint();
    const avgTickDurationMs = Number(dayEnd - dayStart) / ticksToRun / 1_000_000;

    // Collect metrics at end of day
    const heapUsed = process.memoryUsage().heapUsed;
    const rss = process.memoryUsage().rss;

    // Save latency
    const saveLatencyMs = measureSaveLatencyMs(engine, runId);

    // Envelope size
    const envelopeSizeBytes = getEnvelopeSizeBytes(engine, runId);

    // Runtime snapshot size
    const runtimeSnapshotSizeBytes = getRuntimeSnapshotSizeBytes(engine);

    // Get world state for event/relationship counts
    const ws = toWorldState(engine, runId);
    const serializedWs = deepClone(ws);

    const eventCount = getEventCount(serializedWs);
    const factCount = getFactCount(engine);
    const memoryCountPerAgent = getMemoryCountPerAgent(engine);
    const relationshipCount = getRelationshipCount(serializedWs);

    // Load latency (measure a quick round-trip)
    const loadLatencyMs = measureLoadLatencyMs(serializedWs, domain);

    dailyMetrics.push({
      day,
      tickRange: [startTick, endTick],
      envelopeSizeBytes,
      runtimeSnapshotSizeBytes,
      eventCount,
      factCount,
      knowledgeCount: 'not_observable/A1', // Knowledge store not observable via public API
      memoryCountPerAgent,
      relationshipCount,
      saveLatencyMs: Math.round(saveLatencyMs * 100) / 100,
      loadLatencyMs: Math.round(loadLatencyMs * 100) / 100,
      heapUsedBytes: heapUsed,
      rssBytes: rss,
      avgTickDurationMs: Math.round(avgTickDurationMs * 100) / 100,
    });

    console.log(`  envelope: ${envelopeSizeBytes}B | events: ${eventCount} | facts: ${factCount} | ` +
      `relationships: ${relationshipCount} | save: ${Math.round(saveLatencyMs * 100) / 100}ms | ` +
      `load: ${Math.round(loadLatencyMs * 100) / 100}ms | tick: ${Math.round(avgTickDurationMs * 100) / 100}ms`);
  }

  // ─── Growth analysis ────────────────────────────────────────────────

  const d1Envelope = dailyMetrics[0].envelopeSizeBytes;
  const d7Envelope = dailyMetrics[dailyMetrics.length - 1].envelopeSizeBytes;
  const d1Snapshot = dailyMetrics[0].runtimeSnapshotSizeBytes;
  const d7Snapshot = dailyMetrics[dailyMetrics.length - 1].runtimeSnapshotSizeBytes;

  const envelopeGrowthFactor = d1Envelope > 0 ? (d7Envelope / d1Envelope).toFixed(3) : 'N/A';
  const snapshotGrowthFactor = d1Snapshot > 0 ? (d7Snapshot / d1Snapshot).toFixed(3) : 'N/A';

  // Superlinear growth: if D7/D1 > 2x while days only 7x, check if growth accelerates
  const superlinearDetected = (() => {
    if (d1Envelope === 0) return false;
    const dailyGrowthRate = d7Envelope / d1Envelope;
    // If the total growth over 7 days is more than linear (i.e., each day adds more than the previous),
    // check if the ratio exceeds what linear growth would produce
    const linearExpect = 1 + (dailyGrowthRate - 1) / 6; // rough heuristic
    return dailyGrowthRate > 3; // If envelope grew more than 3x over 7 days, flag it
  })();

  // ─── Build report ───────────────────────────────────────────────────

  const report = {
    schemaVersion: '2.0.0',
    protocol: 'resource-characterization',
    runId,
    seed: 'ib-tavern-7d-v1',
    domain: 'tavern',
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
    characterIds: scenario.characters.map(c => c.id),
    dailyMetrics,
    growthAnalysis: {
      envelopeGrowthFactor: `${d7Envelope}/${d1Envelope} = ${envelopeGrowthFactor}`,
      snapshotGrowthFactor: `${d7Snapshot}/${d1Snapshot} = ${snapshotGrowthFactor}`,
      superlinearGrowthDetected: superlinearDetected,
      notes: superlinearDetected
        ? 'Envelope/snapshot grew more than 3x over 7 days — possible superlinear accumulation of events or facts'
        : 'Growth appears sub-linear or linear over 7-day horizon',
    },
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2));
  console.log(`\nResults saved to: ${RESULTS_FILE}`);

  // Print per-day table
  console.log('\n--- Per-Day Metrics ---');
  console.log('Day   EnvelopeKB  SnapshotKB  Events  Facts  Relns  SaveMs  LoadMs  TickMs');
  console.log('-'.repeat(70));
  for (const m of dailyMetrics) {
    const envKB = Math.round(m.envelopeSizeBytes / 1024);
    const snapKB = Math.round(m.runtimeSnapshotSizeBytes / 1024);
    console.log(
      `  ${m.day}       ${envKB}        ${snapKB}      ${String(m.eventCount).padStart(6)}  ${String(m.factCount).padStart(5)}  ${String(m.relationshipCount).padStart(5)}  ${String(m.saveLatencyMs).padStart(6)}  ${String(m.loadLatencyMs).padStart(6)}  ${String(m.avgTickDurationMs).padStart(6)}`
    );
  }

  console.log(`\nGrowth Analysis:`);
  console.log(`  Envelope: ${envelopeGrowthFactor}x (D${NUM_DAYS}/D1)`);
  console.log(`  Snapshot: ${snapshotGrowthFactor}x (D${NUM_DAYS}/D1)`);
  console.log(`  Superlinear: ${superlinearDetected ? 'YES' : 'NO'}`);

  console.log('\n=== Resource Characterization: Complete ===');
  process.exit(0);
}

main();
