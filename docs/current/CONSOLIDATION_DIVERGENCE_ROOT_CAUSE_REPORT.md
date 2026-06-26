# Consolidation Divergence Root-Cause Report (v2.2-W0f) — 最终根因报告

> 阶段：v2.2-W0f 诊断（非实现），**最终根因报告**（最后一轮 L4 诊断）
> 诊断脚本：`scripts/l4-consolidation-divergence-diag.js`
> 基线 commit：`6c2e6f9`（W0f 任务卡），基于 W1 partial（4 层修复工作树改动保留未提交）
> 状态：第六层根因闭合。`memory.appraisal` 未持久化。

## 0. 摘要

W0f 定位 tick 60 consolidate 合并 pair 差异的精确根因：**`memory.appraisal` 未持久化**。

`PersonalMemory.toJSON`（W1 修改版）不含 `appraisal` 字段。restore 后 memory.appraisal=null。`_memorySimilarity`（line 965-974）用 appraisal 计算 similarity 分量（appraisalSim），appraisal 为 null 时跳过该分量，导致 full（有 appraisal）与 restored（无 appraisal）的 similarity 不同，consolidate 合并 pair 不同，memory 数量/内容分叉，L4 fail。

**这是 persistence fidelity 缺口，属于 v2.2 范围。** 修复：toJSON 加 `appraisal` 字段。

## 1. 诊断方法

`scripts/l4-consolidation-divergence-diag.js`：instrument `consolidate`（merge pair + beforeOrder）+ `_memorySimilarity`（分数 + 字段），对比 full vs restored tick 60-84。

补充：instrument consolidate 前的 mem_leo_1/mem_leo_21 完整字段（content/cat/emoTag/semCat/appraisal）。

## 2. 关键证据

### consolidate call #4（tick 60）首个分叉

- beforeOrder 前 10 **完全一致**（memory 数组顺序一致）
- merges 数量一致（67）但 **merge pair 不同**：
  - full: `mem_leo_19 kept, mem_leo_141/154/169/183 removed`
  - restored: `mem_leo_34 kept, mem_leo_103 removed`（不同 pair）

### similarity 首个不同 #435

- full: mem_leo_1 vs mem_leo_21 sim=**0.4756**
- restored: mem_leo_1 vs mem_leo_21 sim=**0.3954**
- importance 一致（aImp/bImp 全等）

### mem_leo_1/mem_leo_21 字段对比（tick 60 consolidate 前）

| 字段 | full | restored | 一致? |
|---|---|---|---|
| content | 路过了一个卖唱的人 | 路过了一个卖唱的人 | ✓ |
| category | random | random | ✓ |
| emotionTag | neutral / happy | neutral / happy | ✓ |
| semanticCategory | 居家生活 / 社交互动 | 居家生活 / 社交互动 | ✓ |
| **appraisal** | **有值**（valence/suddenness/goalRelevance...） | **null** | **✗ 未持久化** |

## 3. 八问题回答

### Q1 第一次不同的 consolidate tick 是多少？
**tick 60**（consolidate call #4，simTime 13:00）。

### Q2 第一个不同的 merge pair 是什么？
full: `mem_leo_19 kept, mem_leo_141 removed`；restored: `mem_leo_34 kept, mem_leo_103 removed`（首个 pair 即不同）。

### Q3 pair 差异由哪个评分分量导致？
**appraisal 相似度分量**（`_memorySimilarity` line 965-974）。appraisal 为 null 时跳过该分量，similarity 总分不同。

### Q4 该分量依赖的字段是否被 toJSON/fromJSON 持久化？
**否**。`memory.appraisal` 未在 `PersonalMemory.toJSON` 输出。addExperience 时存（line 186 `appraisal: event._appraisal`），但 toJSON 丢弃。restore 后 appraisal=null。

### Q5 full/restored 的 memory array order 是否一致？
**一致**（beforeOrder 前 10 完全相同）。

### Q6 RNG draw 是否一致？
**一致**（consolidate 不用 RNG；_memorySimilarity 纯函数，无 RNG）。similarity 差异来自输入字段（appraisal），非 RNG。

### Q7 是否是浮点/排序稳定性问题？
**否**。similarity 差异 0.4756 vs 0.3954 是 appraisal 分量缺失导致（非浮点末位）。memory order 一致（非排序稳定性）。

### Q8 修复属于 persistence fidelity，还是 simulation determinism hardening？
**persistence fidelity**。`memory.appraisal` 未持久化，属 runtimeSnapshot opaque payload 内部补全。修复 toJSON 加 `appraisal` 字段，属 v2.2 范围。

## 4. 修复方向（纳入 W1）

`PersonalMemory.toJSON` 增加 `appraisal` 字段：

```js
appraisal: m.appraisal || null,
```

`fromJSON` 恢复路径（line 56 `this.memories = memArray.map(m => ({...m, ...}))`）已用 spread 恢复 appraisal（若 toJSON 输出则自动还原）。属 runtimeSnapshot 内部补全，不 bump schemaVersion，不改 Stable Envelope 顶层。

## 5. 同类风险审计（memory 字段完整性）

W0f 揭示 toJSON 字段完整性缺口。审计 PersonalMemory.toJSON（W1 修改版）全部字段 vs memory 运行时字段：

| 字段 | toJSON 输出 | 运行时 | 风险 |
|---|---|---|---|
| id/content/category/emotionTag/importance | ✓ | ✓ | 无 |
| timestamp/lastAccessed/presentations/accessCount | ✓（W1 修） | ✓ | 无 |
| associations/eventId/emotionSnapshot/semanticCategory | ✓ | ✓ | 无 |
| **appraisal** | **✗ 缺失** | ✓ | **高（本根因）** |

修复 appraisal 后，toJSON 字段与运行时 memory 字段完全对齐。

## 6. 证据复现

```bash
node scripts/l4-consolidation-divergence-diag.js   # consolidate merge pair + similarity 对比
```

诊断基于 `6c2e6f9`（W1 4 层修复工作树改动保留），不改 production code。
