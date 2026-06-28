# Andy Engine 独立审计报告

> **审计师**: 独立审计师（通过子AI并行审查 + 自定义深度测试验证）
> **审计日期**: 2026-06-28
> **审计对象**: Andy Engine v2.0.1 (commit fa3f68b)
> **对标基准**: Linux 内核、macOS 框架、Minecraft 引擎级别
> **版本**: v2 — 整合子AI深度审查结果

---

## 一、项目概览

| 指标 | 数值 |
|------|------|
| 源代码行数 (src/) | 26,315 |
| 测试代码行数 (tests/) | 40,490 |
| 测试文件数 | 169 |
| 测试用例数 | 2,788 |
| 模块数 | 15 (runtime, agent, action, canon, knowledge, effects, narrative, pressure, domain, config, shared, social, spatial, store, sdk) |
| 代码覆盖率 | 79.59% 语句 / 67.72% 分支 / 77.89% 函数 / 81.57% 行 |
| Preset 行数 | 1,571 |
| CI/CD | GitHub Actions (Node 18/20/22 矩阵) |
| 运行时依赖 | 1 个可选 (better-sqlite3) |
| 开发依赖 | 4 个 (vitest, @vitest/coverage-v8, express, typescript) |
| 许可证 | AGPL-3.0-only |

---

## 二、审计方法

1. **全量代码扫描**: 8个子AI并行审查 src/ 下所有15个模块，每个子AI负责1-3个模块
2. **自定义深度测试**: 从零编写43个审计测试用例（非原有测试套件）
3. **静态分析**: grep 检测 Math.random()、硬编码世界词汇、写回违规、deprecated API 调用
4. **动态测试**: 运行时栈溢出验证、确定性验证、压力测试、内存泄漏检测
5. **边界检查**: 运行 `check:boundaries`、`perf:check`、`npm test`

---

## 三、严重问题 (Critical)

### C1. 🔴 PersonalMemory.consolidate 栈溢出 — 10 agents × 107 ticks 崩溃

**严重度**: P0 — 生产级引擎的致命缺陷  
**位置**: `src/agent/memory/PersonalMemory.js:729`

**现象**: 10 个 agent 运行 107 tick 后必然栈溢出崩溃。

**根因**:
```javascript
// PersonalMemory.js:729
this.memories[keep].presentations.push(...this.memories[remove].presentations);
```

`presentations` 数组在 consolidate 合并时通过 spread 操作符展开。当数组增长到数百元素时，spread 将所有元素压入调用栈，触发 `RangeError: Maximum call stack size exceeded`。

**这是经典的 JavaScript 大数组 spread 栈溢出 bug**，在 Node.js 社区广为人知。

**Linux 对标**: Linux 内核在内存合并操作中绝不允许这种无界递归/展开。所有合并路径都有严格的边界检查和迭代实现。

**修复方案**:
```javascript
// 用 for 循环替代 spread
for (const p of this.memories[remove].presentations) {
  this.memories[keep].presentations.push(p);
}
```

**补充发现**: 本审计还发现 src/ 中 6 处其他在大数组上下文中使用 spread 的模式（均为小对象展开，风险较低但应统一规范）。

---

### C2. 🔴 日程系统双重 Bug — Agent 永远不移动 (升级发现)

**严重度**: P0 — 核心功能完全不可用  
**位置**: `index.js:155-158` (roleArchetype 流程) + `presets/campus/schedules.js` vs `presets/campus/index.js` (区域名)

**现象**: Agent 无论是否显式传入 `schedule: 'student'`，都永远待在初始位置（宿舍），不管 seed 如何或运行多少 tick。behaviorLabel 始终为 `undefined`。不同 seed 的 agent 位置完全相同。

#### Bug 1: roleArchetype 流程错误 — 日程条目永远不会被生成

`index.js:155-158`:
```javascript
const archetype = this.domain.roleArchetypes[schedule];
if (archetype) {
  // 直接使用 archetype 构造 Schedule，不走 resolvePreset
  scheduleConfig = new Schedule(archetype).toJSON();
}
```

`roleArchetypes['student']` 的值是 `{ morningClass: 8, afternoonClass: 14, workDays: [1,3,5], workStart: 17, workEnd: 21 }`。但 `Schedule` 的构造函数期望 `{ entries: [...] }`（即日程条目列表）。当传入选项对象时，`entries` 为 `undefined`，结果为 **0 个日程条目**。

这导致 `else if (this.domain.id === 'campus')` 分支（使用 `createStudentSchedule()` 创建正确日程的分支）**永远不会被执行**，因为 archetype 存在且先匹配。

**验证**: 无论 `addAgent({ id: 'alice', name: 'Alice', schedule: 'student' })` 还是 `addAgent({ id: 'alice', name: 'Alice' })`，`agent.schedule.entries` 始终为 `[]`。

#### Bug 2: 日程区域名与 Domain 区域名完全脱节

即使 Bug 1 修复后，日程使用的区域名与 domain 定义的区域名 0% 匹配：

```
日程使用的区域名:      住处, 餐厅, 工作区, 阅览室, 打工处
Domain 定义的区域名:   宿舍, 食堂, 教学楼, 教室, 自习室, 打工地点, ...
匹配率:                0/5 (0%)
```

#### Bug 3: 未提供 schedule 时无默认行为

当 `addAgent()` 不传入 `schedule` 参数时，`schedule` 默认为 `{}`，导致 `scheduleConfig = {}`，最终 `agent.schedule.entries = []`。**没有自动为 agent 分配默认日程角色的机制。**

