# Post-v2.0.1 Reliability Optimization RFC

> 状态：Draft  
> 日期：2026-08-12  
> 目标阶段：Foundation Alpha → evidence-backed Integration Beta  
> 输入：[`../quality/DEEP_AUDIT_2026-08-12.md`](../quality/DEEP_AUDIT_2026-08-12.md)  
> 兼容原则：默认保持 `2.0.x` 公共导出和稳定 envelope 不变

## 1. 摘要

Andy Engine 当前无需重写。优化工作的核心是把已经较强的架构和测试基础，转换成可复现、
可追溯、跨 backend 一致的 Integration Beta 证据。

本 RFC 将工作拆成 8 个 workstream、6 个小批次。优先顺序为：

1. 先证明测试对象就是当前 HEAD。
2. 再修复状态隔离、原子性、时间与恢复语义。
3. 然后收紧 LLM 生命周期和 effect/tick 可观测性。
4. 最后处理长周期历史、文档治理与真实模型评测。

任何批次都必须有独立回归测试、明确完成条件和回滚边界。不得把扩展功能混入可靠性修复。

## 2. 目标

### 2.1 必须实现

- Reference Host 在干净环境中只消费当前提交生成的 npm artifact。
- MemoryStore 与 SQLiteStore 对公开方法具备相同的隔离、事务、保留和错误语义。
- Canon/Knowledge 的所有 evidence 使用确定、可追溯的模拟时间和 eventId。
- LLM 非流式正文与流式 token 均有有界超时和资源清理。
- 每个 effect skip 有内部稳定原因；每个 tick 的 effect summary 只属于该 tick。
- 质量报告不能在缺失、跳过或未解析到必需证据时给出 Pass。
- 文档链接、契约描述和 RFC 索引可由 CI 自动校验。
- 长周期 Canon 的热数据淘汰可观测，并与耐久历史契约分开。

### 2.2 成功结果

完成后，维护者能够回答并自动验证以下问题：

- 这次 Reference Host 到底测了哪个 commit 和哪个包？
- 同一操作在 Memory 与 SQLite 上是否完全同义？
- 角色何时、通过哪次事件知道了某个事实？
- LLM 卡在 body 或 token 中途时，多久会退出、是否释放资源？
- 一个 delta 为什么没写入？统计是否属于正确的 tick？
- 一个质量维度的 Pass 由哪些测试 ID 和命令产生？
- 旧 Canon 事实去了哪里，能否恢复或至少知道丢失边界？

## 3. 非目标

本轮明确不做：

- 不引入 StoryArc、WorldObject、场景编排或新的世界产品能力。
- 不稳定化 `TickResult`、`WorldState`、`Story`、`NarrativeRequest` 公共 envelope。
- 不扩大根导出面，不新增 ESM，不发布 npm，不做 3.0 破坏性清理。
- 不把 native Rust 路径提升为默认或正式支持。
- 不用 synthetic checker 代替 real-LLM held-out evaluation。
- 不以提高全局覆盖率百分比为目标；只增加风险驱动的行为证据。

## 4. 设计原则

1. **证据先于声明**：没有绑定 commit/artifact/test ID 的绿色结果，不作为 Beta 证据。
2. **同契约同语义**：可选 backend 不得改变调用方可观察行为。
3. **单一归一化点**：时间、容量限制、binary copy 和 status 判定只实现一次。
4. **失败关闭**：证据缺失、超时、未知 skip、无效 Date 应显式失败或降级，不能静默 Pass。
5. **保持公开面稳定**：先在内部补 receipt/reason/manifest，再评估是否需要公开扩展。
6. **小批次可回滚**：每个 PR 只解决一类可验证风险，避免审计修复演变为功能重写。
7. **删除即证明**：旧测试、旧文档或旧脚本只有在替代证据存在后才删除。

## 5. Workstream 设计

### W0 当前 artifact 的可复现宿主证据

#### 问题

Reference Host 的 package/lock 指向本地且被忽略的旧 tarball。当前测试不能证明当前 HEAD 可被
外部宿主消费。

