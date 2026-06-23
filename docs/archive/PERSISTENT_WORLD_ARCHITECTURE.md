# Persistent World Architecture — Phase 16 RFC

> **这不是实现计划，不是 API 设计，不是 schema 终稿。**
> **这是 Andy Engine 从 Character Engine 向 Persistent World Engine 演化的架构边界定义。**

---

## 1. Context

Andy Engine v0.2.0 已完成：

- Domain-agnostic architecture（core 不含世界特定语义）
- Domain Config contract（validateDomain 是公开契约）
- Campus / Tavern presets（验证 domain 可替换性）
- Benchmark / profiling baseline
- Social contagion cache optimization

当前架构回答的问题是：

> 如何用一套 core 驱动不同世界观的多智能体模拟？

但还有一个更上层的问题未回答：

> 用户创建的世界如何持久存在、如何跨 runtime 版本存活？

---

## 2. Core Position

Andy Engine 的目标从 **Character Engine** 扩展为 **Persistent World Engine**。

```
Character Engine (v0.2.0):
  "如何让一个角色有情绪、记忆、人格？"

Persistent World Engine (v0.3.0+):
  "如何让一个世界持久存在，角色在其中自然演化？"
```

**关键区分：**

| 概念 | 生命周期 | 谁拥有 |
|------|----------|--------|
| Domain Config | 长期稳定 | Engine / 开发者 |
| World Spec | 长期稳定 | 用户 |
| World State | 持续累积 | 用户世界 |
| Runtime Systems | 可升级 | Engine |
| Presentation Layer | 可替换 | 上层应用 |

---

## 3. Concept Boundary

### 3.1 Domain Config

**定义：** 一类世界的规则集。

**当前状态：** v0.2.0 已完成。

**示例：** `presets/campus`（校园）、`presets/tavern`（中世纪酒馆）

**职责：**
- 定义 regions、states、stateCenters
- 定义事件模板、需求映射、日程预设
- 定义语义分类、叙事模板

**边界：**
- Domain Config 是 Engine 级别的，不是用户级别的
- 用户不直接编辑 Domain Config
- Domain Config 可以被多个 World Spec 引用

### 3.2 World Spec

**定义：** 用户创建的世界蓝图。

**性质：**
- 长期保存（用户世界的源文件）
- 引用一个 Domain Config
- 定义该世界独有的角色、初始状态、世界参数

**边界：**
- World Spec 是用户级别的，不是 Engine 级别的
- World Spec 可以被导出、分享、版本化
- World Spec 不包含运行时状态

**候选结构（illustrative example，非正式 schema）：**

```json
{
  "specVersion": "0.1.0",
  "domainRef": "campus",
  "worldName": "我的校园世界",
  "characters": [
    {
      "id": "maya",
      "name": "Maya",
      "mbti": "INFP",
      "background": ["安静的图书馆管理员"]
    }
  ],
  "parameters": {
    "startTime": "2026-09-01T08:00:00Z",
    "weather": "sunny"
  }
}
```

### 3.3 World State

**定义：** 世界运行后的可变状态。

**性质：**
- 持续累积（每次 tick 都可能更新）
- 是用户世界的"真实状态"
- 跨 runtime 版本存活

**候选边界（高层，具体字段留到 Phase 17）：**

| 子系统 | 职责 | 当前实现 |
|--------|------|----------|
| character_state | 角色内部状态（情绪、需求、人格、行为场） | Agent.toJSON() |
| relationship_state | 社交关系图谱 | SocialGraph.toJSON() |
| memory_state | 角色记忆 | PersonalMemory.toJSON() |
| event_log | 世界事件时间线 | EventDispatcher.toJSON() |
| world_clock | 世界时钟 | World.time |
| location_state | 角色位置 | RegionGrid.snapshot() |

**边界：**
- World State 是用户级别的，不是 Engine 级别的
- World State 的具体字段定义不在 Phase 16 定稿
- World State 必须能从当前 Agent.toJSON() / World.toJSON() 导出

