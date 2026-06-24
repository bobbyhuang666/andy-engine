# Legacy Removal Report

> Status: no-debt gate (Stage 23).
> Date: 2026-06-24.
> Purpose: verify zero removable debt remains.

---

## Summary

| Metric | Count |
|--------|-------|
| Total classified files | 82 |
| Already removed (not on disk) | 76 |
| Existing files analyzed | 6 |
| **Can remove now (existing)** | **0** |
| Blocked (existing) | 6 |
| Standalone tooling outside src | 0 |
| Unclassified old files | 0 |

### Gate Check

| Check | Result |
|-------|--------|
| Existing old files that can be removed now | 0 |
| Standalone tooling outside src | 0 |
| Unclassified old files | 0 |
| **Gate** | **PASS** |

### By Classification (existing files only)

| Classification | Removable | Blocked |
|---------------|-----------|---------|
| public-facade | 0 | 5 |
| public-approved-adapter | 0 | 1 |

---

## Detail Table — Existing Files

| Old File | Classification | Exported? | Imported by src/ | Imported by tests/ | Can Remove? | Blockers |
|----------|---------------|-----------|-----------------|-------------------|-------------|----------|
| `index.js` | public-facade | yes | no | no | NO | public-facade: needs breaking release |
| `agent/Agent.js` | public-approved-adapter | no | yes (3) | yes (1) | NO | public-approved-adapter: documented in PUBLIC_API_CONTRACT.md |
| `facts/index.js` | public-facade | yes | no | no | NO | public-facade: needs breaking release |
| `domain/index.js` | public-facade | yes | no | no | NO | public-facade: needs breaking release |
| `store/index.js` | public-facade | yes | no | no | NO | public-facade: needs breaking release |
| `sdk/index.js` | public-facade | yes | no | yes (1) | NO | public-facade: needs breaking release |

---

## Already Removed Files

These files appear in the classification list but no longer exist on disk.

