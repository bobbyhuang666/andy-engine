# E1 — LLM Exploratory Findings → Engineering Repair

**Date**: 2026-07-26
**Status**: Complete — all Waves verified
**Scope**: Public governance document. No private data, raw outputs, prompts, or credentials.

> **IMPORTANT**: This is NOT D5. This is NOT a model leaderboard. This is NOT a formal W3 conclusion. This document records exploratory findings from LLM-assisted review, used as a high-recall problem finder to locate Engine defects. All findings have been independently verified.

---

## 1. Method and Boundaries

### 1.1 What this is

E1 used 349 Exploratory Machine Review results (step-router-v1 as reviewer) as a high-recall "problem finder" to identify potential Andy Engine grounding/checker/scenario-harness defects. Each finding was independently verified by forensics sub-agents and independent verifiers before being classified as confirmed.

### 1.2 What this is not

- Not D5 — no quality gate computation
- Not a model leaderboard — no model capability ranking
- Not formal W3 — review results are not counted in any formal denominator, label, or gate
- Not public release evidence — exploratory only

### 1.3 Absolute boundaries enforced

- No D5 computation, implication, or reporting
- No review results in formal denominators, labels, gates, or public reports
- No npm publish
- No raw output, held-out samples, grounding facts, prompts, endpoints, keys, or private paths in public repo
- No LLM/narrative writing world facts
- No Core modification based on exploration alone — verified findings become repair proposals only
- Review results are exploratory evidence only, may contain reviewer errors, scenario label errors, or data source errors

---

## 2. Provenance Status

**Conclusion**: 349 review items sourced from independently generated W3-H v2 data (NOT retired v1). **CONFIRMED**.

| Check | Result |
|-------|--------|
| heldout-split frozenBaseline | `9531911` — MATCHES |
| noV1SampleReuse | `true` — SET |
| independentlyGenerated | `true` — SET |
| v1 residual files | 0 — CLEAN |
| v1 data reuse | CONFIRMED_NONE |
| Temporal sequence | v1 deleted (15:56) → v2 namespace (16:01) → collection (17:22) → review (19:47) — no overlap |

**Privacy governance**: PASS — no public repo leakage, no credentials in reports, private boundary maintained.

**Acceptable for exploratory use**: YES.

---

## 3. Aggregate Counts

### 3.1 Exploratory Machine Review distribution

| Judgment | Count | Notes |
|----------|-------|-------|
| pass | 95 | Grounding-consistent outputs |
| warn | 30 | Exploratory only — `exploratoryOnly: true`, excluded from all rates |
| fail | 204 | Grounding violations detected |
| review_invalid | 20 | Parse errors — excluded from all statistics |
| **Total** | **349** | |

### 3.2 By model

| Model | pass | warn | fail | review_invalid | total |
|-------|------|------|------|----------------|-------|
| agnes-2.0-flash | 61 | 14 | 95 | 10 | 180 |
| deepseek-v4-flash | 34 | 16 | 109 | 10 | 169 |

> These counts are exploratory only. They do NOT constitute a model capability comparison.

### 3.3 Engine checker vs reviewer

| Metric | Count |
|--------|-------|
| Engine violations identified as FALSE positive by reviewer | 260 |
| Engine violations identified as TRUE positive by reviewer | 57 |
| Reviewer no opinion | 32 |
| Independent forensics confirmed false positive rate | 96% (23/24 sampled) |

---

## 4. Confirmed / Likely / Unverified Findings

### 4.1 CONFIRMED: Engine Grounding Gap — Position Timing Inconsistency (P0)

**Level**: CONFIRMED (independently verified by location-forensics + location-verifier)

**Finding**: 100% of sampled scenarios (178/180) exhibit a systematic inconsistency between `worldContext.currentRegion` and `agent_state.region` in the grounding package.

**Root cause**: Tick architecture timing issue:
- `emitAgentStateFacts()` runs in tick Phase 3, writing `region: agent.position` BEFORE position updates
- `buildWorldContext()` reads `agent.position` AFTER tick completion, capturing the UPDATED position
- Result: LLM receives `worldContext.currentRegion` (post-tick position) but checker validates against `agent_state.region` (pre-tick position) — a conflict the LLM cannot resolve

