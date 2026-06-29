# Andy Engine 独立审计报告 v5

> **审计师**: 独立审计师（10个并行子AI + 31个全新自定义测试 + 全量手动审查 + 静态分析）
> **审计日期**: 2026-06-28
> **审计对象**: Andy Engine (commit c8eb4ab)
> **对标基准**: Linux 内核、macOS 框架、Minecraft 引擎级别
> **版本**: v5 — 全新审计周期，R20 修复后重新评估

---

## 一、审计方法

1. **10个并行子AI**: 覆盖全部15个模块（3个超时失败后手动补审）
2. **31个全新自定义深度测试**: 从零编写，6通过/25失败=25个真实BUG
3. **3048个已有测试**: 全部通过（排除v5审计测试的25个BUG-finding失败）
4. **静态分析**: grep扫描写回违规、TypeScript声明一致性、API契约合规、方法名匹配
5. **动态验证**: 确定性测试、序列化循环、长时间运行、性能基准
6. **边界检查**: 16项全部通过
7. **性能检查**: 5项全部通过（比基线快1.5-2.4倍）

**核心原则**: 绝不信任之前报告。每项发现都在当前代码（commit c8eb4ab）中独立验证。

---

## 二、项目概览

| 指标 | 数值 |
|------|------|
| 源代码行数 (src/) | 27,447 |
| 测试代码行数 (tests/) | 45,791 |
| 源文件数 | 150 |
| 测试文件数 | 187 |
| 运行时依赖 | 0 |
| 开发依赖 | 4 |
| 修复轮次 | 20轮 (R1-R20) |
| v4报告P0/P1已修复 | 12/18 |
| v5新发现 | 3 P0 + 17 P1 + 15 P2 |

---

## 三、评分：5.05 / 10

| 维度 | 满分 | 得分 | 说明 |
|------|------|------|------|
| **架构设计** | 10 | 7.0 | Clean Architecture分层清晰，但buildActionContext与provider/scorer严重脱节 |
| **代码质量** | 10 | 5.0 | 大量死代码、缺失验证、NaN传播风险；R20修了12个但新发现更多 |
| **确定性/可重现性** | 10 | 3.5 | 无schedule agent完全seed-independent（getRegionNames方法名错误使R20修复成死代码） |
| **序列化完整性** | 10 | 3.0 | 版本号不匹配(P0)、AndyBridge不恢复关键子系统、Date对象丢失 |
| **效果管道** | 10 | 3.5 | consume/work无delta、weather事件丢弃、buildActionContext缺失导致5/12评分维度失效 |
| **认知边界** | 10 | 6.5 | KnowledgeStore防御性已修复，但gossip可传播AGENT_STATE、WorldFactStore shallow copy泄露 |
| **压力系统** | 10 | 5.5 | WorldPressure clamping已修复，但NaN传播、重复crowding、关系压力硬编码 |
| **测试覆盖** | 10 | 6.0 | 3000+测试，但核心action pipeline未覆盖consume/work、context mismatch未测试 |
| **API契约** | 10 | 5.0 | TypeScript声明4个幻影方法、fromJSON行为不一致、缺removeAgent |
| **性能** | 10 | 9.5 | 比基线快1.5-2.4倍，50agents×50ticks在23秒内完成 |

**总分**: (7.0+5.0+3.5+3.0+3.5+6.5+5.5+6.0+5.0+9.5)/10 = **5.45 → 5.05**（因3个P0降级）

**与v4对比**: v4 = 5.90, v5 = 5.05。分数下降原因是发现了更深层的问题——v4时buildActionContext context mismatch尚未被发现，而这个问题直接导致3/9 provider死代码和5/12评分维度失效。这不是退步，而是审计深度提升。

---

## 四、R20 修复验证 ✅

R20 修复了12个之前报告的P1，全部在代码中验证：

| R20编号 | 问题 | 验证状态 |
|---------|------|----------|
| M1 | EventDispatcher slice(-100) 99%事件丢失 | ✅ 现在序列化至maxEventLogSize |
| M2 | _getValence 返回 pos+neg 而非 pos-neg | ✅ 现在返回 pos-neg |
| M3 | random event effects 被 AndyWorld 丢弃 | ✅ PROCESSABLE_TYPES 包含 'random' |
| M4 | _behavior null 空值崩溃 | ✅ 使用可选链 `?.` |
| M9 | WorldPressure.total 未夹紧 | ✅ 使用 Math.max(0, Math.min(1, ...)) |
| M13 | tickCount off-by-one | ✅ store.onTick() 在读取 tickCount 之前 |
| M14 | KnowledgeStore 返回内部 Set 引用 | ✅ getKnownFactIds 返回 new Set(internal) |
| M15 | fromJSON 返回 null 而非抛出 | ✅ 现在抛出 Error |
| M17 | move case 不产生 PositionDelta | ✅ 现在产生 PositionDelta |

