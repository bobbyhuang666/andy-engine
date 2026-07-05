# Quality Gate RFC

> World Kernel Trust Phase — draft v0.3, reviewed with required edits.
> v0.3 修订（响应审计 B1/B2 + 采纳 S1）：§2 明确 `vitest.config.js` thresholds 须一并处理；§4 Merge blocker 纳入 R4 smoke:pack；§6 R5 判定机制未实现，不再声称"全守护"，明确 R5 生效条件。
> v0.2 修订：修正 facade 归类、区分 merge/release blocker、coverage 降为 trend metric、R5 两段式判定不再单赖 v8 归因。

## 0. 范围

Foundation Alpha 阶段（单人开发）的发布与合入门禁准则。本 RFC 把既有人工约定（`npm test && npm run test:domain && npm run check:boundaries && npm run smoke:pack`）写成可执行准则，**不**新增 CI 基础设施。

## 1. 阻塞分层

将阻塞分为两级，避免"一票否决"误伤日常开发：

- **Release blocker**：发布新版本（npm tag / release archive）前必须全绿。共五项（见 §3）。
- **Merge blocker**：PR 合入 `main` 前的最低门槛，是 Release blocker 的子集（见 §4）。

明确：当前没有"全公司级 CI gate"，release 由人工执行 §3 命令后人工确认。

## 2. Coverage 定位（不再作为阻塞）

- 全局 coverage **不作为 Foundation Alpha 的 Release blocker**。
- Coverage 作为 **trend metric + regression warning**：每次 release 记录当前 lines/statements/functions/branches 数值到 `docs/quality/coverage-trend.md`，若较上次 release 下降超过 3 个百分点（任意一项），发 warning，需在 release notes 说明原因。
- 成熟版本（Foundation Beta 起）可重新评估是否将 coverage 提升为 Release blocker。届时单独发 RFC，不在本 RFC 内承诺阈值。
- **v8 thresholds 处理**：W1 已执行：`vitest.config.js` 的 `coverage.thresholds` 块已移除；`package.json` `test:coverage` 修正为 `vitest run --coverage`（修正既有 watch-mode bug）；`npm run test:coverage` 现产出 coverage 报告且 exit 0，不再因阈值失败退出。coverage 数据进入 `docs/quality/coverage-trend.md` 供趋势追踪。W1 基线数值（v2.0.1）：stmts 80.56 / branches 68.46 / functions 77.96 / lines 82.48。

## 3. 五项 Release blocker

| # | 项 | 判定命令 | 通过标准 |
|---|---|---|---|
| R1 | 核心测试套件 | `npm test` | 0 failure |
| R2 | Domain 纯净度 | `npm run test:domain` | 0 failure |
| R3 | 边界保护 | `npm run check:boundaries` | 0 failure |
| R4 | 打包烟雾 | `npm run smoke:pack` | 0 failure |
| R5 | 无未守护 src 模块 | source-scan + test-manifest（见 §6） | 清单内每个 src 模块至少有一条直接或邻接测试入口 |

R5 的"未守护"判定见 §6，**不**以 v8 coverage 比例为唯一依据。

## 4. Merge blocker（PR 合入门槛）

Merge blocker = R1 + R2 + R3 + R4（审计 S1：smoke:pack 实测仅 `npm pack --dry-run`，成本极低，能在 PR 阶段就发现 `package.json` `files` 字段漂移，价值高于成本，故纳入 Merge blocker）。

R5（模块清单审计）成本较高，留作 release 前一次性校验。若 PR 改动涉及 src/ 模块增删，reviewer 可临时追加 R5 的 source-scan 部分。

## 5. Coverage 例外清单与理由

下列模块**允许**不出现在 v8 coverage 的"已覆盖"统计中，但**必须**有替代守护，理由逐项说明：