> 复核订正：`reference-host/package.json:7` 的 `install:engine` 包装脚本其实**已**从 HEAD
> pack（`npm pack --pack-destination . ..`）；真问题是 `dependencies` 里 `file:andy-engine-2.0.1.tgz`
> 这个 pin 让裸 `npm install` 在干净 clone 因 tgz 被 `.gitignore` 而失败。另：CI 完全无
> reference-host job（`.github/workflows/ci.yml`）；`no-internal-access.js` 守卫只扫
> `reference-host/src/` 与 `scenarios/`，`test/` 不扫（`evaluation-bundle.test.js:18` 的
> `require('../src/evaluation-bundle')` 是 host 自有源码 `reference-host/src/evaluation-bundle.js`，
> 该文件注释明确「NEVER imports from src/ paths」，**非**引擎内部违规，无需修）。

#### 设计

新增根级 `reference-host:verify` 流程：

1. 创建受控临时目录。
2. 对当前工作树执行 `npm pack --json`。
3. 读取 pack 输出的 filename、integrity、shasum 和文件清单。
4. 将 `reference-host/` 的源码复制到临时目录，但不复制 node_modules、artifact 和 lock 中的旧
   file dependency 状态。
5. 在临时 host 中安装刚生成的绝对 tarball 路径。
6. 运行 no-internal-access、evaluation bundle 和 host diagnostics。
7. 输出 machine-readable manifest：

```json
{
  "schemaVersion": "1.0.0",
  "engineCommit": "<git sha>",
  "engineVersion": "2.0.1",
  "artifactIntegrity": "sha512-...",
  "nodeVersion": "v20.x",
  "hostSuite": { "passed": 13, "failed": 0, "skipped": 0 }
}
```

manifest 可作为 CI artifact，但不把每次运行输出提交到 Git。仓库只保留 schema 和稳定 fixture。

#### 文件范围

- `reference-host/package.json`
- `reference-host/package-lock.json`
- `scripts/reference-host-verify.js` 或等价小脚本
- `.github/workflows/ci.yml`
- `docs/rfc/IB_RUN_MANIFEST_SCHEMA.md`

#### 测试

- 干净 Git archive 无预置 tgz 时通过。
- 故意把 manifest commit 改成旧值时失败。
- 故意从 host 引入 `../src` 或 `andy-engine/src/*` 时 guard 失败。
- Node 20/22 均执行；可选 SQLite 路径单独执行。

#### 完成条件

- CI 中任何被测包都能反查当前 commit。
- `reference-host/npm test` 不再依赖机器上遗留 tarball。
- API gap ledger 的每条状态含 `verifiedAt` 和 `engineCommit`。

### W1 Store 隔离与 backend parity

#### 问题

MemoryStore 的 binary/story 引用可泄漏，事务无回滚；SQLite 的 `prune(0)` 与 Memory/注释不一致。

#### 设计

新增内部共享帮助函数：

```js
function copyBinary(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  throw new TypeError('snapshot data must be binary');
}
```

具体要求：

- save/load/loadAt/loadRecent/checkpoint 全部走 `copyBinary`。
- story save 与 query 边界复制外部可变对象；meta 保持 JSON-compatible 复制语义。
- MemoryStore 事务在入口快照内部 collections/counters；成功提交，异常完整恢复后重抛。
- `prune(keepCount <= 0)` 两个 backend 都删除全部快照；负数是否允许由契约测试固定。
  > 复核订正：**现状是分裂的**——`MemoryStore.prune(0)` 删全部（`MemoryStore.js:278-289`），
  > `SQLiteStore.prune(0)` 却 `return 0` 保留全部且注释自相矛盾（`SQLiteStore.js:380-382`）。
  > 上面描述的是目标终态，不是现状。契约测试须先钉死当前分裂行为，再统一。
- 用 `createStoreContractSuite(name, factory)` 参数化同一组测试，不维护两份期望。

#### 兼容性

这些变化收紧隔离和原子性，不修改方法签名。依赖“修改 query 返回值来修改 store”的代码本身违反
存储抽象，不作为兼容行为保留。

#### 测试矩阵

| 行为 | Memory | SQLite |
| --- | --- | --- |
| Buffer copy-in/copy-out | 必测 | 必测 |
| Uint8Array copy-in/copy-out | 必测 | 必测 |
| Story query isolation | 必测 | 必测 |
| Meta round-trip | 必测 | 必测 |
| Transaction commit | 必测 | 必测 |
| Transaction rollback | 必测 | 必测 |
| Nested transaction policy | 明确 | 明确 |
| prune 0/1/N | 必测 | 必测 |
| Same-tick checkpoint conflict | 必测 | 必测 |
| Close/error behavior | 必测 | 必测 |

