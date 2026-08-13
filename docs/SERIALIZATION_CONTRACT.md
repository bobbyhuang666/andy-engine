# Serialization Contract

> Status: active governance document.
> Date: 2026-06-21.
> Scope: Stage 11 of Clean Architecture Pass.
> Purpose: define the stable persistence boundary for Andy Engine.
> Rule: all serialization boundaries must be documented here.

---

## Overview

Andy Engine has three distinct serialization layers:

### A. Legacy Agent Snapshot (toJSON/fromJSON)

- **What**: Agent-level state capture via `Agent.toJSON()` / `AndyEngine.toJSON()` / `AndyEngine.fromJSON()`
- **Status**: Legacy compatibility snapshot, retained for public compatibility
- **NOT deprecated** — these methods remain functional and are part of the public API
- **Recommended path**: For new code, prefer `engine.snapshot()` + `WorldStateAdapter` (see Layer C)

### B. Runtime Snapshot (engine.snapshot())

- **What**: Full engine state capture via `AndyWorld.snapshot()`
- **Status**: Internal runtime snapshot — human-readable diagnostic view
- **Use case**: Quick state inspection, debugging

### C. Stable World Envelope (toWorldState/fromWorldState)

- **What**: Schema-validated world state via `WorldStateAdapter`
- **Status**: Recommended persistence path
- **Uses**: `WorldStateAdapter`, validator, migration pipeline
- **Contract**: Cross-version-safe, validated, with explicit migration support

---

**Layer relationship**:
- Layer A (toJSON) produces the opaque runtime snapshot payload
- Layer B (snapshot) produces a human-readable diagnostic view
- Layer C (WorldEnvelope) wraps Layer A's output in a validated, versioned envelope

These layers must never leak into each other. The envelope is the contract. The snapshot is the implementation detail.

---

## Runtime Snapshot Payload Ownership

**Owner**: `AndyWorld.toJSON()` in `src/runtime/AndyWorld.js`

The runtime snapshot is an opaque payload produced by `AndyWorld.toJSON()`. It contains:

```js
{
  time: string,              // ISO 8601
  tickCount: number,
  environment: { weather, weatherChangedAt, timeOfDay, season },
  agents: { [id]: agentToJSON },
  socialGraph: edges[],
  events: { eventLog: [...] },
  rngState: number | undefined,     // only if seeded RNG
  factStore: object | undefined,    // only if enableFacts
  knowledgeStore: object | undefined, // only if enableFacts
}
```

**Rules**:
- Only `AndyWorld.toJSON()` produces runtime snapshots.
- Only `AndyWorld` constructor (with `savedState`) restores from runtime snapshots.
- The snapshot shape is NOT a public contract — it can change between minor versions.
- External consumers must use the Stable World Envelope, not the raw snapshot.

---

## Stable World Envelope Ownership

**Owner**: `Serialization` class in `src/store/Serialization.js`

The envelope is the cross-version-safe persistence format:

```js
{
  version: string,           // legacy version key, '0.1.0'
  schemaVersion: string,     // canonical schema key, '0.1.0'
  timestamp: string,         // ISO 8601
  runtimeSnapshot: object,   // Opaque Payload — not parsed by envelope layer
}
```

**Rules**:
- `Serialization.serialize(world)` creates the envelope from an AndyWorld instance.
- `Serialization.deserialize(envelope)` extracts the opaque runtime snapshot.
- The current envelope has exactly 4 fields: `version`, `schemaVersion`,
  `timestamp`, `runtimeSnapshot`.
- `version` is retained for compatibility; `schemaVersion` is canonical.
- When both keys are present they must be identical. A contradictory pair is
  rejected rather than selecting one key implicitly.
- `runtimeSnapshot` is opaque to `Serialization`; it does not parse or validate
  its internal structure, but it must be a non-null, non-array object.
- `WorldStateAdapter.fromWorldState()` is fail-closed: it validates the stable
  envelope and requires a runtime payload with an agent table before handing
  the payload to the runtime. It intentionally does not validate individual
  agent internals, which remain runtime-owned.
- Version changes require explicit Stable World Envelope migration logic.
  `Serialization.deserialize()` does not migrate the opaque runtime payload:
  it rejects a transport envelope with another version rather than treating a
  runtime snapshot as a semantic world state.

