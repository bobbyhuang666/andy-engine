# AGENTS.md — AI Coding Agent Notes

This file contains repository-specific guardrails for AI coding agents and other
automation-assisted contributors. Human readers should start with `README.md`;
coding agents should also read `AI_README.md`, `docs/archive/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`,
and `docs/PUBLIC_API_CONTRACT.md` before making changes.

---

## 项目身份

Andy Engine 是一个**心理学驱动的 Persistent World / multi-agent simulation engine**。

它不是 Web 应用，不是普通聊天机器人框架，也不是只靠 prompt 的 Agent SDK。Andy 的核心目标是维护一个会持续演化的世界：什么是真的、谁知道什么、角色状态如何变化、事件如何留下可追溯后果。

一句话：**Andy Engine 负责让 AI 角色活在同一个可持续世界里，而不是让 LLM 凭空编故事。**

---

## 当前架构状态

Clean Architecture Pass 已完成。当前规则：

- `src/` 拥有 canonical implementation。
- 旧顶层 runtime 实现目录已经退休。
- 顶层只保留公共 facade / public-approved adapter。
- `agent/Agent.js` 是公开批准的兼容适配层，不是主实现文件。
- 新代码默认进入 `src/`，不要恢复旧顶层实现目录。

当前保留的顶层入口：

```text
index.js           package root public facade
agent/Agent.js     public-approved Agent compatibility adapter
domain/index.js    public domain facade
facts/index.js     public facts facade
sdk/index.js       public SDK facade
store/index.js     public store facade
```

不要新增这些旧顶层目录下的实现文件：

```text
core/
effects/
social/
spatial/
config/
world/
agent/action/
```

---

## 当前 src 架构地图

```text
src/
├── runtime/      AndyWorld, EventDispatcher, WorldClock, RuntimeConfig, RuntimeContext
├── agent/        AgentRuntime, lifecycle, handlers, facade, memory, psychology, schedule
├── action/       ActionCandidate, providers, UtilityScorer, UtilitySelector, ReasonTrace
├── canon/        WorldFactStore, FactSchema, CanonEventPipeline, FactEmitter
├── knowledge/    KnowledgeStore: who knows what
├── narrative/    FactProvider, FactConsistencyChecker, FactFormatter, StoryGenerator
├── effects/      EffectCommitter, EventEffectPipeline, typed deltas
├── pressure/     Need, memory, relationship, location, and world pressure sources
├── domain/       DomainRegistry, validateDomain, ForbiddenTerms
├── config/       defaults and config validation
├── shared/       RNG, ids, errors, time, schemas
├── social/       SocialGraph, Relationship
├── spatial/      RegionGrid, SpatialEngine, SpatialHash, WorldMap
├── store/        Persistence, serialization, world schema tooling
└── sdk/          Character, Andy, LLMAdapter, NarrativeBuilder
```

---

## 母架构：运行闭环

当前 Andy 的核心闭环是：

```text
WorldCanon
  → Observation / Knowledge
  → State & Pressure
  → Action Candidates / Utility Selection
  → CanonEvent
  → EventEffectPipeline / EffectCommitter
  → Memory / Relationship / LocationMeaning / FutureTendency
  → Grounded Narrative
```

关键边界：

- **Canon** 维护世界事实权。
- **Knowledge** 维护谁知道什么。
- **Pressure** 只产生倾向，不直接决定动作。
- **Action** 只生成/评分/选择候选，不直接写世界。
- **Effects** 负责把事件后果转成 delta 并提交。
- **Narrative / LLM** 只能表达 grounding 允许的事实，不能创建世界事实。

如果一个事件没有写回未来状态，它只是文本，不是 Andy 世界演化。

---

## 行为系统现状

Andy 不是纯行为树。当前行为层是：

```text
BehaviorField      continuous psychological dynamics
CandidateProvider  reasonable action candidates
UtilityScorer      score breakdown from needs/emotion/memory/habit/world pressure/etc.
UtilitySelector    weighted selection with seeded RNG trace
ReasonTrace        why this action was selected
EffectPipeline     selected action consequences
```

当前 provider matrix 包括 9 个 provider：

```text
ContinueCandidateProvider
NeedCandidateProvider
ScheduleCandidateProvider
BehaviorFieldCandidateProvider
ExploreCandidateProvider
SocializeCandidateProvider
MemoryCandidateProvider
HabitCandidateProvider
WorldPressureCandidateProvider
```

Provider 必须保持 read-only。它们不能写 memory、relationship、facts、position、emotion、needs。

---

## BehaviorField 仍是心理动力学核心

4D 行为向量：

```text
B[0] activity        0=rest/sleep       1=work/exercise
B[1] sociality       0=alone            1=social
B[2] focus           0=wandering        1=focused
B[3] expressiveness  0=withdrawn        1=expressive
```

