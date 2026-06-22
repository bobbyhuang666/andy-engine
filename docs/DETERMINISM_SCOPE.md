# Determinism Scope Audit

> Audit of `Math.random()` and `Date.now()` usage across `src/` to determine actual determinism scope.

## Summary

| Category | Math.random() | Date.now() | Files |
|----------|---------------|------------|-------|
| A: Core simulation | 14 | 18 | 12 |
| B: SDK/presentation | 7 | 9 | 6 |
| C: Store/tooling | 1 | 8 | 5 |
| D: Tests/benchmarks | — | — | — |

### A-class Math.random() by fallback status

| Status | Count | Files |
|--------|-------|-------|
| Has rng fallback | 14 | AndyWorld, EventDispatcher, Schedule, EmotionRegulation, IntrinsicMotivation, PersonalMemory (line 991), BehaviorField, EmotionVector, **WorldMap** |
| **No rng fallback** | **0** | — |

### P0 Issues: A-class Math.random() without rng fallback

~~**src/spatial/WorldMap.js** — 6 occurrences, 0 have rng fallback.~~ **FIXED.** All 6 `Math.random()` calls now use `this._rng ? this._rng.next() : Math.random()` fallback. Constructor accepts `options.rng`.

| Line | Context | Function | Status |
|------|---------|----------|--------|
| 44 | `this.width / 2 + (rng - 0.5) * 50` | `regionToCoords()` — unknown region fallback x | **FIXED** |
| 45 | `this.height / 2 + (rng - 0.5) * 50` | `regionToCoords()` — unknown region fallback y | **FIXED** |
| 161 | `this.x + padding + rand() * (this.w - padding * 2)` | `randomPoint()` — rect shape x | **FIXED** |
| 162 | `this.y + padding + rand() * (this.h - padding * 2)` | `randomPoint()` — rect shape y | **FIXED** |
| 166 | `rand() * Math.PI * 2` | `randomPoint()` — circle angle | **FIXED** |
| 167 | `Math.sqrt(rand()) * (this.radius - padding)` | `randomPoint()` — circle radius | **FIXED** |

These affect agent position resolution. Any agent placed in a region or at an unknown region coordinate will use unseeded randomness.

---

## A-class Date.now() audit

Date.now() in core path mostly has `simTime` / `_simTime` fallbacks:

| File | Line | Has simTime fallback | Notes |
|------|------|---------------------|-------|
| EventDispatcher.js | 483 | ✓ | `this._simTime ? this._simTime.getTime() : Date.now()` |
| AndyWorld.js | 290 | N/A | Performance measurement (`tickStart`) |
| AndyWorld.js | 441 | N/A | Performance measurement (`durationMs`) |
| PersonalMemory.js | 48 | — | Initialization default `this._simTime = Date.now()` |
| PersonalMemory.js | 72 | — | Deserialization fallback `m.timestamp \|\| Date.now()` |
| PersonalMemory.js | 745 | ✓ | `this._simTime \|\| Date.now()` |
| PersonalMemory.js | 1033 | — | Serialization default `b.createdAt \|\| Date.now()` |
| MindWanderRuntime.js | 132 | ✓ | `agent.memory._simTime \|\| Date.now()` |
| AgentNarrative.js | 93 | ✓ | `agent.memory._simTime \|\| Date.now()` |
| MemoryPressure.js | 31 | ✓ | `options.simTime ? ... : Date.now()` |
| StoryGenerator.js | 114 | ✓ | `simTime ? simTime.getTime() : Date.now()` |
| StoryGenerator.js | 167 | ✓ | `simTime ? simTime.getTime() : Date.now()` |
| StoryGenerator.js | 137 | ✓ | `rng ? rng.next() : Math.random()` (rng fallback for Math.random) |
| IntrinsicMotivation.js | 180,187,195,228,337,459,488 | ✓ | All use `simTime ? simTime.getTime() : Date.now()` |
| shared/ids.js | 11 | — | ID generation; uniqueness, not simulation time |

Date.now() without simTime fallback in core path: **3 files** (PersonalMemory init/deserialize/serialize, ids.js). None affect simulation state evolution; they affect timestamps in persisted data and ID uniqueness.

---

## B-class: SDK/presentation path

