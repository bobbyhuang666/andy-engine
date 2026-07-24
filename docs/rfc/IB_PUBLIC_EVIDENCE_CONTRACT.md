# IB Public Evidence Contract — TickEffectSummary

> **Status:** Contract specification (pending Phase 2 Caliper verification)
> **Parent:** `docs/rfc/IB_W4_CONTRACT_DECISIONS.md` (A1 ACCEPT)
> **Date:** 2026-07-24

---

## 1. Purpose

The `TickEffectSummary` provides Integration Beta Hosts with a lightweight,
read-only projection of which typed deltas were committed during a single
tick. It addresses the A1 observability gap: Hosts can now verify committed
effects without resorting to fragile post-hoc snapshot diffing.

This contract specifies the shape, population rules, stability commitment,
and boundaries of the `effectSummary` field added to `TickResult.phase`.

---

## 2. Type Definition

```ts
/**
 * Summary of committed deltas within a single tick.
 * Additive to TickResult.phase; never removes or renames existing fields.
 */
interface TickEffectSummary {
  counts: {
    applied: number;
    skipped: number;
    errored: number;
  };
  byType: Partial<Record<DeltaType, {
    applied: number;
    skipped: number;
  }>>;
}

type DeltaType =
  | 'need'
  | 'emotion'
  | 'memory'
  | 'relationship'
  | 'position'
  | 'locationMeaning'
  | 'futureTendency';
```

The `TickResult.phase` interface gains:

```ts
interface TickResultPhase {
  // ... existing fields unchanged ...
  effectSummary?: TickEffectSummary;
}
```

---

## 3. Population Rules

1. **Aggregate across all commit call sites.** AndyWorld.step() contains 5
   `EffectCommitter.commit()` call sites (L268, L561, L660, L755, L873).
   The `effectSummary` accumulates counts from all 5 sites into a single
   summary.

2. **Omit when zero.** If `counts.applied + counts.skipped + counts.errored === 0`,
   the `effectSummary` field is omitted from the phase object. This preserves
   backward compatibility and avoids noise in zero-effect ticks (rare but
   possible during startup).

3. **Counts only, no raw deltas.** The summary contains only aggregate counts
   and per-type breakdowns. It does NOT contain:
   - Raw `StateDelta` objects
   - `EffectCommitter.commit()` return values
   - Per-agent or per-event granularity
   - Error messages or delta content

4. **byType is partial.** Only delta types with `applied > 0` or `skipped > 0`
   appear in `byType`. Types with zero activity are omitted.

5. **errored counts are global.** `counts.errored` is the total number of
   deltas that threw during `_applyDelta()`. It is NOT broken down by type
   (error paths are diagnostic, not contractual).

6. **Deterministic.** Given the same seed and world state, `effectSummary`
   counts are identical across runs. No non-deterministic sources.

---

## 4. Stability Commitment

### Stable (contractual)

- The `counts` object with `{ applied, skipped, errored }` fields.
- The `byType` object with per-type `{ applied, skipped }` fields.
- The `DeltaType` union of the 7 known types.
- The field name `effectSummary` on `TickResult.phase`.

### Unstable (implementation details, may change)

- The specific distribution of deltas across the 5 internal commit call sites.
- The `errored` count breakdown (currently global only; may gain per-type
  breakdown in future if evidenced).
- Whether `byType` entries with `applied=0, skipped>0` are included or
  omitted (currently included; may be optimized).

### Not committed

- Per-event or per-agent delta traces.
- Raw delta shapes or content.
- Correlation between effectSummary entries and specific events or agents.

---

## 5. Persistence Behavior

- `effectSummary` is included in `TickResult` returned by `tick()`,
  `runTicks()`, and `advanceTo()`.
- It is NOT included in `snapshot()`, `toJSON()`, or `toWorldState()` —
  these are state projections, not tick-result projections.
- The Stable World Envelope does not carry effect summaries. Tick results
  are ephemeral by design.

---

## 6. Domain Behavior

- `effectSummary` is domain-agnostic. Delta types are the same across all
  domain presets (campus, tavern, custom).
- No domain-specific delta types exist in the current architecture.
- If future domain-specific delta types are added, they would appear as new
  keys in `byType` without breaking existing consumers.

---

## 7. Consumption Pattern (Host)

```js
// Before A1 (W2 workaround):
const before = engine.snapshot();
engine.tick();
const after = engine.snapshot();
// ... fragile deep-compare of before/after ...

// After A1 (W4):
const result = engine.tick();
if (result.phase.effectSummary) {
  const { counts, byType } = result.phase.effectSummary;
  console.log(`Applied: ${counts.applied}, Skipped: ${counts.skipped}`);
  if (byType.position) {
    console.log(`Position changes: ${byType.position.applied}`);
  }
}
```

---

## 8. Relationship to A4 Evaluation Bundle

The A4 evaluation bundle (Host-owned) consumes `effectSummary` as one input
to its evidence chain. The bundle can record per-tick committed-delta counts
without needing raw delta access.

---

## 9. Testing Requirements

1. **Unit test:** Seed → tick → verify `effectSummary.counts` match manual
   count of committed deltas.
2. **Integration test:** Multi-agent tick → verify `byType` breakdown.
3. **Zero-effect tick:** Verify `effectSummary` is omitted when no deltas.
4. **Backward compatibility:** Existing TickResult consumers unaffected.
5. **Determinism:** Same seed → same `effectSummary` counts across runs.

---

## 10. Migration

No migration needed. The field is additive and optional. Existing consumers
are unaffected.
