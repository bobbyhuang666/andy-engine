/**
 * Performance Regression Check — Andy Engine v2.0.0-alpha.1
 *
 * 检查当前 benchmark 和 profile 是否超过 baseline 的阈值。
 *
 * 用法：
 *   node benchmarks/perf-check.js              # 单次运行（向后兼容）
 *   node benchmarks/perf-check.js --runs=3     # 3次运行取中位数
 *   node benchmarks/perf-check.js --diagnose   # 诊断模式，测试不同配置
 *   npm run perf:check
 *   npm run perf:diagnose
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const BASELINE_PATH = path.join(__dirname, 'baselines/v0.2.0-post-contagion-cache.json');
const BENCH_JSON = '/tmp/andy-benchmark-baseline.json';
const CONTAGION_JSON = '/tmp/andy-contagion-profile.json';
const WARN_THRESHOLD = 1.6;
const FAIL_THRESHOLD = 2.0;

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`Baseline not found: ${BASELINE_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
}

function checkThreshold(name, current, baseline, warnTh, failTh) {
  if (!baseline || baseline === 0) return { status: 'skip', name };
  const ratio = current / baseline;
  if (ratio > failTh) {
    return { status: 'fail', name, current, baseline, ratio: Math.round(ratio * 100) / 100 };
  }
  if (ratio > warnTh) {
    return { status: 'warn', name, current, baseline, ratio: Math.round(ratio * 100) / 100 };
  }
  return { status: 'pass', name, current, baseline, ratio: Math.round(ratio * 100) / 100 };
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function getCpuInfo() {
  try {
    const cpus = os.cpus();
    if (cpus.length > 0) {
      return `${cpus[0].model} (${cpus.length} cores)`;
    }
  } catch { /* ignore */ }
  return 'unknown';
}

function printEnvironment() {
  const nativeVal = process.env.ANDY_USE_NATIVE;
  console.log('Environment:');
  console.log(`  git commit: ${getGitCommit()}`);
  console.log(`  node version: ${process.version}`);
  console.log(`  platform: ${os.platform()} ${os.arch()}`);
  console.log(`  ANDY_USE_NATIVE: ${nativeVal !== undefined ? nativeVal : 'unset'}`);
  console.log(`  CPU: ${getCpuInfo()}`);
  console.log('');
}

function runBenchmarkQuick() {
  execSync('node benchmarks/baseline.js quick', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(BENCH_JSON, 'utf-8'));
}

function runContagionProfileQuick() {
  execSync('node benchmarks/contagion-profile.js quick', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(CONTAGION_JSON, 'utf-8'));
}

function extractMetrics(benchResult, contagionResult, baseline) {
  const metrics = [];

  const bench100 = benchResult.results.find(r => r.agents === 100);
  const base100 = baseline.benchmark.quick['100_agents_50_ticks'];
  if (bench100 && base100) {
    metrics.push({ name: '100 agents avg/tick', current: bench100.timing.avgMsPerTick, baseline: base100.avgMsPerTick });
  }

  const bench300 = benchResult.results.find(r => r.agents === 300);
  const base300 = baseline.benchmark.quick['300_agents_20_ticks'];
  if (bench300 && base300) {
    metrics.push({ name: '300 agents avg/tick', current: bench300.timing.avgMsPerTick, baseline: base300.avgMsPerTick });
  }

  const fixedClustered = contagionResult.scenarios['fixed-clustered'];
  const baseFixed = baseline.profile?.contagion_quick?.fixed_clustered;
  if (fixedClustered && baseFixed) {
    metrics.push({ name: 'fixed-clustered gather (ms)', current: fixedClustered.gather.totalMs, baseline: baseFixed.gatherMs });
    metrics.push({ name: 'fixed-clustered cache (ms)', current: fixedClustered.cache.totalMs, baseline: baseFixed.cacheBuildMs });
  }

  const runtimeClustered = contagionResult.scenarios['runtime-clustered'];
  const baseRuntime = baseline.profile?.contagion_quick?.runtime_clustered;
  if (runtimeClustered && baseRuntime) {
    metrics.push({ name: 'runtime-clustered gather (ms)', current: runtimeClustered.gather.totalMs, baseline: baseRuntime.gatherMs });
  }

  return metrics;
}

function printResults(results) {
  console.log('\nResults:');
  console.log('\u2500'.repeat(85));
  console.log('Metric                         Current    Baseline   Ratio   Status');
  console.log('\u2500'.repeat(85));

  let hasFail = false;
  let hasWarn = false;

  for (const r of results) {
    if (r.status === 'skip') continue;

    const name = r.name.padEnd(30);
    const current = r.current !== undefined ? String(Math.round(r.current * 100) / 100).padStart(10) : 'N/A'.padStart(10);
    const base = r.baseline !== undefined ? String(Math.round(r.baseline * 100) / 100).padStart(10) : 'N/A'.padStart(10);
    const ratio = r.ratio !== undefined ? String(r.ratio + 'x').padStart(8) : 'N/A'.padStart(8);

    let status;
    switch (r.status) {
      case 'pass': status = '\u2713 PASS'; break;
      case 'warn': status = '\u26a0 WARN'; hasWarn = true; break;
      case 'fail': status = '\u2717 FAIL'; hasFail = true; break;
    }

    console.log(`${name}${current}${base}${ratio}   ${status}`);
  }

  console.log('\u2500'.repeat(85));
  return { hasFail, hasWarn };
}

