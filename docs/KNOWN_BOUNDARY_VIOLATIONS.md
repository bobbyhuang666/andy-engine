# Known Boundary Violations

> **Historical tracking document.**
> The Clean Architecture Pass has retired the documented legacy wrappers. Current
> boundary status is governed by `scripts/check-boundaries.js`,
> `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`, and `docs/LEGACY_REMOVAL_REPORT.md`.
> Some examples below intentionally reference pre-retirement paths such as
> `core/World.js` and `config/defaults.js`; treat those sections as migration
> history unless they are explicitly listed under "Current Violations".
>
> Status: historical tracking document; current violation count is zero.
> Date: 2026-06-19.
> Purpose: document tolerated legacy boundary debt so new violations are not introduced.

---

## 1. Purpose

This document records known boundary violations that exist in the current codebase.
These are tolerated legacy debt, not approved patterns.
New code must not introduce additional violations of the same kind.

---

## 2. Current Violations

No unresolved current boundary violations are known as of 2026-06-19.

Accepted exceptions and replay-scope boundaries are tracked separately below.

---

## 3. Accepted Architecture Exceptions

The following are not violations but accepted architectural patterns.

### V4: core/World imports social/SocialGraph (Accepted Peer Ownership)

**Location**: `core/World.js:14`
**Pattern**: `const SocialGraph = require('../social/SocialGraph');`
**Architectural Role**: `social/` is a **peer-owned subsystem** of `core/World.js`. World creates and owns the SocialGraph instance as part of world state.
**Why not a violation**: `social/` modules have no reverse imports to `core/` or `agent/`. The dependency is one-way: `core/World.js` → `social/SocialGraph.js`. This is world-owned peer ownership, not a layer violation.
**Documentation**: See `ARCHITECTURE_BOUNDARIES.md` §2.7 and §3.3.
**Status**: accepted — no code changes needed.

### V10: core/World imports facts/ (Accepted World Ownership)

**Location**: `core/World.js:18`
**Pattern**: `const { WorldFactStore, FactEmitter, KnowledgeStore, CanonEventPipeline } = require('../facts');`
**Architectural Role**: `facts/` is a **peer-owned subsystem** of `core/World.js`, analogous to `social/`. World creates and owns the WorldFactStore, KnowledgeStore, FactEmitter, and CanonEventPipeline instances as part of world state.
**Why not a violation**: `facts/` modules have no reverse imports to `core/` or `agent/`. The dependency is one-way: `core/World.js` → `facts/index.js`. This is world-owned peer ownership, not a layer violation. No other `core/` module may import `facts/` unless separately approved.
**Documentation**: See `ARCHITECTURE_BOUNDARIES.md` §3.3.
**Status**: accepted — no code changes needed.

### V8: Seeded RNG fallback to Math.random() in non-seeded mode (Intentional Backward Compatibility)

**Location**: All core/agent modules using `this._rng ? this._rng.next() : Math.random()` pattern.
**Pattern**: When `config.seed` is not provided, `rng` is `null` and all random sources fall back to `Math.random()`.
**Why not a violation**: This is the documented backward-compatible behavior. Existing users who do not pass `config.seed` expect `Math.random()` fallback. The seeded simulation baseline only applies when a seed is provided.
**Verification**: `tests/rng-injection.test.js` and `tests/seedable-simulation.test.js` confirm both modes work correctly.
**Status**: accepted — intentional design, no code changes needed.

### V9: Date.now() in performance measurement, SDK/tooling layers, and agent simTime fallback (Accepted Scope Exclusion)

**Location**: `core/Simulator.js` (tick duration), `sdk/*.js`, `store/*.js`, `world/compiler.js`, `world/migration.js`, `agent/IntrinsicMotivation.js` (7 fallback sites), `agent/Agent.js`, `agent/PersonalMemory.js`.
**Pattern**: `Date.now()` is used for performance timers, SDK wall-clock, store timestamps, and tooling IDs — not for simulation state. Additionally, several `agent/` modules use `simTime ? simTime.getTime() : Date.now()` fallback; the normal tick path uses simTime, but fallback/out-of-scope paths are not full replay commitment.
**Why not a violation**: Normal tick path uses `env.simTime`. `Date.now()` usage in SDK/tooling is outside the simulation deterministic path. The agent simTime fallback is triggered only when simTime is absent (e.g., direct module usage outside the simulation loop). These modules are explicitly outside the seeded simulation replay scope.
**Status**: accepted — scope exclusion, no code changes needed.

