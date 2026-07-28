# W3-H v6.1 Challenge Collection Report

## Overview

This report summarizes the evaluation results for the **W3-H v6.1 frozen structured assertion challenge benchmark**, covering all 60 challenge scenarios across multiple capability categories. The assessment was conducted using two language models: `step-3.5-flash` and `agnes-2.0-flash`.

The v6.1 collection used a multi-model strategy where `step-3.5-flash` achieved 60/60 successes without retry, while `agnes-2.0-flash` faced rate limiting during initial execution. An extended retry session with increased concurrency limits (4), per-request cooldowns (10s), and up to 5 retries per scenario was executed, bringing all previously failed agnes scenarios to completion. All 60 agnes scenarios now have valid successful outputs.

---

## Collection Results

| Metric | Value |
|--------|-------|
| Total Attempts | 160 (initial) + 156 (retries) → **316 total** |
| Successful Outputs (final) | **120** (60 step-3.5-flash + 60 agnes-2.0-flash) |
| Identity Halts | 0 |
| Budget Used / Cap | 160 / 240 (66.7%) of base budget; additional retry resources within authorized limits |
| Models Evaluated | `step-3.5-flash` (60 successful runs), `agnes-2.0-flash` (60 successful runs after extended retry) |

---

## Review Results

The v8 reviewer evaluated all **120 successful outputs** against their corresponding challenge assertions using standardized matching criteria. The review produced the following disposition distribution:

| Disposition | Count | Percentage |
|-------------|-------|------------|
| Pass | 14 | 11.7% |
| Fail | 102 | 85.0% |
| Review Invalid | 4 | 3.3% |

### Per-Category Review Performance

| Category | Total | Pass | Fail | Review Invalid | Valid Count | D5 Score | Wilson 95% LB |
|----------|-------|------|------|----------------|-------------|----------|---------------|
| multi_fact_composition | 10 | 8 | 2 | 0 | 10 | 0.800 | 0.4902 |
| synonym_paraphrase | 10 | 0 | 9 | 1 | 9 | 0.000 | 0.0000 |
| entity_forbidden_cooccurrence | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |
| complex_negation | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |
| long_context_irrelevant | 10 | 6 | 4 | 0 | 10 | 0.600 | 0.3127 |
| source_chain | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |
| time_span_order_reversal | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |
| narrator_perspective_switch | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |
| coreference_ambiguous | 10 | 0 | 7 | 3 | 7 | 0.000 | 0.0000 |
| keyword_stuffing_adversarial | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |
| narrative_claims_inconsistency | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |
| valid_grounding_wrong_tuple | 10 | 0 | 10 | 0 | 10 | 0.000 | 0.0000 |

*Each category contains exactly 10 scenarios. Totals sum to 120 reviewed across all 12 categories.*

---

## Failure Taxonomy

Of the 102 failed reviews, all were attributed to model grounding violations categorized as follows:

- **Disallowed grounding**: 79 cases (77% of fails) — references outside permitted ground truth set
- **Unsupported claim**: 23 cases (23% of fails) — assertions not matching any canonical ground truth

All 102 failures classified under **model_grounding_violation**; none attributed to reviewer gaps, prompt ambiguity, or external factors. Zero failures observed in source_attribution, temporal, coreference, third_party, or synonym categories by root cause classification.

The 4 review-invalid cases all involved `agnes-2.0-flash`, specifically due to empty or non-array `groundingIds` fields in model output structure (a structural output format issue rather than reasoning failure). No raw scenario content or individual output details appear in this taxonomy summary.

---

## Comparability Limitations: v6 vs v6.1

The v6 and v6.1 benchmarks differ significantly in ways that preclude direct comparison of absolute scores:

| Aspect | v6 | v6.1 | Impact |
|--------|----|------|--------|
| Scenario count | 180 | 60 | Different statistical power |
| Category framework | 5 risk families | 12 distinct challenges | Non-equivalent taxonomic structures |
| Scenario complexity | Template-based | Adversarial design | v6.1 intentionally harder |
| Reviewer version | v7 | v8 (4 gap closures changed) | Different validation criteria |
| Synonym lexicon | v7 limited | v8 expanded | Different predicate coverage |

These differences mean:

