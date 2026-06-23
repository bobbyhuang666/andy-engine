# NarrativeBuilder String-Format Dependency Audit

> **Audit date**: 2026-06-22
> **Target**: `src/sdk/NarrativeBuilder.js` (282 lines)
> **Purpose**: Catalog every string-format dependency, assess risk of upstream format changes, and prescribe structured replacements.

---

## Executive Summary

NarrativeBuilder consumes **5 categories of pre-formatted strings** from upstream modules and applies regex/`includes()` parsing to extract semantic meaning. All of these are **implicit format contracts** — if any upstream `toPromptString()` method changes its Chinese labels, punctuation, or parenthetical syntax, NarrativeBuilder silently produces degraded or empty output.

**Total dependencies found**: 14 distinct string-format parsing sites
**P0 (release-blocking)**: 3 — needs string, emotion valence string, forbidden terms
**P1 (high risk)**: 5 — emotion scene extraction, memory tag stripping, memory time-ago stripping, sentinel string comparisons, region map
**P2 (medium risk)**: 6 — weather/season maps, hour→time-of-day, health thresholds, behavior field vector checks, recentEvents dedup

---

## Category 1: World Context String Parsing

### 1.1 Hour → Time-of-Day Label

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:83-90` |
| **Source** | `ctx.hour` (numeric, from `AndyEngineHelpers.js:191`) |
| **What is parsed** | Numeric hour → Chinese label via hardcoded if/else chain |
| **Code** | `if (hour >= 5 && hour < 9) timeDesc = '清晨'; else if ...` |
| **Failure mode** | If hour semantics change (e.g., 24h→12h, timezone shifts), labels silently wrong |
| **Release-blocking** | No — hour is a primitive, unlikely to change format |
| **Structured replacement** | `ctx.timeOfDayLabel` enum from domain or runtime, or a `TimeOfDay` struct with `{ label, hourRange }` |
| **Tests required** | Boundary tests for each hour range (4→清晨, 9→上午, 12→中午, 14→下午, 18→晚上, 22→深夜, 0→深夜) |
| **Risk** | Low |
| **Priority** | P2 |

### 1.2 Weather Key → Chinese Description

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:92` |
| **Source** | `ctx.weather` (string key from `engine.world.environment.weather`) |
| **What is parsed** | English key → Chinese label via hardcoded map: `{ sunny: '阳光明媚', cloudy: '天色阴沉', rainy: '窗外下着雨', snowy: '外面飘着雪', windy: '风很大' }` |
| **Failure mode** | New weather types (foggy, stormy, hazy) silently ignored → no weather context in prompt |
| **Release-blocking** | No — missing weather is cosmetic |
| **Structured replacement** | Domain-provided `weatherMap` in `narrativeTemplates`, or a `WeatherDescriptor` struct |
| **Tests required** | Test each known key produces correct label; test unknown key produces no weather clause |
| **Risk** | Low |
| **Priority** | P2 |

### 1.3 Season Key → Chinese Description

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:93` |
| **Source** | `ctx.season` (string key from `engine.world.environment.season`) |
| **What is parsed** | English key → Chinese label via hardcoded map: `{ spring: '春天', summer: '夏天', autumn: '秋天', winter: '冬天' }` |
| **Failure mode** | New season keys silently ignored |
| **Release-blocking** | No |
| **Structured replacement** | Domain-provided `seasonMap` in `narrativeTemplates` |
| **Tests required** | Test each known key; test unknown key |
| **Risk** | Low |
| **Priority** | P2 |

### 1.4 Region Key → Description via narrativeTemplates

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:109-113` |
| **Source** | `ctx.currentRegion` (string key) + `narrativeTemplates.regionMap` (from domain) |
| **What is parsed** | Region key looked up in domain `regionMap`; fallback is `` `在${ctx.currentRegion}` `` |
| **Failure mode** | If regionMap is missing entries for new regions, raw key leaks into prompt (e.g., "在library_3f") |
| **Release-blocking** | No — fallback is functional but ugly |
| **Structured replacement** | Already domain-driven; ensure all regions registered in domain config |
| **Tests required** | Test known region → mapped label; test unknown region → fallback with raw key |
| **Risk** | Low |
| **Priority** | P2 |

