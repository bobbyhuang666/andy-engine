# V2.5 Grounded Narrative Faithfulness RFC

> 提交日期：2026-06-27
> 修订日期：2026-06-27（吸收独立审计 B1/B2/B3 修正 + S1/S2/S3/S6 采纳）
> 阶段目标：D5 Grounded Narrative Faithfulness 从 Warning 推向 Pass
> 核心闭环：World Event → Fact → Evidence → Knowledge → Grounding Package → Narrative Constraint → Consistency Check

---

## 1. 当前 D5 Warning 根因

### 1.1 FactConsistencyChecker 实验性在哪里

| 问题 | 现状 | 影响 |
|---|---|---|
| **纯 regex 匹配** | 6 个 checker 全部基于正则（中文名/地名/事件/时间/关系/新事件） | 无法处理语义等价表达（"小明"能检出，"Ming"漏检） |
| **无 evidence 感知** | checker 不知道 fact 的 source/confidence | 无法区分"我亲眼看到"vs"我听说"vs"我推测" |
| **AGENT_STATE 越权盲区** | `_checkAgentLocationClaims` 仅检查自己 AGENT_STATE | 不检查 narrative 是否泄露他人情绪/需求（v2.4 加了存储层防护，但 checker 未消费） |
| **told/inferred 归属缺失** | corpus 无 told/inferred 场景 | 无法验证 narrative 是否正确标注知识来源 |
| **中文名/地名误报** | `[一-龥]{2,4}` 匹配过于宽泛 | "看到图书馆"中"图书"可能被误判为人名 |
| **unsupported_claim 仅覆盖 self** | `_checkAgentLocationClaims` 只检 self-location | 不检"小红在图书馆"这类他人位置声明 |

### 1.2 Narrative Regression Corpus 当前覆盖什么、不覆盖什么

**当前覆盖（11 条，6 类）**：

| 类别 | 条目数 | 覆盖范围 |
|---|---|---|
| unknown_character | 3 | 动词前中文名 |
| unknown_location | 2 | 去XX模式 |
| unknown_event | 2 | 那次/上次模式 |
| time_conflict | 2 | 白天说深夜 |
| new_relationship | 1 | 成为XX朋友 |
| new_event | 1 | 刚刚XX了 |

**完全不覆盖（v2.5 必须填补的缺口）**：

| 缺口类别 | 风险 | 优先级 |
|---|---|---|
| AGENT_STATE 越权（泄露他人位置/情绪） | **高**：v2.4 加了防护但无 corpus 验证 | P0 |
| told source attribution | **高**：v2.4 新增 told 但 narrative 不区分来源 | P0 |
| inferred source attribution | **中**：推断事实需标注"推测" | P1 |
| LOCAL scope 泄露 | **高**：私密事件不应出现在 narrative | P0 |
| allowed fact 正确表达 | **中**：正向验证（不是只测越界） | P1 |
| 他人位置/情绪声明 | **高**："小红在食堂"是否被支撑 | P0 |
| false positive（合规文本被误判） | **中**：误报率影响可用性 | P1 |
| 中文名/地名歧义 | **中**：regex 宽泛导致误报 | P2 |

### 1.3 Grounding Package 是否已完全消费 v2.4 Evidence Model

**否。** 存在三层脱节：

| 脱节 | 位置 | 说明 |
|---|---|---|
| **per-fact evidence 不传递** | `FactProvider.getGroundingPackage()` | allowedFacts/inferredFacts 中的 fact 对象不携带 source/confidence/propagatedFrom |
| **NarrativeBuilder 不区分来源** | `NarrativeBuilder._buildGroundingSection()` | allowedFacts 统一渲染为"你知道的事实"，不标注 direct/told/inferred |
| **FactConsistencyChecker 不消费 evidence** | `FactConsistencyChecker.check()` | 只看 fact 的 type/participants，不看 source/confidence |

具体代码证据：

```js
// FactProvider.js line 128-134：knowledgeStore.getKnownFacts() 返回 fact 对象
// fact 对象本身没有 _evidence 字段，evidence 存在 KnowledgeStore._evidence 中
// getGroundingPackage() 不调用 getEvidence() 来获取 source/confidence

// NarrativeBuilder.js line 271-277：统一渲染，无来源标注
const factLines = groundingPackage.allowedFacts
  .slice(0, 20)
  .map(f => `- ${FactFormatter.toNaturalLanguage(f)}`);  // 无 source 标注

// NarrativeBuilder.js line 279-284：inferredFacts 仅加"（推断）"后缀
.map(f => `- ${FactFormatter.toNaturalLanguage(f)}（推断）`);  // 无 confidence 标注
```

