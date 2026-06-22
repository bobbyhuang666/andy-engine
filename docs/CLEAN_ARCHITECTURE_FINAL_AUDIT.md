# Andy Engine — Final Architecture Audit

> Stage: 37.1 (Clean Architecture + Semantic Closure Truth Patch)
> Date: 2026-06-21
> Status: PASS
> Clean Architecture Pass Status: **COMPLETE**
> Semantic Closure Pass Status: **COMPLETE**

---

## 1. Current Architecture Tree

```
src/
├── action/                    Action candidate generation, utility scoring, selection
│   ├── ActionCandidate.js
│   ├── GoalSystem.js
│   ├── ReasonTrace.js
│   ├── SelectedAction.js
│   ├── UtilityScorer.js
│   ├── UtilitySelector.js
│   ├── WorldObject.js
│   ├── index.js
│   └── providers/             9 candidate providers (Continue, Need, Memory, Habit, WorldPressure, etc.)
├── agent/                     Agent lifecycle, runtime, handlers, psychology, memory, schedule
│   ├── AgentRuntime.js        Tick pipeline driver (~180 lines)
│   ├── facade/                AgentNarrative, AgentSerializer, ExternalExperience, InteractionFacade
│   ├── handlers/              8 tick handlers (Perception, Schedule, Social, Reflection, etc.)
│   ├── lifecycle/             AgentDefaults, AgentSubsystemFactory, AgentWiring
│   ├── memory/                PersonalMemory, ProceduralMemory
│   ├── psychology/            BehaviorField, EmotionVector, NeedsSystem, Personality, etc. (14 files)
│   ├── runtime/               ActionSelection, MindWander, Perception, Physiology, Reflection runtimes
│   └── schedule/              Schedule
├── canon/                     World truth: WorldFactStore, FactSchema, CanonEventPipeline, FactEmitter
├── config/                    Engine defaults, validation, index
├── domain/                    Domain config contract: DomainRegistry, ForbiddenTerms, validateDomain
├── effects/                   Effect pipeline: EffectCommitter, EffectResult, 7 delta types
├── knowledge/                 KnowledgeStore (per-agent knowledge tracking)
├── narrative/                 FactProvider, FactConsistencyChecker, FactFormatter, StoryGenerator
├── pressure/                  WorldPressure, LocationPressure, MemoryPressure, NeedPressure, etc.
├── runtime/                   AndyWorld, EventDispatcher, WorldClock, RuntimeConfig, RuntimeContext
├── sdk/                       Andy, Character, AndyBridge, NarrativeBuilder, LLMAdapter, etc.
├── shared/                    RNG, ids, errors, time, schemas (5 schema files)
├── social/                    SocialGraph, Relationship
├── spatial/                   SpatialEngine, SpatialHash, RegionGrid, WorldMap
└── store/                     Serialization, SaveLoad, SQLiteStore, SimulationStore, etc.
```

**15 top-level directories under `src/`** — each owns a single responsibility.

---

## 2. Remaining Public Facades

| Path | Status | Export | Deletion Condition |
|------|--------|--------|-------------------|
| `index.js` | public-facade (601 lines) | `.` | Major breaking release only |
| `facts/index.js` | public-facade (69 lines) | `./facts` | Major breaking release only |
| `domain/index.js` | public-facade (14 lines) | `./domain` | Major breaking release only |
| `store/index.js` | public-facade (31 lines) | `./store` | Major breaking release only |
| `sdk/index.js` | public-facade (8 lines) | `./sdk` | Major breaking release only |

All 5 public facades are thin re-exports. `package.json` exports match `docs/PUBLIC_API_CONTRACT.md` exactly (10 paths). 3 exports now point directly to `src/` implementations (`./domain/validate`, `./domain/registry`, `./config/defaults`).

---

## 3. Remaining Public-Approved Adapters

| Path | Lines | Purpose | Deletion Condition |
|------|-------|---------|-------------------|
| `agent/Agent.js` | 313 | Agent lifecycle facade (constructor, tick delegation, getters) | When all test imports migrate to `src/agent/` |

`agent/action/ActionCandidate.js`, `core/Simulator.js`, `effects/EventEffectPipeline.js` — **DELETED (Stage 25)**.

`agent/Agent.js` has explicit comments documenting its canonical source, reason retained, and deletion condition.

---

## 4. Remaining Deprecated Wrappers

0 deprecated wrappers remain. All deprecated wrappers were deleted in Stage 25.

76 deprecated-wrapper entries in the classification list are already removed (not on disk).

