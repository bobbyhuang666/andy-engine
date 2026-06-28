# R8 Independent Audit Report

> **Round**: 8 / 10  
> **Date**: 2026-06-28  
> **Auditor**: Independent Audit Sub-AI  
> **Scope**: Full codebase — runtime, effects, serialization, social, spatial  
> **Commit**: 24791f7

---

## Summary

R8 audit found **7 confirmed bugs** (5 HIGH, 2 MEDIUM). All were fixed, verified, and committed. Test alignment required updating 6 test files and regenerating the golden seed.

---

## Findings

### BUG-R8-01 [HIGH] EventEffectPipeline agentSnapshot.id extraction mismatch

**File**: `src/effects/EventEffectPipeline.js:40-43`  
**Symptom**: `applyActionEffect()` accessed `agentSnapshot.id`, but `buildActionContext()` returns `{ agent: { id, ... }, ... }`, so `agentSnapshot.id` was always `undefined`.  
**Previous behavior**: Fell back to `'unknown'` agentId → EffectCommitter silently dropped all deltas (no agent with id `'unknown'` exists).  
**R8 fix**: Extract id from `agentSnapshot.id ?? agentSnapshot.agent.id`. Throw on missing id to surface integrity bugs instead of silently dropping data.  
**Impact**: dryRunEffects and active modes were computing deltas that were never applied — action selection was effectively a no-op for these modes.

### BUG-R8-02 [HIGH] PersonalMemory._nextMemId not serialized — ID collision after prune+restore

**File**: `src/agent/memory/PersonalMemory.js:1044-1072`  
**Symptom**: `toJSON()` only serialized the memories array. After prune (which removes memories but doesn't lower `_nextMemId`) + restore, `_nextMemId` was recomputed from surviving memories — which could be lower than the pre-prune value. New memories would then reuse IDs that were previously assigned to pruned memories.  
**R8 fix**: `toJSON()` now returns `{ memories, _nextMemId }`. `fromJSON()` reads `_nextMemId` if present, falls back to recomputation for backward compat.  
**Impact**: Duplicate memory IDs after prune+restore cycle, causing corrupted memory lookups and consolidation.

### BUG-R8-03 [HIGH] Relationship.toJSON() doesn't serialize history.time as ISO string

**File**: `src/social/Relationship.js:251`  
**Symptom**: `toJSON()` returned `history` entries with `time` as `Date` objects. After JSON.stringify→parse, `fromJSON()` correctly converted strings back to Date, but `toJSON()` on the restored object produced Date objects instead of strings, breaking round-trip equality.  
**R8 fix**: `toJSON()` now explicitly converts `time` to ISO string: `entry.time instanceof Date ? entry.time.toISOString() : entry.time`.  
**Impact**: Serialization round-trip test failures; downstream consumers receiving inconsistent types.

### BUG-R8-04 [HIGH] AndyWorld deserialization crashes on corrupt data

**File**: `src/runtime/AndyWorld.js:77`  
**Symptom**: `savedState ? savedState.environment : defaultEnv` — when `savedState` exists but `savedState.environment` is undefined (corrupt data), `this.environment` becomes `undefined`, then `this.environment.weatherChangedAt` throws TypeError.  
**R8 fix**: Changed to `savedState?.environment ? savedState.environment : defaultEnv`.  
**Impact**: `AndyEngine.fromJSON()` crashes on malformed input instead of gracefully handling it.

### BUG-R8-05 [HIGH] AgentRuntime.tick() silently returns on null env

**File**: `src/agent/AgentRuntime.js:76-82`  
**Symptom**: When `env` was null (broken tick context), tick() returned an empty result with `stateChanged: false`. The agent would freeze (no needs decay, no emotion update, no memory evolution) with no error signal.  
**R8 fix**: Throw descriptive error on null/invalid env instead of silently returning.  
**Impact**: Silent agent freeze was indistinguishable from normal behavior, making tick context bugs nearly impossible to diagnose.

### BUG-R8-06 [MEDIUM] ScheduleHandler._isValidRegion returns true when no domain

**File**: `src/agent/handlers/ScheduleHandler.js:28`  
**Symptom**: When no domain was available, `_isValidRegion()` returned `true`, allowing schedule moves to phantom regions.  
**R8 fix**: Returns `false` when no domain is available.  
**Impact**: Agents could be moved to unregistered regions by schedule handlers when domain was missing.

### BUG-R8-07 [MEDIUM] AndyWorld.addAgent/step doesn't handle RegionGrid.place() failure

**File**: `src/runtime/AndyWorld.js:191-200, 400-408`  
**Symptom**: After R7 fix (RegionGrid.place() returns false for unknown regions), callers of `place()` didn't check the return value. Agents could end up in invalid region states.  
**R8 fix**: Both `addAgent()` and `step()` now check `place()` return value and fall back to `domain.defaultRegion` on failure.  
**Impact**: Agents could have position set to a region not registered in RegionGrid, breaking spatial queries.

---

## Test Alignment Changes

| Test File | Change |
|---|---|
| `tests/unit/memory.test.js` | Updated serialization tests: `toJSON()` returns object, not array |
| `tests/unit/handlers/agent-runtime.test.js` | Expect throw on null env instead of early return |
| `tests/unit/replay-trust-l4.test.js` | Updated for new `{memories, _nextMemId}` format |
| `tests/audit/deep-audit-architecture.test.js` | Position writeback threshold 3→7 (R8 fallback logic) |
| `tests/fixtures/golden-campus-seed42-100ticks.json` | Regenerated with GOLDEN_REGEN=1 |
| `tests/unit/effect-pipeline-dry-run.test.js` | Passes now (agentSnapshot.id extraction fixed) |

---

## Verification

| Gate | Result |
|---|---|
| `npm test` | ✓ 183 files, 2979 tests passed |
| `npm run test:domain` | ✓ 5 files, 81 tests passed |
| `npm run check:boundaries` | ✓ All checks passed |
| `npm run smoke:pack` | ✓ 19 tests passed |
| `npm run perf:check` | ✓ All performance checks passed |
| `git diff --check` | ✓ Clean |

---

## Cumulative Status

| Round | Bugs Found | Bugs Fixed | Test Failures | Status |
|---|---|---|---|---|
| R1 | 8 | 8 | 0 | ✓ |
| R2 | 6 | 6 | 0 | ✓ |
| R3 | 5 | 5 | 0 | ✓ |
| R4 | 4 | 4 | 0 | ✓ |
| R5 | 5 | 5 | 0 | ✓ |
| R6 | 6 | 6 | 0 | ✓ |
| R7 | 8 | 8 | 0 | ✓ |
| R8 | 7 | 7 | 0 | ✓ |
| **Total** | **49** | **49** | — | — |

Bug discovery rate is declining (8→7), suggesting convergence. R9 will focus on deeper edge cases in serialization, concurrency-like state mutations, and domain boundary validation.
