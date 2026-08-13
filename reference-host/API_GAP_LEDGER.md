# API Gap Ledger — Integration Beta W1

> **Status:** W1 evidence collection
> **Source:** `reference-host/` diagnostic runs against packed artifact
> **Scope:** Gaps discovered when consuming Andy Engine through its public
> exports only. No internal access permitted.

## Gap numbering

Gaps are prefixed `A` (observability/architecture) to distinguish from the
roadmap §1.2 `G`-series gaps. Numbers continue from the P0 mapping
(A1–A5).

## Resolution tracking (RFC W0 / Patch A)

Each gap entry SHOULD carry a `Resolution` block with structured fields so
that resolved gaps can be filtered out of the active Gap count:

| Field | Meaning |
| --- | --- |
| `status` | `open` \| `resolved` \| `wontfix` |
| `resolvedBy` | RFC workstream / patch that closed it (e.g. `W4 / Patch D2`) |
| `verifiedAt` | ISO date of the verification run |
| `engineCommit` | git sha the resolution was verified against |
| `evidence` | one-line pointer to the test / manifest that proves resolution |

A gap without a `Resolution` block defaults to `status: open`. Resolved
gaps remain in this ledger for audit history but MUST NOT be counted as
current Gap evidence (DEEP_AUDIT P2-6).

---

## A1 — effect/trace observability gap

- **Severity:** Observability gap (not a writeback defect)
- **Discovered:** P0 mapping, confirmed P2 Caliper
- **Resolution:**
  - `status:` resolved (partial — effectSummary now observable; full delta receipt tracked in W4 / Patch D2)
  - `resolvedBy:` A1 observability via runtime A1 instrumented commit; full receipt pending W4
  - `verifiedAt:` 2026-08-12
  - `engineCommit:` bded50c
  - `evidence:` `reference-host/test/evaluation-bundle.test.js` "evidence chain includes effectSummary from A1" (13/13 pass via `reference-host:verify`)
- **Evidence (W1):**
  - `host-runner.js` runs `engine.runTicks(count)` and inspects `TickResult`
  - `TickResult` contains phase keys but does NOT expose committed
    `EffectResult` or delta summaries
  - In `src/runtime/AndyWorld.js`, 5 `EffectCommitter.commit()` call sites:
    3 capture+inspect errors internally (L660, L755, L873),
    2 fallback paths discard the return (L268, L561)
  - None expose committed results through the public tick/API result
- **Host evidence record:** `segmentRecords[].gaps[].id = 'A1'` with status `not_observable_via_public_api`
- **Impact:** Integration Host cannot verify which typed deltas were
  committed in a given tick. Must rely on post-hoc state comparison.
- **Proposal target:** W4 (additive API proposal via §14.3 decision test)
- **W1 action:** Record gap, do NOT implement TickResult extension

---

## A2 — live Agent/read-model risk

- **Severity:** Observability gap
- **Discovered:** P0 mapping
- **Evidence (W1):**
  - `engine.snapshot()` returns a lightweight mutable snapshot
  - `engine.toJSON()` returns full mutable state
  - Neither provides a versioned, content-hashed, immutable projection
  - `toWorldState()` wraps `toJSON()` output in an envelope but the
    `runtimeSnapshot` remains mutable and not content-hashed
- **Impact:** Host cannot produce a content-addressable evidence chain
  without computing its own hash of the full snapshot
- **Proposal target:** W4 (ADR-IB-015 evidence-gated: W1/W4)
- **W1 action:** Record gap, compute ad-hoc hash in Host artifacts

---

## A3 — movement/external-event command gap

- **Severity:** API gap (positions set internally by EffectCommitter only)
- **Discovered:** P0 mapping
- **Evidence (W1):**
  - Host cannot instruct an agent to move to a specific region via public API
  - Position changes occur only through the EffectPipeline → EffectCommitter path
  - The old longitudinal demo used `engine.world.regions.place()` (internal)
  - No public equivalent exists
- **Impact:** Host cannot drive intentional relocation events for scenario
  design; must rely on natural simulation dynamics
- **Proposal target:** W4 (ADR-IB-014 evidence-gated: W1/W4)
- **W1 action:** Record gap, accept natural position dynamics

---

## A4 — evaluation-bundle capability gap

- **Severity:** API gap
- **Discovered:** P0 mapping
- **Evidence (W1):**
  - Host cannot inject a specific event intent (e.g., "Alice observes Bob
    at the tavern") through public API
  - Events are produced only through the internal CanonEventPipeline
  - `engine.getNarrative()` produces narrative text but does not create events
- **Impact:** Host cannot force specific event sequences for controlled
  epistemic testing; must rely on natural simulation dynamics
- **Proposal target:** W4 (ADR-IB-014 evidence-gated: W1/W4)
- **W1 action:** Record gap, accept natural event dynamics

---

## A5 — buffered streaming limitation

- **Severity:** Latency / UX limitation
- **Discovered:** W1 diagnostic run
- **Evidence (W1):**
  - `engine.runTicks(count)` blocks until all `count` ticks complete
  - `engine.tick()` returns a single tick result, but there is no streaming
    or buffering mechanism to deliver partial results mid-tick
  - The engine produces complete tick results only after all phases complete
  - There is no mechanism for a Host to receive partial/streaming results
    during a tick (e.g., after agent think but before effects commit)
- **Host evidence record:** `segmentRecords[].gaps[].id = 'A5'` with status `not_observable`
- **Impact:** This limits the Host's ability to implement responsive UI or
  time-boxed observation. A Host cannot display intermediate agent states
  (e.g., "agent is thinking…") without external async coordination.
- **Proposal target:** W4 (additive streaming API proposal via §14.3 decision test)
- **W1 action:** Record gap, do NOT implement streaming infrastructure

---

## Decision test (§14.3) pre-assessment

For each gap, the §14.3 decision test asks:

1. Does the gap block a Beta exit criterion? → A1 borderline (D4 causality
   writeback), A2–A5 no (observational / latency only)
2. Is there a public-API workaround? → A1: post-hoc snapshot comparison;
   A2: ad-hoc hashing; A3–A4: rely on natural dynamics; A5: batch ticks
   and poll between runs
3. Does closing the gap freeze a previously unstable surface? → All: no,
   these are additive-only proposals
4. Is the gap evidence-gated? → A1: W1 evidence → W4 proposal; A2–A5:
   already gated per ADR-IB-014/015

No W1 action beyond recording. All additive API proposals deferred to W4.
