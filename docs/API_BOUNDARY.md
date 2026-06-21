# Andy Engine API Boundary Contract

> Status: active governance document.
> Date: 2026-06-20.
> Scope: 定义 Andy Engine 的公共 API 与内部实现边界。
> 前置文档: `docs/ARCHITECTURE_BOUNDARIES.md`, `docs/KNOWN_BOUNDARY_VIOLATIONS.md`

---

## 1. 公共 API 表（Stable Public API）

外部使用者可依赖以下模块。这些导出在 `package.json` 的 `exports` 字段中声明。

### 1.1 主入口：`andy-engine` (index.js)

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `AndyEngine` | class | **stable** |

AndyEngine 是唯一的公共类。提供以下公共方法：

| 方法 | 稳定性 | 说明 |
|------|--------|------|
| `createCharacter(config)` | stable | 一行代码创建角色 |
| `addAgent(config)` | stable | 底层 Agent 创建 |
| `addAgents(configs)` | stable | 批量创建 |
| `getAgent(id)` | stable | 获取单个 Agent |
| `getAllAgents()` | stable | 获取所有 Agent |
| `getNarrative(id, options?)` | stable | 内心叙事（核心 API） |
| `getWorldContext(id)` | stable | 完整世界上下文 |
| `getGroundingPackage(id, options?)` | stable | 事实 grounding 包 |
| `checkConsistency(llmOutput, id)` | stable | 一致性校验 |
| `tick()` | stable | 推进一个 tick |
| `runTicks(count)` | stable | 推进多个 tick |
| `advanceTo(targetTime, maxTicks?)` | stable | 推进到指定时间 |
| `snapshot()` | stable | 世界状态快照 |
| `getStats()` | stable | 引擎统计 |
| `onTick(callback)` | stable | 注册 tick 回调 |
| `setWeather(weather)` | stable | 设置天气 |
| `getSocialGraph()` | stable | 获取社交图谱 |
| `toJSON()` | **deprecated** | 旧版运行期快照 |
| `fromJSON(data, config?)` | **deprecated** | 从旧版快照恢复 |

### 1.2 SDK：`andy-engine/sdk` (sdk/index.js)

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `Character` | class | **stable** — 高层角色 API |
| `Andy` | class | **stable** — 多角色引擎包装 |
| `create(config)` | function | **stable** — 快速创建角色 |
| `NarrativeBuilder` | class | experimental — 底层 prompt 构建 |
| `LLMAdapter` | class | experimental — LLM 适配器 |
| `AutoTick` | class | experimental — 自动 tick |
| `ConversationLog` | class | experimental — 对话日志 |
| `AndyEngine` | class | stable — 重新导出的引擎类 |

### 1.3 Domain：`andy-engine/domain` (domain/index.js)

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `DomainRegistry` | class | **stable** — 域配置注册表 |
| `getDefaultDomain()` | function | **stable** — 获取默认 domain |
| `validateDomain(domain, opts?)` | function | **stable** — 校验 domain 配置 |

### 1.4 Domain Validate：`andy-engine/domain/validate`

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `validateDomain` | function | **stable** — 同 domain/validateDomain.js |

### 1.5 Domain Registry：`andy-engine/domain/registry`

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `DomainRegistry` | class | **stable** |

### 1.6 Facts：`andy-engine/facts` (facts/index.js)

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `FactType`, `FACT_TYPES` | enum | **stable** |
| `FactSource`, `FACT_SOURCES` | enum | **stable** |
| `FactScope`, `FACT_SCOPES` | enum | **stable** |
| `validateFact` | function | **stable** |
| `validateTypeFields` | function | **stable** |
| `createBaseFact` ... `createInvalidatedFact` | functions | **stable** — 工厂函数 |
| `WorldFactStore` | class | **stable** |
| `FactEmitter` | class | **stable** |
| `FactFormatter` | class | **stable** |
| `FactProvider` | class | **stable** |
| `FactConsistencyChecker` | class | **stable** |
| `KnowledgeStore` | class | **stable** |
| `CanonEventPipeline` | class | **stable** |

### 1.7 Store：`andy-engine/store` (store/index.js)

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `StoryStore` | class (interface) | **stable** |
| `SnapshotStore` | class (interface) | **stable** |
| `MetaStore` | class (interface) | **stable** |
| `SQLiteStore` | class | **stable** |
| `SimulationStore` | class | **stable** |
| `createStore(options?)` | function | **stable** |
| `createMemoryStore()` | function | **stable** |

### 1.8 Config：`andy-engine/config/defaults`

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| `ANDY_DEFAULTS` | object | **stable** — 所有可调参数 |

### 1.9 Presets：`andy-engine/presets/campus`, `andy-engine/presets/tavern`

| 导出 | 类型 | 稳定性 |
|------|------|--------|
| domain config object | object | **stable** |

---

## 2. 内部模块表（Internal Modules）

