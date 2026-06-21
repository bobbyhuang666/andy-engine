# Andy Engine Clean Architecture Retirement Plan v0.2

> **Historical execution plan.**
> The retirement plan has been executed through Stage 25.1. Current source of truth:
> `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`, `docs/PUBLIC_FACADE_AUDIT.md`,
> and `docs/LEGACY_REMOVAL_REPORT.md`.
>
> 中文名：Andy 引擎旧架构退休与新架构替换计划 v0.2
>
> 目标：把 Andy Engine 的旧顶层架构逐步退休，最终以 `src/` 分层架构作为唯一 canonical implementation。旧目录要么删除，要么只保留明确的 public compatibility wrapper，并有清晰的删除条件。
>
> 当前状态：`src/` 分层已存在，旧顶层目录仍大量存在作为 wrapper、legacy public path 或历史实现承载。本计划定义从当前双轨结构走向纯净新架构的执行顺序。

---

## 1. One-Sentence Goal

> Andy Engine Clean Architecture Retirement Pass 的目标，是将现有双轨结构收敛为以 `src/` 为唯一实现来源的 clean engine codebase：旧架构不再承载真实实现，旧路径不再产生新债，最终无 active legacy debt。

这不是重写 Andy Engine，也不是加新功能。

这是一次有顺序的架构替换：

```text
legacy top-level implementation
  -> compatibility wrappers
  -> public API contract review
  -> controlled removal or intentional stable wrapper
  -> src-only canonical implementation
```

---

## 2. Final Target

最终代码库应满足：

```text
andy-engine/
|- src/                 # 唯一 canonical implementation
|- presets/             # domain preset data, intentionally outside src
|- examples/            # public examples
|- tests/               # architecture/unit/integration/core-loop/regression
|- docs/                # architecture contracts and audit reports
|- scripts/             # checks and release tooling
|- benchmarks/
|- native/
|- experiments/
|- index.js             # root public entry wrapper, if kept by package API
`- package.json
```

最终 `src/` 结构：

```text
src/
|- runtime/             # AndyWorld, clock, runtime config/context
|- canon/               # World facts and canon events
|- knowledge/           # who knows what
|- agent/               # agent runtime, psychology, memory, schedule
|- pressure/            # read-only behavior pressure sources
|- action/              # candidates, scoring, selection, reason trace
|- effects/             # effect results, deltas, committers
|- narrative/           # grounding and claim validation
|- spatial/             # location graph/index
|- social/              # relationship graph
|- domain/              # domain contracts and validation
|- store/               # persistence and serialization
|- sdk/                 # public API implementation
`- shared/              # ids, time, errors, rng, schemas
```

---

## 3. Non-Negotiable Rules

### 3.1 No Capability Regression

Retirement work must not remove current capabilities unless explicitly marked as breaking-change work.

Must preserve:

- `new AndyEngine()`
- `new AndyEngine({ domain })`
- `createCharacter()`
- `addAgent()`
- SDK Character flow
- facts public export until intentionally retired
- domain public export
- store public export
- default campus preset
- tavern custom domain
- seeded RNG baseline
- action selection modes
- grounded narrative checks

### 3.2 No New Feature Expansion

This plan does not authorize:

- StoryArc runtime
- Adventure / RPG mechanics
- PlayerAgent
- QuestSystem
- ItemSystem
- Fantasy/Cultivation domain
- Bobby product behavior
- Andy Town UI/map behavior
- plugin system
- ECS rewrite
- Rust rewrite
- TypeScript migration
- npm publish

### 3.3 Wrapper Discipline

A wrapper is allowed only when it satisfies all conditions:

- It contains no business logic.
- It re-exports canonical `src/` implementation.
- It is listed in `MODULE_MAP.md` or `API_BOUNDARY.md`.
- It has a retirement policy: keep as public stable path, deprecate, or delete.

### 3.4 Dependency Direction

Final dependency direction:

```text
domain / presets / config
  -> runtime
  -> canon
  -> knowledge
  -> agent state / pressure
  -> action
  -> canon event
  -> effects
  -> narrative / grounding
  -> sdk / examples / apps
```

Forbidden:

- `src/action` directly mutating agent/world state
- `src/narrative` writing canon facts
- `src/sdk` mutating internals
- `src/domain` importing runtime/agent/facts/narrative
- extension/product terms entering engine core
- old top-level directories gaining new implementation logic

---

## 4. Current Dual-Track Reality

The current codebase is already partially migrated:

```text
src/                     canonical target exists
agent/action/            legacy wrapper / compatibility path
facts/                   mixed public compatibility + legacy path
core/                    runtime compatibility wrappers and remaining public helpers
config/domain/social/... legacy public wrappers
sdk/                     public wrappers
store/                   public wrappers + legacy store modules
```

This plan retires those legacy paths in a safe order.

---

## 5. Phase Order

The retirement order is deliberately not the same as directory order.

Recommended sequence:

```text
Phase 1  Action Layer Retirement
Phase 2  Facts Split Retirement
Phase 3  Effects and Pressure Retirement
Phase 4  Runtime/Core Retirement
Phase 5  Domain and Config Retirement
Phase 6  Spatial, Social, and Store Retirement
Phase 7  Agent Psychology/Memory/Schedule Migration
Phase 8  Agent Runtime Containment
Phase 9  SDK Retirement
Phase 10 Public API Contract Finalization
Phase 11 Legacy Directory Removal
Phase 12 Final No-Old-Debt Audit
```

Rationale:

- retire low-risk internal wrappers first
- then stabilize canon/knowledge/narrative authority
- then stabilize effects/writeback
- then retire runtime/core
- only then touch high-risk agent and SDK surfaces

---

## 6. Phase 1: Action Layer Retirement

### Goal

Retire `agent/action/` as an implementation location. `src/action/` becomes the only action implementation.

### Current Paths

```text
agent/action/*
src/action/*
```

### Target

```text
src/action/*          canonical
agent/action/*        wrapper or removed
```

### Allowed Work

- Ensure all implementation lives in `src/action`.
- Convert `agent/action/*` files to minimal re-export wrappers.
- Update internal imports to use `src/action`.
- Keep old import paths only if package/public compatibility requires them.
- Add architecture tests proving action does not import effects committer or mutate state.

### Forbidden Work

- Do not change candidate scoring semantics.
- Do not change UtilitySelector randomness semantics.
- Do not add new action types.
- Do not connect WorldObject to action if not already connected.
- Do not let action write memory/facts/relationship.

### Required Tests

```bash
npm test
npm run check:boundaries
npx vitest run tests/action-layer.test.js tests/unit/utility-selector.test.js
```

### Exit Gate

- `agent/action/*` contains no business logic.
- `src/action/*` is canonical.
- action layer boundary checks pass.
- same-seed action selection tests pass.

---

## 7. Phase 2: Facts Split Retirement

### Goal

Retire `facts/` as a mixed implementation directory by splitting it into canon, knowledge, and narrative responsibilities.

### Current Paths

```text
facts/WorldFactStore.js       -> src/canon/WorldFactStore.js
facts/FactSchema.js           -> src/canon/FactSchema.js
facts/CanonEventPipeline.js   -> src/canon/CanonEventPipeline.js
facts/KnowledgeStore.js       -> src/knowledge/KnowledgeStore.js
facts/FactProvider.js         -> src/narrative/FactProvider.js
facts/FactConsistencyChecker.js -> src/narrative/FactConsistencyChecker.js
facts/FactFormatter.js        -> src/narrative/FactFormatter.js
facts/index.js                -> compatibility export
```

### Target

```text
src/canon/*        world truth authority
src/knowledge/*    who knows what
src/narrative/*    grounding and claim validation
facts/*            wrapper only, or stable public compatibility export
```

### Allowed Work