## Durable Simulation Checkpoints

`SimulationStore` writes its restart checkpoint, cursor metadata, and
retention update as one store-level commit. Every checkpoint contains a SHA-256
digest over its binary payload plus the tick/time witnesses. Restore verifies
the digest before invoking application restoration. If the newest checkpoint is
corrupt, restore may select the newest earlier checkpoint that independently
verifies; if none verifies, the store remains closed and never writes a
replacement checkpoint over the evidence.

---

## World State Adapter (Compatibility Layer)

**Owner**: `src/store/world/WorldStateAdapter.js` (canonical implementation)

The `src/store/world/` directory contains the Stable World Envelope adapter with additional stable fields (`characters`, `relationships`, `events`, `worldClock`).

**Current ownership**:
- `src/store/world/WorldStateAdapter.js` — `toWorldState()` / `fromWorldState()` — Stable Envelope adapter
- `src/store/world/validator.js` — `validateWorldSpec()` / `validateWorldState()` — schema v0.1.0 validation
- `src/store/world/compiler.js` — `compile()` — World Spec → World State
- `src/store/world/migration.js` — `migrateWorldState()` — v0.0.0 → v0.1.0 migration

**Legacy wrappers**: the old top-level `world/` files were retired during the Clean Architecture Pass. New code must import the canonical `src/store/world/*` modules.

---

## Agent Snapshot Restore Expectations

**Owner**: `AgentSubsystemFactory.restoreSubsystems()` in `src/agent/lifecycle/AgentSubsystemFactory.js`

When restoring an agent from a serialized snapshot, the following fields must be present in the saved state:

| Field | Type | Required | Restored By |
|-------|------|----------|-------------|
| `id` | string | yes | Agent constructor |
| `name` | string | yes | Agent constructor |
| `personality` | object | yes | `Personality.fromJSON()` |
| `emotion` | object | yes | `EmotionVector` constructor |
| `stateMachine` | object | yes | `StateMachine` constructor |
| `behaviorField` | object | yes | `BehaviorField` constructor |
| `memory` | object | yes | `PersonalMemory` constructor |
| `appraisalBiases` | object | no | `memory.appraisalBiases` assignment |
| `proceduralMemory` | object | yes | `ProceduralMemory` constructor |
| `schedule` | object | yes | `Schedule` constructor |
| `needs` | object | yes | `NeedsSystem` constructor |
| `emotionRegulation` | object | yes | `EmotionRegulation` constructor |
| `intrinsicMotivation` | object | yes | `IntrinsicMotivation` constructor |
| `position` | string | yes | direct assignment |
| `socialEnergy` | number | no | defaults to `AGENT_DEFAULTS.socialEnergy` |
| `health` | number | no | defaults to `AGENT_DEFAULTS.health` |
| `isOnline` | boolean | no | defaults to `AGENT_DEFAULTS.isOnline` |
| `_actionTraceHistory` | array | no | direct assignment |

**Serialization source**: `AgentSerializer.toJSON()` in `src/agent/facade/AgentSerializer.js`

---

## RNG State Restore Expectations

**Owner**: `RNG` class in `src/shared/rng.js`

RNG state is saved and restored as a single integer:

```js
// Save
const rngState = rng.getState();  // returns number

// Restore
const rng = new RNG(0);
rng.setState(rngState);           // restores internal state
```

**In the runtime snapshot**: `savedState.rngState` (optional field)

**In the engine constructor** (`index.js`):
- If `config.rng` is provided, use it directly.
- If `config.seed` is provided, create `new RNG(seed)`.
- If `savedState.rngState` exists, create `new RNG(0)` and call `setState()`.
- Otherwise, `rng` is `null` (falls back to `Math.random`).

**Deterministic restore**: same `rngState` value → same subsequent random sequence.

---

## Schedule Restore Expectations

**Owner**: `Schedule` class in `src/agent/schedule/Schedule.js`

Schedule state is restored from `savedState.schedule`:

```js
{
  _todayVariations: { [dateKey]: { [blockName]: { region, duration } } },
  _lastVariationDate: string | null,
}
```

**Restore path**: `new Schedule(config, savedState.schedule, rng)`

