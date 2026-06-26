# v2.3 Memory System Consistency & Observability Phase — Roadmap

> 状态：总规划师已批准。基于 v2.3 Design Brief（commit `19c2958`，独立审计 Pass）。
> 阶段目标：修 memory 时间语义不一致 + 建 characterization safety net + 增强 replay 诊断可观测性。不做 compaction，不改 Stable Envelope。

## 0. 阶段定位

v2.2 修复 L4 截断续跑后，暴露三个 v2.3 方向。本阶段不扩功能，聚焦 memory 一致性与可观测性。

## 1. 阶段边界（全程有效）

- 不改 Stable Envelope 顶层字段。
- 不 bump schemaVersion。
- 不引入 fidelityLevel。
- 不把 eventLogHash 加入 release gate。
- 不引入 LLM narrative replay。
- 不启动 StoryArc / UI / Andy Town / npm publish / 新功能。
- 不做 memory compaction（W4 暂不启动）。

## 2. 波次总览

| 波次 | 主题 | 触及边界 | 启动 |
|---|---|---|---|
| W1 | Memory simTime consistency | 否 | 优先（小修，事实已确认） |
| W2 | Memory characterization tests | 否 | W1 并行/紧随 |
| W3 | Replay observability diagnostic hashes | 否 | W2 safety net 建立后 |
| W4 | Snapshot compaction | — | **不启动**（未来单独 RFC） |

## 3. W1 — Memory simTime consistency（已完成）

- **修复**：`PersonalMemory._simTime` 初值 `Date.now()` → `0`（与 ProceduralMemory 一致）。
- **characterization test**：`tests/unit/memory-simtime-consistency.test.js`（5 测试，锁定 setSimTime 前 deterministic + setSimTime 后用 sim time + 恢复后重置）。
- **验收**：npm test 159文件/2600测试 / test:domain / boundaries / smoke / perf 全过；replay:diff 100/100（无 golden drift，seed memory 由 backgroundToMemories 传 simTime 不受初值影响）；L4 主测试仍 pass。
- **边界**：未触及 Stable Envelope / schemaVersion / public API / release gate。

## 4. W2 — Memory characterization tests

- **锁定行为**：retrieve top-K / consolidate merge pair / _baseLevelActivation / _memorySimilarity / procedural pattern formation。
- **目标**：给未来 memory 改动（含未来 compaction）提供安全网。
- **不改生产逻辑**，除非测试暴露明确 bug。
- **验收**：characterization tests pass + 全量门控。

## 5. W3 — Replay observability diagnostic hashes

- **新增诊断 hash**：eventLogHash / memoryHash / agentStateHash。
- **不进 release gate**，仅诊断工具。
- **replay-diff 分层输出**：首分叉层直接指示根因层。
- **不改变 tickHash 语义**。
- **验收**：诊断脚本可执行 + 全量门控 + replay:diff（若改 replay tooling）。

## 6. W4 — Snapshot compaction（不启动）

- 1.4MB@1000tick 当前可接受。
- 未来观察到实际性能/体积问题后单独 RFC。
- 任何 compaction 不能牺牲 L4。

## 7. 调度规则

- W1 优先启动（小修，事实已确认，不触及边界）。
- W2 可与 W1 并行或紧随。
- W3 在 W2 safety net 建立后启动。
- 每个波次按"任务卡 → 执行 → 验收 → 回写"节奏。
- 触及 §1 边界需回总规划师。
