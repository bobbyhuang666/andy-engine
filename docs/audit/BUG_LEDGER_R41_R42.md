# Bug Ledger — R41 / R42

> 闭环质量系统 bug ledger。每条记录：ID、证据、复现、修复 commit、回归测试、核验结论。
> 审计子 AI 找 bug（只读）→ 核验子 AI 独立复核（只读）→ 修复子 AI 修 confirmed bug → 核验子 AI 验证修复（只读）→ 审计子 AI 从最新 HEAD 找下一层 bug。

审计基线：R41 从 HEAD `9fc9e74`，R42 从 HEAD `1b52f3e`。发布状态：FROZEN。

---

## R41 — SP-1 (P0)

| 字段 | 内容 |
|------|------|
| ID | SP-1 |
| Severity | P0 |
| Evidence | `src/runtime/AndyWorld.js` Phase 4 regionChanged 分支（修复前 ~435-442）：schedule/need/IM 路径设 `agent.position = newRegion` 并置 `result.regionChanged=true`，但不同步 `SpatialEngine._coords`。Phase 5 `SpatialEngine.tick()->_syncRegions()` 用陈旧坐标反推旧区域，emit `PositionDelta(to:旧区域)` 回滚。默认 `actionSelection.enabled=false`，schedule 是主路径；R40 B1 只覆盖 active action-selection 路径。 |
| Repro | `new AndyEngine({ spatial:'continuous', seed:42, startTime:早晨 })`，createCharacter(student, initialPosition:'宿舍')，tick 60 次。schedule 驱动移动后 agent.position 被同 tick 回滚到旧区域（在新/旧间震荡或回到旧区域）。 |
| Fix commit | `9fc9e74` (R41) — AndyWorld Phase 4 regionChanged 分支同步 `spatial.setCoords(regionCenter(agent.position))`，使 `pointToRegion(coords)===agent.position`，`_syncRegions` 不产生回滚。regionCenter 不消费 RNG，golden fixture 不漂移。 |
| Regression test | `tests/unit/spatial-continuous-schedule-rollback.test.js`（schedule 驱动 move 持久化 + _coords 与 agent.position 区域一致）。 |
| Verification | 主审计师独立验证：未提交修复下 full gate 全绿（npm test 3071/0 fail、test:domain 81、check:boundaries 16/16、replay:diff 100/100、smoke:pack 19/0）。启发式收紧（deep-audit-architecture.test.js `includes('=')`→正则 `/\.position\s*=/`）经独立核对：真实写回 2 处（均 `= fallback`），阈值保留 ≤7，非断言降低。33 skip 经核实为 R1-R6/R21 遗留，非本轮新引入。 |

---

## R42 — SER-1 (P0)

| 字段 | 内容 |
|------|------|
| ID | SER-1 |
| Severity | P0 |
| Evidence | `src/spatial/SpatialEngine.js` 持有 typed-array 连续状态（`_coords`/`_targets`/`_speeds`/`_moving`/`_agentIds`/`_regionNames`）但无 snapshot/restore。`src/runtime/AndyWorld.js` `toJSON()`（~855-896）不发射 `spatial` 键；构造函数恢复时只从 config 重建 SpatialEngine，随后 `addAgent()`（~231-232）用 `regionCenter` 重置 `_coords`、用 1.4 重置 `_speeds`。 |
| Repro | `new AndyEngine({ spatial:'continuous', seed:42 })`，createCharacter ×2，tick 20 次使 agent 获得非区域中心连续坐标 → `engine.toJSON()` → `AndyEngine.fromJSON(json)`。恢复后 agent snap 到区域中心，连续 (x,y)/speeds/moving 全部丢失。 |
| Fix commit | `1b52f3e` (R42) — `SpatialEngine.snapshot()/restore()`（typed array↔普通数组，守卫：缺失/长度不匹配→no-op）；`addAgent()` 幂等化（agentId 已存在则跳过重放置，仅 rebuild grid）；`AndyWorld.toJSON()` 仅在 `this.spatial` 非 null 时发射 spatial 快照（默认离散模式不变，golden fixture 不受影响）；构造函数在 addAgent 循环前 `spatial.restore(savedState.spatial)`（旧快照无 spatial 键→no-op，向后兼容）。 |
| Regression test | `tests/unit/spatial-continuous-serialization.test.js`（2 tests：coords/speeds/moving 恢复在 epsilon 内 + 向后兼容离散模式无 spatial 键）。 |
| Verification | 核验子 AI（只读）独立 CONFIRMED 根因（无 spatial 键、无 snapshot/restore、addAgent 重置坐标）。修复后主审计师亲自重跑 full gate 全绿：npm test 3076/0 fail、test:domain 81、check:boundaries 16/16、replay:diff 100/100、smoke:pack 19/0。回归测试经核对测真实根因（非弱化）。 |

