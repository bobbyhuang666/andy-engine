# WorldObject API RFC — Phase 24

> **这不是实现计划，不是代码修改指令。**
> **这是物理实体（WorldObject）系统在 Persistent World 引擎中的边界定义 RFC。**
> **注意：本 RFC 中的所有代码片段和数据结构设计均为 illustrative pseudo-code，仅用于说明概念边界，不作为实现授权或最终实现合同。**

---

## 1. Context

### 1.1 当前状态

Andy Engine v0.2.0 的世界是**纯角色世界**——只有 Agent，没有物体。

| 概念 | 当前实现 |
|------|----------|
| 区域（Region） | 纯标签，无实体内容 |
| 需求满足 | 通过区域语义隐式映射（`needSatisfactionMap`） |
| 交互 | 仅 Agent↔Agent，无 Agent↔Object |
| 空间 | RegionGrid（离散）或 SpatialEngine（连续），只索引 Agent |

**缺失：**
- 无物体实体（食物、工具、家具等）
- 无物体可用性（Affordance）机制
- 无物体占用/竞争机制
- 无物体生命周期（消耗/耐久）

### 1.2 为什么需要 WorldObject？

1. **物理真实性**：一个"持续存在的世界"必须有实体。角色不是在虚空中行动。
2. **需求满足的物理化**：饥饿不是"到达食堂就满足"，而是"吃到面包才满足"。
3. **社交冲突的焦点**：争夺唯一的椅子、分享同一把吉他——物体是社交交互的物理锚点。
4. **记忆的物理载体**：我用坏了斧头 → 物体状态变化 → 记忆 → 未来行为。

---

## 2. 问题 1：物体的身份、类型与空间定位

### 2.1 WorldObject 定义

在引擎数据层，WorldObject 是一个**有类型、有状态、有空间位置的物理实体**。

```javascript
// WorldObject 物理结构（illustrative candidate shape）
{
  // ─── 身份标识 ───
  id: string,                    // 唯一标识
  type: string,                  // 物体类型（Domain Config 声明）
  name: string,                  // 人类可读名称

  // ─── 空间定位 ───
  location: {
    region: string,              // 离散空间：所在区域
    position: { x: number, y: number } | null,  // 连续空间：坐标（可选）
  },

  // ─── 可用性（Affordances）───
  affordances: Affordance[],     // 物体提供的功能列表（见 §3）

  // ─── 状态 ───
  state: {
    durability: number | null,   // 耐久度 (0, 1]，null=不可损坏
    usesRemaining: number | null, // 剩余使用次数，null=无限
    occupiedBy: string | null,   // 当前占用者 agentId
    lockedBy: string | null,     // 当前锁定者 agentId
    properties: Object,          // 类型特定属性（Domain 扩展）
  },

  // ─── 可见性 ───
  visibility: {
    scope: 'region' | 'radius',  // 可见范围类型
    radius: number | null,       // 连续空间下的可见半径
  },

  // ─── 生命周期 ───
  lifecycle: {
    status: 'active' | 'consumed' | 'broken' | 'removed',
    createdAt: number,           // 创建时间
    destroyedAt: number | null,  // 销毁时间
  },
}
```

### 2.2 离散空间挂载（RegionGrid）

物体通过 `region` 字段挂载到 RegionGrid 的某个区域。

```
RegionGrid._grid: Map<regionId, Set<agentId>>
RegionGrid._objects: Map<regionId, Set<objectId>>  // 新增
```

**查询：** 同一区域的 Agent 可以看到该区域的所有物体。`getObjectsInRegion(regionId)` 返回物体列表。

### 2.3 连续空间挂载（SpatialEngine）

物体通过 `position` 字段注册到 SpatialEngine 的空间哈希网格。

```
SpatialHash._grid: Map<cellKey, Set<{id, type}>>  // 扩展：支持 agent 和 object
```

**查询：** 基于交互半径检测可见物体。`getObjectsInRange(x, y, radius)` 返回范围内的物体列表。

### 2.4 Domain Config 中的物体类型声明

