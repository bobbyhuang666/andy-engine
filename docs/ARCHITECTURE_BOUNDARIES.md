# Andy Engine Architecture Boundaries

> **Conceptual governance document.**
> Some path examples below predate the Stage 25.1 `src/` retirement. For current
> file-level truth, use `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md` and the enforced
> checks in `scripts/check-boundaries.js`.
>
> Status: active governance document.
> Scope: Andy Engine single-package repository.
> Purpose: freeze current conceptual boundaries so future work does not contaminate engine core.

---

## 1. Layer Model

Current Andy Engine is organized into six conceptual layers within a single package, plus a peer subsystem owned by Simulation Core.

```
Presentation / SDK / Storage
  -> Domain / World Data
  -> WorldCanon / Knowledge
  -> Action / Intention
  -> Agent Psychology
  -> Simulation Core
       ↓ owns
     Social Graph (peer subsystem)
```

Dependency direction is one-way: upper layers may import lower layers.
Lower layers must not import upper layers.
Exception: `social/` is a peer-owned subsystem of `core/World.js` — see §3.3.

---

## 2. Layer Definitions

### 2.1 Simulation Core

```
core/World.js
core/Simulator.js
core/EventDispatcher.js
core/RNG.js
core/WorldPressure.js
core/EventEffectPipeline.js        # compatibility wrapper only
core/EmotionEffectClassifier.js
core/EmotionSignalBuffer.js
core/WorldviewConstraints.js
core/AndyBridge.js
config/defaults.js
config/validate.js
domain/DomainRegistry.js
domain/validateDomain.js
```

Owns: simulation time, tick scheduling, world environment, agent registry, event dispatch, seeded RNG, domain resolution, runtime pressure computation.

Must not know: player, quest, inventory, cultivation, fantasy race, romance, companion UX, status board, UI map, Bobby, Andy Town.

Note: `core/EventEffectPipeline.js` is a backward-compatible wrapper. The canonical implementation lives in `effects/EventEffectPipeline.js`.

### 2.2 Agent Psychology

```
agent/Agent.js
agent/BehaviorField.js
agent/BehaviorLabeler.js
agent/StateMachine.js
agent/EmotionVector.js
agent/NeedsSystem.js
agent/PersonalMemory.js
agent/Personality.js
agent/Appraisal.js
agent/EmotionRegulation.js
agent/IntrinsicMotivation.js
agent/ProceduralMemory.js
agent/Schedule.js
agent/FutureTendencyTracker.js
agent/LocationMeaningInfluence.js
```

Owns: internal psychological state, needs, emotion, memory, appraisal, habit, continuous behavior field, location meaning influence, future tendency vectors.

Constraint: `BehaviorField` is the continuous tendency core. `StateMachine` is metadata/history only.

### 2.3 Action / Intention Layer

```
agent/action/ActionCandidate.js
agent/action/UtilityScorer.js
agent/action/UtilitySelector.js
agent/action/GoalSystem.js
agent/action/WorldObject.js
agent/action/providers/*
```

Owns: candidate generation, utility scoring, weighted selection, ReasonTrace, goal/object modeling.

Constraint: this layer is an intention/pressure layer. It does not own world truth or final event history. It must not directly mutate agent state.

### 2.4 WorldCanon / Knowledge

```
facts/WorldFactStore.js
facts/FactSchema.js
facts/CanonEventPipeline.js
facts/KnowledgeStore.js
facts/FactProvider.js
facts/FactConsistencyChecker.js
facts/FactFormatter.js
facts/FactEmitter.js
```

Owns: what is true, who knows what, perspective-safe grounding, consistency checking.

Constraint: `FactProvider` filters perspective. Observer knowledge must not leak hidden destinations or intents.

### 2.5 Domain / World Data

```
domain/DomainRegistry.js
domain/validateDomain.js
presets/campus/index.js
presets/tavern/index.js
world/WorldStateAdapter.js
world/validator.js
world/compiler.js
world/migration.js
```

Owns: domain config contract, domain-specific vocabulary, stable world envelope tooling, migration/compiler tooling.

Constraint: domain packs can creep into core semantics. `world/` tooling is internal, not public API.

### 2.6 SDK / Presentation / Storage

```
sdk/Character.js
sdk/NarrativeBuilder.js
sdk/Andy.js
sdk/LLMAdapter.js
store/*
```

Owns: high-level usage, prompt construction, LLM adapter, persistence.

Constraint: SDK consumes engine output. It does not own world truth.

### 2.7 Effects (Dependency Leaf)

```
effects/EventEffectPipeline.js
```

Owns: action effect computation, event consequence application (memory/location/tendency deltas).

Constraint: `effects/` is a dependency-leaf layer. It must not import from `core/`, `agent/`, `sdk/`, or `facts/`. It may import from `config/`. Both `agent/Agent.js` and `core/Simulator.js` import from `effects/EventEffectPipeline.js`. The `core/EventEffectPipeline.js` wrapper delegates to `effects/EventEffectPipeline.js` for backward compatibility.

### 2.8 Social Graph (Peer Subsystem)

```
social/SocialGraph.js
social/Relationship.js
```

Owns: global social graph, Dunbar layers, triadic closure, relationship model.

