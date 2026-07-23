# Integration Beta Provider Adapter Boundary

> **Status:** Wave 0 / P2 architecture proposal; not an implementation record
> **Scope:** Reference Host provider calls, grounding validation, and D5 evidence
> **Core impact:** none
> **Provider execution:** none performed or claimed by this document
> **Decision dependencies:** ADR-IB-004, ADR-IB-006, ADR-IB-011, ADR-IB-016

## 1. Decision

Integration Beta uses a provider-neutral generation envelope owned by the
Reference Host. The Host owns credentials, provider and model routing, retry
policy, deadlines, rate-limit handling, idempotency, private artifact retention,
and the decision to expose a validated result. Andy Engine remains the source of
world truth and supplies the public grounding and consistency-checking
operations.

The boundary is:

```text
Engine public state
  → getGroundingPackage()
  → Host prompt construction
  → Host Provider Adapter
  → private raw response
  → engine.checkConsistency() synchronously
  → Host disposition policy
  → validated final output or safe fallback
```

Provider responses never create facts, knowledge, memories, relationships,
positions, or other world state. A model may suggest an intent, but only a
separately validated engine command and canonical event may change the world.

This proposal does not promote `LLMAdapter` or `NarrativeBuilder` from their
experimental status in `docs/PUBLIC_API_CONTRACT.md`. It does not add an export,
change the synchronous verifier contract, select exact models, authorize
provider spend, or claim that a real provider has been exercised. The
family-level OpenAI/Anthropic comparison is only a P2 planning decision.

## 2. Ownership boundary

| Concern | Reference Host | Andy Engine Core |
|---|---|---|
| Credential loading and rotation | Owns | Must not receive or persist |
| Provider/model selection and failover | Owns | No product routing policy |
| Request deadline and retry budget | Owns | No Integration Beta retry policy |
| Provider rate-limit interpretation | Owns | No provider-specific behavior |
| Idempotency key and attempt ledger | Owns | May supply stable world/trace IDs |
| Prompt/template assembly | Owns | Supplies permitted grounding data |
| World truth and epistemic visibility | Reads through public APIs | Owns |
| Consistency validation | Calls public synchronous API | Owns checker semantics |
| Final disposition and exposure | Owns policy and delivery | Does not expose raw provider text |
| Raw text and provider logs | Private Host storage only | Must not store them |
| Aggregate D5 export | Produces approved, redacted aggregate | Public synthetic checker remains separate |

The existing experimental `src/sdk/LLMAdapter.js` contains provider transports
and a configurable mechanical retry loop. For the Reference Host evidence path,
hidden transport retries are not allowed: if that adapter is used as a
transport, the Host configures `maxRetries: 0` and performs every retry through
the Host attempt ledger. This is a Host integration rule, not a Core change.
Any later proposal to change or replace the experimental adapter requires
evidence from the W1 API-gap ledger.

## 3. Provider-neutral envelope

The envelope has a public/redacted projection and a private payload. Public
schemas may define the shape, hashes, opaque IDs, reason codes, and aggregates.
Rendered messages, full grounding packages, raw provider output, exact private
provider identifiers, provider request IDs, and reviewer annotations remain
outside the public repository and npm package.

### 3.1 Generation request

The Host creates one logical generation record before making any provider call:

```json
{
  "schemaVersion": "ib.provider-generation/0.1",
  "runId": "opaque-run-id",
  "generationId": "opaque-generation-id",
  "traceId": "opaque-world-trace-id",
  "idempotencyKey": "opaque-host-key",
  "purpose": "grounded-narrative",
  "createdAt": "RFC3339 timestamp",
  "deadlineMs": 30000,
  "modelSnapshot": {
    "publicFamilyId": "family-a",
    "privateSnapshotRef": "private:model-snapshot-id"
  },
  "sampling": {
    "temperature": 0.2,
    "seed": null,
    "seedSupport": "unsupported",
    "maxOutputTokens": 512
  },
  "prompt": {
    "templateId": "narrative-v1",
    "templateVersion": "1.0.0",
    "templateHash": "sha256:...",
    "renderedPromptHash": "sha256:...",
    "messageCount": 2
  },
  "grounding": {
    "packageHash": "sha256:...",
    "evidenceRefs": ["opaque-evidence-id"],
    "factsEnabled": true
  },
  "retryPolicy": {
    "policyId": "host-policy-v1",
    "maxAttempts": 3,
    "maxElapsedMs": 60000
  }
}
```

