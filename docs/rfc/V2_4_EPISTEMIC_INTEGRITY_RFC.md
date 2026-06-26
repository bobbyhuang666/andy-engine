# v2.4 Epistemic Integrity RFC

> 阶段：v2.4 设计（仅 RFC，不写代码，不派执行 AI）
> 状态：待独立审计。审计通过后总规划师决定 v2.4 波次。
> 来源：v2.4 Direction Selection Brief（commit `a3826de`），总规划师选定 A 方向。
> 核实基线：commit `a3826de`，经两个只读审计 agent 交叉核实代码事实。

## 0. 摘要

v2.4 Epistemic Integrity Phase 目标：把 Andy 的"谁知道什么、凭什么知道、何时知道、能不能说出来"做成可验证能力，D3 从 Warning 推向 Pass。

经代码审计确认，当前认知层存在两类缺口：
1. **已声明未落地**：`told` / `inferred` 作为 knowledge source 仅存在于 JSDoc，生产代码从未写入，无测试覆盖。
2. **防护不对称**：AGENT_STATE 私有过滤器仅存在于 FactProvider（视图层），WorldFactStore 存储层无 override，绕过 FactProvider 即泄漏他人位置/情绪。

本 RFC 回答总规划师 6 个设计问题，不写代码。

---

## 1. 当前 D3 Warning 的真实原因

### 1.1 已有 epistemic tests

| 测试文件 | 覆盖 | D3 相关? |
|---|---|---|
| `tests/e2e/alice-bob-epistemic-boundary.test.js` it#1 | direct（alice 参与吃）+ local-scope 非传播（bob 不知） | ✓ 核心但单一 |
| `tests/facts/knowledge-store.test.js` | KS 单元：direct/observed/overheard source + 独立性 + round-trip | ✓ KS 结构 |
| `tests/facts/canon-event-pipeline.test.js` | direct/observed/overheard 传播 + local 不传播 + 去重 | ✓ 传播管道 |
| `tests/facts/action-selected-canon-path.test.js` | action_selected 无传播 + participants direct | ✓ 边界 |
| `tests/integration/fact-system-slice.test.js` | 3 角色：direct/observed/不知 + local 不传播 | ✓ 最强 E2E |
| `tests/facts/grounded-narrative.test.js` | inferredFacts（同区域推断 grounding）+ 失效排除 | ✓ grounding 推断 |
| `tests/e2e/aliveness-metrics-smoke.test.js:70` | 名为"epistemic boundary score"但仅断言 narrative 非空 | ✗ 误导性，无实质 |

### 1.2 direct / observed / told / inferred 路径覆盖

| source | 生产写入 | 测试覆盖 | 缺口 |
|---|---|---|---|
| `direct` | ✅ CanonEventPipeline:112（participants） | ✅ 多处单元+E2E | 无 |
| `observed` | ✅ CanonEventPipeline:121（observers） | ✅ 单元+E2E | 无 |
| `overheard` | ✅ CanonEventPipeline:132（同区域 public） | ⚠️ 仅 1 单元测试，无 E2E | E2E 缺 |
| `told` | ❌ **从未写入**（仅 JSDoc 声明） | ❌ 无测试 | **未落地** |
| `inferred` | ❌ **从未写入**（仅 JSDoc 声明） | ❌ 无测试 | **未落地** |

**关键事实**：`FactProvider._getInferredFacts` 产出的 `inferredFacts` 是 grounding 概念（同区域推算），**不是** KnowledgeStore 的 `source='inferred'`。两者不应混淆。

### 1.3 AGENT_STATE 私有知识边界薄弱点

