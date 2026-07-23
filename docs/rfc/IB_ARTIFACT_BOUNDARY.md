# Integration Beta Artifact Boundary

> **Status:** P2 privacy and publication contract
> **Private root:** outside the public repository

## Principle

Public evidence proves process and aggregate outcomes without publishing a
reconstructable evaluation corpus. Redaction occurs through an explicit
projection, not by deleting rows from a private report.

## Asset classes

### Public

- schemas, rubrics, thresholds, and protocol versions;
- synthetic grounding smoke cases;
- aggregate counts, rates, confidence intervals, and sample floors;
- suppressed-cell markers and non-identifying failure categories;
- opaque artifact and grounding-package hashes;
- manually approved redacted examples that cannot reconstruct a holdout set;
- package, engine, scenario, and public domain identities.

### Private

- full real-model prompts and raw/final output;
- full evaluation samples and holdout assignments;
- exact provider/model metadata when it enables reconstruction;
- human labels, reviewer identity, notes, and adjudication;
- corpus generation or assignment tooling;
- unsuppressed row-level evidence;
- credentials, account identifiers, and billing metadata.

Private assets remain under the external root named in
`INTEGRATION_BETA_WAVE0_DECISIONS.md`. P2 does not create that root or collect
data.

## Retention

| Asset | Maximum retention | Access |
|---|---:|---|
| Credentials | never written to artifacts | Host secret mechanism only |
| Raw prompts and model output | 30 days | owner and approved reviewers |
| Row-level labels/adjudication | 180 days | owner and approved reviewers |
| Private manifests | through adjudication plus audit window | owner |
| Public aggregate projection | indefinite | public after approval |

Deletion includes working copies, exports, temporary files, and reviewer
packages under project control. Provider-side retention is separately approved
before W3 and recorded as policy metadata.

## Redaction and aggregation

The exporter operates from a typed allowlist:

1. read private manifest and aggregate table;
2. validate protocol and minimum sample floors;
3. remove private-only fields by construction;
4. anonymize provider families;
5. suppress or merge cells below the reporting floor;
6. scan text for sample markers and reconstructable fragments;
7. produce a candidate public projection;
8. require publication-authority approval;
9. write the public artifact and its source aggregate hash.

Free-form copying from private reports is prohibited.

## Publication contract

A public D5 report contains:

- synthetic-checker status separately from real-LLM outcome;
- metric definition and protocol version;
- numerator, denominator, point estimate, and Wilson interval;
- sample-floor and suppression status;
- availability outcomes separated from grounding outcomes;
- provider families identified only by approved anonymous labels;
- limitations and non-claims.

It never contains full prompts, full outputs, row-level labels, reviewer notes,
or enough cells to reconstruct the private corpus.

## Automated gates

Before public commit or package creation:

- tracked-file scan rejects known private roots and sample markers;
- package dry-run confirms private assets and `reference-host/` are absent;
- generated public artifacts pass schema and reconstructability checks;
- Git diff review confirms no manual private-report copy;
- publication approval is recorded outside the public corpus.

Any uncertain artifact is private by default.

## Incident response

If private material enters Git or a package:

1. stop publication and distribution;
2. preserve only the minimum incident metadata;
3. remove the asset from the working tree and package;
4. rotate exposed credentials when applicable;
5. rewrite public Git history if required;
6. request cache removal from hosting/package services;
7. rerun asset-boundary and package gates before release.
