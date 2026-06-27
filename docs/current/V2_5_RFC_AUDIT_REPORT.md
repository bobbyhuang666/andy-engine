# v2.5 Grounded Narrative Faithfulness RFC — 独立审计报告

> 审计日期：2026-06-27
> 审计对象：`docs/rfc/V2_5_GROUNDED_NARRATIVE_FAITHFULNESS_RFC.md`
> 审计性质：只读审计，不改代码
> 审计师结论：**Pass with required edits**

---

## Verdict

**Pass with required edits**

方向正确，RFC 根因分析精准，边界意识到位。但存在 **3 个 blocking concern** 必须在波次启动前修入 RFC 或 W1 task card，否则执行阶段会产出逻辑不自洽的代码。

---

## 1. Grounding Package Contract

### 1.1 evidence 一致性 ✅ + ⚠️ Blocking

**RFC 对脱节的诊断正确**。独立验证了三处：

| 脱节 | 代码验证 |
|---|---|
| per-fact evidence 不传递 | `FactProvider.js:128-134` — `knowledgeStore.getKnownFacts()` 返回 fact 对象，不调 `getEvidence()` ✅ |
| NarrativeBuilder 不区分来源 | `NarrativeBuilder.js:272-274` — `.map(f => FactFormatter.toNaturalLanguage(f))` 无 source 标注 ✅ |
| Checker 不消费 evidence | `FactConsistencyChecker.js` 全文无 `_evidence` / `source` / `confidence` 引用 ✅ |

**⚠️ BLOCKING B1: inferredFacts 双源冲突未解决**

当前 `_getInferredFacts`（`FactProvider.js:178-203`）做**自己的位置推断**，与 `KnowledgeStore` 的 inferred evidence 是**两个独立系统**：

```js
// FactProvider._getInferredFacts (line 194-199) — 自有推断逻辑
if (fact.scope === FactScope.PUBLIC && fact.location === currentRegion) {
  result.push({ ...fact, confidence: 0.6, _inferred: true });  // 硬编码 0.6
}
```

```js
// KnowledgeStore evidence — v2.4 CanonEventPipeline._propagateInferred
source: 'inferred', confidence: 0.5  // v2.4 定义
```

同一 fact 可能同时出现在：
- `allowedFacts`（通过 knowledgeStore，`_evidence.source='inferred'`，confidence=0.5）
- `inferredFacts`（通过 `_getInferredFacts` 自有逻辑，confidence=0.6）

RFC §2.1 的 inferredFacts 示例写了 `confidence: 0.5`，但当前代码硬编码 `0.6`。

**要求**：RFC 增加一节明确 `_getInferredFacts` 与 knowledgeStore 的关系决策。

推荐方案 A：`_getInferredFacts` 消费 `knowledgeStore.getEvidence()`，不再做自有推断。若 fact 已在 knowledgeStore 中有 inferred evidence，走 allowedFacts 路径（source=inferred）；若 fact 不在 knowledgeStore 中但满足同位置条件，才放入 inferredFacts。此方案消除双源。

### 1.2 told/inferred 是否会误表达为 direct knowledge ✅

当前不会，但 v2.5 需要防止新的风险：

- KnowledgeStore 到 allowedFacts 的路径：`_getAllowedFacts` line 128-134 通过 `knowledgeStore.getKnownFacts()` 获取 fact，但**不传递 evidence**。v2.5 需要在每个 fact 上挂 `_evidence`。
- **风险点**：如果 `_evidence` 挂载时把 `source='told'` 的 fact 放入 allowedFacts 但 NarrativeBuilder 渲染为"你知道的事实"（无来源标注），LLM 可能将其表达为 direct knowledge。RFC §2.4 的分组渲染方案能缓解此风险，**但前提是 checker 能检出 `missing_source_attribution`**。

### 1.3 AGENT_STATE 他人状态守卫 ✅ + ⚠️ Blocking

**双层守卫已到位**（v2.4 审计已验证）：

- 存储层：`WorldFactStore.getFactsForAgent` line 269-271 过滤 ✅
- 视图层：`FactProvider._getAllowedFacts` line 118 过滤 ✅
- **缺口**：checker 无 `agent_state_leak` 检查 ✅（RFC 正确识别）

