# v2.3 Memory System Consistency & Scale Readiness — Design Brief

> 阶段：v2.3 设计（仅 brief，不写代码，不派执行 AI）
> 状态：待独立审计。审计通过后总规划师决定是否开 v2.3 波次。
> 来源：v2.2 Persistence Fidelity 关闭后的非阻塞后续议题（REPLAY_TRUST_ROADMAP §9）
> 核实基线：commit `086f652`

## 0. 摘要

v2.2 修复 L4 截断续跑后，暴露三个 v2.3 方向：memory 一致性（`_simTime` 初始化差异）、snapshot 体积（presentations 完整持久化后增长）、replay 可观测性（hash 分层）。本 brief 不给实现，只回答设计问题。

---

## 1. Memory Consistency

### 1.1 `_simTime` 初始化一致性问题是什么？

**核实事实**：

| 模块 | `_simTime` 初值 | 风险 |
|---|---|---|
| `PersonalMemory`（`PersonalMemory.js:49`） | `Date.now()`（墙上时钟） | **高**：构造时用墙上时钟，setSimTime 前的任何时间计算（如 seed memory timestamp）依赖墙上时钟 |
| `ProceduralMemory`（`ProceduralMemory.js:36`） | `0`（确定性） | 低：注释明确"确保在 setSimTime() 被调用前不会产生错误的时间差计算" |

**问题**：PersonalMemory 构造时 `_simTime = Date.now()`，与 ProceduralMemory 的 `0` 不一致。setSimTime（每 tick 由 `AgentRuntime.tick` line 84 调用）会在 tick 开始覆盖，但**构造到首次 tick 之间**的任何时间计算用墙上时钟。

v2.2 已修复 seed memory 的墙上时钟渗漏（`backgroundToMemories(background, simTime)` 接收 simTime），但 PersonalMemory 构造函数本身仍用 `Date.now()` 作初值。若构造后、setSimTime 前有代码读 `_simTime`（如 addExperience 在首 tick 前调用），会用墙上时钟。

**L4 影响**：当前 L4 测试恢复点 tick 50 已过 setSimTime，不受影响。但若未来有"恢复后首 tick 前的 addExperience"路径，会渗漏。

### 1.2 PersonalMemory / ProceduralMemory 是否存在恢复后时间语义差异？

**核实**：

- PersonalMemory：`fromJSON`（构造函数恢复路径）`_simTime = Date.now()`（line 49），恢复后首 tick 前 _simTime 是墙上时钟。setSimTime 后覆盖。
- ProceduralMemory：`fromJSON` → `new ProceduralMemory(json)` → `_simTime = 0`。恢复后首 tick 前 _simTime = 0。

**差异**：PersonalMemory 恢复后 _simTime 是墙上时钟，ProceduralMemory 是 0。两者在 setSimTime 前的时间语义不同。若恢复后首 tick 前有共享时间计算（罕见，但语义不一致是缺陷）。

### 1.3 retrieval / consolidation / procedural pattern 是否需要新的 characterization tests？

**需要**。v2.2 诊断链揭示 memory 系统行为复杂（retrieve top-K / consolidate merge / _baseLevelActivation / _memorySimilarity），但缺少**characterization tests**——锁定当前行为的基线测试，防 v2.3 改动（如 compaction）无意改变语义。

候选 characterization tests：
- `retrieve` 在固定 memory 集合 + context 下返回确定的 top-K（锁定检索行为）
- `consolidate` 在固定 memory 集合下合并确定的 pair（锁定合并决策）
- `_baseLevelActivation` 对固定 presentations 的计算结果（锁定 baseLevel 公式）
- `proceduralMemory` pattern 在固定行为序列下的形成（锁定 procedural 学习）

这些测试不依赖 L4 全程回放，只锁定单函数行为，是 v2.3 compaction/restructuring 的安全网。

---

## 2. Snapshot Scale

### 2.1 presentations 完整持久化后，长程 500/1000 tick snapshot 体积增长？

**实测**（seed42 / 2 角色）：

| ticks | snapshot 体积 | maya memory | maya presentations | max presentations/mem |
|---|---|---|---|---|
| 100（当前 golden） | ~325KB（W3） | — | — | — |
| 500 | ~1020KB | 424 | 3085 | 389 |
| 1000 | ~1429KB | 409 | 17886 | — |

**观察**：
- 500→1000 tick，memory 数从 424→409（consolidate 合并，增长放缓）。
- presentations 从 3085→17886（**近 6 倍增长**，因高频 memory 每次访问追加）。
- snapshot 体积 1020KB→1429KB（consolidate 截断 memory 抑制增长，但 presentations 持续膨胀）。

**预测**：长程模拟（5000+ tick）snapshot 可能达 5-10MB，presentations 占主体。

### 2.2 哪些字段是 fidelity-critical，哪些可以压缩？

**fidelity-critical（不可压缩，进 L4 hash 语义）**：
- `id` / `content` / `category` / `emotionTag` / `importance`
- `timestamp` / `lastAccessed` / `accessCount`（baseLevel 计算依赖）
- `presentations`（baseLevel 遍历计算，W0e 根因）
- `appraisal`（_memorySimilarity 合并决策，W0f 根因）
- `eventId` / `emotionSnapshot` / `semanticCategory` / `associations`

**可压缩候选**（需证明不破坏 L4）：
- `presentations` 历史远端：若 baseLevel 只需近期访问频率，远端 presentations 可摘要化（如按天聚合 count）。但需证明 baseLevel 公式对摘要不敏感。
- `emotionSnapshot`：若仅用于 recall delta，可降低精度（如 6 位小数→3 位）。但需证明不改变 retrieve 选择。
- `associations`：若仅用于 spreadingActivation，可去重/截断。但需证明不影响相似度。

