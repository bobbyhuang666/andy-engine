# 10 轮闭环质量系统 — 最终总结报告

**项目**: Andy Engine  
**日期**: 2026-06-28  
**方法**: 独立审计 AI 发现 → 验证 AI 确认 → 执行 AI 修复 → 验证 AI 校验 → 重复

---

## 1. 执行摘要

10 轮闭环质量系统已完成。通过系统性审计和修复，Andy Engine 的数值安全性和 NaN 防御从脆弱状态提升至工业级水平。核心发现是 **`??` 运算符不捕获 NaN** 这一系统性漏洞，影响了 20+ 个关键位点，可导致 agent 心理学栈的永久性崩溃。

### 关键成果
- **修复 50+ 个 bug**（含 21 个 P0 数据损坏级 bug）
- **阻断 NaN 传播链**：从 EmotionVector → Relationship → NeedsSystem → Personality → BehaviorField 全链路防御
- **修复 ProceduralMemory ~170x 过度衰减**：复合衰减 bug 使习惯记忆在多次 tick 后几乎归零
- **修复 10+ 处序列化保真度缺口**：toJSON/fromJSON 往返丢失关键字段
- **零 e2e 回归**：所有端到端测试通过

---

## 2. 轮次摘要

| 轮次 | P0 | P1 | 关键发现 |
|------|----|----|----------|
| R1-2 | 7 | 8 | 初始大规模审计，基础 NaN/序列化修复 |
| R3 | 2 | 3 | AndyBridge EmotionVector 覆盖、SocialGraph 序列化 |
| R4 | 1 | 0 | EventEffectPipeline agentSnapshot 结构修复 |
| R5 | 0 | 3 | EffectCommitter NaN guard、Relationship 阈值调整 |
| R6 | 0 | 4 | PhysiologyRuntime NaN 防御、FutureTendency 序列化 |
| R7 | 2 | 8 | **系统性 `??` NaN 漏洞发现**，20+ 处 `?? number` 不捕获 NaN |
| R8 | 5 | 10 | OCEAN/BehaviorField/AgentSubsystemFactory `??` 修复 |
| R9 | 3 | 7 | NeedsSystem _decayRates、ProceduralMemory 衰减修正 |
| R10 | 1 | 1 | InteractionFacade null check、native EmotionVector desync |

---

## 3. 系统性根因分析

### 3.1 `??` NaN 传播（影响最广）

**根因**: JavaScript 的 `??` 运算符只对 `null`/`undefined` 生效，对 `NaN` 无效。  
**模式**: `savedState.field ?? defaultValue` 当 `field` 为 `NaN` 时，返回 `NaN` 而非 `defaultValue`。  
**修复**: 全局替换为 `Number.isFinite(savedState.field) ? savedState.field : defaultValue`。  
**影响范围**: 20+ 个关键位点，涵盖心理学栈全链路。

**NaN 传播路径示例**：
```
序列化恢复 → Personality.ocean.openness = NaN
  → NeedsSystem._calcDecayRates(NaN) → _decayRates 全 NaN
    → NeedsSystem.tick() → needs 全 NaN
      → PhysiologyRuntime.applyNeedsToEmotion() → emotion 全 NaN
        → EmotionVector.current 全 NaN → agent 行为完全崩溃
```

### 3.2 ProceduralMemory 复合衰减（影响最深远）

**根因**: `tick()` 使用 `hoursSinceLastSeen`（累积时间）而非 `hoursElapsed`（增量时间）计算 `Math.exp(-decayRate * X)`。  
**影响**: 每次 tick 时，衰减因子随 `hoursSinceLastSeen` 增大而指数级增大。以 100 tick 为例，习惯记忆衰减约 170x 过度。  
**修复**: `pattern.strength *= Math.exp(-decayRate * hoursElapsed);`

### 3.3 序列化保真度缺口

**根因**: 多个模块的 `toJSON()`/`fromJSON()` 对不完全，恢复后丢失关键字段。  
**影响**: 世界状态 save/restore 后 agent 状态退化。  
**关键修复**:
- BehaviorField: `_lastLabelConfidence`, `_prevB`
- ProceduralMemory: `_recentActions`, `pattern.strength`
- SocialGraph: `_tickCount`

---

## 4. 修复文件清单

### 核心 NaN 防御（Number.isFinite 替代 ??）

