# AUDIT_RECONCILIATION_REPORT.md

> **对账阶段**: v3.1 Critical Audit Reconciliation  
> **对账人**: 架构师（独立代码验证 + 5 组并行子 AI 验证）  
> **对账日期**: 2026-06-28  
> **审计来源**: `docs/audit/INDEPENDENT_AUDIT_REPORT.md` (v2, 2026-06-28)  
> **对账方法**: 逐项读取源代码 + 运行时验证，不信任报告文本

---

## 一、对账方法

1. **直接代码验证**: 逐行读取被审计文件，确认代码是否如报告所述
2. **运行时验证**: 启动 engine 实例，验证 agent 行为、schedule entries、position 变化
3. **5 组并行子 AI**: 分别验证 C1+C4+M3+M14, C2+M16+M17+M18, C5+M5+M6, C3+C6+M1+M2, M9-M14
4. **交叉验证**: 对子 AI 结果中的关键发现进行二次代码确认

---

## 二、Critical 问题对账

### C1. PersonalMemory.consolidate 栈溢出

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (代码缺陷) |
| **触发难度** | LOW — 在当前 Node v26 + 默认栈大小下无法复现，需极端长时间运行或受限环境 |
| **严重度** | P1 (非 P0) |

**代码验证**: `src/agent/memory/PersonalMemory.js:729`
```javascript
this.memories[keep].presentations.push(...this.memories[remove].presentations);
```
spread 操作符在 presentations 数组极大时理论上有栈溢出风险。

**运行时验证**:
- 10 agents × 110 ticks: 未崩溃
- 2M 元素 presentations 数组: 在 Node v26 上未崩溃
- v2.2 移除了 `presentations.slice(-20)` 截断，使数组可无限增长

**审计偏差**: 报告称"10 agents × 107 ticks 必然栈溢出"——这在 Node v26 上不成立。实际触发需要远超正常使用场景的 presentations 积累。但代码模式仍是不良实践，应修复。

**修复建议**: 用 `for...of` 循环替代 spread，并考虑为 presentations 数组设置上限。

---

### C2. 日程系统双重 Bug — Agent 日程永远为空

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (Bug 1 + Bug 2 双重确认) |
| **严重度** | P0 — 核心功能完全不可用 |

#### Bug 1: roleArchetype 流程错误 — schedule.entries 永远为 0

**代码验证**: `index.js:155-158`
```javascript
const archetype = this.domain.roleArchetypes[schedule]; // { morningClass: 8, ... }
if (archetype) {
  scheduleConfig = new Schedule(archetype).toJSON(); // entries = undefined → []
}
```
`roleArchetypes['student']` = `{ morningClass: 8, afternoonClass: 14, workDays: [1,3,5], workStart: 17, workEnd: 21 }`，不是 Schedule 构造函数期望的 `{ entries: [...] }`。

**运行时验证**:
```
Schedule entries: 0  ← 确认为空
```
archetype 先匹配，`else if (domain.id === 'campus')` 分支永远不执行。

**修复建议**: 将 roleArchetype 参数传给 `createStudentSchedule(archetype)` 而非直接传给 Schedule 构造函数。

#### Bug 2: 日程区域名与 Domain 区域名 0% 匹配

**代码验证**:
- `presets/campus/schedules.js` 使用: `住处`, `餐厅`, `工作区`, `阅览室`, `打工处`
- `presets/campus/index.js` 定义: `宿舍`, `食堂`, `教学楼`, `教室`, `自习室`, `打工地点`

5/5 不匹配。即使 Bug 1 修复，日程条目的 region 也无法映射到 domain 中的有效区域。

**修复建议**: 统一 schedules.js 中的区域名为 domain 定义的区域名。

#### Bug 3: 无默认 schedule

**代码验证**: `index.js:174` — `scheduleConfig = schedule || {}`，当不传 schedule 时结果为 `{}`，`entries` 为空。

**运行时验证**: Agent 确实在移动（通过 IntrinsicMotivation/探索驱动），但不是日程驱动的——是随机游走。

**影响**: 不传 schedule 的用户看到 agent 随机游走而非按日程行动。

**严重度调整**: Bug 3 降为 P2（有合理的 fallback 行为）。Bug 1+Bug 2 合计 P0。

---

