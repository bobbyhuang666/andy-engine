# Evidence Index — Integration Beta W1

> **Status:** W1 evidence collection
> **Purpose:** Redacted, non-reconstructable evidence metadata produced by
> the Reference Host diagnostic runs.

## Records produced

| Record | File | Content | Reconstructable? |
|---|---|---|---|
| Run manifest | `artifacts/tavern-run-manifest.json` | Scenario, seed, engine version, segment plan | No (metadata only) |
| Segment records | `artifacts/tavern-segment-records.json` | Per-segment tick counts, agent summaries, gap observations | No (redacted summaries) |
| Final world state | `artifacts/tavern-final-world-state.json` | Full stable envelope for manual inspection | Yes (contains runtimeSnapshot) |
| Run manifest | `artifacts/campus-run-manifest.json` | Same structure, campus domain | No |
| Segment records | `artifacts/campus-segment-records.json` | Same structure, campus domain | No |
| Final world state | `artifacts/campus-final-world-state.json` | Full stable envelope | Yes |

## Not-observable fields

Fields that the Host cannot observe through the public API are
explicitly marked with `not_observable` and their gap ID:

| Field | Gap ID | Status | Notes |
|---|---|---|---|
| Committed effect deltas per tick | A1 | `not_observable_via_public_api` | 5 commit() sites, 0 public exposures |
| Immutable content-hashed projection | A2 | `not_observable` | No public immutable snapshot API |
| Intentional agent relocation | A3 | `not_observable` | No public move/relocate command |
| Event intent injection | A4 | `not_observable` | No public event-inject API |

## Private data boundary

- No raw LLM output is produced (W1 uses deterministic mock paths)
- No real provider credentials are stored or referenced
- No human labels or adjudication data exist
- `artifacts/` directory is gitignored and never enters npm pack

## Redaction rules

Per `IB_ARTIFACT_BOUNDARY.md`:

1. Run manifests contain seed, version, and segment metadata — safe for
   public export
2. Segment records contain agent summaries via public API — safe for
   public export
3. Final world states contain `runtimeSnapshot` which includes full agent
   state — NOT safe for public export without review
4. No raw provider output exists to redact (W1 is provider-free)
