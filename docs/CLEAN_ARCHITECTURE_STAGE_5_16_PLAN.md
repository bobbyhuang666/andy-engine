# Andy Engine Clean Architecture Stage 5-16 Plan

> **Historical execution contract.**
> Stages 5-16 have been superseded by the completed Stage 25.1 audit. Do not use
> this file as current implementation guidance.
>
> Status: Temporary execution contract after Stage 4.
> Audience: architecture AI, execution AI, and human reviewer.
> Scope: finish the clean architecture migration from compatibility-heavy prototype to high-decoupling engine codebase.
> Rule: do not add new product features while executing this plan.

---

## 0. Current Baseline

As of Stage 4:

- `src/` is the canonical implementation tree.
- Top-level directories still exist for public compatibility and legacy wrapper support.
- `agent/Agent.js` has been reduced to about 306 lines.
- Agent constructor, restore, and wiring logic has moved to `src/agent/lifecycle/`.
- Agent runtime/facade logic has moved to `src/agent/runtime/` and `src/agent/facade/`.
- Boundary checks currently pass.
- Current full validation before this plan:
  - `npm test`: 78 files / 1467 tests passed
  - `npm run test:domain`: 5 files / 78 tests passed
  - `npm run check:boundaries`: passed
  - `npm run smoke:pack`: 14/14 passed
  - `npm run release:check`: passed
  - `npm run perf:check`: passed after rerun

Backup created before this document:

```text
/Users/huangweijie/Desktop/andy-engine-backups/stage4-current-state-20260621-024236/
├── andy-engine-working-tree-20260621-024236.tar.gz
├── git-status-short.txt
├── git-diff-tracked.patch
└── git-diff-stat.txt
```

---

## 1. One-Sentence Goal

Turn Andy Engine into a clean, high-decoupling engine codebase where:

```text
src/ is the only implementation tree;
top-level files are either explicit public facades or removed;
all state changes flow through defined effect/writeback boundaries;
facts, knowledge, action, effects, runtime, agent, narrative, store, domain, and sdk have enforceable ownership.
```

This is not a rewrite. It is a staged retirement of legacy ownership, imports, and hidden mutation paths.

---

## 2. Non-Negotiable Guardrails

These rules apply to every stage.

1. No StoryArc runtime implementation.
2. No Adventure, PlayerAgent, QuestSystem, ItemSystem, Fantasy, Cultivation, Bobby, Andy Town, UI, map, or product layer work.
3. No public API break unless the stage explicitly says it is a breaking-change stage and the human approves it.
4. No npm publish.
5. No commit unless the human explicitly asks.
6. No large rewrite of psychology algorithms.
7. No direct expansion of `agent/Agent.js`.
8. No new runtime feature while cleaning architecture.
9. No `src/**` import from old top-level wrappers.
10. No new hidden state mutation path.
11. Every stage must update tests or boundary checks when it changes architecture rules.
12. Every stage must end with a report that separates:
    - code changes
    - compatibility changes
    - behavior changes
    - tests run
    - remaining debt

---

## 3. Required Validation Commands

