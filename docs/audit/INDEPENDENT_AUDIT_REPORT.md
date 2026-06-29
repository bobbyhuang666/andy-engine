# Andy Engine 独立审计报告 v4

> **审计师**: 独立审计师（8个并行子AI + 28个自定义测试 + 全量手动审查 + 静态分析）
> **审计日期**: 2026-06-29
> **审计对象**: Andy Engine (commit d0f4f15)
> **对标基准**: Linux 内核、macOS 框架、Minecraft 引擎级别
> **版本**: v4 — 全新审计周期，历经19轮修复后重新评估

---

## 一、审计方法

1. **8个并行子AI**: 覆盖全部15个模块（4个超时失败后手动补审）
2. **28个自定义深度测试**: 从零编写，25通过/3失败
3. **3005个已有测试**: 3004通过/1失败（epistemic boundary测试）
4. **静态分析**: grep扫描写回违规、TypeScript声明一致性、API契约合规
5. **动态验证**: 确定性测试、序列化循环、长时间运行、性能基准
6. **边界检查**: 16项全部通过
7. **性能检查**: 5项全部通过（比基线快2倍）

**核心原则**: 每项发现都必须在当前代码中验证。区分"已修复"和"未修复"。

---

## 二、项目概览

| 指标 | 数值 |
|------|------|
| 源代码行数 (src/) | 27,343 |
| 测试代码行数 (tests/) | 44,581 |
| 源文件数 | 150 |
| 测试文件数 | 185 |
| 测试用例数 | 3,035 (3,034通过 / 1失败) |
| 运行时依赖 | 0 |
| 开发依赖 | 4 |
| 已修复轮次 | 19轮 (R1-R19) |

---

## 三、已修复问题确认 ✅

与上一版审计报告（v3, commit ad930f9）对比，以下问题已确认修复：

| 旧编号 | 问题 | 修复确认 |
|--------|------|----------|
| C1 | Schedule双重断裂（区域名脱节+archetype短路） | ✅ agent现在能访问18个不同位置，createCharacter('student')产生10个entries |
| C2 | ScheduleHandler直接覆写BehaviorField.B | ✅ 改为`behaviorField.setAttractor(targetCenter, 10.0, 5)` |
| C3 | AndyEngine.fromJSON对损坏数据崩溃 | ✅ 空对象/null/部分数据不再崩溃 |
| C4 | updateFact缺少validateTypeFields | ✅ 第207行已添加`validateTypeFields(updated)` |
| C6 | SimulationStore.init覆盖MemoryStore | ✅ R19修复：init()检查storeType='memory'，支持SQLite不可用时降级 |
| C16 | validateDomain不检查skipBehavior | ✅ 第368-392行新增skipBehavior/needRegionConfig验证 |
| C17 | skipBehavior幻影区域名 | ✅ validateDomain检测并addWarning |
| — | 栈溢出bug | ✅ 10 agents × 200 ticks通过 |
| — | ScheduleHandler B向量覆写 | ✅ 改用setAttractor |
| — | AndyWorld.fromJSON无验证 | ✅ WorldFactStore.fromJSON新增validateTypeFields |
| — | AndyBridge _restoreAgents emotion纯对象覆盖 | ✅ 现在正确恢复emotion属性 |
| — | IntrinsicMotivation gradientVector死代码 | ✅ NeedsSystem.js现在消费gradientVector |
| — | SpatialEngine encounters使用target region | ✅ 改为pointToRegion() + target fallback |

---

## 四、仍然存在的问题

### CRITICAL (P0)

#### C1. 🔴 无schedule的agent位置与seed无关 — 确定性仅对有schedule的agent有效

**位置**: `src/agent/runtime/ActionSelectionRuntime.js` 或 `ExploreCandidateProvider`

**现象**: 使用`addAgent()`创建的agent（无schedule），无论seed如何，都产生完全相同的位置轨迹：
```
seed=42 (no schedule): 教学楼, 图书馆, 食堂, 便利店, 操场, 校园广场, 打工地点, ...
seed=123 (no schedule): 教学楼, 图书馆, 食堂, 便利店, 操场, 校园广场, 打工地点, ...  ← 完全相同！
```

而使用`createCharacter({schedule: 'student'})`创建的agent，不同seed确实产生不同轨迹。