### 1.4 当前 False Positive / False Negative 风险

**False Positive（合规文本被误判）**：

| 误报类型 | 触发条件 | 严重性 |
|---|---|---|
| 中文人名歧义 | "看到图书" 被匹配为 2 字人名+动词 | 中 |
| 地名+动词混淆 | "在图书馆学习" → "在图书馆" 是合法的 | 低 |
| 代词被误判 | "他来了" → "他" 不触发人名检查 | 无 |
| 常见词被匹配 | nonLocationSuffixes 覆盖有限 | 低 |

**False Negative（越界文本漏检）**：

| 漏检类型 | 原因 | 严重性 |
|---|---|---|
| 他人 AGENT_STATE 泄露 | checker 无此检查 | **高** |
| told 来源不标注 | NarrativeBuilder 不区分来源 | **高** |
| 间接表达 | "听说那个地方" 不触发地名 regex | 中 |
| 语义等价 | "Ming 去了食堂" → 不匹配中文人名 pattern | 中 |
| forbidden facts 泄露 | forbiddenFacts 不渲染到 prompt，但 LLM 可能猜到 | 低 |

---

## 2. Grounding Package Contract

### 2.1 allowedFacts / inferredFacts / forbiddenFacts 定义

**当前定义（v2.5 修订）**：

| 类别 | 定义 | 来源 |
|---|---|---|
| allowedFacts | agent 确定知道的事实（含 inferred evidence 的） | PUBLIC facts + knowledgeStore known facts（含 source='inferred'） |
| inferredFacts | **已降级**：仅作为 KnowledgeStore 未覆盖的弱推断提示层 | v2.5 不再让此列表造独立推断（见 B1 决策） |
| forbiddenFacts | agent 不应知道的事实 | LOCAL/私密 + 未参与/未观察 + 他人 AGENT_STATE |

**B1 决策：_getInferredFacts 与 KnowledgeStore 的关系**

> 审计 B1 要求：RFC 增加一节明确 `_getInferredFacts` 与 knowledgeStore 的关系决策。
> 总规划师裁定：v2.5 不再让 `_getInferredFacts` 自己造另一套同区域推断，避免双源。

**最终决策**：

1. **KnowledgeStore inferred evidence 为唯一权威源**。如果一个 fact 已经通过 KnowledgeStore 以 `source='inferred'` 被 agent 知道，它应进入 `allowedFacts`，并携带 `_evidence.source='inferred'`、`confidence=0.5`。
2. **`_getInferredFacts` 降级为空列表**。v2.5 实现中，`_getInferredFacts()` 返回空数组 `[]`。所有推断知识的权威路径为：
   - `CanonEventPipeline._propagateInferred` → KnowledgeStore (`source='inferred'`, confidence=0.5) → `_getAllowedFacts` → allowedFacts
3. **confidence 必须与 v2.4 一致**：inferred = 0.5。不再硬编码 0.6（当前 `_getInferredFacts` line 197 的 `confidence: 0.6` 必须修正）。
4. **向后兼容**：`grounding.inferredFacts` 字段保留在输出结构中，但 v2.5 为空数组。下游代码（NarrativeBuilder、checker）不应依赖 inferredFacts 有内容。所有 inferred 知识走 allowedFacts + `_evidence.source='inferred'` 路径。

**为什么选择降级而非消费**：

方案 A（`_getInferredFacts` 消费 knowledgeStore 并去重）虽然消除双源，但保留了 `_getInferredFacts` 的独立代码路径，增加维护负担。降级为空列表更简洁：
- 所有推断知识的写入路径已在 v2.4 的 CanonEventPipeline 中完成
- 读取路径统一走 KnowledgeStore → allowedFacts
- 无双源、无去重逻辑、无 confidence 不一致风险

**v2.5 新增：per-fact evidence metadata**

每个 fact 在 grounding package 中携带 evidence 信息：

