# IB W3 Controlled Model Alias ADR

> **Status:** Accepted (W3-1 Readiness Hardening)
> **Date:** 2026-07-25
> **Supersedes:** Implicit "pinned snapshot" assumption in §12.3 line 707
> **Author:** Integration Beta chief architect AI
> **Owner decision:** Single reviewer protocol; floating aliases accepted as controlled aliases

---

## 1. Context

W3-0 capability preflight confirmed two Owner-approved models:

| Model alias | requestedModelId | returnedModelId | weight_version |
|-------------|------------------|-----------------|----------------|
| agnes-2.0-flash | `agnes-2.0-flash` | `agnes-2.0-flash` | `default` (floating) |
| deepseek-v4-flash | `deepseek-v4-flash` | `DeepSeek-V4-Flash` | N/A (case-normalized) |

**Neither model provides an immutable pinned snapshot.** §12.3 line 707 requires
"at least one pinned model snapshot per family." This ADR documents how the
Integration Beta proceeds with floating aliases under controlled conditions,
without falsely claiming pinned snapshots.

---

## 2. Decision

### 2.1 Controlled alias, not pinned snapshot

The two Owner-approved model aliases are classified as **controlled aliases**,
not pinned snapshots. A controlled alias is a floating alias operated under
frozen configuration controls that maximize reproducibility without claiming
immutability.

### 2.2 Identity classification and normalization

#### 2.2.1 Approved model list

Only two models are approved. There is no third model, variant, family, or subgroup.

| requestedModelId | canonicalModelId |
|------------------|------------------|
| `agnes-2.0-flash` | `agnes-2.0-flash` |
| `deepseek-v4-flash` | `deepseek-v4-flash` |

#### 2.2.2 Returned model ID normalization

The provider may return model field values that differ from the requested
alias. These are classified as **provider model-field anomalies**, not as
distinct models. The raw returnedModelId is always retained in the private
attempt ledger; the canonicalModelId is derived from the requestedModelId
mapping, never from the raw returned value.

**Agnes normalization:**

| Raw returnedModelId | canonicalModelId | anomaly | anomalyCode |
|---------------------|------------------|---------|-------------|
| `agnes-2.0-flash` | `agnes-2.0-flash` | false | — |

**DeepSeek normalization:**

| Raw returnedModelId | canonicalModelId | anomaly | anomalyCode |
|---------------------|------------------|---------|-------------|
| `DeepSeek-V4-Flash` | `deepseek-v4-flash` | false | — |
| `DeepSeek-V4-Flash_Ari` | `deepseek-v4-flash` | true | `provider_model_field_anomaly` |

Only these two exact DeepSeek raw returned values are permitted. Any other
raw returned value triggers the stop rule (§2.5).

`_Ari` is NOT a model, variant, family, subgroup, or serving variant. It is
a provider model-field anomaly — a metadata string appended by the provider's
backend. It does not enter the model allowlist. It is not normalized away by
wildcard suffix matching.

#### 2.2.3 Classification criteria

| Classification | Definition | Action |
|---------------|------------|--------|
| `identity_match` | requestedModelId == returnedModelId (exact) | Continue |
| `provider_model_field_anomaly` | Raw returned value maps to canonicalModelId but differs in representation; anomaly=true | Record anomaly, continue, report in metadata quality |
| `model_substitution` | Returned ID cannot be mapped to the requested model's canonical ID | **Immediate stop** |

Mapping is performed against the exact tables in §2.2.2. No wildcard suffix
normalization is permitted. Only the two listed DeepSeek raw values are
accepted; any other string (including but not limited to new suffixes) triggers
the stop rule.

#### 2.2.4 Anomaly reporting

- Anomaly count is reported separately as **provider metadata quality**, not
  as model identity.
- Anomalies do NOT cause samples to be excluded from the D5 denominator.
- Anomalies do NOT cause cherry-picking or selective sample removal.
- Public reports do NOT mention a third model or variant.

### 2.3 Frozen configuration controls

The following are frozen for the entire W3 evaluation epoch:

| Control | Frozen value |
|---------|-------------|
| Endpoint family | Owner-approved endpoint (OpenAI-compatible protocol) |
| Adapter | Host-only adapter (`host-adapter.js`), no Core modification |
| Request schema | OpenAI chat completions format (messages, max_tokens, temperature, stream) |
| Sampling | temperature, maxTokens as specified per generation |
| Template hash | `narrative-v1` template content hash |
| Grounding hash | Per-generation grounding package hash |
| Model aliases | `agnes-2.0-flash`, `deepseek-v4-flash` only |

### 2.4 Collection epoch

- Held-out collection is limited to **one epoch, maximum 24 hours**.
- The epoch has a **start canary** (first 2 calls per model verified for
  identity fingerprint) and **end canary** (last 2 calls per model verified).
- Identity fingerprint = `{requestedModelId, canonicalModelId, rawReturnedModelId, anomaly}`.
- If any canary shows `model_substitution`, the epoch is invalidated.
- Provider model-field anomalies do NOT invalidate the epoch.

### 2.5 Identity fingerprint check cadence and stop rules

- Every **25 calls** per model, an identity fingerprint check is performed.
- The following returnedModelId values trigger **immediate stop**:
  - Returned ID clearly belongs to a different model (e.g., requested DeepSeek, returned Agnes)
  - Returned ID is empty and the response contract requires it
  - Returned ID cannot be mapped to the current requested model
  - Returned ID has a new structure not in the exact permitted raw value list (§2.2.2)
- The following do NOT trigger stop:
  - `DeepSeek-V4-Flash` (permitted raw value, anomaly=false)
  - `DeepSeek-V4-Flash_Ari` (permitted raw value, anomaly=true, `provider_model_field_anomaly`)
- Anomaly count is accumulated and reported, but does not pause collection.

### 2.6 Epoch isolation

- Different identity epochs **must not be merged**.
- If collection spans multiple epochs (e.g., due to stop rule trigger and restart),
  each epoch's results are reported separately.
- The public report must disclose which epoch each result belongs to.

### 2.7 Public disclosure requirement

All public reports must include this non-claim:

> "The models used in this evaluation are controlled aliases, not immutable
> pinned snapshots. The provider may update model weights during the
> evaluation epoch. requestedModelId and raw returnedModelId are recorded per
> attempt. canonicalModelId is derived from the requested-model mapping.
> Identity fingerprints are checked at start, end, and every 25 calls.
> Provider model-field anomalies are reported as metadata quality, not as
> model identity. Results are epoch-bound and must not be interpreted as
> reproducible across different model weight versions."

Public reports must NOT mention a third model, variant, subgroup, or serving
variant. Provider model-field anomalies are reported as an aggregate count
under provider metadata quality, without disclosing raw anomalous strings.

---

## 3. Non-goals

- This ADR does not claim the models are pinned or immutable.
- This ADR does not relax the §12.3 sampling floors (300 total, 50 per stratum).
- This ADR does not relax the Wilson bound methodology.
- This ADR does not permit merging results across different identity epochs.
- This ADR does not permit using any model not in the Owner-approved list.
- This ADR does NOT classify provider model-field anomalies as models,
  variants, families, subgroups, or serving variants.
- This ADR does NOT permit wildcard suffix normalization.
- This ADR does NOT allow anomalies to cause sample exclusion or D5 denominator
  modification.

---

## 4. Migration

- §12.3 line 707 "at least one pinned model snapshot per family" is
  superseded by this ADR's controlled alias protocol for W3.
- The original requirement remains the gold standard; this ADR is a
  scoped exception for the Integration Beta with Owner approval.
- If a future wave gains access to pinned snapshot models, this ADR
  should be superseded back to the original requirement.

---

## 5. Relationship to other documents

| Document | Relationship |
|----------|-------------|
| §12.3 line 707 | Superseded for W3 (controlled alias replaces pinned snapshot) |
| IB_PROVIDER_ADAPTER_BOUNDARY.md | Aligned (Host-owned adapter, frozen request schema) |
| IB_EVALUATION_BUNDLE_CONTRACT.md | Aligned (blinded outputs, no provider identity in public) |
| W3-0_PREFLIGHT_FINAL_REPORT.md | Source of drift evidence (10/20 representation mismatch) |