This is **not** a lower layer under `core/`. It is a **peer-owned subsystem**: `core/World.js` creates and owns the `SocialGraph` instance as part of world state. The `social/` modules themselves have no imports from `core/` or `agent/`, making them dependency-leaf modules.

The import `core/World.js` → `social/SocialGraph.js` is an **accepted architectural pattern** (world-owned peer subsystem), not a layer violation.

---

## 3. Dependency Rules

### 3.1 Allowed Import Directions

```
sdk/         -> agent/, core/, facts/, domain/, social/
agent/       -> core/, social/, config/, effects/
agent/action -> agent/ (sibling), core/ (read-only)
core/        -> social/, config/, domain/, effects/
facts/       -> (standalone, no internal imports from agent/sdk/core)
effects/     -> config/ (standalone dependency leaf)
```

### 3.2 Forbidden Imports

| From | Must Not Import |
|------|-----------------|
| `core/` | `agent/`, `sdk/`, `facts/` |
| `agent/` | `sdk/`, `facts/` |
| `agent/action/` | `sdk/`, `facts/`, `agent/Agent.js` |
| `facts/` | `agent/`, `sdk/`, `core/` |
| `domain/` | `agent/`, `sdk/`, `facts/`, `core/` |
| `effects/` | `core/`, `agent/`, `sdk/`, `facts/` |

### 3.3 Allowed Exceptions

| Import | Reason |
|--------|--------|
| `core/World.js` -> `social/SocialGraph.js` | **Accepted architectural pattern**: World owns the social graph instance as a peer subsystem. `social/` has no reverse imports to `core/` or `agent/`. This is not a layer violation — it is world-owned peer ownership. |
| `sdk/NarrativeBuilder.js` -> `facts/FactFormatter.js` | Narrative uses structured fact formatting |
| `core/World.js` -> `facts/index.js` (via `require('../facts')`) | **Accepted architectural pattern**: World owns optional WorldCanon/Knowledge subsystem instances (WorldFactStore, KnowledgeStore, FactEmitter, CanonEventPipeline) as part of world state. `facts/` modules themselves remain dependency-leaf modules and must not import `core/`/`agent/`/`sdk/`. No other `core/` module may import `facts/` unless separately approved. |
| `sdk/NarrativeBuilder.js` -> `domain/DomainRegistry.js` | Narrative resolves domain for grounding |

---

## 4. Mutation Rules

### 4.1 World Truth Authority

Only `facts/` layer modules may create or invalidate WorldFacts.

Current authorized writers:

- `facts/WorldFactStore.js` — internal store operations (`addFact`, `invalidateFact`)
- `facts/CanonEventPipeline.js` — dispatched event → fact conversion (primary entry point)
- `facts/FactEmitter.js` — static/state/observation/relationship fact emitter

**FactEmitter event fallback** (`emitEventFacts`) is legacy. New code must not add new event-fact paths through FactEmitter. All new dispatched-event → fact conversions must go through `CanonEventPipeline`.

No module outside `facts/` may directly write world facts.

### 4.2 Agent State Authority

Only `agent/Agent.js` (via `tick()`) and its direct subsystem calls may mutate agent psychological state.

Action selection must not directly mutate:
- `agent.emotion.*`
- `agent.needs.*`
- `agent.memory.*`
- `agent.relationship.*`
- `agent.behaviorField.B`
- `agent.stateMachine.currentState`

### 4.3 Presentation Boundary

`sdk/NarrativeBuilder.js` must not:
- create new world facts
- invent locations, characters, or events
- mutate agent internals
- treat LLM output as canon

It may only express: known facts, observed facts, memory summaries, relationship state, reason traces, emotional tone.

### 4.4 Deterministic Paths

New runtime paths in `agent/action/**` and `facts/**` must not use `Date.now()` or `Math.random()`.

Use `core/RNG.js` for seeded randomness. Use `simTime` for timestamps.

---

## 5. Extension Boundary

The following concepts are extension candidates, not core:

- PlayerAgent
- ItemSystem / Inventory
- QuestSystem / CommitmentSystem
- AdventureAdapter
- StatusBoard / GMView
- FantasyExtension
- Cultivation domain logic

These may be implemented as separate modules that depend on engine seams:
- `CanonEventPipeline`
- `KnowledgeStore`
- `FactProvider`
- `EventEffectPipeline`
- domain config
- approved WorldObject / affordance APIs

They must not be added as core modules.

---

## 6. Enforcement

### 6.1 Automated Checks

Run `npm run check:boundaries` to verify:
- no new direct world/canon mutation outside `facts/`
- `NarrativeBuilder` depends on structured grounding, not agent internal mutation
- upper-layer concepts do not enter core
- deterministic new paths do not use `Date.now()` / `Math.random()`
- LLM/presentation cannot own world truth

### 6.2 Existing Test Coverage

- `tests/source-scan.test.js` — campus-only string scanning, banned APIs, deterministic checks
- `tests/package-boundary.test.js` — npm package metadata and export validation
- `tests/domain-contract.test.js` — domain config contract validation

### 6.3 Review Checklist

Before merging, verify:
- no extension/presentation concepts imported into core
- no `Date.now()` / `Math.random()` in new deterministic paths
- no LLM world-fact creation
- no private agent state mutation without structured deltas
- no domain-specific vocabulary in core
- no observer-only fact leakage in grounding