注意梯度方向：

```js
// 势能 U = w * ||B - target||²
// 梯度 ∇U = 2w * (B - target)
// 动力学使用 -∇U，朝目标移动

grad[d] += weight * (this.B[d] - target[d]); // 正确
```

不要把梯度写反。

---

## StateMachine 已退役

`StateMachine` 只保留状态元数据和历史。不要往里面加转移逻辑。

```js
// 不要这样
agent.stateMachine._doTransition('某状态');

// 行为状态来自 BehaviorField label / action layer / effect pipeline
```

---

## Domain 规则

Core / `src/` 不能硬编码 campus、tavern、Oak Town 或其他具体世界语义。

具体世界词汇必须来自：

```text
presets/campus/
presets/tavern/
custom domain config
```

常见要点：

- `new AndyEngine()` 默认 campus preset，向后兼容。
- `new AndyEngine({ domain })` 使用自定义 domain。
- 状态、区域、event templates、memory/action mappings 都应 domain-driven。
- 不要把 tavern 或 Oak Town 写进 core。

---

## Facts / Knowledge / Grounding 规则

Facts 系统是 opt-in semantic layer。

- `enableFacts` 默认仍是 `false`。
- `CanonEventPipeline` 是 dispatched event → fact 的主入口。
- `FactEmitter` 负责 static/state/observation/relationship/memory 等描述性 facts。
- `FactEmitter.emitEventFacts()` / `propagateEventKnowledge()` 是 deprecated fallback，不得被 runtime/agent/sdk 新增调用。
- `AGENT_STATE` 即使是 public scope，在 epistemic reasoning 中也应视为私有知识；其他 agent 需要 direct/observed/told/inferred 证据。

LLM / narrative 只能使用 grounding package 中允许的 facts。

---

## Seeded RNG 规则

- 新随机源必须接入 `src/shared/rng.js` / runtime RNG context。
- 不要在核心模拟路径新增裸 `Math.random()`。
- 不传 seed 时允许向后兼容 fallback。
- 当前承诺是 seeded simulation baseline，不是 SDK/tooling/store 全路径 deterministic replay。

---

## 写回规则

新 world-facing consequence 不应直接改别的模块内部状态。

优先模式：

```text
ActionSelector → SelectedAction + ReasonTrace
EventEffectPipeline → EffectResult / typed deltas
EffectCommitter → commit deltas
```

不要在 action provider 或 narrative 层直接调用：

```js
memory.addExperience(...)
relationship.strength += ...
world.factStore.addFact(...)
agent.position = ...
```

已有 legacy 写回路径不要扩大；新增写回应优先参考 `src/effects/`、
`docs/current/ACTION_EFFECT_CANONICALIZATION_NOTE.md` 和现有 EffectCommitter 测试。

---

## 测试与验证

常用命令：

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
git diff --check
```

提交前至少跑：

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
git diff --check
```

如果改到 runtime / action / effects / social contagion / performance path，还要跑：

```bash
npm run perf:check
```

`perf:check` 偶发失败时重跑一次；连续失败再视为回归。

---

## 关键文档

当前应优先相信：

```text
README.md
docs/archive/CLEAN_ARCHITECTURE_FINAL_AUDIT.md
docs/PUBLIC_API_CONTRACT.md
docs/LEGACY_REMOVAL_REPORT.md
docs/DOMAIN.md
docs/WORLD_SCHEMA.md
```

Historical planning notes, completed phase reports, and temporary execution
cards are not part of the public repository. Current engineering judgment should
come from source code, tests, `README.md`, `AI_README.md`, `AGENTS.md`, and the
public docs under `docs/`.

---

## 不要做的事

- 不要恢复旧顶层实现目录。
- 不要把新功能塞回 `agent/Agent.js`。
- 不要让 action provider 写状态。
- 不要让 narrative/LLM 创建 world facts。
- 不要把具体世界词写进 `src/` runtime/control logic。
- 不要改 Stable World Envelope，除非有明确迁移计划。
- 不要实现 StoryArc runtime，除非用户明确批准。
- 不要实现 Andy Town / Bobby / UI 逻辑到 Engine Core。
- 不要进行 npm publish，除非用户明确要求。

---

## 添加新功能的流程

1. 判断属于哪一层：runtime / agent / action / canon / knowledge / effects / narrative / domain / sdk。
2. 先检查是否已有 RFC 或 boundary 文档。
3. 新语义优先 domain-driven。
4. 新后果优先 typed delta + committer。
5. 新随机源接 RNG。
6. 写针对性测试。
7. 跑完整验证。
8. 更新相关公开文档，或明确记录为 RFC / archived historical note。

如果你不确定某个能力该放哪里，先停下来写边界说明，不要直接编码。
