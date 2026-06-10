/**
 * Social Contagion Pipeline Profiling — Andy Engine v0.2.0
 *
 * 测量优化后的 social contagion pipeline。
 *
 * 区分两种模式：
 *   - fixed-density: 只调用 _buildEmotionBlendCache + _gatherContagionInputs
 *   - runtime: 完整 engine.tick()
 *
 * 用法：
 *   node benchmarks/contagion-profile.js [agentCount] [tickCount]
 *   node benchmarks/contagion-profile.js quick
 */

const fs = require('fs');
const AndyEngine = require('../index');

const QUICK_CONFIG = { agents: 100, ticks: 30, label: '100 agents' };
const FULL_CONFIG = { agents: 300, ticks: 20, label: '300 agents' };

function createEngine(agentCount, clusterMode) {
  const engine = new AndyEngine({
    startTime: new Date('2024-01-15T08:00:00'),
  });

  const emptySchedule = { entries: [] };

  for (let i = 0; i < agentCount; i++) {
    const mbti = ['INFP', 'ENFP', 'ISTJ', 'ESTJ', 'INTJ', 'ENTJ', 'ISFP', 'ESFP'][i % 8];

    let initialPosition;
    if (clusterMode === 'clustered') {
      initialPosition = '校园广场';
    } else if (clusterMode === 'dispersed') {
      const regions = ['宿舍', '教学楼', '图书馆', '食堂', '校园广场', '咖啡店'];
      initialPosition = regions[i % regions.length];
    } else {
      if (i < agentCount / 2) {
        initialPosition = '校园广场';
      } else {
        const regions = ['宿舍', '教学楼', '图书馆', '食堂', '咖啡店'];
        initialPosition = regions[i % regions.length];
      }
    }

    engine.createCharacter({
      id: `agent_${i}`,
      name: `Agent ${i}`,
      mbti,
      schedule: emptySchedule,
      initialPosition,
    });
  }

  return engine;
}

function runFixedDensityProfile(agentCount, tickCount, clusterMode) {
  if (global.gc) global.gc();

  const engine = createEngine(agentCount, clusterMode);
  const SimulatorProto = Object.getPrototypeOf(engine.simulator);

  const agents = Array.from(engine.world.agents.values());
  const startTime = process.hrtime.bigint();

  const cacheStats = { totalMs: 0, calls: 0 };
  const gatherStats = { totalMs: 0, calls: 0, totalEntries: 0, relationshipLookups: 0 };
  const neighborStats = { total: 0, max: 0, count: 0 };

  for (let t = 0; t < tickCount; t++) {
    // 测量 cache build
    const cacheStart = process.hrtime.bigint();
    const cache = SimulatorProto._buildEmotionBlendCache.call(engine.simulator);
    const cacheEnd = process.hrtime.bigint();
    cacheStats.totalMs += Number(cacheEnd - cacheStart) / 1e6;
    cacheStats.calls++;

    // 测量 gather（使用真实 cache）
    for (const agent of agents) {
      const gatherStart = process.hrtime.bigint();
      const result = SimulatorProto._gatherContagionInputs.call(engine.simulator, agent.id, agent, cache);
      const gatherEnd = process.hrtime.bigint();
      gatherStats.totalMs += Number(gatherEnd - gatherStart) / 1e6;
      gatherStats.calls++;

      if (result) {
        const entries = Object.keys(result).length;
        gatherStats.totalEntries += entries;
        gatherStats.relationshipLookups += entries;
        neighborStats.total += entries;
        neighborStats.max = Math.max(neighborStats.max, entries);
        neighborStats.count++;
      }
    }
  }

  const endTime = process.hrtime.bigint();
  const totalMs = Number(endTime - startTime) / 1e6;
  const avgNeighbors = neighborStats.count > 0 ? Math.round(neighborStats.total / neighborStats.count * 100) / 100 : 0;

  return {
    mode: 'fixed-density',
    config: { agentCount, tickCount, clusterMode },
    totalMs: Math.round(totalMs),
    cache: {
      totalMs: Math.round(cacheStats.totalMs * 100) / 100,
      calls: cacheStats.calls,
      avgMs: Math.round((cacheStats.totalMs / cacheStats.calls) * 1000) / 1000,
      percentOfTotal: Math.round((cacheStats.totalMs / totalMs) * 10000) / 100,
    },
    gather: {
      totalMs: Math.round(gatherStats.totalMs * 100) / 100,
      calls: gatherStats.calls,
      avgMs: Math.round((gatherStats.totalMs / gatherStats.calls) * 1000) / 1000,
      percentOfTotal: Math.round((gatherStats.totalMs / totalMs) * 10000) / 100,
    },
    contagionStats: {
      totalEntries: gatherStats.totalEntries,
      relationshipLookups: gatherStats.relationshipLookups,
      avgNeighbors,
      maxNeighbors: neighborStats.max,
    },
    warnings: [],
    agents: agentCount,
    ticks: tickCount,
  };
}