The schedule config (archetype/preset) is passed separately from the saved state. The saved state only contains runtime variation data.

---

## Fact/Knowledge Restore Expectations

**Owner**: `WorldFactStore` and `KnowledgeStore` in `src/canon/` and `src/knowledge/`

Facts and knowledge are saved in the runtime snapshot:

```js
savedState.factStore     → WorldFactStore.fromJSON(savedState.factStore)
savedState.knowledgeStore → KnowledgeStore.fromJSON(savedState.knowledgeStore, factStore)
```

**In `AndyWorld` constructor**:
- If `enableFacts` is true and `savedState.factStore` exists, restore via `WorldFactStore.fromJSON()`.
- If `enableFacts` is true and `savedState.knowledgeStore` exists, restore via `KnowledgeStore.fromJSON()`.
- If `enableFacts` is true but no saved state, create fresh instances.

**Important**: The fact store must be restored BEFORE the knowledge store (knowledge references fact IDs).

---

## Bidirectional Round-Trip Contract (Wave 4)

Every persistable type that produces a `toJSON()` payload MUST also provide a
`static fromJSON(json)` so that `toJSON() → fromJSON(json) → toJSON()` yields a
deep-equal result.  This section records the Wave 4 completion state.

### Bidirectional persistable types

| Type | File | Round-trip |
|------|------|------------|
| `Relationship` | `src/social/Relationship.js` | ✅ `fromJSON` delegates to ctor savedState |
| `SocialGraph` | `src/social/SocialGraph.js` | ✅ edges array → ctor |
| `EmotionVector` (+`.native`) | `src/agent/psychology/EmotionVector(.native).js` | ✅ |
| `NeedsSystem` (+`.native`) | `src/agent/psychology/NeedsSystem(.native).js` | ✅ |
| `EmotionRegulation` | `src/agent/psychology/EmotionRegulation.js` | ✅ |
| `IntrinsicMotivation` | `src/agent/psychology/IntrinsicMotivation.js` | ✅ |
| `StateMachine` | `src/agent/psychology/StateMachine.js` | ✅ |
| `PersonalMemory` | `src/agent/memory/PersonalMemory.js` | ✅ memories array → ctor |
| `ProceduralMemory` | `src/agent/memory/ProceduralMemory.js` | ✅ |
| `Schedule` | `src/agent/schedule/Schedule.js` | ✅ json used as both config + savedState so `entries` round-trips |
| `EventDispatcher` | `src/runtime/EventDispatcher.js` | ✅ rebuilds eventLog (truncated to `maxEventLogSize`, default 2000, matching `toJSON`) |
| `Personality` | `src/agent/psychology/Personality.js` | ✅ MBTI + OCEAN + emotionBaseline + driftWindow round-trips |
| `BehaviorField` | `src/agent/psychology/BehaviorField.js` | ✅ B / velocity / _prevB / _lastLabel round-trips (explicit `personality` + `domain` deps) |
| `AutoTick` | `src/sdk/AutoTick.js` | 持久化于 Character/Andy.save;有 fromJSON+toJSON(待补 round-trip 测试) |
| `ConversationLog` | `src/sdk/ConversationLog.js` | 持久化于 Character/Andy.save;有 fromJSON+toJSON(待补 round-trip 测试) |

**Dependency-bearing types** (`EmotionVector`, `NeedsSystem`, `EmotionRegulation`,
`IntrinsicMotivation`, `PersonalMemory`, `StateMachine`, `Schedule`,
`EventDispatcher`) accept their runtime deps (`personality` / `domain` / `rng` /
`agentId`) as optional trailing arguments.  When omitted, `fromJSON` constructs a
minimal stub so the call shape `Type.fromJSON(j)` still round-trips — this is the
shape the Wave 4 round-trip tests assert.  The production restore path passes the
real dependencies (see "Typed reconstruction path" below).

### Exempt types (intentionally one-way)

