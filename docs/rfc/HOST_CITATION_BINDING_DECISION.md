# Host citation binding decision

**Status:** Accepted architecture decision

## Decision

Andy Engine does not require a language model to emit internal fact IDs in a
narrative. A Host that needs citations obtains them after generation by calling
the public `checkConsistency()` API and consuming its `evidenceTrace`.

Each fact-bound trace entry is a deterministic binding from a checked claim to
its support status and, when supported, to `factId`. Self-attested source and
time markers intentionally have no backing fact ID. This is an evidence projection:
it does not create facts, change knowledge, or repair an unsupported claim.

## Rationale

Internal fact IDs are implementation identifiers. Requiring a model to repeat
them accurately makes an integration metric partly measure citation syntax and
identifier recall rather than whether the narrative is grounded. The engine
already has the correct ownership split:

```text
Host produces or receives narrative text
  -> AndyEngine.checkConsistency()
  -> GroundingChecker / EvidenceBinder bind claims to allowed facts
  -> Host consumes evidenceTrace for citations or audit metadata
```

The Host may present citations, record them privately, or treat unsupported
claims as a safe-silence decision. It must not infer a fact ID when the trace
does not provide one.

## Boundaries

- This does not add a model-facing fact-ID protocol.
- This does not create a new Engine Core write path or alter world truth.
- `evidenceTrace` is a diagnostic, read-only projection; it is not a commit
  receipt and must not be used to claim an effect was applied.
- A model-provided citation field, if a Host chooses to request one, is an
  optional Host-level compliance signal and must be reported separately from
  semantic grounding.

## Evaluation consequence

Future evaluations must not equate an unknown model-provided grounding ID with
a semantic hallucination. They should distinguish semantic faithfulness from
citation-protocol compliance, and may use the Engine's post-generation
evidence trace as the authoritative citation binding.
