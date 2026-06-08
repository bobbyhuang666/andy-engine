# Andy Engine: 从离散状态机到连续行为场
# 重构计划 v1.0

## 现状诊断

### 已经是连续的子系统
- `EmotionVector`: 30维连续向量，10步演化流水线 ✓
- `NeedsSystem`: 5个 [0,1] 连续标量，人格调制衰减 ✓
- `Appraisal`: 8个连续评价维度 ✓
- `Personality`: OCEAN 5维连续值 ✓
- `IntrinsicMotivation`: 连续好奇心、熟悉度、胜任感 ✓
- `EmotionRegulation`: 连续策略偏好、调节资源 ✓
- `Relationship`: 连续强度，对数增长 ✓

### 离散瓶颈（需要改造的）
- `StateMachine` (668行): 42个离散状态，手工转移列表
- `NeedsSystem.getDrive()`: 返回离散 `targetStates` 列表
- `NeedsSystem.NEED_DRIVE_STATES`: 需求→离散状态的硬编码映射
- `NeedsSystem.NEED_SATISFACTION`: 离散状态→需求恢复的硬编码映射
- `StateMachine._tryNormalTransition()` (~150行): 试图用 ad-hoc 权重让离散选择"看起来像"连续行为
- `Agent._checkSchedule()`: 日程→离散状态/区域的硬覆盖
- `Agent._getSkipAlternative()`: 跳过日程→离散替代状态

### 核心问题
系统内部已经是连续的（情绪30维、需求5维、人格5维、评价8维），
但行为输出被强制通过42个离散标签的瓶颈。
_tryNormalTransition 的150行权重代码就是瓶颈的症状——
系统在试图变得连续，但被一个离散管道卡住了。

---

## 架构设计

### 行为空间 (Behavior Space)

不是42个离散点，是一个低维连续流形。
现有42个状态沿着4个轴变化：

```
B = (activity, sociality, focus, expressiveness) ∈ [0,1]^4
```

| 维度 | 0 端 | 1 端 | 对应现有 category |
|------|------|------|-------------------|
| activity | 休息/睡觉 | 上课/工作/运动 | rest → active |
| sociality | 独处/发呆 | 聊天/社交 | quiet → social |
| focus | 漫无目的 | 高度专注 | leisure → quiet(active) |
| expressiveness | 封闭/退缩 | 外向表达 | deviant/rest → social |

现有42个状态在这个4维空间中各有一个中心点。
状态不是领土本身——它们是连续地形上的地标。

### 势能函数

```
U(B) = Σ_k w_k(t) · ||B - B*_k||²
```

其中每个 k 是一个"驱力源"：
- 需求驱力 (U_needs): B*_k = 需求满足行为的最优位置
- 情绪驱力 (U_emotion): B*_k = 情绪倾向的行为位置
- 日程驱力 (U_schedule): B*_k = 当前时间段的期望行为位置
- 自发动机 (U_intrinsic): B*_k = 好奇心/目标指向的行为位置
- 习惯惯性 (U_habit): B*_k = 上一次同一情境的行为位置

权重 w_k(t) 由各子系统的 urgency/signal 强度决定。

### 动力学方程（朗之万动力学）

```
v(t+dt) = v(t) · (1 - γ·dt) - ∇U(B(t)) · dt + σ·√dt·ξ
B(t+dt) = B(t) + v(t+dt) · dt
```

- γ: 摩擦系数（控制行为惯性，人格调制）
- σ: 噪声幅度（控制行为随机性，arousal 调制）
- ξ: 高斯白噪声

关键特性：
- 球有质量（动量）→ "忍着饿继续聊天"
- 曲面形状由人格定义 → 不同人格对同一情境有不同行为倾向
- 平滑轨迹 → 外部观察者看到的是连续滑动，不是离散跳变

### 语义标签投影器 (Label Projector)

连续行为向量 B 需要投影回语义标签，用于：
- LLM prompt 注入（getNarrative）
- StoryGenerator 模板
- ProceduralMemory 记录
- 向后兼容

投影方式：在4维空间中为每个原有状态定义一个区域（center + radius），
用最近邻或加权混合返回标签。当 B 在两个状态之间时，
返回"主要标签 + 次要标签"（如"在图书馆，但有点分心"）。

### 位置解耦