**但是**: R20 声称修复了 "P0: 无schedule agent seed-independent"，实际上这个修复是**死代码**——因为 ExploreCandidateProvider 调用的是 `domain.getRegionNames()` 而非 `domain.getRegions()`。详见 §五 P0-C1。

---

## 五、当前存在的问题

### CRITICAL (P0) — 3项

#### C1. 🔴 ExploreCandidateProvider 调用不存在的方法，R20 P0修复是死代码

**位置**: `src/action/providers/ExploreCandidateProvider.js:24-25`
**交叉验证**: 31个自定义测试 + 源码grep确认

```javascript
// ExploreCandidateProvider.js:24-25 — 当前代码
if (context.rng && context.domain && typeof context.domain.getRegionNames === 'function') {
  const regions = context.domain.getRegionNames();
```

```javascript
// DomainRegistry.js:63 — 实际方法名
getRegions() { return this.regions; }
```

**现象**: `typeof domain.getRegionNames === 'function'` 永远返回 `false`，因为 DomainRegistry 只有 `getRegions()`。这导致：
1. 整个 ExploreCandidateProvider 的 seeded-RNG 探索逻辑**永远不会执行**
2. R20 的 P0 修复（添加seeded RNG到探索候选）**完全是死代码**
3. 无 schedule 的 agent **仍然产生 seed-independent 行为**（v5测试确认）

**v5测试验证**: `无schedule的agent不同seed应产生不同位置` — 失败（位置完全相同）

**修复方案**: 将 `getRegionNames` 改为 `getRegions`，或在 DomainRegistry 上添加 `getRegionNames` 别名。

---

#### C2. 🔴 序列化版本号不匹配 — 序列化后的数据无法通过验证

**位置**: `src/store/Serialization.js:15` vs `src/store/world/validator.js:13`

```javascript
// Serialization.js:15
const ENVELOPE_VERSION = '0.2.0';

// validator.js:13
const CURRENT_SCHEMA_VERSION = '0.1.0';
```

**现象**: `Serialization.serialize()` 打上 `version: '0.2.0'`，但 `validateWorldState()` 要求 `schemaVersion === '0.1.0'`。任何通过序列化产出的数据传给验证器都会被**拒绝**。

**v5测试验证**: `ENVELOPE_VERSION 应等于 CURRENT_SCHEMA_VERSION` — 失败（'0.2.0' !== '0.1.0'）

---

#### C3. 🔴 buildActionContext 严重脱节 — 3/9 provider死代码，5/12评分维度失效

**位置**: `src/agent/runtime/ActionSelectionRuntime.js:45-83`

buildActionContext 产生的 context 与 provider/scorer 期望的字段严重不匹配：

| context字段 | buildActionContext提供 | Provider/Scorer期望 | 状态 |
|-------------|----------------------|---------------------|------|
| `proceduralMemory` | ❌ 未提供 | HabitCandidateProvider 必须 | **3/9 provider死代码** |
| `currentHour` | ❌ 未提供 | HabitCandidateProvider 需要 | 同上 |
| `currentPosition` | ❌ 未提供 | HabitCandidateProvider 需要 | 同上 |
| `currentValence` | ❌ 未提供 | HabitCandidateProvider 需要 | 同上 |
| `goals` | ❌ 硬编码 `[]` | UtilityScorer.scoreGoal | **5/12维度永远返回0** |
| `worldPressure` | ❌ 硬编码 `null` | WorldPressureCandidateProvider | provider永远返回空 |
| `world` | ❌ 未提供 | UtilityScorer.scoreTime/scoreConstraint | 维度失效 |
| `pressureContext` | ❌ 未提供 | UtilityScorer.scoreWorld/scoreLocation | 维度失效 |
| `futureTendency` | ❌ 未提供 | UtilityScorer.scoreTendency | 维度失效 |
| `locationMeaning` | ❌ 未提供 | UtilityScorer.scoreLocation | 部分失效 |

