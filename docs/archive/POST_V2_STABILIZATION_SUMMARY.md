# Post-v2 Stabilization Summary

> 汇总 v2.0.0 发布后至 v2.1 之间的 stabilization 工作，包括 batch 补丁、审计修复和未来路线图。

---

## Batch 1: Fresh Install QA / Dependency Audit

**目标**: 验证 clean install 流程和 package 发布质量。

| 检查项 | 结果 |
|--------|------|
| `npm pack` tarball clean install | Pass |
| public import paths | Pass |
| `createEngine` / `createCharacter` / `tick` / `getNarrative` | Pass |
| custom tavern domain | Pass |
| consumer typecheck | Pass |
| package contents | Pass |
| `npm audit` | 1 high — vite dev-only / Windows-only (非阻塞) |
| `npm audit --omit=dev` | 0 vulnerabilities |

**结论**: 生产依赖无已知漏洞，clean install 流程正常。

---

## Batch 2: SDK Determinism / Private Access Cleanup

**目标**: 清理 SDK 层非确定性行为和直接 private 属性访问。

- **EmotionSignalBuffer deterministic hygiene** — 确保情绪信号缓冲区在 seeded RNG 下行为一致。
- **Private access getter cleanup (H1-H4)** — 消除 `agent.state`, `agent.internalState`, `agent.memory`, `agent.relationships` 的直接属性访问，统一走 getter。
- **新增 domain / socialGraph / behaviorParams getter** — 扩展公开访问面。
- **新增 `getAllAgentIds()` 方法** — 避免直接遍历内部 agent map。

---

## Batch 3: SemanticProfile Migration

**目标**: 将中文硬编码关键字迁移到 domain preset，实现 core 零中文。

- 从 `defaults.js` 提取中文关键字到 `presets/campus/semanticProfile.js`。
- 添加 `domain.semanticProfile` 字段验证。
- 替换 `defaults.js` 中的中文关键字为英文 fallback。
- 添加集成测试验证自定义 domain 的 SemanticProfile 注入。
- 加强 source-scan 规则检测中文 fallback。

**文档**: `docs/SEMANTIC_PROFILE_RFC.md`

---

## Batch 4: AffectFrame Narrative Input Seam

**目标**: 为 NarrativeBuilder 引入结构化 AffectFrame 输入，解决 string parsing debts。

- NarrativeBuilder 支持 AffectFrame 结构化输入。
- 解决 6 项 P0/P1 string parsing debts。
- 保持向后兼容（旧 string 格式仍可用）。

**文档**: `docs/AFFECT_COMPILER_RFC.md`

---

## Stage 1: Remaining Narrative Contract Cleanup

**目标**: 消除 narrative 层的 sentinel string 滥用。

- `nearbyPeople` sentinel 支持结构化输入（对象数组 → 格式化字符串）。
- `recentEvents` sentinel 支持结构化输入（事件对象 → 格式化字符串）。

**文档**: `docs/NARRATIVE_CONTRACT_AUDIT.md`

---

## Stage 2: Diagnostics and Logging Cleanup

**目标**: 统一诊断输出，消除散落的 `console.*` 调用。

- 所有 `console.*` 调用统一到 `Diagnostics` 模块。
- optional native warning 使用 `warnOnce` 避免重复输出。

---

## Stage 3: Store Time Semantics Audit

**目标**: 确保查询层正确使用 simulation time 而非 wall-clock time。

- `SQLiteStore` 查询方法支持 optional `now` 参数。
- `SimulationStore` 查询调用优先使用 `virtualTime`。
- 创建完整的 Store 时间语义审计文档。

**文档**: `docs/STORE_TIME_SEMANTICS_AUDIT.md`

---

## Stage 4: Remaining Private Access Audit Patch

**目标**: 消除剩余的直接 private 属性访问。

| 旧访问 | 新 API |
|--------|--------|
| `eventDispatcher._simTime` | `setSimTime()` / `getSimTime()` |
| `memory._simTime` | `getSimTime()` |
| `agent._rand` | `rand()` |

**文档**: `docs/PRIVATE_ACCESS_AUDIT.md`

---

## Release Classification

### 适合 v2.0.1

| 项目 | 状态 |
|------|------|
| Batch 2: SDK determinism / private access cleanup | Done |
| Batch 3: SemanticProfile migration | Done |
| Stage 1: Narrative contract cleanup | Done |
| Stage 2: Diagnostics cleanup | Done |
| Stage 3: Store time semantics | Done |
| Stage 4: Private access cleanup | Done |

### 应推到 v2.1

| 项目 | 说明 |
|------|------|
| Batch 4: AffectFrame narrative seam | 需要更完整的 AffectCompiler 支撑 |
| Memory structured input | 依赖 AffectFrame 完整实现 |
| ForbiddenTerms regex | domain 验证层增强 |

### v3 Aliveness Roadmap

| 项目 | 说明 |
|------|------|
| 完整 AffectCompiler 实现 | 结构化情绪 → 行为向量映射 |
| Knowledge propagation runtime | agent 间知识传播机制 |
| Grounding checker v2 | 更严格的事实一致性检查 |
| StoryArc runtime | 长线叙事弧自动管理 |
| WorldObject integration | 世界对象交互系统 |

---

## 相关文档索引

- `docs/PUBLIC_API_CONTRACT.md` — 公开 API 边界
- `docs/PRIVATE_ACCESS_AUDIT.md` — Private 属性访问审计
- `docs/SEMANTIC_PROFILE_RFC.md` — SemanticProfile 迁移设计
- `docs/AFFECT_COMPILER_RFC.md` — AffectCompiler 设计
- `docs/NARRATIVE_CONTRACT_AUDIT.md` — Narrative 合约审计
- `docs/STORE_TIME_SEMANTICS_AUDIT.md` — Store 时间语义审计
- `docs/DETERMINISM_SCOPE.md` — 确定性范围
- `docs/RELEASE_NOTES_v2.0.0.md` — v2.0.0 发布说明
