# W3-H v6 Formal Evaluation Report

**Status:** Complete (aggregate-only public report)
**Epoch:** W3-H-v6
**Date:** 2026-07-27
**Scope:** Grounded-narrative faithfulness (D5) for two Owner-approved subject
models against a frozen 180-scenario evaluation matrix, using the v7
structured assertion reviewer.

> The models used in this evaluation are controlled aliases, not immutable
> pinned snapshots. The provider may update model weights during the
> evaluation epoch. `requestedModelId` and raw `returnedModelId` are recorded
> per attempt. `canonicalModelId` is derived from the requested-model mapping.
> Identity fingerprints are checked on every response. Provider model-field
> anomalies are reported as metadata quality, not as model identity. Results
> are epoch-bound and must not be interpreted as reproducible across different
> model weight versions.

This report presents the first W3-H evaluation with a construct-valid D5
measure. The W3-H v5 D5 was invalidated due to a reviewer contract construct
error (surface-string heuristics producing both false positives and false
negatives). W3-H v6 uses a new v7 structured assertion reviewer that verifies
grounding via assertion tuple matching rather than surface string matching.

---

## 1. Method

### 1.1 Frozen protocol

W3-H v6 used a fresh, isolated epoch with an owner-approved frozen protocol.
All prior epochs (v1, v2, v3, v4, v4-R2, v5) are permanently excluded; no
split, raw, ledger, budget, review labels, statistics, scenario content,
code, or hash from any prior epoch was reused.

The harness, scenario compiler, prompt builder, v7 reviewer, budget, ledger,
identity checker, and D5 statistician were all implemented under a private
evaluation namespace outside the public repository, verified by offline tests
and an independent readiness Caliper (13/13 conditions) before any provider
request was sent. The Owner explicitly signed a 12-item approval packet
before collection began.

### 1.2 Scenario matrix

180 self-contained scenarios, frozen before collection, covering five
grounding-risk families at 36 scenarios each:

| Risk family | Scenarios |
|---|---:|
| unsupported_event | 36 |
| third_party_state | 36 |
| source_attribution | 36 |
| temporal_conflict | 36 |
| coreference_ambiguity | 36 |
| **Total** | **180** |

Every scenario uses a brand-new content set (character names, places, objects)
distinct from all prior epochs. Each scenario carries a v7 structured
assertion contract with canonical assertions, forbidden assertions, narrator
identity, entity references, temporal order (where applicable), and a
structured output schema requiring claims with `subject`, `predicate`,
`object`, `timeRef`, `sourceType`, `groundingIds`, and `text` fields.

### 1.3 Models

Two Owner-approved subject models, both run against the full 180-scenario
matrix:

| requestedModelId | canonicalModelId |
|---|---|
| `agnes-2.0-flash` | `agnes-2.0-flash` |
| `step-3.5-flash` | `step-3.5-flash` |

Model identity was checked with a frozen exact-match allowlist. The
`returnedModelId` returned by the provider was required to exactly match the
requested model ID. No suffix normalization, case normalization, or wildcard
matching was permitted. Any mismatch would have triggered
`HALT_UNKNOWN_MODEL_ID` and stopped further calls to that model.

### 1.4 v7 structured assertion reviewer

The v7 reviewer is a frozen, deterministic, rule-based machine reviewer that
classifies each successful output by matching structured assertion tuples
against the scenario's canonical assertions — not by surface string matching.

The reviewer performs no LLM call and fabricates no evidence. The only
permitted disposition enum is:

```
pass | fail | review_invalid
```

Every `fail` maps to exactly one of six structured categories:

| Fail category | Definition |
|---|---|
| `unsupported_claim` | Claim assertion tuple does not match any cited grounding's canonical assertion |
| `disallowed_grounding` | Claim cites a groundingId not in the allowlist |
| `third_party_knowledge_violation` | Claim asserts private state of another character without epistemic grounding |
| `source_attribution_violation` | Claim misattributes a heard fact as established canon |
| `temporal_contradiction` | Claims violate declared temporal order |
| `coreference_identity_contradiction` | Pronoun referent cannot be resolved unambiguously |

Surface rules (character name presence in narrative body, text length,
minimum claim count) are advisory only and never independently produce a
`fail`. First-person narration using "I" is normalized to the narrator's
character name via the structured `subject` field, not by scanning narrative
text. Forbidden knowledge is checked by full assertion tuple match, not by
entity-name substring.

The v7 reviewer was validated against a 153-fixture offline oracle suite
(0 false positives, 0 false negatives) and a 57-fixture adversarial test
suite (all 5 known v5/v6 defects resolved) before v6 collection.

### 1.5 Budget

