# Aliveness Benchmark RFC

> World Kernel Trust Phase — 草案 v0.3，独立审计师已审（Pass with required edits）。
> v0.3 修订（响应审计 B3 + 采纳 S6/S8）：§0 明确性能归入 release gate 不重复入七维；§D5 Warning 判定从"误报率 >15%"改为"已知 violation 检出率"（避免小样本误报波动）；§5 D2 允许"3 Pass + 1 Warning = D2 Warning"中间态。
> v0.2 修订：delta 不再绝对、narrative checker 不过度承诺、Character Continuity 拆分多指标、七维补 owner 与测试入口。

## 0. 范围

把"对标 Linux/macOS/Minecraft"转译为可验证维度。"对标"对 Foundation Alpha 阶段单人开发项目在单次会话内客观不可达成，本 RFC 的作用是把模糊口号转成**七维度 Pass/Warning/Gap 报告**，每维度指定标准、owner、最小测试入口。

**审计 S6 声明**：七维度聚焦 persistent world kernel 的世界/角色/认知/因果/叙事/社会/域能力，**不**单列性能维度。性能与稳定性归入 Quality Gate RFC 的 Release blocker（`npm run perf:check`）守护，不重复入七维，避免"对标 Minecraft"被误读为"性能对标"。读者若疑惑"为何无性能维度"，见本声明与 QUALITY_GATE_RFC。

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
- 测试入口：narrative regression corpus（待建，最小集 ≥10 条已知 violation 样本启动）
- Owner：narrative 层
- **Warning 判定（审计 B3 修正）**：原"checker 误报率 > 15% 时降级"在小样本下不可靠（10 条样本，2 条误报即 20%）。改为以**已知 violation 检出率**为 Warning 信号——即 corpus 中已标注的 violation 样本，checker 能检出的比例。检出率 < 80% 发 Warning（checker 漏报风险），检出率稳定 ≥ 80% 维持 Pass。误报率作为**辅助信号**记录但不触发降级（小样本下误报率统计无意义）；corpus 扩到 ≥30 条后再考虑把误报率纳入 Warning 判定。

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

**W7 落地状态**：报告制度已落地（W7）。`scripts/aliveness-report.js` 生成器跑测试命令（npm test / test:domain / perf:check / replay:diff）捕获输出 → 按七维提取证据 → 产 markdown 报告，状态从测试输出提取（非手写状态表）。`package.json` 新增 `aliveness:report` script。首版报告 `docs/quality/aliveness-report.md` 七维齐全：D1 Warning（L4 降级 v2.2，含根因摘要 + 诊断证据指向）/ D2 Pass / D3 Warning / D4 Pass / D5 Gap（corpus 未建 W8）/ D6 Warning / D7 Pass。D1 真实反映"世界可序列化和基础恢复可用，但截断续跑 fidelity 未达 v2.1"（总规划师要求）。

## 4. 不做的事

- 不承诺 narrative 语义完备。
- 不把"500 tick 不发散"等同于 Character Continuity。
- 不允许维度报告无测试入口引用。
- 不把性能单列为第八维度（归入 Quality Gate，见 §0 声明）。

## 5. D2 中间态（审计 S8 采纳）

- **D2 Pass**：四子指标全 Pass。
- **D2 Warning**：3 Pass + 1 Warning（避免单个子项测试不稳完全卡死 D2，同时不降低 Pass 严格度）。
- **D2 Gap**：任一子指标 Gap，或 ≥2 子指标 Warning。

## 6. 审计裁定记录

- **B3（已修）**：§D5 Warning 判定从"误报率 >15%"改为"已知 violation 检出率 <80%"，避免小样本误报波动；误报率降为辅助信号。
- **S6（已采纳）**：§0 明确性能归入 Quality Gate release blocker，不单列第八维。
- **S7（裁定）**：corpus ≥10 启动可接受，受 B3 修正约束（误报率不再触发降级）。
- **S8（已采纳）**：§5 增加 D2 中间态（3 Pass + 1 Warning = D2 Warning）。

## 7. v0.3 后待总规划师确认的问题

- D5 的 narrative regression corpus 首批 ≥10 条 violation 样本，来源（人工构造 / 历史叙事抓取）需明确，属任务波次而非 RFC。
- D3 当前断言为"非饥饿底线"，是否在 v2.1 升级为精确跨 agent 知识传播断言，需评估 knowledge 层实现成本。
