# AGENTS.md — AI Agent 工作指南

> 本文件帮助 AI 编码助手理解 Andy Engine 的架构、约束和工作方式。
> 如果你正在读这个文件，说明你要在这个代码库上工作。请通读后再动手。

---

## 项目身份

Andy Engine 是一个**心理学驱动的多智能体社会模拟引擎**，不是一个 Web 应用、不是一个聊天机器人框架、不是一个普通的 Agent SDK。

每个角色由 6 个心理学子系统驱动：人格（OCEAN）、情绪（30维）、需求（Maslow）、认知评价（Scherer CPM）、记忆（ACT-R）、社交关系（Dunbar）。角色在共享世界中按时间步长自主演化，行为由连续行为空间中的朗之万动力学决定。

**不要用"聊天机器人"的心智模型来理解这个项目。**

---

## 架构地图

```
index.js                          → AndyEngine 类（公共 API 入口）
├── agent/Agent.js                → 主循环 tick()，协调所有子系统
│   ├── agent/BehaviorField.js    → 4D 连续行为场（朗之万动力学）★ 行为决策核心
│   ├── agent/BehaviorLabeler.js  → 语义标签投影器（50 个状态中心点）
│   ├── agent/StateMachine.js     → 状态元数据（只读，42 个状态定义）
│   ├── agent/EmotionVector.js    → 30 维情绪系统（10 步演化管线）
│   ├── agent/NeedsSystem.js      → Maslow 需求层级（5 个驱动 + 连续梯度）
│   ├── agent/PersonalMemory.js   → ACT-R 记忆系统（5 路径检索）
│   ├── agent/Personality.js      → MBTI → OCEAN → 行为参数映射
│   ├── agent/Appraisal.js        → 认知评价（8 维度）
│   ├── agent/EmotionRegulation.js → Gross 情绪调节（3 策略）
│   ├── agent/IntrinsicMotivation.js → 好奇心 + 自生目标
│   ├── agent/ProceduralMemory.js → 习惯形成 + 打破
│   └── agent/Schedule.js         → 日程系统（预设 + 高斯噪声）
├── core/Simulator.js             → 多 agent 调度器（5 步管线）
├── core/World.js                 → 世界状态（时间、环境、agent 集合）
├── core/EventDispatcher.js       → 事件系统（5 种来源 + 语义分类）
├── core/AndyBridge.js            → 外部 LLM 桥接层
├── social/SocialGraph.js         → 全局社交图谱（Dunbar 层级 + 三元闭合）
├── social/Relationship.js        → 对数增长关系模型
├── spatial/SpatialEngine.js      → 连续坐标空间
├── spatial/SpatialHash.js        → 空间哈希（O(1) 邻居查询）
├── store/                        → 持久化层（SQLite）
├── sdk/                          → 高层 SDK（Character/Andy/LLMAdapter）
├── config/defaults.js            → 所有可调参数
├── config/validate.js            → 配置验证器
├── native/                       → Rust N-API 加速（需要单独编译）
├── demo/character-lab/           → Web Demo
├── experiments/                  → 实验套件
└── tests/                        → vitest 测试
```

---

## Agent.tick() 数据流

这是最核心的函数。每个 tick（5 分钟模拟时间）执行：

```
1. _perceiveEvents()          → 认知评价 → 情绪反应 → 记忆存储
2. emotionRegulation.tryRegulate() → Gross 情绪调节
3. needs.tickWithBehavior()   → 需求衰减 + 连续行为向量恢复
4. intrinsicMotivation.tick() → 好奇心驱力 + 自生目标
5. _checkSchedule()           → 日程驱动位置变化
6. buildBehaviorSignals()     → 打包信号
7. behaviorField.tick()       → 朗之万动力学 → B ∈ [0,1]⁴ → 语义标签 ★
8. _applyNeedsToEmotion()     → 需求匮乏 → 负面情绪
9. _updateHealth()            → 健康系统
10. emotion.tick()            → 30 维情绪演化管线
11. emotionRegulation.tick()  → 调节资源恢复
12. memory.tick()             → 记忆衰减
13. _updateSocialEnergy()     → 社交能量（基于 B.sociality）
14. proceduralMemory          → 程序性记忆
15. _mindWander()             → 心智游移（基于 B.activity + B.focus）
16. _reflect()                → 定期反思
```

**关键理解**：步骤 7 的 `behaviorField.tick()` 是唯一的行为决策源。`stateMachine.currentState` 是从 `behaviorField.label` 派生的 getter。

