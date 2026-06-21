# Public Facade / Compatibility Adapter Audit

> Status: active governance document.
> Date: 2026-06-21.
> Scope: Stage 5 of Clean Architecture Pass.
> Purpose: classify every old top-level file by its real architectural role.

---

## Classification Categories

| Category | Definition |
|----------|-----------|
| `public-facade` | Exported public API surface in `package.json` exports. Must remain until approved breaking release. |
| `compatibility-adapter` | Performs shape conversion or format translation for old callers. Contains non-trivial logic that is NOT a simple re-export. Must be tested and documented. |
| `deprecated-wrapper` | Thin re-export (`module.exports = require('../src/...')`) kept only for old import paths. No own logic. |
| `internal-wrapper` | Not public, not exported, only used by old internal paths. Should be retired first. |
| `removable` | No real users (no imports from src/, tests, or package exports). Can be deleted in a later stage. |

---

## Audit Table

### Root Entry Point

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `index.js` | **public-facade** — AndyEngine class with full public API (601 lines). Constructor, createCharacter, getNarrative, tick, snapshot, etc. | `src/runtime/AndyWorld.js` + `src/agent/` + `src/config/` + `src/domain/` + `src/shared/` | yes (`.`) | Major breaking release only | `tests/integration/engine.test.js`, `tests/compatibility.test.js`, `tests/package-boundary.test.js`, `tests/sdk.test.js` |

### agent/ — Agent Subsystems

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `agent/Agent.js` | **public-approved-adapter** — Agent class (306 lines). Constructor wiring, tick delegation, facade methods. Imports from `src/agent/lifecycle/`, `src/agent/runtime/`, `src/agent/facade/`, `src/config/`. | `src/agent/AgentRuntime.js` + `src/agent/lifecycle/` + `src/agent/runtime/` + `src/agent/facade/` | no | When all test imports migrate to `src/agent/` and public API no longer exposes Agent directly | `tests/integration/engine.test.js`, `tests/behavior-field.test.js` |
| `agent/BehaviorField.js` | **DELETED (Stage 15)** | `src/agent/psychology/BehaviorField.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/BehaviorLabeler.js` | **DELETED (Stage 19)** | `src/agent/psychology/BehaviorLabeler.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/StateMachine.js` | **DELETED (Stage 19)** | `src/agent/psychology/StateMachine.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/EmotionVector.js` | **DELETED (Stage 19)** | `src/agent/psychology/EmotionVector.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/EmotionVector.native.js` | **DELETED (Stage 15)** | `src/agent/psychology/EmotionVector.native.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/EmotionRegulation.js` | **DELETED (Stage 15)** | `src/agent/psychology/EmotionRegulation.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/Appraisal.js` | **DELETED (Stage 15)** | `src/agent/psychology/Appraisal.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/NeedsSystem.js` | **DELETED (Stage 15)** | `src/agent/psychology/NeedsSystem.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/NeedsSystem.native.js` | **DELETED (Stage 15)** | `src/agent/psychology/NeedsSystem.native.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/Personality.js` | **DELETED (Stage 19)** | `src/agent/psychology/Personality.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/PersonalMemory.js` | **DELETED (Stage 19)** | `src/agent/memory/PersonalMemory.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/ProceduralMemory.js` | **DELETED (Stage 15)** | `src/agent/memory/ProceduralMemory.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/IntrinsicMotivation.js` | **DELETED (Stage 19)** | `src/agent/psychology/IntrinsicMotivation.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/Schedule.js` | **DELETED (Stage 19)** | `src/agent/schedule/Schedule.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/FutureTendencyTracker.js` | **DELETED (Stage 19)** | `src/agent/psychology/FutureTendencyTracker.js` | no | Deleted — test imports migrated to `src/` | — |
| `agent/LocationMeaningInfluence.js` | **DELETED (Stage 19)** | `src/agent/psychology/LocationMeaningInfluence.js` | no | Deleted — test imports migrated to `src/` | — |

