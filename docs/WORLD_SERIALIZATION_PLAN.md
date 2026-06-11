# World Serialization Boundary Audit — Phase 19

> **这不是实现计划，不是重构方案。**
> **这是现有序列化链路的审计报告与适配器规划。**

---

## 1. 审计范围

审计 Andy Engine v0.2.0 的 "快照导出 → 状态还原" 链路，覆盖以下核心类：

- `AndyEngine` (index.js)
- `AndyWorld` (core/World.js)
- `Agent` (agent/Agent.js)
- `SocialGraph` (social/SocialGraph.js)
- `Relationship` (social/Relationship.js)
- `EventDispatcher` (core/EventDispatcher.js)

---

## 2. 导出链路审计 (toJSON)

### 2.1 AndyEngine.toJSON()

```
AndyEngine.toJSON()
  └── World.toJSON()
        ├── time: string (ISO 8601)
        ├── tickCount: number
        ├── environment: { weather, weatherChangedAt, timeOfDay, season }
        ├── agents: { [id]: Agent.toJSON() }
        ├── socialGraph: SocialGraph.toJSON() → edges[]
        └── events: EventDispatcher.toJSON() → { eventLog: [...] }
```

**发现：**
- `AndyEngine.toJSON()` 直接委托给 `World.toJSON()`，无额外字段
- `domainRef` 未导出——恢复时需要调用方自行传入正确的 domain
- `worldId` 不存在——当前无世界唯一标识概念

### 2.2 Agent.toJSON()

```
Agent.toJSON()
  ├── id, name
  ├── personality: Personality.toJSON()
  ├── emotion: EmotionVector.toJSON()
  ├── stateMachine: StateMachine.toJSON()
  ├── behaviorField: BehaviorField.toJSON()
  ├── memory: PersonalMemory.toJSON() → array
  ├── appraisalBiases: PersonalMemory.biasesToJSON() → array
  ├── proceduralMemory: ProceduralMemory.toJSON()
  ├── schedule: Schedule.toJSON()
  ├── needs: NeedsSystem.toJSON()
  ├── emotionRegulation: EmotionRegulation.toJSON()
  ├── intrinsicMotivation: IntrinsicMotivation.toJSON()
  ├── position: string
  ├── socialEnergy: number
  ├── health: number
  └── isOnline: boolean
```

**发现：**
- 导出完整，覆盖所有 12 个子系统
- `appraisalBiases` 从 `PersonalMemory` 分离导出，恢复时需要单独注入

### 2.3 SocialGraph.toJSON()

```
SocialGraph.toJSON()
  └── edges[]: Relationship.toJSON()
        ├── agentA, agentB
        ├── type, strength
        ├── lastInteraction, _hoursSinceLastInteraction
        ├── interactionCount, _relationalInteractions
        ├── impression: { positive, negative }
        └── history: [{ type, valence, content, time, strengthAfter }]
```

**发现：**
- `toJSON()` 返回 `snapshot().edges`（去重后的边数组）
- 恢复时 `SocialGraph` 构造函数直接接收 edges 数组

### 2.4 EventDispatcher.toJSON()

```
EventDispatcher.toJSON()
  └── eventLog: [{ id, time, type, scope, participants, content, effects, cause, semanticCategory }]
```

**发现：**
- 只保留最近 100 条事件
- 恢复时 `World` 构造函数逐条 push 到 `eventDispatcher.eventLog`

---

## 3. 还原链路审计 (constructor with savedState)

### 3.1 AndyEngine(config, savedState)

```javascript
// index.js:61-91
constructor(config, savedState) {
  // 1. 初始化 domain（从 config.domain 或默认 campus）
  this.domain = new DomainRegistry(config.domain);

  // 2. 创建 World（传入 savedState）
  this.world = new AndyWorld(config, savedState, this.domain);

  // 3. 恢复 Agents
  if (savedState && savedState.agents) {
    for (const [agentId, agentData] of Object.entries(savedState.agents)) {
      const agent = new Agent(
        { id: agentId, name: agentData.name, schedule: {}, domain: this.domain },
        agentData  // ← Agent 的完整 toJSON() 输出
      );
      this.world.addAgent(agent);
    }
  }
}
```

### 3.2 AndyWorld(config, savedState, domain)

```javascript
// core/World.js:26-91
constructor(config, savedState, domain) {
  // 时间：从 savedState.time 恢复
  this.time = savedState ? new Date(savedState.time) : config.startTime;
  this.tickCount = savedState ? savedState.tickCount : 0;

  // 环境：从 savedState.environment 恢复
  this.environment = savedState ? savedState.environment : { ... };

  // 区域空间：从 domain 重建（不从 savedState 恢复）
  this.regions = new RegionGrid(this.domain.regions);

  // 社交图谱：从 savedState.socialGraph 恢复
  this.socialGraph = new SocialGraph(savedState ? savedState.socialGraph : null);

  // 事件系统：从 savedState.events.eventLog 恢复
  this.eventDispatcher = new EventDispatcher(this.domain);
  if (savedState && savedState.events) {
    for (const evt of savedState.events.eventLog || []) {
      this.eventDispatcher.eventLog.push(evt);
    }
  }
}
```

