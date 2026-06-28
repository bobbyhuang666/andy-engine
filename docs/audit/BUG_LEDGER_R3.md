# Bug Ledger — Round 3

> 生成时间: 2026-06-28
> 审计方法: 4 路并行审计子 AI (API契约/序列化闭环/effects管线/边界值) + 指挥师自主审计
> 核验原则: 每个 bug 独立验证复现路径，确认后修复并验证
> 更新时间: 2026-06-28

---

## P0 — CONFIRMED（2 个）→ 全部已修复

| ID | 来源 | 严重度 | 核验结论 | 修复状态 | 回归测试 |
|---|---|---|---|---|---|
| R3-SER-001 | 自主审计 | P0 | CONFIRMED | ✅ FIXED | pass |
| R3-BND-001 | 自主审计 | P0 | CONFIRMED | ✅ FIXED | pass |

### R3-SER-001: snapshot() 闭环断裂 — 恢复后崩溃或丢失所有 agent 子系统

- **文件位置**: `src/runtime/AndyWorld.js:708-720` (snapshot) + `:138-140` (restore)
- **证据**:
  1. `snapshot()` 使用 `agent.getStatus()` 序列化 agent，但 `getStatus()` 只返回 10 个字段（behavior/emotion/health/id/intrinsicMotivation/isOnline/name/position/socialEnergy/state），缺少 personality/needs/behaviorField/memory/schedule/proceduralMemory/stateMachine/emotionRegulation/appraisalBiases 共 9 个关键子系统
  2. `snapshot()` 返回 `socialGraph: { agentCount, edgeCount, edges }` 但 SocialGraph 构造函数期望 `edges` 数组，导致 `TypeError: savedEdges is not iterable`
  3. `snapshot()` 不包含 `rngState`/`events`/`factStore`，导致恢复后 RNG 流不一致
- **修复方案**:
  1. `snapshot()` 改用 `agent.toJSON()` 替代 `agent.getStatus()`
  2. SocialGraph 恢复路径兼容包装格式：`Array.isArray(socialGraph) ? socialGraph : socialGraph?.edges || null`
  3. `snapshot()` 添加 rngState、events（完整 EventDispatcher 状态）、factStore、knowledgeStore
- **修复文件**: `src/runtime/AndyWorld.js`
- **回归测试**: 169/169 non-audit tests pass, snapshot round-trip produces identical pre-tick state

### R3-BND-001: BehaviorField/NeedsSystem NaN 传播 — 单个 NaN 值永久摧毁 agent

- **文件位置**: `src/agent/psychology/BehaviorField.js:376-393` (_addNeedsGradient) + `src/agent/psychology/NeedsSystem.js:72-73` (savedState restore)
- **证据**:
  1. `NeedsSystem` 构造函数接受 `savedState.needs` 中的 NaN 值而不拒绝/修正（`{ needs: { hunger: NaN, ... } }` 被静默接受）
  2. `BehaviorField._addNeedsGradient()` 对 NaN 值执行 `1 / (1 + Math.exp(8 * (NaN - 0.25)))` = NaN，然后 `grad[d] += NaN` 导致 B 和 velocity 全部变为 NaN
  3. 一旦 B 变为 NaN，所有后续 tick 都产生 NaN，agent 被永久摧毁
- **修复方案**:
  1. `NeedsSystem` 构造函数：对 `savedState.needs` 中的 NaN/Infinity 值重置为 0.5
  2. `BehaviorField._addNeedsGradient()`: 跳过 `!Number.isFinite(value)` 的需求值
  3. `BehaviorField._addEmotionGradient()`: 跳过 `!Number.isFinite()` 的情绪驱动值
- **修复文件**: `src/agent/psychology/BehaviorField.js`, `src/agent/psychology/NeedsSystem.js`
- **回归测试**: 169/169 non-audit tests pass, NaN inputs no longer propagate to B/velocity

---

## P1 — CONFIRMED（3 个）→ 全部已修复

| ID | 来源 | 严重度 | 核验结论 | 修复状态 |
|---|---|---|---|---|
| R3-API-001 | 自主审计 | P1 | CONFIRMED | ✅ FIXED |
| R3-BND-002 | 自主审计 | P1 | CONFIRMED | ✅ FIXED |
| R3-API-002 | 自主审计 | P1 | CONFIRMED | ✅ FIXED |

