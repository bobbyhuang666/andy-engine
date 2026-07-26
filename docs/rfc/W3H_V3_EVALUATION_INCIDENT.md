# W3-H v3 Evaluation Incident

**Status:** Closed as `INVALID / WITHDRAWN`  
**Date:** 2026-07-26  
**Scope:** W3-H v3 only; no conclusion is made about the Engine or either model.

## Disposition

W3-H v3 is frozen. Its collection, review, D5 calculation, Wilson interval,
and per-model aggregates are invalid. They cannot support a release gate,
comparison, or public quality claim.

Private raw data, review artifacts, and append-only ledgers were retained in
the private evaluation root under the existing retention policy. A private
incident seal records aggregate counts and SHA-256 evidence fingerprints. This
public document contains no raw content, prompts, credentials, or held-out
scenarios.

## Confirmed failures

| Control | Required | Observed | Disposition |
|---|---|---|---|
| Owner authorization | Explicit authorization before any provider request | No valid authorization evidence | Invalid |
| Total cap | At most 360 attempts | 361 | Invalid |
| Per-model cap | At most 180 attempts/model | 181 for agnes-2.0-flash | Invalid |
| Reviewer schema | `pass`, `fail`, or `review_invalid` only | 44 forbidden `warn` judgments, then post-hoc relabeling | Invalid |
| Reviewer validity | Predeclared validity gate | 49/355 invalid outcomes (13.8%) | Invalid |

## Immediate containment

- `executionActive` is false in every v3 execution state.
- The v3 collection and reviewer programs are incident-latched and fail before
  accessing credentials or initiating network work.
- No data was deleted, rerun, or moved during containment.
- The former public formal report is retained with a conspicuous withdrawal
  notice so existing links do not continue to make an invalid claim.

## Required conditions for a future epoch

1. Start a new, isolated epoch; v3 samples, raw outputs, labels, and budgets
   are ineligible.
2. Obtain explicit Owner authorization before any real request. The approval
   artifact must bind the new epoch, baseline hash, model list, caps, retention,
   and reviewer protocol.
3. Enforce total and per-model caps before every request under one fail-closed,
   atomic budget lock. Retries are attempts and never expand the total cap.
4. Use the prospective machine-review protocol in
   `IB_W3_MACHINE_REVIEW_PROTOCOL_ADR.md`; invalid reviewer responses must be
   retried under the declared limit and remain visible.
5. Do not calculate D5 when reviewer-invalid rate exceeds 5%, when required
   strata are incomplete, or when the consolidated manifest cannot reconcile
   every attempt.

This incident does not authorize a new epoch or any provider request.