```js
// FactProvider.getGroundingPackage() 输出增强
{
  allowedFacts: [
    // direct/observed/overheard/told/inferred 均在 allowedFacts
    // 由 _evidence.source 区分
    {
      ...factObject,
      _evidence: {
        source: 'direct',       // 'direct'|'observed'|'overheard'|'told'|'inferred'
        confidence: 1.0,        // direct=1.0 observed=0.9 overheard=0.7 told=0.6 inferred=0.5
        propagatedFrom: null,   // told 时为告知者 ID
      }
    },
    // inferred evidence 示例：
    {
      ...factObject,
      _evidence: {
        source: 'inferred',
        confidence: 0.5,        // 与 v2.4 KnowledgeStore 一致，非 0.6
        propagatedFrom: null,
      }
    }
  ],
  inferredFacts: [],  // v2.5: 降级为空数组，不再产出独立推断
  forbiddenFacts: [
    {
      ...factObject,
      // 无 _evidence（agent 不知此事）
    }
  ],
  // 新增：evidence 统计摘要
  metadata: {
    agentId,
    currentTime,
    factCount: { allowed, inferred: 0, forbidden },  // inferred 恒为 0
    evidenceSummary: {
      direct: 3,
      observed: 1,
      overheard: 2,
      told: 1,
      inferred: 1,  // 来自 allowedFacts 中 source='inferred' 的计数
    },
  },
}
```

### 2.2 AGENT_STATE / LOCAL / PUBLIC / told / inferred 在 grounding 中的处理

> B2 修正：AGENT_STATE(other) 无论 told/observed/inferred evidence 如何，都不进入 allowedFacts。
> 他人状态只能通过 EVENT fact 或其他非 AGENT_STATE fact 间接表达。
> 不引入 FactScope.PRIVATE。不绕过 WorldFactStore / FactProvider 的双层防护。

| Fact 类型 | Scope | 传播源 | grounding 处理 | narrative 约束 |
|---|---|---|---|---|
| AGENT_STATE (self) | PUBLIC | direct | → allowedFacts，_evidence.source='direct' | 可自由表达自己的状态 |
| AGENT_STATE (other) | PUBLIC | **任何** | → **forbiddenFacts**（不进入 allowedFacts） | **不可表达**。即使有 told/observed/inferred evidence，WorldFactStore line 269-271 硬性阻止 |
| EVENT | PUBLIC | direct | → allowedFacts | 可自由表达 |
| EVENT | PUBLIC | observed | → allowedFacts | 须标注"我看到" |
| EVENT | PUBLIC | overheard | → allowedFacts | 须标注"我听说" |
| EVENT | PUBLIC | told | → allowedFacts | 须标注"XX告诉我" |
| EVENT | PUBLIC | inferred | → allowedFacts（_evidence.source='inferred'） | 须标注"我推测"或"大概" |
| EVENT | LOCAL | direct | → allowedFacts | 可自由表达（仅参与者） |
| EVENT | LOCAL | 无 | → forbiddenFacts | 不可表达 |
| STATIC_ENV | PUBLIC | — | → allowedFacts | 可自由表达 |
| RELATIONSHIP | — | direct/told | → allowedFacts | 须标注来源（若 told） |

**"我听说他在食堂"如何表达？**

不能引用 AGENT_STATE(other) fact。正确路径：
1. 事件发生 → CanonEventPipeline 产出 EVENT fact（"某人在食堂"是事件，非状态）
2. EVENT fact 通过 told/observed evidence 传播到 agent 的 KnowledgeStore
3. agent 在 allowedFacts 中获得该 EVENT fact，携带 `_evidence.source='told'`
4. narrative 可表达"我听说他在食堂"，来源标注由 EVENT 的 evidence 决定

这一设计确保 AGENT_STATE 始终是 epistemically private 的，同时不阻碍合理间接知识的表达。

### 2.3 Evidence confidence 是否进入 narrative constraints

**是的，但有条件：**

- confidence **不**直接传给 LLM prompt（避免 prompt 膨胀）
- confidence **影响** narrative 约束的严格程度：
  - `direct/observed`（≥0.9）：可自由表达，无需来源标注
  - `overheard`（0.7）：需标注"我听说"或模糊化
  - `told`（0.6）：需标注"XX告诉我"或"我听XX说的"
  - `inferred`（0.5）：需标注"我推测"或"大概"
- confidence **进入** FactConsistencyChecker 的 violation severity 判定：
  - 直接陈述 told 级别事实而不标注来源 → `severity: 'warning'`（S6：inferred 表达成确定事实 severity 定为 warning，非 rewrite/reject）
  - 直接陈述 inferred 级别事实而不标注"推测/大概" → `severity: 'warning'`（同 S6）
  - 泄露 forbidden 事实 → `severity: 'reject'`
  - 泄露他人 AGENT_STATE → `severity: 'reject'`

### 2.4 Narrative 能表达"我听说/我推测/我亲眼看到"的条件

**v2.5 实现：evidence-aware grounding section**

NarrativeBuilder._buildGroundingSection() 输出增强：