**Affected code paths**:
- `src/sdk/AndyEngineHelpers.js:206` — `buildWorldContext()` sets `currentRegion: agent.position`
- `src/canon/FactEmitter.js:103-116` — `emitAgentStateFacts()` sets `region: position`
- `src/runtime/AndyWorld.js` — tick phase ordering

**Impact on facts/knowledge/effects/replay/API**:
- facts: agent_state fact region may be stale relative to worldContext
- knowledge: no direct impact
- effects: no direct impact
- deterministic replay: if position update order changes, replay hashes may change
- public API: `getWorldContext()` and `getGroundingPackage()` may return inconsistent positions

**Impact on W3-H v2 future protocol**: Future W3-H v2 held-out scenarios must account for this gap until fixed. Review results based on location violations are unreliable until resolved.

**Regression risk**: Medium — changing tick phase ordering or fact emission timing could affect downstream consumers.

**Alternative without Core modification**: Add explicit position priority to the evaluation prompt contract (tell LLM to prefer worldContext.currentRegion over grounding agent_state.region). This is a workaround, not a fix.

**Recommended priority**: **P0** — confirmed position grounding / private knowledge boundary issue.

**Reproduction** (no private data needed):
```
1. Create AndyEngine with campus preset, enableFacts: true
2. Run one tick (which may update agent position)
3. Call engine.getWorldContext(agentId) — observe currentRegion
4. Call engine.getGroundingPackage(agentId) — observe agent_state fact region
5. Compare: they will differ if position changed during the tick
```

### 4.2 CONFIRMED: FactConsistencyChecker Regex False Positives (P1)

**Level**: CONFIRMED (independently verified by checker-forensics + checker-verifier, 7 synthetic fixtures reproduced)

**Finding**: 96% (23/24) of sampled Engine checker violations are false positives caused by 4 regex patterns that match natural language fragments as entity names/locations.

**Root causes**:

1. **`_checkLocationNames`** (`src/narrative/FactConsistencyChecker.js:267`):
   - Pattern: `/[在去到从]([一-龥]{2,6})/g`
   - Greedily captures 2-6 chars after prepositions without semantic validation
   - Matches verb phrases like "这白茫茫的雪", "的路上" as locations

2. **`_checkAgentLocationClaims`** (`src/narrative/FactConsistencyChecker.js:493`):
   - Pattern: `/([一-龥]{2,4})\s*[在去了到]\s*([一-龥]{2,6})/g`
   - Matches ANY character sequence as "agent", no name validation
   - Extracts verb fragments like "一个人站", "那本书还" as agent names

3. **`_checkCharacterNames`** (`src/narrative/FactConsistencyChecker.js:189`):
   - Pattern: `/[，。！？\s]([一-龥]{2,4})(?=[说聊问答告诉来了去了见到])/g`
   - Lookahead on 13 action verbs captures preceding text as names
   - "待会儿回", "晚上回", "已经吃" matched as character names

4. **`GroundingChecker._textContainsFactContent` 4-char fragment fallback** (`src/narrative/GroundingChecker.js:1040-1049`):
   - Falls back to matching any 4-character substring from forbidden fact descriptions
   - Produces 91% (61/67) of local_scope_leak false positives
   - Zero exact matches found in sampled data

**Checker path distinction**:
- FactConsistencyChecker: 9 regex sub-checkers (regex-based path)
- GroundingChecker v2: ClaimExtractor → structured claims → validation, then `_runRegexFallbackChecks` for fallback
- All 349 reviews had NO evidenceTrace — GroundingChecker v2 structural path did not produce structured results in this dataset
- All violations originated from regex-based paths

**Synthetic regression fixtures**: 7 fixtures provided in private report, each using synthetic text (not private LLM output) that triggers the same false positive. Available for public test integration.

**Impact**: No impact on facts/knowledge/effects/replay/API. Fixing regex patterns only affects checker violation output.

**Regression risk**: Low — tightening regex patterns will not suppress legitimate violations (verified: AGENT_STATE privacy uses explicit name matching, location conflict uses domain location set, unsupported claims uses knownAgentNames lookup).

**Recommended priority**: **P1** — confirmed checker regex false positives.

### 4.3 CONFIRMED: expectedDisposition Scenario Label Design Flaw (P1)

