# W3-H v3 — Formal Evaluation Aggregate Report

**Date**: 2026-07-26
**Baseline**: `5b86742` (E2-fixed Engine)
**Status**: Complete — D5 computed
**Scope**: Public aggregate report. No raw outputs, prompts, grounding content, or credentials.

> **This is a formal W3-H v3 evaluation report.** D5 has been computed per the frozen Formal Machine Reviewer protocol. All results are aggregate-only.

---

## 1. Evaluation Setup

| Field | Value |
|-------|-------|
| Epoch | W3-H v3 |
| Baseline | `5b86742` |
| Timezone | UTC |
| Held-out scenarios | 180 |
| Allowed models | agnes-2.0-flash, deepseek-v4-flash |
| Reviewer | step-router-v1 (Formal Machine Reviewer) |
| Reviewer rubric | v3-formal |
| D5 formula | pass_count / (pass_count + fail_count) |
| Wilson interval | 95% confidence lower bound |
| review_invalid | Excluded from D5 denominator |

---

## 2. Collection Results (Aggregate)

| Metric | agnes-2.0-flash | deepseek-v4-flash | Total |
|--------|-----------------|-------------------|-------|
| Attempts | 181 | 180 | 361 |
| Successful outputs | 175 | 180 | 355 |
| Errors (timeout) | 6 | 0 | 6 |
| Retries | 3 | 0 | 3 |
| Anomalies (DeepSeek-V4-Flash_Ari) | 0 | 89 | 89 |
| Unknown model ID stops | 0 | 0 | 0 |
| Paid budget used | 0 | 0 | 0 |

**Note**: 89 DeepSeek-V4-Flash_Ari anomalies were retained in the denominator per controlled alias schema (anomaly does not exclude samples or change denominator).

---

## 3. Formal Machine Review Results (Aggregate)

### 3.1 Raw reviewer judgments

| Judgment | Count |
|----------|-------|
| pass | 214 |
| fail | 92 |
| warn | 44 |
| error (reviewer timeout) | 5 |
| **Total** | **355** |

### 3.2 Final judgments (after V3 protocol reclassification)

Per V3 Formal Machine Reviewer protocol:
- `warn` is NOT permitted → reclassified as `review_invalid`
- `error` (parse/timeout) → reclassified as `review_invalid`
- `review_invalid` excluded from D5 denominator

| Final Judgment | Count |
|----------------|-------|
| pass | 214 |
| fail | 92 |
| review_invalid | 49 |
| **Total** | **355** |

---

## 4. D5 Results

### 4.1 Overall D5

| Metric | Value |
|--------|-------|
| pass_count | 214 |
| fail_count | 92 |
| denominator (pass + fail) | 306 |
| review_invalid (excluded) | 49 |
| **D5 (pass rate)** | **0.6993** |
| **D5 Wilson lower bound (95%)** | **0.6458** |

### 4.2 Per-model D5

| Model | pass | fail | review_invalid | denominator | D5 | Wilson lower (95%) |
|-------|------|------|----------------|-------------|-----|---------------------|
| agnes-2.0-flash | 111 | 35 | 29 | 146 | 0.7603 | 0.6849 |
| deepseek-v4-flash | 103 | 57 | 20 | 160 | 0.6438 | 0.5670 |

### 4.3 Anomaly handling

89 DeepSeek-V4-Flash_Ari anomalies were included in the denominator per protocol. Anomaly samples were not excluded, cherry-picked, or treated differently in D5 calculation.

---

## 5. Key Observations

1. **Overall grounding consistency**: 69.93% of evaluated outputs passed grounding consistency review. The Wilson lower bound (64.58%) provides a conservative estimate.

2. **review_invalid rate**: 49/355 = 13.8% of reviews were reclassified as review_invalid (44 warn + 5 error). This is above the 5% threshold defined in the protocol's consistency checks, indicating the reviewer model (step-router-v1) has moderate uncertainty on borderline cases.

3. **Model comparison**: This report presents per-model D5 values as aggregate data points. Per protocol, no model ranking or leaderboard is implied. The per-model D5 values are:
   - agnes-2.0-flash: 0.7603 (Wilson lower: 0.6849)
   - deepseek-v4-flash: 0.6438 (Wilson lower: 0.5670)

4. **E2 fix impact**: This is the first W3-H evaluation on the E2-fixed Engine baseline (`5b86742`). The P0 position timing fix and P1 checker false positive fix are included. Location-related grounding violations now reflect real LLM behavior rather than Engine timing artifacts.

---

## 6. Limitations

1. **review_invalid rate**: 13.8% of reviews were invalid, reducing the effective denominator from 355 to 306. Future evaluations should improve reviewer prompt clarity to reduce warn outputs.

2. **Provider timeout**: 6 agnes-2.0-flash attempts failed due to provider timeout, reducing agnes successful outputs from 180 to 175.

3. **Single reviewer**: Per protocol, this evaluation uses a single Formal Machine Reviewer (step-router-v1). Intra-rater consistency is not measured in this epoch.

4. **No model ranking**: Per protocol, this report does not constitute a model capability comparison. Per-model D5 values are presented as aggregate data, not as a leaderboard.

---

## 7. Data Retention

- Raw LLM outputs: retained for max 30 days (private root only)
- Review labels: retained for max 180 days (private root only)
- This public report: aggregate projection only, indefinite retention

---

## 8. Reproducibility

| Item | Value |
|------|-------|
| Git commit | `5b86742` |
| Held-out split seed | `w3h-v3-seed-2026-07-26` |
| Reviewer model | step-router-v1 |
| Reviewer rubric | v3-formal |
| Timezone | UTC |
| Domain | campus |
| enableFacts | true |

All file hashes are frozen in `W3H-V3/V3-0-BASELINE-FREEZE.md` (private). Any hash change invalidates this epoch.

---

*Architect (Integration Beta lead) | 2026-07-26*
