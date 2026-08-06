# AffectCompiler RFC

> v2.0-alpha.3 — RFC only. Not implemented.

---

## 1. Affect Resolution Loss Problem

Andy Engine maintains rich internal affect state across multiple subsystems:

| Subsystem | Dimensions | Data Type |
|-----------|-----------|-----------|
| EmotionVector | 30 emotions (current, mood, baseline) | `number` per dimension |
| NeedsSystem | 6+ needs (energy, hunger, social, fun, comfort, hygiene) | `number` 0-1 |
| BehaviorField | 4D vector (activity, sociality, focus, expressiveness) | `number` 0-1 |
| SocialGraph | Per-relationship strength, impression, history | structured objects |
| PersonalMemory | Experiences with appraisal (valence, goalRelevance, agency) | mixed |
| EmotionRegulation | Regulation strategy, suppression level | structured |
| IntrinsicMotivation | Curiosity, active goals, exploration state | structured |

When this state reaches the LLM, it passes through `toPromptString()` / `toNarrative()` — methods that compress structured data into natural language. This compression loses significant resolution:

**Numerical precision loss.** `EmotionVector.toPromptString()` maps continuous values to 7 discrete intensity labels (`略微`, `有点`, `比较`, `挺`, `很`, `非常`, `极度`). A valence of -0.3 and -0.15 both become `有点难过` — a 2x difference invisible to the LLM.

**Multi-dimensionality collapse.** 30 emotion dimensions are reduced to a scene narrative string plus 2-3 key dimension annotations. The LLM sees "开心的情绪主导着你的心境" but cannot distinguish between 15 slightly positive dimensions vs. 1 extremely positive dimension.

**Temporal dynamics absence.** The LLM receives a snapshot. It cannot see that `sadness` has been rising for the last 5 ticks, or that `joy` peaked 10 minutes ago and is now declining. `toPromptString()` includes no trajectory, rate-of-change, or trend information.

**Cross-system interaction blindness.** The LLM sees `emotionState`, `needsState`, `memoryContext`, and `behaviorField` as separate text blocks in the world context (`AndyEngineHelpers.js:202-205`). It must infer that low energy → increased boredom → decreased activity from raw text. The engine computes these interactions internally but does not expose the causal links.

**Information loss in `toNarrative()`.** `AgentNarrative.js` further compresses affect into a handful of short phrases: `好困`, `有点孤独`, `心思不太集中`. A full emotion vector, need system, and behavior field collapse into 2-5 Chinese phrases joined by commas.

The result: the LLM generates character speech based on a blurry sketch of the character's true affective state, then `FactConsistencyChecker` must catch the inevitable drift.

---

## 2. Engine Owns State / LLM Owns Wording

**Principle:** The engine is the single source of truth for *what* a character feels. The LLM decides *how* a character expresses those feelings in natural language.

```
┌─────────────────────────────────────────────────────┐
│                    ENGINE DOMAIN                     │
│                                                     │
│  EmotionVector ─┐                                   │
│  NeedsSystem ───┤                                   │
│  BehaviorField ─┼──→ AffectCompiler ──→ AffectFrame │
│  SocialGraph ───┤              │                     │
│  MemoryPressure─┘              │                     │
│                                ▼                     │
│                    Structured AffectFrame             │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                     LLM DOMAIN                      │
│                                                     │
│  AffectFrame → system prompt injection              │
│             → natural language generation            │
│             → character speech / inner monologue     │
│                                                     │
│  Boundaries:                                        │
│  - Must not invent emotions not in AffectFrame      │
│  - Must not contradict valence direction            │
│  - Must not claim needs that engine says are met    │
│  - May express nuance, metaphor, style              │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  VALIDATION DOMAIN                   │
│                                                     │
│  checkConsistency(llmOutput, affectFrame)            │
│  → Does expressed emotion contradict AffectFrame?   │
│  → Does claimed need state match engine state?      │
│  → Violations → rewrite or flag                     │
└─────────────────────────────────────────────────────┘
```

