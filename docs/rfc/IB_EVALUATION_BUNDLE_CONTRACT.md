# IB Evaluation Bundle Contract — Host-Owned Tooling

> **Status:** Contract specification (pending Phase 2 Caliper verification)
> **Parent:** `docs/rfc/IB_W4_CONTRACT_DECISIONS.md` (A4 ACCEPT as Host-owned)
> **Date:** 2026-07-24

---

## 1. Purpose

The evaluation bundle assembles public Engine API outputs into a structured,
blinded package for automated metrics and human review. It addresses the A4
gap by providing Host-level tooling that consumes only public projections,
without requiring any Core API changes or exposing internal pipeline state.

This contract specifies the bundle schema, blinding rules, private artifact
boundary, and consumption patterns.

---

## 2. Architecture Boundary

```
┌─────────────────────────────────────────────────┐
│  Engine Core (andy-engine npm package)           │
│  Public APIs consumed:                           │
│    - engine.tick() → TickResult (+effectSummary) │
│    - engine.snapshot() → WorldSnapshot           │
│    - engine.getGroundingPackage(agentId)          │
│    - engine.checkConsistency(llmOutput, agentId)  │
│    - engine.getNarrative(agentId)                 │
│    - engine.getStats()                            │
│    - engine.getSocialGraph()                      │
│    - toWorldState() / fromWorldState()            │
└──────────────────────┬──────────────────────────┘
                       │ public API outputs only
                       ▼
┌─────────────────────────────────────────────────┐
│  reference-host/src/evaluation-bundle.js          │
│  - Assembles public outputs into blinded bundle   │
│  - Does NOT access internal engine state          │
│  - Does NOT modify engine state                   │
│  - Resides in reference-host/, not in npm package │
└─────────────────────────────────────────────────┘
```

**Key principle:** The evaluation bundle is Host-owned tooling. It is NOT
part of the Engine Core npm package. It does NOT require any new Core API.

---

## 3. Bundle Schema

```ts
interface EvaluationBundle {
  /** Unique bundle identifier (UUID v4). */
  bundleId: string;

  /** World identifier from the run manifest. */
  worldId: string;

  /** Tick range covered by this bundle. */
  tickRange: {
    start: number;
    end: number;
  };

  /** Timestamps. */
  createdAt: string;  // ISO 8601
  engineVersion: string;

  /** Character summaries (from snapshot, not live handles). */
  characters: Array<{
    id: string;
    name: string;
    position: string;
  }>;

  /** Per-tick evidence summary. */
  evidenceChain: Array<{
    tickNumber: number;
    time: string;

    /** From TickResult.phase.effectSummary (A1). */
    effectSummary?: {
      counts: { applied: number; skipped: number; errored: number };
      byType: Record<string, { applied: number; skipped: number }>;
    };

    /** From engine.getGroundingPackage(). */
    groundingFactCounts?: {
      allowed: number;
      inferred: number;
      forbidden: number;
    };

    /** From engine.checkConsistency(). */
    consistencyResult?: {
      valid: boolean;
      violationCount: number;
      severity: string;
    };

    /** Snapshot hash (SHA-256 of JSON.stringify(snapshot())). */
    snapshotHash: string;
  }>;

  /** Blinded outputs for human review. */
  blindedOutputs: Array<{
    agentId: string;
    tickNumber: number;

    /** Narrative text (from engine.getNarrative()). */
    narrative: string;

    /** Grounding package summary (counts only, no fact content). */
    groundingSummary: {
      allowed: number;
      inferred: number;
      forbidden: number;
    };

    /** Consistency check result. */
    consistency: {
      valid: boolean;
      violationCount: number;
      severity: string;
    };

    /** Effect summary for this tick. */
    effectSummary?: {
      counts: { applied: number; skipped: number; errored: number };
    };
  }>;

  /** Bundle metadata (not blinded). */
  metadata: {
    domainId: string;
    seed: string | number;
    agentCount: number;
    totalTicks: number;
    bundleSchemaVersion: '1.0.0';
  };
}
```