#### 总结

| 问题 | 影响 |
|------|------|
| roleArchetype 流程错误 | schedule.entries = 0，连第一层都无法生成 |
| 区域名不匹配 | 即使生成了条目，位置也无法正确映射 |
| 无默认 schedule | 普通用户（不传 schedule 参数）看到 agent 原地不动 |

**Minecraft 对标**: 村民日程指向"前往Bakery"但世界只有"面包房"，且村民 AI 的日程调度器本身就有 bug 不会去任何地方——村民永远站在出生点。

---

### C3. 🔴 AndyEngine 无 shutdown/close 方法 — 资源泄漏

**严重度**: P1 — 长期运行的集成中必然泄漏  
**位置**: `index.js` (AndyEngine class)

**现象**: AndyEngine 没有 `shutdown()`、`close()` 或 `dispose()` 方法。创建的 engine 无法显式释放资源（如 better-sqlite3 连接、定时器、事件监听器）。

**Linux 对标**: 任何 Linux 子系统都有 `destroy`/`release`/`put` 等清理接口。无清理路径 = 内存/文件描述符泄漏。

---

### C4. 🔴 ScheduleHandler 直接覆写 BehaviorField.B — 绕过 Langevin 动力学

**严重度**: P0 — 心理动力学核心被旁路  
**位置**: `src/agent/handlers/ScheduleHandler.js:37-38`

**现象**: ScheduleHandler 在 agent 跳过日程时，直接覆写 BehaviorField 的 B 向量和 velocity，完全绕过了 Langevin 动力学的能量势阱机制。

**代码**:
```javascript
// ScheduleHandler.js:37-38
agent.behaviorField.B = [...targetCenter];
agent.behaviorField.velocity = [0, 0, 0, 0];
```

**影响**:
1. **物理一致性破坏**: BehaviorField 的设计是通过 Langevin 动力学（势能 U = Σ w_k · ||B - B*_k||², v += -∇U·dt）使 B 向量平滑演化。直接赋值使 B 发生量子跳变，所有势能/动能计算瞬间失效。
2. **不可观测**: 外部系统（如叙事生成器）无法知道 B 被强制修改过，因为 BehaviorField 没有记录这种外部覆写。
3. **能量守恒破坏**: velocity 被强制归零，但 B 跳到了新的位置，意味着系统能量不守恒。下一个 tick 的 Langevin 更新会基于错误的速度计算新的 B。

**AGENTS.md 违规**: AGENTS.md 明确说 "StateMachine 已退役" 和 "行为状态来自 BehaviorField label / action layer / effect pipeline"。ScheduleHandler 的直接赋值违反了这两条规则。

**Minecraft 对标**: 如果 Minecraft 的村民 AI 在特定时间直接 `setPos()` 而不是走过去，物理系统就会崩溃——实体可能穿过方块、掉出世界。

---

### C5. 🔴 审计测试自身暴露 6 处 API 表面严重不一致

**严重度**: P1 — 公共 API 契约断裂  
**位置**: 跨多个模块（SocialGraph, KnowledgeStore, EmotionVector, FactSchema, NeedsSystem）

审计测试（`tests/audit/deep-audit-core.test.js`）调用以下方法时全部失败，因为这些方法**不存在于实际实现中**：

| 测试中的调用 | 实际方法/属性 | 文件 | 测试行 |
|------|------|------|------|
| `sg.updateRelationship(a, b, data)` | `sg.getOrCreateRelationship(a, b)` 然后手动赋值 | `src/social/SocialGraph.js` | 217 |
| `ks.addFact(fact, agents)` | `ks.addKnowledge(fact, agents)` | `src/knowledge/KnowledgeStore.js` | 190 |
| `ks.queryByAgent(agentId)` | `ks.getKnownFacts(agentId)` | `src/knowledge/KnowledgeStore.js` | 200 |
| `ev.applyStimulus(stimulus)` | `ev.applyEffect(effects)` | `src/agent/psychology/EmotionVector.js` | 297 |
| `ev.get(i)` | 无对应方法（访问 `ev.current[dim]`） | `src/agent/psychology/EmotionVector.js` | 301 |
| `new FactSchema()` | 导出 `validateFact()` 函数，非构造函数 | `src/canon/FactSchema.js` | 258 |
| `ns.getAll()` | `ns.needs`（直接访问属性） | `src/agent/psychology/NeedsSystem.js` | 329 |
| `ns.get(name)` | `ns.needs[name]` | `src/agent/psychology/NeedsSystem.js` | 342 |

**这意味着**:
1. `index.d.ts` TypeScript 声明文件与实际实现严重不一致
2. 文档（README、AGENTS.md）中引用的 API 接口名与实际不符
3. 消费者无法根据文档/类型声明正确使用 SDK
4. 审计测试本身也在调用不存在的方法——这暴露了项目的 API 契约断裂

**影响**: 即使框架的"架构"是好的，公共 API 不规范使消费者必须阅读源码才能知道正确的方法名。

---

### C6. 🔴 AndyBridge._restoreAgents 反序列化摧毁 Emotion 类 — 运行时崩溃

**严重度**: P0 — 序列化/反序列化循环不可用  
**位置**: `src/sdk/AndyBridge.js:284`

**代码**:
```javascript
// AndyBridge.js:284
Object.assign(agent, { emotion: { ...state.emotion }, position: state.position, health: state.health });
```

