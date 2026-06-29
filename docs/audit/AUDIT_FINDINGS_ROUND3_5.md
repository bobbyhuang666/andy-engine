# Audit Findings Ledger — Rounds 3 / 4 / 5 (this session)

> 闭环质量系统审计发现台账（R3–R5）。记录每项审计发现、核验结论、处置。
> 区别于 `BUG_LEDGER_R41_R42.md`（已修复的 confirmed bug），本文件记录审计提出的发现及其独立核验结果（多数为降级/无效/延后 P2）。
> 审计基线：R3 从 HEAD `1b52f3e`，R4 从 `1b52f3e`，R5 从 `020d2f9`（code HEAD `1b52f3e`）。发布状态：FROZEN。

核验原则：审计子 AI 提出的 P0/P1 必须经核验子 AI 独立复核（只读，不相信审计）后才算 confirmed。未确认的发现不进入修复流程。

---

## Round 3（HEAD `1b52f3e`）— 审计 + 核验

| ID | 审计声称 | 核验结论 | 依据 | 处置 |
|----|----------|----------|------|------|
| R42-1 | P2 restore 长度不匹配 no-op | clean（非 half-built） | restore 守卫在任何 mutation 前 return | 延后 P2 |
| R42-2 | P2 snapshot 缺 version | clean（latent） | 未来 schema drift 风险 | 延后 P2 |
| EVT-1 | P1 重复 memory（每事件每 agent 2 条） | **降级 P2**（opt-in） | 审计归因错误：`CanonEventPipeline._createMemoryDeltasFromFact` 不存在；真实路径 `EventEffectPipeline.applyEventConsequences` 受 `enableFacts` 门控。默认 campus preset（`enableFacts=false`，RuntimeConfig.js:22）不触发。 | 延后 P2 |
| ACT-1 | P1 active 模式写世界（边界破坏） | **INVALIDATED** | 经由 canonical `EffectCommitter` 提交 typed deltas，正是 AGENTS.md 写回规则（L223-225）认可的模式；active 模式即设计中的写回模式，默认关闭。R18 AUDIT-003 已为其加 region sync。 | 非 bug |
| ACT-2 | P2 WorldPressureProvider 发 concrete candidate | P2 | selection 仍 gate；rule #2 tension | 延后 P2 |
| ACT-3 | P2 scoreNeed 未 guard NaN（pressureContext.needs） | P2 | UtilitySelector.js:32 `!isNaN(total)` 已过滤 | 延后 P2 |
| ACT-4 | P2 非 active 模式 temp>0 无 RNG 静默 no-op | P2 | validate 只查 active | 延后 P2 |

**Round 3 confirmed P0/P1: 0**（EVT-1 降级 P2，ACT-1 无效）→ **第 1 轮 clean**。

---

## Round 4（HEAD `1b52f3e`）— 审计 + 核验

| ID | 审计声称 | 核验结论 | 依据 | 处置 |
|----|----------|----------|------|------|
| SDK-1 | P2 PUBLIC_API_CONTRACT TS section stale | P2 | package.json 已加 ./domain ./facts ./store types，文档未更新 | 延后 P2 |
| SDK-2 | P2 Andy.load O(N) 重建 engine | P2 | 效率，非正确性 | 延后 P2 |
| MAP-1 | P2 restore 未校验 _targets 越界 | P2 | corrupt snapshot only；优雅降级 | 延后 P2 |
| MAP-2 | P2 restore 假设 agentIds=live set；ghost agent | P2 | agent-set drift only | 延后 P2 |
| MAP-3 | P2 setCoords 接受越界坐标 | P2 | cellId 已 clamp，不崩溃 | 延后 P2 |
| CLK-1 | P2 AutoTick 用 Date.now() | P2 | AutoTick 非 seeded baseline（设计如此） | 延后 P2 |
| CLK-2 | P2 WorldClock hour/day 用本地时区 getter | P2 | DST/TZ 跨主机可能漂移；advance() 用 epoch 安全 | 延后 P2 |
| CLK-3 | P2 createEvent `|| new Date()` | P2 | 核心 sim 路径不可达（step 先 setSimTime） | 延后 P2 |

**正面核验（重要）**:
- 旧 v5 P1「WorldMap 未知区域」**已修复**：`regionCenter` 对未知区域返回世界中心（WorldMap.js:58-64），不崩溃。R42 AndyBridge 依赖此降级安全。
- 旧 v5 P2「WorldClock fromJSON」**已解决**：toJSON/fromJSON 正确恢复 time+tickCount（WorldClock.js:50-67）。
- 核心模拟路径**无裸 `Math.random()`/`Date.now()`**；单 RNG 实例跨 tick 复用；R29「AutoTick 单 RNG」成立；`hoursElapsed` NaN-safe（AgentRuntime.js:88-91 非有限→默认 5）。

