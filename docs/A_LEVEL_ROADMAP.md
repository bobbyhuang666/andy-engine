# Andy Engine A-Level Roadmap

## 从 Research Runtime 到可信 Persistent Agent Engine

**目标版本线**：v2.0.1 → v2.1 → v2.2 → v3

**核心目标**：把 Andy Engine 从"有深度的研究型 runtime"推进到"外部开发者、大厂技术团队、创业营评审都能认真评估的 A- 级 persistent agent engine"。

**非目标**：不追求做成 Linux / Unity / iOS 级成熟系统；不做 Bobby 产品、不做 Andy Town UI、不做游戏业务层、不做完整数字生命叙事。

**判断标准**：不是代码行数、测试数量、文档数量，而是核心闭环是否正确、稳定、可验证、可演示、可被外部依赖。

---

## 0. A 级标准重新定义

Andy Engine 当前不应该直接对标 Linux / iOS / Unity / Minecraft 的成熟度。那些系统有多年真实用户、生态、CI、生产事故和兼容压力。

Andy Engine 的合理 A 级标准应该是：

### A- 级 Research Runtime

满足：

1. **核心架构闭环成立**
   Canon → Observation → State & Pressure → Action Selection → CanonEvent → Effects → Memory / Relationship / Facts → Narrative

2. **关键路径有端到端语义测试**
   不是只测 import、边界、函数返回，而是验证 Alice/Bob 在同一个世界里产生可追溯因果、保持 epistemic boundary。

3. **release 可复现**
   干净环境、无 SQLite native binding、干净 npm consumer、tarball、typecheck、boundary、audit 都能清楚通过或明确跳过。

4. **public API 稳定且诚实**
   什么 stable、什么 experimental、什么 compatibility，文档和 runtime 一致。

5. **domain separation 不只在词汇层成立**
   中文 campus / tavern 语义不能藏在 generic runtime。行为时间结构、narrative fallback、emotion keywords 都要 domain profile 化。

6. **LLM 只负责 wording**
   Engine owns state / causality / relationship / affect policy。LLM 不拥有角色真实心理。

7. **至少有一个强 demo 证明"持续存在"**
   用户离开、世界继续、事件发生、关系/记忆变化、再次交互能解释真实经历。

---

## 1. 当前状态判断

Andy Engine 当前可以定义为：

**B- 级 research runtime，C+ 级 product release candidate。**

它已经有：

- canonical src/ 实现源
- public facade 层
- action selection
- typed effect delta pipeline
- memory / relationship / fact / domain / narrative 子系统
- release hardening 初步完成
- optional SQLite 策略
- TypeScript public contract 初步入口
- AGPL-3.0-only + commercial licensing
- 边界扫描和大量测试
- AffectCompiler RFC

但仍然存在 A 级前必须解决的问题：

### P0 / P1 问题

1. **release archive 不干净**
   macOS ._* / .DS_Store 会污染边界检查。

2. **SDK 默认路径仍可能依赖 SQLite**
   AndyBridge / SimulationStore 默认不应该要求 better-sqlite3 native binding。

3. **scoreHabit() 是 dead scoring dimension**
   被正式纳入 ReasonTrace，但永远返回 0。

4. **WorldFactStore simTime 路径不可靠**
   location meaning / invalidation 可能 fallback 到 2024-01-01。

5. **Need target 常量双重定义且不一致**
   NeedsSystem.NEED_GRADIENT_TARGETS 与 BehaviorField.NEED_TARGETS 语义不清。

6. **缺少端到端语义测试**
   现有测试多，但还不足以证明核心世界闭环正确。

7. **文档层级混乱**
   current contract、RFC、roadmap、legacy audit、future plan 混在一起。

8. **Affective expression 还停留在 RFC**
   尚未有 BasicAffectFrame seam，LLM 表达层仍可能损耗内部状态分辨率。

---

## 2. 总路线图

建议分成四条主线：

- **v2.0.1** Release Correctness Patch
- **v2.1** Semantic Correctness Release
- **v2.2** Aliveness Demonstration Release
- **v3** Productization / External Adoption Release