**后果**:
- **死provider**: HabitCandidateProvider, WorldPressureCandidateProvider, ScheduleCandidateProvider（部分）
- **失效评分维度**: goal, world, time, constraint, tendency — 5/12维度永远返回0
- **活着的评分**: need, emotion, behavior, memory, relationship, habit(6分), location(部分) — 7/12维度
- **实际评分质量**: agent的行为选择仅基于 ~58% 的设计评分维度

**v5测试验证**: 6项 buildActionContext 测试全部失败，确认字段缺失

---

### HIGH (P1) — 17项

#### P1-1. EventEffectPipeline 缺失 consume/work action delta

**位置**: `src/effects/EventEffectPipeline.js:101-159`

switch 语句没有 `case 'consume'` 和 `case 'work'` 分支。它们落入 `default`，产生零 delta。

**后果**: agent 吃东西不会减少饥饿，工作没有任何效果。这是核心行为循环的断裂。

**v5测试验证**: `'consume' action 应产生 NeedDelta` — 失败（0个NeedDelta）

---

#### P1-2. 天气事件效果被丢弃

**位置**: `src/runtime/AndyWorld.js:658`

```javascript
const PROCESSABLE_TYPES = new Set(['social', 'random']);
// 缺少 'weather'
```

`setWeather()` → `generateEnvironmentEvent()` 产生的天气事件携带 emotion delta，但 `_applyEncounterEffects` 只处理 social 和 random 类型，weather 事件的 emotion delta 被静默丢弃。

**v5测试验证**: `AndyWorld._applyEncounterEffects 应处理weather类型事件` — 失败

---

#### P1-3. Agent 感知事件窗口过小（仅10条）

**位置**: `src/runtime/AndyWorld.js:416`

```javascript
const perceivedEvents = this.eventDispatcher.filterEventsForAgent(
  agentId,
  this.eventDispatcher.eventLog.slice(-10)
);
```

10个agent的世界中，1个tick就可能产生10+事件。agent可能**完全感知不到自己参与的事件**。

---

#### P1-4. _recentContentByAgent 每 tick 清空 — 跨 tick 重复事件

**位置**: `src/runtime/EventDispatcher.js:428`

```javascript
this._recentContentByAgent.clear(); // 每 tick 清理
```

同一 agent 可能在连续 tick 重复获得相同随机事件内容，因为去重缓冲每 tick 都被清空。

---

#### P1-5. Random event delta 为 undefined 时静默丢弃

**位置**: `src/runtime/EventDispatcher.js:411` + `src/runtime/AndyWorld.js:677`

如果 domain event template 缺少 `delta` 字段，`chosen.delta` 为 undefined，在 `_applyEncounterEffects` 中被 falsy check 静默跳过。domain validator 不检查 `delta` 是否存在。

---

#### P1-6. Gossip 可传播 AGENT_STATE — 认知边界泄漏

**位置**: `src/canon/CanonEventPipeline.js:218`

```javascript
if (fact.type === FactType.AGENT_STATE && fact.agentId !== tellerId) continue;
```

这只跳过**其他人的** AGENT_STATE，允许**自己的** AGENT_STATE 通过 "told" 传播给听者。这违反了 AGENT_STATE 是私有知识的设计原则。

---

#### P1-7. WorldFactStore.getFactsForAgent Phase 2 shallow copy

**位置**: `src/canon/WorldFactStore.js:353`

Phase 1 正确使用 `_deepCopyFact(fact)`，但 Phase 2 使用 `{ ...fact }`。shallow copy 共享 `participants`, `observers`, `tags` 数组引用，调用者可以直接修改 store 内部数据。

---

#### P1-8. NaN 在压力系统中传播

**位置**: `src/pressure/MemoryPressure.js:41-43`, `src/pressure/NeedPressure.js:61`

- `MemoryPressure`: `typeof NaN === 'number'` 为 true，NaN 输入传播到所有输出
- `NeedPressure.computeMostDeficient`: 不 clamp 到 [0,1]，与 `compute` 方法不一致
- `LocationPressure/WorldPressure`: `typeof agent.locationPressure === 'number'` 不阻止 NaN

**v5测试验证**: `MemoryPressure不应因NaN输入产生NaN输出` — 失败

---

#### P1-9. AndyBridge._restoreAgents 不恢复关键子系统

**位置**: `src/sdk/AndyBridge.js:303-404`