---

## Category 2: Needs String Parsing

### 2.1 Needs State Label Matching

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:117-123` (buildCurrentState) and `NarrativeBuilder.js:272-275` (buildGuidelines) |
| **Source** | `ctx.needsState` — string from `NeedsSystem.toPromptString()` (`src/agent/psychology/NeedsSystem.js:247-264`) |
| **Upstream format** | `"需求：饱腹极度匮乏，精力不足，社交一般，舒适充足，兴趣饱满。"` |
| **What is parsed** | `String.includes()` matching exact Chinese labels: `精力极度匮乏`, `精力不足`, `饱腹极度匮乏`, `饱腹不足`, `社交极度匮乏` |
| **Code (buildCurrentState)** | `if (ctx.needsState.includes('精力极度匮乏')) parts.push('眼皮重得抬不起来');` |
| **Code (buildGuidelines)** | `if (ctx.needsState.includes('精力不足') \|\| ctx.needsState.includes('精力极度匮乏'))` |
| **Failure mode** | **Critical**: If `NeedsSystem.toPromptString()` changes any label (e.g., `精力极度匮乏` → `精力严重不足`), the `includes()` check silently fails. The LLM prompt will lack fatigue/hunger/social deprivation cues. Both `.js` and `.native.js` must stay in sync. |
| **Release-blocking** | **Yes** — behavioral regression: tired/hungry agents won't convey fatigue to LLM |
| **Structured replacement** | Pass `needsState` as a structured object `{ hunger: 0.15, energy: 0.1, social: 0.8, comfort: 0.6, stimulation: 0.5 }` and use threshold comparisons directly (already available as `agent.needs.needs`) |
| **Tests required** | (a) Test each threshold boundary (<0.2, <0.4) produces correct narrative text. (b) Test that both `NeedsSystem.js` and `NeedsSystem.native.js` produce identical label strings. (c) Regression test: if label changes, test fails. |
| **Risk** | **High** — two separate implementations (`.js` / `.native.js`) must stay in label sync; no compile-time check |
| **Priority** | **P0** |

**Affected lines summary**:
- `NarrativeBuilder.js:118` — `精力极度匮乏` → `'眼皮重得抬不起来'`
- `NarrativeBuilder.js:119` — `精力不足` → `'有点犯困'`
- `NarrativeBuilder.js:120` — `饱腹极度匮乏` → `'肚子咕咕叫'`
- `NarrativeBuilder.js:121` — `饱腹不足` → `'有点饿'`
- `NarrativeBuilder.js:122` — `社交极度匮乏` → `'好久没跟人说话了'`
- `NarrativeBuilder.js:273` — `精力不足` / `精力极度匮乏` → fatigue guideline

---

## Category 3: Emotion String Parsing

### 3.1 Scene Text Extraction via Regex

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:127-139` |
| **Source** | `ctx.emotionState` — string from `EmotionVector.toPromptString()` (`src/agent/psychology/EmotionVector.js:582-693`) |
| **Upstream format** | `"有点开心的情绪主导着你的心境（效价=0.35, 唤醒=0.52）。关键维度：开心=0.42。整体心境：心情不错。"` |
| **What is parsed** | Regex `/^(.*?)（效价/` extracts everything before `（效价` as the scene description |
| **Code** | `const sceneMatch = ctx.emotionState.match(/^(.*?)（效价/);` then a chain of `.replace()` calls strips prefixes |
| **Failure mode** | **Critical**: If upstream changes `（效价=` to `(效价=` or `效价：` or removes the parenthetical entirely, `sceneMatch` is null → entire emotion section disappears from prompt. The 7 `.replace()` calls also depend on exact Chinese phrasing patterns from `EmotionVector.toPromptString()`. |
| **Release-blocking** | **Yes** — emotion context completely lost from LLM prompt |
| **Structured replacement** | Pass structured `{ scene: '...', valence: 0.35, arousal: 0.52, dominant: [...], mood: '...' }` and let NarrativeBuilder format directly |
| **Tests required** | (a) Test regex extraction for each emotion branch (positive/negative/neutral/ambivalent). (b) Test each `.replace()` chain pattern. (c) Test null case when format changes. (d) Both `.js` and `.native.js` produce compatible format. |
| **Risk** | **High** — fragile regex + 7 post-processing replaces on dynamically generated Chinese text |
| **Priority** | **P0** |

