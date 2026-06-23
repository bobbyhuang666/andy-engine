# IntrinsicMotivation Split Plan

> Stage 45 — Documentation only, no code changes.

---

## Current File

`src/agent/psychology/IntrinsicMotivation.js` — 796 lines.

---

## 1. Current Responsibilities

| Responsibility | Lines | Description |
|---|---|---|
| **Curiosity Model** | 50–69, 258–279 | Curiosity state, decay (need-like), satisfaction on novelty. Openness-modulated decay rate. |
| **Novelty Tracking** | 176–243 | Per-region familiarity with visit count, last-visit time, total time. Log-decay novelty with Ebbinghaus forgetting. Tick-scoped cache. |
| **Exploration Drive** | 140–160, 698–731 | Need-gated curiosity → drive signal with gradient vector. Region ranking by novelty. Exploration state list from domain config. |
| **Goal Emitter** | 284–397, 487–557 | Autotelic/IMGEP goal generation (explore_new, deepen_skill, break_routine). Goal lifecycle (active → completed/expired). Domain-to-region mapping. |
| **Competence Tracker** | 559–595 | EMA-based progress rate per activity domain. Used by goal selection and prompt string. |
| **Need Gate** | 599–647 | Suppresses intrinsic motivation when Maslow needs are deficient. Slight boost when needs met. |
| **Emotion Effects** | 649–692 | Maps curiosity state to 30-dim emotion system (boredom, frustration, interest, excitement, hope). |
| **Domain Region Map** | 403–409 | `domainRegionMap` from `intrinsicMotivationConfig` maps activity domains to regions. |
| **Serialization / Query** | 736–793 | `toPromptString()`, `getStatus()`, `toJSON()`. |

---

## 2. Proposed Modules

### 2.1 `CuriosityModel.js`

**Owns:** curiosity state, decay, satisfaction, need gate.

```
State:
  - curiosity (0-1)

Methods:
  - tickDecay(hoursElapsed, opennessFactor)
  - satisfyCuriosity(amount, sensitivity)
  - applyNeedGate(rawCuriosity, needsState) → effectiveCuriosity
  - toJSON() / restore(state)
```

**Rationale:** Curiosity is the core scalar drive. Decay, satisfaction, and need-gating are tightly coupled to this single value. Separating them isolates the "curiosity as a need-like quantity" concept.

---

### 2.2 `NoveltyTracker.js`

**Owns:** familiarity map, exploration history, novelty computation with forgetting.

```
State:
  - familiarity { [region]: { visits, lastVisit, totalTime } }
  - explorationHistory [{ region, time }]

Methods:
  - recordVisit(position, hoursElapsed, simTime)
  - getNovelty(region, simTime) → 0-1
  - getLeastFamiliarRegion(currentPosition) → region | null
  - getForgottenRegion(currentPosition, simTime) → region | null
  - getRecentRegionDiversity(count) → number
  - toJSON() / restore(state)
```

**Rationale:** Novelty computation is self-contained: it only needs familiarity state and time. The forgetting curve and visit tracking form a cohesive unit. Extracting this removes ~120 lines from the main class.

---

### 2.3 `ExplorationDrive.js`

**Owns:** drive signal generation, region ranking, exploration states.

```
Constructor:
  - explorationDrive (from personality)
  - domain config

Methods:
  - computeDrive(effectiveCuriosity, cfg) → { type, urgency, gradientVector, ... } | null
  - rankRegions(noveltyTracker, currentPosition, limit) → region[]
  - getExplorationStates(imConfig) → string[]
```

**Rationale:** The drive signal is a pure function of effective curiosity and personality. Region ranking depends on NoveltyTracker output but not on goal state. This module is stateless (or near-stateless).

---

### 2.4 `GoalEmitter.js`

**Owns:** goal generation, goal lifecycle, competence tracking, domain-to-region mapping.

```
State:
  - activeGoals []
  - completedGoals []
  - competence { [domain]: { attempts, successes, ema, prevEma, progressRate } }
  - _ticksSinceGoal
  - _lastGoalId

Methods:
  - tickUpdate(position, state, simTime, satisfyCuriosity)
  - maybeGenerateGoal(position, hour, simTime, noveltyTracker, rng)
  - updateCompetence(domain, success)
  - getBestLearningProgress() → domain | null
  - toPromptString() → string
  - toJSON() / restore(state)
```

**Rationale:** Goals and competence are tightly coupled: goal completion triggers competence updates, and competence progress drives goal type selection. The Autotelic/IMGEP logic forms a cohesive unit (~200 lines).

---

### 2.5 `IntrinsicMotivation.js` (Facade)

**Owns:** orchestration, tick loop, public API.

