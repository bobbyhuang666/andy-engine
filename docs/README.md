# Andy Engine Docs

This is the README for the `docs/` directory, not the project homepage.

For the main project overview, start at [`../README.md`](../README.md).

This directory is organized so public engineering references are easy to find while
historical planning notes remain outside the repository.

## Start Here

- `../AGENTS.md` — repository guardrails for AI coding agents.
- `PUBLIC_API_CONTRACT.md` — public API contract.
- `SERIALIZATION_CONTRACT.md` — persistence and serialization contract.
- `WORLD_SCHEMA.md` — world schema documentation.
- `DOMAIN.md` — domain system documentation.
- `TESTING_ARCHITECTURE.md` — testing architecture.
- `quality/d5-semantic-beta-report.md` — current D5 semantic grounding benchmark report.
- `current/` — narrower contracts and active engineering reference notes.
- `rfc/` — open or foundational design RFCs.

## Main Directories

- `current/` — active contracts and engineering reference notes.
- `rfc/` — open or foundational RFCs.
- `audit/` — public pointer to archived internal audit logs.
- `quality/` — generated quality reports and manifests. Some reports are dated
  snapshots; prefer the newest report for current status.
- `archive/` — historical public reference notes that are still useful to keep.

## Archive Policy

Historical documents are removed from the public tree when they are duplicated,
temporary, or primarily internal planning material. This keeps repository reviews
focused on current source, contracts, and high-signal docs.