#### 完成条件

- 参数化 contract suite 在两个 backend 全绿。
- 外部引用变更不能影响内部快照或 story。
- 任意 transaction throw 后 state hash 与入口相同。

### W2 Canon、Knowledge 与模拟时间完整性

#### 问题

EventFact 时间能正确归一化，但 Knowledge evidence 的 `learnedAt/eventId` 在 direct、observed、
overheard 路径中丢失，told 对 ISO string 使用错误 fallback。

#### 设计

在 canon/shared 层提供唯一归一化函数：

```js
function normalizeEventTimeMs(value, fallbackMs) {
  if (value instanceof Date) value = value.getTime();
  else if (typeof value === 'string') value = Date.parse(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallbackMs;
}
```

Pipeline 在处理事件入口只归一化一次，后续使用同一个 `eventTimeMs`：

- EventFact `timestamp = new Date(eventTimeMs)`。
- direct/observed/overheard evidence 使用 `learnedAt = eventTimeMs`。
  > 复核订正：这三条路径当前只传字符串 source（`CanonEventPipeline.js:137/146/157`），
  > `KnowledgeStore` 归一化为 `learnedAt: 0, eventId: null`。**仅加 `normalizeEventTimeMs()`
  > 修不好它们**——必须改为构造完整 Evidence 对象（`source + learnedAt + eventId`），
  > 与 told（`:244`）/inferred（`:291`）现有写法对齐。这是 W2 的真正主攻点。
- evidence `eventId` 使用原事件 id；若引擎生成 id，也必须回写/传递同一值。
- told 额外设置 `propagatedFrom`。
- inferred 已由 `fact.timestamp.getTime()` 构造（`:290`），现状不丢时间，无需修复；
  原「不得默认 0」描述的是已修状态，不再列为待修项。

同时修复 WorldFactStore：

- `setSimTime()` 验证后保存 `new Date(ms)`。
- `getSimTime()` 返回新 Date。
- type capacity 用一张常量 map 驱动 `addFact()` 和 `fromJSON()`，补 Intention。

#### 测试

- Date、ISO、epoch number、无时间和 invalid Date 的表驱动测试。
- direct/observed/overheard/told/inferred evidence 完整矩阵。
- serialization round-trip 后 evidence 时间不变。
- 1000 Intention 恢复后遵守容量；写入和恢复的 retained set 相同。
- set/get Date mutation isolation。

#### 完成条件

- 合法事件不产生 `learnedAt: 0`。
- 同一传播链的 eventId 可从 Knowledge 追溯到 Fact。
- 所有类型在实时写入和恢复时执行同一容量策略。

### W3 LLM 请求生命周期

#### 问题

当前 30 秒只约束 fetch 到响应头的阶段。body JSON 和 stream reader 可无限等待，生成器退出时没有
统一资源释放。

#### 设计

内部请求上下文包含：

- `headersTimeoutMs`：连接到响应头。
- `overallTimeoutMs`：完整请求上限，包括 body。
- `streamIdleTimeoutMs`：相邻 token/chunk 最大空闲时间。
- 单一 `AbortController` 和 idempotent cleanup。

非流式路径在 `response.json()` 完成后才清 overall timer。流式路径将 response 与 controller
上下文一起交给 generator，且每个 `reader.read()` 重置 idle timer。生成器使用 `try/finally`：

```js
try {
  // read and yield
} finally {
  controller.abort();
  await reader.cancel().catch(() => {});
  reader.releaseLock();
}
```

错误分类稳定为内部 reason：`headers_timeout`、`body_timeout`、`stream_idle_timeout`、
`consumer_cancelled`、`provider_http_error`、`parse_error`。公共错误文本可保持兼容。

重试规则：

- 首 token 前可按现有 maxRetries 重试。
- 首 token 后绝不自动重试，避免重复内容。
- provider 4xx 默认不重试；429/5xx 是否重试保持现有策略或单独 RFC，不在本批扩大。

#### 测试

使用本地可控 HTTP server，不依赖真实 provider：

