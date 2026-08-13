# Andy Engine Documents 版深度审核

> 审核日期：2026-08-12  
> 审核对象：`/Users/huangweijie/Documents/andy-engine`  
> Git 基线：`bded50c`，分支 `codex/consolidate-desktop-repo`  
> 包版本：`andy-engine@2.0.1`  
> 审核性质：源代码、测试、发布、文档、安全与 Integration Beta 证据复核

## 1. 结论先行

Documents 版是当前应继续维护的主版本。它的 Git 工作区干净，HEAD 与远端对应分支及
`origin/main` 一致；完整 `release:gate`、类型检查、领域边界、100-seed replay、打包消费、
SQLite smoke 和性能门禁均通过。

项目已经具备可靠的 **Foundation Alpha / 技术评估包** 基础，但还不适合把
“Integration Beta 已被真实宿主验证”“长周期世界历史可靠保存”“所有质量维度均有可信证据”
作为发布结论。当前主要风险不是架构失控，而是少数关键边界的语义不一致，以及部分绿色证据
并没有测试到当前源码或完整验收条件。

本轮审核结论：

- P0 / Critical：0 项。
- P1 / 进入 Integration Beta 前必须修复：7 组。
- P2 / 应在 Beta 前收敛：6 组。
- 安全扫描未发现已提交凭据、私钥模式或生产依赖漏洞。
- 不建议重写引擎；应采用小批次、可验证、保持公开契约稳定的修复路线。

**审核判定：Foundation Alpha 可继续发布技术评估版本；Integration Beta 暂为
Request Changes。**

## 2. 审核范围与方法

本轮不是只看测试是否变绿，而是交叉检查以下证据：

1. Git 基线、跟踪文件、忽略规则和发布清洁度。
2. npm 包导出面、TypeScript 消费者、无 SQLite 消费者和新鲜安装。
3. 完整单元/E2E/领域/兼容性测试与确定性 replay。
4. 状态写回、事实、知识传播、持久化、恢复和 LLM 生命周期。
5. Reference Host 是否真正消费当前 HEAD 的打包产物。
6. 质量报告生成器是否能从实际测试证据推导结论。
7. 性能、覆盖率、安全卫生和文档链接。

除运行仓库现有门禁外，还对高风险边界编写了临时最小复现：`Uint8Array` 隔离、
Memory/SQLite 事务与 `prune(0)` 对齐、ISO 时间传播、事实容量恢复、Date 防御性复制、
Reference Host 安装包校验以及 tick 回调重入。

## 3. 已验证的健康基线

| 范围 | 结果 | 证据摘要 |
| --- | --- | --- |
| Git | Pass | 工作区干净；HEAD `bded50c` 与远端一致；559 个跟踪文件 |
| 完整测试 | Pass | 228 个文件通过、1 个文件跳过；3974 个测试通过、28 个跳过 |
| TypeScript | Pass | 仓库类型检查与已发布消费者类型检查通过 |
| 领域边界 | Pass | 5 个文件、82 个测试通过；源码词汇/导入边界通过 |
| 确定性 | Pass | replay diff 100/100 seeds 通过 |
| 打包消费 | Pass | 19/19 pack smoke；CJS、无 SQLite、TypeScript 新鲜消费者通过 |
| SQLite | Pass | 本地 `better-sqlite3` smoke 通过 |
| 性能 | Pass | 三轮性能门禁全部低于退化阈值；100/300 agent 基线正常 |
| 覆盖率 | Warning | Statements 78.39%，Branches 69.93%，Lines 80.24%；高风险模块仍偏低 |
| 生产依赖安全 | Pass | `npm audit --omit=dev` 为 0 vulnerabilities |
| 发布清洁度 | Pass | 私有评测路径、数据库、凭据模式、压缩包和机器文件均有忽略/清洁规则 |
| 完整发布门禁 | Pass | `npm run release:gate` 全部通过 |

