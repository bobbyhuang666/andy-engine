# v2.4-W1 任务卡：Told Propagation + Structured Evidence

> 总规划师裁决日期：2026-06-26
> 写入边界：KnowledgeStore, CanonEventPipeline, tests
> 不写入：WorldFactStore, FactSchema, Stable Envelope, narrative, provider
> 兼容策略：evidence 结构化不 bump schemaVersion，fromJSON best-effort 读旧格式

---

## 1. 任务概述

### 1.1 要做什么

1. **KnowledgeStore evidence 升级**：`_sources: Map<'agentId:factId', string>` → `_evidence: Map<'agentId:factId', Evidence>`，同时保持线程兼容。
2. **Told 传播路径**：社交事件触发 KnowledgeStore 写入 `source='told'`。
3. **FactProvider 适配**：FactProvider 读取 KnowledgeStore 的 told evidence 进入 `allowedFacts`。
4. **测试矩阵**：evidence 升级 + told 路径 + backward compat + 集成。

### 1.2 不做什么

- 不修改 FactScope 枚举（不引入 PRIVATE）
- 不修改 WorldFactStore
- 不修改 FactEmitter
- 不修改 Stable Envelope
- 不 bump schemaVersion
- 不实现 inferred
- 不修改 narrative/LLM 层

---

## 2. KnowledgeStore 变更

### 2.1 Evidence 数据结构

```js
/**
 * @typedef {Object} Evidence
 * @property {string}   source           - 'direct'|'observed'|'overheard'|'told'|'inferred'
 * @property {number}   confidence       - [0-1], direct=1.0 observed=0.9 overheard=0.7 told=0.6 inferred=0.5
 * @property {number}   learnedAt        - simTime ms (0 = unknown, backward compat)
 * @property {string|null} propagatedFrom - told: 告知者 ID; 其他: null
 * @property {string|null} eventId       - 触发事件 ID (optional)
 */
```

### 2.2 内部变更

| 当前 | 升级后 |
|---|---|
| `_sources: Map<'agentId:factId', string>` | `_evidence: Map<'agentId:factId', Evidence>` |
| `addKnowledge(id, factId, sourceStr)` | 签名不变，`sourceOrEvidence` 支持 string→Evidence 自动归一化 |
| `getSource(id, factId) → string` | 不变，返回 `evidence.source` |
| 无 | `getEvidence(id, factId) → Evidence\|null` |
| `toJSON()` → `{ knowledge, sources }` | `{ knowledge, sources, evidence }` (sources 保留兼容别名为 evidence 的同值字段) |
| `fromJSON(data, factStore)` 读 `sources` | 读 `evidence` 优先，fallback 读 `sources` 并将 string value 转为 Evidence |

### 2.3 置信度默认值

```js
const EVIDENCE_CONFIDENCE = {
  direct: 1.0,
  observed: 0.9,
  overheard: 0.7,
  told: 0.6,
  inferred: 0.5,
};
```

### 2.4 方法签名

```js
// 保持签名兼容：第三个参数 string 或 object 都接受
addKnowledge(agentId, factId, sourceOrEvidence = 'direct')

// 归一化：string → Evidence, object → fill defaults
_normalizeEvidence(sourceOrEvidence) → Evidence

// 新方法：获取完整 evidence
getEvidence(agentId, factId) → Evidence | null

// 已有方法：不变，返回 source string
getSource(agentId, factId) → string | null
```

### 2.5 序列化兼容策略

**toJSON 输出格式**：
```js
{
  knowledge: { 'alice': ['fact1', 'fact2'] },
  evidence: {
    'alice:fact1': { source: 'direct', confidence: 1.0, learnedAt: 0, propagatedFrom: null, eventId: null },
    'alice:fact2': { source: 'told', confidence: 0.6, learnedAt: 1234567890, propagatedFrom: 'bob', eventId: 'evt_social_1' },
  },
  // sources 保留作为 evidence 的别名（相同内容），便于下游读取旧结构
}
```

**fromJSON 读入逻辑**（优先顺序）：
1. 如果 `data.evidence` 存在：直接读，值已是 Evidence 对象
2. 如果 `data.sources` 存在且值是 string：`_normalizeEvidence(stringValue)` 转为 Evidence
3. 如果 `data.sources` 存在且值是 object：直接作为 Evidence 使用（已升级的旧存档）
4. 如果两者都不存在：空 `_evidence`

**兼容性保证**：
- 新格式写入 runtimeSnapshot → 旧代码读 `sources` 时会读到重复的兼容 key
- 旧格式写入 runtimeSnapshot → 新代码能通过 `sources` fallback 读取并归一化
- 不会因格式变更导致加载崩溃

---

## 3. CanonEventPipeline 变更

### 3.1 Told 传播触发条件

在 `_propagateKnowledge` 之后，新增 `_propagateGossip(event, agents, fact)`：

