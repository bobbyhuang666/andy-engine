# Memory → Behavior Gradient RFC — Phase 22

> **这不是实现计划，不是代码修改指令。**
> **这是记忆如何作为物理场梯度驱动行为的架构设计 RFC。**
> **注意：本 RFC 中的所有代码片段和数据结构设计均为 illustrative pseudo-code，仅用于说明概念边界，不作为实现授权或最终实现合同。**

---

## 1. Context

### 1.1 当前状态

Andy Engine v0.2.0 的 BehaviorField 有 6 个梯度源：

| 梯度源 | 权重 | 靶点来源 | 典型输出量级 |
|--------|------|----------|-------------|
| needs | 3.0 | NEED_TARGETS（5 维需求→4D 映射） | 0.3-0.8 |
| emotion | 2.0 | EMOTION_TARGETS（approach/avoid/agentic） | 0.1-0.4 |
| schedule | 1.8 | domain.stateCenters（日程活动→4D 映射） | 0.3-0.9 |
| intrinsic | 1.5 | 好奇心→activity/sociality/expressiveness 偏移 | 0.05-0.2 |
| habit | 0.5 | 上一 tick 的 B 位置（弹性力） | 0.01-0.05 |
| time | 0.4 | TIME_TARGETS（时间段→4D 映射） | 0.2-0.5 |

**缺失：** 记忆系统（ACT-R）目前不直接参与行为场梯度。`_assessStateConsequences()` 只在 Agent 层做离散状态的预期效价评估，不影响连续行为场 B。

### 1.2 问题

人类行为深受记忆驱动：
- "上次在图书馆被吵到" → 不想去图书馆（回避梯度）
- "和朋友在咖啡店聊得很开心" → 想再去（趋近梯度）
- "深夜看手机后总是更焦虑" → 减少深夜看手机倾向

当前引擎缺少这条 "记忆 → 行为" 的通路。

---

## 2. 设计原则

1. **记忆是间接引力，不是直接指令**：记忆只能通过势能梯度 ∇U_memory 间接影响 B，不能直接修改 B 或 label
2. **Domain-Agnostic**：不硬编码任何世界特定语义，映射规则由 Domain Config 声明
3. **饱和保护**：任何单条记忆的拉力有非线性上限，防止"被钉死"
4. **与现有梯度叠加**：记忆梯度是第 7 个梯度源，与 needs/emotion/schedule 等加权叠加
5. **性能可控**：记忆检索复用 ACT-R 现有缓存机制，不引入 O(N²) 复杂度

---

## 3. 问题 1：记忆的选择机制

### 3.1 哪些记忆有资格进入行为力场？

**答案：复合阈值过滤，不只靠 ACT-R 激活度。**

资格条件（全部满足）：

```
eligible(memory) :=
    P(recall) ≥ τ_recall           // ACT-R 检索概率阈值（≥ 0.3）
  ∧ importance ≥ τ_importance      // 重要性阈值（≥ 0.25）
  ∧ |valence(emotionSnapshot)| ≥ τ_valence  // 情绪效价强度阈值（≥ 0.1）
```

**理由：**
- 纯 ACT-R 激活度不够：一条高激活但情绪中性的记忆（如"今天吃了米饭"）不应产生行为拉力
- 纯效价不够：一条强情绪但极不活跃的童年记忆不应驱动当前行为
- 三重过滤确保只有"活跃的、重要的、有情绪色彩的"记忆才参与行为驱动

### 3.2 检索策略

复用 `PersonalMemory.retrieve()` 的 ACT-R 检索管线，但使用**无关键词的纯情绪-区域上下文**：

```javascript
const gradientContext = {
  keywords: [],                    // 不按内容检索
  emotion: agent.emotion.current,  // 情绪一致性偏差
  region: agent.position,          // 区域关联
};
const { memories } = agent.memory.retrieve(gradientContext, K);
// K = 5（最多 5 条记忆参与梯度计算）
```

**理由：** 行为梯度需要的是"情绪记忆"而非"语义记忆"。情绪一致性偏差（Bower 1981）自然地让当前情绪相关的记忆被优先检索。

---

## 4. 问题 2：拉力靶点与语义映射

### 4.1 核心挑战

记忆是**非结构化文本**（如"在图书馆被吵到了"），而 BehaviorField 需要的是 **4D 向量靶点** B* ∈ [0,1]⁴。

如何建立 "具体语义 → 4D 行为吸引子" 的映射？

### 4.2 两层映射架构

```
记忆文本 → [语义分类层] → 行为类别 → [4D 投影层] → B* ∈ [0,1]⁴
```

