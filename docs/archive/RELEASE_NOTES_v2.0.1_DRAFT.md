# Andy Engine v2.0.1 — Patch Candidate Release Notes

## Summary

Andy Engine v2.0.1 is a patch release that improves SDK determinism, semantic profile migration, narrative input seams, diagnostics cleanup, store time semantics, and private access cleanup. This release does not implement new aliveness features.

## Fixes

### SDK Determinism
- EmotionSignalBuffer now supports optional `rng` and `now` injection
- SDK presentation layer no longer depends on uncontrollable Math.random() / Date.now()

### Private Access Cleanup
- Added read-only accessors for `agent._domain`, `agent._socialGraphRef`, `socialGraph._adjacency`, `agent._behavior`
- Replaced all private access with public getters
- Added `agent.rand()`, `eventDispatcher.setSimTime()`, `memory.getSimTime()`

### Diagnostics Cleanup
- All console.* calls routed through shared Diagnostics
- Optional native warnings use warnOnce to prevent spam
- SimulationStore errors recorded to diagnostics

### Store Time Semantics
- SQLiteStore query methods support optional `now` parameter
- SimulationStore queries prefer virtualTime when available
- Fast-forward simulation story filtering uses virtualTime

## Hardening

### SemanticProfile Migration
- Core defaults now use English/neutral identifiers
- Campus/tavern presets keep Chinese keywords
- Custom domains can use English semantic profile
- Source-scan rules prevent Chinese fallback regression

### NarrativeBuilder Structured Input
- AffectFrame structured input seam (opt-in)
- nearbyPeople and recentEvents support structured arrays
- Old string paths preserved for backward compatibility
- Resolved 6 P0/P1 string parsing debts

## Documentation

- `docs/V2_0_1_PATCH_CANDIDATE_AUDIT.md` — commit-by-commit review
- `docs/POST_V2_STABILIZATION_SUMMARY.md` — post-v2 work summary
- `docs/STORE_TIME_SEMANTICS_AUDIT.md` — store time semantics audit
- `docs/DEFAULTS_DIRECT_READ_AUDIT.md` — defaults.js direct-read audit
- `docs/SOURCE_SCAN_ALLOWLIST_AUDIT.md` — source-scan allowlist audit
- `docs/ALIVENESS_ROADMAP_v2_1_v3.md` — v2.1/v3 roadmap

## Tests

- 110 test files, 1948 tests passing
- Domain validation tests (campus, tavern, custom)
- Package boundary tests
- Source-scan tests for forbidden terms
- Compatibility tests
- Performance regression checks
- Fresh consumer matrix smoke tests

## Known Deferred Work

### Not in v2.0.1
- Complete AffectCompiler implementation
- Knowledge propagation runtime
- Grounding checker v2
- StoryArc runtime
- WorldObject integration
- Longitudinal demo protocol

### Deferred to v2.1
- Memory structured input
- ForbiddenTerms regex checker v2
- Full deterministic replay

### Deferred to v3
- Advanced AffectCompiler
- Multi-domain life evaluation
- Native prebuilt performance expansion

## Migration Notes

### From v2.0.0 to v2.0.1

**No breaking changes.** All changes are backward compatible.

- Core defaults now English (campus/tavern presets keep Chinese)
- New optional parameters on existing methods
- New read-only getters on Agent, SocialGraph, EventDispatcher, PersonalMemory
- Diagnostics replaces console.* in runtime paths

### Custom Domain Migration

If you have a custom domain with Chinese semantic profile:
- No changes required
- Your domain's `semanticProfile` continues to work
- Core defaults are now English, but your domain overrides them

## No Public API Breaking Changes

All changes are additive:
- New optional parameters on existing methods
- New read-only getters
- New methods (rand(), setSimTime(), getSimTime())
- No removed or changed existing API

## No npm Publish Executed

This is a local patch candidate. npm publish requires explicit approval.

## No Stable World Envelope Changes

The Stable World Envelope schema remains v0.1.0. No migration required.
