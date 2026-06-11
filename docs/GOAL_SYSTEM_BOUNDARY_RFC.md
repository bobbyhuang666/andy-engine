# GoalSystem Boundary RFC — Phase 23

> **这不是实现计划，不是代码修改指令。**
> **这是目标系统在 Persistent World 引擎中的边界定义与物理数据格式 RFC。**
> **注意：本 RFC 中的所有代码片段和数据结构设计均为 illustrative pseudo-code，仅用于说明概念边界，不作为实现授权或最终实现合同。**

---

## 1. Context

### 1.1 当前状态

Andy Engine v0.2.0 已有一个自生目标系统（`IntrinsicMotivation`），但它是**封闭的、单一来源的**：

| 特性 | 当前实现 |
|------|----------|
| 来源 | 仅好奇心驱动（Self-generated） |
| 结构 | `{ id, type, target, createdAt, deadline, status, description }` |
| 生命周期 | 生成 → 进度更新 → 完成/超时 |
| 对行为的影响 | 通过 `intrinsic` 梯度源间接影响（微弱） |
| 持久化 | 嵌入 `IntrinsicMotivation.toJSON()` 的 runtimeSnapshot |

**缺失：**
- 无外部目标（用户指令）
- 无背景设定目标（MBTI/人设派生）
- 无事件派生目标（世界事件触发）
- 无统一的目标调度与冲突解决机制

### 1.2 核心约束

**目标不能成为"状态直切指令"。**

BehaviorField 的朗之万动力学是唯一的行为决策源。目标只能通过**间接引力通道**（势能梯度）影响行为，不能直接修改 B 向量或 label。

---

## 2. 问题 1：目标的物理定义

### 2.1 目标是什么？

在引擎物理层，目标是一个**条件化的 4D 吸引子 + 生命周期状态机**。

**不是：**
- 一个待执行的命令（"去睡觉"）
- 一个离散状态转移指令（"从 A 跳到 B"）
- 一个 Prompt 片段

**是：**
- 一个在行为空间 B ∈ [0,1]⁴ 中的吸引子（或排斥子）
- 附带一个完成条件谓词（Predicate）
- 附带一个时间衰减函数
- 附带一个优先级权重

### 2.2 结构化定义

```javascript
// Goal 物理结构（illustrative candidate shape）
{
  // ─── 身份标识 ───
  id: string,                    // 唯一标识
  source: GoalSource,            // 来源分类（见 §3）
  category: string,              // 语义分类（Domain Config 声明）

  // ─── 行为吸引子 ───
  attractor: {
    B_star: number[4],           // 4D 靶点 [activity, sociality, focus, expressiveness]
    type: 'attract' | 'repel',   // 吸引或排斥
    region: string | null,       // 关联区域（可选，用于区域到达检测）
  },

  // ─── 完成条件 ───
  completion: {
    predicate: GoalPredicate,    // 完成条件谓词（见 §2.3）
    timeout: number,             // 超时时间（模拟毫秒）
  },

  // ─── 动力学参数 ───
  dynamics: {
    priority: number,            // 基础优先级 (0, 1]
    urgency: number,             // 当前紧急度 (0, 1]（随时间/事件动态变化）
    decay: {
      type: 'linear' | 'exponential' | 'sigmoid',
      rate: number,              // 衰减速率
      halfLife: number | null,   // 半衰期（exponential 时使用）
    },
    saturation: {
      maxWeight: number,         // 单目标最大权重
      curve: 'tanh' | 'linear', // 饱和曲线类型
    },
  },

  // ─── 生命周期 ───
  lifecycle: {
    status: 'active' | 'completed' | 'expired' | 'abandoned',
    createdAt: number,           // 创建时间（模拟毫秒）
    activatedAt: number | null,  // 激活时间
    deadline: number | null,     // 截止时间
    completedAt: number | null,  // 完成时间
  },

  // ─── 元数据 ───
  meta: {
    description: string,         // 人类可读描述
    emotionTrigger: string | null, // 触发情绪标签
    tags: string[],              // 语义标签
  },
}
```

### 2.3 完成条件谓词（GoalPredicate）