每条线的目标不同：

| 版本 | 核心目标 | 成功标准 |
|------|----------|----------|
| v2.0.1 | 修 release blocker 和 runtime 明确 bug | 可干净安装、测试、打包、无 SQLite 环境可用 |
| v2.1 | 修语义闭环正确性 | Alice/Bob E2E 语义测试通过 |
| v2.2 | 做可感知持续存在 | 有 Longitudinal Demo + BasicAffectFrame |
| v3 | 进入外部采用 | 文档精简、CI、npm publish、真实试用者 |

---

## 3. v2.0.1 — Release Correctness Patch

### 目标

把当前 v2.0.x 从"候选包"修成真正可发布的 foundation patch。

不新增功能，不重构 Agent.js，不实现 AffectCompiler。

### 3.1 Archive Hygiene

**问题**

当前 tar.gz 中混入大量：
- ._*
- .DS_Store

这些文件会污染 source scan 和 boundary check。

**要做**

新增脚本：
```
scripts/check-release-clean.sh
```

检查：
```bash
find . \( -name '._*' -o -name '.DS_Store' \)
```

如有任何结果，release gate 失败。

更新打包命令：
```bash
COPYFILE_DISABLE=1 tar --exclude='._*' --exclude='.DS_Store' -czf andy-engine-v2.0.1.tar.gz andy-engine
```

**验收**
```bash
find . \( -name '._*' -o -name '.DS_Store' \)
# 必须为空
```

### 3.2 SDK No-SQLite Default Path

**问题**

SQLite 是 optional dependency，但 AndyBridge / SDK smoke 仍可能默认进入 SQLiteStore。

这会导致无 better-sqlite3 native binding 环境下：
- npm test failed
- release:check failed

**要做**

默认 SDK / AndyBridge 不要求 SQLite。

推荐策略：
- AndyBridge default store = memory / noop / in-memory simulation store
- SQLite persistence = explicit opt-in

示例配置：
```javascript
new AndyBridge({
  persistence: {
    type: 'memory'
  }
})
```

显式 SQLite：
```javascript
new AndyBridge({
  persistence: {
    type: 'sqlite',
    path: './andy.db'
  }
})
```

**禁止**
- 禁止把 better-sqlite3 改回 required dependency
- 禁止用 skip 掩盖 SDK smoke 问题
- 禁止默认 SDK 依赖 SQLite

**验收**

无 SQLite binding 环境下：
```bash
npm test
npm run release:check
npm run smoke:pack
```
必须通过。

SQLite 有 binding 时：
```bash
npm run sqlite:smoke
```
必须通过。

### 3.3 scoreHabit() Dead Dimension

**问题**

当前：
```javascript
function scoreHabit(candidate, context) {
  return 0;
}
```

但它参与总分和 ReasonTrace。

这会导致：
- habit 分数看起来存在，实际无意义
- 未来调试被误导
- 行为系统解释不诚实

**方案 A：实现最小 habit scoring**

如果 habit candidate 有 metadata：
```javascript
function scoreHabit(candidate, context) {
  if (candidate.source !== 'habit') return 0;
  const confidence =
    candidate.metadata?.confidence ??
    candidate.confidence ??
    candidate.habitStrength ??
    0.5;
  return clamp(confidence * 0.4, 0, 0.4);
}
```

并加入测试：
- non-habit candidate habit score = 0
- habit candidate 有正分
- confidence 越高，habit score 越高
- ReasonTrace 不再显示无意义 0

**方案 B：删除 habit scoring dimension**

如果不想让 habit 进入 utility scorer，就从 breakdown 中移除：
- habit 不再作为 score dimension
- habit 只作为 candidate provider source

**推荐**

先采用方案 A，最小实现。

**验收**
```
tests/unit/utility-scorer-habit.test.js
```
必须证明 habit dimension 有真实语义。

### 3.4 WorldFactStore simTime Fix

**问题**

WorldFactStore 的 location meaning / invalidation 路径可能使用 fallback epoch：
```
2024-01-01T00:00:00Z
```

