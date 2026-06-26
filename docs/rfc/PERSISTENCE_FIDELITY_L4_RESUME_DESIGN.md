# Persistence Fidelity / L4 Resume Design RFC

> 状态：v2.2 设计草案，待独立审计。仅文档，无实现。
> 触及边界：**是**——本 RFC 判断的修复方向可能触及 Stable World Envelope / public persistence contract，需总规划师确认。
> 来源：W6 L4 截断续跑降级 v2.2（REPLAY_TRUST_ROADMAP §7/§9），World Kernel Trust Phase 总规划师裁定当前不修复，先产出设计说明。

## 0. 摘要

W6 原诊断"toWorldState 丢失累积 memory"**不成立**——v2.2 根因深挖发现 memory 序列化正常。真实根因是 **restore 语义不完整**：`EventDispatcher.toJSON()` 只持久化 `eventLog`，不持久化运行期结构（`pendingEvents` / `_nextId` / `eventIndex`），导致续跑行为渐变。本 RFC 判断修复是否触及 Stable Envelope，给出兼容策略与验收标准。

---

## 1. W6 根因复盘

### 1.1 W6 原诊断与 v2.2 修正

| 项 | W6 原诊断 | v2.2 深挖修正 |
|---|---|---|
| 丢失的 state | toWorldState 丢失累积 memory | **错误**。`engine.toJSON().agents.maya.memory` 正确序列化（tick 50 时 18 条，array 形态） |
| envelope 检查路径 | 读 `runtimeSnapshot.agents.maya.memory.memories` | **路径错误**。memory 在 toJSON 里是 **array**（非 `{memories:[]}` 嵌套），W6 诊断脚本多读了一层 `.memories` |
| 真实根因 | memory 序列化缺失 | **restore 语义不完整**（见 §1.2） |

W6 诊断脚本 `tests/unit/replay-trust-l4.test.js` 的"诊断测试"基于错误前提——它断言 `envelope runtimeSnapshot.memory.memories 为空`，实际是路径错误导致读到 undefined。该诊断测试需在 v2.2 修正（取消基于错误前提的断言）。

### 1.2 真实根因：restore 语义不完整

L4 实测：续跑段 tick 50-62 hash 一致，tick 63（或 66，随环境微偏）起漂移。恢复点 tick 50 的 memory / RNG / agent 标量状态均一致，但续跑后行为渐变：

- full @66 maya memory = 64，restored @66 = 63（少 1 条）
- emotion 微差（memory 差异触发不同 recall emotion delta）
- tickHash（不含 memory）在多数 tick 一致，间歇性 mismatch

根因定位（`src/runtime/EventDispatcher.js`）：

```text
EventDispatcher.toJSON() (line 563)
  - 持久化：eventLog（最近 100 条）
  - 不持久化：pendingEvents / _nextId / eventIndex
  - 源码注释（line 574）明确："toJSON 只持久化最近 100 条 eventLog；
    _nextId / eventIndex 等运行期结构不持久化"
```

`pendingEvents`（line 29）在 `dispatch()`（line 425）中被清空。若 tick 流程末尾 pendingEvents 非空（有待下 tick dispatch 的 event），restore 后这些 pending 丢失，导致续跑首个 tick 行为偏移，进而 RNG 消耗路径分叉，memory 生成逐步偏离。

### 1.3 为何 tick 63/66 才漂移（非 tick 51 即刻）

漂移是**累积性渐变**而非即刻断裂：

1. 恢复点 tick 50 状态一致（memory/RNG/agent 标量全等）。
2. 续跑前若干 tick，pending 丢失的直接影响可能被 tickHash 字段过滤掩盖（HASHED_FIELDS = worldClock/characters/relationships/canonFacts/positions，不含 memory/eventLog 内部）。
3. RNG 消耗路径因 pending 缺失而逐步偏移，累积到某 tick（~63-66）触发可见的 agent 状态分叉（position/emotion/behaviorField 漂移进入 hash 覆盖字段）。
4. memory 差异（少 1 条）是 RNG 分叉的后果之一，非根因。