值得保留的工程资产包括：单一 `src/` 真源、明确的 10 个公共导出面、原子 tick 恢复、
不可变公开读投影、统一 typed-delta 写回、结构化 effect count、领域去耦、打包后真实消费测试、
100-seed replay、性能校准，以及 synthetic narrative 与 real-LLM 结论不混用的公开说明。

## 4. P1：进入 Integration Beta 前必须修复

### P1-1 Reference Host 测到的是旧包，不是当前 HEAD

**证据**

- `reference-host/package.json:18` 固定依赖 `file:andy-engine-2.0.1.tgz`。
- 根 `.gitignore:43` 忽略所有 `*.tgz`，因此干净 clone 中不存在该依赖文件。
- 对干净 Git archive 执行 Reference Host 安装会因缺少 tarball 报 `ENOENT`。
- 本机 tarball 的时间早于当前 HEAD；已安装引擎与当前打包文件比较时，183 个文件中有
  40 个内容不同，包括 `index.js`、`AndyWorld.js`、`EffectCommitter.js` 和事实/叙事模块。
- 根 CI 没有 Reference Host job；本地 `reference-host/npm test` 的绿色结果只能证明旧包配合宿主
  测试通过。

**影响**

Integration Beta 最关键的“外部宿主通过公开 API 消费当前引擎”证据不可复现，也不能约束
当前提交。

**修复要求**

每次测试先从当前 HEAD 生成 tarball，再在干净临时目录安装；manifest 记录 commit、包版本和
sha512；CI 增加 Reference Host job。不得让 lockfile 指向仓库中不存在且被忽略的永久文件。

**验收**

干净 clone、Node 20/22 均可用一个命令完成 pack → install → host test，且 manifest 的 commit
必须等于被测 HEAD。

### P1-2 MemoryStore 与 SQLiteStore 的公开语义不一致

**证据**

- `store/index.d.ts:7` 将二进制数据声明为 `Uint8Array`，但
  `src/store/MemoryStore.js:170-172`、`:208-210`、`:230`、`:245-246` 只复制 `Buffer`。
  普通 `Uint8Array` 在 save 后或 load 后被修改，会反向污染内部快照。
- `MemoryStore.getRecent()` 与 `getByEmotion()` 在 `:61-70`、`:85-93` 返回内部 story 对象，
  查询结果可修改 store。
- `MemoryStore.transaction()` 在 `:381-382` 直接执行回调；回调抛错后写入仍保留，而
  SQLite 事务会回滚。
- `SQLiteStore.prune(0)` 在 `src/store/SQLiteStore.js:380-382` 直接返回 0 并保留全部快照，
  与注释及 MemoryStore 的“保留 0 个”行为相反。

**影响**

同一公开 Store API 会因可选依赖是否安装而改变隔离性、原子性和保留行为；开发环境测试通过的
恢复逻辑，换到 SQLite 后可能表现不同，反之亦然。

**修复要求**

建立共享 binary-copy 工具；所有读写边界复制任意 `ArrayBufferView`；story 查询返回副本；
为 MemoryStore 实现真正回滚，或在下一个破坏性版本移除“事务”承诺；统一 `prune(0)`。

**验收**

用同一套 backend contract tests 参数化运行 Memory/SQLite，覆盖 binary、story、meta、
transaction、checkpoint conflict、prune 和异常恢复。

### P1-3 知识证据的模拟时间和事件来源会丢失

**证据**

- `src/canon/CanonEventPipeline.js:93-96` 已正确把 Date/字符串转换成 EventFact 时间。
- 但 `:137`、`:146`、`:157` 只给 KnowledgeStore 传来源字符串。
- `src/knowledge/KnowledgeStore.js:39-47` 会把字符串来源归一化为 `learnedAt: 0`、
  `eventId: null`。
- `_tryToldPropagation()` 在 `CanonEventPipeline.js:221-222` 对 ISO 字符串使用
  `Number.isFinite()`，会退回固定 epoch，而不是事件实际时间。

