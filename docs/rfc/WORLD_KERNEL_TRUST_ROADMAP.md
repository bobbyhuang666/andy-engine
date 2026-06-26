# World Kernel Trust Phase — 波次路线图

> 状态：**总规划师已批准**。基于三份 v0.3 RFC（commit `0a49b4c`）拆解任务波次。
> 本文档只排波次与边界，不展开实现细节；每个波次启动前由架构师出任务卡，触及阶段边界时回总规划师确认。
> 执行 AI 在路线图边界内恢复调度，节奏：任务卡 → 执行 → 验收 → 回写现实状态。

## 0. 阶段定位

把 Andy Engine 从"功能可跑的 Foundation Alpha"推进到"世界内核可信"。核心不扩功能，而是建立可信世界内核的**制度、度量、演进机制**。

三主线优先级（总规划师定）：

```text
P1 Governance Lane   质量门槛制度落地
P2 Replay Lane       v2.1 replay trust 路线（核心护城河）
P3 Aliveness Lane    报告制度与维度口径（先口径后 corpus）
```

## 1. 阶段边界（总规划师划定，全程有效）

- 不做 StoryArc runtime。
- 不做 Andy Town / Bobby / UI。
- 不做 npm publish。
- 不做大型新 feature。
- 不为 coverage 数字补无意义测试。
- 触碰 Stable World Envelope / public API contract / determinism 承诺边界 / release gate 规则，必须回总规划师确认。

## 2. 波次总览

| 波次 | Lane | 主题 | 是否触及边界 | 执行 AI |
|---|---|---|---|---|
| W1 | Governance | coverage thresholds 移除 + trend 机制 | 是（release gate 规则）→ **需总规划师已确认** | 待启动 |
| W2 | Governance | R5 模块守护判定工具 | 否 | 待启动 |
| W3 | Replay | tickHash 设计落地 + golden corpus metadata 升级 | 否 | 待启动 |
| W4 | Replay | replay-diff 工具 + 人审流程 | 否（不动契约） | 待启动 |
| W5 | Replay | L2 多 seed + L3 跨进程回放验证 | 否 | 待启动 |
| W6 | Replay | L4 截断续跑验证（实测后定 v2.1/v2.2） | 不预判；实测有损需改 schema 时才回确认 | 待启动 |
| W7 | Aliveness | 七维报告制度 + 维度口径固化 | 否 | 待启动 |
| W8 | Aliveness | D5 narrative regression corpus 首批 | 否 | 待启动 |

波次间允许并行（不同 Lane 互不阻塞），但同 Lane 内顺序执行。

## 3. P1 Governance Lane

### W1 coverage thresholds 移除 + trend 机制

- **触及边界**：release gate 规则变更。总规划师已确认采纳 QUALITY_GATE §2 方案 (c)。
- **写入边界**：`vitest.config.js`（移除 thresholds）、coverage trend 文档/脚本、相关 package script（如 `test:coverage` 语义对齐）。
- **验收命令**：`npm test`、`npm run test:domain`、`npm run check:boundaries`、`npm run smoke:pack`、`npm run perf:check` 全过；`npm run test:coverage` 产出报告但不因阈值失败退出。
- **文档同步**：更新 QUALITY_GATE_RFC §2 现实状态（thresholds 已移除）。
- **风险**：移除 thresholds 是公开行为，需确认不破坏既有 `test:coverage` 调用方。

### W2 R5 模块守护判定工具

- **触及边界**：否。仅新增扫描测试，不改既有 release gate 行为（R5 生效条件是工具先落地）。
- **写入边界**：`tests/source-scan.test.js` 增补 module-guard import 路径判定；`docs/quality/module-guard-manifest.md` 生成脚本。
- **验收**：工具能列出全部 src 模块及其守护状态（守护/弱守护/未守护）；当前未守护清单为空或已补测试。
- **纪律**：工具落地前不得声称"全守护"，不得把 R5 当可执行 blocker 调用（QUALITY_GATE §6 已写入）。

## 4. P2 Replay Lane（核心护城河）

### W3 tickHash 设计落地 + golden corpus metadata 升级

- **写入边界**：新模块（如 `src/store/world/tickHash.js` 或挂靠既有 store/world 工具）、既有 golden fixture 文件升级 `_meta` 字段。
- **依据**：REPLAY_TRUST §6（canonical JSON + 1e9 量化 + sha256）、§3（metadata 字段）。
- **验收**：现有 golden seed replay fixture 补齐 `_meta`；tickHash 在 seed42/100ticks 上稳定可复算。
- **注意**：`_meta.generationCommand` 引用的 `npm run golden:regen` 当前不存在（S4），本波次须对齐真实脚本路径。

