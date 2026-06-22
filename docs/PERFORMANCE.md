# Andy Engine Performance

## v0.2.0 Baseline (Post Phase 14)

**Date:** 2026-06-10
**Commit:** ec202b0
**Node:** v26.0.0
**Platform:** darwin

### Benchmark:quick Results

| Config | Total (ms) | Avg/Tick (ms) | Min | Max | P50 |
|--------|-----------|---------------|-----|-----|-----|
| 100 agents × 50 ticks | 1,276 | 25.52 | 22.19 | 40.94 | 24.61 |
| 300 agents × 20 ticks | 4,050 | 202.48 | 175.79 | 234.53 | 201.29 |

### Profile:contagion Results (Fixed-Clustered)

| Component | Total (ms) | %Total |
|-----------|-----------|--------|
| cache build | 7.33 | 15.65% |
| gather | 33.87 | 72.27% |
| **Total** | **47** | |

- Total entries: 297,000
- Avg neighbors: 99

### Profile:emotion Results

| Step | Total (ms) | %EmotionTick |
|------|-----------|--------------|
| _socialContagion | 115 | 62% |
| _oppositionDamping | 20 | 11% |
| _timeDecay | 16 | 9% |
| **EmotionVector.tick** | **~200** | |

### Profile:agent Results

| Step | Total (ms) | %AgentTick |
|------|-----------|------------|
| EmotionVector.tick | 189 | 53% |
| BehaviorField.tick | 30 | 8% |
| IntrinsicMotivation.tick | 22 | 6% |
| **Agent.tick** | **~355** | |

---

## Phase 14: Social Contagion Cache Optimization

### Before (Phase 13.2)

| Metric | Value |
|--------|-------|
| fixed-clustered gather | ~645 ms |
| runtime contagion gather | ~370 ms |
| emotionBlend per-edge | O(edges × 30) |

### After (Phase 14)

| Metric | Value |
|--------|-------|
| fixed-clustered gather | ~47 ms |
| runtime contagion gather | ~35 ms |
| emotionBlend per-agent | O(agents × 30) |

### Improvement

- Fixed-clustered gather: **~13.7x faster**
- Runtime contagion gather: **~10x faster**

### Semantic Change

Social contagion changed from **sequential read semantics** to **per-tick snapshot semantics**:

- Old: Each agent reads neighbor's emotion at the time of `_gatherContagionInputs()`
- New: All agents see the emotion snapshot at the start of the tick

This is synchronous simulation semantics, avoiding order-dependent bias.

---

## How to Run

```bash
# Full benchmark
npm run benchmark

# Quick benchmark (recommended for daily use)
npm run benchmark:quick

# Performance regression check (against release baseline)
npm run perf:check

# Performance regression check with median of 3 runs
npm run perf:check -- --runs=3

# Calibrate local baseline for your machine
npm run perf:calibrate

# Performance regression check against local baseline
npm run perf:check -- --local

# Diagnose: test different engine configurations
npm run perf:diagnose

# Subsystem profiling
npm run profile:quick
npm run profile:agent:quick
npm run profile:emotion:quick
npm run profile:contagion:quick
```

---

## Local Baseline Calibration

The release baseline (`benchmarks/baselines/v0.2.0-post-contagion-cache.json`) was captured on a specific machine. Timing numbers vary across machines due to CPU, OS scheduling, thermal state, and background load.

To establish a baseline for your machine:

```bash
npm run perf:calibrate          # saves to benchmarks/baselines/local.json
npm run perf:check -- --local   # compare against your local baseline
```

The local baseline records your CPU model, core count, node version, and the median of 3 runs. Use `--local` for all subsequent checks on your machine.

See `docs/PERF_CALIBRATION_GUIDE.md` for full details.

---

## Caveats

- **Cross-machine comparison is unreliable.** CPU model, core count, thermal throttling, and background load all affect timing. Use `perf:calibrate` to establish your own baseline.
- **Single-run variance is high.** Use `--runs=3` for stable results. OS scheduling, GC pauses, and JIT warmup all cause noise.
- **`benchmark:quick` takes ~10 seconds;** full `benchmark` takes longer.
- **Profile numbers are inclusive timings** (nested calls may overlap).
- **Thresholds (WARN 1.6x, FAIL 2.0x)** are tuned for median-of-3 comparisons against a same-machine baseline. Single runs may trigger false positives.
- **For CI:** use a dedicated runner with consistent specs, or compare only against the release baseline on the same runner type.