**Specific `.replace()` chain dependencies** (lines 129-137):

| Pattern | Source | Risk |
|---|---|---|
| `/^你的?情绪/` | `EmotionVector` scene prefix | Medium — prefix stable but not guaranteed |
| `/^你的?内心/` | `EmotionVector` scene prefix | Medium — used in ambivalent/neutral branches |
| `/^你/` | Generic prefix strip | Low — broad fallback |
| `/^的/` | Leftover particle | Low |
| `/^平静而微妙,?\s*/` | Exact string from `EmotionVector.js:661` | **High** — hardcoded match to upstream literal |
| `/有点(.+?)与有点(.+?)并存/` | Pattern from `EmotionVector.js:662` | **High** — matches `与...并存` construction |
| `/的暖意/` | From ambivalent scene `EmotionVector.js:639` | **High** — matches literal `暖意` |
| `/的阴影/` | From ambivalent scene `EmotionVector.js:639` | **High** — matches literal `阴影` |

### 3.2 Full emotionState String Available but Unused

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:126` |
| **Note** | The full `ctx.emotionState` string is passed through to the prompt if no regex match, but the scene extraction silently fails. No fallback or warning. |

---

## Category 4: Valence / Stress String Parsing

### 4.1 Negative Valence Detection

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:264` |
| **Source** | `ctx.emotionState` — same upstream string as Category 3 |
| **What is parsed** | `ctx.emotionState.includes('效价=-')` — checks if valence is negative by detecting the minus sign after `效价=` |
| **Upstream format** | `（效价=-0.25, 唤醒=0.40）` — the `-` is produced by `valence.toFixed(2)` when valence < 0 |
| **Failure mode** | If upstream changes to `效价：-0.25` or uses Unicode minus `−`, the check fails → no "心情不好" guideline added |
| **Release-blocking** | **Yes** — mood-congruent reply guidelines silently dropped |
| **Structured replacement** | Use `valence < 0` numeric check on structured data |
| **Tests required** | (a) Test negative valence string triggers guideline. (b) Test positive valence does not trigger. (c) Test zero valence edge case. |
| **Risk** | **High** — depends on exact punctuation `（` and `=` |
| **Priority** | **P0** |

### 4.2 "不太好" Mood String Detection

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:264` |
| **Source** | Embedded in `ctx.emotionState` via `getMoodString()` return value appended as `整体心境：心情不太好。` |
| **What is parsed** | `ctx.emotionState.includes('不太好')` |
| **Upstream format** | `getMoodString()` returns `'心情不太好'` when `moodValence <= -0.2` (`EmotionVector.js:722`) |
| **Failure mode** | If `getMoodString()` changes wording (e.g., `'情绪低落'`), check fails |
| **Release-blocking** | Partially — redundant with `效价=-` check but provides broader coverage |
| **Structured replacement** | Use `moodValence` numeric value directly |
| **Tests required** | Test that `'心情不太好'` triggers guideline |
| **Risk** | Medium — secondary signal, not sole trigger |
| **Priority** | P1 |

### 4.3 Stress Detection

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:267` |
| **Source** | `ctx.emotionState` includes `'压力很大'` or `'有点压力'` from `EmotionVector.toPromptString()` stress descriptor |
| **What is parsed** | `ctx.emotionState.includes('压力')` |
| **Upstream format** | `stressDesc` appended when `this.stress > 5` → `'压力很大'` or `this.stress > 3` → `'有点压力'` (`EmotionVector.js:669`) |
| **Failure mode** | If stress descriptor wording changes, guideline silently dropped |
| **Release-blocking** | No — supplementary behavioral cue |
| **Structured replacement** | Pass `stress` numeric value; compare `ctx.stress > 3` directly |
| **Tests required** | Test stress > 5 triggers; test stress <= 3 does not trigger |
| **Risk** | Medium |
| **Priority** | P1 |