完成条件是一个**声明式谓词**，不依赖运行时代码：

```typescript
type GoalPredicate =
  | { type: 'region_reached'; region: string }
  | { type: 'state_entered'; state: string }
  | { type: 'ticks_in_region'; region: string; minTicks: number }
  | { type: 'need_above'; need: string; threshold: number }
  | { type: 'emotion_above'; dimension: string; threshold: number }
  | { type: 'custom'; expression: string }  // Domain-specific 扩展点
```

**示例：**
- "到达图书馆" → `{ type: 'region_reached', region: '图书馆' }`
- "保持平静 10 tick" → `{ type: 'emotion_above', dimension: 'calm', threshold: 0.3 }`（需连续检测）
- "好奇心降到 0.2 以下" → `{ type: 'need_above', need: 'stimulation', threshold: 0.6 }`

**关键约束：** 谓词只能**观察**世界状态，不能**修改**世界状态。

---

## 3. 问题 2：目标的分类隔离

### 3.1 四类目标来源

```typescript
enum GoalSource {
  EXTERNAL = 'external',           // 用户下达的指令
  BACKGROUND = 'background',       // MBTI/人设派生
  SELF_GENERATED = 'self',         // 好奇心涌现
  WORLD_EVENT = 'world_event',     // 世界事件触发
}
```

### 3.2 各类目标的生命周期

#### External Goals（外部目标）

```
创建：用户通过 API 注入
激活：立即激活
优先级：最高（可抢占其他目标）
完成：用户确认 或 条件满足
超时：用户设定 或 无超时
```

**关键约束：** External Goals 不直接修改行为状态。它只是向行为场注入一个强引力。

> [!CAUTION]
> 用户下达的外部目标（External Goals）也必须严格通过梯度（gradient）、事件（event）或认知评价（appraisal）等间接通路来影响行为，绝不允许绕过 BehaviorField 强行锁定行为状态（state）或 label，确保 Agent 的主体心理自洽性与自主性不受侵蚀。

#### Background-derived Goals（背景设定目标）

```
创建：角色实例化时从 MBTI/personality 派生
激活：条件触发（如时间、需求状态）
优先级：中等
完成：条件满足 或 周期性重置
超时：较长（天级别）
```

**派生规则（Domain Config 声明）：**

```javascript
// Domain Config 新增字段（illustrative）
backgroundGoalTemplates: {
  'INFP': [
    {
      category: 'creative_expression',
      attractor: { B_star: [0.25, 0.08, 0.75, 0.08], region: '图书馆' },
      trigger: { need: 'stimulation', threshold: 0.5 },
      priority: 0.4,
      description: '想找一个安静的地方写点东西',
    },
  ],
  'ENFP': [
    {
      category: 'social_exploration',
      attractor: { B_star: [0.35, 0.85, 0.25, 0.80], region: '校园广场' },
      trigger: { need: 'social', threshold: 0.4 },
      priority: 0.5,
      description: '想去认识新朋友',
    },
  ],
}
```

**生命周期：** 角色创建时注入 → 条件触发时激活 → 完成后冷却 → 冷却结束后可重新触发

#### Self-generated Goals（自生目标）

```
创建：IntrinsicMotivation 好奇心涌现（现有机制）
激活：立即激活
优先级：低
完成：到达目标区域 / 学习进度达标
超时：短（小时级别）
```

**现状：** 已由 `IntrinsicMotivation._maybeGenerateGoal()` 实现。RFC 要求将其纳入统一目标调度。

#### World-event-derived Goals（事件派生目标）

```
创建：Agent 感知到世界事件时触发
激活：立即激活
优先级：高（仅次于 External）
完成：反应完成 或 超时
超时：短（分钟级别）
```

**触发条件（Domain Config 声明）：**