现有42个状态同时编码了**行为**和**位置**：
- "在食堂" = 正在吃饭 + 在食堂
- "在图书馆" = 正在学习 + 在图书馆

在新架构中：
- 行为向量 B 由 BehaviorField 计算（连续）
- 位置由 Schedule + SpatialEngine 决定（已有连续坐标系统）
- 两者通过"位置-行为兼容性"耦合：某些行为只能在某些位置执行

---

## 分阶段实施计划

### Phase 0: BehaviorField 模块（基础骨架）

**目标**: 创建连续行为场的核心计算模块，与现有 StateMachine 并行运行

**新建文件**:
- `agent/BehaviorField.js` — 核心模块
- `agent/BehaviorLabeler.js` — 语义标签投影器

**BehaviorField.js 核心接口**:

```js
class BehaviorField {
  constructor(personality, savedState)

  // 主入口：从子系统信号计算行为向量
  tick(signals) → { B, label, labelConfidence, gradient }

  // 内部方法
  _computeGradient(signals) → number[]    // 势能梯度
  _needsGradient(needsSignal) → number[]  // 需求梯度分量
  _emotionGradient(emoSignal) → number[]  // 情绪梯度分量
  _scheduleGradient(schedSignal) → number[] // 日程梯度分量
  _intrinsicGradient(imSignal) → number[] // 自发动机梯度分量
  _habitGradient(habitSignal) → number[]  // 习惯梯度分量
  _updateDynamics(gradient)                // 朗之万更新
  _clamp()                                 // 边界约束

  toJSON() / fromJSON()
}
```

**signals 输入格式**:

```js
{
  emotion: {
    valence: number,        // 情绪效价 [-1, 1]
    arousal: number,        // 唤醒度 [0, 1]
    approachDrive: number,  // 趋近驱力 [0, 1]（来自 _tryNormalTransition 的 joy 计算）
    avoidDrive: number,     // 回避驱力 [0, 1]
    agenticDrive: number,   // 代理驱力 [0, 1]（愤怒→反叛）
  },
  needs: {
    hunger: number,         // [0, 1], 1=饱
    energy: number,
    social: number,
    comfort: number,
    stimulation: number,
  },
  intrinsic: {
    curiosity: number,      // [0, 1]
    explorationTarget: string|null, // 探索目标区域名
  },
  schedule: {
    targetActivity: string|null,  // 当前日程活动名
    targetRegion: string|null,    // 当前日程区域名
    inSchedule: boolean,
  },
  environment: {
    hour: number,           // 0-23.99
    weather: string,
  },
  health: number,           // [0, 1]
  socialEnergy: number,     // [0, 1]
  ocean: Object,            // OCEAN 人格值
}
```

**BehaviorLabeler.js 核心数据**:

```js
// 每个原有状态在4维行为空间中的中心点
const STATE_CENTERS = {
  '在上课':     [0.8, 0.2, 0.9, 0.2],   // 高活跃, 低社交, 高专注, 低表达
  '在食堂':     [0.3, 0.6, 0.2, 0.5],   // 低活跃, 中社交, 低专注, 中表达
  '在图书馆':   [0.2, 0.1, 0.7, 0.1],   // 低活跃, 低社交, 高专注, 低表达
  '在聊天':     [0.3, 0.9, 0.3, 0.9],   // 低活跃, 高社交, 低专注, 高表达
  '睡了':       [0.0, 0.0, 0.0, 0.0],   // 全零
  '在发呆':     [0.1, 0.1, 0.1, 0.1],   // 近零
  '在工作':     [0.7, 0.2, 0.8, 0.3],   // 高活跃, 低社交, 高专注
  '在拖延':     [0.2, 0.1, 0.1, 0.2],   // 低一切（负面行为）
  '翘课了':     [0.3, 0.2, 0.1, 0.3],   // 低专注, 低社交
  '在网吧':     [0.4, 0.3, 0.5, 0.3],   // 中活跃（刺激寻求）
  '生病了':     [0.1, 0.0, 0.0, 0.1],   // 低一切
  // ... 其余状态类似
};

// 投影方法：返回 { primary, secondary, confidence }
function projectToLabel(B, hour, region) → { primary, secondary, confidence }
```

**验证方式**:
- 单元测试：构造固定 signals，验证 B 向量在预期范围内
- 对比测试：同一输入下，BehaviorField 的 label 与 StateMachine 的 currentState 的一致性

