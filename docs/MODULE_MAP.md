# Andy Engine Module Map

> **Historical module map.**
> This file records the pre-retirement mapping used during migration. Current
> canonical implementation lives under `src/`; see `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`.
>
> 自动生成于 2026-06-20
> 目的：记录每个模块的当前位置和目标架构层级，为 Clean Architecture Pass Phase 1 提供基线清单。
> 参考：`docs/ARCHITECTURE_SNAPSHOT.md`、`docs/CLEAN_ARCHITECTURE_PLAN.md` §5 Current-to-Target Mapping

---

## 模块清单

| 当前路径 | 目标层级 | 行数 | 关键职责 | 状态 |
|----------|----------|------|----------|------|
| `index.js` | sdk (compat) | 601 | AndyEngine 公共 API 入口，createCharacter/tick/getNarrative，兼容性根导出 | stable |
| `config/defaults.js` | config | 422 | 所有可调参数集中定义（情绪/需求/记忆/社交/事件等） | stable |
| `config/validate.js` | config | 182 | 引擎初始化配置验证器，数值范围/类型/一致性检查 | stable |
| `core/World.js` | runtime | 344 | 世界状态（时间、环境、agent 集合、SocialGraph、EventLog） | stable |
| `core/Simulator.js` | runtime | 460 | 多 agent 调度器（5 步管线：time → environment → think → interact → dispatch） | stable |
| `core/EventDispatcher.js` | runtime | 543 | 事件系统（5 种来源：环境/状态/日程/随机/因果），语义分类与分发 | stable |
| `core/RNG.js` | shared | 130 | 可播种 PRNG（Mulberry32），确定性，可克隆 | stable |
| `core/AndyBridge.js` | sdk (compat) | 243 | Andy 模拟 ↔ Bobby 对话桥梁，情绪信号缓冲 + 故事注入 | stable |
| `core/AndyTownAdapter.js` | sdk (compat) | 143 | Andy Town snapshot 适配层，缓存 + 降级策略 | stable |
| `core/WorldPressure.js` | pressure | 111 | 只读世界压力计算（时间/位置/拥挤度/事件） | experimental |
| `core/EmotionEffectClassifier.js` | pressure | 245 | 用户消息 → 30 维情绪 effect 关键词映射 | stable |
| `core/EmotionSignalBuffer.js` | pressure | 134 | 情绪信号缓冲层，秒级消息 → 分钟级 tick 对齐 | stable |
| `core/StoryGenerator.js` | narrative | 303 | 程序化故事片段生成（模板 + 模拟数据，无 LLM） | stable |
| `core/WorldviewConstraints.js` | domain (legacy) | 242 | 世界观约束模块，校园词汇过滤（Legacy 兼容包装器） | legacy |
| `core/EventEffectPipeline.js` | effects (compat) | 2 | 兼容性包装器，委托到 `effects/EventEffectPipeline.js` | legacy |
| `agent/Agent.js` | agent | 2057 | 主 agent 循环 tick()，协调全部 16 个子系统步骤 | stable |
| `agent/BehaviorField.js` | agent/psychology | 662 | 4D 连续行为场，欠阻尼朗之万动力学，行为决策核心 | stable |
| `agent/BehaviorLabeler.js` | agent/psychology | 362 | 语义标签投影器（50 个状态中心点 → 中文标签） | stable |
| `agent/StateMachine.js` | agent | 68 | 状态元数据（42 状态，只读）+ 轻量历史追踪器 | stable |
| `agent/EmotionVector.js` | agent/psychology | 746 | 30 维情绪系统（Cowen & Keltner 2017），10 步演化管线 | stable |
| `agent/EmotionVector.native.js` | agent/psychology | 411 | Native-backed EmotionVector 包装器，Rust N-API 加速，降级到纯 JS | experimental |
| `agent/EmotionRegulation.js` | agent/psychology | 432 | Gross 情绪调节（3 策略：认知重评/分隔/抑制） | stable |
| `agent/Appraisal.js` | agent/psychology | 509 | 认知评价（Scherer CPM），8 维度评估 | stable |
| `agent/NeedsSystem.js` | agent/psychology | 341 | Maslow 需求层级（5 个驱动），连续梯度供 BehaviorField | stable |
| `agent/NeedsSystem.native.js` | agent/psychology | 161 | Native-backed NeedsSystem 包装器，Rust N-API 加速 | experimental |
| `agent/PersonalMemory.js` | agent/memory | 1038 | ACT-R 记忆系统，5 路径检索，情绪一致性回忆 | stable |
| `agent/ProceduralMemory.js` | agent/memory | 277 | 程序性记忆：习惯形成/打破，行为序列模式检测 | stable |
| `agent/Personality.js` | agent/psychology | 342 | MBTI → OCEAN → 行为参数映射 | stable |
| `agent/IntrinsicMotivation.js` | agent/psychology | 796 | 内在动机：好奇心驱力 + 自生目标（SDT + Oudeyer 学习进度） | stable |
| `agent/Schedule.js` | agent/schedule | 256 | 日程系统，高斯噪声扰动 | stable |
| `agent/FutureTendencyTracker.js` | agent/psychology | 105 | 区域 4D 倾向向量追踪，衰减率 0.95/tick | experimental |
| `agent/LocationMeaningInfluence.js` | agent/psychology | 57 | WorldFactStore 地点意义 → BehaviorField 梯度贡献 | experimental |
| `agent/action/ActionCandidate.js` | action | 71 | 纯 JSON 候选模型（9 种行为类型，10 种来源，确定性 ID） | experimental |
| `agent/action/UtilityScorer.js` | action | 471 | 只读候选评分器（13 维度：需求/情绪/行为/记忆/关系/习惯/目标等） | experimental |
| `agent/action/UtilitySelector.js` | action | 160 | 温度加权选择（带种子 RNG），产生 ReasonTrace | experimental |
| `agent/action/GoalSystem.js` | action | 231 | 可序列化目标系统（5 种来源，4 种状态，纯压力源） | experimental |
| `agent/action/WorldObject.js` | action | 314 | 抽象实体数据模型（5 种生命周期状态，affordance 系统） | experimental |
| `agent/action/providers/CandidateProviderManager.js` | action | 59 | 聚合 provider，确定性排序，按 candidate.id 去重 | experimental |
| `agent/action/providers/CandidateProvider.js` | action | 23 | 基础 provider 接口 | experimental |
| `agent/action/providers/ContinueCandidateProvider.js` | action | 23 | 继续当前行为候选 | experimental |
| `agent/action/providers/NeedCandidateProvider.js` | action | 41 | 需求驱动候选 | experimental |
| `agent/action/providers/ScheduleCandidateProvider.js` | action | 33 | 日程驱动候选 | experimental |
| `agent/action/providers/BehaviorFieldCandidateProvider.js` | action | 41 | BehaviorField 驱动候选 | experimental |
| `agent/action/providers/ExploreCandidateProvider.js` | action | 24 | 探索候选 | experimental |
| `agent/action/providers/SocializeCandidateProvider.js` | action | 27 | 社交互动候选 | experimental |
| `effects/EventEffectPipeline.js` | effects | 279 | 纯模块：事件 → 记忆/位置/倾向 delta（agent 后果） | experimental |
| `facts/WorldFactStore.js` | canon | 555 | 统一事实存储（CRUD 按类型/视角/时间） | experimental |
| `facts/FactSchema.js` | canon | 453 | 事实类型枚举（9 种），来源/范围枚举，验证，工厂函数 | experimental |
| `facts/CanonEventPipeline.js` | canon | 142 | 事件 → EventFact → KnowledgeStore 传播（世界事实） | experimental |
| `facts/KnowledgeStore.js` | knowledge | 135 | 每 agent 知识追踪（已知/推断/禁止） | experimental |
| `facts/FactProvider.js` | narrative | 243 | 视角过滤的 grounding 包（allowed/inferred/forbidden facts） | experimental |
| `facts/FactConsistencyChecker.js` | narrative | 467 | LLM 输出一致性检查（正则，5 种违规类型） | experimental |
| `facts/FactEmitter.js` | canon | 386 | 事实生成（static_env/agent_state/observation/relationship/event） | experimental |
| `facts/FactFormatter.js` | narrative | 104 | 事实 → 自然语言/JSON，用于 LLM prompt 注入 | experimental |
| `facts/index.js` | canon | 63 | 公共导出 | experimental |
| `social/SocialGraph.js` | social | 409 | 全局社交图谱，Dunbar 层级，三元闭合，相遇评估 | stable |
| `social/Relationship.js` | social | 244 | 对数增长关系模型（Sutcliffe 2012），4 层级 | stable |
| `spatial/SpatialEngine.js` | spatial | 523 | 连续坐标空间，O(N·k) 邻居查询，交互概率 | stable |
| `spatial/SpatialHash.js` | spatial | 200 | 空间哈希网格，O(1) 邻居查找 | stable |
| `spatial/RegionGrid.js` | spatial | 211 | 离散区域网格（向后兼容） | stable |
| `spatial/WorldMap.js` | spatial | 186 | 世界地图，区域邻接 | stable |
| `domain/DomainRegistry.js` | domain | 284 | Domain 解析、验证、安全 getter/降级 | stable |
| `domain/validateDomain.js` | domain | 306 | Domain 配置契约验证 | stable |
| `domain/ForbiddenTerms.js` | domain | 26 | Domain 感知文本过滤工具（依赖叶子） | stable |
| `domain/index.js` | domain | 14 | 公共导出 | stable |
| `store/SQLiteStore.js` | store | 400 | SQLite 持久化存储 | stable |
| `store/SimulationStore.js` | store | 266 | 模拟状态持久化 | stable |
| `store/SnapshotStore.js` | store | 87 | 快照管理 | stable |
| `store/StoryStore.js` | store | 90 | 故事/叙事持久化 | stable |
| `store/MetaStore.js` | store | 59 | 元数据存储 | stable |
| `store/index.js` | store | 51 | 公共导出 + `createMemoryStore()` | stable |
| `world/WorldStateAdapter.js` | store | 108 | 稳定 World Envelope 适配器（toWorldState / fromWorldState） | stable |
| `world/validator.js` | store | 262 | World Spec + World State 验证（schema v0.1.0） | stable |
| `world/compiler.js` | store | 112 | World Spec → 初始 World State 编译器 | stable |
| `world/migration.js` | store | 141 | World State 正向版本迁移 | stable |
| `sdk/Andy.js` | sdk | 206 | 多角色引擎包装器（Andy Town / community 场景） | stable |
| `sdk/Character.js` | sdk | 402 | 高层角色 API（chat/getContext/save/load） | stable |
| `sdk/LLMAdapter.js` | sdk | 298 | LLM 适配器（OpenAI/Anthropic/Ollama/自定义函数/流式） | stable |
| `sdk/NarrativeBuilder.js` | narrative | 282 | System prompt 构建器（show-don't-tell/分层人格/grounding 段） | stable |
| `sdk/ConversationLog.js` | sdk | 181 | 对话历史管理 | stable |
| `sdk/AutoTick.js` | sdk | 112 | 自动 tick 调度 | stable |
| `sdk/index.js` | sdk | 54 | 公共导出 | stable |
| `presets/campus/index.js` | domain | 663 | Campus 域预设（角色/地点/事件/规则） | stable |
| `presets/campus/schedules.js` | domain | 105 | Campus 日程模板 | stable |
| `presets/tavern/index.js` | domain | 414 | Tavern 域预设（角色/地点/事件/规则） | stable |
| `scripts/check-boundaries.js` | tooling | 396 | 架构边界违规扫描脚本 | stable |
| `scripts/oak-town-sim.js` | tooling | 609 | 橡木镇 15 角色 2 天社会动力学模拟脚本 | experimental |
| `vitest.config.js` | tooling | 36 | Vitest 测试配置 | stable |
| `data_generator/pipeline.js` | tooling | 639 | 合成数据生成管线（Rust SoA 并行情绪计算） | experimental |
| `data_generator/run.js` | tooling | 89 | 数据生成运行入口 | experimental |
| `data_generator/run_batch.js` | tooling | 119 | 批量数据生成 | experimental |
| `data_generator/run_overnight.js` | tooling | 443 | 长时间批量数据生成 | experimental |
| `data_generator/run_single.js` | tooling | 294 | 单次数据生成 | experimental |
| `data_generator/run_visual.js` | tooling | 494 | 可视化数据生成 | experimental |
| `data_generator/scenarios.js` | tooling | 161 | 场景定义与 MBTI 配置 | experimental |
| `benchmarks/agent-tick-profile.js` | tooling | 295 | Agent tick 性能分析 | experimental |
| `benchmarks/baseline.js` | tooling | 154 | 基线性能基准 | experimental |
| `benchmarks/contagion-profile.js` | tooling | 324 | 情绪传染性能分析 | experimental |
| `benchmarks/emotion-profile.js` | tooling | 214 | 情绪系统性能分析 | experimental |
| `benchmarks/perf-check.js` | tooling | 135 | 性能检查脚本 | experimental |
| `benchmarks/profile.js` | tooling | 217 | 通用性能分析 | experimental |
| `experiments/behavior_field_personality.js` | experiment | 162 | 行为场人格差异实验 | experimental |
| `experiments/hierarchical_contagion.js` | experiment | 433 | 分层情绪传染实验 | experimental |
| `experiments/llm_evaluation.js` | experiment | 440 | LLM 评估实验 | experimental |
| `experiments/llm_ab_test/benchmark_runner.js` | experiment | 290 | LLM A/B 测试运行器 | experimental |
| `experiments/llm_ab_test/generate_responses.js` | experiment | 66 | LLM 响应生成 | experimental |
| `experiments/llm_ab_test/run.js` | experiment | 329 | LLM A/B 测试入口 | experimental |
| `experiments/llm_ab_test/scorer.js` | experiment | 296 | LLM 响应评分器 | experimental |
| `experiments/practical_eval/exp1_ab_comparison.js` | experiment | 436 | 实用评估 1：A/B 对比 | experimental |
| `experiments/practical_eval/exp2_personality_consistency.js` | experiment | 570 | 实用评估 2：人格一致性 | experimental |
| `experiments/practical_eval/exp3_state_awareness.js` | experiment | 437 | 实用评估 3：状态感知 | experimental |
| `experiments/practical_eval/exp4_memory_test.js` | experiment | 489 | 实用评估 4：记忆测试 | experimental |
| `experiments/practical_eval/exp5_emergence.js` | experiment | 779 | 实用评估 5：涌现行为 | experimental |
| `experiments/spatial_eval/run_all.js` | experiment | 418 | 空间评估运行器 | experimental |
| `experiments/spatial_eval/spatial_experiments.js` | experiment | 374 | 空间实验 | experimental |
| `experiments/exp15_social_graph_r5.js` | experiment | 149 | R5 实验 15：社交图谱 | experimental |
| `experiments/exp16_scale_100_r5.js` | experiment | 163 | R5 实验 16：100 角色规模 | experimental |
| `experiments/exp17_rel_lifecycle_r5.js` | experiment | 229 | R5 实验 17：关系生命周期 | experimental |
| `experiments/exp18_negative_deep_r5.js` | experiment | 261 | R5 实验 18：负面情绪深度 | experimental |
| `experiments/exp19_longterm_stress_r5.js` | experiment | 251 | R5 实验 19：长期压力 | experimental |
| `experiments/exp20_encounter_bottleneck_r5.js` | experiment | 185 | R5 实验 20：相遇瓶颈 | experimental |
| `experiments/run_round5.js` | experiment | 359 | R5 实验批量运行器 | experimental |
| `examples/basic-chat.js` | example | 69 | 基础聊天示例 | stable |
| `examples/multi-character.js` | example | 83 | 多角色示例 | stable |
| `examples/offline-demo.js` | example | 108 | 离线演示示例 | stable |