```
# 事实约束
你必须基于以下事实进行表达，不能编造新事实。
- 你只能引用"你知道的事实"中的内容
- 你不能提及"你不知道的事实"中的任何内容
- 对于来源不同的事实，表达方式有约束：
  - 直接经历的事实：可以自由表达
  - 亲眼看到的事实：可以自由表达
  - 听闻的事实（标注"听闻"）：须用"听说/听说有人说"等表述
  - 别人告诉你的事实（标注来源）：须用"XX告诉我"等表述
  - 推断的事实（标注"推断"）：须用"我推测/大概/可能"等表述
- 你的表达方式（语气、措辞、情绪强度）可以自由发挥

# 你知道的事实
- 爱丽丝在图书馆（直接经历）
- 鲍勃找到了一本好书（听闻）
- 小华告诉你在食堂发生了有趣的事（小华告诉你）
- 食堂大概有人聚餐（推断）
...

# 你不知道的事实
- （不渲染具体内容，仅作约束）
...
```

**实现方式**：
- allowedFacts 按 evidence.source 分组渲染
- 每组使用不同后缀标注来源
- FactFormatter 增加来源标注方法

---

## 3. Narrative Consistency Checker

### 3.1 继续强化 regex checker，还是引入结构化 claim extraction？

**结论：分阶段增强。v2.5 以 regex 增强为主，结构化 claim extraction 列为未来方向。**

理由：
- 完全结构化 claim extraction 需要 NLP parser（中文分词+依存句法），超出 Andy Engine 核心范围
- regex 增强可以覆盖 80%+ 的实际 violation 场景
- v2.5 的核心目标不是"完美的 checker"，而是"grounding package → narrative constraint 闭环可测"

**v2.5 checker 增强**：

| 增强项 | 类型 | 说明 |
|---|---|---|
| **source attribution 检查** | 新 checker | 检查 told/inferred 级别事实是否有来源标注。S1 采纳：使用反向检查——grounding 中有 told/inferred fact，但 narrative 无任何来源标记语（"我听说"/"XX告诉我"/"我推测"/"大概"等），则触发 warning |
| **AGENT_STATE 越权检查** | 新 checker | 检查 narrative 是否表达他人私密状态 |
| **LOCAL scope 泄露检查** | 新 checker | 检查 narrative 是否提及不应知道的 LOCAL 事件 |
| **误报优化** | regex 改进 | 扩展 nonLocationSuffixes / nonAgentSuffixes |
| **unsupported_claim 扩展** | 现有增强 | 不仅检 self-location，也检他人 location 声明 |

**结构化 claim extraction（未来 v2.6+ 方向，v2.5 不做）**：
- 需要 LLM-based claim extractor
- 将 narrative 拆解为 atomic claims
- 逐条与 grounding package 比对
- 超出 Andy Engine scope，需外部依赖

### 3.2 Checker pass/fail/warning 分层

当前 `_computeSeverity()` 有 3 层：`pass` / `rewrite` / `reject`

**v2.5 升级为 4 层**：

| severity | 含义 | 触发条件 | 处理方式 |
|---|---|---|---|
| `pass` | 无 violation | 0 violations | 直接使用 |
| `warning` | 轻微问题 | source attribution 缺失但事实本身合规 | 可用，记录 violation |
| `rewrite` | 需重写 | 未知角色/地点/不支持的声明 | 建议重写 |
| `reject` | 不可接受 | 新事件/新关系/AGENT_STATE越权/LOCAL泄露 | 拒绝 |

新增 `warning` 层：覆盖"事实合规但来源标注缺失"的情况。这是 v2.5 evidence model 带来的新需求——told/inferred 事实在 narrative 中未标注来源不算严重越界，但需要提醒。

### 3.3 如何避免中文名/地名误报

**v2.5 误报缓解策略**：

1. **扩展排除列表**：在 `_checkCharacterNames` 和 `_checkLocationNames` 中增加更多 nonLocationSuffixes / commonNonAgents
2. **上下文感知匹配**：要求人名出现在更严格的上下文中（如在标点后+动词前），而非单独出现
3. **域感知白名单**：从 grounding.allowedFacts 提取所有已知 agent/location name 作为白名单，只有不在白名单中的才触发 violation
4. **最小化匹配范围**：减少 `.{2,20}` 这类过于宽泛的 regex capture

**核心原则**：宁可漏检（FN），不可误报（FP）。误报比漏检更损害信任——用户会关闭一个总是误报的 checker。

### 3.4 Violation severity 定义

