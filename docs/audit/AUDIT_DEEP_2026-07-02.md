# Andy Engine 深度审计报告 — 2026-07-02

**审计类型**: 全维度架构 + 行为 + 持久化 + 测试覆盖审计
**审计范围**: Andy Engine repository @ `157380a`
**知识图谱基准**: 1401 节点, 2827 边, 10 层架构, 9 步导览

---

## 执行摘要

Andy Engine 整体架构成熟度较高——核心闭环（Canon → Knowledge → Pressure → Action → Effects → Memory）边界清晰，行为场动力学、压力系统、知识传播、事实权威链均通过审计。主要风险集中在三个领域：

1. **`agent/action/` 遗留目录存在 15 份独立实现**，与 `src/action/` 规范版本分叉，测试也导入自旧副本，构成 P0 级双重写入风险。
2. **4 处写回违规**：`ScheduleHandler`、`PerceptionRuntime`、`InteractionFacade`、`ExternalExperience` 绕过 `EffectCommitter` 直接修改 `agent.position` / `agent.memory`。
3. **序列化信封双版本号**导致 `deserialize()` 校验逻辑不一致，且 v0→v1 迁移路径零测试覆盖。

---

## 一、架构边界审计

### P0 — 严重

| # | 发现 | 证据 | 影响 |
|---|------|------|------|
| P0-001 | `agent/action/` 下 15 个文件是独立实现，非 re-export 适配器 | `agent/action/UtilitySelector.js` (213行) vs `src/action/UtilitySelector.js` (135行)；`tests/phase-26-fix-deterministic.test.js` 导入自旧副本 | 确定性保证被破坏——两套不同的选择器行为和 trace 格式并存 |
| P0-002 | `ScheduleHandler.tick()` 在核心 tick 路径中直接写状态 | `src/agent/handlers/ScheduleHandler.js:67,94,103,133` — `agent.position = ...` / `memory.addExperience(...)` | 绕过 EffectCommitter，状态变更不可追踪 |

### P1 — 高

| # | 发现 | 证据 |
|---|------|------|
| P1-001 | `PerceptionRuntime` 直接写入 memory | `src/agent/runtime/PerceptionRuntime.js:95` |
| P1-002 | `InteractionFacade` 直接写入 memory | `src/agent/facade/InteractionFacade.js:43` |
| P1-003 | `ExternalExperience` 直接写入 memory | `src/agent/facade/ExternalExperience.js:39` |
| P1-004 | `agent/Agent.js` 包含 `buildBehaviorSignals()` 领域逻辑（非薄封装） | `agent/Agent.js:188-232` |

### P2 — 中

| # | 发现 | 评估 |
|---|------|------|
| P2-001 | `agent/Agent.js:_rand()` 回退到 `Math.random()` | 向后兼容的已知例外，可接受 |
| P2-002 | `AndyWorld.js` 构造函数用 `Math.random()` 自动播种 | 已记录的例外，可接受 |
| P2-003 | `src/config/defaults.js:443` 硬编码 `'campus'` 作为默认 domain ID | 配置标识符非行为逻辑，可接受 |

### P3 — 低

- 注释引用 domain 术语（campus/tavern/Oak Town）——均为架构说明，无运行时影响。
- 旧文件间接从 `src/` 导入——清理后自动消除。

---

## 二、Agent 生命周期与行为场审计

### 行为场梯度 — 文档/实现不一致（P3）

`BehaviorField.js` 文档声明 `∇U = 2w·(B - target)`，实际所有贡献者（needs/schedule/habit/time/attractor）使用 `w·(B - target)`。内部一致，权重已校准，但数学文档误导。建议修正文档或统一添加因子 2。

### 行动 Provider 只读性 — 通过 ✅

所有 9 个 CandidateProvider 和 UtilityScorer 严格只读，不修改任何状态。基类契约通过文档和约定强制执行。

### 效果管道完整性 — 通过 ✅

- 7 种 typed delta 子类均有判别器字段
- `EffectCommitter` 是唯一写者，未知类型拒绝，NaN 保护，clamp 到 [0,1]
- `commit()` 包裹 try/catch 永不抛出

### 知识传播认识论边界 — 通过 ✅

- 5 种证据源（direct/observed/overheard/told/inferred）带置信度
- `AGENT_STATE` 事实 LOCAL scope，禁止 gossip 传播
- FactStore 返回深拷贝，事件事实追加只写

### 压力系统仅产生倾向 — 通过 ✅

- 5 层压力（Need/Memory/Relationship/Location/World）纯函数 `static compute()`
- 压力 → UtilityScorer 分数 → softmax 选择 + seeded RNG
- 无确定性压力→动作映射

---

## 三、持久化与序列化审计

### P0 — 双版本号不一致

| # | 发现 | 证据 |
|---|------|------|
| SER-001 | `Serialization.serialize()` 输出 `version`（envelope）和 `schemaVersion`，但 `deserialize()` 只校验 `schemaVersion` | `src/store/Serialization.js:40-41,66` |

