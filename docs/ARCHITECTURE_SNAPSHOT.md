# Andy Engine Architecture Snapshot

> Date: 2026-06-19
> Branch: main
> Baseline: HEAD f056e89 (v0.2.1) + current cleanup working tree

---

## 1. Stable Components

Modules that are production-ready, tested, and committed.

### 1.1 Core Runtime

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `agent/Agent.js` | 2057 | Main agent loop `tick()`, coordinates all 16 subsystem steps |
| `agent/BehaviorField.js` | 662 | 4D continuous behavior field, underdamped Langevin dynamics |
| `agent/BehaviorLabeler.js` | 362 | Semantic label projection (50 state centroids → Chinese labels) |
| `agent/StateMachine.js` | 68 | State metadata (42 states, read-only) + lightweight history tracker |
| `agent/EmotionVector.js` | 746 | 30-dim emotion system (Cowen & Keltner 2017), 10-step evolution pipeline |
| `agent/PersonalMemory.js` | 1038 | ACT-R memory model, 5-path retrieval, mood-congruent recall |
| `agent/Personality.js` | 342 | MBTI → OCEAN → behavior parameter mapping |
| `agent/Appraisal.js` | 509 | Cognitive appraisal (Scherer CPM), 8 evaluation dimensions |
| `agent/EmotionRegulation.js` | 432 | Gross emotion regulation (3 strategies: reappraisal, distraction, suppression) |
| `agent/IntrinsicMotivation.js` | 796 | Curiosity drive + self-generated goals (SDT + Oudeyer learning progress) |
| `agent/NeedsSystem.js` | 341 | Maslow hierarchy (5 drives), continuous gradient for BehaviorField |
| `agent/Schedule.js` | 256 | Schedule system with Gaussian noise perturbation |
| `agent/ProceduralMemory.js` | 277 | Habit formation/breaking via behavior sequence pattern detection |

**Test coverage**: `tests/behavior-field.test.js` (61 tests), `tests/unit/emotion.test.js` (17), `tests/unit/personality.test.js` (14), `tests/unit/memory.test.js` (14), `tests/unit/social.test.js` (11), `tests/unit/statemachine.test.js` (5), `tests/unit/action-candidate.test.js` (13), `tests/unit/utility-scorer.test.js` (11), `tests/unit/utility-selector.test.js` (8), `tests/unit/goalsystem.test.js` (36), `tests/unit/worldobject.test.js` (44), `tests/unit/candidate-providers.test.js` (29), `tests/unit/shadow-action-selection.test.js` (16), `tests/unit/action-event-emission.test.js` (5), `tests/unit/event-effect-pipeline.test.js` (14), `tests/unit/effect-pipeline-dry-run.test.js` (12), `tests/unit/world-pressure.test.js` (16)

### 1.2 Core Infrastructure

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `core/Simulator.js` | 460 | Multi-agent scheduler (5-step pipeline: time → environment → think → interact → dispatch) |
| `core/World.js` | 344 | World state (time, environment, agent collection, SocialGraph, EventLog) |
| `core/EventDispatcher.js` | 543 | Event system (5 sources: environment, state, schedule, random, causal) |
| `core/WorldviewConstraints.js` | 250 | Legacy compatibility wrapper for worldview constraints and legacy sanitize helpers |
| `core/RNG.js` | 130 | Seedable PRNG (Mulberry32), deterministic, cloneable |
| `core/EmotionEffectClassifier.js` | 245 | Classifies events into emotion effect categories |
| `core/EmotionSignalBuffer.js` | 134 | Buffers emotion signals for batch processing |
| `core/StoryGenerator.js` | 303 | Narrative story generation from agent states |
| `core/AndyBridge.js` | 243 | External LLM bridge layer |
| `core/AndyTownAdapter.js` | 143 | AndyTown compatibility adapter |

