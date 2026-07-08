# Action/Effect Pipeline Canonicalization Note

**Phase:** D5 Internal Beta — Phase D
**Date:** 2026-07-07
**Status:** Draft

## Current Pipeline Flow (Actual)

### Canonical Path (already good)

```
EventEffectPipeline.applyActionEffect()            // src/effects/EventEffectPipeline.js:36
  → computeDeltas()                                 // Line 92 — pure, typed delta computation
  → new EffectResult({ event, deltas, reasonTrace }) // Line 82 — returns EffectResult
```

The `EventEffectPipeline` already produces typed `StateDelta[]` arrays via
`EffectResult.deltas`. This is the correct canonical path.

### Legacy Bridge (needs migration)

The `ActionSelectionRuntime.js` currently double-converts:

```
EventEffectPipeline.applyActionEffect() -> EffectResult (typed deltas)
  ↓ .toLegacyFormat()                              // src/effects/EffectResult.js:64
  ↓ EffectResult.toLegacyFormat().stateDeltas      // converts typed → legacy {need,emotion,memory,...}
  ↓
  ↓ applyActionStateDeltas()                        // src/agent/runtime/ActionSelectionRuntime.js:278
  ↓   → reconverts legacy → new NeedDelta(...)      // Line 288-331
  ↓   → reconverts legacy → new EmotionDelta(...)
  ↓   → reconverts legacy → new MemoryDelta(...)
  ↓   → reconverts legacy → new PositionDelta/PositionMeaningDelta(...)
  ↓   → reconverts legacy → new RelationshipDelta(...)
  ↓
  EffectCommitter.commit(effectResult)              // src/effects/EffectCommitter.js:33
```

The path is:
1. **Typed deltas** produced by `computeDeltas()` (correct)
2. Converted to **legacy format** by `toLegacyFormat()` (unnecessary)
3. Converted BACK to **typed deltas** by `applyActionStateDeltas()` (wasteful)
4. Committed via `EffectCommitter` (correct)

### What `toLegacyFormat()` does

```js
// src/effects/EffectResult.js:64-132
toLegacyFormat() {
  const stateDeltas = { need:{}, emotion:{}, memory:null, relationship:null, location:null, world:null };
  for (const delta of this.deltas) {
    // Converts each typed delta back to legacy key-value shape
    switch (delta.type) {
      case 'need':    // additive merge with NaN/Infinity guards
      case 'emotion': // additive merge with [-1,1] clamping
      case 'memory':  // last-write-wins
      case 'relationship':
      case 'locationMeaning': // skip if position already set
      case 'position':        // takes precedence over locationMeaning
    }
  }
  return { event, stateDeltas, updatedReasonTrace };
}
```

### What `applyActionStateDeltas()` does

```js
// src/agent/runtime/ActionSelectionRuntime.js:278-331
function applyActionStateDeltas(agent, stateDeltas, env) {
  // Rebuilds typed deltas from legacy stateDeltas
  const deltas = [];
  if (stateDeltas.need...)     deltas.push(new NeedDelta(...));
  if (stateDeltas.emotion...)  deltas.push(new EmotionDelta(...));
  if (stateDeltas.memory...)   deltas.push(new MemoryDelta(...));
  if (stateDeltas.location...) deltas.push(new PositionDelta|PositionMeaningDelta(...));
  if (stateDeltas.relationship...) deltas.push(new RelationshipDelta(...));
  // Then commits
  const effectResult = new EffectResult({ event: {...}, deltas });
  new EffectCommitter(agent, env).commit(effectResult);
}
```

## Key Findings

### 1. Double-conversion is wasteful but functionally correct

The typed→legacy→typed round-trip is logically a no-op (with some clamping/merge logic in `toLegacyFormat()`). The `applyActionStateDeltas()` effectively re-derives the same deltas that `computeDeltas()` already produced.

**Severity:** Minor. Behavior-preserving but adds unnecessary complexity.

### 2. No action provider mutates world state ✓

Search results show no provider code calling `memory.addExperience`, `relationship.strength =`, `agent.position =`, or `world.factStore.addFact`. The AGENTS.md constraint is respected.

### 3. EffectCommitter is the SINGLE write point ✓

`src/effects/EffectCommitter.js:4` declares: "This is the ONLY component that writes EffectResult deltas to live state." All writes flow through it.

### 4. Pipeline is already canonical except for the bridge

The `EventEffectPipeline` → `EffectResult` → `EffectCommitter` chain is correct. Only the `ActionSelectionRuntime` still uses the legacy bridge.

### 5. Boundary checks pass

`npm run check:boundaries` reports all checks pass. No provider writes to state.

## Recommended Canonicalization

### Short-cut: Skip the double-conversion

In `ActionSelectionRuntime.js`, after producing `pipelineResult`:

```js
// CURRENT (lines 194-224):
const pipelineResult = EventEffectPipeline.applyActionEffect(...);
stateDeltas = pipelineResult.toLegacyFormat().stateDeltas;  // typed → legacy
trace.stateDeltas = stateDeltas;
// ...
applyActionStateDeltas(agent, stateDeltas, env);  // legacy → typed → commit

// PROPOSED:
const pipelineResult = EventEffectPipeline.applyActionEffect(...);
// Keep legacy stateDeltas on trace for backward compat
trace.stateDeltas = pipelineResult.toLegacyFormat().stateDeltas;
// ...
// Directly commit typed deltas (skip reconversion)
const effectResult = new EffectResult({ event: {...}, deltas: pipelineResult.deltas });
new EffectCommitter(agent, env).commit(effectResult);
```

### Benefits

1. **Removes 50+ lines** of reconversion code (`applyActionStateDeltas`)
2. **Single path**: typed deltas flow directly from pipeline to committer
3. **No behavior change**: `toLegacyFormat()` is a purely additive transform
4. **Backward compatible**: `trace.stateDeltas` still available for consumers

### Risk Assessment

- `toLegacyFormat()` does additive merging and clamping for need/emotion deltas. The current `applyActionStateDeltas()` creates `NeedDelta(delta.changes)` which sums individual `{key: val}` entries. Using `pipelineResult.deltas` directly preserves the same semantics because `computeDeltas()` already produces properly-computed deltas.
- The only difference is that `toLegacyFormat()` clamps emotion to [-1,1]. This clamping was introduced for the legacy format (R146-1 fix). The `EmotionDelta` itself should handle clamping at commit time. So the direct path is actually MORE correct (avoids double-clamping).

### Safe Incremental Steps

1. **Phase D-1:** Add `EffectResult.directCommit()` helper that commits deltas without double-conversion
2. **Phase D-2:** Update `ActionSelectionRuntime` to use `directCommit()` in active mode
3. **Phase D-3:** Mark `applyActionStateDeltas()` as deprecated
4. **Phase D-4:** Write tests proving no behavior change

### Stop Condition

Stop if any of these trigger:
- Golden replay changes (deterministic seed mismatch)
- Performance regression (perf:check fail)
- Functional test failure (tests/e2e/*, tests/action*, tests/effects*)