这会让事实时间与世界时间脱节。

**要做**

推荐方案：
```javascript
class WorldFactStore {
  setSimTime(time) {
    this._simTime = time instanceof Date ? time : new Date(time);
  }
  getSimTime() {
    return this._simTime ?? FALLBACK_EPOCH;
  }
}
```

在 AndyWorld.step() 或 fact system tick 中同步：
```javascript
this.factStore?.setSimTime(this.clock.time)
```

更好的长期方案是：
updateLocationMeaning() / invalidateFact() 接收显式 timestamp。

**测试**

新增：
```
tests/facts/world-fact-store-simtime.test.js
```

场景：
1. 创建世界，设置 clock 到 2026-06-22T12:00:00Z
2. 触发 location meaning delta
3. 验证 fact timestamp 等于 world clock
4. 不允许 fallback 到 2024-01-01

**验收**

所有 fact store 自己生成的 timestamp 都能追溯到 world simTime 或明确 fallback 原因。

### 3.5 Need Target Consistency

**问题**

当前存在：
- NeedsSystem.NEED_GRADIENT_TARGETS
- BehaviorField.NEED_TARGETS

并且 hunger / energy 数值不一致。

**要做**

先做审计：
```
docs/current/NEED_TARGET_CONTRACT.md
```

回答：
1. 两套 target 是否描述同一概念？
2. 如果是，为什么数值不同？
3. 如果不是，命名是否误导？

**推荐修法**

如果同义：
```
src/agent/psychology/NeedTargets.js
```

统一导出：
```javascript
const NEED_ATTRACTOR_TARGETS = { ... }
```

NeedsSystem 和 BehaviorField 都引用单一来源。

如果不同义，改名：
```
NEED_GRADIENT_TARGETS → NEED_HOMEOSTASIS_GRADIENT_TARGETS
NEED_TARGETS → BEHAVIOR_FIELD_ATTRACTOR_TARGETS
```

并补文档说明。

**验收**

新增测试：
```
tests/unit/need-target-consistency.test.js
```

保证：
- 如果同义，两个系统使用同一对象或同一数值
- 如果不同义，命名和 contract 明确区分

### 3.6 v2.0.1 验证矩阵

必须全部通过：
```bash
find . \( -name '._*' -o -name '.DS_Store' \)
npm run typecheck
npm run typecheck:consumer
npm run smoke:pack
npm run check:boundaries
npm test
npm run release:check
npm audit --omit=dev
git diff --check
```

如果 SQLite 可用：
```bash
npm run sqlite:smoke
```

### v2.0.1 发布标准

只有当以上全部通过，才允许：
```
v2.0.1 Foundation Patch
```

如果无真实用户，不建议称为 "Production Stable"。
推荐称呼：
```
Foundation Stable Candidate
```
或：
```
v2.0.1 Foundation Release
```

---

## 4. v2.1 — Semantic Correctness Release

### 目标

证明 Andy Engine 的核心世界闭环真的工作。

不是继续加系统，而是写出能够让外部评审相信的端到端语义测试。

### 4.1 Alice/Bob Epistemic Boundary E2E Test

**目标**

验证：
同一个世界中的两个角色，经历不同事件后，状态、记忆、知识边界和 narrative 不会混淆。

**测试场景**

1. 创建世界
2. 创建 Alice 和 Bob
3. Alice 在 cafeteria
4. Bob 在 library
5. Alice 执行 eat / meal action
6. 世界 tick 若干次
7. Bob 在 library idle / read
8. 验证状态、记忆、事实、叙事边界

**必须断言**

Alice
- hunger 改善
- 获得吃饭相关 memory
- cafeteria location meaning 被更新
- Alice narrative 可引用"刚吃过饭"

Bob
- hunger 正常随时间变化
- 没有 Alice eating memory
- Bob 不知道 Alice 吃饭
- Bob narrative 不应声称看见 Alice 吃饭

World
- CanonEvent 中存在 Alice eating event
- event participants 只有 Alice
- fact visibility 正确
- effect pipeline 输出和 committed state 对齐