// ─── Diagnose mode ───
function runDiagnose() {
  console.log('Andy Engine Performance Diagnostics');
  console.log('====================================\n');
  printEnvironment();

  const configs = [
    { label: 'no facts, action disabled', config: {} },
    { label: 'facts enabled, action disabled', config: { enableFacts: true } },
    { label: 'no facts, action enabled', config: { actionSelection: { enabled: true } } },
    { label: 'facts enabled, action enabled', config: { enableFacts: true, actionSelection: { enabled: true } } },
  ];

  const agentCount = 100;
  const tickCount = 30;

  for (const cfg of configs) {
    const configJson = JSON.stringify(cfg.config);
    console.log(`\n--- ${cfg.label} ---`);
    console.log(`  config: ${configJson}`);

    if (global.gc) global.gc();

    const AndyEngine = require('../index');
    const engine = new AndyEngine({
      startTime: new Date('2024-01-15T08:00:00'),
      ...cfg.config,
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

    const tickTimes = [];
    const startTime = process.hrtime.bigint();

    for (let t = 0; t < tickCount; t++) {
      const tickStart = process.hrtime.bigint();
      engine.tick();
      const tickEnd = process.hrtime.bigint();
      tickTimes.push(Number(tickEnd - tickStart) / 1e6);
    }

    const endTime = process.hrtime.bigint();
    const totalTime = Number(endTime - startTime) / 1e6;
    const avgTickTime = totalTime / tickCount;
    const memAfter = process.memoryUsage();

    console.log(`  total: ${Math.round(totalTime)} ms`);
    console.log(`  avg/tick: ${Math.round(avgTickTime * 100) / 100} ms`);
    console.log(`  min tick: ${Math.round(Math.min(...tickTimes) * 100) / 100} ms`);
    console.log(`  max tick: ${Math.round(Math.max(...tickTimes) * 100) / 100} ms`);
    console.log(`  rss: ${Math.round(memAfter.rss / 1024 / 1024 * 100) / 100} MB`);
  }

  console.log('\n\u2713 Diagnostics complete');
}

// ─── Main ───
const args = process.argv.slice(2);

if (args.includes('--diagnose')) {
  runDiagnose();
  process.exit(0);
}

const runsFlag = args.find(a => a.startsWith('--runs='));
const runCount = runsFlag ? parseInt(runsFlag.split('=')[1], 10) : 1;

console.log('Andy Engine Performance Regression Check');
console.log('========================================\n');
printEnvironment();

const baseline = loadBaseline();
console.log(`Baseline: ${baseline.version} (${baseline.date}, ${baseline.commit})`);
console.log(`Runs: ${runCount}${runCount > 1 ? ' (median mode)' : ' (single run)'}\n`);

const allRunResults = [];

for (let run = 0; run < runCount; run++) {
  if (runCount > 1) {
    console.log(`--- Run ${run + 1}/${runCount} ---`);
  }

  console.log('Running benchmark:quick...');
  const benchResult = runBenchmarkQuick();

  console.log('Running profile:contagion:quick...');
  const contagionResult = runContagionProfileQuick();

  const metrics = extractMetrics(benchResult, contagionResult, baseline);
  allRunResults.push(metrics);
}

// Build final results
const finalResults = [];

if (runCount === 1) {
  // Single run: use values directly
  for (const m of allRunResults[0]) {
    finalResults.push(checkThreshold(m.name, m.current, m.baseline, WARN_THRESHOLD, FAIL_THRESHOLD));
  }
} else {
  // Multi-run: compute median, report min/max
  const metricNames = allRunResults[0].map(m => m.name);

  for (const name of metricNames) {
    const values = allRunResults.map(run => run.find(m => m.name === name)?.current).filter(v => v !== undefined);
    const baselines = allRunResults.map(run => run.find(m => m.name === name)?.baseline).filter(v => v !== undefined);
    const baseVal = baselines[0];

    if (values.length === 0) continue;

    const med = median(values);
    const min = Math.min(...values);
    const max = Math.max(...values);

    const result = checkThreshold(name, med, baseVal, WARN_THRESHOLD, FAIL_THRESHOLD);
    result.min = Math.round(min * 100) / 100;
    result.max = Math.round(max * 100) / 100;
    result.median = Math.round(med * 100) / 100;
    finalResults.push(result);
  }
}

// Display
const { hasFail, hasWarn } = printResults(finalResults);

if (runCount > 1) {
  console.log('\nRun Details (min / median / max):');
  console.log('\u2500'.repeat(55));
  for (const r of finalResults) {
    if (r.status === 'skip') continue;
    const name = r.name.padEnd(30);
    console.log(`${name}${r.min} / ${r.median} / ${r.max}`);
  }
  console.log('\u2500'.repeat(55));
}

if (hasFail) {
  console.log('\n\u2717 Performance regression detected!');
  console.log('  Profile pointer: node benchmarks/profile.js quick');
  process.exit(1);
} else if (hasWarn) {
  console.log('\n\u26a0 Performance approaching threshold (machine variance)');
} else {
  console.log('\n\u2713 All performance checks passed');
}