| 防护层 | 存在? | 位置 | 风险 |
|---|---|---|---|
| FactProvider 视图过滤 | ✅ | `FactProvider.js:118-119`（非 owner AGENT_STATE 跳过） | 仅视图层 |
| WorldFactStore 存储过滤 | ❌ | `WorldFactStore.js:267`（public 一律 known=true） | **绕过 FactProvider 即泄漏** |
| FactScope.PRIVATE 枚举 | ❌ | `FactSchema.js:42`（仅 PUBLIC/LOCAL） | schema 层无强制 |
| AGENT_STATE 过滤单元测试 | ❌ | 无专门测试 | 仅 E2E 间接覆盖 |

### 1.4 KnowledgeStore / FactProvider / grounding package 职责边界

| 组件 | 职责 | 当前字段 |
|---|---|---|
| **WorldFactStore**（canon） | 世界事实存储与索引，事实生命周期 | fact.timestamp/confidence/source/scope/participants/observers |
| **KnowledgeStore**（knowledge） | "谁知道什么"轻量索引 | `_knowledge: agentId→Set<factId>` + `_sources: agentId:factId→source`（单字符串） |
| **FactProvider**（narrative） | 按角色视角过滤 grounding package | allowedFacts/inferredFacts/forbiddenFacts + metadata |
| **FactEmitter + CanonEventPipeline**（canon） | 引擎状态→facts→knowledge 产生管线 | direct/observed/overheard 传播 |

**KnowledgeStore 溯源字段缺失**：无 confidence / timestamp / propagation path。source 字段语义重载"渠道类型"，无传播链追踪（如 A told B told C）。

**grounding package 结构**：GroundingPackage.schema.js 是空壳（仅检查 typeof object）。forbiddenFacts 在 LLM prompt 中未渲染（仅用于事后 FactConsistencyChecker 校验）。

---

## 2. Epistemic Evidence Model

### 2.1 direct / observed / told / inferred 各自定义

| evidence | 定义 | 产生条件 |
|---|---|---|
| `direct` | agent 是事件参与者 | event.participants 包含 agentId |
| `observed` | agent 是事件观察者 | event.observers 包含 agentId |
| `overheard` | agent 在事件发生地同区域且事件 public | scope=PUBLIC + agent.position===event.location + 非 participant/observer |
| `told` | agent 经对话从知情者获知 | 某交互事件中知情者告知（需 gossip/dialogue 路径） |
| `inferred` | agent 基于已有知识推断 | agent 已知 fact A + 推断规则（如同区域 public 事件）→ 推断 fact B |

### 2.2 每种 evidence 如何产生

- `direct` / `observed` / `overheard`：已落地（CanonEventPipeline._propagateKnowledge）。
- `told`：**需新增传播路径**。当交互事件（type=social）发生，参与者中知情者可将已知 fact 告知其他参与者。产生条件：
  - 交互事件发生（两人同区域交互）
  - 知情者 hasKnowledge(factId)
  - 被告知者在交互中（participants 含双方）
  - 传播：addKnowledge(被告知者, factId, 'told')
- `inferred`：**需新增推断引擎**。agent 基于已知 facts + 推断规则推导新知识。产生条件：
  - agent 已知某 public 事件 fact
  - 推断规则：同区域 public 事件 → agent 推断该事件发生
  - 推断：addKnowledge(agent, inferredFactId, 'inferred')
  - 注意：与 FactProvider._getInferredFacts（grounding 推断）不同——后者不写 KnowledgeStore，仅临时进 grounding。

### 2.3 如何记录 source / confidence / timestamp / propagation path

当前 KnowledgeStore._sources 仅存单字符串 source。建议升级为结构化 evidence 对象：

```js
// 当前：_sources: Map<'agentId:factId', string>
// 升级：_knowledge: Map<'agentId', Map<'factId', Evidence>>
{
  source: 'told',           // direct/observed/overheard/told/inferred
  confidence: 0.8,          // direct=1.0, observed=0.9, overheard=0.7, told=0.6, inferred=0.5
  learnedAt: simTime,        // 何时获知
  propagatedFrom: 'agentB',  // told 路径：告知者；direct/observed：null
  eventId: 'evt_42',        // 触获知的事件
}
```

