# W1 任务卡 — coverage thresholds 移除 + trend 机制

> Lane: P1 Governance
> 触及边界: **release gate 规则**（总规划师已确认采纳 QUALITY_GATE §2 方案 (c)）
> 状态: 待执行 AI 调度
> 依赖: 无（W1 必须优先启动）

## 1. 背景

`vitest.config.js:31-36` 声明 thresholds（stmt 80 / branch 70 / func 85 / line 80）。实测 `npm run test:coverage` 因 functions 77.7% < 85、branches 68.0% < 70 而 fail（exit 1）。

QUALITY_GATE_RFC v0.3 §2 已定调：Foundation Alpha 阶段 coverage 不作为 release/merge blocker，仅作 trend metric。thresholds 移除是方案 (c) 的代码落地，让 `--coverage` 仅产报告数据、不因阈值失败退出。

另发现 `package.json` 的 `test:coverage` script 为 `vitest --coverage`（缺 `run`），会进入 watch 模式而非单次运行——W1 顺便修正。

## 2. 写入边界（执行 AI 仅可改这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `vitest.config.js` | 移除 `coverage.thresholds` 块（line 31-36） | 保留 `coverage.provider/reporter/exclude`，仅删 thresholds |
| `package.json` | `test:coverage` 改为 `vitest run --coverage` | 修正既有 watch-mode bug |
| `docs/quality/coverage-trend.md` | 新建 | 记录本次 release 的 coverage 数值作为基线条目 |
| `scripts/coverage-trend.js` | 新建（可选） | 从 coverage artifact 提取数值并 append 到 trend 文档；最小实现 |

**不得改**：`coverage.exclude`（native 排除规则不变）、其他 package script、任何 src/ 代码、任何测试。

## 3. 验收命令（全部须通过）

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
npm run test:coverage
```

关键验收点：
- 前五项：0 failure。
- `npm run test:coverage`：**产出 coverage 报告且 exit 0**（不再因阈值失败退出）。
- `docs/quality/coverage-trend.md`：包含至少一条基线条目（stmts/branches/funcs/lines 四值 + 时间戳 + engine version）。

## 4. 风险与回退

- **风险**：移除 thresholds 后无人监控 coverage 下滑。**缓解**：trend 文档 + RFC §2 的 3pp 回归 warning 规则；后续 W2 不依赖 coverage 阈值。
- **回退**：若验收命令任一失败，回退 `vitest.config.js` / `package.json` 改动，不强行合入。

## 5. 回写现实状态

W1 完成后须回写：
- `docs/rfc/QUALITY_GATE_RFC.md` §2：把 thresholds 处理条目从"推荐 (c)"改为"已落地 (c)"，记录移除的 commit。
- `docs/quality/coverage-trend.md`：建立基线条目。

## 6. 不做的事

- 不为补 coverage 数字加任何测试（阶段边界）。
- 不改 `coverage.exclude` 规则。
- 不动其他 release gate 命令。
- 不触碰 Stable World Envelope / public API contract / determinism 承诺边界。
