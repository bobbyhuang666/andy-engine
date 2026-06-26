# Retrieve Probability Root-Cause Report (v2.2-W0e) — 最终根因报告

> 阶段：v2.2-W0e 诊断（非实现），**最终根因报告**（W0b/W0d 相关错误结论 superseded）
> 诊断脚本：`scripts/l4-retrieve-probability-diag.js`
> 基线 commit：`6672e15`（W0e 任务卡），基于 W1 partial（_nextId + counters 工作树改动保留未提交）
> 状态：**已闭环**（v2.2-W1 修复 presentations 完整持久化 + 运行时截断移除，commit `1de1176`）。此报告定位的 presentations 截断是 5 层根因的第 3-4 层，已修。L4 达标。本报告保留作诊断链审计痕迹，根因结论仍有效。

## 0. 摘要

W0e 定位 tick 67 leo retrieve 的 P 值分量差异。首个不同分量是 **baseLevelActivation**（mem_leo_97: full 6.511 vs restored 2.690）。

**最终根因（独立审计闭合，总规划师裁决采纳）**：

`PersonalMemory.toJSON()`（`PersonalMemory.js:1028`）对 `presentations` 使用 `slice(-20)` 截断，只持久化最近 20 条。运行时 `memory.presentations` 可远超 20 条（如 mem_leo_97 full 20 vs restored 22）。

`_baseLevelActivation` 实际遍历 `presentations` 计算 baseLevel（非仅依赖 accessCount）。restore 后 presentations 输入变少，baseLevel 改变，retrieve 选不同 memory，最终导致 emotion/valence/hash 漂移。

**这是 persistence fidelity 缺口，属于 v2.2 范围。**

### W0e v0.1 修正（审计 B1/B2/B3）

- **B1**：baseLevel 依赖 **presentations**（运行时遍历计算），不是 accessCount。accessCount 只是相关字段。
- **B2**：删除"retrieve 内部 memory 可见性矛盾"描述——那是 instrumentation 时机误判，非真实矛盾。
- **B3**：最终根因改为 `PersonalMemory.toJSON` 的 `presentations.slice(-20)` 截断。

## 1. 诊断方法

`scripts/l4-retrieve-probability-diag.js`：instrument `_baseLevelActivation` / `_spreadingActivation` / `_moodCongruence` / `_involuntaryRecall`，对 mem_leo_97 / mem_leo_185 / mem_leo_51 逐分量 dump。补充 instrument retrieve 前的 memory 字段状态。

## 2. P 分量对比（tick 67 leo retrieve）

### mem_leo_97（full 选，restored 不选）

| 分量 | full | restored | DIFF? |
|---|---|---|---|
| **baseLevel** | **6.51131670291219** | **2.6902116858195053** | **✗ 首个不同** |
| spreading | 0.4312102435154784 | 0.4312102435154784 | ✓ 一致 |
| moodCongruence | 0.03219469322905042 | 0.03219469322905042 | ✓ 一致 |
| involuntary | 0 | 0 | ✓ 一致 |
| emotionalBoost | 0.0048958897708830254 | 0 | ✗ DIFF |
| _now | 1788269700000 | 1788269700000 | ✓ 一致 |

### mem_leo_185（restored 选，full 不选）

| 分量 | full | restored | DIFF? |
|---|---|---|---|
| baseLevel | 2.8668165685484257 | 2.8668165685484257 | ✓ 一致 |
| 其他 | 全一致 | | |

### mem_leo_51（两边都选）

| 分量 | full | restored | DIFF? |
|---|---|---|---|
| baseLevel | 3.9843879689118618 | 3.9353022878013024 | ✗ DIFF |

## 3. memory 关键字段对比

### mem_leo_97

| 字段 | full | restored | DIFF? |
|---|---|---|---|
| importance | 1 | 1 | ✓ |
| **accessCount** | **1027** | **1026** | **✗ 差 1** |
| timestamp | 2026-09-01T12:00:00.000Z | 2026-09-01T12:00:00.000Z | ✓ |
| **lastAccessed** | **2026-09-01T13:35:00.000Z** | **2026-09-01T12:00:00.000Z** | **✗** |
| **presentations** | **20** | **22** | **✗** |

### mem_leo_185

| 字段 | full | restored | DIFF? |
|---|---|---|---|
| importance | 0.4181536484663758 | 0.4681536484663758 | ✗ |
| accessCount | 16 | 17 | ✗ |
| lastAccessed | 13:00 | 13:35 | ✗ |
| presentations | 16 | 17 | ✗ |

## 4. 八问题回答

### Q1 full/restored 中 mem_leo_97/185/51 的 P 分量分别是多少？
见 §2 表格。

### Q2 第一个不同分量是哪一个？
**baseLevelActivation**（mem_leo_97: full 6.511 vs restored 2.690）。

### Q3 该分量依赖哪个 memory 字段或 runtime state？
依赖 **presentations**（运行时遍历计算 baseLevel）。`_baseLevelActivation(memory, now)` 遍历 `memory.presentations` 计算激活度（accessCount 是相关字段，但 baseLevel 直接依赖 presentations 的完整内容与时间分布）。