### 3.3 Agent(config, savedState)

```javascript
// agent/Agent.js:45-97
constructor(config, savedState) {
  if (savedState) {
    this.personality = Personality.fromJSON(savedState.personality);
    this.emotion = new EmotionVector(this.personality, savedState.emotion);
    this.stateMachine = new StateMachine(null, savedState.stateMachine, domain);
    this.memory = new PersonalMemory(this.id, [], savedState.memory, domain);
    this.proceduralMemory = new ProceduralMemory(savedState.proceduralMemory);
    this.needs = new NeedsSystem(this.personality, savedState.needs, domain);
    this.emotionRegulation = new EmotionRegulation(this.personality, savedState.emotionRegulation);
    this.intrinsicMotivation = new IntrinsicMotivation(this.personality, savedState.intrinsicMotivation, domain);
    this.schedule = new Schedule(config.schedule, savedState.schedule);
    this.behaviorField = new BehaviorField(this.personality, savedState.behaviorField, {}, domain);
    // ... position, socialEnergy, health, isOnline
  }
}
```

---

## 4. Gap 分析

### 4.1 导出层 Gaps

| Gap | 描述 | 影响 |
|-----|------|------|
| G1 | `domainRef` 未导出 | 恢复时无法自动选择 Domain Config |
| G2 | `worldId` 不存在 | 无世界唯一标识，无法做 Stable Envelope |
| G3 | `schemaVersion` 不存在 | 无版本标记，无法做 Migration |
| G4 | `environment.weatherChangedAt` 是 Date 对象 | JSON 序列化后变为 string，恢复时需要处理 |
| G5 | `SocialGraph.toJSON()` 返回 edges 数组 | 不含 `agentCount`/`edgeCount` 元数据 |

### 4.2 还原层 Gaps

| Gap | 描述 | 影响 |
|-----|------|------|
| G6 | `Agent` 恢复时 `schedule` 传空对象 `{}` | 日程预设丢失，需要从 savedState.schedule 恢复 |
| G7 | `RegionGrid` 不从 savedState 恢复 | 区域占用关系丢失，需要靠后续 tick 重建 |
| G8 | `EventDispatcher` 恢复只 push eventLog | `_recentContentByAgent`、`_recentEncounterPairs` 等运行时缓存丢失 |
| G9 | `SocialGraph` 恢复后 `_adjacency` 重建 | 但 Dunbar 层级计算依赖运行时 tick |

### 4.3 适配器需要处理的问题

| 问题 | 处理方式 |
|------|----------|
| P1 | `domainRef` 缺失 → 适配器从 engine.domain.id 提取 |
| P2 | `worldId` 缺失 → 适配器生成或由调用方传入 |
| P3 | `schemaVersion` 缺失 → 适配器注入 CURRENT_SCHEMA_VERSION |
| P4 | Stable Envelope 字段 → 适配器从 engine 公共 API 提取 |
| P5 | runtimeSnapshot → 适配器直接打包 engine.toJSON() 输出 |
| P6 | 恢复时 domain 选择 → fromWorldState 从 worldState.domainRef 查找 |
| P7 | 恢复时 agents 重建 → 从 runtimeSnapshot.agents 解包传入 AndyEngine 构造函数 |

---

## 5. 适配器设计

### 5.1 toWorldState(engine, worldId)

```
输入: AndyEngine 实例, worldId
输出: 符合 v0.1.0 Stable Envelope 的 World State

步骤:
1. 调用 engine.toJSON() 获取原始快照
2. 提取 Stable Envelope 字段:
   - schemaVersion: CURRENT_SCHEMA_VERSION
   - worldId: 传入的 worldId
   - domainRef: engine.domain.id
   - worldClock: { time, tickCount }
   - characters: 从 engine.getAllAgents() 提取 { id, name, position }
   - relationships: 从 engine.getSocialGraph().toJSON() 提取 { from, to, type, strength }
   - events: 从原始快照.events.eventLog 提取 { id, time, type, content }
3. 将原始快照整体打包为 runtimeSnapshot
```

### 5.2 fromWorldState(worldState, config)

```
输入: World State 对象, config (含 domain 等)
输出: AndyEngine 实例

步骤:
1. 校验 worldState 通过 validateWorldState()
2. 从 runtimeSnapshot 解包原始快照
3. 构造 AndyEngine config:
   - startTime: worldState.worldClock.time
   - domain: 从 config.domain 或 worldState.domainRef 获取
4. 调用 new AndyEngine(config, originalSnapshot) 恢复
```

---

## 6. 非目标

本文档**不**包含：

- Core 序列化逻辑重构
- Agent.js / World.js / SocialGraph.js 代码修改
- Migration Pipeline 实现
- World Compiler 实现
- 物理存储层接入
- SDK 级别 public API 设计