| violation type | severity | 说明 |
|---|---|---|
| unknown_character | rewrite | 提及不存在的人 |
| unknown_location | rewrite | 提及不存在的地点 |
| unknown_event | rewrite | 引用不知道的事件 |
| time_conflict | rewrite | 时间描述矛盾 |
| new_relationship | reject | 编造新关系 |
| new_event | reject | 编造新事件 |
| unsupported_claim | rewrite | 无证据的声明 |
| **agent_state_leak** | **reject** | 泄露他人私密状态 |
| **local_scope_leak** | **reject** | 泄露不应知道的 LOCAL 事件 |
| **missing_source_attribution** | **warning** | told/inferred 事实未标注来源（S6：inferred 表达成确定事实 severity 定为 warning，非 rewrite/reject） |

---

## 4. Regression Corpus

### 4.1 D5 Pass 的最小 corpus

**目标：30 条**（从当前 11 条扩充到 30 条）

### 4.2 Corpus 质量门槛（B3 修正）

> B3 要求：corpus 不只看数量和检出率，必须加入质量门槛。
> 总规划师裁定：必须包含 boundary cases、gate rate ≥85%、误报上限、显式断言。

**v2.5 corpus 质量规则**：

| 规则 | 阈值 | 说明 |
|---|---|---|
| corpus 总数 | ≥30 | 绝对下限 |
| gate cases 数量 | ≥25 | checker 应检出的 case（`may_detect: true` 或未标记） |
| boundary cases 数量 | ≥5 | checker 可能漏检的边界 case，标记 `may_detect: false` |
| gate rate（gate cases 检出率） | ≥85% | D5 Pass gate 的核心指标 |
| boundary rate（boundary cases 检出率） | 单独报告 | 不作为 Pass gate，但必须记录 |
| pass 样本误报 | ≤1 条 | pass 样本（~8 条）中被误判为 violation 的上限 |
| violation 类别覆盖 | ≥9 类 | agent_state_leak / local_scope_leak / missing_source_attribution + 6 旧类 |

**gate rate 计算公式**：

```
gateRate = detectedGateCases / totalGateCases
// totalGateCases = corpus 中 may_detect !== false 的 violation 条目数
// detectedGateCases = 其中 checker 正确检出的条目数
```

**boundary cases 定义**：

boundary case 是 checker 设计范围内"可能漏检"的 case，包括但不限于：
- 间接表达（省略主语、被动句）
- 语义等价表达（"Ming"替代"小明"）
- 模糊来源标注（"好像听说"而非"XX告诉我"）
- 情绪的间接暗示（"他皱了皱眉"而非"他感到沮丧"）

boundary case 标记为 `may_detect: false`，不计入 gate rate 分母，但单独统计检出率。

**`narrative-violation-corpus.test.js` 必须包含的显式断言**：

```js
// S3: 显式断言 corpus 数量、gate rate、误报上限
expect(corpus.length).toBeGreaterThanOrEqual(30);

const gateCases = corpus.filter(c => c.expectedViolation && c.may_detect !== false);
const detectedGateCases = gateCases.filter(c => actuallyDetected(c));
expect(detectedGateCases.length / gateCases.length).toBeGreaterThanOrEqual(0.85);

const passSamples = corpus.filter(c => !c.expectedViolation);
const falsePositives = passSamples.filter(c => actuallyDetected(c));
expect(falsePositives.length).toBeLessThanOrEqual(1);

const boundaryCases = corpus.filter(c => c.expectedViolation && c.may_detect === false);
// boundary cases 单独报告，不作为 Pass gate
const boundaryRate = boundaryCases.filter(c => actuallyDetected(c)).length / boundaryCases.length;
// 记录 boundaryRate，但不 expect 最低值
```

### 4.3 必须包含的场景

