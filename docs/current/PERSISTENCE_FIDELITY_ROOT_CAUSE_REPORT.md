# Persistence Fidelity Root-Cause Report (v2.2-W0)

> 阶段：v2.2-W0 诊断（非实现）
> 诊断脚本：`scripts/l4-divergence-diag.js`
> 基线 commit：`f1b7dbb`（W0 任务卡）基于 `4287b06`（RFC v0.2）
> 状态：**已闭环**（v2.2-W1 修复 _nextId 持久化，commit `1de1176`）。此报告定位的 _nextId 是 5 层根因的第 1 层；后续 W0c/W0e/W0f 定位第 2-5 层，全部经 v2.2-W1 修复，L4 达标。本报告保留作诊断链审计痕迹，根因结论仍有效（_nextId 未持久化是真实缺陷，已修）。

## 0. 摘要

W0 逐 tick dump 诊断定位 L4 漂移的**根因字段**：`EventDispatcher._nextId` 未持久化，是恢复点 tick 50 的**唯一**分叉字段（full=72, restored=0，其余字段含 RNG/pendingEvents/_scheduledEvents/agent 标量全一致）。

W6 原诊断"toWorldState 丢失累积 memory"**已被推翻**（memory 序列化正常）。v2.2 RFC v0.2 的"EventDispatcher 运行期结构未持久化是真实缺陷但 L4 根因待确认"——**现已确认根因字段为 `EventDispatcher._nextId`**（pendingEvents / _scheduledEvents 经 dump 证实恢复点末尾为空，非本场景分叉源）。

**审计 B1 修正（v0.2）**：本报告 v0.1 的因果链传导机制描述（"memory id 重复/错位"）**经独立审计证伪**——memory id 来自 `PersonalMemory._nextMemId`（独立计数器，已持久化），不来自 event id；tick 51 dump 显示 full 与 restored 的 memIds 完全一致。传导链未完全闭合，但 `_nextId` 是恢复点唯一分叉字段这一点已铁证（dump 实测 diff=1）。W1 修复 `_nextId` 持久化后，L4 主测试 pass 即端到端闭环验证，不强制要求传导链理论完全闭合。

## 1. 诊断方法

`scripts/l4-divergence-diag.js`：

1. full run（seed42/100ticks），逐 tick 采状态快照 `fullSnaps[0..99]`。
2. restored run（tick 50 序列化→`fromWorldState` 恢复→续跑到 100），逐 tick 采 `restoredSnaps[50..99]`。
3. 逐 tick 字段级 diff，定位首个分叉 tick + 字段。
4. dump 分叉 tick 的 EventDispatcher 内部（pendingEvents / _nextId / _scheduledEvents）+ RNG state + agent memory ids。

每 tick 采字段：tick / time / rngState / edPendingLen+Ids / edNextId / edEventLogLen / scheduledLen+Keys / maya(leo) agentSnap（position/state/memLen/memIds/emotionJoy/behB/socialEnergy/health）/ socialEdges。

## 2. 首个分叉点

- **首个分叉 tick**：50（恢复点首 tick，即 restore 后第一个采样的 tick）
- **首个分叉字段**：`edNextId`
  - full = 72
  - restored = 0
- **分叉前 RNG state 一致性**：恢复点 tick 50 两侧 RNG = `474234797`，**一致** ✓

## 3. 分叉源分析

### 3.1 EventDispatcher 字段分叉顺序

逐字段 dump tick 50：

| 字段 | full | restored | 分叉? |
|---|---|---|---|
| rngState | 474234797 | 474234797 | 否（一致） |
| edPendingLen | 0 | 0 | 否（恢复点末尾无 pending） |
| edPendingIds | (空) | (空) | 否 |
| **edNextId** | **72** | **0** | **是（首个分叉源）** |
| scheduledLen | 0 | 0 | 否（恢复点末尾无 scheduled） |
| scheduledKeys | (空) | (空) | 否 |
| maya position/state/memLen | 一致 | 一致 | 否 |
| socialEdges | 一致 | 一致 | 否 |

**结论**：首个分叉源是 `EventDispatcher._nextId`，**不是** pendingEvents / _scheduledEvents。

### 3.2 _scheduledEvents 是否参与

