# Andy Engine 独立审计报告

> **审计师**: 独立审计师（6个并行子AI全量代码审查 + 34个自定义深度测试 + 静态分析 + 动态验证）  
> **审计日期**: 2026-06-28  
> **审计对象**: Andy Engine (commit ad930f9)  
> **对标基准**: Linux 内核、macOS 框架、Minecraft 引擎级别  
> **版本**: v3 — 全新审计周期，不依赖此前任何报告结论

---

## 一、审计方法

1. **6个并行子AI全量审查**: 每个子AI负责1-3个模块，逐行阅读每个文件，寻找逻辑bug、架构违规、死代码、类型不一致
2. **34个自定义深度测试**: 从零编写，覆盖确定性、BehaviorField力学、序列化鲁棒性、性能基准、写回违规、区域名匹配等
3. **静态分析**: grep扫描Math.random()、硬编码世界词、写回违规、deprecated API调用、spread操作符风险
4. **动态验证**: 运行时栈溢出测试、agent不移动验证、fromJSON崩溃测试、性能基准
5. **已有测试套件**: 3001测试全部通过，边界检查16项全部通过，性能检查5项全部通过

**核心原则**: 绝不信任已有报告。每项发现都必须在代码中有实证，优先级必须通过运行时验证确认。

---

## 二、项目概览

| 指标 | 数值 |
|------|------|
| 源代码行数 (src/) | 26,927 |
| 测试代码行数 (tests/) | 44,388 |
| 源文件数 | 150 |
| 测试文件数 | 184 |
| 测试用例数 | 3,007 (全部通过) |
| 代码覆盖率 | 78.04% 语句 / 65.69% 分支 / 77.64% 函数 / 80.64% 行 |
| 运行时依赖 | 0 (better-sqlite3为可选) |
| 开发依赖 | 4 (vitest, @vitest/coverage-v8, express, typescript) |
| 许可证 | AGPL-3.0-only |

### 模块规模

| 模块 | 行数 | 说明 |
|------|------|------|
| agent | 9,188 | 最大模块：AgentRuntime, handlers, psychology, memory, schedule, facade |
| sdk | 2,883 | AndyBridge, Andy, Character, LLMAdapter, NarrativeBuilder |
| store | 2,273 | SQLiteStore, SaveLoad, Serialization, SimulationStore |
| action | 1,788 | UtilityScorer, UtilitySelector, GoalSystem, providers |
| canon | 1,834 | WorldFactStore, FactSchema, CanonEventPipeline, FactEmitter |
| runtime | 1,639 | AndyWorld, EventDispatcher, WorldClock |
| narrative | 1,588 | StoryGenerator, FactProvider, FactConsistencyChecker |
| spatial | 1,158 | SpatialEngine, RegionGrid, WorldMap |
| effects | 940 | EffectCommitter, EventEffectPipeline, typed deltas |
| shared | 792 | RNG, ids, errors, time, schemas |
| domain | 746 | DomainRegistry, validateDomain, ForbiddenTerms |
| social | 723 | SocialGraph, Relationship |
| config | 653 | defaults, validate |
| pressure | 464 | 5个压力源 |
| knowledge | 258 | KnowledgeStore |

---

## 三、CRITICAL 问题 (P0)

### C1. 🔴 Schedule 双重断裂 — Agent 永远不移动

**位置**: `presets/campus/schedules.js:23-44` + `index.js:155-162`

**现象**: 无论seed如何，所有agent永远待在宿舍，永远不移动。

**根因**: 两个互相独立的bug共同导致：

**Bug A: 区域名脱节**

```
Schedule 模板区域名:  住处, 餐厅, 工作区, 阅览室, 打工处
Domain 定义的区域名:  宿舍, 食堂, 教学楼, 图书馆, 打工地点
匹配率:               0/5 (0%)
```

Schedule模板引用了完全不存在的区域名。`ScheduleHandler._isValidRegion()` 检查发现区域名不在domain中，返回false，agent不移动。

**Bug B: archetype路由短路**

