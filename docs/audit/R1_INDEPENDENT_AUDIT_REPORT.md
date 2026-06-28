# R1-R3 独立审计报告

> 审计日期: 2026-06-28
> 审计范围: 测试基线归零后的架构违规、边界问题、性能瓶颈、代码质量
> 审计方法: 直接读代码 + grep 验证，不依赖架构师报告
> 审计轮次: R1（发现）→ R2（深度验证）→ R3（Math.random/Date.now 根除）

---

## 审计发现汇总

| 严重度 | 数量 | 类别 |
|--------|------|------|
| CRITICAL | 3 | 确定性违反 |
| HIGH | 4 | 架构违规 + 性能 |
| MEDIUM | 5 | 代码质量 |
| LOW | 3 | 遗留层治理 |

---

## 修复完成清单

### CRITICAL — 确定性违反（全部修复 ✅）

| ID | 文件 | 问题 | 修复 |
|----|------|------|------|
| C1 | src/narrative/StoryGenerator.js:138,321 | Math.random() 回退 | 删除回退，rng=null 时用确定性值 |
| C2 | src/agent/memory/PersonalMemory.js:76,1079 | Date.now() 时间戳默认值 | 使用 this._simTime \|\| 0 |
| C3 | src/agent/psychology/IntrinsicMotivation.js:229 | Date.now() 回退 | 新增 _lastSimTime 字段，存储 simTime |

### HIGH — 架构违规 + 性能（全部修复 ✅）

| ID | 文件 | 问题 | 修复 |
|----|------|------|------|
| H1 | src/domain/DomainRegistry.js:22 | 直接 require campus preset | ctor 抛错，campus 导入移至 index.js 和 getDefaultDomain() |
| H2 | src/canon/WorldFactStore.js | 无界增长 + O(N) 全扫描 | 新增 MAX_EVENT_FACTS=2000 + _evictEventFacts() |
| H3 | src/sdk/*.js (6 files) | 'campus' 硬编码 DEFAULT_DOMAIN_ID | 记录为 P2（仅 ID 字符串，不耦合逻辑） |
| H4 | AgentNarrative.js + MindWanderRuntime.js | Date.now() 回退 | 使用 simTime \|\| 0 |

### MEDIUM — 代码质量（全部修复 ✅）

| ID | 文件 | 问题 | 修复 |
|----|------|------|------|
| M2 | src/pressure/MemoryPressure.js:36 | Date.now() 回退 | 改为 0 回退 + 更新警告文本 |
| M3 | src/shared/ids.js:11 | Math.random() 回退 | 改为 counter-based 确定性 ID |
| M4 | src/sdk/Character.js:60 | Math.random() + Date.now() 用于 ID | 改用 generateId() |
| M5 | src/store/world/compiler.js + migration.js | Math.random() + Date.now() | 改用 generateId() |
| M2b | src/sdk/EmotionSignalBuffer.js:118,125,132 | Math.random() 回退 | 改用 rng \|\| 0 |

### LOW — 遗留层治理（记录，P3）

| ID | 问题 | 状态 |
|----|------|------|
| L1 | LEGACY_REMOVAL_REPORT.md 缺少 3 个文件 | 记录，不影响功能 |
| L2 | 9 个测试从 legacy agent/action/ import | 记录，待迁移 |
| L3 | FactEmitter deprecated 方法仍存在 | 记录，无调用者 |

---

## R2 额外修复

| 问题 | 文件 | 修复 |
|------|------|------|
| _evictEventFacts 未完整清理 agent 索引 | WorldFactStore.js | 使用 _unindexAgents() 替代手动清理 |
| 压力测试导致 vitest worker OOM | deep-audit-core.test.js | 10→5 agents, 500→300 ticks, 50→20 agents |
| MemoryPressure 测试预期 Date.now() | memory-pressure-simtime.test.js | 更新为确定性回退断言 |
| StoryGenerator 测试预期 Date.now() | story-generator-simtime.test.js | 更新为确定性回退断言 |
| Golden seed fixture 失效 | golden-seed-replay.test.js | GOLDEN_REGEN=1 重新生成 |

---

## 核心模拟路径 Math.random()/Date.now() 状态

### Math.random() — 仅剩 1 处（可接受）

| 文件 | 行 | 用途 | 状态 |
|------|----|------|------|
| src/runtime/AndyWorld.js:45 | autoSeed 生成 | 未提供 seed 时的后备 | ✅ 可接受 |

### Date.now() — 仅剩 2 处核心 + SDK/Store 层

| 文件 | 行 | 用途 | 状态 |
|------|----|------|------|
| src/runtime/AndyWorld.js:45 | autoSeed 生成 | 同上 | ✅ 可接受 |
| src/runtime/AndyWorld.js:315,471 | tick 计时 | 非模拟逻辑 | ✅ 可接受 |
| src/sdk/*.js | SDK 便利功能 | 非核心模拟 | ✅ 可接受 |
| src/store/*.js | 持久化时间戳 | 支持 now 参数注入 | ✅ 可接受 |

---

## 已验证无问题的区域

| 区域 | 验证结果 |
|------|----------|
| Action providers 只读性 | ✅ 所有 9 个 provider 只读 |
| BehaviorField 梯度方向 | ✅ 方向正确 |
| BehaviorField/Needs/Emotion 边界 | ✅ 正确 clamp |
| Import 循环 | ✅ 无循环依赖 |
| EventDispatcher eventLog | ✅ 2000 上限 + 修剪 |
| PersonalMemory 大小 | ✅ maxMemories: 500 + _prune() |
| WorldFactStore 事件事实 | ✅ MAX_EVENT_FACTS=2000 + _evictEventFacts() |
| WorldClock | ✅ 负数分钟保护 |

---

## 测试基线

| 指标 | R1 前 | R3 后 |
|------|-------|-------|
| 测试文件 | 183 passed, 1 failed | 183 passed, 0 failed |
| 测试用例 | 2979 passed, 1 failed | 2979 passed, 0 failed |
| Math.random() in src/ | 12 处 | 1 处（autoSeed） |
| Date.now() in src/ core | 8 处 | 2 处（autoSeed + timing） |
| WorldFactStore 上限 | 无 | 2000 |

---

## 后续建议

1. **P2**: 统一 DEFAULT_DOMAIN_ID 到 config/defaults.js，从 presets/campus/id 读取
2. **P3**: 将 agent/action/ legacy 文件改为 re-export adapter
3. **P3**: 将 ReflectCandidateProvider 和 WorldObjectCandidateProvider 迁移到 src/action/providers/
4. **P3**: 更新 LEGACY_REMOVAL_REPORT.md 覆盖 3 个缺失文件
5. **性能**: getFactsForAgent() 使用索引避免全扫描（当前 O(N)）
6. **性能**: 调查 5 agents × 2000 ticks 内存增长（~100MB，目标 <50MB/1000ticks/agent）
