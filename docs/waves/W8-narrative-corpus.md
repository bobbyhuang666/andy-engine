# W8 任务卡 — D5 narrative regression corpus 首批

> Lane: P3 Aliveness（收尾波次）
> 触及边界: **否**（新建 fixture 样本 + 测试，不动 sim 行为、不动 FactConsistencyChecker 逻辑、不动 Stable Envelope）
> 状态: 待执行
> 依赖: W7（报告制度已落地，D5 标 Gap 待本波次补 corpus）

## 1. 背景

ALIVENESS_BENCHMARK_RFC v0.3 §D5（B3 修正后）：
- v2.1 目标 = narrative regression corpus + violation tracking，不承诺语义完备。
- FactConsistencyChecker 当前实验性/regex-based，仅作 violation 信号源，不作"叙事正确性"最终判定。
- B3 修正：Warning 判定从"误报率 >15%"（小样本不可靠）改为"已知 violation 检出率 <80%"；误报率降为辅助信号，corpus 扩到 ≥30 后再考虑纳入 Warning 判定。
- corpus 最小集 ≥10 条启动（S7 裁定可接受，受 B3 约束）。

FactConsistencyChecker 6 类校验（`src/narrative/FactConsistencyChecker.js`）：角色名 / 地名 / 事件知识 / 时间冲突 / 新内容 / agent-location 声明。

W8 落地：首批 ≥10 条已知 violation 样本 + 检出率统计测试，建立 violation tracking 基线。不追求语义完备，只建立基线。

## 2. 写入边界（执行仅可改/新建这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/fixtures/narrative-violations/` | 新建目录 | 存放 violation 样本 JSON（每条含 llmOutput / grounding / expectedViolations / category） |
| `tests/fixtures/narrative-violations/index.js` | 新建 | 导出 corpus 数组（供测试 require） |
| `tests/unit/narrative-violation-corpus.test.js` | 新建 | 遍历 corpus，对每条跑 FactConsistencyChecker，断言检出 expectedViolations；统计整体检出率 |

**不得改**：FactConsistencyChecker 逻辑（不改 regex/校验规则）、sim 热路径行为、Stable Envelope、其他 src/ 代码、既有测试。

## 3. corpus 样本设计

首批 ≥10 条，覆盖 6 类校验，每条结构：

```json
{
  "id": "nv-001",
  "category": "unknown_character",
  "description": "LLM 提到 grounding 未知角色",
  "llmOutput": "今天小明来找你聊天了。",
  "grounding": { "allowedFacts": [...], "metadata": { "agentId": "maya" } },
  "expectedViolations": [{ "type": "unknown_character", "name": "小明" }]
}
```

样本分布（≥10 条）：
- unknown_character（角色名）：≥2 条（含中文名 2-4 字边界用例）
- unknown_location（地名）：≥2 条
- event_knowledge（事件知识）：≥2 条（LLM 编造未发生事件）
- time_conflict（时间冲突）：≥1 条
- new_content（新内容）：≥1 条（LLM 引入 grounding 外概念）
- agent_location_claim（agent-location 声明）：≥2 条

**设计纪律**：
- 样本必须真实可复现（grounding 用真实 FactSchema 结构，不造假字段）。
- expectedViolations 必须对应 checker 实际能检出的 violation type。
- 样本来源：人工构造针对每类校验的典型 violation（非历史叙事抓取——当前无历史叙事库）。

## 4. 检出率统计测试（B3 修正落地）

`tests/unit/narrative-violation-corpus.test.js`：

1. 遍历 corpus 每条样本。
2. 跑 `checker.check(llmOutput, grounding)`。
3. 对每条断言：检出的 violations 包含 expectedViolations 的 type（至少检出预期类别）。
4. 统计整体检出率 = (成功检出 expectedViolation 的样本数) / (corpus 总数)。
5. B3 裁定：检出率 <80% → 测试 fail（暴露 checker 漏报）；≥80% → pass。
6. 误报率作为辅助记录（test 输出打印，不触发 fail），待 corpus 扩到 ≥30 后纳入。

**不做什么**：
- 不为提检出率调 checker 逻辑（checker 修复属另一议题，W8 只建 corpus + 测检出率）。
- 不承诺语义完备。
- 不把误报率作为 fail 条件（B3）。

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
- `tests/unit/narrative-violation-corpus.test.js`：corpus ≥10 条，检出率 ≥80%，通过。
- `npm run aliveness:report`：D5 状态从 Gap 升级（corpus 已建，若检出率 ≥80% 可升 Warning 或 Pass，取决于是否达语义完备——当前不达语义完备故仍为 Warning，但 Gap 消除）。

## 6. 风险与回退

- **风险**：某些 violation 样本 checker 检不出（regex 局限）导致检出率 <80%。**处理**：如实记录漏报样本，不调 checker 掩盖；若检出率严重不足（<50%），停下评估是否需 checker 修复（属另一议题，不属 W8）。
- **风险**：grounding 构造复杂（FactSchema 字段多）。**缓解**：参考既有 narrative 测试的 grounding 构造方式。
- **回退**：若某类 violation 无法构造真实样本，该类减至 1 条或标注"待补"，不强行凑数。

## 7. 回写现实状态

W8 完成后须回写：
- `docs/rfc/ALIVENESS_BENCHMARK_RFC.md` §D5：标"corpus 首批已建（W8，≥10 条），检出率统计已落地"。
- `docs/quality/aliveness-report.md`：重生成，D5 状态从 Gap 升级（corpus 已建）。

## 8. 不做的事

- 不改 FactConsistencyChecker 逻辑（regex/校验规则）。
- 不承诺 narrative 语义完备。
- 不把误报率作为 fail 条件（B3 裁定）。
- 不为提检出率调 checker 掩盖漏报。
- 不触碰 Stable World Envelope / public API contract / determinism 承诺边界 / release gate 规则。
- 不追求一次性实现全部 benchmark（W8 只建首批 corpus + 检出率基线）。