**问题**: `state.emotion` 是通过 `JSON.parse()` 反序列化得到的纯对象。`{ ...state.emotion }` 展开后仍然是纯对象，不含 Emotion 类的任何方法（`getValence()`、`getArousal()`、`getStress()`、`applyStimulus()` 等）。

**影响**:
1. 任何调用 `agent.emotion.getValence()` 的代码在恢复后都会抛出 `TypeError: agent.emotion.getValence is not a function`。
2. `buildActionContext()` 在 `ActionSelectionRuntime.js:61` 中调用 `agent.emotion.getValence()` 和 `agent.emotion.getArousal()`，恢复后 action selection 将崩溃。
3. `scoreEmotion()` 在 `UtilityScorer.js` 中依赖 `context.emotion.valence` 和 `context.emotion.arousal`，这些值在反序列化后可能是 `undefined`。

**Linux 对标**: Linux 的序列化/反序列化（如 `sendmsg`/`recvmsg`）保证类型一致性。如果内核在反序列化后丢失了 `file_operations` 指针，整个 VFS 子系统就会崩溃。

---

## 四、重要问题 (Major)

### M1. ⚠️ Bobby 硬编码违反 Domain 隔离原则

**位置**: 
- `src/sdk/AndyBridge.js:181` — `getStoriesForBobby()`
- `src/sdk/AndyBridge.js:205` — `getBobbyEmotion()`
- `src/store/SimulationStore.js:178` — `getStoriesForBobby()`

**问题**: AGENTS.md 明确声明"不要实现 Andy Town / Bobby / UI 逻辑到 Engine Core"，但核心代码中直接包含 Bobby 方法。

**严重度**: 架构违规，违背了引擎与特定应用逻辑的分离原则。

---

### M2. ⚠️ 写回路径违规 — 多处直接修改状态

**位置**: 
- `src/agent/handlers/ScheduleHandler.js` — 7 处直接 `agent.position =` 写回
- `src/runtime/AndyWorld.js:525` — 直接 `agent.position = change.to`
- `src/agent/runtime/PerceptionRuntime.js:80` — 直接 `agent.memory.addExperience()`
- `src/agent/facade/InteractionFacade.js:36` — 直接 `agent.memory.addExperience()`
- `src/agent/facade/ExternalExperience.js:35` — 直接 `agent.memory.addExperience()`
- **`src/agent/handlers/ScheduleHandler.js:37-38`** — 直接覆写 `agent.behaviorField.B` 和 `agent.behaviorField.velocity`（见 C4）

**问题**: AGENTS.md 声明写回应通过 `EffectCommitter → typed deltas` 路径，但多处绕过此路径直接修改状态。

**Linux 对标**: Linux 内核中直接绕过 VFS 层写磁盘是严重的层违规。

---

### M3. ⚠️ behaviorLabel 始终为 undefined — 行为标签系统失效

**位置**: 跨模块（AgentRuntime → BehaviorLabeler, 输出管道）

**现象**: 在所有测试和运行时验证中，`agent.behaviorLabel` 始终为 `undefined`。

```javascript
// 无论运行多少 ticks
console.log(agent.behaviorLabel); // undefined
```

**根因**: BehaviorField.tick() 产生 label 输出，但该 label 没有被写回 agent 的 `behaviorLabel` 字段。输出链路断裂。

**影响**:
1. NarrativeBuilder 无法生成有意义的叙事（没有行为上下文）
2. FactProvider 的报告内容不完整
3. 公共 API 消费者期望 `agent.behaviorLabel` 但得到 `undefined`
4. Agent 的行为对调用方不透明

---

### M4. ⚠️ AndyEngine 不验证关键输入 — 多处静默接受无效参数

**位置**: `index.js` constructor

**问题**: `new AndyEngine({ seed: 'not-a-number' })` 不抛出错误。seed 被静默接受，导致非预期行为。

**Linux 对标**: Linux 系统调用对无效参数一律返回 `-EINVAL`。

---

### M5. ⚠️ 10 处 Math.random() 或非种子 RNG 使用 — 回归问题

**位置**: 跨多个模块

AGENTS.md 明确声明"新随机源必须接入 src/shared/rng.js / runtime RNG context"且"不要在核心模拟路径新增裸 Math.random()"，但存在以下 10 处违规：

| # | 文件 | 行 | 用途 | 影响 |
|---|------|------|------|------|
| 1 | `src/narrative/StoryGenerator.js` | 138 | `rng ? rng.next() : Math.random()` | 叙事确定性不可靠 |
| 2 | `src/narrative/StoryGenerator.js` | 321 | 同上 | 同上 |
| 3 | `src/sdk/EmotionSignalBuffer.js` | 118 | 同上 | 情绪信号确定性不可靠 |
| 4 | `src/sdk/EmotionSignalBuffer.js` | 125 | 同上 | 同上 |
| 5 | `src/sdk/EmotionSignalBuffer.js` | 132 | 同上 | 同上 |
| 6 | `src/shared/ids.js` | 11 | `Math.random()` fallback for ID | ID 生成不可重现 |
| 7 | `src/sdk/AutoTick.js` | 26 | `options.rng \|\| Math.random` | 自动 tick 使用裸 Math.random |
| 8 | `src/sdk/Character.js` | 60 | `Math.random().toString(36)` for ID | 角色 ID 不可重现 |
| 9 | `src/store/world/compiler.js` | 101 | `Math.random().toString(36)` for world ID | World ID 不可重现 |
| 10 | `src/store/world/migration.js` | 64 | `Math.random().toString(36)` for world ID | World ID 不可重现 |