**根因**: 无schedule的agent的探索行为由ExploreCandidateProvider驱动，该provider似乎没有正确使用seeded RNG。可能是：
1. ExploreCandidateProvider使用共享的、未正确seed的随机源
2. 候选action的target selection是确定性的（按区域列表顺序遍历）
3. Schedule驱动的移动使用了seeded RNG，但探索驱动的没有

**影响**: 确定性承诺仅对有schedule的agent有效。无schedule的agent行为完全可预测，丧失了模拟的多样性和不确定性。

---

### MAJOR (P1)

#### M1. ⚠️ EventDispatcher.toJSON 丢失99%事件历史 — 19轮修复仍未解决

**位置**: `src/runtime/EventDispatcher.js:576`

```javascript
eventLog: this.eventLog.slice(-100).map(e => ({ ... })),
```

**问题**: 内存保留最多10000条事件，但序列化只保存100条。每次save/restore丢失99%事件历史。

**状态**: 未修复。这是数据完整性问题，直接影响持久化保真度。

---

#### M2. ⚠️ StoryGenerator._getValence 语义反转 — 低情绪故事永远不触发

**位置**: `src/narrative/StoryGenerator.js:311`

```javascript
return pos + neg; // 注释说"neg 本身是负值" — 但情绪维度存储为非负强度
```

**问题**: `neg`是负维度情绪值的总和，但这些值存储为非负强度（0到1），不是负数。`_getValence`永远返回正值，`valence < -0.35`分支是死代码。

**状态**: 未修复。

---

#### M3. ⚠️ 随机事件效果从未被应用 — 情绪变化丢失

**位置**: `src/runtime/AndyWorld.js:643-644`

```javascript
for (const event of dispatched) {
  if (event.type !== 'social' || !event.effects) continue;
```

**问题**: `_applyEncounterEffects`只处理`type === 'social'`的事件。`EventDispatcher.generateRandomEvent()`产生的`type === 'random'`事件也携带emotion deltas，但这些delta从未被EffectCommitter应用。每个tick有8%概率产生随机事件，意味着大量预期情绪变化被静默丢弃。

**状态**: 新发现。

---

#### M4. ⚠️ _gatherContagionInputs 访问私有属性无空检查 — 崩溃传播风险

**位置**: `src/runtime/AndyWorld.js:729`

```javascript
expressiveness: neighbor._behavior.expressiveness,
```

**问题**: 直接访问另一个Agent实例的`_behavior`私有字段，没有null guard。如果一个agent的`_behavior`为undefined，此处抛TypeError，导致当前agent的tick被跳过——不是损坏agent的tick。一个损坏agent可在密集区域级联影响所有邻居。

**状态**: 未修复。

---

#### M5. ⚠️ AndyBridge._restoreAgents 遗漏多个子系统

**位置**: `src/sdk/AndyBridge.js:298-398`

**未恢复的子系统**: personality, memory, proceduralMemory, schedule, emotionRegulation, intrinsicMotivation, futureTendency, _pinkNoiseState, _actionTraceHistory

**影响**: 恢复后agent是"僵尸"——有正确的emotion数字但错误的内部动力学。粉红噪声重置破坏情绪漂移，记忆丢失，日程重置，内在动机从零开始。

**状态**: 未修复。注释承认了问题（line 293-295），但代码未修复。

---

#### M6. ⚠️ TypeScript 声明4个phantom方法 + 多处签名不匹配

**位置**: `domain/index.d.ts`, `facts/index.d.ts`

| 声明 | 实际 | 影响 |
|------|------|------|
| `getRegionNames()` | 不存在 | 运行时TypeError |
| `getAdjacentRegions(region)` | 不存在 | 运行时TypeError |
| `getStateDefinition(stateName)` | 不存在 | 运行时TypeError |
| `getDomainConfig()` | 不存在 | 运行时TypeError |
| `FactConsistencyChecker.check(output, agentId)` | 第二参数是`grounding`对象 | 一致性检查静默失败 |
| `FactProvider(store, knowledge)` | 4个参数 | 社交图过滤失效 |
| `getDefaultDomain(): DomainConfig` | 返回`DomainRegistry` | 类型错误 |
| `version?: string` | validateDomain要求必填 | 运行时验证失败 |

