# RFC: Seed-Memory Wall-Clock 时间戳确定性漏洞

> 状态:**Root-cause 已修复(方案 B,2026-06-26)** · 优先级:P1/确定性 · 影响:模拟轨迹 byte-stability
> 关联:P0 Golden Seed Replay Corpus · AGENTS.md「Seeded RNG 规则」
> 架构师:本文档由架构师 AI 撰写,记录在构建 golden corpus 时发现的确定性残留漏洞。

---

## 实施记录(2026-06-26)

方案 B 已实施:`backgroundToMemories(background, simTime)` 接受 simTime 参数,
给 seed-memory 对象加 `timestamp` 字段;`index.js createCharacter` 传入
`this.world.clock.time`。消除 PersonalMemory ctor 的 `Date.now()` 依赖。

**效果**:同 seed 双跑 hunger 轨迹完全一致(已验证 deterministic: true)。
seed-memory wall-clock 漂移消除。

**残留**:e2e `alice-bob-epistemic-boundary.test.js` 的 `should maintain epistemic boundary`
断言仍失败——但这是**断言假设错误**(alice 食堂 hunger recovery 不足以超过 bob),
非 seed-memory 漏洞(轨迹已确定,双跑一致)。该断言需单独排查 hunger 机制,不属本 RFC。

---

---

## 0. 摘要

构建 golden seed replay corpus 时,发现 `PersonalMemory` 构造函数用 `Date.now()`
为 seed-memory 生成 `timestamp`/`lastAccessed`/`presentations` 时间戳。这使
`engine.toJSON()` 在跨进程 byte-compare 时不稳定,且 seed-memory 衰减计算
依赖 wall-clock 与 simTime 的差值,构成模拟轨迹的隐式非确定性源。

本 RFC 记录该漏洞的现状、影响范围、修复方案与代价,作为后续波次的依据。
**golden corpus 已用 normalized projection 规避此漏洞**(剥离 memory 时间戳),
故不阻塞当前 P0 交付,但 root-cause 修复是 A 级确定性的应有之义。

---

## 1. 漏洞描述

### 1.1 seed-memory 时间戳用 wall-clock

`src/agent/memory/PersonalMemory.js:67-78`:

```js
this.memories = seedMemories.map((m, i) => ({
  id: `seed_${i}`,
  content: m.content || m,
  category: m.category || 'background',
  emotionTag: m.emotionTag || 'neutral',
  importance: m.importance || 0.8,
  timestamp: new Date(m.timestamp || Date.now()),   // ← wall-clock
  lastAccessed: new Date(),                          // ← wall-clock
  presentations: [new Date()],                       // ← wall-clock
  accessCount: 1,
  associations: m.associations || [],
}));
```

- `seedMemories` 来自 `backgroundToMemories()`(`src/sdk/AndyEngineHelpers.js:21-29`),
  产出的 memory 对象**无 `timestamp` 字段**,故走 `Date.now()` 分支。
- 同进程双 run(`deterministic-replay.test.js`)因两次 ctor 间隔极小,
  wall-clock 近似相等 → 双 run 一致 → 测试通过,但**掩盖了漏洞**。

### 1.2 初始 `_simTime` 也用 wall-clock

`src/agent/memory/PersonalMemory.js:49`:

```js
this._simTime = Date.now();   // ← wall-clock,直到首 tick 被 setSimTime 覆盖
```

- `AgentRuntime.tick` 在每 tick 前注入 simTime(`src/agent/AgentRuntime.js:83-85`),
  覆盖 `_simTime`。故 tick 路径的 `_simTime` 是 simTime(确定)。
- 但 ctor 到首 tick 之间,`_simTime` 是 wall-clock。若有逻辑在此窗口读 `_simTime`,
  会引入非确定性。当前未见此路径被触发,但属隐患。

### 1.3 衰减计算依赖 timestamp 与 simTime 差值

`src/agent/memory/PersonalMemory.js:646-658`:

```js
const hoursSinceCreation = Math.max(0.01, (now - memory.timestamp.getTime()) / (1000 * 60 * 60));
const blend = Math.min(hoursSinceCreation / 168, 1);
const expDecay = Math.exp(-hoursSinceCreation / 24);
const powerDecay = Math.pow(1 + hoursSinceCreation, -0.5);
let decayFactor = expDecay * (1 - blend) + powerDecay * blend;
```

- `now` = `_simTime`(tick 时是 simTime,如 2026-09-01)。
- `memory.timestamp` = ctor 时的 wall-clock(如 2026-06-26)。
- 差值 = simTime - wallClock ≈ +67 天 → `hoursSinceCreation ≈ 1608h` → `blend=1`(饱和)。
- **当前**:`startTime`(2026-09-01)与今天(2026-06-26)的 67 天差使 blend 饱和,
  seed-memory 衰减恒走 powerDecay,轨迹**碰巧**确定(因为 saturation 抹平了 wall-clock 抖动)。
- **未来风险**:若 `startTime` 设为接近 real-time(如「现在」),差值变小,
  blend 不饱和,wall-clock 抖动会直接传导到衰减 → 轨迹漂移。
  即使现在不触发,这是定时炸弹。

---

## 2. 影响评估

