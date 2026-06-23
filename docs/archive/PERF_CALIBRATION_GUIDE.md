# Performance Calibration Guide

## Overview

Andy Engine's `perf:check` compares current benchmark results against a **release baseline** captured on a reference machine. Since timing numbers vary across machines (different CPUs, OS schedulers, background load), the release baseline is useful for CI on consistent hardware but **not directly comparable across machines**.

The local calibration workflow lets each developer capture their own baseline and compare against it.

---

## Quick Start

```bash
# Run perf:check against release baseline (default)
npm run perf:check

# Run perf:check with 3 runs (median mode, more stable)
npm run perf:check -- --runs=3

# Calibrate local baseline on your machine (3 runs, median)
npm run perf:calibrate

# Run perf:check against your local baseline
npm run perf:check -- --local

# Combine: local + median mode
npm run perf:check -- --local --runs=3

# Diagnose: test different engine configurations
npm run perf:diagnose
```

---

## What Metrics Are Tracked

| Metric | Source | Description |
|--------|--------|-------------|
| 100 agents avg/tick | `baseline.js quick` | Mean ms per simulation tick with 100 agents |
| 300 agents avg/tick | `baseline.js quick` | Mean ms per simulation tick with 300 agents |
| fixed-clustered gather (ms) | `contagion-profile.js quick` | Social contagion gather time (static graph) |
| fixed-clustered cache (ms) | `contagion-profile.js quick` | Contagion cache build time |
| runtime-clustered gather (ms) | `contagion-profile.js quick` | Social contagion gather time (dynamic graph) |

---

## How Median Is Calculated

When using `--runs=N` (N > 1), perf-check runs benchmarks N times and takes the **median** of each metric. It also reports min and max for each metric. This reduces noise from OS scheduling, GC pauses, and thermal throttling.

```js
// Median calculation (standard):
const sorted = [...values].sort((a, b) => a - b);
const mid = Math.floor(sorted.length / 2);
const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
```

---

## How Baselines Are Stored

### Release baseline

Located at `benchmarks/baselines/v0.2.0-post-contagion-cache.json`. This is the canonical reference baseline captured on the maintainers' machine. It includes:

- Version, date, commit hash, node version, platform
- Benchmark timing results (totalMs, avgMsPerTick, min/max/p50)
- Profile breakdowns (contagion, emotion, agent subsystem)
- Semantic flags and test counts

### Local baseline

Located at `benchmarks/baselines/local.json` (gitignored). Created by `npm run perf:calibrate`. Same metric structure but also records:

- CPU model and core count (for self-documentation)
- Run count used for calibration

---

## Thresholds

| Threshold | Ratio | Meaning |
|-----------|-------|---------|
| PASS | ≤ 1.6x | Within normal variance |
| WARN | 1.6x – 2.0x | Approaching regression; may be system noise |
| FAIL | > 2.0x | Performance regression detected |

These thresholds are applied identically whether comparing against release or local baseline.

---

## Why Cross-Machine Numbers Are Not Directly Comparable

Benchmark timing depends on:

1. **CPU model and clock speed** — different architectures have different IPC
2. **Core count and scheduling** — Node.js single-threaded but OS scheduling affects cache behavior
3. **Thermal state** — laptops throttle under sustained load
4. **Background processes** — other workloads steal CPU time
5. **Node.js version** — V8 optimizations change between versions
6. **Memory pressure** — available RAM affects GC behavior

**Implication:** A "PASS" on one machine does not mean the code is fast on another. Use `perf:calibrate` to establish your own baseline.

---

## What to Do When perf:check Fails

1. **Re-run with `--runs=3`** to rule out single-run variance:
   ```bash
   npm run perf:check -- --runs=3
   ```

2. **Check system load** — close other heavy processes.

3. **Calibrate local baseline** if you haven't already:
   ```bash
   npm run perf:calibrate
   npm run perf:check -- --local
   ```

4. **Use diagnose mode** to isolate which subsystem regressed:
   ```bash
   npm run perf:diagnose
   ```

5. **Profile the hot path** to find the regression source:
   ```bash
   npm run profile:contagion:quick
   npm run profile:agent:quick
   npm run profile:emotion:quick
   ```

6. **If the regression is real**, bisect commits to find the culprit.

---

## Flags Reference

| Flag | Description |
|------|-------------|
| `--runs=N` | Run benchmarks N times, report median (default: 1) |
| `--calibrate` | Run benchmarks and save results as local baseline |
| `--local` | Compare against local baseline instead of release baseline |
| `--diagnose` | Test different engine configurations (no comparison) |

---

## File Locations

| File | Purpose |
|------|---------|
| `benchmarks/perf-check.js` | Main perf regression checker |
| `benchmarks/baseline.js` | Benchmark runner (tick timing, memory) |
| `benchmarks/contagion-profile.js` | Contagion subsystem profiler |
| `benchmarks/baselines/v0.2.0-post-contagion-cache.json` | Release baseline |
| `benchmarks/baselines/local.json` | Your local baseline (gitignored) |
| `scripts/perf-calibrate.sh` | Calibration script |
