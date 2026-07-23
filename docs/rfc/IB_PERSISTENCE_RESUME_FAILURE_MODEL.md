# Integration Beta Persistence, Resume, and Failure Model

> **Status:** P2 architecture contract
> **Persistence boundary:** `andy-engine/store`
> **Scheduling:** explicit catch-up

## Contract boundary

The Reference Host persists through the public store facade and Stable World
Envelope. `runtimeSnapshot` is opaque. The Host must not parse it, repair it,
or depend on its internal shape.

The existing contracts remain unchanged:

- `auto` may fall back only when SQLite bindings are unavailable;
- explicit `sqlite` fails closed;
- asynchronous restore completes before store initialization resolves;
- restore failure remains observable;
- envelope and world-schema versioning use existing migration paths.

P2 does not reopen these completed constraints.

## Checkpoint protocol

For every catch-up segment:

1. acquire a single-writer lease for `runId`;
2. load the last committed Host cursor and checkpoint envelope;
3. restore through the packed `andy-engine/store` public surface;
4. verify the checkpoint hash and expected start tick;
5. execute a bounded tick range;
6. serialize and durably save the next Stable World Envelope;
7. append the committed segment record;
8. atomically advance the Host cursor;
9. release the lease and close the store.

A segment is durable only after steps 6–8 complete. Evidence metadata may
reference a committed segment but must not determine simulation state.

## Fresh-process resume

The seven-day run includes at least two resumes in newly created Node
processes. Each process installs or verifies the same tarball identity, opens
the configured store, restores through public APIs, and resumes at the durable
cursor. In-memory object identity is never treated as persisted evidence.

Facts-enabled restoration must verify that the Host explicitly supplied
`enableFacts: true`. FactStore restoration precedes KnowledgeStore restoration
inside the engine; the Host does not reproduce that ordering itself.

## Time model

- **Simulation time:** authoritative world time controlled by the engine.
- **Tick:** ordered simulation step used for checkpoint and evidence joins.
- **Wall time:** Host operational timestamp only.
- **Offline interval:** a Host scheduling input converted to a bounded
  `runTicks()` or `advanceTo()` request.

No metric may infer simulation duration from wall-clock elapsed time.

## Run identity and idempotency

`runId` identifies one scenario execution. `segmentId` identifies a bounded
catch-up range. External model work uses:

```text
(runId, tick, agentId, intentId)
```

as its idempotency key.

- Retrying an incomplete provider request may reuse the key and increment an
  attempt counter.
- A completed provider result cannot be applied twice.
- A committed world segment cannot be rerun under the same segment identity.
- Externally initiated operations, if later approved, require their own opaque
  intent ID and duplicate rejection.

## Failure and recovery matrix

| Failure | Durable world advanced? | Recovery | Evaluation treatment |
|---|---:|---|---|
| Invalid scenario/config | no | reject before run creation | not evaluated |
| Store unavailable at open | no | fail or approved `auto` fallback only | availability failure |
| Restore failure | no | preserve error and checkpoint; operator review | not evaluated |
| Engine error before checkpoint | no | abandon attempt; retry from prior checkpoint | run failure |
| Checkpoint write failure | no | retry save or abandon segment | run failure |
| Cursor update failure after save | uncertain | reconcile by checkpoint hash before retry | run failure |
| Provider error | world unchanged by provider | bounded Host retry | provider error |
| Provider timeout | world unchanged by provider | bounded Host retry | timeout |
| Empty model output | world unchanged by provider | apply disposition policy | empty, not D5 pass |
| Grounding reject | world truth unchanged | safe silence for Beta | D5 reject |
| Duplicate external intent | no duplicate commit | return prior disposition | duplicate |
| Public redaction failure | world may be committed | block export; retain privately per policy | evidence failure |

## Provider retry budget

The Host owns retry limits, backoff, and circuit breaking. P2 authorizes no
provider calls and has a zero spend budget. W3 must record the approved retry
policy alongside exact model and provider-policy snapshots.

A retry cannot cause narrative or LLM output to create facts. Only canonical
engine paths may change world state.

## Determinism statement

The protocol preserves the existing seeded engine baseline and checkpoint
continuity. It does not promise deterministic provider output, Host scheduling,
storage timing, or full-path replay. W2 may characterize those boundaries but
cannot expand the promise without an ADR and evidence.

## W2 measurement placeholders

Production-like runs must measure:

- checkpoint size and save/load latency;
- event, fact, knowledge, and memory growth;
- resident heap and process restart behavior;
- compaction need and retention cost;
- retry and duplicate-operation rates.

No capacity threshold is frozen before these measurements exist.