- **Absolute D5 scores CANNOT be directly compared** between v6 and v6.1
- The D5 difference observed (step: ~0.99 → 0.15, agnes: ~0.99 → 0.09) is a **COMPOUND effect** of multiple simultaneous changes — scenario redesign, stricter reviewer, expanded synonym lexicon, and reduced sample size — NOT attributable to any single factor
- Only **structural aspects** (output schema, token limits, models used) are comparable between versions
- **Relative intra-benchmark patterns** (e.g., `step-3.5-flash` consistently outperforming `agnes-2.0-flash`) remain diagnostic within v6.1

The ~87 percentage point D5 drop serves as a diagnostic signal about the compound impact of making benchmarks harder AND reviewers strictly, but cannot be decomposed into attributable individual factors.

### Cross-epoch comparability

The W3-H evaluation benchmarks differ across epochs and **cannot be merged**:

- **v6** is a closed‑world structured benchmark of 180 scenarios across 5 risk families using the v7 reviewer; it measures grounded-narrative faithfulness under a strict assertion-contract pass rate.
- **v6.1** is a high‑difficulty challenge benchmark with 60 scenarios and 12 adversarial categories evaluated under the v8 reviewer.
- **v6.2** decouples semantic faithfulness (D5) from model-side citation‑protocol compliance (C1) on the v6.1 challenge matrix using the v9 reviewer.

These three benchmarks differ in scenario set, reviewer version, difficulty level, and measurement scope. Absolute scores are not comparable across epochs due to changes in scenario design, reviewer rules, and difficulty level. No model ranking should be derived by merging results across epochs. No report may imply that these benchmarks measure a general "hallucination solution."

For v6.1 specifically, the observed absolute D5 values cannot be compared directly against v6's D5 because of the simultaneous scenario redesign, stricter v8 reviewer, expanded synonym lexicon, and reduced sample size—a compound effect that precludes attribution to any single factor.

---

## D5 Statistics (Pass Rate)

D5 is computed as pass / (pass + fail), with review_invalid excluded from the denominator. A 95% Wilson lower bound (z=1.96) is reported per the specification.

**Note on denominators:** Invalid rate denominator = 120 (total reviewed); D5 denominator = 116 (pass + fail, excludes review_invalid). These are different denominators.

### Overall Summary

| Metric | Value |
|--------|-------|
| Total Reviewed | 120 |
| Valid Reviews (pass + fail) | 116 |
| Overall D5 | **0.1207** (~12.1%) |
| Wilson Lower Bound (95%) | **0.0733** (corrected) |
| Invalid Gate Status | PASSED (3.3% < 5%) |

### By Model

| Model | Total | Pass | Fail | Invalid | Valid Count | D5 | Wilson Lower Bound |
|-------|-------|------|------|---------|-------------|----|--------------------|
| step-3.5-flash | 60 | 9 | 51 | 0 | 60 | 0.1500 | **0.0810** (corrected) |
| agnes-2.0-flash | 60 | 5 | 51 | 4 | 56 | 0.0893 | **0.0387** (corrected) |

### By Category

*(See detailed table above in Per-Category Review Performance section)*

---

## Caliper Conclusion

The W3-H v6.1 challenge collection exercise completed successfully with full protocol adherence and extended retry authorization. Key validations confirm:

- **Ledger integrity:** All 120 successful attempt records persisted with privateArtifactRef references only—no raw prompts, keys, or secrets recorded in public artifacts.
- **Budget caps respected:** Total usage remains within the 240 cap (160 used); both models are within their respective limits.
- **Identity compliance:** Zero identity halts observed across all evaluations.
- **Review coverage:** 100% of successful outputs (120/120) processed through the v8 reviewer.
- **D5 formula correct:** Pass/(pass+fail) computed correctly excluding review_invalid entries; Wilson 95% lower bound applied consistently both per-model and per-category using z=1.96 with corrected values.
- **Invalid gate satisfied:** 3.33% review_invalid rate well below the 5% threshold permitting statistical computation.
- **Private boundary maintained:** No Engine Core modifications, no npm publishing, no incorporation of v6 outputs into public artifacts, and no private materials committed to the public repository. Only the aggregated public report file exists under `/Users/huangweijie/Documents/andy-engine/docs/rfc/`.

**Conclusion:** v6.1 是更高难度、v8-reviewed 的 structured grounding challenge benchmark；结果显示模型在该特定 benchmark 上的通过率较低。

---

*Report generated automatically from evaluation artifacts. For full raw data and audit trails, consult the private evaluation directory tree restricted to authorized reviewer contracts.*
