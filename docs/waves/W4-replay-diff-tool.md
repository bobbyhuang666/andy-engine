# W4 任务卡 — replay-diff 工具 + 人审流程

> Lane: P2 Replay（核心护城河）
> 触及边界: **否**（新增比对脚本 + changelog 模板 + 测试，不动 sim 行为、不动 Stable Envelope 契约、不动既有 fixture 内容）
> 状态: 待执行
> 依赖: W3 已落地（tickHash 算法 + golden fixture 含 tickHashes 序列）

## 1. 背景

REPLAY_TRUST_ROADMAP v0.3 §4 定义 replay-diff 工具：比对当前回放与 golden fixture，产出 tick-by-tick diff 报告；diff 非空默认 fail，开发者判定是否"有意行为变更"，是则走 §5 人审更新流程（changelog 强制记录）。Q3 裁定：`--accept-intentional` flag 仅跳过立即 fail，**不**跳过 changelog 义务。

当前状态：
- W3 已落地 `src/store/world/tickHash.js`（`computeTickHash`/`computeTickHashSeries`）。
- golden fixture 含 `tickHashes`（100 条 per-tick hash 序列）+ `_meta`。
- `golden-seed-replay.test.js` 已做整体快照全等比对 + per-tick hash 跨 run 稳定性断言。
- **无** replay-diff 脚本；**无** `docs/quality/golden-corpus-changelog.md`。

W4 落地：独立 replay-diff 脚本（复用 W3 tickHash）+ changelog 模板 + 测试守护工具正确性。

## 2. 写入边界（执行仅可改/新建这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `scripts/replay-diff.js` | 新建 | 比对工具：跑当前回放产 tickHash 序列 → 与 golden fixture 的 `tickHashes` 逐 tick 比对 → 产出 diff 报告（按 tick 分类：hash 一致/不一致）；exit 1 若有 diff（除非 `--accept-intentional`）；支持 `--fixture <path>` 选 fixture |
| `tests/unit/replay-diff.test.js` | 新建 | 测试工具：用合成 fixture 验证 diff 检测（故意扰动 hash 应报 diff）、`--accept-intentional` 语义（跳过 exit 1 但不跳过 changelog 提示）、报告格式 |
| `docs/quality/golden-corpus-changelog.md` | 新建 | changelog 模板：首条记录 W3 首版 fixture 生成（seed42/100ticks，commit `b34b7fe`）；后续有意变更 append 条目 |
| `package.json` | 增 script | `replay:diff`: `node scripts/replay-diff.js` |

**不得改**：sim 热路径行为、Stable World Envelope 契约字段、public API contract、既有 golden fixture 内容、既有测试逻辑、tickHash 算法、其他 src/ 代码。

## 3. replay-diff 工具设计（REPLAY_TRUST §4 落地）

`scripts/replay-diff.js` 行为：

1. 读 golden fixture 的 `tickHashes`（数组，每元素 `{tick, hash}`）与 `_meta`（验证前提字段存在）。
2. 用与 golden-seed-replay 相同的 seed/startTime/角色配置跑当前回放，逐 tick 采 `toWorldState` + `computeTickHash`，产当前 `tickHashes`。
3. 逐 tick 比对：相同 tick 的 hash 一致/不一致。
4. 产出 diff 报告（stdout）：
   - 汇总：总 tick 数 / 一致数 / 不一致数
   - 详情：每个不一致 tick 列出 expected hash（fixture）vs actual hash（当前）
5. 退出码：
   - 全部一致 → exit 0
   - 有不一致 → exit 1（默认）
   - `--accept-intentional` → 不一致时仍 exit 0，但 stdout **强制打印 changelog 提示**（"请在 docs/quality/golden-corpus-changelog.md 记录变更原因后运行 npm run golden:regen"）
6. `--fixture <path>`：可选，默认 `tests/fixtures/golden-campus-seed42-100ticks.json`。

**设计纪律**：
- 回放配置（seed/startTime/角色/ticks）必须与 golden-seed-replay.test.js 完全一致——通过 require 共享常量或复制相同值，注释标明来源，避免漂移。
- 复用 W3 的 `computeTickHash`，不重写 hash 逻辑。
- 不修改 fixture（修改走 `golden:regen`，本工具只比对）。
- 工具纯比对，不写文件系统（除 stdout 报告）。

## 4. 人审流程与 changelog（REPLAY_TRUST §5 落地）

`docs/quality/golden-corpus-changelog.md` 模板：

```markdown
# Golden Corpus Changelog

> 有意行为变更更新 golden fixture 的审计痕迹（REPLAY_TRUST_ROADMAP §5）。
> `--accept-intentional` 跳过 replay-diff 立即 fail，**不**跳过本 changelog 记录义务。

## 记录格式

| date | commit | fixture | ticks | 原因 | 审阅人 |
|---|---|---|---|---|---|

## 记录

| date | commit | fixture | ticks | 原因 | 审阅人 |
|---|---|---|---|---|---|
| 2026-06-26 | b34b7fe | golden-campus-seed42-100ticks.json | 0-99 | W3 首版生成（含 _meta + tickHashes 升级） | W3 |
```

首条记录 W3 首版（commit `b34b7fe`）。后续 `golden:regen` 后必须 append 新行；`replay-diff --accept-intentional` 在 stdout 提示开发者执行此步。

## 5. 验收命令（全部须通过）

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
npm run replay:diff
```

关键验收点：
- `tests/unit/replay-diff.test.js`：合成 fixture 扰动检测、`--accept-intentional` 语义、报告格式断言全过。
- `npm run replay:diff`：对当前 golden fixture 跑 diff，exit 0（当前回放与 fixture 一致，因 W3 刚生成）。
- `docs/quality/golden-corpus-changelog.md`：含首条 W3 记录 + 模板说明。

## 6. 风险与回退

- **风险**：replay-diff 回放配置与 golden-seed-replay 漂移导致误报 diff。**缓解**：共享常量或注释标明来源；replay-diff.test.js 含"未扰动 fixture 应无 diff"用例。
- **风险**：`--accept-intentional` 被滥用跳过 changelog。**缓解**：flag 仅改 exit code，stdout 强制打印 changelog 提示；changelog 模板顶部声明义务；审计可查 git log 验证 `golden:regen` 后是否有 changelog commit。
- **风险**：replay-diff 跑 100 ticks 性能。**缓解**：golden-seed-replay 已跑 100 ticks < 1s，replay-diff 同量级。
- **回退**：若 replay-diff 对当前 fixture 报 diff（非工具 bug 而是回放本身非确定），停下回总规划师（触及 determinism 承诺边界）——不通过调工具掩盖 sim 非确定。

## 7. 回写现实状态

W4 完成后须回写：
- `docs/rfc/REPLAY_TRUST_ROADMAP.md` §4：标"replay-diff 工具已落地（W4）"。
- `docs/quality/golden-corpus-changelog.md`：首条记录。

## 8. 不做的事

- 不改 sim 热路径行为（replay-diff 是观察工具）。
- 不改 tickHash 算法（复用 W3）。
- 不改既有 golden fixture 内容（更新走 `golden:regen`）。
- 不让 `--accept-intentional` 跳过 changelog（Q3 裁定）。
- 不触碰 Stable World Envelope / public API contract / determinism 承诺边界。
- 若发现回放非确定（diff 非配置漂移而是 sim bug），停下回总规划师。