---

## 5. Removed Debt (Stages 5–25)

### Stage 15 deletions (34 files):

**Root test scripts (6):** `test.js`, `test_pipeline.js`, `test_soa.js`, `test_soa_contagion.js`, `test_soa_debug.js`, `test_store.js`

**agent/ (9):** `BehaviorField.js`, `EmotionVector.native.js`, `EmotionRegulation.js`, `Appraisal.js`, `NeedsSystem.js`, `NeedsSystem.native.js`, `ProceduralMemory.js`, `action/GoalSystem.js`, `action/WorldObject.js`

**core/ (5):** `AndyBridge.js`, `AndyTownAdapter.js`, `EmotionEffectClassifier.js`, `EmotionSignalBuffer.js`, `StoryGenerator.js`

**facts/ (7):** `WorldFactStore.js`, `FactSchema.js`, `CanonEventPipeline.js`, `KnowledgeStore.js`, `FactProvider.js`, `FactConsistencyChecker.js`, `FactFormatter.js`

**spatial/ (1):** `RegionGrid.js`

**store/ (5):** `SQLiteStore.js`, `SimulationStore.js`, `SnapshotStore.js`, `StoryStore.js`, `MetaStore.js`

**sdk/ (3):** `LLMAdapter.js`, `ConversationLog.js`, `AutoTick.js`

### Stage 19 deletions (14 files):

**agent/ (8):** `BehaviorLabeler.js`, `StateMachine.js`, `EmotionVector.js`, `Personality.js`, `PersonalMemory.js`, `IntrinsicMotivation.js`, `Schedule.js`, `FutureTendencyTracker.js`, `LocationMeaningInfluence.js`

**core/ (3):** `World.js`, `EventDispatcher.js`, `WorldPressure.js`

**facts/ (1):** `FactEmitter.js`

**spatial/ (1):** `WorldMap.js`

**sdk/ (1):** `NarrativeBuilder.js`

**world/ (4):** `WorldStateAdapter.js`, `validator.js`, `compiler.js`, `migration.js`

**effects/ (1):** `EventEffectPipeline.js`

### Stage 21 deletions (3 files):

**domain/ (2):** `DomainRegistry.js`, `validateDomain.js`

**config/ (1):** `defaults.js`

### Stage 24 fix (2 files — stale references corrected):

- `scripts/oak-town-sim.js` — updated import from deleted `agent/Schedule` to canonical `src/agent/schedule/Schedule`
- `experiments/behavior_field_personality.js` — updated imports from deleted `agent/BehaviorField` and `agent/BehaviorLabeler` to canonical `src/agent/psychology/` paths

### Stage 25 final wrapper retirement:

- `agent/action/ActionCandidate.js`
- `agent/action/UtilityScorer.js`
- `agent/action/UtilitySelector.js`
- `social/SocialGraph.js`
- `social/Relationship.js`
- `spatial/SpatialEngine.js`
- `spatial/SpatialHash.js`
- `domain/ForbiddenTerms.js`
- `config/validate.js`

### Earlier stages:
- `core/EventEffectPipeline.js` — retired
- `core/RNG.js` — retired
- `core/WorldviewConstraints.js` — retired
- `effects/` old wrappers — deleted

---

## 6. Test Matrix

| Category | Files | Tests | Status |
|----------|-------|-------|--------|
| All tests (`npm test`) | 99 | 1844 | ✅ PASS |
| Domain tests (`npm run test:domain`) | 5 | 78 | ✅ PASS |
| Boundary checks (`npm run check:boundaries`) | 1 script | 15 checks | ✅ PASS |
| Smoke pack (`npm run smoke:pack`) | 1 script | 14 checks | ✅ PASS |
| Release check (`npm run release:check`) | 1 script | full pipeline | ✅ PASS |
| Git whitespace (`git diff --check`) | — | — | ✅ PASS |
| Performance (`npm run perf:check`) | 1 script | — | ✅ PASS |
| Legacy dry run (`node scripts/legacy-removal-dry-run.js`) | 1 script | gate check | ✅ PASS (0 removable) |

---

## 7. Known Follow-ups

| Follow-up | Priority | Owner | Notes |
|-----------|----------|-------|-------|
| WorldObject spatial/perception/effect integration | Medium | Future architecture | Modeled, not yet wired into runtime perception/effects |
| StoryArc runtime | Medium | Future architecture | Explicitly paused; do not implement without approval |
| `enableFacts` default remains `false` | Low | Architecture | Accepted boundary; fact system is opt-in semantic layer |
| Full deterministic replay | Low | Research/runtime | SDK/tooling/store paths are outside current seeded simulation baseline |