#### 层 1：语义分类（Domain Config 声明）

Domain Config 新增 `memoryBehaviorMap` 字段，声明"记忆语义类别 → 行为倾向"的映射：

```javascript
// Domain Config 示例（illustrative）
memoryBehaviorMap: {
  '社交互动': { attract: [0.30, 0.80, 0.25, 0.75], repel: null },
  '学习成长': { attract: [0.25, 0.08, 0.75, 0.08], repel: null },
  '身体不适': { attract: [0.08, 0.04, 0.02, 0.03], repel: null },
  '冲突摩擦': { attract: null, repel: [0.30, 0.80, 0.25, 0.75] },
  '美食享受': { attract: [0.35, 0.55, 0.08, 0.45], repel: null },
  '深夜时刻': { attract: [0.10, 0.08, 0.12, 0.08], repel: null },
}
```

- `attract`：正效价记忆的 4D 靶点（趋近）
- `repel`：负效价记忆的 4D 排斥点（回避）

#### 层 2：4D 投影（运行时计算）

对于每条 eligible 记忆：

```javascript
function memoryToTarget(memory, memoryBehaviorMap) {
  const category = memory.semanticCategory;  // 已有字段
  const valence = getValence(memory.emotionSnapshot);
  const mapping = memoryBehaviorMap[category];

  if (!mapping) return null;

  if (valence > 0 && mapping.attract) {
    return { type: 'attract', B_star: mapping.attract };
  } else if (valence < 0 && mapping.repel) {
    return { type: 'repel', B_star: mapping.repel };
  } else if (valence > 0 && !mapping.attract) {
    // 正效价但无 attract 映射 → 使用记忆发生的区域对应的 stateCenter
    return { type: 'attract', B_star: regionToCenter(memory) };
  }

  return null;
}
```

### 4.3 负效价记忆的排斥机制

负效价记忆不产生"去某个地方"的引力，而是产生"远离某个地方"的斥力：

```
U_repel = w · σ(||B - B*||² / λ)   // 高斯壁垒势能
∇U_repel = w · (2/λ) · (B - B*) · σ' · dt
```

其中 σ 是 sigmoid，λ 是宽度参数。这确保：
- 远离 B* 时斥力趋近于 0（不会无限远地推）
- 靠近 B* 时斥力急剧增大（"不想去那里"）

### 4.4 正效价记忆的吸引机制

正效价记忆产生标准的二次势能引力（与 needs/schedule 一致）：

```
U_attract = w · ||B - B*||²
∇U_attract = 2·w · (B - B*) · dt
```

---

## 5. 问题 3：衰退与遗忘动力学

### 5.1 记忆拉力的时间衰减

记忆拉力强度随时间衰退，衰减曲线复用 ACT-R 的激活度衰减：

```
strength(memory, t) = importance · P(recall | context) · decay(t)
```

其中 `decay(t)` 已由 ACT-R 基础激活度 B_i = ln(Σ t_j^(-d)) 隐式包含。

**不需要额外的衰减层**——ACT-R 模型本身已经编码了"近期记忆更强、高频访问的记忆更强"的特性。

### 5.2 Tick 级衰减

每 tick 计算梯度时，记忆拉力自然衰减（因为 ACT-R 激活度随时间下降）。

典型衰减曲线（d=0.5）：

| 距上次回忆 | 相对拉力强度 |
|-----------|-------------|
| 0 小时 | 1.0 |
| 1 小时 | 0.71 |
| 6 小时 | 0.41 |
| 24 小时 | 0.20 |
| 72 小时 | 0.12 |

**设计意图：** 一周前的"在图书馆被吵到"记忆仍有微弱拉力，但不足以压过当前的日程或需求。

---

## 6. 问题 4：饱和与排他保护

### 6.1 单条记忆的拉力上限

使用 tanh 饱和曲线，防止任何单条记忆产生无穷大拉力：

```
w_effective(memory) = w_max · tanh(α · importance · P(recall))
```

其中：
- `w_max = 0.8`：单条记忆的最大拉力权重（低于 needs 的 3.0）
- `α = 2.0`：饱和速度参数

**效果：**
- importance=0.5, P(recall)=0.5 → w_eff = 0.8 · tanh(0.5) = 0.38
- importance=0.9, P(recall)=0.9 → w_eff = 0.8 · tanh(1.62) = 0.77
- importance=1.0, P(recall)=1.0 → w_eff = 0.8 · tanh(2.0) = 0.76（已饱和）

### 6.2 记忆梯度总权重上限

所有记忆梯度的总权重有硬上限：

```
w_memory_total = min(w_memory_sum, W_MEMORY_CAP)
```

