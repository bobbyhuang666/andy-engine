# Public API Contract

> Status: active governance document.
> Date: 2026-06-21.
> Scope: Stage 6 of Clean Architecture Pass.
> Purpose: define the stable public import surface for Andy Engine.
> Rule: `package.json` exports and this document must agree exactly.

---

## Overview

Andy Engine exposes 10 public import paths. Each maps to a compatibility facade that re-exports from the canonical `src/` implementation. No internal `src/` modules are directly importable.

```
require('andy-engine')                → index.js
require('andy-engine/sdk')            → sdk/index.js
require('andy-engine/domain')         → domain/index.js
require('andy-engine/domain/validate') → src/domain/validateDomain.js
require('andy-engine/domain/registry') → src/domain/DomainRegistry.js
require('andy-engine/facts')          → facts/index.js
require('andy-engine/store')          → store/index.js
require('andy-engine/config/defaults') → src/config/defaults.js
require('andy-engine/presets/campus') → presets/campus/index.js
require('andy-engine/presets/tavern') → presets/tavern/index.js
```

---

## `andy-engine` (root)

- **File**: `index.js`
- **Status**: stable
- **Canonical src**: `src/runtime/AndyWorld.js` + `src/agent/` + `src/config/` + `src/domain/` + `src/shared/`
- **Main exports**: `AndyEngine` (class)
- **AndyEngine methods**:
  - `createCharacter(config)` — stable
  - `addAgent(config)` — stable
  - `addAgents(configs)` — stable
  - `getAgent(id)` / `getAllAgents()` — legacy live compatibility handles;
    do not mutate them or use them as an evidence surface
  - `getAgentSnapshot(id)` / `getAgentsSnapshot()` — stable immutable read projections
  - `getNarrative(id, options?)` — stable
  - `getWorldContext(id)` — stable
  - `getGroundingPackage(id, options?)` — stable
  - `checkConsistency(llmOutput, id, options?) — stable`
  - `tick()` — stable; returns `TickResult` with optional `phase.effectSummary`.
    In the default fault-isolation mode, a degraded tick faults the engine:
    it is not durable and later ticks are refused until the caller restores a
    known-good checkpoint. With
    `atomicTicks: true`, a degraded tick is restored to its pre-tick serialized
    state and returned as `status: 'aborted'`.
  - `runTicks(count)` — stable
  - `advanceTo(targetTime, maxTicks?)` — stable
  - `snapshot()` — stable
  - `getStats()` — stable
  - `onTick(callback)` — stable
  - `setWeather(weather)` — stable
  - `getSocialGraph()` — legacy live compatibility handle; do not mutate it
  - `getSocialGraphSnapshot()` — stable immutable read projection
  - `toJSON()` — legacy compatibility (functional; prefer `snapshot()` + `WorldStateAdapter`)
  - `fromJSON(data, config?)` — legacy compatibility (functional; prefer `WorldStateAdapter.fromWorldState()`)
- **Allowed consumers**: external apps, SDK, examples, all tests
- **Breaking-change policy**: major version bump only. `AndyEngine` is the primary public class.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `new AndyEngine()`, `createCharacter`, `tick`, `getNarrative`, custom domain

---

## `andy-engine/sdk`

- **File**: `sdk/index.js`
- **Status**: stable
- **Canonical src**: `src/sdk/index.js`
- **Main exports**:
  - `Character` — class, stable
  - `Andy` — class, stable
  - `create(config)` — function, stable
  - `NarrativeBuilder` — class, experimental
  - `LLMAdapter` — class, experimental
  - `AutoTick` — class, experimental
  - `ConversationLog` — class, experimental
  - `AndyEngine` — class, stable (re-exported)
- **Allowed consumers**: external apps, SDK examples, `tests/sdk.test.js`, `tests/package-boundary.test.js`
- **Breaking-change policy**: `Character` and `Andy` require major version bump. Experimental classes may change in minor versions.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `Character` with custom engine

---

## `andy-engine/domain`