```javascript
// Domain Config 新增字段（illustrative）
objectTypes: {
  'bread': {
    name: '面包',
    affordances: [
      { need: 'hunger', satisfyRate: 0.3, consumeOnUse: true },
    ],
    durability: null,       // 消耗品，无耐久度
    visibility: { scope: 'region' },
  },
  'guitar': {
    name: '吉他',
    affordances: [
      { need: 'stimulation', satisfyRate: 0.15, consumeOnUse: false },
      { need: 'social', satisfyRate: 0.1, consumeOnUse: false },
    ],
    durability: 0.95,       // 每次使用降低 5% 耐久
    visibility: { scope: 'region' },
  },
  'bed': {
    name: '床',
    affordances: [
      { need: 'energy', satisfyRate: 0.2, consumeOnUse: false },
      { need: 'comfort', satisfyRate: 0.15, consumeOnUse: false },
    ],
    durability: null,
    visibility: { scope: 'region' },
    occupyExclusive: true,  // 独占型物体
    maxOccupants: 1,
  },
}
```

---

## 3. 问题 2：物体可用性与需求满足

### 3.1 Gibson 的 Affordance 理论映射

James J. Gibson (1979) 的 Affordance 理论：物体的功能不是物体的固有属性，而是物体与智能体之间的关系。

**引擎映射：**

```typescript
interface Affordance {
  need: string;           // 满足的需求类型（hunger, energy, social, comfort, stimulation）
  satisfyRate: number;    // 满足速率 (0, 1]——每 tick 恢复的需求量
  consumeOnUse: boolean;  // 使用时是否消耗（true=消耗品，false=耐用品）
  condition?: {           // 使用条件（可选）
    minNeed?: number;     // 需求低于此值时才可用
    state?: string[];     // 只在特定状态下可用
  };
}
```

### 3.2 需求→物体→引力 闭环

```
需求匮乏 → 搜寻可用性匹配的物体 → 物体位置转化为引力吸引子 → 行为场梯度
```

**物理通路：**

```javascript
// Agent.buildBehaviorSignals() 中新增
function buildObjectSignals(agent, objects) {
  const needsDeficit = {};
  for (const [need, value] of Object.entries(agent.needs.needs)) {
    if (value < 0.4) {  // 需求阈值
      needsDeficit[need] = 0.4 - value;
    }
  }

  if (Object.keys(needsDeficit).length === 0) return null;

  // 在可见范围内寻找能满足匮乏需求的物体
  const candidates = [];
  for (const obj of objects) {
    if (obj.state.occupiedBy && obj.state.occupiedBy !== agent.id) continue;
    if (obj.lifecycle.status !== 'active') continue;

    for (const aff of obj.affordances) {
      if (needsDeficit[aff.need]) {
        candidates.push({
          object: obj,
          affordance: aff,
          urgency: needsDeficit[aff.need],
        });
      }
    }
  }

  // 将最佳候选物体转化为 4D 吸引子
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.urgency - a.urgency);
  const best = candidates[0];

  return {
    B_star: objectToBehaviorTarget(best.object, best.affordance),
    weight: best.urgency * best.affordance.satisfyRate,
    objectId: best.object.id,
  };
}
```

### 3.3 物体→4D 吸引子映射

物体的位置通过 `domain.objectBehaviorMap` 映射到 4D 行为空间：

```javascript
// Domain Config 新增字段（illustrative）
objectBehaviorMap: {
  'bread':    [0.35, 0.55, 0.08, 0.45],  // 吃面包：中活跃, 中社交, 低专注, 中表达
  'guitar':   [0.25, 0.70, 0.40, 0.75],  // 弹吉他：低活跃, 高社交, 中专注, 高表达
  'bed':      [0.02, 0.00, 0.02, 0.00],  // 睡觉：全面降低
  'book':     [0.20, 0.08, 0.75, 0.05],  // 看书：低活跃, 独处, 高专注, 低表达
  'desk':     [0.45, 0.15, 0.70, 0.15],  // 工作：中活跃, 独处, 高专注, 低表达
}
```

**Fallback：** 如果物体类型没有映射，使用物体所在区域的 stateCenter 作为近似。

---

## 4. 问题 3：可见性与感知动力学

### 4.1 离散空间感知规则

**规则：** 同一 Region 内的所有 Agent 可见该 Region 内的所有 WorldObject。

```
Agent in Region A → 可见 Region A 内的所有 Object
Agent in Region A → 不可见 Region B 内的 Object
```

**实现：** `RegionGrid.getObjectsInRegion(agent.position)` 返回物体列表。

