# Andy Engine Clean Architecture Pass v0.1

> 中文名：Andy 引擎清洁架构整理 v0.1
>
> 目标：把 Andy Engine 从一个能跑的研究原型，整理成边界清楚、模块干净、债务可控并最终无旧债的 engine codebase。
>
> 原则：不靠口头约定维持架构，不靠 AI 记忆维持边界；所有模块责任、依赖方向、迁移顺序、测试门禁和债务处理都必须写进代码库，并由脚本和测试持续守住。

---

## 1. One-Sentence Goal

Andy Engine Clean Architecture Pass v0.1 的一句话目标：

> 不改变 Andy Engine 的核心能力语义，通过阶段化整理、边界固化、目录迁移、状态写回收敛和 API 收敛，把项目变成一个可长期演化的 Persistent World Engine codebase。

这个 pass 不是一次重写，也不是一次功能扩张。它是一条从现有结构到目标结构的完整工程路线。

最终验收不是“看起来更整洁”，而是：

- 旧债全部清零，或转化为明确的兼容层并有删除门禁。
- 新债被自动禁止。
- 模块边界由文档、脚本、测试共同约束。
- 核心循环可独立验证。
- 高风险文件停止膨胀，并被拆成可测试的 seam。
- 对外 API 收敛到少数稳定入口。
- 上层应用、demo、Bobby、Andy Town、RPG/Adventure 扩展不再污染 engine core。

---

## 2. Clean Architecture Definition

本项目里的“干净”不是抽象审美，而是以下可验证条件。

### 2.1 Debt Visibility

每一项债务必须满足：

- 有唯一编号。
- 有当前位置。
- 有风险说明。
- 有计划阶段。
- 有允许清理方式。
- 有禁止清理方式。
- 有验证命令。
- 有停止条件。

没有登记的债务视为架构 bug。

### 2.2 Debt Closure

最终目标不是“债务可见就算完成”，而是：

- legacy compatibility wrapper 只允许短期存在。
- 每个 wrapper 必须有删除条件。
- 每个 accepted exception 必须被迁移阶段覆盖。
- `KNOWN_BOUNDARY_VIOLATIONS.md` 最终只保留历史记录，不保留 active violation。

### 2.3 Boundary Enforcement

每条关键边界必须同时有三层保护：

1. 文档说明：人能读懂。
2. source scan / boundary script：机器能检查。
3. regression test：行为不会回退。

如果某条规则无法自动检查，文档必须说明原因，并列为人工审查项。

### 2.4 Runtime Semantics Preservation

清洁架构整理必须保持 Andy 的核心语义：

- BehaviorField 仍是连续心理场核心。
- Action selection 只能在合理候选中选择，不能绕过心理场。
- CanonEvent 是世界事实入口。
- EffectPipeline 负责后果和 delta。
- LLM 只做 grounded expression，不拥有事实权。
- Domain preset 仍是世界规则来源。

---

## 3. Target Architecture

目标目录结构如下。该结构是 Clean Architecture Pass 的终点，不是示意图。