其中 `W_MEMORY_CAP = 1.5`（与 intrinsic 同级）。

**理由：** 即使 5 条强记忆同时激活，总权重也不超过 1.5，确保不会压过 needs（3.0）或 schedule（1.8）。

### 6.3 排他保护：需求匮乏时的记忆抑制

当基本需求匮乏时，记忆拉力被抑制：

```
needs_factor = min(1.0, min_needs / 0.3)
w_memory_effective = w_memory_total · needs_factor
```

**效果：**
- 所有需求 > 0.3 → needs_factor = 1.0（无抑制）
- hunger = 0.1 → needs_factor = 0.33（记忆拉力降至 1/3）
- hunger = 0.0 → needs_factor = 0.0（记忆拉力完全抑制）

**心理学依据：** Maslow (1943) — 低层需求未满足时，高层动机（包括记忆驱动的行为倾向）被抑制。

---

## 7. 问题 5：梯度融合方程

### 7.1 当前融合方程

```
∇U_total = Σ_k w_k · ∇U_k(B)
         = w_needs · ∇U_needs
         + w_emotion · ∇U_emotion
         + w_schedule · ∇U_schedule
         + w_intrinsic · ∇U_intrinsic
         + w_habit · ∇U_habit
         + w_time · ∇U_time
         + w_boundary · ∇U_boundary
```

### 7.2 新增记忆梯度

```
∇U_memory(B) = Σ_{m ∈ eligible} w_m · f_m(B)
```

其中：
- `eligible`：通过三重过滤的记忆集合（≤ 5 条）
- `w_m`：第 m 条记忆的有效权重（含饱和、衰减、需求抑制）
- `f_m(B)`：第 m 条记忆的梯度函数

**正效价记忆（attract）：**
```
f_m(B) = (B - B*_m)          // 标准二次势能梯度
```

**负效价记忆（repel）：**
```
f_m(B) = (B - B*_m) · sech²(||B - B*_m||² / λ) / λ
         // 高斯壁垒梯度：近处强斥力，远处趋零
```

### 7.3 完整融合方程

```
∇U_total = Σ_k w_k · ∇U_k(B)  +  w_memory · ∇U_memory(B)
```

其中 `w_memory` 含人格调制：

```
w_memory = w_base · weightModifier_memory
weightModifier_memory = 0.3 + openness × 0.6 + neuroticism × 0.4
```

- 高开放性 → 更受记忆影响（愿意回忆和反思）
- 高神经质 → 更受负面记忆影响（反刍倾向）

### 7.4 优先级层级

**不是简单加权叠加，而是有层级的抑制：**

```
effective_weight_k = base_weight_k × priority_factor_k

priority_factor_needs = 1.0                                    // 不受抑制
priority_factor_emotion = min(1.0, max_drive / 0.3)           // 高情绪时增强
priority_factor_schedule = needs_factor                        // 需求匮乏时降低
priority_factor_memory = needs_factor × emotion_factor         // 双重抑制
priority_factor_intrinsic = needs_factor × 0.5                 // 需求匮乏时大幅降低
```

**层级逻辑：**
1. **濒死需求**（hunger < 0.1）→ needs 权重翻倍，其他全部抑制
2. **强烈情绪**（avoidDrive > 0.5）→ emotion 增强，schedule 降低
3. **记忆影响** → 在需求和情绪都平静时最显著
4. **日程引导** → 被需求和情绪调制

---

## 8. 问题 6：Domain-Agnostic

### 8.1 映射规则归入 Domain Config

`memoryBehaviorMap` 是 Domain Config 的新字段，由各 world preset 声明：

```javascript
// presets/campus/index.js
memoryBehaviorMap: {
  '社交互动': { attract: [0.30, 0.80, 0.25, 0.75], repel: null },
  '学习成长': { attract: [0.25, 0.08, 0.75, 0.08], repel: null },
  '身体不适': { attract: [0.08, 0.04, 0.02, 0.03], repel: null },
  '冲突摩擦': { attract: null, repel: [0.30, 0.80, 0.25, 0.75] },
  '美食享受': { attract: [0.35, 0.55, 0.08, 0.45], repel: null },
  '深夜时刻': { attract: [0.10, 0.08, 0.12, 0.08], repel: null },
  '偏离常规': { attract: [0.40, 0.20, 0.12, 0.30], repel: null },
  '日常琐事': { attract: null, repel: null },  // 不产生行为拉力
}
```

