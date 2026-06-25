# RFC: Core ↔ Campus Preset 间接耦合彻底解耦

> 状态:**Open(待排期)** · 优先级:P2/重构 · 不阻塞当前 A 级硬化主线
> 关联:Wave 3b-2 遗留项 · AGENTS.md「Domain 规则」
> 架构师:本文档由架构师 AI 撰写,代码改动须另起 worker 执行(见「执行计划」)。

---

## 0. 摘要

Wave 3 已完成 core 构造函数层面的 domain 必传化(3b-1)与顶层 campus require 的惰性化(3b-2)。
但 core 仍有 **3 个文件 / 8 个调用点**通过 `DomainRegistry.getDefaultDomain()` 间接耦合到 campus preset。
本 RFC 提出彻底消除这条耦合的方案、代价与回滚路径,作为未来重构的依据。

**本 RFC 不立即改代码。** 它只记录现状、方案与 blast radius,供未来排期决策。

---

## 1. 背景与动机

AGENTS.md 要求:`src/`(core)不能硬编码 campus、tavern、Oak Town 或其他具体世界语义。
Wave 3b-1 已让 11 处 core 子系统构造函数在 domain 缺失时抛错,消除了 `|| getDefaultDomain()` 兜底。
Wave 3b-2 把 `DomainRegistry` 顶层的 `const campusDomain = require('../../presets/campus')` 改为 ctor 内惰性 require。

但 `getDefaultDomain()` 本身仍存在,且被 3 个 core 文件直接调用。这条路径在真实引擎运行时不触发
(因为 `index.js` 总是注入显式 domain),但在以下场景仍构成耦合:

1. **静态方法 / 惰性导出**:`BehaviorLabeler.project()`、`BehaviorLabeler.STATE_*`、`StateMachine.STATES` 等
   不经构造函数的入口,无法接收注入的 domain,只能回退 `getDefaultDomain()`。
2. **测试便利性**:26+ 测试文件用 `getDefaultDomain()` 获取 campus domain 作为 fixture。
3. **语义噪音**:core 在源码层面仍「知道」campus 存在,不符合「core domain-agnostic」的纯净目标。

虽不破坏运行时行为,但它使 core 的 domain 纯度声明带有一个星号(*)。彻底解耦可让该声明无保留。

---

## 2. 现状清单(实测 2026-06-26,架构师独立核实)

### 2.1 `getDefaultDomain()` 定义

`src/domain/DomainRegistry.js:340-352`:

```js
let _defaultInstance = null;
function getDefaultDomain() {
  if (!_defaultInstance) {
    _defaultInstance = new DomainRegistry();   // ← 触发 ctor 惰性 require
  }
  return _defaultInstance;
}
```

- 模块级函数(非静态/实例方法),`module.exports` 导出于 `DomainRegistry.js:356`。
- 单例缓存(`_defaultInstance`)。
- campus 耦合不在函数体,而在 ctor:`new DomainRegistry()` → ctor line 22 惰性 require。

### 2.2 `DomainRegistry` ctor 惰性 require(Wave 3b-2 改动)

`src/domain/DomainRegistry.js:19-23`:

```js
constructor(domainConfig = null, options = {}) {
  const { validate = true, strict = false } = options;
  const campusDomain = domainConfig || require('../../presets/campus');  // line 22
  this.domain = campusDomain;
```

- 在 ctor 内,非顶层。仅当 `domainConfig` 缺失时触发 require。
- campus 默认路径跳过校验(`if (validate && domainConfig)`,line 26)。

### 2.3 core 中 8 个 `getDefaultDomain()` 调用点(RFC 目标)

| 文件 | 行 | 用途 | 类型 |
|---|---|---|---|
| `src/agent/psychology/BehaviorLabeler.js` | 100 | `project()` 静态方法取 stateVectors/names | 静态方法 |
| `src/agent/psychology/BehaviorLabeler.js` | 174 | `describe()` 静态方法 | 静态方法 |
| `src/agent/psychology/BehaviorLabeler.js` | 210 | `getStateCenters()` 静态方法 | 静态方法 |
| `src/agent/psychology/BehaviorLabeler.js` | 374 | `STATE_CENTERS` 惰性导出 getter | 模块导出 |
| `src/agent/psychology/BehaviorLabeler.js` | 378 | `STATE_NAMES` 惰性导出 getter | 模块导出 |
| `src/agent/psychology/BehaviorLabeler.js` | 382 | `STATE_VECTORS` 惰性导出 getter | 模块导出 |
| `src/agent/psychology/NeedsSystem.native.js` | 102 | `getDrive()` 实例方法回退 | 实例方法 |
| `src/agent/psychology/StateMachine.js` | 84 | `STATES` 惰性导出 getter | 模块导出 |

