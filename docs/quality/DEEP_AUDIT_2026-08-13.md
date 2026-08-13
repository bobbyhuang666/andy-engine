# Andy Engine 深度审核（复核轮）

> 审核日期：2026-08-13
> 审核对象：`/Users/huangweijie/Documents/andy-engine`
> Git 基线：`bded50c`（HEAD），分支 `codex/consolidate-desktop-repo`，工作区为未提交的修复批次
> 包版本：`andy-engine@2.0.1`
> 审核性质：对 [`DEEP_AUDIT_2026-08-12.md`](./DEEP_AUDIT_2026-08-12.md) 7 项 P1 + 6 项 P2 的修复批次进行源代码级复核，并修复本轮新发现的问题

## 1. 结论先行

本轮复核的对象是按
[`POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md`](../rfc/POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md)
W0–W7 执行的一批未提交修复。修复质量整体较高：8 月 12 日报告的 **7 项 P1 中 5 项完全修复、1 项达到
Phase A 验收、1 项部分修复**；6 项 P2 中 4 项修复。测试总量从 3974 增至 **4087 通过**（+113，
未新增 skip），全量测试 / 领域边界 / 打包消费 / 性能门禁 / TypeScript / 安全审计 / 文档链接全部实跑通过。

本轮又修复了审核中发现的 2 项 P2 与 5 项 P3，并新增 9 个回归测试。修复后唯一阻断提交的是
`release:gate` 中的 `git diff --check`（已在本轮消除）与 `release-clean`（工作区未提交的自然结果，
提交后解除）。

**本轮审核判定：修复批次质量可信，可在清理行尾空白后提交；Integration Beta 证据链较 8 月 12 日
显著改善，但仍未达"全部声明入口 fail-closed"的最终要求（见 §5）。**

## 2. 已验证的健康基线

| 范围 | 结果 | 证据摘要 |
| --- | --- | --- |
| 完整测试 | Pass | 236 文件通过 / 1 跳过；4087 通过 / 28 跳过（较 8/12 +113 通过，skip 不变） |
| 领域边界 | Pass | 5 文件 82 测试通过；13 项 boundary check 全过 |
| 打包消费 | Pass | 19/19 pack smoke |
| 性能 | Pass | 5 项比率 ≤1.03x，三轮全过 |
| TypeScript | Pass | `tsc --noEmit` 退出 0 |
| 安全 | Pass | `npm audit --omit=dev` 0 漏洞 |
| 文档链接 | Pass | `docs:check` 79 md 全通（修复后扫描覆盖未提交文件） |
| `git diff --check` | Pass | 修复 ci.yml 行尾空白后通过 |
| `release:gate` | Pass（提交后） | 仅 `release-clean` 因工作区未提交失败，非代码缺陷 |

## 3. P1 修复复核

### P1-1 Reference Host 绑定当前 HEAD —— ✅ FIXED

**证据**

- `scripts/reference-host-verify.js`：`npm pack --json` 当下打包 → 干净临时目录安装 → 校验解析路径在
  temp host `node_modules` 内（用 `realpathSync` 处理 macOS `/var` 符号链接）→ 输出 manifest 含
  `engineCommit` / `artifactIntegrity`（sha512）/ `artifactShasum`。
- `.github/workflows/ci.yml` 新增 `reference-host` job，Node 20.x/22.x 双版本跑 `reference-host:verify`。
- `reference-host/package.json` 依赖改为 `file:../`，干净 clone 不再依赖被忽略的 tgz。
- `tests/reference-host-verify.test.js`：happy path 绑定 HEAD + 负向 `--require-commit` 强制失败。
- 本地实跑：manifest `status=pass`，`engineCommit === HEAD`，`hostSuite 13 passed / 0 failed`。

**残留（P3，本轮已修）**：`npm pack` 会包含未提交变更，脏树时 commit↔artifact 绑定弱化。已新增
`workingTreeDirty` 字段，CI 环境下脏树硬失败，本地告警。

### P1-2 Memory/SQLite Store 语义一致 —— ✅ FIXED

**证据**

- `src/store/binaryCopy.js`：统一复制点，覆盖 `Buffer` / `ArrayBufferView`（含 `Uint8Array`）/
  `ArrayBuffer`。`ArrayBufferView` 经 `Uint8Array.slice()` 复制 viewed region（新 ArrayBuffer），
  避免了 `Buffer.from(view, byteOffset, length)` 共享底层 buffer 的陷阱。
