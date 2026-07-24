# IB W4 Contract Decisions — A1–A5 Verdicts

> **Status:** Phase 1 architect synthesis
> **Author:** Integration Beta chief architect AI
> **Date:** 2026-07-24
> **Input:** Atlas A1–A5 baseline map, Audit §14.3 decision test, Owner W4 brief
> **Method:** §14.3 six-question decision test + Owner disposition baseline reconciliation

---

## 0. Preamble

This document records the architect's final verdicts for API gaps A1–A5,
answering the §14.3 decision test for each gap and reconciling audit
recommendations with the Owner's stated dispositions.

**Key principle from Owner brief:** "不要为了关闭 gap 一次性新增一组 API"
— only implement the minimum additive contract supported by real W1/W2 evidence.

**§1.3 baseline constraint:** Current EffectCommitter.commit() call sites do
not expose committed results through the public tick/API result. This is
tracked as an evidence/observability gap, not a writeback defect. Any
proposal to change canonical writeback paths requires new regression evidence
or an explicit ADR.

---

## 1. A1 — Effect/Trace Observability

### §14.3 Decision Test

| # | Question | Answer |
|---|----------|--------|
| 1 | Is the host asking for a legitimate world operation or for internal state ownership? | **Legitimate world operation.** The Host needs to observe what happened in a tick (which deltas were committed), not to own or mutate internal state. The canonical loop already produces this data; it is merely discarded at 5 call sites. |
| 2 | Can an existing public operation express the intent? | **No.** Post-hoc `snapshot()` comparison can infer net state change, but cannot distinguish applied vs skipped vs errored deltas within a single tick. W1/W2 evidence uses this workaround and marks the field `not_observable/A1`. |
| 3 | Does the operation preserve Canon/Knowledge/Action/Effects ownership? | **Yes.** Read-only projection of commit receipts. Canon retains fact authority; Knowledge retains epistemic authority; Action retains candidate selection; Effects retains delta application. No ownership transfer. |
| 4 | Can it be additive and typed? | **Yes.** Adding a `phase.effectSummary` field to TickResult is strictly additive. The shape is `{counts: {applied: number, skipped: number, errored: number}, byType: Record<DeltaType, number>}` — summary counts only, no raw delta objects. |
| 5 | Can its persistence and domain behavior be tested? | **Yes.** The counts are deterministic given the same seed and world state. Domain behavior is irrelevant (counts are domain-agnostic). |
| 6 | Would exposing it force an internal representation to become stable? | **No.** The projection is summary counts by delta type, not the delta shapes themselves. Internal delta structure may evolve without breaking the count projection. |

**Questions 3–5 satisfied.** ✅ Proceeds.

### Verdict: **ACCEPT** — minimum additive contract

