# W3-H v5 Evaluation — Governance Status

**Status:** FROZEN_CONSTRUCT_INVALID_FOR_D5
**Date:** 2026-07-27
**Supersedes:** All prior versions of this document that reported D5 values as evaluation evidence.

## Decision

The W3-H v5 collection mechanics — budget enforcement, append-only ledgers,
model identity exact-match checks, append-only review labels, and the
public/private evidence boundary — are valid as run-execution evidence.

The W3-H v5 D5 statistic is **invalid as a measure of grounded-narrative
faithfulness**. The frozen deterministic reviewer contract has a confirmed
systematic construct error:

- The narrative task requires the subject model to write from the character's
  first-person perspective.
- The reviewer's `requiredElements` rule requires the character's name to
  appear in the narrative body, which conflicts with legitimate first-person
  narration.
- The `forbiddenPatterns` rule in some scenarios includes entity names that
  are permitted to mention (because the forbidden knowledge is a specific
  fabricated event involving that entity, not a blanket ban on the name).
- As a result, correctly grounded outputs are falsely marked `fail`.

The direction of the resulting measurement bias has not been proven to be
one-way (only false negatives). The current D5 values are therefore **not a
lower bound** on grounding faithfulness. They are the mechanical output of a
defective frozen reviewer contract and carry no construct-valid interpretation.

## What the numbers are and are not

The aggregate counts and D5 values that appeared in earlier versions of this
document (agnes-2.0-flash D5=0.408, step-3.5-flash D5=0.40) are retained in
the private evaluation namespace as mechanical outputs of the frozen reviewer.
They are **not** reported here as evaluation findings because:

- They cannot be used for a release gate.
- They cannot be used for model comparison.
- They cannot be used to judge grounding capability.
- They cannot be interpreted as a lower bound or upper bound on
  grounded-narrative faithfulness.
- They are not "partial Beta evidence."
- They do not demonstrate "strong grounding behavior" on any stratum.

The collection mechanics (budget, ledger, identity, review coverage, invalid
gate execution) remain valid as evidence that the protocol infrastructure
executed correctly. The invalidity is confined to the D5 construct, not to
the collection infrastructure.

## Private evidence retention

Raw outputs, ledgers, review labels, and budgets for the main epoch and both
continuation sub-windows are retained in the private evaluation namespace
outside the public repository and npm package. They are preserved unchanged
for use as private regression fixtures when testing future reviewer contracts.
They are **not** retained for recomputing or announcing a formal D5 on v5
outputs.

## Relationship to prior epochs

W3-H v1, v2, v3, v4, and v4-R2 are all previously invalidated. W3-H v5 is now
invalidated for D5 construct validity. No epoch's D5 is currently valid.

## Next steps

An E3 reviewer-contract repair has been initiated to fix the construct errors
in a new, versioned reviewer contract with independent hash and contract ID.
The repaired reviewer will be validated against an offline oracle fixture
suite. If the repair passes independent Caliper acceptance, a future fresh
evaluation epoch (v6) may be opened with the repaired reviewer and a new
collection. v5 outputs will not be re-scored to produce a formal v5 D5.

## Public boundary

This document contains no raw output, scenario content, per-sample result,
private path, API endpoint, credential, full prompt, or model ranking.
