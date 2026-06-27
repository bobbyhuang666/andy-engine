# v2.4 Epistemic Integrity — 阶段路线图

> 总规划师批准日期：2026-06-26
> 阶段关闭日期：2026-06-27
> 阶段状态：✅ **PASS — 全部三波交付完成，D3 Warning → Pass**
> 阶段目标：D3 Epistemic Correctness 从 Warning 推向 Pass
> 核心话语：谁知道什么、凭什么知道、何时知道、能否传播、能否被叙事表达

---

## 0. 摘要

v2.4 是 Andy Engine 认知层的基础设施升级。当前 `told`/`inferred` 知识来源仅存在于 JSDoc，生产代码从未写入，无测试覆盖。AGENT_STATE 私有过滤器仅存在于 FactProvider 视图层，WorldFactStore 存储层无 override，绕过 FactProvider 即泄漏他人位置/情绪。

本阶段三波递进：

- **W1**（Told + Evidence）：实现 told 传播路径 + KnowledgeStore evidence 结构化 ✅
- **W2**（Inferred + Privacy）：实现 inferred 传播 + WorldFactStore AGENT_STATE 防护 ✅
- **W3**（Benchmark）：D3 E2E 测试矩阵全覆盖 + aliveness-report D3 → Pass ✅

---

## 1. 阶段边界

### 明确禁止

- 不让 narrative 创建 facts
- 不让 FactProvider / action provider 写世界
- 不改 Stable Envelope
- 不引入 StoryArc / UI / Andy Town / npm publish
- 不把具体 domain 词写进 core

### 触及边界需回总规划师

- 任何超出 KnowledgeStore/FactProvider/CanonEventPipeline 范围的新模块引入
- WorldFactStore 公共方法签名变更
- schemaVersion bump

---

## 2. 三波总览（含实际测试计数）

| 波次 | 组件变更 | 新增 it() | 实际文件变更 | 依赖 |
|---|---|---|---|---|
| **W1** | KnowledgeStore, CanonEventPipeline | KS +16, CEP +15 = **31** | KnowledgeStore.js, CanonEventPipeline.js, knowledge-store.test.js, canon-event-pipeline.test.js | 无 |
| **W2** | WorldFactStore, CanonEventPipeline | CEP +6, WFS +3 = **9** | CanonEventPipeline.js, WorldFactStore.js, canon-event-pipeline.test.js, world-fact-store.test.js | W1 |
| **W3** | aliveness-report.js | E2E +10 = **10** | epistemic-evidence-matrix.test.js (新建), aliveness-report.js | W1+W2 |

**阶段总计新增 it()：50**（跨 4 个测试文件）

---

## 3. W1 交付结果

**目标**：实现 `told` 知识传播路径，同时将 KnowledgeStore 的 evidence 从单字符串升级为结构化对象（兼容旧格式）。

### 3.1 KnowledgeStore evidence 结构化 ✅

```js
Evidence = {
  source: 'direct'|'observed'|'overheard'|'told'|'inferred',
  confidence: 1.0|0.9|0.7|0.6|0.5,
  learnedAt: number|0,
  propagatedFrom: string|null,
  eventId: string|null,
}
```

### 3.2 Told 传播路径 ✅

- 社交事件（event.type === 'social'）触发 told 传播
- 知情者（teller）必须 `hasKnowledge(factId)`
- 每方向每交互最多传播 **1 条 fact**
- 仅传播 `scope=PUBLIC` 的事实
- 不传播他人 AGENT_STATE（即使 teller 知道）
- 被告知者（listener）获得 `source='told', confidence=0.6, propagatedFrom=teller`

### 3.3 兼容策略 ✅

- `addKnowledge(agentId, factId, source)` 保持签名兼容：传 string 自动归一化为 Evidence
- `getSource(agentId, factId)` 保持返回 string
- `toJSON()` 输出 `evidence` + `sources` 双 key
- `fromJSON()` 优先读 `evidence`，fallback 读 `sources`（string 自动归一化）
- 不 bump schemaVersion，不做 Stable Envelope 变更

### 3.4 测试（KS +16, CEP +15）

KS：evidence 归一化 + getSource/getEvidence 兼容 + toJSON/fromJSON round-trip + 旧格式兼容
CEP：told 触发/来源/置信度/propagatedFrom/非社交不触发/仅 PUBLIC/不传 AGENT_STATE/已知道不重复/每方向 1 条/失效不传/完整管线/双向传播

---

## 4. W2 交付结果

### 4.1 Inferred 传播 ✅

- 触发：PUBLIC 事件 + 同位置 + 无现有知识
- 优先级：direct(1.0) > observed(0.9) > overheard(0.7) > inferred(0.5)
- 仅写 KnowledgeStore，不写 WorldFactStore

### 4.2 AGENT_STATE 存储层防护 ✅

- WorldFactStore.getFactsForAgent 增加 AGENT_STATE 非拥有者过滤
- 与 FactProvider._getAllowedFacts 对称
- 影响：0 个生产调用者（仅测试文件）

### 4.3 测试（CEP +6, WFS +3）

CEP：inferred 机制验证 + propagatedFrom=null + LOCAL 不触发 + 不同位置不触发 + 优先级链
WFS：AGENT_STATE 他人不可见 + 自身可见 + 非类型可见

---

## 5. W3 交付结果

### 5.1 D3 E2E Evidence Matrix ✅

10 个 E2E 测试覆盖：direct/observed/overheard/told/inferred 全 5 类 + FP/FN + AGENT_STATE 边界 + 优先级 + scope 泄露

### 5.2 Aliveness Report D3 → Pass ✅

- warningNote 移除
- D3 判定逻辑升级：双文件（alice-bob + evidence-matrix）须同时 pass
- aliveness-report 显示 D3 Epistemic Correctness — Pass

---

## 6. 验收结果

```
✅ npm test              — 2682/2682 passed (163 files)
✅ npm run test:domain   — 81/81 passed
✅ npm run check:boundaries — All boundary checks passed
✅ npm run replay:diff   — 100/100 matched
✅ D3 Epistemic Correctness — Pass
```

---

## 7. 未触及的边界

- 未引入 FactScope.PRIVATE
- 未 bump schemaVersion
- 未改 Stable Envelope
- 未让 narrative 创建 facts
- inferred 仅限同区域 PUBLIC，未扩展到关系推断
- told 仅单跳，未实现完整 evidence chain（A told B told C）
