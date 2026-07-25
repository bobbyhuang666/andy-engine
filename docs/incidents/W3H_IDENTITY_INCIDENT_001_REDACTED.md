# W3H Identity Incident 001 — Redacted Public Summary

> **Date:** 2026-07-25
> **Status:** Resolved — reclassified as provider model-field anomaly
> **Classification:** `provider_model_field_anomaly`
> **modelSubstitution:** false

---

## Summary

During W3-H held-out evaluation canary, the identity fingerprint check
detected that the model alias `deepseek-v4-flash` returned two different
raw model field strings across two calls. One matched the expected
representation; the other contained a provider-appended metadata suffix.

Per Owner clarification, this is a **provider model-field anomaly**, not a
model substitution. Only two models are approved for W3-H:
`agnes-2.0-flash` and `deepseek-v4-flash`. The metadata suffix does not
represent a third model, variant, family, or subgroup.

## Identity observation

| Field | Value |
|-------|-------|
| requestedModelId | `deepseek-v4-flash` |
| canonicalModelId | `deepseek-v4-flash` |
| Permitted raw returned values | 2 (both map to same canonical ID) |
| anomalyCode | `provider_model_field_anomaly` |
| modelSubstitution | false |

The raw anomalous string is not disclosed in this public summary. It is
retained in the private attempt ledger for audit.

## Attempt accounting

4 canary attempts were consumed and are permanently retained in the budget
ledger. They are tagged `pre_execution_canary` and are NOT counted toward
the 300 held-out success samples or the formal D5 denominator.

## Owner decisions

- The metadata suffix is NOT a model, variant, family, or subgroup
- Raw returnedModelId is retained in private ledger
- canonicalModelId is derived from requestedModelId mapping
- Anomaly count is reported as provider metadata quality, not model identity
- Anomalies do NOT cause sample exclusion or D5 denominator modification
- No wildcard suffix normalization is permitted
- DeepSeek model is NOT disqualified from W3-H based on this incident

## Strict stop conditions (still in force)

Immediate stop is still triggered by:
- Returned ID belonging to a different model
- Empty model ID when response contract requires it
- Returned ID that cannot be mapped to the requested model
- Returned ID with a new structure not in the permitted raw value list

## What is NOT in this public summary

- Raw model output
- Endpoint addresses
- Request IDs
- Authorization headers or credentials
- Raw anomalous metadata strings
- Private attempt ledger content
- Grounding package details

## Related documents

- `docs/rfc/IB_W3_CONTROLLED_MODEL_ALIAS_ADR.md` — normalization schema and stop rules
- Private event record: `W3H_IDENTITY_INCIDENT_001` (private-eval directory)
