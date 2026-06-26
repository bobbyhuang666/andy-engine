# Retrieve Probability Root-Cause Report (v2.2-W0e)

> 阶段：v2.2-W0e 诊断（非实现）
> 诊断脚本：`scripts/l4-retrieve-probability-diag.js`
> 基线 commit：`6672e15`（W0e 任务卡），基于 W1 partial（_nextId + counters 工作树改动保留未提交）
> 状态：首个不同分量定位（baseLevel），依赖 accessCount，部分闭合，待独立审计复核

## 0. 摘要

W0e 定位 tick 67 leo retrieve 的 P 值分量差异。首个不同分量是 **baseLevelActivation**（mem_leo_97: full 6.511 vs restored 2.690），依赖 **accessCount**（full 1027 vs restored 1026，差 1）。

但 accessCount 差异的精确上游未完全闭合：retrieve 调用前 `this.memories` 中 mem_leo_97 不可见（instrument 返回 undefined），但 retrieve 返回了它并显示 accessCount 差 1。存在 retrieve 内部 memory 可见性矛盾，需进一步诊断。

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
依赖 **accessCount** + 距 lastAccessed 时间差。`_baseLevelActivation(memory, now)` 用 accessCount 与时间衰减计算。mem_leo_97 accessCount 差 1（full 1027 vs restored 1026）。

### Q4 该字段是否被 toJSON/fromJSON 持久化？
**是**。PersonalMemory.toJSON（line 1019-1035）含 accessCount / lastAccessed / presentations。恢复后正确还原（tick 66 全字段一致佐证）。

### Q5 是否存在浮点末位差异被排序放大的问题？
**非主因**。baseLevel 差异 6.511 vs 2.690 是数量级差异（accessCount 1027 vs 1026 的指数衰减），非浮点末位。但 accessCount 差 1 经 baseLevel 的对数/幂运算放大到 P 值，再经 top-K 排序选不同 memory，是放大效应。

### Q6 是否需要稳定 tie-breaker？
**未证实**。当前 baseLevel 差异非末位浮点，是 accessCount 差 1 的真实差异。tie-breaker 不解决 accessCount 差异。

### Q7 修复应属于 persistence fidelity，还是 simulation determinism hardening？
**待定**。accessCount 差 1 的来源未完全闭合：
- 若是 retrieve 副作用（retrieve 返回时更新 accessCount，full 与 restored 在 tick 67 前的 retrieve 访问次数不同）→ 属 simulation determinism（retrieve 访问历史累积差异）
- 若是某未持久化 runtime state 导致 tick 67 retrieve 前访问次数不同 → 属 persistence fidelity

### Q8 修复是否触碰 Stable Envelope / public API / schemaVersion？
**待 Q7 闭合后定**。accessCount/lastAccessed 已持久化，若根因是 retrieve 访问历史累积，可能属 sim 行为非 persistence 缺口。

## 5. 未完全闭合点

### accessCount 差 1 的精确上游

instrument retrieve 前的 `this.memories` 显示 mem_leo_97 / mem_leo_185 **不可见**（undefined），但 retrieve 返回了它们并显示 accessCount 差 1。存在矛盾：

- 矛盾 A：retrieve 前遍历 this.memories 找不到 mem_leo_97，但 retrieve 内部 line 246 `for (const memory of this.memories)` 遍历却能访问并计算 baseLevel。
- 可能：instrument 时机问题（beforeRetrieve 在 retrieve 函数入口采，但 this.memories 此时不 mem_leo_97？）或 retrieve 内部修改 this.memories。

### 因果循环风险

retrieve 选不同 memory → 更新被选 memory 的 accessCount → 下次 retrieve baseLevel 受 accessCount 影响 → 又选不同。首个 accessCount 差 1 的起源（tick 67 前某 tick 的 retrieve 访问差异）未定位。

## 6. 候选根因方向（待审计/总规划师裁定）

1. **retrieve 访问历史累积**：tick 67 前某 tick（可能 tick 60 consolidate 后）retrieve 访问了不同 memory，accessCount 累积差异。属 simulation determinism（retrieve 访问顺序的确定性）。
2. **retrieve 内部 memory 可见性**：retrieve 前 this.memories 不含 mem_leo_97，但 retrieve 访问了它——可能 retrieve 内部有 memory 重建/恢复路径未持久化。
3. **baseLevel 计算的 accessCount 读取时机**：retrieve 计算 baseLevel 时读的 accessCount 可能是 retrieve 内部某步更新后的值，full 与 restored 更新步数不同。

## 7. 待总规划师/审计裁定

1. accessCount 差 1 属 persistence fidelity 还是 simulation determinism？
2. 是否需 W0f 深挖 retrieve 内部 memory 可见性矛盾 + accessCount 更新时机？
3. 若属 simulation determinism（retrieve 访问历史），是否超出 v2.2 persistence fidelity 范围，降级 v2.3？
4. 当前 _nextId + counters + L4 仍 fail（tick 67），是否接受当前两层修复 + L4 降级 v2.3？

## 8. 证据复现

```bash
node scripts/l4-retrieve-probability-diag.js   # P 分量 + memory 字段对比
```

诊断基于 `6672e15`（W1 工作树改动保留），不改 production code。