- 不返回 headers。
- headers 后不返回 body。
- 正常 JSON、损坏 JSON。
- SSE 发一个 token 后停住。
- 正常 `[DONE]`。
- 调用方读取一个 token 后 break。
- abort 时 reader/server 连接均关闭。
- OpenAI、Anthropic 两条路径共享相同生命周期断言。

#### 完成条件

- 所有请求在配置上限内完成或失败。
- 测试无 open handle。
- 首 token 后失败不产生第二次 provider 调用。

### W4 Effect receipt 与 tick 重入边界

#### 问题

Effect skip 只有粗粒度计数，没有原因；Diagnostics 丢弃 metadata。`onTick` 回调执行时 committer
仍处于外层统计包装中，回调重入会污染 summary。

#### 设计

内部 `_applyDelta()` 返回：

```js
{
  status: 'applied' | 'skipped',
  reasonCode: null | 'agent_missing' | 'guard_rejected' | 'invalid_target' | 'out_of_bounds'
}
```

`commit()` 返回值可以在不破坏既有字段的前提下，为内部/实验字段增加 receipt；稳定公开
`effectSummary.counts/byType` 暂不改变。Diagnostics 使用 `collect({ type, reasonCode, ... })`，不再
把 metadata 传给只接受 message 的 `warn()`。

tick 阶段顺序改为：

1. 完成所有 simulation writes。
2. 恢复原 committer。
3. 固化 `effectSummary`、status、committedAt 和 duration。
4. 设置 tick 不再 in-progress。
5. 最后调用 callbacks。

同时明确重入策略。推荐在 Engine/AndyWorld 层使用 `_tickInProgress` 拒绝同步重入并返回稳定错误，
因为嵌套 tick 会破坏阶段不变量。若未来需要 callback 驱动下一 tick，应通过 queue/microtask 由宿主
显式调度。

#### 测试

- 每个 delta type 的 apply/guard/invalid target reason。
- 多 delta 写入异常仍完整回滚，receipt 不把 rolled-back 计为 applied。
- callback 抛错不改变 committed tick。
- callback 同步调用 tick 被稳定拒绝，下一次正常 tick 仍可运行。
- 两个连续 tick 的 effect counts 不串扰。

#### 完成条件

- happy-path fixture 的 unknown skip 为 0。
- 任何 skip 可由 reasonCode 聚合定位。
- per-tick summary 在回调、异常和连续 tick 下保持隔离。

### W5 质量证据、测试债务与文档门禁

#### 问题

Aliveness 生成器存在硬编码 Pass 和不完整入口判断；28 个 skipped tests 混合了环境条件、旧架构与
未完成测试；文档有断链和过时契约。

> 复核订正（28 已核实）：vitest JSON 报 4002 total − 3974 passed = 28 skipped（非 grep 标记
> 行数 20；`describe.skip` 一行跳过多 test）。分布：phase-26 rng/shadow(10)、phase-32
> pipeline/active(6)、deep-audit-v5 P2 todo(6)、phase-29 goalsystem(2)、SQLite-optional
> 条件块（本机可用时不计）。
> 另：D2 与 D1 同类可绕过——`judgeDimension` 通用路径 `aliveness-report.js:203-207` 只取 entry
> 列表**第一个**文件，D2 entry 含两文件只查其一，须一并修。D4 实为 `:176` `.every()` 全绿即过
> （audit「任一绿即过」不准），但 golden replay 确未强制，entry 装饰性。

#### 设计：Quality manifest

每个维度维护声明式 requirement：

```js
{
  id: 'D3',
  requiredTests: [
    'tests/e2e/alice-bob-epistemic-boundary.test.js',
    'tests/e2e/epistemic-evidence-matrix.test.js'
  ],
  allowSkipped: false,
  evidenceKind: 'synthetic'
}
```

生成器从 Vitest JSON reporter 或 JUnit 读取精确 file/test ID，不解析人类可读终端文本。状态规则：

- 任一 required test failed → Gap。
- 任一 required test missing/not-found/skipped → Warning 或 Gap，绝不 Pass。
- 全部 required test executed and passed → Pass。
- D5 synthetic 全绿也只能输出 `synthetic: Pass, realLLM: Not Evaluated`。
- 手工 override 必须有独立签名/owner/expiry，不能直接写 `special: Pass`。

#### 设计：Skipped-test ledger