### 测试文件

| 当前路径 | 目标层级 | 行数 | 关键职责 | 状态 |
|----------|----------|------|----------|------|
| `tests/behavior-field.test.js` | test | 923 | 行为场全套测试（61 tests） | stable |
| `tests/sdk.test.js` | test | 658 | SDK 测试（54 tests） | stable |
| `tests/facts/world-fact-store.test.js` | test | 556 | WorldFactStore 测试 | stable |
| `tests/facts/canon-event-pipeline.test.js` | test | 568 | CanonEventPipeline 测试 | stable |
| `tests/facts/grounded-narrative.test.js` | test | 485 | Grounded narrative 测试 | stable |
| `tests/schema-validator.test.js` | test | 464 | World Spec + World State 验证测试（45 tests） | stable |
| `tests/rng-injection.test.js` | test | 394 | 确定性 RNG 传播测试（27 tests） | stable |
| `tests/unit/shadow-action-selection.test.js` | test | 398 | Shadow action selection 测试（16 tests） | stable |
| `tests/unit/goalsystem.test.js` | test | 383 | Goal system 测试（36 tests） | stable |
| `tests/domain-deep.test.js` | test | 376 | Domain 深度测试（18 tests） | stable |
| `tests/world-state-adapter.test.js` | test | 337 | WorldStateAdapter 测试（16 tests） | stable |
| `tests/unit/worldobject.test.js` | test | 445 | WorldObject 测试（44 tests） | stable |
| `tests/integration/fact-system-slice.test.js` | test | 333 | Fact 系统切片集成测试（6 tests） | stable |
| `tests/unit/active-writeback.test.js` | test | 333 | Active writeback 测试 | stable |
| `tests/facts/fact-schema.test.js` | test | 328 | FactSchema 测试 | stable |
| `tests/unit/effect-pipeline-dry-run.test.js` | test | 318 | Effect pipeline dry-run 测试（12 tests） | stable |
| `tests/unit/candidate-providers.test.js` | test | 302 | Candidate providers 测试（29 tests） | stable |
| `tests/source-scan.test.js` | test | 295 | 确定性源码扫描测试（5 tests） | stable |
| `tests/domain-contract.test.js` | test | 288 | Domain 契约测试（34 tests） | stable |
| `tests/facts/knowledge-store.test.js` | test | 263 | KnowledgeStore 测试 | stable |
| `tests/unit/relationship-writeback.test.js` | test | 261 | Relationship writeback 测试 | stable |
| `tests/facts/effect-pipeline-dryrun.test.js` | test | 247 | Effect pipeline dryrun 测试 | stable |
| `tests/unit/movement-writeback.test.js` | test | 233 | Movement writeback 测试 | stable |
| `tests/fallback-minimal.test.js` | test | 216 | Fallback minimal 测试 | stable |
| `tests/spatial.test.js` | test | 217 | Spatial 测试（18 tests） | stable |
| `tests/integration/engine.test.js` | test | 213 | 引擎集成测试（27 tests） | stable |
| `tests/unit/future-tendency.test.js` | test | 213 | Future tendency 测试（24 tests） | stable |
| `tests/world-tooling.test.js` | test | 407 | World tooling 测试（28 tests） | stable |
| `tests/seedable-simulation.test.js` | test | 251 | 可播种模拟测试（10 tests） | stable |
| `tests/contagion-cache.test.js` | test | 188 | 传染缓存测试（5 tests） | stable |
| `tests/unit/memory.test.js` | test | 173 | 记忆系统测试（14 tests） | stable |
| `tests/package-boundary.test.js` | test | 173 | 包边界测试（21 tests） | stable |
| `tests/unit/event-effect-pipeline.test.js` | test | 175 | Event effect pipeline 测试（14 tests） | stable |
| `tests/domain.test.js` | test | 177 | Domain 测试（13 tests） | stable |
| `tests/unit/memory-influence-scorer.test.js` | test | 183 | Memory influence scorer 测试 | stable |
| `tests/facts/action-event-emission.test.js` | test | 155 | Action event emission 测试 | stable |
| `tests/unit/action-event-emission.test.js` | test | 147 | Action event emission 测试（5 tests） | stable |
| `tests/worldview-constraints.test.js` | test | 149 | Worldview constraints 测试（6 tests） | stable |
| `tests/compatibility.test.js` | test | 144 | 兼容性测试（15 tests） | stable |
| `tests/unit/emotion.test.js` | test | 144 | 情绪系统测试（17 tests） | stable |
| `tests/unit/action-candidate.test.js` | test | 121 | Action candidate 测试（13 tests） | stable |
| `tests/facts/minimal-active-writeback.test.js` | test | 128 | Minimal active writeback 测试 | stable |
| `tests/unit/personality.test.js` | test | 123 | 人格测试（14 tests） | stable |
| `tests/unit/social.test.js` | test | 126 | 社交测试（11 tests） | stable |
| `tests/unit/world-pressure.test.js` | test | 120 | World pressure 测试（16 tests） | stable |
| `tests/unit/utility-scorer.test.js` | test | 147 | Utility scorer 测试（11 tests） | stable |
| `tests/unit/utility-selector.test.js` | test | 96 | Utility selector 测试（8 tests） | stable |
| `tests/unit/location-meaning-influence.test.js` | test | 113 | Location meaning influence 测试（10 tests） | stable |
| `tests/sdk-custom-domain.test.js` | test | 64 | SDK custom domain 测试（4 tests） | stable |
| `tests/unit/statemachine.test.js` | test | 59 | StateMachine 测试（5 tests） | stable |
| `tests/facts/shadow-trace-quality.test.js` | test | 85 | Shadow trace quality 测试 | stable |
| `tests/architecture/boundary-check.test.js` | test | 410 | 架构边界检查测试 | stable |
| `tests/facts/world-canon.test.js` | test | 382 | World canon 测试 | stable |
| `tests/facts/performance-rebaseline.test.js` | test | 30 | 性能重新基线测试 | stable |
| `tests/facts/public-api-review.test.js` | test | 29 | Public API review 测试 | stable |
| `tests/facts/relationship-social-writeback.test.js` | test | 35 | Relationship social writeback 测试 | stable |
| `tests/facts/replay-trace-audit.test.js` | test | 39 | Replay trace audit 测试 | stable |
| `tests/facts/location-movement-writeback.test.js` | test | 34 | Location movement writeback 测试 | stable |
| `tests/facts/worldobject-integration.test.js` | test | 23 | WorldObject integration 测试 | stable |
| `tests/unit/intrinsic-domain.test.js` | test | 24 | Intrinsic domain 测试 | stable |