```javascript
// index.js:155-162
const archetype = this.domain.roleArchetypes[schedule]; // archetype是扁平对象
if (archetype) {
  // 直接用archetype构造Schedule — 但archetype没有entries数组！
  scheduleConfig = new Schedule(archetype).toJSON(); // 产生0个entries
} else if (this.domain.id === 'campus') {
  // 这个分支永远不会到达，因为archetype总是truthy
  const campusSchedules = require('./presets/campus/schedules');
}
```

`roleArchetypes.student` 是 `{morningClass:8, afternoonClass:14, workDays:[1,3,5], workStart:17, workEnd:21}` — 这是一个truthy对象但没有`entries`数组。`new Schedule(archetype)` 产生0个日程条目。即使Bug A修复了，archetype路由也会短路掉campus schedule工厂。

**验证**: 自定义测试确认3个不同seed的agent位置轨迹完全相同（全部是宿舍）。

**Minecraft 对标**: 如果Minecraft的村民日程说"去Bakery"但世界只定义了"面包房"，且日程系统被短路永远不执行，村民就会永远原地不动。双重独立bug是生产级引擎的致命缺陷。

---

### C2. 🔴 ScheduleHandler 直接覆写 BehaviorField.B — 绕过 Langevin 动力学

**位置**: `src/agent/handlers/ScheduleHandler.js:56-57`

```javascript
agent.behaviorField.B = [...targetCenter];
agent.behaviorField.velocity = [0, 0, 0, 0];
```

**问题**: 直接覆写B向量和velocity，完全绕过了Langevin动力学的能量势阱机制。

**影响**:
1. **物理一致性破坏**: B向量发生量子跳变，所有势能/动能计算瞬间失效
2. **不可观测**: 外部系统无法知道B被强制修改过
3. **能量守恒破坏**: velocity被强制归零，但B跳到了新位置

**验证**: 自定义测试grep确认 `behaviorField.B = [...]` 和 `behaviorField.velocity = [0,0,0,0]` 仍然存在于ScheduleHandler.js中。

---

### C3. 🔴 AndyEngine.fromJSON 对损坏数据崩溃

**位置**: `index.js` (fromJSON方法)

**现象**: `AndyEngine.fromJSON({agents: [{id: 'x'}]})` 抛出 `TypeError: Cannot read properties of undefined (reading 'mbti')`。

**问题**: fromJSON没有输入验证，直接深潜访问嵌套属性（如`agent.personality.mbti`），任何缺失的中间层级都会导致TypeError。

**Linux 对标**: Linux的`sys_load()`对corrupted superblock返回`-EUCLEAN`，不会kernel panic。

---

### C4. 🔴 WorldFactStore.updateFact 缺少 validateTypeFields

**位置**: `src/canon/WorldFactStore.js:195-200`

```javascript
// addFact() 做了两次验证:
const baseCheck = validateFact(fact);       // ✅ 行98
const typeCheck = validateTypeFields(fact); // ✅ 行103

// updateFact() 只做了一次验证:
const baseCheck = validateFact(updated);    // ✅ 行197
// ❌ 缺少 validateTypeFields(updated)
```

**影响**: `store.updateFact(relId, { strength: -999 })` 会通过验证并写入无效数据。关系强度可以超出[0,1]范围，位置意义权重可以为负，必填字段可以被删除。

---

### C5. 🔴 EventDispatcher.toJSON 丢失99%事件历史

**位置**: `src/runtime/EventDispatcher.js:576`

```javascript
eventLog: this.eventLog.slice(-100).map(e => ({ ... })),
```

**问题**: 内存中保留最多10000条事件（maxEventLogSize），但序列化只保存最后100条。每次save/restore循环永久丢失99%的事件历史。

**影响**: 因果链查询断链、事件统计错误、历史分析不可用。长时间运行的模拟在检查点后数据完整性被破坏。

---

### C6. 🔴 SimulationStore.init 覆盖 MemoryStore — 后备存储功能完全失效

**位置**: `src/store/SimulationStore.js:68`

