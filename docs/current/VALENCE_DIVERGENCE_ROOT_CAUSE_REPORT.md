# Valence Divergence Root-Cause Report (v2.2-W0d)

> 阶段：v2.2-W0d 诊断（非实现）
> 诊断脚本：`scripts/l4-valence-divergence-diag.js`
> 基线 commit：`e1f0ac5`（W0d 任务卡），基于 W1 partial（_nextId + counters 工作树改动保留未提交）
> 状态：根因缩窄到 memory retrieve 选择差异，部分闭合，待独立审计复核

## 0. 摘要

W0d 定位 tick 67 valence 分叉的精确传导链：

```
tick 66 两边完全一致（含 emotion/memory/behB 全字段）
  → tick 67 emotion.tick 输入一致 + RNG draw 序列一致（179 次全等）
  → applyEffect #15 effects 分叉（calm: full 0.0105 vs restored 0.0081）
  → effects 来自 MindWanderRuntime.mindWander 的 recallEmotionDelta
  → recallEmotionDelta 来自 PersonalMemory.retrieve
  → retrieve 选的 memory 不同（full [mem_leo_97, mem_leo_51] vs restored [mem_leo_51, mem_leo_185]）
```

根因缩窄到：**memory retrieve 在 tick 67 选了不同 memory**（检索选择差异），导致 recallEmotionDelta 不同，传导至 emotion effect → valence → behB。

retrieve 选择差异的精确机制（排序输入 / memory 数组顺序 / 缓存状态）**未完全闭合**，但已排除 RNG 消耗路径缺口与 emotion runtime state 缺口。

## 1. 诊断方法

`scripts/l4-valence-divergence-diag.js`：instrument RNG.next / emotion.tick / applyEffect / memory.retrieve，逐层对比 tick 67 full vs restored。

## 2. 逐层排除证据

| 层 | 结论 | 证据 |
|---|---|---|
| tick 66 全字段一致 | ✓ 一致 | behB/valence/joy/anger/sadness/fear/interest/excitement/drive/socialEnergy/memLen/tsr 全等 |
| tick 67 RNG draw 序列 | ✓ 一致 | 179 次 draw 全等，无首个不同 draw |
| tick 67 emotion.tick 输入 | ✓ 一致 | hoursElapsed/hourOfDay/contagionInputs 2 调用全等 |
| tick 67 applyEffect #15 effects | ✗ 分叉 | calm: full 0.0105 vs restored 0.008106691418098692 |
| MindWander recallEmotionDelta 来源 | retrieve 返回 | delta 来自 memory.retrieve |
| memory.retrieve 返回 memory | ✗ 选择不同 | full [mem_leo_97, mem_leo_51] vs restored [mem_leo_51, mem_leo_185] |

## 3. 八问题回答

### Q1 tick 66 完全一致是否已由 dump 证实？
**是**。dump 含 emotion 全维度（joy/sadness/anger/fear/interest/excitement）、behB、valence、drive、socialEnergy、memLen、tsr 全字段，全等。

### Q2 tick 67 的第一个分叉字段到底是 valence，还是 valence 之前的某个隐藏字段？
**valence 之前的隐藏字段**：applyEffect #15 的 effects.calm 分叉（full 0.0105 vs restored 0.0081），传导至 anger（decay 后）→ valence（加权）→ behB。calm 是首个分叉字段，valence 是传导后果。

### Q3 Leo 在 tick 67 前后是否触发 consolidate / recall / regulation / appraisal？
tick 67 触发：memory.retrieve（MindWander 调用，返回 recallEmotionDelta）+ applyEffect（16 次，#15 分叉）。consolidate 在 tick 60 触发（tsr 达 12），tick 67 不触发。regulation/appraisal 经 applyEffect 路径。

### Q4 两边 RNG draw 序列是否完全一致？
**完全一致**。179 次 draw 全等，无首个不同 draw。排除 RNG 消耗路径缺口。

### Q5 PersonalMemory.consolidate 内部合并 pair/noise/similarity/importance 是否一致？
tick 67 不触发 consolidate（tsr=7 < 12）。tick 60 两边触发（tsr 达 12），但 tick 66 全字段一致说明 tick 60 consolidate 结果一致。**consolidate 非本分叉源**。

### Q6 memory entry 的 accessCount/lastAccessed/presentations/activation/timestamp 是否完整持久化？
**已持久化**。PersonalMemory.toJSON（line 1019-1035）含 accessCount/lastAccessed/presentations/timestamp/emotionSnapshot/importance 全字段。恢复后这些字段正确还原（tick 66 全字段一致佐证）。

### Q7 valence 更新由哪个函数触发，输入是否一致？
valence 由 getValence（emotion 各维度加权和）计算。分叉源在 applyEffect #15 effects.calm，effects 来自 MindWanderRuntime.mindWander 的 recallEmotionDelta，recallEmotionDelta 来自 memory.retrieve。**retrieve 输入（retrieveContext）一致，但返回的 memory 选择不同**。

### Q8 这是 memory runtime state 缺口、emotion runtime state 缺口，还是 RNG 消耗路径缺口？
**已排除 RNG 消耗路径缺口与 emotion runtime state 缺口**。缩窄到 **memory retrieve 选择差异**——retrieve 在相同输入下返回不同 memory 集合。最可能是 retrieve 排序依赖某未持久化状态（如 _tickCache 内部缓存，或 memory 数组顺序在 consolidate 后差异），但精确机制未完全闭合。

## 4. 未完全闭合点

retrieve 选择差异的精确机制：
- retrieve 返回 top-K memory（按 importance/similarity 排序）
- full 选 [mem_leo_97, mem_leo_51]（imp 都=1）
- restored 选 [mem_leo_51, mem_leo_185]（imp 1 和 0.468）

同一 retrieveContext，选不同 memory 说明排序输入不同。候选：
1. **memory 数组顺序**：consolidate（tick 60）sort by importance，若 restored 排序结果与 full 不同（浮点比较稳定性？同 importance 的顺序？），retrieve top-K 选不同。
2. **_tickCache**：PersonalMemory._tickCache（line 47）/ _tickCacheTick（line 48）未持久化，retrieve 用其缓存，恢复后重算路径可能不同。
3. **retrieve 内部排序状态**：retrieve 可能用 _rng（已持久化）或某访问历史影响排序。

## 5. 修复方向建议（非实现）

- 优先验证候选 1：dump tick 60 consolidate 后的 memory 数组顺序（full vs restored），看同 importance 的 memory 顺序是否不同。若是，consolidate sort 需稳定排序（secondary key）。
- 验证候选 2：dump retrieve 调用时的 _tickCache 状态。
- 若是 _tickCache 未持久化：属 runtimeSnapshot 内部补全（PersonalMemory.toJSON 加 _tickCache）。

## 6. 待总规划师/审计裁定

1. 是否需 W0e 深挖 retrieve 排序机制（候选 1/2/3 哪个是真因）？
2. 若是 _tickCache 未持久化，是否纳入 W1 扩展（同 _nextId/counters 一类 runtime state restore）？
3. 若是 consolidate sort 稳定性问题，属 sim 行为 bug 非 persistence 缺口，修复方向不同。

## 7. 证据复现

```bash
node scripts/l4-valence-divergence-diag.js   # RNG draw + applyEffect + retrieve 对比
```

诊断基于 `e1f0ac5`（W1 工作树改动保留），不改 production code。