### 根目录测试脚本（legacy/manual）

| 当前路径 | 目标层级 | 行数 | 关键职责 | 状态 |
|----------|----------|------|----------|------|
| `test.js` | test (legacy) | 4236 | 综合测试套件（手动，已被 vitest 测试替代） | legacy |
| `test_pipeline.js` | test (legacy) | 314 | 情绪信号 + StoryGenerator 端到端测试 | legacy |
| `test_soa.js` | test (legacy) | 360 | SoA f32 引擎验证测试 | legacy |
| `test_soa_contagion.js` | test (legacy) | 221 | SoA f32 + Dunbar 分频传染性能测试 | legacy |
| `test_soa_debug.js` | test (legacy) | 101 | SoA 诊断测试（1 agent, 1 tick, 零噪声） | legacy |
| `test_store.js` | test (legacy) | 337 | 持久化层手动测试 | legacy |

---

## 按目标层级分组

### runtime — 引擎运行时编排层

- `core/Simulator.js` → `src/runtime/Simulator.js` — 多 agent 调度器，5 步管线
- `core/World.js` → `src/runtime/AndyWorld.js` — 世界状态（时间/环境/agent 集合/SocialGraph/EventLog）
- `core/EventDispatcher.js` → `src/runtime/EventDispatcher.js` — 事件分发系统（5 种来源 + 语义分类）