### C3. AndyEngine 无 shutdown/close 方法

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (功能缺失) |
| **严重度** | P2 (非 P1) |

**代码验证**: `index.js` 无 shutdown/close/dispose 方法。

**降级理由**: AndyEngine 主类不直接持有 SQLite 连接。Store 层（SQLiteStore）有自己的 close 方法。用户使用 SQLiteStore 时，关闭责任在 Store 层。缺少 shutdown 是 API 完整性缺陷，但不是资源泄漏的直接原因。

**修复建议**: 添加 `shutdown()` 方法，内部调用 store.close()（如果有）和清理定时器。

---

### C4. ScheduleHandler 直接覆写 BehaviorField.B — 绕过 Langevin 动力学

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (架构违规) |
| **严重度** | P1 — 心理动力学核心被旁路 |

**代码验证**: `src/agent/handlers/ScheduleHandler.js:37-38`
```javascript
agent.behaviorField.B = [...targetCenter];
agent.behaviorField.velocity = [0, 0, 0, 0];
```

**同类模式**: `src/agent/lifecycle/AgentSubsystemFactory.js:58-59`
```javascript
behaviorField.B = [...center];
behaviorField._lastLabel = initState;
```
初始化路径也有同样的直接赋值。

**影响**: 
1. B 向量量子跳变，破坏 Langevin 动力学的平滑演化
2. velocity 归零使系统能量不守恒
3. 下一个 tick 的 Langevin 更新基于错误的速度
4. 违反 AGENTS.md "行为状态来自 BehaviorField label / action layer / effect pipeline" 规则

**修复建议**: 添加 `behaviorField.setTarget(center)` 方法，通过 Langevin 势阱平滑过渡到目标状态，而非直接赋值。初始创建时可以直接赋值（创建不算旁路），但运行时变更应走动力学路径。

---

### C5. 审计测试暴露 6 处 API 表面不一致

| 维度 | 评估 |
|------|------|
| **裁定** | ⚠️ **PARTIALLY_CONFIRMED** — 方法名确实不一致，但审计测试调用了错误路径 |
| **严重度** | P2 (API 文档/类型声明与实现不匹配) |

**逐项验证**:

| # | 审计测试调用 | 实际方法 | 裁定 | 说明 |
|---|------------|---------|------|------|
| 1 | `sg.updateRelationship(a,b,data)` | `sg.getOrCreateRelationship(a,b)` + 手动赋值 | **CONFIRMED** | 方法不存在，审计正确 |
| 2 | `ks.addFact(fact, agents)` | `ks.addKnowledge(fact, agents)` | **CONFIRMED** | 方法名不同 |
| 3 | `ks.queryByAgent(agentId)` | `ks.getKnownFacts(agentId)` | **CONFIRMED** | 方法名不同 |
| 4 | `ev.applyStimulus(stimulus)` | `ev.applyEffect(effects)` | **CONFIRMED** | 方法名不同 |
| 5 | `ev.get(i)` | `ev.current[dim]` | **CONFIRMED** | 无 get 方法 |
| 6 | `new FactSchema()` | `validateFact()` 函数 | **CONFIRMED** | 非构造函数 |
| 7 | `ns.getAll()` | `ns.needs` (直接属性) | **CONFIRMED** | 无 getAll 方法 |
| 8 | `ns.get(name)` | `ns.needs[name]` | **CONFIRMED** | 无 get 方法 |

**关键区分**: 这些不一致是 **SDK 内部 API 与审计测试之间的不匹配**，而非公共消费者 API 断裂。SocialGraph、KnowledgeStore、EmotionVector、NeedsSystem 不直接在 `andy-engine` 或 `andy-engine/sdk` 的公共导出中暴露——它们是内部类，通过 `index.js` 的方法间接使用。

**但 `.d.ts` 类型声明确实存在不匹配**: `index.d.ts` 中声明的接口与实际方法名可能不一致。这是文档/类型问题，不是运行时 bug。

**严重度调整**: 从 P1 降为 P2。公共消费者不会直接调用这些内部类方法，但 TypeScript 类型声明需要修正。

---

### C6. AndyBridge._restoreAgents 反序列化摧毁 Emotion 类

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (代码缺陷) 但 **影响范围极小** |
| **严重度** | P2/deferred (非 P0) |