- **File**: `domain/index.js`
- **Status**: stable
- **Canonical src**: `src/domain/index.js`
- **Main exports**:
  - `DomainRegistry` — class, stable
  - `getDefaultDomain()` — function, stable
  - `validateDomain(domain, opts?)` — function, stable
  - `applyForbiddenTerms` — function, stable
- **Allowed consumers**: external apps, domain tests, `tests/domain.test.js`, `tests/domain-deep.test.js`
- **Breaking-change policy**: major version bump only.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `validateDomain(tavern)`

---

## `andy-engine/domain/validate`

- **File**: `src/domain/validateDomain.js`
- **Status**: stable (migrated from wrapper)
- **Canonical src**: `src/domain/validateDomain.js`
- **Main exports**: `validateDomain` (function, re-export of `{ validateDomain }` from `src/domain/validateDomain.js`)
- **Allowed consumers**: external apps needing standalone validate function
- **Breaking-change policy**: major version bump only. Now points directly to `src/` implementation.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `require('andy-engine/domain/validate')`

---

## `andy-engine/domain/registry`

- **File**: `src/domain/DomainRegistry.js`
- **Status**: stable (migrated from wrapper)
- **Canonical src**: `src/domain/DomainRegistry.js`
- **Main exports**: `DomainRegistry` (class, re-export of `{ DomainRegistry }` from `src/domain/DomainRegistry.js`)
- **Allowed consumers**: external apps needing standalone DomainRegistry import
- **Breaking-change policy**: major version bump only. Now points directly to `src/` implementation.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `new DomainRegistry(tavern)`

---

## `andy-engine/facts`

- **File**: `facts/index.js`
- **Status**: stable
- **Canonical src**: `src/canon/`, `src/knowledge/`, `src/narrative/`
- **Main exports**:
  - `FactType`, `FACT_TYPES` — enum
  - `FactSource`, `FACT_SOURCES` — enum
  - `FactScope`, `FACT_SCOPES` — enum
  - `validateFact` — function
  - `validateTypeFields` — function
  - `createBaseFact`, `createStaticEnvFact`, `createAgentStateFact`, `createRelationshipFact`, `createEventFact`, `createObservationFact`, `createMemoryFact`, `createIntentionFact`, `createRuleFact`, `createLocationMeaningFact`, `createInvalidatedFact` — factory functions
  - `WorldFactStore` — class
  - `FactEmitter` — class
  - `FactFormatter` — class
  - `FactProvider` — class
  - `FactConsistencyChecker` — class
  - `KnowledgeStore` — class
  - `CanonEventPipeline` — class
- **Allowed consumers**: external apps, fact system tests, `tests/facts/*.test.js`
- **Breaking-change policy**: major version bump only.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `require('andy-engine/facts')` checks `WorldFactStore`, `FactProvider`

---

## `andy-engine/store`

- **File**: `store/index.js`
- **Status**: stable
- **Canonical src**: `src/store/index.js`
- **Main exports** (re-exported in full from canonical `src/store/index.js`):
  - `Serialization` — module
  - `ENVELOPE_VERSION` — string
  - `SaveLoad` — class
  - `SnapshotStore` — class (interface)
  - `MetaStore` — class (interface)
  - `SQLiteStore` — class
  - `MemoryStore` — class
  - `SimulationStore` — class
  - `StoryStore` — class
  - `createStore(options?)` — function
  - `createMemoryStore()` — function
  - `toWorldState(engine, worldId)` — function
  - `fromWorldState(worldState, config?, engineConstructor?)` — function; the
    legacy type keeps the constructor optional, but the current runtime requires
    callers to pass the public `AndyEngine` constructor explicitly
  - `validateWorldSpec(spec)` — function
  - `validateWorldState(state)` — function
  - `CURRENT_SCHEMA_VERSION` — string (`'0.1.0'`)
  - `compile(spec, domainConfig?, engineConstructor?)` — function
  - `migrateWorldState(oldState)` — function
- **Allowed consumers**: external apps, store tests, `test_store.js`
- **Breaking-change policy**: major version bump only.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `createMemoryStore()`, `saveSnapshot`, `close`

---

## `andy-engine/config/defaults`