**预估工作量**: 2-3天

---

### Phase 1: 梯度源改造

**目标**: 将各子系统的离散输出改造为连续梯度向量

**改动 1: NeedsSystem.getDrive()**

现在返回 `{ need, urgency, targetStates: ['在食堂', '在便利店'] }`

改为返回 `{ need, urgency, gradientVector: [0.3, -0.2, -0.1, -0.1] }`

其中 gradientVector 是在4维行为空间中指向"需求满足方向"的向量。

具体实现：
```js
// 新增方法
getDriveGradient() {
  const drives = [];
  for (const [need, value] of Object.entries(this.needs)) {
    const threshold = cfg.threshold[need] || 0.3;
    if (value < threshold) {
      const urgency = threshold - value;
      drives.push({
        need,
        urgency,
        gradient: NEED_GRADIENT_VECTORS[need], // 连续方向向量
      });
    }
  }
  return drives;
}

// NEED_DRIVE_STATES 的连续替代
const NEED_GRADIENT_VECTORS = {
  hunger:      [0.4, 0.3, -0.3, -0.1],  // 去吃饭：中活跃, 中社交, 低专注
  energy:      [-0.8, -0.5, -0.5, -0.5], // 去休息：全面降低
  social:      [0.2, 0.9, -0.2, 0.8],    // 去社交：高社交, 高表达
  comfort:     [-0.5, -0.3, -0.2, -0.3], // 去舒适：降低活跃
  stimulation: [0.3, 0.3, 0.2, 0.4],     // 去刺激：中活跃, 中社交, 中专注
};
```

**改动 2: IntrinsicMotivation.getDrive()**

同理，返回连续梯度而非离散 targetStates/targetRegions。

**改动 3: Agent._checkSchedule()**

现在返回 `{ moved, region, skipEvent, altState }`

新增方法 `_getScheduleGradient()`，返回日程在行为空间中的"拉力方向"。

**改动 4: NeedsSystem.NEED_SATISFACTION**

现在是离散映射：`hunger → states: ['在食堂', '在吃饭', ...]`

改为连续映射：给定一个行为向量 B，计算每个需求的恢复速率。

```js
// 新增方法
getRecoveryRate(need, behaviorVector) {
  // behaviorVector 越接近该需求的"满足区域"，恢复越快
  const satisfactionCenter = NEED_SATISFACTION_CENTERS[need];
  const distance = euclideanDist(behaviorVector, satisfactionCenter);
  return baseRate * Math.max(0, 1 - distance / maxDist);
}
```

**向后兼容**: 保留原有 getDrive() 方法，新增 getDriveGradient()。
Phase 2 开始切换使用新的连续方法。

**预估工作量**: 2天

---

### Phase 2: Agent.tick() 集成

**目标**: 将 BehaviorField 接入 Agent 的主循环，替代 StateMachine

**改动位置**: `agent/Agent.js` 的 tick() 方法

**新的 tick 流程**:

```
1. perceive → 感知环境 & 处理事件（不变）
2. emotionRegulation → 情绪调节（不变）
3. needs.tick() → 需求演化（不变，但输入改为连续行为向量）
4. intrinsicMotivation.tick() → 自发动机（不变）
5. [NEW] 构建 signals 对象
6. [NEW] behaviorField.tick(signals) → 连续行为向量 B + 语义标签
7. [NEW] 从 B 推导位置变化（位置-行为兼容性）
8. [NEW] 从 label 推导状态变化（向后兼容事件生成）
9. needs→emotion 耦合（不变）
10. health 系统（改为基于连续行为向量判断，不再查离散状态列表）
11. emotion.tick()（不变）
12. emotionRegulation.tick()（改为基于连续行为向量）
13. memory.tick()（不变）
14. socialEnergy（改为基于 B.sociality 维度，不再查离散状态列表）
15. proceduralMemory.recordAction()（记录 label，向后兼容）
16. 反思、心智游移等（改为基于连续行为向量判断）
```

**关键改动**:

1. **Agent 构造函数**: 新增 `this.behaviorField = new BehaviorField(this.personality)`

2. **Agent.tick()**:
   - 移除 `this.stateMachine.tick()` 调用
   - 新增 `this.behaviorField.tick(signals)` 调用
   - 从返回的 B 和 label 中提取状态变化信息

