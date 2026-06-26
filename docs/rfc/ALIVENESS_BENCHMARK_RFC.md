# Aliveness Benchmark RFC

> World Kernel Trust Phase — 草案 v0.2，待独立审计师审查。仅文档，无实现。
> 上一版变更：delta 不再绝对、narrative checker 不过度承诺、Character Continuity 拆分多指标、七维补 owner 与测试入口。

## 0. 范围

把"对标 Linux/macOS/Minecraft"转译为可验证维度。"对标"对 Foundation Alpha 阶段单人开发项目在单次会话内客观不可达成，本 RFC 的作用是把模糊口号转成**七维度 Pass/Warning/Gap 报告**，每维度指定标准、owner、最小测试入口。

## 1. 七维度框架

每维度三档：**Pass**（达标准入）/ **Warning**（达标但有不稳）/ **Gap**（未达）。每维度指定 **owner** 与 **最小测试入口**。

### D1 World Persistence

- 标准：世界状态可序列化→反序列化→续跑，结构无损。
- 测试入口：`tests/unit/persistence-trust.test.js`（G1/G2/G3/G6）
- Owner：store 层
- Warning 条件：迁移路径（v0→v1）构造 runtimeSnapshot 的张力未消除

### D2 Character Continuity

不再等同"500 tick 不发散"，拆分为 4 个子指标，全部 Pass 才算 D2 Pass：

- **memory continuity**：种子记忆 + 累积记忆在续跑后不丢失、不重复
  - 测试入口：`tests/unit/serialization-roundtrip.test.js` + `tests/unit/golden-seed-replay.test.js`
  - Owner：agent memory 层
- **need trajectory**：需求值序列无 NaN / Infinity / 越界
  - 测试入口：golden seed replay 的 tickHash 稳定性（数值异常会让 hash 漂移）
  - Owner：psychology / needs 层
- **relationship continuity**：relationship strength 在续跑前后数值连续
  - 测试入口：`tests/unit/serialization-roundtrip.test.js`
  - Owner：social 层
- **personality/BehaviorField stability**：序列化往返后向量分量等值
  - 测试入口：`tests/unit/serialization-roundtrip.test.js`
  - Owner：psychology 层

"500 tick 不单调发散"降级为 **sanity check**（见 §2），不再等同 Character Continuity。

### D3 Epistemic Correctness

- 标准：AGENT_STATE 视为私有知识；其他 agent 仅凭 direct/observed/told/inferred 证据获知
- 测试入口：`tests/e2e/alice-bob-epistemic-boundary.test.js`
- Owner：knowledge 层
- Warning 条件：当前断言为"非饥饿底线"，精确跨 agent 知识传播验证仍偏弱

### D4 Causal Consequence Writeback

- 标准（修正，不再绝对）：
  - **world-changing event** 必须产生 typed delta（经 `EventEffectPipeline` → `EffectCommitter`）
  - **observation / narrative-only event** 必须显式分类并说明无写回原因（在事件 type 上标注 `narrative-only` / `observation`）
- typed delta 体系实际存在：`StateDelta` 基类 + `EmotionDelta` / `NeedDelta` / `MemoryDelta` / `RelationshipDelta` / `PositionDelta` / `LocationMeaningDelta` / `FutureTendencyDelta`
- 测试入口：`tests/unit/effects/`（含 `position-delta.test.js`）+ golden seed replay
- Owner：effects 层
- Gap 条件：若发现某 event type 既无 delta 又未标注 narrative-only，记 Gap

### D5 Grounded Narrative Faithfulness

- 标准（修正后降低承诺）：
  - v2.1 目标 = **narrative regression corpus + violation tracking**，**不**承诺语义完备
  - `FactConsistencyChecker` 当前为实验性 / regex-based（`src/narrative/FactConsistencyChecker.js` 源码自述"实验性 / 基于正则 / 已知中文名/地名误报"），仅作为 violation 信号源，不作为"叙事正确性"最终判定
- 测试入口：narrative regression corpus（待建，最小集 ≥10 条已知 violation 样本）
- Owner：narrative 层
- Warning 条件：checker 误报率 > 15% 时降级为 advisory，不计入 violation

### D6 Multi-Agent Social Emergence

- 标准：≥2 agent 在共享世界，social graph 关系演化可观测、可序列化
- 测试入口：`tests/integration/agent.test.js` + `tests/e2e/alice-bob-epistemic-boundary.test.js`
- Owner：social 层
- Warning 条件：social contagion 路径未纳入 `perf:check` 监控

### D7 Domain Portability

- 标准：同一 engine 跑 campus / tavern / 自定义 domain，core src 不含具体世界词
- 测试入口：`npm run test:domain` + `tests/compatibility.test.js`
- Owner：domain 层
- 当前状态：已达（DEFAULT_DOMAIN_ID 解耦 + PhysiologyRuntime 户外词清理已完成）

## 2. Sanity check（不计入七维 Pass，仅作回归信号）

- **500 tick 不单调发散**：作为 sanity check 而非 Character Continuity 等价物。若发散则阻塞 release，但通过不证明连续性达标（连续性由 D2 四个子指标证明）。

## 3. 报告格式与防"手写状态表"

每维度报告必须包含：标准原文、测试入口路径、最近一次测试结果（pass/fail/warning 的命令输出引用）、owner。**禁止**仅写"已达标"而无测试输出引用——报告生成器（人工或脚本）必须附 `npm test` / `npm run test:domain` 等命令的实时输出片段。

报告落点：`docs/quality/aliveness-report.md`，每次 release 重新生成。

## 4. 不做的事

- 不承诺 narrative 语义完备。
- 不把"500 tick 不发散"等同于 Character Continuity。
- 不允许维度报告无测试入口引用。

## 5. 待审计师裁定的问题

- D5 的 narrative regression corpus 最小集 ≥10 条是否过小，是否需先建立已知 violation 样本库再定阈值。
- D2 四个子指标全 Pass 才算 D2 Pass 是否过严，是否允许"3 Pass + 1 Warning"算 D2 Warning。
- "对标 Linux/macOS/Minecraft"的七维转译是否漏掉维度（如性能/可观测性/可扩展性），审计师可补充。