**代码验证**: `src/sdk/AndyBridge.js:284`
```javascript
Object.assign(agent, { emotion: { ...state.emotion }, position: state.position, health: state.health });
```
反序列化后 `agent.emotion` 是纯对象，丢失所有 EmotionVector 方法。

**关键降级理由**:
1. **AndyBridge 不在公共 API 表面**: 不在 `package.json` exports 中，不被任何公共模块 require
2. **主序列化路径正确**: `AgentSubsystemFactory.restoreSubsystems()` 行 83 使用 `new EmotionVector(personality, savedState.emotion, rng)` 正确恢复类实例
3. **AndyBridge 是未使用的死代码**: 没有模块导入它

**修复建议**: 在 v3.2+ 中决定是否移除 AndyBridge 或修复其 _restoreAgents。

---

## 三、Major 问题对账

### M1. Bobby 硬编码违反 Domain 隔离原则

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** 但已有缓解措施 |
| **严重度** | P2/deferred |

**代码验证**:
- `src/sdk/AndyBridge.js:181` — `getStoriesForBobby()` 标记 `@deprecated`，替代为 `getStoriesForAgent()`
- `src/sdk/AndyBridge.js:205` — `getBobbyEmotion()` 标记 `@deprecated`，替代为 `getAgentEmotion()`
- `src/store/SimulationStore.js:178` — `getStoriesForBobby()` 标记 `@deprecated`，替代为 `getStoriesForAgent()`

**降级理由**: Bobby 方法已标记 deprecated 并有正确替代。保留是为了向后兼容。SimulationStore 在公共 API 表面 (`andy-engine/store`)，deprecated 方法仍可见。

**修复建议**: 在 GA 前移除 deprecated Bobby 方法。

---

### M2. 写回路径违规 — 多处直接修改状态

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (多处直接写回) |
| **严重度** | P1 (ScheduleHandler) / P2 (其他) |

**逐项验证**:

| # | 文件 | 行 | 写回 | 裁定 |
|---|------|-----|------|------|
| 1 | ScheduleHandler.js | 30 | `agent.position = scheduleResult.region` | **CONFIRMED** |
| 2 | ScheduleHandler.js | 37-38 | `agent.behaviorField.B = [...]` + `velocity = [0,0,0,0]` | **CONFIRMED** (同 C4) |
| 3 | ScheduleHandler.js | 67 | `agent.position = needRegion` | **CONFIRMED** |
| 4 | ScheduleHandler.js | 89 | `agent.position = target` | **CONFIRMED** |
| 5 | AndyWorld.js | ~525 | `agent.position = change.to` | **CONFIRMED** |
| 6 | PerceptionRuntime.js | 80 | `agent.memory.addExperience()` | **CONFIRMED** |
| 7 | InteractionFacade.js | 36 | `agent.memory.addExperience()` | **CONFIRMED** |
| 8 | ExternalExperience.js | 35 | `agent.memory.addExperience()` | **CONFIRMED** |

**AGENTS.md 文档**: "新 world-facing consequence 不应直接改别的模块内部状态"，但同时说 "已有 legacy 写回路径请参考 `docs/archive/STATE_WRITEBACK_OWNERSHIP.md`，不要扩大。"

**分级**: ScheduleHandler 的 B 向量覆写是最严重的（同 C4），position 写回次之，memory.addExperience 是 documented legacy path。

**修复建议**: v3.2 只修 C4 (B 向量覆写)。position 写回和 memory.addExperience 作为 legacy 留待 v3.3。

---

### M3. behaviorLabel 始终为 undefined

| 维度 | 评估 |
|------|------|
| **裁定** | ⚠️ **FALSE_POSITIVE** — 审计测试访问了错误路径 |
| **严重度** | N/A |

**代码验证**:
- `agent.behaviorLabel` — **不存在**。没有任何代码定义这个属性。
- `agent.behavior.label` — **存在且有效**。`Agent.js:267-275` getter 返回 `{ label: this.behaviorField.label }`。
- `agent.stateMachine.currentState` — **存在且有效**。通过 `AgentWiring.js:25-27` 的 getter 连接到 `behaviorField.label`。

**运行时验证**:
```
behaviorLabel: 在校园广场  ← 审计测试打印的，实际是 behavior.label
stateMachine.currentState: 在校园广场  ← 正确
```