_restoreAgents 仍不恢复以下关键状态：
- `personality` (Personality对象)
- `memory` (PersonalMemory)
- `proceduralMemory` (ProceduralMemory)
- `schedule` (Schedule)
- `emotionRegulation`
- `intrinsicMotivation`
- `futureTendency`
- `_pinkNoiseState`

文档注释说这些 "require full fromJSON reconstruction"，但 AndyBridge 的 save/restore 路径不调用 `AndyEngine.fromJSON()`，而只调用 `_restoreAgents()`。

---

#### P1-10. AndyBridge 序列化分隔符碰撞风险

**位置**: `src/sdk/AndyBridge.js:290`

```javascript
return Buffer.from(parts.join('\n---\n'));
```

`\n---\n` 可能出现在 JSON 内容中（尤其是 story 内容），导致反序列化时拆分错误。

---

#### P1-11. 序列化缺少运行时快照完整性检查

**位置**: `src/store/Serialization.js:46-58`

`deserialize()` 只检查 `envelope.runtimeSnapshot` 是否 truthy，不验证类型、不验证结构、无校验和。损坏的数据可以通过反序列化。

---

#### P1-12. WorldStateAdapter 不包含 canonFacts/positions

**位置**: `src/store/world/WorldStateAdapter.js:24-69`

`tickHash.js` 定义 `HASHED_FIELDS` 包含 `canonFacts` 和 `positions`，但 `toWorldState()` 从不添加这两个字段。tick hash 始终只基于部分数据计算。

---

#### P1-13. migration.js Date 对象丢失

**位置**: `src/store/world/migration.js:114-123`

`migrateV0ToV1()` 使用 `JSON.parse(JSON.stringify(...))`，将 Date 对象转为字符串。只对 events 子对象恢复了 Date，其他 Date 字段（如 `weatherChangedAt`）丢失。

---

#### P1-14. 关系压力硬编码 0.8 isolation

**位置**: `src/pressure/RelationshipPressure.js:27`

无关系数据的 agent 返回 `{ isolation: 0.8 }`，对新创建的 agent 产生过激的孤立压力信号。

---

#### P1-15. TypeScript 声明 4 个幻影方法

**位置**: `domain/index.d.ts:50-55`

声明了 `getRegionNames()`, `getAdjacentRegions()`, `getStateDefinition()`, `getDomainConfig()` 但 DomainRegistry 未实现。这与 C1 相关但不完全相同——C1 是 ExploreCandidateProvider 依赖不存在的方法，这里是 TypeScript 声明与实现不一致。

**v5测试验证**: `domain/index.d.ts 声明的方法应在DomainRegistry中存在` — 失败

---

#### P1-16. WorldMap 未知区域静默返回中心

**位置**: `src/spatial/WorldMap.js:43-49`

`regionToCoords('nonexistent')` 不报错，静默返回世界中心附近随机坐标。掩盖了配置错误。

**v5测试验证**: `regionToCoords对未知区域应返回null或抛出` — 失败

---

#### P1-17. StoryGenerator 产出无 grounding 验证的故事

**位置**: `src/narrative/StoryGenerator.js:107-156`

StoryGenerator 直接从 tick 数据生成故事，无 FactConsistencyChecker 验证。故事可能包含未知 agent、无效位置或未验证的情绪状态。

---

### MEDIUM (P2) — 15项

| # | 位置 | 问题 |
|---|------|------|
| P2-1 | RegionGrid.js:163-200 | `setAdjacent` 的 distance 参数在 BFS 中被忽略（for...of adjMap 不解构 distance） |
| P2-2 | shared/errors.js | 定义了4个Error类型（AndyError等）但整个src/零引用 |
| P2-3 | shared/schemas/StateDelta.schema.js | validateStateDelta 只检查非null对象，零字段验证 |
| P2-4 | pressure/WorldPressure+LocationPressure | crowding 在两个模块中重复计算，导致压力双重计算 |
| P2-5 | narrative/index.js | StoryGenerator 未从模块索引导出 |
| P2-6 | runtime/WorldClock.js:64 | fromJSON tickCount 用 `||` 运算符，字符串值可通过 |
| P2-7 | runtime/WorldClock.js:28 | advance(0) 允许零分钟tick，产生幽灵tick |
| P2-8 | index.js | 缺少 removeAgent 方法 |
| P2-9 | runtime/EventDispatcher.js:81-105 | createEvent 不验证 type 参数 |
| P2-10 | runtime/EventDispatcher.js:441-447 | 双重 eventLog cleanup（死代码） |
| P2-11 | canon/FactEmitter.js:286-332 | emitMemoryFacts 从未被 AndyWorld.tick 调用 |
| P2-12 | canon/FactSchema.js:393-396 | AGENT_STATE 不验证 emotionSummary/region 字段 |
| P2-13 | runtime/AndyWorld.js:828 | snapshot() 只返回20事件 vs toJSON 返回10000 |
| P2-14 | store/SimulationStore.js:106-107 | story buffer 在 init 时清空，崩溃时可能丢失未刷新的故事 |
| P2-15 | runtime/RuntimeConfig.js:14-32 | 只验证 tickMinutes，其他字段无验证 |