- Update runtime imports to `src/canon` and `src/knowledge`.
- Update narrative imports to `src/narrative`.
- Keep `facts/index.js` as public compatibility facade if needed.
- Document each `facts` export as stable, experimental, deprecated, or internal.
- Expand boundary script to prevent canon/knowledge/narrative cross-layer regressions.

### Forbidden Work

- Do not change fact schema behavior.
- Do not alter knowledge propagation semantics.
- Do not let narrative write facts.
- Do not let canon import narrative.
- Do not remove `andy-engine/facts` until public API contract is finalized.

### Required Tests

```bash
npm test
npm run check:boundaries
npx vitest run tests/facts/*.test.js tests/integration/fact-system-slice.test.js
```

### Exit Gate

- `facts/` contains no canonical implementation except documented public facade.
- `src/canon` is the only world fact authority.
- `src/knowledge` owns local knowledge.
- `src/narrative` owns grounding/claim validation.
- `CanonEventPipeline` is the only dispatched-event -> fact main path.

---

## 8. Phase 3: Effects and Pressure Retirement

### Goal

Retire root `effects/` and `core/WorldPressure.js` as implementation locations.

### Current Paths

```text
effects/EventEffectPipeline.js      -> src/effects/EventEffectPipeline.js
core/WorldPressure.js               -> src/pressure/WorldPressure.js
```

### Target

```text
src/effects/*       canonical effect/delta/committer layer
src/pressure/*      canonical read-only pressure layer
effects/*           wrapper only or removed
core/WorldPressure  wrapper only or removed
```

### Allowed Work

- Move all effect implementation to `src/effects`.
- Move all pressure implementation to `src/pressure`.
- Convert old paths to wrappers.
- Add effect result and delta contract tests.
- Add pressure purity tests.

### Forbidden Work

- Do not change writeback semantics.
- Do not let pressure mutate state.
- Do not let effects invent canon facts.
- Do not let action call committer directly.

### Required Tests

```bash
npm test
npm run check:boundaries
npx vitest run tests/unit/effect-delta-contract.test.js tests/unit/pressure-layer.test.js
```

### Exit Gate

- `src/effects` owns effect computation and committer contracts.
- `src/pressure` contains pure read-only calculators.
- no active implementation remains in root `effects/` or `core/WorldPressure.js`.

---

## 9. Phase 4: Runtime/Core Retirement

### Goal

Retire `core/` as runtime implementation owner. `src/runtime` becomes canonical.

### Current Paths

```text
core/World.js        -> src/runtime/AndyWorld.js
core/Simulator.js    -> src/runtime/AndyWorld.step / runtime orchestration
core/RNG.js          -> src/shared/rng.js
core/EventDispatcher.js -> runtime/canon/effects split or runtime module
core/AndyBridge.js   -> sdk/narrative boundary review
core/StoryGenerator.js -> narrative boundary review
```

### Target

```text
src/runtime/*      canonical runtime orchestration
src/shared/rng.js  canonical RNG
core/*             wrappers only, or deleted if not public
```

### Allowed Work

- Route root `core/World.js` and `core/Simulator.js` to `src/runtime`.
- Move RNG to `src/shared/rng.js`.
- Split remaining `core` helpers into target layers or wrappers.
- Add runtime tests for `AndyWorld.step()`.
- Preserve `new AndyEngine()` behavior.

### Forbidden Work

- Do not change tick order.
- Do not change default weather/event semantics without regression tests.
- Do not mix SDK expression code into runtime.
- Do not delete old core paths before package compatibility tests pass.

### Required Tests

```bash
npm test
npm run test:compat
npm run check:boundaries
npx vitest run tests/runtime/runtime.test.js tests/integration/engine.test.js
```

### Exit Gate

- `src/runtime/AndyWorld.js` is canonical runtime.
- `core/World.js` and `core/Simulator.js` are wrappers or intentionally removed.
- no core module owns canon/effects/narrative implementation.

---

## 10. Phase 5: Domain and Config Retirement

### Goal

