# Andy Engine

**A world that runs itself.**

> **[中文](#andy-engine-中文)**

Andy is a psychology-driven multi-agent social simulation engine. Each character has independent emotions, memories, personality, and social relationships, autonomously evolving in a shared world — no manual intervention, no large language models. The world moves on its own.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Rust Native](https://img.shields.io/badge/Rust-Native-orange.svg)](native/)

---

### Plain AI vs Andy Engine

```
         Plain AI                    Andy Engine

         User                        User
           ↕                           ↕
          AI                        AI A ↔ AI B
                                     ↕      ↕
                                   AI C ↔ AI D
```

Plain AI is a **tool**. Andy Engine's AI are **characters** — they have their own emotions, memories, and social relationships. They interact with each other autonomously.

| Plain AI | Andy Engine |
|---|---|
| Starts fresh every time | Remembers everything you said |
| Personality via prompts | Personality stable across 100+ turns |
| Fake emotions | Real emotional evolution and contagion |
| Only user ↔ AI | AI characters form relationship networks |

---

### Why Andy over other frameworks?

| Feature | Andy | Generative Agents | CAMEL | ChatDev |
|---|---|---|---|---|
| 30-dimensional emotion | Cowen & Keltner (2017) | Valence only | None | None |
| Continuous behavior field | 4D Langevin dynamics + personality modulation | Discrete states | Discrete states | Discrete states |
| ACT-R memory model | 5-pathway retrieval + mood-congruent recall | Importance-based | Flat | Flat |
| Big Five personality | OCEAN + 16 MBTI mapping | None | None | Role-based |
| Maslow needs system | 5 drives + personality modulation | None | None | None |
| Social graph dynamics | Dunbar layers + triadic closure + gossip | Static links | Chat only | Team only |
| Emotion regulation | Gross process model (3 strategies) | None | None | None |
| Procedural memory | Habit formation + disruption | None | None | None |
| Intrinsic motivation | Curiosity + self-generated goals | None | None | None |
| Health & illness system | Dynamic health + sick leave | None | None | None |
| Negative behaviors | Skip class, procrastinate, call in sick | Deterministic | Deterministic | Deterministic |

**This is not another Agent framework. Andy Engine is evolving into a persistent world engine: characters, facts, knowledge, relationships, memories, and events continue to shape the world even when no one is watching.**

---

## Proven Results

| Metric | Result |
|---|---|
| A/B: Andy vs Plain LLM | **4.92 vs 2.63** (Andy wins all 8 scenarios) |
| Personality consistency | OCEAN variance = 0 after 50 turns |
| Memory retention | 100% for high-importance events at Day 7 |
| Emotion contagion | r = 0.818 for high-interaction pairs |
| Behavior field: personality diff | INFP vs ESTP B-distance = 0.239 across 4D space |
| Behavior field: hunger convergence | 25 ticks from library → cafeteria |
| Performance (JS) | 20 agents × 10 days = 25.6s |
| Performance (Rust SoA f32) | 50K agents × 20 ticks = 24.9ms/tick (**5.92x speedup**) |
| Scale test | 500K agents, 8.94x speedup with Dunbar hierarchical contagion |

---

## Architecture

```
AndyEngine
├── core/
│   ├── World.js              World state (time, environment, agent collection)
│   ├── Simulator.js          Hybrid Tick+Event scheduler (5-step pipeline)
│   ├── EventDispatcher.js    Event system (5 sources + causal chains + semantic classification)
│   ├── EventEffectPipeline.js Action/event consequences pipeline
│   ├── WorldPressure.js      World pressure computation (pure function)
│   ├── StoryGenerator.js     Narrative generation for LLM prompt injection
│   ├── RNG.js                Seedable PRNG (Mulberry32, deterministic replay)
│   └── AndyBridge.js         Bridge to external LLM
│
├── agent/
│   ├── Agent.js              Autonomous agent (behavior field driven)
│   ├── BehaviorField.js      4D continuous behavior field (Langevin dynamics)
│   ├── BehaviorLabeler.js    Semantic label projection (50 state centers)
│   ├── Personality.js        MBTI → OCEAN → behavior mapping
│   ├── EmotionVector.js      30-dim emotion (10-step evolution pipeline)
│   ├── StateMachine.js       State metadata only (42 states, read-only)
│   ├── PersonalMemory.js     ACT-R memory (5-pathway retrieval + semantic classification)
│   ├── NeedsSystem.js        Maslow hierarchy (5 drives + continuous gradient)
│   ├── Appraisal.js          Cognitive appraisal (Scherer CPM, 8 dimensions)
│   ├── EmotionRegulation.js  Gross process model (3 strategies)
│   ├── IntrinsicMotivation.js Curiosity + self-generated goals
│   ├── ProceduralMemory.js   Habit formation + disruption
│   ├── Schedule.js           Schedule system (presets + Gaussian noise)
│   ├── FutureTendencyTracker.js  Future behavioral tendency tracking
│   ├── LocationMeaningInfluence.js Location meaning influence
│   └── action/               Action selection stack (experimental)
│       ├── ActionCandidate.js    Pure JSON candidate representation
│       ├── GoalSystem.js        Serializable goal management
│       ├── UtilityScorer.js     12-dimension scoring
│       ├── UtilitySelector.js   Utility-based selection
│       ├── WorldObject.js       World object interaction
│       └── providers/           7 candidate providers
│
├── facts/                    World canon facts system (experimental)
│   ├── FactSchema.js         Fact type definitions & validation
│   ├── KnowledgeStore.js     Knowledge storage
│   ├── WorldFactStore.js     World fact store
│   ├── CanonEventPipeline.js Event → fact pipeline
│   ├── FactProvider.js       Fact grounding boundaries
│   └── FactConsistencyChecker.js Consistency validation (regex-based)
│
├── social/
│   ├── SocialGraph.js        Global social graph (Dunbar layers + triadic closure)
│   └── Relationship.js       Logarithmic growth + emotional bonds
│
├── spatial/
│   ├── SpatialEngine.js      Continuous coordinate movement
│   ├── SpatialHash.js        Spatial hash for O(1) neighbor queries
│   ├── RegionGrid.js         Region-based agent index
│   └── WorldMap.js           Map with named locations
│
├── store/                    Persistence layer (SQLite)
│
├── domain/                   Domain architecture
│   ├── DomainRegistry.js     Domain parsing and management
│   └── validateDomain.js     Domain config validation
│
├── world/                    Persistent world tooling
│   ├── WorldStateAdapter.js  Stable Envelope adapter
│   ├── validator.js          World Spec/State schema validation
│   ├── compiler.js           World Spec → engine config
│   └── migration.js          Schema version migration
│
├── presets/                  World presets
│   ├── campus/               Campus world (default)
│   └── tavern/               Medieval tavern world (example)
│
├── config/defaults.js        All tunable parameters
└── sdk/                      High-level SDK
```

---

## Current Architecture Status

Andy Engine is evolving from a character simulation engine into a persistent world engine.

### Stable

- Domain-agnostic runtime with campus default preset and custom domain support
- Continuous 4D BehaviorField as the core behavior dynamics layer
- Seeded RNG baseline for reproducible core simulations
- Performance benchmark / profiling / perf-check baseline
- 1000+ tests across unit, integration, domain, compatibility, and source-scan suites

### Experimental

- Action candidate stack: `CandidateProvider`, `UtilityScorer`, `UtilitySelector`, `ReasonTrace`
- `EventEffectPipeline` for action/event consequences
- `WorldPressure` and `FutureTendencyTracker`
- WorldCanon facts system: `WorldFactStore`, `CanonEventPipeline`, `KnowledgeStore`, `FactProvider`
- Grounded narrative package and `FactConsistencyChecker`

### Not Production Contract Yet

- Fact schema and Knowledge schema may still change
- `FactConsistencyChecker` is regex-based and experimental
- `WorldObject` is modeled but not fully integrated into `Agent.tick`
- StoryArc runtime is paused
- npm package has not been published

---

## Continuous Behavior Field

Andy's characters don't jump between discrete states — they move through a continuous 4D behavior space:

```
B = (activity, sociality, focus, expressiveness) ∈ [0,1]⁴
```

| Dimension | 0 (low) | 1 (high) |
|---|---|---|
| activity | Resting / sleeping | Working / exercising |
| sociality | Alone / daydreaming | Chatting / socializing |
| focus | Mind-wandering | Deep concentration |
| expressiveness | Withdrawn / reserved | Outward / expressive |

**How it works:**

```
Needs (5D) ─────→ needs gradient ──────┐
Emotion (30D) ──→ emotion gradient ────┤
Schedule ───────→ schedule gradient ───┼──→ ∇U ──→ Langevin dynamics ──→ B ∈ [0,1]⁴
Intrinsic ──────→ intrinsic gradient ──┤         v(t+dt) = v(t)·(1-γ·dt)
Habit ──────────→ habit gradient ──────┘           - ∇U·dt + σ·√dt·ξ
                                                        ↓
                                                  BehaviorLabeler
                                                        ↓
                                                  Semantic label
```

- **5 gradient sources** create a potential energy surface — needs pull toward food/sleep, schedule pulls toward class/work, emotions push toward social/withdrawal
- **Underdamped Langevin dynamics** — the behavior has mass (momentum), so a hungry character might keep chatting before going to eat
- **Personality modulation** — high neuroticism → high friction (slow behavior change), high extraversion → high noise (unpredictable), high conscientiousness → strong schedule adherence
- **Semantic labels** are projected from the continuous space via nearest-neighbor (50 state centers in 4D)
- **Time-aware labels** — labels get penalties for time-inappropriate states (e.g., "in class" at 3 AM gets a distance penalty)

**Why it matters:**

- **Richer LLM prompts**: "In the library, but focus is only 0.3 and sociality is rising — she might leave soon"
- **Continuous transitions**: behavior slides smoothly between states, not discrete jumps
- **Personality emerges from physics**: different OCEAN values create different dynamics on the same potential surface — no hardcoded weight tables
- **Needs → behavior is natural**: hunger creates a gradient that pulls B toward the food zone, not a discrete state switch

**Validation** (`experiments/behavior_field_personality.js`):

```
── INFP ──  γ=4.20  σ=0.097  B=[0.38, 0.41, 0.20, 0.39]  12 unique labels
── ESTP ──  γ=3.80  σ=0.213  B=[0.37, 0.32, 0.16, 0.41]   9 unique labels
── ISTJ ──  γ=3.40  σ=0.108  B=[0.33, 0.34, 0.24, 0.35]  13 unique labels
── ENFP ──  γ=4.20  σ=0.202  B=[0.43, 0.37, 0.20, 0.41]  14 unique labels

INFP vs ESTP: B-distance=0.101, speed ratio=1.50×
```

---

## Quick Start

```bash
# Run the demo
cd demo/character-lab
npm install
node server.js
# → http://localhost:3456
```

**Default campus mode (backward compatible):**

```javascript
const AndyEngine = require('andy-engine');

const engine = new AndyEngine();
const maya = engine.createCharacter({
  id: 'maya',
  name: 'Maya',
  mbti: 'INFP',
  background: ['A quiet librarian who loves stargazing'],
  schedule: 'student',
});

// Advance simulation
engine.tick();

// Get character's inner narrative (inject into LLM system prompt)
const context = engine.getNarrative('maya', {
  userText: "I'm so tired today",
});

// Access continuous behavior state
const agent = engine.getAgent('maya');
console.log(agent.behavior);
```

**Custom domain mode:**

```javascript
const AndyEngine = require('andy-engine');
const tavernDomain = require('andy-engine/presets/tavern');

const engine = new AndyEngine({ domain: tavernDomain });

const blacksmith = engine.createCharacter({
  id: 'blacksmith',
  name: '铁匠',
  mbti: 'ISTJ',
  schedule: 'blacksmith', // Uses domain.roleArchetypes.blacksmith
});

engine.tick();
console.log(blacksmith.toNarrative());
// "在铁匠铺，炉火熊熊。有点累了"
```

**Facts & Grounding (experimental, opt-in):**

```javascript
const engine = new AndyEngine({
  domain: tavernDomain,
  enableFacts: true,
  seed: 42, // reproducible simulation
});

const bobby = engine.createCharacter({ id: 'bobby', name: 'Bobby' });
engine.tick();

const grounding = engine.getGroundingPackage('bobby');
console.log(grounding.allowedFacts);
// Facts/Grounding are experimental and opt-in via enableFacts: true.
```

---

## Domain Architecture

Andy Engine supports **domain config** — a declarative way to define a world's regions, states, events, and semantics.

```javascript
const engine = new AndyEngine({ domain: customDomain });
```

**Key concept:** Core engine is world-agnostic. All world-specific semantics (regions, states, events, narratives) come from the domain preset.

| Component | Source |
|---|---|
| Regions & adjacency | `domain.regions`, `domain.adjacency` |
| States & behavior centers | `domain.states`, `domain.stateCenters` |
| Events | `domain.eventTemplates` |
| Needs mapping | `domain.needSatisfactionMap`, `domain.needRegionConfig` |
| Narratives | `domain.narrativeTemplates` |
| Schedule presets | `domain.roleArchetypes` |
| Forbidden terms | `domain.forbiddenTerms` (final guard only) |

**Default preset:** `presets/campus` (campus world, backward compatible)

**Custom domain example:** `presets/tavern` (medieval tavern, 5 regions, 8 states)

See [`docs/DOMAIN.md`](docs/DOMAIN.md) for full schema reference.

---


## SDK

The easiest way to use Andy Engine. Three lines to create a character with memory, emotion, and personality:

```javascript
const { Character } = require("./sdk");

const maya = new Character({
  name: "Maya",
  personality: "INFP",
  backstory: ["A quiet librarian", "Loves stargazing", "Has a cat named Doudou"],
  llm: { provider: "openai", apiKey: "sk-..." },
});

const reply = await maya.chat("I'm so tired today");
// Maya replies based on her current emotion, memory, and personality
```

**Features:**
- Auto time management (no manual `tick()` needed)
- Rich system prompt built from character state (emotion, needs, memory, relationships, behavior trends)
- Conversation history with sliding window
- Save/restore character state
- Supports OpenAI, Anthropic, Ollama, and custom LLM functions
- Multi-character mode with `Andy` class

See `examples/` for working demos.
## Rust Native Acceleration

For large-scale simulations, enable the Rust native module:

```bash
cd native && npm install && npm run build
ANDY_USE_NATIVE=1 node your_script.js
```

The Rust SoA f32 engine achieves **5.92x speedup** over JS at 50K agents, with precision error < 1e-8.

---

## Persistence

```javascript
const AndyEngine = require('andy-engine');
const { createStore } = require('andy-engine/store');

// Create store with SQLite backend
const store = createStore({ dbPath: './data/andy.db' });

// Initialize with serialization functions
await store.init({
  onSnapshot: () => Buffer.from(JSON.stringify(engine.toJSON())),
  onRestore: (data) => {
    const state = JSON.parse(data.toString());
    // Restore engine from saved state
  },
});

// In your tick loop, store will auto-save snapshots
// based on snapshotInterval (default: every 12 ticks)

// Shutdown gracefully
await store.shutdown();
```

**Advanced:** For direct SQLite access:

```javascript
const { SQLiteStore } = require('andy-engine/store');

const db = new SQLiteStore('./data/andy.db');
db.saveSnapshot(tick, virtualTime, data);
const latest = db.loadLatest();
```

---

## Experiments

See `experiments/` for the full experiment suite:

- **practical_eval/** — A/B comparison, personality consistency, state awareness, memory, emergent behavior
- **llm_ab_test/** — 100-turn long conversation evaluation across 5 dimensions
- **spatial_eval/** — Spatial engine quality and scalability
- **behavior_field_personality.js** — 4 personality types behavior field comparison
- **output_round5/** — Round 5 iteration results

---

## Data Generator

`data_generator/` can produce synthetic training data for LLM fine-tuning:

- 5,000 agents × 30 days = **44 million data points** in 7 minutes
- ChatML format, ready for fine-tuning
- Emotion change contrast samples + multi-turn dialogues

---

## License

[GNU Affero General Public License v3.0](LICENSE)

You are free to use, modify, and distribute this software, provided that:
- You disclose the source code of any modified version
- You include the AGPL-3.0 license notice
- Network use counts as distribution (if you run a modified version as a service, you must share the source)

For commercial licensing inquiries: huangweijiebobby@gmail.com

---

---

# Andy Engine 中文

**一个自己运转的世界。**

Andy 是一个心理学驱动的多智能体社会模拟引擎。每个角色拥有独立的情绪、记忆、人格和社交关系，在共享世界中自主演化——不需要人工干预，不需要大语言模型。世界自己在运转。

---

## 普通 AI vs Andy Engine

| 普通 AI | Andy Engine |
|---|---|
| 每次对话从零开始 | 记住你说过的每一件事 |
| 性格靠提示词维持 | 100+ 轮对话后人格不变 |
| 情绪是假装的 | 情绪会真实变化、会传染给其他角色 |
| 只有用户 ↔ AI | AI 之间会形成关系网 |

---

## 核心能力

| 能力 | 它意味着什么 |
|---|---|
| **连续行为场** | 角色在 4D 行为空间中平滑移动，不跳变 |
| **长期记忆** | AI 会记住你，也会遗忘 |
| **人格稳定** | 聊 100 轮也不会性格突变 |
| **情绪动态** | 情绪会变化、会衰减、会传染 |
| **社交网络** | AI 之间自动建立关系 |
| **多角色社会** | 多个 AI 共同生活、互相影响 |

---

## 连续行为场

Andy 的角色不在 42 个离散状态之间跳变——它们在 4 维连续行为空间中平滑移动：

```
B = (活跃度, 社交性, 专注度, 表达欲) ∈ [0,1]⁴
```

**工作原理：**

1. 5 个梯度源（需求、情绪、日程、自发动机、习惯）在行为空间中创建势能面
2. 欠阻尼朗之万动力学驱动行为演化——行为有"质量"（动量），饿了的人可能会先把天聊完再去吃饭
3. 人格调制动力学参数：高神经质 → 高摩擦（行为难以改变），高外向性 → 高噪声（行为更随机）
4. 语义标签从连续空间投影（50 个状态中心点的最近邻匹配）
5. 时间感知惩罚：凌晨 3 点"在上课"会获得额外距离惩罚

**实际效果：**
- LLM prompt 更丰富："在图书馆，但专注度只有 0.3，社交性在上升——她可能几分钟后会离开"
- 行为过渡平滑，不跳变
- 人格差异从物理层面涌现，不需要硬编码权重表

---

## 适合谁

- **AI 陪伴** — 让 AI 伴侣真正"活"起来——有记忆、有情绪、会成长
- **游戏 NPC** — NPC 有记忆、有性格、有自己的社交圈
- **AI 社区** — 一群 AI 角色共同生活、互动、形成社会
- **虚拟偶像** — 虚拟偶像有自己的性格和社交关系
- **AI 主播** — AI 主播之间会互动、竞争、合作

> 不适合：企业自动化、办公 Agent。

---

## 已验证的效果

| 指标 | 结果 |
|---|---|
| A/B 对比 Andy vs Plain LLM | 4.92 vs 2.63（Andy 全胜） |
| 人格一致性 | 50 轮对话后 OCEAN 方差 = 0 |
| 记忆保留 | 7 天后高重要事件 100% 保留 |
| 情绪传染 | 高互动角色对 r=0.818 |
| 行为场人格差异 | INFP vs ESTP B 距离 = 0.239 |
| 行为场饥饿收敛 | 25 tick 从图书馆到食堂 |
| 性能 (JS) | 20 个角色 × 10 天模拟 = 25.6 秒 |
| 性能 (Rust SoA f32) | 50K agents × 20 ticks = 24.9ms/tick（5.92x 加速） |

---

## 快速开始

```bash
cd demo/character-lab
npm install
node server.js
# → http://localhost:3456
```

**默认校园模式（向后兼容）：**

```javascript
const AndyEngine = require('andy-engine');

const engine = new AndyEngine();
const maya = engine.createCharacter({
  id: 'maya',
  name: 'Maya',
  mbti: 'INFP',
  background: ['一个安静的图书馆管理员，喜欢看星星'],
  schedule: 'student',
});

engine.tick();

// 获取角色内心叙事（注入 LLM 的 system prompt）
const context = engine.getNarrative('maya', {
  userText: '我今天很累',
});

// 获取连续行为状态
const agent = engine.getAgent('maya');
console.log(agent.behavior);
```

**自定义世界观模式：**

```javascript
const AndyEngine = require('andy-engine');
const tavernDomain = require('andy-engine/presets/tavern');

const engine = new AndyEngine({ domain: tavernDomain });

const blacksmith = engine.createCharacter({
  id: 'blacksmith',
  name: '铁匠',
  mbti: 'ISTJ',
  schedule: 'blacksmith', // 使用 domain.roleArchetypes.blacksmith
});

engine.tick();
console.log(blacksmith.toNarrative());
// "在铁匠铺，炉火熊熊。有点累了"
```

---

## 领域架构

Andy Engine 支持 **domain config** — 一种声明式的方式来定义世界的区域、状态、事件和语义。

```javascript
const engine = new AndyEngine({ domain: customDomain });
```

**核心概念：** 引擎核心是世界无关的。所有世界特定的语义（区域、状态、事件、叙事）来自 domain preset。

| 组件 | 来源 |
|------|------|
| 区域与邻接 | `domain.regions`, `domain.adjacency` |
| 状态与行为中心 | `domain.states`, `domain.stateCenters` |
| 事件 | `domain.eventTemplates` |
| 需求映射 | `domain.needSatisfactionMap`, `domain.needRegionConfig` |
| 叙事 | `domain.narrativeTemplates` |
| 日程预设 | `domain.roleArchetypes` |
| 禁止词 | `domain.forbiddenTerms`（仅作最后防线） |

**默认预设：** `presets/campus`（校园世界，向后兼容）

**自定义 domain 示例：** `presets/tavern`（中世纪酒馆，5 个区域，8 个状态）

详见 [`docs/DOMAIN.md`](docs/DOMAIN.md) 完整 schema 参考。

---


## SDK 使用

最简单的方式，三行代码创建一个有记忆、有情绪、有性格的角色：

```javascript
const { Character } = require("./sdk");

const maya = new Character({
  name: "Maya",
  personality: "INFP",
  backstory: ["一个安静的图书馆管理员", "喜欢看星星", "养了一只橘猫叫豆豆"],
  llm: { provider: "openai", apiKey: "sk-..." },
});

const reply = await maya.chat("我今天好累");
// Maya 会根据她当前的情绪、记忆和性格来回复
```

**特性：**
- 自动时间管理（不需要手动调用 `tick()`）
- 从角色状态自动构建丰富的 system prompt（情绪、需求、记忆、社交关系、行为趋势）
- 对话历史滑动窗口管理
- 保存/恢复角色状态
- 支持 OpenAI、Claude、Ollama、自定义 LLM 函数
- 多角色模式（`Andy` 类）

详见 `examples/` 目录。
## 许可证

[GNU Affero General Public License v3.0](LICENSE)

可自由使用、修改和分发，但需遵守 AGPL-3.0 条款。

商业授权联系：huangweijiebobby@gmail.com