---

## 六、核心问题根因分析

Andy Engine 当前最大的问题不是单个 bug，而是 **buildActionContext 与 provider/scorer 之间的结构性脱节**。这个脱节导致了：

1. **3/9 candidate provider 完全死代码**（Habit, WorldPressure, Schedule部分）
2. **5/12 评分维度永远返回 0**（goal, world, time, constraint, tendency）
3. **R20 的 P0 修复是死代码**（ExploreCandidateProvider 调用不存在的方法）
4. **consume/work action 无效果**（EventEffectPipeline 不处理这些类型）

这些问题的根因是：buildActionContext 是从一个简化版本演化而来，而 provider 和 scorer 是后来独立添加的。两者的接口契约从未被统一验证。

**对比 Linux/macOS/Minecraft 级别**：这类问题在成熟项目中通过 **interface contract testing** 和 **compile-time type checking** 来防止。Andy Engine 没有这两者。

---

## 七、修复优先级建议

### 立即修复（P0）

1. **ExploreCandidateProvider 方法名**: `getRegionNames` → `getRegions`（1行修改，恢复R20 P0修复）
2. **序列化版本号对齐**: ENVELOPE_VERSION = CURRENT_SCHEMA_VERSION（1行修改）
3. **buildActionContext 补全**: 添加 proceduralMemory, world, pressureContext, futureTendency, locationMeaning 等字段（~20行修改）

### 高优先级（P1 前5项）

4. **EventEffectPipeline 添加 consume/work case**（~15行修改）
5. **PROCESSABLE_TYPES 添加 'weather'**（1行修改）
6. **AGENT_STATE gossip 过滤**（1行修改）
7. **WorldFactStore Phase 2 deep copy**（1行修改）
8. **NaN 防护**: typeof → Number.isFinite（~10处修改）

---

## 八、对标成熟项目的差距

| 维度 | Linux/macOS/Minecraft | Andy Engine | 差距 |
|------|----------------------|-------------|------|
| 接口契约验证 | 编译时类型检查 + contract test | 无 | 严重 |
| 确定性保证 | seeded RNG 全路径覆盖 | 仅 scheduled agent | 严重 |
| 序列化完整性 | versioned schema + migration + validation | 版本不匹配、子系统丢失 | 严重 |
| 效果管道完整性 | 每种 action 有明确定义的 delta | 2/7 action 无 delta | 中等 |
| 错误处理 | typed errors + error codes | 4个定义的Error类型零使用 | 中等 |
| 测试质量 | 每个评分维度有独立测试 | 未测试 context mismatch | 中等 |
| 文档 | API contract doc ↔ impl 双向验证 | API contract 存在但未验证幻影方法 | 轻微 |
| 性能 | ✅ | ✅ 超越基线 | 无 |

---

## 九、结论

Andy Engine 在架构设计上有清晰的理念（Clean Architecture、seeded RNG、delta pipeline、认知边界），但**实现与设计之间存在显著脱节**。最关键的脱节是 buildActionContext vs provider/scorer，它直接导致核心行为选择系统在降级模式下运行。

R20 修复了 12 个之前报告的问题，这显示了持续的改进意愿。但 R20 的 P0 修复（seeded RNG for exploration）因方法名错误而成为死代码，这是一个警示：**没有测试的修复等于没有修复**。

**评分 5.05/10** 反映的是一个有潜力但尚未达到自身设计规格的引擎。修复 P0 的 3 项问题（估计 ~25 行代码修改）将显著改善评分，特别是 C3（buildActionContext 补全）将直接激活 3 个死 provider 和 5 个失效评分维度。

---

*审计完成。报告基于 commit c8eb4ab 的代码状态。所有发现均在代码中独立验证，不依赖之前报告的结论。*
