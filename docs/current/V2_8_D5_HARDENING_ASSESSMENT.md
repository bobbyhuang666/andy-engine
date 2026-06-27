# v2.8 D5 Narrative Faithfulness Hardening Assessment

> Generated: 2026-06-28 | Commit: `b6bf50a` (v2.7 baseline)
> Phase: D5 Assessment — honest evaluation, no forced Pass

---

## 1. Assessment Summary

**D5 Grounded Narrative Faithfulness: Warning (unchanged)**

D5 cannot be honestly upgraded to Pass in this phase. The current checker is 100% regex-based, the corpus is hand-crafted for its own trigger patterns, and there is no semantic analysis capability. A truthful Warning is better than a decorative Pass.

This assessment documents the current limitations, quantifies them, and provides a hardening roadmap for when D5 must reach Pass (required for Stable release, not required for Foundation Alpha).

---

## 2. Current D5 Judgment Logic

**File**: `scripts/aliveness-report.js`, lines 153-158

```js
// D5: corpus 已建（W8），检出率测试 pass 即 Warning（不达语义完备但 Gap 已消除）
if (dim.id === 'D5') {
  const corpusStatus = findFileStatus(testParsed, 'narrative-violation-corpus');
  if (corpusStatus === 'pass') return 'Warning';
  return 'Gap';
}
```

**Finding**: D5 has exactly two exit paths — `Warning` or `Gap`. There is **no code path that returns `Pass`**. This is by design.

The V2.5 RFC (Section 5.3) documents a planned upgrade path requiring both `narrative-violation-corpus` and `grounded-narrative-e2e` tests to pass. That upgrade has not been implemented.

---

## 3. FactConsistencyChecker Inventory

**File**: `src/narrative/FactConsistencyChecker.js`

### 9 Sub-Checkers — All Regex/String-Based

| # | Method | Violation Type | Mechanism |
|---|---|---|---|
| 1 | `_checkCharacterNames` | `unknown_character` | Regex: `/[，。！？\s]([一-龥]{2,4})(?=[说聊问答告诉来了去了见到])/g` |
| 2 | `_checkLocationNames` | `unknown_location` | Regex: `/[在去到从]([一-龥]{2,6})/g` |
| 3 | `_checkEventKnowledge` | `unknown_event` | Regex: `/那次(.{2,20})/g`, `/上次(.{2,20})/g` |
| 4 | `_checkTimeConflicts` | `time_conflict` | String `.includes()` for time words + hour comparison |
| 5 | `_checkNewContent` | `new_relationship`, `new_event` | Regex for relationship/event claim patterns |
| 6 | `_checkAgentLocationClaims` | `unsupported_claim` | Regex for "name 在/去/了 location" patterns |
| 7 | `_checkMissingSourceAttribution` | `missing_source_attribution` | Reverse text scan for told/inferred markers |
| 8 | `_checkAgentStateLeak` | `agent_state_leak` | Regex with hardcoded emotion/needs/activity word lists |
| 9 | `_checkLocalScopeLeak` | `local_scope_leak` | Substring/partial-match against `forbiddenFacts` |

**Key limitations**:
- All Chinese-language detection uses hardcoded character ranges (`[一-龥]`) and fixed word lists
- No NLP parsing, no dependency analysis, no coreference resolution
- No semantic equivalence detection (e.g., "Ming" vs "小明" are treated as different names — corpus entry nv-020 documents this blind spot)
- File header acknowledges: "未来可升级为基于 KnowledgeStore 的精确校验"

---

## 4. Corpus Realism Assessment

**File**: `tests/fixtures/narrative-violations/index.js`

### Corpus Statistics

| Metric | Value |
|---|---|
| Total entries | 35 (nv-001 through nv-035) |
| Violation categories | 9 |
| Gate cases (violation expected) | 24 |
| Pass cases (no violation expected) | 6 |
| Boundary cases (`may_detect: false`) | 5 |
| Detection rate on gate cases | 100% |

### Category Distribution

| Category | Count | IDs |
|---|---|---|
| `unknown_character` | 4 | nv-001, nv-002, nv-003, nv-020 |
| `unknown_location` | 3 | nv-004, nv-005, nv-029 |
| `unknown_event` | 2 | nv-006, nv-007 |
| `time_conflict` | 2 | nv-008, nv-009 |
| `new_relationship` | 1 | nv-010 |
| `new_event` | 2 | nv-011, nv-030 |
| `missing_source_attribution` | 5 | nv-012, nv-013, nv-018, nv-019, nv-028 |
| `agent_state_leak` | 7 | nv-021, nv-022, nv-023, nv-031, nv-032, nv-033, nv-035 |
| `local_scope_leak` | 3 | nv-024, nv-025, nv-027 |
| `pass` (no violation) | 6 | nv-014, nv-015, nv-016, nv-017, nv-026, nv-034 |

### Realism Verdict

**The corpus is hand-crafted for regex trigger patterns, not representative of real LLM output.**