- `MemoryStore`：saveSnapshot / loadLatest / loadSnapshot / loadSnapshots 读写双边界均 `binaryCopy`；
  `getRecent` / `getByEmotion` 返回 `_copyStory` 浅副本；`transaction()` 入口快照四项可变状态
  （stories / snapshots / meta / _nextStoryId），catch 恢复后重抛；`prune(keepCount <= 0)` 删除全部。
- `SQLiteStore`：`saveSnapshot` 写入侧 `binaryCopy`；`prune(0)` 改为 `DELETE FROM snapshots`。
- `tests/store/store-contract-suite.test.js`：同一套断言参数化跑两个后端（Buffer/Uint8Array 隔离、
  story 隔离、meta 往返、事务 commit/rollback、prune 0/1/N、checkpoint 冲突），SQLite 不可用时
  整块 `it.skip`（可选依赖，CI `sqlite-smoke` job 覆盖）。

**残留**：`_copyStory` 是浅副本，meta 为扁平 JSON 原语时足够；若未来 story 含嵌套对象需再评估。
嵌套事务无 savepoint 语义，外层 catch 会连同内层副作用一起回滚到外层入口——已在注释和契约测试中固定。

### P1-3 知识证据时间/来源 —— ✅ FIXED

**证据**

- `src/canon/timeHelpers.js`：单一 `normalizeEventTimeMs(value, fallbackMs)`，处理 Date / ISO 字符串 /
  数字 / undefined / null / Invalid Date / 不可解析字符串，统一返回有限 ms 或 fallback。
- `CanonEventPipeline._propagateKnowledge`：direct / observed / overheard 三条路径现在传完整
  `{ source, confidence, learnedAt: eventTimeMs, propagatedFrom: null, eventId }`，不再传裸字符串。
- `_tryToldPropagation`：改用 `normalizeEventTimeMs(event.time)`，修复了 `Number.isFinite(ISO字符串)`
  恒 false 导致 told 证据时间退回 FALLBACK_EPOCH 的 bug。
- `tests/canon/sim-time-evidence.test.js`：覆盖 9 类输入归一化 + 5 来源证据矩阵 +
  "无合法事件产生 learnedAt:0" 全局断言 + 序列化往返 + Intention fromJSON 容量。

### P1-4 LLM 超时/资源清理 —— ✅ FIXED

**证据**

- `RequestContext` 类管理三层超时（headers 30s / overall 120s / stream idle 30s）+ 单一
  `AbortController`。`clearHeaders()` 收到响应头后清除 headers timer，overall 继续守 body。
- `_streamOpenAI` / `_streamAnthropic`：`finally` 中 `ctx.cleanup()` + `reader.cancel()` +
  `reader.releaseLock()`，幂等。每个 `reader.read()` 前 `resetIdle()`。
- `tests/unit/llm-lifecycle.test.js`：正常 body / body stall → body_timeout / 正常流 / idle stall →
  stream_idle_timeout / consumer early break / HTTP error / Anthropic 流，7 例全过。

**残留（P3，本轮已修注释）**：timeout 的 `error.message` 文本已变（"timed out (headers)" 等），
与旧"timed out after 30s"不同。原注释声称"public error.message unchanged"不准确，已更正为
"消费者应匹配 `err.code` 而非消息文本"。

### P1-5 质量报告 fail-closed —— ⚠️ PARTIAL（本轮补修至更接近完全）

**已修**

- D1 删除 `special: 'Pass'` 短路，改为 persistence-trust + golden-seed-replay + replay-trust-l4 三文件
  全 pass 才 Pass。
- 通用路径从"只查 entryTokens[0]"改为查全部入口文件：any fail → Gap，any not-found → Warning，
  all pass → Pass。
- 切换到 `--reporter=json` 精确提取文件/测试 ID（回退到文本解析）。
- `tests/unit/d5-synthetic-realllm-separation.test.js`：D5 恒 Warning，synthetic Pass 不可升级。

**8/12 报告点名但本轮前未修（本轮已修）**

- **D4** 原逻辑：`tests/unit/effects/` 下任一文件 pass 即 Pass，未强制声明入口中的
  "golden seed replay"。**已改为**：effects 目录全绿 + golden-seed-replay pass 才 Pass；
  golden 缺失 → Warning；any fail → Gap；无 effects 文件 → Gap。
- **D7** 原逻辑：只看 `test:domain` 退出码，忽略声明入口 `tests/compatibility.test.js`。
  **已改为**：domain 退出码 0 + compatibility pass 才 Pass；compatibility 缺失 → Warning；
  fail → Gap。