### W4 replay-diff 工具 + 人审流程

- **写入边界**：新脚本（`scripts/replay-diff.js`）、`docs/quality/golden-corpus-changelog.md` 模板。
- **依据**：REPLAY_TRUST §4（diff 报告 + 默认 fail + 人审）、§5（changelog 义务）、`--accept-intentional` 语义（Q3：仅跳过立即 fail 不跳过 changelog）。
- **验收**：工具能产出 tick-by-tick diff 报告；有意变更走 changelog 流程可更新 fixture。
- **触及边界**：否。不动契约，不动 Stable Envelope。

### W5 L2 多 seed + L3 跨进程回放验证

- **写入边界**：扩展 golden corpus fixture（≥3 个 seed）；replay-diff 跨进程用例。
- **依据**：REPLAY_TRUST §7 表 L2/L3。
- **验收**：≥3 seed 各 100 ticks hash 全匹配；同 fixture 不同进程启动 hash 全匹配。
- **前提**：依赖 W3（tickHash）+ W4（replay-diff）先行。

### W6 L4 截断续跑验证

- **触及边界**：**不预判**。允许先做 L4 验证测试与 replay 对比（总规划师裁决 2，采纳"先实测有损再确认"）。
- **写入边界**：续跑测试用例；replay 对比工具。
- **依据**：REPLAY_TRUST §7 Q1（L4 保留 v2.1，实测有损再降 v2.2）。
- **验收**：从 tick N 快照续跑到 tick M，与全程回放 tick M hash 一致。
- **停止条件**：实测发现 `fromWorldState` / `runtimeSnapshot` / schema 无法支持续跑，且需改 Stable World Envelope 或 public persistence contract → **立即停止并回总规划师确认**。仅测试/replay 工具层补验证不触碰 schema，无需提前单独批准。
- **决策点**：实测通过→v2.1 L4 达标；实测有损→降级 v2.2 并在 RFC 记录原因。

## 5. P3 Aliveness Lane

### W7 七维报告制度 + 维度口径固化

- **写入边界**：`docs/quality/aliveness-report.md` 模板与生成约定。
- **依据**：ALIVENESS_BENCHMARK §3（报告格式，禁止"手写状态表"）、§0（性能归 release gate 不入七维）。
- **验收**：每维度有标准原文、测试入口路径、最近测试输出引用、owner；当前状态用现有测试入口填一遍基线。
- **注意**：不急着实现全部 benchmark，先固化口径。

### W8 D5 narrative regression corpus 首批

- **写入边界**：`tests/fixtures/narrative-violations/` 或等价位置；violation 样本标注。
- **依据**：ALIVENESS_BENCHMARK §D5（B3 修正后：检出率 <80% 发 Warning，误报率降为辅助信号）。
- **验收**：首批 ≥10 条已知 violation 样本；checker 检出率统计可产出。
- **前提**：W7 口径固化先行，避免 corpus 与报告维度错位。

## 6. 调度规则（总规划师已批准）

- 同一 Lane 内必须顺序执行。
  - Governance：W1 → W2
  - Replay：W3 → W4 → W5 → W6
  - Aliveness：W7 → W8
- 不同 Lane 可有限并行，但有优先级：
  - **W1 必须优先启动**（修 release gate 规则冲突）。
  - W2 和 W3 可并行。
  - W7 可在 W3/W4 期间并行做文档/报告口径。
  - W8 必须等 W7 完成。
  - W5 必须等 W3/W4 完成。
  - W6 必须等 W3/W4/W5 完成。
- 架构师可在边界内调度执行 AI，普通小任务不回问总规划师。
- 触及边界的波次单独走总规划师确认流。
- 每个波次启动前出任务卡（写入边界、验收命令、风险），任务卡归档到 `docs/waves/`。
- 波次完成后回写 RFC 现实状态。

## 7. 总规划师裁决记录

- **裁决 1**：路线图整体批准（W1-W8）。
- **裁决 2**：W6 采纳"先按实测有损再确认"——不预判触碰 Stable Envelope；实测有损需改 schema 时才回确认。
- **裁决 3**：三 Lane 允许有限并行，调度规则见 §6。
- **W1 已确认**：采纳 QUALITY_GATE 方案 (c)，移除 coverage thresholds，coverage 作为 trend metric。W1 可作为首个任务波次启动。
