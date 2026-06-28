# Bug Ledger — Round 6

**Date**: 2026-06-28
**Scope**: Systematic NaN blind spots, pressure/action system, serialization fidelity
**Audit method**: Direct code review + 3 parallel sub-AI agents (NaN sweep, pressure/action, serialization)

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| P0       | 0     | 0     |
| P1       | 4     | 4     |
| P2       | 0     | 0     |

**Convergence status**: P0 = 0, P1 = 4 (all fixed). Bug rate pattern: R1(7P0+8P1) → R3(2P0+3P1) → R4(0P0+1P1) → R5(0P0+3P1) → R6(0P0+4P1). All R6 bugs are either NaN propagation or serialization fidelity — known weakness classes that are being systematically closed.

---

## R6-SER-001 — AgentSerializer.toJSON() missing futureTendency

**Severity**: P1
**File**: `src/agent/facade/AgentSerializer.js:13`
**Status**: ✅ Fixed

### Description

`AgentSerializer.toJSON()` did not serialize `agent.futureTendency`. The `FutureTendencyTracker` stores accumulated behavioral tendencies per region, representing the agent's learned behavioral patterns from past events. This data was:

1. Created during agent initialization via `AgentWiring.setupFutureTendency()`
2. Modified during simulation via `EffectCommitter._applyFutureTendencyDelta()`
3. Used by `BehaviorField._addFutureTendencyGradient()` to influence behavior
4. **NOT persisted** in `toJSON()` → lost on every serialization round-trip

After restore, the agent would have an empty FutureTendencyTracker (created fresh by `AgentWiring`), losing all accumulated behavioral tendencies. This is a silent data loss bug — no crash, but the restored agent's behavior would subtly differ from the original because it lacks tendency-driven behavior modification.

The effect is proportional to simulation duration: longer simulations accumulate more tendency data, making the loss more significant.

### Fix

1. Added `futureTendency: agent.futureTendency ? agent.futureTendency.toJSON() : null` to `AgentSerializer.toJSON()`
2. Added `FutureTendencyTracker` import to `AgentSubsystemFactory.js`
3. Added `futureTendency` field to `restoreSubsystems()` return value, using `FutureTendencyTracker.fromJSON()` when data is present
4. Updated `AgentWiring.setupFutureTendency()` to accept an optional restored tracker
5. Updated `AgentWiring.wireAll()` to pass `subs.futureTendency` to `setupFutureTendency()`
6. Regenerated golden seed fixture

### Impact

Silent data loss on serialization round-trip. Agent loses all behavioral tendency memory. Effect scales with simulation duration. No crash, but incorrect behavior in restored simulations.

---

## R6-NAN-001 — NeedPressure.computeMostDeficient() NaN propagation

**Severity**: P1
**File**: `src/pressure/NeedPressure.js:60`
**Status**: ✅ Fixed

### Description

`NeedPressure.computeMostDeficient()` checks `typeof value === 'number'` but not `Number.isFinite(value)`. Since `typeof NaN === 'number'` is `true`, a NaN need value would pass the check:

```js
const p = 1 - NaN;  // = NaN
if (p > maxPressure) {  // NaN > -1 = false, so this branch is skipped
```

In this specific case, the NaN doesn't propagate further because `NaN > maxPressure` is always `false`. However, if ALL need values are NaN, `computeMostDeficient()` returns `null` (no valid needs found), which could cause downstream errors in code that expects a result.

More critically, `NeedPressure.compute()` (the main method) has the same `typeof value === 'number'` check, and there NaN DOES propagate:

```js
const p = Math.max(0, Math.min(1, 1 - value));  // 1 - NaN = NaN
// Math.max(0, Math.min(1, NaN)) = NaN
pressure[key] = NaN;
sum += NaN;  // sum becomes NaN
```

Then `pressure.total = NaN / count = NaN`.

This NaN in pressure.total propagates to `PressureContext.getTotalPressure()` and then to `UtilityScorer.scoreWorld()`, where it enters the action selection pipeline.

### Fix

Changed `typeof value === 'number'` to `typeof value === 'number' && Number.isFinite(value)` in both `compute()` and `computeMostDeficient()`.

### Impact

NaN in pressure values would corrupt the action selection pipeline. The UtilityScorer would produce NaN scores, which the UtilitySelector already filters out (`!isNaN(sc.score.total)`), but the agent would have fewer valid action candidates, potentially selecting suboptimal actions.

---

## R6-NAN-002 — PhysiologyRuntime.applyNeedsToEmotion() NaN propagation

**Severity**: P1
**File**: `src/agent/runtime/PhysiologyRuntime.js:14`
**Status**: ✅ Fixed

### Description

`applyNeedsToEmotion()` reads need values directly without NaN guards:

```js
if (needs.hunger < 0.3) {
  const hungerDeficit = 0.3 - needs.hunger;  // 0.3 - NaN = NaN
  agent.emotion.applyEffect({
    frustration: NaN * 0.10,  // = NaN
    ...
  });
}
```