**影响**

事实本身时间正确，但“角色何时、因何事件得知事实”的证据变成未知或错误时间。它会污染回放、
时间窗口推理、知识可信度审计和叙事 grounding。

**修复要求**

只保留一个 `normalizeEventTimeMs()`；direct/observed/overheard/told/inferred 全部传完整 Evidence，
至少包含 `source`、`learnedAt`、`eventId`，told 还包含 `propagatedFrom`。

**验收**

Date、ISO string、number 和 invalid 四类输入都有测试；合法输入的 fact timestamp 与 evidence
`learnedAt` 必须一致，所有事件传播 evidence 均可追溯 eventId。

### P1-4 LLM 超时只覆盖响应头，不覆盖正文和流

**证据**

- OpenAI 路径在 `src/sdk/LLMAdapter.js:151-169` 获取到 response 后立即清除 30 秒定时器，
  之后 `response.json()`（`:181`）没有超时。
- 流式读取的 `reader.read()`（`:197`）无 idle/overall timeout，也没有在 `finally` 中
  cancel/release reader。
- Anthropic 路径在 `:235-273` 存在同样问题。
- 收到 `[DONE]` 或调用方提前停止消费时，生成器可直接返回而没有统一清理。

**影响**

上游在响应头后卡住、半关闭或停止发 token 时，单次 tick/叙事请求可能无限等待；重试策略无法
接管，资源也不能及时释放。

**修复要求**

区分 header timeout、overall timeout 与 stream idle timeout；非流式 body 也受 overall timeout
约束；生成器 `finally` 中 abort、cancel 并 release lock。保留“首 token 后不自动重试”的现有
防重复语义。

**验收**

使用可控假 server 覆盖：无响应头、header 后 body 卡死、token 中断、`[DONE]`、消费者 break、
abort 与首 token 后失败；全部在有界时间内释放。

### P1-5 Aliveness 报告可在证据不完整时给出 Pass

**证据**

- `scripts/aliveness-report.js:8` 声称状态不得手写，但 D1 在 `:30-32` 写入特殊 Pass，
  `judgeDimension()` 在 `:148` 直接返回，导致 `:163-170` 的真实测试判断不可达。
- D2 通用逻辑在 `:201-209` 只检查入口列表中的第一个测试文件。
- D4 在 `:173-179` 只要 effects 目录中被解析到的测试全绿即可，没有要求 golden replay
  等声明入口确实出现。
- D7 在 `:158-160` 只看 domain command，忽略标准中列出的 compatibility test。
- `tests/facts/minimal-active-writeback.test.js:83` 存在 `expect(true).toBe(true)`；同文件另有多处
  只验证“存在/不崩溃”，没有验证状态写回。
- 当前有 28 个 skipped tests，其中包含 RNG/action trace、active event、旧 EffectPipeline、
  GoalSystem 与 deep-audit-v5 待办组。

**影响**

测试总量很大，但质量维度的状态不一定由它声明的完整证据推导。发布者可能把“报告绿”误当成
“验收标准已被执行且通过”。

**修复要求**

质量报告改为 fail-closed manifest：每个维度列出必需 test ID、命令、结果、skip 数和证据版本；
缺失、not-found、skip 或解析失败不得为 Pass。删除、重写或明确归档旧 skipped suite 和占位断言。

**验收**

故意重命名、skip 或删除任一必需测试时报告必须降级；D5 始终把 synthetic 与 real-LLM 分开。

### P1-6 Effect skip 原因丢失，tick 回调重入会污染统计

**证据**

- `src/effects/EffectCommitter.js:73-81` 把所有 guard reject 压成字符串 `skipped`，再调用
  `diagnostics.warn('delta_skipped', metadata)`。