---

## 4. Resolved Violations

### V1: Agent imports from core/EventEffectPipeline

**Resolved**: 2026-06-19.
**Verification**: `agent/Agent.js` now imports `applyActionEffect` from `effects/EventEffectPipeline.js` (dependency leaf). `core/Simulator.js` also imports `effects/EventEffectPipeline.js` directly. The `core/EventEffectPipeline.js` wrapper delegates to `effects/EventEffectPipeline.js` for backward compatibility.
**Boundary check**: `npm run check:boundaries` confirms `agent/` has no direct `core/EventEffectPipeline` imports.
**Phase 12**: `core/EventEffectPipeline.js` wrapper retired (deleted). Zero external imports at retirement.

### V2: Agent imports from core/WorldviewConstraints

**Resolved**: 2026-06-19.
**Verification**: `agent/Agent.js` and `agent/BehaviorLabeler.js` now import `applyForbiddenTerms` from `domain/ForbiddenTerms.js` (dependency leaf). The `core/WorldviewConstraints.js` wrapper delegates to `domain/ForbiddenTerms.js` for backward compatibility.
**Boundary check**: `npm run check:boundaries` confirms `agent/` has no direct `core/WorldviewConstraints` imports.
**Phase 12**: `core/WorldviewConstraints.js` wrapper retired (deleted). Only `index.js` imported it; updated to `src/domain/ForbiddenTerms.js`.

### V3: SDK/Character.js directly accesses agent.memory.addExperience

**Resolved**: 2026-06-19.
**Verification**: `sdk/Character.js` no longer calls `agent.memory.addExperience` directly. `_recordConversation` now calls `agent.recordExternalExperience()`, a narrow public seam on Agent that internally delegates to `memory.addExperience`.
**Boundary check**: `npm run check:boundaries` confirms `sdk/` has no `.memory.addExperience(` patterns.
**Regression test**: `tests/architecture/boundary-check.test.js` enforces SDK must not directly mutate agent memory.

### V6: config/defaults.js contains campus legacy spatial config

**Resolved**: 2026-06-19.
**Verification**: `config/defaults.js` no longer contains `spatial.regions`, `spatial.adjacency`, or `spatial.regionCoords`. Campus spatial data lives in `presets/campus/index.js`. `IntrinsicMotivation.js` uses `this.domain.regions` for goal validation.
**Semantic debt resolved** (2026-06-19): `SEMANTIC_EVENT_CATEGORIES` in `config/defaults.js` is now domain-agnostic (campus-only terms removed). `EventDispatcher._classifySemanticCategory()` is domain-aware, preferring `domain.memoryTemplates.semanticCategories`. Campus-specific semantic categories remain in `presets/campus/index.js`. `tests/source-scan.test.js` no longer allowlists `config/defaults.js`.

### V5: facts/ modules use Date.now() as fallback timestamp

**Resolved**: 2026-06-19.
**Verification**: `grep -r "Date.now()" facts/` and `grep -r "Math.random()" facts/` return no matches.
**Boundary check**: `npm run check:boundaries` confirms `facts/` deterministic paths are clean.

### V7: agent/Schedule.js contains campus legacy schedule presets

**Resolved**: 2026-06-19.
**Verification**: `agent/Schedule.js` no longer contains campus-specific schedule entries. Schedule data lives in `presets/campus/schedules.js`. Legacy static wrappers (`createStudentSchedule`, `createWorkerSchedule`, `createFreelancerSchedule`, `createHomeSchedule`, `resolvePreset`) remain in `agent/Schedule.js` for backward compatibility — they lazily load from `presets/campus/schedules` and return `Schedule` instances.
**Source-scan**: `agent/Schedule.js` removed from `ALLOWED_PATHS` in `tests/source-scan.test.js`.

