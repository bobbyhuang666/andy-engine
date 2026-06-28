# Agent.tick() 决策点审计 — Phase 32.0

> **审计日期：** 2026-06-13
> **审计范围：** Agent.tick() 16 步管线中所有决策点
> **目标：** 标注风险和迁移优先级

---

## 1. 审计方法

逐行审查 `agent/Agent.js` 的 `tick()` 方法（~350 行），识别所有"直接决策"点——即直接修改 Agent/World 状态的代码路径，而非通过 EventEffectPipeline。

---

## 2. 决策点清单

| Step | 决策类型 | 代码位置 | 当前方式 | 已进入 Action Selection | 风险 | 迁移优先级 |
|------|---------|---------|---------|------------------------|------|-----------|
| 1 | 事件感知 | L180 | `_perceiveEvents(safeEvents)` — Appraisal → 情绪反应 → 记忆存储 | ❌ 未进入 | 高 | P3（核心感知管线，不可替代） |
| 1.5 | 情绪调节 | L184 | `emotionRegulation.tryRegulate()` — Gross 模型主动调节 | ❌ 未进入 | 中 | P3（心理学理论驱动） |
| 2 | 需求演化 | L195 | `needs.tickWithBehavior()` — 需求衰减 + 行为向量恢复 | 间接（NeedCandidateProvider） | 高 | P4（核心需求系统） |
| 2.5 | 自发动机 | L200 | `intrinsicMotivation.tick()` — 好奇心驱力 + 目标生成 | 间接（ExploreCandidateProvider） | 中 | P3（已部分接入） |
| 3 | 日程检查 | L216 | `_checkSchedule()` — 日程驱动位置变化 + skip behavior | 间接（ScheduleCandidateProvider） | 高 | P4（核心日程系统） |
| 3 | 需求移动 | L257 | `_findNeedRegion()` → 直接修改 `this.position` | ❌ 未进入 | 高 | P4（核心需求响应） |
| 3 | 探索移动 | L264 | `imResult.drive.targetRegions` → 直接修改 `this.position` | ❌ 未进入 | 中 | P3（自发动机驱动） |
| 3.5 | 位置补录 | L287 | 更新 `familiarity` 和 `explorationHistory` | ❌ 未进入 | 低 | P2（副作用记录） |
| 4 | 行为场 | L321 | `behaviorField.tick()` — Langevin 动力学 → B → label | 间接（BehaviorFieldCandidateProvider） | **核心** | **不迁移** |
| 4 | 状态转移 | L325 | 标签变化 → `stateChanged` + `stateMachine.history` | ❌ 未进入 | 低 | P2（向下游兼容） |
| 3.9 | 目标更新 | L346 | `goalSystem.tick()` — 完成/超时/衰减 | 间接（GoalSystem 影响评分） | 低 | P2（已接入评分） |
| 4.0 | Action Selection | L355 | `UtilitySelector.select()` → `action_selected` event → `EventEffectPipeline` | ✅ 已进入 | 低 | **已完成** |
| 4.1 | 需求→情绪 | L417 | `_applyNeedsToEmotion()` — 需求匮乏 → 负面情绪 | ❌ 未进入 | 中 | P3（副作用，非决策） |
| 3.6 | 健康更新 | L421 | `_updateHealth()` — 睡眠/压力/天气 → 健康变化 | ❌ 未进入 | 中 | P3（副作用，非决策） |
| 4 | 情绪演化 | L424 | `emotion.tick()` — 30 维情绪 10 步管线 | ❌ 未进入 | 高 | P4（核心情绪系统） |
| 4.5 | 调节恢复 | L427 | `emotionRegulation.tick()` — 资源恢复 | ❌ 未进入 | 低 | P2（维护性） |
| 5 | 记忆维护 | L430 | `memory.tick()` — 记忆衰减 | ❌ 未进入 | 低 | P2（维护性） |
| 6 | 社交能量 | L433 | `_updateSocialEnergy()` — 社交性 → 能量变化 | ❌ 未进入 | 低 | P2（维护性） |
| 7 | 程序性记忆 | L436 | `proceduralMemory.recordAction()` — 习惯记录 | ❌ 未进入 | 低 | P2（已间接接入评分） |
| 8 | 定期反思 | L458 | `_reflect()` — 记忆整合 + 情绪模式识别 | ❌ 未进入 | 低 | P1（低频，可安全迁移） |
| 8.5 | 心智游移 | L470 | `_mindWander()` — 记忆回忆 → 内心事件 | ❌ 未进入 | 低 | P1（低频，可安全迁移） |
| 9 | 人格漂移 | L486 | `personality.drift()` — 基于累积统计 | ❌ 未进入 | 低 | P2（极低频） |