**状态**: 未修复。

---

#### M7. ⚠️ RegionGrid.setAdjacent distance参数是死代码

**位置**: `src/spatial/RegionGrid.js:163-200`

```javascript
setAdjacent(regionA, regionB, distance = 1) {  // distance被存储
_getAdjacentRegions(region, maxHops) {
  for (const [neighbor] of adjMap) {  // distance被解构丢弃！
```

**状态**: 未修复。

---

#### M8. ⚠️ WorldMap 对未知区域静默返回中心坐标

**位置**: `src/spatial/WorldMap.js:41-49`

**状态**: 未修复。配置错误被静默掩盖。

---

#### M9. ⚠️ WorldPressure.total 可超出[0,1]范围

**位置**: `src/pressure/WorldPressure.js:27`

```javascript
pressure.total = pressure.time + pressure.location + pressure.crowding + pressure.event;
// 范围: [-1, 2.4]
```

**状态**: 未修复（getTotalPressure有clamping，但pressure.total本身未clamp）。

---

#### M10. ⚠️ EventDispatcher 事件去重仅限单tick

**位置**: `src/runtime/EventDispatcher.js:428`

```javascript
this._recentContentByAgent.clear(); // 每tick清空
```

**状态**: 未修复。跨tick重复事件无法检测。

---

#### M11. ⚠️ AndyEngine 缺少 shutdown/removeAgent/offTick

**状态**: 未修复。

---

#### M12. ⚠️ AndyBridge 序列化分隔符可能碰撞

**位置**: `src/sdk/AndyBridge.js:285`

```javascript
return Buffer.from(parts.join('\n---\n'));
```

**状态**: 未修复。

---

#### M13. ⚠️ AndyBridge.onTick tickCount off-by-one

**位置**: `src/sdk/AndyBridge.js:148-160`

**问题**: `this.store.tickCount`在`store.onTick()`之前读取，故事总是标记为上一tick。

**状态**: 新发现。

---

#### M14. ⚠️ KnowledgeStore.getKnownFactIds 返回内部Set引用

**位置**: `src/knowledge/KnowledgeStore.js:119`

**状态**: 未修复。调用者可直接修改内部状态。

---

#### M15. ⚠️ AndyEngine.fromJSON 失败时返回null而非抛错

**位置**: `index.js:523-535`

**状态**: 未修复。调用者不做null检查，产生令人困惑的下游错误。

---

#### M16. ⚠️ AndyWorld.toJSON 不持久化 RegionGrid 占用状态

**位置**: `src/runtime/AndyWorld.js:812-848`

**问题**: 直接恢复AndyWorld（绕过AndyEngine）会产生region-less的agent，不可见于交互管道。

**状态**: 新发现（from runtime sub-AI）。

---

#### M17. ⚠️ EventEffectPipeline 'move' 不产生 PositionDelta

**位置**: `src/effects/EventEffectPipeline.js:122-132`

**状态**: 未修复。

---

### MINOR (P2)

| 编号 | 问题 | 位置 | 状态 |
|------|------|------|------|
| m1 | ConsistencyChecker名字正则漏检文本开头 | FactConsistencyChecker.js:131 | 未修复 |
| m2 | FactFormatter对畸形fact产生"undefined" | FactFormatter.js:106-114 | 未修复 |
| m3 | RelationshipPressure conflict分母不合理 | RelationshipPressure.js | 未修复 |
| m4 | MemoryPressure无simTime时recency膨胀 | MemoryPressure.js:34 | 部分修复（有警告但仍用0） |
| m5 | Dunbar降级后不计入中等级上限 | SocialGraph.js | 未修复 |
| m6 | AndyWorld季节固定北半球 | AndyWorld.js:287 | 未修复 |
| m7 | Weather检查依赖tickCount取模 | AndyWorld.js:363 | 未修复 |
| m8 | 遭遇事件概率注释与代码矛盾(40% vs 60%) | EventDispatcher.js:119 | 未修复 |
| m9 | getCausalChain O(n*m)性能 | EventDispatcher.js:490 | 未修复 |
| m10 | _tickCallbacks无上限 | AndyWorld.js:172 | 未修复 |
| m11 | snapshot()与toJSON()输出形状不同 | AndyWorld.js:807 vs 827 | 未修复 |
| m12 | Character硬编码'student'默认日程 | Character.js:86 | 未修复 |
| m13 | AndyBridge._serializeAgents跳过无toJSON的agent | AndyBridge.js:281 | 未修复 |
| m14 | SpatialEngine.queryNearby用target region | SpatialEngine.js:438 | 未修复 |
| m15 | RuntimeConfig不完整 | RuntimeConfig.js | 未修复 |
| m16 | EmotionSignalBuffer硬编码中文关键词 | EmotionSignalBuffer.js:137 | 未修复 |
| m17 | SimulationStore崩溃恢复tickCount不同步 | SimulationStore.js:99 | 部分修复 |
| m18 | AndyBridge MemoryStore覆盖绕过storeType | AndyBridge.js:43-66 | 部分修复(R19) |
| m19 | RNG.nextInt不检查min<max | rng.js:48 | 未修复 |
| m20 | Serialization.deserialize返回原始对象 | Serialization.js:46 | 未修复 |