把 skip 分成三类：

1. 环境条件，例如 SQLite optional：保留，但必须在对应 CI job 实际运行。
2. 已被新架构取代：确认替代测试后删除或迁入 archive，不继续计入活动套件。
3. 仍代表承诺但未完成：改为 `test.todo` 并进入 gap ledger，不能算通过证据。

占位断言必须替换为状态前后、receipt、trace 或 hash 的可观察断言。

#### 设计：Docs gate

新增 `docs:check`：

- 校验 Markdown 相对链接和锚点。
- 忽略代码块中的示例路径，但扫描真实链接。
- 检查 RFC index 与目录一致，允许显式 `unindexed` allowlist。
- 检查源码注释中的 `docs/...` 引用存在。
- 对契约文档中的关键数字/默认值使用 source-backed tests，避免 EventDispatcher “100 vs maxSize”漂移。

#### CI 优化

推荐 DAG：

- `fast-contract`（Node 20/22）：typecheck、boundary、domain、unit/e2e、replay。
- `package-consumer`：pack smoke、fresh consumer、Reference Host current artifact。
- `optional-backends`：SQLite contract/smoke。
- `quality-docs`：quality manifest、docs check、secret scan。
- `perf`：主分支或 release 运行三轮，普通 PR 可单轮 smoke。
- `release-gate`：只聚合上述 job 结果，不在内部再次重跑所有命令。

#### 完成条件

- 删除 D1 硬编码 Pass。
- 任何 required evidence 缺失都会使报告非 Pass。
- 活动 skipped tests 都有 owner、原因、到期条件。
- 文档无真实断链，RFC index 与契约说明一致。
- CI 不再嵌套执行 `release:check` 导致同套测试重复。

### W6 Canon 热保留与耐久历史

#### 问题

WorldFactStore 的 ring-style eviction 保证内存有界，但会永久删除 Canon 历史和相关 knowledge，
且调用方看不到水位。

#### 分阶段设计

Phase A（Beta 最低要求）：

- 保留现有内存上限，避免性能回退。
- 每次 eviction 产生内部 receipt：type、count、oldest/newest timestamp、reason。
- `getStats()` 增加 internal/experimental retention stats，不立即扩大稳定公共 envelope。
- 文档明确热历史容量和“未配置 archive 时不可承诺无限历史”。

Phase B（耐久历史）：

- 定义 `FactArchiveSink.append(facts, receipt)`，由 SQLite/宿主实现。
- eviction 前批量 append，成功后再从 hot store 移除。
- checkpoint 保存 archive watermark；恢复时校验 watermark 单调。
- 查询 API 明确 hot-only 与 archive-backed，不让性能敏感路径意外扫全量历史。

#### 关键决策

- WorldFactStore 是 canonical hot view 还是完整 canonical log？推荐前者。
- archive failure 是阻断 tick、降级还是保留热事实？推荐默认保留并使 tick degraded，不能静默删。
- Knowledge 是否只保留 hot fact ID？推荐 evidence 可持久化，但查询旧事实时通过 archive resolver。

#### 测试

- 超过 2000 EventFacts 时 eviction receipt 准确。
- archive append 失败不丢事实。
- snapshot/resume 后 watermark 不倒退。
- 热查询性能不因 archive 数量线性退化。

#### 完成条件

Beta 至少完成 Phase A；任何长周期历史声明必须等待 Phase B 和 host 恢复测试完成。

### W7 独立 real-LLM D5 评测

#### 前置条件

W0、W2、W3、W5 完成后再做。否则被测包、grounding evidence、请求生命周期和报告判定都不够
可信。

#### 设计

- 私有 held-out corpus 保持在公开仓库外。
- 至少两个 provider/model 组合，固定参数、prompt version、artifact commit 和 evaluator version。
- 报告同时给样本数、拒答/超时率、grounding violation 分类、置信区间和失败样例摘要。
- 公共仓库只提交脱敏 schema、评测方法和 aggregate result，不提交私有语料或原始模型输出。
- synthetic 与 real-LLM 继续分栏，任一方不能覆盖另一方状态。
  > 复核订正：D5 分栏**已实现**——`aliveness-report.js:150-155` D5 恒返回 `Warning`，
  > `:268-269` 分两行渲染 synthetic / real-LLM。synthetic Pass 不会升级 real-LLM 状态。
  > 本项降为「保持现状 + 加回归测试防回归」，非待修风险。