**文件**
```
tests/e2e/alice-bob-epistemic-boundary.test.js
```

**成功意义**

这是 Andy Engine 第一个真正证明核心价值的测试。

比 1000 个 import test 更重要。

### 4.2 Cause → Effect → Memory → Narrative Consistency Test

**目标**

验证同一个事件从发生到最终表达的一致性。

**场景**

Alice helps Bob
→ relationship improves
→ Bob memory records help event
→ Bob future behavior changes
→ narrative mentions help only if visible/remembered

**必须断言**

- CanonEvent exists
- EffectResult has relationship delta
- EffectCommitter applies relationship delta
- Memory contains event-derived entry
- Narrative input receives same event/fact
- Narrative output does not invent uncommitted fact

**文件**
```
tests/e2e/cause-effect-memory-narrative.test.js
```

### 4.3 StoryGenerator / TickResult Contract

**问题**

StoryGenerator.generateFromTick() 目前绑定旧 world tick shape。

**要做**

明确命名：
```
generateFromWorldTick()
```

或者新增 adapter：
```
normalizeTickResultForStory(tickResult)
```

**验收**

测试两种输入：
- AndyWorld.step() result
- AgentRuntime.tick() result, if supported

如果只支持 world tick，必须文档明确，不允许函数名暗示通用。

### 4.4 Semantic Profile Behavior Test

**目标**

证明 domain separation 不只是 source-scan，而是 runtime 行为层成立。

**测试**

1. custom minimal domain
   不应输出中文 campus/tavern fallback。
2. campus preset
   保持中文校园行为。
3. tavern preset
   保持 tavern 行为。
4. custom night-worker domain
   schedule 不应默认早 6 起、9 active、12 lunch。

**文件**
```
tests/domain/semantic-profile-runtime.test.js
```

### 4.5 v2.1 出口标准

- Alice/Bob epistemic E2E 通过
- Cause/effect/memory/narrative E2E 通过
- StoryGenerator contract 明确
- semantic profile runtime test 通过
- docs/current 描述与 runtime 一致

v2.1 可以对外说：
```
Andy Engine has a tested semantic loop for persistent multi-agent state, memory, facts, and narrative boundaries.
```

---

## 5. v2.2 — Aliveness Demonstration Release

### 目标

让外部用户"一眼看出 Andy 和普通 AI 角色系统不同"。

v2.2 不追求更多 runtime 子系统，而是做一个强 demo 和最小表达编译 seam。

### 5.1 BasicAffectFrame Seam

**背景**

内部情绪向量直接渲染为自然语言，会造成分辨率损耗。

**目标**

不实现完整 AffectCompiler，但必须有最小结构化表达层：

```
EmotionVector / Needs / Relationship / MemoryPressure
→ BasicAffectFrame
→ Narrative / LLM expression constraints
```

**最小结构**
```javascript
{
  valenceBand: 'negative' | 'neutral' | 'positive',
  arousalBand: 'low' | 'medium' | 'high',
  interpersonalPosture: 'open' | 'guarded' | 'attached' | 'avoidant',
  warmth: number,
  directness: number,
  initiative: number,
  defensiveness: number,
  emotionalExplicitness: number,
  forbiddenModes: string[],
  visibleMicroBehaviors: string[]
}
```

**禁止**
- 禁止完整商业版 AffectCompiler
- 禁止 LLM 决定真实心理
- 禁止把 EmotionVector 直接自然语言化为唯一输入

**测试**
```
tests/affect/basic-affect-frame.test.js
```

必须验证：
- 相同 valence，不同 arousal，会得到不同 expression constraints
- 高 attachment + 中 irritation 不等于 generic anger
- 低 trust + 高 warmth 生成 guarded closeness，而不是简单"冷漠"

### 5.2 Longitudinal Demo

**目标**

做一个最小但强的展示：

```
用户离开 24 小时
角色后台经历事件
角色状态变化
再次交互时，角色基于真实事件回应
```