Evidence:
1. The corpus header explicitly states: "每条样本的 llmOutput 严格对齐 checker 的 regex 触发条件"
2. 100% gate detection rate proves regex works on its own trigger patterns, not that it catches real hallucinations
3. No entries contain paraphrased or indirect violations that a regex would miss but a semantic checker would catch
4. The `pass` category entries are clean text that avoids all regex triggers — they don't test for false positives under adversarial conditions
5. Boundary cases like nv-020 (English vs Chinese name) demonstrate known blind spots but are marked `may_detect: false` rather than driving improvement

### False Positive / False Negative Limitations

| Metric | Current Status | Concern |
|---|---|---|
| False positive rate on corpus | 0/6 pass cases | **Not measured** on real LLM output — only measured on hand-crafted clean text |
| False negative rate on corpus | 0/24 gate cases (100%) | **Only reflects regex trigger alignment** — real LLM hallucinations use different patterns |
| Semantic false negatives | **Not measured** | Paraphrased claims, indirect references, and non-Chinese text are invisible to current checker |
| Cross-lingual coverage | None | All patterns assume Chinese output |

---

## 5. Claim Extraction Design Options

### Assessment (Not Implementation)

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Enhanced regex rule engine | Deterministic, local, fast | Still brittle; doesn't solve semantic gap | Acceptable only as incremental improvement |
| Structured claim extraction without external LLM | Deterministic, testable, no external deps | Limited coverage; complex to build | Good medium-term path for v2.8-v2.9 |
| LLM-in-the-loop checker | Semantic, catches paraphrases | Nondeterministic, external dependency, cost | Not for unattended alpha gate |
| Embedding similarity | Catches paraphrases, quantitative | External dependency, determinism concerns | Defer unless already available |

### Recommended Path for D5 Pass

The most realistic path to D5 Pass without external dependencies:

1. **Structured claim extraction** — Parse narrative output into atomic claims (who/what/where/when)
2. **KnowledgeStore-grounded validation** — Compare each claim against the agent's known facts
3. **Evidence-based rejection** — Reject claims that have no evidence in the grounding package
4. **Deterministic testing** — Create corpus entries with indirect/paraphrased violations that current regex misses

This would make D5 semantically meaningful while remaining deterministic and locally testable.

---

## 6. D5 Pass Rule Verification

For D5 to be marked Pass, **all** of the following must be true:

| Criterion | Current Status | Required for Pass |
|---|---|---|
| Aliveness-report has a real Pass path with explicit criteria | ❌ Only Warning/Gap | Must add Pass path with codified criteria |
| Criteria include more than regex matching hand-built corpus | ❌ 100% regex | Must include semantic or structural validation |
| Meaningful sample of realistic narrative outputs | ❌ Hand-crafted only | Must include real or realistic LLM-generated outputs |
| False positives and false negatives both measured | ❌ Only measured on hand-crafted data | Must measure on representative sample |
| Auditor can reproduce from commands | ✅ `npm test` | Must remain reproducible |

**Verdict**: 0/5 criteria met. D5 cannot reach Pass without substantial checker architecture work.

---

## 7. D5 Status Decision

**D5 remains Warning.**

| Rationale | Detail |
|---|---|
| Truthful assessment | The checker is regex-based and experimental; Warning honestly describes its capability |
| No false Pass | No Pass path exists in code; no amount of corpus tweaking can create one |
| Acceptable for Foundation Alpha | D5 Warning is documented in README, CHANGELOG, and this report |
| Required for Stable | D5 must reach Pass before any Stable release claim |
| Hardening roadmap exists | V2.5 RFC and Grounding Checker v2 RFC outline the architecture |

---

## 8. Existing Architecture Documentation

| Document | Location | Status |
|---|---|---|
| V2.5 Grounded Narrative Faithfulness RFC | `docs/rfc/V2_5_GROUNDED_NARRATIVE_FAITHFULNESS_RFC.md` | RFC only, structured claim extraction deferred to v2.6+ |
| Grounding Checker v2 RFC | `docs/rfc/GROUNDING_CHECKER_V2_RFC.md` | Stage 42 — RFC only, not implemented |
| v2.5-W2 Checker Hardening Plan | `docs/superpowers/plans/2026-06-27-v25-w2-checker-hardening-corpus-expansion.md` | DRAFT, additive regex improvements |

---

## 9. v2.8 Pass Criteria

| Criterion | Required | Status |
|---|---|---|
| D5 hardening assessment exists | yes | ✅ This report |
| Current D5 status is honestly justified | yes | ✅ Warning with full rationale |
| No false D5 Pass | yes | ✅ No Pass path exists |
| No D5 code changes that break corpus/checker tests | N/A (no code changes) | ✅ |
| Stable boundaries unchanged | yes | ✅ No schema/API changes |

**v2.8 is complete.** D5 remains Warning with documented justification and a hardening roadmap.