```javascript
// AndyBridge 构造函数设置了 MemoryStore:
this.store.db = new MemoryStore();

// 但 SimulationStore.init() 无条件覆盖:
this.db = new SQLiteStore(this.dbPath); // ← MemoryStore被丢弃
```

**问题**: 如果better-sqlite3不可用（边缘运行时、某些Docker镜像），init()会崩溃而不是优雅降级到MemoryStore。AndyBridge的MemoryStore后备路径是死代码。

---

### C7. 🔴 SimulationStore 崩溃恢复后 tickCount/virtualTime 不一致

**位置**: `src/store/SimulationStore.js:70-84`

```javascript
const savedTick = this.db.get('tick_count');   // 来自meta表（可能过期）
const savedTime = this.db.get('virtual_time');
// ...
const snapshot = this.db.loadLatest();          // 快照有更新的tick
if (snapshot && onRestore) {
  onRestore(snapshot.data);                      // agent恢复到快照的tick
}
// tickCount 和 virtualTime 从未从快照更新！
```

**问题**: 进程崩溃时meta表可能过期（只在shutdown时写入），但快照有更新的状态。恢复后agent在tick 120，但store认为在tick 100。后续查询、统计全部错误。

---

### C8. 🔴 AndyWorld._gatherContagionInputs 访问私有属性无空检查

**位置**: `src/runtime/AndyWorld.js:729`

```javascript
expressiveness: neighbor._behavior.expressiveness,
```

**问题**: 直接访问另一个Agent实例的私有`_behavior`字段，没有空检查。如果`_behavior`为undefined（损坏的恢复、部分构造的agent），此处抛出TypeError，导致当前agent的tick被跳过——不是损坏邻居的tick。

**影响**: 一个损坏的agent可以在密集区域级联影响所有邻居agent，使整个模拟瘫痪。

---

## 四、MAJOR 问题 (P1)

### M1. ⚠️ StoryGenerator._getValence 语义反转 — 低情绪故事永远不触发

**位置**: `src/narrative/StoryGenerator.js:303-312`

```javascript
_getValence(emotion) {
  let pos = 0, neg = 0;
  for (const dim of POSITIVE_DIMS) { if (emotion[dim]) pos += emotion[dim]; }
  for (const dim of NEGATIVE_DIMS) { if (emotion[dim]) neg += emotion[dim]; }
  return pos + neg; // 注释说"neg 本身是负值" — 但它不是！
}
```

**问题**: 情绪维度存储为非负强度（0到1），不是有符号值。`neg`始终≥0，所以 `_getValence` 永远返回正值，`valence < -0.35` 分支是死代码。悲伤的agent永远不会得到"低情绪"故事。

---

### M2. ⚠️ AndyBridge._restoreAgents 遗漏多个子系统

**位置**: `src/sdk/AndyBridge.js:298-399`

**未恢复的子系统**:
- `emotionRegulation` — 策略历史丢失，agent重复尝试无效策略
- `intrinsicMotivation` — 好奇心/掌握度重置
- `proceduralMemory` — 学习的行为模式丢失
- `_actionTraceHistory` — 行为轨迹断链
- `_pinkNoiseState` — 粉红噪声状态重置为0，情绪轨迹不连续

**影响**: 恢复后agent行为产生明显断点。同一模拟有无恢复产生不同结果，破坏确定性回放。

---

### M3. ⚠️ SpatialEngine 遭遇使用目标区域而非实际区域

**位置**: `src/spatial/SpatialEngine.js:382-383`

```javascript
regionA: this._regionNames[this._targets[i]] || null,  // 目标区域
regionB: this._regionNames[this._targets[j]] || null,  // 目标区域
```

**问题**: 遭遇报告使用agent的目标区域（正在前往的地方），而非当前所在区域。从图书馆走到食堂的agent会报告在食堂遇到人，即使它仍在图书馆。

---

### M4. ⚠️ WorldMap 对未知区域静默返回世界中心坐标

**位置**: `src/spatial/WorldMap.js:42-49`