| # | 场景 | violation type | severity | may_detect | 优先级 |
|---|---|---|---|---|---|
| 1 | allowed fact (direct) 正确表达，无来源标注 | — (pass) | pass | — | P1 |
| 2 | allowed fact (told) 正确表达，有来源标注 | — (pass) | pass | — | P0 |
| 3 | allowed fact (inferred) 正确表达，有"推测"标注 | — (pass) | pass | — | P0 |
| 4 | told 级别事实未标注来源 | missing_source_attribution | warning | true | P0 |
| 5 | inferred 级别事实未标注来源 | missing_source_attribution | warning | true | P0 |
| 6 | 表达他人 AGENT_STATE（位置）无 evidence | agent_state_leak | reject | true | P0 |
| 7 | 表达他人 AGENT_STATE（情绪）无 evidence | agent_state_leak | reject | true | P0 |
| 8 | 自身 AGENT_STATE 正确表达 | — (pass) | pass | — | P1 |
| 9 | LOCAL 事件被非参与者提及 | local_scope_leak | reject | true | P0 |
| 10 | LOCAL 事件被参与者正确提及 | — (pass) | pass | — | P1 |
| 11 | 他人位置声明有 evidence 支撑（EVENT fact） | — (pass) | pass | — | P0 |
| 12 | 他人位置声明无 evidence 支撑 | unsupported_claim | rewrite | true | P0 |
| 13 | 合规地名不误报 | — (pass) | pass | — | P1 |
| 14 | 合规人名不误报 | — (pass) | pass | — | P1 |
| 15 | PUBLIC 事件被非同位置 agent 表达 | — (pass, if told) | pass/warning | — | P0 |
| **16** | **间接表达他人状态（"他皱了皱眉"）** | **agent_state_leak** | **reject** | **false** | **P1** |
| **17** | **语义等价人名（"Ming"替代"小明"）** | **unknown_character** | **rewrite** | **false** | **P1** |
| **18** | **模糊来源标注（"好像听说"）** | **missing_source_attribution** | **warning** | **false** | **P1** |
| **19** | **inferred fact 表达成确定事实** | **missing_source_attribution** | **warning** | **true** | **P0** |
| **20** | **省略主语的他人状态暗示** | **agent_state_leak** | **reject** | **false** | **P2** |
| 21-30 | 当前 6 类各扩充 1-2 条 | 各类 | 各类 | true | P2 |

**boundary cases（#16-18, #20）标记为 `may_detect: false`**，共 4 条。W2 补充时再增加 1-2 条 boundary case 以满足 ≥5 条的要求。

### 4.4 Corpus 数量目标和扩展策略

| 阶段 | 条目数 | 覆盖类别 | gate rate 目标 | boundary cases |
|---|---|---|---|---|
| 当前 (v2.4) | 11 | 6 类 | 100%（无 boundary） | 0 |
| v2.5-W1 | 20 | 9 类 + 部分 boundary | ≥85% | ≥3 |
| v2.5-W2 | 30 | 9 类 + 完整 boundary | ≥85% | ≥5 |

**扩展策略**：
1. W1：新增 evidence-aware violation 类别（9 条），加 pass 样本（3 条），加 boundary（3 条）= 15 新 → 26 总（≈20 gate + 3 boundary + 3 pass = 26，调整到 20 条可见即可）
2. W2：补充 boundary case + 误报测试 + 各类扩充（4-10 条）→ 30 总，确保 ≥5 boundary
3. 每条新增必须符合 checker 实际触发条件（不造假）
4. boundary case 必须标记 `may_detect: false`

---

## 5. Tests / Benchmark

### 5.1 D5 从 Warning 到 Pass 的测试矩阵

| # | 测试场景 | 文件 | 优先级 |
|---|---|---|---|
| 1 | FactProvider.getGroundingPackage 输出含 _evidence | grounded-narrative.test.js | P0 |
| 2 | evidence.source 正确映射 (direct/observed/overheard/told/inferred) | grounded-narrative.test.js | P0 |
| 3 | NarrativeBuilder._buildGroundingSection 按 source 分组渲染 | narrative-builder-grounding.test.js (新) | P0 |
| 4 | NarrativeBuilder told 级别标注来源 | narrative-builder-grounding.test.js | P0 |
| 5 | NarrativeBuilder inferred 级别标注"推测" | narrative-builder-grounding.test.js | P0 |
| 6 | FactConsistencyChecker 新增 agent_state_leak 检出 | fact-consistency-checker.test.js | P0 |
| 7 | FactConsistencyChecker 新增 local_scope_leak 检出 | fact-consistency-checker.test.js | P0 |
| 8 | FactConsistencyChecker 新增 missing_source_attribution 检出 | fact-consistency-checker.test.js | P0 |
| 9 | FactConsistencyChecker severity 升级（4 层） | fact-consistency-checker.test.js | P0 |
| 10 | Corpus 扩充后 gate rate ≥85%（S3: 显式断言） | narrative-violation-corpus.test.js | P0 |
| 11 | Corpus 新增类别覆盖 | narrative-violation-corpus.test.js | P1 |
| 12 | Corpus boundary cases 单独报告（S3） | narrative-violation-corpus.test.js | P1 |
| 13 | Corpus pass 样本误报 ≤1 条（S3） | narrative-violation-corpus.test.js | P0 |
| 14 | Corpus 总数 ≥30 显式断言（S3） | narrative-violation-corpus.test.js | P0 |
| 15 | GroundingPackage schema 升级 | GroundingPackage.schema.test.js (新) | P1 |
| 16 | 误报率测试：合规文本不被误判 | narrative-violation-corpus.test.js | P1 |
| 17 | E2E: evidence → grounding → narrative → checker 全链路 | grounded-narrative-e2e.test.js (新) | P0 |