3. **位置推导**: 从 B 的 activity + sociality + 当前位置 + 日程，
   计算"该去哪里"。不再是离散的 NEED_DRIVE_STATES 查表，
   而是连续的位置倾向函数。

4. **向后兼容**: `this.stateMachine.currentState` 改为 getter，
   从 behaviorField.label 获取。这样所有下游代码（StoryGenerator、
   ProceduralMemory、_updateHealth 等）不需要立即修改。

```js
// Agent.js 中的向后兼容 getter
get currentState() {
  return this.behaviorField.label;
}
```

**需要处理的特殊情况**:

- **睡觉状态**: 当 B.activity ≈ 0 且 B.sociality ≈ 0 且 hour ∈ [23-7] 时，
  强制投影为"睡了"。这是物理约束，不是行为倾向。

- **位置锁定**: 在某些位置（如教室里），行为范围受限。
  在教室内 B.focus 不能太低（不能跑去网吧）。
  通过"位置约束场"实现：在受限位置添加额外的势能壁。

- **外部事件驱动的状态突变**: 其他 Agent 的交互仍然可以引起行为突变。
  通过向 B 注入一个瞬时脉冲力实现（类似碰撞）。

**预估工作量**: 3-4天

---

### Phase 3: 需求系统连续化

**目标**: NeedsSystem 从"离散状态查表"改为"连续行为向量输入"

**改动 1: NeedsSystem.tick()**

现在：`tick(hoursElapsed, currentState, currentRegion)`
其中 currentState 和 currentRegion 用于查表决定恢复哪个需求。

改为：`tick(hoursElapsed, behaviorVector, currentRegion)`

```js
tick(hoursElapsed, behaviorVector, currentRegion) {
  // Step 1: 自然衰减（不变）

  // Step 2: 连续恢复
  for (const [need, center] of Object.entries(NEED_SATISFACTION_CENTERS)) {
    const dist = euclideanDist(behaviorVector, center);
    const recoveryFactor = Math.max(0, 1 - dist / MAX_SATISFACTION_DIST);
    if (recoveryFactor > 0) {
      const baseRate = cfg.recoveryRate[need] || 0.3;
      const multiplier = this._recoveryMultipliers[need] || 1.0;
      this.needs[need] = Math.min(1,
        this.needs[need] + baseRate * recoveryFactor * multiplier * hoursElapsed
      );
    }
  }
}
```

**改动 2: 移除 NEED_SATISFACTION 和 NEED_DRIVE_STATES**

用连续版本替代：

```js
// 每个需求的"满足中心"在4维行为空间中的位置
const NEED_SATISFACTION_CENTERS = {
  hunger:      [0.4, 0.5, 0.2, 0.4],   // 吃饭场景
  energy:      [0.1, 0.1, 0.1, 0.1],   // 休息/睡觉场景
  social:      [0.4, 0.9, 0.3, 0.8],   // 社交场景
  comfort:     [0.2, 0.2, 0.3, 0.2],   // 舒适/居家场景
  stimulation: [0.5, 0.4, 0.5, 0.5],   // 刺激/娱乐场景
};
```

**向后兼容**: 保留 getDrive() 方法，内部改为从连续梯度计算。

**预估工作量**: 1-2天

---

### Phase 4: 子系统清理

**目标**: 清理所有依赖离散状态的硬编码

**改动 1: Agent._updateSocialEnergy()**

现在用 `['在聊天', '在食堂', ...].includes(currentState)` 判断社交状态。

改为：`this.behaviorField.B[1] > 0.5` （sociality 维度 > 0.5 = 正在社交）。

**改动 2: Agent._updateHealth()**

现在用 `['睡了', '在休息', ...].includes(currentState)` 判断休息状态。

改为：`this.behaviorField.B[0] < 0.2` （activity 维度 < 0.2 = 在休息）。

**改动 3: Agent._mindWander()**

现在用 `['在发呆', '在看窗外', ...].includes(currentState)` 判断空闲状态。

改为：`this.behaviorField.B[0] < 0.3 && this.behaviorField.B[2] < 0.3` （低活跃 + 低专注）。

**改动 4: EmotionRegulation.tryRegulate()**

现在传入 agent 对象，内部读取 currentState。

改为：读取 agent.behaviorField.B，用连续值判断情境。