dump tick 47-49（恢复点前）+ tick 50：`scheduledLen` 全程 = 0。**_scheduledEvents 未参与 L4 分叉**（恢复点末尾无调度事件）。

### 3.3 因果链（审计 B1 修正：传导未完全闭合，_nextId 是唯一分叉字段）

**审计 B1 证伪**：本报告 v0.1 曾声称"memory id 重复/错位"为传导机制，经独立审计证伪：

- memory id 来自 `PersonalMemory._nextMemId`（`PersonalMemory.js:163` `mem_${agentId}_${_nextMemId++}`），独立计数器，**已持久化**（`:51` nextDynamicMemoryId 从 restored memories 推算）。
- event id 来自 `EventDispatcher._nextId`（`EventDispatcher.js:83` `evt_${_nextId++}`），两套独立计数器。
- tick 51 dump 显示 full 与 restored 的 maya/leo memIds **完全一致**，无重复无错位。

**真实传导链（未完全闭合）**：

- `addExperience`（`PersonalMemory.js:183`）将 `eventId: event.id` 存入 memory。event id 冲突使 memory.eventId 指向与 full 不同的事件。
- 审计建议的 `getEventChain` 路径经核实真实方法名为 `getCausalChain`（`EventDispatcher.js:473`），**未被任何 production tick 流程或测试调用**（grep 全仓无调用点），非传导路径。
- 真实传导更可能在 eventLog 内部检索/去重/event 处理顺序，但**未完全定位**。

**漂移渐进性（实测，审计修正时间点）**：

- tick 51：edNextId 分叉（73 vs 1），但 emotionJoy/memIds/behB/socialEnergy **全一致**。
- tick 61：emotionJoy 首次末位差异（full=0.341041041 vs restored=0.341015398）——**审计修正**：v0.1 说"~tick 63 显化"不准确，emotionJoy 从 tick 61 起漂移。
- tick 63：emotionJoy 差异扩大，leo memIds 出现集合差异。

**诚实声明**：传导链（_nextId 冲突 → ... → emotion 渐变）的中间环节未完全闭合。但 **`_nextId` 是恢复点 tick 50 的唯一分叉字段**（dump 实测 diff=1，其余字段全一致），这一点已铁证。W1 修复 `_nextId` 持久化后，L4 主测试续跑段 hash 一致即为端到端闭环验证，比因果链理论分析更有力。审计明确：传导链未完全闭合**不阻塞** W1，修复正确性由 L4 主测试 pass 验证。

## 4. 七问题回答

### Q1 首个分叉 tick
**50**（恢复点首 tick）。

### Q2 首个分叉字段
**`EventDispatcher._nextId`**（full=72, restored=0）。

### Q3 分叉前 RNG state 是否一致
**一致**。恢复点 tick 50 两侧 RNG = `474234797`。

### Q4 分叉是否由 EventDispatcher 导致
**是**。首个分叉源是 `EventDispatcher._nextId` 未持久化。pendingEvents / _scheduledEvents 经 dump 证实恢复点末尾为空，非分叉源。

### Q5 是否存在其他未持久化 runtime state 参与分叉
**当前 L4 场景无**。审计 §1.4 的 4 项同类风险逐一验证：

| state | 恢复点末尾状态 | 参与分叉? |
|---|---|---|
| EventDispatcher.pendingEvents | 0（空） | 否 |
| EventDispatcher._nextId | full=72, restored=0 | **是（根因）** |
| EventDispatcher.eventIndex | 未独立 dump，但随 eventLog 重建，非独立分叉源 | 否（依赖 _nextId 修复后自动正确） |
| AndyWorld._scheduledEvents | 0（空） | 否 |

**注意**：pendingEvents / _scheduledEvents 在本 L4 场景（seed42/100ticks/恢复点 tick 50）末尾为空，故未参与分叉。但它们仍是真实缺陷——若恢复点末尾非空（其他 seed/tick 配置），可能成为分叉源。修复时应一并持久化（防御性）。

### Q6 修复是否仍需要 schemaVersion bump
**视修复范围，倾向需要**（待总规划师确认）。

