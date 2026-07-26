# W3-H v3 — Formal Evaluation Report (Withdrawn)

**Date:** 2026-07-26
**Baseline:** `5b86742`
**Status:** **INVALID / WITHDRAWN — not a formal evaluation**

> **Retraction notice:** This epoch is invalid. Its D5 values must not be used
> as a release gate, model comparison, or quality claim. Private evidence is
> retained under the applicable retention policy, but the epoch is frozen: no
> more provider or reviewer requests may be sent.

The aggregate counts below are retained only as incident evidence; they are not
formal results.

## Why the epoch is invalid

All three independent failures are sufficient to invalidate the epoch:

1. Collection began without a valid explicit Owner execution authorization.
2. Collection consumed 361 total attempts (181 for agnes-2.0-flash), exceeding
   the frozen 360 total / 180 per-model caps.
3. The executed reviewer emitted the forbidden `warn` judgment and results
   were reclassified after collection, instead of schema-retrying under the
   frozen protocol.

The 49 invalid review outcomes also equal 13.8% of successful outputs. This
exceeds the prospective reviewer-validity ceiling in
`IB_W3_MACHINE_REVIEW_PROTOCOL_ADR.md`; excluding them cannot repair the run.

See `W3H_V3_EVALUATION_INCIDENT.md` for remediation and the evidence boundary.

## Retained incident aggregates

| Metric | agnes-2.0-flash | deepseek-v4-flash | Total |
|---|---:|---:|---:|
| Attempts | 181 | 180 | 361 |
| Successful outputs | 175 | 180 | 355 |
| Errors (timeout) | 6 | 0 | 6 |
| Retries | 3 | 0 | 3 |
| Metadata anomalies | 0 | 89 | 89 |

| Raw reviewer judgment | Count |
|---|---:|
| pass | 214 |
| fail | 92 |
| forbidden `warn` | 44 |
| reviewer error | 5 |
| Total | 355 |

The former post-hoc aggregation reported 214 pass, 92 fail, and 49
`review_invalid`, then computed 0.6993 D5 (95% Wilson lower bound 0.6458).
Those values are **withdrawn**. Per-model figures are withdrawn as well.

## Non-results and limits

- This report makes no D5, Wilson-bound, model-quality, or model-comparison
  conclusion.
- The E2 engineering fixes remain valid changes; this invalid evaluation cannot
  measure their effectiveness.
- DeepSeek metadata anomalies were retained during collection but do not alter
  this incident disposition.

## Data retention

- Raw outputs: maximum 30 days, private root only.
- Review labels: maximum 180 days, private root only.
- This public withdrawal: aggregate-only, indefinite retention.

The v3 evidence seal is private. No raw outputs, prompts, grounding content,
held-out scenarios, credentials, or private paths are included here.