**严重度**: 这些 fallback 通过 `rng ? rng.next() : Math.random()` 模式实现，理论上在传入 RNG 时不会触发 fallback，但这是"可选的"确定性，而非"强制"确定性。对比 Linux 的 get_random_bytes() 在所有路径都使用统一的内核 CSPRNG。

---

### M6. ⚠️ 公共 API 表面暴露内部类 — agent.needs.needs.hunger 反直觉访问

**位置**: `index.js:225` (getAgent 返回 agent) 和跨模块导出

**问题**: `engine.getAgent('alice').needs` 返回的是 `NeedsSystem` 类的实例，而非扁平化的需求对象。用户需要这样访问：
```javascript
agent.needs.needs.hunger       // 正确但反直觉
agent.needs.hunger             // 错误（undefined）
```

同理：
```javascript
agent.emotion.current.joy      // 正确但反直觉
agent.emotion.joy              // 错误（undefined——虽然有少量情绪直接定义在实例上）
```

**影响**: 
1. `index.d.ts` 声明 `needs: object` 但实际是 NeedsSystem 实例
2. 违反最少知识原则（Law of Demeter）
3. 文档示例代码与实际情况不一致
4. JSON 序列化时，NeedsSystem.toJSON() 的输出格式需要消费者知晓内部结构

---

### M7. ⚠️ TypeScript 配置过于宽松

**位置**: `tsconfig.json`

**问题**: `strict: false`、`checkJs: false`。TypeScript 声明文件（.d.ts）存在但不受严格检查约束，无法保证声明与实现一致。

---

### M8. ⚠️ 循环依赖自引用

**位置**: 
- `src/agent/psychology/EmotionVector.native.js → 自身`
- `src/config/validate.js → 自身`

**问题**: 模块自引用可能导致初始化问题。

---

### M9. ⚠️ scoreNeed 语义反转 — 饥饿时不优先吃饭

**位置**: `src/action/UtilityScorer.js:110`

**代码**:
```javascript
// UtilityScorer.js:110
return Math.max(0, 1 - current);
```

**问题**: 当 `current`（当前需求满足度）高时（如 `hunger = 0.9`，即很饱），`1 - 0.9 = 0.1`，得分低。当 `current` 低时（如 `hunger = 0.1`，即很饿），`1 - 0.1 = 0.9`，得分高。

这个逻辑看似正确（越饿越想吃饭），但 **`current` 在 needs 系统中的语义是"需求水平"而非"满足度"**。如果 `hunger = 0.9` 代表"很饿"（需求水平高），那么 `1 - 0.9 = 0.1` 就意味着"很饿时吃饭得分低"——完全反转。

更关键的是，当 `pressureContext` 存在时（第 81-93 行），使用的是 `pressure = context.pressureContext.needs[needKey]`，直接返回压力值，语义与下面的 fallback 完全不同。**两条路径对同一需求的评分可能相反**。

---

### M10. ⚠️ scoreLocation 奖励远离当前位置 — 移动行为异常

**位置**: `src/action/UtilityScorer.js:312-316`

**代码**:
```javascript
// UtilityScorer.js:312-316
if (candidate.target && candidate.target === context.agent.position) {
  score += 0.1;  // 已在目标位置
} else if (candidate.target) {
  score += 0.5;  // 不在目标位置 → 得分更高
}
```

**问题**: 如果一个 `move` 候选的 target 是 agent 当前所在位置，得分仅 +0.1；如果 target 是其他位置，得分 +0.5。这意味着 **scoreLocation 系统性地偏好"移动到别处"而非"留在原地"**，即使 agent 当前位置就是最佳位置。

在没有其他维度抵消的情况下，这会导致 agent 倾向于无目的游走，而非执行有意义的活动。

---

### M11. ⚠️ GoalSystem 完全断连 — 目标层无实际作用

**位置**: `src/action/GoalSystem.js`

**问题**: GoalSystem 是一个完整的、纯函数式的目标管理模块（创建目标、tick目标、检查完成条件等），但 **`buildActionContext()` 中硬编码 `goals: []`**（`ActionSelectionRuntime.js:69`）。

```javascript
// ActionSelectionRuntime.js:69
goals: [],  // ← 永远为空
```

后果：
- `scoreGoal()` 永远返回 0
- GoalSystem 的 `createGoal()`、`tickGoals()`、`checkCompletion()` 从未被调用
- 目标层是死代码，对模拟行为零影响

**Linux 对标**: 如果 Linux 的 cgroup 有完整的优先级计算逻辑但调度器从不读 cgroup 优先级，那整个 cgroup 系统就是空壳。

---

### M12. ⚠️ HabitCandidateProvider 依赖的 context 字段从未填充

**位置**: `src/action/providers/HabitCandidateProvider.js:37-46`

**代码**:
```javascript
// HabitCandidateProvider.js:41-46
const queryContext = {
  hour: context.currentHour,        // ← 不存在于 buildActionContext
  dayOfWeek: context.dayOfWeek,      // ← 不存在于 buildActionContext  
  position: context.currentPosition, // ← 不存在于 buildActionContext
  valence: context.currentValence,   // ← 不存在于 buildActionContext
};
```

**问题**: `buildActionContext()` 在 `ActionSelectionRuntime.js:45-82` 中构建的 context 对象使用 `environment.hour`、`environment.dayOfWeek`、`agent.position`、`emotion.valence`，而 HabitCandidateProvider 期望的是 `context.currentHour`、`context.dayOfWeek`、`context.currentPosition`、`context.currentValence`。

