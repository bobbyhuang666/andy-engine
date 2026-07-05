# Andy Engine Docs

This is the README for the `docs/` directory, not the project homepage.

For the main project overview, start at [`../README.md`](../README.md).

This directory is organized so public engineering references are easy to find while
historical internal planning evidence remains outside the repository.

## Start Here

- `../AGENTS.md` — required operating rules for AI agents working on the repo.
- `PUBLIC_API_CONTRACT.md` — public API contract.
- `SERIALIZATION_CONTRACT.md` — persistence and serialization contract.
- `WORLD_SCHEMA.md` — world schema documentation.
- `DOMAIN.md` — domain system documentation.
- `TESTING_ARCHITECTURE.md` — testing architecture.
- `current/` — narrower contracts and active engineering reference notes.
- `rfc/` — open or foundational design RFCs.

## Main Directories

- `current/` — active contracts and engineering reference notes.
- `rfc/` — open or foundational RFCs.
- `audit/` — public pointer to archived internal audit logs.
- `quality/` — generated quality reports and manifests.
- `archive/` — pointer to the external historical archive.

## Archive Policy

Historical documents are moved out of the repository, not deleted, unless they are
clearly duplicated and their evidence is preserved elsewhere. This keeps repository
reviews focused on current source, contracts, and high-signal docs.

External archive: kept outside this repository in the maintainer's private
archive package.