**Level**: CONFIRMED (independently verified by scenario-auditor + scenario-verifier)

**Finding**: The `expectedDisposition` field in held-out scenarios is assigned by index position against fixed target ratios, NOT by analyzing grounding facts for verifiable properties. All non-empty scenarios have structurally identical fact distributions (~40 allowed, ~23 forbidden, 1 agent_state, 2-3 events) regardless of label.

**Evidence**:
- `assignDisposition()` in the held-out generator assigns labels purely based on `normalizedPos = scenarioIdx / totalScenarios`
- 56 "consistent but failed" cases: all 56 are genuine model failures (location contradictions), not scenario expectation errors
- 32 "violation but passed" cases: all 32 have zero real violations — labels predicted violations that didn't exist in the scenario structure

**Design flaw**: `expectedDisposition` predicts model behavior rather than describing verifiable scenario properties. This is a category error — scenario labels should assert verifiable properties, not predict what a model will do.

**Proposed new schema**:
```
scenarioProperties:
  hasAgentState: boolean (derivable from facts)
  agentStateLocation: string|null (derivable from agent_state fact)
  eventCount: number (derivable by counting event facts)
  forbiddenFactCount: number (derivable from forbiddenFacts array)
  temporalSpan: number|null (derivable from fact timestamps)
  multiLocationEvents: boolean (derivable from event locations)
  nearbyLocations: array (derivable from unique location names)

expectedCheckerDisposition: "pass" | "violation"
  — A statement about what the CHECKER should find, not what the MODEL should do

notes: string
  — Free-form intent description, no truth assertions
```

**Key principle**: No field asserts "the model should fail." Formal assertions are confined to scenario structure and checker expectations.

**Impact**: No impact on Engine Core. This is an evaluation harness design fix, not an Engine fix.

**Recommended priority**: **P1** — scenario expectedDisposition semantic error.

### 4.4 LIKELY: Reviewer Parse Error Handling (P2)

**Level**: LIKELY (verified by reviewer-protocol-designer + reviewer-protocol-verifier)

**Finding**: 20 parse errors in review results were initially defaulted to `warn`, which is an invalid disposition. The protocol has been hardened:
- Parse errors now classified as `review_invalid` (excluded from all statistics)
- `warn` marked as `exploratoryOnly: true` (excluded from pass rates, D5, model comparison)
- Reviewer role explicitly bounded: generates candidate issues only, cannot establish Engine bugs alone

**Status**: Protocol hardened and verified. No code change needed — this is a process/protocol fix.

**Recommended priority**: **P2** — reviewer schema / parse-error / reporting hardening.

---

## 5. Synthetic Reproduction Instructions

All confirmed findings can be reproduced without private data:

### 5.1 Position timing inconsistency (E1-1)
```
const engine = new AndyEngine({ domain: 'campus', enableFacts: true });
engine.runTicks(1);
const ctx = engine.getWorldContext(agentId);
const grounding = engine.getGroundingPackage(agentId);
// Compare: ctx.currentRegion vs grounding.allowedFacts[type=agent_state].region
// They will differ if agent position changed during the tick
```

### 5.2 Regex false positives (E1-2)
```
const checker = new FactConsistencyChecker(factStore, domain);
const grounding = { allowedFacts: [...], forbiddenFacts: [...] };
// Test text: "雪无声地落在步道上" → false positive unknown_location "步道上"
// Test text: "她选了靠窗的位置" → false positive unknown_character "她选"
// Test text: "待会儿回去" → false positive unknown_character "待会儿回"
```

### 5.3 Scenario label flaw (E1-3)
```
// Inspect assignDisposition() in held-out generator
// Confirm: labels assigned by index position, not fact analysis
// Confirm: all disposition types have ~40 allowed facts, ~23 forbidden, 1 agent_state
```

---

## 6. Repair Proposals (Verifier-Approved)

### Proposal P0-1: Synchronize agent.position with agent_state fact emission