### 5.2 与 v2.4 D3 evidence matrix 如何衔接

v2.4 D3 测的是 **knowledge 写入正确性**（谁能知道什么、凭什么知道）。
v2.5 D5 测的是 **narrative 消费正确性**（能表达的、不能表达的、必须标注来源的）。

衔接点：

```
v2.4 D3: event → evidence → knowledgeStore   (写入)
v2.5 D5: knowledgeStore → grounding → narrative → checker  (消费)
```

**共享 fixture**：v2.5 E2E 测试应复用 v2.4 evidence-matrix 的 agent/event/knowledge 配置，在此基础上验证 narrative 约束。

### 5.3 Aliveness-report 如何判定 D5 Pass

**当前逻辑**（scripts/aliveness-report.js line 155-159）：

```js
if (dim.id === 'D5') {
  const corpusStatus = findFileStatus(testParsed, 'narrative-violation-corpus');
  if (corpusStatus === 'pass') return 'Warning';  // 永远是 Warning
  return 'Gap';
}
```

**v2.5 升级逻辑**：

```js
if (dim.id === 'D5') {
  const corpusStatus = findFileStatus(testParsed, 'narrative-violation-corpus');
  const e2eStatus = findFileStatus(testParsed, 'grounded-narrative-e2e');
  // 两者都 pass 才 Pass
  if (corpusStatus === 'pass' && e2eStatus === 'pass') return 'Pass';
  if (corpusStatus === 'fail' || e2eStatus === 'fail') return 'Gap';
  return 'Warning';
}
```

**D5 dimension 定义更新**：

```js
{
  id: 'D5',
  name: 'Grounded Narrative Faithfulness',
  standard: 'narrative 只能表达 grounding 允许的事实；told/inferred 级别事实须标注来源；AGENT_STATE 他人不可表达（B2：无论 evidence 如何均不进 allowedFacts）；推断知识走 allowedFacts + source=inferred（B1：inferredFacts 降级为空）。',
  entry: 'tests/unit/narrative-violation-corpus.test.js + tests/e2e/grounded-narrative-e2e.test.js',
  owner: 'narrative 层',
  // 移除 special/specialNote
}
```

---

## 6. 边界

### 6.1 明确禁止

- narrative / LLM **不创建** facts（不变）
- FactProvider / StoryGenerator **不写**世界（不变）
- 不改 Stable Envelope
- 不引入 StoryArc runtime
- 不启动 UI / Andy Town / npm publish
- 不引入外部 NLP 依赖（不引入中文分词/依存句法库）
- 不修改 KnowledgeStore/CanonEventPipeline/WorldFactStore（v2.4 已完成，v2.5 只消费）

### 6.2 可修改范围

| 文件 | 修改类型 | 说明 |
|---|---|---|
| `src/narrative/FactProvider.js` | 增强 | getGroundingPackage 输出含 _evidence |
| `src/sdk/NarrativeBuilder.js` | 增强 | _buildGroundingSection 按 source 分组渲染 |
| `src/narrative/FactConsistencyChecker.js` | 增强 | 新增 3 个 checker + severity 升级 |
| `src/shared/schemas/GroundingPackage.schema.js` | 增强 | schema 从 shell 升级为实际校验 |
| `src/narrative/FactFormatter.js` | 增强 | 新增来源标注格式方法 |
| `tests/fixtures/narrative-violations/index.js` | 扩充 | 11→30 条 |
| `scripts/aliveness-report.js` | 修改 | D5 判定逻辑升级 |
| 新增测试文件 | 新建 | narrative-builder-grounding, grounded-narrative-e2e, GroundingPackage.schema |

### 6.3 触及边界需回总规划师

- LLM prompt 格式变更（影响所有 LLM 输出）
- corpus 数量目标调整（30 是目标，实际可能需调整）
- 新增外部依赖

---

## 7. 预期波次

### W1: Evidence-aware Grounding Package + _getInferredFacts 降级 + Corpus 扩充

**目标**：Grounding Package 携带 evidence metadata + _getInferredFacts 降级为空 + corpus 扩充到 20 条

> B1 实现要求：_getInferredFacts() 返回空数组，所有推断走 KnowledgeStore → allowedFacts 路径