---

## 4. Blinding Rules

The evaluation bundle follows a strict blinding protocol to support
automated metrics and human review without exposing private information:

1. **Fact content is NOT included.** Only fact counts appear in the bundle.
   The actual `allowedFacts`, `inferredFacts`, and `forbiddenFacts` arrays
   from `GroundingPackage` are excluded.

2. **Raw LLM output is NOT included.** The bundle records consistency check
   results but not the LLM text that was checked.

3. **Violation details are summarized.** Only `valid`, `violationCount`,
   and `severity` are included. Specific violation messages and locations
   are excluded from blinded outputs.

4. **Memory content is NOT included.** Agent memories are internal state.
   The bundle does not expose memory content, only effect summary counts
   indicating whether memory deltas were committed.

5. **Snapshot hashes, not snapshots.** Full snapshots are not included in
   the bundle. Only SHA-256 hashes are recorded for evidence-chain integrity.
   The full snapshots remain in the reference-host artifacts directory.

6. **Narrative text IS included** in blinded outputs. This is the primary
   material for human review. Narrative is already a public API output
   designed for external consumption.

---

## 5. Private Artifact Boundary

The following are explicitly OUTSIDE the evaluation bundle and must remain
private:

| Artifact | Location | Access |
|----------|----------|--------|
| Raw LLM output | Not in Engine Core | N/A |
| Provider metadata | Not in Engine Core | N/A |
| Human labels | Host-private directory | Host-only |
| Full snapshot data | `reference-host/artifacts/` | Host-only |
| Adjudication records | Host-private directory | Host-only |
| Review manifests | Host-private directory | Host-only |

Per §1.3 baseline constraint: "full evaluation corpora, raw provider output,
human labels, adjudication, and review manifests remain private."

---

## 6. Consumption Pattern

```js
const { createEvaluationBundle } = require('./evaluation-bundle');

// After running a diagnostic segment:
const bundle = createEvaluationBundle({
  engine,           // AndyEngine instance (public APIs only)
  worldId: 'tavern-7day-seed42',
  tickRange: { start: 0, end: 2016 },
  tickResults,      // TickResult[] from runTicks()
  snapshots,        // snapshot() at key tick boundaries
});

// Bundle is pure data — no live references.
console.log(bundle.evidenceChain.length);  // 2016 ticks
console.log(bundle.blindedOutputs.length); // narrative samples

// Write to artifacts
fs.writeFileSync(
  `artifacts/evaluation-bundle-${bundle.bundleId}.json`,
  JSON.stringify(bundle, null, 2)
);
```

---

## 7. Implementation Constraints

1. **No Core API changes.** The bundle consumes existing public APIs only.
2. **No live handle retention.** All data is serialized at bundle creation time.
3. **No engine state modification.** The bundle is strictly read-only.
4. **Hash computation is deterministic.** Same snapshot → same hash.
5. **Bundle creation is synchronous.** No async operations required.
6. **File resides in reference-host/.** Not in src/, not in npm package.

---

## 8. Relationship to A1

The A1 `TickResult.phase.effectSummary` provides committed-delta counts
per tick. The evaluation bundle consumes these counts as part of its
evidence chain, recording which delta types were applied in each tick.

Without A1, the evaluation bundle would need to infer effect counts from
post-hoc snapshot comparison — a fragile workaround that A1 eliminates.

---

## 9. Testing Requirements

1. **Bundle creation test:** Run diagnostic segment → create bundle →
   verify schema compliance.
2. **Blinding test:** Verify no fact content, raw LLM output, memory content,
   or full snapshots appear in the bundle.
3. **Hash consistency test:** Same snapshot → same hash across runs.
4. **Evidence chain completeness:** Verify every tick in range has an
   evidence chain entry.
5. **No internal access test:** Static scan of evaluation-bundle.js confirms
   no imports from `src/` or internal paths.

---

## 10. Migration

No migration needed. The evaluation bundle is new Host-owned tooling with
no impact on existing consumers or Core APIs.