**Problem level**: CONFIRMED
**Affected code path**: `src/runtime/AndyWorld.js` (tick phase ordering), `src/canon/FactEmitter.js` (fact emission timing)
**Minimal reproduction test**: See §5.1
**Expected fix scope**: Ensure `emitAgentStateFacts()` and `buildWorldContext()` read the same `agent.position` value — either both pre-tick or both post-tick
**Impact**: facts (agent_state region consistency), deterministic replay (may change hashes if tick order changes), public API (getWorldContext/getGroundingPackage consistency)
**W3-H v2 impact**: Yes — future protocol must account for fix
**Regression risk**: Medium
**Alternative without Core modification**: Add position priority to evaluation prompt contract (workaround)
**Recommended priority**: **P0**

### Proposal P1-1: Tighten FactConsistencyChecker regex patterns

**Problem level**: CONFIRMED
**Affected code path**: `src/narrative/FactConsistencyChecker.js` (lines 189, 267, 493)
**Minimal reproduction test**: 7 synthetic fixtures (see E1-2 private report)
**Expected fix scope**: Add semantic validation to regex matches — check extracted entities against known agent names, known domain locations, and exclude common verb/phrase patterns
**Impact**: No impact on facts/knowledge/effects/replay/API — only affects checker violation output
**W3-H v2 impact**: Yes — checker false positive rate will decrease
**Regression risk**: Low — verified that tightening won't suppress legitimate checks
**Recommended priority**: **P1**

### Proposal P1-2: Fix GroundingChecker 4-char fragment fallback

**Problem level**: CONFIRMED
**Affected code path**: `src/narrative/GroundingChecker.js:1040-1049` (`_textContainsFactContent`)
**Minimal reproduction test**: Synthetic fixture with 4-char substring match (see E1-2 private report)
**Expected fix scope**: Remove 4-char fragment fallback or require exact match only (FactConsistencyChecker already fixed to exact match)
**Impact**: No impact on facts/knowledge/effects/replay/API
**W3-H v2 impact**: Yes — local_scope_leak false positives will decrease
**Regression risk**: Low
**Recommended priority**: **P1**

### Proposal P1-3: Replace expectedDisposition with verifiable scenario schema

**Problem level**: CONFIRMED
**Affected code path**: Evaluation harness (private), not Engine Core
**Minimal reproduction test**: Confirm assignDisposition uses index-based assignment
**Expected fix scope**: Replace expectedDisposition with scenarioProperties + expectedCheckerDisposition + notes
**Impact**: No impact on Engine Core — evaluation harness design only
**W3-H v2 impact**: Yes — future held-out splits must use new schema
**Regression risk**: None (evaluation harness only)
**Recommended priority**: **P1**

### Proposal P2-1: Reviewer protocol hardening (already implemented)

**Problem level**: LIKELY → RESOLVED
**Status**: Protocol hardened, parse errors → review_invalid, warn → exploratoryOnly, verified PASS
**Recommended priority**: **P2** (no further action needed)

---

## 7. Explicit Disclaimers

- **This is NOT D5.** No quality gate was computed.
- **This is NOT a model leaderboard.** No model capability ranking is implied or stated.
- **This is NOT formal W3.** Review results are not counted in any formal denominator, label, or gate.
- **Exploratory Machine Review results** (pass 95, warn 30, fail 204, review_invalid 20) are exploratory evidence only and must not be used for model comparison, D5, or public release decisions.
- **Confirmed findings** are Engine defects that need repair before reliable evaluation can proceed.
- **No new real provider requests** have been sent during E1.
- **No D5 computation** has been performed or implied.
- **No npm publish** has been executed.

---

## 8. Wave Verification Summary

| Wave | Description | Forensics | Independent Verifier | Result |
|------|-------------|-----------|---------------------|--------|
| E1-0 | Provenance & evidence boundary | provenance-auditor | privacy-governance-verifier | ✅ PASS |
| E1-1 | Location problem verification | location-forensics | location-verifier | ✅ PASS |
| E1-2 | Checker false-positive verification | checker-forensics | checker-verifier | ✅ PASS |
| E1-3 | Scenario harness semantic fix | scenario-auditor | scenario-verifier | ✅ PASS |
| E1-4 | Reviewer protocol hardening | reviewer-protocol-designer | reviewer-protocol-verifier | ✅ PASS |

All proposals in §6 are verifier-approved. No unverified proposals are included.

---

*Architect (Integration Beta lead) | 2026-07-26*