Run these after every stage:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
git diff --check
```

Run this if the stage touches runtime, agent tick, action, effects, event dispatch, social contagion, behavior field, or benchmark paths:

```bash
npm run perf:check
```

Performance rule:

- If `perf:check` fails once, rerun once immediately.
- Only two consecutive failures count as a regression.
- If `runtime-clustered gather` remains `0`, record it as an existing profiling follow-up, not as a blocker, unless the stage directly changes contagion profiling.

---

## 4. Target Directory Ownership

The clean architecture target is:

```text
src/
├── runtime/       Engine orchestration, world stepping, clocks, simulator facade internals
├── canon/         World truth, facts, canon events, fact schema
├── knowledge/     Who knows what; observation and knowledge projection
├── pressure/      Needs, memory, relationship, location, time, and world pressure adapters
├── action/        Candidate generation, utility scoring, selection, reason traces
├── effects/       EffectResult, deltas, effect computation, effect commit boundaries
├── agent/         Agent lifecycle, runtime, handlers, psychology, memory, schedule, facade
├── narrative/     Grounded expression, fact formatting, consistency checking
├── domain/        Domain config contract and validation
├── config/        Engine defaults and config validation
├── spatial/       Region grid, spatial hash, spatial engine
├── social/        Relationship and social graph
├── store/         Serialization, snapshots, persistence adapters
├── sdk/           Public SDK implementation
└── shared/        RNG, ids, errors, time, schemas
```

Top-level directories are not implementation owners. They can only be:

- public facade
- compatibility adapter
- deprecated wrapper
- temporary migration file
- removed

---

## 5. Stage 5: Public Facade and Compatibility Adapter Audit

### Objective

Classify every old top-level file and directory by its real role.

### Files to inspect

```text
index.js
agent/**
core/**
facts/**
effects/**
sdk/**
store/**
social/**
spatial/**
domain/**
config/**
package.json
scripts/check-boundaries.js
tests/package-boundary.test.js
tests/architecture/boundary-check.test.js
```

### Required classification

Each old top-level file must be classified as exactly one:

```text
public-facade
compatibility-adapter
deprecated-wrapper
internal-wrapper
removable
```

Definitions:

- `public-facade`: exported public API surface, must remain until approved breaking release.
- `compatibility-adapter`: performs shape conversion for old callers, must be tested and documented.
- `deprecated-wrapper`: thin re-export kept for old import paths.
- `internal-wrapper`: not public and only used by old internal paths, should be retired.
- `removable`: no real users, can be deleted in a later stage.

### Required work

1. Create or update:

```text
docs/PUBLIC_FACADE_AUDIT.md
```

2. Add a table:

```text
old path | current role | canonical src path | exported? | removal condition | tests protecting it
```

3. Update boundary tests so new top-level implementation logic cannot appear silently.

### Forbidden

- Do not delete old files in this stage.
- Do not change package exports.
- Do not change runtime behavior.

### Exit criteria

- Every old top-level file has a classification.
- All compatibility adapters are named as adapters, not wrappers.
- No ambiguous "legacy" label without removal condition.

---

## 6. Stage 6: Root Public API Contract Finalization

### Objective

Define the stable public import surface for Andy Engine.

### Public API candidates

```text
require('andy-engine')
require('andy-engine/sdk')
require('andy-engine/domain')
require('andy-engine/domain/validate')
require('andy-engine/domain/registry')
require('andy-engine/facts')
require('andy-engine/store')
require('andy-engine/config/defaults')
require('andy-engine/presets/campus')
require('andy-engine/presets/tavern')
```

### Required work

1. Create:

```text
docs/PUBLIC_API_CONTRACT.md
```

2. For each public export, document:

```text
import path
status: stable | compatibility | deprecated
main exports
allowed consumers
breaking-change policy
smoke test coverage
```

3. Update smoke/package boundary tests to match the contract.

### Forbidden

- Do not export internal runtime/facade/lifecycle modules.
- Do not expose `src/agent/runtime/*`.
- Do not expose `src/agent/lifecycle/*`.
- Do not expose implementation classes only because tests use them.

### Exit criteria

- `package.json.exports` and `docs/PUBLIC_API_CONTRACT.md` agree.
- `smoke:pack` covers every stable public export.
- Internal modules remain internal.

---

## 7. Stage 7: Compatibility Adapter Hardening

### Objective

Make old compatibility paths safe, explicit, and non-growing.

### Targets

```text
effects/EventEffectPipeline.js
facts/index.js
core/Simulator.js
core/World.js
core/EventDispatcher.js
sdk/*
store/*
agent/action/*
```

### Required work

1. For every compatibility adapter, add a top comment:

```text
Compatibility adapter.
Canonical implementation: <src path>
Reason retained: <public API / old shape conversion / package export>
Deletion condition: <condition>
```

2. For pure wrappers, ensure they are only:

```js
module.exports = require('../src/...');
```

3. For adapters that transform data, add focused tests.

4. Add boundary check rule:

```text
old top-level adapters may import src;
src may not import old top-level adapters;
old top-level adapters may not import each other except through documented public facades.
```

### Forbidden

- Do not remove adapters yet.
- Do not make adapters own business logic.
- Do not create new adapters without classification.

### Exit criteria

- Every adapter has an explicit reason and deletion condition.
- Every non-thin adapter has tests.
- `scripts/check-boundaries.js` fails if old top-level implementation logic grows outside approved adapters.

---

## 8. Stage 8: Internal Import Canonicalization

### Objective

All internal code must import canonical `src/` modules.

### Required work

1. Scan all source and tests:

```bash
rg "require\\(['\"]\\.\\./(agent|core|facts|effects|sdk|store|social|spatial|domain|config)" src tests scripts
rg "require\\(['\"]\\.\\./\\.\\./(agent|core|facts|effects|sdk|store|social|spatial|domain|config)" src tests scripts
```

2. Convert internal imports to `src/` canonical paths.

3. Separate tests into intent groups:

- public API tests can import top-level public facades.
- internal tests should import `src/`.
- compatibility tests can import old top-level wrappers intentionally.

4. Update boundary checks to encode those rules.

### Forbidden

- Do not change public imports in README examples unless Stage 6 contract changed.
- Do not change behavior while rewriting imports.

### Exit criteria

- `src/**` has zero reverse imports from old top-level wrappers.
- Internal tests use `src/` unless explicitly tagged compatibility/public API.
- Boundary scanner enforces this continuously.

---

## 9. Stage 9: Effect and State Writeback Unification

### Objective

Make state mutation ownership explicit.

Target flow:

```text
Action / CanonEvent
→ EffectResult
→ EffectDelta[]
→ EffectCommitter
→ State writeback
```

### Current concern

Some direct mutation paths still exist because older modules predate the effect/delta layer.

### Required work

1. Audit mutation paths for:

```text
agent.memory.*
agent.emotion.*
agent.needs.*
agent.position =
relationship.recordInteraction
futureTendency.updateTendency
locationMeaning writes
factStore.addFact / invalidateFact
knowledgeStore grants
```

2. Create or update:

```text
docs/STATE_WRITEBACK_OWNERSHIP.md
```

3. Classify mutation paths:

```text
owned by subsystem
owned by EffectCommitter
legacy direct mutation
test-only mutation
public API mutation
```

4. Move action-result writeback behind `src/effects/EffectCommitter` where safe.

5. Add tests for each moved mutation path.

### Forbidden

- Do not route every old psychological tick mutation through EffectCommitter in one step.
- Do not change emotion/needs/memory algorithms.
- Do not make action selector mutate live state.

### Exit criteria

- New world-facing consequences use `EffectResult`/delta/committer.
- Legacy direct mutation paths are listed and bounded.
- Action active mode writes through approved commit boundary.

---

## 10. Stage 10: Canon, Knowledge, Narrative Authority Hardening

### Objective

Separate truth, knowledge, and expression authority.

### Authority model

```text
Canon: what is true in the world.
Knowledge: who knows what and how.
Narrative: what a speaker is allowed to express.
```

### Required work

1. Ensure dispatched event to fact path is only:

```text
CanonEventPipeline
```

2. Ensure `FactEmitter` is only:

```text
static/state/observation/relationship descriptive facts
```

3. Mark `FactEmitter.emitEventFacts` as deprecated fallback if still present.

4. Strengthen `FactProvider` tests:

- self agent state allowed
- other agent state blocked unless knowledge evidence exists
- observation knowledge permits claims
- told/inferred knowledge permits weaker claims

5. Strengthen `FactConsistencyChecker` tests:

- unsupported location claims fail
- unsupported relationship claims fail
- unsupported event causality claims fail

### Forbidden

- Do not let narrative create facts.
- Do not let LLM output bypass fact consistency checking.
- Do not give all agents global event knowledge by default.

### Exit criteria

- Canon/knowledge/narrative responsibilities are tested independently.
- Unsupported claims fail at grounding layer and checker layer.
- Event-to-fact ownership is single-path.

---

## 11. Stage 11: Store and Serialization Boundary Cleanup

### Objective

Make persistence a stable boundary instead of a side effect of runtime internals.

### Required work

1. Audit:

```text
src/store/*
store/*
src/runtime/AndyWorld.js
index.js savedState path
src/agent/lifecycle/*
world state adapter/tooling
```

2. Create or update:

```text
docs/SERIALIZATION_CONTRACT.md
```

3. Define:

```text
runtime snapshot payload ownership
stable envelope ownership
agent snapshot restore expectations
RNG state restore expectations
schedule restore expectations
fact/knowledge restore expectations
store API surface
```

4. Add or strengthen:

- engine serialize -> restore -> tick
- seeded engine serialize -> restore -> same continuation
- facts/knowledge serialize -> restore -> grounded narrative
- store create/write/read/close smoke

### Forbidden

- Do not change Stable World Envelope without explicit approval.
- Do not leak internal psychology fields into public schema contracts.
- Do not make store depend on presentation concepts.

### Exit criteria

- Store public API is documented.
- Runtime snapshot and stable envelope are clearly separated.
- Restore tests cover schedule, RNG, facts, knowledge, and agent lifecycle.

---

## 12. Stage 12: Domain and Campus Legacy Isolation

### Objective

Make campus a preset, not a core assumption.

### Required work

1. Re-audit source scan allowlist.

2. Inspect:

```text
src/config/defaults.js
config/defaults.js
src/agent/schedule/Schedule.js
presets/campus/*
presets/tavern/*
src/domain/*
tests/source-scan.test.js
```

3. Classify remaining campus terms:

```text
campus preset
legacy compatibility config
documentation
tests
bug
```

4. Move anything runtime-domain-specific into domain preset if safe.

5. Strengthen custom domain tests:

- no campus region generated
- no campus state generated
- no campus event template used
- narrative/grounding has no forbidden terms
- schedule archetypes are domain-native

### Forbidden

- Do not remove campus preset.
- Do not weaken default `new AndyEngine()` compatibility.
- Do not put tavern/Oak/Oak Town into core.

### Exit criteria

- Campus language exists only in approved paths.
- Default campus works.
- Custom tavern still proves domain-agnostic runtime.

---

## 13. Stage 13: Testing Architecture Cleanup

### Objective

Make tests communicate architecture boundaries.

### Target test layout

```text
tests/public-api/
tests/internal/
tests/architecture/
tests/regression/
tests/domain/
tests/performance/
tests/store/
tests/facts/
tests/action/
tests/agent/
```

### Required work

1. Create:

```text
docs/TESTING_ARCHITECTURE.md
```

2. Move tests gradually only when path intent is clear.

3. Update package scripts if needed:

```text
test:domain
test:compat
check:boundaries
smoke:pack
perf:check
```

4. Tag tests by purpose:

- public compatibility
- internal module correctness
- architecture boundary
- regression
- performance

### Forbidden

- Do not do a massive test rename with behavior changes.
- Do not weaken tests to make moves easier.
- Do not remove old regression tests unless replaced.

### Exit criteria

- Architecture tests are easy to find.
- Public API tests do not import internals.
- Internal tests do not depend on compatibility wrappers.

---

## 14. Stage 14: Legacy Directory Removal Dry Run

### Objective

Simulate legacy removal before deleting anything.

### Required work

1. Create script:

```text
scripts/legacy-removal-dry-run.js
```

2. It should report:

```text
old file
classification from Stage 5
is exported by package.json?
is imported by src?
is imported by tests?
is imported by examples/docs?
can remove now?
blockers
```

3. Create:

```text
docs/LEGACY_REMOVAL_REPORT.md
```

4. Run dry run and update the report.

### Forbidden

- Do not delete files in this stage.
- Do not auto-modify imports from the dry-run script.

### Exit criteria

- Every old top-level file has a deletion readiness status.
- Human can see exactly what would break if a directory is removed.

---

## 15. Stage 15: Legacy Directory Retirement

### Objective

Delete only the legacy files proven safe by Stage 14.

### Deletion order

1. Remove internal-only wrappers.
2. Remove unexported deprecated wrappers.
3. Keep public facades unless breaking release is approved.
4. Keep compatibility adapters with active public callers.
5. Update package files and docs only after tests prove safe.

### Required work

1. Delete only files listed as safe in `LEGACY_REMOVAL_REPORT.md`.

2. Update:

```text
package.json
README.md
README.zh-CN.md if present
docs/API_BOUNDARY.md
docs/PUBLIC_API_CONTRACT.md
docs/CLEAN_ARCHITECTURE_AUDIT.md
```

3. Run full validation.

### Forbidden

- Do not delete root `index.js` unless a major breaking architecture release is explicitly approved.
- Do not delete public facades used by smoke tests.
- Do not change behavior to satisfy removal.

### Exit criteria

- Removed files are backed by dry-run evidence.
- No public smoke test fails.
- No `src/**` import points to deleted paths.

---

## 16. Stage 16: Final No-Debt Architecture Audit

### Objective

Declare the clean architecture pass complete only if the codebase is enforceably clean.

### Required audit dimensions

1. Directory ownership
2. Public API contract
3. Internal import direction
4. Agent facade containment
5. Action/effects writeback boundaries
6. Canon/knowledge/narrative authority
7. Store/serialization contract
8. Domain/campus isolation
9. Test architecture
10. Performance baseline
11. Package boundary
12. Documentation truth

### Required output

Create:

```text
docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md
```

It must contain:

```text
current architecture tree
remaining public facades
remaining compatibility adapters
remaining intentionally accepted debt
removed debt
test matrix
known follow-ups
whether the clean architecture pass is complete
```

### Required validation

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
npm run perf:check
git diff --check
```

### Exit criteria

The pass is complete only if:

- `src/` is the canonical implementation tree.
- Old top-level directories are either public facades, documented compatibility adapters, or removed.
- No unclassified old file remains.
- No `src/**` reverse import exists.
- Agent.js remains thin and cannot grow unchecked.
- New world-facing state changes use approved effect/writeback paths.
- Canon/knowledge/narrative boundaries are enforced by tests.
- Store/serialization boundaries are documented and tested.
- Campus legacy is isolated.
- Docs match code.

---

## 17. Stage Report Template

Every execution report must use this format:

```text
Stage:
Status:

Changed files:

What changed:

What did not change:

Behavior changes:
  - None / list exact changes

Public API changes:
  - None / list exact changes

Tests run:
  - command: result

Boundary checks:
  - result

Performance:
  - not touched / perf:check result

Remaining debt:

Safe for architecture review:
  - yes/no
```

---

## 18. Command Prompt for Sub-Architect AI

Use this when handing the plan to a sub-architect:

```text
You are the Andy Engine sub-architect.

Read these files first:
- AGENTS.md
- docs/CLEAN_ARCHITECTURE_STAGE_5_16_PLAN.md
- docs/CLEAN_ARCHITECTURE_PLAN.md
- docs/API_BOUNDARY.md
- docs/MODULE_MAP.md
- docs/ARCHITECTURE_BOUNDARIES.md
- docs/PUBLIC_FACADE_AUDIT.md if it exists
- docs/PUBLIC_API_CONTRACT.md if it exists

Your job is to drive Stage 5-16 in order.

Do not skip stages.
Do not add product features.
Do not implement StoryArc, Adventure, PlayerAgent, QuestSystem, ItemSystem, Fantasy/Cultivation, Bobby, Andy Town, UI, or map logic.
Do not commit unless the human explicitly asks.

For each stage:
1. Write a concise execution task for the execution AI.
2. Require the execution AI to run the validation commands.
3. Review its report against this plan.
4. If it passes, move to the next stage.
5. If it fails, request a focused patch, not a broad rewrite.

The final goal is a codebase where src/ is the only implementation tree, legacy top-level files are either documented public facades/adapters or removed, and all architectural boundaries are enforced by tests.
```

---

## 19. Command Prompt for Execution AI

Use this template for each stage:

```text
You are the Andy Engine execution AI.

Read:
- AGENTS.md
- docs/CLEAN_ARCHITECTURE_STAGE_5_16_PLAN.md
- docs/API_BOUNDARY.md
- docs/MODULE_MAP.md
- docs/ARCHITECTURE_BOUNDARIES.md

Execute only Stage <N>: <stage name>.

Do not do any work from later stages.
Do not add new features.
Do not commit.

Follow the stage objective, required work, forbidden list, and exit criteria exactly.

Run:
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
git diff --check

If runtime/performance paths were touched, also run:
npm run perf:check

Report using the Stage Report Template from docs/CLEAN_ARCHITECTURE_STAGE_5_16_PLAN.md.
```