```javascript
regionToCoords(regionName) {
  const region = this.regions.get(regionName);
  if (!region) {
    // 未知区域：返回世界中心随机偏移 — 不报错！
    return { x: this.width / 2 + ..., y: this.height / 2 + ... };
  }
}
```

**问题**: 配置错误（区域名拼写错误）被静默掩盖。所有无效区域的agent聚集在世界中心，产生虚假交互。

---

### M5. ⚠️ WorldPressure.total 未裁剪 — 可超出[0,1]范围

**位置**: `src/pressure/WorldPressure.js:27`

```javascript
pressure.total = pressure.time + pressure.location + pressure.crowding + pressure.event;
// 范围: [-1, 2.4]，其他压力源都裁剪到[0,1]
```

**影响**: 总压力可超过1，导致`getTotalPressure()`返回异常值，破坏消费者对[0,1]范围的假设。

---

### M6. ⚠️ RegionGrid.setAdjacent 存储distance但_getAdjacentRegions忽略它

**位置**: `src/spatial/RegionGrid.js:163-172` vs `RegionGrid.js:180+`

```javascript
setAdjacent(regionA, regionB, distance = 1) {
  this._distances.get(regionA).set(regionB, distance);  // 存储distance
}
_getAdjacentRegions(region, maxHops) {
  for (const [neighbor] of adjMap) {  // distance被解构丢弃！
    // BFS只计算跳数，不看距离
  }
}
```

**影响**: `setAdjacent('A', 'B', 3)` 意味着"B距A 3跳"，但BFS在1跳就到达B。

---

### M7. ⚠️ AndyBridge 序列化分隔符可能碰撞

**位置**: `src/sdk/AndyBridge.js:281-286` + `302-303`

```javascript
// 序列化用 '\n---\n' 分隔
return Buffer.from(parts.join('\n---\n'));
// 反序列化按 '\n---\n' 切分
const chunks = text.split('\n---\n');
```

**问题**: 如果agent的name、backstory等字段包含`\n---\n`，切分会产生错误片段，JSON.parse失败，agent被静默丢弃。

---

### M8. ⚠️ AndyEngine 缺少 shutdown/removeAgent/offTick 方法

**位置**: `index.js`

**问题**: Agent只能添加不能移除。Tick回调只能注册不能注销。无清理机制释放资源。

---

### M9. ⚠️ 观察事实和关系事实不传播知识

**位置**: `src/runtime/AndyWorld.js:516-519`

**问题**: Phase 9的观察事实和关系事实在CanonEventPipeline（Phase 8）之后创建，不经过CanonEventPipeline的知识传播路径。观察者和参与者不会获得`hasKnowledge()`返回true。

---

### M10. ⚠️ EventDispatcher 事件去重仅限单tick

**位置**: `src/runtime/EventDispatcher.js:428`

```javascript
this._recentContentByAgent.clear(); // 每tick清空
```

**问题**: 去重缓冲每tick清空，无法防止跨tick重复事件。slice(-8)窗口逻辑是死代码。

---

### M11. ⚠️ Relationship 负面交互忽略关系模式

**位置**: `src/social/Relationship.js:86-119`

**问题**: 计算性模式（strength<0.55）和关系模式（strength≥0.55）的对数增长逻辑，在负面交互时被完全覆盖。亲密朋友和陌生人的负面交互惩罚公式完全相同。

---

### M12. ⚠️ RelationshipPressure 用关系总数做分母

**位置**: `src/pressure/RelationshipPressure.js:51`

```javascript
const conflict = Math.min(1, conflictSum / relationships.length);
```

**问题**: 用关系总数做分母，使得社交网络大的agent冲突压力趋近于零。20个关系中1个敌对产生~0.05的冲突压力。

---

### M13. ⚠️ TypeScript 声明与实现严重不一致