### 4.2 连续空间感知规则

**规则：** 基于 SpatialEngine 的交互半径分层检测。

```
conversation radius (3m)  → 可交互物体（可以使用）
awareness radius (10m)    → 可感知物体（知道存在）
presence radius (25m)     → 最远感知边界
```

**实现：** `SpatialEngine.getObjectsInRange(agent.x, agent.y, radius)` 返回物体列表。

### 4.3 感知→行为的延迟

感知到物体不等于立即产生行为拉力。需要满足：
1. 物体在可见范围内
2. Agent 有对应的需求匮乏
3. 物体的 Affordance 匹配需求

只有三个条件都满足，物体才转化为行为场梯度。

### 4.4 记忆中的物体

即使物体不在可见范围内，Agent 的记忆中可能有关于该物体的信息：

```javascript
// 记忆中包含物体引用
{
  content: '在食堂吃到了很好吃的面包',
  associations: ['食堂', 'bread_001'],  // 物体 ID
  emotionTag: 'happy',
}
```

当 Agent 在情绪一致性检索中回忆到包含物体的记忆时，即使物体不在可见范围内，也可能产生微弱的行为拉力（"想去食堂再吃一次面包"）。

---

## 5. 问题 4：所有权、占用及竞争锁定机制

### 5.1 占用语义

物体有两种占用模式：

| 模式 | 说明 | 示例 |
|------|------|------|
| **独占型**（occupyExclusive） | 同一时间只有一个 Agent 可以使用 | 床、椅子、电脑 |
| **共享型** | 多个 Agent 可以同时使用 | 餐桌、公园长椅 |

### 5.2 lock() / unlock() 机制

**不使用阻塞锁**（会死锁 Runtime Tick），使用**非阻塞竞争**：

```javascript
class WorldObject {
  /**
   * 尝试占用物体（非阻塞）
   * @param {string} agentId
   * @returns {boolean} 是否成功占用
   */
  tryOccupy(agentId) {
    if (!this.config.occupyExclusive) {
      // 共享型：直接占用
      this.state.occupiedBy = this.state.occupiedBy || [];
      if (!this.state.occupiedBy.includes(agentId)) {
        this.state.occupiedBy.push(agentId);
      }
      return true;
    }

    // 独占型：检查是否已被占用
    if (this.state.occupiedBy && this.state.occupiedBy !== agentId) {
      return false;  // 被占用，不等待
    }

    this.state.occupiedBy = agentId;
    return true;
  }

  /**
   * 释放物体
   * @param {string} agentId
   */
  release(agentId) {
    if (this.state.occupiedBy === agentId) {
      this.state.occupiedBy = null;
    }
  }
}
```

### 5.3 竞争解决：梯度衰减而非阻塞

当 Agent A 想使用被 Agent B 占用的物体时：

**不：** 等待、阻塞、强制释放
**是：** 物体对该 Agent 的引力权重衰减

```javascript
function computeObjectWeight(agent, object) {
  let weight = baseWeight;

  // 独占型物体被占用时，权重大幅衰减
  if (object.config.occupyExclusive && object.state.occupiedBy) {
    if (object.state.occupiedBy !== agent.id) {
      weight *= 0.1;  // 被占用时权重降至 10%
    }
  }

  return weight;
}
```

**效果：** Agent 不会"钉死"在被占用的物体前，而是自然地被其他引力源拉走。

### 5.4 所有权（Ownership）对行为倾向的影响

所有权改变 Agent 对物体的行为倾向：

```javascript
// Agent 拥有物体时的行为变化
if (object.state.ownedBy === agent.id) {
  // 自己的东西：更强的引力（舒适感）
  weight *= 1.3;
  // 不会产生竞争焦虑
} else if (object.state.ownedBy && object.state.ownedBy !== agent.id) {
  // 别人的东西：更弱的引力（社会规范）
  weight *= 0.5;
  // 可能产生社交目标（"想借用"）
}
```

---

## 6. 问题 5：生命周期与消耗动力学

### 6.1 消耗品 vs 耐用品

| 类型 | 特征 | 示例 | 销毁时机 |
|------|------|------|----------|
| **消耗品**（Consumable） | `consumeOnUse: true` | 面包、药水 | 使用后立即销毁 |
| **耐用品**（Durable） | `consumeOnUse: false` | 吉他、床 | 耐久度降至 0 时销毁 |
| **永久品**（Permanent） | `durability: null` | 建筑、地标 | 永不销毁 |