### 2.3 compaction 是否会破坏 L4？如何证明不破坏？

**风险**：compaction 改变 memory 字段内容/数量，若影响 baseLevel/similarity/retrieve 选择，会破坏 L4。

**证明方法**：
1. characterization tests（§1.3）锁定单函数行为——compaction 后这些测试仍 pass 证明语义不变。
2. L4 全程回放（100 tick）+ replay-diff 100/100 matched——证明 compaction 后轨迹一致。
3. 多 seed L2 + 跨进程 L3——证明 compaction 不引入新的非确定源。
4. 体积/性能基准——证明 compaction 达到压缩目标。

**纪律**：compaction 必须先有 characterization tests 作安全网，再实现。v2.2 诊断链的痛苦经验（5 层逐层挖）证明缺乏 characterization tests 的改动风险极高。

---

## 3. Replay Observability

### 3.1 eventLogHash / memoryHash / agentStateHash 是否应拆分？

**当前**：`tickHash`（`src/store/world/tickHash.js`）用单一 sha256 覆盖 `HASHED_FIELDS = [worldClock, characters, relationships, canonFacts, positions]`。memory / eventLog 内部 / emotion 不进 hash。

**拆分建议**：

| hash | 覆盖字段 | 用途 |
|---|---|---|
| `tickHash`（现有） | worldClock / characters / relationships / canonFacts / positions | L4 全程一致性（release gate） |
| `eventLogHash`（新） | eventLog id 序列 + type + content hash | event 演化追踪（诊断 + 可选 gate） |
| `memoryHash`（新） | 每 agent memory ids + importance + accessCount 摘要 | memory 演化追踪（诊断） |
| `agentStateHash`（新） | emotion / behaviorField / needs 摘要 | agent 内部状态追踪（诊断） |

**判断**：
- `tickHash` 保持作为 L4 release gate（已验证有效）。
- 拆分 hash 主要提升**诊断可观测性**——v2.2 诊断 5 层根因时，若有多层 hash 能快速定位分叉层（如 memoryHash 分叉→memory 层，agentStateHash 分叉→emotion 层），减少诊断轮次。
- `eventLogHash` 可考虑进 release gate（event 演化是 world state 核心），但需评估是否过严。

### 3.2 replay-diff 是否需要分层输出？

**需要**。当前 `replay-diff` 输出 tick-by-tick hash 比对。分层输出能加速诊断：

```text
Layer 1 (tickHash):     tick 67 mismatch  ← 当前只能看到这层
Layer 2 (eventLogHash):  tick 60 mismatch  ← 指向 event 层
Layer 3 (memoryHash):    tick 60 mismatch  ← 指向 memory 层
Layer 4 (agentStateHash): tick 67 mismatch ← 指向 emotion 层
```

分层后，首个分叉层直接指示根因层，无需逐层 instrument 诊断（v2.2 的 W0→W0c→W0e→W0f 四轮可缩减为一轮）。

### 3.3 哪些 hash 应进入 release gate，哪些只作诊断？

**建议**：
- `tickHash`：release gate（现有，L4 验收标准）。
- `eventLogHash`：候选 release gate——event 演化是 world state 核心，但需评估是否与 tickHash 冗余（characters/relationships 已含 event 后果）。
- `memoryHash` / `agentStateHash`：仅诊断，不进 release gate——memory/emotion 是 agent 内部状态，其一致性由 tickHash 间接守护（tickHash 含 characters 含 agent 标量投影）。

**纪律**：新增 release gate hash 需证明不误伤正常演进（如 intentional drift 走 changelog）。诊断 hash 不阻塞 release。

---

## 4. 阶段边界

### 4.1 明确边界（全程有效）

- 不改 Stable Envelope 顶层字段（schemaVersion/worldId/domainRef/worldClock/characters/relationships/events），除非另开 RFC 经总规划师批准。
- 不牺牲 L4 resume——任何 v2.3 改动后 L4 主测试必须仍 pass。
- 不引入 LLM narrative 作为 replay 内容（narrative 非确定，不进 golden corpus）。
- 不启动 StoryArc / UI / Andy Town / npm publish / 新功能。

### 4.2 触及边界需回总规划师

- schemaVersion bump（若 compaction 需新字段标记压缩策略）。
- Stable Envelope 字段变更（若拆分 hash 进 envelope 顶层）。
- public API contract 变更（若 compaction 改 toJSON 结构）。
- release gate 规则变更（若新增 hash 进 release gate）。

### 4.3 v2.3 候选波次（不启动，待审计+总规划师批准）

- v2.3-W1：`_simTime` 初始化一致性（PersonalMemory 改 0 初值 + characterization tests）。
- v2.3-W2：memory characterization tests（retrieve/consolidate/baseLevel/procedural 行为锁定）。
- v2.3-W3：replay observability 分层 hash（eventLogHash/memoryHash/agentStateHash + replay-diff 分层输出）。
- v2.3-W4：snapshot compaction 设计（若 W2 characterization tests 就位，评估 presentations 摘要化）。

每个波次按"任务卡 → 执行 → 验收 → 回写"节奏。触及 §4.2 边界单独走总规划师确认。

---

## 5. 待独立审计的问题

1. `_simTime` 修复（PersonalMemory 改 0）是否属 v2.2 persistence fidelity 延伸（应已修），还是 v2.3 新议题？
2. characterization tests 是否应在 v2.3-W1 优先（作为 compaction 安全网），还是与 _simTime 并行？
3. eventLogHash 进 release gate 是否过严？是否与 tickHash 冗余？
4. compaction 是否值得做（presentations 1.4MB@1000tick 是否可接受），还是推迟到观察到实际性能问题？
5. v2.3 是否应引入 schemaVersion 0.2.0 显式标记 fidelity level（full / compacted）？