**What this means in practice:**

- The LLM never sees raw `emotion.current.sadness = 0.47`. It sees `{ dimension: "sadness", intensity: 0.47, trend: "rising" }`.
- The LLM decides whether to say "我有点难过", "心里闷闷的", or "像被什么东西压着". Expression is the LLM's job.
- If the LLM says "我开心极了" when AffectFrame shows `valence: -0.3`, `checkConsistency()` flags the contradiction.

---

## 3. EmotionVector 不直接自然语言化

**Current flow (problematic):**

```
EmotionVector.current (30 floats)
  → toPromptString()
  → string: "开心的情绪主导着你的心境（效价=0.23, 唤醒=0.51）。关键维度：开心=0.45..."
  → injected into LLM system prompt
```

`toPromptString()` at `src/agent/psychology/EmotionVector.js:582-693` does three things in one method:

1. Selects dominant dimensions (`getDominant(8)`)
2. Computes narrative scene text (ambivalence, positive/negative/mixed)
3. Formats intensity labels and key dimension annotations

This couples *affect computation* with *language generation*. Any change to how we compute affect requires re-testing the language output, and vice versa.

**Proposed flow:**

```
EmotionVector.current (30 floats)
  → AffectCompiler.compile(emotion, needs, behavior, social, memory)
  → AffectFrame (structured object)
  → [branch A] LLM prompt injection (structured data, not prose)
  → [branch B] Legacy toPromptString() (reads AffectFrame, not raw floats)
```

`toPromptString()` would be reimplemented as a thin renderer on top of AffectFrame, preserving backward compatibility. New LLM integration would consume AffectFrame directly.

---

## 4. AffectFrame Minimal Structure

```js
/**
 * AffectFrame — Structured snapshot of a character's affective state.
 *
 * Compiled from: EmotionVector, NeedsSystem, BehaviorField,
 * SocialGraph, MemoryPressure, EmotionRegulation.
 *
 * This is the ENGINE's representation. The LLM receives this
 * and decides how to express it in natural language.
 */
{
  // ── Primary emotional state ──────────────────────────
  // Top-K active dimensions, sorted by |intensity| descending.
  emotions: [
    { dimension: 'joy',       intensity: 0.45, trend: 'stable'  },
    { dimension: 'sadness',   intensity: -0.3, trend: 'rising'  },
    { dimension: 'nervousness', intensity: 0.2, trend: 'falling' },
  ],

  // ── Aggregate valence / arousal ──────────────────────
  valence: -0.08,    // -1 (max negative) to +1 (max positive)
  arousal: 0.51,     // 0 (calm/sleep) to 1 (excited/agitated)

  // ── Need pressures ───────────────────────────────────
  // Only needs with urgency above a threshold (e.g., deficit < 0.5).
  needs: [
    { need: 'energy',  urgency: 0.72 },  // 0=met, 1=critical
    { need: 'hunger',  urgency: 0.45 },
  ],

  // ── Social energy ────────────────────────────────────
  // Derived from SocialGraph: average relationship strength,
  // recent interaction frequency, isolation duration.
  socialEnergy: 0.35,  // 0 (isolated/depleted) to 1 (saturated)

  // ── Behavioral tendency (4D) ─────────────────────────
  // Direct snapshot of BehaviorField.B vector.
  behavior: {
    activity:       0.6,  // 0=rest/sleep, 1=work/exercise
    sociality:      0.3,  // 0=alone, 1=social
    focus:          0.7,  // 0=wandering, 1=focused
    expressiveness: 0.4,  // 0=withdrawn, 1=expressive
  },

  // ── Behavioral velocity ──────────────────────────────
  // Rate of change in behavior field (magnitude + dominant axis).
  behaviorDynamics: {
    speed: 0.15,          // ||velocity||
    dominantAxis: 'sociality',
    dominantDirection: 0.12,  // positive = rising
  },

  // ── Affect stability ─────────────────────────────────
  // How stable / volatile is the current affect state.
  // Low stability → character is emotionally turbulent.
  stability: 0.65,  // 0 (volatile) to 1 (settled)

  // ── Active regulation ────────────────────────────────
  // If emotion regulation is actively suppressing/amplifying.
  regulation: {
    active: true,
    strategy: 'suppression',
    intensity: 0.3,
  },

  // ── Compilation metadata ─────────────────────────────
  _meta: {
    tick: 1247,           // world tick when compiled
    simTime: '2024-03-15T14:30:00Z',
    version: '1.0',       // AffectFrame schema version
  },
}
```

