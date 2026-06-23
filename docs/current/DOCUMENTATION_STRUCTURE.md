# Documentation Structure

This document describes the documentation structure for Andy Engine.

## Directory Structure

```
docs/
├── current/           # Current core documentation
├── rfc/               # RFC documents (future features)
├── archive/           # Archived documents (historical)
├── DOMAIN.md          # Domain system documentation
├── PERFORMANCE.md     # Performance documentation
└── ...                # Other core documentation
```

## Current Documentation (docs/current/)

Core documentation that is actively referenced:

1. **NEED_TARGET_CONTRACT.md** — Documents the two need target systems
2. **ALIVENESS_METRICS_v0_1.md** — Defines 5 basic metrics for evaluating character "aliveness"
3. **DOCUMENTATION_TRUTH_PASS.md** — Summary of documentation status

## RFC Documents (docs/rfc/)

RFC documents for future features:

1. **AFFECT_COMPILER_RFC.md** — AffectCompiler design
2. **GROUNDING_CHECKER_V2_RFC.md** — Grounding checker v2 design
3. **KNOWLEDGE_PROPAGATION_RFC.md** — Knowledge propagation design
4. **RNG_STRICTNESS_RFC.md** — RNG strictness design
5. **SEMANTIC_PROFILE_RFC.md** — Semantic profile design

## Archive Documents (docs/archive/)

Historical documents that are no longer actively referenced:

1. **CLEAN_ARCHITECTURE_FINAL_AUDIT.md** — Architecture audit (historical)
2. **LEGACY_REMOVAL_REPORT.md** — Legacy removal report (historical)
3. **RELEASE_ROADMAP_ALPHA4_TO_V2.md** — Release roadmap (historical)
4. **INTRINSIC_MOTIVATION_SPLIT_PLAN.md** — Intrinsic motivation split plan (historical)

## Core Documentation (docs/)

Core documentation that is always relevant:

1. **DOMAIN.md** — Domain system documentation
2. **PERFORMANCE.md** — Performance documentation
3. **PUBLIC_API_CONTRACT.md** — Public API contract
4. **WORLD_SCHEMA.md** — World schema documentation
5. **PERSISTENCE.md** — Persistence documentation

## Documentation Rules

1. **docs/current/** — Only include documents that are actively referenced
2. **docs/rfc/** — Include all RFC documents, even if not yet implemented
3. **docs/archive/** — Include historical documents that are no longer actively referenced
4. **docs/** — Include core documentation that is always relevant

## Documentation Updates

When updating documentation:

1. **New core documentation** — Add to docs/current/
2. **New RFC** — Add to docs/rfc/
3. **Archive old documentation** — Move to docs/archive/
4. **Update existing documentation** — Update in place

## Documentation Validation

When validating documentation:

1. **Check docs/current/** — Ensure all documents are accurate
2. **Check docs/rfc/** — Ensure all RFCs are up-to-date
3. **Check docs/archive/** — Ensure archived documents are clearly marked
4. **Check docs/** — Ensure core documentation is accurate
