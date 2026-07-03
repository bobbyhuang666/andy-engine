# Polish-First Roadmap

This document records the current planning decision after reviewing the external
Andy Engine v3 roadmap on 2026-07-03.

## Operating Decision

Andy Engine is not rushing toward a v2.x npm publish. The current goal is to
keep the package frozen and harden the engine until the core simulation feels
trustworthy enough to release.

This changes sequencing:

- release packaging remains useful as a gate, but not as the main objective;
- confirmed P0/P1 correctness issues stay first;
- architecture boundary leaks can be promoted when they reduce future bug
  recurrence;
- speculative feature work, ECS migration, native expansion, and distributed
  runtime work remain deferred unless explicitly approved.

## Roadmap Items To Adopt Now

| Item | Disposition | Reason |
|---|---|---|
| Perception side effects | Closed in R67 | `PerceptionRuntime` emotion/stress/appraisal-bias mutations now route through typed deltas / `EffectCommitter`; personality drift bookkeeping remains a documented internal exception. |
| `env._world` removal | Closed in R68 | `RuntimeContext` now exposes explicit `effectCommitter` / `effectWorld` services; `ScheduleHandler`, `PerceptionRuntime`, and `ActionSelectionRuntime` no longer read the world backdoor. |
| Public facade writeback | Closed in R69 | `Agent.recordExternalExperience()` and `Agent.interact()` now route memory/emotion/relationship consequences through typed deltas / `EffectCommitter`; `check:boundaries` scans `src/agent/facade` for direct memory writes. |
| SDK bridge/helper emotion | Closed in R70 | `AndyBridge` user-message emotion signals now prefer world `EffectCommitter`; narrative empathy restores native-like emotion mirrors before returning; `check:boundaries` scans canonical `src/sdk` for direct memory writes. |
| Internal stress writeback | Closed in R71 | Reflection and reappraisal absolute stress updates now route through runtime `effectCommitter` when available, with direct-call fallback for isolated unit callers. |
| Discrete internal emotion feedback | Closed in R72 | Intrinsic motivation, mind wandering, reflection recall, and emotion regulation strategy deltas now prefer runtime `effectCommitter`; `PhysiologyRuntime` remains a tracked continuous-dynamics exception rather than a discrete writeback bug. |
| Direct emotion write guard | Closed in R74 | `check:boundaries` now locks the classified direct emotion write exceptions by file and count, so new unreviewed direct writes fail the boundary gate. |
| Core RNG/time guard | Closed in R75 | `check:boundaries` now locks classified core runtime `Date.now()` / `Math.random()` exceptions by file and count, preventing silent drift in seeded simulation paths. |
| Core UTC accessor guard | Closed in R76 | `check:boundaries` now locks classified core UTC time accessor exceptions by file and count, preventing silent reintroduction of UTC/local drift. |
| Direct memory write guard | Closed in R77 | `check:boundaries` now locks source-level `addExperience()` exceptions to `PersonalMemory` and `EffectCommitter`, preventing direct memory writeback from returning outside typed deltas. |
| Direct position write guard | Closed in R78 | `check:boundaries` now locks source-level `agent.position =` exceptions to `EffectCommitter`, `AndyWorld` system fallbacks, and `AndyBridge` restore, preventing direct movement writeback from returning outside typed deltas. |
| Direct relationship interaction guard | Closed in R79 | `check:boundaries` now locks source-level `recordInteraction()` exceptions to `Relationship` and `EffectCommitter`, preventing relationship writeback from bypassing typed `RelationshipDelta` ownership. |
| Fact/knowledge write authority guard | Closed in R80 | `check:boundaries` now limits source-level fact and knowledge writes to canonical canon/knowledge owners, while keeping deprecated FactEmitter fallback isolated from runtime/agent/sdk callers. |
| Action provider read-only guard | Closed in R81 | `check:boundaries` now prevents candidate providers from writing state, accessing `EffectCommitter`, committing deltas, or constructing typed deltas directly. |
| Narrative/LLM world-write guard | Closed in R82 | `check:boundaries` now prevents narrative code from writing facts, knowledge, agent state, regions, or effect deltas, preserving grounding as expression rather than world authority. |
| Canonical SDK data mutation guard | Closed in R83 | `check:boundaries` now scans canonical SDK, public facades, and compatibility agent entry points for relationship/facts/knowledge write verbs, keeping public APIs out of direct data authority. |
| WorldFactStore zero-copy perf | Closed in R84 | FactEmitter hot paths used `_getByType()` which deep-copied every fact per tick for read-only index building. Added `_getByTypeReadOnly()` zero-copy accessor; public deep-copy accessors preserved. 8 regression tests; perf improved to 0.53x/0.38x baseline. |
| EventDispatcher simTime ordering | Closed in R84 | `setSimTime()` was called in Phase 5, but Phase 2 weather changes used previous tick's `_simTime`. Moved to Phase 1 after clock advance so all phases use current simulation time. |
| StateMachine deterministic fallback | Closed in R84 | `StateMachine` constructor and `AgentRuntime` state-change handler used `new Date()` wall-clock fallback when `env.simTime` was null. Replaced with `new Date(0)` epoch sentinel for seeded determinism in isolated/SDK agent usage. 4 regression tests. |
| AutoTick SDK determinism | Closed in R85 | `calculateTicksToAdvance()` used `Date.now()` for wall-clock elapsed time, breaking seeded determinism for `Character.chat()`/`chatStream()`. Added optional `now` parameter; Character passes `engine.world.time.getTime()` as deterministic virtual time. 4 regression tests. |
| Type declaration hardening | Closed in R85 | Expanded and corrected `.d.ts` files: CanonEventPipeline 3-param constructor, FactEmitter constructor, WorldFactStore 15+ methods, KnowledgeStore corrected API, CharacterConfig/AndyConfig enableFacts/seed/rng, Andy.load options, AndyBridge full class, StateDelta fields, EffectCommitter + delta classes. |
| AndyBridge partial restore warning | Closed in R85 | `_restoreAgents` JSDoc now lists all 12 non-restored fields. `init()` emits `console.warn` when restoring from snapshot, directing users to `AndyEngine.fromJSON()` for full state reconstruction. |
| Dead type declaration removal | Closed in R86 | `sdk/types.d.ts` was a dead/duplicate file shadowing `src/sdk/types.d.ts`. Deleted; package-boundary test updated to reference canonical `src/sdk/types.d.ts`. |
| Schedule deterministic fallback | Closed in R86 | `Schedule._maybeRegenerateVariations` used `new Date().toDateString()` when `simDate` was omitted. Replaced with `new Date(0).toDateString()` epoch sentinel (R84 pattern). Companion test updated. |
| Relationship epoch sentinels | Closed in R86 | `Relationship.js` had 4 `new Date()` wall-clock fallbacks (constructor, recordInteraction). Replaced with `new Date(0)` epoch sentinel. All relationship tests pass. |
| BehaviorField NaN guard | Closed in R87 | `_getTimeTarget(hour)` had no finite guard on `hour` parameter; NaN propagated through gradient into velocity/B, causing hard reset to [0.5,0.5,0.5,0.5]. Added `Number.isFinite(hour)` input guard returning `TIME_TARGETS.sleep`. |
| SocialGraph threshold consistency | Closed in R87 | `isTwoHopsAway` used hardcoded 0.2 and `getSocialDistance` used hardcoded 0.15; both replaced with `ANDY_DEFAULTS.relationship.threshold.acquaintance` matching `getCommonFriends` (R41 L2 pattern). |
| Epoch sentinel expansion | Closed in R87 | Replaced `new Date()` wall-clock fallbacks with `new Date(0)` epoch sentinels in AndyWorld (WorldClock construction), Andy (SDK entry), Character (standalone entry), compiler (world compilation), and EventDispatcher (`_simTime` initialization). Follows R84/R86 pattern. |
| AutoTick falsy check fix | Closed in R87 | `AutoTick.js` used `!this._lastMessageTime` which treated epoch-0 (0ms) as falsy, breaking tick calculation for sim-time paths. Fixed to `=== null` explicit check; serialization round-trip fixed with `??` nullish coalescing. |
| FactEmitter data integrity | Closed in R88 | `emitStaticFacts`, `emitAgentStateFacts`, and `emitRelationshipFacts` discarded `addFact()` return values, pushing raw pre-validation fact objects. Fixed to use canonical deep-copied return values with proper IDs. |
| Canon pipeline error containment | Closed in R88 | `AndyWorld.step()` Phase 8 had no try/catch around event consequence processing. Wrapped in try/catch following Phase 4 agent loop pattern; one bad event no longer crashes the entire world step. |
| hoursElapsed NaN guard | Closed in R89 | `AgentRuntime` computed `hoursElapsed = minutesElapsed / 60` without finite guard; NaN propagated through needs, emotions, social graph, behavior field. Added `Number.isFinite` guard defaulting to 0. |
| Stress homeostatic drift | Closed in R89 | Stress was hard-reset to 2.0 baseline every tick, preventing natural stress reduction from positive events. Replaced with gradual drift (10%/hour toward baseline) in EmotionVector._timeDecay(). |
| Emotion config injection | Closed in R90 | EmotionVector used module-level ANDY_DEFAULTS.emotion with no user config path. Added emotionConfig parameter, merged with defaults, threaded through AgentSubsystemFactory. Follows NeedsSystem pattern. |
| IntrinsicMotivation config injection | Closed in R90 | IntrinsicMotivation used module-level ANDY_DEFAULTS with only domain-level config. Added three-way merge (user > domain > defaults) via config parameter, threaded through AgentSubsystemFactory. |
| SQLiteStore prune guard | Closed in R91 | `prune(keepCount)` lacked guard for keepCount <= 0; OFFSET -1 was clamped to 0 by SQLite, keeping 1 snapshot instead of 0. Added early return guard matching MemoryStore.prune() pattern. |
| Encounter null-safe region | Closed in R91 | `AndyWorld._evaluateSpatialInteractions` used 'unknown' fallback for null regionA, creating phantom region references in events. Changed to null-safe fallback; generateEncounterEvent handles null region gracefully. |
| Contagion config injection | Closed in R92 | `ANDY_DEFAULTS.contagion` was dead config (unreferenced). Added `contagionConfig` parameter to EmotionVector constructor, merged with defaults, threaded through AgentSubsystemFactory. `_socialContagion()` now reads `negativityBias` and `baseContagionRate` from config. |
| PersonalMemory config injection | Closed in R92 | `PersonalMemory` used module-level `ANDY_DEFAULTS.memory` with no constructor config parameter. Added `memoryConfig` parameter, merged with defaults, replaced all `cfg.X` with `this._cfg.X`, threaded through AgentSubsystemFactory. |
| BehaviorField config injection | Closed in R93 | `AgentSubsystemFactory` passed `{}` instead of `config.behavior || {}` to BehaviorField constructor, silently discarding user config. Fixed to pass `config.behavior || {}` in both create and restore paths. |
| WorldClock epoch sentinel default | Closed in R93 | `WorldClock` constructor defaulted to `new Date()` (wall-clock). Changed to `new Date(0)` (epoch sentinel) following R86-R92 pattern. All callers already provided explicit startTime. |
| EventDispatcher dead fallback removal | Closed in R93 | `EventDispatcher` had unreachable `|| new Date()` fallback on `_simTime` branch. Removed dead code; `_simTime` is always initialized to `new Date(0)`. |
| Dead config: explorationStateBoost | Closed in R94 | `ANDY_DEFAULTS.intrinsicMotivation.explorationStateBoost` had zero references in `src/`. Removed dead key. |
| Dead config: SpatialEngine baseProb/distanceDecay | Closed in R94 | `SpatialEngine` stored `baseProb` and `distanceDecay` from config but never used them — `computeInteractions` shadows `baseProb` with local tier-based variable. Removed dead config chain from defaults, SpatialEngine, and AndyWorld. |
| NaN guard: EmotionRegulation tryRegulate | Closed in R94 | `tryRegulate` could propagate NaN from corrupted emotion state through `getValence`/`getArousal` into `_regulationResource`. Added finite guard returning null early. |
| NaN guard: EmotionRegulation attention deployment | Closed in R94 | `_execAttentionDeployment` iterated `recallEmotionDelta` without finite guard on values. Added `Number.isFinite(value)` check to skip NaN entries. |
| Boundary: AndyBridge restore clamp | Closed in R94 | `_restoreAgents` raw-assigned emotion.current/needs.needs without calling `_clamp()`. Added `_clamp()` calls after restore loops; added `_clamp()` to NeedsSystem. |
| Relationship config injection | Closed in R95 + repaired post-review | R95 only partially closed the config path. Post-review repair added deep relationship config merge, preserved nested threshold defaults for partial overrides, passed graph config into new/restored Relationship edges, moved SocialGraph query/projection paths off `ANDY_DEFAULTS`, and added targeted regression tests. |
| Emotion/Memory nested config injection | Closed in R97 | Shallow merges in `EmotionVector` and `PersonalMemory` dropped nested defaults for partial `circadian`, `spreadingActivation`, and `recallEmotionDelta` overrides, producing NaN in circadian modulation, spreading activation, and recall emotion deltas. Added nested-safe merges, validation, fromJSON config coverage, and regression tests. |
| BehaviorField nested weights config | Closed in R98 | `BehaviorField` shallow-merged config and dropped default weights for partial `behavior.weights` overrides, producing NaN gradients when emotion/intrinsic/habit paths used undefined weights. Added nested-safe merge, fromJSON config propagation, validation, and regression tests. |
| IntrinsicMotivation domain map config | Closed in R99 | User `intrinsicMotivation.domainRegionMap` partial overrides replaced preset domain maps, silently dropping domain-driven exploration mappings. Added domain/user map merge, fromJSON config propagation, validation, and regression tests. |
| AndyWorld Math.random auto-seed removal | Closed in R95 | AndyWorld used `Math.random()` to generate auto-seed when no RNG provided. Replaced with deterministic `new RNG(0)` default. Updated boundary allowlist. |
| Dead config: SpatialEngine baseProb/distanceDecay | Closed in R95 | `SpatialEngine` stored `baseProb` and `distanceDecay` from config but never used them. Removed dead config chain from defaults, SpatialEngine, and AndyWorld. |
| IntrinsicMotivation needs threshold config | Closed in R100 | `_applyNeedGate` read `ANDY_DEFAULTS.needs.threshold` directly, bypassing instance config. Added `needsThresholdConfig` parameter to `tick()`, threaded through `AgentRuntime`. |
| MindWander NaN propagation guard | Closed in R100 | `mindWander()` emotion-delta loops lacked finite guards. Added `addIfFinite()` helper with `Number.isFinite()` check to all 5 accumulation loops. |
| NeedsSystem decay rate NaN guard | Closed in R102 | `tick()` and `tickWithBehavior()` guarded `current` but not `rate` against NaN. Added `if (!Number.isFinite(rate)) continue` in both methods. |
| NeedsSystem behavior recovery NaN guard | Closed in R102 | `getRecoveryRatesForBehavior()` computed factor from behaviorVector without finite guard. Added `Number.isFinite(distance)` check; NaN distance → zero recovery. |
| Contagion config validation | Closed in R104 | `negativityBias` and `baseContagionRate` added to ANDY_DEFAULTS.contagion. Added `config.contagion` validator with range checks for all 5 fields. |
| KnowledgeStore legacy sources normalization | Closed in R104 | `fromJSON()` data.sources path bypassed `_normalizeEvidence()` for Evidence objects. Fixed to normalize consistently with data.evidence path. |
| Relationship strengthDecrement validation | Closed in R105 | Added `strengthDecrement` range check [0,0.5] to relationship validator in validate.js. |
| Memory 6 missing field validations | Closed in R105 | Added validators for maxPresentationsPerMemory, importanceBoostOnAccess, consolidationThreshold, pruneThreshold, moodCongruenceWeight, moodCongruenceScale. |
| Serialization _restoreConfig key filter | Closed in R105 | `deserialize()` now filters non-config keys (seed, domain, rng, id, name) from caller config before merging into _restoreConfig. |
| ReflectionRuntime NaN propagation guard | Closed in R108 | `assessStateConsequences()` lacked finite guards on weightedValence, neuroticism, and expectedValue. Added guards; NaN inputs produce safe defaults instead of cascading NaN through state decision logic. |
| _baselineDrift NaN guard + baseline _clamp repair | Closed in R110 | `_baselineDrift()` wrote NaN to `baseline[dim]` with no repair path since `_clamp()` only covered `current`/`stress`. Added `Number.isFinite(rate)` guard + extended `_clamp()` to repair NaN in baseline. |
| _circadianModulation config value guard | Closed in R110 | `_circadianModulation()` used 4 config values without finite checks. Added `Number.isFinite()` guard; NaN config → early return (defense-in-depth beyond validate.js). |
| getInteractionWillingness NaN guard | Closed in R110 | `Relationship.getInteractionWillingness()` used unvalidated `strength`; NaN propagated through social encounter selection. Added `Number.isFinite(this.strength)` guard → returns 0. |
| PressureContext.getTotalPressure finite guard | Closed in R110 | Sum of 5 pressure totals could overflow to Infinity, propagating as valid truthy value. Added `Number.isFinite(raw) ? raw : 0` guard. |
| _pinkNoiseDrift amplitude guard | Closed in R110 | `_pinkNoiseDrift()` used unvalidated `noiseAmplitude` multiplier; NaN amplitude contaminated all emotion dimensions. Added `Number.isFinite(amp)` guard → early return. |
| IntrinsicMotivation curiosityDecayRate guard | Closed in R111 | `_decayCuriosity()` used `cfg.curiosityDecayRate` unvalidated; NaN rate propagated to curiosity via `effectiveRate * hoursElapsed`. Added `Number.isFinite(decayRate)` guard → early return. |
| Personality ocean NaN override guard | Closed in R111 | `Personality` constructor copied `config.ocean[dim]` without finite check; NaN overrides bypassed MBTI defaults. Added `Number.isFinite()` guard in constructor + validate.js range check now rejects NaN (typeof NaN === 'number' is true, NaN < 0 and NaN > 1 are both false). |
| EffectCommitter _applyNeedDelta null guard | Closed in R113 | `_applyNeedDelta()` called `Object.entries(delta.changes)` without null guard. Added `if (!delta.changes || typeof delta.changes !== 'object') return;`. |
| PersonalMemory addAppraisalBias NaN guard | Closed in R113 | `addAppraisalBias()` stored `valenceShift`/`decay` without finite check; NaN propagated through bias accumulation and decay. Added `Number.isFinite()` guards with safe defaults. |
| FactConsistencyChecker allowedFacts null guard | Closed in R113 | 7 loops iterating `grounding.allowedFacts` lacked null-entry guards. Added `if (!fact) continue;` to all iterations. |
| SimulationStore story importance sort NaN guard | Closed in R113 | `?? 0` doesn't catch NaN importance values, causing unpredictable sort ordering. Changed to `Number.isFinite()` guards. |
| AffectCompiler clamp() NaN guard | Closed in R114 | `clamp()` used `Math.max(0, Math.min(1, value))` without NaN guard; NaN propagated through all 6 AffectFrame fields into narrative LLM prompts. Added `Number.isFinite()` guard → returns 0. |
| StoryGenerator emotion delta NaN guard | Closed in R114 | `generateFromSignal()` accumulated emotion deltas without finite checks; NaN deltas produced NaN posSum/negSum, silently corrupting story importance. Added `Number.isFinite(delta) continue` guard. |
| Serialization _restoreConfig deep copy | Closed in R114 | Shallow spread shared nested config references between restored engine and caller's original config. Added `JSON.parse(JSON.stringify())` deep-copy. |
| NeedsSystem config merge NaN guard | Closed in R115 | `_mergeNeedsConfig()` spread user config without finite checks; NaN values propagated to decay/recovery calculations. Added per-value `Number.isFinite()` validation with base fallback. |
| NeedsSystem getDriveGradient urgency guard | Closed in R115 | `getDriveGradient()` computed `urgency = threshold - value` without finite guard; NaN urgency corrupted behavior selection. Added `Number.isFinite(urgency) continue` guard. |
| SpatialEngine _moveAgents NaN coord guard | Closed in R116 | `_moveAgents()` read `cx`/`cy` from `_coords` without finite check; NaN coordinates produced NaN dx/dy/dist, permanently corrupting grid positions. Added `Number.isFinite()` guard → skip movement for corrupted agent. |
| SpatialEngine _computeEncounters NaN distance guard | Closed in R116 | `_computeEncounters()` computed `distSq` from unvalidated coordinates; NaN distSq produced NaN encounter distance. Added `Number.isFinite(distSq) continue` guard. |
| SpatialEngine rel.strength NaN guard | Closed in R116 | `_computeEncounters()` used `rel.strength` without finite check; NaN strength produced NaN encounter probability. Added `Number.isFinite(rel.strength) ? rel.strength : 0` guard. |
| AndyWorld encounter probability NaN guard | Closed in R116 | NaN encounter probability made `rng.next() > NaN` always false, bypassing probabilistic filter. All encounters fired deterministically. Added `Number.isFinite(encounter.probability) continue` guard. |
| EventEffectPipeline tendency delta NaN guard | Closed in R116 | `_computeTendencyDelta()` copied raw `rule.delta[i]` without validation; NaN from domain config corrupted FutureTendency arrays. Added per-element `Number.isFinite()` guard. |
| FutureTendencyDelta importance coercion fix | Closed in R116 | `|| 0.3` coerced legitimate `importance: 0` to `0.3`, skewing tendency updates. Changed to proper finite check matching MemoryDelta pattern. |
| _socialContagion susceptibility NaN guard | Closed in R117 | `_socialContagion()` read `personality.behavior.susceptibility` without finite guard; NaN susceptibility produced NaN effectiveWeight, corrupting all emotion dimensions for one tick. Added `Number.isFinite()` guard → early return. |
| AgentSerializer emotion NaN sanitization | Closed in R117 | `toJSON()` serialized `agent.emotion.toJSON()` without NaN sanitization; temporarily corrupted emotion values could be persisted to save data. Added per-dimension `Number.isFinite()` sanitization. |
| AgentSerializer socialEnergy/health NaN guards | Closed in R117 | `socialEnergy` and `health` serialized without finite guards; corrupted scalar values persisted to save data. Added `Number.isFinite()` guards with safe defaults. |
| RegionGrid setAdjacent distance guard | Closed in R117 | `setAdjacent()` stored `distance` without finite validation; NaN distance corrupted BFS adjacency graph. Added `Number.isFinite(distance)` guard. |
| RegionGrid _getAdjacentRegions maxHops guard | Closed in R117 | `maxHops` unvalidated; NaN caused `currentDist > NaN` (always false), potentially infinite BFS. Added `Number.isFinite(maxHops) return []` guard. |
| PhysiologyRuntime applyNeedsToEmotion NaN guard | Closed in R120 | `applyNeedsToEmotion()` read all 5 need values without finite checks; NaN needs produced NaN deficit computations → NaN emotion deltas → cascading emotion corruption. Added `safeNeeds` with per-value `Number.isFinite()` guards defaulting to 0.5. |
| PhysiologyRuntime updateSocialEnergy behaviorParams guard | Closed in R120 | `updateSocialEnergy()` validated `agent.socialEnergy` but not `behaviorParams.socialEnergyDrain/recharge`; NaN drain produced NaN socialEnergy via `Math.max(0, NaN)`. Added finite guards + post-arithmetic re-validation. |
| PhysiologyRuntime updateHealth neuroticism guard | Closed in R120 | `updateHealth()` computed `recoveryMod = 1.0 - (neuroticism * 0.3)` without finite guard; NaN neuroticism → NaN recoveryMod → NaN healthDelta. Added `Number.isFinite()` guard defaulting to 0.5. |
| Appraisal _evalPleasantness NaN guard | Closed in R120 | `_evalPleasantness()` computed `rawPleasantness`, `moodBias`, `agreeablenessBias`, `traumaBias` without finite checks; corrupted event deltas or personality values produced NaN appraisal → stress → emotion cascade. Added `Number.isFinite()` guards on all 4 values. |
| EmotionRegulation neuroticism NaN guard | Closed in R121 | `tryRegulate()` computed `threshold = 0.15 - neuroticism * 0.05` without finite guard; NaN neuroticism → NaN threshold → `triggerLevel < NaN` always false → emotion regulation silently disabled. Added `Number.isFinite()` guard defaulting to 0.5. |
| Appraisal personality.ocean NaN guards | Closed in R122 | `Appraisal._evalSuddenness/_evalGoalRelevance/_evalGoalConduciveness/_evalCopingPotential/_evalNormConformity` all read `personality.ocean.*` values without finite checks; NaN propagated through appraisal → stress → emotion cascade. Added `Number.isFinite()` guards on 8 unguarded reads. |
| ScheduleHandler sickProb/skipProb NaN guard | Closed in R122 | `checkSchedule()` computed `sickProb` and `skipProb` using `personality.ocean.conscientiousness` without finite guard; NaN conscientiousness → NaN probabilities → `rand() < NaN` always false, silently disabling sick-leave and distress-skip. Added `Number.isFinite()` guards. |
| Appraisal NaN guard completion | Closed in R123 | Post-R122 review found a `const` reassignment regression in `_evalPleasantness()` and remaining NaN ingress via event deltas, emotion valence/stress, relationship strength, socialEnergy, needs, modifiers, and importance math. Added finite guards and corrupted-input regression tests. |
| PhysiologyRuntime guard completion | Closed in R123 | R120 PhysiologyRuntime code was still uncommitted while docs marked it fixed, and the patch missed missing `behaviorParams` plus several arithmetic-NaN exits. Completed safe elapsed/needs/stress/behavior/env/healthDelta/socialEnergy guards and added direct unit tests. |
| EventDispatcher valence/socialEnergy/interactionProb NaN guards | Closed in R124 | `_evaluateEncounter()` read emotion valence and socialEnergy without finite guards; NaN values bypassed the probabilistic filter (`rand() > NaN` always false), making ALL encounters fire deterministically. Added `Number.isFinite()` guards + interactionProb clamp validation. |
| InteractionFacade personalityCompatibility NaN guard | Closed in R124 | `personalityCompatibility()` read all 5 `personality.ocean.*` values without finite guards; NaN ocean values corrupted similarity computation → NaN interaction valence. Added `Number.isFinite()` guards on both agents' ocean values. |
| EventEffectPipeline _calculateImportance NaN guard | Closed in R124 | `_calculateImportance()` returned `Math.min(1.0, importance)` without finite guard; corrupted fact data could produce NaN importance → NaN FutureTendencyDelta. Added `Number.isFinite()` check with 0.3 default. |
| WorldPressure total NaN guard | Closed in R124 | `WorldPressure.compute()` summed 4 pressure components without finite guard; NaN component → NaN total → downstream consumers received NaN pressure. Added `Number.isFinite()` check on raw total. |
| R125 full codebase re-scan | Clean | Comprehensive re-scan of all 50+ source files confirmed all R110-R124 fixes cover all critical paths. Two LOW-severity config-injection-only gaps identified (_coActivationSpread weight, _enforceBoundary reflect) — no code changes required. |
| Testing red lines | Adopt now | Full gates, replay, perf, package smoke, and boundary checks remain mandatory after hardening work. |
| Small pure runtime extraction | Adopt selectively | `ContagionGatherer` and similar pure helpers can be extracted after P0/P1 debt drops, but only as behavior-preserving moves. |