---

## Category 5: Memory String Parsing

### 5.1 Memory Tag Stripping

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:181-193` |
| **Source** | `ctx.memoryContext` — string from `PersonalMemory.toPromptString()` (`src/agent/memory/PersonalMemory.js:744-803`) |
| **Upstream format** | `"记忆中的印象：\n- [background] 今天去了图书馆 (2小时前)\n- [social] 和小明聊天 (刚刚)"` |
| **What is parsed** | Regex replacements strip: `[background]`, `[social]`, `[daily_life]`, `[emotion]`, `[thought]`, `(刚刚)`, `(\d+小时前)`, `(\d+天前)`, `记忆中的印象：`, `记忆：` |
| **Code** | 10 `.replace()` calls on lines 181-192 |
| **Failure mode** | If `PersonalMemory.toPromptString()` adds new category tags (e.g., `[academic]`, `[work]`), they leak into the prompt. If time-ago format changes (e.g., `分钟前` instead of `刚刚`), the regex won't strip it. Missing `[周前]` stripping — `(\d+天前)` won't match `2周前`. |
| **Release-blocking** | No — unstripped tags are cosmetic noise, not semantic loss |
| **Structured replacement** | Pass memories as structured array `[{ content, category, timeAgo }]`; let NarrativeBuilder format |
| **Tests required** | (a) Test each tag pattern is stripped. (b) Test time-ago patterns. (c) Test that `周前` is handled (currently missing!). (d) Test empty memory string. |
| **Risk** | Medium — 10 regex patterns must stay in sync with `_timeAgo()` and `toPromptString()` |
| **Priority** | P1 |

**Missing strip pattern**: `_timeAgo()` in `PersonalMemory.js:1002` produces `X周前` but NarrativeBuilder only strips `(\d+天前)` — the `周前` format is **not stripped**.

### 5.2 Empty Memory Sentinel

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:195-200` |
| **Source** | `PersonalMemory.toPromptString()` returns `'记忆：没有什么特别的印象。'` when empty (`PersonalMemory.js:795`) |
| **What is parsed** | Post-cleanup line filter: `l.length >= 3` — lines shorter than 3 chars are dropped |
| **Failure mode** | If empty-memory sentinel changes, it may produce a spurious single-line memory section |
| **Release-blocking** | No — cosmetic |
| **Structured replacement** | Return `null` or empty array for empty memories |
| **Tests required** | Test that empty memory sentinel produces no memory section |
| **Risk** | Low |
| **Priority** | P2 |

---

## Category 6: Domain-Aware Term Replacement

