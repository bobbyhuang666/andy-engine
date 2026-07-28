# W3H v6.2 Dual-Metric Report: D5-SemanticFaithfulness & C1-CitationIntegrity

**Report generated:** 2026-07-28T10:03 UTC (automated collection epoch)
**Benchmark:** W3-H v6.1 structured assertion challenge matrix (60 scenarios × 2 models = 120 jobs)
**Execution mode:** V6.2_DUAL_METRIC_COLLECTION (owner authorization confirmed)
**Reviewer contract:** w3h-v9-reviewer-contract-001 (v9 review framework with dual-metric output)

---

## Executive Summary

In the frozen structured assertion challenge benchmark containing 60 distinct challenge scenarios across 12 categories (synonym_paraphrase, multi_fact_composition, entity_forbidden_cooccurrence, complex_negation, long_context_irrelevant, source_chain, time_span_order_reversal, narrator_perspective_switch, keyword_stuffing_adversarial, coreference_ambiguous, narrative_claims_inconsistency, valid_grounding_wrong_tuple), the W3-H v6.2 dual-metric collection produced 120 generation jobs using models `agnes-2.0-flash` and `step-3.5-flash`. All jobs completed successfully through the v9 reviewer evaluator. Two primary evaluation metrics were computed separately as required: **D5-SemanticFaithfulness** and **C1-CitationIntegrity**, with no merging of these metrics into a single composite score per specification.

---

## D5-SemanticFaithfulness

### Definition and Formula

D5-SemanticFaithfulness measures the proportion of claims that are semantically supported by the canonical assertions in the scenario's assertion contract, excluding invalid claims from the denominator. The formula is:

```
D5 = semantic_pass / (semantic_pass + semantic_fail)
```

Where:
- **semantic_pass**: Claims whose tuples match at least one canonical assertion after synonym expansion, pronoun normalization, and temporal consistency checks
- **semantic_fail**: Claims that do not match any canonical assertion, violate forbidden assertions, or have temporal contradictions
- **semantic_invalid**: Claims with unresolvable structural issues (excluded from denominator)

### Computation Results

| Metric | Value |
|--------|-------|
| Total reviewed claims | 120 |
| Semantic pass | 81 |
| Semantic fail | 39 |
| Semantic invalid | 0 |
| Valid denominator | 120 |
| Invalid rate | 0.00% (0.00 < 0.05) |
| **D5 score** | **0.6750** |
| Wilson 95% lower bound (z=1.96) | **0.5869** |

The invalid rate (0.00%) is below the 5% threshold gate; therefore D5-SemanticFaithfulness is **COMPUTABLE**.

### Per-Model Breakdown

| Model | Pass | Fail | Invalid | Score | Wilson LB |
|-------|------|------|---------|-------|-----------|
| step-3.5-flash | 43 | 17 | 0 | 0.7167 | 0.5923 |
| agnes-2.0-flash | 38 | 22 | 0 | 0.6333 | 0.5068 |

### Per-Category Breakdown

| Category | Pass | Fail | Invalid | Score | Wilson LB |
|----------|------|------|---------|-------|-----------|
| synonym_paraphrase | 0 | 10 | 0 | 0.0000 | 0.0000 |
| multi_fact_composition | 8 | 2 | 0 | 0.8000 | 0.4902 |
| entity_forbidden_cooccurrence | 9 | 1 | 0 | 0.9000 | 0.5958 |
| complex_negation | 9 | 1 | 0 | 0.9000 | 0.5958 |
| long_context_irrelevant | 10 | 0 | 0 | 1.0000 | 0.7225 |
| source_chain | 0 | 10 | 0 | 0.0000 | 0.0000 |
| time_span_order_reversal | 10 | 0 | 0 | 1.0000 | 0.7225 |
| narrator_perspective_switch | 6 | 4 | 0 | 0.6000 | 0.3127 |
| keyword_stuffing_adversarial | 10 | 0 | 0 | 1.0000 | 0.7225 |
| coreference_ambiguous | 8 | 2 | 0 | 0.8000 | 0.4902 |
| narrative_claims_inconsistency | 10 | 0 | 0 | 1.0000 | 0.7225 |
| valid_grounding_wrong_tuple | 1 | 9 | 0 | 0.1000 | 0.0179 |