```js
_propagateGossip(event, agents, fact) {
  // 仅社交事件触发
  if (event.type !== 'social') return [];
  
  const participants = event.participants || [];
  if (participants.length < 2) return [];
  
  const updates = [];
  const processedPairs = new Set();
  
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      // A → B direction
      const pair1 = `${participants[i]}→${participants[j]}`;
      if (!processedPairs.has(pair1)) {
        processedPairs.add(pair1);
        const result = this._tryToldPropagation(
          participants[i], participants[j], event
        );
        if (result) updates.push(result);
      }
      
      // B → A direction
      const pair2 = `${participants[j]}→${participants[i]}`;
      if (!processedPairs.has(pair2)) {
        processedPairs.add(pair2);
        const result = this._tryToldPropagation(
          participants[j], participants[i], event
        );
        if (result) updates.push(result);
      }
    }
  }
  
  return updates;
}
```

### 3.2 Told 传播筛选逻辑

```js
_tryToldPropagation(tellerId, listenerId, event) {
  const tellerFacts = this.knowledgeStore.getKnownFactIds(tellerId);
  const eventTime = event.time instanceof Date ? event.time.getTime() : (event.time || 0);
  
  for (const factId of tellerFacts) {
    // 1. Listener 不知
    if (this.knowledgeStore.hasKnowledge(listenerId, factId)) continue;
    
    // 2. 事实有效
    const fact = this.factStore.getFactById(factId);
    if (!fact || fact._invalidated) continue;
    
    // 3. 仅 PUBLIC scope
    if (fact.scope !== FactScope.PUBLIC) continue;
    
    // 4. 不传播他人 AGENT_STATE
    if (fact.type === FactType.AGENT_STATE && fact.agentId !== tellerId) continue;
    
    // 5. 告知者必须 hasKnowledge（已经通过 tellerFacts 确保）
    
    // 选择第一个符合条件的 fact（最多传播 1 条）
    this.knowledgeStore.addKnowledge(listenerId, factId, {
      source: 'told',
      confidence: 0.6,
      learnedAt: eventTime,
      propagatedFrom: tellerId,
      eventId: event.id || null,
    });
    
    return { agentId: listenerId, source: 'told', propagatedFrom: tellerId, factId };
  }
  
  return null;
}
```

### 3.3 集成到 processEvent

在 `processEvent` 中 `_propagateKnowledge` 调用之后追加：

```js
// 3. Told propagation (social events only)
if (this.knowledgeStore) {
  const gossipUpdates = this._propagateGossip(event, agents, fact);
  result.knowledgeUpdates.push(...gossipUpdates);
}
```

**注意**：`processEvents` 批量处理会自动覆盖，因为内部调用 `processEvent`。

---

## 4. FactProvider 适配

### 4.1 变更内容

FactProvider._getAllowedFacts 已有通过 KnowledgeStore 读取已知 facts 的路径（line 127-134）：
```js
if (this.knowledgeStore) {
  const knownFacts = this.knowledgeStore.getKnownFacts(agentId, options);
  // ...
}
```

**W1 不需要修改 FactProvider**。因为：

- `knowledgeStore.getKnownFacts()` 返回 agent 知道的所有事实（含 told）
- `getSource()` 返回 'told'
- FactProvider 已将这些 facts 纳入 `allowedFacts`

**但**为强化 D3 边界，可在 FactProvider 增加标注逻辑：当 grounding package 包含 `source='told'` 的 fact 时，在 grounding 中标注 `_told: true`，便于 LLM prompt 区分来源。这个在 W3 再做，W1 不做。

**W1 仅需确认**：FactProvider 的 existing code path 已经能正确拾取 told evidence。

---

## 5. 测试矩阵

### 5.1 KnowledgeStore evidence 升级测试（`tests/facts/knowledge-store.test.js`）

| # | 场景 | 断言 |
|---|---|---|
| 1 | addKnowledge 传 string → 内部 Evidence 包含 source+confidence+learnedAt=0 | typeof evidence === 'object', evidence.source === string |
| 2 | addKnowledge 传 Evidence object → 原样存储 | getEvidence 返回的对象包含传入的所有字段 |
| 3 | addKnowledge 传 Evidence object 缺字段 → 默认值填充 | confidence 默认 1.0, propagatedFrom=null |
| 4 | getSource 返回 source string（向后兼容） | getSource(id, fid) === 'direct' |
| 5 | getEvidence 返回完整 Evidence | getEvidence(id, fid).confidence === 1.0 |
| 6 | 未知 agent/fact → getEvidence 返回 null | getEvidence('nobody', 'x') === null |
| 7 | toJSON 包含 evidence key | json.evidence 存在且格式正确 |
| 8 | toJSON 也包含 sources 兼容 key | json.sources 存在（与 evidence 同名数据） |
| 9 | fromJSON 新格式 → 正确恢复 Evidence | getEvidence 返回正确的结构化数据 |
| 10 | fromJSON 旧格式（sources 为 string）→ 归一化为 Evidence | getSource 正确，getEvidence 含正确 confidence |
| 11 | fromJSON 旧格式（sources 为 object）→ 直接使用 | getEvidence 返回原对象 |
| 12 | 新旧格式 round-trip 不影响数据完整性 | toJSON→fromJSON→toJSON 结果一致 |

