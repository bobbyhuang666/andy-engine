# Skipped-Test Ledger (RFC W5 / Patch E)

> 每条 skip 必须有 owner、原因、到期条件。skip 不算通过证据。
> 三类分类见 RFC §5.W5。

## Category 1: 环境条件（保留，但必须在对应 CI job 实际运行）

| File | Skip Count | Reason | Owner | 到期条件 |
| --- | --- | --- | --- | --- |
| `tests/store/serialization-roundtrip.test.js` | 条件 describe.skip | SQLite 块在 `better-sqlite3` 不可用时 skip；CI `sqlite-smoke` job 已覆盖 | store 层 | 永久（optional dep） |

## Category 2: 已被新架构取代（确认替代测试后删除或迁入 archive）

| File | Skip Count | Reason | Owner | 到期条件 |
| --- | --- | --- | --- | --- |
| `tests/audit/deep-audit-v5.test.js` | 6 (describe.skip) | P2 待修组：RegionGraph BFS / 压力系统重复计算 / StoryGenerator 导出 / WorldClock fromJSON / Agent 生命周期 / EventDispatcher createEvent。多数已被 src/ 新测试覆盖 | audit 层 | 逐条确认替代测试存在后删除（Patch E 后续） |
| `tests/phase-26-3-shadow-mode.test.js` | 5 | RNG/action trace — 已被 `tests/unit/` 下确定性 trace 测试取代 | runtime 层 | 确认替代后删除 |
| `tests/phase-26-1-rng-trace.test.js` | 5 | 同上 | runtime 层 | 确认替代后删除 |
| `tests/phase-26-fix-deterministic.test.js` | 4 | EventEffectPipeline / action_selected event — 已被 src/effects/ 测试取代 | effects 层 | 确认替代后删除 |

## Category 3: 仍代表承诺但未完成（改为 test.todo，进入 gap ledger）

| File | Skip Count | Reason | Owner | 到期条件 |
| --- | --- | --- | --- | --- |
| `tests/phase-32-2-active-mode.test.js` | 2 | Active event emission 未完成 | runtime 层 | active mode 功能实现后恢复 |
| `tests/phase-32-3-pipeline.test.js` | 4 | EventEffectPipeline active path 未完成 | effects 层 | 同上 |
| `tests/phase-29-goalsystem.test.js` | 2 | GoalSystem 未实现 | agent 层 | GoalSystem 实现后恢复 |

## 汇总

- **Total skipped**: 28 (vitest JSON: 4106 total − 4078 passed = 28，2026-08-13 复核时计数未变)
- **Category 1 (环境)**: 1 条件块
- **Category 2 (已取代)**: 20 — 应在确认替代后删除
- **Category 3 (未完成)**: 8 — 改 test.todo，不算通过证据
- **占位断言**: `tests/facts/minimal-active-writeback.test.js:83` 的 `expect(true).toBe(true)` 需替换为状态前后断言
