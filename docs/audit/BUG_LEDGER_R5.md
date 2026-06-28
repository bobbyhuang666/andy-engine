# Bug Ledger — Round 5

**Date**: 2026-06-28
**Scope**: SDK completeness, event system, memory/cognition, NaN propagation audit
**Audit method**: Direct code review + 3 parallel sub-AI agents (SDK, events, memory/cognition)

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| P0       | 0     | 0     |
| P1       | 3     | 3     |
| P2       | 0     | 0     |

**Convergence status**: P0 = 0, P1 = 3 (all fixed). Bug rate continues declining: R1(7P0+8P1) → R3(2P0+3P1) → R4(0P0+1P1) → R5(0P0+3P1). R5 bugs are all NaN propagation variants — same class as R3, but in previously unaudited code paths.

---

## R5-AFF-001 — AffectCompiler NaN propagation through clamp()

**Severity**: P1
**File**: `src/agent/psychology/AffectCompiler.js:173`
**Status**: ✅ Fixed

### Description

`AffectCompiler.compile()` uses a local `clamp()` function to bound computed values to [0,1]. However, `clamp()` did not handle NaN/Infinity: `Math.max(0, Math.min(1, NaN))` returns `NaN`, not 0.

If any upstream input (emotion vector, needs, behaviorField) contained a NaN value — even after R3 fixes to EmotionVector._clamp() — the NaN would propagate through AffectCompiler's arithmetic and leak into the AffectFrame output fields: `warmth`, `directness`, `initiative`, `defensiveness`, `emotionalExplicitness`, `stability`, etc.

These AffectFrame fields feed into NarrativeBuilder and SDK output. NaN in these fields would cause narrative generation failures or corrupt SDK responses.

### Reproduction

1. Set `agent.emotion.current.joy = NaN` (e.g., via buggy custom code)
2. Even though EmotionVector._clamp() now catches NaN, there's a tick window before _clamp runs
3. AffectCompiler.compile() runs with the NaN value
4. `emotion.getDominant()` returns `{ dimension: 'joy', value: NaN }`
5. `positiveSum += NaN` → positiveSum = NaN
6. `clamp(NaN * 0.5 + ...)` = NaN
7. All downstream fields become NaN

### Fix

```js
function clamp(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
```

### Impact

AffectFrame NaN would corrupt narrative generation and SDK output for affected agents. No crash, but silent data corruption in all narrative/SDK paths that read AffectFrame.

---

## R5-COM-001 — EffectCommitter NaN bypass through need delta

**Severity**: P1
**File**: `src/effects/EffectCommitter.js:94-96`
**Status**: ✅ Fixed

### Description

`EffectCommitter._applyNeedDelta()` checks `typeof value === 'number'` before applying, but `typeof NaN === 'number'` is `true`. This means a NaN value in a NeedDelta's `changes` object would pass the type check and be applied directly:

```js
agent.needs.needs[name] = Math.max(0, Math.min(1, agent.needs.needs[name] + value));
// If value is NaN: agent.needs.needs[name] + NaN = NaN
// Math.max(0, Math.min(1, NaN)) = NaN
```

This is the same NaN propagation pattern that R3 fixed in BehaviorField, EmotionVector, and NeedsSystem. EffectCommitter is the canonical write-path for all need deltas, so a NaN here would bypass the NeedsSystem's own guards and directly corrupt the need value.

Once a need value is NaN, all downstream systems break: BehaviorField._addNeedsGradient() (protected by R3 fix), PhysiologyRuntime.applyNeedsToEmotion() (NOT protected — would propagate NaN to emotions), and AffectCompiler (now protected by R5-AFF-001).

### Reproduction

1. Create a NeedDelta with `{ changes: { energy: NaN } }`
2. EffectCommitter._applyNeedDelta() applies it
3. `agent.needs.needs.energy` becomes NaN
4. Next tick: PhysiologyRuntime.applyNeedsToEmotion() reads `needs.energy < 0.25`
5. `0.25 - NaN = NaN`, `NaN * 0.10 = NaN`
6. `agent.emotion.applyEffect({ sadness: NaN, ... })` — if R3 fix didn't exist, this would permanently destroy the agent

### Fix

```js
for (const [name, value] of Object.entries(delta.changes)) {
  if (typeof agent.needs.needs[name] === 'number' && typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isFinite(agent.needs.needs[name])) continue;
    agent.needs.needs[name] = Math.max(0, Math.min(1, agent.needs.needs[name] + value));
  }
}
```

### Impact

Without R3's EmotionVector fix, this would be P0 — NaN in needs would cascade to emotions via PhysiologyRuntime and permanently destroy an agent. With R3's fix, the NaN is stopped at EmotionVector.applyEffect(), but the need value itself would remain corrupted, causing incorrect agent behavior (needs always appearing as NaN → default behavior, no drive).

---

## R5-BND-003 — FutureTendencyTracker NaN propagation in updateTendency()

