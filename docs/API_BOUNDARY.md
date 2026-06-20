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

以下模块不在 `package.json` exports 中，属于内部实现。外部不应直接 import。

### 2.1 core/ — 模拟核心

| 模块 | 内部职责 |
|------|----------|
| `core/World.js` | 世界状态、Agent 注册表、环境、事件调度 |
| `core/Simulator.js` | 多 Agent 调度器、tick 管线 |
| `core/EventDispatcher.js` | 事件系统（5 种来源 + 语义分类） |
| `core/RNG.js` | 可播种随机数生成器 |
| `core/WorldPressure.js` | 运行时压力计算 |
| `core/EmotionEffectClassifier.js` | 文本情绪效果分类 |
| `core/EmotionSignalBuffer.js` | 情绪信号缓冲 |
| `core/AndyBridge.js` | 外部 LLM 桥接层 |
| `core/AndyTownAdapter.js` | Andy Town 适配器 |
| `core/StoryGenerator.js` | 故事生成器 |

### 2.2 agent/ — Agent 心理学

| 模块 | 内部职责 |
|------|----------|
| `agent/Agent.js` | 主循环 tick()，协调所有子系统 |
| `agent/BehaviorField.js` | 4D 连续行为场（朗之万动力学） |
| `agent/BehaviorLabeler.js` | 语义标签投影器（50 个状态中心点） |
| `agent/StateMachine.js` | 状态元数据（只读，42 个状态定义） |
| `agent/EmotionVector.js` | 30 维情绪系统 |
| `agent/NeedsSystem.js` | Maslow 需求层级 |
| `agent/PersonalMemory.js` | ACT-R 记忆系统 |
| `agent/Personality.js` | MBTI → OCEAN → 行为参数映射 |
| `agent/Appraisal.js` | 认知评价（8 维度） |
| `agent/EmotionRegulation.js` | Gross 情绪调节 |
| `agent/IntrinsicMotivation.js` | 好奇心 + 自生目标 |
| `agent/ProceduralMemory.js` | 习惯形成 + 打破 |
| `agent/Schedule.js` | 日程系统 |
| `agent/FutureTendencyTracker.js` | 未来倾向追踪 |
| `agent/LocationMeaningInfluence.js` | 地点意义影响 |

### 2.3 agent/action/ — 行动选择层

| 模块 | 内部职责 |
|------|----------|
| `agent/action/ActionCandidate.js` | 候选行动生成 |
| `agent/action/UtilityScorer.js` | 效用评分 |
| `agent/action/UtilitySelector.js` | 加权选择 |
| `agent/action/GoalSystem.js` | 目标系统 |
| `agent/action/WorldObject.js` | 世界对象建模 |
| `agent/action/providers/*` | 行动提供者 |

### 2.4 effects/ — 效果层（依赖叶子）

| 模块 | 内部职责 |
|------|----------|
| `effects/EventEffectPipeline.js` | 行动效果计算、事件后果应用 |

### 2.5 social/ — 社交图谱（Peer Subsystem）

| 模块 | 内部职责 |
|------|----------|
| `social/SocialGraph.js` | 全局社交图谱（Dunbar 层级 + 三元闭合） |
| `social/Relationship.js` | 对数增长关系模型 |

### 2.6 spatial/ — 空间系统

| 模块 | 内部职责 |
|------|----------|
| `spatial/SpatialEngine.js` | 连续坐标空间 |
| `spatial/SpatialHash.js` | 空间哈希（O(1) 邻居查询） |
| `spatial/RegionGrid.js` | 区域网格 |
| `spatial/WorldMap.js` | 世界地图 |

---

## 3. 兼容性包装器策略

### 3.1 现有包装器

| 包装器 | 委托目标 | 删除条件 |
|--------|----------|----------|
| `core/EventEffectPipeline.js` | `effects/EventEffectPipeline.js` | 当所有内部引用迁移到 `effects/` 且无外部依赖 `core/EventEffectPipeline` 时删除 |

### 3.2 非包装器说明

`core/WorldviewConstraints.js` **不是**兼容性包装器。它是包含完整校园禁止词逻辑的独立实现（242 行）。`domain/ForbiddenTerms.js` 是一个独立的 domain-aware 过滤工具（26 行），两者功能不同：
- `core/WorldviewConstraints.js`：校园特定的禁止词集合 + 替换规则 + 校验
- `domain/ForbiddenTerms.js`：通用的 domain forbiddenTerms 数组过滤

`index.js` 通过 `require('./core/WorldviewConstraints')` 导入 `applyForbiddenTerms`，`agent/` 模块通过 `require('../domain/ForbiddenTerms')` 导入同名函数。两者共存，前者是完整模块，后者是依赖叶子。

---

## 4. SDK 边界规则

### 4.1 SDK 允许的导入

| SDK 模块 | 可导入 |
|----------|--------|
| `sdk/Character.js` | `index.js` (AndyEngine), `sdk/*` (同层) |
| `sdk/Andy.js` | `index.js` (AndyEngine), `sdk/Character.js` |
| `sdk/NarrativeBuilder.js` | `domain/ForbiddenTerms.js`, `domain/DomainRegistry.js`, `facts/FactFormatter.js` |
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
| `sdk/NarrativeBuilder.js` → `facts/FactFormatter.js` | 叙事需要结构化事实格式化 |
| `sdk/NarrativeBuilder.js` → `domain/DomainRegistry.js` | 叙事需要 domain 解析 |
| `sdk/NarrativeBuilder.js` → `domain/ForbiddenTerms.js` | 叙事需要禁止词过滤 |

---

## 5. 变更流程

1. **新增公共 API**：必须同时更新 `package.json` exports 和本文档
2. **删除公共 API**：必须先标记 deprecated，至少保留一个 minor 版本
3. **新增兼容性包装器**：必须在本文档 §3 登记，并设定删除条件
4. **修改 SDK 边界规则**：必须更新本文档 §4，并通过 `tests/package-boundary.test.js` 验证