### 6.1 ForbiddenTerms Application

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:76` |
| **Source** | `domain.forbiddenTerms` array via `applyForbiddenTerms()` (`src/domain/ForbiddenTerms.js`) |
| **What is parsed** | Each term in `forbiddenTerms` array is used as a regex pattern: `result.replace(new RegExp(term, 'g'), '***')` |
| **Failure mode** | If `forbiddenTerms` contains regex-special characters (e.g., `(`, `)`, `+`), the `new RegExp(term, 'g')` will throw or match incorrectly. No escaping is performed. |
| **Release-blocking** | **Yes** — domain constraint enforcement failure could leak forbidden terms to LLM |
| **Structured replacement** | Escape regex special chars in `applyForbiddenTerms`, or use simple `indexOf`/`replaceAll` with literal strings |
| **Tests required** | (a) Test that forbidden terms are replaced. (b) Test that regex-special chars in terms don't throw. (c) Test empty domain. (d) Test that replacement applies to the full assembled prompt, not just individual sections. |
| **Risk** | **High** — unescaped regex from user-configured domain data |
| **Priority** | **P0** (already P0 because it's domain constraint enforcement) |

### 6.2 Campus Domain Check for Worldview Constraint

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:256` |
| **Source** | `domain.id` string comparison |
| **What is parsed** | `domain.id !== 'campus'` — only adds forbidden terms guideline for non-campus domains |
| **Failure mode** | If domain ID changes or new domains are added without updating this check, worldview constraints may be incorrectly applied/skipped |
| **Release-blocking** | No — this is a prompt engineering choice, not a correctness issue |
| **Structured replacement** | `domain.showWorldviewConstraints` boolean flag |
| **Tests required** | Test campus domain → no worldview constraint text; custom domain → worldview constraint text present |
| **Risk** | Low |
| **Priority** | P2 |

---

## Category 7: Sentinel String Comparisons

### 7.1 nearbyPeople Sentinel

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:50` |
| **Source** | `AndyEngineHelpers.js:201` — `nearbyPeople \|\| '附近没有人'` |
| **What is parsed** | `worldContext.nearbyPeople !== '附近没有人'` — exact string comparison |
| **Failure mode** | If sentinel string changes in `AndyEngineHelpers`, the check fails → "附近没有人" section added to prompt, or non-empty people list skipped |
| **Release-blocking** | No — cosmetic but confusing |
| **Structured replacement** | Use `null`/`undefined` for absence; check `worldContext.nearbyPeople != null` |
| **Tests required** | Test null/undefined → no section; test empty string → no section; test sentinel → no section; test content → section added |
| **Risk** | Medium |
| **Priority** | P1 |

### 7.2 recentEvents Sentinel

| Field | Value |
|---|---|
| **Location** | `NarrativeBuilder.js:54` |
| **Source** | `AndyEngineHelpers.js:199` — `eventTexts \|\| '没有特别的事情发生'` |
| **What is parsed** | `worldContext.recentEvents !== '没有特别的事情发生'` — exact string comparison |
| **Failure mode** | Same as 7.1 — sentinel change breaks the check |
| **Release-blocking** | No |
| **Structured replacement** | Use `null`/`undefined` for absence |
| **Tests required** | Same pattern as 7.1 |
| **Risk** | Medium |
| **Priority** | P1 |

---

## Summary Table

| # | Dependency | Lines | Category | Risk | Priority | Release-blocking |
|---|---|---|---|---|---|---|
| 1.1 | Hour → time-of-day label | 83-90 | World context | Low | P2 | No |
| 1.2 | Weather key → Chinese | 92 | World context | Low | P2 | No |
| 1.3 | Season key → Chinese | 93 | World context | Low | P2 | No |
| 1.4 | Region key → description | 109-113 | World context | Low | P2 | No |
| 2.1 | Needs label matching | 117-123, 272-275 | Needs parsing | **High** | **P0** | **Yes** |
| 3.1 | Emotion scene regex extraction | 127-139 | Emotion parsing | **High** | **P0** | **Yes** |
| 3.2 | Emotion `.replace()` chain | 129-137 | Emotion parsing | **High** | **P0** | **Yes** |
| 4.1 | Negative valence `效价=-` | 264 | Valence parsing | **High** | **P0** | **Yes** |
| 4.2 | `不太好` mood detection | 264 | Valence parsing | Medium | P1 | Partially |
| 4.3 | `压力` stress detection | 267 | Valence parsing | Medium | P1 | No |
| 5.1 | Memory tag/time stripping | 181-193 | Memory parsing | Medium | P1 | No |
| 5.2 | Empty memory sentinel | 195-200 | Memory parsing | Low | P2 | No |
| 6.1 | ForbiddenTerms regex | 76 | Domain terms | **High** | **P0** | **Yes** |
| 6.2 | Campus domain ID check | 256 | Domain terms | Low | P2 | No |
| 7.1 | `附近没有人` sentinel | 50 | Sentinel | Medium | P1 | No |
| 7.2 | `没有特别的事情发生` sentinel | 54 | Sentinel | Medium | P1 | No |

---

## Migration Roadmap

### P0 — Must fix before next release

1. **Needs → structured data** (dep 2.1)
   - Change `AndyEngineHelpers.buildWorldContext()` to pass `needsValues: agent.needs.needs` (the raw `{ hunger, energy, social, comfort, stimulation }` object)
   - NarrativeBuilder uses numeric thresholds directly: `if (needsValues.energy < 0.2)`
   - Remove dependency on `NeedsSystem.toPromptString()` label strings
   - Keep `needsState` string for backward compat but don't parse it

2. **Emotion → structured data** (deps 3.1, 3.2, 4.1)
   - Change `AndyEngineHelpers.buildWorldContext()` to pass `emotionData: { scene, valence, arousal, stress, mood, dominant }` alongside `emotionState` string
   - NarrativeBuilder uses `emotionData.scene` directly instead of regex extraction
   - NarrativeBuilder uses `emotionData.valence < 0` instead of `includes('效价=-')`
   - Keep `emotionState` string for backward compat but don't parse it

3. **ForbiddenTerms regex escaping** (dep 6.1)
   - In `ForbiddenTerms.js`, escape regex special chars: `term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
   - Or switch to `replaceAll(term, '***')` (literal string replacement)

