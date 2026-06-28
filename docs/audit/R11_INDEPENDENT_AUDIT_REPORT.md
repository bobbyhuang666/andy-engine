# R11 Independent Audit Report

> **Round**: 11  
> **Date**: 2026-06-28  
> **Auditor**: Independent Audit Sub-AI (5 parallel agents) + Manual Verification  
> **Scope**: Full codebase — serialization, behavioral, API, edge cases, cross-module  
> **Commit**: be5631e

---

## Summary

R11 deployed 5 independent sub-AI agents covering: serialization/state, behavioral/dynamics, API/integration, edge/boundary, and cross-validation (unusual patterns). The serialization agent failed due to execution timeout; its scope was covered by the cross-validation agent. **12 bugs confirmed** after independent code reading and runtime verification (1 HIGH, 8 MEDIUM, 3 LOW). All fixed and verified.

---

## Audit Methodology

1. **5 parallel sub-AI agents** dispatched with non-overlapping scopes
2. **Each agent** reports bugs with file, line, symptom, severity, and code snippet
3. **Independent verification**: I read each reported bug's code and ran Node.js tests to confirm
4. **Severity reassessment**: I re-evaluated severity based on actual impact (e.g., Relationship.impression downgraded from HIGH to MEDIUM)

---

## Confirmed Bugs (12)

### BUG-R11-01: getGroundingPackage() returns partial object instead of null [HIGH]

**File**: `index.js:314-343`  
**Symptom**: When called with a non-existent agentId, returns a `GroundingPackage` object without `affectFrame` key. The TypeScript declaration promises `GroundingPackage | null`. A caller checking `result !== null` would proceed with a structurally incomplete object.  
**Verification**: `engine.getGroundingPackage('nonexistent')` returns `{allowedFacts, inferredFacts, forbiddenFacts, metadata}` without `affectFrame`.  
**Fix**: Added `if (!agent) return null;` after `getAgent()` call.

---

### BUG-R11-02: runTicks() has no input validation on count parameter [MEDIUM]

**File**: `index.js:379-385`  
**Symptom**: `runTicks(NaN)` returns `[]` silently, `runTicks(1.5)` runs 2 ticks (loop `i < 1.5`), `runTicks(-1)` returns `[]`. No error thrown for any invalid input.  
**Verification**: All three cases produce wrong results without error.  
**Fix**: Added validation: `if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) throw TypeError(...)`.

---

### BUG-R11-03: onTick() callback cannot be removed — memory leak [MEDIUM]

**File**: `src/runtime/AndyWorld.js:739-741`  
**Symptom**: `onTick()` pushes to `_tickCallbacks` with no corresponding `offTick()`. Callbacks accumulate for the lifetime of the AndyWorld instance. In SDK patterns where Character/Andy instances register callbacks, old closures are never collected.  
**Fix**: Added `offTick(callback)` method that removes the callback from the array.

---

### BUG-R11-04: AndyWorld.snapshot() shares live Date reference [MEDIUM]

**File**: `src/runtime/AndyWorld.js:761`  
**Symptom**: `snapshot()` does `{ ...this.environment }` which copies the Date reference for `weatherChangedAt`. Mutating the returned Date (e.g., `snap.environment.weatherChangedAt.setTime(0)`) corrupts the world's internal state.  
**Verification**: After mutating snapshot's `weatherChangedAt` to epoch, `world.environment.weatherChangedAt` also becomes `1970-01-01T00:00:00.000Z`.  
**Fix**: `snapshot()` now creates a new Date: `new Date(this.environment.weatherChangedAt.getTime())`.

---

### BUG-R11-05: FutureTendencyTracker toJSON/fromJSON share internal array references [MEDIUM]

**File**: `src/agent/psychology/FutureTendencyTracker.js:85,99`  
**Symptom**: 
- `toJSON()`: `data[region] = tendency` writes the internal array directly. Mutating `json.tendencies.library[0] = 999` corrupts the tracker's internal `_tendencies` Map.
- `fromJSON()`: `tracker._tendencies.set(region, tendency)` stores the parsed JSON array reference. Mutating the input data corrupts the tracker.

**Verification**: Both directions confirmed — mutating JSON output/input corrupts internal state.  
**Fix**: Both paths now use `[...tendency]` to create copies.

---

### BUG-R11-06: Relationship.impression accumulates without bound [MEDIUM]

