# Memory Deletion Root-Cause Report (v2.2-W0c)

> 阶段：v2.2-W0c 诊断（非实现）
> 诊断脚本：`scripts/l4-memory-deletion-diag.js`
> 基线 commit：`8643fc6`（W0c 任务卡），基于 W1 partial（_nextId 修复保留工作树未提交）
> 状态：第三层根因证据链闭合，待独立审计复核

## 0. 摘要

W0c 定位 L4 第二层分叉（_nextId 修复后暴露）的精确根因：**`Agent._ticksSinceReflection` / `_ticksSinceDriftCheck` 等 reflection 周期计数器未持久化**。

恢复后这些计数器重置为 0（`agent/Agent.js:82-85` 构造初值，AgentSerializer 不含），续跑需重新累计到 `_reflectionInterval` 才触发 `reflect()` → `memory.consolidate()`。full 在 tick 60 达阈值触发 consolidate（删 61 条 memory），restored 恢复后从 0 累计，tick 60 未达阈值不触发 consolidate，memory 不删，导致分叉。

W0b"感知去重"方向错误（已 REJECTED）。W0c 聚焦删除路径，根因闭合。

## 1. 诊断方法

`scripts/l4-memory-deletion-diag.js`：全局 instrument `Array.prototype.splice`（仅诊断脚本内，临时）捕获所有 memory 数组 splice 调用 + caller stack。dump tick 55-59 每 tick memory 数组变化（新增/删除 ids）。

补充：grep 源码定位 `consolidate` / `_ticksSinceReflection` 持久化状态。

## 2. 关键证据

### 2.1 tick 55-59 memory 变动对比（full vs restored 一致）

| tick | full memLen | restored memLen | 一致? |
|---|---|---|---|
| 55 | 56 | 56 | ✓ |
| 56 | 63 | 63 | ✓ |
| 57 | 70 | 70 | ✓ |
| 58 | 77 | 77 | ✓ |
| 59 | 84 | 84 | ✓ |
| **60** | **28** | **90** | **✗ 分叉** |

tick 55-59 两边 memLen 完全一致——证明 _nextId 修复后恢复点正确，前 9 tick 续跑一致。

### 2.2 tick 60 分叉：full 触发 consolidate，restored 不触发

full t60：memLen 84→28，删除 61 条。
restored t60：memLen 84→90，新增 6 条，无删除。

全局 splice instrument 捕获 full t60 删除路径：
```
splice calls on memory arrays during t60: 123
{"len":90,"start":84,...,"caller":"PersonalMemory.consolidate (src/agent/memory/PersonalMemory.js:738:21)"}
{"len":89,"start":78,...,"caller":"PersonalMemory.consolidate (...)"}
...（123 次 splice，全部 consolidate 触发）
```

**删除由 `PersonalMemory.consolidate()`（line 738 splice）触发，不是 `_prune`**。_prune instrument 显示 0 calls——此前 W0b 诊断脚本只 instrument _prune，漏了 consolidate，导致误判。

### 2.3 consolidate 触发链

```
ReflectionHandler.tick() (ReflectionHandler.js:18-21)
  → agent._ticksSinceReflection++
  → if (_ticksSinceReflection >= _reflectionInterval)
      → reflect(agent)  (ReflectionRuntime.js:15)
        → agent.memory.consolidate()  (ReflectionRuntime.js:17-18)
          → this.memories.splice(idx, 1)  (PersonalMemory.js:738, 删除低重要性重复 memory)
```

### 2.4 _ticksSinceReflection 未持久化

```
agent/Agent.js:82:  this._ticksSinceReflection = 0;   // 构造初值
agent/Agent.js:83:  this._reflectionInterval = AGENT_DEFAULTS.reflectionInterval;
agent/Agent.js:85:  this._ticksSinceDriftCheck = 0;  // 构造初值
```

`AgentSerializer.toJSON`（`src/agent/facade/AgentSerializer.js`）不含 `_ticksSinceReflection` / `_ticksSinceDriftCheck`。`AgentSubsystemFactory.restoreSubsystems` 不恢复这些计数器。**恢复后重置为 0**。

## 3. 八问题回答

### Q1 首个 memory 数组分叉 tick 是多少？
**tick 60**（tick 55-59 两边 memLen 完全一致，t60 full=28 vs restored=90）。

