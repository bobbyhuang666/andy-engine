# Andy Engine Legacy Debt Cleanup Plan

> Status: planning document.
> Date: 2026-06-19.
> Scope: Andy Engine only.
> Purpose: structured cleanup of tolerated legacy boundary debt before any new feature expansion.
>
> This plan follows T0/T1/T1.1 (boundary governance) and T7 (preparation).
> It does NOT introduce new features, new modules, or Stable World Envelope changes.

---

## 1. Scope And Constraints

### 1.1 In Scope

All tolerated boundary violations documented in `KNOWN_BOUNDARY_VIOLATIONS.md` and technical debt documented in `TECHNICAL_DEBT.md`.

### 1.2 Explicitly Forbidden

The following must NOT be implemented, merged, or started during debt cleanup:

- StoryArc runtime
- AdventureAdapter
- PlayerAgent
- QuestSystem
- ItemSystem
- FantasyExtension
- Cultivation domain logic
- Bobby product features
- Andy Town features
- UI/map components
- npm publish
- Stable World Envelope extension
- New gameplay systems
- New domain packs

### 1.3 General Rules

- Each cleanup item must pass its own test gate before proceeding to the next.
- No runtime behavior changes without test coverage.
- `Agent.tick()` must not be restructured during debt cleanup.
- Public API must not change.
- Stable World Envelope must not change.
- Each D-item has a stop condition: if the stop condition is hit, stop and report.

---

## 2. Debt Categories

### D1: SDK Direct Memory Mutation

**Source**: KNOWN_BOUNDARY_VIOLATIONS.md V3, TECHNICAL_DEBT.md §1 (partial)

**Current location**: `sdk/Character.js:379-395`

**Pattern**: `agent.memory.addExperience({ ... }, agent.emotion)` — SDK directly mutates agent memory internals, bypassing structured event flow.

**Risk**: Medium. SDK can bypass CanonEventPipeline and EventEffectPipeline. Memory added this way has no associated event, no knowledge propagation, no effect trace.

**Status**: ✅ RESOLVED (2026-06-19)

**What was done**:
- `agent/Agent.js`: added `recordExternalExperience(event, options)` — narrow public seam that normalizes input, guards against invalid data, and delegates to `memory.addExperience`.
- `sdk/Character.js`: `_recordConversation` now calls `agent.recordExternalExperience()` instead of `agent.memory.addExperience()`.
- `scripts/check-boundaries.js`: added `checkSdkMemoryMutation()` — bans `.memory.addExperience(` and `agent.memory.addExperience(` in `sdk/`.
- `tests/architecture/boundary-check.test.js`: added regression test enforcing SDK must not directly mutate agent memory.
- `tests/sdk.test.js`: added tests proving Character.chat still creates memories, and `recordExternalExperience` returns null for invalid input.

**Remaining risk**: `recordExternalExperience` does not go through CanonEventPipeline or EventEffectPipeline — it only writes memory. This is acceptable for conversation logging (no world truth mutation). Future SDK features that need world truth propagation should use structured events.

**Allowed cleanup**:
- Route SDK experience injection through a structured public API on Agent (e.g. `agent.injectExperience(payload)`) that internally calls memory + creates an event trace.
- The public API must not expose internal memory/emotion objects.
- Add a test proving SDK-injected experience appears in event log.

**Forbidden cleanup**:
- Do not make SDK import from `facts/` or `core/`.
- Do not remove the `addExperience` convenience — only change the call path.
- Do not change `PersonalMemory.addExperience` signature.

**Tests required**:
- `sdk/Character.js` no longer calls `agent.memory.addExperience` directly.
- Injected experience creates a traceable event.
- Existing SDK tests pass.

**Stop condition**: If a clean public API would require restructuring `Agent.tick()` or changing `PersonalMemory` internals, stop and document the blocker.

---

### D2: Campus Legacy Config In Core

**Source**: KNOWN_BOUNDARY_VIOLATIONS.md V6

**Current location**: `config/defaults.js`

**Pattern**: Campus-specific region/coordinate defaults embedded in shared config.

**Status**: ✅ RESOLVED (2026-06-19)

