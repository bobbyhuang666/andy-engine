#!/bin/bash
# consumer-typecheck.sh — Fresh consumer typecheck
#
# Validates that TypeScript consumers can import and type-check against
# the published package surface.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMPDIR="/tmp/andy-consumer-typecheck-$$"

echo "=== Andy Engine Consumer Typecheck ==="
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

# 3. Install package + typescript
echo "3. Installing..."
npm install "$TARBALL" typescript > /dev/null 2>&1

# 4. Create consumer .ts file
echo "4. Creating consumer test file..."
cat > consumer.ts << 'TS_EOF'
import AndyEngine = require('andy-engine');
import { Character, Andy, NarrativeBuilder, create, ConversationLog, LLMFunction } from 'andy-engine/sdk';
import store = require('andy-engine/store');
import facts = require('andy-engine/facts');
import { DomainRegistry, validateDomain, DomainConfig } from 'andy-engine/domain';
import { validateDomain as validateDomainSubpath } from 'andy-engine/domain/validate';
import { DomainRegistry as DomainRegistrySubpath } from 'andy-engine/domain/registry';
import defaults = require('andy-engine/config/defaults');
import campus = require('andy-engine/presets/campus');
import tavern = require('andy-engine/presets/tavern');

// Root import
const engine = new AndyEngine();
const agent = engine.createCharacter({ id: 'a', name: 'Alice', mbti: 'INFP' });
engine.tick();
const narrative: string = engine.getNarrative('a');
const ctx = engine.getWorldContext('a');
const agents = engine.getAllAgents();
const snap = engine.snapshot();
const worldState = store.toWorldState(engine, 'consumer-world');
const restored = store.fromWorldState(worldState, { enableFacts: true }, AndyEngine);
const serialized = store.Serialization.serializeWorldState(worldState);
const deserialized = store.Serialization.deserializeWorldState(serialized);
const memory = new store.MemoryStore();
memory.saveSnapshot(1, Date.now(), new Uint8Array([1, 2, 3]));
const latest = memory.loadLatest();
const latestAlias = memory.loadLatestSnapshot();
memory.set('key', 'value');
memory.saveMeta('legacy', 'ok');
const metaValue: string | null = memory.get('key');
const legacyMeta: string | null = memory.loadMeta('legacy');
memory.close();
const saveLoad = new store.SaveLoad({
  save: (envelope: any, metadata?: any) => ({ envelope, metadata }),
  load: (snapshotId: string) => ({ version: '0.1.0', runtimeSnapshot: {} }),
  list: () => [],
});
const savedEnvelope = saveLoad.save({ toJSON: () => worldState }, { tag: 'typed' });
const snapshotList = saveLoad.listSnapshots();

// SDK import
const character = new Character({ name: 'Bob' });
const seededCharacter = new Character({
  name: 'Seeded',
  seed: 'consumer-seed',
  rng: () => 0.5,
  llm: async () => 'ok',
});
const conversation = new ConversationLog();
const msg = conversation.toMessages();

// create() shortcut
const c = create({ name: 'Charlie' });
const sdkLLM: LLMFunction = async () => 'ok';
const seededAndy = new Andy({ seed: 'consumer-andy', rng: () => 0.5, enableFacts: true, llm: sdkLLM });
seededAndy.addCharacter({ id: 'seeded', name: 'Seeded Andy' });

// P1-3: FactScope.INTERNAL must be visible to TS consumers.
const internalScope: string = facts.FactScope.INTERNAL;
const allScopes = facts.FACT_SCOPES;
const fact = {
  id: 'f1', type: 'event', timestamp: new Date(), source: 'engine',
  confidence: 1, scope: facts.FactScope.INTERNAL, participants: [], observers: [],
};
const scopeValues: string[] = Object.keys(allScopes).map(k => allScopes[k]);
if (scopeValues.indexOf(internalScope) < 0) throw new Error('INTERNAL scope not exported');

// Store + domain facade imports should typecheck in a fresh consumer without
// requiring @types/node or relying on ambient object-literal export assignment.
const domain: DomainConfig = {
  id: 'tiny',
  name: 'Tiny',
  states: { idle: { next: ['idle'] } },
  stateCenters: { idle: [0, 0, 0, 0] },
  regions: ['room'],
  adjacency: [],
  fallback: { defaultRegion: 'room', defaultState: 'idle' },
};
const domainResult = validateDomain(domain);
const campusResult = validateDomainSubpath(campus, { strict: true });
const registry = new DomainRegistry(domain, { validate: false });
const tavernRegistry = new DomainRegistrySubpath(tavern, { validate: false });
if (!domainResult.valid || !campusResult.valid || !registry.hasRegion('room') || !tavernRegistry.hasRegion('酒馆') || !defaults.ANDY_DEFAULTS || !restored || !deserialized || !latest || !latestAlias || metaValue !== 'value' || legacyMeta !== 'ok' || !savedEnvelope || snapshotList.length !== 0) {
  throw new Error('public facade type smoke failed');
}

// D5 v3 sidecar: checkConsistency accepts 3rd param options with structuredClaims
// and ConsistencyCheckResult exposes evidenceTrace/coreferenceNotes/verifierDecisions
const result: any = engine.checkConsistency('hello world', 'a', { structuredClaims: [] });
if (result.valid === undefined) throw new Error('checkConsistency 3-param failed');
const et: any[] | undefined = result.evidenceTrace;
const cn: any[] | undefined = result.coreferenceNotes;
const vd: any[] | undefined = result.verifierDecisions;

// D5 v3 sidecar via facts subpath: FactConsistencyChecker.check accepts options
const FactChecker = facts.FactConsistencyChecker;
const factStore = new facts.WorldFactStore();
const factChecker = new FactChecker(factStore);
const factResult: any = factChecker.check('hello world', { allowedFacts: [] }, { structuredClaims: [] });
if (factResult.valid === undefined) throw new Error('facts FactConsistencyChecker 3-param failed');
const factEt: any[] | undefined = factResult.evidenceTrace;
const factCn: any[] | undefined = factResult.coreferenceNotes;
const factVd: any[] | undefined = factResult.verifierDecisions;
const factGv: string | undefined = factResult.groundingVersion;
TS_EOF

# 5. Create tsconfig
cat > tsconfig.json << 'TSC_EOF'
{
  "compilerOptions": {
    "noEmit": true,
    "strict": false,
    "skipLibCheck": false,
    "target": "ES2022",
    "module": "node16",
    "moduleResolution": "node16",
    "esModuleInterop": true
  },
  "include": ["consumer.ts"]
}
TSC_EOF

# 6. Run tsc
echo "5. Running tsc --noEmit..."
npx tsc --noEmit 2>&1
TSC_EXIT=$?

if [ $TSC_EXIT -eq 0 ]; then
  echo "   ✓ Consumer typecheck passed"
else
  echo "   ✗ Consumer typecheck failed (exit $TSC_EXIT)"
fi

# 7. Cleanup
echo ""
echo "6. Cleanup..."
cd /
rm -rf "$TMPDIR"
rm -f "$ROOT_DIR/$TARBALL"

echo ""
echo "=== Consumer Typecheck Complete ==="
exit $TSC_EXIT
