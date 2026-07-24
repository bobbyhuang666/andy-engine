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
| Committed effect deltas per tick | A1 | `observable` (W4) | effectSummary in TickResult.phase (counts only) |
| Live Agent read-model projection | A2 | `not_observable` | live Agent/read-model risk (DEFER) |
| Movement / external-event command | A3 | `not_observable` | movement/external-event command gap (DEFER) |
| Evaluation bundle capability | A4 | `observable` (W4) | Host-owned evaluation-bundle.js |
| Buffered streaming | A5 | `not_observable` | buffered streaming limitation (DEFER) |

### A1 resolution (W4)

`TickResult.phase.effectSummary` now provides committed-delta counts per tick.
See `docs/rfc/IB_PUBLIC_EVIDENCE_CONTRACT.md` for the contract specification.

### A4 resolution (W4)

`reference-host/src/evaluation-bundle.js` provides Host-owned blinded bundle
assembly consuming only public API outputs. See
`docs/rfc/IB_EVALUATION_BUNDLE_CONTRACT.md` for the contract specification.

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