### 3.4 Runtime Systems

**定义：** 推动 World State 演化的引擎代码。

**当前实现：**
- Simulator.js（5 步管线）
- Agent.tick()（16 步子系统演化）
- BehaviorField（朗之万动力学）
- EmotionVector（30 维情绪演化）
- PersonalMemory（ACT-R 记忆检索）

**边界：**
- Runtime 可以升级（优化、bug 修复、新功能）
- Runtime 升级不能重置用户世界
- Runtime **只消费当前版本的 World State**，不内置向后兼容逻辑

**升级约束：**
```
Runtime v1 + World State v1 → 正常运行
Runtime v2 + World State v1 → 错误！必须先迁移
Runtime v2 + World State v2 → 正常运行

旧版本数据 → Migration Pipeline → 新版本 World State → Runtime 消费
```

**关键原则：** Runtime 不承担版本兼容负担。旧版本 World State 必须先经过独立的 **Migration Pipeline** 转换为当前版本后，方可输入 Runtime。这保持了 Runtime 代码的简洁性和可维护性。

### 3.5 Presentation Layer

**定义：** 用户看到和交互的界面。

**示例：** Bobby、Andy Town、UI、Chat、Notification

**边界：**
- Presentation Layer 不进入 Engine Core
- Presentation Layer 通过 Engine API 读取 World State
- Presentation Layer 可以替换，不影响 Engine Core

---

## 4. Layered Architecture

```
┌─────────────────────────────────────────────┐
│          Presentation Layer                 │
│  Bobby / Andy Town / UI / Chat / Notif     │
├─────────────────────────────────────────────┤
│          SDK Layer                          │
│  Character / Andy / LLMAdapter              │
├─────────────────────────────────────────────┤
│          Engine API                         │
│  AndyEngine.getNarrative()                  │
│  AndyEngine.tick()                          │
│  AndyEngine.createCharacter()               │
├─────────────────────────────────────────────┤
│          Runtime Systems                    │
│  Simulator / Agent / BehaviorField          │
│  EmotionVector / PersonalMemory             │
├─────────────────────────────────────────────┤
│          World State                        │
│  character_state / relationship_state       │
│  memory_state / event_log / world_clock     │
├─────────────────────────────────────────────┤
│     Ecosystem Tooling (外部工具链)           │
│  World Compiler / Migration Pipeline        │
│  Schema Validator                           │
├─────────────────────────────────────────────┤
│          World Spec                         │
│  用户世界蓝图（角色、初始状态、参数）         │
├─────────────────────────────────────────────┤
│          Domain Config                      │
│  campus / tavern / custom                   │
└─────────────────────────────────────────────┘
```

**依赖方向：** 上层依赖下层，下层不依赖上层。

**关键约束：**
- Runtime Systems 读写 World State
- Runtime Systems 读取 Domain Config（行为规则）
- **Ecosystem Tooling（World Compiler / Migration Pipeline）在创作阶段将 World Spec 转换为 World State**
- **Runtime 不内置版本兼容逻辑——旧版本 World State 必须先经过 Migration Pipeline 转换**
- Presentation Layer 只读 World State（通过 Engine API）

---

## 5. World Compiler Position

**当前状态：** 未实现。

**定位：** World Compiler 是**外部创作期工具链（Ecosystem Tooling）**，不是 Runtime Tick 系统的内部组件。

**职责：**
- 将 World Spec 编译为可执行的初始 World State
- 验证 World Spec 与 Domain Config 的一致性
- 生成 World State 的初始快照

**边界：**
- World Compiler 在世界**创建时**运行一次，不在每 tick 运行
- Core compiler consumes structured World Spec deterministically. worldId 及初始 UUID 生成在工具链层使用临时随机种子，而核心结构映射是确定性的。Any natural-language or LLM authoring belongs upstream and outside engine core.
- World Compiler 的输出是 World State 的初始值
- World Compiler **不属于 Runtime Tick 管线**，而是创作阶段的前置工具