**Demo 结构**
```
Day 1 18:00 用户与 Alice 交互
Day 1 19:00 Alice 参加晚餐
Day 1 22:00 Alice 与 Bob 发生小冲突
Day 2 08:00 Alice 独自散步，情绪恢复
Day 2 18:00 用户再次打开
Alice 的回应基于真实发生过的事件
```

**验证点**
- 用户不在线期间世界继续 tick
- 事件写入 canon
- 记忆更新
- 关系变化
- 情绪变化
- BasicAffectFrame 影响表达姿态
- LLM/narrative 不发明未发生事件

**产出**
```
examples/longitudinal-life-demo/
README.md
demo script
expected output
test fixture
```

### 5.3 Aliveness Metrics v0.1

不要做复杂 benchmark，先定义 5 个指标：

**Continuity Score**
- 角色是否能引用真实过去事件

**Causality Score**
- 当前状态是否由过去事件导致

**Epistemic Boundary Score**
- 角色是否只知道它应该知道的事

**Affect Expression Score**
- 内部情绪变化是否转化为可观察表达差异

**Non-Fabrication Score**
- narrative 是否避免发明未发生事实

每个指标先用小规模 fixture 测试，不追求学术严谨。

**文件**
```
docs/current/ALIVENESS_METRICS_v0_1.md
tests/e2e/aliveness-metrics-smoke.test.js
```

### 5.4 v2.2 出口标准

v2.2 必须能回答：

```
一个普通 AI 角色系统做不到的事情，Andy Engine 具体展示出来了吗？
```

验收：
- Longitudinal demo 可运行
- BasicAffectFrame seam 可用
- Aliveness metrics smoke 通过
- README 增加 demo section
- 不要求真实用户，但能给外部技术评审看

---

## 6. v3 — External Adoption Release

### 目标

从"自己能跑"进入"别人愿意试"。

v3 的核心不是架构，而是外部采用条件。

### 6.1 CI/CD

必须新增：
```
.github/workflows/ci.yml
```

至少包含：
```yaml
npm ci
npm run typecheck
npm run smoke:pack
npm run check:boundaries
npm test
npm audit --omit=dev
```

可选 matrix：
- Node 20
- Node 22
- Ubuntu
- macOS

SQLite 可单独 job：
```
sqlite-smoke
```

### 6.2 文档瘦身

**当前问题**

文档太多，current / RFC / roadmap / archive 混杂。

**目标结构**
```
docs/
  current/
    ARCHITECTURE.md
    PUBLIC_API_CONTRACT.md
    WORLD_SCHEMA.md
    DOMAIN_SYSTEM.md
    PERSISTENCE.md
    PERFORMANCE.md
    DEPENDENCY_SURFACE_AUDIT.md
    ALIVENESS_METRICS_v0_1.md
  rfc/
    AFFECT_COMPILER_RFC.md
    GROUNDING_CHECKER_V2_RFC.md
    KNOWLEDGE_PROPAGATION_RFC.md
  archive/
    CLEAN_ARCHITECTURE_FINAL_AUDIT.md
    LEGACY_REMOVAL_REPORT.md
    old roadmaps
```

README 只保留：
- What is Andy Engine
- Install
- Quickstart
- Core concepts
- Demo
- Public API links
- License / commercial licensing

**验收**

外部开发者 10 分钟内能回答：
1. 这个东西是做什么的？
2. 怎么安装？
3. 怎么跑 demo？
4. public API 哪些稳定？
5. SQLite/native 是否必须？
6. 目前不能做什么？

### 6.3 npm Publish Readiness

发布前必须满足：
- no macOS metadata
- npm pack inspected
- package exports verified
- consumer smoke verified
- README install from tarball verified
- license reviewed
- AGPL/commercial licensing wording reviewed

建议先 publish：
```
2.0.0-alpha / 2.1.0-alpha / 2.2.0-alpha
```

不要急着 publish final stable。

如果没有真实用户，推荐 npm tag：
```bash
npm publish --tag alpha
```
或：
```bash
npm publish --tag next
```
而不是：
```bash
npm publish --tag latest
```

### 6.4 First External Users