---

## 8. Audit Dimensions Summary

| # | Dimension | Status | Evidence |
|---|-----------|--------|----------|
| 1 | **Directory ownership** | ✅ PASS | `src/` is the only canonical implementation tree (15 subdirectories, 120+ files) |
| 2 | **Public API contract** | ✅ PASS | `package.json` exports match `docs/PUBLIC_API_CONTRACT.md` exactly (10 paths) |
| 3 | **Internal import direction** | ✅ PASS | `check:boundaries` confirms zero `src/` reverse imports from old wrappers |
| 4 | **Agent facade containment** | ✅ PASS | `agent/Agent.js` is 313 lines. Logic extracted to `src/agent/lifecycle/`, `runtime/`, `facade/`, `handlers/` |
| 5 | **Action/effects writeback boundaries** | ✅ PASS | `src/action/` is read-only. New world-facing consequences use `EffectCommitter`. Legacy paths documented. |
| 6 | **Canon/knowledge/narrative authority** | ✅ PASS | `check:boundaries` enforces canon/knowledge/narrative separation. Tests verify. |
| 7 | **Store/serialization contract** | ✅ PASS | `docs/SERIALIZATION_CONTRACT.md` documents both layers. Restore tests pass. |
| 8 | **Domain/campus isolation** | ✅ PASS | Campus exists only in `presets/campus/`. Source scan tests verify no campus terms in core. |
| 9 | **Test architecture** | ✅ PASS | `docs/TESTING_ARCHITECTURE.md` documents layout. Import conventions enforced. |
 | 10 | **Performance baseline** | ✅ PASS | `perf:check` all metrics within threshold |
| 11 | **Package boundary** | ✅ PASS | No internal `src/` modules leaked in `package.json` exports. |
| 12 | **Documentation truth** | ✅ PASS | All 12 governance docs match current code state. |

---

## 9. Clean Architecture Pass Status

### **COMPLETE**

Stage 24 final audit confirms all exit criteria from `docs/CLEAN_ARCHITECTURE_NO_DEBT_COMPLETION_PLAN.md` §11 are satisfied.

### Gate Check (legacy-removal-dry-run):

```
Existing old files that can be removed now: 0
Standalone tooling outside src: 0
Unclassified old files: 0
GATE: PASS
```

### Required Checks:

| # | Check | Result |
|---|-------|--------|
| 1 | No standalone tooling outside `src/` | ✅ PASS |
| 2 | No existing removable old wrapper | ✅ PASS |
| 3 | No unclassified top-level old file | ✅ PASS |
| 4 | No `src/**` reverse import | ✅ PASS |
| 5 | No public API docs mismatch | ✅ PASS |
| 6 | No stale deleted-file references | ✅ PASS (Stage 24 fixed 3 stale refs in scripts/oak-town-sim.js and experiments/behavior_field_personality.js) |
| 7 | No legacy direct mutation debt for world-facing consequences | ✅ PASS (all resolved in Stage 22, documented in STATE_WRITEBACK_OWNERSHIP.md §5) |
| 8 | Full validation passes | ✅ PASS (see §6 Test Matrix) |

### Exit Criteria:

- ✅ `src/` is the canonical implementation tree for all runtime paths
- ✅ No standalone canonical implementation remains outside `src/`
- ✅ Remaining top-level files are public facades (5) or public-approved adapters (1) only
- ✅ All 8 checks above pass
- ✅ Full validation passes

### Remaining Approved Debt (intentional, documented, blocked by real constraints):

- 5 public-facade: require major breaking release to remove
- 1 public-approved-adapter (`agent/Agent.js`): documented in PUBLIC_API_CONTRACT.md, imported by `index.js` and `src/`
- 0 temporary-adapter
- 0 deprecated-wrapper
- 0 compatibility-adapter

---

## 10. Stale Reference Fix Log (Stage 24)

| File | Old Import | Fixed Import |
|------|-----------|-------------|
| `scripts/oak-town-sim.js:18` | `require('../agent/Schedule')` | `require('../src/agent/schedule/Schedule')` |
| `experiments/behavior_field_personality.js:12` | `require('../agent/BehaviorField')` | `require('../src/agent/psychology/BehaviorField')` |
| `experiments/behavior_field_personality.js:13` | `require('../agent/BehaviorLabeler')` | `require('../src/agent/psychology/BehaviorLabeler')` |
