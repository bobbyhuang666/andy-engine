# Agent.tick() 旧决策迁移规划 — Phase 32.5

> **这不是实现计划。这是 Agent.tick() 中直接决策点的迁移风险排序和前提条件文档。**
> **迁移需要逐个审批，不能批量执行。**

---

## 1. 迁移原则

1. **每次只迁移一个决策点**
2. **迁移前后必须有回归测试对比**
3. **迁移后 BehaviorField 输出变化 < 0.01（B 向量距离）**
4. **迁移后 ReasonTrace 必须记录迁移原因**
5. **迁移后 EventEffectPipeline 必须处理迁移产生的效果**

---

## 2. 迁移优先级排序

### P1: Phase 33 候选（低风险）

| 决策 | 当前位置 | 迁移方式 | 前提条件 | 回归测试 |
|------|---------|---------|---------|---------|
| `_reflect()` | Agent.js:458 | 新增 `reflect` 候选类型 | 反思触发条件可表达为候选约束 | 100 tick 对比反思频率 |
| `_mindWander()` | Agent.js:470 | 新增 `mind_wander` 候选类型 | 心智游移条件可表达为 B 向量阈值 | 100 tick 对比心智游移事件数 |
| `_ticksSinceDriftCheck` | Agent.js:486 | 不迁移（极低频，保持原样） | N/A | N/A |

### P2: 维护性操作（不迁移）

| 决策 | 理由 |
|------|------|
| `memory.tick()` | 记忆衰减，非决策 |
| `proceduralMemory.tick()` | 习惯衰减，非决策 |
| `emotionRegulation.tick()` | 资源恢复，非决策 |
| `_updateSocialEnergy()` | 社交能量更新，非决策 |
| `stateMachine.history` | 向下游兼容，非决策 |
| `goalSystem.tick()` | 目标生命周期，已接入评分 |
| `personality.drift()` | 极低频（每 100 tick），非决策 |

### P3: Phase 34+ 候选（中风险）

| 决策 | 当前位置 | 迁移方式 | 前提条件 | 回归测试 |
|------|---------|---------|---------|---------|
| `_perceiveEvents()` | Agent.js:180 | 不迁移核心管线，但让 action selection 影响记忆编码 | 记忆重要性可被 action type 调制 | 100 tick 对比记忆数量和重要性分布 |
| `emotionRegulation.tryRegulate()` | Agent.js:184 | 不迁移核心逻辑，但让 action selection 影响调节策略选择 | 调节策略可被 action context 影响 | 100 tick 对比调节频率 |
| `_applyNeedsToEmotion()` | Agent.js:417 | 不迁移核心逻辑，但让 action selection 影响需求→情绪耦合强度 | 耦合强度可被 action type 调制 | 100 tick 对比情绪-需求相关性 |
| `_updateHealth()` | Agent.js:421 | 不迁移核心逻辑，但让 action selection 影响健康恢复行为 | 健康恢复可被 action type 调制 | 100 tick 对比健康变化曲线 |
| 探索移动 | Agent.js:264 | 通过 ExploreCandidateProvider 已间接接入 | 探索候选的评分与实际移动一致 | 100 tick 对比探索频率 |

### P4: Phase 35+ 候选（高风险）

| 决策 | 当前位置 | 迁移方式 | 前提条件 | 回归测试 |
|------|---------|---------|---------|---------|
| `needs.tickWithBehavior()` | Agent.js:195 | 不迁移核心需求系统，但让 action selection 影响需求衰减/恢复 | 需求系统与 action selection 解耦 | 1000 tick 对比需求变化曲线 |
| `_checkSchedule()` | Agent.js:216 | 不迁移核心日程系统，但让 action selection 影响日程遵从度 | 日程遵从可被 action context 调制 | 1000 tick 对比日程遵从率 |
| 需求移动 | Agent.js:257 | 通过 NeedCandidateProvider 已间接接入 | 需求候选的评分与实际移动一致 | 1000 tick 对比需求响应时间 |
| `emotion.tick()` | Agent.js:424 | 不迁移核心情绪系统 | 情绪系统与 action selection 解耦 | 1000 tick 对比情绪变化曲线 |

---

## 3. 迁移前提条件清单

每个决策点迁移前必须满足：

- [ ] 决策逻辑可表达为候选约束（type、source、metadata）
- [ ] 决策效果可表达为 EventEffectPipeline 的 effects
- [ ] 有回归测试证明迁移前后 BehaviorField 输出变化 < 0.01
- [ ] 有回归测试证明迁移前后事件频率变化 < 10%
- [ ] ReasonTrace 记录迁移原因
- [ ] source scan 确认无 Math.random/Date.now
- [ ] domain 泄漏测试通过

---

## 4. 迁移顺序建议

```
Phase 33: _reflect + _mindWander（低风险，验证迁移流程）
    ↓
Phase 34: 感知/调节/健康 副作用调制（中风险，验证间接影响）
    ↓
Phase 35: 需求/日程 核心系统（高风险，需大量回归测试）
```

**每个 Phase 完成后必须：**
1. 跑全量测试（npm test）
2. 跑 source scan
3. 跑 domain 泄漏测试
4. 写迁移报告

---

## 5. 非目标

本文档**不**包含：
- 具体迁移代码
- 迁移时间表
- 迁移审批流程