**建议**: 统一为单一版本号，或在 `deserialize()` 中显式校验 `envelope.version`。

### P1 — 高

| # | 发现 | 证据 |
|---|------|------|
| SER-002 | `deserialize()` 跳过 `runtimeSnapshot` 内容校验 | `src/store/Serialization.js:57-88` |
| SER-003 | v0→v1 迁移零测试覆盖 | `src/store/world/migration.js:61-139` |
| SER-004 | SDK 叙事层可通过 `_recordConversation()` 间接写入世界事实 | `src/sdk/Character.js:446-470` |

### P2 — 中

| # | 发现 | 评估 |
|---|------|------|
| SER-005 | Native 绑定序列化/反序列化零 roundtrip 测试 | 中等风险，Rust 侧有单元测试但不覆盖 N-API 边界 |
| SER-006 | `SaveLoad` 接口与 `SnapshotStore` 不匹配 | 可能是桥接层处理，需确认 |
| SER-007 | 迁移系统仅支持单步 v0→v1，不支持版本链 | 未来 schema 升级会阻塞 |

### P3 — 低

- JSON 深拷贝丢失 Date 对象（`migration.js:115`），代码已注释并手动修复
- 混合同步/异步 store 模式
- Store 层无并发控制

---

## 四、测试覆盖审计

### 指标概览

| 指标 | 数值 |
|------|------|
| 源文件 (`src/`) | 150 |
| 测试文件 | 194 |
| 原始测试/源码比 | 1.29:1 |
| 有效功能比（扣除审计测试） | ~0.7:1 |
| 知识图谱节点 | 1401（402 file, 785 function, 150 class） |
| 知识图谱边 | 2827（885 imports, 966 contains, 281 tested_by） |

### 强覆盖区 ✅

- **CanonEventPipeline** — 1159 行，验证证据置信度、传播方向性、审计守卫
- **BehaviorField** — 1001 行，验证数学不变量（B∈[0,1]、速度有界、梯度方向）
- **KnowledgeStore** — 589 行，验证事实驱逐一致性、序列化兼容性
- **E2E** — 社交涌现、gossip 传播、情感传染、因果链

### 关键缺口 🔴

| # | 缺口 | 严重度 | 建议文件 |
|---|------|--------|----------|
| T-001 | 完整 `AndyWorld.step()` 循环（含 facts+effects） | **Critical** | `tests/integration/full-step-loop.test.js` |
| T-002 | Native 绑定在仿真上下文中的行为测试 | **High** | 扩展 `tests/native-integration.test.js` |
| T-003 | Gossip 传播的认识论泄漏（transitive knowledge chain） | **High** | `tests/e2e/gossip-epistemic-leak.test.js` |
| T-004 | Active 模式 action selection 路径（非 shadow） | **Medium** | 扩展 `tests/unit/handlers/action-selection-handler.test.js` |
| T-005 | BehaviorField attractor 跨 save/restore 持久性 | **Medium** | 补充 `tests/behavior-field.test.js` |
| T-006 | Pressure → BehaviorField 集成测试 | **Medium** | 补充 `tests/unit/pressure-layer.test.js` |

### 性能回归

- `benchmarks/perf-check.js` 定义 5 个指标，median 模式，warn 1.6x / fail 2.0x
- 缺少：序列化/反序列化性能、知识查询性能、Canon pipeline 吞吐量

---

## 五、全局风险矩阵

```
                    发生概率
                  低    中    高
影响  高      [T-003] [P0-001] [SER-002]
      中      [T-004] [T-005]  [P0-002]
      低      [T-006] [P3-001] [P2-001]
```

---

## 六、审计结论

### 总体评估: 🟡 有条件通过

**架构核心稳固**：行为场动力学、压力系统、知识传播、Canon 事实链、EffectCommitter 写回——这些 Andy Engine 的独特价值主张均设计合理且得到验证。

**技术债务集中在边界层**：`agent/action/` 的 15 份独立实现是最紧迫的清理项；4 处写回违规应在下个开发周期路由到 EffectCommitter。

**持久化层需加强测试**：序列化双版本号问题应在新版本发布前解决；v0→v1 迁移需要测试覆盖。

### 修复优先级

| 优先级 | 行动 | 时间窗口 |
|--------|------|----------|
| P0 | 将 `agent/action/` 15 文件转为 re-export 适配器或迁移测试 | 下一个 sprint |
| P0 | 修复 `ScheduleHandler` 4 处直接状态写入 | 下一个 sprint |
| P1 | 统一序列化信封版本号 | 下一个 minor release |
| P1 | 添加 v0→v1 迁移测试 | 下一个 sprint |
| P2 | 补充完整 `AndyWorld.step()` 集成测试 | 下一个 minor release |
| P3 | 修正 BehaviorField 文档中的梯度公式 | 随时 |

---

*本报告由 4 个独立审计子代理并行生成，经主审计代理综合。*
*审计 commit: 157380a703b13efe0b60071d7124488203d65f7f*
*审计日期: 2026-07-02*
