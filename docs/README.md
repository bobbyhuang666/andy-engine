# Andy Engine Docs

This is the README for the `docs/` directory, not the project homepage.

For the main project overview, start at [`../README.md`](../README.md).

This directory is organized so public engineering references are easy to find while
temporary planning notes stay out of the public tree.

## npm Package Note

The npm package includes this index and `DOMAIN.md`. The broader engineering
documentation is maintained in the public source repository and is not bundled
into the runtime package. Use the
[GitHub docs directory](https://github.com/bobbyhuang666/andy-engine/tree/main/docs)
for the complete document set.

## Start Here

- `DOMAIN.md` — domain system documentation bundled with npm.
- `quality/DEEP_AUDIT_2026-08-12.md` — current source-backed deep audit baseline.
- `rfc/POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md` — staged reliability and
  Integration Beta optimization plan derived from the current audit.
- The GitHub source repository contains contributor guardrails, API and
  serialization contracts, testing architecture, active engineering notes, and RFCs.

## Main Directories

- `current/` — active contracts and engineering reference notes.
- `rfc/` — open or foundational RFCs.
- `quality/` — generated public quality reports and manifests. These are source-repository
  artifacts and are not bundled with npm.
- `archive/` — retained architecture evidence documents referenced by tests and
  agent guardrails.

## Archive Policy

Temporary execution plans, old audit ledgers, and superseded direction briefs are
kept out of the public repository. Public docs should stay focused on current
source, contracts, quality reports, and high-signal architecture evidence.
