import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_RUN_COUNT,
  extractMetrics,
  parseRunCount,
} = require('../../benchmarks/perf-check.js');

function makeBenchResult() {
  return {
    results: [
      { agents: 100, timing: { avgMsPerTick: 12.3 } },
      { agents: 300, timing: { avgMsPerTick: 45.6 } },
    ],
  };
}

function makeContagionResult() {
  return {
    scenarios: {
      'fixed-clustered': {
        gather: { totalMs: 30 },
        cache: { totalMs: 7 },
      },
      'runtime-clustered': {
        gather: { totalMs: 25 },
      },
    },
  };
}

function makeBaseline() {
  return {
    benchmark: {
      quick: {
        '100_agents_50_ticks': { avgMsPerTick: 20 },
        '300_agents_20_ticks': { avgMsPerTick: 80 },
      },
    },
    profile: {
      contagion_quick: {
        fixed_clustered: { gatherMs: 32, cacheBuildMs: 8 },
        runtime_clustered: { gatherMs: 35 },
      },
    },
  };
}

describe('perf-check gate helpers', () => {
  it('defaults to median mode run count', () => {
    expect(DEFAULT_RUN_COUNT).toBe(3);
    expect(parseRunCount([])).toBe(3);
    expect(parseRunCount(['--runs=1'])).toBe(1);
  });

  it('rejects invalid run counts', () => {
    expect(() => parseRunCount(['--runs=0'])).toThrow(/Invalid --runs/);
    expect(() => parseRunCount(['--runs=abc'])).toThrow(/Invalid --runs/);
  });

  it('extractMetrics returns every expected metric when inputs match', () => {
    const metrics = extractMetrics(makeBenchResult(), makeContagionResult(), makeBaseline());
    expect(metrics.map(m => m.name)).toEqual([
      '100 agents avg/tick',
      '300 agents avg/tick',
      'fixed-clustered gather (ms)',
      'fixed-clustered cache (ms)',
      'runtime-clustered gather (ms)',
    ]);
  });

  it('extractMetrics fails closed when benchmark metrics are missing', () => {
    const bench = { results: [{ agents: 100, timing: { avgMsPerTick: 12.3 } }] };
    expect(() => extractMetrics(bench, makeContagionResult(), makeBaseline()))
      .toThrow(/300 agents avg\/tick current/);
  });

  it('extractMetrics fails closed when baseline metrics are missing', () => {
    const baseline = makeBaseline();
    delete baseline.profile.contagion_quick.runtime_clustered;
    expect(() => extractMetrics(makeBenchResult(), makeContagionResult(), baseline))
      .toThrow(/runtime-clustered gather.*baseline/);
  });
});
