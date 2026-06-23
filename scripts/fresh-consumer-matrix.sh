#!/bin/bash
set -e

echo "=== Fresh Consumer Matrix ==="

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Pack the package
echo "1. Packing package..."
cd /Users/huangweijie/Desktop/andy-engine
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
npm install "$TARBALL" > /dev/null 2>&1

node -e "
const { createStore } = require('andy-engine/store');
try {
  const store = createStore({ dbPath: ':memory:' });
  console.log('No-SQLite: createStore succeeded (SQLite available)');
} catch (e) {
  if (e.message.includes('better-sqlite3')) {
    console.log('No-SQLite: OK (optional dependency error as expected)');
  } else {
    throw e;
  }
}
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

const engine = new AndyEngine({ seed: 'test' });
const agent = engine.createCharacter({ id: 'test', name: 'Test', mbti: 'INFP' });
engine.tick();
const agents = engine.getAllAgents();
const grounding = engine.getGroundingPackage('test');
console.log('TypeScript: OK');
EOF

npx tsc --noEmit --esModuleInterop --moduleResolution node16 --module node16 test.ts
echo "TypeScript consumer: OK"

cd ..

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo "=== All consumer tests passed ==="