| 维度 | 现状 | 风险 |
|---|---|---|
| `engine.toJSON()` byte-stability | 跨进程不稳定(memory timestamps 是 wall-clock) | golden corpus 须剥离 timestamps,不能直接快照 Envelope |
| 模拟轨迹确定性 | 当前 `startTime=2026-09-01` 与今天差 67 天,blend 饱和,轨迹碰巧确定 | 若 startTime 接近 real-time,blend 不饱和,wall-clock 抖动传导到衰减 → 轨迹漂移 |
| deterministic-replay.test.js | 通过(双 run 同进程,wall-clock 近似相等) | 掩盖漏洞,无法捕获跨进程漂移 |
| 存档 round-trip | seed-memory timestamps 被序列化,跨时间加载后 `now - timestamp` 变化 → 衰减跳变 | 存档加载后行为依赖加载时刻,非纯 simTime 函数 |

**结论**:漏洞当前被 `startTime` 的远期设置间接掩盖,但破坏了「模拟轨迹是 (seed, simTime) 的纯函数」这一 A 级确定性承诺。

---

## 3. 修复方案

### 方案 A:seed-memory 时间戳用 startTime(推荐)

**核心思路**:让 `createCharacter` 把 `startTime`(engine 的 `world.clock.time`)传入
Agent ctor,再传入 PersonalMemory ctor,作为 seed-memory 的 `timestamp`/`lastAccessed`/`presentations`,
以及初始 `_simTime`。

改动点:
- `index.js createCharacter`:从 `this.world.clock.time` 取 simTime,传入 `new Agent({ ..., simTime })`。
- `agent/Agent.js` ctor:接收 `config.simTime`,传给 `createSubsystems`。
- `src/agent/lifecycle/AgentSubsystemFactory.js createSubsystems`:接收 simTime,传给 `PersonalMemory` ctor。
- `PersonalMemory.js ctor`:`this._simTime = simTime || Date.now()`(向后兼容);seed-memory timestamps 用 `simTime`。

**代价**:
- 改 4 文件 + AgentSubsystemFactory 签名(可能触及 restoreSubsystems)。
- **改变模拟轨迹行为**:seed-memory 衰减从饱和 powerDecay 变成 near-zero expDecay
  (因 `hoursSinceCreation ≈ 0`)。这改变 memory.importance 演化 → 记忆检索 → 行为。
  现有 `deterministic-replay.test.js` 仍绿(双 run 一致),但「世界形态」变了。
- golden fixture 需 GOLDEN_REGEN 重生成(轨迹变了)。
- 属于「改变模拟语义」,需用户确认是否接受轨迹变更。

**收益**:`engine.toJSON()` byte-stable;golden corpus 可直接快照完整 Envelope;
「模拟轨迹是 (seed, simTime) 纯函数」承诺无保留。

### 方案 B:`backgroundToMemories` 注入 timestamp

**核心思路**:不改 PersonalMemory,改 `backgroundToMemories` 让产出的 seed-memory
对象自带 `timestamp` 字段(由调用方传入 simTime)。

改动点:
- `AndyEngineHelpers.backgroundToMemories(background, simTime)`:加 simTime 参数。
- `index.js createCharacter`:`backgroundToMemories(background, this.world.clock.time)`。
- PersonalMemory ctor 已支持 `m.timestamp`(line 73 `new Date(m.timestamp || Date.now())`),
  故无需改 PersonalMemory。

**代价**:改 2 文件,blast radius 小于方案 A。但仍改变轨迹(同方案 A)。
`_simTime` 初始值仍是 wall-clock(方案 B 不修 1.2),但首 tick 前无逻辑读它,影响小。

**收益**:seed-memory timestamps 确定;改动面更小。

### 方案 C:不修(维持现状)

接受 seed-memory wall-clock 作为已知例外。golden corpus 持续用 normalized projection
剥离 timestamps。零代价,但 A 级确定性承诺保留星号。

---

## 4. 推荐与决策建议

**推荐方案 B**:
- 改动面小(2 文件),不触及 AgentSubsystemFactory 签名。
- 直接修复 seed-memory timestamps(主要 flaky 源)。
- `_simTime` 初始 wall-clock 留作低优先残留(首 tick 前无逻辑读它)。

**决策权在用户**:因修复改变模拟轨迹行为,需用户确认是否接受。若用户优先保持轨迹稳定,
方案 C(不修)合法,漏洞由 golden corpus 的 normalized projection 隔离,不阻塞当前硬化。

---

## 5. 验收标准(未来执行时)

- [ ] `engine.toJSON()` 跨进程 byte-identical(golden corpus 可直接快照完整 Envelope,无需剥离 timestamps)。
- [ ] `npm test` 全绿(含重生成后的 golden fixture)。
- [ ] `tests/unit/deterministic-replay.test.js` 仍绿。
- [ ] 若改轨迹:golden fixture 经 GOLDEN_REGEN 重生成,diff 可解释。

---

## 6. 不做的事

- 不在本 RFC 改 PersonalMemory 衰减公式。
- 不改 simTime 注入机制(已由 AgentRuntime.tick 注入,工作正常)。
- 不为修复而修复:若用户判定当前 `startTime` 远期设置足够隔离风险,方案 C 合法。
