/**
 * Agent Tick Internal Step Profiling — Andy Engine v0.2.0
 *
 * 拆解 Agent.tick() 内部每个步骤的耗时。
 *
 * 注意：当前使用 inclusive timing，不能直接求和当作 exclusive step time。
 *
 * 用法：
 *   node benchmarks/agent-tick-profile.js [agentCount] [tickCount]
 *   node benchmarks/agent-tick-profile.js quick
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
  const EmotionProto = Object.getPrototypeOf(sampleAgent.emotion);
  const EmotionRegulationProto = Object.getPrototypeOf(sampleAgent.emotionRegulation);
  const ProceduralMemoryProto = Object.getPrototypeOf(sampleAgent.proceduralMemory);
  const EventDispatcherProto = Object.getPrototypeOf(engine.world.eventDispatcher);

  // Wrap methods
  const restoreFns = [];

  // Agent.tick (top level)
  restoreFns.push(wrapMethod('Agent.tick', AgentProto, 'tick', stats));

  // Agent internal steps
  restoreFns.push(wrapMethod('Agent._perceiveEvents', AgentProto, '_perceiveEvents', stats));
  restoreFns.push(wrapMethod('Agent._checkSchedule', AgentProto, '_checkSchedule', stats));
  restoreFns.push(wrapMethod('Agent._applyNeedsToEmotion', AgentProto, '_applyNeedsToEmotion', stats));
  restoreFns.push(wrapMethod('Agent._updateHealth', AgentProto, '_updateHealth', stats));
  restoreFns.push(wrapMethod('Agent._updateSocialEnergy', AgentProto, '_updateSocialEnergy', stats));
  restoreFns.push(wrapMethod('Agent.buildBehaviorSignals', AgentProto, 'buildBehaviorSignals', stats));
  restoreFns.push(wrapMethod('Agent._mindWander', AgentProto, '_mindWander', stats));
  restoreFns.push(wrapMethod('Agent._reflect', AgentProto, '_reflect', stats));

  // Subsystem ticks (called within Agent.tick)
  restoreFns.push(wrapMethod('BehaviorField.tick', BehaviorFieldProto, 'tick', stats));
  restoreFns.push(wrapMethod('NeedsSystem.tickWithBehavior', NeedsProto, 'tickWithBehavior', stats));
  restoreFns.push(wrapMethod('IntrinsicMotivation.tick', IntrinsicProto, 'tick', stats));
  restoreFns.push(wrapMethod('PersonalMemory.tick', MemoryProto, 'tick', stats));
  restoreFns.push(wrapMethod('PersonalMemory.retrieve', MemoryProto, 'retrieve', stats));
  restoreFns.push(wrapMethod('EmotionVector.tick', EmotionProto, 'tick', stats));
  restoreFns.push(wrapMethod('EmotionRegulation.tryRegulate', EmotionRegulationProto, 'tryRegulate', stats));
  restoreFns.push(wrapMethod('EmotionRegulation.tick', EmotionRegulationProto, 'tick', stats));
  restoreFns.push(wrapMethod('ProceduralMemory.tick', ProceduralMemoryProto, 'tick', stats));

  // World-level (not Agent.tick internal)
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
  const agentTickMs = stats['Agent.tick'] ? stats['Agent.tick'].totalMs : 0;

  // Sanity checks
  const expectedCalls = agentCount * tickCount;
  const warnings = [];

  if (stats['Agent.tick'] && stats['Agent.tick'].calls !== expectedCalls) {
    warnings.push(`Agent.tick calls: expected ${expectedCalls}, got ${stats['Agent.tick'].calls}`);
  }

  // Categorize components
  const agentTickComponents = {};
  const worldComponents = {};

  // Agent internal steps
  const agentInternalSteps = [
    'Agent._perceiveEvents', 'Agent._checkSchedule', 'Agent._applyNeedsToEmotion',
    'Agent._updateHealth', 'Agent._updateSocialEnergy', 'Agent.buildBehaviorSignals',
    'Agent._mindWander', 'Agent._reflect',
  ];

  // Subsystem ticks (called within Agent.tick)
  const subsystemSteps = [
    'BehaviorField.tick', 'NeedsSystem.tickWithBehavior', 'IntrinsicMotivation.tick',
    'PersonalMemory.tick', 'PersonalMemory.retrieve', 'EmotionVector.tick',
    'EmotionRegulation.tryRegulate', 'EmotionRegulation.tick', 'ProceduralMemory.tick',
  ];

  // World-level components
  const worldSteps = ['EventDispatcher.dispatch'];

  // Build tables
  for (const [name, data] of Object.entries(stats)) {
    const entry = {
      totalMs: Math.round(data.totalMs * 100) / 100,
      calls: data.calls,
      avgMs: Math.round((data.totalMs / data.calls) * 1000) / 1000,
      percentOfTotal: Math.round((data.totalMs / totalMs) * 10000) / 100,
    };

    if (agentInternalSteps.includes(name)) {
      entry.percentOfAgentTick = Math.round((data.totalMs / agentTickMs) * 10000) / 100;
      agentTickComponents[name] = entry;
    } else if (subsystemSteps.includes(name)) {
      entry.percentOfAgentTick = Math.round((data.totalMs / agentTickMs) * 10000) / 100;
      agentTickComponents[name] = entry;
    } else if (worldSteps.includes(name)) {
      worldComponents[name] = entry;
    } else if (name === 'Agent.tick') {
      // Skip, it's the total
    }
  }

  return {
    config: { agentCount, tickCount },
    totalMs: Math.round(totalMs),
    agentTickMs: Math.round(agentTickMs),
    agentTickComponents,
    worldComponents,
    agentTickAttribution: {
      status: 'inclusive-only',
      note: 'Nested inclusive timings cannot be summed to calculate unprofiled Agent.tick time.',
    },
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
  const { totalMs, agentTickMs, agentTickComponents, worldComponents, config, memory, warnings, agentTickAttribution } = result;
  const lines = [
    `\n=== ${config.agentCount} agents × ${config.tickCount} ticks ===`,
    `Total: ${totalMs} ms | Agent.tick: ${agentTickMs} ms (${(agentTickMs / totalMs * 100).toFixed(1)}%)\n`,
  ];

  // Table A: Agent Tick Inclusive Components
  lines.push('A. Agent Tick Inclusive Components (inclusive timing, cannot be summed)');
  lines.push('   Step                        Total(ms)   Calls   Avg(ms)  %AgentTick  %Total');
  lines.push('   ' + '─'.repeat(78));

  const agentSorted = Object.entries(agentTickComponents)
    .sort((a, b) => b[1].percentOfAgentTick - a[1].percentOfAgentTick);

  for (const [name, data] of agentSorted) {
    const paddedName = name.padEnd(28);
    const paddedTotal = String(data.totalMs).padStart(10);
    const paddedCalls = String(data.calls).padStart(8);
    const paddedAvg = String(data.avgMs).padStart(10);
    const paddedPctAgent = String(data.percentOfAgentTick + '%').padStart(10);
    const paddedPctTotal = String(data.percentOfTotal + '%').padStart(8);
    lines.push(`   ${paddedName}${paddedTotal}${paddedCalls}${paddedAvg}${paddedPctAgent}${paddedPctTotal}`);
  }

  lines.push('   ' + '─'.repeat(78));
  lines.push(`   Note: ${agentTickAttribution.note}\n`);

  // Table B: World-Level Components
  if (Object.keys(worldComponents).length > 0) {
    lines.push('B. World-Level Components');
    lines.push('   Step                        Total(ms)   Calls   Avg(ms)   %Total');
    lines.push('   ' + '─'.repeat(68));

    const worldSorted = Object.entries(worldComponents)
      .sort((a, b) => b[1].totalMs - a[1].totalMs);

    for (const [name, data] of worldSorted) {
      const paddedName = name.padEnd(28);
      const paddedTotal = String(data.totalMs).padStart(10);
      const paddedCalls = String(data.calls).padStart(8);
      const paddedAvg = String(data.avgMs).padStart(10);
      const paddedPctTotal = String(data.percentOfTotal + '%').padStart(8);
      lines.push(`   ${paddedName}${paddedTotal}${paddedCalls}${paddedAvg}${paddedPctTotal}`);
    }

    lines.push('   ' + '─'.repeat(68));
  }

  lines.push(`\nHeap delta: ${memory.heapUsedDeltaMB} MB | RSS: ${memory.rssMB} MB`);

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

console.log('Andy Engine v0.2.0 Agent Tick Internal Step Profiling');
console.log('=====================================================\n');
console.log(`Config: ${config.agents} agents × ${config.ticks} ticks\n`);

const result = runProfile(config.agents, config.ticks);

console.log(formatResult(result));

// Output JSON
const jsonOutput = {
  version: '0.2.0',
  mode: 'agent-tick-profile',
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  nativeStatus: (() => { try { require('../native'); return 'available'; } catch { return 'unavailable'; } })(),
  ...result,
};

const jsonPath = '/tmp/andy-agent-tick-profile.json';
fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
console.log(`\nJSON output: ${jsonPath}`);