```
Constructor:
  - CuriosityModel
  - NoveltyTracker
  - ExplorationDrive
  - GoalEmitter
  - emotion config

tick():
  1. NoveltyTracker.recordVisit()
  2. CuriosityModel.tickDecay()
  3. GoalEmitter.tickUpdate()
  4. GoalEmitter.maybeGenerateGoal()
  5. Novelty-based curiosity satisfaction
  6. CuriosityModel.applyNeedGate()
  7. ExplorationDrive.computeDrive()
  8. Compute emotion effects

Public API (unchanged):
  - tick(params) → { drive, newEvents, emotionEffects }
  - getNovelty(region, simTime)
  - satisfyCuriosity(amount)
  - toPromptString()
  - getStatus()
  - toJSON()
```

**Rationale:** The facade preserves the existing public API exactly. External callers see no change. Internal orchestration becomes a clear pipeline of sub-module calls.

---

## 3. Dependency Graph

```
IntrinsicMotivation (facade)
  ├── CuriosityModel
  │     └── ANDY_DEFAULTS.needs.threshold (read-only)
  ├── NoveltyTracker
  │     └── domain.regions (read-only)
  ├── ExplorationDrive
  │     ├── NoveltyTracker (reads novelty rankings)
  │     └── domain config (read-only)
  └── GoalEmitter
        ├── NoveltyTracker (reads novelty for goal selection)
        ├── CuriosityModel.satisfyCuriosity (callback)
        ├── domain.regions (read-only)
        └── domain.intrinsicMotivationConfig (read-only)
```

No circular dependencies. Each sub-module receives its dependencies via constructor injection.

---

## 4. Constraints

| Constraint | Rationale |
|---|---|
| **No behavior semantics change** | All formulas, thresholds, decay rates, and selection probabilities must be identical. |
| **No public API change** | `tick()`, `getNovelty()`, `satisfyCuriosity()`, `toPromptString()`, `getStatus()`, `toJSON()` signatures and return shapes unchanged. |
| **No GoalSystem change** | Goal objects, their structure, and how they interact with the action layer remain identical. |
| **No domain schema change** | `intrinsicMotivationConfig`, `domainRegionMap`, `explorationStates`, and `regions` are consumed as-is. |
| **State compatibility** | `toJSON()` output must produce identical snapshots. `restore()` must accept existing save data. |

---

## 5. Migration Strategy

### Phase 1: Extract with re-export
1. Create `CuriosityModel.js`, `NoveltyTracker.js`, `ExplorationDrive.js`, `GoalEmitter.js` in `src/agent/psychology/`.
2. Move code into each module.
3. `IntrinsicMotivation.js` becomes a facade that instantiates and orchestrates the sub-modules.
4. All existing tests pass without modification.

### Phase 2: Internal refactoring (optional, future)
1. Sub-modules can be tested independently.
2. `NoveltyTracker` and `CuriosityModel` can be reused by other systems (e.g., `BehaviorFieldCandidateProvider` could query novelty directly).

---

## 6. Test Plan

### 6.1 Output shape unchanged
- `tick()` returns `{ drive, newEvents, emotionEffects }` with identical structure.
- `drive` contains `{ type, urgency, explorationDrive, targetStates, targetRegions, gradientVector }`.
- `getStatus()` returns `{ curiosity, activeGoals, completedGoals, familiarRegions }`.

### 6.2 Same seed trajectory unchanged
- Given identical `personality`, `savedState`, `domain`, and `rng` seeds:
  - `tick()` produces identical `drive.urgency`, `drive.gradientVector`, and `emotionEffects` at each tick.
  - Goal generation sequence is identical.
  - Novelty values for each region at each tick are identical.

### 6.3 Custom domain still works
- `intrinsicMotivationConfig.domainRegionMap` is respected.
- `explorationStates` from domain config are returned.
- `regions` from domain are used for novelty tracking and goal validation.

### 6.4 Serialization round-trip
- `toJSON()` → `new IntrinsicMotivation(personality, json, domain, rng)` → identical behavior.

---

## 7. File Layout

```
src/agent/psychology/
  IntrinsicMotivation.js      ← facade (orchestration only)
  CuriosityModel.js           ← curiosity state, decay, satisfaction, need gate
  NoveltyTracker.js           ← familiarity, novelty computation, forgetting
  ExplorationDrive.js         ← drive signal, region ranking
  GoalEmitter.js              ← goal lifecycle, competence tracking
```

---

## 8. Line Count Estimate

| Module | Estimated Lines |
|---|---|
| CuriosityModel.js | ~100 |
| NoveltyTracker.js | ~120 |
| ExplorationDrive.js | ~60 |
| GoalEmitter.js | ~220 |
| IntrinsicMotivation.js (facade) | ~150 |
| **Total** | **~650** |

Current: 796 lines in one file. After split: ~650 lines across 5 files (facade shrinks because it delegates).

---

## 9. Risk Assessment

| Risk | Mitigation |
|---|---|
| Subtle behavior drift during extraction | Run full test suite + seed trajectory comparison before/after. |
| Performance overhead from extra function calls | Negligible; sub-modules are in-process, no I/O. |
| Circular dependency if CuriosityModel needs GoalEmitter | Avoided by design: CuriosityModel is state-only, satisfaction is called by facade. |

---

## 10. Explicitly No Code Change

This document is a plan only. No files are modified or created in this stage.