### canon — 世界事实权

- `facts/WorldFactStore.js` → `src/canon/WorldFactStore.js` — 统一事实存储（CRUD 按类型/视角/时间）
- `facts/FactSchema.js` → `src/canon/FactSchema.js` — 事实类型枚举（9 种），验证，工厂函数
- `facts/CanonEventPipeline.js` → `src/canon/CanonEventPipeline.js` — 事件 → EventFact → KnowledgeStore 传播
- `facts/FactEmitter.js` → `src/canon/FactEmitter.js` — 事实生成（static_env/agent_state/observation/relationship/event）
- `facts/index.js` → `src/canon/index.js` — 公共导出

### knowledge — 角色局部知识

- `facts/KnowledgeStore.js` → `src/knowledge/KnowledgeStore.js` — 每 agent 知识追踪（已知/推断/禁止）

### agent — 角色状态

- `agent/Agent.js` → `src/agent/AgentRuntime.js` — 主 agent 循环 tick()，协调全部 16 个子系统步骤
- `agent/StateMachine.js` → `src/agent/StateMachine.js` — 状态元数据（42 状态，只读）+ 轻量历史追踪器

#### agent/psychology

- `agent/BehaviorField.js` → `src/agent/psychology/BehaviorField.js` — 4D 连续行为场，欠阻尼朗之万动力学
- `agent/BehaviorLabeler.js` → `src/agent/psychology/BehaviorLabeler.js` — 语义标签投影器（50 个状态中心点）
- `agent/EmotionVector.js` → `src/agent/psychology/EmotionVector.js` — 30 维情绪系统，10 步演化管线
- `agent/EmotionVector.native.js` → `src/agent/psychology/EmotionVector.native.js` — Native-backed EmotionVector 包装器
- `agent/EmotionRegulation.js` → `src/agent/psychology/EmotionRegulation.js` — Gross 情绪调节（3 策略）
- `agent/Appraisal.js` → `src/agent/psychology/Appraisal.js` — 认知评价（Scherer CPM），8 维度
- `agent/NeedsSystem.js` → `src/agent/psychology/NeedsSystem.js` — Maslow 需求层级（5 驱动）
- `agent/NeedsSystem.native.js` → `src/agent/psychology/NeedsSystem.native.js` — Native-backed NeedsSystem 包装器
- `agent/Personality.js` → `src/agent/psychology/Personality.js` — MBTI → OCEAN → 行为参数映射
- `agent/IntrinsicMotivation.js` → `src/agent/psychology/IntrinsicMotivation.js` — 内在动机：好奇心 + 自生目标
- `agent/FutureTendencyTracker.js` → `src/agent/psychology/FutureTendencyTracker.js` — 区域 4D 倾向向量追踪
- `agent/LocationMeaningInfluence.js` → `src/agent/psychology/LocationMeaningInfluence.js` — 地点意义 → BehaviorField 梯度