**What was done**:
- `config/defaults.js`: removed `spatial.regions`, `spatial.adjacency`, `spatial.regionCoords`
- `config/defaults.js`: retains only `spatial.continuous` (generic coordinate system params)
- `presets/campus/index.js`: holds complete campus `regions`, `adjacency`, `regionCoords`
- `agent/IntrinsicMotivation.js:338`: uses `this.domain.regions` (not `ANDY_DEFAULTS.spatial.regions`)
- `tests/unit/intrinsic-domain.test.js`: proves tavern domain exploration goals use tavern regions, not campus regions

**Semantic debt resolved** (2026-06-19): `SEMANTIC_EVENT_CATEGORIES` in `config/defaults.js` is now domain-agnostic — campus-only terms (`老师讲`, `作业`, `翘课`, `网吧`, `不想上课`, `课间休息`) removed. `EventDispatcher._classifySemanticCategory()` is domain-aware, preferring `domain.memoryTemplates.semanticCategories`. Campus-specific semantic categories remain in `presets/campus/index.js`. `tests/source-scan.test.js` no longer allowlists `config/defaults.js`.

---

### D3: Campus Legacy Schedule In Agent

**Source**: KNOWN_BOUNDARY_VIOLATIONS.md V7

**Current location**: `agent/Schedule.js`

**Pattern**: Campus-specific schedule data embedded in agent psychology module.

**Risk**: Low-medium. Agent module contains domain-specific data.

**Status**: ✅ RESOLVED (2026-06-19)

**What was done**:
- `presets/campus/schedules.js`: new pure config factories (`createStudentScheduleConfig`, `createWorkerScheduleConfig`, `createFreelancerScheduleConfig`, `createHomeScheduleConfig`) — no dependency on Agent or Schedule class.
- `agent/Schedule.js`: removed all campus-specific schedule entries. Static methods (`createStudentSchedule`, `createWorkerSchedule`, `createFreelancerSchedule`, `createHomeSchedule`) remain as deprecated compatibility wrappers that lazily load from `presets/campus/schedules` and return `Schedule` instances.
- `tests/source-scan.test.js`: removed `agent/Schedule.js` from `ALLOWED_PATHS` (no campus terms remain in the file).
- `presets/campus/index.js`: updated content source comment.
- `KNOWN_BOUNDARY_VIOLATIONS.md`: V7 moved to Resolved.

**Remaining compatibility debt** (not blocking D3):
- Legacy static wrappers remain in `agent/Schedule.js` for backward compatibility — all existing callers (`index.js`, tests, experiments, scripts) continue to work without changes.
- `resolvePreset` still delegates to static wrappers for string presets.

---

### D4: World / SocialGraph Boundary

**Source**: KNOWN_BOUNDARY_VIOLATIONS.md V4

**Current location**: `core/World.js:14`

**Pattern**: `core/World.js` imports `social/SocialGraph` (reverse dependency from core to social layer).

**Risk**: Low. World owns the social graph instance. This is architecturally acceptable but creates a conceptual layer violation.

**Status**: ✅ DOCUMENTATION-RESOLVED / ACCEPTED EXCEPTION (2026-06-19)

**What was done**:
- `docs/ARCHITECTURE_BOUNDARIES.md`: added §2.7 Social Graph (Peer Subsystem) defining `social/` as a peer-owned subsystem of `core/World.js`, not a lower layer.
- `docs/ARCHITECTURE_BOUNDARIES.md`: updated §3.3 Allowed Exceptions to explicitly state this is an accepted architectural pattern (world-owned peer ownership).
- `docs/KNOWN_BOUNDARY_VIOLATIONS.md`: moved V4 from "Current Violations" to "Accepted Architecture Exceptions" with explanation that `social/` has no reverse imports.

**Why no code change needed**: The import `core/World.js` → `social/SocialGraph.js` is not a violation — it is world-owned peer ownership. `social/` modules are dependency leaves with no imports from `core/` or `agent/`.

**Allowed cleanup**:
- Document `social/` as a peer of `core/` in `ARCHITECTURE_BOUNDARIES.md` (already partially done in allowed exceptions).
- No code change required unless a cleaner ownership model emerges.

**Forbidden cleanup**:
- Do not move SocialGraph into `core/`.
- Do not create a circular dependency.
- Do not split SocialGraph across layers.

