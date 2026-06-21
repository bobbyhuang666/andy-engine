# Andy Engine Clean Architecture No-Debt Completion Plan

> **Historical execution contract.**
> This plan has been executed through Stage 25.1. Current source of truth:
> `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`.
>
> Status: next-stage execution contract.
> Date: 2026-06-21.
> Baseline: Stage 16.1, "COMPLETE with documented debt".
> Goal: remove the documented debt instead of explaining it.

---

## 0. Baseline Summary

Stage 16.1 ended in a stable but not debt-free state.

Validation at baseline:

```text
npm test                 80 files / 1521 tests passed
npm run test:domain      5 files / 82 tests passed
npm run check:boundaries 13 checks passed
npm run smoke:pack       14/14 passed
npm run release:check    passed
npm run perf:check       passed
git diff --check         clean
```

Backup before this plan:

```text
/Users/huangweijie/Desktop/andy-engine-backups/stage16-1-documented-debt-20260621-120022/
├── andy-engine-stage16-1-working-tree-20260621-120022.tar.gz
├── git-status-short.txt
├── git-diff-tracked.patch
├── git-diff-stat.txt
└── legacy-removal-dry-run.txt
```

Current documented debt:

1. `world/` contains 4 standalone tooling implementations outside `src/`.
2. Legacy top-level wrappers remain because tests/imports still depend on them.
3. Some compatibility adapters remain even though not public exports.
4. `index.js` still imports `core/Simulator` and top-level `facts`.
5. `src/sdk/AndyBridge.js` imports `src/store` through a broad facade.
6. Action/effect writeback still has documented legacy direct mutation paths.
7. Some top-level dirs are still included in the npm package for compatibility.

The next goal is not "document and bound debt".

The next goal is:

```text
No accepted canonical debt.
No removable wrapper debt.
No internal dependency on old top-level compatibility paths.
Only approved public facades remain.
```

---

## 1. Final Target Definition

The codebase is considered clean only when all are true:

1. `src/` owns all implementations.
2. `world/` no longer owns canonical implementation.
3. `scripts/legacy-removal-dry-run.js` reports:
   - `standalone-tooling: 0 removable, 0 blocked`
   - no existing file marked removable without deletion
   - no old file marked `can remove now` unless intentionally deferred with a public reason
4. All internal code imports `src/` canonical modules, not top-level wrappers.
5. Tests that are not public compatibility tests import `src/` canonical modules.
6. Old top-level files are only:
   - package public facades, or
   - explicitly approved compatibility adapters needed by public API.
7. `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md` can honestly say:
   - `src/ is the canonical implementation tree`
   - no standalone canonical implementation remains outside `src/`
   - remaining top-level files are public facades or compatibility adapters only
8. Full validation passes.

---

## 2. Non-Negotiable Guardrails

1. Do not add product features.
2. Do not implement StoryArc runtime.
3. Do not implement Adventure / PlayerAgent / QuestSystem / ItemSystem / Fantasy / Cultivation.
4. Do not work on Bobby, Andy Town, UI, map, or presentation products.
5. Do not npm publish.
6. Do not git commit unless the human explicitly asks.
7. Do not break existing documented public exports.
8. Do not remove root `index.js`, `sdk/index.js`, `facts/index.js`, `store/index.js`, `domain/index.js`, or `config/defaults.js` unless the human approves a breaking release.
9. Do not weaken tests to pass migration.
10. Do not accept "documented debt" as a final state.

---

## 3. Required Validation