**Rationale for ACCEPT (over Audit's DEFER):**
The Audit verdict was DEFER on grounds of "needs implementation cycle." This
conflates implementation readiness with decision readiness. The §14.3 test
asks whether the proposal *can* be additive, typed, and tested — not whether
we have bandwidth today. The Owner designated A1 as an ACCEPT candidate, and
all six §14.3 questions pass. The W1/W2 evidence is concrete: `not_observable/A1`
appears across `resource-characterization.json`, `evidence-quality.json`, and
every `segmentRecord.gaps[]` entry. Deferring would leave the Host unable to
verify committed effects without fragile post-hoc snapshot diffing.

### Minimum scope

Add to `TickResult.phase`:

```ts
interface TickEffectSummary {
  counts: {
    applied: number;
    skipped: number;
    errored: number;
  };
  byType: Partial<Record<
    'need' | 'emotion' | 'memory' | 'relationship' |
    'position' | 'locationMeaning' | 'futureTendency',
    { applied: number; skipped: number }
  >>;
}
```

- Aggregate across all 5 commit call sites within `step()`.
- Do NOT expose raw delta objects or EffectCommitter return values.
- Do NOT add per-agent or per-event granularity (future scope, if evidenced).
- Only populate when `counts.applied + counts.skipped + counts.errored > 0`
  (most ticks have effects; zero-effect ticks omit the field).

### Explicit non-goals

- Per-event or per-agent delta trace in TickResult.
- Exposing raw delta shapes through public API.
- Changing EffectCommitter.commit() return contract.
- Adding a `getDeltaHistory()` or `getEffectLog()` method.
- Making step() async or callback-driven.

### Migration / backward compatibility

- `TickResult.phase.effectSummary` is optional and additive.
- Existing consumers see no change (new field, no removed fields).
- `index.d.ts` TickResult gains optional `effectSummary?` field.
- No deprecation needed.

### File-level implementation card

| File | Change |
|------|--------|
| `src/runtime/AndyWorld.js` | Aggregate commit counts in `step()`; add `effectSummary` to result |
| `index.d.ts` | Add `TickEffectSummary` interface and `effectSummary?` to `TickResult.phase` |
| `tests/integration/engine.test.js` | Add test verifying `effectSummary` counts match committed deltas |
| New: `tests/phase-effect-observability.test.js` | Dedicated test: seed → tick → verify byType counts |

---

## 2. A2 — Live Agent/Read-Model Risk

### §14.3 Decision Test

| # | Question | Answer |
|---|----------|--------|
| 1 | Legitimate world operation or internal state ownership? | **Borderline.** A versioned/immutable snapshot projection is legitimate for evidence chain integrity. However, the request touches on how the Host *consumes* existing public APIs, not on a missing world operation. |
| 2 | Can an existing public operation express the intent? | **Yes.** `snapshot()` returns a deep-copy status projection. `toWorldState()` wraps it in a Stable Envelope. The Host already computes ad-hoc hashes. W2-F hardened all evidence to use these read-only projections. |
| 3 | Does the operation preserve ownership? | **Yes.** Adding a content hash or version to snapshot is read-only. |
| 4 | Can it be additive and typed? | **Yes.** Adding `schemaVersion` and `contentHash` fields to `snapshot()` output is additive. |
| 5 | Can its persistence and domain behavior be tested? | **Yes.** Content hashing is deterministic. |
| 6 | Would exposing it force an internal representation to become stable? | **RISK.** A content hash computed over the full `snapshot()` output would freeze the snapshot shape. Any field addition/rename in `Agent.getStatus()` or `AndyWorld.snapshot()` would change the hash, breaking evidence chains that depend on hash stability. This is a real stability commitment. |

**Questions 3–5 satisfied.** ✅ Proceeds conditionally.
**Question 6 is a risk** — content hashing over full snapshot freezes internal shape.

### Verdict: **DEFER**

**Rationale for DEFER (over Audit's ACCEPT narrow):**
The Audit recommended ACCEPT narrow (add hash/version to snapshot). However:

1. **W2 evidence already works without it.** The Host completed W2-A through
   W2-F using `snapshot()`/`toWorldState()` with ad-hoc hashing. No W2
   diagnostic failed due to missing content-hash.

2. **§1.3 constraint applies.** "Current effect observability is narrower than
   effect correctness." The gap is observability, not correctness. The Owner's
   disposition was "优先 DEFER, 现有 snapshot/Stable Envelope 已满足 W2."

3. **Hash stability commitment is premature.** Computing a content hash over
   `snapshot()` output freezes the `Agent.getStatus()` and `AndyWorld.snapshot()`
   shapes. With A1 just accepted (adding `effectSummary` to TickResult), and
   potential future extensions to snapshot, committing to hash stability now
   would create unnecessary coupling. Wait until the contract surface is more
   settled.

4. **Cost of deferring is low.** The Host can continue computing its own hashes.
   If a future wave identifies a real blocker (e.g., evidence-chain
   non-repudiation in W3), the ADR can be reopened with new regression evidence.

### Evidence required to reopen

- A W3 diagnostic that fails because ad-hoc hashing is insufficient.
- An evidence-chain integrity test that requires engine-provided content hashes.
- ADR documenting hash stability commitment scope.

### Minimum scope (if reopened in future wave)

- Add `schemaVersion: string` to `snapshot()` output (already exists in
  `toWorldState()` as `CURRENT_SCHEMA_VERSION`).
- Add `snapshotHash: string` (SHA-256 of canonical JSON serialization of
  snapshot, excluding `snapshotHash` field itself).
- This scope requires a separate ADR documenting which snapshot fields are
  stable vs volatile.

---

## 3. A3 — Movement/External-Event Command Gap

### §14.3 Decision Test

| # | Question | Answer |
|---|----------|--------|
| 1 | Legitimate world operation or internal state ownership? | **Borderline.** A "move agent to region X" command is a legitimate scenario-design operation. However, it bypasses the canonical Action→Effect→Committer pipeline, which is the whole point of Andy Engine. |
| 2 | Can an existing public operation express the intent? | **Partially.** `createCharacter({ initialPosition: 'X' })` sets initial position. Natural simulation dynamics produce all subsequent moves. There is no public `moveAgent()` or `injectEvent()` command. |
| 3 | Does the operation preserve ownership? | **RISK.** A `moveAgent()` command would bypass the canonical Action selection and Effect pipeline. Position changes would no longer originate solely from `PositionDelta → EffectCommitter`. This violates the canonical loop's ownership invariant. |
| 4 | Can it be additive and typed? | **Yes, but** — the typing is straightforward, the architecture is not. |
| 5 | Can its persistence and domain behavior be tested? | **Yes, but** — testing would need to verify that injected moves don't corrupt canonical state. |
| 6 | Would exposing it force an internal representation to become stable? | **RISK.** A movement command API would make the "movement originates only from EffectCommitter" invariant a public commitment. Currently this is an internal architectural choice that could evolve. |

**Question 3 is NOT satisfied.** ❌ Does not proceed.

### Verdict: **DEFER**

**Rationale:**
The Atlas map confirmed: "W1/W2 were NOT blocked by lack of movement/event-intent
command." All reference-host diagnostics pass using natural simulation dynamics.
The `told/overheard` NOT_YET_OBSERVED status is caused by missing LLM
integration (W3), not by missing commands.

A3a (movement command) and A3b (external-event injection) both bypass the
canonical loop. Implementing either would require an ADR documenting:
- How injected moves/events coexist with the canonical pipeline.
- Whether injected events produce CanonEvents and FactEmission.
- Priority/conflict resolution when injected and canonical moves conflict.

This is not a W4 decision. It requires architectural design beyond the scope
of contract hardening.

### Evidence required to reopen

- A W3 scenario where natural simulation dynamics cannot produce a required
  epistemic state (e.g., forcing two agents to meet for told/overheard).
- A reference-host diagnostic that fails because agents cannot be relocated.
- ADR documenting canonical-loop bypass architecture.

---

## 4. A4 — Evaluation-Bundle Capability Gap

### §14.3 Decision Test

| # | Question | Answer |
|---|----------|--------|
| 1 | Legitimate world operation or internal state ownership? | **Legitimate capability**, but it belongs to the Host, not the Core. An evaluation bundle assembles public API outputs (narrative, grounding, consistency, snapshot) with private artifacts (raw LLM output, provider metadata, human labels). Engine Core should not own private evaluation logic. |
| 2 | Can an existing public operation express the intent? | **Yes, partially.** All individual inputs exist as public APIs: `getNarrative()`, `getGroundingPackage()`, `checkConsistency()`, `snapshot()`, `getStats()`, TickResult. The gap is the *assembly* of these into a blinded bundle — which is a Host concern. |
| 3 | Does the operation preserve ownership? | **Yes** — when implemented as Host-owned tooling that consumes public APIs. **No** — if implemented as a Core API that exposes internal pipeline state. |
| 4 | Can it be additive and typed? | **Yes.** The Host tooling is entirely additive. No Core API changes required. |
| 5 | Can its persistence and domain behavior be tested? | **Yes.** Host-level tests using public API outputs. |
| 6 | Would exposing it force an internal representation to become stable? | **No** — because it's Host-owned tooling, not a Core API. The Host consumes stable public projections. |

**Questions 3–5 satisfied** for Host-owned implementation. ✅ Proceeds.

### Verdict: **ACCEPT** — as Host-owned tooling

**Rationale for ACCEPT (over Audit's REJECT):**
The Audit rejected A4 on the grounds that "violates Canon ownership; Host
should use scenario design." This misunderstands the Owner's directive. The
Owner explicitly stated: "A4: ACCEPT 为 Host-owned tooling."

The evaluation bundle does NOT inject events or bypass Canon. It assembles
publicly available outputs (narrative, grounding, consistency, snapshot, stats,
TickResult with A1's new effectSummary) into a blinded bundle for automated
metrics and human review. This is a Host-layer concern that:
- Consumes only public API outputs.
- Adds no new Core API surface.
- Does not expose internal pipeline state.
- Follows the roadmap §3.4 evidence chain as an assembly pattern.

The Audit's concern about Canon ownership is valid only if A4 were a Core
API that injected evaluation artifacts back into the simulation. As Host-owned
tooling, it has no such risk.

### Minimum scope

Create `reference-host/src/evaluation-bundle.js`:
- Input: run manifest, tick results, snapshots, grounding packages, consistency checks.
- Output: `{bundleId, worldId, tickRange, characters, evidenceChain, blindedOutputs, metadata}`.
- The bundle assembles but does NOT modify engine state.
- No new Core API required.

The A1 effectSummary (accepted above) directly improves the evaluation bundle's
evidence chain by providing committed-delta counts per tick.

### Explicit non-goals

- Core API for evaluation bundle creation.
- Exposing raw LLM output through Engine Core.
- Exposing provider metadata or human labels through Engine Core.
- Making the evaluation bundle part of the npm package.

### File-level implementation card

| File | Change |
|------|--------|
| New: `reference-host/src/evaluation-bundle.js` | Bundle assembly logic consuming public APIs |
| New: `reference-host/test/evaluation-bundle.test.js` | Tests for bundle creation, blinding, completeness |
| `reference-host/EVIDENCE_INDEX.md` | Update with evaluation bundle artifact documentation |

---

## 5. A5 — Buffered Streaming Limitation

### §14.3 Decision Test

| # | Question | Answer |
|---|----------|--------|
| 1 | Legitimate world operation or internal state ownership? | **Legitimate UX concern**, but not a world operation. Streaming is about delivery latency, not simulation semantics. |
| 2 | Can an existing public operation express the intent? | **Yes.** `runTicks(count)` returns complete results. `tick()` returns a single tick. Polling between `tick()` calls provides incremental delivery. No W1/W2 diagnostic reported latency as a blocker. |
| 3 | Does the operation preserve ownership? | **Yes.** Streaming doesn't change ownership. |
| 4 | Can it be additive and typed? | **Yes, but** — the implementation would require restructuring `step()` to be async/yield-based or callback-driven. This is a fundamental contract change. |
| 5 | Can its persistence and domain behavior be tested? | **Yes, but** — testing async streaming of synchronous simulation phases is complex and adds fragile async paths. |
| 6 | Would exposing it force an internal representation to become stable? | **Yes.** Mid-tick streaming would freeze the phase ordering and phase output shapes of `step()`. Currently these are internal implementation details. |

**Question 6 is NOT satisfied.** ❌ Does not proceed.

### Verdict: **DEFER**

**Rationale:**
All sources agree: A5 has no W1/W2 blocker evidence. The Atlas map shows
tick durations of 0.42ms–1.58ms across 7 days. The roadmap §19 decision #16
states: "buffered validate-before-exposure is sufficient; true token streaming
is not a Beta requirement absent blocker evidence."

Mid-tick streaming would require restructuring `step()` from synchronous to
async/yield-based, changing the fundamental public `tick()` contract. This is
far beyond the scope of contract hardening.

The Owner's disposition was DEFER. The Audit's verdict was DEFER. No
disagreement.

### Evidence required to reopen

- A Host UI that requires sub-tick responsiveness (e.g., real-time dashboard
  displaying agent states mid-tick).
- Latency measurement showing tick() blocks for >100ms on realistic workloads.
- ADR documenting async step() contract change.

---

## 6. Summary Table

| Gap | Verdict | §14.3 Pass | Scope | Reopen Evidence |
|-----|---------|-----------|-------|-----------------|
| A1  | **ACCEPT** | ✅ Q1–Q6 all pass | `TickResult.phase.effectSummary` (counts only) | — |
| A2  | **DEFER** | ⚠️ Q6 risk: hash stability | N/A | W3 evidence-chain integrity failure |
| A3  | **DEFER** | ❌ Q3 fails: canonical bypass | N/A | W3 scenario requiring forced relocation + ADR |
| A4  | **ACCEPT** (Host-owned) | ✅ Q1–Q6 pass as Host tooling | `reference-host/src/evaluation-bundle.js` | — |
| A5  | **DEFER** | ❌ Q6 fails: step() contract freeze | N/A | Sub-100ms UI requirement + ADR |

---

## 7. Implementation Wave

### B1 — A1 Evidence Projection (Core change)

**Owner:** Integration Beta architect
**Files:** `src/runtime/AndyWorld.js`, `index.d.ts`, test files
**Constraint:** Additive only. No existing TickResult field removed or renamed.
**Verification:** `npm test` + `npm run perf:check` + `npm run check:boundaries`

### B2 — A4 Evaluation Bundle (Host change)

**Owner:** Integration Beta architect
**Files:** `reference-host/src/evaluation-bundle.js`, test, EVIDENCE_INDEX.md
**Constraint:** No Core API changes. Consumes public APIs only.
**Verification:** Reference-host tests pass

### B3 — Adversarial Testing

**Owner:** Caliper
**Scope:**
- Verify `effectSummary` counts are consistent with post-hoc snapshot diff.
- Verify evaluation bundle cannot access internal state.
- Verify A1 doesn't leak raw delta shapes.

### Ordering

B1 and B2 may proceed in parallel (no shared files). B3 depends on B1 and B2 completion.

---

## 8. Audit Reconciliation

| Gap | Audit Verdict | Owner Disposition | Architect Verdict | Reconciliation |
|-----|--------------|-------------------|-------------------|----------------|
| A1  | DEFER | ACCEPT candidate | **ACCEPT** | Audit conflated implementation readiness with decision readiness. §14.3 Q1–Q6 all pass. W1/W2 evidence is concrete (`not_observable/A1`). The gap is real and the fix is minimal. |
| A2  | ACCEPT narrow | DEFER | **DEFER** | Audit underestimated Q6 risk (content hash freezes snapshot shape). W2 evidence already works. Low defer cost. |
| A3  | DEFER | DEFER | **DEFER** | All parties agree. No W1/W2 blocker. Q3 canonical bypass is disqualifying without ADR. |
| A4  | REJECT | ACCEPT (Host-owned) | **ACCEPT** (Host-owned) | Audit assumed Core API injection. Owner specified Host-owned tooling. As Host tooling consuming public APIs, Q3 is satisfied. No Canon ownership risk. |
| A5  | DEFER | DEFER | **DEFER** | All parties agree. No blocker evidence. Q6 contract freeze is disqualifying. |

---

## 9. Non-Goals (explicit)

These are explicitly out of scope for W4:

1. Per-event or per-agent delta trace in TickResult.
2. Content hashing or versioning of snapshot() output.
3. Movement command (`moveAgent()`) or event injection API.
4. Streaming or async step() contract.
5. Changes to EffectCommitter.commit() return contract.
6. Changes to Canon/Knowledge/Action/Effects ownership invariants.
7. Any Core API for evaluation bundle creation.
8. Exposing raw LLM output through Engine Core.
9. Changes to §1.3 baseline constraints without ADR.

---

## 10. Conditional Contract Documents

Per W4 brief, the following contract documents shall be written:

- **`docs/rfc/IB_PUBLIC_EVIDENCE_CONTRACT.md`** — Required because A1 is ACCEPTED.
  Specifies the `TickEffectSummary` shape, population rules, and stability commitment.

- **`docs/rfc/IB_EVALUATION_BUNDLE_CONTRACT.md`** — Required because A4 is ACCEPTED
  as Host-owned. Specifies the bundle schema, blinding rules, and private
  artifact boundary.

Both documents must be written before Phase 2 (Caliper decision verification).