#### agent/memory

- `agent/PersonalMemory.js` → `src/agent/memory/PersonalMemory.js` — ACT-R 记忆系统，5 路径检索
- `agent/ProceduralMemory.js` → `src/agent/memory/ProceduralMemory.js` — 程序性记忆：习惯形成/打破

#### agent/schedule

- `agent/Schedule.js` → `src/agent/schedule/Schedule.js` — 日程系统，高斯噪声扰动

### pressure — 状态→行为压力

- `core/WorldPressure.js` → `src/pressure/WorldPressure.js` — 只读世界压力计算（时间/位置/拥挤度/事件）
- `core/EmotionEffectClassifier.js` → `src/pressure/EmotionEffectClassifier.js` — 用户消息 → 30 维情绪 effect 映射
- `core/EmotionSignalBuffer.js` → `src/pressure/EmotionSignalBuffer.js` — 情绪信号缓冲层

### action — 行为候选与选择

- `agent/action/ActionCandidate.js` → `src/action/ActionCandidate.js` — 纯 JSON 候选模型
- `agent/action/UtilityScorer.js` → `src/action/UtilityScorer.js` — 只读候选评分器（13 维度）
- `agent/action/UtilitySelector.js` → `src/action/UtilitySelector.js` — 温度加权选择 + ReasonTrace
- `agent/action/GoalSystem.js` → `src/action/GoalSystem.js` — 可序列化目标系统
- `agent/action/WorldObject.js` → `src/action/WorldObject.js` — 抽象实体数据模型（affordance 系统）
- `agent/action/providers/CandidateProviderManager.js` → `src/action/providers/CandidateProviderManager.js` — 聚合 provider
- `agent/action/providers/CandidateProvider.js` → `src/action/providers/CandidateProvider.js` — 基础 provider 接口
- `agent/action/providers/ContinueCandidateProvider.js` → `src/action/providers/ContinueCandidateProvider.js` — 继续当前行为
- `agent/action/providers/NeedCandidateProvider.js` → `src/action/providers/NeedCandidateProvider.js` — 需求驱动候选
- `agent/action/providers/ScheduleCandidateProvider.js` → `src/action/providers/ScheduleCandidateProvider.js` — 日程驱动候选
- `agent/action/providers/BehaviorFieldCandidateProvider.js` → `src/action/providers/BehaviorFieldCandidateProvider.js` — BehaviorField 驱动候选
- `agent/action/providers/ExploreCandidateProvider.js` → `src/action/providers/ExploreCandidateProvider.js` — 探索候选
- `agent/action/providers/SocializeCandidateProvider.js` → `src/action/providers/SocializeCandidateProvider.js` — 社交互动候选

