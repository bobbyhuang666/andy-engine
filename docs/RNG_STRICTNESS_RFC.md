# RNG Strictness RFC

> Stage 44 — Documentation only. No implementation.

## 1. Current State

Andy Engine v2.0-alpha.1 has a seeded simulation baseline:

- `src/shared/rng.js` implements a Mulberry32-based PRNG with full determinism
- RuntimeContext accepts an optional `rng` parameter
- AndyWorld propagates RNG to EventDispatcher and RuntimeContext
- Most core systems use `this._rng ? this._rng.next() : Math.random()` pattern

### Current Math.random Usage

**Core simulation paths (must migrate):**
- `src/runtime/AndyWorld.js` — 4 locations with fallback pattern
- `src/runtime/EventDispatcher.js` — random event dispatch
- `src/agent/schedule/Schedule.js` — schedule probability checks
- `src/agent/psychology/EmotionVector.js` — emotion dynamics
- `src/agent/psychology/BehaviorField.js` — behavior field noise
- `src/agent/psychology/EmotionRegulation.js` — regulation utilities
- `src/agent/psychology/IntrinsicMotivation.js` — motivation generation
- `src/agent/memory/PersonalMemory.js` — memory operations

**Non-simulation paths (acceptable):**
- `src/shared/ids.js` — ID generation (not simulation-critical)
- `src/sdk/Character.js` — character ID generation
- `src/store/world/migration.js` — migration ID generation
- `src/store/world/compiler.js` — world ID generation
- `src/sdk/AutoTick.js` — chat tick randomization
- `src/spatial/WorldMap.js` — initial position randomization
- `src/narrative/StoryGenerator.js` — narrative variety
- `src/sdk/EmotionSignalBuffer.js` — signal buffer selection

## 2. v2 Stable Target

### Design Principles

1. **Engine always owns an RNG instance** — no core simulation path should lack an RNG
2. **No direct Math.random in core simulation path** — all randomness flows through injected RNG
3. **Unseeded mode uses internally generated RNG seed** — backward compatible, but deterministic-capable
4. **Non-simulation paths exempt** — ID generation, SDK utilities, and narrative variety may use Math.random

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         AndyWorld                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    RuntimeContext                      │  │
│  │                      .rng ─────────────────────────────┼──┼─→ All subsystems
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│          ┌───────────────┼───────────────┐                  │
│          ▼               ▼               ▼                  │
│   EventDispatcher    AgentRuntime    SocialGraph            │
│          │               │               │                  │
│          ▼               ▼               ▼                  │
│    BehaviorField    EmotionVector   Schedule                │
│    EmotionRegulation IntrinsicMotivation Memory            │
└─────────────────────────────────────────────────────────────┘
```

### RNG Ownership Chain

```
AndyWorld (owns rng)
  → RuntimeContext.rng (reference)
  → EventDispatcher._rng (injected)
  → Agent._rng (injected from context)
    → BehaviorField._rng
    → EmotionVector._rng
    → Schedule._rng
    → EmotionRegulation._rng
    → IntrinsicMotivation._rng
    → PersonalMemory._rng