```javascript
// presets/tavern/index.js
memoryBehaviorMap: {
  '社交互动': { attract: [0.25, 0.85, 0.30, 0.80], repel: null },
  '工作劳动': { attract: [0.70, 0.15, 0.75, 0.20], repel: null },
  '自然风光': { attract: [0.40, 0.60, 0.15, 0.50], repel: null },
  '身体不适': { attract: [0.10, 0.10, 0.10, 0.10], repel: null },
  '冲突摩擦': { attract: null, repel: [0.30, 0.80, 0.25, 0.80] },
}
```

### 8.2 语义分类复用现有字段

记忆的 `semanticCategory` 字段已在 Phase 17 由 `PersonalMemory._classifySemanticCategory()` 生成。该字段直接作为 `memoryBehaviorMap` 的查找键。

**不需要新增分类逻辑**——复用现有 domain.memoryTemplates.semanticCategories 体系。

### 8.3 Fallback 策略

当 `memoryBehaviorMap` 中没有对应分类时：

```javascript
if (!mapping) {
  // 使用 fallback：不产生行为拉力
  return null;
}
```

**理由：** 宁可不产生拉力，也不猜测错误的映射。

---

## 9. Future Implementation Pipeline Candidate

> [!NOTE]
> **以下为实现管线草案，属于 Future Implementation Pipeline Candidate (phase number TBD, not authorized by this RFC)。**
> **此处所有代码和字段结构定义仅作为 illustrative pseudo-code / candidate shape, 不作为最终的 implementation contract。**

```
Agent.tick()
  ├── ... 现有管线 ...
  ├── buildBehaviorSignals(env)
  │     └── signals.memory = this._buildMemoryGradientSignals()
  │           ├── retrieve(gradientContext, 5)  // ACT-R 检索
  │           ├── filter(eligible)              // 三重过滤
  │           └── map(memoryToTarget)           // 语义→4D 映射
  └── behaviorField.tick(signals)
        └── _computeGradient(signals)
              ├── ... 现有 6 个梯度源 ...
              └── _addMemoryGradient(grad, signals.memory, w.memory)
```

### 9.1 signals.memory 格式

```javascript
signals.memory = {
  targets: [
    { B_star: [0.30, 0.80, 0.25, 0.75], weight: 0.6, type: 'attract' },
    { B_star: [0.35, 0.55, 0.08, 0.45], weight: 0.3, type: 'attract' },
    { B_star: [0.30, 0.80, 0.25, 0.75], weight: 0.4, type: 'repel' },
  ],
  needsFactor: 0.85,  // 需求抑制因子
};
```

### 9.2 BehaviorField 新增方法

```javascript
_addMemoryGradient(grad, memory, weight) {
  if (!memory || !memory.targets || memory.targets.length === 0) return;

  const effectiveWeight = weight * this._weightModifiers.memory * memory.needsFactor;

  for (const target of memory.targets) {
    const w_m = Math.min(target.weight, 0.8); // 单条上限
    if (target.type === 'attract') {
      for (let d = 0; d < DIMS; d++) {
        grad[d] += effectiveWeight * w_m * (this.B[d] - target.B_star[d]);
      }
    } else if (target.type === 'repel') {
      // 高斯壁垒梯度
      let distSq = 0;
      for (let d = 0; d < DIMS; d++) {
        distSq += (this.B[d] - target.B_star[d]) ** 2;
      }
      const lambda = 0.1;
      const sech2 = 1 / Math.cosh(distSq / lambda) ** 2;
      for (let d = 0; d < DIMS; d++) {
        grad[d] += effectiveWeight * w_m * (this.B[d] - target.B_star[d]) * sech2 / lambda;
      }
    }
  }
}
```

---

## 10. 非目标

本 RFC **不**包含：
- Agent.tick() 管线修改
- BehaviorField 代码修改
- Domain Config 字段修改
- 测试用例修改
- 性能优化（复用现有 ACT-R 缓存）

---

## 11. 开放问题

1. **记忆拉力的方向噪声：** 是否需要在 B* 靶点上添加少量高斯噪声，防止多条相似记忆产生过度集中的拉力？
2. **排斥势能的宽度参数 λ：** λ=0.1 是经验值，是否需要根据 B 空间尺度自适应？
3. **记忆→行为的延迟：** 当前设计是"回忆即影响"，是否需要引入"记忆需要多次回忆才产生行为拉力"的阈值？
4. **跨域记忆：** 如果角色从 campus 迁移到 tavern，旧域的记忆是否仍然产生拉力？如何处理？
5. **记忆冲突：** 如果"想去咖啡店"和"不想去咖啡店"的记忆同时存在，梯度如何抵消？

---

## 12. Future Implementation Candidate

Future Implementation Candidate, phase number TBD.