Retire root `domain/` and `config/` as implementation owners while preserving public domain API.

### Current Paths

```text
domain/*        -> src/domain/*
config/*        -> src/config/*
```

### Target

```text
src/domain/*    canonical domain contracts
src/config/*    canonical defaults/validation
domain/*        public compatibility wrapper
config/*        public compatibility wrapper
```

### Allowed Work

- Move implementation to `src/domain` and `src/config`.
- Keep public exports stable.
- Update internal imports to `src/domain` and `src/config`.
- Ensure presets still work.
- Ensure package export docs match implementation.

### Forbidden Work

- Do not change domain schema behavior.
- Do not weaken `validateDomain`.
- Do not hardcode campus/tavern/Oak Town in src core layers.
- Do not remove `andy-engine/domain` or `andy-engine/config/defaults` without API decision.

### Required Tests

```bash
npm run test:domain
npm run test:compat
npm run smoke:pack
npm run check:boundaries
```

### Exit Gate

- all canonical implementation is in `src/domain` / `src/config`.
- root paths are wrappers or documented public stable paths.
- domain tests pass unchanged.

---

## 11. Phase 6: Spatial, Social, and Store Retirement

### Goal

Retire root `spatial/`, `social/`, and `store/` as implementation owners.

### Current Paths

```text
spatial/*    -> src/spatial/*
social/*     -> src/social/*
store/*      -> src/store/* plus legacy store compatibility
```

### Target

```text
src/spatial/*   canonical spatial implementation
src/social/*    canonical social graph implementation
src/store/*     canonical serialization/persistence boundary
root paths      wrappers or documented public compatibility
```

### Allowed Work

- Convert root spatial/social files to wrappers.
- Convert root store public exports to wrappers where possible.
- Preserve `createStore()` and `createMemoryStore()` behavior.
- Add serialization boundary tests.

### Forbidden Work

- Do not change SQLite behavior without store migration tests.
- Do not make store import runtime internals.
- Do not make social/spatial import sdk/narrative.
- Do not delete public store API.

### Required Tests

```bash
npm test
npm run test:compat
npm run smoke:pack
npx vitest run tests/spatial.test.js tests/unit/social.test.js tests/store-serialization.test.js
```

### Exit Gate

- canonical implementation lives under `src/spatial`, `src/social`, `src/store`.
- root paths are wrappers/public facades.
- persistence and serialization tests pass.

---

## 12. Phase 7: Agent Psychology / Memory / Schedule Migration

### Goal

Move canonical psychology, memory, and schedule implementation into `src/agent/*`.

### Current Paths

```text
agent/BehaviorField.js       -> src/agent/psychology/BehaviorField.js
agent/EmotionVector.js       -> src/agent/psychology/EmotionVector.js
agent/EmotionRegulation.js   -> src/agent/psychology/EmotionRegulation.js
agent/NeedsSystem.js         -> src/agent/psychology/NeedsSystem.js
agent/Personality.js         -> src/agent/psychology/Personality.js
agent/PersonalMemory.js      -> src/agent/memory/PersonalMemory.js
agent/ProceduralMemory.js    -> src/agent/memory/ProceduralMemory.js
agent/Schedule.js            -> src/agent/schedule/Schedule.js
```

### Target

```text
src/agent/psychology/*    canonical psychology implementation
src/agent/memory/*        canonical memory implementation
src/agent/schedule/*      canonical schedule implementation
agent/*                   wrappers or Agent facade only
```

### Allowed Work

- Move one subsystem at a time.
- Keep old import path wrappers.
- Preserve numerical behavior.
- Add before/after regression tests where needed.

### Forbidden Work

- Do not alter BehaviorField dynamics.
- Do not alter EmotionVector decay/noise semantics.
- Do not alter ACT-R retrieval behavior.
- Do not alter schedule jitter semantics.
- Do not combine with Agent.js handler refactor.

### Required Tests