function runRuntimeProfile(agentCount, tickCount, clusterMode) {
  if (global.gc) global.gc();

  const engine = createEngine(agentCount, clusterMode);
  const SimulatorProto = Object.getPrototypeOf(engine.simulator);

  // Wrap methods
  const stats = {};
  const originalBuild = SimulatorProto._buildEmotionBlendCache;
  const originalGather = SimulatorProto._gatherContagionInputs;

  SimulatorProto._buildEmotionBlendCache = function () {
    const start = process.hrtime.bigint();
    const result = originalBuild.call(this);
    const end = process.hrtime.bigint();
    if (!stats._buildEmotionBlendCache) stats._buildEmotionBlendCache = { totalMs: 0, calls: 0 };
    stats._buildEmotionBlendCache.totalMs += Number(end - start) / 1e6;
    stats._buildEmotionBlendCache.calls++;
    return result;
  };

  const neighborStats = { total: 0, max: 0, count: 0 };
  const gatherEntryStats = { totalEntries: 0, relationshipLookups: 0 };

  SimulatorProto._gatherContagionInputs = function (agentId, agent, cache) {
    const start = process.hrtime.bigint();
    const result = originalGather.call(this, agentId, agent, cache);
    const end = process.hrtime.bigint();
    if (!stats._gatherContagionInputs) stats._gatherContagionInputs = { totalMs: 0, calls: 0 };
    stats._gatherContagionInputs.totalMs += Number(end - start) / 1e6;
    stats._gatherContagionInputs.calls++;

    if (result) {
      const entries = Object.keys(result).length;
      gatherEntryStats.totalEntries += entries;
      gatherEntryStats.relationshipLookups += entries;
      neighborStats.total += entries;
      neighborStats.max = Math.max(neighborStats.max, entries);
      neighborStats.count++;
    }

    return result;
  };

  const startTime = process.hrtime.bigint();
  for (let t = 0; t < tickCount; t++) {
    engine.tick();
  }
  const endTime = process.hrtime.bigint();

  // Restore
  SimulatorProto._buildEmotionBlendCache = originalBuild;
  SimulatorProto._gatherContagionInputs = originalGather;

  const totalMs = Number(endTime - startTime) / 1e6;
  const avgNeighbors = neighborStats.count > 0 ? Math.round(neighborStats.total / neighborStats.count * 100) / 100 : 0;

  return {
    mode: 'runtime',
    config: { agentCount, tickCount, clusterMode },
    totalMs: Math.round(totalMs),
    cache: {
      totalMs: stats._buildEmotionBlendCache ? Math.round(stats._buildEmotionBlendCache.totalMs * 100) / 100 : 0,
      calls: stats._buildEmotionBlendCache ? stats._buildEmotionBlendCache.calls : 0,
      avgMs: stats._buildEmotionBlendCache ? Math.round((stats._buildEmotionBlendCache.totalMs / stats._buildEmotionBlendCache.calls) * 1000) / 1000 : 0,
      percentOfTotal: stats._buildEmotionBlendCache ? Math.round((stats._buildEmotionBlendCache.totalMs / totalMs) * 10000) / 100 : 0,
    },
    gather: {
      totalMs: stats._gatherContagionInputs ? Math.round(stats._gatherContagionInputs.totalMs * 100) / 100 : 0,
      calls: stats._gatherContagionInputs ? stats._gatherContagionInputs.calls : 0,
      avgMs: stats._gatherContagionInputs ? Math.round((stats._gatherContagionInputs.totalMs / stats._gatherContagionInputs.calls) * 1000) / 1000 : 0,
      percentOfTotal: stats._gatherContagionInputs ? Math.round((stats._gatherContagionInputs.totalMs / totalMs) * 10000) / 100 : 0,
    },
    contagionStats: {
      totalEntries: gatherEntryStats.totalEntries,
      relationshipLookups: gatherEntryStats.relationshipLookups,
      avgNeighbors,
      maxNeighbors: neighborStats.max,
    },
    warnings: [],
    agents: agentCount,
    ticks: tickCount,
  };
}