| Control | Value |
|---|---:|
| Total attempt cap | 720 |
| Per-model attempt cap | 360 |
| Initial job matrix | 180 scenarios × 2 models = 360 |
| Max retries per job | 1 |
| Cross-model transfer | not permitted |
| Provider failover | not permitted |
| Collection parameters (frozen) | max_tokens=8192, timeout=120s, temperature=0.2 |

Every attempt was reserved before the network call and committed after the
response, under an atomic, fail-closed budget lock. Retries count toward the
cap and cannot expand it.

### 1.6 D5 definition (frozen, unchangeable)

```
D5 = pass / (pass + fail)
```

`review_invalid` does not enter the denominator. If
`review_invalid / successful_outputs > 5%`, D5 is marked `NOT_COMPUTABLE`.
No model ranking is produced.

### 1.7 Environment baseline

The epoch was rebaselined to UTC (`timezone: "UTC"`, `utcOffsetMinutes: 0`).
All timestamps use UTC. The baseline commit, Node version, package version,
and all frozen hashes are recorded in the authorization manifest.

---

## 2. Collection results

| Metric | agnes-2.0-flash | step-3.5-flash | Total |
|---|---:|---:|---:|
| Initial jobs | 180 | 180 | 360 |
| Attempts (incl. retries) | 186 | 200 | 386 |
| Successful outputs | 180 | 180 | 360 |
| Failed attempts (retried) | 6 | 20 | 26 |
| Identity anomalies | 0 | 0 | 0 |
| Identity halts | 0 | 0 | 0 |

Both models produced 180 of 180 successful outputs (100% of target). Failed
attempts (rate-limited, empty output, transport error, provider error) were
retried and all recovered. The `returnedModelId` exactly matched the
requested model on every successful response for both models.

### 2.1 Budget integrity

Total attempts: 386 of 720 (53.6% of cap used). Per-model: agnes 186/360,
step 200/360. Budget invariants passed with zero errors.

---

## 3. Review results

| Disposition | agnes-2.0-flash | step-3.5-flash | Total |
|---|---:|---:|---:|
| pass | 178 | 179 | 357 |
| fail | 2 | 1 | 3 |
| review_invalid | 0 | 0 | 0 |
| **successful outputs reviewed** | **180** | **180** | **360** |

All 360 successful outputs were reviewed. The reviewer produced no `warn`
labels. The `review_invalid` rate is **0%** for both models, well below the
5% gate.

The 3 `fail` dispositions were:
- 1 `unsupported_claim` (source_attribution)
- 2 `disallowed_grounding` (third_party_state, temporal_conflict)

Each fail is traceable to a specific structured assertion violation, not a
surface-string heuristic.

---

## 4. D5 and confidence interval

| Model | pass | fail | review_invalid | invalid rate | D5 | D5 status | Wilson 95% lower bound |
|---|---:|---:|---:|---:|---:|---|---:|
| agnes-2.0-flash | 178 | 2 | 0 | 0% | **0.989** | COMPUTED | **0.960** |
| step-3.5-flash | 179 | 1 | 0 | 0% | **0.994** | COMPUTED | **0.969** |

Both models pass the 5% invalid-rate gate, so both D5 values are `COMPUTED`.

### 4.1 Per-stratum aggregates

All strata pass the 5% invalid-rate gate (0% invalid for all strata), so
every stratum D5 is `COMPUTED`.

**agnes-2.0-flash:**

| Risk family | pass | fail | D5 | Wilson 95% lower bound |
|---|---:|---:|---:|---:|
| unsupported_event | 36 | 0 | 1.00 | 0.904 |
| third_party_state | 35 | 1 | 0.972 | 0.858 |
| source_attribution | 36 | 0 | 1.00 | 0.904 |
| temporal_conflict | 35 | 1 | 0.972 | 0.858 |
| coreference_ambiguity | 36 | 0 | 1.00 | 0.904 |

**step-3.5-flash:**

| Risk family | pass | fail | D5 | Wilson 95% lower bound |
|---|---:|---:|---:|---:|
| unsupported_event | 36 | 0 | 1.00 | 0.904 |
| third_party_state | 36 | 0 | 1.00 | 0.904 |
| source_attribution | 35 | 1 | 0.972 | 0.858 |
| temporal_conflict | 36 | 0 | 1.00 | 0.904 |
| coreference_ambiguity | 36 | 0 | 1.00 | 0.904 |

No model ranking is implied by these numbers.

---

## 5. Limitations

### 5.1 Closed-world structured grounding benchmark

The D5 values in this report measure performance on a **frozen structured
assertion benchmark** — a closed-world grounding contract where every scenario
requires the model to produce structured claims with assertion tuples that
match pre-declared canonical assertions. In this benchmark, agnes-2.0-flash
achieved D5=0.989 and step-3.5-flash achieved D5=0.994, indicating a high pass
rate on this closed-set grounding contract.