---

## 关键约束（不要踩的坑）

### StateMachine 已退役

```js
// ❌ 不要这样写
this.stateMachine._doTransition('在食堂', now);  // setter 是空操作

// ✅ 要通过 BehaviorField
this.behaviorField.B = [...STATE_CENTERS['在食堂']];
this.behaviorField.velocity = [0, 0, 0, 0];
```

`StateMachine.js` 只保留：
- `STATES` 对象：42 个状态的元数据（被 BehaviorLabeler、PersonalMemory 引用）
- `StateMachine` 类：仅追踪 `history` 和 `stateEnteredAt`（由 Agent.tick() 维护）

**不要往 StateMachine 里加转移逻辑。**

### 行为场是 4 维连续空间

```
B[0] = activity       0=休息/睡觉  1=上课/工作/运动
B[1] = sociality      0=独处/发呆  1=聊天/社交
B[2] = focus          0=漫无目的   1=高度专注
B[3] = expressiveness  0=封闭退缩  1=外向表达
```

- 维度常量在 `BehaviorLabeler.js`：`DIM_ACTIVITY=0, DIM_SOCIALITY=1, DIM_FOCUS=2, DIM_EXPRESSIVENESS=3`
- 梯度方向：正梯度 = 势能增加方向（远离目标），`-∇U·dt` 才是运动方向
- 各向异性裁剪：不同维度有不同最大变化速率（focus 最快，activity 最慢）

### 梯度方向容易搞反

```js
// 势能 U = w * ||B - target||²
// 梯度 ∇U = 2w * (B - target)  ← 指向远离目标的方向
// 动力学 v += -∇U * dt          ← 沿势能下降方向运动（朝向目标）

// ✅ 正确：梯度是 (B - target)
grad[d] += weight * (this.B[d] - target[d]);

// ❌ 错误：梯度是 (target - B) 会把球推离目标
grad[d] += weight * (target[d] - this.B[d]);
```

### 需求系统有两套接口

```js
// 旧接口（离散查表，仍被部分代码使用）
needs.tick(hoursElapsed, currentState, currentRegion);

// 新接口（连续行为向量，Agent.tick() 使用）
needs.tickWithBehavior(hoursElapsed, behaviorField.B);
```

### 情绪是 30 维连续向量

不要把情绪当标量处理。`getValence()` 返回的是 21 维正负情绪的归一化均值，实际范围很小（典型 [-0.15, +0.15]）。

```js
// ❌ 不要这样判断"开心"
if (emotion.getValence() > 0.5) { ... }  // 几乎永远不会触发

// ✅ 用原始维度
if (emotion.current.joy > 0.3) { ... }

// ✅ 或用 getDominant()
const top = emotion.getDominant(1);
if (top[0].dimension === 'joy' && top[0].value > 0.2) { ... }
```

### 记忆系统是 ACT-R 模型

`PersonalMemory.retrieve()` 返回的是按激活度排序的记忆，不是按时间排序。最近的记忆不一定是第一个被检索到的——高重要性、高情绪唤醒、与当前上下文相关的记忆优先。

### 非负语义维度

这些维度只有强度（0→1），没有"负值"语义：
- `loneliness`：0=不孤独, 1=很孤独（不是 -1=很社交）
- `boredom`、`nervousness`、`guilt`、`shame`、`embarrassment` 同理

在 `_clamp()` 中它们的下界是 0，不是 -1。

---

## 测试

```bash
# 运行全部测试（224 个）
npm test

# 只跑行为场测试（60+ 个）
npx vitest run tests/behavior-field.test.js

# 监听模式
npm run test:watch
```

**测试规范：**
- 新功能必须有测试
- 行为场相关的测试要验证数值稳定性（B 不发散、速度有界）
- 用 mockLLM 函数，不要调用真实 API
- 测试中不要依赖 `Math.random()` 的确定性（行为场有噪声）
- 对比两个人格时，用 B 距离而非标签匹配（标签可能因噪声跳变）

**关键测试：**
- `tests/behavior-field.test.js` — 行为场全套测试
- `tests/integration/engine.test.js` — 引擎集成测试
- `tests/unit/emotion.test.js` — 情绪系统单元测试
- `tests/sdk.test.js` — SDK 测试

---

## config/defaults.js 参数速查

所有可调参数集中在这里。改参数前先看这个文件，不要在代码里硬编码。