### 1.4 还有哪些状态可能同类丢失（同类风险审计）

v2.2 深挖审计 `engine.toJSON()` 全字段，确认以下状态**已正确序列化**（非同类风险）：

| state | 序列化 | 位置 |
|---|---|---|
| memory（memories array） | ✅ | `agents.maya.memory`（array，18 条） |
| proceduralMemory | ✅ | `agents.maya.proceduralMemory.patterns` |
| appraisalBiases | ✅ | `agents.maya.appraisalBiases` |
| _actionTraceHistory | ✅ | `agents.maya._actionTraceHistory` |
| behaviorField.B | ✅ | `agents.maya.behaviorField` |
| emotion.current | ✅ | `agents.maya.emotion` |
| stateMachine.history | ✅ | `agents.maya.stateMachine.history` |
| rngState | ✅ | top-level `rngState` |

**同类风险**（运行期结构未持久化，需在 v2.2 修复时一并处理）：

| state | 序列化 | 风险 |
|---|---|---|
| EventDispatcher.pendingEvents | ❌ 不持久化 | **高**：续跑首个 tick 丢失待 dispatch event |
| EventDispatcher._nextId | ❌ 不持久化 | **中**：续跑后 event id 从 0 重新计数，可能与既有 eventLog id 冲突 |
| EventDispatcher.eventIndex | ❌ 不持久化 | **中**：影响 event 检索索引 |
| 其他可能的运行期缓存 | 待审 | 需在实现波次逐模块审计 |

---

## 2. 契约边界判断

### 2.1 修复是否改变 Stable World Envelope？

**判断**：**取决于修复范围**。

Stable World Envelope 的公开字段（schemaVersion/worldId/domainRef/worldClock/characters/relationships/events）**不变**。修复在 `runtimeSnapshot`（opaque payload）内部——`runtimeSnapshot` 是 `engine.toJSON()` 的透传，其内部结构对 envelope 而言是不透明的。

但 `runtimeSnapshot` 内部结构的改变会**影响 restore 语义**——任何依赖 `engine.toJSON()` 输出恢复的消费者（包括 `AndyEngine.fromJSON` / `WorldStateAdapter.fromWorldState`）会感知到结构变化。

### 2.2 是否只是 runtimeSnapshot opaque payload 内部补全？

**判断**：**主要是，但有边界张力**。

- 若修复仅扩展 `EventDispatcher.toJSON()` 增加 pendingEvents/_nextId/eventIndex 字段，且 `fromJSON` 对应恢复——这是 runtimeSnapshot 内部补全，不动 envelope 顶层字段。
- 但 `engine.toJSON()` 输出是 **public persistence contract** 的一部分（`AndyEngine.fromJSON` 公开 API 消费它）。新增字段意味着旧消费者可能不识别新字段（向后兼容问题，见 §3）。
- `runtimeSnapshot` 在 envelope 里标注为"opaque payload"，但其不透明性是针对 envelope 适配器（WorldStateAdapter 不解析内部），**不是对 engine 自身**。engine 的 toJSON/fromJSON 是公开契约。

### 2.3 是否需要 schemaVersion bump？

**判断**：**需要，但语义需明确**。

当前 `CURRENT_SCHEMA_VERSION = '0.1.0'`（`src/store/world/validator.js`）。validator 对 schemaVersion 做强校验（必须精确匹配）。

建议方案：
- **bump 到 0.2.0**（minor），语义："runtimeSnapshot 内部结构扩展（EventDispatcher 增持久化字段），envelope 顶层字段不变"。
- 或保持 0.1.0 + 在 runtimeSnapshot 内部加 `runtimeSnapshotVersion` 子字段（区分 envelope schema 与 runtime payload schema）。

**推荐 bump 到 0.2.0**：保持单一 schemaVersion 作为整体持久化契约版本，避免双版本号增加复杂度。但需 migration（见 §2.4）。

