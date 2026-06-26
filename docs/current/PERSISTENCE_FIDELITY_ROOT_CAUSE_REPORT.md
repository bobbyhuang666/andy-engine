# Persistence Fidelity Root-Cause Report (v2.2-W0)

> 阶段：v2.2-W0 诊断（非实现）
> 诊断脚本：`scripts/l4-divergence-diag.js`
> 基线 commit：`f1b7dbb`（W0 任务卡）基于 `4287b06`（RFC v0.2）
> 状态：证据链闭合，待独立审计复核

## 0. 摘要

W0 逐 tick dump 诊断**已闭合根因证据链**。L4 漂移精确根因是：`EventDispatcher._nextId` 未持久化，restore 后从 0 重新计数，导致续跑首 tick 生成的 event id 与既有 eventLog id 冲突，进而 memory id 重复、memory 内容渐变，累积影响 agent 标量进入 tickHash 覆盖字段（~tick 63 显化）。

W6 原诊断"toWorldState 丢失累积 memory"**已被推翻**（memory 序列化正常）。v2.2 RFC v0.2 的"EventDispatcher 运行期结构未持久化是真实缺陷但 L4 根因待确认"——**现已确认根因为 `EventDispatcher._nextId`**（pendingEvents / _scheduledEvents 经 dump 证实恢复点末尾为空，非分叉源）。

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

### 3.3 因果链（_nextId → memory 渐变 → hash 漂移）

dump tick 51 证据：

| | full | restored |
|---|---|---|
| edNextId | 73 | 1 |
| edEventLogLen | 73 | 73（长度一致，但 id 不同） |
| maya memIds | `mem_maya_72, mem_maya_73, ... mem_maya_100` | （id 从 1 重新生成，与既有冲突） |

- restored 续跑首 tick 生成 event id = 0+1 = 1（因 _nextId 重置为 0）。
- 既有 eventLog 已含 id 0-71，新 event id 0/1 与既有冲突。
- event 驱动的 memory 生成使用重复 event id，memory id（如 `mem_maya_72`）重复或错位。
- memory 内容/顺序渐变 → recall emotion delta 渐变 → emotion/behaviorField 漂移。
- 累积到 ~tick 63，agent 标量（emotion/behaviorField/position）进入 tickHash 覆盖字段（HASHED_FIELDS），hash 显化漂移。

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
- **防御性修复**（虽非本场景根因，但同类风险）：`pendingEvents` / `eventIndex` 持久化；`AndyWorld._scheduledEvents` 持久化。
- **migration**：旧存档（0.1.0）_nextId 从 eventLog 最大 id 推算（best-effort）。
- **schemaVersion**：倾向 bump 0.1.0→0.2.0，但属边界判断，待总规划师确认。
- **L4 测试**：取消 skip，断言续跑段 hash 一致。

## 6. W6 错误诊断测试处理

- `tests/unit/replay-trust-l4.test.js` 文件头"W6 实测结论"基于错误根因（memory 丢失），需改写。
- 诊断测试（断言 envelope memory.memories 为空）基于错误路径，删除。
- 可保留：memory 是 array 且序列化正常的 regression test。

## 7. 待总规划师裁定

1. `EventDispatcher._nextId` 持久化是否需要 schemaVersion bump？（边界判断：runtimeSnapshot opaque payload 内部补全 vs public contract 变更）
2. 防御性修复（pendingEvents / eventIndex / _scheduledEvents）是否一并纳入 W1，还是仅修 _nextId？
3. W6 错误诊断测试是否在 W0 后立即处理（删除/改写），还是等 W1 修复时一并？
4. golden fixture 是否需重生成（若 schemaVersion bump）？

## 8. 证据复现

```bash
node scripts/l4-divergence-diag.js          # 首个分叉 tick + 字段
node scripts/l4-divergence-diag.js --tick 51 # dump tick 51 因果链
```

诊断脚本基于 `f1b7dbb`（W0 任务卡），不改 production code。