| Old File | Classification |
|----------|---------------|
| `agent/BehaviorField.js` | deprecated-wrapper |
| `agent/BehaviorLabeler.js` | deprecated-wrapper |
| `agent/StateMachine.js` | deprecated-wrapper |
| `agent/EmotionVector.js` | deprecated-wrapper |
| `agent/EmotionVector.native.js` | deprecated-wrapper |
| `agent/EmotionRegulation.js` | deprecated-wrapper |
| `agent/Appraisal.js` | deprecated-wrapper |
| `agent/NeedsSystem.js` | deprecated-wrapper |
| `agent/NeedsSystem.native.js` | deprecated-wrapper |
| `agent/Personality.js` | deprecated-wrapper |
| `agent/PersonalMemory.js` | deprecated-wrapper |
| `agent/ProceduralMemory.js` | deprecated-wrapper |
| `agent/IntrinsicMotivation.js` | deprecated-wrapper |
| `agent/Schedule.js` | deprecated-wrapper |
| `agent/FutureTendencyTracker.js` | deprecated-wrapper |
| `agent/LocationMeaningInfluence.js` | deprecated-wrapper |
| `agent/action/ActionCandidate.js` | deprecated-wrapper |
| `agent/action/UtilityScorer.js` | deprecated-wrapper |
| `agent/action/UtilitySelector.js` | deprecated-wrapper |
| `agent/action/GoalSystem.js` | deprecated-wrapper |
| `agent/action/WorldObject.js` | deprecated-wrapper |
| `agent/action/providers/CandidateProviderManager.js` | deprecated-wrapper |
| `agent/action/providers/CandidateProvider.js` | deprecated-wrapper |
| `agent/action/providers/ContinueCandidateProvider.js` | deprecated-wrapper |
| `agent/action/providers/NeedCandidateProvider.js` | deprecated-wrapper |
| `agent/action/providers/ScheduleCandidateProvider.js` | deprecated-wrapper |
| `agent/action/providers/BehaviorFieldCandidateProvider.js` | deprecated-wrapper |
| `agent/action/providers/ExploreCandidateProvider.js` | deprecated-wrapper |
| `agent/action/providers/SocializeCandidateProvider.js` | deprecated-wrapper |
| `core/World.js` | deprecated-wrapper |
| `core/Simulator.js` | deprecated-wrapper |
| `core/EventDispatcher.js` | deprecated-wrapper |
| `core/AndyBridge.js` | deprecated-wrapper |
| `core/AndyTownAdapter.js` | deprecated-wrapper |
| `core/EmotionEffectClassifier.js` | deprecated-wrapper |
| `core/EmotionSignalBuffer.js` | deprecated-wrapper |
| `core/StoryGenerator.js` | deprecated-wrapper |
| `core/WorldPressure.js` | deprecated-wrapper |
| `effects/EventEffectPipeline.js` | deprecated-wrapper |
| `facts/WorldFactStore.js` | deprecated-wrapper |
| `facts/FactSchema.js` | deprecated-wrapper |
| `facts/CanonEventPipeline.js` | deprecated-wrapper |
| `facts/KnowledgeStore.js` | deprecated-wrapper |
| `facts/FactProvider.js` | deprecated-wrapper |
| `facts/FactConsistencyChecker.js` | deprecated-wrapper |
| `facts/FactEmitter.js` | deprecated-wrapper |
| `facts/FactFormatter.js` | deprecated-wrapper |
| `social/SocialGraph.js` | deprecated-wrapper |
| `social/Relationship.js` | deprecated-wrapper |
| `spatial/SpatialEngine.js` | deprecated-wrapper |
| `spatial/SpatialHash.js` | deprecated-wrapper |
| `spatial/RegionGrid.js` | deprecated-wrapper |
| `spatial/WorldMap.js` | deprecated-wrapper |
| `domain/ForbiddenTerms.js` | deprecated-wrapper |
| `config/validate.js` | deprecated-wrapper |
| `store/SQLiteStore.js` | deprecated-wrapper |
| `store/SimulationStore.js` | deprecated-wrapper |
| `store/SnapshotStore.js` | deprecated-wrapper |
| `store/StoryStore.js` | deprecated-wrapper |
| `store/MetaStore.js` | deprecated-wrapper |
| `sdk/Character.js` | deprecated-wrapper |
| `sdk/Andy.js` | deprecated-wrapper |
| `sdk/LLMAdapter.js` | deprecated-wrapper |
| `sdk/NarrativeBuilder.js` | deprecated-wrapper |
| `sdk/ConversationLog.js` | deprecated-wrapper |
| `sdk/AutoTick.js` | deprecated-wrapper |
| `world/WorldStateAdapter.js` | deprecated-wrapper |
| `world/validator.js` | deprecated-wrapper |
| `world/compiler.js` | deprecated-wrapper |
| `world/migration.js` | deprecated-wrapper |
| `test.js` | removable |
| `test_pipeline.js` | removable |
| `test_soa.js` | removable |
| `test_soa_contagion.js` | removable |
| `test_soa_debug.js` | removable |
| `test_store.js` | removable |

---

## Import Details (existing blocked files)

### Files imported by src/

**`agent/Agent.js`** (public-approved-adapter):
- `src/agent/AgentRuntime.js`
- `src/runtime/AndyWorld.js`
- `src/runtime/RuntimeContext.js`

### Files imported by tests/

**`agent/Agent.js`** (public-approved-adapter):
- `tests/agent-runtime-containment.test.js`

**`sdk/index.js`** (public-facade):
- `tests/worldview-constraints.test.js`

---

## Rules

1. **public-facade** files cannot be removed without a major breaking release.
2. **compatibility-adapter** files cannot be removed while src/ or tests/ import them.
3. **deprecated-wrapper** files can be removed once all imports migrate to `src/`.
4. **removable** files can be deleted immediately.
5. **already-removed** files are already deleted and listed for completeness only.