### effects — 事件后果

- `effects/EventEffectPipeline.js` → `src/effects/EventEffectPipeline.js` — 纯模块：事件 → 记忆/位置/倾向 delta
- `core/EventEffectPipeline.js` → deleted or legacy re-export — 兼容性包装器（2 行）

### narrative — 受限表达/LLM grounding

- `facts/FactProvider.js` → `src/narrative/GroundingPackageBuilder.js` — 视角过滤的 grounding 包
- `facts/FactConsistencyChecker.js` → `src/narrative/FactConsistencyChecker.js` — LLM 输出一致性检查
- `facts/FactFormatter.js` → `src/narrative/FactFormatter.js` — 事实 → 自然语言/JSON
- `sdk/NarrativeBuilder.js` → `src/narrative/NarrativeAdapter.js` — System prompt 构建器
- `core/StoryGenerator.js` → `src/narrative/StoryGenerator.js` — 程序化故事片段生成

### spatial — 地点/空间

- `spatial/SpatialEngine.js` → `src/spatial/SpatialEngine.js` — 连续坐标空间，O(N·k) 邻居查询
- `spatial/SpatialHash.js` → `src/spatial/SpatialHash.js` — 空间哈希网格，O(1) 邻居查找
- `spatial/RegionGrid.js` → `src/spatial/RegionGrid.js` — 离散区域网格（向后兼容）
- `spatial/WorldMap.js` → `src/spatial/WorldMap.js` — 世界地图，区域邻接