v3 之前必须找到至少 3 类试用者之一：
1. AI companion builder
2. game NPC developer
3. interactive fiction / text game builder
4. robot personality experimenter
5. AI agent researcher

每个试用者只需要完成一个问题：
```
Can they run Andy Engine and build one minimal persistent character?
```

记录：
- 他们卡在哪里
- 哪个 API 难懂
- 哪个 demo 最有说服力
- 哪些功能他们以为有但其实没有

这是产品成熟度必须经历的外部压力。

---

## 7. 不要做的事

### 7.1 不要继续拆 Agent.js

Agent.js 只要保持 compatibility facade，就可以暂时存在。

规则：
```
Agent.js can be large, but must not be smart.
```

禁止：
- 新业务逻辑回流 Agent.js
- 新情绪算法写入 Agent.js
- 新 memory/relationship/effect 规则写入 Agent.js
- 为了减少行数拆出无意义 wrapper

可以加架构测试：
- Agent.js 不得 import core effect internals
- Agent.js 不得直接修改 memory internals
- Agent.js 不得新增 _applyNeedsToEmotion / _perceiveEvents 这类 legacy 方法

### 7.2 不要全量 TypeScript 迁移

当前只需要：
- TypeScript public contract
- consumer typecheck
- core schema d.ts

不要做：
- .js → .ts 全量迁移
- runtime rewrite
- module system 重构

TypeScript 目标：
```
先稳 API，不重写 runtime。
```

### 7.3 不要实现完整 AffectCompiler

v2.2 只做 BasicAffectFrame seam。

完整 AffectCompiler 应保留为商业核心或 v3+ 模块：
- relationship-aware affect
- memory-pressure affect
- LLM-specific expression policies
- anti-generic-emotion constraints
- longitudinal personality drift

### 7.4 不要继续堆 RFC

以后新增 RFC 必须满足：
1. 有明确 owner
2. 有进入实现的版本窗口
3. 有 non-goal
4. 有退出条件
5. 不进入 docs/current

否则放 archive 或 private notes。

---

## 8. A 级测试策略

Andy Engine 现在不缺测试数量，缺语义测试质量。

### 8.1 测试金字塔

**Level 1: Contract / lint / boundary**
- import graph
- source scan
- public exports
- package smoke

**Level 2: Unit behavior**
- UtilityScorer
- EventEffectPipeline
- RNG
- Needs
- Emotion
- FactStore

**Level 3: Integration**
- Action → Event → Effect
- Memory → Narrative
- Domain → SemanticProfile

**Level 4: E2E semantic correctness**
- Alice/Bob epistemic boundary
- cause/effect/memory/narrative
- offline life demo

当前 Andy 强在 Level 1/2，弱在 Level 4。

A 级必须补 Level 4。

### 8.2 必备 E2E 测试清单

```
tests/e2e/alice-bob-epistemic-boundary.test.js
tests/e2e/cause-effect-memory-narrative.test.js
tests/e2e/offline-life-continuity.test.js
tests/e2e/domain-semantic-profile.test.js
tests/e2e/no-fabricated-narrative.test.js
```

每个 E2E 测试必须有：
- Given world setup
- When ticks/actions happen
- Then state/memory/facts/relationships/narrative assertions

不要只断言"不崩溃"。

---

## 9. A 级文档策略

### 9.1 保留的核心文档

只保留 8 篇 current docs：
```
ARCHITECTURE.md
PUBLIC_API_CONTRACT.md
WORLD_SCHEMA.md
PERSISTENCE.md
DOMAIN_SYSTEM.md
NARRATIVE_AND_GROUNDING.md
PERFORMANCE.md
DEPENDENCY_SURFACE_AUDIT.md
```

### 9.2 README 必须诚实

README 不要写：
- production-ready
- full deterministic replay
- AI life completed
- all domains supported

可以写：
```
Andy Engine is a foundation-stage persistent agent runtime.
It provides tested state, memory, relationship, fact, effect, and narrative boundaries.
It is suitable for experiments, prototypes, and early integrations.
Production use requires careful validation.
```

---

## 10. 对外定位更新

### 当前最合适定位