**Tests required**: None if documentation-only. If code changes: `npm test` passes.

**Stop condition**: If resolving this requires moving files across directories, stop and defer to package-split phase.

---

### D5: Deterministic Replay Debt (RNG And Time Boundaries)

**Source**: RNG_AUDIT.md, source scan, seedable simulation tests

**Current location**: Runtime paths still contain allowed fallback/random-time patterns outside the strict deterministic paths:

- `core/Simulator.js` — tick duration uses `Date.now()`; encounter fallback uses `world.rng ? next() : Math.random()`
- `core/World.js` / `core/EventDispatcher.js` — seeded RNG when available, native fallback otherwise
- `agent/*` subsystems — several paths use `this._rng ? next() : Math.random()` and `simTime ? ... : Date.now()`
- `sdk/*`, `world/compiler.js`, `world/migration.js` — non-core IDs/timers remain outside deterministic replay

**Pattern**: Seeded runs route core random choices through `core/RNG.js`, but the project does not yet promise full deterministic replay for all runtime, SDK, tooling, store, benchmark, and wall-clock paths.

**Risk**: Medium. Overclaiming deterministic replay would be misleading; broad cleanup can accidentally change simulation distributions.

**Status**: ✅ DOCUMENTATION-RESOLVED / ACCEPTED BOUNDARY (2026-06-19)

**What was done**:
- `docs/RNG_AUDIT.md`: updated to reflect seeded simulation baseline completion. Core behavior random sources in seeded simulation path (`agent/BehaviorField`, `agent/EmotionVector`, `agent/EmotionRegulation`, `agent/Schedule`, `core/EventDispatcher`, `core/Simulator`, `core/World`, `agent/Agent` mind-wander/deviation, `agent/IntrinsicMotivation`, `agent/PersonalMemory`) are routed through RNG with `this._rng ? this._rng.next() : Math.random()` fallback. Non-seeded fallback documented as intentional backward compatibility. Note: `core/StoryGenerator.js` and `core/EmotionSignalBuffer.js` are expression/support modules outside the seeded baseline; `agent/Agent.js`, `agent/PersonalMemory.js`, `agent/IntrinsicMotivation.js` retain `simTime ? ... : Date.now()` fallback.
- `docs/KNOWN_BOUNDARY_VIOLATIONS.md`: added V8 (Math.random fallback) and V9 (Date.now in perf/SDK/agent simTime fallback) as accepted architecture exceptions. Added §6 documenting replay-scope boundary as documentation residual, not runtime bug.
- Verified `tests/seedable-simulation.test.js` covers same-seed trajectory reproducibility (B vectors, emotion valence, health, events).
- Verified `tests/rng-injection.test.js` covers RNG determinism, injection, snapshot/restore.
- Verified `npm run check:boundaries` confirms `agent/action/**` and `facts/**` have no `Math.random()` or `Date.now()`.

**Why documentation-resolved, not code-resolved**: The remaining `Math.random()` / `Date.now()` usage outside the seeded simulation path (SDK, tooling, store, presentation) is outside the current replay scope. Forcing these into the seeded path would require public API changes and is deferred to a separate RFC.

**Allowed cleanup**:
- Keep the current claim narrow: "seeded simulation baseline", not full deterministic replay.
- Audit actual `Math.random()` / `Date.now()` uses before each change; do not rely on old line numbers from `RNG_AUDIT.md`.
- Route only clearly runtime-affecting unseeded paths to injected RNG/simTime.
- Preserve native fallback behavior when `config.seed` is absent.
- Add focused replay tests only for paths changed in the same patch.

**Forbidden cleanup**:
- Do not change RNG algorithm or distribution shape.
- Do not change default behavior (non-seeded mode must still work with `Math.random()` fallback).
- Do not modify `core/RNG.js` API.
- Do not route SDK/tooling/store/presentation random sources unless the phase explicitly expands replay scope.
- Do not update README to claim full deterministic replay.