**⚠️ BLOCKING B2: RFC §2.2 表格与代码行为不一致**

RFC §2.2 表格声称：

> AGENT_STATE (other) | PUBLIC | told/observed → allowedFacts

但 `WorldFactStore.getFactsForAgent` line 269-271 硬性阻止他人 AGENT_STATE 进入任何 agent 的 allowedFacts，不看 knowledgeStore evidence：

```js
// WorldFactStore.js line 269-271
if (fact.type === FactType.AGENT_STATE && fact.agentId !== agentId) {
  known = false;
}
```

这是**正确的设计选择**（AGENT_STATE 应 epistemically private），但 RFC 应明确：他人 AGENT_STATE 即使有 told evidence，也不进入 allowedFacts。如果 narrative 需要表达"我听说他在食堂"，这应通过 EVENT fact 间接表达（"他在食堂"这个事实本身是 EVENT 而非 AGENT_STATE），而非直接引用 AGENT_STATE fact。

**要求**：修正 §2.2 表格，明确 AGENT_STATE(other) 不论 evidence 如何，不进入 allowedFacts。间接知识应通过 EVENT fact 表达。

---

## 2. Checker 升级方案

### 2.1 regex 增强是否足以支撑 D5 Pass ⚠️ Blocking

**部分足够，但有一个逻辑断裂**。

三个新 checker 中：

| Checker | regex 可行性 | 关键依赖 |
|---|---|---|
| `agent_state_leak` | **可行** — "他在XX"/"他感到XX" 模式 | forbiddenFacts 中 type=AGENT_STATE && agentId !== selfId |
| `local_scope_leak` | **可行** — 检查 narrative 是否提及 LOCAL 事件描述 | forbiddenFacts 中 scope=LOCAL 的 EVENT fact |
| `missing_source_attribution` | **部分可行** — 正向检查无法做 fact→text 映射 | 需要每个 fact 有 `_evidence` |

**⚠️ BLOCKING B3（部分）: `missing_source_attribution` 的 checker 逻辑需要 grounding 中每个 fact 有 `_evidence`，且需要"fact → narrative 文本中的表达"的映射。regex 无法做这个映射。**

务实方案：`missing_source_attribution` 只做**反向检查**——如果 grounding 中存在 told/inferred fact，但 narrative 中没有任何来源标记语（"我听说"/"XX告诉我"/"我推测"），则触发 warning。不能覆盖所有 case（LLM 可能用来源标记语表达 direct fact），但与"宁漏不误报"原则一致。

### 2.2 三类 violation 定义 ✅

| violation | 定义 | severity | 评判 |
|---|---|---|---|
| agent_state_leak | 表达他人私密状态 | reject | 清晰 ✅ |
| local_scope_leak | 提及不应知道的 LOCAL 事件 | reject | 清晰 ✅ |
| missing_source_attribution | told/inferred 事实未标注来源 | warning | 定义清晰 ✅ |

### 2.3 四层 severity ✅

pass / warning / rewrite / reject 层级合理。当前代码已有 pass/rewrite/reject（`_computeSeverity` line 411-426），但最低层叫 `degrade_to_template` 而非 `warning`。升级需要重命名。

### 2.4 "宁可漏检不可误报" ⚠️ Blocking

**这个原则作为 checker 设计哲学是合理的，但作为 D5 Pass gate 的依据是不够的**。

核心矛盾：如果 checker 刻意漏检（FN 高），corpus 的检出率很容易达到 85%（只要 corpus 中只放 checker 能检出的简单 case），但实际 narrative faithfulness 可能很差。

**⚠️ BLOCKING B3: RFC 必须增加对 corpus 质量的约束**，不能只规定数量（30 条）和检出率（85%），还必须规定：

1. **Corpus 中必须包含至少 5 条"checker 可能漏检的边界 case"**（如间接表达、语义等价、省略主语等），这些 case 的 expected violations 应标注为 `may_detect: false`。
2. **检出率计算分两层**：对 checker 应检出的 case 计算检出率（≥85%），对边界 case 单独统计但不计入 gate。
3. **误报率测量**：pass 样本（~8 条）不得有超过 1 条被误判为 violation（误报率 ≤12.5%）。

---

## 3. Corpus 目标

### 3.1 30 条是否足够