> 共 22 行（含 BehaviorField 核心行），其中 21 个可迁移决策点 + 1 个核心不可迁移点。

---

## 3. 风险评级说明

| 等级 | 定义 | 迁移策略 |
|------|------|---------|
| **核心** | 行为场本身，不可替代 | 不迁移 |
| **高** | 修改核心状态（位置、需求、情绪），与 BehaviorField 直接竞争 | Phase 35+，需大量回归测试 |
| **中** | 间接影响行为，有理论支撑 | Phase 34+，需验证一致性 |
| **低** | 低频/副作用/维护性，不影响核心决策 | Phase 33 候选 |

---

## 4. 迁移优先级排序

### P1: Phase 33 候选（低风险，可安全迁移）

| 决策 | 理由 |
|------|------|
| `_reflect()` | 每 12 tick 触发一次，不影响实时行为 |
| `_mindWander()` | 空闲状态概率触发，行为影响小 |
| `_ticksSinceDriftCheck` | 极低频（每 100 tick），不影响行为 |

### P2: 维护性操作（不迁移，保持原样）

| 决策 | 理由 |
|------|------|
| `memory.tick()` | 记忆衰减，非决策 |
| `proceduralMemory.tick()` | 习惯衰减，非决策 |
| `emotionRegulation.tick()` | 资源恢复，非决策 |
| `_updateSocialEnergy()` | 社交能量更新，非决策 |
| `stateMachine.history` | 向下游兼容，非决策 |
| `goalSystem.tick()` | 目标生命周期，已接入评分 |
| `personality.drift()` | 极低频，非决策 |

### P3: 中风险，Phase 34+

| 决策 | 理由 |
|------|------|
| `_perceiveEvents()` | 核心感知管线，不可替代，但可让 action selection 影响记忆编码 |
| `emotionRegulation.tryRegulate()` | 心理学理论驱动，可让 action selection 影响调节策略选择 |
| `_applyNeedsToEmotion()` | 副作用，非决策，但可让 action selection 影响需求→情绪耦合强度 |
| `_updateHealth()` | 副作用，非决策，但可让 action selection 影响健康恢复行为 |
| 探索移动（L264） | 自发动机驱动，已间接接入评分 |

### P4: 高风险，Phase 35+

| 决策 | 理由 |
|------|------|
| `needs.tickWithBehavior()` | 核心需求系统，与 BehaviorField 直接竞争 |
| `_checkSchedule()` | 核心日程系统，破坏会影响日程遵从 |
| 需求移动（L257） | 紧急需求覆盖日程，核心需求响应 |
| `emotion.tick()` | 核心情绪系统，30 维 10 步管线 |

---

## 5. 关键发现

### 5.1 直接位置修改（最高风险）

Agent.tick() 中有 3 处直接修改 `this.position`：
- L219: `_checkSchedule()` 结果
- L262: `_findNeedRegion()` 结果
- L277: 探索目标

这 3 处绕过了 action selection，直接修改世界状态。迁移它们需要：
- 确保 action selection 的 `move` 候选能覆盖所有 3 种场景
- 确保 `EventEffectPipeline` 能处理位置变更
- 确保 `ReasonTrace` 记录位置变更原因

### 5.2 BehaviorField 不可替代

`behaviorField.tick()` (L321) 是唯一的行为决策源。Action selection 的角色是：
- 读取 BehaviorField 输出作为候选
- 通过评分间接影响选择
- 产生可追溯的事件

**永远不要让 action selection 直接修改 B 向量。**

### 5.3 skip behavior 是特殊路径

`_checkSchedule()` 中的 skip behavior (L222-256) 直接修改 B 向量和位置。这是唯一一处"绕过" BehaviorField 的决策。迁移风险高，建议保持原样。

---

## 6. 结论

- **可安全迁移（P1）**：`_reflect()`、`_mindWander()` — 低频、低影响
- **保持原样（P2）**：维护性操作，非决策
- **谨慎迁移（P3）**：感知管线、情绪调节 — 需验证一致性
- **最后迁移（P4）**：需求/日程/情绪核心 — 高风险，需大量测试

**Phase 32 的目标不是迁移这些决策，而是：**
1. 让现有决策可追溯（ReasonTrace）
2. 让 Memory/Goal/WorldPressure 通过评分间接影响
3. 通过白名单逐步接管低风险动作
4. 为未来迁移建立基础设施