**Future work**:
- Full deterministic replay requires separate RFC covering SDK, tooling, store, and presentation layers.
- Each out-of-scope module (`sdk/AutoTick.js`, `sdk/Character.js`, `world/compiler.js`, `world/migration.js`, `store/*.js`, `core/StoryGenerator.js`, `core/EmotionSignalBuffer.js`, `spatial/WorldMap.js`) needs individual analysis for RNG/simTime injection feasibility.

**Tests required**:
- Same seed produces same trajectory for the changed runtime path.
- Non-seeded mode behavior is unchanged.
- `npm run perf:check` passes (no performance regression from RNG routing).
- Existing seedable simulation and behavior field numerical stability tests pass.

**Stop condition**: If a path requires changing public API, persisted world shape, RNG algorithm, or expected probability distribution, stop and document the replay boundary instead of forcing the cleanup.

---

### D6: Agent.js Complexity Reduction (Preparation Only)

**Source**: TECHNICAL_DEBT.md §1

**Current location**: `agent/Agent.js` (~1710 lines)

**Pattern**: Single file coordinates all subsystems, multiple responsibilities coupled.

**Risk**: Low for runtime, high for development velocity.

**Status**: ✅ PREPARATION DOCUMENTED (2026-06-19)

**What was done**:
- `docs/TECHNICAL_DEBT.md`: expanded §1 with actionable handler candidates table (7 handlers), explicit forbidden rules (5 items), and clear stop conditions (5 prerequisites).
- Handler candidates: `PerceptionHandler`, `ScheduleHandler`, `HealthHandler`, `ReflectionHandler`, `MindWanderHandler`, `SocialHandler`, `NeedsEmotionCoupler`.
- Each handler includes: responsibilities, methods, dependencies.
- Forbidden rules: no tick sequence change, no signature change, no new abstractions, no split during debt cleanup, no subsystem moves.
- Stop conditions: all D1-D5 complete, boundaries pass, tests green, handler tests exist, numerical stability verified.

**Why no code change**: This is preparation only. Actual split requires independent PR with full test coverage.

**Allowed cleanup** (preparation only — no actual split in this phase):
- Document the proposed handler extraction plan in `TECHNICAL_DEBT.md`.
- Identify which private methods belong to which handler.
- Map dependencies between handlers.
- No code changes in this phase.

**Forbidden cleanup**:
- Do NOT split `Agent.js` into multiple files.
- Do NOT change `Agent.tick()` call sequence.
- Do NOT change any public or private method signatures.
- Do NOT add new abstraction layers.

**Tests required**: None (documentation only).

**Stop condition**: N/A — this is documentation-only in the debt cleanup phase.

---

## 3. Execution Order

Recommended order (risk-prioritized, remaining work only):

_(No remaining D-items in this phase.)_

Already resolved / accepted / documented (no further work in this phase):

- **D1**: SDK direct memory mutation — ✅ resolved (2026-06-19)
- **D2**: Campus legacy config — ✅ resolved (2026-06-19)
- **D3**: Campus legacy schedule — ✅ resolved (2026-06-19)
- **D4**: World/SocialGraph boundary — ✅ accepted architecture exception (2026-06-19)
- **D5**: Deterministic replay debt — ✅ documentation-resolved / accepted boundary (2026-06-19)
- **D6**: Agent.js complexity — ✅ preparation documented (2026-06-19)

Each D-item must pass its verification commands before the next begins.

---

## 4. Verification Commands

For every D-item:

```bash
npm test
npm run test:domain
npm run smoke:pack
npm run check:boundaries
git diff --check
```

For D5 (RNG routing) additionally:

```bash
npm run perf:check
```

---

## 5. Completion Criteria

Debt cleanup is complete when:

- All D1–D5 code changes are merged with passing tests.
- D6 documentation is updated.
- `KNOWN_BOUNDARY_VIOLATIONS.md` shows V1, V3, V4, V6, V7 resolved or explicitly accepted with reduced risk.
- `TECHNICAL_DEBT.md` is updated with current status.
- No new violations introduced.
- `npm run check:boundaries` passes.

After debt cleanup, the next phase is:

```text
WorldCanon / Observation / Knowledge Minimal Closure (T2–T5 of TEMP_MODULAR_DECOUPLING_PLAN.md)
```

Not:

```text
new features
```

Not:

```text
StoryArc runtime
```

Not:

```text
npm publish
```
