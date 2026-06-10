/**
 * Benchmark Baseline — Andy Engine v0.2.0
 *
 * 测量不同 agent 数量下的性能基线。
 *
 * 用法：
 *   node benchmarks/baseline.js [agentCount] [tickCount]
 *   node benchmarks/baseline.js 100 50
 *   node benchmarks/baseline.js quick
 */

const fs = require('fs');
const AndyEngine = require('../index');

const QUICK_CONFIGS = [
  { agents: 100, ticks: 50, label: '100 agents' },
  { agents: 300, ticks: 20, label: '300 agents' },
];

const FULL_CONFIGS = [
  { agents: 100, ticks: 50, label: '100 agents' },
  { agents: 1000, ticks: 20, label: '1000 agents' },
  { agents: 5000, ticks: 10, label: '5000 agents' },
];

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

function runBenchmark(agentCount, tickCount) {
  // Warm up GC if available
  if (global.gc) global.gc();

  const memBefore = process.memoryUsage();
  const engine = createEngine(agentCount);

  const tickTimes = [];
  const startTime = process.hrtime.bigint();

  for (let t = 0; t < tickCount; t++) {
    const tickStart = process.hrtime.bigint();
    engine.tick();
    const tickEnd = process.hrtime.bigint();
    tickTimes.push(Number(tickEnd - tickStart) / 1e6);
  }

  const endTime = process.hrtime.bigint();
  const memAfter = process.memoryUsage();

  const totalTime = Number(endTime - startTime) / 1e6;
  const avgTickTime = totalTime / tickCount;

  return {
    config: { agentCount, tickCount },
    timing: {
      totalMs: Math.round(totalTime),
      avgMsPerTick: Math.round(avgTickTime * 100) / 100,
      minTickMs: Math.round(Math.min(...tickTimes) * 100) / 100,
      maxTickMs: Math.round(Math.max(...tickTimes) * 100) / 100,
      p50TickMs: Math.round(tickTimes.sort((a, b) => a - b)[Math.floor(tickTimes.length / 2)] * 100) / 100,
    },
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
  const { timing, memory, agents, ticks } = result;
  return `
=== ${agents} agents × ${ticks} ticks ===
Total time:     ${timing.totalMs} ms
Avg per tick:   ${timing.avgMsPerTick} ms
Min tick:       ${timing.minTickMs} ms
Max tick:       ${timing.maxTickMs} ms
P50 tick:       ${timing.p50TickMs} ms
Heap delta:     ${memory.heapUsedDeltaMB} MB
Heap total:     ${memory.heapTotalMB} MB
RSS:            ${memory.rssMB} MB`.trim();
}

// Main
const args = process.argv.slice(2);
let configs;
let isQuick = false;

if (args[0] === 'quick') {
  configs = QUICK_CONFIGS;
  isQuick = true;
} else if (args.length >= 2) {
  configs = [{
    agents: parseInt(args[0], 10),
    ticks: parseInt(args[1], 10),
    label: `${args[0]} agents`,
  }];
} else {
  configs = FULL_CONFIGS;
}

console.log('Andy Engine v0.2.0 Benchmark Baseline');
console.log('=====================================\n');

const results = [];

for (const config of configs) {
  console.log(`Running: ${config.label} (${config.agents} agents × ${config.ticks} ticks)...`);
  const result = runBenchmark(config.agents, config.ticks);
  results.push(result);
  console.log(formatResult(result));
  console.log('');
}

// Check native availability
let nativeStatus = 'unavailable';
try {
  require('../native');
  nativeStatus = 'available';
} catch {
  nativeStatus = 'unavailable';
}

// Output JSON
const jsonOutput = {
  version: '0.2.0',
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  nativeStatus,
  mode: isQuick ? 'quick' : 'full',
  results,
};

const jsonPath = '/tmp/andy-benchmark-baseline.json';
fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
console.log(`\nJSON output: ${jsonPath}`);
console.log(`Native: ${nativeStatus}`);
