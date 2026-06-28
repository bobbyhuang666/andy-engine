# Bug Ledger — Round 4

> 生成时间: 2026-06-28
> 审计方法: 4 路并行审计子 AI (narrative/canon/knowledge, spatial/social, handlers/lifecycle, config/presets) + 指挥师自主审计
> 核验原则: 每个 bug 独立验证复现路径，确认后修复并验证
> 更新时间: 2026-06-28

---

## P1 — CONFIRMED（1 个）→ 已修复

| ID | 来源 | 严重度 | 核验结论 | 修复状态 |
|---|---|---|---|---|
| R4-EFF-001 | 自主审计 | P1 | CONFIRMED | ✅ FIXED |

### R4-EFF-001: EventEffectPipeline agentId 始终为 'unknown' — agentSnapshot 结构误读

- **文件位置**: `src/effects/EventEffectPipeline.js:37,85`
- **证据**:
  1. `applyActionEffect()` 第37行: `agentSnapshot?.id || 'unknown'`，但 `agentSnapshot` 由 `buildActionContext()` 构建，结构为 `{ agent: { id, position, ... }, behaviorField, needs, ... }`
  2. `computeDeltas()` 第85行: 同样的 `agentSnapshot?.id` 误读
  3. 结果：当 action selection 启用时，所有 action_selected/action_none 事件的 agentId 都会是 'unknown'，导致 deltas 无法匹配到正确的 agent
  4. 第116行 `agentSnapshot?.agent?.position` 是正确的，说明代码库内部对该结构有认知不一致
- **修复方案**: 改为 `agentSnapshot?.agent?.id || agentSnapshot?.id || 'unknown'`（向后兼容两种格式）
- **修复文件**: `src/effects/EventEffectPipeline.js`
- **回归测试**: 169/169 non-audit tests pass
- **影响范围**: 当前 action selection 默认 disabled（`enabled: false`），所以此 bug 在默认配置下处于休眠状态。一旦启用 action selection，所有 action 事件和 deltas 都会丢失 agentId

---

## P2 — 已知限制（非本轮修复）

| ID | 描述 | 状态 |
|---|---|---|
| R4-P2-001 | ScheduleHandler 仍通过直接写回修改 position/memory（5处），已被 STATE_WRITEBACK_OWNERSHIP.md 标记为 "owned by subsystem / Tick-internal" | 已知遗留 |
| R4-P2-002 | 单个 agent 的 tick 崩溃会终止整个 world.tick()，无 try-catch 隔离 | 防御性改进 |
| R4-P2-003 | Tavern preset skipBehavior 键名 'skipClass'/'skipWork' 虽不是 domain.states 名称但作为 scenario identifier 是正确的 | 非bug |

---

## 收敛状态

- P0 confirmed = **0** ✅
- P1 confirmed 待修复 = **0** ✅ — R4 修复 1 个 P1
- P0+P1 本轮修复 = **1 个** ✅ — R4-EFF-001
- 连续审计未发现新 P0 = **4 轮** ✅
- 连续审计未发现新 P1（排除 R4-EFF-001）= **1 轮**
- npm test = **169 passed / 0 failed** ✅
- npm run check:boundaries = **all pass** ✅
- npm run test:domain = **81/81 pass** ✅

**发布状态: FROZEN** — 不得 npm publish / tag / release
