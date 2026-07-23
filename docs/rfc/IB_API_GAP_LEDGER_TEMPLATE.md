# Integration Beta API Gap Ledger Template

> **Status:** P2 template
> **Rule:** record evidence in W1; do not turn a hypothetical gap into an API

## Entry template

```text
Gap ID:
Observed in run/segment:
Host goal:
Current public APIs attempted:
Observed limitation:
Required world operation or observation:
Why this is not a request to own internal state:
Available workaround:
Evidence artifacts:
Affected contract:
Risk if deferred:
Proposed disposition: defer / documentation / Host-only / public proposal
```

## Mandatory API decision test

A gap may become a W4 public proposal only when all six questions have
evidence-backed answers:

1. Is the Host trying to perform a legitimate world operation, rather than
   taking ownership of an internal object?
2. Is the operation impossible through the current documented public surface?
3. Does the proposal preserve Canon, Knowledge, Action, and Effects ownership?
4. Can it be additive, typed, and return an immutable projection?
5. Can persistence, domain portability, and packed-consumer behavior be tested?
6. Can the operation remain stable without freezing internal representation?

Questions 3–5 are mandatory. If any fails, the proposal is rejected or returned
to Host design.

## Seed gaps

| ID | Current evidence | P2 disposition |
|---|---|---|
| A1 | Commit results are not exposed through the public tick/API result; three of five runtime call sites inspect errors internally and two discard results | Observe in W1; do not infer missing writeback |
| A2 | Stable `getAgent()` returns a live object that permits accidental mutation | Slice avoids mutation; evaluate immutable read projection |
| A3 | No stable command expresses placement or an externally initiated world event | Record concrete Host need; never expose dispatcher or regions |
| A4 | No public eval-bundle API joins action, event, effect, knowledge, grounding, and exposure evidence | Use manifest gaps honestly; do not reconstruct via internals |
| A5 | `chatStream()` validates after buffering the complete response | Preserve validate-before-exposure unless measured latency blocks Beta |

## Evidence requirements

Every gap entry cites:

- packed package identity;
- scenario and run IDs;
- public APIs attempted;
- relevant redacted evidence record;
- expected versus observed behavior;
- whether the issue blocks the diagnostic, seven-day run, or only convenience.

Characterization tests that inject memory, relationships, facts, or internal
events do not count as Host evidence.

## Proposal flow

```text
W1 observed gap
  → architect classification
  → decision test
  → independent audit
  → W4 additive proposal, Host-only solution, documentation, or defer
```

P2 and W1 do not authorize implementation of a proposed public API.