**注**:交接文档原称「4 处惰性调用」。实测为 3 文件 8 调用点;NeedsSystem.js(pure-JS sibling)
已在 3b-1 解耦(改读 `this.domain.needDriveStates` + throw),不再是耦合点。
「4」应指 3b-0 当初的 4 个文件,或 4 个 `Object.defineProperty` 惰性导出 getter
(`STATE_CENTERS`/`STATE_NAMES`/`STATE_VECTORS`/`STATES`)。

### 2.4 已解耦(无需动作)

- `NeedsSystem.js`:3b-1 已改读 `this.domain.needDriveStates`,`getDefaultDomain` import 已移除。
- 11 处 3b-1 ctor `|| getDefaultDomain()`:均已改 `if (!domain) throw`。

### 2.5 入口层保留(AGENTS.md 允许,非 RFC 目标)

- `index.js:79` — `new DomainRegistry()`(campus 默认注入,向后兼容)。
- `index.js:159` — `require('./presets/campus/schedules')`(campus schedule fallback)。
- `src/sdk/*` 的 `DEFAULT_DOMAIN_ID = 'campus'` 常量(Wave 3 遗留 2 已泛化,语义为「默认域」)。

---

## 3. 耦合图

```
core 文件                          getDefaultDomain()          DomainRegistry ctor        campus preset
─────────────────────────────      ────────────────────         ────────────────────       ─────────────
BehaviorLabeler.js (×6)  ─────────┐
NeedsSystem.native.js (×1) ───────┼──►  getDefaultDomain()  ──► new DomainRegistry() ──► require('../../presets/campus')
StateMachine.js (×1)      ───────┘                                (ctor line 22)
                                                              ↑
                                              index.js:79 也走此路径(入口层,保留)
```

要达成「core 零 campus 耦合」,需切断 3 文件的 8 条边,并处理 ctor 这条公共汇点。

---

## 4. 方案

### 方案 A:显式注入静态方法 + 弃用惰性导出(推荐)

**核心思路**:静态方法与惰性导出改为接收 domain 参数;不再提供无参回退。

- `BehaviorLabeler.project(B, options)` → `BehaviorLabeler.project(B, options, domain)`,`domain` 必传,缺失抛错。
- `BehaviorLabeler.describe(B, domain)`、`getStateCenters(domain)` 同理。
- `STATE_CENTERS`/`STATE_NAMES`/`STATE_VECTORS`/`STATES` 惰性导出:**弃用**。改为 `getDomainStateVectors(domain)` 等显式函数,或在调用方就地计算。
  - 若有外部消费者依赖这些导出,提供 deprecated alias(内部仍调 `getDefaultDomain()` 但标 `@deprecated`,并加 console.warn)。
- `NeedsSystem.native.js:102` `getDrive()`:已接收 instance domain(3b-1 后 ctor 必传),把 `getDefaultDomain().needDriveStates` 回退改为 `this.domain.needDriveStates`(与 pure-JS sibling 一致),缺失则 `|| {}`。
- `DomainRegistry` ctor:移除 `|| require('../../presets/campus')`,改为 `if (!domainConfig) throw`。campus 默认注入上移到 `index.js` 入口层。

**入口层调整**:`index.js:79` `new DomainRegistry()` → `new DomainRegistry(require('./presets/campus'))`(显式注入,不依赖 ctor 隐式 require)。

**测试调整**:26+ 测试文件的 `getDefaultDomain()` 改为 `require('../../presets/campus')` 后 `new DomainRegistry(campus)`(与入口层一致),或保留 `getDefaultDomain()` 作为**测试专用便利函数**(见方案 B)。

**代价**:
- 改 3 core 文件 + `index.js` + 26 测试文件。
- 若有惰性导出的外部消费者,需 deprecated 过渡。
- blast radius 中等,但机械性强(替换模式统一)。

**收益**:core 源码层面彻底零 campus 耦合,`getDefaultDomain()` 可从 core 移除或仅留在 domain 层/测试层。

### 方案 B:保留 `getDefaultDomain()` 但限定为「测试/domain 层便利函数」

**核心思路**:不动静态方法签名,只把 `getDefaultDomain()` 的调用从 core 全部移除,改为必传 domain。`getDefaultDomain()` 函数本身保留,仅供 `tests/` 与 `src/domain/` 内部使用。

- core 3 文件的 8 调用点:按方案 A 改为接收 domain。
- `getDefaultDomain()` 定义保留在 `DomainRegistry.js`,但加注释「仅供测试与 domain 层内部使用,core 不得调用」。
- 可加 lint 规则 / source-scan 测试,禁止 `src/agent`、`src/runtime` 等目录引用 `getDefaultDomain`。