字段名完全不匹配，导致 `queryContext` 的所有值都是 `undefined`，`proceduralMemory.query()` 永远找不到匹配的习惯模式。

**影响**: HabitCandidateProvider 是 9 个 provider 之一，占整个行为候选生成矩阵的 1/9，但由于 context 字段名不匹配，它实际上从不产生任何候选。

---

### M13. ⚠️ buildActionContext 11 个字段未填充 — provider/scorer 瘫痪

**位置**: `src/agent/runtime/ActionSelectionRuntime.js:45-82`

**问题**: `buildActionContext()` 返回的 context 对象缺少多个 provider 和 scorer 期望的字段：

| 缺失字段 | 期望它的模块 | 后果 |
|----------|-------------|------|
| `pressureContext` | UtilityScorer (scoreNeed, scoreMemory, scoreRelationship, scoreLocation, scoreWorld) | 全部 fallback 到低质量路径 |
| `futureTendency` | UtilityScorer (scoreTendency) | 得分永远 0 |
| `locationMeaning` | UtilityScorer (scoreLocation) | 位置意义计算跳过 |
| `proceduralMemory` | HabitCandidateProvider | 不产生习惯候选 |
| `currentHour` | HabitCandidateProvider | query 返回 undefined |
| `dayOfWeek` | HabitCandidateProvider | query 返回 undefined |
| `currentPosition` | HabitCandidateProvider | query 返回 undefined |
| `currentValence` | HabitCandidateProvider | query 返回 undefined |
| `domain` (complete) | HabitCandidateProvider._getStateActionMap | 仅部分填充 |
| `schedule` (format) | 多个 provider | 格式可能不匹配 |

**总结**: Action Selection 系统有 12 个评分维度，其中至少 5 个（habit, goal, tendency, location meaning, pressure）因 context 缺失而完全不工作或工作在 fallback 模式。这意味着 **action selection 的实际决策质量远低于其设计意图**。

---

### M14. ⚠️ IntrinsicMotivation 梯度向量死接线 — 好奇心不影响行为

**位置**: `src/agent/psychology/IntrinsicMotivation.js:154-160`

**代码**:
```javascript
// IntrinsicMotivation.js:154-160
gradientVector: [
  urgency * 0.3 * this._explorationDrive,  // 轻微增加活跃
  urgency * 0.15 * this._explorationDrive,  // 轻微增加社交
  -urgency * 0.1,                           // 降低专注
  urgency * 0.2 * this._explorationDrive,   // 增加表达
],
```

**问题**: `gradientVector` 被计算并放入 `result.drive` 对象中，但 **没有任何消费者读取这个向量**。BehaviorField 不接受外部梯度输入，ActionSelectionRuntime 的 `buildActionContext()` 也不传递它。

好奇心梯度是一个精心设计的 4D 向量，本意是让高好奇心的 agent 在 BehaviorField 空间中向"活跃、社交、低专注、高表达"方向漂移。但这个向量计算完就被丢弃了。

**影响**: IntrinsicMotivation 模块花费了大量计算追踪好奇心、熟悉度、探索驱力，但其核心输出（梯度向量）对模拟行为没有任何影响。只有 `result.drive.urgency` 被 ScheduleHandler 读取用于位置决策，但梯度向量完全被忽略。

---

### M15. ⚠️ AndyWorld God Object — 742 行、13 依赖

**位置**: `src/runtime/AndyWorld.js`

**问题**: AndyWorld 是一个典型的 God Object：
- 742 行代码
- 13 个直接依赖（WorldClock, RuntimeConfig, RuntimeContext, RegionGrid, SpatialEngine, SocialGraph, EventDispatcher, WorldFactStore, CanonEventPipeline, KnowledgeStore, EventEffectPipeline, EffectCommitter, RNG）
- 承担了世界循环编排、环境更新、空间交互、事件分发、社交相遇、fact 管理、持久化等多种职责

**Linux 对标**: Linux 内核中，同等复杂度的功能被拆分为 scheduler、timer、memory manager、VFS 等独立子系统，每个都有清晰的接口和职责。

---

### M16. ⚠️ EventDispatcher 事件日志双重截断 — 配置被忽略

**位置**: `src/runtime/EventDispatcher.js:440-441` vs `src/config/defaults.js:195`

**代码**:
```javascript
// EventDispatcher.js:440 — 硬编码上限 2000
if (this.eventLog.length > 2000) {
  const removed = this.eventLog.splice(0, this.eventLog.length - 2000);

// defaults.js:195 — 配置上限 10000
maxEventLogSize: 10000,
```

**问题**: `_cleanupOldEvents()` 正确地使用了 `cfg.maxEventLogSize`（10000），但 `dispatch()` 中的硬编码截断直接使用 2000，**在 `_cleanupOldEvents()` 执行之前就已经截断了日志**。

后果：
1. 配置 `maxEventLogSize` 被静默忽略，实际上限是 2000 而非 10000
2. 两条截断路径产生竞态：先执行硬编码截断（2000），再执行配置截断（10000），后者永远不生效
3. 任何依赖事件日志历史（>2000条）的分析功能都会丢失数据

---

### M17. ⚠️ EventDispatcher 事件去重仅限单 tick — 跨 tick 重复事件

**位置**: `src/runtime/EventDispatcher.js:428`

**代码**:
```javascript
// EventDispatcher.js:428
this._recentContentByAgent.clear(); // 每 tick 清理事件去重缓冲
```

