# W7 任务卡 — Aliveness 七维报告制度 + 维度口径固化

> Lane: P3 Aliveness
> 触及边界: **否**（新建报告文档 + 生成脚本，不动 sim 行为、不动 Stable Envelope、不改既有测试逻辑）
> 状态: 待执行
> 依赖: W1-W6 已完成（L4 降级作为 D1 输入）

## 1. 背景

ALIVENESS_BENCHMARK_RFC v0.3 §3 定义报告制度：每维度报告必须含标准原文、测试入口路径、最近一次测试结果（命令输出引用）、owner。**禁止仅写"已达标"而无测试输出引用**——报告生成器必须附 `npm test` / `npm run test:domain` 等命令的实时输出片段。报告落点 `docs/quality/aliveness-report.md`，每次 release 重新生成。

总规划师要求：W6 L4 降级必须作为 D1 World Persistence 的 Warning/Gap 输入，报告真实反映"世界可序列化和基础恢复可用，但截断续跑 fidelity 未达 v2.1"。

当前状态：无 `docs/quality/aliveness-report.md`；七维口径散在 RFC，无固化产物。

W7 落地：首版 aliveness report + 生成脚本（从测试输出提取证据，非手写状态表）+ 维度口径固化。

## 2. 写入边界（执行仅可改/新建这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `scripts/aliveness-report.js` | 新建 | 生成器：跑测试命令捕获输出 → 按七维提取证据 → 产 markdown 报告；每维度含标准/入口/输出引用/owner |
| `docs/quality/aliveness-report.md` | 新建（生成） | 首版报告：七维 + sanity check，含真实测试输出引用 |
| `package.json` | 增 script | `aliveness:report`: `node scripts/aliveness-report.js` |

**不得改**：sim 热路径行为、Stable Envelope、既有测试逻辑、tickHash 算法、其他 src/ 代码、public API contract。

## 3. 七维口径固化（ALIVENESS_BENCHMARK_RFC §1 落地）

每维度在报告中固定为：标准 / 测试入口 / 最近测试结果（输出引用）/ owner / 状态（Pass/Warning/Gap）。首版基线状态：

| 维度 | 测试入口 | owner | 首版状态 | 说明 |
|---|---|---|---|---|
| D1 World Persistence | `tests/unit/persistence-trust.test.js` + golden-seed-replay L1-L3 | store 层 | **Warning** | 基础恢复可用，但 L4 截断续跑降级 v2.2（toWorldState 丢失累积 memory） |
| D2 Character Continuity | serialization-roundtrip + golden-seed-replay（4 子指标） | agent memory/psychology/social 层 | Pass | 4 子指标：memory/need/relationship/personality continuity |
| D3 Epistemic Correctness | `tests/e2e/alice-bob-epistemic-boundary.test.js` | knowledge 层 | Warning | 当前断言为"非饥饿底线"，精确跨 agent 知识传播验证偏弱 |
| D4 Causal Consequence Writeback | `tests/unit/effects/` + golden seed replay | effects 层 | Pass | typed delta 体系完整，PositionDelta 已守护 |
| D5 Grounded Narrative Faithfulness | narrative regression corpus（待建，W8） | narrative 层 | **Gap** | corpus 未建，FactConsistencyChecker 实验性 |
| D6 Multi-Agent Social Emergence | `tests/integration/agent.test.js` + e2e epistemic | social 层 | Warning | social contagion 未入 perf:check 监控 |
| D7 Domain Portability | `npm run test:domain` + compatibility.test.js | domain 层 | Pass | DEFAULT_DOMAIN_ID 解耦 + PhysiologyRuntime 户外词清理完成 |

**Sanity check**：500 tick 不单调发散（golden-seed-replay 100 ticks 稳定 + perf:check 通过）。

**D1 必须真实反映 L4 降级**（总规划师要求）：报告 D1 部分须含 W6 根因摘要 + "世界可序列化和基础恢复可用，但截断续跑 fidelity 未达 v2.1"表述 + 指向 `tests/unit/replay-trust-l4.test.js` 诊断证据。

## 4. 生成器设计（ALIVENESS_BENCHMARK §3 反"手写状态表"）

`scripts/aliveness-report.js`：

1. 定义七维配置（标准 / 测试入口 / owner / 预期状态）。
2. 跑测试命令捕获输出：
   - `npm test -- --reporter=dot`（捕获 pass/fail 计数）
   - `npm run test:domain`
   - `npm run perf:check`
   - `npm run replay:diff`
3. 对每维度的测试入口，从输出提取该测试文件的通过状态（vitest dot reporter 输出含文件名 + pass/fail）。
4. 产 markdown：每维度一节，含标准/入口/输出引用片段/owner/状态。
5. D1 特殊处理：硬编码 W6 L4 降级事实（根因 + 指向诊断测试），因这是已定稿结论非实时测试结果。
6. D5 特殊处理：标注 corpus 未建（W8 待启动），状态 Gap。
7. 报告顶部含生成时间 + 测试命令快照 hash（便于判 staleness）。

**纪律**：生成器跑真实测试命令取输出，不手写"已达标"。若某维度测试入口在输出中找不到，标 Gap 并提示。

## 5. 验收命令（全部须通过）

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
npm run replay:diff
npm run aliveness:report
```

关键验收点：
- `scripts/aliveness-report.js`：能跑测试命令、提取输出、产 markdown，exit 0。
- `docs/quality/aliveness-report.md`：七维齐全，每维含标准/入口/输出引用/owner/状态；D1 含 L4 降级事实；D5 标 Gap。
- 报告中无"已达标"而无输出引用的维度。

## 6. 风险与回退

- **风险**：生成器解析 vitest 输出脆弱（reporter 格式变化）。**缓解**：用稳定字段（Test Files / Tests 计数行 + 文件名行）；解析失败时标"输出解析失败"而非造假。
- **风险**：跑全测试命令慢（~10s × 多命令）。**缓解**：生成器串行跑必要命令，总时长 < 30s 可接受；报告注明生成耗时。
- **回退**：若生成器对某维度提取失败，该维度标"证据缺失"并提示，不强行填 Pass。

## 7. 回写现实状态

W7 完成后须回写：
- `docs/rfc/ALIVENESS_BENCHMARK_RFC.md` §3：标"报告制度已落地（W7），首版报告见 docs/quality/aliveness-report.md"。

## 8. 不做的事

- 不改 sim 热路径行为。
- 不手写报告状态表（必须从测试输出提取）。
- 不掩盖 D1 L4 降级（总规划师要求真实反映）。
- 不实现 D5 corpus（W8 单独波次）。
- 不触碰 Stable World Envelope / public API contract / determinism 承诺边界 / release gate 规则。
- 不为让某维度变 Pass 而调测试标准。