| Type | Reason |
|------|--------|
| 8 Deltas (`StateDelta`, `EmotionDelta`, `RelationshipDelta`, `MemoryDelta`, `LocationMeaningDelta`, `PositionDelta`, `NeedDelta`, `FutureTendencyDelta`) | Ephemeral effect payloads; consumed by `EffectCommitter` within a tick, never independently persisted. |
| `ActionCandidate`, `ReasonTrace`, `SelectedAction` | Plain JSON data objects (value types); no encapsulated state to reconstruct. |
| `FactFormatter.toJSON` | Serialization helper for facts, not itself a persisted type. |
| `AndyBridge`, `WorldStateAdapter`, `migration.js` | Serialization infrastructure / envelope adapters (not persisted domain types). |
| `AgentSerializer` | One-way serialization **producer only** (a module exporting `toJSON(agent)`, not a class). Agent reconstruction is owned by `AgentSubsystemFactory.restoreSubsystems()` (see below), so a symmetric `fromJSON` is not added. |
| `FutureTendencyTracker` | 有 `toJSON`/`fromJSON`,但 `Agent.toJSON` 不持久化 futureTendency(行为趋势在 tick 中即时计算,不跨会话存储)。列为 exempt,非独立持久化类型。 |
| `WorldClock` | 有 `toJSON`/`fromJSON`,但作为 `AndyWorld` 内部组件,其状态(time/tickCount)经 `AndyWorld.toJSON` 顶层字段持久化,不作为独立类型 round-trip。 |
| `WorldObject` | 有 `toJSON`/`fromJSON`,但标记 experimental(未集成入 Agent.tick),不作为支持面持久化类型。 |

### Typed reconstruction path

`Serialization.deserialize()` remains an **envelope-layer** operation: it
validates the envelope (`version` / `runtimeSnapshot`) and returns the opaque
runtime snapshot.  It deliberately does **not** call any type `fromJSON`.

Typed reconstruction is performed by the existing load path, where each type's
**constructor accepts the `toJSON` output as a `savedState` argument**:

```
AndyWorld(savedState)          → restores clock, environment, socialGraph,
                                 eventDispatcher, factStore, knowledgeStore
                                 via ctor savedState / existing fromJSON
AgentSubsystemFactory
  .restoreSubsystems(savedState) → Personality.fromJSON + ctor(savedState) for
                                  emotion / stateMachine / memory / needs /
                                  emotionRegulation / intrinsicMotivation /
                                  schedule / behaviorField
```

The new `static fromJSON` methods mirror these constructor-savedState paths (they
delegate to the same constructors), so `fromJSON` and the production load path
share one source of truth.  This keeps the Stable World Envelope unchanged — no
load-flow behavior was modified to "make deserialize call fromJSON".

### Verification

Round-trip tests live in `tests/unit/serialization-roundtrip.test.js` and assert
`expect(Type.fromJSON(obj.toJSON()).toJSON()).to.deep.equal(obj.toJSON())` for
every bidirectional type, including non-trivial post-tick / post-interaction
state and the explicit-dependency restore path for psychology subsystems.

---

## Store API Surface

**Public export path**: `require('andy-engine/store')`
**Canonical source**: `src/store/index.js`

| Export | Type | Purpose |
|--------|------|---------|
| `Serialization` | class | Stable World Envelope serialize/deserialize |
| `ENVELOPE_VERSION` | string | Current envelope version (`'0.1.0'`) |
| `SaveLoad` | class | Unified save/load interface (uses Serialization + store) |
| `SnapshotStore` | class (interface) | Abstract snapshot store interface |
| `MetaStore` | class (interface) | Abstract key-value metadata store interface |
| `SQLiteStore` | class | SQLite implementation of StoryStore + SnapshotStore + MetaStore |
| `SimulationStore` | class | High-level simulation persistence manager |
| `StoryStore` | class (interface) | Abstract story store interface |
| `createStore(options?)` | function | Create SimulationStore (`auto`, explicit `sqlite`, or `memory`) |
| `createMemoryStore()` | function | Create in-memory SQLiteStore, with MemoryStore fallback if bindings are unavailable |
| `toWorldState(engine, worldId)` | function | Export engine to Stable World Envelope (`WorldStateAdapter`) |
| `fromWorldState(state, config, ctor)` | function | Restore engine from Stable World Envelope (`WorldStateAdapter`) |
| `validateWorldSpec(spec)` | function | Validate a full world spec (compile-time authoring) |
| `validateWorldState(state)` | function | Validate a Stable World Envelope (runtime load) |
| `CURRENT_SCHEMA_VERSION` | string | Current Stable World Envelope schema version (`'0.1.0'`) |
| `compile(spec, domainConfig?)` | function | Compile a world spec into a runnable WorldState |
| `migrateWorldState(oldState)` | function | Migrate an older World State to the current schema version |

