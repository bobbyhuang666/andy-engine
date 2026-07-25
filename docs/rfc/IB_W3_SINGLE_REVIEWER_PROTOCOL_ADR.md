# IB W3 Single Reviewer Protocol ADR

> **Status:** Accepted (W3-1 Readiness Hardening)
> **Date:** 2026-07-25
> **Supersedes:** §12.3 lines 727-729 (double-review, adjudication, inter-rater agreement)
> **Author:** Integration Beta chief architect AI
> **Owner decision:** Reviewer allowlist = repository-owner only; single reviewer protocol

---

## 1. Context

§12.3 lines 727-729 require:
- double-review at least 20% of cases
- adjudicate all reviewer disagreements
- report inter-rater agreement

The Owner has decided that the reviewer allowlist contains only the
repository owner. There is no second approved reviewer. The double-review
and inter-rater agreement requirements cannot be satisfied as written.

This ADR documents a **single reviewer protocol** that preserves evidence
integrity without a second reviewer, while explicitly disclosing the
limitation.

---

## 2. Decision

### 2.1 Single reviewer initial review

The repository Owner performs **100% initial review** of all evaluation
cases. No case is excluded from initial review.

### 2.2 Delayed blind re-review

To substitute for inter-rater double-review, the Owner performs a
**delayed blind re-review** of a randomized subset:

| Parameter | Value |
|-----------|-------|
| Re-review coverage | At least **30%** of all cases (frozen-seed random selection) |
| Critical case coverage | **100%** of critical cases (severity = critical) |
| Minimum delay | At least **72 hours** between initial and re-review |
| Blinding | Second review does NOT show: first review labels, checker results, provider identity |
| Disagreement handling | Third **reconciliation** review (also by Owner, with both labels visible) |

### 2.3 Frozen-seed random selection

The 30% re-review subset is selected using a **frozen-seed** RNG:
- Seed is committed to the private manifest before unblinding
- Selection is deterministic given the seed
- The seed and selection algorithm are recorded in the private evaluation manifest

### 2.4 Intra-rater consistency, not inter-rater agreement

- **Do NOT report inter-rater agreement.** There is only one reviewer.
- **DO report intra-rater consistency**: the agreement rate between the
  Owner's initial review and delayed blind re-review.
- Intra-rater consistency is reported as:
  - Percent agreement on disposition (pass/rewrite/reject)
  - Percent agreement on severity classification
  - Disagreement count and reconciliation outcomes
- Intra-rater consistency is **not** treated as proof of correctness.
  It is a quality indicator for the single-reviewer protocol.

### 2.5 Public disclosure requirement

All public reports must include this limitation statement:

> "This evaluation used a single-reviewer protocol (reviewer allowlist =
> repository owner). Inter-rater agreement is not reported because only
> one reviewer is approved. Intra-rater consistency was measured via
> delayed blind re-review of at least 30% of cases (frozen-seed selection,
> minimum 72-hour delay). This is a weaker evidence standard than
> dual-reviewer double-review. D5 thresholds and Wilson bound methodology
> are not reduced."

### 2.6 Thresholds not reduced

- §12.3 sampling floors (300 total, 50 per stratum) — **unchanged**
- §12.3 Wilson bound methodology (two-sided 95%) — **unchanged**
- §12.3 recall gates (lower bound) — **unchanged**
- §12.3 error/leak/false-block gates (upper bound) — **unchanged**
- §12.3 anti-gaming rules — **unchanged**

The single-reviewer protocol affects evidence strength, not statistical
thresholds. A single-reviewer PASS is a weaker claim than a dual-reviewer
PASS, but the numerical gates remain the same.

---

## 3. Superseded §12.3 requirements

| §12.3 line | Original requirement | Replacement |
|------------|---------------------|-------------|
| 727 | "double-review at least 20% of cases, including every critical case" | Single reviewer 100% initial + 30% delayed blind re-review + 100% critical re-review |
| 728 | "adjudicate all reviewer disagreements before computing the final gate" | Disagreements trigger third reconciliation review; all disagreements resolved before final gate |
| 729 | "report inter-rater agreement without treating agreement alone as correctness" | Report intra-rater consistency (initial vs delayed blind); do not report inter-rater agreement; consistency not treated as correctness |

---

## 4. Documents updated by this ADR

### 4.1 INTEGRATION_BETA_ROADMAP.md §12.3

Lines 727-729 are superseded by Section 3 of this ADR. The roadmap should
add a cross-reference to this ADR.

### 4.2 INTEGRATION_BETA_WAVE0_DECISIONS.md

ADR-IB-004 ("Private evaluation authority and retention") references
"approved reviewers." This ADR clarifies that the current approved
reviewer allowlist contains only the repository owner.

### 4.3 IB_ARTIFACT_BOUNDARY.md

No changes required (does not reference reviewer methodology).

### 4.4 IB_EVALUATION_BUNDLE_CONTRACT.md

No changes required (blinding rules already support single-reviewer
re-review by removing provider identity from blinded outputs).

### 4.5 W3 Owner Approval Packet

The Owner Approval Packet (when created) must record:
- reviewer allowlist = [repository-owner]
- protocol = single-reviewer with delayed blind re-review
- this ADR as the governing document

---

## 5. Non-goals

- This ADR does not reduce D5 numerical thresholds.
- This ADR does not eliminate re-review (30% + 100% critical remains).
- This ADR does not permit AI to act as a reviewer.
- This ADR does not permit merging review rounds without 72-hour delay.
- This ADR does not claim single-reviewer evidence is equivalent to
  dual-reviewer evidence.
- This ADR does not relax blinding requirements (provider identity remains
  hidden during re-review).

---

## 6. Relationship to W3-H gate

This ADR **enables** W3-H to proceed with a single reviewer, but does not
**authorize** W3-H execution. W3-H remains BLOCKED until:
1. This ADR is accepted (done)
2. Controlled Model Alias ADR is accepted (done)
3. Persistent budget tracker is verified (W3-1 task)
4. Owner explicitly fills the W3 Owner Approval Packet
5. Owner explicitly authorizes W3-H execution

Silence, default values, or architect recommendations do not constitute
W3-H authorization.