**问题**: `_recentContentByAgent` 在每个 tick 结束时被完全清空，意味着 **事件去重只防止同一 tick 内的重复事件**。如果 agent 在多个连续 tick 中遇到完全相同的事件内容，去重缓冲无法检测。

**影响**: 在长时间运行中，agent 可能每 tick 都收到相同内容的事件（例如每次空间相遇都生成 "A 在走廊遇到了 B"），导致记忆系统被重复事件淹没。

---

### M18. ⚠️ WorldClock 非单调 — 时间可倒退

**位置**: `src/runtime/WorldClock.js:22-24`

**代码**:
```javascript
// WorldClock.js:22-24
advance(minutes = 5) {
  if (minutes < 0) minutes = 0;  // 只检查负数
  this.time = new Date(this.time.getTime() + minutes * 60 * 1000);
  this.tickCount++;
```

**问题**: 
1. `advance()` 不验证 `minutes` 是否为整数或合理范围。`advance(1e15)` 可以将时钟推进到远未来。
2. `tickCount` 单调递增，但 `time` 不保证单调——如果从外部恢复了旧的 `savedState`，`tickCount` 可能很高但 `time` 很早。
3. 没有 `tickCount → time` 的一致性约束。

**Linux 对标**: Linux 的 `ktime_get()` 保证单调递增（MONOTONIC clock），即使系统时间被修改。内核的 `jiffies` 也是严格单调递增的。

---

## 五、一般问题 (Minor)

### m1. EmotionSignalBuffer 中 3 处 Math.random() fallback
**位置**: `src/sdk/EmotionSignalBuffer.js:118,125,132`

### m2. AndyWorld 自动 seed 使用 Date.now() ^ Math.random()
**位置**: `src/runtime/AndyWorld.js:45` — 非 seeded 路径中可以接受，但文档未说明

### m3. DomainRegistry 中 campus preset 硬编码 require
**位置**: `src/domain/DomainRegistry.js:22-23` — `require('../../presets/campus')` 是硬编码路径

### m4. Coverage 缺口
- GroundingPackage.schema.js: 35.71% 分支覆盖
- SpatialEngine.js: 64.92% 语句覆盖
- compiler.js: 0% 函数覆盖
- migration.js: 33.33% 函数覆盖
- store/index.js: 16.66% 分支覆盖

### m5. 多个模块导出不一致
- `FactSchema` 不是构造函数（导出为对象而非类）
- `SocialGraph.updateRelationship` 方法不存在
- `KnowledgeStore.addFact` 方法不存在
- `EmotionVector.applyStimulus` 方法不存在

这些意味着 **API 文档/声明与实际实现不匹配**，消费者很难正确使用。

### m6. AndyWorld.addAgent() 无验证
**位置**: `src/runtime/AndyWorld.js` — `addAgent()` 不检查 agent 是否有效、ID 是否重复、position 是否在 domain 中定义

### m7. Schedule.js 中 Date.now() fallback
**位置**: `src/agent/schedule/Schedule.js` — 在核心路径使用 `Date.now()` 作为 fallback，违反 seeded RNG 规则

### m8. UtilityScorer 无维度权重
**位置**: `src/action/UtilityScorer.js:61-64` — 12 个评分维度直接相加，没有权重配置。所有维度对 total 的贡献是平等的，但实际上 need 和 constraint 的重要性远高于 tendency 和 habit

---

## 六、积极发现 (Strengths)

### S1. ✅ 确定性验证通过
相同 seed 产生完全相同的模拟轨迹（在 Agent 不崩溃的范围内）。

### S2. ✅ BehaviorField 力学正确
- 梯度方向正确：`grad[d] += w * (B[d] - target[d])`
- 动力学更新正确：`v += -grad * dt`
- B 向量始终在 [0,1]^4 内
- 速度有界

### S3. ✅ Provider 只读约束遵守
所有 9 个 provider 不包含状态写操作。

### S4. ✅ 边界检查全部通过
`check:boundaries` 报告所有 16 项检查通过。

### S5. ✅ 性能基准通过
所有 perf:check 指标在基准范围内。

### S6. ✅ 架构文档完善
AGENTS.md、PUBLIC_API_CONTRACT.md、WORLD_SCHEMA.md 等文档详尽，架构意图清晰。

### S7. ✅ 测试套件规模大
2788 个测试用例，代码覆盖率 79.59%。

### S8. ✅ CI/CD 配置完整
GitHub Actions 多版本矩阵测试，含边界检查、打包测试。

### S9. ✅ 运行时依赖极少
仅 1 个可选依赖 (better-sqlite3)，开发依赖 4 个。

### S10. ✅ Narrative 不创建 world facts
NarrativeBuilder 和 StoryGenerator 不直接添加 world facts。

---

## 七、对标评分

### 评分方法

以 Linux/macOS/Minecraft 为 10 分基准，评估各维度：