```text
andy-engine/
|
|- src/
|  |
|  |- runtime/                    # 引擎运行时编排层
|  |  |- AndyWorld.js             # 对内主 runtime
|  |  |- Simulator.js
|  |  |- WorldClock.js
|  |  |- RuntimeContext.js
|  |  `- RuntimeConfig.js
|  |
|  |- canon/                      # 世界事实权：世界里什么是真的
|  |  |- WorldCanon.js
|  |  |- WorldFactStore.js
|  |  |- FactSchema.js
|  |  |- CanonEvent.js
|  |  |- CanonEventPipeline.js
|  |  `- FactQuery.js
|  |
|  |- knowledge/                  # 角色局部知识：谁知道什么
|  |  |- KnowledgeStore.js
|  |  |- ObservationBuilder.js
|  |  |- KnowledgeProjection.js
|  |  `- VisibilityPolicy.js
|  |
|  |- agent/                      # 角色状态，不做世界事实权
|  |  |- AgentState.js
|  |  |- AgentProfile.js
|  |  |- AgentRuntime.js
|  |  |- psychology/
|  |  |  |- Personality.js
|  |  |  |- EmotionVector.js
|  |  |  |- EmotionRegulation.js
|  |  |  |- NeedsSystem.js
|  |  |  `- BehaviorField.js
|  |  |- memory/
|  |  |  |- PersonalMemory.js
|  |  |  `- ProceduralMemory.js
|  |  `- schedule/
|  |     `- Schedule.js
|  |
|  |- pressure/                   # 状态 -> 行为压力
|  |  |- WorldPressure.js
|  |  |- NeedPressure.js
|  |  |- MemoryPressure.js
|  |  |- RelationshipPressure.js
|  |  `- LocationPressure.js
|  |
|  |- action/                     # 行为候选与选择，不直接改世界
|  |  |- CandidateProvider.js
|  |  |- UtilityScorer.js
|  |  |- UtilitySelector.js
|  |  |- ReasonTrace.js
|  |  `- SelectedAction.js
|  |
|  |- effects/                    # 事件后果：事件改变什么
|  |  |- EventEffectPipeline.js
|  |  |- EffectResult.js
|  |  |- StateDelta.js
|  |  |- MemoryEffectHandler.js
|  |  |- LocationMeaningEffectHandler.js
|  |  |- FutureTendencyEffectHandler.js
|  |  |- RelationshipEffectHandler.js
|  |  `- EffectCommitter.js
|  |
|  |- narrative/                  # 受限表达 / LLM grounding
|  |  |- GroundingPackageBuilder.js
|  |  |- FactProvider.js
|  |  |- FactConsistencyChecker.js
|  |  |- ClaimValidator.js
|  |  `- NarrativeAdapter.js
|  |
|  |- spatial/                    # 地点 / 空间 / 地点意义
|  |  |- LocationGraph.js
|  |  |- LocationMeaningStore.js
|  |  |- SpatialIndex.js
|  |  `- RouteQuery.js
|  |
|  |- social/                     # 关系 / 社交图
|  |  |- RelationshipStore.js
|  |  |- SocialGraph.js
|  |  `- SocialSignal.js
|  |
|  |- domain/                     # 世界规则 / preset / domain compiler
|  |  |- DomainConfig.js
|  |  |- WorldRules.js
|  |  |- PresetCompiler.js
|  |  `- DomainRegistry.js
|  |
|  |- store/                      # persistence / serialization
|  |  |- SnapshotStore.js
|  |  |- SaveLoad.js
|  |  `- Serialization.js
|  |
|  |- sdk/                        # 对外 API
|  |  |- AndyEngine.js
|  |  |- Character.js
|  |  |- AdventureAdapter.js
|  |  `- index.js
|  |
|  `- shared/                     # 跨层共享协议，不含业务逻辑
|     |- ids.js
|     |- time.js
|     |- errors.js
|     |- rng.js
|     `- schemas/
|        |- CanonEvent.schema.js
|        |- WorldFact.schema.js
|        |- KnowledgeFact.schema.js
|        |- StateDelta.schema.js
|        `- GroundingPackage.schema.js
|
|- presets/
|  |- campus/
|  `- tavern/
|
|- examples/
|  |- core-loop-tavern-slice.js
|  `- basic-world.js
|
|- tests/
|  |- architecture/
|  |- unit/
|  |- integration/
|  |- core-loop/
|  `- regression/
|
|- docs/
|  |- MODULE_MAP.md
|  |- ARCHITECTURE_BOUNDARIES.md
|  |- CLEAN_ARCHITECTURE_PLAN.md
|  |- KNOWN_BOUNDARY_VIOLATIONS.md
|  `- CORE_LOOP_SLICE_REPORT.md
|
|- scripts/
|- benchmarks/
|- native/
`- experiments/
```

---

## 4. Dependency Direction

目录形状不如依赖方向重要。Clean Architecture Pass 的核心依赖方向是：

```text
domain / presets / config
      |
      v
runtime
      |
      v
canon
      |
      v
knowledge
      |
      v
agent state / pressure
      |
      v
action selection
      |
      v
canon event
      |
      v
effects
      |
      v
narrative / grounding
      |
      v
sdk / examples / apps
```

更严格地说：

- `domain` 定义规则，不拥有运行状态。
- `runtime` 编排世界，不拥有业务语义。
- `canon` 决定世界事实，不做表达。
- `knowledge` 决定谁知道什么，不改变事实本身。
- `agent` 维护角色内部状态，不写世界事实。
- `pressure` 把状态转换成行为压力，不选择动作。
- `action` 选择意图，不直接提交后果。
- `effects` 把事件转成 delta，并由 committer 统一写回。
- `narrative` 只表达 grounded facts，不新增事实。
- `sdk` 只调用稳定 public API，不访问内部状态对象。

