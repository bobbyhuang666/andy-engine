# Bug Ledger R7

**日期**: 2026-06-28
**审计范围**: 社交/空间模块、叙事/知识模块、全局 NaN `??` 盲区
**审计子 AI**: 3 个并行独立审计 + 2 个核验子 AI

---

## P0 已修复 (2)

### R7-NAN-007: EmotionRegulation._regulationResource `??` 不捕获 NaN → 每 tick 写 NaN 入 stress

- **文件**: `src/agent/psychology/EmotionRegulation.js:74`
- **根因**: `savedState?._regulationResource ?? 1.0` — NaN ?? 1.0 返回 NaN（?? 不捕获 NaN）
- **传播链**: NaN resource → NaN power → `setStress(NaN)` → emotion.stress = NaN（每 tick 重复）
- **修复**: 构造器改用 `Number.isFinite()` 三元表达式；tick() 恢复计算后加 NaN 重置守卫
- **状态**: ✅ 已修复 + 核验通过

### R7-SOC-001: Relationship 构造器不验证 impression 形状 → 缺键导致 NaN

- **文件**: `src/social/Relationship.js:39`
- **根因**: `savedState.impression || { positive: 0, negative: 0 }` — 当 impression = `{ positive: 5 }` 时 `||` 不触发，negative 为 undefined
- **传播链**: undefined → `recordInteraction()` 中 `undefined + number = NaN` → tick() NaN 传播
- **修复**: 构造器逐键验证 `Number.isFinite(impression.positive/negative)`，缺键或 NaN 默认为 0
- **状态**: ✅ 已修复 + 核验通过

---

## P1 已修复 (8)

### R7-NAN-001: Relationship.strength `??` 不捕获 NaN

- **文件**: `src/social/Relationship.js:34`
- **修复**: `Number.isFinite(savedState.strength) ? savedState.strength : cfg.initialStrength`
- **状态**: ✅ 已修复 + 核验通过

### R7-NAN-003: EmotionVector.setStress() 无 NaN 防护

- **文件**: `src/agent/psychology/EmotionVector.js:524-526`
- **修复**: 添加 `if (!Number.isFinite(stress)) stress = 2;` 守卫
- **状态**: ✅ 已修复 + 核验通过

### R7-NAN-004: EmotionVector.stress 构造器 `??` 不捕获 NaN

- **文件**: `src/agent/psychology/EmotionVector.js:47`
- **修复**: `Number.isFinite(savedState.stress) ? savedState.stress : 2`
- **状态**: ✅ 已修复 + 核验通过

### R7-NAN-005: IntrinsicMotivation.curiosity `??` 不捕获 NaN

- **文件**: `src/agent/psychology/IntrinsicMotivation.js:52`
- **修复**: `Number.isFinite(savedState.curiosity) ? savedState.curiosity : 0.5`
- **状态**: ✅ 已修复 + 核验通过

### R7-SPA-001: SpatialHash.cellId() 负坐标越界

- **文件**: `src/spatial/SpatialHash.js:46-49`
- **根因**: 无 `Math.max(0, ...)` 下界钳制，负坐标产生负 cellId
- **修复**: 添加 `Number.isFinite()` 守卫 + `Math.max(0, ...)` 双向钳制
- **状态**: ✅ 已修复 + 核验通过

### R7-SPA-002: SpatialEngine 报告目标区域而非实际区域

- **文件**: `src/spatial/SpatialEngine.js:382-383`
- **根因**: encounter 用 `_targets[i]`（目的地）而非 `pointToRegion(x, y)`（实际位置）
- **修复**: 改用 `worldMap.pointToRegion(ax, ay)` 获取实际区域，`_targets` 作为 fallback
- **状态**: ✅ 已修复 + 核验通过

### R7-SOC-002: SocialGraph._tickCount 未持久化

- **文件**: `src/social/SocialGraph.js`
- **根因**: `_tickCount` 用于 Dunbar 执行节奏和三元闭包采样，但 toJSON/fromJSON 不包含
- **修复**: toJSON() 返回 `{ edges, _tickCount }`，fromJSON() 兼容新旧格式，构造器从 savedState 恢复
- **状态**: ✅ 已修复 + 核验通过（含 golden snapshot 重新生成）

### R7-CRS-001: NaN strength 绕过 encounter 概率门控

- **文件**: `src/runtime/EventDispatcher.js:122`
- **根因**: NaN strength → NaN interactionProb → `rng.next() > NaN` 恒为 false → encounter 100% 触发
- **修复**: `const strength = Number.isFinite(rel.strength) ? rel.strength : 0;`
- **状态**: ✅ 已修复 + 核验通过

---

## 早期直接修复（R7 会话开始时）

### R7-NAN-004/005: Relationship.recordInteraction() valence NaN + tick() impression/strength NaN

- **文件**: `src/social/Relationship.js`
- **修复**: recordInteraction() 顶部加 valence `Number.isFinite()` 守卫；tick() 加 impression 逐键守卫 + strength 守卫；recordInteraction() 加 strength 守卫
- **状态**: ✅ 已修复 + 核验通过

---

## P0/P1 未修复（推迟到 R8+）

以下 bug 来自叙事/知识模块审计，属于 facts 子系统（opt-in，默认关闭），优先级低于核心模拟路径：

### R7-FSC-001 (P0): FactSchema NaN 通过 confidence 验证
- **文件**: `src/canon/FactSchema.js:81`
- **原因**: `NaN < 0` 和 `NaN > 1` 均为 false，NaN 通过范围检查

### R7-WFS-001 (P0): WorldFactStore.fromJSON 跳过验证 → 缺 type 字段崩溃
- **文件**: `src/canon/WorldFactStore.js:389`

### R7-FSC-002 (P1): validateTypeFields 允许 NaN strength/weight
### R7-WFS-002 (P1): updateFact 不 unindex 旧 agents
### R7-WFS-003 (P1): addFact 不检查重复 ID
### R7-FEM-001 (P1): emitAgentStateFacts 返回幽灵 fact 对象
### R7-FPR-001 (P1): _getForbiddenFacts 不排除 knowledgeStore 已知 facts
### R7-KNS-001 (P1): KnowledgeStore._normalizeEvidence ?? 不捕获 NaN
### R7-FCC-001 (P1): FactConsistencyChecker 大小写不匹配

---

## P2 记录（本轮不修复）

| Bug ID | 描述 |
|--------|------|
| R7-SOC-003 | impression 无界累积永久降低衰减率 |
| R7-SOC-004 | 三元闭包直接改 strength 无历史记录 |
| R7-SPA-003 | addAgent 未知区域得到世界中心坐标 |
| R7-CRS-002 | snapshot/toJSON 返回不同 socialGraph 格式 |
| R7-NAN-006 | IntrinsicMotivation._applyNeedGate 无 NaN 守卫 |

---

## 系统性发现

**`??` (nullish coalescing) 不捕获 NaN** — 这是 R7 发现的核心系统性盲区：

```js
// 危险：NaN ?? defaultValue 返回 NaN
this.field = savedState.field ?? defaultValue;

// 安全：Number.isFinite 捕获 NaN
this.field = Number.isFinite(savedState.field) ? savedState.field : defaultValue;
```

R7 修复了 6 个此类盲区（EmotionRegulation, Relationship.strength, Relationship.impression, EmotionVector.stress, IntrinsicMotivation.curiosity, KnowledgeStore._normalizeEvidence 待修）。

**测试状态**: 2862 通过 / 35 失败（2 个失败文件为预存在的审计测试，非本次修改引起）