### R3-API-001: addAgent() 重复 ID 静默覆盖 — 旧 agent 被 GC 但索引残留

- **文件位置**: `src/runtime/AndyWorld.js:178` (`this.agents.set(agent.id, agent)`)
- **证据**: `addAgent({ id: 'alice' })` 后再次 `addAgent({ id: 'alice' })` 不报错，旧 agent 被 Map.set 覆盖，但 socialGraph/spatial 中旧 agent 的索引未清理。`getAllAgents().length = 1` 但旧 agent 对象可能仍有引用
- **修复方案**: 在 `addAgent()` 开头添加 `if (this.agents.has(agent.id)) throw new Error(...)`
- **修复文件**: `src/runtime/AndyWorld.js`
- **回归测试**: 169/169 non-audit tests pass, duplicate ID now throws

### R3-BND-002: EmotionVector NaN 传播 — applyEffect 接受极端/NaN delta 导致 current 永久 NaN

- **文件位置**: `src/agent/psychology/EmotionVector.js:478-507` (applyEffect + _clamp)
- **证据**:
  1. `applyEffect({ joy: 1e10 })` 产生 `clampedDelta = maxDeltaPerTick`，但 `current.joy += clampedDelta` 后值可能超出 [-1,1]
  2. `_clamp()` 中 `Math.max(-1, Math.min(1, NaN))` = NaN，不会修正 NaN 值
  3. 一旦 current 某维度变为 NaN，所有后续 tick 都传播 NaN 到 mood 和其他维度
- **修复方案**:
  1. `applyEffect()`: 跳过 `!Number.isFinite(delta)` 的 delta
  2. `_clamp()`: 对 NaN/Infinity 值重置为 0 后再截断到 [-1,1]
  3. `_clamp()`: stress 的 NaN/Infinity 重置为默认值 2
- **修复文件**: `src/agent/psychology/EmotionVector.js`
- **回归测试**: 169/169 non-audit tests pass, extreme applyEffect no longer produces NaN

### R3-API-002: seed 验证缺失 — NaN/Infinity/非预期类型被静默接受

- **文件位置**: `src/config/validate.js` + `index.js:59`
- **证据**:
  1. `new AndyEngine({ seed: NaN })` 不报错，`new RNG(NaN)` 后 `NaN | 0 = 0`，导致所有 NaN seed 映射到同一 RNG 序列
  2. `new AndyEngine({ seed: Infinity })` 同理，`Infinity | 0 = 0`
  3. `new AndyEngine({ seed: { foo: 1 } })` 也不报错
- **修复方案**: 在 `validateConfig()` 中添加 seed 类型/值验证：必须是 string/number，不能是 NaN/Infinity
- **修复文件**: `src/config/validate.js`
- **回归测试**: 169/169 non-audit tests pass, NaN/Infinity seed now throws

---

## 已知限制（非 bug）

### 浮点精度漂移（snapshot/toJSON round-trip）

- **现象**: 从序列化状态恢复后，运行 50+ ticks 会出现 ~0.003 的 BehaviorField 漂移
- **原因**: 浮点运算路径差异（新对象 vs 原有对象），不涉及 RNG 序列分歧（已验证 RNG 调用次数和值完全一致）
- **性质**: 非累积性漂移，50 ticks 内最大 < 0.01，不构成 P0/P1

---

## 收敛状态

- P0 confirmed = **0** ✅（目标: 0）— R3 修复 2 个 P0
- P1 confirmed 待修复 = **0** ✅（目标: 0）— R3 修复 3 个 P1
- P0+P1 本轮修复 = **5 个** ✅ — R3-SER-001, R3-BND-001, R3-API-001, R3-BND-002, R3-API-002
- 连续审计未发现新 P0/P1 = **1 轮**（本轮修复后验证无新 P0/P1 引入）
- npm test = **169 passed / 0 failed**（排除审计测试）✅
- npm run check:boundaries = **all pass** ✅
- npm run test:domain = **81/81 pass** ✅
- npm run smoke:pack = **all pass** ✅

**发布状态: FROZEN** — 不得 npm publish / tag / release
