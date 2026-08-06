# Contributing to Andy Engine

Thanks for your interest in contributing.

## Before you open a pull request

1. **Read the guardrails.** [AGENTS.md](AGENTS.md) defines the architecture
   rules that every change must respect (layer boundaries, provider read-only
   rules, seeded RNG, domain-driven semantics). PRs that violate them will be
   asked to rework.
2. **Sign the CLA.** By submitting a pull request you agree to the
   [Contributor License Agreement](CLA.md).
3. **Check the public contract.** Behavioral guarantees live in
   [docs/PUBLIC_API_CONTRACT.md](docs/PUBLIC_API_CONTRACT.md). Changes that
   alter the contract need an explicit discussion first.

## Required verification gates

Run these locally before pushing. CI runs the same set, plus packaging,
SQLite, performance, and release gates:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
git diff --check
```

If your change touches runtime / action / effects / social contagion /
performance paths, also run:

```bash
npm run perf:check
```

## Scope notes

- New implementation code goes under `src/`. Do not revive retired top-level
  implementation directories (`core/`, `effects/`, `social/`, `spatial/`,
  `config/`, `world/`, `agent/action/`).
- No world-specific vocabulary (tavern, campus, Oak Town) belongs in core
  logic; use domain presets.
- Action providers must stay read-only.
- Please do not bump versions, add tags, or publish to npm; releases are
  maintainer-managed.

## Questions

Open an issue with the **feature request** template for design discussions,
or the **bug report** template for defects.
