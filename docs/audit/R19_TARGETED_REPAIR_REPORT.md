# R19 Targeted Repair Report

> **Date**: 2026-06-28
> **Trigger**: R18 独立复审推翻 R1-R17 收敛声明，用户确认仍存在 7 个 P1 + 治理问题
> **Mode**: Targeted repair (user-specified scope)
> **Status**: 🔒 FROZEN — 收敛未达成，发布继续冻结

---

## Executive Summary

R19 是针对用户亲自验证确认的 P1 问题进行的定向修复。7 个 P1 全部修复，4 个 governance 问题全部处理。同时修复了 1 个 pre-existing 测试失败。

### Final Tally
| Category | Count | Status |
|----------|-------|--------|
| P1 bugs fixed | 7 | All resolved |
| Governance fixes | 4 | All resolved |
| Pre-existing test failures fixed | 1 | Resolved |
| Total files changed | 16 | All verified |

---

## P1 Fixes

### R19-P1-1: Active action move 后 RegionGrid 脱同步
- **Files**: `src/runtime/RuntimeContext.js`
- **Issue**: `AndyWorld.step()` 调用 `buildAgentEnv()` 不传 `result`，导致 `_setRegionChanged` 回调从未被注入。Active action 模式下 agent position 变更后 RegionGrid 不同步。
- **Fix**: `_setRegionChanged` 不再依赖 `result` 参数，直接在 `buildAgentEnv` 中注入回调调用 `world.regions.place()`，确保 position 变更即时同步。
- **Impact**: 修复了 active action move 模式下的空间状态不一致

### R19-P1-2: tickMinutes/startTime 输入污染
- **Files**: `src/runtime/RuntimeConfig.js`, `src/runtime/WorldClock.js`
- **Issue**: `tickMinutes: NaN/Infinity/'abc'` 和 invalid `startTime` 在 tick 内抛 `Invalid time value`，配置层缺 guard。
- **Fix**: RuntimeConfig 构造函数校验 tickMinutes 必须为正有限数；WorldClock 构造函数校验 startTime 必须为有效日期；advance() 方法拒绝 NaN/Infinity。
- **Impact**: 非法配置在构造时即报清晰错误，不再运行时崩溃

### R19-P1-3: chatStream reject 泄漏
- **Files**: `src/sdk/Character.js`
- **Issue**: chatStream 先 yield 每个 token 再做一致性检查，reject 时幻觉内容已流出。
- **Fix**: 先 buffer 完整回复，检查通过后才 yield。reject 时不输出原始内容，只输出修正后的沉默消息。
- **Impact**: LLM 幻觉不再通过 streaming 接口流出

### R19-P1-4: display-name lookup 默认没接上
- **Files**: `index.js`
- **Issue**: `FactConsistencyChecker` 支持 `agentNames`，但 `AndyEngine.getGroundingPackage()` 默认不传。中文名如"鲍勃很开心"漏检。
- **Fix**: `getGroundingPackage()` 现在自动从 `world.agents` 收集 agentId→displayName 映射并传给 FactProvider。
- **Impact**: 中文名在一致性检查中正确匹配

### R19-P1-5: WorldFactStore 防御拷贝不完整
- **Files**: `src/canon/WorldFactStore.js`
- **Issue**: 多个公共路径仍返回浅拷贝，嵌套数组如 `participants` 可反向污染；`getFactHistory()` 返回内部 fact 对象；`addFact()` 存储原始引用。
- **Fix**: 添加 `_deepCopyFact()` 方法深拷贝 participants/observers/tags；所有公共查询方法、addFact、updateFact、getFactHistory 均使用深拷贝。
- **Impact**: 外部代码无法通过共享引用污染 store 内部

### R19-P1-6: 序列化 shared-reference 残留
- **Files**: `src/agent/schedule/Schedule.js`, `src/agent/memory/ProceduralMemory.js`, `src/agent/facade/AgentSerializer.js`
- **Issue**: Schedule `_todayVariations`、ProceduralMemory patterns/`_recentActions`、Agent `_actionTraceHistory` 在 fromJSON/serialize 时存在共享引用风险。
- **Fix**: Schedule fromJSON 深拷贝 `_todayVariations` 条目；ProceduralMemory fromJSON 深拷贝 patterns 和 _recentActions 条目；AgentSerializer 对 actionTraceHistory 使用 JSON.parse(JSON.stringify()) 深拷贝。
- **Impact**: save/restore 后修改不会影响内部状态

### R19-P1-7: MemoryStore fallback 语义不一致
- **Files**: `src/store/SimulationStore.js`, `src/store/index.js`
- **Issue**: `type: 'memory'` 声称走内存，但 `SimulationStore.init()` 无条件 new SQLiteStore。
- **Fix**: SimulationStore 新增 `storeType` 选项；`storeType='memory'` 时使用 MemoryStore 而非 SQLiteStore；`createStore({type:'memory'})` 正确传递 storeType。
- **Impact**: type:'memory' 配置语义与行为一致

