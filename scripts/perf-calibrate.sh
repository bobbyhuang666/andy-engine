#!/usr/bin/env bash
# perf-calibrate.sh — Run benchmarks and save as local baseline
# Usage: bash scripts/perf-calibrate.sh [--runs=N]

set -euo pipefail
cd "$(dirname "$0")/.."

RUNS_FLAG="${1:---runs=3}"

echo "Andy Engine — Local Baseline Calibration"
echo "========================================="
echo ""

node benchmarks/perf-check.js "$RUNS_FLAG" --calibrate

echo ""
echo "Local baseline saved to benchmarks/baselines/local.json"