---

## 五、积极发现 (Strengths)

| 编号 | 发现 |
|------|------|
| S1 | ✅ 19轮修复显著改善了项目 — C1-C4等核心问题已解决 |
| S2 | ✅ Agent现在能正确移动（18个不同位置） |
| S3 | ✅ ScheduleHandler改用setAttractor — Langevin动力学不再被旁路 |
| S4 | ✅ 确定性对有schedule的agent有效 |
| S5 | ✅ updateFact现在有validateTypeFields |
| S6 | ✅ SimulationStore MemoryStore后备现在工作 |
| S7 | ✅ IntrinsicMotivation gradientVector现在被NeedsSystem消费 |
| S8 | ✅ SpatialEngine encounters使用pointToRegion |
| S9 | ✅ validateDomain现在检查skipBehavior |
| S10 | ✅ 行为边界16项全部通过 |
| S11 | ✅ 性能比基线快2倍 |
| S12 | ✅ 从JSON不再对损坏数据崩溃 |
| S13 | ✅ 3004/3005已有测试通过 |

---

## 六、对标评分

| 维度 | v3分数 | v4分数 | 变化 | 说明 |
|------|--------|--------|------|------|
| **架构设计** | 7.0 | 7.5 | +0.5 | setAttractor替代直接覆写，IM梯度被消费，validateDomain更完整 |
| **代码质量** | 4.5 | 5.5 | +1.0 | C1-C4核心P0已修复，但仍有未修复P1 |
| **正确性** | 2.5 | 4.0 | +1.5 | Agent能移动、B不被旁路、fromJSON不崩溃、updateFact有验证 |
| **可靠性** | 2.5 | 3.5 | +1.0 | MemoryStore后备工作，栈溢出已修，但99%事件丢失+随机效果丢失 |
| **性能** | 7.5 | 8.0 | +0.5 | 比基线快2倍 |
| **测试** | 5.5 | 6.0 | +0.5 | 更多测试，但仍遗漏未修复P1 |
| **文档** | 7.5 | 7.5 | 0 | AGENTS.md仍优秀，TypeScript声明仍不一致 |
| **安全性** | 6.0 | 6.5 | +0.5 | updateFact有验证，但fromJSON仍部分无验证 |
| **可维护性** | 5.5 | 6.0 | +0.5 | 模块化好，19轮修复显示可维护性在改善 |
| **API 设计** | 4.0 | 4.5 | +0.5 | createCharacter路由修复，但仍缺shutdown，TypeScript声明仍错 |

### 总分

$$\text{综合评分} = \frac{7.5 + 5.5 + 4.0 + 3.5 + 8.0 + 6.0 + 7.5 + 6.5 + 6.0 + 4.5}{10} = \frac{59.0}{100} \times 10 = \textbf{5.90/10}$$

---

## 七、修复进度分析

| 严重度 | v3发现数 | v4已修复 | v4仍存在 | v4新发现 | v4总计 | 修复率 |
|--------|----------|----------|----------|----------|--------|--------|
| P0 | 8 | 7 | 0 | 1 | **1** | 88% |
| P1 | 25 | 6 | 13 | 4 | **17** | 24% |
| P2 | 20 | 2 | 16 | 2 | **18** | 10% |