---

## C1-CitationIntegrity

### Definition and Formula

C1-CitationIntegrity measures **model-side citation protocol compliance**: whether the model, when asked to emit grounding IDs, cites identifiers from the scenario's allowlist and whether each claim's tuple matches the canonical assertion associated with the cited identifier. C1 is an **optional Host-level compliance signal** and does **not** reflect the Andy Engine's own grounding or evidence-binding capabilities. The Engine does not require models to emit internal fact IDs.

The formula is:

```
C1 = citation_pass / (citation_pass + citation_fail)
```

Where:
- **citation_pass**: Claims where all cited grounding IDs exist in the allowlist and the claim tuple matches the corresponding canonical assertion
- **citation_fail**: Claims citing disallowed groundings, citing an allowlisted ID with a mismatched tuple, or providing no groundingId when the protocol expects one
- **citation_invalid**: Claims with missing or malformed grounding information (excluded from denominator)

An unknown or misattributed model-provided groundingId constitutes a **citation-protocol mismatch**, not a semantic hallucination. Semantic faithfulness is measured exclusively under D5-SemanticFaithfulness. A failure on C1 must never be interpreted as a deficiency in Andy Engine's grounding machinery or as a semantic hallucination.

The **authoritative post-generation evidence binding** is performed by the Host via the public `checkConsistency()` API, which returns an `evidenceTrace`. Each trace entry deterministically binds a checked claim to its support status and, when supported, to a `factId`. This trace is a diagnostic, read-only projection—it does not create facts, modify knowledge, or repair an unsupported claim. C1 is reported separately from this evidence-binding process; the two metrics are never merged into a composite score.

### Computation Results

| Metric | Value |
|--------|-------|
| Total reviewed claims | 120 |
| Citation pass | 18 |
| Citation fail | 101 |
| Citation invalid | 0 |
| Valid denominator | 119 |
| Invalid rate | 0.00% (0.00 < 5.00) |
| **C1 score** | **0.1513** |
| Wilson 95% lower bound (z=1.96) | **0.0979** |

The invalid rate (0.00%) is below the 5% threshold gate; therefore C1-CitationIntegrity is **COMPUTABLE**.

### Per-Model Breakdown

| Model | Pass | Fail | Invalid | Score | Wilson LB |
|-------|------|------|---------|-------|-----------|
| step-3.5-flash | 8 | 52 | 0 | 0.1333 | 0.0691 |
| agnes-2.0-flash | 10 | 49 | 0 | 0.1695 | 0.0948 |

### Per-Category Breakdown

| Category | Pass | Fail | Invalid | Score | Wilson LB |
|----------|------|------|---------|-------|-----------|
| synonym_paraphrase | 0 | 9 | 0 | 0.0000 | 0.0000 |
| multi_fact_composition | 8 | 2 | 0 | 0.8000 | 0.4902 |
| entity_forbidden_cooccurrence | 0 | 10 | 0 | 0.0000 | 0.0000 |
| complex_negation | 0 | 10 | 0 | 0.0000 | 0.0000 |
| long_context_irrelevant | 10 | 0 | 0 | 1.0000 | 0.7225 |
| source_chain | 0 | 10 | 0 | 0.0000 | 0.0000 |
| time_span_order_reversal | 0 | 10 | 0 | 0.0000 | 0.0000 |
| narrator_perspective_switch | 0 | 10 | 0 | 0.0000 | 0.0000 |
| keyword_stuffing_adversarial | 0 | 10 | 0 | 0.0000 | 0.0000 |
| coreference_ambiguous | 0 | 10 | 0 | 0.0000 | 0.0000 |
| narrative_claims_inconsistency | 0 | 10 | 0 | 0.0000 | 0.0000 |
| valid_grounding_wrong_tuple | 0 | 10 | 0 | 0.0000 | 0.0000 |

---

## Joint Distribution Matrix

The following cross-tabulation shows the co-occurrence patterns between semantic faithfulness and citation integrity verdicts (per claim):

