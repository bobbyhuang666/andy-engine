# W3-H v2 Impact Statement

**冻结范围**: `31e558b` (旧基线, 不计入范围) -> `9531911` (当前 HEAD)
**审计者**: architecture-auditor
**日期**: 2026-07-26

> **范围口径说明**: git range `31e558b..9531911` 按 git 语义不包含起始基线 `31e558b`，包含 HEAD `9531911`，共 12 个提交。`31e558b` 作为旧基线记录在第 3.1 节单独说明，不计入分类计数。分类合计: 1 material + 9 exception-path-only + 2 no-W3-impact = 12。

---

## 1. Material Change: UTC 语义迁移 (Commit `c01533b`)

**Commit**: `c01533bf` fix(w5): harden persistence and deterministic time

此 commit 将模拟时间从本地时区语义改为 UTC。以下源文件涉及变更：

| 文件 | 变更内容 |
|------|---------|
| `src/shared/time.js` | `formatSimTime()` 使用 `getUTCHours()` / `getUTCMinutes()` |
| `src/runtime/WorldClock.js` | `hour` getter 使用 `getUTCHours()`；`dayOfWeek` 使用 `getUTCDay()` |
| `src/runtime/RuntimeContext.js` | `buildAgentEnv()` 中 `hour` 字段使用 `getUTCHours()` + `getUTCMinutes()`；`simDate` 使用 `toISOString().slice(0, 10)` |
| `src/narrative/FactConsistencyChecker.js` | `_checkTimeConflicts()` 使用 `currentTime.getUTCHours()` |
| `src/narrative/GroundingChecker.js` | `_validateTimeClaim()` 使用 `currentTime.getUTCHours()` |
| `src/pressure/WorldPressure.js` | 小时计算使用 `getUTCHours()` |
| `src/sdk/AndyEngineHelpers.js` | `buildWorldContext()` 输出 `hour` 和 `dayOfWeek` 使用 UTC 方法 |

### 对 W3-H 的 Material 影响分析

旧 W3-H 在 Asia/Tokyo (UTC+9) 环境下运行，旧/新路径相差 9 小时，具体影响：

1. **日程匹配** (`Schedule.getCurrentActivity`): `hour` 参数由 UTC+9 变为 UTC，同一模拟时刻的小时值不同。例如 Tokyo 时间 14:00 (UTC+9) = UTC 05:00。日程条目 `startHour: 9, endHour: 17` 在旧路径匹配但在新路径不匹配。

2. **时间冲突检测** (`FactConsistencyChecker._checkTimeConflicts` / `GroundingChecker._validateTimeClaim`): 白天判定阈值 (6-18) 基于 UTC 而非本地时区。LLM 输出中的中文时间词 ("深夜", "中午") 对应的判定基准偏移 9 小时。

3. **Grounding 输入** (`AndyEngineHelpers.buildWorldContext`): `hour` 和 `dayOfWeek` 字段值变化，直接影响 system prompt 注入的世界上下文。

4. **simDate 日期边界**: `simDate` 使用 `toISOString().slice(0, 10)`，UTC 午夜与 Tokyo 午夜差 9 小时，可能导致 `_lastVariationDate` 判断在不同天之间漂移，进而影响 `_todayVariations` / `_tomorrowVariations` 的重生成逻辑。

5. **天气时段判定** (`AndyWorld._calcTimeOfDay`): 虽然 `_calcTimeOfDay` 接收的是 `this.clock.hour`（已为 UTC），但季节判定 `_calcSeason` 使用 `this.clock.time.getMonth()` —— `Date.getMonth()` 是本地时区方法，存在不一致性。

**结论**: 旧 W3-H 的 300 successful outputs / 334/360 attempts 对当前 HEAD `9531911` 为 **NOT_VERIFIED**。UTC 语义迁移改变了所有时间敏感路径的输入值，旧结果不可作为 D5 gate 证据。

---

## 2. Exception-Path-Only Changes

以下 commit 仅影响错误处理、回滚、恢复等异常路径，不改变正常模拟轨迹：