### Q2 第一条被 full 删除但 restored 保留的 memory 是哪条？
full t60 consolidate 删除 61 条（mem_maya_72...mem_maya_122 为主，低重要性重复）。restored 保留全部。首条被删（splice 第一个）：从 splice instrument `start:84` 起删，即 mem_maya_84 附近的高索引低重要性 memory。

### Q3 删除/替换由哪个函数触发？
`PersonalMemory.consolidate()`（`PersonalMemory.js:678` 定义，`:738` splice 删除），由 `ReflectionRuntime.reflect()`（`:17-18`）调用，由 `ReflectionHandler.tick()`（`:18-21` 周期触发）调度。

### Q4 触发条件依赖哪个状态？
`Agent._ticksSinceReflection` 计数器（`agent/Agent.js:82`）。ReflectionHandler.tick 每 tick 自增，达 `_reflectionInterval` 时触发 reflect→consolidate。

### Q5 该状态是否被 toJSON/fromJSON 持久化？
**否**。`_ticksSinceReflection` / `_ticksSinceDriftCheck` 未在 `AgentSerializer.toJSON` 输出，未在 `AgentSubsystemFactory.restoreSubsystems` 恢复。恢复后重置为 0（构造初值）。

### Q6 restored 为什么没有触发同样删除？
restored 恢复后 `_ticksSinceReflection=0`（重置），续跑需重新累计到 `_reflectionInterval` 才触发。tick 60 时 restored 的计数器未达阈值，不触发 consolidate，memory 不删。full 的计数器从 tick 0 累计，tick 60 达阈值触发。

### Q7 这是 memory runtime state 缺口，还是 _nextId 修复后的次级行为暴露？
**memory runtime state 缺口**（agent reflection 周期计数器未持久化）。非 _nextId 副作用——_nextId 修复仅解决 event id 计数器；本根因是 reflection 调度状态缺失，独立缺陷。_nextId 修复前此问题被 event id 冲突掩盖（memory 生成路径不同，consolidate 触发时机表现不同）。

### Q8 修复范围是否仍限于 runtimeSnapshot 内部？
**是**。`_ticksSinceReflection` / `_ticksSinceDriftCheck` 属 agent runtime state，进入 `engine.toJSON().agents.<id>` 的 runtimeSnapshot（AgentSerializer 扩展）。不触及 Stable Envelope 顶层字段，不需 schemaVersion bump（同 _nextId，runtimeSnapshot opaque payload 内部补全）。

## 4. 同类风险审计（reflection 周期计数器）

| state | 持久化 | 风险 |
|---|---|---|
| `_ticksSinceReflection` | ❌ 不持久化 | **高**：续跑后 reflection 周期重置，consolidate 时机偏移 |
| `_ticksSinceDriftCheck` | ❌ 不持久化 | **中**：续跑后 personality drift 检查周期重置 |
| `_reflectionInterval` | ✅ 来自 AGENT_DEFAULTS（配置常量，非 runtime state） | 无风险 |

## 5. 修复方向建议（非实现，待 W1 扩展或 W2）

- **AgentSerializer.toJSON** 增加 `_ticksSinceReflection` / `_ticksSinceDriftCheck` 输出。
- **AgentSubsystemFactory.restoreSubsystems** 恢复这些计数器（best-effort：缺字段时默认 0，旧存档兼容）。
- 属 runtimeSnapshot opaque payload 内部补全，不 bump schemaVersion（同 _nextId）。

## 6. W1 范围判断

W1（Persistence Fidelity Runtime State Restore）原聚焦 EventDispatcher._nextId。W0c 揭示需扩展到 agent reflection 周期计数器。建议：

- **W1 扩展**：一并修 `_ticksSinceReflection` / `_ticksSinceDriftCheck`（同属 runtime state restore，同类缺陷）。
- 或 **拆 W2**：若总规划师认为 reflection 计数器属独立议题。

待总规划师裁定。

## 7. 待总规划师裁定

1. 修复范围：W1 扩展（一并修 reflection 计数器）还是拆 W2？
2. `_ticksSinceDriftCheck` 是否一并修（personality drift 周期，审计 §4 中风险）？
3. _nextId 修复 + reflection 计数器修复是否一并提交（待 L4 闭合后）？
4. golden fixture 是否需重生成（reflection 计数器不进 tickHash，fixture 可能无需重生成——待实测）？

## 8. 证据复现

```bash
node scripts/l4-memory-deletion-diag.js   # tick 55-59 memory 变动对比
```

诊断基于 `8643fc6`（_nextId 工作树改动保留），不改 production code。