- `_nextId` 当前不进 `engine.toJSON()` 输出（EventDispatcher.toJSON 只持久化 eventLog）。
- 修复需在 EventDispatcher.toJSON 增加 `_nextId` 字段，进入 runtimeSnapshot（engine.toJSON 输出）。
- runtimeSnapshot 是 public persistence contract 的一部分（AndyEngine.fromJSON 消费）。
- 新增字段 → 旧消费者不识别（向后兼容）→ 建议 schemaVersion bump 0.1.0→0.2.0 + migration（_nextId 从 eventLog 最大 id 推算）。
- 但若总规划师判断"_nextId 是 runtimeSnapshot opaque payload 内部补全，不触及 envelope 顶层"，可不 bump schemaVersion（仅 runtimeSnapshot 内部扩展）。**此判断触及 Stable Envelope / public contract 边界，回总规划师确认。**

### Q7 哪些测试应改写，哪些旧诊断应删除

**应删除/改写**：
- `tests/unit/replay-trust-l4.test.js` 的"W6 诊断测试"（断言"envelope runtimeSnapshot.memory.memories 为空"）——基于错误前提，删除。

**应保留（改写为 regression test）**：
- 保留一个 regression test：memory 是 array，且 `toWorldState` / `engine.toJSON` 序列化正常（证明 W6 旧根因已推翻）。

**应新增**：
- 真正根因 regression test：`EventDispatcher._nextId` 在 toWorldState/fromWorldState 后保持一致（当前 fail，修复后 pass）。
- L4 主测试（取消 skip）：续跑段 hash 与全程一致（修复后 pass）。

**W6 错误诊断测试处理时机**：W0 完成（本报告）后即可删除/改写，不等 W1 修复。但 L4 主测试 skip 状态保留至 W1 修复后取消。

## 5. 修复方向建议（非实现，待 W1）

- **核心修复**：`EventDispatcher.toJSON()` 增加 `_nextId` 持久化；`fromJSON` 恢复。
- **防御性修复**（虽非本场景根因，但同类风险，审计 S3 支持）：`pendingEvents` / `eventIndex` 持久化；`AndyWorld._scheduledEvents` 持久化。
- **migration**：旧存档（0.1.0）_nextId 从 eventLog 最大 id 推算（best-effort）。
- **schemaVersion**：审计 S1 建议按 best-effort 取向**不 bump**——_nextId 缺失时 fromJSON 默认 0（旧消费者不识别不报错），migration 从 eventLog 推算作为 0.1.0 的 best-effort 恢复增强。是否 bump 取决于"是否承诺 0.1.0 存档恢复后 L4 hash 一致"——若 best-effort 不承诺则不 bump。**待总规划师按 best-effort 取向裁定。**
- **L4 测试**：取消 skip，断言续跑段 hash 一致（W1 修复后 pass 即端到端闭环验证）。

## 6. W6 错误诊断测试处理

- `tests/unit/replay-trust-l4.test.js` 文件头"W6 实测结论"基于错误根因（memory 丢失），需改写。
- 诊断测试（断言 envelope memory.memories 为空）基于错误路径，删除。
- 可保留：memory 是 array 且序列化正常的 regression test。

## 7. 待总规划师裁定

1. `EventDispatcher._nextId` 持久化是否需要 schemaVersion bump？审计 S1 建议**不 bump**（best-effort：_nextId 缺失时 fromJSON 默认 0 不报错，migration 从 eventLog 推算作 0.1.0 恢复增强）。是否承诺 0.1.0 存档恢复后 L4 hash 一致？若不承诺（best-effort）则不 bump。**待总规划师按 best-effort 取向裁定。**
2. 防御性修复（pendingEvents / eventIndex / _scheduledEvents）是否一并纳入 W1，还是仅修 _nextId？（审计 S3 支持防御性一并）
3. W6 错误诊断测试是否在 W0 后立即处理（删除/改写，审计 S2 支持），还是等 W1 修复时一并？L4 主测试取消 skip 应等 W1 修复 + 传导链闭合后。
4. golden fixture 是否需重生成？若不 bump schemaVersion 且 _nextId 不进 tickHash（HASHED_FIELDS 不含 eventLog 内部），fixture 可能无需重生成——待 W1 实测确认。

## 8. 证据复现

```bash
node scripts/l4-divergence-diag.js          # 首个分叉 tick + 字段
node scripts/l4-divergence-diag.js --tick 51 # dump tick 51 因果链
```

诊断脚本基于 `f1b7dbb`（W0 任务卡），不改 production code。