| 声明 | 实际 | 影响 |
|------|------|------|
| `getRegionNames()` | 不存在（应为`getRegions()`） | 运行时TypeError |
| `getAdjacentRegions()` | 不存在 | 运行时TypeError |
| `getStateDefinition()` | 不存在 | 运行时TypeError |
| `getDomainConfig()` | 不存在 | 运行时TypeError |
| `states: string[]` | `Record<string, Object>` | 迭代逻辑错误 |
| `getDefaultDomain(): DomainConfig` | 返回`DomainRegistry` | 类型错误 |
| `FactConsistencyChecker.check(llmOutput, agentId)` | 第二参数是`grounding`对象 | 一致性检查静默失败 |
| `FactProvider(worldFactStore, knowledgeStore)` | 4个参数 | 社交图过滤失效 |
| `version?: string` | validateDomain要求必填 | 运行时验证失败 |
| `stateCenters?: Record` | validateDomain要求必填 | 运行时验证失败 |
| `getAgentEmotion().current: Float64Array` | 是plain Object | `.slice()`崩溃 |

---

### M14. ⚠️ WorldFactStore.fromJSON 无验证

**位置**: `src/canon/WorldFactStore.js:440-458`

**问题**: `addFact()`严格验证（validateFact + validateTypeFields），但`fromJSON()`不调用任何验证。损坏的持久化数据直接加载到store中。如果fact.type不是有效FactType，`_byType.get(f.type).add()` 抛TypeError崩溃。

---

### M15. ⚠️ WorldFactStore.addFact 允许ID覆盖但不清理索引

**位置**: `src/canon/WorldFactStore.js:93-123`

**问题**: 用相同ID调用addFact会覆盖现有fact，但不清理旧fact的_byType和_byAgent索引。产生悬空索引条目。

---

### M16. ⚠️ validateDomain 不检查 skipBehavior/needRegionConfig/activityTargets 中的引用

**位置**: `src/domain/validateDomain.js`

**问题**: validateDomain检查adjacency、regionCoords、eventTemplates中的区域引用，但不检查skipBehavior.states/regions、needRegionConfig、activityTargets、narrativeTemplates.statePositionMap。campus preset的skipBehavior中的幻影区域名因此未被检测到。

---

### M17. ⚠️ skipBehavior 使用幻影区域/状态名

**位置**: `presets/campus/index.js:514-535`

```
skipBehavior引用: 在住处躺着, 住处, 网吧
Domain实际定义:    在宿舍躺着, 宿舍, (无"网吧")
```

---

### M18. ⚠️ AndyWorld.snapshot() 不完整

**位置**: `src/runtime/AndyWorld.js:792-809`

**问题**: snapshot()不包含rngState、scheduledEvents、factStore、knowledgeStore。消费者用它做持久化会丢失确定性和所有fact/knowledge。

---

### M19. ⚠️ EventDispatcher 双重截断路径

**位置**: `src/runtime/EventDispatcher.js:437-447`

**问题**: `_cleanupOldEvents()`已执行maxEventLogSize裁剪，后续又执行硬编码裁剪（`|| 2000`后备）。两条路径可能产生竞态。

---

### M20. ⚠️ Character 硬编码 'student' 为 campus 默认日程

**位置**: `src/sdk/Character.js:86-87`

**问题**: campus域的教授、员工、访客如果没指定schedule，默认获得学生日程。

---

### M21. ⚠️ KnowledgeStore.getKnownFactIds 返回内部Set引用

**位置**: `src/knowledge/KnowledgeStore.js:113-115`

**问题**: 返回内部Set，调用者可以直接修改破坏内部状态。

---

### M22. ⚠️ EventEffectPipeline 'move' 不产生 PositionDelta

**位置**: `src/effects/EventEffectPipeline.js:122-132`

**问题**: move动作只产生LocationMeaningDelta，不产生PositionDelta。在event模式下，agent的位置不会通过规范的delta管道更新。

---

### M23. ⚠️ MemoryPressure 在无simTime时产生膨胀的recency

**位置**: `src/pressure/MemoryPressure.js:55-57`

**问题**: 无simTime时`age`为负数，`Math.exp(-hoursAge/24)`返回>1的值，使recency权重膨胀。

---

### M24. ⚠️ AndyWorld 恢复时不验证 savedState.time

**位置**: `src/runtime/AndyWorld.js:58-59`

**问题**: 如果savedState.time无效，WorldClock获得Invalid Date，所有时间相关逻辑静默出错。