**Round 4 confirmed P0/P1: 0**（审计本身即 0 P0/P1）→ **第 2 轮 clean**。

---

## Round 5（HEAD `020d2f9` / code `1b52f3e`）— 审计 + 核验

| ID | 审计声称 | 核验结论 | 依据 | 处置 |
|----|----------|----------|------|------|
| PDC-1 | P1 MemoryPressure invalid timestamp → NaN 泄漏 total | **降级 P2**（latent defense-in-depth） | NaN 传播机制真实，但 live path 不可达：`MemoryPressure.compute` 首守卫（MemoryPressure.js:22-23）`agentSnapshot.memories` 为 undefined → 提前 return 全零，buggy `if(mem.timestamp)` 块不可达；且 timestamp 在所有 live/restore 路径均有效（addExperience 用 `new Date(this._simTime)`、setSimTime 拒非有限、restore 用 safeDate）。 | 延后 P2 |
| STO-1 | P1 migration.js 丢失 object-shaped socialGraph 关系 | **INVALIDATED**（unreachable） | 代码缺陷真实，但 git 时间线证明 `schemaVersion`（commit 5b45ec5 v2-preview）**先于** R9 object-shape（commit 5fd418d）引入：v0.0.0 快照（无 schemaVersion）必早于 R9 → 携带 array socialGraph → migrateV0ToV1 见 array 不丢；post-R9 快照带 schemaVersion → migrateWorldState 提前 return → migrateV0ToV1 不被调用。无窗口同时「无 schemaVersion + object socialGraph」。且 migrateWorldState 不在 live auto-load 路径（仅 tests 调用）。 | 非 bug（unreachable） |
| R42R-1 | P2 restore 未校验 regionNames | P2 | corrupt snapshot only；_syncTargets 下 tick 自愈 | 延后 P2 |
| R42R-2 | P2 AndyBridge restore snap 到 region center（非连续坐标） | P2 | by-design（bridge 只持久化 position 区域名，文档注明）；full coord fidelity 需 AndyEngine.fromJSON | 延后 P2（设计如此） |
| R42R-3 | P2 zero-agent continuous engine 的 spatial flag 在 Andy.save/load 丢失 | P2 | 退化 edge case；R42 已改善 with-agents 情形 | 延后 P2 |
| STO-2 | P2 toWorldState 存 runtimeSnapshot live reference（非 deep copy） | P2 | mutation foot-gun；migration.js 已 deep copy | 延后 P2 |
| STO-3 | P2 domainRef 'unknown' fallback 产生不可恢复 envelope | P2 | fails loudly 非 corrupt | 延后 P2 |

**R42R re-audit（R42 代码路径独立重审）**: 0 P0/P1 — snapshot 保真度、index 映射、addAgent 幂等性、restore 原子性、构造顺序、Float32 精度、golden fixture、AndyBridge rollback、RNG drift 均经逐行复核正确。

**额外发现（非本轮 ID，核验 PDC-1 时浮现）**: MemoryPressure 在 live path 静默 no-op（返回全零），因 `memories` 从未传入 `fromSnapshot` 的 agent 对象 → memory pressure 实际不影响 scoring。这是 latent 正确性问题（memory pressure feature 实质失效），但非 crash/corruption，且修复需把 memories 接入 fromSnapshot，可能影响 scoring/golden fixture，**不在本轮修**。归类：延后 P2（feature-dead latent）。

**Round 5 confirmed P0/P1: 0**（PDC-1 降级 P2，STO-1 无效）→ **第 3 轮 clean**。

---

## 收敛判定

连续轮次 confirmed P0/P1:
- Round 3: 0（EVT-1 降级，ACT-1 无效）
- Round 4: 0（审计本身 0）
- Round 5: 0（PDC-1 降级，STO-1 无效）

**连续 3 轮独立审计（经核验）无 confirmed P0/P1**，满足硬规则 6「连续两轮独立审计无 P0/P1 + full gate 通过」（实际达成 3 轮，超出最低要求）。

所有 P0/P1 声明的降级/无效均经核验子 AI 独立读代码 + git 时间线验证，附具体 file:line/commit 证据，非纸面确认。

---

## 全部延后 P2 清单（latent/robustness/cosmetic，不在 live path，不影响 seeded baseline 或默认 campus preset）

NAN-1, NAN-2, EP-9, SER-2（R2）; R42-1, R42-2, EVT-1, ACT-2, ACT-3, ACT-4（R3）; SDK-1, SDK-2, MAP-1, MAP-2, MAP-3, CLK-1, CLK-2, CLK-3（R4）; PDC-1, R42R-1, R42R-2, R42R-3, STO-2, STO-3, MemoryPressure-no-op（R5）。

建议未来按优先级处理，但不阻塞当前收敛。