**边际足够**。11 → 30 是近 3 倍扩充，覆盖 9 类 violation。但 30 条分 9 类意味着平均每类仅 3.3 条，统计意义有限。

**建议**：30 是 v2.5 最小目标，v2.6 应扩到 50+。

### 3.2 检出率 ≥85%

**合理但需要上述 corpus 质量约束**。当前 11 条检出率 100% 是因为 corpus 只包含 checker 能检出的简单 case。85% 目标应是对"checker 设计范围内"的 case 而言，不是对全部可能 violation 而言。

### 3.3 pass 样本覆盖

RFC §4.2 列出的 15 个必须场景中约 8 个是 pass 样本，7 个是 violation 样本。**比例合理**，防止误报。

### 3.4 维度覆盖

| 维度 | RFC 覆盖 | 审计评判 |
|---|---|---|
| allowed fact (direct) 正确表达 | #1 | ✅ |
| allowed fact (told) with attribution | #2 | ✅ |
| allowed fact (inferred) with attribution | #3 | ✅ |
| told without attribution | #4 | ✅ |
| inferred without attribution | #5 | ✅ |
| AGENT_STATE leak (location) | #6 | ✅ |
| AGENT_STATE leak (emotion) | #7 | ✅ |
| self AGENT_STATE | #8 | ✅ |
| LOCAL leak | #9 | ✅ |
| LOCAL participant correct | #10 | ✅ |
| 他人位置有 evidence | #11 | ✅ |
| 他人位置无 evidence | #12 | ✅ |
| 合规地名不误报 | #13 | ✅ |
| 合规人名不误报 | #14 | ✅ |
| PUBLIC 事件被非同位置 agent 表达 | #15 | ✅ |

**维度覆盖全面**。但缺少以下边界 case（建议在 W2 补充）：

- **told attribution 缺失但用模糊表达**（如"好像..."而非"XX告诉我"）— 应为 pass 还是 warning？
- **inferred fact 被表达为确定事实**（如"食堂有人"而非"食堂大概有人"）— 应为 warning 还是 rewrite？

---

## 4. 测试矩阵

### 4.1 ~66 it() 是否聚焦

**偏向聚焦，但有水分空间**。

| 类别 | it() 数 | 评判 |
|---|---|---|
| FactProvider evidence 增强 | ~8 | 核心 ✅ |
| NarrativeBuilder source 分组 | ~6 | 核心 ✅ |
| 3 个新 checker | ~14 | 核心 ✅ |
| E2E 全链路 | ~10 | 核心 ✅ |
| GroundingPackage.schema | ~5 | 支撑，必要 |
| Corpus 扩充 / 检出率 | ~9 | 支撑，必要 |
| Aliveness-report / 回归 | ~14 | 支撑，必要 |
| **总计** | **~66** | 核心占比 ~58% |

### 4.2 E2E 真实性 ⚠️

E2E 测试的"真实"取决于它验证什么。如果只验证格式闭环：

> evidence → grounding 有 _evidence → NarrativeBuilder 输出有来源标注 → checker 检出 missing_source_attribution

这是**格式闭环**，不是**语义闭环**。真正的 D5 E2E 应该是：

> 给定一个有 told evidence 的 fact，合成 narrative 文本直接陈述该 fact（无来源标注），checker 应检出 missing_source_attribution

RFC 对此描述不够具体。**建议**：在 W3 task card 中明确 E2E 测试的 4-5 个具体场景，而非只写"全链路"。

### 4.3 D5 升 Pass 条件

```js
if (corpusStatus === 'pass' && e2eStatus === 'pass') return 'Pass';
```

**双文件门控合理**。但 aliveness-report 只检查测试文件是否 pass，不直接检查 corpus 数量（≥30 条）和检出率（≥85%）。

**建议**：在 `narrative-violation-corpus.test.js` 中增加显式断言：
- `expect(corpus.length).toBeGreaterThanOrEqual(30)`
- 检出率计算逻辑

让 aliveness-report 的间接判定更可靠。

---

## 5. 边界

### 5.1 不修改 v2.4 模块 ✅

RFC §6.1 明确禁止修改 KnowledgeStore / CanonEventPipeline / WorldFactStore。验证了可修改文件列表（§6.2）与 v2.4 修改文件无交集。

