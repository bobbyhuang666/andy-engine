# Documentation Structure

This document defines the live documentation layout for Andy Engine.

Andy Engine has accumulated many phase plans, audit reports, diagnosis reports, and
execution cards. The current rule is: active guidance stays easy to find; historical
evidence is archived, not deleted.

## Directory Map

```text
docs/
├── *.md                    Core public/engineering documentation
├── current/                Active governance, contracts, and handoff docs
├── rfc/                    Open or foundational RFCs
├── audit/                  Current/high-signal audit entry points
├── quality/                Generated quality reports and manifests
└── archive/                Pointer to external historical archive
```

## Core Documentation

Files directly under `docs/` are stable references that should remain visible:

- `DOMAIN.md`
- `PUBLIC_API_CONTRACT.md`
- `SERIALIZATION_CONTRACT.md`
- `WORLD_SCHEMA.md`
- `PERFORMANCE.md`
- `TESTING_ARCHITECTURE.md`
- `LEGACY_REMOVAL_REPORT.md`

These documents should describe current behavior, not phase history.

## Current Documents

`docs/current/` is for documents that actively guide ongoing engineering:

- governance and handoff manuals;
- active contracts not broad enough for top-level `docs/`;
- current release/readiness checklists;
- current documentation truth-pass notes.

Do not keep completed wave reports, old task cards, or root-cause investigations in
`docs/current/`.

See `docs/current/README.md` for the current file list.

## RFC Documents

`docs/rfc/` contains open, foundational, or future-facing RFCs.

Move an RFC out of `docs/rfc/` when:

- it has been implemented and no longer needs to drive future design;
- it was superseded by later diagnosis;
- it was only a direction-selection brief for a completed phase.

Implemented RFCs go to the external archive's `implemented-rfcs/` directory.
Superseded RFCs go to the external archive's `superseded-rfcs/` directory.

See `docs/rfc/README.md`.

## Audit Documents

`docs/audit/` is for current/high-signal audit artifacts only.

Round-by-round historical reports and old bug ledgers belong in the external archive's
`audit-rounds/` directory.

See `docs/audit/README.md`.

## Archive Documents

`docs/archive/` contains only a pointer README. Historical evidence has been moved
outside the repository so full-repo AI audits do not load obsolete context by default.

External archive: kept outside this repository in the maintainer's private
archive package.

Archive docs are useful context, but they must not override:

1. source code;
2. `AGENTS.md`;
3. current tests and command output;
4. active docs under `docs/current/`;
5. top-level public contracts.

See `docs/archive/README.md`.

## Maintenance Rules

1. New long-lived contract: add to top-level `docs/` or `docs/current/`.
2. New RFC: add to `docs/rfc/`.
3. Temporary execution plan: move to the external archive after completion.
4. Completed wave/task card: move to the external archive.
5. Root-cause report after closure: move to the external archive.
6. Old audit round: move to the external archive.
7. Update the relevant README whenever a document changes category.

Prefer moving and indexing over deleting. Delete only when a document is clearly
duplicative and its evidence is fully preserved elsewhere.