```bash
npm test
npm run check:boundaries
npx vitest run tests/behavior-field.test.js tests/unit/emotion.test.js tests/unit/memory.test.js tests/unit/personality.test.js
```

### Exit Gate

- psychology/memory/schedule implementations are canonical in `src/agent`.
- root agent subsystem files are wrappers only.
- numerical tests and seeded replay tests pass.

---

## 13. Phase 8: Agent Runtime Containment

### Goal

Contain `agent/Agent.js` as a legacy facade and move orchestration into `src/agent/AgentRuntime.js` and handlers.

### Current Paths

```text
agent/Agent.js
src/agent/AgentRuntime.js
src/agent/handlers/*
```

### Target

```text
src/agent/AgentRuntime.js       canonical runtime for agent
src/agent/handlers/*            handler seams
agent/Agent.js                  legacy facade only
```

### Handler Migration Order

1. `SocialHandler`
2. `MindWanderHandler`
3. `ReflectionHandler`
4. `HealthHandler`
5. `ScheduleHandler`
6. `PerceptionHandler`
7. `NeedsEmotionCoupler`
8. `ActionSelectionHandler`

### Allowed Work

- Extract one handler per commit.
- Preserve `Agent.tick()` order exactly.
- Add handler-level unit tests.
- Keep public Agent API compatible.

### Forbidden Work

- Do not reorder tick steps.
- Do not change psychological semantics.
- Do not move multiple handlers in one risky commit.
- Do not introduce a generic framework or over-abstracted pipeline.

### Required Tests

```bash
npm test
npm run check:boundaries
npm run perf:check
npx vitest run tests/unit/handlers/*.test.js tests/integration/agent.test.js
```

### Exit Gate

- root `Agent.js` is facade/coordinator only.
- handler tests cover extracted behavior.
- no handler imports sdk/narrative/canon write APIs directly.

---

## 14. Phase 9: SDK Retirement

### Goal

Move SDK implementation to `src/sdk` and leave root `sdk/` as public wrapper only.

### Current Paths

```text
sdk/*      -> src/sdk/*
```

### Target

```text
src/sdk/*  canonical SDK implementation
sdk/*      public compatibility wrappers
```

### Allowed Work

- Move SDK implementation to `src/sdk`.
- Keep `andy-engine/sdk` stable.
- Keep `types` aligned with `src/sdk/types.d.ts` or public wrapper policy.
- Ensure SDK does not mutate internals.

### Forbidden Work

- Do not add product/Bobby behavior.
- Do not add UI or chat app logic.
- Do not expose internal src modules as stable unless documented.
- Do not remove current SDK public API without version policy.

### Required Tests

```bash
npm run test:compat
npm run smoke:pack
npx vitest run tests/sdk.test.js tests/sdk-custom-domain.test.js tests/package-boundary.test.js
```

### Exit Gate

- SDK root directory is wrapper-only.
- `src/sdk` is canonical.
- public SDK exports pass fresh-install smoke tests.

---

## 15. Phase 10: Public API Contract Finalization

### Goal

Decide which legacy paths remain public and which are deprecated/deleted.

### Required Decisions

| Path | Decision Needed |
|---|---|
| `andy-engine` | stable root public API |
| `andy-engine/sdk` | stable SDK facade |
| `andy-engine/domain` | stable public API |
| `andy-engine/facts` | stable, experimental, or deprecated |
| `andy-engine/store` | stable public API |
| `andy-engine/runtime` | stable or experimental |
| `andy-engine/src/*` | internal, experimental, or public |
| root folders like `agent/`, `core/`, `spatial/` | package-internal or deleted |

### Allowed Work

- Update `docs/API_BOUNDARY.md`.
- Update `package.json.exports`.
- Update package boundary tests.
- Mark deprecated paths clearly.

### Forbidden Work

- Do not publish accidental internals as stable.
- Do not delete established public paths without migration policy.
- Do not let docs and package exports drift.

### Required Tests

```bash
npm run test:compat
npm run smoke:pack
npm run release:check
```