所有 canonical 逻辑均已迁入 `src/`。以下是 `src/` 内部的职责划分，外部不可直接 import。

### 2.1 src/runtime/ — 模拟核心

| 模块 | 内部职责 |
|------|----------|
| `src/runtime/AndyWorld.js` | 核心引擎运行时，编排时钟、环境、Agent tick、事件分发、社交图谱 |
| `src/runtime/WorldClock.js` | 离散模拟时钟与 Tick 计数器 |
| `src/runtime/EventDispatcher.js` | 世界事件的生成与分发，包括系统、位置、社交、动作和随机事件 |

### 2.2 src/agent/ — Agent 心理学与运行时

| 模块 | 内部职责 |
|------|----------|
| `src/agent/AgentRuntime.js` | Agent Tick 管线驱动器，协调所有子系统和 handler |
| `src/agent/handlers/*` | Tick 拆分处理器 (Perception, Schedule, Social, Reflection, etc.) |
| `src/agent/lifecycle/AgentDefaults.js` | Agent 默认字段值 (health, socialEnergy, isOnline, etc.) |
| `src/agent/lifecycle/AgentSubsystemFactory.js` | 子系统创建与恢复工厂 (Personality, EmotionVector, NeedsSystem, etc.) |
| `src/agent/lifecycle/AgentWiring.js` | 子系统间连接初始化 (BehaviorField↔StateMachine, LocationMeaning, FutureTendency) |
| `src/agent/runtime/ActionSelectionRuntime.js` | Shadow action selection pipeline (extracted from Agent) |
| `src/agent/runtime/PerceptionRuntime.js` | Event perception and cognitive appraisal (extracted from Agent) |
| `src/agent/runtime/PhysiologyRuntime.js` | Health, needs-to-emotion coupling, social energy (extracted from Agent) |
| `src/agent/runtime/ReflectionRuntime.js` | Reflection and state consequence assessment (extracted from Agent) |
| `src/agent/runtime/MindWanderRuntime.js` | Mind wandering / Default Mode Network (extracted from Agent) |
| `src/agent/facade/AgentNarrative.js` | First-person narrative generation (extracted from Agent) |
| `src/agent/facade/ExternalExperience.js` | External experience injection seam (extracted from Agent) |
| `src/agent/facade/InteractionFacade.js` | Agent interaction and personality compatibility (extracted from Agent) |
| `src/agent/facade/AgentSerializer.js` | Agent state serialization (extracted from Agent) |
| `src/agent/psychology/BehaviorField.js` | 4D 连续行为场（基于朗之万动力学） |
| `src/agent/psychology/BehaviorLabeler.js` | 状态机语义投影（从 4D 坐标映射到 42 个状态） |
| `src/agent/psychology/EmotionVector.js` | 30 维情绪子系统 (Cowen & Keltner 情绪空间) |
| `src/agent/psychology/NeedsSystem.js` | Maslow 需求层级，计算需求演化和匮乏惩罚 |
| `src/agent/psychology/Personality.js` | MBTI 与 OCEAN 人格模型及其参数映射 |
| `src/agent/psychology/Appraisal.js` | 认知评价系统 (Scherer CPM 理论) |
| `src/agent/psychology/EmotionRegulation.js` | Gross 情绪调节系统 |
| `src/agent/psychology/IntrinsicMotivation.js` | 好奇心与自生目标引擎 |
| `src/agent/memory/PersonalMemory.js` | 记忆系统 (ACT-R 激活度与检索模型) |
| `src/agent/memory/ProceduralMemory.js` | 习惯形成与打破 (程序性记忆) |
| `src/agent/schedule/Schedule.js` | 日程安排与位置建议系统 |

### 2.3 src/action/ — 行动选择层

| 模块 | 内部职责 |
|------|----------|
| `src/action/ActionCandidate.js` | 基于场景和可用 Provider 发现动作候选 |
| `src/action/UtilityScorer.js` | 计算动作在 5 个维度 (饥饿、社交、精力、自生目标、日程) 下的效用评分 |
| `src/action/UtilitySelector.js` | 基于 Gumbel-Softmax 或 Softmax 采样的动作决策 |
| `src/action/GoalSystem.js` | 自生目标的状态与进度管理 |
| `src/action/WorldObject.js` | 世界物体 (床、微波炉等) 状态与交互接口 |
| `src/action/providers/*` | 各类行动候选项的具体生成与参数计算 (社交、饮食、睡眠、学习等) |

### 2.4 src/effects/ — 效果与提交层

| 模块 | 内部职责 |
|------|----------|
| `src/effects/EventEffectPipeline.js` | 根据行动类型应用后果，如修改角色位置、扣减能量等 |
| `src/effects/EffectCommitter.js` | 效果与状态变更的原子化写入通道 |

### 2.5 src/social/ — 社交图谱