> 完整 store 导出面以 `docs/PUBLIC_API_CONTRACT.md` 为权威(18 项),本表为序列化相关条目的语义说明。

**SaveLoad flow**:
```
SaveLoad.save(world)
  → Serialization.serialize(world)    // creates envelope
  → store.save(envelope, metadata)    // persists envelope

SaveLoad.load(snapshotId)
  → store.load(snapshotId)            // retrieves envelope
  → Serialization.deserialize(envelope) // extracts runtime snapshot
```

---

## Version Disambiguation

Two version numbers coexist in the persistence layer. They are **layered, not competing**:

| Version | Owner | Scope |
|---------|-------|-------|
| `schemaVersion` (`'0.1.0'`) | `validator.js` / `migration.js` | Stable World Envelope schema version. Drives migration pipeline. Part of the `WorldStateAdapter` envelope. |
| `ENVELOPE_VERSION` (`'0.1.0'`) | `Serialization.js` | Backward-compatible alias of `CURRENT_SCHEMA_VERSION`. The transport envelope emits both `version` and canonical `schemaVersion`. |

**Layering**: `Serialization` envelope (transport) wraps the opaque runtime
snapshot and has 4 fields. The `WorldStateAdapter` semantic envelope has 7+
fields plus the opaque runtime snapshot. Both version keys currently resolve to
`0.1.0`; this does not merge the ownership of the two envelope shapes.

---

## Ownership Summary

| Component | Owner | File |
|-----------|-------|------|
| Runtime snapshot production | `AndyWorld.toJSON()` | `src/runtime/AndyWorld.js` |
| Runtime snapshot restore | `AndyWorld` constructor | `src/runtime/AndyWorld.js` |
| Stable Envelope creation | `Serialization.serialize()` | `src/store/Serialization.js` |
| Stable Envelope extraction | `Serialization.deserialize()` | `src/store/Serialization.js` |
| Save/Load orchestration | `SaveLoad` | `src/store/SaveLoad.js` |
| Agent snapshot production | `AgentSerializer.toJSON()` | `src/agent/facade/AgentSerializer.js` |
| Agent snapshot restore | `AgentSubsystemFactory.restoreSubsystems()` | `src/agent/lifecycle/AgentSubsystemFactory.js` |
| WorldStateAdapter | `toWorldState()` / `fromWorldState()` | `src/store/world/WorldStateAdapter.js` |
| Schema validation | `validateWorldSpec()` / `validateWorldState()` | `src/store/world/validator.js` |
| World compiler | `compile()` | `src/store/world/compiler.js` |
| Migration | `migrateWorldState()` | `src/store/world/migration.js` |

---

## SQLite Optional Path

`better-sqlite3` is declared as `optionalDependencies` in `package.json`. Auto
mode degrades only when the native binding is unavailable; explicit SQLite mode
fails closed. Database open errors such as invalid paths, permissions, or
corruption are never converted into an in-memory fallback.

| Scenario | Behavior |
|----------|----------|
| `require('andy-engine/store')` without `better-sqlite3` | Loads without error. `SQLiteStore` class is exported. |
| `new SQLiteStore(':memory:')` without `better-sqlite3` | Throws an error with code `SQLITE_BINDING_UNAVAILABLE`. |
| `createStore({ type: 'auto' }).init()` without a working binding | Falls back to `MemoryStore` and reports `degraded: true`. |
| `createStore({ type: 'sqlite' }).init()` without a working binding | Rejects with `SQLITE_BINDING_UNAVAILABLE`; no fallback. |
| SQLite path/permission/open failure | Rejects with `SQLITE_OPEN_FAILED`; no fallback. |
| `new SQLiteStore(':memory:')` with `better-sqlite3` | Works. Smoke test: `npm run sqlite:smoke` |
| `require('andy-engine')` (engine only, no store) | No SQLite dependency needed. |

**Verified**: `npm run sqlite:smoke` passes (beta.2).
