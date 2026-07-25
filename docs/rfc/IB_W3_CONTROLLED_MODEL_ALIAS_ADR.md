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

### 2.2 Identity representation mismatch classification

The DeepSeek case difference (`deepseek-v4-flash` → `DeepSeek-V4-Flash`) is
classified as **identity_representation_mismatch**, not model_substitution.

Classification criteria:

| Classification | Definition | Action |
|---------------|------------|--------|
| `identity_match` | requestedModelId == returnedModelId (exact) | Continue |
| `identity_representation_mismatch` | Same model family, different string representation (case, formatting) | Record, continue, flag for review |
| `model_substitution` | Different model family or completely different ID | **Immediate stop** |

The classification is determined by:
1. Normalize both IDs to lowercase, strip version suffixes
2. If normalized IDs match → `identity_representation_mismatch`
3. If normalized IDs differ → `model_substitution`

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
- Identity fingerprint = `{requestedModelId, returnedModelId, normalizedMatch}`.
- If any canary shows `model_substitution`, the epoch is invalidated.

### 2.5 Identity fingerprint check cadence

- Every **25 calls** per model, an identity fingerprint check is performed.
- If the fingerprint changes from the epoch's baseline fingerprint,
  collection **pauses immediately**.
- A fingerprint change is defined as:
  - `identity_match` → `identity_representation_mismatch` (warning, continue)
  - `identity_representation_mismatch` → `model_substitution` (stop)
  - Any new returnedModelId not seen in the baseline (stop)

### 2.6 Epoch isolation

- Different identity epochs **must not be merged**.
- If collection spans multiple epochs (e.g., due to drift pause and restart),
  each epoch's results are reported separately.
- The public report must disclose which epoch each result belongs to.

### 2.7 Public disclosure requirement

All public reports must include this non-claim:

> "The models used in this evaluation are controlled aliases, not immutable
> pinned snapshots. The provider may update model weights during the
> evaluation epoch. requestedModelId and returnedModelId are recorded per
> attempt. Identity fingerprints are checked at start, end, and every 25
> calls. Results are epoch-bound and must not be interpreted as reproducible
> across different model weight versions."

---

## 3. Non-goals

- This ADR does not claim the models are pinned or immutable.
- This ADR does not relax the §12.3 sampling floors (300 total, 50 per stratum).
- This ADR does not relax the Wilson bound methodology.
- This ADR does not permit merging results across different identity epochs.
- This ADR does not permit using any model not in the Owner-approved list.

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
