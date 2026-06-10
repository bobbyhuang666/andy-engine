# Andy Engine Research Direction vNext

> **这不是产品需求，不是 Bobby roadmap，不是功能列表，也不是实现计划。**
> **这是 Andy Engine 接下来架构演化的理论假设。**

---

## 1. Context

Andy Engine v0.2.0 已完成：

- domain-agnostic architecture
- domain contract validation
- source-scan
- public API / package boundary
- benchmark / profiling baseline
- social contagion cache optimization

但这些仍然回答的是：

> 如何构建一个多智能体心理模拟引擎？

现在 Andy Engine 需要开始回答更上层的问题：

> 什么底层机制会让用户推断这里存在一个持续主体？

---

## 2. Research Reframing

Andy Engine 当前不再以以下系统作为阶段核心：

- Memory System
- Emotion System
- Agent Autonomy
- Multi-Agent Social Simulation

这些仍然重要，但不再是第一性目标。

**新的阶段目标是：**

> 让用户推断："这里存在一个持续主体"
> 而不是："这里有一个聊天模型"

---

## 3. Current Candidate Mechanisms

### H-B: Temporal Persistence

**核心问题：**

> 如何让时间留下痕迹？

**关注：**

- **Temporal Trace** — 时间流逝本身在角色身上留下可观察的痕迹
- **Temporal Drift** — 角色状态随时间自然漂移，不是被事件触发
- **Temporal Continuity** — 角色对时间流逝有内在感知
- **Future Reference** — 角色能引用"明天"、"下周"等未来时间点

**设计原则：**

> 时间本身是一等公民，而不是记忆的附属属性。

---

### H-D: Causal Evolution

**核心问题：**

> 角色是否会被经历改变？

**关注：**

- **Cause → Effect** — 经历产生可观察的状态变化
- **Influence Trace** — 影响可以被追溯和引用
- **Relationship Evolution** — 关系因经历而演化
- **Experience Accumulation** — 经历累积产生长期变化

**设计原则：**

> 记录因果链，而不是记录聊天记录。

---

### H-L: Perceptual Projection

**核心问题：**

> 用户为什么会推断这里有主体？

**关注：**

- **Subjective Signals** — 角色发出主观体验信号
- **Presence Signals** — 角色发出"在场"信号
- **Identity Signals** — 角色发出身份一致性信号
- **Relationship Signals** — 角色发出关系认知信号

**设计原则：**

> 优化用户感知，而不是优化内部复杂度。

---

## 4. Temporarily Deprioritized Directions

以下方向暂缓作为核心研究方向：

- 超复杂长期记忆系统
- 情绪模拟系统
- 主动消息系统
- 超复杂人格系统
- 多 Agent 社会模拟
- ECS / SharedArrayBuffer / 十万 agent 性能路线

**注意：** 不是删除，不是否定，只是暂时不作为核心研究主线。

**理由：** 尚未证明它们是 Alive 感的一阶机制。

---

## 5. Engine Implications

Andy Engine 未来可能需要从：

- Memory Framework
- AI Companion Framework
- Multi-Agent Simulation Runtime

逐步演化为：

> **Persistent Subject Runtime**

但这是研究假设，不是当前承诺。

---

## 6. Non-Goals

- 本文档不定义 Bobby 产品。
- 本文档不定义 UI。
- 本文档不定义 benchmark 分数。
- 本文档不要求立刻实现。
- 本文档不替代 docs/PERFORMANCE.md。
- 本文档不推翻 v0.2.0 domain architecture。

---

## 7. Open Questions

- Temporal Persistence 是否真的能提升 alive 感？
- Causal Evolution 是否比 memory recall 更重要？
- 用户是否只需要足够的 perceptual signals 就会完成主体投射？
- 多 agent simulation 对 alive 感是必要机制还是昂贵背景？
- emotion simulation 是原因，还是只是表现层？
- 主动性是否必要，还是可能造成打扰？
- Engine 应该记录 facts、states、causes，还是 subjective traces？

---

## 8. Next Research Step

下一步应该设计最小实验，用来验证：

- H-B: Temporal Persistence
- H-D: Causal Evolution
- H-L: Perceptual Projection

**在这些假设被验证前，不应继续大规模投入：**

- ECS
- SharedArrayBuffer
- complex memory graph
- proactive messaging
- large multi-agent scale