### social — 关系/社交图

- `social/SocialGraph.js` → `src/social/SocialGraph.js` — 全局社交图谱，Dunbar 层级，三元闭合
- `social/Relationship.js` → `src/social/Relationship.js` — 对数增长关系模型（4 层级）

### domain — 世界规则/preset

- `domain/DomainRegistry.js` → `src/domain/DomainRegistry.js` — Domain 解析、验证、安全 getter
- `domain/validateDomain.js` → `src/domain/validateDomain.js` — Domain 配置契约验证
- `domain/ForbiddenTerms.js` → `src/domain/ForbiddenTerms.js` — Domain 感知文本过滤工具
- `domain/index.js` → `src/domain/index.js` — 公共导出
- `core/WorldviewConstraints.js` → deleted (replaced by `domain/ForbiddenTerms.js`) — Legacy 兼容包装器
- `presets/campus/index.js` → `presets/campus/index.js` — Campus 域预设（保持在 src/ 外）
- `presets/campus/schedules.js` → `presets/campus/schedules.js` — Campus 日程模板
- `presets/tavern/index.js` → `presets/tavern/index.js` — Tavern 域预设（保持在 src/ 外）

### store — persistence/serialization

- `store/SQLiteStore.js` → `src/store/SQLiteStore.js` — SQLite 持久化存储
- `store/SimulationStore.js` → `src/store/SimulationStore.js` — 模拟状态持久化
- `store/SnapshotStore.js` → `src/store/SnapshotStore.js` — 快照管理
- `store/StoryStore.js` → `src/store/StoryStore.js` — 故事/叙事持久化
- `store/MetaStore.js` → `src/store/MetaStore.js` — 元数据存储
- `store/index.js` → `src/store/index.js` — 公共导出
- `world/WorldStateAdapter.js` → `src/store/WorldStateAdapter.js` — World Envelope 适配器
- `world/validator.js` → `src/store/validator.js` — World Spec + World State 验证
- `world/compiler.js` → `src/store/compiler.js` — World Spec → 初始 World State 编译器
- `world/migration.js` → `src/store/migration.js` — World State 正向版本迁移

