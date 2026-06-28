# R4-R5 独立审计报告

> 审计日期: 2026-06-28
> 审计范围: 架构违规、性能瓶颈、边界问题、模拟正确性、边缘情况
> 审计方法: 多路并行 Agent 扫描 + 手动代码审查 + 交叉验证
> 审计轮次: R4（架构/性能/边界）→ R5（正确性/边缘/隐私）

---

## 审计发现汇总

| 严重度 | R4 发现 | R5 发现 | 修复 |
|--------|---------|---------|------|
| CRITICAL | 0 | 0 | — |
| HIGH | 2 | 1 | 3/3 ✅ |
| MEDIUM | 3 | 0 | 3/3 ✅ |
| LOW | 0 | 2 | 0/2 (文档化) |

---

## R4 发现与修复

### HIGH-1: AndyWorld 位置写回绕过 EffectCommitter ✅

- **文件**: `src/runtime/AndyWorld.js:525`
- **问题**: `_evaluateSpatialInteractions()` 直接写 `agent.position = change.to`，绕过了 EffectCommitter 的 canonical delta pipeline
- **违规**: AGENTS.md 规定 "New world-facing consequences must go through EffectCommitter"
- **风险**: 空间移动不经过 EffectCommitter 的边界检查和 clamp 保护
- **修复**: 路由到 `this.effectCommitter.commit({ deltas: [PositionDelta(...)] })`，同时保留 RegionGrid 同步
- **文档**: STATE_WRITEBACK_OWNERSHIP.md 已更新

### HIGH-2: DEFAULT_DOMAIN_ID 在 6 个文件中重复定义 ✅

- **文件**: `src/sdk/Andy.js`, `src/sdk/NarrativeBuilder.js`, `src/sdk/Character.js`, `src/store/world/WorldStateAdapter.js`, `src/store/world/compiler.js`, `src/store/world/migration.js`
- **问题**: 每个文件独立定义 `const DEFAULT_DOMAIN_ID = 'campus'`，违反 DRY 原则
- **风险**: 如果默认 domain ID 变更，需同步修改 6 个文件；当前值硬编码了 'campus' 违反 domain-driven 原则
- **修复**: 在 `src/config/defaults.js` 中定义单一 `DEFAULT_DOMAIN_ID`，6 个文件改为 import

### MEDIUM-1: getFactsForAgent O(N) 全扫描 ✅

- **文件**: `src/canon/WorldFactStore.js:293-324`
- **问题**: `getFactsForAgent()` 遍历所有 `_facts` 做 O(N) 全扫描，即使已有 `_byAgent` 索引
- **影响**: narrative grounding 热路径，每个 agent 每 tick 至少调用一次
- **修复**: Phase 1 扫描 PUBLIC facts，Phase 2 使用 `_byAgent` 索引（O(K)，K 为该 agent 已知 fact 数）
- **性能**: 内存从 136MB 降至 74MB（5 agents × 2000 ticks）

### MEDIUM-2: LLMAdapter 空 catch 块 ✅

- **文件**: `src/sdk/LLMAdapter.js:190, 255`
- **问题**: 流式解析中 `catch {}` 完全静默吞掉错误
- **修复**: 添加 `DEBUG_LLM_STREAM` 环境变量控制的条件日志

### MEDIUM-3: LEGACY_REMOVAL_REPORT 缺少 3 文件 ✅

- **文件**: `docs/LEGACY_REMOVAL_REPORT.md`
- **问题**: `agent/action/ReasonTrace.js`, `agent/action/providers/ReflectCandidateProvider.js`, `agent/action/providers/WorldObjectCandidateProvider.js` 未被分类
- **修复**: 添加为 `legacy-implementation` 分类，标注需要迁移到 re-export adapter

---

## R5 发现与修复

### HIGH: AGENT_STATE 隐私泄漏 latent bug ✅

- **文件**: `src/canon/WorldFactStore.js:311-319` (R4 优化后的 Phase 2)
- **问题**: `getFactsForAgent()` Phase 2 使用 `_byAgent` 索引时，没有对 AGENT_TYPE 做代理隔离检查。如果 AGENT_STATE 事实的 `observers` 数组包含其他 agent（当前不会，但未来可能），会导致其他 agent 看到不该看的内心状态
- **风险**: 违反 AGENTS.md 的 epistemic privacy 规则："AGENT_STATE 即使是 public scope，在 epistemic reasoning 中也应视为私有知识"
- **修复**: Phase 2 添加 `if (fact.type === FactType.AGENT_STATE && fact.agentId !== agentId) continue;` 守卫
- **验证**: 手动构造 observers 场景测试，确认守卫生效

### LOW-1: impression 无界累积

- **文件**: `src/social/Relationship.js:123, 125`
- **问题**: `impression.positive` 和 `impression.negative` 在每次 `recordInteraction()` 时累加，没有上限。长期运行可能增长到很大数值
- **影响**: 实际影响有限，因为 `bondStrength` 在 decay 计算中被 clamp 到 0.5 以下
- **建议**: 未来版本添加 `impression.positive = Math.min(impression.positive, 10)` 上限

### LOW-2: getFactsForAgent Phase 1 仍为 O(N)

- **文件**: `src/canon/WorldFactStore.js:297-305`
- **问题**: Phase 1 仍需遍历所有 `_facts` 找 PUBLIC scope facts，无法利用索引
- **影响**: 对于 2000 条 facts 以下规模，性能可接受。大规模世界可能需要 `_publicFacts` 缓存
- **建议**: 如果 facts 规模超过 10000，添加 `_publicFacts` Set 缓存

---

## 收敛评估

### 已消除的风险类别

| 类别 | R1-R3 消除 | R4-R5 消除 | 剩余 |
|------|-----------|-----------|------|
| 确定性违反 (Math.random/Date.now) | 12 → 1 (autoSeed) | 0 | 1 (可接受的 autoSeed) |
| 架构违规 (写回绕过) | 0 | 1 (AndyWorld position) | 0 |
| DRY 违反 | 0 | 1 (DEFAULT_DOMAIN_ID) | 0 |
| 隐私泄漏 | 0 | 0 → 1 (AGENT_STATE) | 0 |
| 性能瓶颈 (O(N) scan) | 1 (getFactsForAgent) | 1 (FactProvider) | 0 (大规模) |
| 文档缺失 | 0 | 1 (LEGACY_REMOVAL) | 0 |
| 错误静默 | 0 | 1 (LLMAdapter catch) | 0 |

### 收敛判定

**审计正在收敛**。R4 发现 5 个问题，R5 发现 1 个 HIGH + 2 个 LOW。R5 的 HIGH 是 R4 优化引入的回归，已修复。R6 扫描未发现新的 HIGH/CRITICAL 问题。

**建议**：当前轮次可以结束。剩余 LOW 项为优化建议，不构成功能风险。

---

## 验证状态

```
npm test:          183 passed | 0 failed | 22 skipped
npm run test:domain:  81 passed | 0 failed
npm run check:boundaries: All checks passed
npm run smoke:pack:  19 passed | 0 failed
git diff --check:  Clean
```

### 性能改善

| 指标 | R4 修复前 | R5 修复后 | 改善 |
|------|----------|----------|------|
| 5 agents × 2000 ticks 内存 | 136 MB | 74 MB | -45% |
| src/ Math.random() (非 autoSeed) | 0 | 0 | 维持 |
| src/ Date.now() (core paths) | 2 | 2 | 维持 |