---

## 5. Violations NOT Present

The following violations do NOT exist in the current codebase (verified 2026-06-19):

- No `agent/action/**` imports from `sdk/` or `facts/`
- No `facts/**` imports from `agent/` or `sdk/`
- No `core/**` imports from `agent/` or `sdk/`
- No `domain/**` imports from `agent/`, `sdk/`, or `facts/`
- No extension concepts (PlayerAgent, QuestSystem, ItemSystem, AdventureAdapter, StatusBoard, FantasyExtension) in core
- No `Math.random()` or `Date.now()` in `agent/action/**` runtime paths
- No `Math.random()` or `Date.now()` in `facts/**` runtime paths

---

## 6. Documentation / Replay-Scope Boundary (D5 Residual)

The seeded simulation baseline is complete and tested. The following are **not runtime bugs** but documentation/scope boundaries:

- **Full deterministic replay** is not promised. SDK, tooling, store, and presentation layers use `Math.random()` / `Date.now()` outside the seeded simulation path. These require a separate RFC to bring into replay scope.
- **Non-seeded fallback** to `Math.random()` is intentional backward compatibility, not a violation.
- **Performance timers** (`Date.now()` in `Simulator.js`) do not affect simulation state.

See `RNG_AUDIT.md` §4 for the complete replay scope boundary list.

---

## 7. Tracking Policy

- Each violation has a status: tolerated, in-progress, resolved.
- New violations must be documented here before merge.
- Violations without a resolution plan are blocking for new feature work in the same area.
- Resolved violations should be moved to a "Resolved" section with the commit hash.

---

## 8. Phase 12: Wrapper Retirement (2026-06-20)

### Retired Wrappers

| Wrapper | Canonical Location | External Imports at Retirement | Status |
|---------|-------------------|-------------------------------|--------|
| `core/EventEffectPipeline.js` | `effects/EventEffectPipeline.js` | 0 | **Retired** |
| `core/RNG.js` | `src/shared/rng.js` | 1 (`index.js`) | **Retired** |
| `core/WorldviewConstraints.js` | `src/domain/ForbiddenTerms.js` | 1 (`index.js`) + 1 test | **Retired** |

### Active Wrappers (Retained — Public API Surface)

These wrappers are part of `package.json` exports and must be retained until a major-version strategy is defined:

| Wrapper Directory | Canonical Location | Reason Retained |
|-------------------|-------------------|-----------------|
| `domain/` | `src/domain/` | `package.json` exports: `./domain`, `./domain/validate`, `./domain/registry` |
| `config/` | `src/config/` | `package.json` exports: `./config/defaults`; 34+ internal imports |
| `sdk/` | `src/sdk/` | `package.json` exports: `./sdk`; tests + examples import from `sdk/` |
| `store/` | `src/store/` + local impl | `package.json` exports: `./store`; contains actual implementations |
| `facts/` | `src/canon/`, `src/knowledge/`, `src/narrative/` | `package.json` exports: `./facts`; `index.js` imports from `facts/` |
| `social/` | `src/social/` | `core/World.js` + tests import from `social/` |
| `spatial/` | `src/spatial/` | Tests import from `spatial/` |
| `agent/action/` | `src/action/` | Tests import from `agent/action/`; legacy `createCandidate` shim |

### Retired Wrapper Details

**`core/EventEffectPipeline.js`** — Pure 2-line re-export. No external code imported it. `agent/Agent.js` already uses `effects/EventEffectPipeline.js` directly.

**`core/RNG.js`** — Pure 2-line re-export. Only `index.js` imported it. Updated `index.js` to use `src/shared/rng.js`.

**`core/WorldviewConstraints.js`** — 242-line file with campus-specific sanitization logic (sanitizeText, checkViolations, safeRegion, safeActivity) + re-export of `applyForbiddenTerms`. The campus-specific functions were only used in tests. `index.js` only used `applyForbiddenTerms`, now imported from `src/domain/ForbiddenTerms.js`. Campus sanitization tests removed (they tested the wrapper's own logic, not the canonical ForbiddenTerms).
