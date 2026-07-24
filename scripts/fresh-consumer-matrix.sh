#!/bin/bash
set -e

echo "=== Fresh Consumer Matrix ==="

# Get project root directory (where this script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Pack the package
echo "1. Packing package..."
cd "$PROJECT_ROOT"
npm pack --pack-destination "$TEMP_DIR"
TARBALL=$(ls "$TEMP_DIR"/andy-engine-*.tgz)
cd "$TEMP_DIR"

# Test A: Basic CJS consumer
echo "2. Testing Basic CJS consumer..."
mkdir -p test-cjs
cd test-cjs
npm init -y > /dev/null 2>&1
npm install "$TARBALL" > /dev/null 2>&1

node -e "
const AndyEngine = require('andy-engine');
const engine = new AndyEngine();
const agent = engine.createCharacter({ id: 'test', name: 'Test', mbti: 'INFP' });
engine.tick();
const narrative = engine.getNarrative('test');
console.log('Basic CJS: OK');
"

cd ..

# Test B: No-SQLite consumer
echo "3. Testing No-SQLite consumer..."
mkdir -p test-no-sqlite
cd test-no-sqlite
npm init -y > /dev/null 2>&1
npm install "$TARBALL" --omit=optional > /dev/null 2>&1

node -e "
const { createStore } = require('andy-engine/store');
(async () => {
  const store = createStore({ dbPath: ':memory:' });
  const result = await store.init({
    onSnapshot: () => new Uint8Array([1, 2, 3]),
    onRestore: () => {}
  });
  if (!store.db || store.db.constructor.name !== 'MemoryStore') {
    throw new Error('No-SQLite: expected MemoryStore fallback after init()');
  }
  if (result.restoredTick !== 0 || result.hasSnapshot !== false) {
    throw new Error('No-SQLite: unexpected init result');
  }
  store.onTick({ tickNumber: 1, time: Date.now() }, [
    { tick: 1, timestamp: Date.now(), agentId: 'a', content: 'hello' }
  ]);
  await store.shutdown();
  console.log('No-SQLite: OK (init() fell back to MemoryStore)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
"

cd ..

# Test C: TypeScript consumer
echo "4. Testing TypeScript consumer..."
mkdir -p test-ts
cd test-ts
npm init -y > /dev/null 2>&1
npm install "$TARBALL" typescript > /dev/null 2>&1

cat > test.ts << 'EOF'
import AndyEngine = require('andy-engine');
import store = require('andy-engine/store');
import { validateDomain as validateDomainSubpath } from 'andy-engine/domain/validate';
import { DomainRegistry as DomainRegistrySubpath } from 'andy-engine/domain/registry';
import defaults = require('andy-engine/config/defaults');
import campus = require('andy-engine/presets/campus');
import tavern = require('andy-engine/presets/tavern');

const engine = new AndyEngine({ seed: 'test' });
const agent = engine.createCharacter({ id: 'test', name: 'Test', mbti: 'INFP' });
const tickResult = engine.tick();
// W4 A1: verify TickResult.phase.effectSummary type is available
const effectSummary = tickResult.phase.effectSummary;
if (effectSummary) {
  const applied: number = effectSummary.counts.applied;
  const skipped: number = effectSummary.counts.skipped;
  const errored: number = effectSummary.counts.errored;
  const byType = effectSummary.byType;
  if (byType && byType.need) {
    const needApplied: number = byType.need.applied;
  }
}
const agents = engine.getAllAgents();
const grounding = engine.getGroundingPackage('test');
const memory = new store.MemoryStore();
memory.saveSnapshot(1, Date.now(), new Uint8Array([1, 2, 3]));
const latest = memory.loadLatest();
const latestAlias = memory.loadLatestSnapshot();
memory.set('key', 'value');
memory.saveMeta('legacy', 'ok');
const metaValue: string | null = memory.get('key');
const legacyMeta: string | null = memory.loadMeta('legacy');
const campusResult = validateDomainSubpath(campus, { strict: true });
const tavernRegistry = new DomainRegistrySubpath(tavern, { validate: false });
if (!latest || !latestAlias || metaValue !== 'value' || legacyMeta !== 'ok' || !campusResult.valid || !tavernRegistry.hasRegion('酒馆') || !defaults.ANDY_DEFAULTS) {
  throw new Error('store type/runtime smoke failed');
}
memory.close();
console.log('TypeScript: OK');
EOF

npx tsc --noEmit --esModuleInterop --moduleResolution node16 --module node16 test.ts
echo "TypeScript consumer: OK"

cd ..

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo "=== All consumer tests passed ==="
