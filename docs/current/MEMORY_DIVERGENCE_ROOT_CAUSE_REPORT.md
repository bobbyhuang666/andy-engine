# Memory Divergence Root-Cause Report (v2.2-W0b)

> 阶段：v2.2-W0b 诊断（非实现）
> 诊断脚本：`scripts/l4-memory-divergence-diag.js`
> 基线 commit：`49b18a7`（W0b 任务卡），基于 W1 partial（_nextId 修复保留工作树未提交）
> 状态：第二层根因证据链闭合，待独立审计复核

## 0. 摘要

W1 修复 _nextId 后暴露第二层根因：续跑首 tick agent 重新感知恢复前已处理过的旧 event，重复触发 addExperience，导致 memory 重复生成 + 截断差异。

精确根因：`AndyWorld.js:366-368` 把 `eventDispatcher.eventLog.slice(-10)` 作为 `perceivedEvents` 喂给 agent.tick。agent 的"已感知 event"去重状态**未持久化**，恢复后 agent 重新感知 eventLog 末尾 10 条旧 event，对每条重复调 addExperience。

这是**新的 runtimeSnapshot 缺口**（agent 感知去重状态未持久化），**非 _nextId 修复的副作用**。

## 1. 诊断方法

`scripts/l4-memory-divergence-diag.js`：monkey-patch `PersonalMemory.prototype.addExperience`（不改 src/），记录每次调用的 agentId/memCount/eventId/eventType/content。跑 full（0-59）vs restored（0-49 序列化→恢复→50-59），比对 memory creation timeline。

补充诊断：monkey-patch `EventDispatcher.prototype.dispatch`，确认续跑首 tick dispatch 返回空（排除 dispatch 重复处理）。

## 2. 关键证据

### 2.1 续跑首 tick addExperience 调用对比

| | full tick 50 | restored tick 50 |
|---|---|---|
| addExperience 调用数 | 7 | 14 |
| memCount 起点 | 11 | 18（恢复正确） |
| event id | evt_61, evt_62, evt_63, evt_64, evt_66... | evt_62, evt_63, evt_64, evt_66, evt_68... |
| dispatch 返回 | 4（新 event） | **0**（pendingEvents 空） |

**关键**：restored tick 50 dispatch 返回 0（pendingEvents 空），但 addExperience 仍被调 14 次——说明 addExperience **不经 dispatch**，而经 agent.tick 的 perceivedEvents 路径。

### 2.2 perceivedEvents 来源

`AndyWorld.js:366-368`：
```js
const perceivedEvents = this.eventDispatcher.filterEventsForAgent(
  agent,
  this.eventDispatcher.eventLog.slice(-10)  // 取最近 10 条 eventLog
);
const agentResult = agent.tick(env, perceivedEvents, contagionInputs);
```

agent.tick 接收 `perceivedEvents = eventLog.slice(-10)`（最近 10 条历史 event），传给 `PerceptionHandler` → `perceiveEvents(agent, safeEvents)` → `PerceptionRuntime.js:80 agent.memory.addExperience(...)`。

### 2.3 恢复点 eventLog 状态

- full tick 50：eventLog 含 evt_0-61，slice(-10) = evt_52-61（tick 49 新生成）。
- restored tick 50：eventLog 恢复后含 evt_0-71（恢复点 _nextId=72），slice(-10) = evt_62-71（**恢复前最后 10 条**）。

restored 的 perceivedEvents 是 evt_62-71——这些是 tick 50 **之前**已 dispatch、agent **已感知过**的旧 event。agent 恢复后无"已感知"记忆，重新对这 10 条调 addExperience。

## 3. 七问题回答

### Q1 tick 50-59 restored 额外 memory 的第一条是哪一条？
tick 50 首条额外 addExperience 调用：event `evt_62`（type=social，content="在附近注意到有人"）。restored 在 tick 50 对 evt_62 调 addExperience，但 full 在 tick 49 已对 evt_62 调过（evt_62 是 tick 49 的 event）。

### Q2 它由哪个函数调用 addExperience 创建？
`PerceptionRuntime.js:80` `agent.memory.addExperience(enrichedEvent, agent.emotion, appraisal.importance)`，由 `PerceptionHandler.js:14 perceiveEvents(this.agent, context.safeEvents)` 触发，`safeEvents` 来自 `AndyWorld.js:366 eventLog.slice(-10)`。

### Q3 full run 为什么没有创建同一条？
full tick 50 时，evt_62 是 tick 49 已 dispatch 的旧 event。full 在 tick 49 已感知 evt_62 并调过 addExperience。tick 50 时 slice(-10) 已推移到 evt_52-61，evt_62 不在感知窗口内。restored 因恢复点 eventLog 末尾仍含 evt_62-71，slice(-10) 重新包含它。

### Q4 触发条件依赖什么状态？
依赖 `eventLog` 的内容与 agent 对 event 的"已感知"去重状态。恢复后 eventLog 正确还原，但 agent 无"已感知 event id"记录，对 eventLog.slice(-10) 全部重新感知。

### Q5 该状态是否被 toJSON/fromJSON 持久化？
**否**。agent 的"已感知 event"去重状态未持久化。`PersonalMemory` 持久化 memories（含 eventId 字段），但 perception 路径无"已处理 event id 集合"的持久化——每次 tick 都对 slice(-10) 重新感知。

### Q6 这是新的 runtimeSnapshot 缺口，还是 _nextId 修复的副作用？
**新的 runtimeSnapshot 缺口**。_nextId 修复仅解决 event id 计数器重置；本根因是 agent 感知去重状态缺失，与 _nextId 无关。_nextId 修复前此问题被 _nextId 分叉掩盖（_nextId 重置导致 event id 冲突，memory 生成路径不同，未暴露感知重复）。

### Q7 W1 是否仍只需修 EventDispatcher，还是需扩展到 memory/event-processing 状态？
**需扩展到 event-processing 状态**。修复方向：agent 感知路径需"已感知 event id"去重，或 eventLog 需"已 dispatch tick"游标。这超出 EventDispatcher._nextId 范围，属新修复波次。

## 4. 修复方向建议（非实现，待 W1 扩展或 W2）

候选方案（需设计判断，非本报告定论）：

1. **agent 感知去重**：PersonalMemory 或 PerceptionRuntime 维护"已感知 event id 集合"，持久化 + 恢复。perceiveEvents 跳过已感知 event。
2. **eventLog 游标**：EventDispatcher 维护"上次感知 tick"游标，slice 从游标后取。但 eventLog 只存最近 100 条，游标需配合。
3. **perceivedEvents 来源调整**：perceivedEvents 只取本 tick 新 dispatch 的 event，不取 eventLog.slice(-10) 历史。但这改变感知语义（agent 不再感知近期历史），需评估行为影响。

方案 1 最贴合根因（agent 侧去重），方案 3 改语义风险高。**待总规划师/审计裁定方向**。

## 5. 待总规划师裁定

1. 修复方向选哪个（agent 去重 / eventLog 游标 / 感知语义调整）？
2. 是否仍属 W1 范围（扩展 event-processing 状态），还是拆为 W2 新波次？
3. agent "已感知 event id" 去重是否触及 public API contract（若加 PersonalMemory 字段）？
4. _nextId 修复是否保留至本根因修复一并提交，还是分开？

## 6. 证据复现

```bash
node scripts/l4-memory-divergence-diag.js   # addExperience timeline 对比
```

诊断基于 `49b18a7`（_nextId 工作树改动保留），不改 production code。
