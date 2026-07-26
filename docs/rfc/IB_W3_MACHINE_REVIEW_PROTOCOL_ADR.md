# IB W3 Machine Review Protocol ADR

**Status:** Accepted for future epochs only  
**Date:** 2026-07-26  
**Supersedes:** `IB_W3_SINGLE_REVIEWER_PROTOCOL_ADR.md` only where that ADR
prohibits an Owner-approved machine reviewer.  
**Does not validate:** W3-H v3 or any prior epoch.

## Decision

The Owner may authorize a named machine reviewer for a future W3 epoch. The
approval packet must bind its requested model ID, endpoint family, prompt hash,
JSON schema hash, retry rule, and baseline. A machine reviewer is an evaluation
instrument, not an evaluator of its own reliability.

The only permitted disposition enum is:

```text
pass | fail | review_invalid
```

`warn`, free-form fallback labels, missing required fields, malformed JSON,
unknown reviewer identity, and timeout are schema failures. Each item may be
retried at most twice as pre-authorized. If it still fails, it is recorded as
`review_invalid` with its reason; it is never relabeled after collection.

## Validity gates

- Every provider request, including retries, consumes the total and per-model
  attempt caps.
- A single immutable consolidated manifest must reconcile attempted, successful,
  failed, retried, and reviewed items before D5 can be calculated.
- All required high-risk strata must meet their frozen floor before D5.
- `review_invalid / successful_outputs` must be at most **5%**. Above that
  value, D5 is **NOT_COMPUTABLE**, not a reduced-denominator result.
- Unknown reviewer or subject-model identity fails closed.
- An independent verifier must check the authorization record, budget ledger,
  consolidated manifest, schema conformance, invalid-rate gate, and D5 formula.

## Authorization and evidence boundary

No machine-review protocol authorizes provider use. A new epoch requires an
explicit Owner approval before its first real request. Private raw material
retains its existing boundary and retention schedule; public reporting is
aggregate-only and may report D5 only after every gate passes.

## Relationship to the prior human protocol

The prior ADR remains historical evidence of its human-only process. This ADR
is the governing reviewer protocol only when a future Owner packet explicitly
selects machine review. It does not silently replace other W3 requirements or
lower numerical thresholds.