### P1 — Should fix soon

4. **Sentinel strings → null checks** (deps 7.1, 7.2)
   - Change `AndyEngineHelpers` to pass `null` instead of sentinel strings
   - NarrativeBuilder checks `!= null` instead of string comparison

5. **Memory → structured array** (dep 5.1)
   - Pass `memories: [{ content, category, timeAgo }]` alongside `memoryContext` string
   - NarrativeBuilder formats directly, no tag stripping needed

6. **Stress/mood → numeric** (deps 4.2, 4.3)
   - Already partially addressed by emotion structured data (P0 item 2)

### P2 — Nice to have

7. **Weather/season/region maps → domain-driven** (deps 1.2, 1.3, 1.4)
   - Move maps to `narrativeTemplates` in domain config
   - Already partially done for `regionMap`

8. **Hour label → domain-driven** (dep 1.1)
   - Move time-of-day labels to domain `narrativeTemplates`

---

## Test Inventory

### Existing tests covering NarrativeBuilder

| File | Coverage |
|---|---|
| `tests/sdk.test.js:116-347` | Basic buildSystemPrompt, null handling, various states |
| `tests/worldview-constraints.test.js:46` | Custom domain forbidden terms |
| `tests/facts/grounded-narrative.test.js:114` | Grounding section rendering |
| `tests/architecture/boundary-check.test.js:332` | No agent internals import, no Date.now/Math.random |
| `tests/unit/build-narrative-emotion-safety.test.js` | Emotion safety edge cases |

### Tests needed (not yet written)

| Test | Covers | Priority |
|---|---|---|
| Needs threshold boundary sweep | Dep 2.1 | P0 |
| Emotion regex extraction for all 4 branches | Dep 3.1 | P0 |
| Emotion `.replace()` chain pattern matching | Dep 3.2 | P0 |
| `效价=-` detection with negative valence | Dep 4.1 | P0 |
| ForbiddenTerms with regex-special chars | Dep 6.1 | P0 |
| `周前` time-ago format not stripped (bug) | Dep 5.1 | P1 |
| Sentinel string comparison for nearby/recent | Dep 7.1, 7.2 | P1 |
| NeedsSystem.js vs NeedsSystem.native.js label parity | Dep 2.1 | P0 |
| EmotionVector.js vs EmotionVector.native.js format parity | Dep 3.1 | P0 |

---