**File**: `src/social/Relationship.js:126-129`  
**Symptom**: `impression.positive` and `impression.negative` are incremented but never decayed or capped. After thousands of interactions, values grow without bound.  
**Reassessment**: Originally reported as HIGH, but `bondStrength * 0.1` is clamped by `Math.min(..., 0.5)`, so values above 5.0 have no additional behavioral effect. The real issue is memory waste, not simulation distortion. Downgraded to MEDIUM.  
**Fix**: Capped at 5.0 (the value at which `bondStrength * 0.1 = 0.5`, hitting the existing Math.min ceiling).

---

### BUG-R11-07: IntrinsicMotivation.completedGoals grows without bound in memory [MEDIUM]

**File**: `src/agent/psychology/IntrinsicMotivation.js:505`  
**Symptom**: `completedGoals.push(goal)` never trims the in-memory array. Only `toJSON()` (last 10) and savedState constructor (last 20) trim. Between serializations, the array grows linearly with tick count.  
**Fix**: Added in-memory trim: `if (this.completedGoals.length > 20) this.completedGoals = this.completedGoals.slice(-20)`.

---

### BUG-R11-08: IntrinsicMotivation.competence domains never pruned [MEDIUM]

**File**: `src/agent/psychology/IntrinsicMotivation.js:582-589`  
**Symptom**: `_updateCompetence()` creates entries for every unique domain string, but never removes them. Abandoned domains persist indefinitely. The full `competence` object is serialized in `toJSON()`, bloating output.  
**Fix**: Added pruning: when `Object.keys(this.competence).length >= 30`, remove the domain with the lowest `progressRate`.

---

### BUG-R11-09: EventDispatcher.getCausalChain() unbounded recursion depth [MEDIUM]

**File**: `src/runtime/EventDispatcher.js:475-498`  
**Symptom**: The recursive `traverse()` function has no depth limit. A deeply nested causal chain could cause stack overflow. (The O(n*m) performance is a known concern but not a correctness bug.)  
**Fix**: Added `MAX_DEPTH = 1000` parameter to traverse; returns at depth limit.

---

### BUG-R11-10: ProceduralMemory dayOfWeek uses || instead of ?? [LOW]

**File**: `src/agent/memory/ProceduralMemory.js:66`  
**Symptom**: `action.dayOfWeek || 0` uses `||` where `0` (Sunday) is a legitimate value. Currently produces correct results by coincidence (`0 || 0 = 0`), but would silently mask upstream errors (e.g., `undefined || 0 = 0`).  
**Fix**: Changed to `action.dayOfWeek ?? 0`.

---

### BUG-R11-11: validateConfig() does not validate startTime type [LOW]

**File**: `src/config/validate.js`  
**Symptom**: `startTime` is accepted in config but never validated. Wrong types cause cryptic errors deep inside WorldClock.  
**Fix**: Added startTime validation: must be Date, number, or valid ISO string.

---

### BUG-R11-12: createCharacter() exposes internal error message for duplicate IDs [LOW]

**File**: `index.js:192`  
**Symptom**: `createCharacter()` delegates duplicate detection to `AndyWorld.addAgent()`, which throws `AndyWorld.addAgent(): agent "X" already exists`. This exposes internal class names.  
**Fix**: Added pre-check in `createCharacter()` with user-facing message: `createCharacter: character "X" already exists`.

---

## Verification Results

| Gate | Status |
|------|--------|
| Full test suite (2979 tests) | ✅ All passed |
| Domain tests (81 tests) | ✅ All passed |
| Boundary checks | ✅ All clean |
| Smoke pack | ✅ Passed |
| Performance check | ✅ All within bounds |
| git diff --check | ✅ No whitespace errors |

---

## Convergence Assessment

R11 found 12 bugs (1 HIGH, 8 MEDIUM, 3 LOW), up from R10's 6. This suggests R10 may have been a local minimum rather than true convergence. However:

1. **Bug profile shifted**: R10 was dominated by serialization fidelity issues; R11 is dominated by API contract and memory leak patterns — different failure modes
2. **No new NaN pathways**: The 20+ Number.isFinite replacements from R7-R9 continue to hold
3. **No new data corruption**: The only HIGH bug is an API contract violation (wrong return type), not silent data corruption
4. **Memory leaks are the new dominant pattern**: 4 of 12 bugs are memory leaks (impression, completedGoals, competence, callbacks) — a category not previously audited

**Recommendation**: Continue to R12 with focus on remaining memory leak patterns and API contract completeness.