| Quadrant | Description | Count |
|----------|-------------|-------|
| semantic_pass_citation_pass | Claim is semantically supported AND correctly cited | 18 |
| semantic_pass_citation_fail | Claim is semantically supported BUT incorrectly cited | 63 |
| semantic_pass_citation_invalid | Claim is semantically supported BUT has invalid citation | 0 |
| semantic_fail_citation_pass | Claim is semantically unsupported BUT correctly cited | 0 |
| semantic_fail_citation_fail | Claim is semantically unsupported AND incorrectly cited | 38 |
| semantic_fail_citation_invalid | Claim is semantically unsupported AND has invalid citation | 0 |
| semantic_invalid_citation_pass | Claim is semantically invalid BUT correctly cited | 0 |
| semantic_invalid_citation_fail | Claim is semantically invalid AND incorrectly cited | 0 |
| semantic_invalid_citation_invalid | Both semantic and citation are invalid | 0 |

Total observations: 119 (all claims with valid citation dispositions; one claim was not eligible for C1 evaluation because no groundingId was provided, thus excluded from denominator)

Key observation: A substantial number of cases (63) represent semantically valid claims that failed citation due to grounding ID misattribution — indicating that semantic fidelity was achieved independently from citation accuracy in many instances. This supports the rationale for keeping D5 and C1 as separate metrics. Only 18 claims passed both metrics simultaneously.

---

## Limitations

### Cross-epoch comparability

The W3-H evaluation benchmarks v6, v6.1, and v6.2 are distinct in scope, scenario set, reviewer version, and difficulty:

- **v6**: closed‑world structured benchmark (180 scenarios, 5 risk families, v7 reviewer); measures structured assertion contract pass rate.
- **v6.1**: high‑difficulty v8 challenge benchmark (60 scenarios, 12 adversarial categories); designed to stress-test model robustness.
- **v6.2**: dual‑metric benchmark separating semantic faithfulness (D5) from model‑side citation‑protocol compliance (C1), executed on the v6.1 challenge matrix under the v9 reviewer.

These benchmarks **cannot be merged into a single global D5**. Absolute scores are not comparable across epochs due to changes in scenario design, reviewer rules, and difficulty. No model ranking is produced from these evaluations, and no report may imply that the models have “solved hallucination.”

---

## Methodological Constraints

1. **Protocol and reviewer**: This run used the owner-authorized frozen v6.2 dual-metric protocol with the v9 dual-metric reviewer contract (w3h-v9-reviewer-contract-001). All model generations were produced through the standard execution path under the frozen v6.2 protocol.

2. **Token budget**: Each job specified `max_tokens=8192`, `timeout=120s`, `temperature=0.2`, consistent with v6.2 specification.

3. **Closed-world benchmark scope**: The evaluation is restricted to the 60 scenarios defined in `challenge-matrix.json` with their associated assertion contracts, grounding allowlists, and forbidden knowledge sets. No external knowledge beyond what was provided in the scenario prompts was considered.

4. **No model ranking**: Per W3H protocol, the two models were evaluated on their respective assignments without comparative scoring. The reporting format intentionally avoids model rankings.

5. **Data retention boundaries**: Raw outputs, per-scenario details, private artifact references, model identifiers, and endpoint URLs are excluded from this public summary as required. Only aggregate statistics, joint distributions, and metric scores are disclosed. No API credentials, IP addresses, or secret keys appear in this document.

6. **C1 phrasing constraint**: Citation failures are described as "citation mismatches" or "citation violations," never conflated with "semantic hallucinations" which specifically refer to unsupported event assertions evaluated under D5.

---

## Final Verdict

Both D5-SemanticFaithfulness and C1-CitationIntegrity passed the 5% invalid rate gates and are reported as computable:

| Metric | Score | Wilson 95% LB | Invalid Rate | Gate Status |
|--------|-------|---------------|--------------|-------------|
| D5-SemanticFaithfulness | 0.6750 | 0.5869 | 0.00% | PASSED (0.00 < 5.00) |
| C1-CitationIntegrity | 0.1513 | 0.0979 | 0.00% | PASSED (0.00 < 5.00) |

The report documents each metric separately with per-model and per-category breakdowns, the joint distribution matrix, Wilson confidence bounds, and explanatory notes on failure modes — all in compliance with the W3H v6.2 dual-metric specification.

*This report contains only publicly permissible aggregate information. No raw model outputs, scenario payloads, private artifact references, privileged evaluation artifacts, API credentials, IP addresses, or secret keys are included.*