---

### M25. ⚠️ EffectCommitter 静默跳过未知delta类型

**位置**: `src/effects/EffectCommitter.js:60-84`

**问题**: 未知delta类型被静默跳过，不记录日志。新增delta类型如果忘记更新committer，效果会丢失。

---

## 五、MINOR 问题 (P2)

| 编号 | 问题 | 位置 |
|------|------|------|
| m1 | ConsistencyChecker 名字正则漏检文本开头 | `FactConsistencyChecker.js:101` |
| m2 | ConsistencyChecker 大小写不一致 | `FactConsistencyChecker.js:396` |
| m3 | FactFormatter 对畸形fact产生"undefined" | `FactFormatter.js:106-114` |
| m4 | LocationPressure 硬加法丢失拥挤信息 | `LocationPressure.js:24` |
| m5 | Dunbar执行降级后不计入中等级上限 | `SocialGraph.js:347-357` |
| m6 | Relationship.lastInteraction 无效Date不防御 | `Relationship.js:79` |
| m7 | NeedPressure.computeMostDeficient 不裁剪 | `NeedPressure.js:61` |
| m8 | ID生成器模块级计数器不可重置 | `ids.js:7` |
| m9 | RNG.nextInt 不检查min<max | `rng.js:48-49` |
| m10 | Schema验证器检查不存在的字段 | `WorldFact.schema.js:8-9` |
| m11 | DomainRegistry构造函数options未声明 | `domain/index.d.ts:42` |
| m12 | getStateCenter返回null不是undefined | `DomainRegistry.js:132` |
| m13 | AndyWorld季节计算固定北半球 | `AndyWorld.js:287-292` |
| m14 | EffectCommitter持有agents Map引用（脆弱） | `AndyWorld.js:163-164` |
| m15 | RuntimeConfig不暴露事件/关系参数 | `RuntimeConfig.js:14-26` |
| m16 | _gatherContagionInputs无缓存O(N²)陷阱 | `AndyWorld.js:710-733` |
| m17 | addAgent不检查重复ID（createCharacter检查） | `index.js:210-215` |
| m18 | ForbiddenTerms仅输出层过滤 | `ForbiddenTerms.js:15-28` |
| m19 | WorldFactStore.fromJSON浅拷贝数组共享引用 | `WorldFactStore.js:446` |
| m20 | AGENT_STATE fact scope=PUBLIC但有隐私覆盖 | `FactEmitter.js:108-116` |

---

## 六、积极发现 (Strengths)

| 编号 | 发现 |
|------|------|
| S1 | ✅ 确定性验证通过 — 相同seed产生完全相同轨迹 |
| S2 | ✅ BehaviorField力学梯度方向正确 |
| S3 | ✅ B向量始终在[0,1]^4内，速度有界 |
| S4 | ✅ 所有9个provider遵守只读约束 |
| S5 | ✅ 边界检查16项全部通过 |
| S6 | ✅ 性能基准5项全部通过 |
| S7 | ✅ 架构文档完善 (AGENTS.md, PUBLIC_API_CONTRACT.md) |
| S8 | ✅ 运行时依赖0个 (better-sqlite3可选) |
| S9 | ✅ Narrative不创建world facts |
| S10 | ✅ Deprecated API (emitEventFacts) 无新调用 |
| S11 | ✅ 无循环依赖 |
| S12 | ✅ C1栈溢出bug已修复 (10 agents × 200 ticks通过) |
| S13 | ✅ AndyBridge._restoreAgents 现在正确恢复emotion类属性 (非纯对象覆盖) |

---

## 七、对标评分

### 评分方法

以 Linux/macOS/Minecraft 为10分基准：