### 2.4 是否需要 evidence chain

**需要**，但分层实现：
- **最小 viable**：结构化 evidence 对象（source/confidence/learnedAt/propagatedFrom）。
- **完整 chain**（A told B told C）：propagatedFrom 记录上一跳，可递归追溯。当前可仅记单跳，完整 chain 留待后续。

---

## 3. Propagation Rules

### 3.1 事件参与者知道什么

- participants → `direct`（confidence=1.0）
- 知道事件的全部 public 字段 + 作为 participant 的 private 字段（如自身情绪反应）

### 3.2 观察者知道什么

- observers → `observed`（confidence=0.9）
- 知道事件的 public 字段（事件发生、参与者、位置）
- 不知 participants 的 private 反应（如内心情绪）

### 3.3 被告知者知道什么

- `told`（confidence=0.6）
- 知道 fact 的 public 字段，但经告知者转述（可能失真，confidence 降低）
- 限制：告知者必须自身 hasKnowledge + 必须在交互事件中

### 3.4 inference 的范围和限制

- `inferred`（confidence=0.5）
- 范围：同区域 public 事件推断（agent 在区域 X，推断区域 X 的 public 事件发生）
- 限制：不推断 private/local 事件，不推断他人 AGENT_STATE
- 限制：推断不产生新 fact（仅 KnowledgeStore 记录），不写 WorldFactStore

### 3.5 gossip 如何避免越权

- gossip（`told` 传播）仅在交互事件中发生（两人在同区域交互）
- 告知者必须 hasKnowledge（不能告知自己不知道的）
- 被告知者获得 `told` source（confidence 降低），非 `direct`
- gossip 不传播 private/local 事实（仅 public 事实可被告知）
- gossip 不传播他人 AGENT_STATE（即使告知者通过 observed 知道，也不告知被告知者）

---

## 4. Grounding Boundary

### 4.1 narrative / LLM 能拿到哪些 facts

- `allowedFacts`：agent 确定 knowledge（hasKnowledge=true 的 facts）+ 自身 AGENT_STATE
- `inferredFacts`：同区域 public 事件推断（FactProvider._getInferredFacts，confidence=0.6）
- `forbiddenFacts`：他人 MEMORY + 其他区域 LOCAL 事件 + 他人 AGENT_STATE

### 4.2 agent private state 如何防泄漏

- **当前防线**：FactProvider._getAllowedFacts line 118-119（非 owner AGENT_STATE 跳过）
- **薄弱点**：WorldFactStore.getFactsForAgent 无 override，绕过 FactProvider 即泄漏
- **建议修复**：WorldFactStore.getFactsForAgent 增加 AGENT_STATE override（与 FactProvider 对称），或引入 FactScope.PRIVATE 在 schema 层强制

### 4.3 public scope 的 AGENT_STATE 为什么仍应 epistemically private

- AGENT_STATE 含 agent 位置/情绪/需求/behaviorField——是 agent 内心状态
- 即使 scope=PUBLIC（存储层），其他 agent 不应直接"读心"
- 其他 agent 需通过 direct/observed/told/inferred 证据获知（如观察到 alice 在食堂 → observed 而非直接读 AGENT_STATE）

### 4.4 FactProvider 如何过滤

- allowedFacts：hasKnowledge + 自身 AGENT_STATE
- inferredFacts：同区域 public 事件（不写 KnowledgeStore）
- forbiddenFacts：他人 MEMORY + 他人 AGENT_STATE + 其他区域 LOCAL
- **建议**：FactProvider 增加 `told` / `inferred` source 的 confidence 反映（told/inferred 的 facts 在 grounding 中标注低 confidence）

---

## 5. Tests / Benchmark

### 5.1 D3 Pass 的最小测试矩阵