**但有一个隐性风险**：FactProvider._getInferredFacts 的重构（解决 B1 双源冲突）可能需要改 `_getInferredFacts` 的行为。这不违反 v2.4 模块不修改的约束，但可能影响已有测试。W1 执行时需注意回归。

### 5.2 FactProvider / StoryGenerator read-only ✅

FactProvider 只读 knowledgeStore（`getKnownFacts` + `getEvidence`），不写。NarrativeBuilder 只渲染，不写世界。StoryGenerator 不涉及本次修改。

### 5.3 不让 narrative 创建 facts ✅

RFC §6.1 明确。代码层面无新写入路径。

### 5.4 不引入外部 NLP 依赖 ✅

RFC §6.1 明确。所有增强都是 regex-based。

### 5.5 不改 Stable Envelope / schemaVersion ✅

RFC §9 明确。Grounding package 是 runtime 产物，不进入持久化。

---

## Blocking Concerns 汇总

### B1: inferredFacts 双源冲突（§2.1 vs FactProvider._getInferredFacts）

**问题**：`_getInferredFacts` 自有推断逻辑（confidence=0.6）与 knowledgeStore inferred evidence（confidence=0.5）是两套系统，同一 fact 可能同时出现在 allowedFacts 和 inferredFacts，或 confidence 不一致。

**要求**：RFC 增加一节明确 `_getInferredFacts` 与 knowledgeStore 的关系决策。推荐方案 A（_getInferredFacts 消费 knowledgeStore，消除自有推断逻辑）。

### B2: AGENT_STATE(other) + told → allowedFacts 与代码不符（§2.2 表格）

**问题**：RFC §2.2 表格声称 AGENT_STATE(other) + told/observed → allowedFacts，但 `WorldFactStore.getFactsForAgent` line 269-271 硬性阻止他人 AGENT_STATE 进入任何 agent 的 allowedFacts，不看 evidence。

**要求**：修正 §2.2 表格，明确 AGENT_STATE(other) 无论 evidence 如何，不进入 allowedFacts。间接知识应通过 EVENT fact 表达。

### B3: corpus 质量约束缺失（§4）

**问题**：只规定数量和检出率，不规定 corpus 难度分布。30 条简单 case 的 85% 检出率不能支撑 D5 Pass。

**要求**：RFC §4 增加约束：
- 至少 5 条边界 case（checker 可能漏检的）
- 检出率分两层计算（gate rate ≥85% / 边界 rate 单独报告）
- 误报率测量（pass 样本误报 ≤1 条）

---

## Non-blocking Suggestions

| # | 建议 | 理由 |
|---|---|---|
| S1 | `missing_source_attribution` checker 增加反向检查：若 grounding 中有 told/inferred fact 但 narrative 无任何来源标记语，触发 warning | 正向检查无法做 fact→text 映射，反向检查更可靠 |
| S2 | W3 E2E test 在 task card 中列出 4-5 个具体场景 | "全链路"太抽象，需要可验证的具体场景 |
| S3 | `narrative-violation-corpus.test.js` 增加显式 `expect(corpus.length).toBeGreaterThanOrEqual(30)` | 让 aliveness-report 间接判定更可靠 |
| S4 | `_computeSeverity` 中 `degrade_to_template` 统一重命名为 `warning` | 与 RFC §3.2 四层 severity 一致，避免语义混淆 |
| S5 | RFC 增补：told attribution 缺失但用模糊表达（"好像..."）的判定 | 当前未覆盖，W2 corpus 补充时可一并定义 |
| S6 | inferred fact 被表达为确定事实的 severity 应为 `warning`（不是 rewrite） | inferred fact 的"推测"标注缺失不如"编造新事实"严重，warning 足够 |

---

## 执行准入

**条件性允许从 RFC 生成 v2.5 波次**，前提是：

1. **B1**：在 W1 task card 中明确 `_getInferredFacts` 与 knowledgeStore 的关系决策（推荐方案 A）
2. **B2**：修入 RFC §2.2 表格，AGENT_STATE(other) 不论 evidence 均不进 allowedFacts
3. **B3**：修入 RFC §4 的 corpus 质量约束

三个 blocking concern 可在 task card / RFC 修订中解决，**不需要重新提交完整 RFC**。执行 AI 可在收到修订确认后启动 W1。