**Design decisions:**

- `emotions` is Top-K (default K=5), not all 30. The LLM doesn't need 30 dimensions; it needs the active ones.
- `trend` is computed from the last N ticks of `emotion.current[dim]` history, not instantaneous.
- `needs` only includes needs with urgency above threshold. If hunger is met, it's omitted — not listed as "0.0".
- `socialEnergy` is a single aggregate, not per-relationship details. Per-relationship data remains in `nearbyPeople` context.
- `stability` is derived from the variance of recent emotion changes. High variance = low stability.

---

## 5. AffectFrame Compilation Pipeline

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  EmotionVector   │   │   NeedsSystem    │   │  BehaviorField   │
│                  │   │                  │   │                  │
│  .current{}      │   │  .needs{}        │   │  .B[4]           │
│  .mood{}         │   │  .deficit()      │   │  .velocity[4]    │
│  .getDominant()  │   │                  │   │  .speed          │
│  .getValence()   │   │                  │   │                  │
└────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                       AffectCompiler                             │
│                                                                  │
│  Step 1: Extract Top-K emotions by |intensity|                  │
│  Step 2: Compute valence (weighted sum of positive/negative)     │
│  Step 3: Compute arousal (activation level)                     │
│  Step 4: Detect trends (slope over last N ticks)                │
│  Step 5: Compute need urgencies (deficit → urgency mapping)     │
│  Step 6: Snapshot behavior vector + velocity                    │
│  Step 7: Compute social energy from SocialGraph                 │
│  Step 8: Compute stability from emotion variance                │
│  Step 9: Attach regulation state if active                      │
│  Step 10: Assemble AffectFrame                                  │
│                                                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
                     ┌──────────────────┐
                     │   AffectFrame    │
                     │   (structured)   │
                     └──────────────────┘
```

**Step details:**

```js
// Pseudocode — AffectCompiler.compile()

function compile(emotion, needs, behaviorField, socialGraph, memory, regulation) {
  // Step 1: Top-K emotions
  const dominant = emotion.getDominent(5); // reuse existing method
  const emotions = dominant.map(({ dimension, value }) => ({
    dimension,
    intensity: value,
    trend: computeTrend(emotion, dimension), // slope of last N ticks
  }));

  // Step 2-3: Valence / arousal (reuse existing methods)
  const valence = emotion.getValence();
  const arousal = emotion.getArousal();

  // Step 4: Need urgencies
  const needNames = ['energy', 'hunger', 'social', 'fun', 'comfort', 'hygiene'];
  const needsArr = needNames
    .map(n => ({ need: n, urgency: computeUrgency(needs, n) }))
    .filter(n => n.urgency > 0.3); // threshold: only show meaningful deficits

  // Step 5-6: Behavior snapshot
  const B = behaviorField.B;
  const behavior = {
    activity: B[0], sociality: B[1], focus: B[2], expressiveness: B[3],
  };
  const vel = behaviorField.velocity;
  const behaviorDynamics = {
    speed: behaviorField.speed,
    dominantAxis: ['activity', 'sociality', 'focus', 'expressiveness'][
      vel.reduce((max, v, i) => Math.abs(v) > Math.abs(vel[max]) ? i : max, 0)
    ],
    dominantDirection: vel[/* dominant index */],
  };

  // Step 7: Social energy
  const socialEnergy = computeSocialEnergy(socialGraph, agentId);

  // Step 8: Stability
  const stability = computeStability(emotion); // variance-based

  // Step 9: Regulation
  const reg = regulation ? {
    active: regulation.isRegulating,
    strategy: regulation.currentStrategy,
    intensity: regulation.suppressionLevel,
  } : { active: false, strategy: null, intensity: 0 };

  // Step 10: Assemble
  return {
    emotions, valence, arousal,
    needs: needsArr,
    socialEnergy,
    behavior, behaviorDynamics,
    stability,
    regulation: reg,
    _meta: { tick, simTime, version: '1.0' },
  };
}
```

**Where `AffectCompiler` lives:** `src/agent/psychology/AffectCompiler.js`

It is a pure function module — no class, no state, no side effects. It reads from subsystems and produces a plain object.

---

## 6. LLM Expression Rules

### 6.1 Prompt Injection Format

AffectFrame is injected into the LLM system prompt as structured data, not prose:

```
## 当前情感状态（AffectFrame）

