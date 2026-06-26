# v2.4 Direction Selection Brief

> 阶段：v2.4 方向选择（仅 brief，不写代码，不派执行 AI）
> 状态：待总规划师选定方向。选定后出对应 RFC/任务卡。
> 来源：v2.3 关闭后的战略复盘。v2.2/v2.3 已把世界内核底座补扎实，下一步决定补哪个能力维度或做 release readiness。

## 0. 当前状态

```text
Foundation Alpha → World Kernel Trust → L4 Resume Fidelity → Memory Consistency & Observability
```

- Replay Trust：L1-L4 ✅
- Aliveness：D1/D2/D4/D7 Pass；D3/D5/D6 Warning；0 Gap
- Memory：Consistency + characterization + observability ✅
- Snapshot compaction：deferred（非当前问题）

3 个 Warning 维度（D3 认知 / D5 叙事 / D6 社会涌现）各有待补，另有 release readiness 方向。本 brief 评估四候选，不默认继续修内部。

---

## A. Knowledge / Epistemic Strengthening

### 为什么现在做？
D3（Epistemic Correctness）当前 Warning——e2e 测试（`tests/e2e/alice-bob-epistemic-boundary.test.js`）断言为"非饥饿底线"，精确跨 agent 知识传播验证偏弱。v2.2/v2.3 把世界内核底座（persistence/replay/memory）补扎实后，**认知层是 persistent world kernel 的核心差异化**——Andy 不靠 LLM 编故事，靠"谁知道什么"维持世界真实性。

### 战略价值
直接强化 Andy 的"persistent world kernel"定位：direct/observed/told/inferred 证据链是 Andy 与纯 prompt agent 的本质区别。grounding package 更可信 → narrative 更可约束 → 世界演化更真实。

### 是否触碰核心边界？
- 不改 Stable Envelope（KnowledgeStore 持久化已就位）。
- 不改 schemaVersion / public API（D3 是测试与 knowledge 层强化）。
- 可能扩 KnowledgeStore API（若加证据链查询），属内部扩展非 contract 变更。

### 预计风险与波次规模
- 风险：中。认知逻辑复杂，但 v2.3 characterization tests 提供部分安全网。
- 波次：3-4 波（证据链建模 + 跨 agent 传播测试 + grounding 强化 + e2e 断言升级）。

### 如何验收？
- D3 从 Warning 升 Pass（aliveness-report）。
- 新增 epistemic regression tests（证据链 direct/observed/told/inferred 覆盖）。
- 全量门控 + L4 仍 pass。

### 是否应继续推迟？
**不应推迟**。认知是 Andy 核心差异化，且 D3 是当前 Warning 中最贴 persistent world kernel 定位的。

---

## B. Narrative Faithfulness

### 为什么现在做？
D5（Grounded Narrative Faithfulness）当前 Warning——FactConsistencyChecker 实验性/regex-based（源码自述"已知中文名/地名误报"），narrative violation corpus 仅 11 条（W8 首批）。narrative 是世界对外表达的出口，grounding 不可信则世界真实性无法传递。

### 战略价值
中等。narrative faithfulness 重要但依赖 grounding（D3）与 canon facts。若 D3 未强化，narrative 校验无坚实事实基础。FactConsistencyChecker 能力边界（regex vs KnowledgeStore-based）需先评估替代方案。

### 是否触碰核心边界？
- 不改 Stable Envelope / schemaVersion / public API。
- 可能扩 FactConsistencyChecker 实现（regex → KnowledgeStore-based），属内部实现非 contract 变更。

### 预计风险与波次规模
- 风险：中高。FactConsistencyChecker 升级触及 narrative 路径，可能引入 narrative 行为变化。
- 波次：3 波（checker 能力评估 + corpus 扩充到 ≥30 + 替代方案设计）。

### 如何验收？
- D5 从 Warning 升 Pass。
- corpus 扩到 ≥30 + 误报率纳入 Warning 判定（B3 修正后规则）。
- 全量门控 + L4 仍 pass。