### sdk — 对外 API

- `index.js` → `src/sdk/AndyEngine.js` + root compatibility export — AndyEngine 公共 API 入口
- `sdk/Andy.js` → `src/sdk/Andy.js` — 多角色引擎包装器
- `sdk/Character.js` → `src/sdk/Character.js` — 高层角色 API
- `sdk/LLMAdapter.js` → `src/sdk/LLMAdapter.js` — LLM 适配器
- `sdk/ConversationLog.js` → `src/sdk/ConversationLog.js` — 对话历史管理
- `sdk/AutoTick.js` → `src/sdk/AutoTick.js` — 自动 tick 调度
- `sdk/index.js` → `src/sdk/index.js` — 公共导出
- `core/AndyBridge.js` → `src/sdk/AndyBridge.js` — Andy ↔ Bobby 桥梁
- `core/AndyTownAdapter.js` → `src/sdk/AndyTownAdapter.js` — Andy Town 适配器

### shared — 跨层共享协议

- `core/RNG.js` → `src/shared/rng.js` — 可播种 PRNG（Mulberry32）

### config — 配置

- `config/defaults.js` → `src/config/defaults.js` — 所有可调参数集中定义
- `config/validate.js` → `src/config/validate.js` — 引擎初始化配置验证器

---

## Legacy / 兼容性包装器

| 当前路径 | 委托目标 | 说明 | 计划删除阶段 |
|----------|----------|------|-------------|
| `core/EventEffectPipeline.js` | `effects/EventEffectPipeline.js` | 2 行兼容性 re-export | Phase 4 (Canon/Knowledge/Narrative Split) |
| `core/WorldviewConstraints.js` | `domain/ForbiddenTerms.js` | 校园词汇过滤，Legacy 包装器 | Phase 3 (Public/Private Contract Split) |

---

## Gate 模块清单

以下模块受功能开关控制，未开启时无运行时影响：

| 模块组 | 开关 | 默认值 | 涉及文件 |
|--------|------|--------|----------|
| Facts System | `enableFacts` | `false` | `facts/*.js`, `agent/FutureTendencyTracker.js`, `agent/LocationMeaningInfluence.js` |
| Action Selection | `actionSelection.enabled` | `false` | `agent/action/*.js`, `core/WorldPressure.js` |
| Event Effects | `actionSelection.mode` | `'shadow'` | `effects/EventEffectPipeline.js` |
| Native Acceleration | `ANDY_USE_NATIVE` | `0` | `agent/EmotionVector.native.js`, `agent/NeedsSystem.native.js` |

---

## 统计摘要

| 类别 | 文件数 | 总行数 |
|------|-------|--------|
| 核心运行时 (agent/core) | 29 | 11,881 |
| 事实/知识/叙事 (facts) | 9 | 2,548 |
| 效果 (effects) | 1 | 279 |
| 空间 (spatial) | 4 | 1,120 |
| 社交 (social) | 2 | 653 |
| 域/预设 (domain/presets) | 7 | 1,809 |
| 存储 (store/world) | 10 | 1,423 |
| SDK | 7 | 1,535 |
| 配置 (config) | 2 | 604 |
| 根入口 (index.js) | 1 | 601 |
| 脚本/工具 (scripts) | 2 | 1,005 |
| 基准 (benchmarks) | 6 | 1,339 |
| 数据生成 (data_generator) | 7 | 2,239 |
| 实验 (experiments) | 21 | 7,183 |
| 示例 (examples) | 3 | 260 |
| 测试 (tests/) | 62 | 13,688 |
| 根目录测试脚本 | 6 | 5,569 |
| 测试配置 | 1 | 36 |
| **总计** | **179** | **~53,770** |

---

## 依赖方向（当前状态）

```
config ← agent/core/facts/social/spatial/domain/store/sdk
domain ← agent/core/facts
core   ← agent/facts/sdk (反向：core 不应依赖 agent/facts/sdk)
agent  ← sdk (反向：agent 不应依赖 sdk)
facts  ← sdk/index.js (通过 require)
```

**已知方向违规**（参见 `scripts/check-boundaries.js` ALLOWED_IMPORTS）：
- `core/EventEffectPipeline.js` → `effects/EventEffectPipeline.js`（兼容性 re-export）
- `core/WorldviewConstraints.js` 被 `index.js` 直接引用（应通过 domain）
- `sdk/NarrativeBuilder.js` 位于 sdk/ 但实际职责属于 narrative 层

---

*本文档是 Clean Architecture Pass Phase 1 交付物。每个模块的 target mapping 来自 `docs/CLEAN_ARCHITECTURE_PLAN.md` §5。状态标注参考 `docs/ARCHITECTURE_SNAPSHOT.md`。*
