# v2.5 Direction Selection Brief

> 总规划师要求日期：2026-06-27
> 当前 Aliveness 状态：D1✅ D2✅ D3✅ D4✅ D5⚠️ D6⚠️ D7✅
> 剩余 Warning：D5 Narrative Faithfulness, D6 Social Emergence

---

## 0. 候选方向

| | A. Narrative Faithfulness | B. Social Emergence |
|---|---|---|
| 目标维度 | D5 Warning → Pass | D6 Warning → Pass |
| 核心问题 | narrative 能否只说允许的话 | 社会结构能否被观测和验证 |

---

## 1. 为什么现在做？

### A. Narrative Faithfulness

**紧迫性：高。** D5 是 Andy Engine 的"出口质量控制"——如果 narrative 可以说出 grounding 不允许的事实，v2.4 的 evidence model 就是摆设。当前 FactConsistencyChecker 是 regex-based 实验品，corpus 首批 11 条覆盖 6 类，检出率 100% 但语义不完备。v2.4 刚给 KnowledgeStore 加了结构化 evidence（source/confidence/propagatedFrom），如果 narrative 层不消费这些 evidence，结构化就只存在存储层，不影响 LLM 输出。

**为什么现在：**
- v2.4 evidence model 已就绪，grounding package 需要对齐
- 当前 FactProvider._getAllowedFacts 已经按 source 过滤，但 narrative/LLM 端从未验证过是否真的只使用了 allowed facts
- D5 的 corpus 扩充和 checker 升级是 evidence model 的自然消费者

### B. Social Emergence

**紧迫性：中。** D6 测的是"多 agent 交互是否产生可观测的社会结构"——关系强度变化、社交传染、群体行为。当前 SocialGraph/Relationship/BehaviorField 各自独立运行，但缺少端到端验证：跑 100 tick 后社交图是否有结构？contagion 是否真的发生了？

**为什么现在：**
- v2.4 told propagation 是社交交互的副产品，social graph 演化需要 told 作为输入
- 但 social emergence 本身不直接依赖 evidence model——它更多是 runtime 集成问题
- 可以在 v2.5 做，也可以推到 v2.6

---

## 2. 对 Andy persistent world kernel 的战略价值

### A. Narrative Faithfulness — 直接价值：信任链闭环

Andy 的核心承诺是 **narrative 不创建世界事实，只表达 grounding 允许的事实**。如果这条断了，Andy 退化为"LLM 凭空编故事"。v2.4 让知识系统知道"凭什么知道"，v2.5-A 让叙事系统只能"说出它有权说的"——这两步合在一起才是完整的 epistemic chain：

```
Evidence Model (v2.4) → Grounding Package → Narrative Constraint (v2.5-A)
```

**战略价值**：Andy 从"有知识系统但 narrative 可能越界"变成"知识→叙事有强制约束链"。

### B. Social Emergence — 间接价值：世界生命力

Andy 的差异化在于"可持续演化的世界"——不是一次性叙事，是 agent 之间长期交互形成社会结构。如果社交图是平坦的（所有人关系一样），contagion 没效果，世界就死了。D6 测的是世界是否有生命力。

**战略价值**：Andy 从"agent 各自独立运行"变成"agent 交互产生可观测的社会结构"。但这更多是 demonstration 层面，不是 kernel 层面——kernel 已经有 SocialGraph/Relationship/contagion，缺的是验证，不是实现。

---

## 3. 是否依赖 v2.4 evidence model？

### A. Narrative Faithfulness — **强依赖**

- FactProvider 生成 grounding package 时已经按 evidence source 过滤
- 但 grounding package 的 `allowedFacts` 和 `forbiddenFacts` 从未在 LLM 端强制执行
- v2.5-A 需要：grounding package 携带 evidence 信息 → narrative/LLM 使用 evidence 约束 → FactConsistencyChecker 校验
- **没有 v2.4 evidence model，v2.5-A 无法标注"这个 fact 来自 told，置信度 0.6"**

### B. Social Emergence — **弱依赖**

- told propagation 是社交交互的输入之一，但 social emergence 主要依赖 Relationship.strength 变化、BehaviorField sociality 维度、contagion 扩散
- 这些机制在 v2.4 之前就存在
- v2.4 的 told propagation 会自然增强社交密度（更多知识共享），但不是前置条件
- **v2.5-B 可以独立于 v2.4 evidence model 运行**

---

## 4. 风险与边界

### A. Narrative Faithfulness

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| LLM 不遵守 grounding constraint | 高 | 中 | corpus 测试 + violation tracking 是防御层 |
| FactConsistencyChecker 误报 | 中 | 中 | 误报率作为辅助信号，不作为 gate |
| corpus 扩充耗时 | 中 | 低 | 30 条是 v2.5 目标，非完整覆盖 |
| 语义完备不可能 | 确定性 | 低 | D5 标准已明确"不承诺语义完备" |
| 触及 narrative/LLM adapter | 中 | 中 | 只读/校验层，不修改 LLM prompt 生成逻辑 |