This result must **not** be interpreted as:
- A claim that natural-language grounding faithfulness approaches 1.0 in
  arbitrary open-world settings;
- A claim that the models have solved the hallucination problem;
- A claim that extends beyond the frozen scenario matrix and the v7 reviewer's
  structured assertion coverage.

The v7 reviewer has known coverage gaps (identified during v6.1 robustness
expansion): it does not check temporal ordering across claims, does not
enforce sourceType consistency, does not strictly resolve pronouns in subject
fields, and does not cross-check claim subject against canonical subject.
These gaps mean the D5 values are an upper bound on the closed-world
benchmark, not a measure of open-world grounding capability.

### 5.2 Controlled aliases

Both models are controlled aliases, not pinned snapshots. Results are
epoch-bound and may not reproduce across different model weight versions.

### 5.3 Single-epoch collection

Both models were collected within the same W3-H-v6 epoch (unlike v5, which
required a continuation sub-window for agnes). This allows a controlled
same-epoch comparison as diagnostics, though no model ranking is produced.

### 5.4 Deterministic reviewer coverage

The v7 reviewer verifies grounding via structured assertion tuple matching.
Natural language semantics that cannot be expressed as structured assertion
tuples are explicitly listed as reviewer coverage gaps rather than silently
passed. The v6 scenario matrix was designed so that every requirement is
expressible as a structured assertion, eliminating unjudgeable requirements
from the formal matrix.

### 5.5 Token budget

Both models are reasoning models. The frozen `max_tokens=8192` provides
headroom for reasoning tokens plus the structured JSON output. At lower token
budgets (observed in v5 at 4096), reasoning models may produce empty or
truncated outputs. The D5 values are conditional on this token budget.

### 5.6 Cross-epoch comparability

The W3-H evaluation benchmarks differ across epochs and **cannot be merged**:

- **v6** is a closed‑world structured benchmark of 180 scenarios across 5 risk families using the v7 reviewer; it measures grounded-narrative faithfulness under a strict assertion-contract pass rate.
- **v6.1** is a high‑difficulty challenge benchmark with 60 scenarios and 12 adversarial categories evaluated under the v8 reviewer.
- **v6.2** decouples semantic faithfulness (D5) from model-side citation‑protocol compliance (C1) on the v6.1 challenge matrix using the v9 reviewer.

These three benchmarks differ in scenario set, reviewer version, difficulty level, and measurement scope. Absolute D5 scores across versions are not directly comparable, and no model ranking should be derived by merging results across epochs. No report may imply that these benchmarks measure a general "hallucination solution" or that the models have solved hallucination.

This report preserves the v6 limitation note concerning known v7 reviewer coverage gaps (temporal ordering across claims, sourceType consistency enforcement, pronoun resolution in subject fields). These gaps mean the measured D5 is an upper bound on the closed‑world benchmark and does not reflect open‑world grounding capability.

---

## 6. Final Caliper verdict

The final Caliper independently verified: ledger integrity and privacy,
budget caps and invariants, job-matrix coverage (both models 180/180),
model identity (exact match, zero halts), review coverage and disposition
enum, D5 formula and denominator, the 5% invalid-rate gate (passed for both
models), hash consistency (v7 reviewer and scenarios), and the public/private
evidence boundary.

**Verdict: V6 FINAL CALIPER PASS (10/10 checks)**

---

## 7. Relationship to prior epochs

| Epoch | Status | Reason |
|---|---|---|
| v1 | Permanently excluded | — |
| v2 | Permanently excluded | — |
| v3 | Permanently excluded | Cap exceeded, reviewer schema violations |
| v4 / v4-R2 | Permanently excluded | Prompts lacked real grounding content |
| v5 | FROZEN_CONSTRUCT_INVALID_FOR_D5 | Reviewer contract construct error (surface-string heuristics) |
| **v6** | **Valid** | **v7 structured assertion reviewer, construct-valid D5** |

W3-H v6 is the first W3-H epoch with a construct-valid D5 measure.

---

## 8. Containment and retention

- W3-H v6 private assets (raw outputs, ledgers, review labels, scenario
  content, full prompts) are retained in a private evaluation namespace
  outside the public repository and npm package.
- Raw outputs are retained for 30 days; review labels for 180 days.
- This public report contains only aggregate counts, rates, confidence
  intervals, schema versions, and limitation notes. It contains no raw
  output, scenario content, per-sample result, private path, API endpoint,
  credential, full prompt, or model ranking.
- No prior epoch's materials were reused.
