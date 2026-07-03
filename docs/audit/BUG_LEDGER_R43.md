# Bug Ledger — R43

> 闭环质量系统 bug ledger。每条记录：ID、证据、复现、修复 commit、回归测试、核验结论。
> 审计子 AI 找 bug（只读）→ 核验子 AI 独立复核（只读）→ 主审计师修 confirmed bug → 核验子 AI 验证修复（只读）。

审计基线：R43 从 HEAD `157380a`。发布状态：FROZEN。

---

## R43 — FLAKE-1 (P1, 测试稳定性)

| 字段 | 内容 |
|------|------|
| ID | FLAKE-1 |
| Severity | P1（非 P0：默认环境下 `npm test` 全绿，仅在并行+特定 wall-clock 小时下偶发失败；硬规则 2 要求 npm test 全绿，flaky 违反"全绿"的可重复性承诺） |
| Evidence | `tests/e2e/cause-effect-memory-narrative.test.js` > "should maintain memory consistency across ticks"（原 L127-170）。测试 `new AndyEngine({ seed: 'memory-consistency-test' })` **未传 `startTime`**。`src/runtime/AndyWorld.js:60` `new WorldClock(config.startTime || new Date())` → 起始时刻=wall-clock，起始**小时**随运行漂移。Alice 独自在 '宿舍' 跑 25 tick，记忆**仅**来自 `EventDispatcher.generateRandomEvent`（`src/runtime/EventDispatcher.js:373` `if (this._rand() > cfg.randomEventProbability) return null;`，`randomEventProbability=0.08`，`src/config/defaults.js:197`）。EventDispatcher 用共享世界 RNG（`AndyWorld.js:183`）；gate 前每 tick 的 RNG 抽取数受小时门控路径影响（`Schedule._maybeRegenerateVariations`/`getNextActivity`，`src/agent/schedule/Schedule.js:137-161,113-127`）。不同起始小时 → RNG 流位置不同 → 对 ~2/24 小时（h13、h23）25 个 gate 抽取全 >0.08 → 0 个 random 事件 → 0 条记忆 → `expect(aliceMemories.length).toBeGreaterThan(0)` 失败。并行 `npm test` 下 CPU 争用使构造时刻漂移到"坏小时"的概率 ≈ 15%。 |
| Repro | 1) 确定性复现：24 个固定起始小时 `new Date(2026,8,1,h,0,0)` 跑该场景，h13/h23 产生 0 记忆（2/24）。2) 并行复现：`npm test` 连跑 6 次，~1 次失败（同测试、同断言）。3) 反证：`npx vitest run --no-file-parallelism` 4/4 全绿；单文件隔离 20/20 全绿。 |
| Fix | `tests/e2e/cause-effect-memory-narrative.test.js`：给 Alice 传 `background: ['是一名喜欢安静的学生','最近在读一本有趣的小说']` 种子记忆。种子记忆是**结构性**的（不受 RNG/小时/时区影响，survive 所有 tick），使 `length>0` 断言确定性成立。**断言未减弱、未 skip**（硬规则 5）。 |
| Regression test | 即本测试本身（修复后成为确定性测试）。另在 /tmp 验证脚本中确认 5 时区 × 24 小时全 pass。 |
| Verification | 核验子 AI（只读）独立 CONFIRMED 根因（WorldClock wall-clock 默认、shared RNG、8% gate、0.92^25≈12.5%、h13/h23 复现 2/24）。核验子 AI 进一步指出第一版修复（固定 `startTime: 2026-09-01T08:00:00Z`）**时区脆弱**：`WorldClock.get hour()` 用本地 `getHours()`，UTC+5 下 08:00Z→本地 h13→0 记忆→仍失败（已实测 TZ=Asia/Karachi 3/3 fail）。主审计师采纳核验意见，改用结构性种子记忆修复。修复后：单文件 10/10、默认 TZ 全套 5/5（3076/0）、TZ=Asia/Karachi 该测试仍 pass。 |
| 修复 commit | （未提交；用户要求打包迁移，工作树保留此改动） |

### 核验子 AI 反馈与主审计师响应（关键）
- 核验子 AI 第一轮：root cause CONFIRMED，fix CORRECT-in-effect 但 **TIMEZONE-FRAGILE**（UTC+5→h13→0 记忆），并建议"给 Alice 种子记忆"作为跨时区稳健修复。
- 主审计师响应：实测确认时区脆弱性（TZ=Asia/Karachi 第一版修复 3/3 fail），改用结构性种子记忆方案，5 时区 × 24 小时全 pass。**核验意见被采纳，修复升级。** 这正是"核验子 AI 不相信审计/修复"工作流的价值。

---

## R43 — 延后（latent，不影响默认环境）

| ID | Severity | 说明 | 处置 |
|----|----------|------|------|
| TZ-1 | P2（latent） | `tests/unit/golden-seed-replay.test.js`（P0 determinism 金标准回放）对时区敏感：默认 TZ（UTC+8）3/3 pass，但 `TZ=Asia/Karachi`（UTC+5）3/3 fail。根因：golden 快照在某固定 TZ 下生成，`WorldClock` 用本地 `getHours()/getDay()/getMonth()`，换 TZ 后 seeded 回放漂移。 | **延后**。修法需把 WorldClock 改 UTC 或在测试内 `process.env.TZ` 钉死生成 TZ，但前者会改动 golden fixture（影响所有 seeded 回放基线），是单独的架构决策，不由本次 flake 触发。默认环境（开发者机器 UTC+8）全绿，不阻塞。迁移到**不同时区**机器跑 `npm test` 时该单测会失败——非回归，是 golden 快照的时区绑定行为。 |

---

## 本轮 full gate（修复后，默认 TZ=UTC+8，主审计师亲自重跑）

| Gate | 结果 |
|------|------|
| `npm test` | ✓ 3076 passed / 0 failed / 33 skipped（5 次连跑全绿；修复前 ~15% 并行失败） |
| `npm run test:domain` | ✓ 81 passed |
| `npm run check:boundaries` | ✓ all passed |
| `npm run replay:diff` | ✓ 100/100 matched |
| `npm run smoke:pack` | ✓ 19 passed / 0 failed |
| `perf:check` | 未跑（本轮仅改测试文件，未触 runtime/性能路径，硬规则 8 不要求） |

发布状态：FROZEN（无 npm publish/tag/release）。

---

## 对 R42 收敛报告的更正说明

R42 收敛报告（`CONVERGENCE_REPORT_R42.md`）声称"npm test 3076/0 全绿"——在默认 TZ 下**属实**（主审计师本次 8 次连跑 + 5 次连跑均 3076/0）。但该结论**不完整**：报告作者未做多次并行连跑，未捕获到 ~15% 的并行 flake（FLAKE-1）。flaky test 的"全绿"需要多次连跑才能证伪。本轮（R43）通过反复连跑捕获并修复。此为流程教训：**"全绿"声明必须基于多次连跑（≥5 次并行），单次运行不足以排除 flake。**