### 5.2 Told 传播测试（`tests/facts/canon-event-pipeline.test.js`）

| # | 场景 | 断言 |
|---|---|---|
| 13 | 社交事件触发 told 传播 | 知情者 hasKnowledge → 被告知者 hasKnowledge |
| 14 | 被告知者 getSource 返回 'told' | getSource(被告知者, factId) === 'told' |
| 15 | 被告知者 getEvidence.confidence === 0.6 | getEvidence(被告知者, factId).confidence === 0.6 |
| 16 | 被告知者 getEvidence.propagatedFrom === 告知者 ID | propagatedFrom === tellerId |
| 17 | 非社交事件不触发 told | event.type !== 'social' → 无 told 更新 |
| 18 | 只传播 PUBLIC scope 的事实 | LOCAL scope 的事实不被 told |
| 19 | 不传播他人 AGENT_STATE | 即使 teller 知道 bob 的 AGENT_STATE，也不告诉 listener |
| 20 | 告知者必须 hasKnowledge | 告知者不知的事实不传播 |
| 21 | 被告知者已知道 → 不重复传播 | 已有 knowledge 的不重复 |
| 22 | 每方向每交互最多 1 条 fact | A→B 最多 1，B→A 最多 1 |
| 23 | 失效事实不传播 | _invalidated 的 fact 不进入 told |

### 5.3 集成测试（`tests/facts/canon-event-pipeline.test.js`）

| # | 场景 | 断言 |
|---|---|---|
| 24 | 完整管线：社交事件 → fact → direct → told | 参与者 direct + 被告知者 told |
| 25 | 多 agent：alice direct → bob told (alice 告知) | bob 通过 told 知道 |
| 26 | 多 agent：charlie 非交互 → 不知 | 不在交互中的 agent 不获得 told |

### 5.4 Backward compat（`tests/facts/knowledge-store.test.js`）

| # | 场景 | 断言 |
|---|---|---|
| 27 | 旧格式 JSON 能正常加载 | `{knowledge: {alice:['f1']}, sources: {'alice:f1':'direct'}}` → hasKnowledge=true, getSource='direct' |
| 28 | 旧 addKnowledge 调用（传 string）仍有效 | `addKnowledge('alice', 'f1', 'overheard')` → getSource='overheard', confidence=0.7 |
| 29 | 已有测试全部通过 | 原 KS 11 个 it() 全部通过（加 evidence 后） |

### 5.5 验收命令

```bash
npm test                                    # 全部 2632+ 测试通过
npm run test:domain                         # domain 边界通过
npm run check:boundaries                    # 架构边界通过（无新依赖引入）
npm run replay:diff                         # 100/100 matched
git diff --check                            # 无空白错误
```

---

## 6. 回滚方案

### 6.1 代码回滚

```bash
git revert <W1-merge-commit> --no-edit
```

### 6.2 runtimeSnapshot 兼容

如果 W1 写入的 runtimeSnapshot 包含新格式 `evidence` key，回滚后旧代码读 `sources` 会拿到兼容 key（toJSON 同时输出 `sources` 和 `evidence`），因此**即使回滚也不影响加载**。

如果需强制清理：
```bash
npm run golden:regen
```
（会生成不含 evidence 的旧格式快照）

### 6.3 风险项

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| fromJSON 读取旧格式失败 | 低 | 中（加载存盘失败） | 测试27 覆盖旧格式，CI 必过 |
| 社交事件无 fact 可传播 | 高 | 低（无 told 更新而已） | 静默跳过 |
| toJSON 输出膨胀（evidence 比 string 大） | 中 | 低（证据数通常 < 1000） | 监控 runtimeSnapshot 大小 |
| 已有测试因证据类型变更 fail | 低 | 低（已有测试用 string source） | 测试29 确保所有已有测试通过 |

---

## 7. 变更文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src/knowledge/KnowledgeStore.js` | modify | evidence 结构化 + 兼容层 |
| `src/canon/CanonEventPipeline.js` | modify | 新增 `_propagateGossip` + `_tryToldPropagation` |
| `tests/facts/knowledge-store.test.js` | modify | 新增 evidence 升级测试（~15 it） |
| `tests/facts/canon-event-pipeline.test.js` | modify | 新增 told 传播测试（~15 it） |
| `facts/index.js` | verify | 确认 KnowledgeStore 导出不受影响 |
| `docs/current/V2_4_W1_TASK_CARD.md` | create | 本文件 |

**不修改的文件**：WorldFactStore, FactSchema, FactEmitter, FactProvider, AndyWorld, EventDispatcher, narrative/, sdk/, store/, agent/

---

## 8. 执行顺序

1. KnowledgeStore evidence 结构化（变更+测试）
2. CanonEventPipeline told 传播（变更+测试）
3. 完整管线集成测试
4. Backward compat 测试
5. 全量验收：`npm test` + `npm run test:domain` + `npm run check:boundaries` + `npm run replay:diff`

---

## 9. 交付物

1. 代码：KnowledgeStore + CanonEventPipeline 变更
2. 测试：~30 新增 it()，全部通过
3. 验收通过后，执行 AI 自动推进 W2
