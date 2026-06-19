# Technical Debt — Andy Engine

> **记录已知的技术债务，供后续重构参考。**
> **Stability Pass 期间不执行重构。**

---

## 1. Agent.js 文件体积

**文件：** `agent/Agent.js`
**行数：** ~1710 行
**复杂度：** 高

### 问题

Agent.js 是引擎中最核心、最复杂的文件，承载了：
- 主循环 `tick()`（16 步子系统演化）
- 事件感知 `_perceiveEvents()`
- 日程检查 `_checkSchedule()`
- 健康系统 `_updateHealth()`
- 心智游移 `_mindWander()`
- 反思机制 `_reflect()`
- 行为后果评估 `_assessStateConsequences()`
- 需求→情绪耦合 `_applyNeedsToEmotion()`
- 社交能量更新 `_updateSocialEnergy()`
- 多个辅助方法

### 影响

- 单文件过长，难以导航和维护
- 多个职责耦合在一个类中
- 测试困难（无法独立测试单个子系统管线）

### Handler Candidates (未来拆分目标)

| Handler | 职责 | 涉及方法 | 依赖 |
|---------|------|----------|------|
| **PerceptionHandler** | 事件感知 + 认知评价 | `_perceiveEvents()`, `_assessStateConsequences()` | `Appraisal`, `EmotionVector`, `PersonalMemory`, `EventEffectPipeline`, `ForbiddenTerms` |
| **ScheduleHandler** | 日程驱动位置变化 | `_checkSchedule()` | `Schedule`, `SpatialEngine`, `World` |
| **HealthHandler** | 健康系统 + 生病事件 | `_updateHealth()` | `NeedsSystem`, `EventDispatcher` |
| **ReflectionHandler** | 定期反思 + 记忆整合 | `_reflect()` | `PersonalMemory`, `EmotionVector`, `IntrinsicMotivation` |
| **MindWanderHandler** | 心智游移 + 白日梦 | `_mindWander()` | `BehaviorField`, `PersonalMemory`, `EmotionVector` |
| **SocialHandler** | 社交能量更新 | `_updateSocialEnergy()` | `BehaviorField`, `SocialGraph` |
| **NeedsEmotionCoupler** | 需求→情绪耦合 | `_applyNeedsToEmotion()` | `NeedsSystem`, `EmotionVector` |

### 拆分禁止事项

- **禁止改变 `Agent.tick()` 调用序列**：16 步顺序是心理学模型的核心，不能重新排序
- **禁止改变任何 public/private 方法签名**：下游代码（SDK、测试）依赖这些签名
- **禁止引入新的抽象层**：不要创建 `HandlerBase`、`Pipeline` 等框架
- **禁止在 debt cleanup 期间拆分**：这是 preparation only，实际拆分需要独立 PR + 全量测试
- **禁止移动 `BehaviorField`、`EmotionVector` 等子系统**：它们已经是独立模块

### 拆分前提条件 (Stop Conditions)

在以下条件满足前，不要开始实际拆分：

1. **所有 D1-D5 debt cleanup 完成**：确保没有遗留的边界违规
2. **`npm run check:boundaries` 100% 通过**：确保边界检查无警告
3. **`npm test` 全量测试全绿**：确保拆分前基线稳定
4. **每个 Handler 有独立的单元测试**：拆分后能验证行为不变
5. **`BehaviorField` 数值稳定性测试通过**：确保拆分不影响动力学核心

### 建议拆分步骤（未来执行）

1. 创建 `agent/handlers/` 目录
2. 逐个提取 handler（从最低风险的 `SocialHandler` 开始）
3. 每个 handler 提取后运行 `npm test` 验证
4. `Agent.tick()` 改为调用 handler 方法，保持原序列
5. 最终 `Agent.js` 应 < 500 行（仅协调逻辑）

**优先级：** 中（不影响功能，但影响开发效率）

---

## 2. 需求系统双接口

**文件：** `agent/NeedsSystem.js`

### 问题

NeedsSystem 有两套接口：
- `tick(hoursElapsed, currentState, currentRegion)` — 旧版离散查表
- `tickWithBehavior(hoursElapsed, behaviorField.B)` — 新版连续行为向量

旧接口仍被部分代码路径使用，造成维护负担。

### 建议

统一到 `tickWithBehavior()`，移除旧接口。需要检查所有调用点。

**优先级：** 低（向后兼容）

---

## 3. EventDispatcher 事件 ID 生成

**文件：** `core/EventDispatcher.js`

### 问题

事件 ID 使用自增计数器 `evt_${this._nextId++}`，在持久化/恢复场景下可能冲突（两个引擎实例可能生成相同的 ID）。

### 建议

使用 UUID 或结合时间戳+随机数的 ID 生成策略。

**优先级：** 低（当前单实例场景无问题）

---

## 4. PersonalMemory 检索性能

**文件：** `agent/PersonalMemory.js`

### 问题

`retrieve()` 方法在每次调用时遍历所有记忆（最多 500 条），计算 ACT-R 激活度。虽然有 tick 级缓存，但在无缓存命中时仍是 O(N) 操作。

### 建议

- 引入倒排索引（关键词→记忆列表）
- 引入激活度预筛选（只计算 top-K 候选的精确激活度）

**优先级：** 低（当前规模可接受）

---

## 5. 测试覆盖盲区

### 问题

部分子系统缺乏独立的单元测试：
- `EmotionRegulation` — 只在集成测试中间接覆盖
- `ProceduralMemory` — 缺乏独立测试
- `IntrinsicMotivation` — 只有少量测试

### 建议

为每个子系统添加独立的单元测试文件。

**优先级：** 中

---

## 6. 类型安全

### 问题

整个引擎使用纯 JavaScript，缺乏类型检查。参数传递依赖约定，运行时可能出现隐式类型错误。

### 建议

- 逐步添加 JSDoc 类型注解
- 考虑引入 TypeScript strict mode 或 tsc --checkJs

**优先级：** 低（不影响运行时）

---

## 记录信息

- **记录日期：** 2026-06-12
- **记录人：** Stability Pass
- **下次评审：** v0.3.0 规划阶段