- **File**: `src/config/defaults.js`
- **Status**: stable (migrated from wrapper)
- **Canonical src**: `src/config/defaults.js`
- **Main exports**:
  - `ANDY_DEFAULTS`
  - `DEFAULT_DOMAIN_ID`
  - `EMOTION_DIMENSIONS`
  - `CO_ACTIVATION`
  - `EMOTION_OPPOSITES`
  - `personalityToBehavior`
  - `SEMANTIC_EVENT_CATEGORIES`
- **Allowed consumers**: external apps, config tests
- **Breaking-change policy**: major version bump only. Structure may grow (additive) but existing keys must not change. Now points directly to `src/config/defaults.js`.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `require('andy-engine/config/defaults')` checks `ANDY_DEFAULTS`

---

## `andy-engine/presets/campus`

- **File**: `presets/campus/index.js`
- **Status**: stable
- **Canonical src**: `presets/campus/index.js` (standalone, not in `src/`)
- **Main exports**: campus domain config object (with `id`, `name`, `states`, `regions`, etc.)
- **Allowed consumers**: external apps, default engine initialization, domain tests
- **Breaking-change policy**: major version bump only. This is the default domain preset.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `campus.id`, `campus.states['在上课']`

---

## `andy-engine/presets/tavern`

- **File**: `presets/tavern/index.js`
- **Status**: stable
- **Canonical src**: `presets/tavern/index.js` (standalone, not in `src/`)
- **Main exports**: tavern domain config object (with `id`, `name`, `states`, `regions`, etc.)
- **Allowed consumers**: external apps, domain-agnostic verification tests
- **Breaking-change policy**: major version bump only.
- **Smoke test coverage**: `scripts/smoke-pack.sh` — `new AndyEngine({ domain: tavern })`

---

## Approved Compatibility Adapters

These files are NOT exported via `package.json` but are part of the public API surface because `index.js` imports them directly. They are documented here as approved adapters.

| File | Role | Canonical src/ | Imported by |
|------|------|---------------|-------------|
| `agent/Agent.js` | Agent class definition, tick delegation to AgentRuntime | `src/agent/AgentRuntime.js` + `src/agent/lifecycle/` + `src/agent/facade/` | `index.js`, `src/` (3 files) |

**Rule**: Approved adapters may only be removed when their canonical `src/` implementation replaces all usages and a breaking release is made.

---

## agent/Agent.js

- **Status**: compatibility facade (stable)
- **Canonical implementation**: src/agent/AgentRuntime.js + src/agent/lifecycle/ + src/agent/runtime/ + src/agent/facade/
- **Rules**:
  - No domain logic
  - No direct state mutation
  - Delegates all work to src/agent/
- **Removal condition**: Major version bump + all public API migrated

---

## Internal Modules (NOT Exported)

The following are explicitly NOT part of the public API and must NOT appear in `package.json` exports:

| Module Pattern | Reason |
|---------------|--------|
| `src/agent/runtime/*` | Internal tick pipeline |
| `src/agent/lifecycle/*` | Internal agent wiring |
| `src/agent/facade/*` | Internal agent facade |
| `src/agent/psychology/*` | Internal psychology subsystems |
| `src/agent/memory/*` | Internal memory subsystems |
| `src/agent/schedule/*` | Internal schedule subsystem |
| `src/runtime/*` | Internal engine runtime |
| `src/canon/*` | Internal canon layer (exposed via `facts/`) |
| `src/knowledge/*` | Internal knowledge layer (exposed via `facts/`) |
| `src/narrative/*` | Internal narrative layer (exposed via `facts/`) |
| `src/effects/*` | Internal effects layer |
| `src/social/*` | Internal social layer |
| `src/spatial/*` | Internal spatial layer |
| `src/pressure/*` | Internal pressure layer |
| `src/action/*` | Internal action layer |
| `src/shared/*` | Internal shared utilities |
| `core/*` | Retired top-level implementation path (not exported; no files on disk) |
| `agent/Agent.js` | Public-approved compatibility adapter (not exported directly) |
| `effects/*` | Retired top-level implementation path (not exported; no files on disk) |
| `social/*` | Retired top-level implementation path (not exported; no files on disk) |
| `spatial/*` | Retired top-level implementation path (not exported; no files on disk) |