**审计偏差**: 审计测试调用 `agent.behaviorLabel`，但正确路径是 `agent.behavior.label` 或 `agent.stateMachine.currentState`。BehaviorField.label 在正常 tick 流程中通过 BehaviorLabeler 正确更新。

**但有一个关联问题**: 当 C4 触发时（ScheduleHandler 直接覆写 B），label 跳变但不经过 BehaviorLabeler 的平滑过渡逻辑。这是 C4 的副作用，不是独立的 M3 问题。

---

### M4. AndyEngine 不验证关键输入

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** |
| **严重度** | P2/deferred |

**代码验证**: `index.js` 构造函数不验证 `seed` 类型、domain 配置完整性、addAgent 参数。

**注意**: `src/config/validate.js` 存在完整的配置验证器，但 index.js 未调用它。

**修复建议**: v3.2 在构造函数中调用 validateConfig + validateAgentConfig。

---

### M5. 10 处 Math.random() 或非种子 RNG 使用

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (但大部分是 fallback 模式) |
| **严重度** | P2/deferred |

**逐项验证**:

| # | 文件 | 行 | 模式 | 裁定 |
|---|------|-----|------|------|
| 1 | StoryGenerator.js | 138,321 | `rng ? rng.next() : Math.random()` | **CONFIRMED** — fallback |
| 2 | EmotionSignalBuffer.js | 118,125,132 | `rng ? rng.next() : Math.random()` | **CONFIRMED** — fallback |
| 3 | ids.js | 11 | `Math.random()` | **CONFIRMED** — fallback for ID |
| 4 | AutoTick.js | 26 | `options.rng \|\| Math.random` | **CONFIRMED** — SDK 层 |
| 5 | Character.js | 60 | `Math.random().toString(36)` | **CONFIRMED** — SDK 层 |
| 6 | compiler.js | 101 | `Math.random().toString(36)` | **CONFIRMED** — Store 层 |
| 7 | migration.js | 64 | `Math.random().toString(36)` | **CONFIRMED** — Store 层 |

**分级**: 核心 tick 路径的 fallback (1-3) 优先级高于 SDK/Store 层 (4-7)。在传入 RNG 时不会触发 fallback，但 AGENTS.md 说"不要在核心模拟路径新增裸 Math.random()"。

**修复建议**: v3.2 修核心路径 fallback。SDK/Store 层的裸 Math.random 留待 v3.3。

---

### M6. agent.needs.needs.hunger 反直觉访问

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (API 设计问题) |
| **严重度** | P2/deferred |

**代码验证**: `agent.needs` 返回 NeedsSystem 实例，需要 `agent.needs.needs.hunger` 访问。`agent.behavior` getter 已正确扁平化（`agent.behavior.label`），但 needs 没有。

**修复建议**: 添加 `agent.needs` 的扁平化 getter，或在 Agent 类上暴露 `agent.getNeed('hunger')` 方法。

---

### M7. TypeScript 配置过于宽松

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** |
| **严重度** | P2/deferred |

**代码验证**: `tsconfig.json` — `strict: false`, `checkJs: false`, `skipLibCheck: true`。

**修复建议**: GA 前启用 strict 模式。

---

### M8. 循环依赖自引用

| 维度 | 评估 |
|------|------|
| **裁定** | ❌ **FALSE_POSITIVE** |
| **严重度** | N/A |

**代码验证**:
- `EmotionVector.native.js` — 不引用自身。行 417 条件导出 `require('./EmotionVector')`（非自引用，是 fallback 到纯 JS 版本）
- `validate.js` — 不引用自身。行 8 是 JSDoc 使用示例，行 12 引用 `./defaults`（不同文件）

**审计偏差**: 审计师将条件 fallback 和 JSDoc 示例误判为循环依赖。

---

### M9. scoreNeed 语义反转

| 维度 | 评估 |
|------|------|
| **裁定** | ❌ **FALSE_POSITIVE** — 审计师搞反了 needs 语义 |
| **严重度** | N/A |

**代码验证**:
- `NeedsSystem.js:11`: "1 = 满足，0 = 极度匮乏"
- `UtilityScorer.js:110`: `return Math.max(0, 1 - current)` — 当 `hunger=0.1`（很饿）→ `1-0.1=0.9`（高分吃饭）→ **正确**
- 当 `hunger=0.9`（很饱）→ `1-0.9=0.1`（低分吃饭）→ **正确**

