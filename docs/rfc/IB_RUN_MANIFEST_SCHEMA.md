# Integration Beta Run and Evidence Manifest Schema

> **Status:** P2 schema v0.1-draft
> **Owner:** Reference Host
> **Rule:** manifests describe evidence; they do not create world facts

## Design goals

The schema must make a run reproducible enough to audit without promising
full Host/SDK/LLM determinism. It is versioned, append-only at the record level,
redactable, and split into public and private projections.

## Run manifest

Required fields:

| Field | Type | Public | Meaning |
|---|---|---:|---|
| `schemaVersion` | string | yes | Manifest schema, initially `0.1.0` |
| `runId` | opaque string | yes | Host-assigned stable run identity |
| `createdAt` | ISO timestamp | yes | Operational wall time |
| `engine.name` | string | yes | `andy-engine` |
| `engine.version` | string | yes | Installed package version |
| `engine.commit` | string or null | yes | Source commit when known |
| `engine.tarballIntegrity` | string | yes | Integrity of installed packed artifact |
| `scenario.id` | string | yes | Versioned Host scenario |
| `scenario.version` | string | yes | Scenario revision |
| `scenario.domainRef` | string | yes | `tavern`, `campus`, or approved custom reference |
| `simulation.seed` | number | yes | Core simulation seed |
| `simulation.startTime` | ISO timestamp | yes | Initial simulated time |
| `simulation.tickSizeMinutes` | number | yes | Scenario tick size |
| `simulation.targetTicks` | integer | yes | Planned horizon |
| `simulation.enableFacts` | boolean | yes | Must be `true` for the Reference Slice |
| `characters` | array | redacted | Stable IDs and scenario role labels |
| `checkpoint.cadenceTicks` | integer | yes | Planned persistence cadence |
| `scheduler.mode` | enum | yes | `explicit-catch-up` for Beta |
| `providerFamilies` | array | anonymized | Family IDs in public output |
| `metricProtocol.version` | string | yes | Frozen threshold/rubric version |
| `privacyPolicy.version` | string | yes | Private-asset policy revision |

The private manifest additionally contains exact model identifiers, endpoint
configuration fingerprints, prompt-template identifiers, reviewer allocation,
and retention deadlines. It never contains credentials.

## Segment record

One append-only record is written for each attempted catch-up segment:

```json
{
  "schemaVersion": "0.1.0",
  "runId": "opaque",
  "segmentId": "opaque",
  "attempt": 1,
  "startTick": 0,
  "targetTick": 288,
  "status": "committed",
  "checkpointBefore": "sha256:...",
  "checkpointAfter": "sha256:...",
  "startedAt": "ISO-8601",
  "finishedAt": "ISO-8601",
  "failureClass": null
}
```

Allowed status values are `started`, `committed`, `failed`, and `abandoned`.
Only `committed` advances the Host's durable run cursor.

## Evidence record

Evidence records use stable join keys without copying internal objects:

| Group | Required fields |
|---|---|
| Identity | `runId`, `segmentId`, `tick`, `recordId`, `agentId` |
| Action | public selected-action summary and `reasonTraceRef`, when observable |
| Canon | event ID/type/time and participant IDs, when observable |
| Effect | applied/skipped/error counts and typed-delta category summary, when observable |
| Knowledge | subject/fact references plus visibility/evidence category, when observable |
| Grounding | package hash, checker version, claim counts, disposition |
| Model | private model snapshot ref, latency, retry count, outcome |
| Exposure | `exposed`, `safeSilence`, `rewritten`, or `blocked` |
| Provenance | source API, package version, schema versions |

An unavailable field is recorded as `not_observable` with a gap-ledger ID.
The Host must not recover it by importing internals.

## Dispositions

Execution and evaluation outcomes are separate:

- execution: `success`, `provider_error`, `timeout`, `empty`, `budget_rejected`;
- raw grounding: `pass`, `warning`, `reject`, `not_evaluated`;
- final exposure: `exposed`, `safe_silence`, `rewritten`, `blocked`;
- human review: `pending`, `agree`, `disagree`, `adjudicated`,
  `not_sampled`.

Provider errors, timeouts, empty responses, and budget rejections are reported
as availability outcomes, not D5 passes or grounding failures.

## Public projection

Public evidence may contain:

- schema and protocol versions;
- scenario/domain IDs;
- engine/package identity;
- aggregate counts, rates, confidence intervals, and suppressed-cell markers;
- opaque hashes and non-identifying record IDs;
- redacted synthetic examples approved for publication.

It must exclude exact private prompts, raw/final real-model text, exact provider
metadata, reviewer notes, labels at reconstructable grain, credentials, and
holdout assignments.

## Validation invariants

1. `runId + segmentId + attempt` is unique.
2. A committed segment's `checkpointAfter` becomes the next segment's
   `checkpointBefore`.
3. Tick numbers never decrease within a run.
4. `enableFacts` is explicitly `true`.
5. Exact model snapshots exist privately before a provider call.
6. Every exposed model output has a checker disposition.
7. Public records contain no private-only fields.
8. Trace metadata never writes to Canon, KnowledgeStore, or agent state.
