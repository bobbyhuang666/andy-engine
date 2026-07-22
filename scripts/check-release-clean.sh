#!/bin/bash
set -e

echo "=== Release Clean Check ==="
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

# 1. Check that the Git working tree is clean
echo "Checking Git working tree..."
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "✗ Not inside a Git working tree"
  FAILURES+=("Not inside a Git working tree")
else
  GIT_CHANGES=$(git status --porcelain --untracked-files=all)
  if [ -z "$GIT_CHANGES" ]; then
    echo "✓ Git working tree is clean"
  else
    echo "✗ Git working tree has uncommitted changes:"
    echo "$GIT_CHANGES"
    FAILURES+=("Git working tree is dirty")
  fi
fi
echo ""

# 2. Check for macOS metadata files
echo "Checking for macOS metadata files..."
METADATA_FILES=$(find . \( -name '._*' -o -name '.DS_Store' \) 2>/dev/null)
if [ -z "$METADATA_FILES" ]; then
  echo "✓ No macOS metadata files found"
else
  echo "✗ Found macOS metadata files:"
  echo "$METADATA_FILES"
  FAILURES+=("macOS metadata files found")
fi
echo ""

# 3. Check for Windows Thumbs.db
echo "Checking for Windows Thumbs.db..."
THUMBS_FILES=$(find . -name 'Thumbs.db' 2>/dev/null)
if [ -z "$THUMBS_FILES" ]; then
  echo "✓ No Windows Thumbs.db found"
else
  echo "✗ Found Windows Thumbs.db:"
  echo "$THUMBS_FILES"
  FAILURES+=("Windows Thumbs.db found")
fi
echo ""

# 4. Check for temporary files
echo "Checking for temporary files..."
TEMP_FILES=$(find . \( -name '*.tmp' -o -name '*.temp' -o -name '*.swp' -o -name '*.swo' \) 2>/dev/null)
if [ -z "$TEMP_FILES" ]; then
  echo "✓ No temporary files found"
else
  echo "✗ Found temporary files:"
  echo "$TEMP_FILES"
  FAILURES+=("Temporary files found")
fi
echo ""

# Summary
echo "=== Release Clean Check Summary ==="
if [ ${#FAILURES[@]} -eq 0 ]; then
  echo "✓ All checks passed - release is clean"
  exit 0
else
  echo "✗ ${#FAILURES[@]} check(s) failed:"
  for failure in "${FAILURES[@]}"; do
    echo "  - $failure"
  done
  exit 1
fi