**残留**：`aliveness-report` 仍依赖 `findFileStatus` 子串匹配（如 `'compatibility'`）。当前无碰撞，
但若未来出现同名前缀文件需收紧为完整 basename 匹配。本轮新增
`tests/unit/aliveness-report-d4-d7-judgment.test.js`（9 例）钉死新判定。

### P1-6 Effect skip reason / tick 重入 —— ✅ FIXED

**证据**

- `EffectCommitter._applyDelta` 返回 `{ status, reasonCode }`：position 细分
  `invalid_target` / `agent_missing` / `out_of_bounds` / `guard_rejected`，其余 `guard_rejected`，
  未知类型 `unknown_delta_type`。
- `Diagnostics.collect(entry)` 接收结构化条目（含 `timestamp`），替代原来丢弃 metadata 的 `warn`。
- `AndyWorld.step`：入口 `_tickInProgress` 守卫，同步重入返回 `{ status: 'rejected', code: 'TICK_REENTRANCE_REJECTED' }`；
  五阶段结算（恢复 committer → 冻结 effectSummary → refresh facts → callbacks → 清 flag），
  callbacks 在结算之后执行，内外统计隔离。`catch` 安全网确保异常时也恢复 committer 和 flag。
- `tests/unit/effects/effect-receipt-tick-reentrance.test.js`：11 例覆盖各 reasonCode、
  diagnostics.collect 结构化、callback 抛错不影响 committed、同步重入拒绝、拒绝后下一 tick 正常、
  连续 tick 不串统计、callback 可读冻结 summary。

### P1-7 Canon 保留策略 —— ✅ Phase A 验收达标

**证据**

- `WorldFactStore`：`FACT_TYPE_LIMITS` 单一 map 驱动 `addFact` 和 `fromJSON` eviction（修复 P2-2
  fromJSON 漏 Intention）。每次 eviction 产生 receipt `{ type, count, oldestMs, newestMs, reason,
  simTimeMs }`，`simTimeMs` 用模拟时间（非 wall-clock）保持确定性核心边界。
- `getStats().retention`：per-type cap/current/totalEvicted + lastEvictionReceipt +
  totalEvictionEvents。
- `docs/canon/HOT_HISTORY_CAPACITY.md`：明确契约——hot view 不是完整 log，超限永久删除，
  长周期历史能力声明在 Phase B 前固定不可用。
- `tests/canon/hot-retention.test.js`：2001 EventFact → evict 401 retain 1600、receipt 字段、
  retention 观测、receipts 有界 100、oldest/newest 追踪被淘汰范围。

**残留（P3，本轮已修）**：`totalEvictionEvents` 原本等于 `_evictionReceipts.length`，但 receipts
截断到 100 后该值被钳制，与文档"累计"语义矛盾。已改为独立 `_totalEvictionEvents` 计数器。
Phase B（durable archive）仍未实现，但契约已明确拒绝长周期历史能力声明——符合 Beta 前要求。

## 4. P2 修复复核

| 条目 | 判定 | 证据 |
| --- | --- | --- |
| P2-1 Date 防御性复制 | ✅ FIXED | `setSimTime` 复制 + 拒绝 Invalid Date；`getSimTime` 返回 `new Date(getTime())` |
| P2-2 fromJSON Intention 容量 | ✅ FIXED | `FACT_TYPE_LIMITS` 单一 map 驱动两路径；测试 1000 Intention → 400 |
| P2-3 文档断链 | ✅ FIXED | `scripts/docs-check.js` 扫 79 md 全通；longitudinal demo 断链删除；SERIALIZATION_CONTRACT 更新 maxSize |
| P2-4 CI/release-gate 重复 | ✅ FIXED | `release-gate.sh` 删除嵌套 `release:check`（已由前面步骤覆盖） |
| P2-5 高风险模块分支覆盖 | ⏳ 未本轮处理 | 仍依赖整体覆盖率，未加 scoped branch gates（RFC 后续） |
| P2-6 API gap ledger 漂移 | ✅ FIXED | `API_GAP_LEDGER.md` 新增 Resolution 块（status/resolvedBy/verifiedAt/engineCommit/evidence） |

## 5. 本轮新发现问题与修复

### N1 ci.yml 行尾空白阻断 release:gate（P2，已修）

`ci.yml:125-145` 新增 reference-host job 块含 6 行行尾空白（4 空格），导致 `git diff --check`
失败，`release:gate` 退出 1。已删除空白并格式化空行。

### N2 docs:check 未接入任何 CI/gate（P3，已修）