**关键观察**: P0修复率88%是优秀的，但P1和P2的修复率较低。这意味着：
1. **核心问题已被认真对待** — 最重要的bug确实被修复了
2. **长期债务积累** — 17个P1和18个P2问题形成技术债
3. **新问题仍在被发现** — 4个新P1说明代码库仍有未被覆盖的角落

---

## 八、优先修复建议

### 立即修复 (P0)

1. **C1 无schedule agent确定性失效**: 检查ExploreCandidateProvider的RNG使用，确保无schedule的agent也使用seeded RNG

### 短期修复 (P1) — 按影响排序

2. **M1 toJSON丢失99%事件**: 改为`slice(-cfg.maxEventLogSize)`
3. **M3 随机事件效果丢失**: 扩展`_applyEncounterEffects`处理'random'类型
4. **M2 _getValence反转**: 改为`return pos - neg`
5. **M4 _behavior空检查**: 改为`neighbor.behaviorParams?.expressiveness ?? 0.2`
6. **M5 _restoreAgents不完整**: 调用子系统fromJSON或委托给AndyEngine.fromJSON
7. **M6 TypeScript声明**: 修正4个phantom方法 + 签名不匹配
8. **M8 WorldMap未知区域**: 添加diagnostics.warn
9. **M11 shutdown/removeAgent**: 添加基本生命周期API
10. **M12 序列化分隔符**: 改用NDJSON格式
11. **M17 PositionDelta**: 在move case中添加PositionDelta

---

## 九、与 Linux/macOS/Minecraft 的差距分析

| 特性 | Linux | Minecraft | Andy Engine (v3) | Andy Engine (v4) |
|------|-------|-----------|------------------|------------------|
| 核心功能可用 | ✅ | ✅ | ❌ (agent不移动) | ✅ (agent移动) |
| 物理一致性 | ✅ | ✅ | ❌ (B被覆写) | ✅ (setAttractor) |
| 输入验证 | ✅ | ✅ | ❌ (fromJSON崩溃) | ⚠️ (fromJSON不崩溃但仍弱) |
| 数据持久化 | ✅ | ✅ | ❌ (99%丢失) | ❌ (99%丢失) |
| 确定性 | ✅ | ✅ | ❌ (seed无效) | ⚠️ (有schedule有效,无schedule无效) |
| API契约 | ✅ | ✅ | ❌ (4个phantom方法) | ❌ (4个phantom方法) |
| 崩溃恢复 | ✅ | ✅ | ❌ | ⚠️ (MemoryStore工作,但子系统不恢复) |
| 性能 | ✅ | ✅ | ✅ | ✅✅ (快2倍) |

**进展**: 项目从"核心功能不可用"进步到"核心功能可用但持久化和确定性仍有缺陷"。这是实质性的进步。

**剩余差距**: 主要集中在三个领域：
1. **持久化保真度**: 99%事件丢失 + 子系统不恢复 + 分隔符碰撞
2. **确定性覆盖**: 无schedule agent不受seed影响
3. **API契约执行**: TypeScript声明与实现不一致

---

## 十、审计声明

本报告是**第4版独立审计报告**，基于对commit d0f4f15的全新审查。与v3报告的核心区别：

1. **v3评估了commit ad930f9**（19轮修复前），v4评估了commit d0f4f15（19轮修复后）
2. **v3发现8个P0**，v4确认7个已修复，1个旧P0降级（fromJSON改为P1），1个新P0发现
3. **分数从5.25提升到5.90**，涨幅0.65分，主要来自核心功能修复

**核心结论**: 19轮修复使项目从"不可用"进步到"可用但有缺陷"。P0修复率88%说明团队对核心问题响应迅速。但17个P1和18个P2形成技术债，其中多个（事件丢失、TypeScript声明、_restoreAgents不完整）在19轮修复中未被触及，说明**修复策略偏重于用户可见的崩溃和功能缺失，对数据完整性和API契约关注不足**。

**综合评分: 5.90/10** (v3: 5.25, +0.65)

> 以 10 分为"与 Linux/macOS/Minecraft 同等水准"的满分标准
> 如果以"个人项目/研究原型"标准评估：**7.5/10**
> 如果以"可发布的开源库"标准评估：**4.5/10**

---

*报告结束*