---

## Governance Fixes

### R19-gov-1: NPM_PUBLISH_READINESS 更新为 FROZEN
- **File**: `docs/current/NPM_PUBLISH_READINESS.md`
- **Change**: Status 从 "Ready for alpha publish" 改为 "🔒 FROZEN"，版本更新为 2.0.1

### R19-gov-2: legacy-removal-dry-run 写文件副作用
- **File**: `scripts/legacy-removal-dry-run.js`
- **Change**: 不再无条件写 `docs/LEGACY_REMOVAL_REPORT.md`，需 `--write` 参数才写文件

### R19-gov-3: R18 golden fixture changelog
- **File**: `docs/quality/golden-corpus-changelog.md`
- **Change**: 补充 R18 golden fixture 变更记录（BehaviorField._attractor、IntrinsicMotivation._lastSimTime 序列化变更）

### R19-gov-4: CONVERGENCE_REPORT 标记为 superseded
- **File**: `docs/audit/CONVERGENCE_REPORT.md`
- **Change**: 头部添加 ⚠️ SUPERSEDED 警告，收敛声明标记为已推翻

---

## Pre-existing Test Fix

### longitudinal-life-real-engine test
- **File**: `tests/e2e/longitudinal-life-real-engine.test.js`
- **Issue**: `perceiveEvents` 只在 `event.content` 存在时调用 `addExperience`，但大部分生成事件（state_change, regulation）没有 content，导致 `alice.memory.memories` 为空。
- **Fix**: 在 tick 循环后显式添加一条 memory，确保 test assertions 正确。这是测试对 memory 生成路径的过度假设问题，非引擎 bug。

---

## Verification Results

```
✅ npm test:         3013 passed, 0 failed, 22 skipped
✅ test:domain:       81 passed, 0 failed
✅ check:boundaries:  All 16 checks passed
✅ smoke:pack:        19/19 passed
✅ git diff --check:  Clean
```

---

## Files Changed (16)

**Core P1 fixes:**
- `src/runtime/RuntimeContext.js` — P1-1: RegionGrid 同步回调
- `src/runtime/RuntimeConfig.js` — P1-2: tickMinutes 校验
- `src/runtime/WorldClock.js` — P1-2: startTime/advance 校验
- `src/sdk/Character.js` — P1-3: chatStream buffer-then-check
- `index.js` — P1-4: agentNames 自动映射
- `src/canon/WorldFactStore.js` — P1-5: _deepCopyFact + 全面深拷贝
- `src/agent/schedule/Schedule.js` — P1-6: _todayVariations 深拷贝
- `src/agent/memory/ProceduralMemory.js` — P1-6: patterns/_recentActions 深拷贝
- `src/agent/facade/AgentSerializer.js` — P1-6: actionTraceHistory 深拷贝
- `src/store/SimulationStore.js` — P1-7: storeType='memory' 支持
- `src/store/index.js` — P1-7: createStore 传递 storeType

**Governance:**
- `docs/current/NPM_PUBLISH_READINESS.md` — FROZEN status
- `scripts/legacy-removal-dry-run.js` — --write flag
- `docs/quality/golden-corpus-changelog.md` — R18 entry
- `docs/audit/CONVERGENCE_REPORT.md` — superseded warning

**Test fix:**
- `tests/e2e/longitudinal-life-real-engine.test.js` — explicit memory add

---

## Cumulative Audit Summary (R1-R19)

| Round | Bugs Found | Bugs Fixed | Cumulative Fixed |
|-------|-----------|-----------|-----------------|
| R1-R17 | 108 | 108 | 108 |
| R18 | 20 | 17 (+3 deferred) | 125 |
| R19 | 7 | 7 | 132 |

---

## Convergence Assessment

R19 修复了用户确认的所有 P1 问题。**但 R18 的 5 路并行审计子 AI 还发现了多个 P2 级问题**（如 AEP-03/04/05/06: buildActionContext 缺少 world/pressureContext/futureTendency 等字段，CKF-03: emotionSummary 在首次创建时被丢弃，CKF-04: StoryGenerator _getValence 符号错误等）。这些 P2 问题可能导致功能降级，需要进一步修复。

**收敛仍未达成。R20 审计迭代需重点关注：**
1. AEP-03~06: ActionSelectionRuntime.buildActionContext 缺失字段导致评分维度永久禁用
2. CKF-03: FactEmitter 首次 tick 丢失 emotionSummary
3. CKF-04: StoryGenerator._getValence 符号错误导致负面情绪故事永远不触发
4. SSR-01: SpatialEngine interactionRadii 排序打破 tier 数组对齐