**与 Runtime 的关系：**
```
创作阶段（World Compiler）    运行阶段（Runtime）
─────────────────────────    ─────────────────────
World Spec ──→ World Compiler ──→ 初始 World State
                                      ↓
                              Runtime.tick() 循环演化
                                      ↓
                              持续累积的 World State
```

**不在 Phase 16 实现：**
- 具体编译逻辑
- 编译错误处理
- 编译缓存

**公开暴露策略：** 世界工具链（world/）目前定位为 internal ecosystem tooling（内部生态工具链），严格作为内部私有实现。暂时不在 package.json 中公开对外 exports 暴露，也不在 package.json 的 files 白名单中。Persistent World 的官方 API 尚未公开（Persistent World official API is not public yet），外部生态不得依赖或直接使用此命名空间下的功能。公开包装与稳定契约发布将推迟到后续 API 封装阶段。

---

## 6. Migration Principles

### 6.1 核心原则：Migration 是独立管线

**原则：** Migration Pipeline 是独立于 Runtime 的外部工具链，负责将旧版本 World State 转换为当前版本。

**架构位置：**
```
旧 World State (v1) ──→ Migration Pipeline ──→ 新 World State (v2) ──→ Runtime 消费
```

**关键约束：**
- Runtime **不内置**版本兼容逻辑
- Migration Pipeline 是**确定性的数据转换器**
- Migration Pipeline 可以链式调用（v1 → v2 → v3）
- Migration is forward-only and non-mutating by default. It outputs a new World State while preserving the original unless explicitly replaced.

### 6.2 Runtime 升级

**原则：** Runtime 可以升级，但不能重置用户世界。

**实践：**
- Runtime 只消费当前版本的 World State
- 新增字段由 World Compiler 或 Migration Pipeline 填充默认值
- Runtime 不需要读取旧版本字段

### 6.3 World State 版本

**原则：** World State 包含版本标记，Migration Pipeline 根据版本选择转换逻辑。

**实践：**
- World State JSON 包含 `schemaVersion` 字段
- Migration Pipeline 读取版本号，执行对应的转换链
- 转换完成后输出当前版本的 World State

### 6.4 Domain Config 演化

**原则：** Domain Config 是 Engine 级别的，演化需要谨慎。

**实践：**
- 新增字段是向后兼容的
- 删除字段需要废弃期
- 修改字段语义需要新版本

### 6.5 World Spec 演化

**原则：** World Spec 是用户级别的，用户可以自由修改。

**实践：**
- World Spec 修改不影响已运行的 World State
- World Spec 重新编译需要用户确认
- World Spec 版本化由用户管理

---

## 7. Non-Goals

Phase 16 **不**包含：

- World Spec schema 终稿
- World State 字段级定义
- World Compiler 实现
- LLM prompt 设计
- SDK API 设计
- Migration 代码
- Performance benchmark
- Alive 感实验设计

---

## 8. Open Questions

1. **World State 粒度：** character_state 应该是扁平结构还是分层结构？
2. **关系状态分离：** relationship_state 应该独立存储还是嵌入 character_state？
3. **事件日志策略：** event_log 应该保留全部历史还是滑动窗口？
4. **版本迁移工具：** 是否需要独立的迁移工具，还是 Runtime 内置迁移逻辑？
5. **多世界支持：** 一个 Engine 实例是否支持多个 World State？
6. **World Spec 格式：** JSON / YAML / 声明式 DSL？

---

## 9. Phase 17 Preview

Phase 17 将定义 Minimal Persistent World Schema Draft：

- **Stable World Envelope（稳定资产层）**：公共 Schema，包含 schemaVersion、worldId、domainRef、worldClock、基础角色 ID/Name、基础关系边、高层记忆事件
- **Runtime Snapshot Payload（运行时快照载荷）**：不透明载荷（Opaque Payload），包含 30 维情绪状态、心理衰减参数、行为场速度等，由各版本 Runtime 内部独占，非公共契约

**Phase 17 前提：** Phase 16 架构边界确认。