### 6.2 消耗品销毁流程

```javascript
function consumeObject(object, agent) {
  // 1. 标记为 consumed
  object.lifecycle.status = 'consumed';
  object.lifecycle.destroyedAt = simTime;

  // 2. 从空间索引移除
  regionGrid.removeObject(object.id);

  // 3. 生成事件（供记忆系统使用）
  eventDispatcher.createEvent({
    type: 'object_consumed',
    content: `${agent.name} 使用了 ${object.name}`,
    participants: [agent.id],
    effects: [
      { target: agent.id, type: 'need', delta: { hunger: 0.3 } },
    ],
  });

  // 4. 物体引用保留在事件和记忆中（不删除引用）
  //    物体 ID 在事件日志中作为历史记录保留
}
```

### 6.3 耐用品耐久度衰减

```javascript
function useObject(object, agent) {
  if (object.state.durability !== null) {
    object.state.durability -= 0.05;  // 每次使用降低 5%

    if (object.state.durability <= 0) {
      // 耐久度耗尽 → 破损
      object.lifecycle.status = 'broken';
      object.lifecycle.destroyedAt = simTime;

      // 生成破损事件
      eventDispatcher.createEvent({
        type: 'object_broken',
        content: `${agent.name} 用坏了 ${object.name}`,
        participants: [agent.id],
        effects: [
          { target: agent.id, type: 'emotion', delta: { frustration: 0.05 } },
        ],
      });
    }
  }
}
```

### 6.4 空悬指针防护

**原则：** 物体销毁后，引用它的 Memory 和 Event 不受影响。

**理由：**
- Memory 记录的是"过去发生的事"，物体已不存在不影响记忆的真实性
- Event Log 是历史记录，不应被修改
- 物体 ID 在记忆中作为"已消失的实体"保留，支持"那家店已经不在了"这类叙事

**实现：** 不需要特殊处理。物体销毁后，`RegionGrid.getObject(objectId)` 返回 `null`，Agent 在尝试交互时自然跳过。

---

## 7. 问题 6：记忆写入与事件效果

### 7.1 物体交互事件格式

```javascript
// 使用物体
{
  type: 'object_use',
  content: '吃了一块面包',
  participants: ['maya'],
  objectId: 'bread_001',
  objectType: 'bread',
  effects: [
    { target: 'maya', type: 'need', delta: { hunger: 0.3 } },
    { target: 'maya', type: 'emotion', delta: { contentment: 0.05 } },
  ],
}

// 物体状态变化
{
  type: 'object_state_change',
  content: '吉他弦断了',
  objectId: 'guitar_001',
  objectType: 'guitar',
  changes: { durability: -0.1 },
  effects: [
    { target: 'maya', type: 'emotion', delta: { frustration: 0.03 } },
  ],
}

// 物体销毁
{
  type: 'object_consumed',
  content: '面包被吃完了',
  objectId: 'bread_001',
  objectType: 'bread',
  participants: ['maya'],
}
```

### 7.2 事件→记忆管线

物体交互事件通过现有 `Agent._perceiveEvents()` 管线进入记忆系统：

```javascript
// Agent._perceiveEvents() 中
for (const event of events) {
  // ... 现有 Appraisal 管线 ...

  if (event.objectId) {
    // 物体交互事件：将物体 ID 加入记忆关联
    enrichedEvent._objectId = event.objectId;
    enrichedEvent._objectType = event.objectType;
  }

  this.memory.addExperience(enrichedEvent, this.emotion, appraisal.importance);
}
```

### 7.3 物体属性变化的事件效果

物体属性变化通过 `effects` 数组回馈给 Agent 状态：

```javascript
// 物体效果类型
type Effect =
  | { target: string, type: 'need', delta: { [need: string]: number } }
  | { target: string, type: 'emotion', delta: { [dim: string]: number } }
  | { target: string, type: 'health', delta: number }
  | { target: string, type: 'relationship', delta: { target: string, valence: number } }
```

**效果应用：** 复用现有 `Emotion.applyEffect()` 和 `NeedsSystem` 管线。

### 7.4 物体记忆的检索

物体交互记忆支持基于物体类型的检索：