**Test coverage**: `tests/integration/engine.test.js` (27 tests), `tests/seedable-simulation.test.js` (10), `tests/rng-injection.test.js` (27), `tests/worldview-constraints.test.js` (6), `tests/contagion-cache.test.js` (5)

### 1.3 Domain System

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `domain/DomainRegistry.js` | 284 | Domain resolution, validation, safe getters/fallbacks |
| `domain/validateDomain.js` | 306 | Domain config contract validation |
| `domain/index.js` | 14 | Public exports |
| `presets/campus/` | — | Campus domain preset |
| `presets/tavern/` | — | Tavern domain preset |

**Test coverage**: `tests/domain.test.js` (13), `tests/domain-contract.test.js` (34), `tests/domain-deep.test.js` (18), `tests/compatibility.test.js` (15) — 80 domain tests total

### 1.4 Social Graph

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `social/SocialGraph.js` | 409 | Global social graph, Dunbar layers, triadic closure, encounter evaluation |
| `social/Relationship.js` | 244 | Logarithmic growth relationship model (Sutcliffe 2012), 4 tiers: stranger/acquaintance/friend/close |

**Test coverage**: `tests/unit/social.test.js` (11 tests)

### 1.5 Spatial System

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `spatial/SpatialEngine.js` | 523 | Continuous coordinate space, O(N·k) neighbor query, interaction probability |
| `spatial/SpatialHash.js` | 200 | Spatial hash grid for O(1) neighbor lookup |
| `spatial/RegionGrid.js` | 211 | Discrete region grid (backward compat) |
| `spatial/WorldMap.js` | 186 | World map with region adjacency |

**Test coverage**: `tests/spatial.test.js` (18 tests)

### 1.6 Persistence / Store

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `store/SQLiteStore.js` | 400 | SQLite-backed persistent store |
| `store/SimulationStore.js` | 266 | Simulation state persistence |
| `store/SnapshotStore.js` | 87 | Snapshot management |
| `store/StoryStore.js` | 90 | Story/narrative persistence |
| `store/MetaStore.js` | 59 | Metadata storage |
| `store/index.js` | 51 | Public exports + `createMemoryStore()` |