## AffectFrame Integration (Batch 4)

### Resolved String Parsing Debts

The following P0/P1 string parsing debts have been resolved with AffectFrame structured input:

| # | Dependency | Priority | Resolution |
|---|------------|----------|------------|
| 2.1 | Needs label matching | P0 | Resolved — `affectFrame.needs` used for energy/hunger urgency |
| 3.1 | Emotion scene regex extraction | P0 | Resolved — `affectFrame.emotions` used for emotion scene |
| 3.2 | Emotion `.replace()` chain | P0 | Resolved — `affectFrame.emotions` used for emotion scene |
| 4.1 | Negative valence `效价=-` | P0 | Resolved — `affectFrame.valence < 0` used |
| 4.2 | `不太好` mood detection | P1 | Resolved — `affectFrame.valence < -0.2` used |
| 4.3 | Stress detection | P1 | Resolved — `affectFrame.emotions` checked for stress-related emotions |

### Remaining String Parsing Debts

The following debts remain (not addressed in this batch):

| # | Dependency | Priority | Reason |
|---|------------|----------|--------|
| 5.1 | Memory tag stripping | P1 | Memory structured input not yet implemented |
| 6.1 | ForbiddenTerms regex | P0* | Requires ForbiddenTerms.js changes |
| 7.1 | `附近没有人` sentinel | P1 | Sentinel string changes not yet implemented |
| 7.2 | `没有特别的事情发生` sentinel | P1 | Sentinel string changes not yet implemented |

*Priority is within Narrative Contract Audit only; not a current release blocker.*

### How It Works

When `affectFrame` is provided to `NarrativeBuilder.buildSystemPrompt()`:

1. `_buildCurrentState()` uses `affectFrame.needs` for needs urgency
2. `_buildCurrentState()` uses `affectFrame.emotions` for emotion scene
3. `_buildGuidelines()` uses `affectFrame.valence` for mood detection
4. `_buildGuidelines()` uses `affectFrame.needs` for fatigue detection
5. `_buildGuidelines()` uses `affectFrame.emotions` for stress detection

When `affectFrame` is not provided, the old string parsing paths are used for backward compatibility.

### Design Principle

**Engine owns affect state. LLM owns wording.**

The engine is the single source of truth for *what* a character feels. The LLM decides *how* a character expresses those feelings in natural language.

---

## Appendix: Upstream Source Map

| String producer | File | Method | Consumer in NarrativeBuilder |
|---|---|---|---|
| `NeedsSystem.toPromptString()` | `src/agent/psychology/NeedsSystem.js:247` | Returns `"需求：饱腹极度匮乏，精力不足..."` | Lines 117-123, 272-275 |
| `NeedsSystem.native.toPromptString()` | `src/agent/psychology/NeedsSystem.native.js:130` | Same format as above | Same lines |
| `EmotionVector.toPromptString()` | `src/agent/psychology/EmotionVector.js:582` | Returns `"场景（效价=X, 唤醒=Y）...整体心境：Z。"` | Lines 127-139, 264, 267 |
| `EmotionVector.native.toPromptString()` | `src/agent/psychology/EmotionVector.native.js:248` | Same format as above | Same lines |
| `PersonalMemory.toPromptString()` | `src/agent/memory/PersonalMemory.js:744` | Returns `"记忆中的印象：\n- [cat] content (time)"` | Lines 181-200 |
| `PersonalMemory._timeAgo()` | `src/agent/memory/PersonalMemory.js:996` | Returns `"刚刚"` / `"X小时前"` / `"X天前"` / `"X周前"` | Lines 187-189 (incomplete coverage) |
| `AndyEngineHelpers.buildWorldContext()` | `src/sdk/AndyEngineHelpers.js:127` | Assembles worldContext object with sentinel strings | Lines 50, 54 |
| `ForbiddenTerms.applyForbiddenTerms()` | `src/domain/ForbiddenTerms.js:15` | Regex replacement of domain terms | Line 76 |
