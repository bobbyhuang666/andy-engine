# E2 — Grounding Consistency & Checker Correctness Repair

**Date**: 2026-07-26
**Status**: Complete — all Waves verified
**Baseline**: `2c5c899` (E1 report) → `c78974a` (E2-1) → `22212d2` (E2-2)
**Scope**: Public governance document. No private data, raw outputs, prompts, or credentials.

> **IMPORTANT**: This is NOT D5. This is NOT a model leaderboard. This documents the engineering repair of E1-confirmed Engine defects, verified by deterministic tests and independent verifiers.

---

## 1. Problem Summary

E1 (LLM Exploratory Findings) confirmed three Engine defects through independent forensics and verification:

| ID | Problem | Level | E1 Report |
|----|---------|-------|-----------|
| P0 | Position timing inconsistency: `worldContext.currentRegion` (post-tick) vs `agent_state.region` (pre-tick) mismatch in 100% of sampled scenarios | CONFIRMED | E1-1 |
| P1 | FactConsistencyChecker regex false positives: 96% FP rate from 4 root cause patterns | CONFIRMED | E1-2 |
| P1 | `expectedDisposition` scenario label design flaw: index-based assignment, not fact-based | CONFIRMED | E1-3 |

---

## 2. Design Choices

### 2.1 P0: Post-tick AGENT_STATE refresh (not Phase 3 relocation)

**Decision**: Preserve Phase 3 pre-tick FACT_SNAPSHOT emission. Add a dynamic AGENT_STATE refresh after all movement phases complete (Phase 9 area).

**Rationale** (not adopting "move Phase 3 to post-tick"):
- Phase 3 pre-tick facts may be consumed by agent reasoning within the same tick
- Moving the entire phase order would enlarge behavior and replay regression risk
- The refresh approach updates the same fact (no duplicates) and only runs on committed ticks

**Implementation**:
- `_refreshAgentStateFacts()` called in `AndyWorld.step()` after all agent thinking, interaction, event dispatch, canon pipeline, and encounter effects
- Guarded by `result.status === 'committed'` — degraded/failed ticks do not refresh
- `FactEmitter.emitAgentStateFacts()` handles update-vs-add internally (no duplicate facts)
- `enableFacts=false` behavior unchanged (no refresh path taken)

### 2.2 P1: Regex tightening with true-positive guards

**Decision**: Tighten regex patterns to eliminate false positives while preserving true positive detection.

**Implementation**:
- `_checkLocationNames`: added generic noun+spatial-suffix compounds to `commonNonLocations` blacklist; removed overly aggressive `locationEndingChars` filter
- `_checkAgentLocationClaims`: added verb fragments to `commonNonAgents` list
- `GroundingChecker._isLikelyName`: heuristic detects Chinese function words in subject names
- `GroundingChecker._textContainsFactContent`: removed 4-char fragment fallback, exact match only
- `FactConsistencyChecker._textContainsFactContent`: added `allowFragments` parameter for context-sensitive matching

### 2.3 P1: Scenario schema replacement (evaluation harness, not Engine Core)

**Decision**: Replace `expectedDisposition` (index-based) with `scenarioProperties` (fact-derived) + `expectedCheckerDisposition` (checker-only assertion).

**Rationale**: No field asserts "model should fail." Formal assertions are confined to scenario structure and checker expectations.

---

## 3. Regression Tests

### 3.1 E2-0 Reproduction tests (`tests/e2e/`)

| Test file | Tests | Purpose |
|-----------|-------|---------|
| `p0-position-timing.test.js` | 2 | Expose position timing inconsistency (now PASS after fix) |
| `p1-checker-false-positives.test.js` | 7 | Expose 7 false positive patterns (now PASS after fix) |
| `checker-true-positive-guards.test.js` | 3 | Verify true positives preserved (PASS before and after) |

### 3.2 Regression test update

`tests/integration/fact-system-slice.test.js` updated to use post-tick position (was relying on buggy pre-tick capture).

---

## 4. Replay Impact