情绪：
- 开心: 0.45 (稳定)
- 难过: -0.30 (上升中)
- 紧张: 0.20 (下降中)

效价: -0.08 | 唤醒度: 0.51

需求压力：
- 精力: 急迫 (0.72)
- 饥饿: 中等 (0.45)

社交能量: 0.35
行为倾向: 活动0.6 社交0.3 专注0.7 表达0.4
行为变化: 社交倾向在上升 (0.12)
情感稳定性: 0.65
调节状态: 抑制中 (强度0.3)
```

This preserves numerical precision and multi-dimensionality. The LLM can see that sadness is rising, that energy is critically low, and that sociality is trending upward — all in a structured format it can reason about.

### 6.2 LLM Instruction Set

```
你正在扮演角色 {name}。以下是该角色当前的精确情感状态。

你必须：
- 根据情感状态生成符合角色心理的自然语言表达
- 反映情绪的强度、方向和变化趋势
- 让需求压力自然地影响角色关注点和行为

你不得：
- 声称角色拥有 AffectFrame 中不存在的情绪
- 与效价方向矛盾（效价为负时不应表达强烈的正面情绪）
- 声称角色不饿/不累，当 AffectFrame 显示相关需求急迫时
- 编造角色的情感历史或未来预测

你可以：
- 使用隐喻、风格化表达、个人化语言
- 选择性地表达部分情绪（不必列出所有维度）
- 通过行为暗示而非直接陈述来传达情感状态
```

### 6.3 Consistency Checking

`checkConsistency()` validates LLM output against AffectFrame:

```js
function checkConsistency(llmOutput, affectFrame) {
  const violations = [];

  // 1. Valence direction check
  // If LLM expresses strong positive emotion but valence < -0.2
  const expressedValence = extractValenceFromText(llmOutput);
  if (expressedValence > 0.3 && affectFrame.valence < -0.2) {
    violations.push({
      type: 'valence_contradiction',
      severity: 'high',
      detail: `LLM expressed positive emotion but AffectFrame valence is ${affectFrame.valence}`,
    });
  }

  // 2. Need denial check
  // If LLM claims "I'm not hungry" but hunger urgency > 0.6
  const needDenials = extractNeedDenials(llmOutput);
  for (const denial of needDenials) {
    const need = affectFrame.needs.find(n => n.need === denial);
    if (need && need.urgency > 0.6) {
      violations.push({
        type: 'need_denial',
        severity: 'medium',
        detail: `LLM denied need "${denial}" but urgency is ${need.urgency}`,
      });
    }
  }

  // 3. Contradicted emotion check
  // If LLM claims to feel an emotion not in top-K with significant intensity
  const claimedEmotions = extractEmotionClaims(llmOutput);
  for (const claimed of claimedEmotions) {
    const frameEmotion = affectFrame.emotions.find(e => e.dimension === claimed.dimension);
    if (!frameEmotion && claimed.confidence > 0.7) {
      violations.push({
        type: 'invented_emotion',
        severity: 'high',
        detail: `LLM claimed "${claimed.dimension}" which is not in AffectFrame`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}
```

**Note:** `checkConsistency()` is a *validator*, not a blocker. Violations are reported to the runtime for logging, optional rewriting, or soft warnings. This preserves the existing checker's role as described in `docs/GROUNDING_CHECKER_V2_RFC.md`.

---

## 7. Open Source vs Commercial Boundary

### 7.1 Open Source (Apache-2.0)

Included in the public repository:

- `AffectCompiler.js` — basic compilation from EmotionVector, NeedsSystem, BehaviorField
- `AffectFrame` schema definition and type documentation
- `toPromptString()` replacement that reads from AffectFrame (backward-compatible)
- `checkConsistency()` integration with existing `FactConsistencyChecker`
- Basic trend detection (linear slope over last N ticks)
- Structured prompt injection format for LLM consumption

### 7.2 Commercial / Pro

Licensed separately:

- **Temporal dynamics engine**: high-fidelity trend detection with exponential smoothing, seasonal patterns, and circadian rhythm integration
- **Multi-agent affect synchronization**: emotional contagion, empathic resonance, group mood dynamics (extends existing SocialContagion)
- **Personalized expression profiles**: per-character LLM expression templates calibrated to personality, culture, and communication style
- **AffectFrame-driven animation/voice parameters**: mapping AffectFrame to voice prosody, gesture intensity, facial expression parameters for avatar/voice synthesis
- **Affect analytics dashboard**: real-time visualization of AffectFrame across all agents

### 7.3 Private / Enterprise

Custom engagements:

- Custom AffectFrame extensions (e.g., clinical psychology emotion models, cultural affect taxonomies)
- Proprietary emotion dimension sets (beyond the standard 30)
- Industry-specific affect scoring (healthcare, education, entertainment)
- Integration with external biometric/sentiment data sources

---

## 8. Non-Goals (This Phase)

This RFC is **design only**. The following are explicitly out of scope for v2.0-alpha.3:

- **NOT implementing `AffectCompiler.js`.** This is a future implementation target.
- **NOT changing `EmotionVector.toPromptString()`.** The current method remains the canonical prompt string until AffectCompiler is ready.
- **NOT modifying `checkConsistency()`.** The existing `FactConsistencyChecker` is preserved as-is.
- **NOT modifying `AgentNarrative.toNarrative()`.** Current narrative generation is preserved.
- **NOT adding new npm dependencies.** AffectCompiler will use only existing internal APIs.
- **NOT changing the LLM prompt format.** `AndyEngineHelpers.buildWorldContext()` continues to use `toPromptString()` until migration.

---

## 9. Migration Path

### Phase 1: Parallel Construction (non-breaking)

```
1. Create src/agent/psychology/AffectCompiler.js
2. AffectCompiler.compile() produces AffectFrame from existing subsystems
3. Add AffectFrame to AgentRuntime as agent._affectFrame (debug-only)
4. No changes to toPromptString() or toNarrative()
```

### Phase 2: Dual-Path Prompt (opt-in)

```
1. AndyEngineHelpers.buildWorldContext() checks config.useAffectFrame
2. If true: inject AffectFrame as structured data into prompt
3. If false: use existing toPromptString() (default)
4. Both paths coexist; A/B testing possible
```

### Phase 3: Consistency Integration (non-breaking)

```
1. checkConsistency() gains optional affectFrame parameter
2. If provided: validate LLM output against AffectFrame
3. If not: existing behavior unchanged
4. Violations logged to diagnostics, not blocking
```

### Phase 4: Full Migration (breaking, major version)

```
1. toPromptString() reimplemented as AffectFrame renderer
2. toNarrative() updated to consume AffectFrame
3. buildWorldContext() defaults to AffectFrame path
4. Old string-based emotion injection deprecated
```

Each phase is independently shippable and backward-compatible (until Phase 4).

---

## 10. Open Questions

1. **Tick history storage.** Trend detection requires storing the last N values of each emotion dimension. Should this be a ring buffer on EmotionVector, or a separate history module? Memory cost: 30 dimensions × N ticks × 8 bytes = 240N bytes per agent.

2. **Trend computation window.** How many ticks should `trend` span? Too few = noisy; too few = laggy. Suggested: 10 ticks as default, configurable.

3. **Social energy formula.** `computeSocialEnergy()` needs a concrete formula. Options: average relationship strength, sum of recent interaction recency-weighted scores, or a custom composite. Should isolation duration factor in?

4. **AffectFrame serialization.** Should AffectFrame be serializable (for save/load, replay, debugging)? If so, should it include `_meta.tick` for temporal reconstruction?

5. **Prompt token budget.** The structured AffectFrame prompt injection is more verbose than current `toPromptString()`. Estimate: ~200-300 tokens vs current ~100-150 tokens. Is this acceptable for the LLM context budget?

6. **checkConsistency() extraction accuracy.** The consistency checker needs to extract emotional claims from LLM text. For Chinese text, this requires NLP or regex heuristics similar to the Grounding Checker v2 approach. How accurate must this be before it's useful?

7. **Multiple AffectFrame snapshots.** Should the LLM receive the current AffectFrame only, or also a summary of the previous frame for comparison? A delta frame could help the LLM understand *change* without full history.

8. **Domain-specific emotion dimensions.** Some domains (e.g., clinical, gaming) may need emotions beyond the standard 30. Should AffectFrame support extensible dimensions, or is the fixed 30-dimension set sufficient?

---

## 11. Relationship to Existing Systems

| System | Relationship to AffectCompiler |
|--------|-------------------------------|
| `EmotionVector` | Primary input. AffectCompiler reads `.current`, `.mood`, `.getDominant()`, `.getValence()`, `.getArousal()` |
| `NeedsSystem` | Input. AffectCompiler reads `.needs` and computes urgency |
| `BehaviorField` | Input. AffectCompiler reads `.B[4]`, `.velocity[4]`, `.speed` |
| `SocialGraph` | Input. AffectCompiler computes social energy from relationship data |
| `PersonalMemory` | Input. Recent appraisals contribute to emotional coloring |
| `EmotionRegulation` | Input. Active regulation strategies affect AffectFrame's `regulation` field |
| `FactConsistencyChecker` | Consumer. Uses AffectFrame for validation (Phase 3) |
| `AgentNarrative` | Future consumer. `toNarrative()` may read AffectFrame instead of raw subsystems |
| `AndyEngineHelpers` | Future consumer. `buildWorldContext()` may inject AffectFrame instead of `toPromptString()` |
| `SocialContagion` | Indirect. Emotional contagion changes EmotionVector, which flows into AffectFrame |

---

## 12. Success Criteria

This RFC is successful if:

1. A future implementation of `AffectCompiler.js` can be built without modifying any existing subsystem API
2. The resulting AffectFrame preserves more information than `toPromptString()` while being more structured
3. LLM integration via AffectFrame produces character expressions that are more consistent with engine state than current string-based injection
4. `checkConsistency()` can validate LLM output against AffectFrame without false positives exceeding 10%
5. The open-source / commercial boundary is clear and enforceable

---

## 13. Seam Compatibility Review (beta.1)

> Added during B1.4 task — Public API contract finalization.

### 13.1 Current Seam Status

`AffectFrame` is implemented as a seam at `src/shared/AffectFrame.js:buildAffectFrame(agent)`. It is a pure function that derives a structured snapshot from existing agent subsystems (EmotionVector, NeedsSystem, BehaviorField) without modifying them. The output shape is:

```js
{
  emotions: [{ dimension, intensity }],
  valence: number,
  arousal: number,
  needs: [{ need, urgency }],
  behavior: { activity, sociality, focus, expressiveness },
  behaviorSpeed: number,
  stability: number,  // placeholder 0.5
  _meta: { version: '0.1-seam' }
}
```

**What is present:** Basic emotion extraction (Top-K by `|intensity| >= 0.1`), valence/arousal from `EmotionVector.getValence()`/`getArousal()`, need urgency from `NeedsSystem.needs`, behavior vector snapshot, and behavior speed.

**What is NOT present (deferred to AffectCompiler):** trend detection, social energy, regulation state, stability computation (currently hardcoded 0.5), memory pressure contribution.

### 13.2 Compatibility Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| AffectFrame flows into narrative generation | ✅ Compatible | `NarrativeBuilder.buildSystemPrompt()` accepts `affectFrame` option (`src/sdk/NarrativeBuilder.js:25`). `_buildCurrentState()` reads `affectFrame.needs` and `affectFrame.emotions` to produce natural-language state text. |
| LLM can express structured affect without creating world facts | ✅ Compatible | AffectFrame is read-only data injected into the prompt. LLM output is validated by `FactConsistencyChecker`, not by AffectFrame. No world facts are created from affect expressions. |
| No public API frozen in string-parsing shape | ✅ Compatible | The `affectFrame` option is additive to `NarrativeBuilder.buildSystemPrompt()`. Existing `toPromptString()` path is preserved as default. No breaking API change. |
| NarrativeBuilder affectFrame seam is compatible | ✅ Compatible | `buildSystemPrompt(options)` already destructures `affectFrame = null` from options. When null, falls back to `ctx.needsState`/`ctx.emotionState` string parsing. When provided, uses structured data directly. |

### 13.3 Blockers for Future AffectCompiler Integration

**No blocking issues.** The current seam is designed for forward compatibility:

1. `AffectFrame` shape from `buildAffectFrame()` is a subset of the full RFC spec (Section 4). Missing fields (`socialEnergy`, `behaviorDynamics`, `regulation`, trend data) can be added without breaking consumers — the seam consumer (`NarrativeBuilder`) only reads `emotions`, `valence`, `needs`.

2. `buildAffectFrame()` returns a plain object — no class identity issues across CJS/ESM boundaries.

3. The `NarrativeBuilder` affectFrame path is additive opt-in, so AffectCompiler can be built in parallel without touching existing narrative generation.

4. Type surface in `index.d.ts` declares `AffectFrame` as `@experimental`, signaling consumers that the shape may evolve.

**Recommended next step:** When AffectCompiler is implemented, promote `AffectFrame` from experimental to stable and add missing fields (`socialEnergy`, `behaviorDynamics`, `regulation`, trend data) to both the implementation and the type declaration.

---

## 14. Compatibility Note (Batch 4)

Basic AffectFrame structured input exists in `src/shared/AffectFrame.js`. This is a seam, not a full AffectCompiler.

**What is present:**
- Basic emotion extraction (Top-K by `|intensity| >= 0.1`)
- Valence/arousal from `EmotionVector.getValence()`/`getArousal()`
- Need urgency from `NeedsSystem.needs`
- Behavior vector snapshot
- Behavior speed

**What is NOT present (deferred to AffectCompiler):**
- Trend detection (no history buffer yet)
- Social energy (no SocialGraph access yet)
- Regulation state (no EmotionRegulation access yet)
- Stability computation (currently hardcoded 0.5)
- Memory pressure contribution

**Integration status:**
- `NarrativeBuilder.buildSystemPrompt()` accepts `affectFrame` option
- When `affectFrame` is provided, structured data is used for needs, emotions, and guidelines
- When `affectFrame` is not provided, old string parsing paths are used for backward compatibility
- Full AffectCompiler implementation is still deferred to v2.1/v3