```javascript
// Domain Config 新增字段（illustrative）
eventGoalTriggers: {
  'fire': {
    predicate: { type: 'event_type', value: 'disaster' },
    goal: {
      category: 'emergency_response',
      attractor: { type: 'repel', B_star: [0.70, 0.15, 0.75, 0.20] },
      priority: 0.9,
      timeout: 30 * 60 * 1000, // 30 分钟
      description: '发生火灾，需要逃离',
    },
  },
  'friend_sick': {
    predicate: { type: 'event_content', keywords: ['生病', '不舒服'] },
    goal: {
      category: 'social_support',
      attractor: { type: 'attract', B_star: [0.35, 0.85, 0.25, 0.80] },
      priority: 0.7,
      timeout: 2 * 60 * 60 * 1000, // 2 小时
      description: '朋友生病了，想去看看',
    },
  },
}
```

### 3.3 优先级层级

```
External > World-event > Background > Self-generated
  (1.0)      (0.7-0.9)     (0.3-0.6)    (0.1-0.3)
```

**抢占规则：** 高优先级目标可以**抑制**低优先级目标的梯度权重，但不能**删除**低优先级目标。

---

## 4. 问题 3：目标对行为的间接引导机制

### 4.1 核心原则：目标只能通过场梯度影响行为

**禁止：** 目标直接修改 `behaviorField.B`、`behaviorField.label`、`stateMachine.currentState`

**允许：** 目标作为第 8 个梯度源（`∇U_goal`）加入 `_computeGradient()`

### 4.2 目标梯度函数

每条活跃目标产生一个梯度贡献：

```
∇U_goal_i(B) = w_i · g_i(B)
```

其中：
- `w_i`：有效权重（优先级 × 紧急度 × 饱和衰减 × 需求抑制）
- `g_i(B)`：梯度函数（取决于目标类型）

#### 吸引型目标（attract）

```
g_i(B) = B - B*_i          // 标准二次势能梯度
U_i = w_i · ||B - B*_i||²  // 二次势能
```

#### 排斥型目标（repel）

```
g_i(B) = (B - B*_i) · sech²(||B - B*_i||² / λ) / λ  // 高斯壁垒梯度
U_i = w_i · λ · ln(cosh(||B - B*_i||² / λ))           // 高斯壁垒势能
```

### 4.3 有效权重计算

```javascript
function computeGoalWeight(goal, agent) {
  // 基础优先级
  let w = goal.dynamics.priority;

  // 紧急度（随时间增长或事件触发）
  w *= goal.dynamics.urgency;

  // 饱和衰减（tanh 上限）
  w = goal.dynamics.saturation.maxWeight
    * Math.tanh(w / goal.dynamics.saturation.maxWeight);

  // 需求抑制（基本需求匮乏时降低非紧急目标权重）
  if (goal.source !== 'external') {
    const needsFactor = Math.min(1.0, Math.min(...Object.values(agent.needs.needs)) / 0.3);
    w *= needsFactor;
  }
  // External Goals 不受需求抑制（用户指令优先）

  // 时间衰减
  w *= computeDecay(goal);

  return w;
}
```

### 4.4 冲突解决：梯度叠加 + 优先级抑制

当多个目标的梯度方向冲突时，不使用"赢家通吃"，而是**加权叠加**：

```
∇U_goals = Σ_i w_i · g_i(B)
```

**但高优先级目标可以抑制低优先级目标的权重：**

```javascript
function resolveGoalConflicts(goals) {
  // 按优先级排序
  goals.sort((a, b) => b.dynamics.priority - a.dynamics.priority);

  // 最高优先级目标对低优先级目标产生抑制
  for (let i = 1; i < goals.length; i++) {
    const suppressionFactor = 1 - goals[0].dynamics.priority * 0.3;
    goals[i].dynamics.urgency *= suppressionFactor;
  }

  return goals;
}
```

### 4.5 与现有梯度源的融合

```
∇U_total = Σ_k w_k · ∇U_k(B)  +  ∇U_goals(B)
         = w_needs · ∇U_needs
         + w_emotion · ∇U_emotion
         + w_schedule · ∇U_schedule
         + w_intrinsic · ∇U_intrinsic
         + w_habit · ∇U_habit
         + w_time · ∇U_time
         + w_memory · ∇U_memory    // Phase 22
         + w_boundary · ∇U_boundary
         + Σ_i w_goal_i · g_i(B)   // Phase 23（新增）
```