```

## 3. Migration Plan

### Phase 1: RuntimeContext Ownership

**Status:** Partially complete

RuntimeContext already accepts and stores `rng`. AndyWorld already propagates RNG to RuntimeContext.

**Remaining work:**
- Ensure AndyWorld always creates an RNG instance (even when none provided)
- Generate random seed for unseeded mode: `Date.now() ^ (Math.random() * 0xFFFFFFFF)`

```js
// In AndyWorld constructor
if (!rng) {
  const { RNG } = require('../shared/rng');
  const autoSeed = Date.now() ^ ((Math.random() * 0xFFFFFFFF) | 0);
  this.rng = new RNG(autoSeed);
} else {
  this.rng = rng;
}
```

### Phase 2: Agent._rand Delegation

**Status:** Not started

Agent currently has `_rand()` helper that falls back to Math.random. Must delegate to runtime RNG.

```js
// In Agent
_rand() {
  if (this._rng) return this._rng.next();
  // Fallback only for legacy standalone usage
  return Math.random();
}
```

**Migration:** Inject RNG from RuntimeContext during Agent initialization.

### Phase 3: Core Subsystem Injection

**Status:** Partially complete

Each subsystem already accepts `_rng` via constructor or setter. Migration requires:

1. **EventDispatcher** — Already has `_rng`, ensure injection from AndyWorld ✓
2. **BehaviorField** — Already has `_rng` with fallback pattern
3. **EmotionVector** — Already has `_rng` with fallback pattern
4. **Schedule** — Already has `_rng` with fallback pattern
5. **EmotionRegulation** — Already has `_rng` with fallback pattern
6. **IntrinsicMotivation** — Already has `_rng` with fallback pattern
7. **PersonalMemory** — Already has `_rng` with fallback pattern

**Remaining work:** Remove fallback patterns once injection is guaranteed.

### Phase 4: Fallback Removal

**Status:** Not started

Replace all:
```js
this._rng ? this._rng.next() : Math.random()
```

With:
```js
this._rng.next()
```

**Constraint:** Only after Phase 1-3 guarantee injection.

## 4. Constraints

### Backward Compatibility

- `new AndyEngine()` without seed must continue to work
- No behavioral changes in v2.0-alpha.x — only internal randomness source
- Existing save/load format must remain compatible (rngState serialization)

### Scope Limitations

**NOT in scope for v2 stable:**
- Full deterministic replay across SDK/tooling/store
- Cross-session reproducibility without explicit seed
- Deterministic ID generation (ids.js, Character.js)

**IN scope for v2 stable:**
- Same seed → same simulation trajectory
- No bare Math.random in core simulation loop
- RNG state serialization for save/load

### Performance

- RNG.next() is ~2x faster than Math.random() (Mulberry32 vs native)
- No performance regression expected
- Memory overhead: one RNG instance per world (negligible)

## 5. Test Plan

### Test 1: Same Seed → Same Trajectory

```js
describe('RNG Determinism', () => {
  it('same seed produces identical agent states after N ticks', () => {
    const seed = 42;
    
    const world1 = new AndyEngine({ seed });
    const world2 = new AndyEngine({ seed });
    
    for (let i = 0; i < 100; i++) {
      world1.tick();
      world2.tick();
    }
    
    const agents1 = world1.getAgents().map(a => ({
      position: a.position,
      emotion: a.emotion.getValence(),
      needs: a.needs.getDrive(),
    }));
    
    const agents2 = world2.getAgents().map(a => ({
      position: a.position,
      emotion: a.emotion.getValence(),
      needs: a.needs.getDrive(),
    }));
    
    expect(agents1).to.deep.equal(agents2);
  });
});
```

### Test 2: No Seed Still Works

```js
describe('RNG Unseeded Mode', () => {
  it('world initializes and ticks without explicit seed', () => {
    const world = new AndyEngine();
    expect(world.rng).to.exist;
    
    // Should not throw
    for (let i = 0; i < 10; i++) {
      world.tick();
    }
  });
});
```

### Test 3: No Bare Math.random in src Runtime Paths

```js
describe('RNG Strictness Audit', () => {
  it('no Math.random in core simulation files', () => {
    const coreFiles = [
      'src/runtime/AndyWorld.js',
      'src/runtime/EventDispatcher.js',
      'src/agent/schedule/Schedule.js',
      'src/agent/psychology/EmotionVector.js',
      'src/agent/psychology/BehaviorField.js',
      'src/agent/psychology/EmotionRegulation.js',
      'src/agent/psychology/IntrinsicMotivation.js',
      'src/agent/memory/PersonalMemory.js',
    ];
    
    for (const file of coreFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // Allow Math.random only in comments or exempt patterns
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('Math.random') && !line.trim().startsWith('//')) {
          // Check for exempt patterns (ID generation, etc.)
          if (!line.includes('toString(36)')) {
            assert.fail(`${file} contains Math.random: ${line.trim()}`);
          }
        }
      }
    }
  });
});
```

## Implementation Timeline

| Phase | Description | Target Version |
|-------|-------------|----------------|
| 1 | RuntimeContext ownership | v2.0-alpha.2 |
| 2 | Agent._rand delegation | v2.0-alpha.2 |
| 3 | Core subsystem injection | v2.0-alpha.3 |
| 4 | Fallback removal | v2.0-beta.1 |

## References

- `src/shared/rng.js` — RNG implementation
- `src/runtime/RuntimeContext.js` — Runtime context with rng
- `src/runtime/AndyWorld.js` — Main runtime orchestrator
- `src/agent/AgentRuntime.js` — Agent tick pipeline
- `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md` — Architecture state
- `docs/PUBLIC_API_CONTRACT.md` — Public API commitments