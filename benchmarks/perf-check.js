/**
 * Performance Regression Check — Andy Engine v0.2.0
 *
 * 检查当前 benchmark 和 profile 是否超过 baseline 的阈值。
 *
 * 用法：
 *   node benchmarks/perf-check.js
 *   npm run perf:check
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// Main
console.log('Andy Engine Performance Regression Check');
console.log('========================================\n');

const baseline = loadBaseline();
console.log(`Baseline: ${baseline.version} (${baseline.date}, ${baseline.commit})\n`);

const results = [];

// ─── 1. Run benchmark:quick ───
console.log('Running benchmark:quick...');
try {
  execSync('node benchmarks/baseline.js quick', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
} catch (e) {
  console.error('Benchmark failed');
  process.exit(1);
}

const benchResult = JSON.parse(fs.readFileSync(BENCH_JSON, 'utf-8'));

const bench100 = benchResult.results.find(r => r.agents === 100);
const base100 = baseline.benchmark.quick['100_agents_50_ticks'];
if (bench100 && base100) {
  results.push(checkThreshold('100 agents avg/tick', bench100.timing.avgMsPerTick, base100.avgMsPerTick, WARN_THRESHOLD, FAIL_THRESHOLD));
}

const bench300 = benchResult.results.find(r => r.agents === 300);
const base300 = baseline.benchmark.quick['300_agents_20_ticks'];
if (bench300 && base300) {
  results.push(checkThreshold('300 agents avg/tick', bench300.timing.avgMsPerTick, base300.avgMsPerTick, WARN_THRESHOLD, FAIL_THRESHOLD));
}

// ─── 2. Run profile:contagion:quick ───
console.log('Running profile:contagion:quick...');
try {
  execSync('node benchmarks/contagion-profile.js quick', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
} catch (e) {
  console.error('Contagion profile failed');
  process.exit(1);
}

const contagionResult = JSON.parse(fs.readFileSync(CONTAGION_JSON, 'utf-8'));

// Check fixed-clustered
const fixedClustered = contagionResult.scenarios['fixed-clustered'];
const baseFixed = baseline.profile?.contagion_quick?.fixed_clustered;
if (fixedClustered && baseFixed) {
  results.push(checkThreshold('fixed-clustered gather (ms)', fixedClustered.gather.totalMs, baseFixed.gatherMs, WARN_THRESHOLD, FAIL_THRESHOLD));
  results.push(checkThreshold('fixed-clustered cache (ms)', fixedClustered.cache.totalMs, baseFixed.cacheBuildMs, WARN_THRESHOLD, FAIL_THRESHOLD));
}

// Check runtime-clustered
const runtimeClustered = contagionResult.scenarios['runtime-clustered'];
const baseRuntime = baseline.profile?.contagion_quick?.runtime_clustered;
if (runtimeClustered && baseRuntime) {
  results.push(checkThreshold('runtime-clustered gather (ms)', runtimeClustered.gather.totalMs, baseRuntime.gatherMs, WARN_THRESHOLD, FAIL_THRESHOLD));
}

// Display results
console.log('\nResults:');
console.log('─'.repeat(75));
console.log('Metric                         Current    Baseline   Ratio   Status');
console.log('─'.repeat(75));

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
    case 'pass': status = '✓ PASS'; break;
    case 'warn': status = '⚠ WARN'; hasWarn = true; break;
    case 'fail': status = '✗ FAIL'; hasFail = true; break;
  }

  console.log(`${name}${current}${base}${ratio}   ${status}`);
}

console.log('─'.repeat(75));

if (hasFail) {
  console.log('\n✗ Performance regression detected!');
  process.exit(1);
} else if (hasWarn) {
  console.log('\n⚠ Performance approaching threshold (machine variance)');
} else {
  console.log('\n✓ All performance checks passed');
}
