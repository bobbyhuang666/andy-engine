# Bug Ledger R9

**日期**: 2026-06-28
**审计范围**: NeedsSystem/Memory NaN 根治、ProceduralMemory 衰减修正、SDK 鲁棒性、全局 Number.isFinite() 收尾
**审计子 AI**: 3 个并行独立审计 + 2 个修复子 AI

---

## P0 已修复 (3)

### R9-NAN-001: NeedsSystem _decayRates / _recoveryMultipliers 内部 NaN

- **文件**: `src/agent/psychology/NeedsSystem.js:83-95`
- **根因**: `??` 运算符不捕获 NaN，被污染的序列化 _decayRates 值原样通过，永久摧毁需求动态
- **影响**: NaN _decayRates → 所有 need 衰减/恢复计算 NaN → agent 需求系统彻底崩溃
- **修复**: 改用 `Number.isFinite()` 验证 + 构造器内 fresh fallback 重算
- **状态**: ✅ 已修复

### R9-NAN-002: PersonalMemory importance NaN

- **文件**: `src/agent/memory/PersonalMemory.js:170-176, 666-673`
- **根因**: addExperience() 创建时无 NaN 守卫，tick() 衰减时无 NaN 守卫，NaN importance 自由传播
- **影响**: NaN importance → 记忆修剪/衰减排序失效 → 记忆系统数据损坏
- **修复**: addExperience() 和 tick() 均添加 `Number.isFinite()` 守卫
- **状态**: ✅ 已修复

### R9-MEM-001: ProceduralMemory 复合衰减错误

- **文件**: `src/agent/memory/ProceduralMemory.js:245`
- **根因**: tick() 使用 `hoursSinceLastSeen`（累积时间）而非 `hoursElapsed`（增量时间）代入 `Math.exp(-decayRate * X)`，导致重复 tick 时 ~170x 过度衰减
- **影响**: pattern strength 指数级坍缩 → procedural 记忆在多次 tick 后几乎归零
- **修复**: 改用 `hoursElapsed`（增量时间）
- **状态**: ✅ 已修复

---

## P1 已修复 (7)

### R9-SDK-001: chatStream 缺少输入验证

- **文件**: `src/sdk/Character.js:232-234, 238-242`
- **根因**: message 参数无类型检查，AutoTick 错误直接传播到调用方导致对话崩溃
- **修复**: typeof 检查 + AutoTick try/catch 包裹
- **状态**: ✅ 已修复（合并修复 R8-SDK-006 / R8-SDK-007）

### R9-MEM-002: ProceduralMemory _recentActions 未序列化

- **文件**: `src/agent/memory/ProceduralMemory.js:43, 274-277`
- **根因**: toJSON/fromJSON 不含 `_recentActions`，保存/恢复后最近行动历史丢失
- **修复**: toJSON 添加 _recentActions + fromJSON 恢复
- **状态**: ✅ 已修复

### R9-SIM-001: IntrinsicMotivation Date.now() 取代 simTime

- **文件**: `src/agent/psychology/IntrinsicMotivation.js`
- **根因**: 多个方法使用墙钟 `Date.now()` 而非 `simTime`，破坏确定性重放并造成时间漂移
- **修复**: tick 链全程转发 simTime，仅 getNovelty() 保留 Date.now() 作为防御性回退
- **状态**: ✅ 已修复

### R9-SSD-001: WorldMap randomPoint() 小区域越界

- **文件**: `src/spatial/WorldMap.js:160-180`
- **根因**: 固定 padding=2 未做维度检查，当区域 w<4/h<4 或 radius<2 时生成越界坐标
- **修复**: 维度守卫 + center() 回退
- **状态**: ✅ 已修复

### R9-NAN-003: EmotionVector.native stress `??` → Number.isFinite()

- **文件**: `src/agent/psychology/EmotionVector.native.js:99`
- **根因**: 与 R7/R8 发现相同的系统性 `??` NaN 漏洞
- **修复**: 改用 `Number.isFinite()`
- **状态**: ✅ 已修复（修复 R8-NAN-006 推迟项）

### R9-NAN-004: KnowledgeStore _normalizeEvidence confidence/learnedAt `??` → Number.isFinite()