**代价**:比方案 A 小(不动 ctor、不动 index.js)。测试零改动。
**收益**:core 调用面干净,但 `DomainRegistry` ctor 仍隐式 require campus(方案 B 不动 ctor)。
**残留星号**:ctor 仍耦合,但 core 调用面无耦合。

### 方案 C:不改(维持现状)

接受 core 经 `getDefaultDomain()` 间接耦合 campus,作为「core 纯度声明的已知例外」记录在案。
零代价,零风险,但 A 级「core domain-agnostic」声明保留星号。

---

## 5. 推荐与决策建议

**推荐方案 B**(分阶段):
1. **先做方案 B**:移除 core 3 文件 8 调用点的 `getDefaultDomain()` 依赖(改必传 domain),`getDefaultDomain()` 降级为测试便利函数 + source-scan 守护。中等 blast radius,core 调用面立即纯净。
2. **方案 A 的 ctor 改动作为后续小波次**:把 ctor 隐式 require 上移到 index.js,需配合 26 测试文件改动,单独排期。

理由:方案 A 一次性改动 3 core + index.js + 26 测试,blast radius 集中且测试改动量大,风险与收益不匹配。方案 B 先拿掉 core 调用面耦合(最有价值的那部分),ctor 耦合作为低优先残留。

**最终决策权在用户。** 本 RFC 不预设排期。

---

## 6. Blast Radius

### 6.1 代码改动(方案 A 全量)

| 范围 | 文件数 | 说明 |
|---|---|---|
| core 调用点 | 3 | BehaviorLabeler.js, NeedsSystem.native.js, StateMachine.js |
| 入口层 | 1 | index.js(ctor 隐式 require 上移) |
| DomainRegistry | 1 | ctor 改 throw + getDefaultDomain 定位 |
| 测试 | ~26 | getDefaultDomain() → 显式 campus 注入 |

### 6.2 测试依赖(26 文件,方案 A 需改)

`tests/affect-frame-seam.test.js`、`tests/agent-runtime-containment.test.js`、`tests/behavior-field.test.js`、`tests/integration/agent.test.js`、`tests/runtime/runtime.test.js`、`tests/sdk-smoke.test.js`、`tests/sdk.test.js`、`tests/unit/event-lifecycle-dedup.test.js`、`tests/unit/handlers/action-selection-handler.test.js`、`tests/unit/handlers/agent-runtime.test.js`、`tests/unit/handlers/health-handler.test.js`、`tests/unit/handlers/mind-wander-handler.test.js`、`tests/unit/handlers/needs-emotion-coupler.test.js`、`tests/unit/handlers/perception-handler.test.js`、`tests/unit/handlers/reflection-handler.test.js`、`tests/unit/handlers/schedule-handler.test.js`、`tests/unit/handlers/social-handler.test.js`、`tests/unit/location-meaning-influence.test.js`、`tests/unit/memory-candidate-provider.test.js`、`tests/unit/memory.test.js`、`tests/unit/narrativeBuilder-affectFrame.test.js`、`tests/unit/narrativeBuilder-structuredContext.test.js`、`tests/unit/serialization-roundtrip.test.js`、`tests/unit/statemachine.test.js`、`tests/domain-contract.test.js`。

### 6.3 契约影响

- `tests/domain-contract.test.js:271` 断言 `mod.getDefaultDomain` 存在。方案 A 若移除导出,需更新契约测试与 `docs/PUBLIC_API_CONTRACT.md`。方案 B 保留导出,无契约影响。

---

## 7. 回滚

- 方案 A/B 改动均集中在 git diff,`git checkout -- <file>` 可逐文件回滚。
- 回滚后恢复 Wave 3b-2 现状(core 间接耦合),测试基线不变。

---

## 8. 验收标准(未来执行时)

- [ ] `grep -rn 'getDefaultDomain' src/agent src/runtime src/action src/canon src/knowledge src/effects src/pressure src/spatial src/social` → 0 matches(core 调用面零耦合)。
- [ ] `npm test` 全绿(2056+ passed,排除 native-loader EPERM)。
- [ ] `npm run test:domain` 81 passed。
- [ ] `npm run check:boundaries` All passed。
- [ ] 若方案 A:`tests/domain-contract.test.js` 与 `PUBLIC_API_CONTRACT.md` 已同步。

---

## 9. 不做的事

- 不在本 RFC 中改 campus preset 内容。
- 不改 Stable World Envelope 结构。
- 不引入新的 domain registry 抽象(如 plugin registry)——超出当前硬化范围。
- 不为解耦而解耦:若用户判定 core 间接耦合可接受(运行时不触发),方案 C(不改)是合法选项。
