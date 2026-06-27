# v2.5-W2 Implementation Plan: Checker Hardening + Corpus Expansion

> Date: 2026-06-27
> Status: DRAFT
> Prerequisite: v2.5-W1 (evidence-aware grounding) — PASSED

---

## W2 Goals (from user approval)

1. Add `agent_state_leak` checker — detect narrative expressing other agents' AGENT_STATE
2. Add `local_scope_leak` checker — detect narrative mentioning LOCAL events the agent shouldn't know
3. Strengthen `missing_source_attribution` + document regex limitation explicitly
4. Expand corpus to ≥30 entries (boundary ≥5, gate ≥25, gate rate ≥85%, FP ≤1)
5. Document told→"听闻" fallback behavior + add test
6. Document exact severity mapping per violation type

---

## Task Breakdown

### Task 1: agent_state_leak checker

**File**: `src/narrative/FactConsistencyChecker.js`

**What it does**: Detects when LLM output expresses another agent's internal state (location, emotion, needs, activity) without epistemic justification. Per AGENTS.md: "AGENT_STATE 即使是 public scope，在 epistemic reasoning 中也应视为私有知识；其他 agent 需要 direct/observed/told/inferred 证据。"

**Detection logic** (regex-based, matching existing checker style):

1. Extract `selfId` from `grounding.metadata.agentId`
2. Build a set of "justifiable agent names" — agents whose state the narrator can express:
   - `selfId` always justifiable (self-state)
   - Other agents with an EVENT/OBSERVATION fact in `allowedFacts` that includes them as participants/observers AND has `_evidence.source` in `{direct, observed, overheard, told, inferred}` — the narrator saw or was told about them
   - Agents only present via a bare `AGENT_STATE` fact in `allowedFacts` WITHOUT a supporting EVENT/OBSERVATION — NOT justifiable (they're there because of PUBLIC scope, not because the narrator actually knows)
3. Scan text for patterns like `[agent name] + [state expression]`:
   - Location: `Name在/去了/到了/从Location` (reuse claim pattern from `_checkAgentLocationClaims`)
   - Emotion: `Name很/有点/非常[emotion word]` with emotion vocabulary list
   - Needs: `Name饿了/困了/累了/想休息`
   - Activity: `Name正在/在[activity]`
4. For each match where the agent is NOT in the justifiable set → `agent_state_leak` violation

**Key design decisions**:
- Reuse `_checkAgentLocationClaims` pattern for location claims but with stricter epistemic checking
- Emotion vocabulary: small fixed list matching narrative style (`开心/难过/生气/害怕/惊讶/紧张/沮丧/无聊/孤独/兴奋/满足/烦躁/焦虑/疲惫/害羞/尴尬/内疚/失落/感动/愤怒/伤心/心烦/郁闷`)
- Activity vocabulary: `看书/学习/休息/工作/运动/吃饭/聊天/散步/睡觉/跑步/锻炼/做饭/打扫/练琴/画画/写作业/上网/打游戏`
- Needs vocabulary: `饿了/困了/累了/想休息/想吃/想睡/口渴/头疼/不舒服/无聊/寂寞/想找人/想玩`
- Skip common pronouns (大家/别人/对方/朋友/人们/我们/他们) same as `_checkCharacterNames`
- Differentiate from `unsupported_claim`: `unsupported_claim` is about location claims; `agent_state_leak` covers emotional/needs/activity states of other agents that the narrator shouldn't express

**Severity**: `rewrite` (same tier as `unknown_character`/`unknown_location`/`unsupported_claim`)

**Suggestion**: `移除对${agentName}内心状态的表达（你不应该知道对方的状态）`

**Grounding dependency**: Uses `allowedFacts` + `metadata.agentId` — no new grounding fields needed

---

### Task 2: local_scope_leak checker

**File**: `src/narrative/FactConsistencyChecker.js`

**What it does**: Detects when LLM output mentions events that happened at a LOCAL scope where the narrator is not a participant/observer. Per AGENTS.md and `_getForbiddenFacts` logic: "其他区域的本地事件" are forbidden knowledge.

**Detection logic**:

1. Collect "known local events" from `grounding.allowedFacts`:
   - Facts with `scope: 'local'` AND `type: EVENT` where the narrator is a participant or observer
2. Collect "forbidden local events" from the fact store (or a simplified approach):
   - Actually, we don't have access to the full fact store's LOCAL events. The checker only receives `grounding.allowedFacts` and `grounding.forbiddenFacts`.
   - **Simpler approach**: Use `grounding.forbiddenFacts` if available. If a forbidden fact's content appears in the narrative text → `local_scope_leak` violation.
   - If `forbiddenFacts` is not provided (backward compat), this checker is a no-op.

3. For each fact in `grounding.forbiddenFacts`:
   - If `fact.scope === 'local'` AND `fact.type === 'event'`
   - Check if the narrative contains the fact's `description` or key fragments
   - If so → `local_scope_leak` violation

**Key design decisions**:
- This checker requires `forbiddenFacts` in the grounding package (FactProvider already populates it)
- Uses `_textContainsFactContent` helper (already exists from W1)
- Falls back gracefully if `forbiddenFacts` is missing/empty — no violation
- Only checks LOCAL-scope EVENT facts (not MEMORY, which is handled by existing patterns)
- Avoids overlap with `unknown_event`: that checker tests "那次/上次 XX" patterns; this tests against specific forbidden fact descriptions

**Severity**: `rewrite`

**Suggestion**: `移除你不知道的事件"${description}"`

---

### Task 3: Strengthen missing_source_attribution + document regex limitation

**File**: `src/narrative/FactConsistencyChecker.js`

**Changes**:

1. **Expand marker lists**:
   - Add to `toldMarkers`: `'说是'`, `'听讲'`, `'据说'`, `'风闻'`, `'传'` (e.g. "传他考试挂了")
   - Add to `inferredMarkers`: `'看来'`, `'想必'`, `'八成'`, `'十有八九'`, `'按理'`

2. **Document regex limitation** as JSDoc block on `_checkMissingSourceAttribution`:
   ```
   Known limitation: This checker uses reverse full-text marker detection, not per-fact
   attribution tracking. If a told/inferred fact appears in text but the attribution marker
   is on a different sentence, the checker may miss the violation (false negative). Conversely,
   if a told marker appears in text for a different reason, it may suppress a legitimate
   violation (false positive suppression). Per-fact attribution tracking would require
   LLM-side cooperation (structured output), which is out of scope for the current
   regex-based approach.
   ```

3. **No logic changes** — the existing implementation is correct per W1 audit. Only marker expansion and documentation.

---

### Task 4: Corpus expansion to ≥30 entries

**File**: `tests/fixtures/narrative-violations/index.js`

Current: 20 entries. Target: ≥30 entries with ≥5 boundary cases, ≥25 gate cases.

**New entries to add** (10+):

| ID | Category | Type | Description |
|----|----------|------|-------------|
| nv-021 | agent_state_leak | gate | LLM expresses other agent's emotion without evidence |
| nv-022 | agent_state_leak | gate | LLM expresses other agent's needs without evidence |
| nv-023 | local_scope_leak | gate | LLM mentions forbidden local event |
| nv-024 | local_scope_leak | gate | LLM mentions another local event not in allowedFacts |
| nv-025 | agent_state_leak | boundary | LLM expresses other agent's state with told evidence — no violation |
| nv-026 | local_scope_leak | boundary | LLM mentions local event as participant — no violation |
| nv-027 | missing_source_attribution | gate | told fact with expanded marker "据说" — no violation |
| nv-028 | unknown_location | gate | "从咖啡馆出来" pattern |
| nv-029 | unknown_event | gate | "上次聚会" reference |
| nv-030 | new_event | gate | "刚刚下雪了" fabrication |

Also update test thresholds in `tests/unit/narrative-violation-corpus.test.js`:
- Corpus minimum: 20 → 30
- Category coverage: 7 → 9 (add agent_state_leak, local_scope_leak)
- Boundary minimum: 3 → 5
- Gate rate threshold: 85% (unchanged)

---

### Task 5: told fallback "听闻" documentation + test

**File**: `src/narrative/FactFormatter.js` — add JSDoc to `toNaturalLanguageWithSource`

**Documentation** (as JSDoc on the `told` case):
```
When a told-level fact has no propagatedFrom (the informer's identity is unknown),
the formatter falls back to generic "听闻" annotation instead of "XX告诉你".
This is by design: without a known source, fabricating an informer name would be
worse than the imprecise "听闻" label. The fallback is consistent with the
checker's toldMarkers which include "听说" as a valid attribution.
```

**Test** (in `tests/unit/narrative/fact-consistency-checker.test.js`):
- Add test: told fact with `propagatedFrom: null` → `FactFormatter.toNaturalLanguageWithSource` returns `${base}（听闻）`
- Add test: checker accepts "听说" as valid attribution for told-without-propagatedFrom

---

### Task 6: Severity mapping documentation + test alignment

**File**: `src/narrative/FactConsistencyChecker.js` — add JSDoc to `_computeSeverity`

**Documented severity mapping**:
```
Severity tiers (highest → lowest priority):
  reject              — new_event, new_relationship
  rewrite             — unknown_character, unknown_location, unsupported_claim,
                        agent_state_leak, local_scope_leak
  warning             — missing_source_attribution
  degrade_to_template — time_conflict, unknown_event
  pass                — no violations
```

Note: `unknown_event` moves from implicit to explicit `degrade_to_template` tier.
Currently unknown_event isn't explicitly listed in _computeSeverity, so it falls through
to the final `degrade_to_template` return. This is correct behavior but should be
explicitly documented.

**Test alignment**: Add test for `agent_state_leak` → `rewrite` severity and `local_scope_leak` → `rewrite` severity in the 4-layer severity test section.

---

## Execution Order

1. **Task 1** + **Task 2**: New checkers (can be done in parallel — they're independent)
2. **Task 3**: Strengthen existing checker (independent)
3. **Task 5**: Fallback documentation (independent)
4. **Task 6**: Severity documentation (depends on Tasks 1+2 for new violation types)
5. **Task 4**: Corpus expansion (depends on Tasks 1+2+3 for new checker categories)
6. **Task 7**: Full validation suite + unified commit

## Acceptance Criteria (from user approval)

- [ ] `agent_state_leak` checker implemented with unit tests
- [ ] `local_scope_leak` checker implemented with unit tests
- [ ] `missing_source_attribution` marker list expanded + regex limitation documented
- [ ] Corpus ≥30 entries, boundary ≥5, gate ≥25, gate rate ≥85%, FP ≤1
- [ ] told→"听闻" fallback documented + tested
- [ ] Severity mapping documented per violation type
- [ ] All 6 validation commands pass: `npm test`, `npm run test:domain`, `npm run check:boundaries`, `npm run smoke:pack`, `npm run perf:check`, `git diff --check`
- [ ] Single unified commit after all tasks complete

## Boundaries (from user approval)

- No changes to FactProvider / NarrativeBuilder beyond W1
- No changes to KnowledgeStore
- Checker changes are additive only (no breaking changes to existing checker behavior)
- Corpus is additive only (no deletion of W1 entries)
- No npm publish