This is an illustrative schema, not evidence that these values or provider
capabilities have been exercised. Unsupported sampling fields are recorded as
unsupported; they are never silently represented as applied.

The private request payload, keyed by `generationId`, additionally contains the
rendered message bodies and full grounding package required for the call and
later review. The public projection contains their hashes only.

### 3.2 Model snapshot

A private model snapshot is immutable for a generation and records:

- provider family and account/endpoint class;
- exact requested model identifier and provider-returned model identifier;
- provider API version and Host adapter version;
- region or data-processing class when governance requires it;
- supported and applied sampling controls;
- known model revision or snapshot date when the provider supplies one;
- pricing/rate-limit policy snapshot references when required for operations.

Public artifacts use an approved anonymous family ID and an opaque private
snapshot reference. They do not expose credentials, account identifiers,
endpoints, provider request IDs, or operational logs. A model alias without a
provider-confirmed immutable revision is recorded as an alias, not mislabeled as
a pinned snapshot.

### 3.3 Prompt, template, and grounding hashes

Hashes use SHA-256 over canonical UTF-8 bytes. JSON inputs are serialized with
deterministic key ordering and without secrets or transport headers.

- `templateHash` identifies the exact private template source.
- `renderedPromptHash` identifies the complete ordered message list sent on
  that attempt.
- `packageHash` identifies the exact grounding package supplied to prompt
  construction and validation.

Template version is a human-managed semantic version; it does not replace a
content hash. Hashes prove identity within the private evidence system but do
not make private contents public or prove that the content was correct.

### 3.4 Attempt and response record

Each network attempt receives a distinct `attemptId` under one `generationId`:

```json
{
  "schemaVersion": "ib.provider-attempt/0.1",
  "generationId": "opaque-generation-id",
  "attemptId": "opaque-attempt-id",
  "attemptNumber": 1,
  "modelSnapshotRef": "private:model-snapshot-id",
  "startedAt": "RFC3339 timestamp",
  "completedAt": "RFC3339 timestamp",
  "latencyMs": 842,
  "outcome": "success",
  "retryDecision": "none",
  "providerStatusClass": "success",
  "usage": {
    "inputTokens": 420,
    "outputTokens": 96,
    "measurement": "provider-reported"
  },
  "raw": {
    "privateArtifactRef": "private:raw-output-id",
    "sha256": "sha256:...",
    "byteLength": 418,
    "empty": false
  }
}
```

Allowed attempt outcomes are:

```text
success
provider_error
rate_limited
timeout
transport_error
cancelled
empty_output
invalid_response
```

Provider-specific codes and request IDs remain in the private attempt record.
The redacted projection uses only normalized status classes. Token usage states
whether it is provider-reported, Host-estimated, or unavailable.

### 3.5 Retry and idempotency

The Host retry controller:

1. creates the logical `generationId` and idempotency key before attempt 1;
2. records every attempt, including failures and empty output;
3. retries only outcomes allowed by a versioned Host policy;
4. respects both maximum attempts and maximum elapsed time;
5. never counts a failed attempt as a grounding success;
6. does not reuse a completed generation after its final output has been
   exposed;
7. prevents checkpoint/resume from duplicating an already completed external
   generation or exposure event.

Retrying may produce different text and is outside the seeded simulation replay
promise. Each successful retry is validated independently. Provider failover
creates a new immutable model snapshot and remains visible in private evidence.

## 4. Validate before exposure

### 4.1 Non-streaming

For every non-empty successful response, the Host:

1. writes the unmodified raw text to approved private storage;
2. calls the stable synchronous
   `engine.checkConsistency(rawText, characterId, options)`;
3. records checker/template/grounding versions, decision, reason codes,
   evidence trace references, and validation latency;
4. applies the disposition matrix;
5. exposes only the approved final output.

The public contract remains synchronous. A semantic verifier supplied through
`options.verifier` must provide synchronous `verifySync()` or synchronous
`verify()`. A Promise-returning verifier is not awaited and may degrade to the
documented deterministic-only behavior. This boundary does not reinterpret that
degradation as full semantic verification and does not change the verifier
contract.

### 4.2 Streaming

Provider token streams are private transport data. The Host buffers the complete
candidate, validates it, and only then exposes an accepted final result. It must
not forward raw provider tokens while validation is pending.

After validation, a Host may deliver the already-approved final text in chunks
for presentation, but that is buffered delivery, not true token streaming.
Incremental exposure requires a separately approved protocol under ADR-IB-016
that preserves the no-partial-leak invariant. Until then, timeout, stream parse
failure, and zero-token completion follow the same non-exposure disposition as
their non-streaming equivalents.

### 4.3 Rewrite

A constrained rewrite is a new logical generation linked to its rejected
predecessor. It has a new `generationId`, prompt hash, attempt ledger, raw
artifact, and validation decision. The original rejected text is never exposed.
A rewrite may be exposed only after it independently passes validation.

If rewrite policy, budget, or validation fails, the Host uses the approved safe
fallback. A rewrite result cannot inherit the predecessor's pass status.

## 5. Disposition matrix

`checkerDecision` below is a Host-normalized decision derived from the public
consistency result. It is not a change to the result shape of
`checkConsistency()`.

| Provider outcome | Checker decision | Host action | User-visible result | D5 accounting |
|---|---|---|---|---|
| `success`, non-empty | `pass` | accept | validated text | raw and final scored separately |
| `success`, non-empty | `rewrite_required` | create one bounded rewrite generation if policy allows | nothing until rewrite passes; otherwise fallback | original remains raw failure; rewrite gets its own raw score |
| `success`, non-empty | `reject` | reject | approved safe fallback or silence | raw failure; final safety plus fallback rate |
| `success`, non-empty | checker error or indeterminate | fail closed | approved safe fallback or silence | not a pass; report validation failure |
| `empty_output` | not run | stop or retry within budget | approved safe fallback or silence | empty/fallback; never non-fabrication success |
| `timeout` | not run | retry only if policy allows | approved safe fallback or error state | provider failure; never grounding pass |
| `rate_limited` | not run | honor Host backoff/failover policy | approved safe fallback or error state | provider failure, reported separately |
| `provider_error` / `transport_error` / `invalid_response` | not run | retry only if policy allows | approved safe fallback or error state | provider failure, reported separately |
| `cancelled` | not run | no retry unless a new Host operation is created | cancellation | excluded only with visible reason code |

Safe fallback text must not assert new world facts. Whether Beta permits silence
or requires a constrained rewrite remains an owner decision; neither choice may
be used to hide utility loss.

## 6. Raw and final D5 separation

The evidence pipeline maintains two distinct measurement planes.

### 6.1 Raw-output plane

The raw plane evaluates the first complete model candidate before checker,
rewrite, rejection, or fallback. It answers how faithfully the provider behaves
given the prompt and grounding package. Successful retry candidates and rewrite
candidates remain separate generations; they are not substituted retroactively
for an earlier failure.

Raw metrics include unsupported-claim recall inputs, claim validity by stratum,
provider/model family, empty-output rate, parse failure, timeout, and provider
error. Full samples, labels, and reviewer notes stay private.

### 6.2 Final-output plane

The final plane evaluates exactly what was exposed after guard policy. It
answers whether the user-visible result is grounded and useful. It records:

- unsupported world claims and critical epistemic leaks;
- accepted world-facing claims with evidence traces;
- rewrite, rejection, silence, and safe-fallback rates;
- false-block rate over adjudicated valid raw outputs;
- provider, validation, and end-to-end latency distributions.