#### 完成条件

Integration Beta 是否需要 real-LLM Pass 由产品门槛单独决定；在完成前状态固定为 Not Evaluated，
不能因 smoke 通过自动升级。

## 6. 实施批次

### Patch A：先修证据对象（最高优先级）

范围：W0 Reference Host current artifact + manifest。  
预计风险：低，主要是构建/CI。  
退出条件：干净 clone 的宿主测试绑定当前 HEAD。

### Patch B：Store contract parity

范围：W1 binary/story isolation、Memory transaction、SQLite prune、参数化测试。  
预计风险：中，触及持久化公开类但不改签名。  
退出条件：Memory/SQLite 同一 contract suite 全绿，现有 replay/consumer 不回退。

### Patch C：时间与事实边界

范围：W2 evidence、Date copy、fromJSON capacity。  
预计风险：中，序列化/确定性必须重点复核。  
退出条件：100-seed replay、golden、serialization、epistemic matrix 全绿；新增 ISO/Date 测试通过。

### Patch D：LLM 与 effect 生命周期

范围：W3 + W4；如 diff 过大应拆成 D1 LLM、D2 effect/reentrancy 两个 PR。  
预计风险：中高，涉及异步控制与 tick 顺序。  
退出条件：假 server 测试无 open handles；atomic tick/effect rollback/reentrancy 全绿。

### Patch E：质量与文档治理

范围：W5 quality manifest、skip ledger、docs gate、CI 去重。  
预计风险：低到中，可能暴露现有状态而使 CI 首次非绿；不得通过降低标准解决。  
退出条件：报告 fail-closed，真实断链为 0，CI DAG 无嵌套重复。

### Patch F：长周期与独立能力证据

范围：W6 Phase A，随后按产品选择 Phase B；最后 W7 D5。  
预计风险：Phase A 低，Phase B 高。  
退出条件：retention 可观察；有 archive 时故障不静默丢数据；D5 独立报告不混淆 synthetic。

## 7. 排期建议

这里用“工程波次”而非日历承诺，避免在未知人力下制造虚假精度：

| 波次 | 内容 | 依赖 | 可并行项 |
| --- | --- | --- | --- |
| 0 | Patch A | 无 | quality manifest schema 设计 |
| 1 | Patch B | A | docs 断链清理 |
| 2 | Patch C | B contract helpers 可复用 | skip ledger 分类 |
| 3 | Patch D1 LLM、D2 effect | C 提供可靠 evidence | 两个 PR 可并行但分别合并 |
| 4 | Patch E | A-D 的新 test IDs 稳定 | CI DAG 与 docs gate 可并行 |
| 5 | Patch F | A-E | retention Phase A 与私有评测准备可并行 |

推荐每个 patch 控制在一个审阅者能一次理解的范围内。若某一 patch 同时改公共类型、序列化和运行时，
应继续拆分。

## 8. 验证矩阵

每个 runtime patch 至少运行：

```text
npm test
npm run typecheck
npm run test:domain
npm run replay:diff
npm run check:boundaries
npm run smoke:pack
npm run fresh:consumer
npm run sqlite:smoke
```

发布候选再运行：

```text
npm run test:coverage
npm run perf:check -- --runs=3
npm run release:clean
npm run release:gate
npm run reference-host:verify
npm run docs:check
```

> 复核订正：上述命令多数**已存在**于根 `package.json`：`test:coverage`、`perf:check`、
> `release:clean`、`release:gate`、`replay:diff`、`smoke:pack`、`fresh:consumer`、
> `sqlite:smoke` 均已就绪。本 RFC 真正新增的只有 `reference-host:verify`（W0）与
> `docs:check`（W5）。`typecheck` 同为既有。

新增风险门槛：

- Store contract suite：Memory/SQLite 0 差异。
- LLM lifecycle：0 open handle，所有 timeout 用 fake timer/本地 server 有界验证。
- Canon evidence：合法 event 的 `learnedAt: 0` 数为 0。
- Effect：known delta 的 unknown skip reason 数为 0。
- Quality manifest：required evidence missing/skipped 数为 0 才可 Pass。
- Docs：真实 broken link/reference 为 0。