### agent/action/ — Action Selection

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `agent/action/ActionCandidate.js` | **DELETED (Stage 25)** | `src/action/ActionCandidate.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/UtilityScorer.js` | **DELETED (Stage 25)** | `src/action/UtilityScorer.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/UtilitySelector.js` | **DELETED (Stage 25)** | `src/action/UtilitySelector.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/GoalSystem.js` | **DELETED (Stage 15)** | `src/action/GoalSystem.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/action/WorldObject.js` | **DELETED (Stage 15)** | `src/action/WorldObject.js` | no | Deleted — no imports from tests/ or src/ | — |
| `agent/action/providers/CandidateProviderManager.js` | **DELETED (Stage 25)** | `src/action/providers/CandidateProviderManager.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/providers/CandidateProvider.js` | **DELETED (Stage 25)** | `src/action/providers/CandidateProvider.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/providers/ContinueCandidateProvider.js` | **DELETED (Stage 25)** | `src/action/providers/ContinueCandidateProvider.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/providers/NeedCandidateProvider.js` | **DELETED (Stage 25)** | `src/action/providers/NeedCandidateProvider.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/providers/ScheduleCandidateProvider.js` | **DELETED (Stage 25)** | `src/action/providers/ScheduleCandidateProvider.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/providers/BehaviorFieldCandidateProvider.js` | **DELETED (Stage 25)** | `src/action/providers/BehaviorFieldCandidateProvider.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/providers/ExploreCandidateProvider.js` | **DELETED (Stage 25)** | `src/action/providers/ExploreCandidateProvider.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `agent/action/providers/SocializeCandidateProvider.js` | **DELETED (Stage 25)** | `src/action/providers/SocializeCandidateProvider.js` | no | Deleted — all wrappers removed in Stage 25 | — |

### core/ — Simulation Core

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `core/World.js` | **DELETED (Stage 19)** | `src/runtime/AndyWorld.js` | no | Deleted — test imports migrated to `src/` | — |
| `core/Simulator.js` | **DELETED (Stage 25)** | `src/runtime/AndyWorld.js` (via `world.step()`) | no | Deleted — all wrappers removed in Stage 25 | — |
| `core/EventDispatcher.js` | **DELETED (Stage 19)** | `src/runtime/EventDispatcher.js` | no | Deleted — test imports migrated to `src/` | — |
| `core/AndyBridge.js` | **DELETED (Stage 15)** | `src/sdk/AndyBridge.js` | no | Deleted — no imports from tests/ or src/ | — |
| `core/AndyTownAdapter.js` | **DELETED (Stage 15)** | `src/sdk/AndyTownAdapter.js` | no | Deleted — no imports from tests/ or src/ | — |
| `core/EmotionEffectClassifier.js` | **DELETED (Stage 15)** | `src/sdk/EmotionEffectClassifier.js` | no | Deleted — no imports from tests/ or src/ | — |
| `core/EmotionSignalBuffer.js` | **DELETED (Stage 15)** | `src/sdk/EmotionSignalBuffer.js` | no | Deleted — no imports from tests/ or src/ | — |
| `core/StoryGenerator.js` | **DELETED (Stage 15)** | `src/narrative/StoryGenerator.js` | no | Deleted — no imports from tests/ or src/ | — |
| `core/WorldPressure.js` | **DELETED (Stage 19)** | `src/pressure/WorldPressure.js` | no | Deleted — test imports migrated to `src/` | — |

### effects/ — Event Effects

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `effects/EventEffectPipeline.js` | **DELETED (Stage 19)** | `src/effects/EventEffectPipeline.js` | no | Deleted — test imports migrated to `src/` | — |

### facts/ — World Facts

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `facts/index.js` | **public-facade** — Aggregates exports from `src/canon/`, `src/knowledge/`, `src/narrative/` (69 lines). Re-exports all fact system symbols. | `src/canon/`, `src/knowledge/`, `src/narrative/` | yes (`./facts`) | Major breaking release only | `tests/package-boundary.test.js`, `tests/facts/*.test.js` |
| `facts/WorldFactStore.js` | **DELETED (Stage 15)** | `src/canon/WorldFactStore.js` | no | Deleted — no imports from tests/ or src/ | — |
| `facts/FactSchema.js` | **DELETED (Stage 15)** | `src/canon/FactSchema.js` | no | Deleted — no imports from tests/ or src/ | — |
| `facts/CanonEventPipeline.js` | **DELETED (Stage 15)** | `src/canon/CanonEventPipeline.js` | no | Deleted — no imports from tests/ or src/ | — |
| `facts/KnowledgeStore.js` | **DELETED (Stage 15)** | `src/knowledge/KnowledgeStore.js` | no | Deleted — no imports from tests/ or src/ | — |
| `facts/FactProvider.js` | **DELETED (Stage 15)** | `src/narrative/FactProvider.js` | no | Deleted — no imports from tests/ or src/ | — |
| `facts/FactConsistencyChecker.js` | **DELETED (Stage 15)** | `src/narrative/FactConsistencyChecker.js` | no | Deleted — no imports from tests/ or src/ | — |
| `facts/FactEmitter.js` | **DELETED (Stage 25)** | `src/canon/FactEmitter.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `facts/FactFormatter.js` | **DELETED (Stage 15)** | `src/narrative/FactFormatter.js` | no | Deleted — no imports from tests/ or src/ | — |

### social/ — Social Graph

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `social/SocialGraph.js` | **DELETED (Stage 25)** | `src/social/SocialGraph.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `social/Relationship.js` | **DELETED (Stage 25)** | `src/social/Relationship.js` | no | Deleted — all wrappers removed in Stage 25 | — |

### spatial/ — Spatial System

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `spatial/SpatialEngine.js` | **DELETED (Stage 25)** | `src/spatial/SpatialEngine.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `spatial/SpatialHash.js` | **DELETED (Stage 25)** | `src/spatial/SpatialHash.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `spatial/RegionGrid.js` | **DELETED (Stage 15)** | `src/spatial/RegionGrid.js` | no | Deleted — no imports from tests/ or src/ | — |
| `spatial/WorldMap.js` | **DELETED (Stage 19)** | `src/spatial/WorldMap.js` | no | Deleted — test imports migrated to `src/` | — |

### domain/ — Domain Config

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `domain/index.js` | **public-facade** — Re-exports from `src/domain/` (8 lines). | `src/domain/` | yes (`./domain`) | Major breaking release only | `tests/package-boundary.test.js`, `tests/domain.test.js`, `tests/domain-deep.test.js` |
| `domain/DomainRegistry.js` | **DELETED (Stage 21)** — Export now points to `src/domain/DomainRegistry.js` | `src/domain/DomainRegistry.js` | yes (`./domain/registry`) | Deleted — exports migrated to `src/` | — |
| `domain/validateDomain.js` | **DELETED (Stage 21)** — Export now points to `src/domain/validateDomain.js` | `src/domain/validateDomain.js` | yes (`./domain/validate`) | Deleted — exports migrated to `src/` | — |
| `domain/ForbiddenTerms.js` | **DELETED (Stage 25)** | `src/domain/ForbiddenTerms.js` | no | Deleted — all wrappers removed in Stage 25 | — |

### config/ — Configuration

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `config/defaults.js` | **DELETED (Stage 21)** — Export now points to `src/config/defaults.js` | `src/config/defaults.js` | yes (`./config/defaults`) | Deleted — exports migrated to `src/` | — |
| `config/validate.js` | **DELETED (Stage 25)** | `src/config/validate.js` | no | Deleted — all wrappers removed in Stage 25 | — |

### store/ — Persistence

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `store/index.js` | **public-facade** — Aggregates exports from `src/store/` (31 lines). Re-exports all store symbols + `createStore`, `createMemoryStore`. | `src/store/` | yes (`./store`) | Major breaking release only | `tests/package-boundary.test.js` |
| `store/SQLiteStore.js` | **DELETED (Stage 15)** | `src/store/SQLiteStore.js` | no | Deleted — no imports from tests/ or src/ | — |
| `store/SimulationStore.js` | **DELETED (Stage 15)** | `src/store/SimulationStore.js` | no | Deleted — no imports from tests/ or src/ | — |
| `store/SnapshotStore.js` | **DELETED (Stage 15)** | `src/store/SnapshotStore.js` | no | Deleted — no imports from tests/ or src/ | — |
| `store/StoryStore.js` | **DELETED (Stage 15)** | `src/store/StoryStore.js` | no | Deleted — no imports from tests/ or src/ | — |
| `store/MetaStore.js` | **DELETED (Stage 15)** | `src/store/MetaStore.js` | no | Deleted — no imports from tests/ or src/ | — |

### sdk/ — SDK

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `sdk/index.js` | **public-facade** — Re-exports from `src/sdk/` (8 lines). | `src/sdk/` | yes (`./sdk`) | Major breaking release only | `tests/package-boundary.test.js`, `tests/sdk.test.js` |
| `sdk/Character.js` | **DELETED (Stage 25)** | `src/sdk/Character.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `sdk/Andy.js` | **DELETED (Stage 25)** | `src/sdk/Andy.js` | no | Deleted — all wrappers removed in Stage 25 | — |
| `sdk/LLMAdapter.js` | **DELETED (Stage 15)** | `src/sdk/LLMAdapter.js` | no | Deleted — no imports from tests/ or src/ | — |
| `sdk/NarrativeBuilder.js` | **DELETED (Stage 19)** | `src/sdk/NarrativeBuilder.js` | no | Deleted — test imports migrated to `src/` | — |
| `sdk/ConversationLog.js` | **DELETED (Stage 15)** | `src/sdk/ConversationLog.js` | no | Deleted — no imports from tests/ or src/ | — |
| `sdk/AutoTick.js` | **DELETED (Stage 15)** | `src/sdk/AutoTick.js` | no | Deleted — no imports from tests/ or src/ | — |

### world/ — World Tooling

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `world/WorldStateAdapter.js` | **DELETED (Stage 19)** | `src/store/world/WorldStateAdapter.js` | no | Deleted — test imports migrated to `src/` | — |
| `world/validator.js` | **DELETED (Stage 19)** | `src/store/world/validator.js` | no | Deleted — test imports migrated to `src/` | — |
| `world/compiler.js` | **DELETED (Stage 19)** | `src/store/world/compiler.js` | no | Deleted — test imports migrated to `src/` | — |
| `world/migration.js` | **DELETED (Stage 19)** | `src/store/world/migration.js` | no | Deleted — test imports migrated to `src/` | — |

### Root Test Scripts (Legacy)

| old path | current role | canonical src path | exported? | removal condition | tests protecting it |
|----------|-------------|-------------------|-----------|-------------------|---------------------|
| `test.js` | **DELETED (Stage 15)** | N/A | no | Deleted — superseded by vitest tests | — |
| `test_pipeline.js` | **DELETED (Stage 15)** | N/A | no | Deleted — superseded by vitest tests | — |
| `test_soa.js` | **DELETED (Stage 15)** | N/A | no | Deleted — superseded by vitest tests | — |
| `test_soa_contagion.js` | **DELETED (Stage 15)** | N/A | no | Deleted — superseded by vitest tests | — |
| `test_soa_debug.js` | **DELETED (Stage 15)** | N/A | no | Deleted — superseded by vitest tests | — |
| `test_store.js` | **DELETED (Stage 15)** | N/A | no | Deleted — superseded by vitest tests | — |

---

## Summary

| Category | Count | Files |
|----------|-------|-------|
| **public-facade** | 5 | `index.js`, `facts/index.js`, `domain/index.js`, `store/index.js`, `sdk/index.js` |
| **public-approved-adapter** | 1 | `agent/Agent.js` (documented in PUBLIC_API_CONTRACT.md) |
| **deprecated-wrapper** | 0 | All wrappers deleted in Stage 25 |
| **compatibility-adapter** | 0 | All compatibility adapters deleted in Stage 25 |
| **standalone-tooling** | 0 | — |
| **removable** | 6 | `test.js`, `test_pipeline.js`, `test_soa.js`, `test_soa_contagion.js`, `test_soa_debug.js`, `test_store.js` (all deleted in Stage 15) |

---

## Rules

1. Every old top-level `.js` file must appear in this table.
2. Files classified as `compatibility-adapter` or `public-facade` must have test coverage.
3. `deprecated-wrapper` files must be pure re-exports (no own logic).
4. `removable` files can be deleted in a later stage without breaking any test.
5. `scripts/check-boundaries.js` enforces that no new implementation logic appears in old top-level directories.
