# Documentation Truth Pass

Last updated after the documentation reorganization that moved historical plans,
wave cards, root-cause reports, and old audit rounds into `docs/archive/`.

## Current Truth

- `docs/current/` is now reserved for active guidance and contracts.
- `docs/rfc/` now contains open or foundational RFCs only.
- completed RFCs/design briefs moved to the external archive.
- superseded RFCs/design briefs moved to the external archive.
- old wave cards moved to the external archive.
- temporary execution plans moved to the external archive.
- root-cause diagnosis reports moved to the external archive.
- old audit rounds moved to the external archive.

## Active Documentation Entry Points

- `docs/README.md`
- `docs/current/README.md`
- `docs/current/DOCUMENTATION_STRUCTURE.md`
- `docs/current/CHIEF_PLANNER_HANDOFF_MANUAL.md`
- `docs/audit/README.md`
- `docs/rfc/README.md`
- `docs/archive/README.md`

## Active Core Contracts

- `docs/PUBLIC_API_CONTRACT.md`
- `docs/SERIALIZATION_CONTRACT.md`
- `docs/WORLD_SCHEMA.md`
- `docs/DOMAIN.md`
- `docs/TESTING_ARCHITECTURE.md`
- `docs/PERFORMANCE.md`
- `docs/current/NEED_TARGET_CONTRACT.md`
- `docs/current/AFFECT_COMPILER_CONTRACT.md`

## Known Caveats

- Archived reports may contain outdated paths or superseded conclusions.
- older handoff notes were moved to the external archive; the Chief Planner manual is
  the primary planning authority.
- Source code, tests, `AGENTS.md`, and current command output remain more
  authoritative than any historical document.

## Maintenance Rule

When a phase completes, move its task cards/reports into the external archive and
update the relevant README. Do not let temporary plans accumulate in `docs/current/`.
