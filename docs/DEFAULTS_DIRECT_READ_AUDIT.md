# defaults.js 直接读取审计报告

> 审计目标：检查所有引用 defaults.js 中文关键字的代码路径，确认是否优先使用 domain.semanticProfile / domain config，识别仍直接读 defaults.js 的路径及行为影响。

---

## 1. 双轨数据架构概览

defaults.js 中存在 **两套并行的语义数据**，分别服务不同子系统：

### 轨道 A：`ANDY_DEFAULTS.eventConsequenceRules`（英文）

| 键 | 消费者 | 用途 |
|---|---|---|
| `eventMeaningRules` | EventEffectPipeline | 事件→地点意义 delta |
| `emotionKeywords` | EventEffectPipeline | 事件描述→情绪标签推断 |
| `tendencyRules` | EventEffectPipeline | 事件→行为场 delta |

### 轨道 B：`SEMANTIC_EVENT_CATEGORIES`（英文）

| 键 | 消费者 | 用途 |
|---|---|---|
| `typeMap` | EventDispatcher, PersonalMemory | 事件类型→语义分类 |
| `keywordMap` | EventDispatcher, PersonalMemory | 内容关键词→语义分类 |
| `stateCategoryMap` | PersonalMemory | 状态类别→语义分类 |

### 轨道 C：`domain.semanticProfile`（中文，domain-specific）

| 键 | 消费者 | 用途 |
|---|---|---|
| `emotionKeywords` | Appraisal, MindWanderRuntime, EmotionRegulation, AgentNarrative | 心理学模块情绪关键词 |
| `defaultSemanticCategories.*` | **仅 API 暴露 + 测试** | 不被运行时分类代码消费 |
| `behaviorModifiers` | BehaviorLabeler | 行为修饰词 |
| `mindWander` | MindWanderRuntime | 走神配置 |

---

## 2. 逐路径审计

### 2.1 EventEffectPipeline — `eventConsequenceRules`

**文件**: `src/effects/EventEffectPipeline.js:152-157`

```js
const rules = domain
  ? domain.eventConsequenceRules
  : require('../config/defaults').ANDY_DEFAULTS.eventConsequenceRules;
```

- **是否直接读 defaults.js**: 是（fallback）
- **是否优先 domain**: 是。`domain` 来自 `AndyWorld.this.domain`（DomainRegistry 实例）
- **DomainRegistry getter** (`src/domain/DomainRegistry.js:154-155`):
  ```js
  return this.domain.eventConsequenceRules || require('../config/defaults').ANDY_DEFAULTS.eventConsequenceRules;
  ```
- **campus/tavern preset 提供**: 是。`presets/campus/index.js:626-649` 和 `presets/tavern/index.js:375-398` 均定义了中文 `eventConsequenceRules`
- **无 domain 时行为**: 使用 defaults.js 英文关键词（`rest`, `work`, `chat` 等）
- **行为变化风险**: **低**。campus/tavern 域均覆盖。仅无 domain 的 minimal fallback 路径受影响

### 2.2 EventDispatcher — `SEMANTIC_EVENT_CATEGORIES`

**文件**: `src/runtime/EventDispatcher.js:44`

```js
this._semanticCategories = this.domain?.memoryTemplates?.semanticCategories || SEMANTIC_EVENT_CATEGORIES;
```

- **是否直接读 defaults.js**: 是（fallback）
- **是否优先 domain**: 是。`this.domain` 来自构造函数参数或 `getDefaultDomain()`
- **campus/tavern preset 提供**: 是。`presets/campus/index.js:441-491` 和 `presets/tavern/index.js:189-228` 均定义了中文 `memoryTemplates.semanticCategories`
- **无 domain 时行为**: 使用 defaults.js 英文 `typeMap`/`keywordMap`/`stateCategoryMap`
- **行为变化风险**: **低**。campus/tavern 域均覆盖。仅 `domain-deep.test.js:316-319` 测试直接依赖英文 fallback

### 2.3 PersonalMemory — `SEMANTIC_EVENT_CATEGORIES`

**文件**: `src/agent/memory/PersonalMemory.js:44`

```js
this._semanticCategories = this.domain.memoryTemplates.semanticCategories || SEMANTIC_EVENT_CATEGORIES;
```

- **是否直接读 defaults.js**: 是（fallback）
- **是否优先 domain**: 是
- **行为变化风险**: **低**。同 EventDispatcher