**审计偏差**: 审计师假设 `hunger=0.9` 意味着"很饿"，但实际语义是"0.9 满足度"（很饱）。

**但有一个有效关注**: pressureContext 路径（行 81-93）直接返回压力值，而 fallback 路径返回 `1-current`。两条路径的数值语义不同，可能在边界情况下产生不一致。这值得进一步调查，但不是语义反转。

---

### M10. scoreLocation 奖励远离当前位置

| 维度 | 评估 |
|------|------|
| **裁定** | ⚠️ **PARTIALLY_CONFIRMED** — 代码如所述，但可能是有意设计 |
| **严重度** | P2/deferred (设计决策，非 bug) |

**代码验证**: `UtilityScorer.js:312-316`
```javascript
if (candidate.target && candidate.target === context.agent.position) {
  score += 0.1;  // 已在目标位置
} else if (candidate.target) {
  score += 0.5;  // 不在目标位置 → 得分更高
}
```

**分析**: 这个设计可能是"移动倾向"——鼓励 agent 探索新位置而非原地不动。在完整的 12 维评分中，其他维度（behavior, need, constraint）会提供留置的分数。但如果其他维度也很低，确实会导致无目的游走。

**修复建议**: 考虑为"当前位置就是最佳位置"的情况提供额外分数，或将 0.5 降为 0.2。

---

### M11. GoalSystem 完全断连 — goals 永远为空

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (dead code) |
| **严重度** | P1 — GoalSystem 模块是完整的死代码 |

**代码验证**:
- `ActionSelectionRuntime.js:69`: `goals: []` — 硬编码为空
- `src/action/GoalSystem.js`: 完整的纯函数式目标管理模块
- `scoreGoal()`: 永远返回 0
- 没有任何代码调用 `GoalSystem.createGoal()`, `tickGoals()`, `checkCompletion()`

**修复建议**: v3.3 将 agent.goals 传入 buildActionContext，让 scoreGoal 真正工作。

---

### M12. HabitCandidateProvider context 字段名不匹配

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (完全断连) |
| **严重度** | P1 — 1/9 provider 完全不产生候选 |

**代码验证**:

| HabitCandidateProvider 期望 | buildActionContext 提供 | 匹配? |
|---------------------------|----------------------|-------|
| `context.proceduralMemory` | ❌ 不存在 | NO |
| `context.currentHour` | `context.environment.hour` | NO |
| `context.dayOfWeek` | `context.environment.dayOfWeek` | YES (同名) |
| `context.currentPosition` | `context.agent.position` | NO |
| `context.currentValence` | `context.emotion.valence` | NO |

**注意**: `dayOfWeek` 实际上是同名的（`context.dayOfWeek` 在 HabitCandidateProvider 中 vs `context.environment.dayOfWeek`），但路径不同。HabitCandidateProvider 读 `context.dayOfWeek`，buildActionContext 提供 `context.environment.dayOfWeek`。不匹配。

**修复建议**: v3.2 在 buildActionContext 中添加 `proceduralMemory`, `currentHour`, `currentPosition`, `currentValence` 字段。

---

### M13. buildActionContext 缺失 11 个字段

| 维度 | 评估 |
|------|------|
| **裁定** | ⚠️ **PARTIALLY_CONFIRMED** — 部分字段缺失，部分只是路径不同 |
| **严重度** | P1 |

**逐项验证**:

| 缺失字段 | buildActionContext 实际提供 | 裁定 |
|----------|---------------------------|------|
| `pressureContext` | ❌ 不存在 | **CONFIRMED** |
| `futureTendency` | ❌ 不存在 | **CONFIRMED** |
| `locationMeaning` | ❌ 不存在 | **CONFIRMED** |
| `proceduralMemory` | ❌ 不存在 | **CONFIRMED** |
| `currentHour` | `environment.hour` | **路径不同** |
| `dayOfWeek` | `environment.dayOfWeek` | **路径不同** |
| `currentPosition` | `agent.position` | **路径不同** |
| `currentValence` | `emotion.valence` | **路径不同** |
| `domain` (complete) | `domain` (引用) | **已提供** |
| `schedule` (format) | `schedule.getCurrentActivity(...)` | **已提供(不同格式)** |