**改动 5: StoryGenerator**

现在用状态名生成模板。

改为：用 label 生成模板（向后兼容），但新增基于 B 向量的更丰富描述。

例如：不只是"在图书馆"，而是"在图书馆，但有点心不在焉"（当 B.focus < 0.5 时）。

**预估工作量**: 2天

---

### Phase 5: StateMachine 退役

**目标**: 移除 StateMachine，完成架构转换

**步骤**:

1. 将 StateMachine.js 标记为 deprecated
2. 移除 Agent.js 中所有对 stateMachine 的直接引用
3. 将 `this.stateMachine.currentState` 的 getter 改为从 behaviorField.label 获取
4. 更新所有测试用例
5. 更新 demo/character-lab 中的状态显示
6. 更新 README 中的架构图

**向后兼容策略**:

BehaviorField.label 始终返回一个原有的状态名（从 STATE_CENTERS 投影），
所以所有下游代码（StoryGenerator、ProceduralMemory、demo）不需要修改。

新增的 `agent.behavior` 属性暴露连续行为向量：
```js
get behavior() {
  return {
    vector: this.behaviorField.B,     // [activity, sociality, focus, expressiveness]
    label: this.behaviorField.label,  // 最近的语义标签
    gradient: this.behaviorField.lastGradient, // 当前势能梯度
    momentum: this.behaviorField.velocity,     // 当前动量
  };
}
```

**预估工作量**: 1天

---

### Phase 6: 增强 & 实验

**目标**: 利用连续行为场的特性做之前做不到的事

**6a: 行为轨迹可视化**

在 demo/character-lab 中新增行为轨迹视图：
- 2D 散点图（activity × sociality），每个 tick 一个点
- 轨迹线连接相邻 tick 的点
- 不同人格的角色在同一图上显示不同轨迹
- 可以看到"球在势能面上滚动"的效果

**6b: 行为预测**

给定当前 B 和 velocity，预测未来 N 个 tick 的行为轨迹。
这对 LLM prompt 注入很有价值：可以告诉 LLM "这个角色正在朝社交方向移动"。

**6c: 人格对比实验**

同一情境下，不同人格的行为轨迹应该有明显差异：
- INFP: 在社交-独处之间缓慢摆动，惯性大
- ESTP: 快速切换，惯性小，噪声大
- 验证方式：运行100个tick，比较轨迹的方差和速度

**6d: 势能面可视化**

渲染4维势能面的2D切片（固定 focus=0.5, expressiveness=0.5），
显示不同人格/情绪状态下的地形差异。

**预估工作量**: 2-3天

---

## 风险 & 缓解

### 风险1: 连续行为"漂移"

球在势能面上可能漂移到没有对应语义标签的区域（行为空间的"空白地带"）。

**缓解**:
- 边界约束：B 的每个维度 clamp 到 [0, 1]
- 边界势能壁：靠近边界时增加向内的梯度
- STATE_CENTERS 覆盖：确保42个状态的中心点覆盖了行为空间的主要区域

### 风险2: 惯性导致"迟钝"

如果摩擦系数 γ 太小，球的惯性太大，行为变化会太慢，
角色可能在该吃饭的时候继续发呆。

**缓解**:
- γ 作为可调参数，在 defaults.js 中配置
- 紧急需求（如饥饿 < 0.1）可以临时增大 γ（增加摩擦，让球更快停下来转向）
- 关键时刻（如睡觉时间）可以注入强制脉冲

### 风险3: 位置-行为耦合断裂

现在"在食堂"同时指定了行为（吃饭）和位置（食堂）。
拆分后可能出现"想吃饭但不在食堂"或"在食堂但不想吃饭"的情况。

**缓解**:
- 位置推导逻辑：B 的 activity/sociality + 当前时间 → 推导目标位置
- 位置约束场：在特定位置时，某些行为维度受限（如在教室里 focus 不能太低）
- 保持 Schedule 的位置引导作用（作为势能面上的软吸引子）

### 风险4: 性能

连续计算可能比离散查表慢。

**缓解**:
- BehaviorField 只有4维，梯度计算是 O(4×5) = O(20)，远快于 _tryNormalTransition 的150行
- 朗之万更新是 O(4)，忽略不计
- 标签投影是 O(42×4) = O(168)，与现有权重计算相当
- 总体性能应该与现有方案持平或更快

