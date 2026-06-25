# Minimal Persistent World Schema Draft — Phase 17

> **这不是 API 文档，不是实现代码，不是迁移脚本。**
> **这是 Persistent World 两层 Schema 的最小草案。**

---

## 1. Context

Phase 16 定义了 Persistent World Architecture 的五层边界，并明确了：
- World Compiler 是**外部创作期工具链（Ecosystem Tooling）**
- Runtime **不内置**版本兼容逻辑，旧版本数据必须先经过 Migration Pipeline 转换

Phase 17 将架构边界落地为两层物理划分的 Schema 草案：
- **Stable World Envelope**：公共 Schema，跨版本稳定
- **Runtime Snapshot Payload**：不透明载荷，由各版本 Runtime 内部独占

---

## 2. 设计原则

1. **公共契约最小化**：只暴露跨版本稳定的字段
2. **运行时状态不透明**：子系统内部状态封装为 Opaque Payload
3. **版本隔离**：Runtime 升级不影响 Stable World Envelope
4. **确定性校验**：Validator 只校验 Stable 层，不解析 Opaque Payload

---

## 3. 两层物理划分

```
┌─────────────────────────────────────────────────┐
│         Stable World Envelope (公共 Schema)      │
│  跨版本稳定，是 Migration Pipeline 的公共契约     │
├─────────────────────────────────────────────────┤
│  schemaVersion                                  │
│  worldId                                        │
│  domainRef                                      │
│  worldClock { time, tickCount }                 │
│  characters [{ id, name, position }]            │
│  relationships [{ from, to, type, strength }]   │
│  events [{ id, time, type, content }]           │
│  runtimeSnapshot ─────────────────────────┐     │
├───────────────────────────────────────────┼─────┤
│         Runtime Snapshot Payload          │     │
│  (Opaque Payload — 不透明载荷)            │     │
│  由各版本 Runtime 内部独占，非公共契约     │     │
│  ┌────────────────────────────────────────┘     │
│  │  emotion: { current, mood, baseline, stress } │
│  │  needs: { hunger, energy, social, ... }       │
│  │  behaviorField: { B, velocity, ... }          │
│  │  memory: [ { id, content, activation, ... } ] │
│  │  personality: { ocean, mbti, ... }            │
│  │  ... (其他子系统内部状态)                      │
│  └──────────────────────────────────────────     │
└─────────────────────────────────────────────────┘
```

---

## 4. Stable World Envelope (公共 Schema)

Stable World Envelope 是跨版本稳定的公共契约。Migration Pipeline 和 Validator 只操作这一层。

### 4.1 顶层结构

```json
{
  "schemaVersion": "0.1.0",
  "worldId": "world_abc123",
  "domainRef": "campus",
  "worldClock": {
    "time": "2026-09-15T14:30:00Z",
    "tickCount": 1234
  },
  "characters": [...],
  "relationships": [...],
  "events": [...],
  "runtimeSnapshot": { ... }
}
```

### 4.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaVersion` | string | Schema 版本号，用于 Migration Pipeline 版本判断 |
| `worldId` | string | 世界唯一标识 |
| `domainRef` | string | 引用的 Domain Config ID |
| `worldClock` | object | 世界时钟（公共字段） |
| `characters` | array | 角色列表（仅公共字段） |
| `relationships` | array | 关系边列表（仅公共字段） |
| `events` | array | 事件日志（仅公共字段） |
| `runtimeSnapshot` | object | **Opaque Payload**——运行时快照载荷 |

### 4.3 worldClock 对象