`scripts/docs-check.js` 已存在并加入 `package.json` scripts，但 `ci.yml` 和 `release-gate.sh`
均未调用。已新增 `docs` CI job 跑 `npm run docs:check`。

### N3 docs:check 只扫 git 已跟踪文件（P3，已修）

原实现用 `git ls-files "*.md"`，未提交的新文档在 dirty tree 上被静默跳过验证
（73 vs 实际 79 文件）。已改为文件系统全量扫描（跳过 node_modules/.git/coverage/artifacts/dist），
确保提交前新文档也被链接校验。

### N4 reference-host-verify 不校验脏树（P3，已修）

`npm pack` 包含未提交变更，脏树时 manifest `engineCommit` 无法真正绑定 artifact。已新增
`workingTreeDirty` 字段；CI 环境下脏树直接 `fail`，本地仅告警（允许提交前迭代）。
`IB_ARTIFACT_VERIFICATION_MANIFEST.md` schema 与 fail-closed 规则已同步更新。

### N5 aliveness D4/D7 声明入口未全部强制（P2，已修）

见 §3 P1-5。D4 未强制 golden-seed-replay，D7 忽略 compatibility.test.js。已改为 fail-closed
并新增 9 例回归测试。

### N6 totalEvictionEvents 被 receipts 截断钳制（P3，已修）

见 §3 P1-7。改为独立 `_totalEvictionEvents` 计数器。

### N7 注释与实现漂移（P3，已修）

- `WorldFactStore` receipt 注释字段名 `at` 与实际 `simTimeMs` 不符；receipts 注释称"last eviction
  per type"实为"last 100 events"。已更正。
- `LLMAdapter` 注释称"public error.message unchanged"但 timeout message 已变。已更正为匹配 `err.code`。

## 6. 能力成熟度复核（较 8/12 变化）

| 能力 | 8/12 | 8/13 | 变化 |
| --- | --- | --- | --- |
| 公共 API / 包边界 | Strong | Strong | 持稳 |
| 核心确定性 | Strong | Strong | 持稳 |
| tick 原子性 | Strong with gap | Strong | 重入 gap 已修 |
| 状态写回 | Good | Good+ | skip reason 可观测 |
| 持久化 | Good with parity gaps | Good | Memory/SQLite 契约对齐 |
| Canon / Knowledge | Good with time gap | Good | 时间证据 + 容量契约明确 |
| LLM 接入 | Alpha | Alpha+ | 三层超时 + 资源清理 |
| 质量证据 | Mixed | Mixed+ | D1/D2/D4/D7 fail-closed；D5 分层 |
| Reference Host | Not trustworthy yet | Trustworthy | 绑定当前 HEAD + CI |
| 性能 | Healthy | Healthy | 持稳 |
| D5 real-LLM | Not evaluated | Not evaluated | 仍需独立评测 |

## 7. 提交前清单与本轮修复动作

1. ✅ 删除 ci.yml 行尾空白 → `git diff --check` 通过。
2. ✅ aliveness D4 强制 golden-seed-replay；D7 纳入 compatibility.test.js（+9 回归测试）。
3. ✅ docs:check 接入 CI docs job；扫描改为文件系统全量。
4. ✅ reference-host-verify 增加 `workingTreeDirty`：CI 脏树硬失败，本地告警。
5. ✅ `totalEvictionEvents` 改独立计数器；receipts / LLM 注释漂移更正。
6. ✅ `SKIPPED_TEST_LEDGER` 计数同步（28 skip 不变）。

## 8. 最终建议

修复批次质量可信，提交后 `release-clean` 自然解除。Integration Beta 证据链较 8/12 显著改善：
Reference Host 已可复现绑定当前 HEAD，Store/Canon/LLM/effects 的关键边界语义已对齐或可观测，
质量报告的 fail-closed 覆盖从 D1/D2 扩展到 D4/D7。

下一步优先级（不阻断本次提交）：

1. P2-5：对 EffectCommitter / KnowledgeStore / LLMAdapter 等高风险模块加 scoped branch gates，
   而非追逐全局覆盖率。
2. aliveness `findFileStatus` 收紧为完整 basename 匹配，消除子串碰撞风险。
3. Canon Phase B（durable archive）设计落地前，继续禁止长周期世界历史能力声明。
4. 独立 real-LLM D5 评测，与 synthetic 持续分层。

本轮修改了运行时代码（WorldFactStore 计数器、LLMAdapter 注释、aliveness-report 判定）、
CI 工作流、验证脚本与文档，并新增 9 个回归测试；全量测试 4087 通过、perf 通过、docs 通过、
`git diff --check` 通过。