### 2.4 是否需要 migration？

**判断**：**需要，best-effort 迁移**。

- 旧存档（schemaVersion 0.1.0）的 runtimeSnapshot 不含 pendingEvents/_nextId/eventIndex。
- restore 时检测到缺字段，需 best-effort 恢复（见 §3）：pendingEvents 默认空数组，_nextId 从 eventLog 最大 id 推算，eventIndex 重建。
- migration 函数在 `fromWorldState` / `fromJSON` 路径中，检测 schemaVersion < 0.2.0 时触发 best-effort 补全。

---

## 3. 兼容策略

### 3.1 旧存档缺 memory 时如何处理？

**澄清**：memory 不缺（§1.1 已证序列化正常）。本问题针对 EventDispatcher 运行期结构缺失。

旧存档（0.1.0）缺 pendingEvents/_nextId/eventIndex，restore 时：

```text
pendingEvents: 默认 [] （无 pending，续跑从干净状态开始）
_nextId: 从 eventLog 最大 id 推算（max(eventLog.id) + 1，或 0 若 eventLog 空）
eventIndex: 从 eventLog 重建
```

### 3.2 是否允许 best-effort restore？

**判断**：**允许，但需标记 fidelity level**。

best-effort restore 意味着旧存档续跑**不保证 L4 一致性**（因 pendingEvents 丢失导致 RNG 路径分叉）。这是可接受的——旧存档本就是在 v2.1 schema 下生成，其续跑 fidelity 受限于生成时的序列化完整度。

### 3.3 是否需要标记 fidelity level？

**判断**：**需要**。

在 runtimeSnapshot（或 envelope metadata）增加 `fidelityLevel` 字段：

- `full`：所有运行期结构完整持久化（0.2.0+ 新存档）
- `best-effort`：运行期结构 best-effort 补全（0.1.0 旧存档迁移后）

L4 测试对 `fidelityLevel === 'full'` 的存档断言续跑一致；对 `best-effort` 存档仅断言"不崩溃"，不断言 hash 一致。这让 L4 测试既能守护新存档 fidelity，又不阻塞旧存档兼容。

---

## 4. 验收标准

### 4.1 L4 截断续跑如何重新变绿？

L4 主测试（`tests/unit/replay-trust-l4.test.js`）取消 skip，断言：

1. 从 tick 50 快照（schemaVersion 0.2.0，fidelityLevel full）恢复续跑到 100。
2. 续跑段（tick 50-99）per-tick hash 与全程回放对应段**全等**。
3. 恢复点 tick 50 的 memory/RNG/eventDispatcher 状态与全程 tick 50 全等。

L4 诊断测试（基于错误前提的断言）**移除或改写**——它当前断言"envelope memory.memories 为空"是错误前提，应改为验证 pendingEvents/_nextId/eventIndex 恢复。

### 4.2 哪些 golden corpus 必须更新？

- `tests/fixtures/golden-campus-seed42-100ticks.json`：`_meta.schemaVersion` 从 0.1.0 升 0.2.0；runtimeSnapshot 增 pendingEvents/_nextId/eventIndex 字段；tickHashes 序列**可能变化**（若 EventDispatcher 持久化字段进入 hash 输入——但当前 HASHED_FIELDS 不含 eventLog 内部，故 tickHash 应不变，需实测确认）。
- 若 tickHash 不变：fixture 仅升级 schemaVersion + runtimeSnapshot 结构，`golden:regen` 后提交。
- 若 tickHash 变化：走 replay-diff 人审流程，记录"intentional fixture drift: schemaVersion bump 0.1.0→0.2.0 + EventDispatcher 持久化扩展"。

### 4.3 replay-diff 如何记录 intentional fixture drift？

REPLAY_TRUST_RFC §4-5 已定义人审流程。schemaVersion bump 属"有意行为变更"，走 `--accept-intentional` + changelog：