| Commit | 描述 | 影响范围 |
|--------|------|---------|
| `993e916` | `fix(w5): roll back failed effect batches` | `src/effects/EffectCommitter.js` - 异常时批量回滚已应用的 delta |
| `66b21a4` | `fix(store): reject invalid checkpoint identities` | `src/store/CheckpointIntegrity.js` - 校验 checkpoint digest |
| `4948097` | `perf(effects): reuse rollback snapshots per batch` | `src/effects/EffectCommitter.js` - 快照缓存复用优化 |
| `ee8a249` | `feat(runtime): add opt-in atomic tick recovery` | `src/runtime/AtomicTickRecovery.js` - 失败 tick 的原子回滚 |
| `a6b5316` | `fix(runtime): fail stop degraded ticks` | `src/store/SimulationStore.js` - 跳过 degraded/aborted tick 的持久化 |
| `9852245` | `fix(store): verify checkpoints before restore` | `src/store/SimulationStore.js` - 恢复前验证 checkpoint 完整性 |
| `5c7605b` | `fix(store): commit checkpoint cursor atomically` | 原子性写入 checkpoint cursor |
| `784d68c` | `fix(release): harden recovery and consumer boundaries` | 恢复和消费者边界的加固 |
| `9531911` | `fix(store): reject invalid transport payloads` | 传输层 payload 校验 |

这些改动不影响正常 tick 的执行路径，仅在错误恢复、持久化完整性验证等场景下生效。对 W3-H 的常规模拟输出无影响。

---

## 3. Baseline Record & No-W3-Impact Changes

### 3.1 Baseline Record (excluded from range)

`31e558b` 是范围的起始基线，按 git 语义不计入 `31e558b..9531911`。记录如下，但不计入分类合计：

| Commit | 描述 | 说明 |
|--------|------|------|
| `31e558b` | `fix(W3-H): reclassify Ari as provider model-field anomaly` | 旧 W3-H 关键代码基线；模型字段分类修复，不涉及模拟逻辑 |

### 3.2 No-W3-Impact Changes (within range)

| Commit | 描述 | 理由 |
|--------|------|------|
| `b4f6266` | `feat(api): add immutable read projections` | 新增只读 snapshot API (`getAgentSnapshot`, `getAgentsSnapshot`, `getSocialGraphSnapshot`)，不修改 tick/simulation 执行路径 |
| `d3282a4` | `docs: clarify facts and evaluation status` | 文档变更 |

---

## 4. Public Generation/Checking Inputs Delta

| 输入类别 | 是否变化 | 说明 |
|---------|---------|------|
| LLM 输出文本 | 不变 | 不修改 |
| Grounding package (allowedFacts, forbiddenFacts) | 不变 | 事实存储不受 UTC 影响 |
| WorldContext (world state 注入) | **变化** | `hour`, `dayOfWeek`, `simDate` 从本地时区变为 UTC |
| Schedule 配置 (entries) | 不变 | 日程条目本身未变，但匹配时的 hour 参数变了 |
| Time conflict 检测阈值 | **变化** | 白天/夜晚判定从本地时区变为 UTC |
| simDate 日期字符串 | **变化** | `toISOString().slice(0,10)` 产生 UTC 日期 |
| 世界环境状态 (weather, timeOfDay, season) | **部分变化** | `timeOfDay` 依赖 UTC hour；`season` 依赖本地 month |

---

## 5. 关键文件路径清单

### UTC 相关核心文件
- `src/shared/time.js`
- `src/runtime/WorldClock.js`
- `src/runtime/RuntimeContext.js`
- `src/narrative/FactConsistencyChecker.js`
- `src/narrative/GroundingChecker.js`
- `src/pressure/WorldPressure.js`
- `src/sdk/AndyEngineHelpers.js`
- `src/agent/schedule/Schedule.js`

### 异常路径相关文件
- `src/effects/EffectCommitter.js`
- `src/runtime/AtomicTickRecovery.js`
- `src/store/CheckpointIntegrity.js`
- `src/store/SimulationStore.js`
- `src/runtime/ReadProjection.js`
- `src/store/Serialization.js`

### 编排核心
- `src/runtime/AndyWorld.js`

---

## 6. 结论

由于 `c01533b` 的 UTC 语义迁移是 **material change**，旧 W3-H (Asia/Tokyo) 的 300 successful outputs 对当前 HEAD `9531911` 为 **NOT_VERIFIED**。需要在新 UTC 语义下重新运行完整 W3-H 评估以建立有效 D5 gate 基线。

---

*architecture-auditor | 2026-07-26*
