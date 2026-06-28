# R9 Independent Audit Report

> **Round**: 9 / 10  
> **Date**: 2026-06-28  
> **Auditor**: Independent Audit Sub-AI (4 parallel sub-agents)  
> **Scope**: Full codebase — serialization, behavioral, API, edge cases  
> **Commit**: 5fd418d

---

## Summary

R9 audit deployed 4 parallel sub-AI agents (serialization/state, behavioral/domain, API/integration, edge/boundary). One agent failed (edge/boundary), but its findings were partially covered by the other three. **14 confirmed bugs** were found (6 HIGH, 8 MEDIUM), verified independently, and all fixed.

---

## HIGH Severity Bugs

### BUG-R9-01: AndyWorld.toJSON() drops _scheduledEvents

**File**: `src/runtime/AndyWorld.js:761-782` (toJSON), line 164 (constructor)  
**Symptom**: `toJSON()` did not serialize `_scheduledEvents`. On restore, the constructor initialized `_scheduledEvents = []`, permanently losing any pending scheduled events.  
**Fix**: `toJSON()` now includes `scheduledEvents` with ISO-serialized dates. Constructor restores from `savedState.scheduledEvents` with Date conversion.  
**Impact**: Pending world events (storms, scheduled encounters, etc.) silently disappeared on save/restore.

### BUG-R9-02: Encounter event emotion effects silently dropped

**File**: `src/runtime/AndyWorld.js:611-654`  
**Symptom**: `_applyEncounterEffects()` only handled `relationship` and `memory` effect types. Social encounter events also produced `emotion` effects (joy, loneliness, sadness), but these fell through to the default and were discarded.  
**Fix**: Added `emotion` effect handling via `EmotionDelta`.  
**Impact**: Social encounters never changed agent emotions. A joyful chat between friends did not increase joy; a hostile argument did not increase sadness. Core psychological model broken for all multi-agent scenarios.

### BUG-R9-03: Character constructor auto-ticks shared engine

**File**: `src/sdk/Character.js:118`  
**Symptom**: `new Character({engine: sharedEngine})` called `this._engine.tick()`, advancing the shared world by one tick per character creation. Adding N characters to an `Andy` instance caused N ticks during construction.  
**Fix**: Only auto-tick when `this._ownsEngine === true`.  
**Impact**: Multi-character setups had time jumps and inconsistent initial states. Characters created earlier existed in a different world state than those created later.

### BUG-R9-04: BehaviorField arousal amplification corrupts needs gradient

**File**: `src/agent/psychology/BehaviorField.js:398-404`  
**Symptom**: `_addEmotionGradient()` was called after `_addNeedsGradient()`, so `grad` already contained the needs contribution. The arousal amplification (`grad[d] *= amp`) then multiplied the combined needs+emotion gradient, not just the emotion part.  
**Fix**: Compute emotion gradient into a separate array, apply arousal amplification to it, then add to accumulated gradient.  
**Impact**: When arousal > 0.6, the needs gradient received unintended 1.0-1.6x amplification, distorting behavior field dynamics for excited agents.

### BUG-R9-05: PersonalMemory._reconsolidate unbounded emotion drift

**File**: `src/agent/memory/PersonalMemory.js:566-575`  
**Symptom**: Reconsolidation updated emotion snapshot dimensions without clamping. After 100 recalls with consistent positive valence, a dimension starting at 0.8 could reach ~1.4, well outside [-1, 1].  
**Fix**: Added `Math.max(-1, Math.min(1, ...))` clamping after each dimension update.  
**Impact**: Out-of-range values corrupted `_emotionSimilarity`, `_moodCongruence`, and utility scoring that assumes bounded emotion values.

### BUG-R9-06: AndyBridge._restoreAgents() partial restore loses 80%+ of agent state

**File**: `src/sdk/AndyBridge.js:286-318`  
**Symptom**: `_restoreAgents()` only restored emotion.current, emotion.stress, position, health, and socialEnergy. Everything else (needs, mood, behaviorField, stateMachine, tick counters) was silently discarded.  
**Fix**: Expanded restore to cover needs, mood, behaviorField B vector, stateMachine currentState, _ticksSinceReflection, _ticksSinceDriftCheck. (Full fromJSON reconstruction for memory/personality/schedule requires engine-level restore path, respecting SDK→agent boundary.)  
**Impact**: After AndyBridge save/restore, agents had default needs, behavior field state, and no state machine history.

---

## MEDIUM Severity Bugs

### BUG-R9-07: SocialGraph._tickCount not serialized

