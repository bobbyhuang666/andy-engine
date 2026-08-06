/**
 * Performance Regression Check — Andy Engine v2.0.0-alpha.1
 *
 * 检查当前 benchmark 和 profile 是否超过 baseline 的阈值。
 *
 * 用法：
 *   node benchmarks/perf-check.js              # 3次运行取中位数
 *   node benchmarks/perf-check.js --runs=1     # 单次运行（快速本地探查）
 *   node benchmarks/perf-check.js --runs=3     # 3次运行取中位数
 *   node benchmarks/perf-check.js --diagnose   # 诊断模式，测试不同配置
 *   node benchmarks/perf-check.js --calibrate  # 运行并保存为 local baseline
 *   node benchmarks/perf-check.js --local      # 对比 local baseline
 *   npm run perf:check
 *   npm run perf:calibrate
 *   npm run perf:diagnose
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const RELEASE_BASELINE_PATH = path.join(__dirname, 'baselines/v2.0.1.json');
const LOCAL_BASELINE_PATH = path.join(__dirname, 'baselines/local.json');
const BENCH_JSON = '/tmp/andy-benchmark-baseline.json';
const CONTAGION_JSON = '/tmp/andy-contagion-profile.json';
const WARN_THRESHOLD = 1.6;
const FAIL_THRESHOLD = 2.0;
const DEFAULT_RUN_COUNT = 3;

const EXPECTED_METRICS = [
  {
    name: '100 agents avg/tick',
    current: result => result?.results?.find(r => r.agents === 100)?.timing?.avgMsPerTick,
    baseline: baseline => baseline?.benchmark?.quick?.['100_agents_50_ticks']?.avgMsPerTick,
  },
  {
    name: '300 agents avg/tick',
    current: result => result?.results?.find(r => r.agents === 300)?.timing?.avgMsPerTick,
    baseline: baseline => baseline?.benchmark?.quick?.['300_agents_20_ticks']?.avgMsPerTick,
  },
  {
    name: 'fixed-clustered gather (ms)',
    current: (_, contagion) => contagion?.scenarios?.['fixed-clustered']?.gather?.totalMs,
    baseline: baseline => baseline?.profile?.contagion_quick?.fixed_clustered?.gatherMs,
  },
  {
    name: 'fixed-clustered cache (ms)',
    current: (_, contagion) => contagion?.scenarios?.['fixed-clustered']?.cache?.totalMs,
    baseline: baseline => baseline?.profile?.contagion_quick?.fixed_clustered?.cacheBuildMs,
  },
  {
    name: 'runtime-clustered gather (ms)',
    current: (_, contagion) => contagion?.scenarios?.['runtime-clustered']?.gather?.totalMs,
    baseline: baseline => baseline?.profile?.contagion_quick?.runtime_clustered?.gatherMs,
  },
];

function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    console.error(`Baseline not found: ${baselinePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
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

// 版本无关的参考负载：固定规模的 JSON round-trip。
// 基线 JSON 里记录封印时的 meta.referenceMs；检查时重测一次，
// machineFactor = current/sealed，据此缩放绝对毫秒基线，
// 让"别人机器上封印的基线"在本地/CI 都可比。
const REFERENCE_PAYLOAD = JSON.stringify({
  agents: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `agent_${i}`, vec: [i, i * 2, i * 3] })),
});

function measureReferenceMs(rounds = 3) {
  const times = [];
  for (let round = 0; round < rounds; round++) {
    const start = performance.now();
    let acc = 0;
    for (let i = 0; i < 50; i++) {
      acc += JSON.stringify(JSON.parse(REFERENCE_PAYLOAD)).length;
    }
    times.push(performance.now() - start);
  }
  return median(times);
}

function scaleBaseline(baseline, factor) {
  if (factor === 1) return baseline;
  const scaled = JSON.parse(JSON.stringify(baseline));
  const scaleMetric = obj => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (['avgMsPerTick', 'gatherMs', 'cacheBuildMs'].includes(key) && typeof obj[key] === 'number') {
        obj[key] *= factor;
      } else if (typeof obj[key] === 'object') {
        scaleMetric(obj[key]);
      }
    }
  };
  scaleMetric(scaled.benchmark);
  scaleMetric(scaled.profile);
  return scaled;
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
  runChildCommand('node benchmarks/baseline.js quick');
  return JSON.parse(fs.readFileSync(BENCH_JSON, 'utf-8'));
}

function runContagionProfileQuick() {
  runChildCommand('node benchmarks/contagion-profile.js quick');
  return JSON.parse(fs.readFileSync(CONTAGION_JSON, 'utf-8'));
}

function runChildCommand(command) {
  try {
    execSync(command, { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    if (stdout.trim()) {
      console.error(`\n--- ${command} stdout ---`);
      console.error(stdout.trimEnd());
    }
    if (stderr.trim()) {
      console.error(`\n--- ${command} stderr ---`);
      console.error(stderr.trimEnd());
    }
    throw err;
  }
}

function readMetricValue(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing or invalid performance metric: ${label}`);
  }
  return value;
}

function extractMetrics(benchResult, contagionResult, baseline) {
  const metrics = [];

  for (const metric of EXPECTED_METRICS) {
    const current = readMetricValue(metric.current(benchResult, contagionResult), `${metric.name} current`);
    const base = readMetricValue(metric.baseline(baseline), `${metric.name} baseline`);
    metrics.push({ name: metric.name, current, baseline: base });
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

// ─── Save local baseline ───
function saveLocalBaseline(metrics, runCount) {
  const os = require('os');
  const cpus = os.cpus();
  const localBaseline = {
    version: 'local',
    date: new Date().toISOString().slice(0, 10),
    commit: getGitCommit(),
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpu: cpus.length > 0 ? cpus[0].model : 'unknown',
    cores: cpus.length,
    runCount,
    timestamp: new Date().toISOString(),
    meta: { referenceMs: Math.round(measureReferenceMs() * 100) / 100 },
    benchmark: { quick: {} },
    profile: { contagion_quick: {} },
  };

  for (const m of metrics) {
    if (m.name === '100 agents avg/tick') {
      localBaseline.benchmark.quick['100_agents_50_ticks'] = { avgMsPerTick: m.current };
    } else if (m.name === '300 agents avg/tick') {
      localBaseline.benchmark.quick['300_agents_20_ticks'] = { avgMsPerTick: m.current };
    } else if (m.name === 'fixed-clustered gather (ms)') {
      localBaseline.profile.contagion_quick.fixed_clustered = { gatherMs: m.current };
    } else if (m.name === 'fixed-clustered cache (ms)') {
      if (!localBaseline.profile.contagion_quick.fixed_clustered) localBaseline.profile.contagion_quick.fixed_clustered = {};
      localBaseline.profile.contagion_quick.fixed_clustered.cacheBuildMs = m.current;
    } else if (m.name === 'runtime-clustered gather (ms)') {
      localBaseline.profile.contagion_quick.runtime_clustered = { gatherMs: m.current };
    }
  }

  const dir = path.dirname(LOCAL_BASELINE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOCAL_BASELINE_PATH, JSON.stringify(localBaseline, null, 2));
  console.log(`\nLocal baseline saved: ${LOCAL_BASELINE_PATH}`);
}

// ─── Main ───
function parseRunCount(args) {
  const runsFlag = args.find(a => a.startsWith('--runs='));
  if (!runsFlag) return DEFAULT_RUN_COUNT;
  const parsed = parseInt(runsFlag.split('=')[1], 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid --runs value: ${runsFlag}`);
  }
  return parsed;
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--diagnose')) {
    runDiagnose();
    return 0;
  }

  const isCalibrate = argv.includes('--calibrate');
  const isLocal = argv.includes('--local');
  const runCount = parseRunCount(argv);

  console.log('Andy Engine Performance Regression Check');
  console.log('========================================\n');
  printEnvironment();

  let baselinePath;
  if (isLocal) {
    baselinePath = LOCAL_BASELINE_PATH;
    if (!fs.existsSync(baselinePath)) {
      console.error(`Local baseline not found: ${baselinePath}`);
      console.error('Run "npm run perf:calibrate" first to create a local baseline.');
      return 1;
    }
  } else {
    baselinePath = RELEASE_BASELINE_PATH;
  }
  let baseline = loadBaseline(baselinePath);
  console.log(`Baseline: ${baseline.version} (${baseline.date}, ${baseline.commit})${isLocal ? ' [LOCAL]' : ''}`);
  const sealedRef = baseline?.meta?.referenceMs;
  if (sealedRef) {
    const currentRef = measureReferenceMs();
    const machineFactor = Math.min(Math.max(currentRef / sealedRef, 0.25), 8);
    console.log(`Machine factor: ${machineFactor.toFixed(2)}x (reference ${currentRef.toFixed(1)}ms vs sealed ${sealedRef.toFixed(1)}ms)`);
    baseline = scaleBaseline(baseline, machineFactor);
  } else {
    console.log('Machine factor: n/a (baseline has no meta.referenceMs, absolute comparison)');
  }
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

      if (values.length !== runCount || baselines.length !== runCount) {
        throw new Error(`Missing performance metric across runs: ${name}`);
      }

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

  // Save local baseline if calibrating
  if (isCalibrate) {
    const medianMetrics = finalResults.map(r => ({ name: r.name, current: r.median || r.current }));
    saveLocalBaseline(medianMetrics, runCount);
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
    return 1;
  } else if (hasWarn) {
    console.log('\n\u26a0 Performance approaching threshold (machine variance)');
  } else {
    console.log('\n\u2713 All performance checks passed');
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`\n\u2717 ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_RUN_COUNT,
  EXPECTED_METRICS,
  checkThreshold,
  extractMetrics,
  parseRunCount,
};
