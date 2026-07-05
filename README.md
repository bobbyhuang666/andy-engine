# Andy Engine

**Persistent life-world runtime for AI characters.**

> **[中文](#andy-engine-中文)**

Andy Engine maintains a shared **WorldCanon**: what happened, who saw it, and what changed.

Each character only knows part of that world, instead of having omniscient memory.

Actions become canonical events that affect memory, relationships, location meaning, and future behavior.

LLMs only express what a character knows; they do not create world facts.

> **Release**: v2.0.1 alpha — Foundation-stage persistent agent runtime.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

---

## The core problem

Most AI characters can say "I went to the backyard yesterday" even if no world system recorded it.

Andy takes the opposite approach:

1. Alex moves from the tavern hall to the backyard at 21:30.
2. The engine records this as a **CanonEvent**.
3. Alex knows the full event.
4. Mira only saw Alex leave the hall.
5. Leo knows nothing.
6. The LLM can only express each character's own knowledge.

---

## How it works

```
WorldCanon
  → Observation / Knowledge
  → Agent State & World Pressure
  → Action Candidates / Utility Selection
  → CanonEvent
  → EventEffectPipeline
  → Memory / Relationship / LocationMeaning / FutureTendency
  → Grounded Narrative
```

Characters are driven by:
- **30-dimensional emotion** (Cowen & Keltner 2017) with 10-step evolution pipeline
- **Continuous 4D behavior field** (Langevin dynamics + personality modulation)
- **ACT-R memory** with mood-congruent recall and forgetting
- **Maslow needs** with continuous gradient
- **Dunbar social graph** with triadic closure and gossip

The LLM is a rendering layer, not the source of truth.

---

## Current Verification

| Area | Status |
|---|---|
| Unit / integration / domain / source-scan tests | 3312 tests passing / 28 skipped |
| Custom domain | Tavern preset passes domain-agnostic validation |
| Facts / grounding | Covers event → fact → knowledge, agent_state epistemic boundary |
| Seeded RNG | Core runtime paths support seeded simulation baseline (not full deterministic replay) |
| Perf-check | Benchmark / contagion profile regression checks exit 0 in 3-run median mode |
| Early subjective evaluation | Internal experiments suggest stronger character continuity and presence; not yet published as a standard benchmark |

## AffectCompiler

Andy Engine includes a basic AffectCompiler that converts internal psychological state into structured expression constraints.

**Key principle**: Engine owns state, LLM owns wording only.

The AffectCompiler produces an AffectFrame with:
- Valence/arousal bands
- Interpersonal posture
- Expression constraints (warmth, directness, initiative, defensiveness)
- Visible micro behaviors
- Forbidden expression modes

This ensures the LLM receives expression constraints, not raw psychology data.

## Known Limitations

1. E2E semantic tests are improving but not exhaustive
2. Full deterministic replay is not claimed — seeded RNG provides baseline for core paths only
3. External production users are not yet established
4. Domain maturity varies by preset
5. **D5 Grounded Narrative Faithfulness is at Warning** — `FactConsistencyChecker` is regex-based and experimental; it detects hand-crafted violation patterns but has not been validated against real LLM-generated output. A Stable release requires D5 hardening.
6. Package has not been published to npm — infrastructure is ready, publish requires explicit human approval

---

## Architecture

```
AndyEngine
├── index.js                  Public AndyEngine facade
├── agent/Agent.js            Public-approved Agent compatibility adapter
├── facts/index.js            Public facts facade
├── domain/index.js           Public domain facade
├── store/index.js            Public store facade
├── sdk/index.js              Public SDK facade
│
├── src/
│   ├── runtime/              AndyWorld, EventDispatcher, WorldClock, RuntimeConfig
│   ├── agent/                AgentRuntime, lifecycle, handlers, facade, memory, psychology, schedule
│   ├── action/               ActionCandidate, providers, UtilityScorer, UtilitySelector, ReasonTrace
│   ├── canon/                WorldFactStore, FactSchema, CanonEventPipeline, FactEmitter
│   ├── knowledge/            KnowledgeStore: who knows what
│   ├── narrative/            FactProvider, FactConsistencyChecker, FactFormatter, StoryGenerator
│   ├── effects/              EffectCommitter, EventEffectPipeline, typed deltas
│   ├── pressure/             Need, memory, relationship, location, and world pressure sources
│   ├── domain/               DomainRegistry, validateDomain, forbidden-term guard
│   ├── config/               Defaults and config validation
│   ├── shared/               RNG, ids, errors, time, schemas
│   ├── social/               SocialGraph, Relationship
│   ├── spatial/              RegionGrid, SpatialEngine, SpatialHash, WorldMap
│   ├── store/                Persistence, serialization, world schema tooling
│   └── sdk/                  Character, Andy, LLMAdapter, NarrativeBuilder
│
├── presets/                  World presets
│   ├── campus/               Campus world (default)
│   └── tavern/               Medieval tavern world (example)
└── docs/                     Domain, architecture, performance, and governance docs
```

---

## Current Architecture Status

Andy Engine v2 is the architecture-preview line that turns Andy from a character simulation engine into a persistent world engine.

### Stable

- Domain-agnostic runtime with campus default preset and custom domain support
- Continuous 4D BehaviorField as the core behavior dynamics layer
- Seeded RNG baseline for reproducible core runtime paths (not full deterministic replay)
- Performance benchmark / profiling / perf-check baseline
- 3312 tests passing / 28 skipped across unit, integration, domain, compatibility, and source-scan suites
- Core runtime tests and default package smoke do not require SQLite native bindings; SQLite persistence is verified separately with `npm run sqlite:smoke`
- Clean Architecture Pass complete: `src/` owns implementation; old top-level runtime wrappers retired; Semantic Closure Pass complete with 9 domain-safe read-only providers

### Experimental

- Action candidate stack: `CandidateProvider`, `UtilityScorer`, `UtilitySelector`, `ReasonTrace`
- `EventEffectPipeline` for action/event consequences
- `WorldPressure` and `FutureTendencyTracker`
- WorldCanon facts system: `WorldFactStore`, `CanonEventPipeline`, `KnowledgeStore`, `FactProvider`
- Grounded narrative package and `FactConsistencyChecker`

### Foundation Alpha (v2.0.1)

This is a Foundation-stage alpha release. The public API surface, persistence contracts, domain configuration, and package installation are stable for downstream applications, but the package is still in alpha polish. Production use requires careful validation.

The following remain experimental or deferred to v2.1/v3:

- Fact schema and Knowledge schema may still change
- `FactConsistencyChecker` is regex-based and experimental
- `WorldObject` is modeled but not fully integrated into `Agent.tick`
- StoryArc runtime is paused
- AffectCompiler basic implementation (v0.2)
- npm publish not yet performed; package infrastructure ready for alpha release pending human approval

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

**Validation snapshot** (historical experiment asset archived outside the repo):

```
── INFP ──  γ=4.20  σ=0.097  B=[0.38, 0.41, 0.20, 0.39]  12 unique labels
── ESTP ──  γ=3.80  σ=0.213  B=[0.37, 0.32, 0.16, 0.41]   9 unique labels
── ISTJ ──  γ=3.40  σ=0.108  B=[0.33, 0.34, 0.24, 0.35]  13 unique labels
── ENFP ──  γ=4.20  σ=0.202  B=[0.43, 0.37, 0.20, 0.41]  14 unique labels

INFP vs ESTP: B-distance=0.101, speed ratio=1.50×
```

---

## Quick Start

### Minimal Example

```bash
# Clone and install
git clone https://github.com/your-username/andy-engine.git
cd andy-engine
npm install

# Run quickstart
node examples/minimal-persistent-character/quickstart.js
```

### Longitudinal Demo

```bash
# Run longitudinal demo (shows offline life)
node examples/longitudinal-life-demo/demo.js
```

### SDK Usage

```javascript
const { Character } = require('andy-engine/sdk');

const maya = new Character({
  name: "Maya",
  personality: "INFP",
  backstory: ["A quiet librarian", "Loves stargazing"],
});

const reply = await maya.chat("I'm so tired today");
```

### Default Campus Mode (Backward Compatible)

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

### Custom Domain Mode

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

### Facts & Grounding (Experimental, Opt-in)

```javascript
const engine = new AndyEngine({
  domain: tavernDomain,
  enableFacts: true,
  seed: 42, // reproducible simulation
});

const alex = engine.createCharacter({ id: 'alex', name: 'Alex' });
engine.tick();

const grounding = engine.getGroundingPackage('alex');
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

## Demos

### Longitudinal Life Demo

Demonstrates Andy Engine's "persistent life" capability:

```bash
node examples/longitudinal-life-demo/demo.js
```

**What it shows:**
- User leaves for 24 hours
- Character continues living in the background
- Events happen, relationships change, memories form
- When user returns, character responds based on real events

**Key features demonstrated:**
- Persistent world (continues ticking)
- Character continuity (state evolves over time)
- Epistemic boundary (character only knows what it experienced)
- Relationship evolution (based on interactions)
- Narrative grounded in reality (no fabrication)

## SDK

The easiest way to use Andy Engine. Three lines to create a character with memory, emotion, and personality:

```javascript
const { Character } = require("andy-engine/sdk");

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

For large-scale simulations, an optional Rust native module is available.

**Default (unset):** Pure JavaScript, no native dependency required.

**Environment modes:**

| `ANDY_USE_NATIVE` | Behavior |
|---|---|
| `unset` | Pure JS, no warning |
| `1` or `true` | Required mode — throws if native binding is missing |
| `optional` | Loads native if available, warns and falls back to JS if not |

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

**Note:** Andy Engine's published package baseline is Node.js 20+. SQLite persistence uses the optional `better-sqlite3` dependency, which also requires Node.js 20+ in the current 12.x line. If it is not installed, skipped by npm, or its native binding is not built, the store facade still loads; only constructing a `SQLiteStore` instance will throw a clear optional-dependency error. The default `smoke:pack` does not require SQLite; use `npm run sqlite:smoke` to verify SQLite persistence when `better-sqlite3` is available. Install it with:

```bash
npm install better-sqlite3
```

**Advanced:** For direct SQLite access:

```javascript
const { SQLiteStore } = require('andy-engine/store');

const db = new SQLiteStore('./data/andy.db');
db.saveSnapshot(tick, virtualTime, data);
const latest = db.loadLatest();
```

---

## Research Assets

Historical experiment suites, the old Character Lab demo, and synthetic data
generation scripts were removed from the main repository during the GitHub
cleanup pass to keep the public tree focused on the engine, examples, tests, and
current docs.

Archived local copy: kept outside this repository in the maintainer's private
archive package.

---

## License

This project is licensed under the AGPL-3.0-only license. npm publication has not been performed but package infrastructure is ready for Foundation Alpha release pending human approval.

[GNU Affero General Public License v3.0](LICENSE)

You are free to use, modify, and distribute this software, provided that:
- You disclose the source code of any modified version
- You include the AGPL-3.0 license notice
- Network use counts as distribution (if you run a modified version as a service, you must share the source)

For commercial licensing inquiries: huangweijiebobby@gmail.com

## Commercial Licensing

Commercial licensing is available for proprietary integration, hosted products, games, AI companions, robots, and enterprise deployments. Contact us for details.

---

---

# Andy Engine 中文

**AI 角色的持久世界运行时。**

Andy Engine 维护一个共享的 **WorldCanon**：发生了什么、谁看到了、什么改变了。

每个角色只知道世界的一部分，而不是拥有全知记忆。

行为会变成规范事件，影响记忆、关系、地点意义和未来行为。

LLM 只能表达角色知道的事，不能创造世界事实。

> 状态：**v2.0.1 alpha** — 基础阶段的持久化 Agent 运行时。

---

## 核心问题

大多数 AI 角色可以说"我昨天去了后院"，即使没有任何世界系统记录过这件事。

Andy 的做法相反：

1. Alex 从酒馆大厅走到后院，待了 25 分钟。
2. 引擎将此记录为 **CanonEvent**。
3. Alex 知道完整事件。
4. Mira 只看到 Alex 离开了大厅。
5. Leo 什么都不知道。
6. LLM 只能表达每个角色自己的知识。

---

## 运行主线

```
WorldCanon（世界事实）
  → 观察 / 知识积累
  → 角色状态 & 世界压力
  → 行为候选 / 效用选择
  → CanonEvent
  → EventEffectPipeline
  → 记忆 / 关系 / 地点意义 / 未来倾向
  → 有事实边界的叙事
```

角色由以下系统驱动：
- **30 维情绪**（Cowen & Keltner 2017）+ 10 步演化管线
- **连续 4D 行为场**（朗之万动力学 + 人格调制）
- **ACT-R 记忆**（情绪一致性回忆 + 自然遗忘）
- **Maslow 需求**（连续梯度）
- **Dunbar 社交图谱**（三元闭合 + 八卦传播）

LLM 是渲染层，不是事实来源。

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

## 当前架构状态

Andy Engine v2 是架构预览线：它把 Andy 从角色模拟引擎推进为 Persistent World Engine。

### 稳定

- Domain-agnostic 运行时，支持 campus 默认 preset 和自定义 domain
- 连续 4D BehaviorField 作为核心行为动力学层
- 可播种 RNG 基线，支持核心运行时路径的可复现模拟（非全路径确定性重放）
- 性能基准 / Profiling / perf-check 基线
- 3312 tests passing / 28 skipped（单元、集成、domain、兼容性、source-scan）
- Clean Architecture Pass 完成：`src/` 拥有实现，旧顶层 runtime wrappers 已退休；Semantic Closure Pass 完成，9 个 domain-safe read-only provider 已接入

### 实验性

- 行为候选栈：`CandidateProvider`、`UtilityScorer`、`UtilitySelector`、`ReasonTrace`（9 个 provider）
- `EventEffectPipeline` 行为/事件后果管线
- `WorldPressure` 和 `FutureTendencyTracker`
- WorldCanon 事实系统：`WorldFactStore`、`CanonEventPipeline`、`KnowledgeStore`、`FactProvider`
- Grounded 叙事包和 `FactConsistencyChecker`

### Foundation Alpha (v2.0.1)

这是基础阶段的 alpha 发布。公共 API、持久化契约、领域配置和包安装对下游应用已稳定，但包仍处于 alpha 磨合期。生产使用需要谨慎验证。

以下仍为实验性或推迟到 v2.1/v3：

- Fact schema 和 Knowledge schema 可能还会变化
- `FactConsistencyChecker` 基于正则表达式，是实验性的
- `WorldObject` 已建模但尚未完全集成到 `Agent.tick`
- StoryArc 运行时已暂停
- AffectCompiler 基础实现（v0.2）
- npm 尚未发布；包基础设施已就绪，等待人工审批后即可进行 alpha 发布

---

## 架构总览

```
AndyEngine
├── index.js                  AndyEngine 公共入口
├── agent/Agent.js            公开批准的 Agent 兼容适配层
├── facts/index.js            facts 公共 facade
├── domain/index.js           domain 公共 facade
├── store/index.js            store 公共 facade
├── sdk/index.js              SDK 公共 facade
│
├── src/
│   ├── runtime/              AndyWorld、EventDispatcher、WorldClock、RuntimeConfig
│   ├── agent/                AgentRuntime、lifecycle、handlers、facade、memory、psychology、schedule
│   ├── action/               ActionCandidate、providers、UtilityScorer、UtilitySelector、ReasonTrace
│   ├── canon/                WorldFactStore、FactSchema、CanonEventPipeline、FactEmitter
│   ├── knowledge/            KnowledgeStore：谁知道什么
│   ├── narrative/            FactProvider、FactConsistencyChecker、FactFormatter、StoryGenerator
│   ├── effects/              EffectCommitter、EventEffectPipeline、typed deltas
│   ├── pressure/             need / memory / relationship / location / world pressure
│   ├── domain/               DomainRegistry、validateDomain、forbidden-term guard
│   ├── config/               defaults 与配置校验
│   ├── shared/               RNG、ids、errors、time、schemas
│   ├── social/               SocialGraph、Relationship
│   ├── spatial/              RegionGrid、SpatialEngine、SpatialHash、WorldMap
│   ├── store/                持久化、序列化、world schema tooling
│   └── sdk/                  Character、Andy、LLMAdapter、NarrativeBuilder
│
├── presets/                  campus / tavern 世界预设
└── docs/                     domain、architecture、performance、governance 文档
```

**当前运行主线：**

```
WorldCanon（世界事实）
    ↓
Observation / Knowledge（观察与知识积累）
    ↓
State & Pressure（状态与世界压力）
    ↓
Action Candidate / Utility Selection（行为候选与效用选择）
    ↓
CanonEvent（规范事件）
    ↓
EventEffectPipeline（事件后果管线）
    ↓
Memory / Relationship / Location / Future Tendency（记忆/关系/地点/未来倾向）
    ↓
Grounded Narrative（有事实边界的叙事）
```

---

## 适合谁

- **AI 陪伴** — 让 AI 伴侣真正"活"起来——有记忆、有情绪、会成长
- **游戏 NPC** — NPC 有记忆、有性格、有自己的社交圈
- **AI 社区** — 一群 AI 角色共同生活、互动、形成社会
- **虚拟偶像** — 虚拟偶像有自己的性格和社交关系
- **AI 主播** — AI 主播之间会互动、竞争、合作

> 不适合：企业自动化、办公 Agent。

---

## 当前验证

| 项目 | 状态 |
|---|---|
| 单元 / 集成 / domain / source-scan 测试 | 3312 tests passing / 28 skipped |
| custom domain | tavern preset 通过 domain-agnostic 验证 |
| facts / grounding | 覆盖 event → fact → knowledge、agent_state 私有边界 |
| seeded RNG | 核心运行时路径支持 seeded simulation 基线（非全路径确定性重放） |
| perf-check | benchmark / contagion profile 回归检查以 3-run median mode exit 0 |
| 早期主观评测 | 内部实验显示角色连续性和状态感更强，尚未作为公开 benchmark 发布 |

## AffectCompiler

Andy Engine 包含一个基础的 AffectCompiler，将内部心理状态转换为结构化的表达约束。

**核心原则**：引擎拥有状态，LLM 只负责措辞。

AffectCompiler 生成 AffectFrame，包含：
- 效价/唤醒度区间
- 人际姿态
- 表达约束（温暖度、直接度、主动性、防御性）
- 可见微行为
- 禁止表达模式

这确保 LLM 接收到的是表达约束，而非原始心理数据。

## 已知限制

1. E2E 语义测试持续改进中，尚未穷尽
2. 不承诺完整的确定性重放 — seeded RNG 仅为核心路径提供基线
3. 尚未有外部生产用户
4. Domain 成熟度因 preset 而异
5. **D5 叙事忠实度为 Warning** — `FactConsistencyChecker` 基于正则表达式，是实验性的；能检测手工构造的违规模式，但尚未在真实 LLM 输出上验证。Stable 发布需要 D5 加固。
6. 包尚未发布到 npm — 基础设施已就绪，发布需明确人工审批

---

## 快速开始

```bash
node examples/offline-demo.js
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

**事实与知识边界（实验性，opt-in）：**

```javascript
const engine = new AndyEngine({
  domain: tavernDomain,
  enableFacts: true, // 开启事实系统
  seed: 42,          // 可复现模拟
});

const alex = engine.createCharacter({ id: 'alex', name: 'Alex' });
engine.tick();

// 获取角色的知识边界（哪些事实是"允许知道的"）
const grounding = engine.getGroundingPackage('alex');
console.log(grounding.allowedFacts);
// 事实/知识系统是实验性的，通过 enableFacts: true 开启。
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

## 事实与知识边界（实验性）

Andy Engine 正在从"角色模拟"扩展到"世界知识管理"：

| 概念 | 说明 |
|------|------|
| **事实 (Fact)** | 世界中的一个可验证陈述（如"铁匠铺今天开门了"） |
| **知识 (Knowledge)** | 角色通过经历积累的事实集合 |
| **边界 (Grounding)** | 每个角色只能知道它"有资格知道"的事实——不是全知全能 |
| **规范事件 (Canon Event)** | 事件 → 事实 → 知识的自动管线 |
| **一致性检查** | 新事实与已有知识矛盾时的检测（实验性，基于正则） |

**为什么需要知识边界？**

LLM 天然是全知的——它知道训练数据里的一切。但一个"活着"的角色不应该知道它没经历过的事。Andy Engine 的 Grounding 系统确保每个角色的叙事只包含它"有资格知道"的事实。

**当前状态：**
- `WorldFactStore`、`CanonEventPipeline`、`KnowledgeStore`、`FactProvider` 已实现
- `FactConsistencyChecker` 是实验性的（基于正则表达式）
- Fact schema 和 Knowledge schema 可能还会变化
- 通过 `enableFacts: true` 开启

---

## SDK 使用

最简单的方式，三行代码创建一个有记忆、有情绪、有性格的角色：

```javascript
const { Character } = require("andy-engine/sdk");

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

---

## 持久化

```javascript
const { createStore } = require('andy-engine/store');

const store = createStore({ dbPath: './data/andy.db' });

// 启动时初始化(自动从存档恢复,注册快照序列化回调)
await store.init({
  onSnapshot: () => engine.toJSON(),        // 序列化当前世界状态
  onRestore: (data) => { /* 从快照恢复 */ }, // 反序列化并应用
});

// tick 循环中:每 N tick 自动保存快照 + 故事
engine.onTick((result) => store.onTick(result, []));

// 关闭时:刷出缓冲 + 保存最终快照 + 关闭数据库
await store.shutdown();
```

持久化层使用 SQLite（WAL 模式），支持故事存储、世界快照和元数据。`SimulationStore` 管理 snapshot/story/meta 三层;`createStore()` 是便捷工厂。详见 `store/` 目录与 `docs/SERIALIZATION_CONTRACT.md`。

---

## Rust Native / 性能

大规模模拟可选用 Rust Native 模块。

**默认（未设置）：** 纯 JavaScript，无 native 依赖。

**环境变量模式：**

| `ANDY_USE_NATIVE` | 行为 |
|---|---|
| `unset` | 纯 JS，无警告 |
| `1` 或 `true` | 必需模式 — 缺少 native binding 时抛出错误 |
| `optional` | 有则加载，无则警告并回退到 JS |

```bash
cd native && npm install && npm run build
ANDY_USE_NATIVE=1 node your_script.js
```

Rust SoA f32 引擎在 50K agents 时比 JS 快 **5.92x**，精度误差 < 1e-8。

| 指标 | 值 |
|------|-----|
| 50K agents × 20 ticks | 24.9ms/tick（Rust） |

此外，Dunbar 层级传染优化（JS 侧）在 500K agents 时达到 **8.94x** 加速；历史实验资产已归档到外部 archive。

详见 `benchmarks/` 目录。

---

## 许可证

本项目基于 AGPL-3.0-only 许可证。npm 尚未发布，但包基础设施已就绪，等待人工审批后即可进行 Foundation Alpha 发布。

[GNU Affero General Public License v3.0](LICENSE)

可自由使用、修改和分发，但需遵守 AGPL-3.0 条款。

商业授权联系：huangweijiebobby@gmail.com

## 商业授权

商业授权适用于私有集成、托管产品、游戏、AI 伴侣、机器人和企业部署。请联系了解详情。