### 是否应继续推迟？
**可推迟**。D5 依赖 D3（grounding 基础），先做 D3 更合理。FactConsistencyChecker 升级风险较高，可待 D3 落地后评估。

---

## C. Social Emergence

### 为什么现在做？
D6（Multi-Agent Social Emergence）当前 Warning——social contagion 未纳入 perf:check 监控（D6 Warning 条件），gossip/contagion/relationship emergence 可测性弱。社会涌现是多 agent 世界的核心特征。

### 战略价值
中高。social emergence 是 multi-agent simulation 的差异化，但当前 2 agent 测试规模偏小，长程社会结构报告缺基础设施。

### 是否触碰核心边界？
- 不改 Stable Envelope / schemaVersion / public API。
- 可能扩 SocialGraph API（emergence 报告），属内部扩展。

### 预计风险与波次规模
- 风险：中。social contagion 路径已存在（perf-check 有 contagion baseline），扩测试规模不破坏既有逻辑。
- 波次：3 波（contagion 入 perf:check + emergence 可测性指标 + 长程社会结构报告）。

### 如何验收？
- D6 从 Warning 升 Pass。
- social contagion 纳入 perf:check 监控。
- 全量门控 + L4 仍 pass。

### 是否应继续推迟？
**可推迟**。social emergence 重要但非当前最紧迫——世界内核底座刚补扎实，social emergence 的价值依赖更多 agent / 长程模拟基础设施。

---

## D. Release Readiness

### 为什么现在做？
v2.2/v2.3 后世界内核底座扎实，可考虑是否接近 npm publish 预备。当前 README/示例/consumer matrix/release gate 是否就绪需评估。

### 战略价值
高（若接近 publish）。但 Andy 当前定位是"persistent world kernel"而非"通用 SDK"——release readiness 应服务于让消费者可信使用世界内核，而非追求用户数。

### 是否触碰核心边界？
- 不改 Stable Envelope / schemaVersion（除非 release 需 bump）。
- public API contract 可能需文档强化（TypeScript 声明 / 示例），属文档非 contract 变更。
- **npm publish 需总规划师明确批准**（AGENTS.md 禁止未授权 publish）。

### 预计风险与波次规模
- 风险：低（文档/示例为主）。
- 波次：2-3 波（API 文档审计 + consumer matrix 验证 + release gate 完善）。
- **不执行 npm publish**（仅 readiness 评估）。

### 如何验收？
- package docs / examples / consumer matrix 就绪。
- release gate（QUALITY_GATE_RFC R1-R5）验证。
- 不执行 publish（仅 readiness）。

### 是否应继续推迟？
**可推迟**。release readiness 重要但不紧迫——内核底座虽扎实，3 个 Warning 维度未补全前 publish 价值有限。建议 D3/D5/D6 至少 D3 升 Pass 后再评估 release readiness。

---

## 推荐方向排序

1. **A. Knowledge / Epistemic Strengthening**（推荐优先）
   - 最贴 persistent world kernel 定位（认知是 Andy 核心差异化）。
   - D3 升 Pass 为 D5 提供事实基础（叙事依赖 grounding）。
   - 风险可控（v2.3 safety net 部分覆盖）。

2. **C. Social Emergence**（次选，可与 A 并行评估）
   - multi-agent 差异化，但依赖长程模拟基础设施。

3. **B. Narrative Faithfulness**（依赖 A，建议 A 后）
   - 依赖 D3 grounding，先做 A 更合理。

4. **D. Release Readiness**（推迟，D3 升 Pass 后评估）
   - 内核虽扎实，3 Warning 未补全前 publish 价值有限。

---

## 待总规划师裁定

1. 选哪个方向（A/B/C/D 或组合）作为 v2.4？
2. 是否接受"先 A 后 B"的依赖排序（D3 grounding 为 D5 narrative 提供基础）？
3. release readiness 是否推迟到至少 D3 升 Pass 后？
4. 是否允许 A/C 并行（认知与社会涌现不冲突）？