### 1.7 SDK

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `sdk/Andy.js` | 206 | Multi-character engine wrapper (Andy Town / community scenarios) |
| `sdk/Character.js` | 402 | High-level character API (chat, getContext, save/load) |
| `sdk/LLMAdapter.js` | 298 | LLM adapter (OpenAI, Anthropic, Ollama, custom function, streaming) |
| `sdk/NarrativeBuilder.js` | 282 | System prompt builder (show-don't-tell, layered personality, grounding section) |
| `sdk/ConversationLog.js` | 181 | Conversation history management |
| `sdk/AutoTick.js` | 112 | Automatic tick scheduling |
| `sdk/types.d.ts` | 325 | TypeScript type definitions |

**Test coverage**: `tests/sdk.test.js` (54 tests), `tests/sdk-custom-domain.test.js` (4)

### 1.8 Persistent World Tooling

| File | Lines | Key Responsibility |
|------|------:|-------------------|
| `world/WorldStateAdapter.js` | 108 | Stable World Envelope adapter (toWorldState / fromWorldState) |
| `world/validator.js` | 262 | World Spec + World State validation (schema v0.1.0) |
| `world/compiler.js` | 112 | World Spec → initial World State compiler |
| `world/migration.js` | 141 | Forward-only World State version migration |

**Test coverage**: `tests/world-state-adapter.test.js` (16), `tests/world-tooling.test.js` (28), `tests/schema-validator.test.js` (45)

---

## 2. Experimental / Opt-In Components

Modules that exist in the current repository behind feature flags or opt-in config gates. The listed runtime modules are tracked; current cleanup documentation may still be uncommitted in the working tree.

### 2.1 Facts System

| File | Lines | Key Responsibility | Gate |
|------|------:|-------------------|------|
| `facts/WorldFactStore.js` | 555 | Unified fact store (CRUD by type, perspective, time) | `enableFacts: true` |
| `facts/KnowledgeStore.js` | 135 | Per-agent knowledge tracking (what each agent knows/inferred/forbidden) | `enableFacts: true` |
| `facts/CanonEventPipeline.js` | 142 | Event → EventFact → KnowledgeStore propagation (world canon) | `enableFacts: true` |
| `facts/FactEmitter.js` | 386 | Fact generation (static_env, agent_state, observation, relationship, event) | `enableFacts: true` |
| `facts/FactProvider.js` | 243 | Perspective-filtered grounding package (allowed/inferred/forbidden facts) | `enableFacts: true` |
| `facts/FactConsistencyChecker.js` | 467 | LLM output consistency check (regex-based, 5 violation types) | `enableFacts: true` |
| `facts/FactFormatter.js` | 104 | Fact → natural language / JSON for LLM prompt injection | `enableFacts: true` |
| `facts/FactSchema.js` | 453 | Fact type enums (9 types), source/scope enums, validation, factory functions | `enableFacts: true` |
| `facts/index.js` | 63 | Public exports | `enableFacts: true` |

**Gate**: `enableFacts` flag (default `false`) in `AndyEngine` constructor. Set in `index.js:97`.

**Test coverage**: `tests/facts/` (17 test files), `tests/integration/fact-system-slice.test.js` (6 tests covering knowledge propagation, location meaning, future tendency, consistency checking)

### 2.2 Action Selection

| File | Lines | Key Responsibility | Gate |
|------|------:|-------------------|------|
| `agent/action/ActionCandidate.js` | 71 | Pure JSON candidate model (9 action types, 10 sources, deterministic ID) | `actionSelection.enabled: true` |
| `agent/action/UtilityScorer.js` | 471 | Read-only candidate scorer (13 dimensions: need, emotion, behavior, memory, relationship, habit, goal, location, world, time, constraint, tendency, total) | `actionSelection.enabled: true` |
| `agent/action/UtilitySelector.js` | 160 | Temperature-based weighted selection with seeded RNG, produces ReasonTrace | `actionSelection.enabled: true` |
| `agent/action/GoalSystem.js` | 231 | Serializable goal system (5 sources, 4 statuses, pure pressure source) | `actionSelection.enabled: true` |
| `agent/action/WorldObject.js` | 314 | Abstract entity data model (5 lifecycle states, affordance system) | `actionSelection.enabled: true` |
| `agent/action/providers/CandidateProviderManager.js` | 59 | Aggregates providers, deterministic ordering, dedup by candidate.id | `actionSelection.enabled: true` |
| `agent/action/providers/ContinueCandidateProvider.js` | 23 | Continue current action candidate | `actionSelection.enabled: true` |
| `agent/action/providers/NeedCandidateProvider.js` | 41 | Need-driven candidates | `actionSelection.enabled: true` |
| `agent/action/providers/ScheduleCandidateProvider.js` | 33 | Schedule-driven candidates | `actionSelection.enabled: true` |
| `agent/action/providers/BehaviorFieldCandidateProvider.js` | 41 | BehaviorField-driven candidates | `actionSelection.enabled: true` |
| `agent/action/providers/ExploreCandidateProvider.js` | 24 | Exploration candidates | `actionSelection.enabled: true` |
| `agent/action/providers/SocializeCandidateProvider.js` | 27 | Social interaction candidates | `actionSelection.enabled: true` |
| `agent/action/providers/CandidateProvider.js` | 23 | Base provider interface | `actionSelection.enabled: true` |

**Gate**: `actionSelection.enabled` flag (default `false`) in `AndyEngine` constructor. Modes: `shadow` (trace only), `event` (emit action_selected event), `dryRunEffects` (compute stateDeltas without mutation), `active` (apply allowed deltas). Integrated into `Agent.tick()` via `_runShadowActionSelection()` at step 9.5.

**Test coverage**: `tests/unit/action-candidate.test.js` (13), `tests/unit/utility-scorer.test.js` (11), `tests/unit/utility-selector.test.js` (8), `tests/unit/goalsystem.test.js` (36), `tests/unit/worldobject.test.js` (44), `tests/unit/candidate-providers.test.js` (29), `tests/unit/shadow-action-selection.test.js` (16), `tests/unit/action-event-emission.test.js` (5)

### 2.3 Event Effects

| File | Lines | Key Responsibility | Gate |
|------|------:|-------------------|------|
| `effects/EventEffectPipeline.js` | 276 | Pure module: event → memory/location/tendency deltas (agent consequences) | `actionSelection.mode: 'dryRunEffects' \| 'active'` |
| `core/EventEffectPipeline.js` | — | Compatibility wrapper (delegates to `effects/EventEffectPipeline.js`) | — |
| `core/WorldPressure.js` | 111 | Read-only world pressure computation (time, location, crowding, event) | `actionSelection.enabled: true` |

**Gate**: EventEffectPipeline is wired into `Agent._runShadowActionSelection()` — active when mode is `dryRunEffects` or `active`. WorldPressure is a pure read-only module available to action selection context but not directly imported by Agent.js.

**Test coverage**: `tests/unit/event-effect-pipeline.test.js` (14), `tests/unit/effect-pipeline-dry-run.test.js` (12), `tests/unit/world-pressure.test.js` (16)

### 2.4 Tendency System

| File | Lines | Key Responsibility | Gate |
|------|------:|-------------------|------|
| `agent/FutureTendencyTracker.js` | 105 | Region-based 4D tendency vectors, decay rate 0.95/tick | `enableFacts: true` |
| `agent/LocationMeaningInfluence.js` | 57 | WorldFactStore location meaning → BehaviorField gradient contribution | `enableFacts: true` |

**Gate**: `enableFacts: true`. Connected to UtilityScorer but not directly to BehaviorField gradient.

**Test coverage**: `tests/unit/future-tendency.test.js` (24), `tests/unit/location-meaning-influence.test.js` (10)

### 2.5 Grounded Narrative

| File | Lines | Key Responsibility | Gate |
|------|------:|-------------------|------|
| `sdk/NarrativeBuilder.js` (grounding section) | ~35 | `_buildGroundingSection()`: injects allowedFacts, inferredFacts, locationMeaning, behaviorTendency into system prompt | `enableFacts: true` + groundingPackage provided |

**Gate**: Only active when `groundingPackage` is passed to `buildSystemPrompt()`.

**Test coverage**: `tests/facts/grounded-narrative.test.js` (23)

---

## 3. RFC / Prototype

Documents that define future directions but are NOT implemented.

| Document | Lines | Phase | Status | Summary |
|----------|------:|-------|--------|---------|
| `docs/MEMORY_BEHAVIOR_GRADIENT_RFC.md` | 463 | Phase 22 | RFC only | How memory acts as a physical field gradient to drive behavior (6th gradient source for BehaviorField) |
| `docs/GOAL_SYSTEM_BOUNDARY_RFC.md` | 587 | Phase 23 | RFC only | Goal system boundary in Persistent World (multi-source goals, serialization, pressure source contract) |
| `docs/WORLD_OBJECT_API_RFC.md` | 681 | Phase 24 | RFC only | Physical entity (WorldObject) system — agent↔object interaction, affordance model |
| `docs/STORY_ARC_FEEDBACK_RFC.md` | 281 | — | Paused/Draft | StoryArc feedback mechanism — macro narrative context across timesteps, superseded by `STORYARC_FEEDBACK_GATE.md` |
| `docs/RESEARCH_DIRECTION_VNEXT.md` | 176 | — | Research | Next architecture evolution hypotheses (beyond v0.2.0) |
| `docs/STORYARC_FEEDBACK_GATE.md` | — | — | Gate doc | Execution control gate for StoryArc feedback implementation |

---

## 4. Architecture Boundaries

### 4.1 CanonEventPipeline: event → fact → knowledge (world canon)

- **Location**: `facts/CanonEventPipeline.js` (142 lines)
- **Input**: Engine events from EventDispatcher
- **Output**: EventFacts written to WorldFactStore, Knowledge propagated via KnowledgeStore
- **Boundary**: Responsible for *what happened* (world truth). Does NOT handle *what it means to an agent* (that's EventEffectPipeline).
- **Design**: Creates EventFact → determines scope (local/public) → propagates knowledge to participants/observers → generates location meaning facts for movement events.

### 4.2 EventEffectPipeline: event → memory/location/tendency (agent consequences)

- **Location**: `effects/EventEffectPipeline.js` (276 lines) — dependency leaf. `core/EventEffectPipeline.js` is a compatibility wrapper.
- **Input**: `{ agentSnapshot, selectedCandidate, reasonTrace, simTime }`
- **Output**: `{ event, stateDeltas, updatedReasonTrace }`
- **Boundary**: Responsible for *what it means to the agent* (consequences). Pure module — does NOT modify live Agent/World. Produces delta shapes: need/emotion/memory/relationship/location/world.
- **Design**: `applyActionEffect()` for action_selected events; `applyEventConsequences()` for canon events. Rules are keyword-based, not semantic.

### 4.3 FactEmitter: static/state/observation/relationship facts

- **Location**: `facts/FactEmitter.js` (386 lines)
- **Input**: Engine subsystems (World, Agent, SocialGraph)
- **Output**: Structured facts written to WorldFactStore
- **Boundary**: Generates *descriptive facts* (NOT dispatched events). Fact types: static_env (environment), agent_state (per-tick overwrite), observation (what agent sees), relationship (with previousType tracking), memory.
- **Design**: Pure functions, no state mutation. `_emittedStatic` flag ensures static env facts emitted once.

### 4.4 FactProvider: grounding layer, filters by agent perspective

- **Location**: `facts/FactProvider.js` (243 lines)
- **Input**: WorldFactStore, SocialGraph, PersonalMemory, KnowledgeStore
- **Output**: Grounding package `{ allowedFacts, inferredFacts, forbiddenFacts, locationMeaning, behaviorTendency }`
- **Boundary**: The *perspective filter*. Determines what each agent knows:
  - `allowedFacts`: facts in KnowledgeStore + AGENT_STATE privacy (own state only)
  - `inferredFacts`: same-region public events (agent can observe)
  - `forbiddenFacts`: NOT injected into prompt (tracked for consistency checking)
- **Design**: AGENT_STATE privacy is implemented at FactProvider level, not at schema level.

### 4.5 FactConsistencyChecker: last defense

- **Location**: `facts/FactConsistencyChecker.js` (467 lines)
- **Input**: LLM output text + grounding package
- **Output**: `{ valid, violations, severity, suggestion }`
- **Boundary**: The *last defense* against LLM hallucination. Checks:
  - `unsupported_claim`: agent-location not in allowedFacts
  - `unknown_character`: character name not in world
  - `unknown_location`: location not in domain
  - `new_event`: LLM invents events not in grounding
  - `new_relationship`: LLM invents relationships not in grounding
- **Design**: Regex-based detection. Known limitation: Chinese name/location detection has false positive risk.

### 4.6 BehaviorField: sole behavior tendency core

- **Location**: `agent/BehaviorField.js` (662 lines)
- **Boundary**: The *sole* behavior decision source. `stateMachine.currentState` is derived from `behaviorField.label` via getter. No other module decides behavior.
- **Gradient sources** (current): needs (w=3.0), emotion (w=2.0), schedule (w=1.8), intrinsic (w=1.5), habit (w=1.0)
- **Gradient sources** (WIP): locationMeaning, futureTendency (via UtilityScorer, not direct)
- **Design**: Underdamped Langevin dynamics. 4D continuous space B ∈ [0,1]⁴. Personality-modulated friction (γ) and noise (σ).

### 4.7 Action Selection: pressure source, not decision maker

- **Location**: `agent/action/` (10 files, ~1,669 lines total)
- **Boundary**: Action selection is a *pressure source* for BehaviorField, not an independent decision maker. UtilityScorer produces scores, UtilitySelector picks a candidate, but the result feeds back as a gradient target — BehaviorField dynamics still govern actual behavior transitions.
- **Design**: Temperature-based softmax selection with seeded RNG. ReasonTrace records full decision provenance.

---

## 5. Data Flow

```
EventDispatcher.dispatch()
  ├→ CanonEventPipeline.processEvents()
  │    → EventFact written to WorldFactStore
  │    → KnowledgeStore.addKnowledge() for participants/observers
  │    → LocationMeaningFact for movement events
  │
  ├→ EventEffectPipeline.applyEventConsequences()
  │    → Memory deltas (PersonalMemory.store())
  │    → LocationMeaning deltas (FutureTendencyTracker.update())
  │    → FutureTendency deltas
  │
  └→ FactEmitter (per tick)
       → static_env facts (once, on first tick)
       → agent_state facts (every tick, per agent, overwrite)
       → observation facts (what agent sees in current region)
       → relationship facts (SocialGraph edges)

FactProvider.getGroundingPackage(agentId)
  → allowedFacts    (KnowledgeStore ∩ active facts, + own AGENT_STATE)
  → inferredFacts   (same-region public events, not in KnowledgeStore)
  → forbiddenFacts  (not injected into prompt, tracked for checker)
  → locationMeaning (from WorldFactStore, for current region)
  → behaviorTendency (from FutureTendencyTracker, for current region)

NarrativeBuilder.buildSystemPrompt()
  → _buildGroundingSection(groundingPackage)
     → allowedFacts  → injected as "你知道的事实"
     → inferredFacts → injected as "你观察到的"
     → locationMeaning → injected as "当前地点"
     → behaviorTendency → injected as "你的倾向"
  → LLM sees only allowed/inferred facts (never forbidden)

FactConsistencyChecker.check(llmOutput, grounding)
  → unsupported_claim  (agent-location not in allowedFacts)
  → unknown_character  (name not in world agents)
  → unknown_location   (location not in domain regions)
  → new_event          (LLM invents events not in grounding)
  → new_relationship   (LLM invents relationships not in grounding)
  → { valid, violations[], severity, suggestion }
```

---

## 6. Key Constraints

1. **Domain-agnostic core**: No campus/tavern terms in core modules. Domain vocabulary lives in `presets/` and `domain/`. `domain/ForbiddenTerms.js` owns domain forbidden-term filtering; `core/WorldviewConstraints.js` remains a legacy compatibility wrapper.

2. **No `Math.random()` / `Date.now()` in deterministic runtime paths**: All randomness via injected `RNG` instance (Mulberry32). All time from `simTime` context. Enforced by source-scan test (`tests/source-scan.test.js`).

3. **BehaviorField is the sole behavior tendency core**: `stateMachine.currentState` is a derived getter from `behaviorField.label`. No transition logic in StateMachine. All behavior decisions flow through BehaviorField dynamics.

4. **LLM is expression layer only, cannot decide world facts**: LLM output goes through `FactConsistencyChecker`. LLM cannot invent events, locations, characters, or relationships not in grounding. NarrativeBuilder injects only allowed/inferred facts.

5. **StoryArc runtime blocked pending approval**: `STORY_ARC_FEEDBACK_RFC.md` is paused. `STORYARC_FEEDBACK_GATE.md` controls execution. No StoryArc code in runtime.

6. **Stable World Envelope not extended**: `WorldStateAdapter` wraps existing `toJSON()` output in v0.1.0 envelope. `runtimeSnapshot` is opaque — adapter does not parse internal structure.

7. **Pure modules for effect pipelines**: `EventEffectPipeline` and `WorldPressure` are pure functions — no live Agent/World mutation, no `Date.now()`, no hidden domain semantics.

8. **Facts system is opt-in**: `enableFacts` defaults to `false`. All facts modules loaded conditionally. No performance impact when disabled.

---

## 7. Test Coverage

| Category | Test Files | Tests | Notes |
|----------|-----------|------:|-------|
| **Total** | 62 | 1070 | All passing (vitest, 3.47s) |
| Behavior field | 1 | 61 | Largest single test file |
| SDK | 2 | 58 | sdk.test.js (54) + sdk-custom-domain.test.js (4) |
| Schema validator | 1 | 45 | World Spec + World State validation |
| Facts system | 17 | ~250 | WorldFactStore, CanonEventPipeline, FactSchema, grounded narrative, etc. |
| Domain | 4 | 76 | domain (13) + contract (34) + deep (14) + compatibility (15) |
| Integration | 3 | 43 | engine (27), agent (10), fact-system-slice (6) |
| Unit (agent/core) | 22 | ~380 | emotion, personality, memory, social, action selection, etc. |
| Spatial | 1 | 18 | SpatialEngine + SpatialHash |
| World tooling | 3 | 89 | world-state-adapter (16), world-tooling (28), schema-validator (45) |
| Source scan | 1 | 5 | Enforces no Math.random/Date.now in runtime |
| Package boundary | 1 | 21 | Public API surface validation |
| Architecture | 1 | — | Boundary check enforcement |
| Smoke pack | script | 14 | Fresh-install smoke test (`scripts/smoke-pack.sh`) |
| RNG injection | 1 | 27 | Deterministic RNG propagation |

**Key integration test**: `tests/integration/fact-system-slice.test.js` (6 tests) — covers the full fact pipeline: knowledge propagation (Bobby moves, Mira observes, Leo doesn't know), location meaning influence, future tendency tracking, and consistency checking.

---

## 8. Known Limitations

1. **FactConsistencyChecker regex has false positive risk for Chinese name/location detection**: The checker uses regex patterns to detect character names and locations in LLM output. Chinese names (2-3 characters) can match common words. Documented in `FactConsistencyChecker.js` header.

2. **AGENT_STATE privacy is implemented at FactProvider level, not at schema level**: Privacy filtering happens during `getGroundingPackage()`, not during fact storage. This means the WorldFactStore contains all agent states — privacy is a read-time concern.

3. **FutureTendencyTracker connected to UtilityScorer but not directly to BehaviorField gradient**: Tendency data flows through action selection scoring, not through the BehaviorField's direct gradient computation. This creates a two-hop influence path: event → tendency → UtilityScorer score → selected candidate → BehaviorField target.

4. **EventConsequenceRules are keyword-based, not semantic**: `EventEffectPipeline.applyEventConsequences()` uses keyword matching on event content to determine effects. No semantic understanding of event meaning.

5. **Action selection providers are incomplete**: TODO comments indicate MemoryCandidateProvider (Phase 28+), HabitCandidateProvider (Phase 29+), WorldPressureCandidateProvider (Phase 26.8+) are not yet implemented.

6. **WorldObject not integrated with SpatialEngine**: WorldObject exists as a data model but is not indexed by SpatialEngine or RegionGrid. Agent↔Object spatial interaction is not yet functional.

7. **StoryArc runtime fully blocked**: No runtime code for story arc feedback. RFC is paused, gate document controls future execution.

8. **Smoke pack script requires permission fix**: `scripts/smoke-pack.sh` lacks execute permission (`permission denied` when run directly).