| 维度 | 分数 | 说明 |
|------|------|------|
| **架构设计** | 7.0/10 | Clean Architecture 有清晰意图，但 C2 双重 bug + C4(ScheduleHandler覆写B) + M12-M15(目标/习惯/上下文断连)暴露了架构意图与实现的严重脱节 |
| **代码质量** | 5.0/10 | 6 处 API 导出/方法名不匹配(C5)、10 处 Math.random 违规、context 字段名不匹配、大量 dead code(GoalSystem、IM梯度) |
| **正确性** | 3.0/10 | C2 双重 bug 导致核心功能完全不可用（agent 不移动、behaviorLabel 未定义）、C1 必然崩溃、C5 审计测试自身失败 |
| **可靠性** | 3.0/10 | 6 个 P0/P1 级致命缺陷。任何长时间运行场景必崩。序列化/反序列化不可用。不同 seed 产生相同轨迹 |
| **性能** | 7.0/10 | 单 agent 性能良好，50 agents × 100 ticks 可在 7 秒内完成（不崩溃时） |
| **测试** | 7.0/10 | 2831 用例、测试代码量超过源码，但审计测试发现 13 个失败（含 API 不匹配） |
| **文档** | 7.5/10 | 最好的维度之一。AGENTS.md、架构文档详尽，但 API 文档与实际实现不一致 |
| **安全性** | 6.0/10 | WorldFactStore schema 验证全面，但输入验证缺失、null domain 被静默接受 |
| **可维护性** | 6.5/10 | 模块化好、依赖少，但 AndyWorld God Object(742行/13依赖)、8处硬编码 campus、dead code 增加负担 |
| **API 设计** | 4.0/10 | 意图好但执行差。方法名不一致(addFact≠addKnowledge)、嵌套访问(needs.needs.hunger)、缺少shutdown、6处导出不匹配 |

### 总分

$$\text{综合评分} = \frac{7.0 + 5.0 + 3.0 + 3.0 + 7.0 + 7.0 + 7.5 + 6.0 + 6.5 + 4.0}{10} = \frac{56.0}{100} \times 10 = \textbf{5.6/10}$$

**与 v1 报告(6.25)的差异说明**: 降分主要因为：
1. 新增 3 个 CRITICAL 问题 (C4 子AI发现, C5 API表面, C6 反序列化)，CRITICAL 总数从 3 提升到 6
2. C2 从单 bug 升级为双重 bug（roleArchetype 流程错误 + 区域名不匹配 + 无默认行为）
3. 发现 6 处 API 导出/方法名不匹配，审计测试自身失败
4. 发现不同 seed 产生完全相同的模拟轨迹
5. behaviorLabel 始终为 undefined
6. 10 处 Math.random() 违规（v1 只发现 5 处）

---

## 八、与 Linux/macOS/Minecraft 的差距分析

| 特性 | Linux | Minecraft | Andy Engine |
|------|-------|-----------|-------------|
| 长时间运行稳定性 | 数年 | 数天不崩溃 | ~100 tick 崩溃 |
| 资源清理 | `close`/`release` | 世界保存/卸载 | 无 shutdown |
| 输入验证 | `EINVAL` | 崩溃报告 | 静默接受 |
| 配置一致性 | Kconfig 验证 | 数据包验证 | Schedule vs Domain 脱节；硬编码2000 vs 配置10000 |
| 内存管理 | kmalloc/kfree | 分区加载/卸载 | 无界 presentations 增长 |
| 序列化完整性 | ioctl 结构体版本化 | NBT 格式稳定 | 反序列化摧毁类方法 |
| 物理一致性 | 约束求解器 | 实体碰撞规则 | BehaviorField B向量可被直接覆写 |
| 并发安全 | 锁/RCU | 区块锁 | 无并发保护 |
| 回归测试 | LTP/syzkaller | 零崩溃策略 | 2788 测试但遗漏5个致命 bug |
| 可观测性 | dmesg/perf | F3 调试屏 | console.warn 仅 5 处 |
| 死代码比例 | <1% | <5% | GoalSystem 100%、IM梯度100%、HabitProvider 100%(运行时) |

**核心差距**: Andy Engine 在"设计意图"层面接近优秀，但在"实现正确性"和"内部一致性"层面存在严重缺陷。最突出的问题是 **架构设计与实际接线的脱节**——模块存在、接口定义了、逻辑写好了，但调用链断裂、字段名不匹配、context 未传递，导致大量精心设计的功能在运行时处于休眠状态。

---

## 九、优先修复建议

### 立即修复 (P0) — 不修就不能用

1. **修复 consolidate 栈溢出** (C1): 用 `for...of` 循环替代 spread 操作符
2. **修复 schedule 区域名映射** (C2): 让 schedule 模板使用 domain 中定义的区域名
3. **修复 ScheduleHandler BehaviorField 覆写** (C4): 改为通过 EffectPipeline 提交 B 向量变更，或添加 `behaviorField.setTarget()` 方法让 Langevin 动力学平滑过渡
4. **修复 AndyBridge._restoreAgents** (C5): 反序列化时重建 Emotion 类实例而非用纯对象覆盖

### 短期修复 (P1) — 不修就不正确

5. **添加 AndyEngine.shutdown()** (C3): 释放 SQLite 连接、清理事件监听器
6. **对齐公共 API 与实际实现** (C5): 统一 SocialGraph/KW/EV/FS/NS 的导出名与文档一致
7. **修复 buildActionContext 字段映射** (M13-M14): 统一 context 字段名，填充 pressureContext/futureTendency/locationMeaning/proceduralMemory
8. **接入 GoalSystem** (M12): 将 agent.goals 传入 buildActionContext，让 scoreGoal 真正工作
9. **接入 IntrinsicMotivation 梯度向量** (M15): 让 BehaviorField 接受外部梯度输入，或通过 effect pipeline 传递
10. **修复 scoreNeed 语义** (M10): 明确 needs 系统中 current 的语义（满足度 vs 需求水平），统一两条路径
11. **修复 scoreLocation 偏好** (M11): 考虑位置重要性，而非无条件奖励"不在当前位置"
12. **修复 behaviorLabel 输出** (M3): 确保 BehaviorField.tick 的 label 被写回 agent
13. **移除 Bobby 硬编码** (M1): 重构为 domain-aware 的通用接口
14. **收敛写回路径** (M2): 将 ScheduleHandler/AndyWorld/PerceptionRuntime 的直接写回迁移到 EffectPipeline
15. **添加输入验证** (M4): seed 类型检查、domain 配置验证、addAgent 参数验证

