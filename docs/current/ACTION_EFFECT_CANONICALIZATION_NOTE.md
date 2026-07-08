# Action/Effect Pipeline Canonicalization Note

**Status:** Current engineering reference

## Summary

Andy Engine's action/effect writeback path is now typed-delta first:

```text
ActionSelectionRuntime
  -> EventEffectPipeline.applyActionEffect()
  -> EffectResult.deltas
  -> EffectResult.directCommit()
  -> EffectCommitter
```

The active action path commits `EffectResult` typed deltas directly. The legacy
`stateDeltas` shape is still produced on `ReasonTrace` for backward-compatible
debugging and consumers that inspect traces, but it is no longer the active
writeback path.

## Current Runtime Contract

- Candidate providers remain read-only.
- `EventEffectPipeline` computes typed deltas and does not mutate live state.
- `EffectCommitter` owns live state mutation for committed `EffectResult` deltas.
- `EffectResult.directCommit(agent, env)` is the canonical active-mode commit
  helper.
- `applyActionStateDeltas()` is retained as a deprecated compatibility helper
  and for equivalence tests.

## Tests That Lock This Down

- `tests/unit/effect-delta-contract.test.js`
- `tests/unit/active-writeback.test.js`
- `tests/unit/spatial-continuous-active-rollback.test.js`
- `tests/architecture/boundary-check.test.js`

## Notes

Some non-action runtime subsystems still have compatibility fallback paths for
older or isolated test contexts. When an `EffectCommitter` is available, new
world-facing consequences should prefer typed deltas and committer ownership.
