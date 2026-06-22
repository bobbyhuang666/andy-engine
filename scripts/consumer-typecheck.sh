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
import { Character, Andy, NarrativeBuilder, create, ConversationLog } from 'andy-engine/sdk';

// Root import
const engine = new AndyEngine();
const agent = engine.createCharacter({ id: 'a', name: 'Alice', mbti: 'INFP' });
engine.tick();
const narrative: string = engine.getNarrative('a');
const ctx = engine.getWorldContext('a');
const agents = engine.getAllAgents();
const snap = engine.snapshot();

// SDK import
const character = new Character({ name: 'Bob' });
const conversation = new ConversationLog();
const msg = conversation.toMessages();

// create() shortcut
const c = create({ name: 'Charlie' });
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
