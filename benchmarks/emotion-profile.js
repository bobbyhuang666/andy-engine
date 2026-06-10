/**
 * EmotionVector Tick Internal Profiling — Andy Engine v0.2.0
 *
 * 拆解 EmotionVector.tick() 内部 10 步演化管线。
 *
 * 用法：
 *   node benchmarks/emotion-profile.js [agentCount] [tickCount]
 *   node benchmarks/emotion-profile.js quick
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

  // Get EmotionVector prototype
  const agents = Array.from(engine.world.agents.values());
  const sampleAgent = agents[0];
  const EmotionProto = Object.getPrototypeOf(sampleAgent.emotion);

  // Wrap EmotionVector.tick and its internal steps
  const restoreFns = [];

  restoreFns.push(wrapMethod('EmotionVector.tick', EmotionProto, 'tick', stats));
  restoreFns.push(wrapMethod('EmotionVector._timeDecay', EmotionProto, '_timeDecay', stats));
  restoreFns.push(wrapMethod('EmotionVector._circadianModulation', EmotionProto, '_circadianModulation', stats));
  restoreFns.push(wrapMethod('EmotionVector._pinkNoiseDrift', EmotionProto, '_pinkNoiseDrift', stats));
  restoreFns.push(wrapMethod('EmotionVector._coActivationSpread', EmotionProto, '_coActivationSpread', stats));
  restoreFns.push(wrapMethod('EmotionVector._oppositionDamping', EmotionProto, '_oppositionDamping', stats));
  restoreFns.push(wrapMethod('EmotionVector._inertiaFilter', EmotionProto, '_inertiaFilter', stats));
  restoreFns.push(wrapMethod('EmotionVector._socialContagion', EmotionProto, '_socialContagion', stats));
  restoreFns.push(wrapMethod('EmotionVector._baselineDrift', EmotionProto, '_baselineDrift', stats));
  restoreFns.push(wrapMethod('EmotionVector._velocityLimit', EmotionProto, '_velocityLimit', stats));
  restoreFns.push(wrapMethod('EmotionVector._clamp', EmotionProto, '_clamp', stats));

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
  const emotionTickMs = stats['EmotionVector.tick'] ? stats['EmotionVector.tick'].totalMs : 0;

  // Sanity checks
  const expectedCalls = agentCount * tickCount;
  const warnings = [];

  if (stats['EmotionVector.tick'] && stats['EmotionVector.tick'].calls !== expectedCalls) {
    warnings.push(`EmotionVector.tick calls: expected ${expectedCalls}, got ${stats['EmotionVector.tick'].calls}`);
  }

  // Build steps table
  const steps = {};
  for (const [name, data] of Object.entries(stats)) {
    if (name === 'EmotionVector.tick') continue; // Skip total

    const percentOfEmotionTick = emotionTickMs > 0 ? (data.totalMs / emotionTickMs * 100) : 0;
    const percentOfTotal = (data.totalMs / totalMs * 100);

    steps[name] = {
      totalMs: Math.round(data.totalMs * 100) / 100,
      calls: data.calls,
      avgMs: Math.round((data.totalMs / data.calls) * 1000) / 1000,
      percentOfEmotionTick: Math.round(percentOfEmotionTick * 100) / 100,
      percentOfTotal: Math.round(percentOfTotal * 100) / 100,
    };
  }

  return {
    config: { agentCount, tickCount },
    totalMs: Math.round(totalMs),
    emotionTickMs: Math.round(emotionTickMs),
    steps,
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
  const { totalMs, emotionTickMs, steps, config, memory, warnings } = result;
  const lines = [
    `\n=== ${config.agentCount} agents × ${config.tickCount} ticks ===`,
    `Total: ${totalMs} ms | EmotionVector.tick: ${emotionTickMs} ms (${(emotionTickMs / totalMs * 100).toFixed(1)}%)\n`,
    'Step                        Total(ms)   Calls   Avg(ms)  %EmotionTick  %Total',
    '─'.repeat(80),
  ];

  // Sort by percentOfEmotionTick descending
  const sorted = Object.entries(steps)
    .sort((a, b) => b[1].percentOfEmotionTick - a[1].percentOfEmotionTick);

  for (const [name, data] of sorted) {
    const shortName = name.replace('EmotionVector.', '');
    const paddedName = shortName.padEnd(28);
    const paddedTotal = String(data.totalMs).padStart(10);
    const paddedCalls = String(data.calls).padStart(8);
    const paddedAvg = String(data.avgMs).padStart(10);
    const paddedPctEmotion = String(data.percentOfEmotionTick + '%').padStart(12);
    const paddedPctTotal = String(data.percentOfTotal + '%').padStart(8);
    lines.push(`${paddedName}${paddedTotal}${paddedCalls}${paddedAvg}${paddedPctEmotion}${paddedPctTotal}`);
  }

  lines.push('─'.repeat(80));
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

console.log('Andy Engine v0.2.0 EmotionVector Tick Internal Profiling');
console.log('=======================================================\n');
console.log(`Config: ${config.agents} agents × ${config.ticks} ticks\n`);

const result = runProfile(config.agents, config.ticks);

console.log(formatResult(result));

// Output JSON
const jsonOutput = {
  version: '0.2.0',
  mode: 'emotion-profile',
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  nativeStatus: (() => { try { require('../native'); return 'available'; } catch { return 'unavailable'; } })(),
  ...result,
};

const jsonPath = '/tmp/andy-emotion-profile.json';
fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
console.log(`\nJSON output: ${jsonPath}`);