- `src/shared/Diagnostics.js:20-22` 的 `warn()` 只接收一个参数，metadata 和 reason 实际被丢弃。
- `src/runtime/AndyWorld.js:420-445` 通过临时替换 `effectCommitter.commit` 聚合本 tick 统计；
  callback 在 `:527-535` 执行，而 committer 到 `:537-549` 才恢复和结算。
- 最小复现中，`onTick` 回调再次调用 `tick()` 后，外层 `effectSummary` 会把内层 tick 的 effects
  也累计进去。

**影响**

公开 count 看似可观测，但无法回答“为什么跳过”；重入时 per-tick summary 不再属于单一 tick，
也会增加状态阶段嵌套风险。

**修复要求**

内部 `_applyDelta` 返回结构化 `{ status, reasonCode }`；Diagnostics 收集结构化条目；公开 envelope
暂不扩展也可以先保留内部原因。tick 在 callback 前完成 effect 结算与恢复，并增加明确重入保护。

**验收**

每个 guard 有稳定 reasonCode；正常 fixture 的 unknown skip 为 0；回调内重入要么被确定性拒绝，
要么内外统计严格隔离。

### P1-7 WorldCanon 的保留策略会静默永久丢历史

**证据**

- `src/canon/WorldFactStore.js:130-151` 对高频事实类型设置硬上限。
- `:181-208` 超限时一次删除到上限的 80%，同时清理 KnowledgeStore。
- 2001 个 EventFact 的最小复现最终只保留 1600 个；最早 401 个事件被删除。
- 快照只序列化当前内存中的事实，没有 durable archive、水位或 eviction receipt。

**影响**

限界内存本身是合理设计，但当前把“热事实缓存”同时当作“世界发生过什么的 canonical history”。
长运行、离线回归和长时叙事会静默丢失旧事实与相关知识，无法审计丢失范围。

**修复要求**

在 Integration Beta 前明确 Canon 的保留契约：热缓存与耐久事件日志分层；至少暴露
evicted count、oldest retained timestamp 和 archive watermark。若暂不实现 archive，必须明确
Beta 容量边界并阻止超范围能力声明。

**验收**

超过热上限后，旧事件仍可从 archive/host sink 读取，或产品契约明确拒绝长周期历史能力；任何
淘汰都有可观测 receipt。

## 5. P2：应在 Beta 前收敛

### P2-1 WorldFactStore 的 Date 边界不是防御性复制

`src/canon/WorldFactStore.js:83-92` 直接保存并返回同一个 Date。调用方修改输入或返回值即可改变
内部模拟时间。应在 set/get 两端复制，并拒绝 Invalid Date。

### P2-2 fromJSON 漏掉 Intention 的容量恢复

`addFact()` 在 `WorldFactStore.js:150-151` 限制 Intention，但 `fromJSON()` 的 `:560-571` 没有执行
对应 eviction。构造 1000 条合法 Intention 可在恢复后全部保留，越过 500 上限。应使用同一张
type→limit 表驱动写入与恢复，避免分支再次漂移。

### P2-3 文档存在断链、过时说明和索引漂移

已确认的相对链接断裂包括 `examples/longitudinal-life-demo/README.md` 指向两个不存在的 roadmap；
`docs/DOMAIN.md`、`docs/PERFORMANCE.md`、`AFFECT_COMPILER_RFC.md` 和若干源码/测试注释仍引用已删除
文件。`docs/SERIALIZATION_CONTRACT.md` 仍描述 EventDispatcher 只序列化最后 100 条，而当前源码按
`maxSize` 处理。RFC 目录和索引也未完全一致。仓库没有 `docs:check`/CI 文档门禁。

### P2-4 CI 与 release gate 重复执行大量相同工作

`.github/workflows/ci.yml` 已分别执行 tests/domain/boundary/smoke/replay，随后 `release-gate` job 又
全部重跑；`scripts/release-gate.sh:52-53` 调用 `release:check`，内部再次执行 test/domain/boundary。
这会延长反馈并增加偶发失败噪声。应拆分 PR 快速阻断项与发布专用项，release gate 内部不嵌套
重复脚本。