| 模块 | 真实性质 | 例外理由（替代守护） |
|---|---|---|
| `index.js` | public facade，含 `validateConfig`、`DomainRegistry` 构造、`RNG` 装配、`backgroundToMemories` 调用、`tick()` 转发 | **非**"无逻辑 barrel"。由 `tests/sdk.test.js`、`tests/sdk-smoke.test.js`、`tests/compatibility.test.js`、`tests/integration/engine.test.js` 守护 |
| `agent/Agent.js` | public compat facade，含 config 校验、subsystem 创建/恢复、action selection config 验证 | **非**"无逻辑 barrel"。由 `tests/compatibility.test.js`、`tests/integration/agent.test.js` 守护 |
| `src/agent/psychology/*.native.js` | native 绑定入口，当前无绑定，重新导出纯 JS | 不可达死代码，已从 coverage 分母排除；纯 JS 等价实现由同名非 native 模块测试覆盖 |
| `domain/index.js`、`facts/index.js`、`sdk/index.js`、`store/index.js` | public facade | 由各自 public API 测试守护 |
| `presets/**` | 预设数据，非代码逻辑 | 由 `test:domain` + 集成测试守护 |

注意：例外不等于免责。任何对 facade 的逻辑改动必须能指向一条 public API 测试；找不到则视为 R5 未守护。

## 6. R5 "未守护模块"判定流程（不依赖 v8 归因）

为规避 vitest v8 归因 bug（ESM import 导致部分模块 coverage 丢失），R5 采用**两段式判定**：

1. **主判定（source-scan + test-manifest）**：扫描 `src/**/*.js`，对每个模块，检查是否存在 import/require 它的测试文件（直接 import，或经其上游模块间接到达）。能找到至少一条 import 路径即视为"有测试入口"。
2. **辅助判定（coverage artifact）**：跑 `npm test -- --coverage` 生成的 coverage artifact 作为**辅助证据**，用于发现"被 import 但实际未执行"的模块。coverage 显示 0% 且 manifest 显示有 import → 视为"弱守护"，发 warning，不阻塞 release。

判定结论分三级：

- **守护**：有直接测试入口 ✓
- **弱守护**：有 import 路径但 coverage 0%（warning，记录到 `docs/quality/module-guard-manifest.md`）
- **未守护**：source-scan 找不到任何 import 路径 → **Release blocker**，必须在 release 前补测试或明确删除该模块。

**审计 B1 修正（v0.3）→ W2 落地后更新**：R5 主判定工具已落地（W2）。`scripts/module-guard-scan.js` 实现两段式判定的主判定（source-scan + test-manifest，递归可达性图）；`tests/module-guard.test.js` 驱动扫描并断言未守护模块不超过已知 Gap 白名单；`docs/quality/module-guard-manifest.md` 生成全量守护清单。

- 主判定已落地：147 模块全量判定，125 直接守护 / 21 间接守护 / 0 弱守护 / 1 已知 Gap。
- 辅助判定（coverage 0% 弱守护）依赖 coverage artifact 按需生成，当前未跑 `test:coverage` 时该档不触发。
- **已知 Gap**：`src/sdk/AndyTownAdapter.js`（Andy Town 外部服务适配层，非 Engine 逻辑，AGENTS.md 禁止 Engine Core 实现 Andy Town；文件未被任何 export/import 使用，属清理候选，本波次不动因超出写入边界）。Gap 原因记录于 `tests/module-guard.test.js` KNOWN_GAPS 白名单。
- R5 仍**不立即作为可执行 release blocker 调用**——工具刚落地，先观察稳定性；正式作为 blocker 调用需后续波次确认扫描器在各 PR 场景下不误报/漏报。

## 7. 不做的事

- 不在本 RFC 设定全局 coverage 阈值。
- 不把 coverage 例外模块视为"无需测试"。
- 不用 coverage 单一信号判定模块守护状态。

## 8. 审计裁定记录

- **B1（已修）**：R5 判定机制未实现，§6 已改为准确表述，明确 R5 生效条件。
- **B2（已修）**：§2 增加 vitest thresholds 处理条目，推荐方案 (c)。
- **S1（已采纳）**：Merge blocker 纳入 R4 smoke:pack。
- **S2（裁定）**：两段式分层设计本身合理，真正问题是 B1（机制未实现），判定标准不变。
- **S3（裁定）**：coverage 降为 trend metric 合理，方向不变。

## 9. 后续待办

- §2 thresholds 处理：**已落地**（W1，方案 c 已执行）。
- R5 判定工具实现属 W2 任务，本 RFC 仅定义标准与生效条件；工具落地后再回头验证"全守护状态"。