| 模块 | 内部职责 |
|------|----------|
| `src/social/SocialGraph.js` | 全局社交网络，维护 Dunbar 亲密度层级和三元闭合 |
| `src/social/Relationship.js` | 对数增长的动态亲密关系模型 |

### 2.6 src/spatial/ — 空间系统

| 模块 | 内部职责 |
|------|----------|
| `src/spatial/SpatialEngine.js` | 角色在连续区域坐标系下的位置追踪 |
| `src/spatial/SpatialHash.js` | 快速邻居发现与碰撞检测 ($O(1)$) |
| `src/spatial/RegionGrid.js` | 网格化空间与可行进区域配置 |
| `src/spatial/WorldMap.js` | 拓扑图，计算区域间距离与邻近度 |

---

## 3. 兼容性包装器策略

### 3.1 现有包装器

| 包装器 | 委托目标 | 类型 | 删除条件 |
|--------|----------|------|----------|
| `effects/EventEffectPipeline.js` | `src/effects/EventEffectPipeline.js` | compatibility adapter | 当所有内部引用迁移到 `src/effects/` 且无外部依赖 `effects/EventEffectPipeline` 时删除 |
| `domain/ForbiddenTerms.js` | `src/domain/ForbiddenTerms.js` | thin wrapper | 当所有内部引用迁移到 `src/domain/` 且无外部依赖时删除 |

### 3.2 已删除的旧模块

- `core/WorldviewConstraints.js` — 已删除。禁止词逻辑的 canonical implementation 是 `src/domain/ForbiddenTerms.js`，通过 `domain/ForbiddenTerms.js` compatibility wrapper 暴露。
- `core/EventEffectPipeline.js` — 已删除。效果管线的 canonical implementation 是 `src/effects/EventEffectPipeline.js`。
- `core/RNG.js` — 已删除。RNG 的 canonical implementation 是 `src/shared/rng.js`。

`index.js` 通过 `require('./domain/ForbiddenTerms')` 导入 `applyForbiddenTerms`（使用 compatibility wrapper）。`src/` 内部模块直接使用 `require('../domain/ForbiddenTerms')`（指向 `src/domain/ForbiddenTerms.js` canonical）。

---

## 4. SDK 边界规则

### 4.1 SDK 允许的导入

| SDK 模块 | 可导入 |
|----------|--------|
| `sdk/Character.js` | `index.js` (AndyEngine), `sdk/*` (同层) |
| `sdk/Andy.js` | `index.js` (AndyEngine), `sdk/Character.js` |
| `sdk/NarrativeBuilder.js` | `domain/ForbiddenTerms.js`, `domain/DomainRegistry.js`, `src/narrative/FactFormatter.js` |
| `sdk/LLMAdapter.js` | 无内部依赖（纯外部 HTTP） |
| `sdk/AutoTick.js` | 无内部依赖 |
| `sdk/ConversationLog.js` | 无内部依赖 |
| `sdk/index.js` | `index.js`, `sdk/*` |

### 4.2 SDK 禁止的导入

| 禁止模式 | 原因 |
|----------|------|
| `sdk/ → core/*` | SDK 不应直接访问模拟核心 |
| `sdk/ → agent/*` | SDK 不应直接访问 Agent 内部（通过 AndyEngine 公共方法） |
| `sdk/ → effects/*` | SDK 不应直接访问效果层 |
| `sdk/ → spatial/*` | SDK 不应直接访问空间系统 |
| `sdk/ → social/*` | SDK 不应直接访问社交图谱（通过 AndyEngine.getSocialGraph()） |

### 4.3 SDK → Engine 的公共 Seam

SDK 通过以下 AndyEngine 公共方法与引擎交互：

```
engine.createCharacter(config)
engine.getAgent(id)
engine.getNarrative(id, options)
engine.getWorldContext(id)
engine.getGroundingPackage(id, options)
engine.checkConsistency(llmOutput, id)
engine.tick()
engine.snapshot()
engine.getSocialGraph()
```

SDK 不能绕过 AndyEngine 直接操作 `core/World`、`agent/Agent` 等内部模块。

### 4.4 已知例外

| 导入 | 原因 |
|------|------|
| `sdk/NarrativeBuilder.js` → `src/narrative/FactFormatter.js` | 叙事需要结构化事实格式化（canonical，通过 src/narrative/） |
| `sdk/NarrativeBuilder.js` → `domain/DomainRegistry.js` | 叙事需要 domain 解析 |
| `sdk/NarrativeBuilder.js` → `domain/ForbiddenTerms.js` | 叙事需要禁止词过滤 |

---

## 5. 变更流程

1. **新增公共 API**：必须同时更新 `package.json` exports 和本文档
2. **删除公共 API**：必须先标记 deprecated，至少保留一个 minor 版本
3. **新增兼容性包装器**：必须在本文档 §3 登记，并设定删除条件
4. **修改 SDK 边界规则**：必须更新本文档 §4，并通过 `tests/package-boundary.test.js` 验证