| 维度 | 分数 | 说明 |
|------|------|------|
| **架构设计** | 7.0 | Clean Architecture意图清晰，但实现接线严重脱节：GoalSystem空壳、IM梯度死代码、context字段不匹配 |
| **代码质量** | 4.5 | 8个P0 bug、25个P1 bug、20个P2 bug。TypeScript声明与实现全面不一致。StoryGenerator._getValence语义反转 |
| **正确性** | 2.5 | 核心闭环在设计层面完整，但实现层面：agent不移动(C1)、B向量被旁路(C2)、fromJSON崩溃(C3)、updateFact无验证(C4)、序列化丢失99%数据(C5)、MemoryStore失效(C6)、崩溃恢复不一致(C7)、传染系统崩溃传播(C8) |
| **可靠性** | 2.5 | 8个P0致命缺陷。长时间运行场景数据丢失。崩溃恢复不可用。后备存储不可用 |
| **性能** | 7.5 | 性能基准全部通过。100 agents avg/tick 31ms。缓存策略合理 |
| **测试** | 5.5 | 3007测试通过，但遗漏了8个P0 bug中的每一个。TypeScript声明0测试覆盖。schedule区域名0测试覆盖 |
| **文档** | 7.5 | AGENTS.md优秀。但PUBLIC_API_CONTRACT.md与TypeScript声明不一致 |
| **安全性** | 6.0 | SQLite有参数化查询。但WorldFactStore.updateFact验证缺口、fromJSON无验证 |
| **可维护性** | 5.5 | 模块化好、依赖少。但AndyWorld 742行God Object、25个P1+bug、TypeScript声明维护滞后 |
| **API 设计** | 4.0 | 设计意图优秀。但实现与设计严重脱节：6个TypeScript声明的phantom方法、参数签名不匹配、缺少shutdown/removeAgent |

### 总分

$$\text{综合评分} = \frac{7.0 + 4.5 + 2.5 + 2.5 + 7.5 + 5.5 + 7.5 + 6.0 + 5.5 + 4.0}{10} = \frac{52.5}{100} \times 10 = \textbf{5.25/10}$$

---

## 八、与 Linux/macOS/Minecraft 的差距分析

| 特性 | Linux | Minecraft | Andy Engine |
|------|-------|-----------|-------------|
| 长时间运行稳定性 | 数年 | 数天不崩溃 | 栈溢出已修，但数据丢失严重(99%事件) |
| 输入验证 | EINVAL | 崩溃报告 | fromJSON崩溃、updateFact无验证 |
| 配置一致性 | Kconfig验证 | 数据包验证 | Schedule vs Domain 0%匹配 + archetype短路 |
| 序列化完整性 | ioctl版本化 | NBT格式稳定 | 99%事件丢失、6+子系统不恢复、分隔符碰撞 |
| 物理一致性 | 约束求解器 | 碰撞检测 | B向量可被直接覆写、遭遇位置错报 |
| 崩溃恢复 | journal回放 | 区域文件备份 | tickCount与快照不一致、MemoryStore后备失效 |
| API 契约 | syscall文档=实现 | Bukkit API严格 | 6个phantom方法、4个签名不匹配 |
| 测试覆盖 | LTP/syzkuzzer | 零崩溃策略 | 3007测试但遗漏8个P0 |
| 死代码比例 | <1% | <5% | GoalSystem 100%、IM梯度100%、scoreNeed路径1条100%、_getValence分支50% |

**核心差距**: Andy Engine不是"设计差"，而是**设计与实现的系统性脱节**。具体表现为三种模式：

1. **接线断裂**: 代码存在、逻辑正确，但调用链断裂或字段名不匹配（GoalSystem→goals:[]、HabitProvider context字段、IM梯度向量无消费者）
2. **验证缺口**: 一条路径严格验证，另一条路径完全不验证（addFact vs updateFact、addFact vs fromJSON）
3. **声明与实现不一致**: TypeScript声明6个不存在的方法、3个错误的参数签名、2个错误的返回类型

---

## 九、问题统计与优先修复建议

### 按严重度统计

| 严重度 | 数量 | 模块分布 |
|--------|------|----------|
| P0 (Critical) | 8 | schedule(2), handlers(1), index(1), canon(1), runtime(2), store(2) |
| P1 (Major) | 25 | sdk(4), spatial(2), narrative(1), pressure(2), social(2), canon(2), knowledge(1), effects(2), domain(2), runtime(3), store(1), typescript(1) |
| P2 (Minor) | 20 | 各模块分散 |