Although `EmotionVector.applyEffect()` has the R3 fix that skips NaN deltas, the entire emotion effect dict is wasted when any need is NaN. More importantly, the `if (needs.hunger < 0.3)` check would fail for NaN (`NaN < 0.3` is `false`), so the branch is skipped — but only for the specific need that's NaN. Other needs are still processed correctly.

The real issue is inconsistency: with NaN needs, the agent would silently skip needs-to-emotion coupling for the affected need dimension, causing incorrect emotional responses.

### Fix

Added a `_deficit()` helper that returns 0 for NaN/Infinity need values, and changed all deficit computations to use it. Also changed the condition structure from `if (needs.x < threshold)` to `if (deficit > 0)` for clarity.

### Impact

With NaN need values, needs-to-emotion coupling is silently skipped for affected dimensions. The agent's emotional responses would be incomplete/incorrect. No crash (R3 fix catches NaN at applyEffect), but behavioral wrongness.

---

## R6-NAN-003 — PhysiologyRuntime.updateHealth() NaN propagation

**Severity**: P1
**File**: `src/agent/runtime/PhysiologyRuntime.js:76`
**Status**: ✅ Fixed

### Description

`updateHealth()` reads multiple agent state values (needs, stress, behaviorField, health) without NaN guards. If any of these values is NaN, the healthDelta computation becomes NaN:

```js
if (agent.needs.needs.energy < 0.2) {
  healthDelta -= (0.2 - NaN) * 0.04 * hoursElapsed;  // NaN
}
// ...
agent.health = Math.max(0.1, Math.min(1.0, agent.health + healthDelta));
// health + NaN = NaN → Math.max(0.1, NaN) = NaN → agent.health = NaN
```

Unlike `applyEffect()` which has the R3 NaN guard, `agent.health` is set directly with no NaN protection. Once `agent.health` becomes NaN, it corrupts all downstream health-dependent logic and can never recover (health is only modified by addition and clamping, both of which propagate NaN).

This is the most dangerous of the R6 NaN bugs because it creates a **permanent, unrecoverable NaN** in a core agent state field.

### Fix

Added `Number.isFinite()` guards for all state values read in `updateHealth()`, with safe defaults:
- `energy`: default 0.5
- `hunger`: default 0.5
- `stress`: default 2
- `activity`: default 0.5
- `sociality`: default 0.5
- `health`: default 0.8
- `neuroticism`: default 0.5

### Impact

Permanent agent destruction. Once health becomes NaN, the agent can never recover. All health-dependent logic breaks. This is the most severe NaN bug found in R6, though it requires a NaN value to already exist in the agent's state (which the R3 and R5 fixes make much less likely).

---

## Areas Audited (No P0/P1 Bugs Found)

- **UtilityScorer** (`src/action/UtilityScorer.js`): All scorer functions clamp outputs with `Math.max/Math.min`. No NaN propagation risk because all inputs are from bounded sources.
- **UtilitySelector** (`src/action/UtilitySelector.js`): Already filters NaN scores (`!isNaN(sc.score.total)`). Handles empty candidate lists correctly.
- **Pressure modules** (MemoryPressure, RelationshipPressure, LocationPressure, WorldPressure): All produce bounded output. No NaN risk.
- **ActionSelectionRuntime** (`src/agent/runtime/ActionSelectionRuntime.js`): Proper error handling, uses EffectCommitter for writeback, cloned RNG for shadow pipeline.
- **MindWanderRuntime** (`src/agent/runtime/MindWanderRuntime.js`): All emotion effects go through `applyEffect()` (R3-protected). No NaN risk in thought selection.
- **ReflectionRuntime** (`src/agent/runtime/ReflectionRuntime.js`): Baseline updates are clamped to [-0.4, 0.4]. Stress updates use `setStress()` which clamps. No NaN risk.
- **PerceptionRuntime** (`src/agent/runtime/PerceptionRuntime.js`): Stress updates use `setStress()`. Emotion effects use `applyEffect()`. No NaN risk.

## Pattern Analysis

R6 continues the NaN propagation pattern from R3/R5, but in deeper execution paths:

1. **NeedPressure** — same `typeof === 'number'` blind spot as EffectCommitter (R5-COM-001)
2. **PhysiologyRuntime** — the critical needs→emotion→health cascade path
3. **Serialization** — a new class: missing field in toJSON() (different from R3's missing subsystems)

The systematic NaN defense is now covering:
- ✅ BehaviorField (R3)
- ✅ EmotionVector (R3)
- ✅ NeedsSystem (R3)
- ✅ Config validation (R3)
- ✅ AffectCompiler (R5)
- ✅ EffectCommitter (R5)
- ✅ FutureTendencyTracker (R5)
- ✅ NeedPressure (R6)
- ✅ PhysiologyRuntime (R6)

Remaining unchecked areas for R7: social/SocialGraph, spatial, narrative, and remaining runtime paths.
