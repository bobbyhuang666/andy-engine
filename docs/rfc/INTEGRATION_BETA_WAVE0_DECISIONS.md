# Integration Beta Wave 0 Decisions

> **Status:** Accepted for P2 architecture planning
> **Date:** 2026-07-23
> **Baseline:** `b0b5116`
> **Authority:** repository owner instruction to act on the Wave 0 decision card

These decisions unblock architecture documentation only. They do not authorize
Core changes, new public APIs, real-provider calls, private-corpus collection,
or npm publication.

## Accepted decisions

| ADR | Decision | Planning constraint |
|---|---|---|
| ADR-IB-001 | Use an in-repository `reference-host/` workspace for Beta | Install and run the packed tarball; move the Host to a separate repository before Production Candidate |
| ADR-IB-003 | Report public synthetic D5 and real-LLM D5 separately | Synthetic checker is Pass; real-LLM outcome remains Warning / not evaluated |
| ADR-IB-005 | Keep Facts opt-in | The Host sets `enableFacts: true`; the engine default remains `false` |
| ADR-IB-006 | Adopt Roadmap Section 12 thresholds provisionally | Freeze before unblinding; use two-sided 95% Wilson intervals and the stated directional bounds |
| ADR-IB-012 | Tavern is the seven-day primary domain; campus is the second-domain diagnostic | Both are Host-selected existing presets; no domain semantics enter Core |
| ADR-IB-013 | Use explicit catch-up scheduling | The Host drives `runTicks()` / `advanceTo()` and owns checkpoint, retry, and idempotency policy |

ADR-IB-002 remains evidence-gated: P2 records gaps, W1 gathers Host evidence,
and W4 may consider narrow additive commands. Internals such as dispatcher and
regions are never proposed as public surfaces.

The following ADRs are also evidence-gated and are recorded here so the Wave 0
ledger is complete. None authorizes a Core change, a public API, or a real
provider call in P2 or W1:

| ADR | Disposition | Earliest wave |
|---|---|---|
| ADR-IB-014 | Movement and external-event-intent commands are recorded as W1 gaps; narrow typed commands may be proposed only after the API decision test and W4 evidence | W1 / W4 |
| ADR-IB-015 | Public read model leans toward immutable projections; `getAgent()` compatibility is retained until evidence supports a public change | W1 / W4 |
| ADR-IB-016 | Streaming keeps buffered validate-before-exposure; incremental safe protocol is deferred unless measured latency blocks Beta | W3 |

These rows restate the provisional positions below and do not supersede them.

## Provider decision boundary

The evaluation compares an OpenAI family and an Anthropic family because those
adapter families already exist. This is a family-level planning choice, not an
authorization to call a provider or a claim that the current adapter defaults
are the evaluation models.

- P2 spend budget is zero.
- Before W3, the owner must approve exact pinned model identifiers, maximum
  spend, request limits, and then-current provider retention terms.
- Only configurations with training disabled and retention acceptable to the
  owner may be used.
- Provider credentials, routing, retry budgets, and model selection belong to
  the Host and must not enter Engine Core or public evidence.

## Private evaluation governance

The reserved private root is:

```text
/Users/huangweijie/Documents/andy-engine-private-eval
```

It is outside the public repository and is not created or populated by P2.

- **Owner:** repository owner.
- **Raw access:** owner-only until a written reviewer allowlist exists.
- **Raw prompts and provider output:** delete within 30 days of collection, or
  earlier after adjudication and aggregate verification.
- **Private labels and adjudication records:** retain for at most 180 days.
- **Aggregate, non-reconstructable metrics:** may be retained indefinitely.
- **Publication authority:** repository owner alone until explicitly delegated.
- **Public export:** generated from an aggregate projection; never produced by
  copying a private report and deleting rows.

No real LLM output may be collected until the W3 model, budget, provider-policy,
and reviewer allowlist record is approved.

## Provisional product positions

| Topic | P2 position |
|---|---|
| Safe silence | Keep it for Beta; consider constrained rewrite only if W3 false-block evidence requires it |
| Agent reads | Design toward immutable projections; retain `getAgent()` compatibility until evidence supports a public change |
| Movement / external events | Record as W1 gaps; consider narrow typed intent commands only after the API decision test |
| Streaming | Keep validate-before-exposure buffered semantics unless measured latency blocks Beta |
| Facts / Knowledge | Freeze only a minimal public projection required by grounding, and only after W1/W4 evidence |

## Superseding a decision

The owner may supersede any planning decision in writing. A superseding record
must name the ADR, rationale, affected packets, and whether existing evidence
must be rerun. Completed constraints in Roadmap Section 1.3 remain closed unless
there is regression evidence or an explicit migration decision.