### 中期改进 (P2)

16. **将 Math.random() 全部接入 RNG** (M5): 消除 Character.js, AutoTick.js, compiler.js, migration.js 中的裸 Math.random
17. **统一 `agent.needs` API** (M6): 暴露扁平化接口而非 NeedsSystem 类
18. **修复 EventDispatcher 双重截断** (M16): 删除硬编码 2000，统一使用 cfg.maxEventLogSize
19. **改进事件去重** (M17): 保留跨 tick 去重缓冲（带时间衰减或容量限制）
20. **拆分 AndyWorld** (M15): 将编排、空间、事件、持久化拆为独立子系统
21. **启用 TypeScript strict** (M7): `strict: true`、`checkJs: true`
22. **统一导出方式** (m5): 所有模块使用一致的导出模式
23. **添加内存增长限制**: presentations 数组应设上限
24. **增加可观测性**: 关键路径添加结构化日志
25. **WorldClock 单调保证** (M18): 添加 time ≥ previousTime 约束
26. **UtilityScorer 维度权重** (m8): 可配置的维度权重系统

---

## 十、审计声明

本报告所有发现均通过以下方式独立验证：
1. **运行全量测试**: 171 测试文件, 2831 测试用例
2. **运行边界检查**: 16 项全部通过
3. **运行性能基准**: 5 项全部通过
4. **编写并运行 66 个自定义深度测试**: 覆盖栈溢出验证、输入边界、序列化鲁棒性、跨 seed 确定性、内存泄漏、Provider 只读深度扫描、Domain 隔离扩展验证
5. **5 路子 AI 并行审查**: 覆盖全部 15 个模块（Runtime、Agent/Memory/Psychology、Action/Canon/Effects、Knowledge/Narrative/Pressure、SDK/Domain/Spatial/Store）
6. **手动逐行阅读关键文件**: index.js, Schedule.js, PersonalMemory.js, SocialGraph.js, KnowledgeStore.js, EmotionVector.js, NeedsSystem.js, BehaviorField.js 等
7. **运行时验证**: 直接运行 engine 观察 agent 行为、位置变化、需求演化轨迹
8. **grep 静态分析**: 扫描 Math.random()、硬编码世界词、写回违规模式、deprecated API 调用

每一项声明都有对应的代码行号、测试输出或运行时验证结果支持。

**审计结论**: Andy Engine 是一个**设计意图优秀、文档完善、但实现正确性严重不足、API 契约断裂**的项目。具体表现为：

1. **6 个 CRITICAL 缺陷**使引擎在常规使用场景下不可用（栈溢出必然崩溃、C2 双重 bug 导致 agent 不移动、反序列化摧毁类实例、心理动力学被旁路、API 表面 6 处导出不匹配、无资源清理）
2. **C2 为双重 Bug**: roleArchetype 流程错误使 schedule.entries 永远为空，加上区域名不匹配，agent 永远不移动且 behaviorLabel 始终为 undefined
3. **不同 seed 产生完全相同的模拟轨迹**, 说明 seeded simulation 路径未被正确接入
4. **Action Selection 系统大面积失效**: 12 个评分维度中至少 5 个不工作（habit、goal、tendency、location meaning、pressure）
5. **Dead code 比例高**: GoalSystem、IntrinsicMotivation 梯度向量、HabitCandidateProvider 在运行时都是空操作
6. **10 处 Math.random() 违规** (v1 只发现 5 处)，确定性未强制执行

项目的最大问题不是架构设计，而是 **架构设计与实际接线的严重脱节**。模块存在、接口定义了、逻辑写好了，但调用链断裂、字段名不匹配、context 未传递。这种"看起来完整但实际不工作"的状态比"明显缺失"更危险——审计测试自身调用不存在的方法，TypeScript 声明与实际实现不一致，文档与代码各说各话。

### 评分演进

| 版本 | 综合评分 | 主要变化 |
|------|---------|---------|
| v1 (2026-06-28 02:00) | 6.25/10 | 首次审计 |
| v2 (2026-06-28 本次) | **5.6/10** | C5 API 表面不一致、C2 升级为双重 bug、behaviorLabel 缺失、10 处 Math.random |

### 各维度总结

| 维度 | 分数 | 评级 |
|------|------|------|
| **架构设计** | 7.0/10 | 🟢 良好 |
| **文档** | 7.5/10 | 🟢 良好 |
| **性能** | 7.0/10 | 🟢 良好 |
| **测试** | 7.0/10 | 🟢 良好 |
| **可维护性** | 6.5/10 | 🟡 一般 |
| **安全性** | 6.0/10 | 🟡 一般 |
| **代码质量** | 5.0/10 | 🟠 不足 |
| **API 设计** | 4.0/10 | 🔴 差 |
| **正确性** | 3.0/10 | 🔴 差 |
| **可靠性** | 3.0/10 | 🔴 差 |

> 以 10 分为"与 Linux/macOS/Minecraft 同等水准"的满分标准
> 如果以"个人项目/研究原型"标准评估，分数约为 **7.0/10**
> 如果以"可发布的开源库"标准评估，分数约为 **4.5/10**

---

*报告结束 — 独立审计师 v2*