---

## TypeScript Support (Alpha)

`package.json` exports 为以下 subpath 均提供 `types` 子键(指向对应 `.d.ts`)：

| Subpath | `.d.ts` 路径 |
|---------|-------------|
| `.` | `index.d.ts` |
| `./sdk` | `sdk/index.d.ts` |
| `./domain` | `domain/index.d.ts` |
| `./domain/validate` | `src/domain/validateDomain.d.ts` |
| `./domain/registry` | `src/domain/DomainRegistry.d.ts` |
| `./facts` | `facts/index.d.ts` |
| `./store` | `store/index.d.ts` |
| `./config/defaults` | `src/config/defaults.d.ts` |
| `./presets/campus` | `presets/campus/index.d.ts` |
| `./presets/tavern` | `presets/tavern/index.d.ts` |

所有 10 个 subpath 均已提供独立 `.d.ts` 类型声明。TS 消费者从任一 subpath 导入均可获得精确的类型推导。

D5 v3 sidecar options (`structuredClaims`, `locationAliases`, `verifier`, `strictness`) 通过 `checkConsistency` 的第三参 `options` 传入，与 `GroundingChecker` v3 evidence-bound path 对齐。`ConsistencyCheckResult` 附带可选字段 `evidenceTrace`、`coreferenceNotes`、`verifierDecisions` 供 TS 消费者消费诊断旁路数据。

`checkConsistency` 是同步 API，因此 `verifier` 必须提供同步 `verifySync(input)`
或同步 `verify(input)`；返回 Promise 的实现会安全降级为 deterministic-only
结果。实现可以是普通结构化对象，无需继承内部 `GroundingVerifier` 类。

Domain semantic configuration is public through `andy-engine/domain` and
`andy-engine/domain/registry`: `semanticProfile`, `getSemanticProfile()`, and
`mergeSemanticProfile(defaults)` are supported read APIs for domain-driven
language, grounding, and narrative semantics. Core runtime code must prefer this
profile over hard-coded world vocabulary.

---

## TickResult.phase.effectSummary — Additive Contract (W4)

**Added**: Integration Beta W4 (contract hardening).
**Status**: additive, optional, stable.
**Gap**: A1 — effect/trace observability.

### Type

```ts
type DeltaType = 'need' | 'emotion' | 'memory' | 'relationship' |
  'position' | 'locationMeaning' | 'futureTendency';

interface TickEffectSummary {
  counts: {
    applied: number;
    skipped: number;
    errored: number;
  };
  byType: Partial<Record<DeltaType, {
    applied: number;
    skipped: number;
  }>>;
}
```

### Population rules

1. `effectSummary` is added to `TickResult.phase` as an **optional** field.
2. Present only when `counts.applied + counts.skipped + counts.errored > 0`
   (zero-effect ticks omit it entirely).
3. **Counts only** — no raw `StateDelta` objects, no live references, no
   `EffectCommitter.commit()` return values.
4. Aggregated across all `effectCommitter.commit()` call sites within `step()`,
   including the `directCommit` path used by active action-selection mode.
5. `byType` is partial: only delta types with `applied > 0` or `skipped > 0`
   appear.
6. Deterministic: same seed + same world state → identical `effectSummary`.

### Stability commitment

- **Stable (contractual)**: `counts` shape, `byType` per-type shape,
  `DeltaType` union, field name `effectSummary`.
- **Unstable (implementation detail)**: distribution of deltas across internal
  commit call sites, `errored` per-type breakdown.
- **Not committed**: per-event/per-agent delta traces, raw delta shapes.

### Migration

No migration required. The field is additive and optional. Existing consumers
are unaffected.

---

## Change Policy

1. **Adding a new public export**: must update both `package.json` exports and this document.
2. **Removing a public export**: must mark deprecated for at least one minor version before removal.
3. **Breaking change to existing export**: requires major version bump.
4. **Additive change to existing export** (new keys, new optional params): allowed in minor version.
