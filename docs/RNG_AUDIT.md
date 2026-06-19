# RNG Audit — 随机源与时间源审计

> **Phase 21 审计报告（已完成）。**
>
> Phase 21 seeded simulation baseline 已完成：seeded simulation path 的核心行为随机源已通过 RNG 路由。
> 本文档记录最终审计状态，不再作为规划文档使用。
>
> 注意：`core/StoryGenerator.js`、`core/EmotionSignalBuffer.js` 虽在 `core/` 目录，但属于 expression/support modules，不在 seeded simulation baseline 内。部分 `agent/` 模块（`Agent.js`、`PersonalMemory.js`、`IntrinsicMotivation.js`）仍存在 `simTime ? ... : Date.now()` fallback；正常 tick 路径使用 simTime，但 fallback 不应被描述成不存在。Full deterministic replay 需要单独 RFC。

---

## 1. 审计方法

通过 `rg "Math\.random"` 和 `rg "Date\.now\(\)"` 扫描全库（排除 node_modules、测试、experiments、demo、benchmarks、native）。

---

## 2. 当前状态：Seeded Simulation Baseline ✅

### 2.1 RNG 路由架构

种子注入链路：

```
AndyEngine(config.seed)
  → core/RNG.js (可播种 PRNG)
  → AndyWorld.rng
  → EventDispatcher._rng (相遇/随机事件)
  → Agent._rng
    → BehaviorField._rng (行为场高斯噪声)
    → Schedule._rng (日程概率/jitter)
    → EmotionVector._rng (情绪噪声)
    → EmotionRegulation._rng (调节策略选择)
    → IntrinsicMotivation._rng (自发动机)
    → PersonalMemory._rng (检索噪声)
```

所有核心随机源使用统一的 fallback 模式：

```js
const rand = this._rng ? this._rng.next() : Math.random();
```

### 2.2 Core Simulation 随机源（已路由）

| 模块 | 用途 | 路由方式 |
|------|------|----------|
| `agent/BehaviorField.js` | Box-Muller 高斯噪声（行为场动力学） | `this._rng` |
| `core/EventDispatcher.js` | 相遇概率、交互内容、随机事件、八卦、情绪传染 | `this._rng` |
| `core/Simulator.js` | 连续空间相遇概率 | `world.rng` |
| `core/World.js` | 天气变化概率 | `this.rng` |
| `agent/Schedule.js` | 日程条目概率、jitter 高斯噪声 | `this._rng` |
| `agent/EmotionVector.js` | 白噪声、粉噪声状态更新、维度选择 | `this._rng` |
| `agent/EmotionRegulation.js` | 调节策略选择随机 | `this._rng` |
| `agent/Agent.js` | 心智游移、偏差行为、社交回避、白日梦 | `this._rng` |
| `agent/IntrinsicMotivation.js` | 目标生成概率、目标选择 | `this._rng` |
| `agent/PersonalMemory.js` | 检索噪声 | `this._rng` |

### 2.3 Non-Seeded Fallback（Intentional）

当 `config.seed` 未提供时，`rng` 为 `null`，所有随机源回退到 `Math.random()`。

**这是 intentional backward compatibility，不是 violation。** 现有用户不传 seed 时行为不变。

---

## 3. Date.now() 分布与分层

### 3.1 分层概述

| 用途层 | 模块 | 说明 |
|--------|------|------|
| **Performance measurement** | `core/Simulator.js` | tick 耗时统计（`Date.now() - tickStart`） |
| **SDK wall-clock** | `sdk/AutoTick.js`, `sdk/Character.js` | SDK 层真实时间 |
| **Store retention** | `store/*.js` | 存储层时间戳 |
| **Tooling ID** | `world/compiler.js`, `world/migration.js` | worldId 生成 |
| **Simulation fallback** | `agent/Agent.js` | 记忆 ID 生成、appraisal bias 时间戳 |

**结论：** 正常 tick 路径使用 `env.simTime`（模拟时间）。部分 `agent/` 模块存在 `simTime ? simTime.getTime() : Date.now()` fallback（`IntrinsicMotivation.js` 7 处、`Agent.js`、`PersonalMemory.js` 各若干处）；正常运行时 simTime 有值，fallback 不会被触发，但不应被描述为不存在。Full deterministic replay 需要单独 RFC 覆盖这些 fallback 路径。

---

## 4. Replay Scope 边界

### 4.1 Seeded Simulation Baseline（已承诺）

Same seed + same input → same simulation trajectory。覆盖：
- 行为场（B ∈ [0,1]⁴）轨迹
- 情绪效价轨迹
- 事件生成序列
- 健康值轨迹
- 社交关系涌现

测试覆盖：`tests/seedable-simulation.test.js`、`tests/rng-injection.test.js`。

### 4.2 不在 Replay Scope 内（Remaining Boundaries）

以下模块不在 seeded simulation baseline 的承诺范围内：

| 模块 | 原因 |
|------|------|
| `sdk/AutoTick.js` | SDK 层自动 tick 间隔，使用 `Math.random()` |
| `sdk/Character.js` | SDK 层 ID 生成 |
| `world/compiler.js` | 工具链 worldId 生成 |
| `world/migration.js` | 工具链 worldId 生成 |
| `store/*.js` | 存储层时间戳 |
| `core/StoryGenerator.js` | 叙事模板选择（表现层） |
| `core/EmotionSignalBuffer.js` | 信号缓冲随机（辅助模块） |
| `spatial/WorldMap.js` | 空间排版随机（UI 层） |

**Full deterministic replay requires separate RFC。** 这些模块需要额外的 RNG 注入或 simTime 替换，超出当前 seeded simulation baseline 的范围。

---

## 5. 非目标

本文档**不**包含：
- 现有随机逻辑的修改
- Agent.tick 演化逻辑的修改
- Stable World Envelope 的修改
- SDK Public API 的修改
- Full deterministic replay 承诺（需独立 RFC）
