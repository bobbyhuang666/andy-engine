# Bug Ledger R8

**日期**: 2026-06-28
**审计范围**: Facts/Canon/Knowledge P0 延续、SDK/Agent 恢复保真、全局 ?? NaN 扫描
**审计子 AI**: 3 个并行独立审计 + 2 个修复子 AI

---

## P0 已修复 (5)

### R8-NAN-001: AgentSubsystemFactory socialEnergy/health `??` 不捕获 NaN

- **文件**: `src/agent/lifecycle/AgentSubsystemFactory.js:99-100`
- **根因**: `savedState.socialEnergy ?? AGENT_DEFAULTS.socialEnergy` — NaN 通过
- **影响**: NaN socialEnergy → ScheduleHandler 社交互避逻辑失效；NaN health → 健康检查永久异常
- **修复**: 改用 `Number.isFinite()` 三元表达式
- **状态**: ✅ 已修复

### R8-NAN-002: Personality OCEAN 维度 `??` 不捕获 NaN

- **文件**: `src/agent/psychology/Personality.js:59-63`
- **根因**: 5 个 OCEAN 维度均使用 `?? 0.5`，NaN 通过
- **影响**: NaN OCEAN → personalityToBehavior() 全 NaN → 所有行为参数/情绪基线/需求衰减率被污染（系统性级联）
- **修复**: 5 个维度全部改用 `Number.isFinite()` 三元表达式
- **状态**: ✅ 已修复

### R8-NAN-003: BehaviorField B/velocity 数组无 NaN 验证

- **文件**: `src/agent/psychology/BehaviorField.js:151-152`
- **根因**: `[...savedState.B]` 直接展开，NaN 元素原样复制
- **影响**: NaN B/velocity → Langevin 动力学全 NaN → 行为标签 undefined → agent 冻结
- **修复**: `.map(v => Number.isFinite(v) ? v : 0.15)` 逐元素验证
- **状态**: ✅ 已修复

### R8-SDK-004: AndyBridge fallback 破坏 EmotionVector 类实例

- **文件**: `src/sdk/AndyBridge.js:298`
- **根因**: `agent.emotion = { ...state.emotion }` 用 plain object 替换 EmotionVector 实例，所有方法丢失
- **影响**: 后续 `agent.emotion.applyEffect()` 等调用全部 TypeError 崩溃
- **修复**: 移除 emotion 浅拷贝，只恢复标量字段 position/health/socialEnergy
- **状态**: ✅ 已修复（R5-SDK-007 确认修复）

### R8-WFS-004/005: WorldFactStore.fromJSON 缺 type 字段崩溃 + numeric timestamp 崩溃

- **文件**: `src/canon/WorldFactStore.js:389,385-386`
- **根因**: `_byType.get(undefined).add()` → TypeError；numeric timestamp 未转 Date → `.getTime()` 崩溃
- **修复**: 添加 typeSet 存在性检查 + numeric timestamp 转 Date
- **状态**: ✅ 已修复

---

## P1 已修复 (10)

### R8-SDK-001: BehaviorField.toJSON 缺少 _lastLabelConfidence

- **文件**: `src/agent/psychology/BehaviorField.js:634-641`
- **根因**: toJSON 输出不含 _lastLabelConfidence，恢复后恒为 0
- **修复**: toJSON 添加字段 + 构造器 savedState 分支恢复
- **状态**: ✅ 已修复（R2-S1 确认修复）

### R8-SDK-002: _applyRestoredState 缺少运行时计数器

- **文件**: `agent/Agent.js:287-300`
- **根因**: _ticksSinceReflection/_ticksSinceDriftCheck/_actionTraceHistory 序列化但未恢复
- **修复**: _applyRestoredState 末尾添加三行恢复代码
- **状态**: ✅ 已修复（R2-S2 确认修复）

### R8-SDK-003: _applyRestoredState 未更新 _behavior

- **文件**: `agent/Agent.js:287-300`
- **根因**: personality 替换后 _behavior 仍指向旧 personality.behavior
- **修复**: 添加 `this._behavior = this.personality.behavior;`
- **状态**: ✅ 已修复（R3-API-007 确认修复）

### R8-SDK-005: BehaviorField 构造器忽略 _prevB

- **文件**: `src/agent/psychology/BehaviorField.js:153`
- **根因**: `this._prevB = [...savedState.B]` 应为 `_prevB`
- **影响**: 恢复后习惯梯度归零，agent 失去行为惯性
- **修复**: `savedState._prevB ? [...savedState._prevB] : [...savedState.B]`
- **状态**: ✅ 已修复

### R8-NAN-005: Schedule 入口数值字段 `??` NaN

- **文件**: `src/agent/schedule/Schedule.js:19-25`
- **修复**: startHour/endHour/probability/noise 改用 Number.isFinite()
- **状态**: ✅ 已修复

### R8-NAN-007: IntrinsicMotivation _ticksSinceGoal/_lastGoalId `??` NaN

- **文件**: `src/agent/psychology/IntrinsicMotivation.js:58-59`
- **修复**: 改用 Number.isFinite()
- **状态**: ✅ 已修复

### R8-NAN-008: EmotionRegulation _regulationCount `??` NaN

- **文件**: `src/agent/psychology/EmotionRegulation.js:75`
- **修复**: 改用 Number.isFinite()
- **状态**: ✅ 已修复

### R7-FSC-001 (P0→P1 已修复): FactSchema NaN 通过 confidence 验证

- **文件**: `src/canon/FactSchema.js:81`
- **修复**: 添加 `!Number.isFinite(fact.confidence)` 检查
- **状态**: ✅ 已修复

### R7-WFS-001 (P0→P1 已修复): WorldFactStore.fromJSON 跳过验证

- **文件**: `src/canon/WorldFactStore.js:389`
- **修复**: fromJSON 添加 type 字段守卫和 timestamp 规范化
- **状态**: ✅ 已修复（与 R8-WFS-004/005 合并修复）

### R7-WFS-003 (P1 已修复): addFact 不检查重复 ID

- **文件**: `src/canon/WorldFactStore.js:97`
- **修复**: 添加 `if (this._facts.has(fact.id))` 检查
- **状态**: ✅ 已修复

---

## P1 未修复（推迟到 R9+）

| Bug ID | 描述 |
|--------|------|
| R8-NAN-004 | ProceduralMemory pattern.strength NaN 无验证 |
| R8-NAN-006 | EmotionVector.native.js stress `??` 未修 |
| R8-NAN-009 | NeedsSystem _decayRates 内部值可能为 NaN |
| R8-NAN-010 | FactSchema confidence/priority `??` NaN |
| R8-SDK-006 | chatStream 缺输入验证 |
| R8-SDK-007 | chatStream 缺 AutoTick try/catch |
| R8-SDK-008 | chatStream 缺一致性检查 |
| R8-SDK-009 | Andy.addCharacter 无重复 ID 检查 |
| R7-FSC-002 | validateTypeFields strength/weight 无范围检查 |
| R7-WFS-002 | updateFact 不 unindex 旧 agents |
| R7-FEM-001 | emitAgentStateFacts 返回幽灵 fact 对象 |
| R7-FPR-001 | _getForbiddenFacts 不排除 knowledgeStore 已知 |
| R7-KNS-001 | KnowledgeStore._normalizeEvidence ?? NaN |
| R7-FCC-001 | FactConsistencyChecker 大小写不匹配 |

---

## 测试状态

2912 通过 / 43 失败（10 个失败文件全部为预存在审计测试，非 R8 修改引起）
Golden seed 已重新生成以适配 _lastLabelConfidence 新字段