**层级优先级：**

```
needs (3.0) > schedule (1.8) > emotion (2.0) > goals (0.5-1.5) > memory (1.5) > intrinsic (1.5) > habit (0.5) > time (0.4)
```

目标权重范围 (0.5-1.5) 位于中层，确保：
- External Goals (w≈1.5) 能压过日程和记忆
- Self-generated Goals (w≈0.5) 不会压过需求和情绪
- World-event Goals (w≈1.0-1.3) 在紧急时能改变行为方向

### 4.6 Schedule 冲突：目标注入日程压力

目标不直接修改 Schedule，但可以通过**日程压力信号**间接影响：

```javascript
// 在 buildBehaviorSignals() 中
signals.goalPressure = {
  // 目标对日程梯度的干扰系数
  scheduleOverride: highestGoalUrgency > 0.7 ? 0.3 : 1.0,
  // 高紧急度目标降低日程权重（30% 保留）
};
```

**效果：** 当一个高紧急度的事件派生目标（如"逃离火灾"）激活时，日程的拉力被削弱 70%，但不会完全消失。

---

## 5. 问题 4：持久化与 Opaque Payload

### 5.1 两层划分

根据 WORLD_SCHEMA.md 的 Stable Envelope vs runtimeSnapshot 划分：

| 字段 | 归属 | 理由 |
|------|------|------|
| `goal.id` | Stable Envelope | 跨版本稳定标识 |
| `goal.source` | Stable Envelope | 来源分类（公共枚举） |
| `goal.category` | Stable Envelope | 语义分类（公共枚举） |
| `goal.lifecycle.status` | Stable Envelope | 完成状态（公共枚举） |
| `goal.meta.description` | Stable Envelope | 人类可读描述 |
| `goal.attractor.B_star` | runtimeSnapshot | 4D 靶点（引擎内部坐标） |
| `goal.attractor.type` | runtimeSnapshot | 吸引/排斥（引擎内部类型） |
| `goal.completion.predicate` | runtimeSnapshot | 完成条件谓词（引擎内部逻辑） |
| `goal.dynamics.*` | runtimeSnapshot | 优先级、紧急度、衰减参数 |
| `goal.lifecycle.createdAt` | runtimeSnapshot | 时间戳（内部计时） |
| `goal.lifecycle.deadline` | runtimeSnapshot | 截止时间（内部计时） |

### 5.2 Stable Envelope 扩展

> [!WARNING]
> **本 RFC 不授权修改 Stable World Envelope。** 以下内容仅作为未来可能演进的候选方案设计（Potential future Stable Envelope extension, not approved by this RFC），当前版本禁止在此处引入任何 Stable Envelope 结构变动。

在 WORLD_SCHEMA.md 的 `characters` 数组中新增 `goals` 字段：

```json
{
  "id": "maya",
  "name": "Maya",
  "position": "图书馆",
  "goals": [
    {
      "id": "goal_42",
      "source": "self",
      "category": "explore_new",
      "status": "active",
      "description": "想去公园看看"
    },
    {
      "id": "goal_43",
      "source": "background",
      "category": "creative_expression",
      "status": "completed",
      "description": "想找一个安静的地方写点东西"
    }
  ]
}
```

### 5.3 runtimeSnapshot 中的目标数据

在 `runtimeSnapshot.agents[agentId]` 中新增 `goals` 字段：

```json
{
  "goals": {
    "active": [
      {
        "id": "goal_42",
        "source": "self",
        "category": "explore_new",
        "attractor": {
          "B_star": [0.45, 0.35, 0.40, 0.40],
          "type": "attract",
          "region": "公园"
        },
        "completion": {
          "predicate": { "type": "region_reached", "region": "公园" },
          "timeout": 7200000
        },
        "dynamics": {
          "priority": 0.3,
          "urgency": 0.5,
          "decay": { "type": "exponential", "rate": 0.01, "halfLife": null },
          "saturation": { "maxWeight": 0.8, "curve": "tanh" }
        },
        "lifecycle": {
          "status": "active",
          "createdAt": 1726312345000,
          "activatedAt": 1726312345000,
          "deadline": 1726319545000,
          "completedAt": null
        }
      }
    ],
    "completed": [
      {
        "id": "goal_43",
        "source": "background",
        "category": "creative_expression",
        "lifecycle": {
          "status": "completed",
          "createdAt": 1726300000000,
          "activatedAt": 1726300000000,
          "deadline": 1726386400000,
          "completedAt": 1726310000000
        }
      }
    ]
  }
}
```