A rejected candidate can improve final-output safety but still counts toward
raw failure and fallback/rejection rate. Empty output, timeout, provider error,
checker error, silence, and safe fallback never count as raw non-fabrication
success. Exclusions require versioned reason codes and remain visible in
denominators as required by the frozen D5 protocol.

### 6.3 Public projection

The public D5 report may contain only approved aggregates, confidence intervals,
minimum-cell suppression, anonymous provider family IDs, schema versions, and
synthetic examples. It must continue to label:

```text
public synthetic checker: Pass/Gap based on public smoke evidence
real-LLM outcome: Warning / not evaluated until the private held-out gate passes
```

No public status changes solely because a Host envelope or this RFC exists.
Only the approved aggregate export from the frozen private held-out protocol
may support a later real-LLM outcome claim.

## 7. Privacy and retention

The following are always private:

- rendered prompts and full grounding packages;
- unmodified raw and rewritten provider output;
- exact provider/model/account/request metadata;
- provider logs, credentials, headers, and endpoint details;
- human labels, reviewer notes, adjudication, and holdout membership.

The private root, access list, retention period, deletion process, and aggregate
publication authority must be approved under ADR-IB-004 before collection.
Public logs default to hashes, opaque references, normalized outcome codes,
sizes, and timings. Hashes are identifiers, not permission to publish the
underlying content.

Credentials are injected at runtime by the Host and must not appear in engine
configuration snapshots, run manifests, exceptions committed to Git, npm
payloads, or evidence exports.

## 8. Failure and audit invariants

The Reference Host must demonstrate:

- one terminal disposition per logical generation;
- monotonically numbered, append-only attempt records;
- no output exposure event before a successful validation event;
- no duplicate exposure after resume or retry;
- exact joins among run, world trace, generation, attempt, grounding hash,
  checker decision, and final disposition;
- no raw text or credential-bearing field in the public evidence bundle;
- normalized provider failures remain distinguishable from grounding failures;
- LLM text and Host retry behavior remain outside deterministic simulation
  hashes.

Missing private evidence is `NOT_VERIFIED`, never PASS. The independent verifier
receives the existing acceptance contract and the required roadmap Section 1.3
baseline verbatim. This RFC does not weaken, replace, or reinterpret the
verifier's criterion-by-criterion `PASS` / `FAIL` / `NOT_VERIFIED` contract.

## 9. Implementation sequence after approval

This RFC authorizes no implementation by itself. After the owner resolves the
dependent ADRs, P2/P4 execution cards may proceed in this order:

1. freeze the redacted envelope schemas and reason-code vocabulary;
2. define the private storage interface and retention controls outside Git;
3. implement a Host-owned single-attempt transport seam and retry controller;
4. implement buffered validate-before-exposure using public engine APIs;
5. add synthetic contract tests for pass, rewrite, reject, empty, timeout,
   provider error, resume idempotency, and redaction;
6. run the packed-consumer diagnostic without credentials;
7. obtain explicit authority before collecting any real-provider output;
8. run private held-out evaluation only after thresholds and manifests freeze;
9. publish only an authorized aggregate projection.

Any discovered need to modify Core or a public export enters the W1 API-gap
ledger. It is not silently implemented as part of provider integration.

## 10. Acceptance criteria for this boundary

The boundary is ready for execution-card review when:

- Host/Core ownership is accepted under ADR-IB-011;
- exact provider families, cost limits, and retention rules are approved;
- raw and public projections have an approved storage and redaction owner;
- the disposition policy resolves silence versus constrained rewrite;
- streaming remains buffered or ADR-IB-016 approves an equally safe protocol;
- D5 thresholds and denominators are frozen before held-out data is unblinded;
- a verifier can audit all outcomes without receiving credentials or public
  copies of private samples.

Until those conditions are met, the correct status is architecture-ready,
provider execution not authorized, and real-LLM D5 not evaluated.