**Severity**: P1
**File**: `src/agent/psychology/FutureTendencyTracker.js:39-42`
**Status**: ✅ Fixed

### Description

`FutureTendencyTracker.updateTendency()` adds a delta value to the current tendency vector without NaN/Infinity guards. If a delta contains NaN (e.g., from a corrupted EffectResult or from `_computeTendencyDelta()` encountering NaN in rule deltas), the NaN propagates to the stored tendency and persists permanently:

```js
current[d] += delta[d] * importance;  // NaN * importance = NaN
current[d] = Math.max(-maxTendency, Math.min(maxTendency, NaN)); // = NaN
```

Once stored, the NaN tendency would corrupt the BehaviorField gradient in subsequent ticks, because `BehaviorField._addFutureTendencyGradient()` reads the tendency and adds it to the gradient. The R3 BehaviorField fix catches NaN in the gradient, but the tendency itself would remain corrupted — meaning the gradient would always be zeroed out for that dimension instead of providing the correct influence.

### Reproduction

1. Create a FutureTendencyDelta with `{ delta: [NaN, 0, 0, 0] }`
2. EffectCommitter._applyFutureTendencyDelta() passes it to `tracker.updateTendency()`
3. `current[0] = NaN`, stored permanently in the Map
4. Every subsequent tick: getTendencyGradient() returns `[NaN, 0, 0, 0]`
5. BehaviorField._addFutureTendencyGradient() adds NaN gradient
6. R3 fix catches it and skips, but the tendency is still lost

### Fix

```js
for (let d = 0; d < DIMS; d++) {
  if (!Number.isFinite(delta[d])) continue;
  current[d] += delta[d] * importance;
  if (!Number.isFinite(current[d])) current[d] = 0;
  current[d] = Math.max(-this.maxTendency, Math.min(this.maxTendency, current[d]));
}
```

### Impact

Silent corruption of future tendency data. Agent loses tendency-driven behavior modification for affected regions/dimensions. No crash, but behavior would be subtly wrong — tendency memory is "amnesic" for affected entries.

---

## Areas Audited (No P0/P1 Bugs Found)

- **SDK completeness** (`src/sdk/AndyBridge.js`, `src/sdk/Andy.js`, `src/sdk/Character.js`, `src/sdk/NarrativeBuilder.js`): Facade delegation correct, no boundary violations found.
- **EventDispatcher** (`src/runtime/EventDispatcher.js`): Event creation, dispatch, fromJSON, ordering all correct. `_nextId` persistence fixed in W1.
- **EffectCommitter other delta types**: `_applyEmotionDelta()` delegates to `applyEffect()` which has R3 NaN fix. `_applyMemoryDelta()`, `_applyRelationshipDelta()`, `_applyPositionDelta()` all have proper guards.
- **PersonalMemory** (`src/agent/memory/PersonalMemory.js`): Bounded at 500 entries with `_prune()`. Serialization round-trips correct. No unbounded growth risk.
- **ProceduralMemory** (`src/agent/memory/ProceduralMemory.js`): `_maxHistory = 50`, Map-based deduplication. No overflow risk.
- **IntrinsicMotivation** (`src/agent/psychology/IntrinsicMotivation.js`): All computations bounded. `satisfyCuriosity()` clamps to [0,1]. `explorationHistory` sliced to 50. No NaN vectors in output.
- **EmotionRegulation** (`src/agent/psychology/EmotionRegulation.js`): All emotion changes go through `applyEffect()` (R3-protected). `_regulationResource` clamped to [0,1]. `_reappraisalHistory` sliced to 10. `toJSON()`/`fromJSON()` correct.
- **Appraisal** (`src/agent/psychology/Appraisal.js`): All evaluation functions clamp to [0,1] or [-1,1]. No NaN risk in output. Domain-driven config used correctly.
- **BehaviorLabeler** (`src/agent/psychology/BehaviorLabeler.js`): Distance computation safe. No NaN risk (Euclidean distance of finite vectors is always finite).
- **LocationMeaningInfluence** (`src/agent/psychology/LocationMeaningInfluence.js`): Pure computation, safe. Gradient derived from domain config (finite values).
- **Personality** (`src/agent/psychology/Personality.js`): `drift()` clamps all OCEAN values to [0,1]. `toJSON()`/`fromJSON()` correct.

## Pattern Analysis

All 3 R5 bugs are the same class: **NaN propagation through numeric computation without `Number.isFinite()` guards**. This is the same pattern as R3's bugs (BehaviorField, EmotionVector, NeedsSystem), but in code paths that were not audited in R3.

**Root cause**: The codebase has a systematic gap in NaN defense at computation boundaries. R3 fixed the primary vectors (BehaviorField, EmotionVector, NeedsSystem), but secondary computation layers (AffectCompiler, EffectCommitter, FutureTendencyTracker) were not covered.

**Recommendation**: Consider a systematic audit of all `Math.max/Math.min` calls in `src/` that don't have preceding `Number.isFinite()` checks, or add a global `safeClamp()` utility.
