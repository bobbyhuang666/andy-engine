#!/bin/bash
set -e

echo "=== Andy Engine Release Gate ==="
echo ""

# Track failures
FAILURES=()

# Function to run a check
run_check() {
  local name="$1"
  local cmd="$2"
  
  echo "Running: $name"
  if eval "$cmd"; then
    echo "✓ $name passed"
  else
    echo "✗ $name FAILED"
    FAILURES+=("$name")
  fi
  echo ""
}

# 0. Release clean check (macOS metadata)
run_check "release-clean" "bash scripts/check-release-clean.sh"

# 1. npm test
run_check "npm test" "npm test"

# 2. typecheck
run_check "typecheck" "npm run typecheck"

# 3. published-consumer typecheck
run_check "typecheck:consumer" "npm run typecheck:consumer"

# 4. test:domain
run_check "test:domain" "npm run test:domain"

# 5. replay fixture
run_check "replay:diff" "npm run replay:diff"

# 6. check:boundaries
run_check "check:boundaries" "npm run check:boundaries"

# 7. smoke:pack
run_check "smoke:pack" "npm run smoke:pack"

# 8. fresh:consumer
run_check "fresh:consumer" "npm run fresh:consumer"

# 9. release:check
run_check "release:check" "npm run release:check"

# 10. perf:check
run_check "perf:check" "npm run perf:check -- --runs=3"

# 11. legacy-removal-dry-run
run_check "legacy-removal-dry-run" "node scripts/legacy-removal-dry-run.js"

# 12. git diff --check
run_check "git diff --check" "git diff --check"

# 13. sqlite:smoke (optional)
echo "Checking for better-sqlite3..."
if node -e "try { require('better-sqlite3'); console.log('available'); } catch(e) { process.exit(1); }" > /dev/null 2>&1; then
  run_check "sqlite:smoke" "npm run sqlite:smoke"
else
  echo "SKIPPED: sqlite:smoke (better-sqlite3 not available)"
  echo ""
fi

# Summary
echo "=== Release Gate Summary ==="
if [ ${#FAILURES[@]} -eq 0 ]; then
  echo "✓ All checks passed"
  exit 0
else
  echo "✗ ${#FAILURES[@]} check(s) failed:"
  for failure in "${FAILURES[@]}"; do
    echo "  - $failure"
  done
  exit 1
fi
