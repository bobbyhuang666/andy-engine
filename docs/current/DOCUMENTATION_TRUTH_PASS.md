# Documentation Truth Pass

## Current State

The `docs/current/` directory contains the following documents:

1. **NEED_TARGET_CONTRACT.md** — Documents the two need target systems:
   - `NeedsSystem.NEED_DEPRIVATION_GRADIENT_TARGETS` — gradient targets for need deprivation
   - `BehaviorField.NEED_SATISFACTION_TARGETS` — optimal behavior positions for need satisfaction

## Documentation Status

### Core Documents (from A_LEVEL_ROADMAP.md)

| Document | Status | Location |
|----------|--------|----------|
| ARCHITECTURE.md | ✅ Exists | docs/ |
| PUBLIC_API_CONTRACT.md | ✅ Exists | docs/ |
| WORLD_SCHEMA.md | ✅ Exists | docs/ |
| PERSISTENCE.md | ✅ Exists | docs/ |
| DOMAIN_SYSTEM.md | ✅ Exists | docs/DOMAIN.md |
| NARRATIVE_AND_GROUNDING.md | ✅ Exists | docs/NARRATIVE_CONTRACT_AUDIT.md |
| PERFORMANCE.md | ✅ Exists | docs/ |
| DEPENDENCY_SURFACE_AUDIT.md | ✅ Exists | docs/ |
| ALIVENESS_METRICS_v0_1.md | ❌ Not yet created | — |

### RFC Documents

| Document | Status | Location |
|----------|--------|----------|
| AFFECT_COMPILER_RFC.md | ✅ Exists | docs/ |
| GROUNDING_CHECKER_V2_RFC.md | ❌ Not yet created | — |
| KNOWLEDGE_PROPAGATION_RFC.md | ❌ Not yet created | — |

### Audit Documents

| Document | Status | Location |
|----------|--------|----------|
| CLEAN_ARCHITECTURE_FINAL_AUDIT.md | ✅ Exists | docs/ |
| LEGACY_REMOVAL_REPORT.md | ✅ Exists | docs/ |
| PRIVATE_ACCESS_AUDIT.md | ✅ Exists | docs/ |
| STORE_TIME_SEMANTICS_AUDIT.md | ✅ Exists | docs/ |
| DEFAULTS_DIRECT_READ_AUDIT.md | ✅ Exists | docs/ |
| SOURCE_SCAN_ALLOWLIST_AUDIT.md | ✅ Exists | docs/ |

### Stabilization Documents

| Document | Status | Location |
|----------|--------|----------|
| POST_V2_STABILIZATION_SUMMARY.md | ✅ Exists | docs/ |
| POST_V2_LOCAL_STATUS_REPORT.md | ✅ Exists | docs/ |
| V2_0_1_PATCH_CANDIDATE_AUDIT.md | ✅ Exists | docs/ |
| RELEASE_NOTES_v2.0.1_DRAFT.md | ✅ Exists | docs/ |
| A_LEVEL_ROADMAP.md | ✅ Exists | docs/ |
| ALIVENESS_ROADMAP_v2_1_v3.md | ✅ Exists | docs/ |

## Truth Pass Summary

### What's Accurate

1. **NEED_TARGET_CONTRACT.md** — Accurately documents the two need target systems and their differences
2. **PUBLIC_API_CONTRACT.md** — Accurately reflects current public API surface
3. **PRIVATE_ACCESS_AUDIT.md** — Updated to reflect resolved items (H1-H4, H5-H7)
4. **STORE_TIME_SEMANTICS_AUDIT.md** — Accurately documents store time semantics
5. **POST_V2_STABILIZATION_SUMMARY.md** — Accurately summarizes post-v2 work

### What Needs Update

1. **ALIVENESS_METRICS_v0_1.md** — Not yet created (deferred to v2.2)
2. **GROUNDING_CHECKER_V2_RFC.md** — Not yet created (deferred to v2.1)
3. **KNOWLEDGE_PROPAGATION_RFC.md** — Not yet created (deferred to v2.1)

### What's Outdated

1. **Some older RFC documents** — May reference outdated implementation details
2. **Some audit documents** — May need updates after recent changes

## Recommendations

1. **Keep docs/current/ lean** — Only include documents that are actively referenced
2. **Archive old documents** — Move outdated documents to docs/archive/
3. **Create missing documents** — Only when needed for v2.1/v2.2/v3
4. **Update existing documents** — After each phase completion

## Next Actions

1. ✅ NEED_TARGET_CONTRACT.md created and accurate
2. ⏳ ALIVENESS_METRICS_v0_1.md — Deferred to v2.2
3. ⏳ GROUNDING_CHECKER_V2_RFC.md — Deferred to v2.1
4. ⏳ KNOWLEDGE_PROPAGATION_RFC.md — Deferred to v2.1