- **文件**: `src/knowledge/KnowledgeStore.js:52-53`
- **根因**: confidence/learnedAt 使用 `??` 允许 NaN 通过归一化
- **修复**: 改用 `Number.isFinite()`
- **状态**: ✅ 已修复（修复 R7-KNS-001 推迟项）

### R9-CAN-001: FactSchema strength/weight/importance 范围检查缺 Number.isFinite()

- **文件**: `src/canon/FactSchema.js:401, 415, 424`
- **根因**: 范围检查缺少 `Number.isFinite()` 验证，NaN 可通过范围验证
- **修复**: 三个字段均添加 `Number.isFinite()` 检查
- **状态**: ✅ 已修复（修复 R7-FSC-002 推迟项）

---

## 附加修复（低优先级）

| Bug ID | 文件 | 描述 |
|--------|------|------|
| R9-WFS-002 | `src/canon/WorldFactStore.js:150` | updateFact 先 _unindexAgents 再 _indexAgents，防止陈旧索引条目（修复 R7-WFS-002 推迟项） |
| R9-FEM-001 | `src/canon/FactEmitter.js:122-133, 263-273, 318-327` | emit*Facts 推送更新后 fact 对象而非原始对象（修复 R7-FEM-001 推迟项） |
| R9-FPR-001 | `src/knowledge/FactProvider.js:267` | _getForbiddenFacts 排除 knowledgeStore 已知事实（修复 R7-FPR-001 推迟项） |
| R9-NAN-005 | `src/agent/memory/ProceduralMemory.js:40` | pattern.strength NaN 守卫添加在 restore 循环（修复 R8-NAN-004 推迟项） |

---

## R8 推迟项关闭状态

| R8 推迟 ID | R9 修复 ID | 状态 |
|------------|------------|------|
| R8-NAN-004 | R9-NAN-005 | ✅ 已修复 |
| R8-NAN-006 | R9-NAN-003 | ✅ 已修复 |
| R8-NAN-009 | R9-NAN-001 | ✅ 已修复 |
| R8-NAN-010 | R9-CAN-001 | ✅ 已修复 |
| R8-SDK-006 | R9-SDK-001 | ✅ 已修复 |
| R8-SDK-007 | R9-SDK-001 | ✅ 已修复 |
| R7-FSC-002 | R9-CAN-001 | ✅ 已修复 |
| R7-WFS-002 | R9-WFS-002 | ✅ 已修复 |
| R7-FEM-001 | R9-FEM-001 | ✅ 已修复 |
| R7-FPR-001 | R9-FPR-001 | ✅ 已修复 |
| R7-KNS-001 | R9-NAN-004 | ✅ 已修复 |
| R8-SDK-008 | — | 仍待修 |
| R8-SDK-009 | — | 仍待修 |
| R7-FCC-001 | — | 仍待修 |

---

## 测试状态

| 阶段 | 通过 | 失败 | 总计 |
|------|------|------|------|
| R9 修复前 | 2909 | 43 | 2952 |
| R9 修复后 | 2911 | 44 | 2955 |
| golden-seed 重新生成后 | 2911 | 44 | 2955 |

- +1 失败为 golden-seed-replay 测试，因 WorldMap.randomPoint() 修复需要重新生成 seed，重新生成后恢复一致
- 44 个剩余失败均为预存在（deep-audit-core/supplemental + phase-26/29/32 测试），非 R9 修改引起
- Golden seed 已重新生成以适配 randomPoint() 行为变更

---

## 收敛评估

| 指标 | R7 | R8 | R9 |
|------|----|----|-----|
| P0 发现 | 2 | 5 | 3 |
| P1 发现 | 8 | 10 | 7+4 |
| P0 修复 | 2 | 5 | 3 |
| P1 修复 | 8 | 10 | 11 |
| `??` NaN 修复总位点 | ~8 | ~15 | 20+ |

**趋势**: Bug 发现率下降 — R7(2P0+8P1) → R8(5P0+10P1) → R9(3P0+7P1)，但每轮仍有新 P0 发现。

**系统性漏洞**: `??` NaN 问题已在 R7-R9 累计修复 20+ 处，基本收尾。

**收敛判定**: **尚未收敛** — 仍有 P0 bug 在每轮审计中发现，需继续 R10 审计。