## Roadmap Items To Defer

| Item | Disposition | Reason |
|---|---|---|
| AndyWorld line-count target | Defer | A 973-line stable coordinator is not itself a bug. Do not chase a 300-line target before correctness debt is lower. |
| Full AgentRuntime handlerization | Defer | Useful cleanup, but not urgent while direct side-effect boundaries remain open. |
| Contagion algorithm rewrite | Defer until perf target expands | Current gates pass. Rewrite only when 300+ agent scenarios become an explicit goal. |
| Native contagion / BehaviorField | Defer | Cross-language maintenance risk is too high before JS semantics are settled. |
| ECS / ComponentStore | Defer | Dual-read state synchronization is high risk and should wait until the engine has a stable hardening baseline. |
| Grammar-constrained narrative | Defer to RFC | Depends on target LLM backends and D5 strategy. |
| Distributed world sharding | Defer | Not relevant until scale goals exceed what local runtime can handle. |

## Near-Term Sequence

1. Consider behavior-preserving runtime extractions such as `ContagionGatherer`
   only if the audit stays clean.
2. Re-audit another high-recurrence bug family with no-quota external models
   before starting any large refactor.

## Guardrail

Do not start ECS, native expansion, or large AndyWorld decomposition while known
P0/P1 candidates remain in the active bug ledger.