function formatResult(result) {
  const { mode, totalMs, cache, gather, config, contagionStats, warnings } = result;
  const lines = [
    `\n=== [${mode}] ${config.agentCount} agents × ${config.tickCount} ticks (${config.clusterMode}) ===`,
    `Total: ${totalMs} ms\n`,
    'Component                     Total(ms)   Calls   Avg(ms)   %Total',
    '─'.repeat(72),
    `cache build                   ${String(cache.totalMs).padStart(10)}   ${String(cache.calls).padStart(8)}   ${String(cache.avgMs).padStart(10)}   ${String(cache.percentOfTotal + '%').padStart(8)}`,
    `gather                        ${String(gather.totalMs).padStart(10)}   ${String(gather.calls).padStart(8)}   ${String(gather.avgMs).padStart(10)}   ${String(gather.percentOfTotal + '%').padStart(8)}`,
    '─'.repeat(72),
    '',
    'Contagion Stats:',
    `  Total entries: ${contagionStats.totalEntries}`,
    `  Relationship lookups: ${contagionStats.relationshipLookups}`,
    `  Avg neighbors: ${contagionStats.avgNeighbors}`,
    `  Max neighbors: ${contagionStats.maxNeighbors}`,
  ];

  if (warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const w of warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return lines.join('\n');
}

// Main
const args = process.argv.slice(2);
let config;

if (args[0] === 'quick') {
  config = QUICK_CONFIG;
} else if (args.length >= 2) {
  config = { agents: parseInt(args[0], 10), ticks: parseInt(args[1], 10), label: `${args[0]} agents` };
} else {
  config = FULL_CONFIG;
}

console.log('Andy Engine v0.2.0 Social Contagion Pipeline Profiling (Optimized)');
console.log('==================================================================\n');

const allResults = {};
const sanityWarnings = [];

// Fixed-density scenarios
const fixedScenarios = ['dispersed', 'mixed', 'clustered'];
console.log('--- Fixed-Density Scenarios (no position updates) ---');

for (const scenario of fixedScenarios) {
  const result = runFixedDensityProfile(config.agents, config.ticks, scenario);
  allResults[`fixed-${scenario}`] = result;
  console.log(formatResult(result));
}

// Sanity checks
const fixedClustered = allResults['fixed-clustered'];
const fixedDispersed = allResults['fixed-dispersed'];
const expectedMinNeighbors = config.agents - 2;

if (fixedClustered.contagionStats.avgNeighbors < expectedMinNeighbors) {
  sanityWarnings.push(`fixed-clustered avg neighbors (${fixedClustered.contagionStats.avgNeighbors}) should be >= ${expectedMinNeighbors}`);
}

const expectedMinEntries = config.agents * (config.agents - 1) * config.ticks * 0.98;
if (fixedClustered.contagionStats.totalEntries < expectedMinEntries) {
  sanityWarnings.push(`fixed-clustered total entries (${fixedClustered.contagionStats.totalEntries}) should be >= ${Math.round(expectedMinEntries)}`);
}

if (fixedDispersed.contagionStats.avgNeighbors >= fixedClustered.contagionStats.avgNeighbors) {
  sanityWarnings.push(`fixed-dispersed avg neighbors (${fixedDispersed.contagionStats.avgNeighbors}) should be < fixed-clustered (${fixedClustered.contagionStats.avgNeighbors})`);
}

// Runtime scenarios
console.log('\n--- Runtime Scenarios (with position updates) ---');
const runtimeScenarios = ['mixed', 'clustered'];

for (const scenario of runtimeScenarios) {
  const result = runRuntimeProfile(config.agents, config.ticks, scenario);
  allResults[`runtime-${scenario}`] = result;
  console.log(formatResult(result));
}

// Output JSON
const jsonOutput = {
  version: '0.2.0',
  mode: 'contagion-profile-optimized',
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  nativeStatus: (() => { try { require('../native'); return 'available'; } catch { return 'unavailable'; } })(),
  config,
  scenarios: allResults,
  sanityWarnings,
};

const jsonPath = '/tmp/andy-contagion-profile.json';
fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
console.log(`\nJSON output: ${jsonPath}`);

if (sanityWarnings.length > 0) {
  console.log('\nSanity Warnings:');
  for (const w of sanityWarnings) {
    console.log(`  ⚠ ${w}`);
  }
  process.exit(1);
} else {
  console.log('\n✓ All sanity checks passed');
}
