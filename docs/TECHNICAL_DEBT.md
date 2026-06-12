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

### 建议（不在此 Pass 执行）

将 `Agent.tick()` 管线拆分为独立的 handler/processor：

```
agent/
  Agent.js              → 核心协调器（<500 行）
  handlers/
    PerceptionHandler   → _perceiveEvents + Appraisal
    ScheduleHandler     → _checkSchedule + skip logic
    HealthHandler       → _updateHealth + sick events
    ReflectionHandler   → _reflect + consolidate
    MindWanderHandler   → _mindWander + daydream
    SocialHandler       → _updateSocialEnergy
```

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