---

## 5. Current-to-Target Mapping

| Current Path | Target Path | Target Layer | Notes |
|---|---|---|---|
| `index.js` | `src/sdk/AndyEngine.js` + root compatibility export | sdk/runtime | root export remains compatibility wrapper until final API switch |
| `core/World.js` | `src/runtime/AndyWorld.js` | runtime | should own subsystems via narrow interfaces |
| `core/Simulator.js` | `src/runtime/Simulator.js` | runtime | scheduling only, not semantics |
| `core/RNG.js` | `src/shared/rng.js` | shared | deterministic random source |
| `core/EventDispatcher.js` | `src/runtime/EventDispatcher.js` or split into canon/effects | runtime/canon | dispatch and semantic conversion must split |
| `facts/WorldFactStore.js` | `src/canon/WorldFactStore.js` | canon | fact storage authority |
| `facts/FactSchema.js` | `src/canon/FactSchema.js` | canon | later replaced by shared schema + canon validators |
| `facts/CanonEventPipeline.js` | `src/canon/CanonEventPipeline.js` | canon | dispatched event -> fact |
| `facts/KnowledgeStore.js` | `src/knowledge/KnowledgeStore.js` | knowledge | agent-specific knowledge |
| `facts/FactProvider.js` | `src/narrative/GroundingPackageBuilder.js` | narrative | grounding construction |
| `facts/FactConsistencyChecker.js` | `src/narrative/FactConsistencyChecker.js` | narrative | claim validation |
| `effects/EventEffectPipeline.js` | `src/effects/EventEffectPipeline.js` | effects | canonical implementation |
| `core/EventEffectPipeline.js` | deleted or legacy re-export | compatibility | delete after public import migration |
| `core/WorldPressure.js` | `src/pressure/WorldPressure.js` | pressure | read-only pressure source |
| `agent/action/*` | `src/action/*` | action | candidate/score/select/reason trace |
| `agent/Agent.js` | `src/agent/AgentRuntime.js` + handlers | agent | split without changing tick order |
| `agent/BehaviorField.js` | `src/agent/psychology/BehaviorField.js` | agent/psychology | behavior field stays core psychological primitive |
| `agent/EmotionVector.js` | `src/agent/psychology/EmotionVector.js` | agent/psychology | emotion pipeline |
| `agent/NeedsSystem.js` | `src/agent/psychology/NeedsSystem.js` | agent/psychology | needs state and recovery |
| `agent/PersonalMemory.js` | `src/agent/memory/PersonalMemory.js` | agent/memory | memory as internal agent state |
| `agent/ProceduralMemory.js` | `src/agent/memory/ProceduralMemory.js` | agent/memory | habit memory |
| `agent/Schedule.js` | `src/agent/schedule/Schedule.js` | agent/schedule | no campus data |
| `social/*` | `src/social/*` | social | relationship subsystem |
| `spatial/*` | `src/spatial/*` | spatial | location graph/index |
| `domain/*` | `src/domain/*` | domain | domain contracts and validation |
| `presets/*` | `presets/*` | presets | remains outside src as data package |
| `store/*` | `src/store/*` | store | persistence |
| `sdk/*` | `src/sdk/*` | sdk | public API surface |

---

## 6. Architecture Rules

### 6.1 Fact Authority

Only canon-layer modules may create, update, invalidate, or query canonical world facts.

Allowed final writers:

- `src/canon/WorldCanon.js`
- `src/canon/WorldFactStore.js`
- `src/canon/CanonEventPipeline.js`

`FactEmitter` is a transitional tool and must either become a canon helper or disappear.

### 6.2 Knowledge Boundary

Knowledge is not memory.

- `knowledge` answers: who knows what?
- `memory` answers: how does this agent remember and get influenced by it?

No event automatically becomes universal knowledge.

### 6.3 Action Boundary

`action` may produce:

- `ActionCandidate`
- `ScoreBreakdown`
- `SelectedAction`
- `ReasonTrace`

`action` must not:

- mutate memory
- mutate relationship
- mutate emotion
- mutate needs
- create facts
- write event log directly

### 6.4 Effect Boundary

`effects` may compute:

- `StateDelta`
- `MemoryDelta`
- `RelationshipDelta`
- `LocationMeaningDelta`
- `FutureTendencyDelta`
- `EffectResult`

Only `EffectCommitter` may apply allowed deltas to live state.

### 6.5 Narrative Boundary

`narrative` may:

- build grounding packages
- validate claims
- project facts into expression context
- call LLM adapters through controlled inputs

`narrative` must not:

- create canon facts
- mutate knowledge
- mutate memory
- invent location/relationship/event claims

### 6.6 SDK Boundary

`sdk` must call public seams only.

Forbidden:

- `agent.memory.addExperience`
- `relationship.strength +=`
- direct fact store mutation
- direct knowledge store mutation
- direct `Agent` private field mutation

### 6.7 Domain Boundary

Domain config owns world-specific vocabulary and rules.

Forbidden in core layers:

- campus-only terms
- tavern-only terms
- Oak Town terms
- RPG/fantasy/cultivation terms
- Bobby/Andy Town UI terms

---

## 7. Pass Phases

The pass is divided into ordered phases. Each phase has a clear entry condition, allowed work, forbidden work, deliverables, tests, and exit gate.

### Phase 1: Baseline Freeze and Inventory

**Goal**: freeze the current verified baseline and make the current state inspectable.

**Entry condition**:

- working tree clean
- latest commits pushed or explicitly marked local-only
- `npm run release:check` passes

**Allowed work**:

- create architecture inventory
- record current module locations
- record known wrappers and accepted exceptions
- verify package contents
- verify public exports

**Forbidden work**:

- moving files
- changing runtime semantics
- adding public API
- implementing new systems

**Deliverables**:

- `docs/MODULE_MAP.md`
- updated `docs/ARCHITECTURE_SNAPSHOT.md`
- current package export table
- current dependency graph summary

**Tests / checks**:

```bash
npm run release:check
npm run smoke:pack
git diff --check
```

**Exit gate**:

- every existing file has a logical target layer
- every known wrapper is listed
- every active exception has a planned removal phase

---

### Phase 2: Boundary Scanner Hardening

**Goal**: make architecture rules executable.

**Entry condition**:

- Phase 1 module map accepted

**Allowed work**:

- extend `scripts/check-boundaries.js`
- extend `tests/architecture/`
- add source-scan allowlists only with explicit comments
- add checks for resolved debt regression

**Forbidden work**:

- making scanner so strict that current accepted exceptions fail without a planned phase
- weakening existing checks to pass
- adding runtime behavior to satisfy scanner

**Required checks**:

- `action` cannot import `effects` committer or state mutation modules
- `narrative` cannot import canon write APIs
- `facts` / `canon` cannot import narrative
- `sdk` cannot direct-write memory, relationship, facts, knowledge
- `domain` cannot import runtime/agent/facts/narrative
- extension terms cannot appear in core layers
- new deterministic paths cannot use `Math.random()` / `Date.now()`

**Deliverables**:

- stronger `scripts/check-boundaries.js`
- architecture regression tests for every enforced rule
- updated `docs/ARCHITECTURE_BOUNDARIES.md`

**Tests / checks**:

```bash
npm run check:boundaries
npm test
git diff --check
```

**Exit gate**:

- every resolved violation has an automated regression guard
- every accepted exception is either enforced by allowlist or listed in docs

---

### Phase 3: Stable Public/Private Contract Split

**Goal**: separate public API from internal implementation before moving directories.

**Entry condition**:

- Phase 2 boundary scanner passes

**Allowed work**:

- define public API table
- define internal-only module table
- add compatibility wrapper policy
- add export tests
- document package boundary

**Forbidden work**:

- exporting experimental internals as stable API
- removing existing public imports without deprecation path
- changing package name or npm publish policy

**Deliverables**:

- `docs/API_BOUNDARY.md`
- updated `tests/package-boundary.test.js`
- public export smoke tests
- internal module list

**Tests / checks**:

```bash
npm run test:compat
npm run smoke:pack
npm run release:check
```

**Exit gate**:

- every published file is intentionally public or intentionally bundled as internal dependency
- every compatibility wrapper has owner and removal condition