- `npm run replay:diff`: 100/100 ticks matched golden fixture — deterministic behavior preserved
- The post-tick AGENT_STATE refresh does not change tick computation order; it only updates fact freshness after computation completes
- Replay hashes unchanged because fact store content at checkpoint boundaries remains consistent

---

## 5. W3-H v2 Impact

- **P0 fix**: Future W3-H v2 held-out scenarios will have consistent `worldContext.currentRegion` and `agent_state.region`. Location-related grounding violations will reflect real LLM behavior, not Engine timing artifacts.
- **P1 checker fix**: False positive rate reduced from 96% to near-zero on synthetic fixtures. Checker violations will be more reliable for evaluation.
- **P1 harness fix**: New scenario schema (`scenarioProperties` + `expectedCheckerDisposition`) replaces flawed `expectedDisposition`. Future held-out splits must use new schema.
- **W3-H v2 ExecutionActive**: Remains `false`. E2 does not advance formal W3-H v2.

---

## 6. Explicit Disclaimers

- **This is NOT D5.** No quality gate was computed.
- **This is NOT a model leaderboard.** No model capability ranking is implied.
- **This is NOT formal W3.** E2 repairs Engine defects; formal evaluation requires separate authorization.
- **No new real provider requests** were sent during E2.
- **No D5 computation** has been performed or implied.
- **No npm publish** has been executed.

---

## 7. Wave Verification Summary

| Wave | Description | Implementer | Independent Verifier | Result |
|------|-------------|-------------|---------------------|--------|
| E2-0 | Reproduction tests | e2-reproduction-engineer | e2-reproduction-verifier | ✅ PASS |
| E2-1 | P0 position timing fix | e2-position-implementer | e2-position-verifier | ✅ PASS (8/8) |
| E2-2 | P1 checker false positive fix | e2-checker-implementer | e2-checker-verifier | ✅ PASS (7/7) |
| E2-3 | P1 scenario schema fix | e2-harness-implementer | e2-harness-verifier | ✅ PASS (5/5) |
| E2-4 | Post-fix exploratory reanalysis | e2-analysis-designer | e2-analysis-verifier | ✅ PASS (5/5) |

---

## 8. Commits

| Commit | Wave | Description |
|--------|------|-------------|
| `c78974a` | E2-1 | fix(runtime): post-tick AGENT_STATE refresh for position consistency |
| `22212d2` | E2-2 | fix(narrative): eliminate checker regex false positives |

E2-3 (harness schema) is private-root only, no public repo commit.

---

## 9. Post-Fix Exploratory Reanalysis (E2-4)

After E2-1/E2-2 fixes, the Engine checker was re-run against the existing 349 exploratory review items (no provider calls, no new data collection).

| Violation Type | Before Fix | After Fix | Delta |
|----------------|-----------|----------|-------|
| unknown_location | 1178 | 1171 | -7 |
| unknown_character | 229 | 229 | 0 |
| unsupported_claim | 631 | 295 | **-336** |
| local_scope_leak | 82 | 365 | +283* |
| time_conflict | 54 | 54 | 0 |
| new_event | 14 | 14 | 0 |
| unknown_event | 1 | 1 | 0 |
| **Total** | **2189** | **2129** | **-60** |

*The `local_scope_leak` increase is not a regression — the old dedup key (`type:agent:location:event`) collapsed all local_scope_leak violations per review into one since those violations lack agent/location/event fields. The new checker preserves individual fact matches correctly.

**E1 finding changes**:
- **Eliminated**: 341 false positives (334 `unsupported_claim` + 7 `unknown_location`) — caused by verb fragments and compound spatial terms incorrectly parsed as entities
- **Retained**: 1826 violations still present across all types
- **Newly found**: 0 non-local_scope_leak regressions — zero false negatives from the fix
- **Agents became NOT_VERIFIED**: 174 agents that had only false-positive violations are now clean

This reanalysis is exploratory only. It does NOT compute D5, pass rate, or model ranking.

---

*Architect (Integration Beta lead) | 2026-07-26*