**影响**: 
- `pressureContext` 缺失 → scoreNeed/scoreMemory/scoreRelationship/scoreLocation/scoreWorld 全部 fallback 到低质量路径
- `futureTendency` 缺失 → scoreTendency 永远返回 0
- `locationMeaning` 缺失 → scoreLocation 跳过位置意义计算
- `proceduralMemory` 缺失 → HabitCandidateProvider 不产生候选

**修复建议**: v3.2 修复 buildActionContext 字段映射。

---

### M14. IntrinsicMotivation 梯度向量死接线

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (dead code) |
| **严重度** | P1 — IM 梯度向量对模拟零影响 |

**代码验证**: `IntrinsicMotivation.js:154-160` 计算 gradientVector，但：
- BehaviorField 不接受外部梯度输入
- buildActionContext 不传递 gradientVector
- `result.drive.urgency` 被 ScheduleHandler 读取用于位置决策，但 gradientVector 被完全忽略

**修复建议**: v3.3 让 BehaviorField 接受外部梯度输入，或将 IM 梯度转化为 BehaviorField 的附加势阱。

---

### M15. AndyWorld God Object

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (架构关注) |
| **严重度** | P2/deferred (重构，非 bug) |

**代码验证**: AndyWorld.js 742 行，13 个直接依赖。这是架构问题，不是功能 bug。

**修复建议**: v3.4+ 拆分 AndyWorld。

---

### M16. EventDispatcher 事件日志双重截断

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** |
| **严重度** | P2 |

**代码验证**: EventDispatcher.dispatch() 有硬编码截断 2000，_cleanupOldEvents() 使用配置的 maxEventLogSize=10000。硬编码截断先执行，使配置无效。

**修复建议**: 删除硬编码 2000，统一使用 cfg.maxEventLogSize。

---

### M17. EventDispatcher 事件去重仅限单 tick

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (设计决策，非 bug) |
| **严重度** | P2/deferred |

**代码验证**: `_recentContentByAgent` 在每 tick 清空。跨 tick 重复事件不被去重。

**审计偏差**: 这可能是设计决策（避免去重缓冲无限增长），而非 bug。

**修复建议**: 考虑保留跨 tick 去重缓冲（带时间衰减或容量限制）。

---

### M18. WorldClock 非单调

| 维度 | 评估 |
|------|------|
| **裁定** | ✅ **CONFIRMED** (理论风险) |
| **严重度** | P2/deferred |

**代码验证**: `advance()` 不验证 minutes 范围，`tickCount` 单调但 `time` 不保证。从旧状态恢复时 time 可能倒退。

**修复建议**: 添加 time >= previousTime 约束。

---

## 四、Minor 问题对账

### m1-m8 快速裁定

