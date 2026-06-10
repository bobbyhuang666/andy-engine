/**
 * Subsystem Profiling — Andy Engine v0.2.0
 *
 * 测量 Agent.tick() 内部各子系统的耗时分布。
 *
 * 用法：
 *   node benchmarks/profile.js [agentCount] [tickCount]
 *   node benchmarks/profile.js quick
 */

const fs = require('fs');
const AndyEngine = require('../index');

const QUICK_CONFIG = { agents: 100, ticks: 30, label: '100 agents' };
const FULL_CONFIG = { agents: 300, ticks: 20, label: '300 agents' };

// Profiling wrapper with explicit label
function wrapMethod(label, obj, methodName, stats) {
  const original = obj[methodName];
  if (typeof original !== 'function') return null;

  obj[methodName] = function (...args) {
    const start = process.hrtime.bigint();
    const result = original.apply(this, args);
    const end = process.hrtime.bigint();

    const ms = Number(end - start) / 1e6;
    if (!stats[label]) stats[label] = { totalMs: 0, calls: 0 };
    stats[label].totalMs += ms;
    stats[label].calls++;

    return result;
  };

  return () => { obj[methodName] = original; };
}

function createEngine(agentCount) {
  const engine = new AndyEngine({
    startTime: new Date('2024-01-15T08:00:00'),
  });

  for (let i = 0; i < agentCount; i++) {
    const mbti = ['INFP', 'ENFP', 'ISTJ', 'ESTJ', 'INTJ', 'ENTJ', 'ISFP', 'ESFP'][i % 8];
    engine.createCharacter({
      id: `agent_${i}`,
      name: `Agent ${i}`,
      mbti,
      schedule: 'student',
    });
  }

  return engine;
}

function runProfile(agentCount, tickCount) {
  if (global.gc) global.gc();

  const memBefore = process.memoryUsage();
  const engine = createEngine(agentCount);

  // Collect stats
  const stats = {};

  // Get prototype references
  const agents = Array.from(engine.world.agents.values());
  const sampleAgent = agents[0];

  const AgentProto = Object.getPrototypeOf(sampleAgent);
  const BehaviorFieldProto = Object.getPrototypeOf(sampleAgent.behaviorField);
  const NeedsProto = Object.getPrototypeOf(sampleAgent.needs);
  const MemoryProto = Object.getPrototypeOf(sampleAgent.memory);
  const IntrinsicProto = Object.getPrototypeOf(sampleAgent.intrinsicMotivation);
  const EventDispatcherProto = Object.getPrototypeOf(engine.world.eventDispatcher);

  // Wrap with explicit labels
  const restoreFns = [];
  restoreFns.push(wrapMethod('Agent.tick', AgentProto, 'tick', stats));
  restoreFns.push(wrapMethod('BehaviorField.tick', BehaviorFieldProto, 'tick', stats));
  restoreFns.push(wrapMethod('NeedsSystem.tickWithBehavior', NeedsProto, 'tickWithBehavior', stats));
  restoreFns.push(wrapMethod('PersonalMemory.retrieve', MemoryProto, 'retrieve', stats));
  restoreFns.push(wrapMethod('PersonalMemory.tick', MemoryProto, 'tick', stats));
  restoreFns.push(wrapMethod('IntrinsicMotivation.tick', IntrinsicProto, 'tick', stats));
  restoreFns.push(wrapMethod('EventDispatcher.dispatch', EventDispatcherProto, 'dispatch', stats));

  // Run ticks
  const startTime = process.hrtime.bigint();

  for (let t = 0; t < tickCount; t++) {
    engine.tick();
  }

  const endTime = process.hrtime.bigint();
  const memAfter = process.memoryUsage();

  // Restore prototypes
  for (const restore of restoreFns) {
    if (restore) restore();
  }

  const totalMs = Number(endTime - startTime) / 1e6;

  // Sanity checks
  const expectedCalls = agentCount * tickCount;
  const warnings = [];

  if (stats['Agent.tick'] && stats['Agent.tick'].calls !== expectedCalls) {
    warnings.push(`Agent.tick calls: expected ${expectedCalls}, got ${stats['Agent.tick'].calls}`);
  }
  if (stats['BehaviorField.tick'] && stats['BehaviorField.tick'].calls !== expectedCalls) {
    warnings.push(`BehaviorField.tick calls: expected ${expectedCalls}, got ${stats['BehaviorField.tick'].calls}`);
  }
  if (stats['NeedsSystem.tickWithBehavior'] && stats['NeedsSystem.tickWithBehavior'].calls !== expectedCalls) {
    warnings.push(`NeedsSystem.tickWithBehavior calls: expected ${expectedCalls}, got ${stats['NeedsSystem.tickWithBehavior'].calls}`);
  }

  // Calculate percentages
  const components = {};
  for (const [name, data] of Object.entries(stats)) {
    components[name] = {
      totalMs: Math.round(data.totalMs * 100) / 100,
      calls: data.calls,
      avgMs: Math.round((data.totalMs / data.calls) * 1000) / 1000,
      percentOfTotal: Math.round((data.totalMs / totalMs) * 10000) / 100,
    };
  }

  return {
    config: { agentCount, tickCount },
    totalMs: Math.round(totalMs),
    components,
    warnings,
    memory: {
      heapUsedDeltaMB: Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memAfter.heapTotal / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(memAfter.rss / 1024 / 1024 * 100) / 100,
    },
    agents: agentCount,
    ticks: tickCount,
  };
}

function formatResult(result) {
  const { totalMs, components, config, memory, warnings } = result;
  const lines = [
    `\n=== ${config.agentCount} agents × ${config.tickCount} ticks ===`,
    `Total: ${totalMs} ms\n`,
    'Component                   Total(ms)   Calls   Avg(ms)   %Total',
    '─'.repeat(70),
  ];

  // Sort by totalMs descending
  const sorted = Object.entries(components)
    .sort((a, b) => b[1].totalMs - a[1].totalMs);

  for (const [name, data] of sorted) {
    const paddedName = name.padEnd(28);
    const paddedTotal = String(data.totalMs).padStart(10);
    const paddedCalls = String(data.calls).padStart(8);
    const paddedAvg = String(data.avgMs).padStart(10);
    const paddedPct = String(data.percentOfTotal + '%').padStart(8);
    lines.push(`${paddedName}${paddedTotal}${paddedCalls}${paddedAvg}${paddedPct}`);
  }

  lines.push('─'.repeat(70));
  lines.push(`Heap delta: ${memory.heapUsedDeltaMB} MB | RSS: ${memory.rssMB} MB`);

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

console.log('Andy Engine v0.2.0 Subsystem Profiling');
console.log('======================================\n');
console.log(`Config: ${config.agents} agents × ${config.ticks} ticks\n`);

const result = runProfile(config.agents, config.ticks);

console.log(formatResult(result));

// Output JSON
const jsonOutput = {
  version: '0.2.0',
  mode: 'profile',
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  nativeStatus: (() => { try { require('../native'); return 'available'; } catch { return 'unavailable'; } })(),
  ...result,
};

const jsonPath = '/tmp/andy-profile-baseline.json';
fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
console.log(`\nJSON output: ${jsonPath}`);

// Exit with error if warnings
if (result.warnings.length > 0) {
  console.log('\n⚠ Profiling has warnings - check JSON for details');
  process.exit(1);
}
