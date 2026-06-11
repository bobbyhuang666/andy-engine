# RNG Audit — 随机源与时间源审计

> **Phase 21.0 审计报告：罗列库中所有 Math.random 和 Date.now 分布点，规划 RNG 路由路线。**

---

## 1. 审计方法

通过 `rg "Math\.random"` 和 `rg "Date\.now\(\)"` 扫描全库（排除 node_modules、测试、experiments、demo、benchmarks、native）。

---

## 2. Math.random 分布点

### 2.1 Core Simulation 随机源（Phase 21.1 路由规划）

这些随机源直接影响模拟行为的确定性，应路由到 `this.rng.next()`。

| 文件 | 行号 | 用途 | 路由优先级 |
|------|------|------|-----------|
| `agent/BehaviorField.js` | 552-553 | Box-Muller 高斯噪声（`_gaussianRandom`） | **P0** — 行为场动力学核心噪声 |
| `core/EventDispatcher.js` | 82 | 首次相遇 60% 概率创建关系 | **P0** — 社交网络涌现 |
| `core/EventDispatcher.js` | 108 | 交互概率判定 | **P0** — 相遇事件生成 |
| `core/EventDispatcher.js` | 137-161 | 交互内容选择、效价生成 | **P1** — 事件内容随机 |
| `core/EventDispatcher.js` | 166, 169 | 陌生人互动概率 | **P1** — 社交行为 |
| `core/EventDispatcher.js` | 179-181 | 情绪传染内容选择 | **P1** — 情绪事件 |
| `core/EventDispatcher.js` | 193-194 | 八卦触发概率与选择 | **P1** — 社交信息传播 |
| `core/EventDispatcher.js` | 312 | 随机事件概率（`cfg.randomEventProbability`） | **P0** — 世界事件 |
| `core/EventDispatcher.js` | 350 | 随机事件内容选择 | **P1** — 事件内容 |
| `core/Simulator.js` | 244 | 连续空间相遇概率 | **P0** — 空间交互 |
| `agent/Schedule.js` | 120, 151 | 日程条目概率执行 | **P0** — 日程系统 |
| `agent/Schedule.js` | 173-174 | Box-Muller 高斯噪声（日程 jitter） | **P0** — 日程抖动 |
| `agent/EmotionVector.js` | 236 | 白噪声源 | **P1** — 情绪噪声 |
| `agent/EmotionVector.js` | 241-242 | 粉噪声状态更新 | **P1** — 情绪噪声 |
| `agent/EmotionVector.js` | 250, 252 | 粉噪声维度选择 | **P1** — 情绪噪声 |
| `agent/Agent.js` | 335 | 心智游移概率 | **P1** — DMN 触发 |
| `agent/Agent.js` | 483 | 生病请假概率 | **P1** — 偏差行为 |
| `agent/Agent.js` | 505 | 旷工/旷课概率 | **P1** — 偏差行为 |
| `agent/Agent.js` | 520, 529, 537 | 社交回避概率 | **P1** — 社交行为 |
| `agent/Agent.js` | 584, 614 | 跳过日程替代状态/区域选择 | **P1** — 偏差行为 |
| `agent/Agent.js` | 830 | 跳过日程记忆内容选择 | **P2** — 记忆生成 |
| `agent/Agent.js` | 1271 | 白日梦内容选择 | **P2** — 心智游移 |
| `agent/Agent.js` | 1278 | 加权随机选择 | **P1** — 心智游移 |
| `agent/IntrinsicMotivation.js` | 298 | 目标生成概率 | **P1** — 自发动机 |
| `agent/IntrinsicMotivation.js` | 316 | 目标选择随机 | **P1** — 自发动机 |

### 2.2 暂缓非核心随机源（不列入模拟 Replay）

| 文件 | 行号 | 用途 | 处理策略 |
|------|------|------|----------|
| `core/World.js` | 6 处 | 天气变化概率、季节转移 | **暂缓** — 外部环境，非角色行为 |
| `agent/EmotionRegulation.js` | 1 处 | 情绪调节策略选择 | **暂缓** — 次要子系统 |
| `agent/PersonalMemory.js` | 2 处 | 检索噪声、记忆 ID 生成 | **暂缓** — ID 用 counter，噪声暂缓 |
| `world/compiler.js` | 1 处 | worldId 生成 | **已处理** — 外部工具链 |
| `world/migration.js` | 1 处 | worldId 生成 | **已处理** — 外部工具链 |
| `core/StoryGenerator.js` | 2 处 | 叙事模板选择 | **暂缓** — 表现层 |
| `core/EmotionSignalBuffer.js` | 3 处 | 信号缓冲随机 | **暂缓** — 辅助模块 |
| `spatial/WorldMap.js` | 6 处 | 空间排版随机 | **暂缓** — UI 层 |
| `sdk/Character.js` | 1 处 | ID 生成 | **暂缓** — SDK 层 |
| `sdk/AutoTick.js` | 1 处 | 自动 tick 间隔 | **暂缓** — SDK 层 |

---

## 3. Date.now() 分布点

### 3.1 Core Simulation 时间源

| 文件 | 行号 | 用途 |
|------|------|------|
| `core/Simulator.js` | 2 处 | tick 耗时统计（`Date.now() - tickStart`） |
| `agent/Agent.js` | 2 处 | 记忆 ID 生成、appraisal bias 时间戳 |

**结论：** Core simulation 使用 `env.simTime`（模拟时间），不依赖 `Date.now()`。`Date.now()` 仅用于性能统计和 ID 生成，不影响模拟确定性。

### 3.2 非核心时间源

| 文件 | 用途 | 处理策略 |
|------|------|----------|
| `agent/PersonalMemory.js` | 记忆时间戳 | 使用 `this._simTime`，非 `Date.now()` |
| `agent/IntrinsicMotivation.js` | 目标时间戳 | 使用 `env.simTime`，非 `Date.now()` |
| `store/*.js` | 存储层时间戳 | **暂缓** — 物理层 |
| `sdk/*.js` | SDK 层时间戳 | **暂缓** — SDK 层 |

---

## 4. RNG 路由路线图

### Phase 21.0（当前）
- ✅ 创建 `core/RNG.js` — 可播种 PRNG
- ✅ 注入 `AndyEngine` 和 `AndyWorld` — `config.seed` 支持
- ✅ 不修改任何现有随机点

### Phase 21.1（下一步）
- 将 P0 随机源路由到 `this.rng.next()`：
  - `BehaviorField._gaussianRandom()` → 使用 `this.rng`
  - `EventDispatcher` 相遇/随机事件 → 使用 `this.rng`
  - `Schedule` 概率/jitter → 使用 `this.rng`
  - `Simulator` 空间相遇 → 使用 `this.rng`
- 将 P1 随机源路由到 `this.rng.next()`

### Phase 21.2（后续）
- P2 随机源路由
- World State 序列化中保存 RNG 状态
- Replay 验证：相同 seed + 相同输入 → 相同输出

---

## 5. 非目标

本文档**不**包含：
- 现有随机逻辑的修改
- Agent.tick 演化逻辑的修改
- Stable World Envelope 的修改
- SDK Public API 的修改