### P2-5 高风险模块的分支证据仍偏弱

总体覆盖率可接受，但 `EffectCommitter`、`KnowledgeStore`、`LLMAdapter`、`Character`、
`SocialGraph`、`SpatialEngine`、migration 和 compiler 等模块低于整体水平。下一阶段不应追逐全局
数字，而应对事务回滚、异常恢复、超时、容量、时间归一化和公开契约设置 scoped branch gates。

### P2-6 Reference Host 与当前能力账本漂移

Reference Host 的 API gap ledger 仍保留 effect summary 不可观察等已解决项，与 evidence index
不一致。账本需要引入 `status/resolvedBy/verifiedAt/engineCommit`，已解决项不可继续作为当前 Gap。

## 6. 安全与 GitHub 上传边界

本轮未发现已跟踪的 `.env`、私钥、证书、数据库、tarball、私有 D5 语义语料或 Reference Host
运行产物。生产依赖审计为 0 漏洞，SQLite 语句使用参数绑定，外部状态投影也有危险键防护。

仍建议在 CI 增加通用 secret scanning，因为当前 `release:clean` 主要检查已知路径和机器元数据，
不能替代凭据熵/格式扫描。以下内容继续禁止上传 GitHub：

- `.env*` 中的真实凭据、`*.pem`、`*.key`、`*.p12`、`*.pfx`。
- `*.sqlite*`、`*.db*`、本地日志、coverage、benchmark local baseline。
- 私有 narrative semantic corpus 与 D5 private report。
- `reference-host/artifacts/`、本地 `node_modules/`、临时 tarball。
- macOS/编辑器/agent/knowledge-graph 机器状态。

## 7. 能力成熟度复核

| 能力 | 当前判断 | 说明 |
| --- | --- | --- |
| 公共 API / 包边界 | Strong | 导出面、类型、打包后消费均有门禁 |
| 核心确定性 | Strong | seeded replay 100/100；严格随机边界已建立 |
| tick 原子性 | Strong with gap | 降级恢复设计成熟；callback 重入仍需处理 |
| 状态写回 | Good | typed delta 单写点清晰；skip reason 不可观测 |
| 持久化 | Good with parity gaps | 恢复链完整；Memory/SQLite 语义尚未完全相同 |
| Canon / Knowledge | Good with time gap | 隔离/传播完整；evidence 时间可失真，历史会静默淘汰 |
| LLM 接入 | Alpha | provider 适配可用；流/body 生命周期不够可靠 |
| 质量证据 | Mixed | 测试规模强，但报告判定可绕过完整证据 |
| Reference Host | Not trustworthy yet | 当前测试未绑定当前 HEAD artifact |
| 性能 | Healthy | 本轮不是优先瓶颈；native 继续保持 experimental |
| D5 real-LLM | Not evaluated | synthetic Pass 不得升级真实模型结论 |

## 8. 最终建议

先修“证据链”，再修“状态边界”，最后扩能力。第一批不应加入 StoryArc、WorldObject、原生模块、
ESM 或新的公共 envelope，而应按以下顺序推进：

1. 让 Reference Host 确定性消费当前 HEAD。
2. 建立 Memory/SQLite 参数化契约测试并修复隔离/事务/prune。
3. 统一 Canon/Knowledge 时间证据与 WorldFactStore 边界。
4. 修复 LLM body/stream 超时和资源清理。
5. 修复 effect reason、tick 重入和 fail-closed quality manifest。
6. 清理 skipped tests、文档断链和重复 CI。
7. 明确 hot canon 与 durable history；最后再做独立 real-LLM D5。

详细执行设计见
[`../rfc/POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md`](../rfc/POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md)。

本轮只新增审核与规划文档，没有修改运行时代码、公共 API 或测试基线。