### 5.4 引擎升级兼容性

**原则：** 目标调度算法的升级不影响历史已完成目标数据。

- 已完成目标只保留 `{ id, source, category, status, description, completedAt }`
- 活跃目标保留完整结构（含 dynamics、completion）
- 引擎升级时，旧版活跃目标的 `dynamics` 字段由 Migration Pipeline 补齐默认值
- 已完成目标永远不需要 Migration——它们已经是归档数据

---

## 6. Future Implementation Pipeline Candidate

> [!NOTE]
> **以下为实现管线草案，属于 Future Implementation Pipeline Candidate (phase number TBD, not authorized by this RFC)。**
> **此处所有代码和字段结构定义仅作为 illustrative pseudo-code / candidate shape, 不作为最终的 implementation contract。**

```
Agent.tick()
  ├── ... 现有管线 ...
  ├── _processGoals(env)                    // 新增：目标处理
  │     ├── _updateGoalProgress(goals)      // 更新完成状态
  │     ├── _checkGoalTriggers(events)      // 检查事件派生触发
  │     ├── _decayGoalUrgency(goals, dt)    // 紧急度衰减
  │     └── _resolveGoalConflicts(goals)    // 优先级抑制
  ├── buildBehaviorSignals(env)
  │     └── signals.goals = this._buildGoalSignals()  // 新增：目标信号
  └── behaviorField.tick(signals)
        └── _computeGradient(signals)
              ├── ... 现有 7 个梯度源 ...
              └── _addGoalGradient(grad, signals.goals, w.goal)  // 新增
```

### 6.1 signals.goals 格式

```javascript
signals.goals = {
  targets: [
    { B_star: [0.45, 0.35, 0.40, 0.40], weight: 0.5, type: 'attract' },
    { B_star: [0.70, 0.15, 0.75, 0.20], weight: 1.2, type: 'repel' },
  ],
  schedulePressure: 0.7,  // 日程压力系数（1.0=正常，<1.0=日程被削弱）
};
```

---

## 7. Domain Config 扩展清单

> [!WARNING]
> **以下为候选的 Domain Config 新增字段，未获得本 RFC 授权。**
> **Future Domain Config candidate fields, not approved by this RFC.**

候选字段设计如下（仅作为 candidate shape）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `memoryBehaviorMap` | object | 记忆→行为映射（Phase 22） |
| `backgroundGoalTemplates` | object | MBTI→背景目标模板 |
| `eventGoalTriggers` | object | 事件→目标触发规则 |
| `goalDefaults` | object | 目标动力学默认参数 |

这些字段均需通过 `validateDomain()` 校验。

---

## 8. 非目标

本 RFC **不**包含：
- Agent.tick() 管线修改
- BehaviorField 代码修改
- IntrinsicMotivation 代码修改
- Domain Config 字段修改
- Stable World Envelope 结构修改
- 测试用例修改

---

## 9. 开放问题

1. **目标记忆：** 完成/失败的目标是否应该生成记忆（`PersonalMemory.addExperience()`），影响未来的目标生成？
2. **目标传染：** Agent 之间是否可以通过社交互动"传播"目标（如"朋友说公园很美"→产生去公园的目标）？
3. **目标冲突的显式反馈：** 当目标冲突导致行为"犹豫"时，是否应该生成心智游移事件（"想去又不想去"）？
4. **External Goal 的信任度：** 用户下达的目标是否应该有一个"信任度"参数，低信任度的目标权重更低？
5. **目标的层次结构：** 是否需要支持"子目标"（如"去图书馆"→"找到书"→"坐下来读"）？还是保持扁平结构？

---

## 10. Future Implementation Candidate

Future Implementation Candidate, phase number TBD.
