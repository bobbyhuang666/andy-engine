# Reference Host Architecture

> **Status:** P2 architecture contract
> **Decision input:** `INTEGRATION_BETA_WAVE0_DECISIONS.md`
> **Scope:** Host boundary and execution design; no Core implementation

## Purpose

The Reference Host proves that an early integrator can operate Andy Engine
through its packed public surface. It is evidence infrastructure, not a second
runtime and not a source of world truth.

The planned workspace is:

```text
reference-host/
├── package.json
├── src/
├── scenarios/
├── test/
└── artifacts/        generated and ignored
```

`reference-host/` remains outside `src/` and `examples/`. The root package
`files` allowlist excludes it from the Andy Engine npm tarball.

## Installation and import boundary

Every diagnostic run must:

1. run `npm pack` against the canonical repository;
2. install the resulting tarball into a fresh Host workspace;
3. import only paths declared in `package.json#exports`;
4. record the tarball integrity and engine version in the run manifest.

Allowed imports are:

```text
andy-engine
andy-engine/sdk
andy-engine/domain
andy-engine/domain/validate
andy-engine/domain/registry
andy-engine/facts
andy-engine/store
andy-engine/config/defaults
andy-engine/presets/campus
andy-engine/presets/tavern
```

Relative imports into the repository, `src/` imports, and access through
`engine.world` or subsystem fields invalidate the run as Beta evidence.

## Ownership boundary

| Host owns | Engine owns |
|---|---|
| provider credentials and routing | WorldCanon and simulation truth |
| exact model snapshots and cost budget | agent psychology and action selection |
| explicit catch-up scheduling | CanonEvent production |
| run IDs, checkpoints, and retry policy | typed effect application |
| scenario and domain selection | fact and knowledge authority |
| private evaluation hooks and retention | grounding packages and consistency checks |
| redacted evidence export | stable public APIs and persistence contracts |

Host metadata can describe evidence but cannot become a parallel fact store.
The Host must not inject expected outcomes into memory, relationships, facts,
knowledge, position, emotion, or needs.

## Reference scenario

- primary: tavern, seven simulated days;
- portability diagnostic: campus, shorter repeatable run;
- 3–10 characters;
- at least three locations with meaningful co-presence separation;
- schedule and need pressure that can produce solitary and social behavior;
- one observed event, one told or overheard event, one relationship-changing
  event, one location-changing event, and one negative epistemic control;
- at least two fresh-process resume boundaries in the primary run;
- `enableFacts: true` set explicitly in Host configuration.

Expected outcomes are evaluation assertions, not scheduled state mutations.

## Scheduling model

The Host uses explicit catch-up:

```text
load checkpoint
  → choose bounded target segment
  → runTicks(count) or advanceTo(targetTime, maxTicks)
  → persist stable world envelope
  → append redacted evidence metadata
  → close process
```

Simulation time comes from the engine clock. Wall time is operational metadata
only. `AutoTick` must not be described as a background executor.

Each segment is identified by `(runId, segmentId, startTick, targetTick)`.
External model work uses `(runId, tick, agentId, intentId)` as the Host
idempotency key. A retry resumes an incomplete segment; it does not replay a
committed world mutation.

## Failure model

The Host must distinguish:

- invalid scenario/configuration;
- store initialization or restore failure;
- engine segment failure before checkpoint;
- provider error, timeout, empty output, or budget rejection;
- grounding rejection or safe silence;
- duplicate external operation;
- evidence-export or redaction failure.

Provider failure never counts as a grounding pass. Redaction failure blocks
public export. Detailed recovery rules are defined in
`IB_PERSISTENCE_RESUME_FAILURE_MODEL.md`.

## Evidence boundary

Each run produces a private append-only execution record and a public
non-reconstructable projection. The evidence chain joins:

```text
selected action
  → canon event
  → committed effect summary
  → state/knowledge visibility
  → grounding package hash
  → model envelope
  → checker disposition
  → final exposure status
```

Missing public observability is recorded in the API gap ledger; it is not filled
by reaching into internals.

## Exit criteria

P2 architecture is acceptable when:

- all Host operations map to public exports or an explicit gap;
- persistence uses the Stable World Envelope;
- provider and private-data concerns remain Host-owned;
- no design step changes Core or freezes an unsupported API;
- the no-internal-access scan can reject known legacy-demo violations;
- an independent verifier accepts the P2 document set.