```text
docs/quality/golden-corpus-changelog.md append:
  | date | commit | fixture | ticks | 原因 | 审阅人 |
  | ...  | ...    | golden-campus-seed42-100ticks.json | 0-99 | schemaVersion 0.1.0→0.2.0 + EventDispatcher 持久化扩展 (pendingEvents/_nextId/eventIndex) | v2.2 |
```

`replay-diff --accept-intentional` 跳过立即 fail，但强制提示写 changelog（Q3 裁定不豁免）。

---

## 5. 风险与回滚

### 5.1 哪些改动必须回总规划师确认？

**必须确认**（触及阶段边界）：

1. **schemaVersion bump 0.1.0 → 0.2.0**：改 Stable World Envelope schema 版本，属 public persistence contract 变更。
2. **EventDispatcher.toJSON/fromJSON 扩展**：若新增字段进入 runtimeSnapshot 公开结构（虽 opaque，但 engine.fromJSON 消费）。
3. **fidelityLevel 字段引入**：若加入 envelope 顶层（非 runtimeSnapshot 内部），属 envelope schema 变更；若仅在 runtimeSnapshot 内部，属实现细节。
4. **golden fixture tickHash 变化**：若 schemaVersion bump 导致 tickHash 漂移，需确认是否接受 intentional drift。

### 5.2 哪些属于实现细节可由架构师调度？

**架构师可调度**（不触及边界）：

1. EventDispatcher 内部实现细节（pendingEvents 如何序列化、_nextId 推算算法）——只要不改变 runtimeSnapshot 公开字段集。
2. migration 函数实现（best-effort 补全逻辑）。
3. L4 测试改写（取消 skip、移除错误前提断言、新增 fidelity 断言）。
4. fidelityLevel 若仅放 runtimeSnapshot 内部（非 envelope 顶层）。
5. golden fixture 重生成（`golden:regen`）+ changelog 记录。

### 5.3 回滚路径

若 v2.2 实现波次发现修复引入回归（如旧存档 restore 崩溃、tickHash 大面积漂移）：

1. 回滚 schemaVersion 到 0.1.0。
2. 回滚 EventDispatcher.toJSON/fromJSON 扩展。
3. L4 测试重新 skip，记录"v2.2 修复未完成，根因待二次设计"。
4. golden fixture 回滚到 0.1.0 版本（git revert）。

---

## 6. 实现波次建议（v2.2，不启动）

本 RFC 只设计，不启动实现。若总规划师批准，建议拆为：

- **v2.2-W1**：EventDispatcher 持久化扩展（pendingEvents/_nextId/eventIndex）+ fromJSON 恢复 + 单元测试。
- **v2.2-W2**：schemaVersion bump 0.1.0→0.2.0 + migration（best-effort 补全）+ fidelityLevel。
- **v2.2-W3**：L4 测试改写（取消 skip、移除错误前提、fidelity 断言）+ golden fixture 重生成 + changelog。
- **v2.2-W4**：全量验收（npm test / replay:diff / aliveness:report D1 升级）。

每个波次按"任务卡 → 执行 → 验收 → 回写"节奏。触及 §5.1 边界的波次单独走总规划师确认。

---

## 7. 待独立审计的问题

1. schemaVersion bump 到 0.2.0（minor）是否合适，还是应 major（1.0.0）？当前 0.x.y 语义下，runtimeSnapshot 结构扩展算 minor 还是 major？
2. fidelityLevel 放 runtimeSnapshot 内部还是 envelope 顶层？前者不触及 envelope schema，后者更可见但触及。
3. best-effort restore 对旧存档续跑不保证 L4 一致性，是否需在 public API 文档明确声明？
4. tickHash 的 HASHED_FIELDS 是否应纳入 eventLog 内部（当前不含）？若纳入，schemaVersion bump 会导致 tickHash 变化，需确认是否接受。
5. W6 诊断测试基于错误前提，是否在 v2.2-W1 立即移除，还是等修复后一并改写？