**File**: `src/social/SocialGraph.js:412`  
**Symptom**: `toJSON()` only serialized edges. `_tickCount` drives triadic closure sampling and Dunbar enforcement frequency. After restore, the counter reset to 0, causing different social evolution.  
**Fix**: `toJSON()` now returns `{edges, _tickCount}`. Constructor and `fromJSON()` handle both new and legacy formats.  
**Impact**: Simulation trajectory diverged after save/restore due to shifted triadic closure and Dunbar schedules.

### BUG-R9-08: KnowledgeStore.fromJSON() doesn't normalize evidence

**File**: `src/knowledge/KnowledgeStore.js:225-228`  
**Symptom**: `fromJSON()` directly assigned evidence objects without calling `_normalizeEvidence()`. Result: `propagatedFrom` and `eventId` could be `undefined` instead of `null`.  
**Fix**: Call `_normalizeEvidence()` on each evidence entry during restore.  
**Impact**: Strict null checks (`=== null`) would fail on restored evidence objects.

### BUG-R9-09: ForbiddenTerms regex injection

**File**: `src/domain/ForbiddenTerms.js:21`  
**Symptom**: `new RegExp(term, 'g')` used forbidden terms as raw regex patterns. Terms like "C++" or "vs." would be interpreted as regex syntax.  
**Fix**: Escape regex special characters with `term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.  
**Impact**: Domain filtering silently failed for terms containing regex metacharacters.

### BUG-R9-10: PersonalMemory._buildCacheKey omits emotion/semanticCategory

**File**: `src/agent/memory/PersonalMemory.js:636-640`  
**Symptom**: Cache key only included keywords, limit, and region. Two calls with different emotion contexts or semanticCategory but same keywords/region/limit returned the same cached result.  
**Fix**: Include emotion valence/arousal, semanticCategory, and agentId in cache key.  
**Impact**: Mood-congruent recall was broken — second retrieve() with different emotion got stale results.

### BUG-R9-11: PersonalMemory consolidate duplicate presentation timestamps

**File**: `src/agent/memory/PersonalMemory.js:741-743`  
**Symptom**: Consolidation merge appended all presentations from the removed memory without deduplication. Shared timestamps (common from same-event origins) inflated base-level activation.  
**Fix**: Deduplicate by timestamp before merging.  
**Impact**: Merged memories had artificially high activation, creating a positive feedback loop.

### BUG-R9-12: AndyBridge._applySignalToAgent bypasses emotion regulation

**File**: `src/sdk/AndyBridge.js:244-261`  
**Symptom**: Directly wrote to `agent.emotion.current[dim]`, bypassing `applyEffect()` which performs regulation, mood update, co-activation, and maxDeltaPerTick clamping.  
**Fix**: Route through `applyEffect()` with fallback to direct update for non-standard emotion objects.  
**Impact**: User emotion signals via AndyBridge had no psychological defenses applied.

### BUG-R9-13: Character.load()/Andy.load() null agent not checked

**Files**: `src/sdk/Character.js:374`, `src/sdk/Andy.js:210`  
**Symptom**: `engine.getAgent(state.id)` could return `undefined` (corrupt save, domain mismatch). Subsequent calls crashed with cryptic TypeErrors.  
**Fix**: Throw descriptive error when agent is not found.  
**Impact**: Untraceable crashes instead of actionable error messages.

### BUG-R9-14: Active PositionDelta desynchronizes RegionGrid

**File**: `src/effects/EffectCommitter.js:158-169`  
**Symptom**: `_applyPositionDelta()` updated `agent.position` but didn't call `regions.place()`, causing RegionGrid occupancy to diverge from agent.position.  
**Fix**: Call `this.world.regions.place(agent.id, delta.to)` after position update.  
**Impact**: Agents moved via active action selection appeared in one region but interacted as if in another (encounter detection used stale RegionGrid).

---

## Downstream Fixes

| Component | Change |
|---|---|
| `WorldStateAdapter.js` | Handle `SocialGraph.toJSON()` new `{edges, _tickCount}` format |
| `SocialGraph` constructor | Handle both `{edges, _tickCount}` and legacy array format |
| `social-emergence.test.js` | Use `edges` property from SocialGraph.toJSON() |
| `memory-characterization.test.js` | Allow deduplicated presentation counts |
| `golden-campus-seed42-100ticks.json` | Regenerated |

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
| R9 | 14 | 14 | 0 | ✓ |
| **Total** | **63** | **63** | — | — |

R9 found significantly more bugs (14 vs 7 in R8) because it used 4 parallel sub-agents covering different audit dimensions. Bug severity distribution: 6 HIGH (43%), 8 MEDIUM (57%). R10 will be the convergence round.
