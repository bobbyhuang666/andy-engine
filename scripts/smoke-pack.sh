#!/bin/bash
# smoke:pack — Fresh install smoke test
#
# 用法：
#   npm run smoke:pack
#   bash scripts/smoke-pack.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMPDIR="/tmp/andy-smoke-pack-$$"

echo "=== Andy Engine Smoke Pack ==="
echo ""

# 1. Pack
echo "1. Packing..."
cd "$ROOT_DIR"
TARBALL=$(npm pack 2>/dev/null | tail -1)
echo "   Created: $TARBALL"

# 2. Create temp consumer
echo "2. Creating temp consumer..."
mkdir -p "$TMPDIR"
cp "$ROOT_DIR/$TARBALL" "$TMPDIR/"
cd "$TMPDIR"
npm init -y > /dev/null 2>&1

# 3. Install
echo "3. Installing tarball..."
npm install "$TARBALL" > /dev/null 2>&1

# 4. Run smoke test
echo "4. Running smoke test..."
cat > smoke.js << 'SMOKE_EOF'
const AndyEngine = require('andy-engine');
const { Character } = require('andy-engine/sdk');
const { validateDomain } = require('andy-engine/domain');
const { DomainRegistry } = require('andy-engine/domain/registry');
const tavern = require('andy-engine/presets/tavern');
const campus = require('andy-engine/presets/campus');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

// Default campus
check('new AndyEngine()', () => {
  const e = new AndyEngine();
  if (e.domain.id !== 'campus') throw new Error('not campus');
});

check('createCharacter + tick', () => {
  const e = new AndyEngine();
  const a = e.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  e.tick();
  if (!a.position) throw new Error('no position');
});

check('getNarrative()', () => {
  const e = new AndyEngine();
  e.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  const n = e.getNarrative('a');
  if (typeof n !== 'string') throw new Error('not string');
});

// Custom domain
check('new AndyEngine({ domain: tavern })', () => {
  const e = new AndyEngine({ domain: tavern });
  if (e.domain.id !== 'tavern') throw new Error('not tavern');
});

check('tavern createCharacter + tick', () => {
  const e = new AndyEngine({ domain: tavern });
  const a = e.createCharacter({ id: 'a', name: 'A', schedule: 'blacksmith' });
  e.tick();
  if (!a.position) throw new Error('no position');
});

// SDK
check('Character with custom engine', () => {
  const e = new AndyEngine({ domain: tavern });
  const c = new Character({ id: 'c', name: 'C', engine: e, llm: async () => 'ok' });
  if (c.id !== 'c') throw new Error('bad id');
});

// Domain
check('validateDomain(tavern)', () => {
  const r = validateDomain(tavern, { strict: true });
  if (!r.valid) throw new Error('invalid');
});

check('require("andy-engine/domain/validate")', () => {
  const { validateDomain: vd } = require('andy-engine/domain/validate');
  const r = vd(tavern, { strict: true });
  if (!r.valid) throw new Error('invalid');
});

check('DomainRegistry', () => {
  const r = new DomainRegistry(tavern);
  if (r.id !== 'tavern') throw new Error('bad id');
  if (!r.hasRegion('小屋')) throw new Error('no region');
  if (!r.hasState('喝酒')) throw new Error('no state');
});

check('campus preset', () => {
  if (campus.id !== 'campus') throw new Error('not campus');
  if (!campus.states['在上课']) throw new Error('no 在上课');
});

// Store
check('createMemoryStore()', () => {
  const { createMemoryStore } = require('andy-engine/store');
  const s = createMemoryStore();
  if (!s) throw new Error('no store');
  // Test basic operation
  s.saveSnapshot(0, Date.now(), Buffer.from('test'));
  s.close();
});

// Config
check('require("andy-engine/config/defaults")', () => {
  const defaults = require('andy-engine/config/defaults');
  if (!defaults.ANDY_DEFAULTS) throw new Error('no ANDY_DEFAULTS');
});

// Invalid domain
check('invalid domain throws', () => {
  try {
    new AndyEngine({ domain: { id: 'bad' } });
    throw new Error('should have thrown');
  } catch (e) {
    if (!e.message.includes('Invalid domain')) throw e;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
SMOKE_EOF

node smoke.js

# 5. Cleanup
echo ""
echo "5. Cleanup..."
cd /
rm -rf "$TMPDIR"
rm -f "$ROOT_DIR/$TARBALL"

echo ""
echo "=== Smoke Pack Complete ==="
