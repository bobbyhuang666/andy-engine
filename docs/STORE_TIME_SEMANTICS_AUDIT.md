# Store 层 Date.now() 语义审计

> 审计目标：分类每个 Date.now() 使用，明确哪些应该使用 virtualTime / simTime，哪些可以使用 wall-clock。

---

## 概览

扫描范围：`src/store/**`

| 分类 | 数量 | 修复优先级 |
|------|------|-----------|
| query cutoff | 4 | 高 - 快进模拟下行为错误 |
| story timestamp filtering | 1 | 高 - 快进模拟下行为错误 |
| snapshot timestamp | 1 | 中 - 已有 virtualTime fallback |
| persistence metadata | 2 | 低 - wall-clock 可接受 |
| ID generation | 2 | 低 - wall-clock 可接受 |

---

## 详细分类

### 1. Query Cutoff（应该使用 virtualTime）

#### SQLiteStore.js:152 — `getRecent()`
```js
const cutoff = Date.now() - hours * 3600 * 1000;
```
- **用途**：查询最近 N 小时的故事
- **问题**：快进模拟时，virtualTime 可能已经前进了很远，但 Date.now() 还是 wall-clock，导致查询结果不符合虚拟时间
- **建议**：改为接收 `now` 参数，由调用方传入 virtualTime

#### SQLiteStore.js:170 — `getByEmotion()`
```js
const cutoff = Date.now() - hours * 3600 * 1000;
```
- **用途**：按情绪标签查询最近故事
- **问题**：同上
- **建议**：同上

#### SQLiteStore.js:188 — `decay()`
```js
const now = Date.now();
const weekAgo = now - 7 * 24 * 3600 * 1000;
const maxAge = now - maxAgeDays * 24 * 3600 * 1000;
```
- **用途**：衰减老故事、清理过期故事
- **问题**：快进模拟时，wall-clock 时间远落后于 virtualTime，可能导致不该衰减的故事被衰减
- **建议**：改为接收 `now` 参数

#### SQLiteStore.js:218 — `stats()`
```js
const now = Date.now();
const dayAgo = now - 24 * 3600 * 1000;
const weekAgo = now - 7 * 24 * 3600 * 1000;
```
- **用途**：统计最近故事数量
- **问题**：同上，统计结果不符合虚拟时间
- **建议**：改为接收 `now` 参数

---

### 2. Story Timestamp Filtering（应该使用 virtualTime）

#### SimulationStore.js:152 — `getStoriesForAgent()`
```js
.filter(s => Date.now() - s.timestamp < hours * 3600 * 1000);
```
- **用途**：过滤内存缓冲中的故事
- **问题**：快进模拟时，故事的 timestamp 是 virtualTime，但过滤用 wall-clock，导致所有故事都被过滤掉
- **建议**：使用 `this.virtualTime?.getTime() || Date.now()`

---

### 3. Snapshot Timestamp（已有 fallback，低风险）

#### SimulationStore.js:250 — `_saveSnapshot()`
```js
this.db.saveSnapshot(this.tickCount, this.virtualTime?.getTime() || Date.now(), data);
```
- **用途**：保存快照的虚拟时间
- **状态**：**已经优先使用 virtualTime**，Date.now() 只是 fallback
- **建议**：保持不变，这是正确的模式

#### SQLiteStore.js:252 — `saveSnapshot()`
```js
Date.now(),  // created_at 字段
```
- **用途**：记录快照实际创建时间（persistence metadata）
- **建议**：保持 wall-clock，这是元数据，不是虚拟时间

---

### 4. Persistence Metadata（wall-clock 可接受）

#### SQLiteStore.js:103 — schema default
```sql
created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
```
- **用途**：快照表的创建时间默认值
- **建议**：保持 wall-clock，这是数据库元数据

---

### 5. ID Generation（wall-clock 可接受）

#### world/compiler.js:99
```js
const worldId = spec.worldId || `world_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
```
- **用途**：生成唯一世界 ID
- **建议**：保持 wall-clock，ID 只需要唯一性，不需要虚拟时间语义

#### world/migration.js:62
```js
const worldId = `world_migrated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
```
- **用途**：迁移时生成世界 ID
- **建议**：保持 wall-clock，同上

#### world/migration.js:86
```js
id: evt.id || `evt_${Date.now()}`,
```
- **用途**：迁移时生成事件 ID
- **建议**：保持 wall-clock，ID 只需要唯一性

---

## 修复建议总结

### 高优先级（快进模拟行为错误）

1. **SQLiteStore 查询方法**：添加 `now` 参数
   - `getRecent(agentId, hours, limit, now?)`
   - `getByEmotion(agentId, emotionTag, hours, limit, now?)`
   - `decay(decayFactor, minImportance, maxAgeDays, now?)`
   - `stats(agentId, now?)`
   - 默认值：`now = Date.now()`（向后兼容）

2. **SimulationStore.getStoriesForAgent()**：使用 `this.virtualTime`
   - `const now = this.virtualTime?.getTime() || Date.now();`

### 低优先级（保持不变）

- Snapshot created_at：wall-clock 元数据
- ID generation：只需要唯一性
- Schema defaults：数据库元数据

---

## 不改的东西

- 数据库 schema 不变
- Public API 签名不变（只增加 optional 参数）
- 不引入新的依赖