---

### Phase 4: Canon / Knowledge / Narrative Split

**Goal**: split current `facts/` into logical canon, knowledge, and narrative responsibilities without changing behavior.

**Entry condition**:

- public/private contract recorded
- boundary scanner ready for canon/knowledge/narrative rules

**Allowed work**:

- introduce `src/canon/`, `src/knowledge/`, `src/narrative/` or transitional directories
- move `WorldFactStore`, `FactSchema`, `CanonEventPipeline` to canon
- move `KnowledgeStore` to knowledge
- move `FactProvider`, `FactConsistencyChecker`, `FactFormatter` to narrative
- leave compatibility re-exports from old `facts/`

**Forbidden work**:

- changing fact schema semantics
- changing knowledge propagation semantics
- changing LLM prompt behavior
- deleting old `facts/` import paths before compatibility tests pass

**Deliverables**:

- canon module directory
- knowledge module directory
- narrative module directory
- compatibility exports
- migration notes

**Tests / checks**:

```bash
npm test
npm run check:boundaries
npm run smoke:pack
```

**Exit gate**:

- no canon module imports narrative
- no narrative module writes canon facts
- old facts imports still work or fail only where documented

---

### Phase 5: Effect Result and Delta Contract

**Goal**: make all world-facing consequences delta-first.

**Entry condition**:

- canon/knowledge/narrative split complete

**Allowed work**:

- introduce `EffectResult`
- introduce `StateDelta`
- introduce `MemoryDelta`
- introduce `RelationshipDelta`
- introduce `LocationMeaningDelta`
- introduce `EffectCommitter`
- route new consequence logic through committer

**Forbidden work**:

- direct state writes from action/narrative/sdk
- changing old behavior without regression tests
- applying deltas without reason trace

**Deliverables**:

- `src/effects/EffectResult.js`
- `src/effects/StateDelta.js`
- `src/effects/EffectCommitter.js`
- effect contract tests
- reasonTrace delta snapshots

**Tests / checks**:

```bash
npm test
npm run check:boundaries
npm run test:domain
```

**Exit gate**:

- every new world-facing consequence returns an effect result
- every committed delta is traceable to event/reasonTrace
- direct mutation sites are either removed or listed with deletion phase

---

### Phase 6: Pressure Layer Extraction

**Goal**: make behavior tendency sources explicit and composable.

**Entry condition**:

- effect result contract exists

**Allowed work**:

- move `WorldPressure` to pressure layer
- introduce pressure interfaces
- extract need/memory/relationship/location pressure calculators
- connect pressure outputs to UtilityScorer and BehaviorField through stable context

**Forbidden work**:

- letting pressure modules mutate state
- letting pressure modules select actions
- hardcoding domain terms in pressure modules

**Deliverables**:

- `src/pressure/WorldPressure.js`
- `src/pressure/NeedPressure.js`
- `src/pressure/MemoryPressure.js`
- `src/pressure/RelationshipPressure.js`
- `src/pressure/LocationPressure.js`
- pressure unit tests

**Tests / checks**:

```bash
npm test
npm run check:boundaries
```

**Exit gate**:

- pressure modules are pure/read-only
- UtilityScorer receives pressure context without reaching into world internals

---

### Phase 7: Action Layer Hardening

**Goal**: make action selection a clean layer between pressure and effects.

**Entry condition**:

- pressure layer extracted

**Allowed work**:

- formalize `ActionCandidate`
- formalize `SelectedAction`
- formalize `ReasonTrace`
- split candidate providers by source
- enforce scorer/selector purity

**Forbidden work**:

- action layer writing memory/facts/relationship
- action layer calling LLM
- action layer owning domain semantics

**Deliverables**:

- action layer contracts
- golden reasonTrace tests
- candidate provider coverage
- deterministic selection tests

**Tests / checks**:

```bash
npm test
npm run check:boundaries
npm run benchmark:quick
```

**Exit gate**:

- same seed + same world state produces same selected action trace
- selected action explains alternatives and score breakdown

---

### Phase 8: Agent Runtime Decomposition

**Goal**: stop `Agent.js` from being the place where every subsystem accumulates.

**Entry condition**:

- action/effects/pressure boundaries stable
- regression tests cover core agent loop

**Allowed work**:

- extract handlers one at a time
- preserve tick order exactly
- keep compatibility methods during migration
- add handler-level unit tests

**Forbidden work**:

- reordering `Agent.tick()`
- changing BehaviorField dynamics
- changing emotion/needs/memory semantics
- combining this with new features

**Handler order**:

1. `SocialHandler`
2. `MindWanderHandler`
3. `ReflectionHandler`
4. `HealthHandler`
5. `ScheduleHandler`
6. `PerceptionHandler`
7. `NeedsEmotionCoupler`
8. `ActionSelectionHandler`

**Deliverables**:

- `src/agent/AgentRuntime.js`
- `src/agent/handlers/*`
- handler unit tests
- before/after agent loop regression tests

**Tests / checks**:

```bash
npm test
npm run check:boundaries
npm run perf:check
```

**Exit gate**:

- `Agent.js` or replacement coordinator is orchestration-only
- each handler has test coverage
- no handler imports sdk/narrative/canon write APIs

---

### Phase 9: Runtime Orchestration Split

**Goal**: make runtime orchestration explicit and prepare `AndyWorld`.

**Entry condition**:

- Agent runtime decomposed

**Allowed work**:

- introduce `AndyWorld`
- introduce `RuntimeContext`
- introduce `WorldClock`
- introduce `RuntimeConfig`
- move world orchestration out of root `index.js`
- keep root API compatibility wrappers

**Forbidden work**:

- changing existing `new AndyEngine()` behavior
- removing old API before compatibility tests
- mixing SDK presentation logic into runtime

**Deliverables**:

- `src/runtime/AndyWorld.js`
- `src/runtime/RuntimeContext.js`
- `src/runtime/WorldClock.js`
- root compatibility API
- runtime tests

**Tests / checks**:

```bash
npm test
npm run test:compat
npm run smoke:pack
npm run release:check
```

**Exit gate**:

- `AndyWorld.step()` can drive the core loop
- old `AndyEngine` API delegates to runtime without behavior drift

---

### Phase 10: Store and Serialization Boundary

**Goal**: isolate persistence from runtime internals.

**Entry condition**:

- runtime layer stable

**Allowed work**:

- move store modules to target store layer
- define serialization contract
- ensure runtimeSnapshot remains opaque
- enforce migration pipeline outside runtime

**Forbidden work**:

- leaking private agent state into stable envelope
- adding DB logic into runtime
- making migration implicit inside tick

**Deliverables**:

- `src/store/Serialization.js`
- `src/store/SaveLoad.js`
- updated world state tests
- persistence boundary tests

**Tests / checks**:

```bash
npm test
npm run smoke:pack
npm run check:boundaries
```

**Exit gate**:

- save/load works through public serialization seams
- runtime consumes only current schema
- migration remains explicit external pipeline

---

### Phase 11: Directory Migration to `src/`

**Goal**: physically migrate from legacy root directories into final `src/` layout.

**Entry condition**:

- all logical boundaries stable
- package exports documented
- compatibility wrappers prepared

**Allowed work**:

- move one layer at a time
- keep old path re-exports
- update package files
- update source scans
- update docs

**Forbidden work**:

- moving multiple high-risk layers in one commit
- changing semantics while moving files
- deleting compatibility wrappers without version plan

**Migration order**:

1. `shared`
2. `domain`
3. `canon`
4. `knowledge`
5. `narrative`
6. `effects`
7. `pressure`
8. `action`
9. `agent`
10. `spatial`
11. `social`
12. `store`
13. `runtime`
14. `sdk`

**Tests / checks**:

```bash
npm test
npm run check:boundaries
npm run test:compat
npm run smoke:pack
npm run release:check
```

**Exit gate**:

- final directory tree exists
- old import paths either re-export or are removed in a versioned breaking-change phase
- package tarball contains intended final layout

---

### Phase 12: Compatibility Wrapper Retirement

**Goal**: remove transitional wrappers and finish old debt closure.

**Entry condition**:

- `src/` migration complete
- compatibility period defined
- downstream examples migrated

**Allowed work**:

- remove old root wrappers
- remove old `facts/`, `agent/action`, `effects/` root paths if replaced
- remove deprecated schedule static factories or mark as public legacy
- remove core wrappers

**Forbidden work**:

- removing public API without major-version policy
- keeping wrapper forever without owner