### Exit Gate

- every exported path has documented stability.
- every bundled internal path has a reason.
- package tarball matches API boundary doc.

---

## 16. Phase 11: Legacy Directory Removal

### Goal

Remove old top-level directories that are no longer public or necessary.

### Candidate Deletions

```text
agent/action/       after action public compatibility decision
facts/              after facts API decision
core/               after runtime/core public compatibility decision
config/             if config exports point to src/config
spatial/            if no public compatibility needed
social/             if no public compatibility needed
store/              if store exports point to src/store and legacy store is migrated
sdk/                only if package exports no longer require root sdk dir
```

### Allowed Work

- Delete one legacy directory at a time.
- Keep root `index.js` if public API requires it.
- Keep explicit wrappers where package exports require stable paths.
- Update tests and package files in the same commit.

### Forbidden Work

- Do not delete multiple public surfaces in one commit.
- Do not delete wrappers without smoke test.
- Do not mix deletion with behavior changes.

### Required Tests

```bash
npm test
npm run test:compat
npm run smoke:pack
npm run release:check
```

### Exit Gate

- no unused legacy implementation directories remain.
- remaining old paths are intentional public wrappers.
- `KNOWN_BOUNDARY_VIOLATIONS.md` has no active legacy directory debt.

---

## 17. Phase 12: Final No-Old-Debt Audit

### Goal

Prove that Andy Engine has completed Clean Architecture Retirement Pass v0.2.

### Audit Checklist

- no active boundary violation
- no undocumented legacy implementation
- no old top-level implementation owning canonical logic
- no direct SDK/internal mutation
- no action direct state write
- no narrative fact write
- no domain-specific vocabulary in core runtime layers
- no unplanned package export
- no doc/package/test drift
- no untracked generated artifact
- performance baseline acceptable

### Deliverables

```text
docs/CLEAN_ARCHITECTURE_AUDIT.md
updated docs/KNOWN_BOUNDARY_VIOLATIONS.md
updated docs/MODULE_MAP.md
updated docs/API_BOUNDARY.md
```

### Required Tests

```bash
npm test
npm run test:domain
npm run test:compat
npm run check:boundaries
npm run smoke:pack
npm run perf:check
npm run release:check
git diff --check
```

### Exit Gate

Clean Architecture Retirement Pass v0.2 is complete only when:

- old architecture no longer owns canonical implementation
- `src/` is the canonical implementation tree
- remaining legacy paths are intentional public wrappers
- all known active debts are closed
- final audit document is accepted

---

## 18. Commit Strategy

Use small commits per phase.

Commit types:

```text
refactor: retire action legacy wrappers
refactor: split facts into canon knowledge narrative
refactor: retire effects and pressure legacy paths
refactor: route core runtime through src/runtime
refactor: move domain and config implementation to src
refactor: retire spatial social store legacy implementations
refactor: migrate agent psychology memory schedule to src
refactor: contain Agent runtime behind handlers
refactor: move SDK implementation to src
chore: finalize public API boundary
chore: remove retired legacy directories
docs: add clean architecture audit
```

Rules:

- directory move commits must not include behavior changes
- behavior-preserving wrapper commits must include migration tests
- package export commits must include smoke pack validation
- deletion commits must include package-boundary tests
- every phase ends with `release:check`

---

## 19. Working Agreement for Execution AI

When an execution AI works from this plan, it must:

1. State the phase it is executing.
2. List allowed files before editing.
3. Refuse to add product features.
4. Preserve public compatibility unless the phase explicitly authorizes removal.
5. Run required tests.
6. Report changed files, tests, remaining debt, and whether the phase exit gate passed.

If a phase requires changing public API, it must stop and ask for explicit approval.

---

## 20. Final Phrase

> Andy Engine becomes clean when `src/` owns all canonical implementation, legacy top-level paths are either gone or intentional public wrappers, and every world-facing consequence flows through explicit canon, knowledge, action, effects, narrative, and SDK boundaries.
