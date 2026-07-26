# W3-H v4 R2 evaluation invalidation

**Status:** Invalid / withdrawn. This record replaces any prior R2 aggregate
claim.

## Decision

R2 is excluded from D5, model comparison, release evidence, and all later
evaluation epochs. Its outputs were collected with prompts that identified a
scenario but did not provide the scenario content, grounding package, or an
evaluable narrative. The resulting statistic therefore measured responses to
an underspecified request, not grounded-narrative faithfulness.

## Containment

- Provider execution for this epoch is frozen.
- Raw outputs, ledgers, and the withdrawn aggregate material are retained only
  as private incident evidence outside the repository.
- No raw output, credentials, endpoints, sample content, or model ranking is
  published by this record.

## Requirement for any replacement evaluation

A replacement must use a fresh epoch and an owner-approved frozen protocol.
Every subject request must include the actual scenario, the permitted and
forbidden grounding, and the required output contract. An independent reviewer
must classify the generated narrative against that frozen contract before D5
can be computed.
