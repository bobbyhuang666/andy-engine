# 闭环质量系统收敛报告 — R42

> **审计师**: 独立审计师（不信任架构师报告；每项声明在代码中独立验证）
> **收敛日期**: 2026-06-30
> **收敛 HEAD**: code `1b52f3e` / docs `020d2f9`（后续 docs 提交 `08c2717`/`020d2f9`/findings ledger 不含代码改动）
> **发布状态**: FROZEN（无 npm publish/tag/release；已核验 3 个既有 tag `v0.2.0`/`v0.2.1`/`v2.0.0` 均指向会话前 commit，本轮未新建任何 tag/release）

---

## 一、收敛判定

**收敛标准（硬规则 6）**: 连续两轮独立审计均未发现 P0/P1，且 full gate 通过。

| 轮次 | HEAD | 审计提出 | 核验后 confirmed | 处置 |
|------|------|----------|------------------|------|
| Round 2 | `9fc9e74` | SER-1 P0, RC-1 P1, NAN-1/2 P1 | SER-1 P0, RC-1 P1（NAN 降级 P2） | R42 修复 + 提交 |
| Round 3 | `1b52f3e` | EVT-1 P1, ACT-1 P1 | 0（EVT-1→P2 opt-in, ACT-1→INVALIDATED） | **clean #1** |
| Round 4 | `1b52f3e` | 0 P0/P1 | 0 | **clean #2** |
| Round 5 | `020d2f9` | PDC-1 P1, STO-1 P1 | 0（PDC-1→P2 latent, STO-1→INVALIDATED unreachable） | **clean #3** |

**结论**: 连续 3 轮（R3、R4、R5）独立审计经核验后均无 confirmed P0/P1，超出硬规则 6 最低要求（2 轮）。full gate 全绿 + perf:check 全绿。**收敛达成。**

> 核验即审计周期的一环（工作流：审计子 AI 找 bug → 核验子 AI 独立复核，不相信审计）。一轮 clean = 经核验后 0 confirmed P0/P1。R3/R5 的审计虽提出 P1，但核验子 AI 独立读代码 + git 时间线验证后均降级/无效（附 file:line/commit 证据，非纸面确认）。详见 `AUDIT_FINDINGS_ROUND3_5.md`。

---

## 二、本轮修复（R41–R42）

### R41 — SP-1 (P0) `9fc9e74`
- **根因**: continuous spatial 模式下，schedule/need/IM 路径设 `agent.position` + `regionChanged=true` 但不同步 `SpatialEngine._coords`。Phase 5 `_syncRegions()` 用陈旧坐标反推旧区域，`PositionDelta(to:旧区域)` 同 tick 回滚。
- **修复**: AndyWorld Phase 4 regionChanged 分支同步 `spatial.setCoords(regionCenter(agent.position))`。regionCenter 不消费 RNG，golden fixture 不漂移。
- **回归测试**: `tests/unit/spatial-continuous-schedule-rollback.test.js`
- **审计启发式收紧**: `deep-audit-architecture.test.js` 位置写回检测 `includes('=')`→正则 `/\.position\s*=/`（消除读取行假阳性，阈值保留 ≤7，真实写回 2 处）。

### R42 — SER-1 (P0) `1b52f3e`
- **根因**: `SpatialEngine` 持有 typed-array 连续状态但无 snapshot/restore；`AndyWorld.toJSON()` 不发射 `spatial` 键；恢复时 `addAgent()` 用 regionCenter 重置坐标、1.4 重置速度。
- **修复**: `SpatialEngine.snapshot()/restore()`（守卫：缺失/长度不匹配→no-op）；`addAgent()` 幂等化；`AndyWorld.toJSON()` 仅 continuous 模式发射 spatial 快照（默认离散模式不变，golden fixture 不受影响）；构造函数在 addAgent 循环前 restore（旧快照无 spatial 键→no-op，向后兼容）。
- **回归测试**: `tests/unit/spatial-continuous-serialization.test.js`（2 tests）

### R42 — RC-1 (P1) `1b52f3e`
- **根因**: `AndyBridge._restoreAgents` 设 `agent.position` 后不同步 `_coords`/`regions.place`。首 tick `_syncRegions` 用陈旧 `_coords` 反推旧区域→`PositionDelta` 回滚。
- **修复**: `_restoreAgents` 设 position 后同步 `regions.place` + `spatial.setCoords(regionCenter)`（R41 SP-1 模式）。全部存在性守卫，离散模式不崩溃。
- **回归测试**: `tests/unit/andybridge-restore-spatial-sync.test.js`（3 tests）

---

## 三、核验后的非 bug / 降级（关键审计判断）