| 文件 | 修复数 | 关键字段 |
|------|--------|----------|
| `src/social/Relationship.js` | 6 | strength, impression, valence |
| `src/agent/psychology/Personality.js` | 5 | OCEAN 5 维 |
| `src/agent/psychology/EmotionVector.js` | 2 | stress, setStress() |
| `src/agent/psychology/EmotionRegulation.js` | 4 | _regulationResource, _regulationCount |
| `src/agent/psychology/IntrinsicMotivation.js` | 3 | curiosity, _ticksSinceGoal |
| `src/agent/lifecycle/AgentSubsystemFactory.js` | 2 | socialEnergy, health |
| `src/agent/psychology/BehaviorField.js` | 3 | B[], velocity[] |
| `src/agent/psychology/NeedsSystem.js` | 2 | _decayRates, _recoveryMultipliers |
| `src/agent/memory/PersonalMemory.js` | 2 | importance |
| `src/agent/memory/ProceduralMemory.js` | 2 | pattern.strength, hoursElapsed |
| `src/agent/schedule/Schedule.js` | 4 | startHour, endHour, probability, noise |
| `src/agent/psychology/EmotionVector.native.js` | 1 | stress |
| `src/knowledge/KnowledgeStore.js` | 2 | confidence, learnedAt |
| `src/canon/FactSchema.js` | 2 | strength, weight |
| `src/spatial/SpatialHash.js` | 2 | x, y |
| `src/runtime/EventDispatcher.js` | 1 | strength |

### 序列化/恢复修复

| 文件 | 修复内容 |
|------|----------|
| `src/agent/psychology/BehaviorField.js` | toJSON 添加 _lastLabelConfidence, _prevB 恢复 |
| `src/agent/memory/ProceduralMemory.js` | toJSON/fromJSON 添加 _recentActions |
| `src/canon/WorldFactStore.js` | _unindexAgents before _indexAgents |
| `src/canon/FactEmitter.js` | emit*Facts 推送更新后 fact 对象 |
| `src/sdk/AndyBridge.js` | 不覆盖 EmotionVector 类实例，只恢复标量字段 |

### 边界条件修复

| 文件 | 修复内容 |
|------|----------|
| `src/spatial/WorldMap.js` | randomPoint() 小区域 guard |
| `src/agent/facade/InteractionFacade.js` | emotion/personality null check |
| `src/sdk/AndyEngineHelpers.js` | native EmotionVector desync 防御 |
| `src/sdk/Character.js` | chatStream 输入验证 + AutoTick try/catch |
| `src/narrative/FactProvider.js` | _getForbiddenFacts 排除已知事实 |

---

## 5. 测试基线

| 指标 | 值 |
|------|-----|
| 总测试数 | 2955 |
| 通过 | 2910 |
| 失败（预存在） | 45 |
| e2e 测试 | ✅ 全部通过 |
| golden-seed replay | ✅ 通过 |
| serialization roundtrip | ✅ 通过 |

预存在失败均为 deep-audit-core/supplemental 和 phase-26/29/32 测试，非本轮修改引起。

---

## 6. 未完成项

以下修复因导致行为回归而未重新应用，需在后续迭代中谨慎处理：

1. **ScheduleHandler applyImpulse** — 替代直接 B 赋值，但移除了 state_change 事件
2. **ActionSelectionRuntime PressureContext** — 大范围新增字段，影响 action selection 行为
3. **index.js schedule 解析** — 重构了 schedule 创建路径
4. **presets/campus region 重命名** — 住处→宿舍等，需同步更新 domain 定义

这些变更属于行为改进而非 bug 修复，应通过 RFC 流程单独推进。

---

## 7. 收敛判定

### ✅ 已收敛

- **NaN 传播防御**: 全链路 20+ 处 Number.isFinite 替代 ??，R10 审计未发现新的真实 NaN 漏洞
- **核心序列化保真度**: 关键模块 toJSON/fromJSON 往返测试通过
- **P0 bug 发现率**: R10 仅 1 个 P0，较 R1-2 的 7 个下降 86%

### ⚠️ 条件收敛

- **行为层修复**: ScheduleHandler/ActionSelectionRuntime/presets 变更未重新应用
- **预存在测试失败**: 45 个失败测试待清理

### 建议

1. 优先清理预存在测试失败
2. 通过 RFC 流程逐个重新应用行为变更，每个变更配独立测试
3. 建立 CI 门禁：新增 `?? number` 模式自动报警

---

**10 轮闭环质量系统结束。** Andy Engine 的核心数值安全性已从脆弱状态提升至工业级水平。