| File | Usage | Notes |
|------|-------|-------|
| sdk/Character.js | `Date.now()`, `Math.random()` | ID generation fallback |
| sdk/AutoTick.js | `Date.now()`, `Math.random()` | Wall-clock timing, tick jitter |
| sdk/AndyTownAdapter.js | `Date.now()` | Wall-clock timestamp |
| sdk/EmotionSignalBuffer.js | `Date.now()` × 2, `Math.random()` × 3 | Timestamps, variant selection |
| sdk/ConversationLog.js | `Date.now()` × 2 | Timestamps |
| narrative/StoryGenerator.js | `Date.now()` × 2, `Math.random()` × 2 | Has rng/simTime fallbacks ✓ |

Documented as out of scope for seeded baseline.

---

## C-class: Store/tooling path

| File | Usage | Notes |
|------|-------|-------|
| store/SimulationStore.js | `Date.now()` × 2 | Snapshot timestamp, filter cutoff |
| store/SQLiteStore.js | `Date.now()` × 5 | Query cutoffs, timestamps |
| store/world/migration.js | `Date.now()`, `Math.random()` | Migration ID generation |
| store/world/compiler.js | `Date.now()`, `Math.random()` | World ID generation |
| pressure/MemoryPressure.js | `Date.now()` | Has simTime fallback ✓ |

Documented as out of scope for seeded baseline.

---

## D-class: Comments/docs-only references

These files mention `Math.random` or `Date.now` in comments only (no actual calls):

- `src/action/ActionCandidate.js:4` — "No live references, no Date.now(), no Math.random()."
- `src/action/UtilityScorer.js:10` — "No Math.random(), no Date.now()"
- `src/action/WorldObject.js:4` — "Pure functions. No Math.random/Date.now."
- `src/action/GoalSystem.js:6` — "不读取 Date.now"
- `src/shared/rng.js:8` — "不修改 Math.random"
- `src/effects/EventEffectPipeline.js:10` — "No Date.now(): time from context.simTime"

---

## README determinism claims

Current claims in README.md:

- Line 68: `"Seeded RNG | Core simulation supports reproducible random baseline"`
- Line 118: `"Seeded RNG baseline for reproducible core simulations"`
- Line 598: `"seeded RNG | 核心模拟支持可复现随机基线"`

**Assessment: No overclaim.** The README says "seeded RNG baseline" and "reproducible core simulations" — not "full deterministic replay". Claims are accurate given the current state, subject to the WorldMap P0 fix.

---

## Seeded RNG coverage in core path

Files that correctly use `this._rng ? this._rng.next() : Math.random()` or equivalent:

| File | Lines |
|------|-------|
| src/runtime/AndyWorld.js | 202, 204, 501 |
| src/runtime/EventDispatcher.js | 52 |
| src/agent/schedule/Schedule.js | 111, 142 |
| src/agent/psychology/EmotionRegulation.js | 211 |
| src/agent/psychology/IntrinsicMotivation.js | 300, 318 |
| src/agent/psychology/BehaviorField.js | 611 |
| src/agent/psychology/EmotionVector.js | 236 |
| src/agent/memory/PersonalMemory.js | 991 |
| src/narrative/StoryGenerator.js | 137, 305 |
| src/spatial/WorldMap.js | 44, 45, 161, 162, 166, 167 |

---

## Recommendation

1. ~~**P0**: WorldMap needs an `_rng` injection (constructor option or from runtime context) and all 6 `Math.random()` calls replaced with `_rng ? _rng.next() : Math.random()`.~~ **DONE.**
2. **P1**: `src/shared/ids.js` could accept an optional rng for deterministic ID generation (low priority — IDs don't affect simulation logic).
3. No README changes needed for determinism claims.

## Known Technical Debt (alpha.4 / beta)

### NarrativeBuilder string parsing debt

`src/sdk/NarrativeBuilder.js` uses fragile string matching on Chinese text output from upstream modules (NeedsSystem, EmotionVector, WorldContext). Any format change in upstream `toPromptString()` methods will silently break prompt generation. This should be replaced with structured data access.

### SDK presentation RNG debt: EmotionSignalBuffer

`src/sdk/EmotionSignalBuffer.js` (lines 98, 105, 112) uses bare `Math.random()` without the seeded RNG fallback pattern used everywhere else in `src/`. Lines 34, 60 use bare `Date.now()` without simTime integration. This module needs RNG injection and simTime support.

### Personality restore semantic debt

`src/agent/psychology/Personality.js` `fromJSON()` passes saved `emotionBaseline` as modifiers to the constructor, which may double-apply the baseline on restore. Additionally, `_refreshBehavior()` calls `_computeEmotionBaseline()` without modifiers, losing original config modifiers after drift. The semantics of modifiers vs baseline vs drift need clarification.