| 发现 | 审计声称 | 核验结论 | 依据 |
|------|----------|----------|------|
| EVT-1 | P1 重复 memory | **降级 P2**（opt-in） | 审计归因错误：`CanonEventPipeline._createMemoryDeltasFromFact` 不存在；真实路径 `EventEffectPipeline.applyEventConsequences` 受 `enableFacts` 门控。默认 campus preset（enableFacts=false）不触发。 |
| ACT-1 | P1 active 模式写世界 | **INVALIDATED** | 经由 canonical `EffectCommitter` 提交 typed deltas，正是 AGENTS.md 写回规则（L223-225）认可的模式；active 模式即设计中的写回模式，默认关闭。 |
| NAN-1 | P1 native _syncFromNative | **降级 P2**（latent） | native 默认关闭、无 binding 发布、per-tick 走 `tickWithBehavior`（自愈）。 |
| NAN-2 | P1 getValence !== undefined | **降级 P2**（latent） | `applyEffect` 有 `Number.isFinite(delta)` 守卫（R32），NaN 无法经任何 live path 进入 `.current`。 |
| ACT-2/3/4 | P2 | P2 | 非主线，延后。 |
| MAP-1/2/3 | P2 | P2 | corrupt snapshot / agent-set drift / 外部越界坐标；均优雅降级不崩溃。 |
| CLK-1/2/3 | P2 | P2 | AutoTick 非 seeded baseline；WorldClock TZ 读数；createEvent `|| new Date()` 不可达。 |
| SDK-1/2 | P2 | P2 | 文档 stale；Andy.load O(N) 重建（效率）。 |
| EP-9 | P2 | P2 | deprecated fallback 无 caller。 |
| SER-2 | P2 | P2 | KnowledgeStore 无 version（schema 稳定）。 |

**重要正面核验**:
- Round 3 R42-scrutiny: R42 改动 0 P0/P1，restore 完整性、addAgent 幂等性、toJSON 向后兼容均经逐行验证。
- Round 4 MAP: 旧 v5 P1「WorldMap 未知区域」**已修复**（regionCenter 对未知区域返回世界中心，不崩溃）；旧 v5 P2「WorldClock fromJSON」**已解决**。
- Round 4 CLK: 核心模拟路径**无裸 `Math.random()`/`Date.now()`**；单 RNG 实例跨 tick 复用；R29「AutoTick 单 RNG」成立。

---

## 四、Full gate（收敛时，主审计师亲自重跑 HEAD `1b52f3e`）

| Gate | 结果 |
|------|------|
| `npm test` | ✓ 191 files passed / 1 skipped；3076 tests passed / 33 skipped / 0 failed |
| `npm run test:domain` | ✓ 81 passed |
| `npm run check:boundaries` | ✓ 16/16 clean |
| `npm run replay:diff` | ✓ 100/100 matched vs golden-campus-seed42-100ticks |
| `npm run smoke:pack` | ✓ 19 passed / 0 failed |
| `npm run perf:check` | ✓ All 5 metrics PASS（硬规则 8：R42 改 runtime/spatial 路径，已跑 perf:check；100/300 agents avg/tick 0.52x/0.39x baseline，无回归） |

注：33 skipped 经核验为 R1-R6/R21 遗留，本轮（R41-R42）未新增 skip，未把 failing test 改 skip，未降低断言（硬规则 5 遵守）。

---

## 五、硬规则遵守

1. ✓ 发布状态 FROZEN，全程无 npm publish/tag/release。
2. ✓ 第一目标（npm test 全绿）在 R41 即达成并保持。
3. ✓ P0/P1 优先；P2 仅记录延后，未拖成无限循环。
4. ✓ 每轮输出 bug ledger（`docs/audit/BUG_LEDGER_R41_R42.md`）。
5. ✓ 未把 failing test 改 skip，未降低断言。
6. ✓ 连续两轮（R3、R4）独立审计无 P0/P1 + full gate 全绿。
7. ✓ 审计测试分类明确（evidence-only / 进入 npm test 则全绿）。
8. ✓ 每次修复后重跑 npm test、test:domain、check:boundaries、replay:diff、smoke:pack。

---

## 六、延后项（latent P2，不在 live path，建议未来处理）

NAN-1, NAN-2, EP-9, SER-2, ACT-2/3/4, MAP-1/2/3, CLK-1/2/3, SDK-1/2。
均为 latent/robustness/cosmetic，不影响 seeded simulation baseline 或默认 campus preset 的正确性。

---

**收敛声明**: 闭环质量系统在 HEAD `1b52f3e` 收敛。R41 修复 1 P0（SP-1），R42 修复 1 P0（SER-1）+ 1 P1（RC-1）。连续两轮独立审计无 P0/P1，full gate 全绿。发布状态保持 FROZEN。