Run after every stage:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
node scripts/legacy-removal-dry-run.js
git diff --check
```

Run when runtime/action/effects/store/serialization/import paths are touched:

```bash
npm run perf:check
```

If `perf:check` fails once, rerun once. Two consecutive failures count as regression.

---

## 4. Stage 17: Move World Tooling Into `src/`

### Objective

Remove the largest remaining contradiction: `world/` is canonical implementation outside `src/`.

### Required work

Move these implementations:

```text
world/WorldStateAdapter.js -> src/store/world/WorldStateAdapter.js
world/validator.js         -> src/store/world/validator.js
world/compiler.js          -> src/store/world/compiler.js
world/migration.js         -> src/store/world/migration.js
```

Then convert old `world/*` files to thin compatibility wrappers:

```js
module.exports = require('../src/store/world/<file>');
```

Alternative location allowed if better justified:

```text
src/world/
```

But choose one canonical location and document it. Do not split world tooling across multiple locations.

### Required updates

1. Update all tests to import canonical `src/store/world/*` unless the test is explicitly testing compatibility wrapper behavior.
2. Add compatibility tests for old `world/*` wrappers.
3. Export world tooling from `src/store/index.js` if useful internally, but do not add package exports unless explicitly approved.
4. Update:
   - `docs/PUBLIC_FACADE_AUDIT.md`
   - `docs/LEGACY_REMOVAL_REPORT.md`
   - `docs/SERIALIZATION_CONTRACT.md`
   - `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`
5. Update `scripts/legacy-removal-dry-run.js` so `world/*` is no longer `standalone-tooling`.

### Forbidden

- Do not change Stable World Envelope schema.
- Do not change validator semantics.
- Do not change compiler semantics.
- Do not add public exports for world tooling.

### Exit criteria

- No `standalone-tooling` remains.
- `world/*` are wrappers only.
- Canonical implementation is under `src/`.
- Tests pass.

---

## 5. Stage 18: Migrate Test Imports Off Deprecated Wrappers

### Objective

Remove wrappers that exist only because tests import old paths.

### Required work

Use `scripts/legacy-removal-dry-run.js` and `rg` to find tests importing old wrappers:

```bash
rg -n "require\\(['\"]\\.\\./(agent|core|social|spatial|sdk|domain|config)"
rg -n "import\\(['\"]\\.\\./(agent|core|social|spatial|sdk|domain|config)"
rg -n "from ['\"]\\.\\./(agent|core|social|spatial|sdk|domain|config)"
```

Migrate tests that are not explicitly public-compat tests to `src/` paths.

Examples:

```text
tests/unit/emotion.test.js
tests/unit/memory.test.js
tests/unit/personality.test.js
tests/unit/statemachine.test.js
tests/unit/future-tendency.test.js
tests/unit/location-meaning-influence.test.js
tests/action-layer.test.js
tests/spatial.test.js
tests/phase11-migration.test.js
```

### Keep compatibility tests intentionally

Some tests should continue to import old paths to prove wrappers work. Move them under or tag them as:

```text
tests/compatibility/
```

or clearly name them:

```text
*.compat.test.js
```

### Required updates

1. Update `docs/TESTING_ARCHITECTURE.md`.
2. Update `docs/PUBLIC_FACADE_AUDIT.md`.
3. Rerun legacy dry run and reduce blocked deprecated wrappers.

### Forbidden

- Do not delete wrappers until imports are actually migrated.
- Do not weaken behavioral assertions.

### Exit criteria

- Deprecated wrappers blocked only by real public compatibility tests or public exports.
- Internal/unit tests import `src/`.
- Dry-run removable count increases.

---

## 6. Stage 19: Remove Unblocked Deprecated Wrappers

### Objective

Delete wrappers that dry-run proves safe to remove.

### Required work

After Stage 18, run:

```bash
node scripts/legacy-removal-dry-run.js
```

Delete files marked:

```text
deprecated-wrapper
can remove now: YES
```

Also delete compatibility adapters marked removable only if:

1. no public export uses them,
2. no compatibility test intentionally protects them,
3. no docs promise them.

### Required updates

1. Update `docs/PUBLIC_FACADE_AUDIT.md`.
2. Update `docs/LEGACY_REMOVAL_REPORT.md`.
3. Update `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`.
4. Update `package.json.files` if package no longer needs a directory.

### Forbidden

- Do not delete root public facades.
- Do not delete adapters still listed as needed by public API.
- Do not delete `world/*` wrappers if compatibility tests still cover them.

### Exit criteria

- Dry-run has no existing deprecated wrapper with `can remove now: YES`.
- Package dry run does not include deleted files.

---

## 7. Stage 20: Internal Facade Bypass Cleanup

### Objective

Ensure internal code no longer depends on old top-level public facades.

### Required work

Inspect and fix internal imports:

```text
index.js
src/runtime/AndyWorld.js
src/domain/DomainRegistry.js
src/effects/EventEffectPipeline.js
src/sdk/AndyBridge.js
src/sdk/Andy.js
src/sdk/Character.js
```

Known candidates:

```text
index.js imports ./core/Simulator
index.js imports ./facts
src/sdk/AndyBridge.js imports ../store
src/sdk/Andy.js imports ./sdk or ../sdk facade-like paths
src/sdk/Character.js imports ./sdk or broad facade paths
```

Convert internal imports to canonical modules when safe:

```text
src/runtime/*
src/canon/*
src/knowledge/*
src/narrative/*
src/store/*
src/domain/*
```

### Required updates

1. Strengthen `scripts/check-boundaries.js`.
2. Add tests that fail when `src/**` imports old top-level public facades.
3. Update docs.

### Forbidden

- Do not change package public exports.
- Do not remove public facades just because internals stop using them.

### Exit criteria

- Internal code uses canonical imports.
- Public facades are for external callers and compatibility tests only.

---

## 8. Stage 21: Public Facade Minimum Set

### Objective

Reduce top-level package files to the minimum public facade set allowed without breaking approved exports.

### Required work

Review package exports and files:

```text
package.json
index.js
facts/index.js
store/index.js
sdk/index.js
domain/index.js
domain/validateDomain.js
domain/DomainRegistry.js
config/defaults.js
presets/*
```

Decide whether package exports can point directly to `src/` implementations for non-breaking paths:

```text
"./domain/validate": "./src/domain/validateDomain.js"
"./domain/registry": "./src/domain/DomainRegistry.js"
"./config/defaults": "./src/config/defaults.js"
```

If this is considered safe, migrate exports and remove old wrappers. If not, document why.

### Forbidden

- Do not remove `require('andy-engine')`.
- Do not remove `require('andy-engine/sdk')`.
- Do not remove `require('andy-engine/facts')`.
- Do not remove `require('andy-engine/store')`.

### Exit criteria

- Public facade set is minimal.
- Any remaining old top-level file has a package/public reason.
- `smoke:pack` validates every public export.

---

## 9. Stage 22: Effect Writeback Debt Removal

### Objective

Remove documented direct mutation debt in world-facing consequences.

### Required work

Audit and migrate the remaining direct mutation paths documented in:

```text
docs/STATE_WRITEBACK_OWNERSHIP.md
```

Targets include:

```text
ActionSelectionRuntime active mode writes
EventDispatcher encounter -> relationship writes
FactEmitter event-fact fallback
locationMeaning/futureTendency writeback paths
```

Preferred path:

```text
Event / Action
→ EffectResult
→ EffectDelta[]
→ EffectCommitter
→ live state mutation
```

### Forbidden

- Do not route internal psychological tick state through EffectCommitter.
- Do not change BehaviorField, EmotionVector, NeedsSystem algorithms.
- Do not let action selector mutate state directly.

### Exit criteria

- `docs/STATE_WRITEBACK_OWNERSHIP.md` has no "legacy direct mutation" entries for world-facing consequences.
- Tests verify action/effect writeback still works.
- Determinism tests pass.

---

## 10. Stage 23: Final Legacy Removal Dry Run Must Be Empty

### Objective

Make the dry-run script an actual no-debt gate.

### Required work

Update `scripts/legacy-removal-dry-run.js` so it can distinguish:

```text
existing removable debt
missing already-deleted file
public facade
approved compatibility adapter
approved public wrapper
```

The final summary should be able to say:

```text
Existing old files that can be removed now: 0
Standalone tooling outside src: 0
Unclassified old files: 0
```

### Required docs

Update:

```text
docs/LEGACY_REMOVAL_REPORT.md
docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md
docs/PUBLIC_FACADE_AUDIT.md
```

### Exit criteria

- Dry-run report is not just descriptive; it is a gate.
- It fails or clearly reports non-zero if removable debt remains.

---

## 11. Stage 24: Final No-Debt Audit

### Objective

Only now may the project claim a no-debt clean architecture pass.

### Required checks

1. No standalone tooling outside `src/`.
2. No existing removable old wrapper.
3. No unclassified top-level old file.
4. No `src/**` reverse import.
5. No public API docs mismatch.
6. No stale deleted-file references.
7. No legacy direct mutation debt for world-facing consequences.
8. Full validation passes.

### Required output

Update:

```text
docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md
```

The status may say:

```text
Clean Architecture Pass Status: COMPLETE
```

Only if all conditions are true.

### Required validation

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
npm run perf:check
node scripts/legacy-removal-dry-run.js
git diff --check
```

---

## 12. Stage Report Template

Every stage report must include:

```text
Stage:
Status:
Changed files:
What changed:
What did not change:
Behavior changes:
Public API changes:
Legacy-removal-dry-run summary:
Tests run:
Boundary checks:
Performance:
Remaining debt:
Safe for human review:
```

---

## 13. Command for Sub-Architect AI

```text
You are the Andy Engine Clean Architecture sub-architect.

Read first:
- AGENTS.md
- docs/CLEAN_ARCHITECTURE_NO_DEBT_COMPLETION_PLAN.md
- docs/CLEAN_ARCHITECTURE_STAGE_5_16_PLAN.md
- docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md
- docs/PUBLIC_FACADE_AUDIT.md
- docs/LEGACY_REMOVAL_REPORT.md
- docs/STATE_WRITEBACK_OWNERSHIP.md
- docs/SERIALIZATION_CONTRACT.md
- docs/TESTING_ARCHITECTURE.md

Current state:
Stage 16.1 is accepted as "COMPLETE with documented debt".
The human does not want to commit until the project is fully no-debt.
Your job is to drive Stage 17-24 from CLEAN_ARCHITECTURE_NO_DEBT_COMPLETION_PLAN.md.

You must call a sub execution AI for actual edits.
You are responsible for stage planning, task delegation, review, and acceptance.

Rules:
- Do not add product features.
- Do not implement StoryArc runtime.
- Do not work on Bobby, Andy Town, UI, map, Adventure, PlayerAgent, QuestSystem, ItemSystem, Fantasy, or Cultivation.
- Do not npm publish.
- Do not git commit.
- Do not skip stages.
- Do not accept "documented debt" as final completion.
- Do not weaken tests.

Start with Stage 17: Move World Tooling Into src/.

For every stage:
1. Read the exact stage section.
2. Give the execution AI a precise task.
3. Require the validation commands.
4. Review the result.
5. If it fails, request a focused patch.
6. If it passes, proceed to the next stage.

Continue through Stage 24 unless blocked by a real breaking-change/public-API decision.
```

---

## 14. Command for Execution AI

```text
You are the Andy Engine execution AI.

Read:
- AGENTS.md
- docs/CLEAN_ARCHITECTURE_NO_DEBT_COMPLETION_PLAN.md
- docs/CLEAN_ARCHITECTURE_STAGE_5_16_PLAN.md

Execute only Stage <N>: <stage title>.

Do not do later stages.
Do not add features.
Do not commit.

Run required validation:
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
node scripts/legacy-removal-dry-run.js
git diff --check

If touched runtime/action/effects/store/serialization/import paths:
npm run perf:check

Report using the template in CLEAN_ARCHITECTURE_NO_DEBT_COMPLETION_PLAN.md.
```