```
Andy Engine is a foundation-stage persistent agent runtime for AI characters, NPCs, companions, and virtual worlds.
```

中文：
```
Andy Engine 是一个面向 AI 角色、NPC、AI 伴侣和虚拟世界的持续存在 Agent 运行时。
```

不要说：
- 数字生命完成版
- AI 生命操作系统
- 生产级 Unity 级引擎

可以说：
```
它解决的是 AI 角色从 session-based 到 existence-based 的底层状态问题。
```

---

## 11. 面向创业申请 / 大厂展示的里程碑

### 现在可说

Andy Engine 已经完成早期 persistent agent runtime 骨架，包括 agent state、memory、relationship、canon event、fact store、effect pipeline、narrative boundary、domain profile、package smoke 和 release hardening。

### v2.1 后可说

Andy Engine 已经通过端到端语义测试，验证多角色世界中的因果后果、记忆变化和 epistemic boundary。

### v2.2 后可说

Andy Engine 已经有 longitudinal life demo，展示 AI 角色在用户离线期间持续生活，并在再次交互时基于真实事件和状态变化回应。

### v3 后可说

Andy Engine 已经进入外部试用阶段，具备 CI、npm package、稳定 public API 和真实开发者反馈。

---

## 12. 执行顺序总表

### Phase 1: v2.0.1 Release Correctness

1. 清理 macOS metadata
2. 修 SDK 默认 SQLite 依赖
3. 修 scoreHabit
4. 修 WorldFactStore simTime
5. 统一 Need target contract
6. npm test / release:check 全绿

### Phase 2: v2.1 Semantic Correctness

1. Alice/Bob epistemic boundary E2E
2. cause/effect/memory/narrative E2E
3. StoryGenerator tick contract
4. semantic profile runtime behavior
5. docs/current truth pass

### Phase 3: v2.2 Aliveness Demonstration

1. BasicAffectFrame seam
2. Longitudinal demo
3. Aliveness metrics v0.1
4. README demo section
5. external pitch update

### Phase 4: v3 External Adoption

1. CI/CD
2. docs slimming
3. npm alpha/next publish
4. 3 external trial users
5. feedback-driven API cleanup

---

## 13. 给执行 AI 的总指令

你是 Andy Engine 执行 AI。

当前目标不是新增功能，而是把 Andy Engine 从 B- research runtime 推进到 A- credible persistent agent engine。

严格遵守：
1. 不实现 Bobby 产品逻辑。
2. 不实现 Andy Town UI。
3. 不实现完整 AffectCompiler。
4. 不继续拆 Agent.js，除非是防止新逻辑回流的测试。
5. 不做全量 TypeScript 迁移。
6. 不把 better-sqlite3 改回 required dependency。
7. 不新增 public API，除非同步 package.json、README、PUBLIC_API_CONTRACT、type definitions、package tests。
8. 不用 skip 掩盖失败。
9. 不降低边界扫描、source scan、perf gate。
10. 不新增 RFC，除非有版本窗口和退出条件。

当前优先级：

**P0:**
- release archive clean
- no-SQLite default SDK tests pass
- npm test pass
- release:check pass

**P1:**
- scoreHabit dead dimension
- WorldFactStore simTime
- Need target consistency

**P2:**
- Alice/Bob epistemic E2E
- cause/effect/memory/narrative E2E

完成每个阶段后输出：
- changed files
- behavior changes
- tests added
- validation matrix
- remaining known limitations

---

## 14. 最终判断

Andy Engine 想达到 A 级，不靠继续堆系统，而靠三件事：

1. release 可复现
2. 语义闭环可验证
3. 持续存在可展示

现在最危险的路线是继续做"看起来更高级"的功能。

正确路线是：

```
先修确定的错
再证明核心闭环
再做可感知 demo
最后让外部用户试用
```

Andy Engine 的 A 级不是"像 Linux 一样成熟"，而是：

```
在 persistent agent runtime 这个新问题上，拥有清楚边界、可信测试、稳定包、可展示 demo 和诚实文档。
```

这就是下一阶段的主线。