| 任务 | 文件 | 估计 it() |
|---|---|---|
| FactProvider._getInferredFacts 降级为空数组 | FactProvider.js | ~2 |
| FactProvider.getGroundingPackage 输出 _evidence | FactProvider.js | ~8 |
| FactProvider._getAllowedFacts 挂载 _evidence（含 source='inferred'） | FactProvider.js | ~3 |
| GroundingPackage.schema 升级 | GroundingPackage.schema.js | ~5 |
| NarrativeBuilder._buildGroundingSection 按 source 分组 | NarrativeBuilder.js | ~6 |
| FactFormatter 新增来源标注 | FactFormatter.js | ~4 |
| Corpus 扩充（+9 条 evidence-aware violations + 3 boundary） | narrative-violations/index.js | ~5 |
| **小计** | | **~33** |

### W2: Checker Evidence-awareness + Violation Severity 升级

**目标**：3 个新 checker + 4 层 severity + corpus 扩充到 30 条

| 任务 | 文件 | 估计 it() |
|---|---|---|
| agent_state_leak checker | FactConsistencyChecker.js | ~5 |
| local_scope_leak checker | FactConsistencyChecker.js | ~4 |
| missing_source_attribution checker（S1：反向检查） | FactConsistencyChecker.js | ~5 |
| severity 4 层升级 | FactConsistencyChecker.js | ~4 |
| 误报缓解 | FactConsistencyChecker.js | ~3 |
| Corpus 扩充（+10 条，含 ≥2 boundary cases） | narrative-violations/index.js | ~4 |
| **小计** | | **~25** |

### W3: D5 E2E Benchmark + Aliveness D5→Pass

**目标**：E2E 全链路测试 + aliveness report D5→Pass

> S2 采纳：W3 E2E 必须列 4-5 个具体场景，不能只写"全链路"。

**E2E 具体场景**：

| # | 场景 | 输入 | 期望输出 | 验证点 |
|---|---|---|---|---|
| E2E-1 | told fact 未标注来源 | agent 有 told evidence 的 fact，narrative 直接陈述 | checker 检出 `missing_source_attribution`，severity=warning | evidence→grounding→checker 闭环 |
| E2E-2 | inferred fact 未标注推测 | agent 有 inferred evidence 的 fact，narrative 直接陈述为确定事实 | checker 检出 `missing_source_attribution`，severity=warning | S6: inferred→确定事实=warning |
| E2E-3 | 他人 AGENT_STATE 泄露 | narrative 表达他人情绪/位置，grounding 中无该 AGENT_STATE fact | checker 检出 `agent_state_leak`，severity=reject | B2: AGENT_STATE(other) 不进 allowedFacts |
| E2E-4 | LOCAL 事件泄露 | 非参与者 narrative 提及 LOCAL 事件 | checker 检出 `local_scope_leak`，severity=reject | scope 隔离闭环 |
| E2E-5 | 正向合规 | agent 按 evidence 标注表达 told/inferred/direct fact | checker 返回 severity=pass | 正向全链路无 violation |

| 任务 | 文件 | 估计 it() |
|---|---|---|
| E2E: 5 个具体场景 | grounded-narrative-e2e.test.js (新) | ~10 |
| D5 判定逻辑升级 | aliveness-report.js | ~3 |
| 已有测试回归验证 | — | — |
| **小计** | | **~13** |

**阶段总计新增 it()：~71**

---

## 8. 验收标准

```bash
npm test                                    # 全部通过
npm run test:domain                         # domain 边界
npm run check:boundaries                    # 架构边界
npm run replay:diff                         # 100/100
node scripts/aliveness-report.js            # D5 → Pass
```

D5 Pass 条件：
1. Corpus ≥30 条，覆盖 ≥9 类 violation
2. Corpus gate rate ≥85%（gate cases：may_detect !== false 的 violation 条目）
3. Corpus boundary cases ≥5 条，单独报告检出率（不作为 Pass gate）
4. Corpus pass 样本误报 ≤1 条
5. Evidence-aware grounding package 正确输出（inferredFacts 为空，inferred 走 allowedFacts）
6. NarrativeBuilder 按 source 分组渲染
7. 3 个新 checker 正确检出（agent_state_leak / local_scope_leak / missing_source_attribution）
8. E2E 5 个具体场景测试通过
9. Aliveness report D5 = Pass
10. `narrative-violation-corpus.test.js` 显式断言 corpus 数量、gate rate、误报上限

---

## 9. 不做的事

- 不实现结构化 claim extraction（需 NLP parser）
- 不引入中文分词/依存句法库
- 不修改 KnowledgeStore/CanonEventPipeline/WorldFactStore
- 不修改 LLM prompt 生成逻辑的核心结构（只增强 grounding section）
- 不实现 StoryArc runtime
- 不让 narrative 创建 facts
- 不 bump schemaVersion
- 不改 Stable Envelope
