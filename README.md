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
| ACT-R memory model | 5-pathway retrieval + mood-congruent recall | Importance-based | Flat | Flat |
| Big Five personality | OCEAN + 16 MBTI mapping | None | None | Role-based |
| Maslow needs system | 5 drives + personality modulation | None | None | None |
| Social graph dynamics | Dunbar layers + triadic closure + gossip | Static links | Chat only | Team only |
| Emotion regulation | Gross process model (3 strategies) | None | None | None |
| Procedural memory | Habit formation + disruption | None | None | None |
| Intrinsic motivation | Curiosity + self-generated goals | None | None | None |
| Health & illness system | Dynamic health + sick leave | None | None | None |
| Negative behaviors | Skip class, procrastinate, call in sick | Deterministic | Deterministic | Deterministic |

**This is not another Agent framework. This is a Character Engine.**

---

## Proven Results

| Metric | Result |
|---|---|
| A/B: Andy vs Plain LLM | **4.92 vs 2.63** (Andy wins all 8 scenarios) |
| Personality consistency | OCEAN variance = 0 after 50 turns |
| Memory retention | 100% for high-importance events at Day 7 |
| Emotion contagion | r = 0.818 for high-interaction pairs |
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
│   ├── StoryGenerator.js     Narrative generation for LLM prompt injection
│   └── AndyBridge.js         Bridge to external LLM
│
├── agent/
│   ├── Agent.js              Autonomous agent (13 sub-modules)
│   ├── Personality.js        MBTI → OCEAN → behavior mapping
│   ├── EmotionVector.js      30-dim emotion (10-step evolution pipeline)
│   ├── StateMachine.js       42-state machine (event-driven transitions)
│   ├── PersonalMemory.js     ACT-R memory (5-pathway retrieval + semantic classification)
│   ├── NeedsSystem.js        Maslow hierarchy (5 drives + personality modulation)
│   ├── Appraisal.js          Cognitive appraisal (Scherer CPM, 8 dimensions)
│   ├── EmotionRegulation.js  Gross process model (3 strategies)
│   ├── IntrinsicMotivation.js Curiosity + self-generated goals
│   ├── ProceduralMemory.js   Habit formation + disruption
│   └── Schedule.js           Schedule system (presets + Gaussian noise)
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
│   ├── SQLiteStore.js        WAL mode, prepared statements, 64MB cache
│   ├── SimulationStore.js    Lifecycle management + buffering
│   ├── StoryStore.js         Story/narrative storage
│   ├── SnapshotStore.js      World state snapshots
│   └── MetaStore.js          Simulation metadata
│
├── native/                   Rust N-API acceleration
│   └── src/
│       ├── emotion/          SoA f32 emotion engine (rayon parallel)
│       └── needs/            Needs computation
│
├── experiments/              Experiment suite with results
├── data_generator/           Training data generation pipeline
├── demo/character-lab/       Web demo (Express + WebSocket)
└── config/defaults.js        All tunable parameters
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

**3 lines to create a character with memory:**

```javascript
const AndyEngine = require('./index');

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
```

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
- Rich system prompt built from character state (emotion, needs, memory, relationships)
- Conversation history with sliding window
- Save/restore character state
- Supports OpenAI, Anthropic, and custom LLM functions
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
const { createStore } = require('./store');

const store = createStore({ dbPath: './data/andy.db' });
store.saveSnapshot(engine.toJSON());

// Later: restore
const data = store.loadLatestSnapshot();
const engine2 = AndyEngine.fromJSON(data);
```

---

## Experiments

See `experiments/` for the full experiment suite:

- **practical_eval/** — A/B comparison, personality consistency, state awareness, memory, emergent behavior
- **llm_ab_test/** — 100-turn long conversation evaluation across 5 dimensions
- **spatial_eval/** — Spatial engine quality and scalability
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
| **长期记忆** | AI 会记住你，也会遗忘 |
| **人格稳定** | 聊 100 轮也不会性格突变 |
| **情绪动态** | 情绪会变化、会衰减、会传染 |
| **社交网络** | AI 之间自动建立关系 |
| **多角色社会** | 多个 AI 共同生活、互相影响 |

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

```javascript
const AndyEngine = require('./index');

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
```

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
- 从角色状态自动构建丰富的 system prompt（情绪、需求、记忆、社交关系）
- 对话历史滑动窗口管理
- 保存/恢复角色状态
- 支持 OpenAI、Claude、自定义 LLM 函数
- 多角色模式（`Andy` 类）

详见 `examples/` 目录。
## 许可证

[GNU Affero General Public License v3.0](LICENSE)

可自由使用、修改和分发，但需遵守 AGPL-3.0 条款。

商业授权联系：huangweijiebobby@gmail.com