| 场景 | source | 断言 | 当前覆盖? |
|---|---|---|---|
| alice 参与 → direct | direct | hasKnowledge + getSource=direct + confidence=1.0 | ✅ |
| bob 观察 → observed | observed | hasKnowledge + getSource=observed + confidence=0.9 | ✅ 单元 |
| charlie 同区域 → overheard | overheard | hasKnowledge + getSource=overheard + confidence=0.7 | ⚠️ 仅单元 |
| alice 告知 bob → told | told | hasKnowledge + getSource=told + confidence=0.6 + propagatedFrom=alice | ❌ |
| bob 推断 → inferred | inferred | hasKnowledge + getSource=inferred + confidence=0.5 | ❌ |
| AGENT_STATE 私有 | — | bob grounding 不含 alice AGENT_STATE | ⚠️ 间接 |
| gossip 不越权 | — | told 不传播 private/local/他人 AGENT_STATE | ❌ |
| 传播链单跳 | told | propagatedFrom 记录告知者 | ❌ |

### 5.2 direct / observed / told / inferred 每类至少哪些断言

每类至少：
- `hasKnowledge(agentId, factId)` true
- `getSource(agentId, factId)` === source
- `confidence` 符合预期
- grounding package 含/不含该 fact
- 其他 agent 不知（除非经传播）

### 5.3 false positive / false negative 如何测

- **false positive**（不该知却知）：bob 不在场却 hasKnowledge → fail
- **false negative**（该知却不知）：alice 参与却 !hasKnowledge → fail
- 测试构造：跨区域/非交互 agent 断言 !hasKnowledge

### 5.4 多 agent 场景如何覆盖

- 3+ agent 场景：alice 参与 + bob 观察 + charlie 同区域 + dave 远离
- 传播链：alice direct → bob observed → charlie overheard → dave 不知
- gossip：alice 告知 bob → bob told → charlie 不知（不在交互）

---

## 6. 边界

### 6.1 明确禁止

- 不让 narrative 创建 facts（narrative 只能表达 grounding 允许的 facts）
- 不让 provider 写世界（FactProvider 只读过滤，不写 WorldFactStore/KnowledgeStore）
- 不改 Stable Envelope（认知层扩展在 KnowledgeStore/FactProvider 内部）
- 不引入 StoryArc / UI / publish
- 不把具体 domain 词写进 core

### 6.2 触及边界需回总规划师

- FactScope.PRIVATE 引入（改 FactSchema 枚举，属 schema 变更）
- WorldFactStore.getFactsForAgent AGENT_STATE override（改存储层行为，可能影响既有消费者）
- KnowledgeStore 结构升级（_sources → 结构化 evidence，改 toJSON 结构，可能需 schemaVersion）

### 6.3 v2.4 候选波次（不启动，待审计+总规划师批准）

- **W1**：told 传播路径实现（交互事件中知情者告知）+ evidence 结构化（source/confidence/learnedAt/propagatedFrom）+ 测试。
- **W2**：inferred 传播路径实现（推断引擎）+ AGENT_STATE 私有防护强化（FactScope.PRIVATE 或存储层 override）+ 测试。
- **W3**：D3 E2E 测试升级（4 evidence 类型全覆盖 + 多 agent 场景 + false positive/negative）+ aliveness-report D3 升 Pass。

---

## 7. 待独立审计的问题

1. `told` / `inferred` 是否在 v2.4 全部实现，还是 `told` 优先（inferred 推迟）？
2. evidence 结构化（source/confidence/learnedAt/propagatedFrom）是否触发 KnowledgeStore toJSON 结构变更 → schemaVersion bump？
3. FactScope.PRIVATE 引入是否必要，还是 FactProvider + WorldFactStore 对称 override 足够？
4. gossip 传播的交互事件触发条件（哪些 type=social 触发 told？频率限制？）
5. inferred 推断引擎的规则范围（仅同区域 public，还是扩展到关系推断等）？