### 立即修复 (P0) — 不修就不能用

| 优先级 | 问题 | 修复建议 |
|--------|------|----------|
| 1 | C1 Schedule双重断裂 | 修正区域名映射 + 修复archetype路由（检查archetype.entries是否存在） |
| 2 | C4 updateFact缺验证 | 添加 validateTypeFields(updated) 调用 |
| 3 | C5 toJSON丢失99%事件 | 改为 slice(-cfg.maxEventLogSize) |
| 4 | C6 MemoryStore后备失效 | init()检查this.db是否已设置 |
| 5 | C7 崩溃恢复tickCount不一致 | 从snapshot更新tickCount/virtualTime |
| 6 | C8 传染系统空指针 | 使用neighbor.behaviorParams?.expressiveness ?? 0.2 |
| 7 | C2 B向量直接覆写 | 改为通过EffectPipeline或behaviorField.setTarget() |
| 8 | C3 fromJSON崩溃 | 添加输入验证和防御性访问 |

### 短期修复 (P1) — 不修就不正确

9. 修复 _getValence 语义反转 → `return pos - neg`
10. 恢复 _restoreAgents 遗漏的子系统（pinkNoise、intrinsicMotivation等）
11. SpatialEngine encounters 使用实际坐标而非target
12. WorldMap 未知区域报错而非静默返回中心
13. WorldPressure.total 裁剪到[0,1]
14. RegionGrid 使用distance或移除参数
15. AndyBridge 序列化改用JSON数组或length-prefixed
16. 添加 AndyEngine.shutdown/removeAgent/offTick
17. 传播观察/关系事实的知识
18. 修复事件去重为跨tick
19. 修复 Relationship 负面交互的关系模式
20. 修复 RelationshipPressure 分母
21. 修正全部 TypeScript 声明
22. WorldFactStore.fromJSON 添加验证
23. addFact 检查重复ID
24. validateDomain 检查 skipBehavior 等引用
25. 修正 skipBehavior 幻影名
26. snapshot() 添加缺失字段或重命名
27. EventDispatcher 统一截断路径
28. EventEffectPipeline 'move' 添加 PositionDelta
29. MemoryPressure 防御负age
30. AndyWorld 验证 savedState.time
31. EffectCommitter 记录跳过的delta
32. Character 默认日程改为domain-driven

---

## 十、审计声明

本报告是**全新审计周期**的产物，不依赖此前任何报告结论。所有发现均通过以下方式验证：

- **6个并行子AI**逐行审查src/下所有15个模块（每个子AI负责1-3个模块）
- **34个自定义深度测试**（27通过/7失败，失败项对应7个真bug）
- **3001个已有测试**全部通过
- **16项边界检查**全部通过
- **5项性能检查**全部通过
- **运行时验证**：10 agents × 200 ticks不崩溃、3个seed的agent位置轨迹完全相同（=宿舍，不移动）

**核心结论**: Andy Engine是一个**设计意图优秀、文档完善、但实现接线存在系统性脱节**的项目。这种脱节不是个别bug，而是一种模式——代码写了、逻辑对了，但调用链断了、字段名不匹配、验证缺口了、TypeScript声明过期了。项目中每一层（runtime、agent、action、canon、effects、sdk、store、spatial、domain）都有至少1个P1+问题。

8个P0问题中，有2个是"双重独立bug共同导致"（C1），1个是"验证缺口"（C4），1个是"数据丢失"（C5），2个是"后备机制失效"（C6、C7），1个是"空指针传播"（C8），1个是"架构违规"（C2）。这8个P0问题意味着引擎在常规使用场景下**不可能正确运行**。

**综合评分: 5.25/10**

> 以 10 分为"与 Linux/macOS/Minecraft 同等水准"的满分标准  
> 如果以"个人项目/研究原型"标准评估，分数约为 **7.0/10**  
> 如果以"可发布的开源库"标准评估，分数约为 **3.5/10**

---

*报告结束*