**Deliverables**:

- wrapper removal PRs
- package export migration notes
- changelog
- final `KNOWN_BOUNDARY_VIOLATIONS.md` cleanup

**Tests / checks**:

```bash
npm test
npm run test:compat
npm run smoke:pack
npm run release:check
```

**Exit gate**:

- no unplanned wrapper remains
- no active known boundary violation remains
- all compatibility exceptions have been closed or promoted to public API intentionally

---

### Phase 13: Final No-Old-Debt Audit

**Goal**: prove that the codebase has reached clean architecture v0.1.

**Entry condition**:

- compatibility wrappers retired or intentionally public
- all previous phase exit gates passed

**Audit dimensions**:

- dependency direction
- fact authority
- knowledge boundary
- action purity
- effect delta writeback
- narrative grounding
- SDK public seam only
- domain agnosticism
- deterministic source scope
- package boundary
- performance regression
- docs truth
- source scan

**Deliverables**:

- `docs/CLEAN_ARCHITECTURE_AUDIT.md`
- updated `docs/KNOWN_BOUNDARY_VIOLATIONS.md` with no active violations
- final `docs/MODULE_MAP.md`
- final `docs/ARCHITECTURE_BOUNDARIES.md`
- release readiness report

**Tests / checks**:

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

**Exit gate**:

- no active boundary violation
- no undocumented old debt
- no known high-risk direct mutation outside allowed committer/seam
- no package/doc mismatch
- core loop runnable and documented
- final audit accepted

---

## 8. Required Test Architecture

Clean Architecture Pass also reorganizes test intent.

```text
tests/
|- architecture/       # import direction, source-scan, public/private boundaries
|- unit/               # pure module behavior
|- integration/        # subsystem integration
|- core-loop/          # canonical closed-loop slices
`- regression/         # old behavior and compatibility guarantees
```

### 8.1 Architecture Tests

Must guard:

- import direction
- forbidden extension terms
- deterministic runtime paths
- SDK direct mutation
- narrative write access
- action direct write access
- canon authority
- package boundary

### 8.2 Core Loop Tests

Must prove:

```text
state/pressure
  -> action candidate
  -> selected action
  -> canon event
  -> effect result
  -> committed delta
  -> memory/relationship/location/future tendency
  -> grounded narrative
```

### 8.3 Regression Tests

Must preserve:

- `new AndyEngine()`
- default campus preset
- custom tavern domain
- SDK Character
- package exports
- smoke pack install
- serialization
- seeded baseline

---

## 9. Commit and Review Policy

Every phase must be committed as small reviewable units.

Recommended commit classes:

```text
docs:
test:
refactor:
feat:
chore:
```

Rules:

- directory moves cannot be mixed with behavior changes
- compatibility wrapper changes cannot be mixed with wrapper deletion
- tests must land with the boundary they protect
- docs must reflect the same commit or immediately follow
- no phase is complete until `release:check` passes

---

## 10. Forbidden Expansions During This Pass

The following are not part of Clean Architecture Pass v0.1:

- StoryArc runtime implementation
- Adventure system
- PlayerAgent system
- QuestSystem
- ItemSystem
- Fantasy/Cultivation domain implementation
- Andy Town UI/map work
- Bobby product behavior
- plugin marketplace system
- ECS rewrite
- Rust rewrite
- TypeScript full migration
- npm publish

These may become upper-layer or later-version work only after the engine boundaries are clean.

---

## 11. Final Success Criteria

Clean Architecture Pass v0.1 is complete only when all are true:

- target dependency direction is enforced by scripts/tests
- target module map exists and matches code
- `src/` target layout is either complete or every legacy path is a documented compatibility wrapper with deletion phase
- no active old debt remains in `KNOWN_BOUNDARY_VIOLATIONS.md`
- direct world-facing mutations are routed through public seams or effect committers
- action selection is pure until selected action/effects boundary
- narrative cannot write facts
- SDK cannot mutate internals
- package exports match docs
- `release:check` passes
- `smoke:pack` passes
- `perf:check` passes or has documented accepted variance
- final audit document exists

Final phrase:

> Andy Engine is a persistent-world runtime with explicit canon, knowledge, pressure, action, effect, narrative, and SDK boundaries. The codebase no longer relies on memory, convention, or hidden assumptions to stay clean.