```javascript
// 检索上下文
const context = {
  keywords: ['面包', 'bread'],
  emotion: agent.emotion.current,
  region: agent.position,
};

// PersonalMemory.retrieve() 中新增
// 物体 ID 作为关联实体参与扩散激活
if (context.objectId && memory.associations.includes(context.objectId)) {
  activation += W * S * 0.5;  // 物体关联权重较高
}
```

---

## 8. 持久化设计

### 8.1 Stable Envelope 中的物体

> [!WARNING]
> **本 RFC 不授权修改 Stable World Envelope。** 以下内容仅作为未来可能演进的候选方案设计（Potential future Stable Envelope extension, not approved by this RFC），当前版本禁止在此处引入任何 Stable Envelope 结构变动。

WorldObject 的 Stable Envelope 字段：

```json
{
  "objects": [
    {
      "id": "bread_001",
      "type": "bread",
      "name": "面包",
      "region": "食堂",
      "status": "active"
    }
  ]
}
```

### 8.2 runtimeSnapshot 中的物体

```json
{
  "objects": {
    "bread_001": {
      "id": "bread_001",
      "type": "bread",
      "name": "面包",
      "location": { "region": "食堂", "position": null },
      "affordances": [
        { "need": "hunger", "satisfyRate": 0.3, "consumeOnUse": true }
      ],
      "state": {
        "durability": null,
        "usesRemaining": null,
        "occupiedBy": null,
        "lockedBy": null,
        "properties": {}
      },
      "visibility": { "scope": "region", "radius": null },
      "lifecycle": {
        "status": "active",
        "createdAt": 1726312345000,
        "destroyedAt": null
      }
    }
  }
}
```

### 8.3 物体状态变化的事件日志

物体的每次状态变化都生成事件，记录在 Event Log 中：

```json
{
  "id": "evt_789",
  "time": "2026-09-15T14:30:00Z",
  "type": "object_use",
  "content": "吃了一块面包",
  "objectId": "bread_001",
  "participants": ["maya"],
  "effects": [
    { "target": "maya", "type": "need", "delta": { "hunger": 0.3 } }
  ]
}
```

---

## 9. Future Implementation Pipeline Candidate

> [!NOTE]
> **以下为实现管线草案，属于 Future Implementation Pipeline Candidate (phase number TBD, not authorized by this RFC)。**
> **此处所有代码和字段结构定义仅作为 illustrative pseudo-code / candidate shape, 不作为最终的 implementation contract。**

```
WorldObject 类
  ├── tryOccupy(agentId) / release(agentId)
  ├── use(agent) → 生成事件 + 更新状态
  └── destroy() → 标记销毁 + 从索引移除

World 新增
  ├── objectManager: ObjectManager
  │     ├── addObject(object)
  │     ├── removeObject(objectId)
  │     ├── getObjectsInRegion(regionId)
  │     └── getObjectsInRange(x, y, radius)
  └── toJSON() / fromJSON() 扩展

Agent.buildBehaviorSignals() 新增
  └── signals.objects = buildObjectSignals(agent, visibleObjects)

BehaviorField._computeGradient() 新增
  └── _addObjectGradient(grad, signals.objects, w.object)

Domain Config 新增
  ├── objectTypes: { [type]: ObjectTypeDef }
  └── objectBehaviorMap: { [type]: number[4] }
```

---

## 10. 非目标

本 RFC **不**包含：
- UI/地图渲染逻辑
- 物体贴图/像素坐标
- Oakland / Andy Town 专有语义
- Agent.tick() 管线修改
- BehaviorField 代码修改
- Domain Config 字段修改
- Stable World Envelope 结构修改

---

## 11. 开放问题

1. **物体生成规则：** 物体是 World Spec 静态定义的，还是可以由事件动态生成（如"下雨后出现水坑"）？
2. **物体所有权转移：** 是否支持物体在 Agent 之间转移（如"把面包给朋友"）？
3. **物体的社交可见性：** 某些物体是否只对特定 Agent 可见（如"私人物品"）？
4. **物体的组合：** 是否支持物体组合（如"用面粉和水做面包"）？
5. **物体的空间移动：** 物体是否可以被 Agent 携带移动（如"把书从图书馆带到咖啡店"）？

---

## 12. Future Implementation Candidate

Future Implementation Candidate, phase number TBD.