### 2.4 DomainRegistry — `eventConsequenceRules`

**文件**: `src/domain/DomainRegistry.js:154-155`

```js
get eventConsequenceRules() {
  return this.domain.eventConsequenceRules || require('../config/defaults').ANDY_DEFAULTS.eventConsequenceRules;
}
```

- **是否直接读 defaults.js**: 是（fallback）
- **是否优先 domain**: 是
- **行为变化风险**: **低**。campus/tavern 均覆盖

### 2.5 `semanticProfile.defaultSemanticCategories` — 数据冗余路径

**关键发现**: `domain.semanticProfile.defaultSemanticCategories` 包含 `typeMap`、`keywordMap`、`stateCategoryMap`、`eventMeaningRules`，但：

- EventDispatcher **不读** `semanticProfile.defaultSemanticCategories`，读 `memoryTemplates.semanticCategories`
- PersonalMemory **不读** `semanticProfile.defaultSemanticCategories`，读 `memoryTemplates.semanticCategories`
- EventEffectPipeline **不读** `semanticProfile.defaultSemanticCategories.eventMeaningRules`，读 `eventConsequenceRules.eventMeaningRules`

**结论**: `semanticProfile.defaultSemanticCategories` 是纯 API/测试暴露层，不影响运行时行为。

---

## 3. 直接读 defaults.js 汇总

| 代码路径 | 文件:行 | 读取键 | 优先 domain | fallback 到 defaults | 行为变化风险 |
|---|---|---|---|---|---|
| EventEffectPipeline.applyEventConsequences | `src/effects/EventEffectPipeline.js:155-157` | `eventConsequenceRules` | ✅ | ✅ | 低 |
| EventDispatcher constructor | `src/runtime/EventDispatcher.js:44` | `SEMANTIC_EVENT_CATEGORIES` | ✅ | ✅ | 低 |
| PersonalMemory constructor | `src/agent/memory/PersonalMemory.js:44` | `SEMANTIC_EVENT_CATEGORIES` | ✅ | ✅ | 低 |
| DomainRegistry.eventConsequenceRules | `src/domain/DomainRegistry.js:155` | `eventConsequenceRules` | ✅ | ✅ | 低 |

**所有 4 个路径均为 fallback 模式**：优先读 domain，仅在 domain 未提供时回退到 defaults.js。

---

## 4. 受影响的测试（仅 defaults fallback 路径）

### 4.1 `tests/domain-deep.test.js:316-319`

```js
it('minimal domain missing semanticCategories: 不崩，走 neutral fallback', () => {
  const ed = new EventDispatcher({ eventTemplates: {}, placeTypes: {} });
  const evt = ed.createEvent({ type: 'social', content: '聊了几句' });
  expect(evt.semanticCategory).toBe('social_interaction'); // typeMap fallback from defaults
});
```

**影响**: 如果 defaults.js 的 `SEMANTIC_EVENT_CATEGORIES.typeMap.social` 值从 `'social_interaction'` 变为其他值，此测试将失败。

### 4.2 `tests/integration/semanticRegression.test.js` 系列

这些测试通过 `engine.domain.semanticProfile` 读取数据。campus preset 提供完整的 `semanticProfile`，**不依赖 defaults.js fallback**。

### 4.3 `tests/unit/semanticProfile-merge.test.js` 系列

这些测试测试 `mergeSemanticProfile()` 合并逻辑。第一个测试 (`profile.defaultSemanticCategories.*`) 读取 campus domain 数据，**不依赖 defaults.js**。

---

## 5. 结论

### 无行为变化

替换 defaults.js 中的中文关键字（如果仅影响 defaults fallback 值）：

1. **campus/tavern 域用户**: 无影响。domain 值优先。
2. **无 domain 的 minimal 用户**: 受影响。英文 fallback 值会变化。

### defaults.js 直接读取路径均为安全的 fallback

所有 4 个直接读取路径都遵循 "domain 优先 → defaults 补充" 模式。这意味着：

- 只要 presets 继续提供完整配置，defaults.js 的内容不影响使用 preset 的用户
- defaults.js 作为"无 domain 场景的兜底"角色，其英文值为向后兼容保留

### `semanticProfile.defaultSemanticCategories` 是数据冗余

`semanticProfile.defaultSemanticCategories` 与 `memoryTemplates.semanticCategories` 在 campus/tavern preset 中包含相同数据，但运行时代码只消费后者。建议未来统一为单一数据源。