### 风险5: Rust Native 兼容性

现有的 Rust SoA 引擎 (native/src/) 是为 EmotionVector 和 NeedsSystem 设计的。
BehaviorField 是纯 JS 模块，不影响 Rust 层。
但 NeedsSystem 的接口变化需要同步更新 native/src/needs/。

**缓解**:
- Phase 1-2 不改 NeedsSystem 的 tick() 接口
- Phase 3 的 NeedsSystem 改动需要同步更新 Rust 层
- 或者：BehaviorField 的梯度计算在 JS 层完成，NeedsSystem 的 tick 仍然接收离散状态名（向后兼容）

---

## 时间线

| Phase | 内容 | 预估时间 | 依赖 |
|-------|------|----------|------|
| 0 | BehaviorField + BehaviorLabeler 骨架 | 2-3天 | 无 |
| 1 | 梯度源改造（NeedsSystem, IntrinsicMotivation, Schedule） | 2天 | Phase 0 |
| 2 | Agent.tick() 集成 | 3-4天 | Phase 0, 1 |
| 3 | NeedsSystem 连续化 | 1-2天 | Phase 2 |
| 4 | 子系统清理 | 2天 | Phase 2, 3 |
| 5 | StateMachine 退役 | 1天 | Phase 4 |
| 6 | 增强 & 实验 | 2-3天 | Phase 5 |
| **总计** | | **13-17天** | |

---

## 每个 Phase 的验证标准

### Phase 0 验证
- [ ] BehaviorField 接收固定 signals，输出的 B 向量在预期范围内
- [ ] BehaviorLabeler 将 B 向量投影为合理的语义标签
- [ ] 朗之万动力学在无驱力时保持稳定（B 不漂移）

### Phase 1 验证
- [ ] NeedsSystem.getDriveGradient() 返回的向量方向正确
- [ ] 连续梯度与原有离散 targetStates 的语义一致

### Phase 2 验证
- [ ] 20 agents × 10 天模拟正常运行，无崩溃
- [ ] Agent 的行为轨迹在可视化中呈连续曲线（非跳变）
- [ ] 向后兼容：getNarrative() 输出仍然合理

### Phase 3 验证
- [ ] 需求恢复行为与连续行为向量匹配
- [ ] 50轮对话后 OCEAN 方差仍然 = 0（人格稳定性不退化）

### Phase 4 验证
- [ ] 所有现有测试通过
- [ ] StoryGenerator 输出质量不低于改造前

### Phase 5 验证
- [ ] StateMachine.js 可以安全删除
- [ ] demo/character-lab 正常运行

### Phase 6 验证
- [ ] 行为轨迹可视化在 demo 中可交互
- [ ] 不同人格的行为轨迹有统计显著差异

---

## 架构对比

### 改造前

```
Emotion (30维连续) ─┐
Needs (5维连续) ────┤
Personality (5维) ──┤──→ StateMachine ──→ 42个离散状态之一
Schedule (离散) ────┤     (加权随机选择)
Intrinsic (连续) ──┘     (_tryNormalTransition 150行)
```

### 改造后

```
Emotion ───→ emotionGradient ────┐
Needs ─────→ needsGradient ──────┤
Personality ─→ surfaceShape ─────┤──→ BehaviorField ──→ B ∈ [0,1]^4
Schedule ──→ scheduleGradient ──┤     (朗之万动力学)     ↓
Intrinsic ─→ intrinsicGradient ─┘     (连续轨迹)      Label投影器
Habit ─────→ habitGradient ──────┘                       ↓
                                                   语义标签（向后兼容）
```

### 信息流对比

| | 改造前 | 改造后 |
|---|---|---|
| 内部表示 | 30维情绪 + 5维需求 + ... → 压缩到1个离散标签 | 30维情绪 + 5维需求 + ... → 展开到4维连续向量 |
| 信息损失 | 高（42选1） | 低（连续空间） |
| 行为过渡 | 离散跳变 | 连续滑动 |
| 新增行为 | 需要添加新状态 + 转移规则 | 自动从势能面涌现 |
| 人格表达 | 通过权重微调间接表达 | 通过曲面形状直接表达 |
| 代码量 | _tryNormalTransition 150行 ad-hoc | BehaviorField ~200行数学 |