## 9. 兼容与迁移策略

### 9.1 可以在 2.0.x 内完成

- 防御性复制、回滚修复、`prune(0)` 对齐。
- evidence 时间修复和 eventId 补齐。
- LLM 超时/清理、tick 重入保护。
- 内部 reason/receipt、质量 manifest、CI 和文档修复。

这些属于 bug fix 或证据修复，不需要扩大稳定 API。

### 9.2 需要明确版本策略

- 若公开暴露新的 retention stats、archive query 或 error class，应先以 experimental/internal 形式验证。
- 如果决定 Memory transaction 不提供原子性而修改类型承诺，属于破坏性变化，不应在 2.0.x 做。
- archive sink 成为公开 extension point 前，需要独立 RFC 和消费者类型测试。

### 9.3 数据迁移

当前 envelope 不需要升版。若未来 checkpoint 增加 archive watermark：

- 旧快照无 watermark 时按 `null/unknown` 读取。
- 新 reader 必须兼容旧 snapshot。
- 旧 reader 是否忽略新增 metadata 需由 round-trip contract 验证。

## 10. 回滚策略

- Patch A/E 仅构建与文档：可独立回滚，不影响 runtime。
- Patch B/C 每个语义修复单独提交；若 replay fixture 合理变化，先解释状态语义再显式 regen，
  不可直接覆盖 golden 掩盖差异。
- Patch D 的 timeout 和重入保护必须有 feature-local commit；出现 provider 兼容问题时可回滚配置默认，
  但不能恢复无限等待。
- Patch F Phase B 在 durable append 充分验证前保持 opt-in；archive failure 默认不得删除 hot facts。

## 11. 风险与缓解

| 风险 | 可能后果 | 缓解 |
| --- | --- | --- |
| 修 Store 复制增加成本 | 大快照性能下降 | 只在公开/持久化边界复制；加入 snapshot microbenchmark |
| 事务回滚深复制成本高 | Memory backend 慢 | 先按事务入口复制；后续可用 journal，但不提前复杂化 |
| evidence 时间修复改变 golden | replay hash 变化 | 区分 bug-fix 预期变化与非预期状态漂移，审阅后再 regen |
| LLM timeout 过短 | 慢 provider 误失败 | 内部可配置，默认保守；分别设置 overall/idle |
| 重入由允许变拒绝 | 少数宿主 callback 受影响 | 文档说明 callback 应调度下一 tick；提供稳定错误 |
| 回调可见 summary 契约变更 | 现状回调在 `finally` 冻结 summary 前执行，读到 `undefined`；挪到最后会让回调首次读到冻结后 summary，任何读 summary 的回调受影响 | Patch D2 须显式说明新契约，并在释放前填好 `effectSummary`；提供稳定错误码 |
| LLM Error 增设 `code`/reason | 消费者若依赖 `error.message` 文本分支会受影响 | 只增 `error.code` 不改 `message`；reasonCode 走内部字段，公共错误文本保持兼容 |
| fail-closed 报告导致 CI 变红 | 短期发布受阻 | 把真实 gap 入账，不用 override 伪绿 |
| archive 设计扩大范围 | 延误 Beta | Beta 先做可观测 Phase A，Phase B 单独门控 |

## 12. Definition of Done

只有同时满足以下条件，才建议把 Documents 版标记为 evidence-backed Integration Beta：

1. Reference Host manifest 指向当前 HEAD，干净环境可复现。
2. Memory/SQLite contract suite 无行为差异。
3. Canon/Knowledge 时间和来源证据无已知失真。
4. LLM body/stream 有界退出且资源释放。
5. Effect skip 可解释，tick 重入不污染状态或统计。
6. Aliveness 每个 Pass 都来自完整、未跳过的 required evidence。
7. 活动 skipped suite 已分类并处理；无占位通过断言。
8. 文档链接、契约数字和 RFC 索引通过自动门禁。
9. Canon retention 至少可观测；任何长周期能力声明符合实际 archive 能力。
10. 完整 release gate、100-seed replay、package consumers、SQLite、三轮性能均通过。
11. D5 继续明确显示 synthetic 与 real-LLM 的独立状态。
12. 没有新增公开导出、稳定 envelope 漂移或未记录的兼容性变化。

## 13. 第一轮执行清单