**审计 B1 修正**：v0.1 称"依赖 accessCount"不准确。accessCount full 1027 vs restored 1026 的差异是 presentations 截断的下游表现——restore 后 presentations 输入变少，baseLevel 重算结果不同，retrieve 选不同 memory，被选 memory 的 accessCount 在后续 tick 更新次数不同（因果循环）。accessCount 差 1 是结果非原因。

### Q4 该字段是否被 toJSON/fromJSON 持久化？
**部分持久化，但被截断**。PersonalMemory.toJSON（`PersonalMemory.js:1028`）含 presentations，但用 `slice(-20)` 截断——只持久化最近 20 条。运行时 `memory.presentations` 可远超 20 条（mem_leo_97 full 20 vs restored 22，均经截断）。

**这是最终根因**：toJSON 截断 presentations，restore 后 baseLevel 计算输入变少，结果改变。修复方向：toJSON 不截断 presentations（完整持久化）。

### Q5 是否存在浮点末位差异被排序放大的问题？
**非主因**。baseLevel 差异 6.511 vs 2.690 是数量级差异（presentations 输入不同导致），非浮点末位。

### Q6 是否需要稳定 tie-breaker？
**不需要**。根因是 presentations 截断导致 baseLevel 输入不同，非排序 tie。修复 presentations 完整持久化后 baseLevel 一致，retrieve 选相同 memory。

### Q7 修复应属于 persistence fidelity，还是 simulation determinism hardening？
**persistence fidelity**。根因是 `PersonalMemory.toJSON` 的 `presentations.slice(-20)` 截断破坏 restore fidelity，属 runtimeSnapshot opaque payload 内部补全。修复 toJSON 不截断 presentations，属 v2.2 范围。
- 若是某未持久化 runtime state 导致 tick 67 retrieve 前访问次数不同 → 属 persistence fidelity

### Q8 修复是否触碰 Stable Envelope / public API / schemaVersion？
**待 Q7 闭合后定**。accessCount/lastAccessed 已持久化，若根因是 retrieve 访问历史累积，可能属 sim 行为非 persistence 缺口。

## 5. 最终根因（独立审计闭合，总规划师裁决采纳）

**PersonalMemory.toJSON 的 presentations.slice(-20) 截断**。

`PersonalMemory.js:1028`:
```js
presentations: m.presentations.slice(-20).map(t => t.toISOString()),
```

运行时 `memory.presentations` 可远超 20 条。`_baseLevelActivation` 遍历 presentations 计算 baseLevel。restore 后 presentations 输入变少，baseLevel 改变，retrieve 选不同 memory，传导至 emotion/valence/hash 漂移。

### 审计 B2 修正

v0.1 §5 描述的"retrieve 内部 memory 可见性矛盾"是 **instrumentation 时机误判**，非真实矛盾。删除该描述。retrieve 前 instrument 采不到 mem_leo_97 是 instrument 执行时机问题（beforeRetrieve 闭包在 retrieve 入口执行，但此时 this.memories 已含目标 memory——误判源于 instrument 逻辑），retrieve 内部 line 246 正常遍历。

### 因果链（最终闭合）

```
PersonalMemory.toJSON presentations.slice(-20) 截断
  → restore 后 presentations 输入变少（部分历史 presentation 丢失）
  → _baseLevelActivation 计算结果改变（mem_leo_97: full 6.511 vs restored 2.690）
  → retrieve top-K 选不同 memory（full [mem_leo_97, mem_leo_51] vs restored [mem_leo_51, mem_leo_185]）
  → recallEmotionDelta 不同（calm: full 0.0105 vs restored 0.0081）
  → MindWander applyEffect #15 effects.calm 分叉
  → anger/valence/behB 漂移
  → tickHash 分叉
```

## 6. W0b/W0d 相关结论 superseded

- **W0b**（REJECTED）：感知去重状态未持久化——错误，已作废。
- **W0d**：tick 66 "全字段一致"表述修正——当时 dump 未包含 presentations 完整内容（仅 len），不能称全字段一致。W0d 的 RNG 排除、emotion.tick 输入一致结论仍有效，但"全字段一致"应改为"已 dump 字段一致（未含 presentations 完整内容）"。
- **W0e v0.1**："accessCount 差 1 是根因"、"retrieve 内部可见性矛盾"——superseded，根因是 presentations 截断。

## 7. W1 修复范围（总规划师裁定）

W1 最终包含三层完整修复：

1. **EventDispatcher._nextId** 持久化/恢复（第一层，W0 根因）
2. **Agent._ticksSinceReflection / _ticksSinceDriftCheck** 持久化/恢复（第二层，W0c 根因）
3. **PersonalMemory.presentations 完整持久化**（第四层，W0e 最终根因）——toJSON 不截断为 20，完整序列化。

边界：runtimeSnapshot opaque payload 内部补全，不 bump schemaVersion，不改 Stable Envelope 顶层，不改 public API。未来若担心 payload 膨胀，另开压缩/摘要设计，当前不得用截断破坏 L4。

## 8. 证据复现

```bash
node scripts/l4-retrieve-probability-diag.js   # P 分量 + memory 字段对比
```

诊断基于 `6672e15`（W1 工作树改动保留），不改 production code。