| 参数 | 默认值 | 作用 |
|------|--------|------|
| `emotion.decayLambda` | 1.0 | 情绪衰减速率 |
| `emotion.maxDeltaPerTick` | 0.10 | 单步最大情绪变化 |
| `needs.decayRate.hunger` | 0.08 | 饥饿衰减（~12h 从 1→0）|
| `relationship.threshold.closeFriend` | 0.65 | 挚友阈值 |
| `memory.maxMemories` | 500 | 每 agent 最大记忆数 |
| `events.randomEventProbability` | 0.08 | 随机事件概率 |

BehaviorField 的参数在 `BehaviorField.js` 的 `DEFAULTS` 对象中：

| 参数 | 默认值 | 作用 |
|------|--------|------|
| `gamma` | 2.5 | 摩擦系数（高→行为惯性小）|
| `sigma` | 0.15 | 噪声幅度（高→行为随机）|
| `dt` | 0.1 | 时间步长 |
| `weights.needs` | 3.0 | 需求梯度权重 |
| `weights.emotion` | 2.0 | 情绪梯度权重 |
| `weights.schedule` | 1.8 | 日程梯度权重 |

---

## 心理学参考

引擎中的每个子系统都有学术理论支撑。修改时请参考对应的理论基础。

| 子系统 | 理论 | 作者/年份 |
|--------|------|----------|
| 30 维情绪 | 情绪空间模型 | Cowen & Keltner (2017) |
| 情绪衰减 | 三层情绪架构 | Gebhard (2005) ALMA |
| 消极偏见 | "Bad is stronger than good" | Baumeister et al. (2001) |
| 认知评价 | Component Process Model | Scherer (2001) |
| 情绪调节 | 过程模型 | Gross (1998, 2015) |
| 记忆检索 | ACT-R 激活度模型 | Anderson (2007) |
| 情绪一致性回忆 | Mood-congruent recall | Bower (1981) |
| 不自主记忆 | Proust Effect | Berntsen (2009) |
| 记忆再巩固 | Reconsolidation | Nader et al. (2000) |
| 需求层级 | Hierarchy of Needs | Maslow (1943) |
| 自发动机 | Self-Determination Theory | Deci & Ryan (1985, 2017) |
| 好奇心 | Learning Progress | Oudeyer & Kaplan (2007) |
| 社交图谱 | Social Brain Hypothesis | Dunbar (1992) |
| 三元闭合 | Triadic Closure | Granovetter (1973) |
| 人格模型 | Big Five / OCEAN | McCrae & Costa (1989) |
| 行为动力学 | Langevin dynamics | 参考物理学 |
| 势能面 | Potential field navigation | Khatib (1986) |

---

## 添加新功能的流程

1. **确定它属于哪个子系统** — 不要往 Agent.js 直接加代码，先想清楚它应该在哪个模块
2. **读 `config/defaults.js`** — 新参数必须集中管理，不要硬编码
3. **写测试** — 特别是数值稳定性的测试
4. **检查向后兼容** — `stateMachine.currentState` 被很多下游代码引用，不要破坏 getter
5. **跑全量测试** — `npm test` 确认 224 个测试全通过
6. **更新 AGENTS.md** — 如果你加了新的约束或模块，更新本文件

---

## Rust Native 模块

`native/` 目录包含 Rust N-API 加速模块：
- `native/src/emotion/` — SoA f32 情绪引擎（rayon 并行）
- `native/src/needs/` — 需求计算加速

**不要直接修改 Rust 代码**——需要单独编译环境（Cargo），开发机上可能没有。如果需要修改 Rust 层，标记为 TODO 并通知项目负责人。

启用：`ANDY_USE_NATIVE=1 node your_script.js`

---

## 文件大小参考

| 文件 | 行数 | 复杂度 |
|------|------|--------|
| Agent.js | ~1650 | 高（主循环，修改需谨慎）|
| BehaviorField.js | ~560 | 中（动力学，注意梯度方向）|
| BehaviorLabeler.js | ~350 | 低（数据为主）|
| EmotionVector.js | ~740 | 高（10 步演化管线）|
| PersonalMemory.js | ~1030 | 高（ACT-R 检索算法）|
| StateMachine.js | ~130 | 低（只读数据）|
| NeedsSystem.js | ~310 | 低（衰减 + 恢复）|
| config/defaults.js | ~430 | 低（纯数据）|