建议下一次实际修复从 Patch A 开始，按下面的最小范围交付：

- [x] 新增当前 HEAD pack-and-host verifier。 — `scripts/reference-host-verify.js` + `npm run reference-host:verify`
- [x] 修正 Reference Host 的本地 tarball 依赖方式。 — `reference-host/package.json` 从 `file:andy-engine-2.0.1.tgz` 改为 `file:../`
- [x] 输出含 commit/version/integrity 的 run manifest。 — schema 见 `docs/rfc/IB_ARTIFACT_VERIFICATION_MANIFEST.md`
- [x] CI Node 20/22 执行 host guard 与 evaluation bundle。 — `.github/workflows/ci.yml` 新增 `reference-host` job
- [x] 更新 API gap ledger 的已解决项与验证 commit。 — `reference-host/API_GAP_LEDGER.md` 新增 `Resolution` 结构化字段块
- [x] 加一个“旧 tarball/错误 commit 必须失败”的负向测试。 — `tests/reference-host-verify.test.js`
- [ ] 运行完整 package/release gate，确认不改变 runtime。

完成 Patch A 后再开始 Store parity。这样后续每一轮 runtime 修复都会被一个真正消费当前 artifact 的
外部宿主验证，避免继续积累“代码修了，但宿主仍测旧包”的证据债务。

## 14. 复核订正附录（2026-08-12）

> 本附录记录对 audit 与本 RFC 初稿的源码复核结论。复核方式：直接读 HEAD `bded50c` 源码，
> 不依赖中间结论。下列订正已就地标注在对应 workstream，此处汇总以便审阅。

### 已订正且保留在原 workstream 的条目

1. **W2 inferred（已修，非待修）**：`_propagateInferred`（`CanonEventPipeline.js:290`）已用
   `fact.timestamp.getTime()`，时间不丢。真正待修是 direct/observed/overheard 三条路径只传
   字符串，须改为构造完整 Evidence。`fromJSON` 漏 Intention（`WorldFactStore.js:560-571` 无
   INTENTION，`addFact():150-151` 有）**确为现存 bug**，audit P2-2 准确，保留在 Patch C。

2. **W1 prune(<=0) 现状分裂**：Memory 删全部 / SQLite 保留全部。RFC 原文把目标当现状，已标注。

3. **W4 重入症状**：经源码追踪，RFC/audit 的「外层累计内层 effects」**正确**——重入时内层
   `_originalCommit` 捕获的是外层 `_instrumentedCommit`，内层每次 commit 先穿外层再进内层累加器，
   导致外层双重计数。修复方向（5 阶段顺序 + `_tickInProgress` 拒绝同步重入）不变。

4. **§8 验证矩阵**：9 条命令中 7 条已存在，仅 `reference-host:verify`、`docs:check` 新增，已标注。

5. **§5.W5 跳过数 28**：vitest JSON 4002 total − 3974 passed = 28 skipped，audit 准确。
   D2 与 D1 同类可绕过（`judgeDimension:203-207` 只查第一个 entry 文件）已补入。

6. **§11 风险表**：补「回调可见 summary 契约变更」「LLM Error `code`/reason 兼容边界」两行。

7. **W7 D5 分栏**：已实现（`aliveness-report.js:150-155, 268-269`），降为「保持现状 + 回归测试」。

### 已撤销的错误订正（避免误导后续 patch）

- ~~fromJSON 已修 Intention~~：错。fromJSON 仍漏 Intention，保留在 Patch C。
- ~~重入是「黑洞/漏计」~~：错。是双重计数，RFC 原文正确，测试断言写「内外隔离 + 拒绝重入」。
- ~~跳过数是 20~~：错。20 是 grep 标记行数；vitest 跳过 test case 数为 28，audit 正确。
- ~~`evaluation-bundle.test.js:18` 的 `../src` 是引擎内部违规~~：错。该路径解析到
  `reference-host/src/evaluation-bundle.js`（host 自有源码），非引擎内部，无需修。

### 复核方法学注记

子 agent 在三类任务上不可信，须自己读源码：(a) 跨行数据流追踪（闭包捕获）；(b) 行号邻近易误读
（把 LOCATION_MEANING 读成 INTENTION）；(c) 统计口径（grep 标记 vs vitest 跳过数）。
