# v2.2 Persistence Fidelity Completion Report

> 阶段：v2.2 Persistence Fidelity / L4 Resume 议题（已关闭）
> 完成时间：2026-06-26
> 最终修复 commit：`1de1176`（fix: restore runtime snapshot fidelity for L4 resume）
> 状态：**完成并通过独立审计验收。L4 Replay Trust 达标。**

## 1. 议题背景

W6 实测 L4 截断续跑失败（tick 63 起漂移），降级 v2.2。经 W0/W0c/W0e/W0f 四轮诊断定位 5 个 runtimeSnapshot 持久化缺口，v2.2-W1 完整修复，L4 达标。

## 2. 5 层根因与修复

| 层 | 根因 | 诊断 | 修复（commit `1de1176`） |
|---|---|---|---|
| 1 | EventDispatcher._nextId 未持久化 | W0 | toJSON 输出 _nextId + fromJSON 恢复 + best-effort 推算；AndyWorld 构造改用 EventDispatcher.fromJSON |
| 2 | Agent._ticksSinceReflection/_ticksSinceDriftCheck 未持久化 | W0c | AgentSerializer.toJSON 输出计数器；Agent.js 恢复（best-effort 缺字段默认 0） |
| 3 | PersonalMemory.toJSON presentations.slice(-20) 截断 | W0e | 完整持久化 presentations（移除截断） |
| 4 | PersonalMemory._touchMemory 运行时 presentations 截断 | W0e 延伸 | 移除 line 827-828 运行时 slice(-20)，与 accessCount 语义一致 |
| 5 | memory.appraisal 未持久化 | W0f | toJSON 加 appraisal 字段 |

## 3. 诊断链审计痕迹

| 报告 | 根因 | 状态 |
|---|---|---|
| W0（PERSISTENCE_FIDELITY_ROOT_CAUSE_REPORT） | _nextId | 已闭环（第 1 层，已修） |
| W0b（MEMORY_DIVERGENCE_ROOT_CAUSE_REPORT） | 感知去重 | **REJECTED**（错误结论，作废） |
| W0c（MEMORY_DELETION_ROOT_CAUSE_REPORT） | reflection counters | 已闭环（第 2 层，已修） |
| W0d（VALENCE_DIVERGENCE_ROOT_CAUSE_REPORT） | retrieve 选择差异 | superseded（未含 presentations 完整内容，W0e 修正） |
| W0e（RETRIEVE_PROBABILITY_ROOT_CAUSE_REPORT） | presentations 截断 | 已闭环（第 3-4 层，已修） |
| W0f（CONSOLIDATION_DIVERGENCE_ROOT_CAUSE_REPORT） | appraisal 未持久化 | 已闭环（第 5 层，已修） |

W0b 错误结论"感知去重状态未持久化"经独立审计证伪，REJECTED，未污染最终修复。W0d"tick 66 全字段一致"表述因未含 presentations 完整内容而 superseded。

## 4. L4 漂移推进

| 修复阶段 | 首个分叉 tick |
|---|---|
| 修复前 | 50（edNextId） |
| 修 _nextId（层 1） | 59（memory consolidate 时机） |
| 修 counters（层 2） | 67（valence） |
| 修 toJSON presentations（层 3） | 67（仍 baseLevel） |
| 修运行时 presentations（层 4） | 83（consolidate pair） |
| 修 appraisal（层 5） | **无分叉（全一致）** |

## 5. Replay Trust 等级

| 等级 | 标准 | 状态 |
|---|---|---|
| L1 | seed42/100ticks + per-tick hash | ✅ |
| L2 | 多 seed 跨 run 一致 | ✅ |
| L3 | 跨进程一致 | ✅ |
| L4 | 截断续跑 hash 一致 | ✅（v2.2-W1 修复） |

## 6. 验收

- L4 主测试：取消 skip 并通过（续跑段 hash 与全程一致）
- 7 regression（_nextId / counters / presentations / appraisal / memory array / best-effort）全过
- npm test：158 文件 / 2595 测试 ✓
- test:domain / check:boundaries / smoke:pack / perf:check 全绿
- replay:diff：100/100 matched
- golden fixture 重生成（intentional runtimeSnapshot drift，changelog 已记录）

## 7. 边界遵守

- 未改 Stable Envelope 顶层字段
- 未 bump schemaVersion（runtimeSnapshot opaque payload 内部补全）
- 未改 public API contract
- 未引入 fidelityLevel
- 未改 tickHash HASHED_FIELDS
- 未用截断/降标准绕过 L4

## 8. 非阻塞后续议题（记录但不启动）

- PersonalMemory / ProceduralMemory `_simTime` 初始化一致性
- runtimeSnapshot payload 体积增长与未来 compaction（presentations 完整保留后体积增大）
- 是否在未来 schemaVersion 0.2.0 显式区分 full fidelity / best-effort
- eventLogHash 是否单独引入

## 9. 文档真相 pass

v2.2-W1 通过后，已统一文档状态：
- REPLAY_TRUST_ROADMAP §7 L4 行改为 ✅，§8/§9 更新为已闭环
- ALIVENESS_BENCHMARK_RFC D1 Warning 条件注明 v2.2-W1 已修复
- WORLD_KERNEL_TRUST_ROADMAP W6 决策点标注已闭环
- aliveness-report 生成器 + 报告 D1 升级 Pass
- 诊断链报告全部标注闭环/REJECTED/superseded 状态

## 10. 议题关闭

v2.2 Persistence Fidelity / L4 Resume 议题本阶段关闭。后续若发现新 persistence fidelity 问题，必须作为新议题重新开 RFC 或任务卡。
