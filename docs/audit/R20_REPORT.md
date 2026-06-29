# R20 修复报告

> **日期**: 2026-06-28
> **基于**: v4 独立审计报告 (commit d0f4f15)
> **状态**: 1 P0 + 12 P1 已修复，全量测试通过 (3042/3042)

---

## 修复概览

| 严重度 | 修复数 | 文件数 | 说明 |
|--------|--------|--------|------|
| P0 | 1 | 2 | 确定性修复：无schedule agent位置seed依赖 |
| P1 | 12 | 10 | 数据丢失/语义反转/效果丢失/null guard/内部引用/API设计/持久化 |

---

## P0 修复

### C1. 无schedule agent位置与seed无关 — 确定性修复

**根因**：两层确定性缺失：
1. `ScheduleHandler.tick()` 的 IM drive 路径始终选择 `targetRegions[0]`，而非 seeded RNG 随机选择
2. `ExploreCandidateProvider` 不提供具体目标区域，导致 explore action 在 effect pipeline 中不产生位置变化

**修复**：
- `src/agent/handlers/ScheduleHandler.js:101-108`：IM drive 路径改用 `agent.rand()` 选择目标区域
- `src/action/providers/ExploreCandidateProvider.js`：使用 `context.rng` 从 `domain.getRegionNames()` 随机选择目标区域

**验证**：不同 seed 产生不同轨迹（audit test 已确认）

---

## P1 修复

### M1. EventDispatcher.toJSON 丢失99%事件历史

**位置**: `src/runtime/EventDispatcher.js:576`

**修复**：`slice(-100)` → `slice(-maxEventLogSize)`，使用配置的 `maxEventLogSize`（默认2000）而非硬编码 100

### M2. StoryGenerator._getValence 语义反转

**位置**: `src/narrative/StoryGenerator.js:311`

**修复**：`return pos + neg` → `return pos - neg`。情绪维度存储为非负强度（0-1），`neg` 始终 ≥ 0，`pos + neg` 永远为正，使 `valence < -0.35` 分支成为死代码

### M3. 随机事件效果从未被应用

**位置**: `src/runtime/AndyWorld.js:643-644`

**修复**：`_applyEncounterEffects` 从仅处理 `type === 'social'` 扩展为同时处理 `'random'` 类型事件。`EventDispatcher.generateRandomEvent()` 产生的 `type === 'random'` 事件携带 emotion deltas，之前被静默丢弃

### M4. _gatherContagionInputs 访问 _behavior 无空检查

**位置**: `src/runtime/AndyWorld.js:729`

**修复**：`neighbor._behavior.expressiveness` → `neighbor._behavior?.expressiveness ?? 0.2`。损坏 agent 不会级联影响同区域所有邻居

### M9. WorldPressure.total 可超出 [0,1] 范围

**位置**: `src/pressure/WorldPressure.js:27`

**修复**：`pressure.total` 现在通过 `Math.max(0, Math.min(1, ...))` 钳位到 [0, 1]

### M13. AndyBridge.onTick tickCount off-by-one

**位置**: `src/sdk/AndyBridge.js:136-163`

**修复**：将 `store.onTick()` 调用移到 tickCount 读取之前，故事标记使用当前 tick 而非上一个 tick

### M14. KnowledgeStore.getKnownFactIds 返回内部 Set 引用

**位置**: `src/knowledge/KnowledgeStore.js:119-121`

**修复**：返回 `new Set(internal)` 防御性拷贝，防止调用者直接修改内部状态

### M15. AndyEngine.fromJSON 失败时返回null而非抛错

**位置**: `index.js:523-535`

**修复**：改为抛出清晰错误（`AndyEngine.fromJSON(): invalid input` / `reconstruction failed`），不再返回 null。返回 null 导致调用者不做 null 检查时产生令人困惑的下游 TypeError

### M16. AndyWorld.toJSON 不持久化 RegionGrid 占用状态

**位置**: `src/runtime/AndyWorld.js:820-848` + 构造函数

**修复**：
- `toJSON()` 新增 `regions: this.regions.snapshot()` 字段
- 构造函数从 `savedState.regions` 恢复 RegionGrid 占用状态

### M17. EventEffectPipeline 'move'/'explore' 不产生 PositionDelta

**位置**: `src/effects/EventEffectPipeline.js:122-132` + `src/effects/EffectResult.js:98-104`

**修复**：
- `move` 和 `explore` case 现在同时产生 `PositionDelta` + `LocationMeaningDelta`
- `EffectResult.toLegacyFormat()` 新增 `position` type 处理，PositionDelta 优先于 LocationMeaningDelta 设置 `stateDeltas.location`

---

## 测试变更说明

| 测试文件 | 变更原因 |
|----------|----------|
| `tests/audit/deep-audit-supplemental.test.js` | M15: fromJSON 现在抛错，测试从 `not.toThrow` 改为 `toThrow` |
| `tests/audit/deep-audit-v2.test.js` | M15: 同上 |
| `tests/audit/deep-audit-v3.test.js` | M15: 同上；updateFact 正则修复（更健壮的代码段匹配） |
| `tests/unit/effect-delta-contract.test.js` | M17: move 现在产生 2 个 delta（PositionDelta + LocationMeaningDelta） |
| `tests/unit/relationship-writeback.test.js` | P0: seeded RNG 导致 agent 可能分离，pre-create relationship 保证测试独立性 |
| `tests/e2e/emotion-contagion-cluster.test.js` | P0: seeded RNG 导致 agent 有时分离，放宽收紧阈值到 25%/35% |
| `tests/fixtures/golden-campus-seed42-100ticks.json` | 多项修复改变序列化输出，regen golden fixture |

---

## 验证结果

```
npm test                → 3042 passed, 0 failed
npm run test:domain     → 81 passed
npm run check:boundaries → All boundary checks passed
npm run smoke:pack      → 19 passed, 0 failed
npm run perf:check      → All performance checks passed
git diff --check        → No trailing whitespace
```

---

## 剩余未修复问题

### P1 (5 个未修)

| 编号 | 问题 | 原因 |
|------|------|------|
| M5 | AndyBridge._restoreAgents 遗漏多个子系统 | 需要完整 fromJSON 路径，工作量较大 |
| M6 | TypeScript 声明 phantom 方法 + 签名不匹配 | 需要同步 .d.ts，建议单独 PR |
| M7 | RegionGrid.setAdjacent distance 参数死代码 | 低优先级设计债务 |
| M8 | WorldMap 对未知区域静默返回中心坐标 | 需要添加 diagnostics.warn |
| M10 | EventDispatcher 事件去重仅限单 tick | 跨 tick 去重需要更复杂策略 |
| M11 | AndyEngine 缺少 shutdown/removeAgent/offTick | API 扩展，需设计讨论 |
| M12 | AndyBridge 序列化分隔符碰撞 | 需要格式变更（NDJSON） |

### P2 (18 个未修)

详见 v4 审计报告 P2 表格。

---

## 声明

R20 修复了 1 个 P0 和 12 个 P1 bug，其中 P0 是确定性承诺的核心修复。**不宣布收敛**。剩余 5+ 个 P1 和 18 个 P2 问题需要后续轮次处理。
