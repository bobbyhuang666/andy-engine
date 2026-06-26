# W2 任务卡 — R5 模块守护判定工具

> Lane: P1 Governance
> 触及边界: **否**（仅新增扫描测试与脚本，不改既有 release gate 行为；R5 生效条件是本工具先落地，落地前不得声称"全守护"）
> 状态: 待执行
> 依赖: 无（W1 已完成，但无数据依赖）

## 1. 背景

QUALITY_GATE_RFC v0.3 §6 定义了 R5"未守护模块"判定流程，但判定机制尚未实现（审计 B1）。当前 `tests/source-scan.test.js` 只做 campus terms / banned API / deterministic API / semantic profile / chinese fallback / bobby 六类扫描，**不含** module-guard import 路径判定；`docs/quality/module-guard-manifest.md` 亦未创建。

W2 落地 §6 的两段式判定的**主判定**（source-scan + test-manifest）：静态扫描测试文件的 require/import，解析到实际文件，递归跟踪上游 require 以构建可达性集合（覆盖 transitive / facade 转发），与 `src/**/*.js`（排除 native）比对。辅助判定（coverage artifact 0% 但可达 = 弱守护）作为 warning 记录，不阻塞。

## 2. 写入边界（执行仅可改/新建这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `scripts/module-guard-scan.js` | 新建 | 扫描器：解析 tests/**/*.test.js 的 require/import 字面量 → 解析绝对路径 → 递归跟踪 require → 构建 src 模块可达性集合；输出 manifest（守护/弱守护/未守护） |
| `tests/module-guard.test.js` | 新建 | 调用扫描器，断言未守护模块数 = 0；校验 manifest 与扫描结果一致（防 stale manifest） |
| `docs/quality/module-guard-manifest.md` | 新建（生成） | 扫描器产出的 manifest：每个 src 模块一行，状态 + 是否有直接测试入口 + 备注 |

**写入边界偏差说明**：路线图原列 `tests/source-scan.test.js` 增补。该文件已 600 行，混入可达性图逻辑会损害可读性。改为独立 `tests/module-guard.test.js` + 共享脚本 `scripts/module-guard-scan.js`，目标一致（守护 src 模块全覆盖），属普通实现选择，不触及阶段边界。

**不得改**：任何 src/ 代码、既有测试、release gate 命令、vitest.config.js、package.json（除非需加 `module-guard` script，但可不上 script，测试直接跑）。

## 3. 扫描器算法

1. 枚举 `src/**/*.js`，排除 `*.native.js`（与 coverage.exclude 一致）与 `__tests__/`。共约 147 模块。
2. 枚举 `tests/**/*.test.js`。
3. 对每个测试文件，正则提取 `require('...')` / `require("...")` / `from '...'` / `from "..."` 字面量（仅静态字符串，跳过模板串变量）。
4. 相对路径基于测试文件位置解析为绝对路径（支持省略 `.js` 扩展、`index.js` 目录解析）。
5. 对每个解析命中的文件，递归提取其 require/import（深度限制防环，如 10 层），构建可达性集合 `reachable`。
6. 对每个 src 模块判定：
   - 被任一测试**直接** require/import → **守护**（有直接测试入口）
   - 经递归上游可达但无直接测试入口 → **守护（间接）**（经 facade / 上游模块到达）
   - 不可达 → **未守护**（Release blocker 候选）
7. 辅助：若 `coverage/coverage-summary.json` 存在，可达但 0% 覆盖 → 标 **弱守护**（warning）；coverage artifact 不存在时跳过此档，仅凭可达性判定。

## 4. 验收命令（全部须通过）

```bash
npm test                    # 含新 module-guard.test.js，0 failure
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
```

关键验收点：
- `tests/module-guard.test.js`：断言未守护模块数 = 0，通过。
- `docs/quality/module-guard-manifest.md`：包含全部 147 个 src 模块，每模块有状态行；未守护清单为空。
- manifest 顶部标注生成时间与扫描器命令，便于判 staleness。

## 5. 风险与回退

- **风险**：静态 require 解析对动态 `require(variable)` 无效，可能漏报可达。**缓解**：当前代码库 require 多为静态字面量（采样确认）；漏报只会让模块落到"未守护"，触发补测试而非误放行，偏保守安全。
- **风险**：facade 转发链深，递归解析性能。**缓解**：147 模块规模小，深度限制 10 足够。
- **回退**：若 `npm test` 因新测试 fail（发现真实未守护模块），不强行合入；先补该模块测试或在本波次记录为已知 Gap。

## 6. 回写现实状态

W2 完成后须回写：
- `docs/rfc/QUALITY_GATE_RFC.md` §6 末段"审计 B1 修正"：把"R5 判定机制尚未实现"改为"R5 主判定工具已落地（W2），辅助判定（coverage 0% 弱守护）依赖 coverage artifact 按需生成"。
- `docs/quality/module-guard-manifest.md`：首版 manifest 落地。

## 7. 不做的事

- 不把 R5 当可执行 release blocker 调用（工具刚落地，先观察稳定性；正式作为 blocker 调用需后续波次确认）。
- 不为提升守护数补无意义测试（阶段边界）。
- 不改 coverage.exclude 规则。
- 不触碰 Stable World Envelope / public API contract / determinism 承诺边界 / release gate 规则。