```json
{
  "time": "2026-09-15T14:30:00Z",
  "tickCount": 1234
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `time` | string | 当前模拟时间（ISO 8601） |
| `tickCount` | number | 已执行的 tick 数量 |

### 4.4 characters 数组

角色列表，只包含**公共字段**（跨版本稳定的标识和位置信息）。

```json
[
  {
    "id": "maya",
    "name": "Maya",
    "position": "图书馆"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 角色唯一标识 |
| `name` | string | 角色名称 |
| `position` | string | 当前位置（Domain Config 中的区域名） |

**注意：** 角色的内部状态（情绪、需求、人格、记忆等）封装在 `runtimeSnapshot` 中，不属于 Stable 层。

### 4.5 relationships 数组

关系边列表，只包含**公共字段**。

```json
[
  {
    "from": "maya",
    "to": "alice",
    "type": "friend",
    "strength": 0.65
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `from` | string | 关系起点角色 ID |
| `to` | string | 关系终点角色 ID |
| `type` | string | 关系类型（`"stranger"`、`"acquaintance"`、`"friend"`、`"closeFriend"`） |
| `strength` | number | 关系强度（0-1） |

**注意：** 关系的详细历史（interaction history、impression 等）封装在 `runtimeSnapshot` 中。

### 4.6 events 数组

事件日志，只包含**公共字段**。

```json
[
  {
    "id": "evt_789",
    "time": "2026-09-15T14:30:00Z",
    "type": "social",
    "content": "在图书馆遇到了 Alice，聊了几句"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 事件唯一标识 |
| `time` | string | 事件发生时间（ISO 8601） |
| `type` | string | 事件类型（`"social"`、`"random"`、`"weather"`、`"state_change"` 等） |
| `content` | string | 事件内容描述 |

**注意：** 事件的详细效果（effects、participants、semanticCategory 等）封装在 `runtimeSnapshot` 中。

### 4.7 runtimeSnapshot (Opaque Payload)

`runtimeSnapshot` 是**不透明载荷（Opaque Payload）**，由各版本 Runtime 内部独占。

**关键约束：**
- `runtimeSnapshot` 的内部结构**不是公共契约**
- Validator **只做 `typeof === 'object'` 校验**，不解析内部细节
- **v1+ 迁移**(已有 Stable Envelope 的版本间):runtimeSnapshot 是 opaque payload,migration 只深拷贝、不解析、不重写内部结构。Runtime snapshot compatibility/migration is a future engine-owned concern outside core tick runtime.
- **v0→v1 迁移例外**(无 Envelope → 有 Envelope):v0 是 pre-envelope 的扁平 `AndyEngine.toJSON()` 输出,无结构化 runtimeSnapshot。`migrateV0ToV1` 必须从 v0 扁平字段(time/tickCount/environment/agents/socialGraph/events)重组并补齐 v1 runtimeSnapshot 的 engine 期望字段(含 events 的 participants/observers/effects 等)。这是「无结构 → 有结构」的构造,非 opacity 违规。
- `runtimeSnapshot` 的格式由生成它的 Runtime 版本决定

**候选结构（illustrative example，非正式 schema）：**

```json
{
  "runtimeSnapshot": {
    "_runtimeVersion": "0.2.0",
    "agents": {
      "maya": {
        "personality": { ... },
        "emotion": { ... },
        "behaviorField": { ... },
        "needs": { ... },
        "memory": [ ... ],
        ...
      }
    },
    "socialGraph": { ... },
    "eventDetails": { ... }
  }
}
```

**注意：** 上述结构仅为示意，实际格式由 Runtime 版本决定，不属于本文档的公共契约范围。

---

## 5. Migration Pipeline 契约

### 5.1 版本链

```
World State v0.0.0 (无 schemaVersion)
    ↓ migrateV0toV1
World State v0.1.0 (当前版本)
    ↓ (未来版本)
World State v0.2.0
```

### 5.2 Migration 职责

Migration Pipeline **只转换 Stable World Envelope**：
- 补齐缺失的公共字段（如 `schemaVersion`、`worldId`）
- 转换字段格式（如 `stateVersion` → `schemaVersion`）
- 修正引用一致性（如确保 `relationships` 中的角色 ID 存在）

**runtimeSnapshot 处理(按迁移路径区分)**：

- **v1+ 迁移**(已有 Envelope 的版本间):runtimeSnapshot 是 opaque payload。Migration 只深拷贝、不解析、不重写内部结构。Runtime snapshot compatibility/migration is a future engine-owned concern outside core tick runtime. If `runtimeSnapshot` format is incompatible with current Runtime, Runtime reports error at load time.

- **v0→v1 迁移**(无 Envelope → 有 Envelope,构造例外):v0 是 pre-envelope 的扁平 `AndyEngine.toJSON()` 输出。`migrateV0ToV1` 必须从 v0 扁平字段重组并补齐 v1 runtimeSnapshot 的 engine 期望字段(含 events 的 participants/observers/effects/scope 等),否则 engine 加载 v0 存档会因字段缺失而崩。这是「无结构 → 有结构」的必要构造,不违反 v1+ 的 opacity 契约。

### 5.3 转换后验证

Migration Pipeline 转换后，应调用 `validateWorldState(state)` 验证输出符合当前版本的 Stable World Envelope 规范。

---

## 6. 校验规则

### 6.1 validateWorldSpec(spec)

校验 World Spec（用户世界蓝图）的 Stable 层：

- `schemaVersion` 是非空字符串
- `domainRef` 是非空字符串
- `worldName` 是非空字符串
- `characters` 是非空数组
- 每个 character 的 `id` 唯一且非空
- 每个 character 的 `name` 非空

### 6.2 validateWorldState(state)

校验 World State（运行后状态）的 Stable 层：

- `schemaVersion` 是非空字符串
- `worldId` 是非空字符串
- `domainRef` 是非空字符串
- `worldClock.time` 是有效的 ISO 8601 字符串
- `worldClock.tickCount` 是非负整数
- `characters` 是数组，每个元素包含 `id`（唯一）和 `name`
- `relationships` 是数组，每个元素的 `from` 和 `to` 在 characters 中存在
- `events` 是数组，每个元素包含 `id`、`time`、`type`
- 如果 `runtimeSnapshot` 存在，只做 `typeof === 'object'` 校验

---

## 7. Non-Goals

Phase 17 **不**包含：

- `runtimeSnapshot` 内部结构定义（属于 Runtime 内部契约）
- Migration Pipeline 实现
- Validator 实现
- World Compiler 实现
- 数据库读写逻辑
- Bobby/UI 专属字段

---

## 8. Open Questions

1. **worldId 生成策略：** 使用 UUID、时间戳哈希、还是用户自定义？
2. **events 裁剪策略：** Stable 层的 events 应该保留多少条？
3. **runtimeSnapshot 压缩：** 长期运行后 runtimeSnapshot 会膨胀，是否需要压缩？
4. **Schema 版本号格式：** 使用语义化版本（`0.1.0`）还是简单整数（`1`）？
5. **跨 Domain 兼容：** 同一个 World State 能否切换 Domain Config？

---

## 9. Implementation Status

World schema tooling has been implemented and moved under the canonical `src/` tree:

- `src/store/world/validator.js`：实现 `validateWorldSpec()` 和 `validateWorldState()`，只校验 Stable World Envelope
- `tests/store/schema-validator.test.js`：覆盖校验器的单元测试

旧的 `world/` 顶层工具目录已退休；不要新增 `world/*` 实现文件。

---

## 10. Field Classification (beta.2 Freeze Review)

Each field in the world state is classified into one of four stability tiers:

| Tier | Meaning | Migration responsibility |
|------|---------|------------------------|
| **Stable Envelope** | Cross-version public contract. Breaking changes require schema version bump + migration. | `migration.js` must handle |
| **Opaque Runtime Snapshot** | Internal to the runtime version that produced it. Not a public contract. | Runtime reports error at load time if incompatible |
| **Experimental** | Shipped but may change shape between minor versions. Not guaranteed stable. | Best-effort migration |
| **Migration-Only** | Fields that exist only in the migration path (v0.0.0 → v0.1.0). Not persisted in current schema. | `migrateV0ToV1()` only |

### 10.1 Stable World Envelope Fields

| Path | Type | Description |
|------|------|-------------|
| `schemaVersion` | `string` | Schema version for migration pipeline (`'0.1.0'`) |
| `worldId` | `string` | World unique identifier |
| `domainRef` | `string` | Domain Config ID reference |
| `worldClock.time` | `string` (ISO 8601) | Current simulation time |
| `worldClock.tickCount` | `number` (non-negative int) | Executed tick count |
| `characters[].id` | `string` | Character unique identifier |
| `characters[].name` | `string` | Character display name |
| `characters[].position` | `string` | Current region (from domain config) |
| `relationships[].from` | `string` | Source character ID |
| `relationships[].to` | `string` | Target character ID |
| `relationships[].type` | `string` (optional) | Relationship type (`stranger`/`acquaintance`/`friend`/`closeFriend`) |
| `relationships[].strength` | `number` (optional, 0–1) | Relationship strength |
| `events[].id` | `string` | Event unique identifier |
| `events[].time` | `string` (ISO 8601) | Event timestamp |
| `events[].type` | `string` | Event type (`social`/`random`/`weather`/`state_change`) |
| `events[].content` | `string` | Event content description |
| `runtimeSnapshot` | `object` | Opaque payload — only `typeof === 'object'` validated |

### 10.2 Opaque Runtime Snapshot Fields

These fields live inside `runtimeSnapshot` and are produced by `AndyWorld.toJSON()`. Their shape is NOT a public contract and may change between minor versions without migration.

| Path | Type | Description |
|------|------|-------------|
| `runtimeSnapshot.time` | `string` | Internal sim time |
| `runtimeSnapshot.tickCount` | `number` | Internal tick count |
| `runtimeSnapshot.environment` | `object` | Weather, timeOfDay, season |
| `runtimeSnapshot.agents` | `{ [id]: object }` | Full agent state (emotion, needs, memory, personality, behaviorField, etc.) |
| `runtimeSnapshot.socialGraph` | `array` | Social graph edges (raw) |
| `runtimeSnapshot.events` | `object` | Event log with full details |
| `runtimeSnapshot.rngState` | `number \| undefined` | Seeded RNG state (only if seeded) |
| `runtimeSnapshot.factStore` | `object \| undefined` | World fact store (only if `enableFacts`) |
| `runtimeSnapshot.knowledgeStore` | `object \| undefined` | Knowledge store (only if `enableFacts`) |

### 10.3 Experimental Fields

These are shipped in the Stable Envelope but their exact shape may evolve. Best-effort migration only.

| Path | Type | Status |
|------|------|--------|
| `events[].content` | `string` | Content format may evolve (currently plain text) |
| `relationships[].type` | `string` | Type vocabulary may expand |
| `domainRef` | `string` | Cross-domain migration not yet defined |

### 10.4 Migration-Only Fields

These fields exist only in the v0.0.0 → v0.1.0 migration path and are not part of the current schema.

| Path | Type | Origin |
|------|------|--------|
| `stateVersion` | `string` | Old field name, mapped to `schemaVersion` |
| `agents` (top-level) | `object` | Old format had agents at root instead of `characters[]` |
| `socialGraph` (top-level, edges with `agentA`/`agentB`) | `array` | Old edge format, mapped to `relationships[]` |
| `events.eventLog` (raw) | `array` | Old event format with mixed types, mapped to `events[]` |

### 10.5 Envelope Version Disambiguation

Two version numbers coexist:

| Version | Owner | Scope |
|---------|-------|-------|
| `schemaVersion` (`'0.1.0'`) | `validator.js` / `migration.js` | Stable World Envelope schema version. Drives migration pipeline. |
| `ENVELOPE_VERSION` (`'0.2.0'`) | `Serialization.js` | Serialization envelope version. Wraps the runtime snapshot. Independent of schema version. |

The `Serialization` envelope (`{ version, timestamp, runtimeSnapshot }`) is a transport wrapper. The `WorldStateAdapter` envelope (`{ schemaVersion, worldId, domainRef, worldClock, characters, relationships, events, runtimeSnapshot }`) is the semantic persistence contract. They are layered, not competing.