---

## R42 — RC-1 (P1)

| 字段 | 内容 |
|------|------|
| ID | RC-1 |
| Severity | P1 |
| Evidence | `src/sdk/AndyBridge.js` `_restoreAgents`（~354-355）：`agent.position = state.position` 后不调 `regions.place` 或 `spatial.setCoords`。`_restoreAgents` 经 `init()` 的 `onRestore` 回调（~88-90）在启动恢复时触发。下一 tick Phase 5 `SpatialEngine._syncRegions()`（~273-290）用陈旧 `_coords`（addAgent 时区域中心默认值）反推旧区域，emit regionChange，`AndyWorld._evaluateSpatialInteractions()`（~606-623）用 `PositionDelta(to:旧区域)` 回滚。注：AndyBridge 按 agent 序列化（`agent.toJSON()`），只携带 position（区域名），不携带连续坐标。 |
| Repro | continuous spatial + AndyBridge snapshots（默认 interval 12）+ 进程重启，快照 position 与构造区域不同。恢复后首 tick agent.position 被回滚到构造区域。 |
| Fix commit | `1b52f3e` (R42) — `_restoreAgents` 设 `agent.position` 后同步 `world.regions.place` + `world.spatial.setCoords(regionCenter(agent.position))`（R41 SP-1 模式，regionCenter 不消费 RNG）。全部存在性检查守卫，离散模式（spatial null）不崩溃。 |
| Regression test | `tests/unit/andybridge-restore-spatial-sync.test.js`（3 tests：_coords 同步到恢复区域中心、`_syncRegions` 不产生回滚 regionChange、离散模式不崩溃）。 |
| Verification | 核验子 AI（只读）独立 CONFIRMED 根因（_restoreAgents 不同步 _coords、onRestore 可达、回滚机制真实）。修复后主审计师亲自重跑 full gate 全绿。回归测试经核对测真实根因（非弱化）。 |

---

## R42 — 延后（latent P2，不在 live path）

| ID | Severity | 说明 | 处置 |
|----|----------|------|------|
| NAN-1 | P2（latent） | `NeedsSystem.native._syncFromNative` 无 R36 式输出校验。但 native 默认关闭、无 binding 发布、per-tick 走 `tickWithBehavior`（自愈）。 | 延后；如 native 路径启用再修。 |
| NAN-2 | P2（latent） | `getValence`/`getArousal`/`getMoodString` 用 `!== undefined`（不拒 NaN）。但 `applyEffect` 有 `Number.isFinite(delta)` 守卫（R32），NaN 无法经任何 live path 进入 `.current`。 | 延后；defense-in-depth。 |
| EP-9 | P2（latent） | deprecated `propagateEventKnowledge` 缺 AGENT_STATE 守卫。但无 caller，participants 仅 owner、scope LOCAL，无跨 agent 泄漏。 | 延后；可删方法或加对称守卫。 |
| SER-2 | P2（latent） | `KnowledgeStore.toJSON` 未发射 `version` 字段。schema 当前稳定，无迁移风险。 | 延后；schema 变更时补。 |

---

## 本轮 full gate（R42 提交后，主审计师亲自重跑）

| Gate | 结果 |
|------|------|
| `npm test` | ✓ 191 files passed / 1 skipped；3076 tests passed / 33 skipped / 0 failed |
| `npm run test:domain` | ✓ 81 passed |
| `npm run check:boundaries` | ✓ 16/16 clean |
| `npm run replay:diff` | ✓ 100/100 matched vs golden-campus-seed42-100ticks |
| `npm run smoke:pack` | ✓ 19 passed / 0 failed |

发布状态：FROZEN（无 npm publish/tag/release）。