**边界**：
- 不修改 LLM prompt 生成逻辑（只加约束标注）
- 不实现 semantic entailment checker
- corpus 目标 30 条（从 11 扩充），检出率 ≥80%
- FactConsistencyChecker 仍为 regex-based，但增加 evidence-awareness

### B. Social Emergence

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| 社交图无结构（关系均匀） | 中 | 高 | 调整 Relationship 参数 / 增加 social pressure |
| contagion 效果不可测 | 中 | 中 | 明确 measurable outcome（关系强度变化阈值） |
| 长程运行才能观测 | 中 | 中 | perf:check 已有 100/300 agent benchmark |
| 触及 runtime 集成 | 中 | 中 | 只加观测/报告，不改 SocialGraph 核心 |

**边界**：
- 不重写 SocialGraph/Relationship
- 不引入新的 social mechanism（只验证已有的）
- 长程报告是观测层，不是 kernel 变更
- contagion 是否纳入 aliveness benchmark 需总规划师裁定

---

## 5. 预期波次数

### A. Narrative Faithfulness — 3 波

| 波 | 内容 | 估计 it() |
|---|---|---|
| W1 | grounding package evidence 对齐 + corpus 扩充到 30 条 | ~20 |
| W2 | FactConsistencyChecker evidence-awareness + violation tracking 升级 | ~15 |
| W3 | D5 E2E benchmark + aliveness D5→Pass | ~10 |

### B. Social Emergence — 2 波

| 波 | 内容 | 估计 it() |
|---|---|---|
| W1 | 社交图演化 benchmark + 长程报告脚本 | ~15 |
| W2 | D6 E2E benchmark + aliveness D6→Pass | ~10 |

---

## 6. 验收方式

### A. Narrative Faithfulness

```bash
npm test                                    # 全部通过
npm run test:domain                         # domain 边界
npm run check:boundaries                    # 架构边界
npm run replay:diff                         # 100/100
node scripts/aliveness-report.js            # D5 → Pass
```

D5 Pass 条件：
- narrative violation corpus ≥30 条
- FactConsistencyChecker 检出率 ≥80%
- grounding package 与 evidence model 对齐（told/inferred 标注可见）
- LLM/narrative 只使用 allowed facts（violation tracking 验证）

### B. Social Emergence

```bash
npm test                                    # 全部通过
npm run perf:check                          # 性能不退化
node scripts/aliveness-report.js            # D6 → Pass
```

D6 Pass 条件：
- 100 tick 运行后社交图有结构（关系强度方差 > 阈值）
- contagion 事件可观测（至少 1 次跨 agent 情绪/行为传染）
- 长程社交报告可生成
- 不引入新性能回归

---

## 7. 排序建议

### **推荐：A 先 B 后**

理由：

1. **A 是 B 的前置条件**（部分）。v2.4 建了 evidence model，但 narrative 层未消费它。如果 B 先做，social emergence 产生的 told/inferred 知识在 narrative 端仍然无法约束——等于"有知识但不保证叙事忠诚"。

2. **战略闭环**。A 完成后，Andy 的核心链路是完整的：
   ```
   世界事件 → evidence → knowledge → grounding → narrative constraint
   ```
   这条链从 v2.1 到 v2.5-A 才真正闭环。

3. **B 的独立性**。Social emergence 不依赖 narrative faithfulness——它测的是 runtime 层面的社交结构，不是叙事输出。B 可以在 A 之后独立推进，无耦合。

4. **风险控制**。A 涉及 narrative/LLM 约束，边界清晰（只读/校验层）；B 涉及 runtime 集成，可能需要调整参数。先做边界清晰的工作。

### 不可并行

A 和 B 不应并行：
- A 修改 FactProvider/FactConsistencyChecker/narrative 相关
- B 修改 SocialGraph 报告/runtime 集成
- 虽然无代码冲突，但并行时 aliveness report 的 D5/D6 判定逻辑同时变更，增加验证复杂度
- 串行更安全：A→B，每步一个维度 Pass

---

## 8. 总结

| | A. Narrative Faithfulness | B. Social Emergence |
|---|---|---|
| 战略价值 | **高**：信任链闭环 | 中：世界生命力验证 |
| v2.4 依赖 | **强**：evidence model 消费者 | 弱：可独立 |
| 风险 | 中：LLM 不遵守/误报 | 中：社交图无结构 |
| 波次 | 3 | 2 |
| 推荐顺序 | **第一** | 第二 |

**建议 v2.5 = A (Narrative Faithfulness)，v2.6 = B (Social Emergence)。**