| # | 问题 | 裁定 | 严重度 |
|---|------|------|--------|
| m1 | EmotionSignalBuffer Math.random | CONFIRMED (同 M5 #2) | P2/deferred |
| m2 | AndyWorld 自动 seed Date.now() | CONFIRMED (非 seeded 路径可接受) | deferred |
| m3 | DomainRegistry campus preset 硬编码 | CONFIRMED (DomainRegistry 默认加载 campus) | P2/deferred |
| m4 | Coverage 缺口 | CONFIRMED | deferred |
| m5 | 模块导出不一致 | CONFIRMED (同 C5) | P2 |
| m6 | addAgent 无验证 | CONFIRMED (同 M4) | P2/deferred |
| m7 | Schedule.js Date.now() | 需要验证 | P2 |
| m8 | UtilityScorer 无维度权重 | CONFIRMED (设计简化) | deferred |

---

## 五、对账总结

### 按裁定分类

| 裁定 | 数量 | 项目 |
|------|------|------|
| **CONFIRMED** | 17 | C1, C2(Bug1+Bug2+Bug3), C3, C4, C6, M1, M2, M4, M5, M6, M7, M10, M11, M12, M13, M14, M15, M16, M17, M18 |
| **FALSE_POSITIVE** | 2 | M3, M8, M9 |
| **PARTIALLY_CONFIRMED** | 2 | C5, M10 |
| **DEFERRED** | 多项 | m1-m8 中的多项 |

### 按修复优先级分类

#### P0 — 不修就不能用 (v3.2 必须)

| # | 问题 | 修复方案 |
|---|------|---------|
| C2-Bug1 | roleArchetype 流程错误 | 将 archetype 参数传给 createStudentSchedule(archetype) |
| C2-Bug2 | 日程区域名不匹配 | 统一 schedules.js 区域名为 domain 定义 |

#### P1 — 不修就不正确 (v3.2 应修)

| # | 问题 | 修复方案 |
|---|------|---------|
| C4 | ScheduleHandler 覆写 BehaviorField.B | 添加 behaviorField.setTarget() 方法 |
| M12 | HabitCandidateProvider 字段不匹配 | 在 buildActionContext 中添加缺失字段 |
| M13 | buildActionContext 缺失字段 | 填充 pressureContext/futureTendency/locationMeaning/proceduralMemory |
| M11 | GoalSystem 断连 | 将 agent.goals 传入 buildActionContext |
| M14 | IM 梯度向量死接线 | 让 BehaviorField 接受外部梯度 |

#### P2 — 改善但不阻塞 (v3.3+)

| # | 问题 | 修复方案 |
|---|------|---------|
| C1 | consolidate spread 栈溢出风险 | 用 for...of 替代 spread |
| C3 | 无 shutdown 方法 | 添加 shutdown() |
| C5 | API 声明不匹配 | 更新 .d.ts |
| C6 | AndyBridge 反序列化 | 修复或移除 AndyBridge |
| M1 | Bobby deprecated 方法 | GA 前移除 |
| M2 | 写回路径违规 | v3.3 收敛 |
| M4 | 输入验证 | 调用 validateConfig |
| M5 | Math.random() | 接入 RNG |
| M6 | needs.needs.hunger | 扁平化接口 |
| M7 | TypeScript strict | GA 前启用 |
| M16 | EventDispatcher 双重截断 | 统一使用配置 |
| M17 | 事件去重跨 tick | 添加衰减缓冲 |
| M18 | WorldClock 非单调 | 添加约束 |

#### FALSE_POSITIVE — 不需要修

| # | 问题 | 原因 |
|---|------|------|
| M3 | behaviorLabel undefined | 审计测试访问错误路径，正确路径是 agent.behavior.label |
| M8 | 循环依赖自引用 | 不存在，EmotionVector.native 是 fallback 非 self-require |
| M9 | scoreNeed 语义反转 | 审计师搞反了 needs 语义（1=满足不是 1=匮乏） |

---

## 六、审计报告质量评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **发现准确率** | 20/24 (83%) | 3 个 FALSE_POSITIVE (M3/M8/M9)，1 个严重度虚高 (C6) |
| **严重度评估** | 偏高 | C6 从 P0 降为 P2，C3 从 P1 降为 P2，M9 完全否定 |
| **代码行号准确度** | 高 | 大部分行号准确，个别因代码改动有偏移 |
| **根因分析** | 良好 | C2 Bug1 的根因分析准确，M9 的语义分析有误 |
| **遗漏** | 有 | 未发现 AgentSubsystemFactory.createSubsystems 行 58 也有 B 向量直接赋值 |

### 审计报告最大贡献

1. **C2 双重 Bug** — 这是最有价值的发现。schedule.entries=0 是完全不被现有测试捕获的致命 bug
2. **C4 ScheduleHandler B 覆写** — 揭示了心理动力学核心被旁路的架构违规
3. **M12-M14 Action Wiring 断连** — 揭示了"模块存在但不接线"的系统性问题

### 审计报告最大误判

1. **M9 scoreNeed 语义反转** — 完全搞反了语义，实际逻辑正确
2. **M3 behaviorLabel** — 访问了错误路径，label 实际存在且工作
3. **C6 严重度** — AndyBridge 是未导出的死代码，主序列化路径正确

---

## 七、对下一步的建议

1. **v3.2 范围**: 只修 P0 (C2) + P1 (C4, M12, M13)。不做大重构。
2. **v3.3 范围**: 修 P1 剩余 (M11, M14) + 部分 P2 (C1, C3, M4, M5)。
3. **v3.4 范围**: Action Wiring 完整性 + AndyWorld 拆分。
4. **审计测试**: 不纳入主 gate。保留在 `tests/audit/` 作为参考证据，但其中的 API 调用需要修正后再考虑。
5. **发布状态**: 维持冻结。v3.2 完成后重新评估。

---

*报告结束 — v3.1 Critical Audit Reconciliation*
