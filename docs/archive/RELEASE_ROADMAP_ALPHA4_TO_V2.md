# Andy Engine Release Roadmap: alpha.4 -> v2.0.0

> Status: **completed roadmap** / historical execution plan
> v2.0.0 Foundation Stable Release preparation completed
> Scope: release hardening, public contract stabilization, and beta/RC graduation  
> Non-goal: new product features

This document is the execution roadmap from `v2.0.0-alpha.4` to the first stable
`v2.0.0` release.

The goal is not to make Andy Engine "feature complete". The goal is to make it
credible as an engine codebase:

- installable in clean consumer projects
- honest about determinism, persistence, and performance
- observable when internals fail
- domain-safe by test, not by wish
- documented enough for external developers
- stable enough that downstream apps can build on it

Do not use this roadmap as permission to implement StoryArc, WorldObject runtime,
Adventure/RPG systems, Bobby product logic, Andy Town UI, or any presentation-layer
feature.

---

## Current Baseline

Current branch status at the time this roadmap was written:

- Target package line: `2.0.0-alpha.3`
- Architecture status: Clean Architecture Pass complete
- Implementation ownership: `src/` owns implementation
- Remaining public facades:
  - `index.js`
  - `agent/Agent.js`
  - `facts/index.js`
  - `domain/index.js`
  - `store/index.js`
  - `sdk/index.js`
- SQLite persistence: optional dependency strategy
- Native acceleration: officially supported, but binaries are not prebuilt
- Determinism: seeded simulation baseline for core runtime paths, not full replay
- Known deferred debts:
  - NarrativeBuilder string parsing debt
  - SDK presentation RNG debt (`EmotionSignalBuffer`)
  - Personality restore semantic debt
  - private-field access cleanup
  - semantic profile migration
  - Knowledge propagation RFC not implemented
  - Grounding checker v2 RFC not implemented
  - AffectCompiler RFC not implemented

---

## Release Philosophy

### What alpha means

Alpha releases may still change behavior, internal architecture, and some public
details, as long as changes are documented. Alpha is allowed to improve contracts.

Alpha is not allowed to overclaim:

- do not claim full deterministic replay
- do not claim production stability
- do not claim all domains are equally mature
- do not claim SQLite/native acceleration is required for core engine use

### What beta means

Beta means public contract freeze candidate.

After beta:

- public exports should not change without a migration note
- save/load format should not change without a migration path
- docs must match runtime behavior
- release checks must pass on at least two clean machines
- performance gate must be stable enough to trust

### What v2.0.0 means

`v2.0.0` is a **Foundation Stable Release**.

It means external users can build on Andy Engine without tracking every internal
refactor. It also means the core contracts for runtime, domain config,
persistence, package installation, and grounded narrative edges are stable enough
to support downstream applications.

It does not mean Andy Engine has delivered the complete "AI life" experience.
Aliveness-facing systems such as AffectCompiler implementation, Knowledge
propagation, Grounding checker v2, StoryArc runtime, WorldObject integration, and
longitudinal demos belong to later `v2.1` / `v3` roadmaps.

---

## Global Guardrails

These rules apply to every stage in this roadmap.

1. Do not implement StoryArc runtime unless a later roadmap explicitly authorizes it.
2. Do not implement WorldObject runtime unless a later roadmap explicitly authorizes it.
3. Do not change Stable World Envelope fields without a schema migration plan.
4. Do not add Bobby, Andy Town, game, romance, companion, UI, map, robot, or app logic to engine core.
5. Do not add new public exports without updating:
   - `package.json`
   - `README.md`
   - `docs/PUBLIC_API_CONTRACT.md`
   - package-boundary tests
   - smoke-pack tests
6. Do not weaken source-scan, boundary checks, or perf thresholds to make tests pass.
7. Do not silently swallow runtime errors. Use diagnostics or explicit typed errors.
8. Do not introduce new bare `Math.random()` / `Date.now()` in core simulation paths.
9. Do not add production dependencies unless the dependency surface audit is updated.
10. Do not npm publish before the roadmap explicitly reaches the publish gate.

---

## Required Validation Matrix

Every implementation stage must run:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
npm run typecheck
npm run perf:check -- --runs=3
node scripts/legacy-removal-dry-run.js
git diff --check
```

If persistence files are touched:

```bash
npm run sqlite:smoke
```

If native loader or native wrappers are touched:

```bash
ANDY_USE_NATIVE=1 node -e "require('./src/agent/psychology/EmotionVector.native')"
ANDY_USE_NATIVE=optional node -e "require('./src/agent/psychology/EmotionVector.native')"
```

If README/package exports are touched:

```bash
npm run smoke:pack
npm pack --dry-run
```

---

## Stage alpha.4: SDK, Narrative Contract, and Basic AffectFrame Seam

### Goal

Make the SDK/presentation edge more honest and less brittle without changing core
simulation behavior. Establish the minimum seam that a future AffectCompiler can
attach to, without implementing the full AffectCompiler.

### Why this stage exists

`alpha.3` made installation and release contracts more credible. The next risk is
the user-facing expression layer:

- `NarrativeBuilder` still parses formatted Chinese strings
- `EmotionSignalBuffer` still uses presentation-level `Math.random()` / `Date.now()`
- SDK tests are thinner than runtime tests
- Bobby/campus compatibility has been documented, but SDK naming still carries old history
- future AffectCompiler work must not be blocked by a frozen narrative/LLM contract

### Work items

#### A4.1 NarrativeBuilder string parsing audit

Create or update documentation:

- `docs/NARRATIVE_CONTRACT_AUDIT.md`

Classify every string-format dependency in `src/sdk/NarrativeBuilder.js`:

- world context string parsing
- needs string parsing
- emotion string parsing
- valence string parsing
- domain-aware term replacement

For each item, record:

- current source
- failure mode
- whether it is release-blocking
- preferred structured replacement
- tests required before changing behavior

Do not rewrite `NarrativeBuilder` in this substage unless the change is purely
mechanical and fully covered.

#### A4.2 Structured narrative input seam

Add a minimal internal seam so future narrative code can consume structured state
instead of parsing strings.

Allowed:

- helper function(s) under `src/sdk/`
- no public API change
- tests proving old narrative output still exists

Forbidden:

- changing LLM prompt strategy broadly
- implementing AffectCompiler
- changing `getNarrative()` public shape

#### A4.3 Basic AffectFrame seam

Add a minimal **internal** `AffectFrame` seam for the narrative/LLM edge.

This is a compatibility seam, not an affect model implementation.

Allowed:

- define an internal `AffectFrame` shape or builder under `src/narrative`,
  `src/sdk`, or `src/shared`
- derive a shallow frame from already-existing state such as emotion valence,
  arousal-like intensity, dominant emotions, needs summary, relationship context,
  and behavior label
- pass the frame into narrative/prompt construction as optional structured input
- add tests proving existing narrative output remains compatible

Forbidden:

- implementing full AffectCompiler
- changing `EmotionVector` semantics
- letting LLM invent affect facts
- adding new public API until beta public contract review
- adding pro/private behavior into open-source runtime

The required design invariant is:

```text
Engine owns affect state.
LLM owns wording.
LLM may express AffectFrame, but may not create affect facts.
```

This seam must remain narrow enough that future AffectCompiler can replace the
basic builder without breaking public narrative/LLM contracts.

#### A4.4 EmotionSignalBuffer deterministic hygiene

Move `EmotionSignalBuffer` from bare randomness to injected optional RNG/time.

Rules:

- SDK/presentation determinism is best-effort, not part of core seeded replay claim
- no full replay promise
- no breaking constructor signature
- default behavior remains usable without seed

Tests:

- same RNG/time produces same variant
- no RNG still works
- no new core source-scan failures

#### A4.5 SDK smoke tests

Add focused SDK tests for:

- `Character`
- `Andy`
- `AndyBridge`
- `LLMAdapter`
- `EmotionSignalBuffer`
- `ConversationLog`

The goal is not exhaustive behavioral testing. The goal is preventing obvious
external API regressions.

### Exit criteria

- no alpha.4 blocker in narrative/SDK edge
- SDK presentation randomness classified
- narrative string parsing debt documented or reduced
- Basic AffectFrame seam exists or is explicitly deferred with a public-contract reason
- future AffectCompiler can attach to narrative/LLM edge without breaking public API
- no public API change unless documented
- validation matrix passes

---

## Stage alpha.5: Semantic Profile Migration and Beta-Readiness Audit

### Goal

Move Chinese semantic defaults out of generic runtime defaults and into explicit
domain semantic profiles. Fold the private-field access cleanup into this stage
as a beta-readiness audit rather than a standalone refactor stage.

### Why this stage exists

The runtime is domain-aware, but some fallback semantics still live in generic
config or core modules:

- interaction templates
- emotion keyword rules
- event meaning rules
- narrative fallback phrases
- mind-wander fallback phrases

The engine should support Chinese campus/tavern domains, but Chinese should not be
the invisible default of the core runtime.

### Work items

#### A5.1 Implement `domain.semanticProfile`

Use `docs/SEMANTIC_PROFILE_RFC.md` as input.

Minimal shape:

```js
semanticProfile: {
  language: 'zh-CN',
  eventMeaningRules: {},
  emotionKeywords: {},
  narrativeFallbacks: {},
  interactionTemplates: {},
  mindWanderTemplates: {}
}
```

Only add fields that are actually consumed.

#### A5.2 Migrate existing Chinese defaults

Move domain-specific Chinese defaults to:

- `presets/campus`
- `presets/tavern`

Generic fallback must be neutral and minimal.

#### A5.3 Strengthen source scan

Add source-scan rules for:

- Chinese fallback templates in `src/runtime`
- Chinese fallback templates in `src/agent`
- domain terms in generic config

Allow:

- tests
- docs
- presets
- explicitly documented compatibility exceptions

#### A5.4 Private access beta-readiness audit

Create or update:

- `docs/PRIVATE_ACCESS_AUDIT.md`

Classify remaining private-field reads before beta:

- `agent._domain`
- `agent._socialGraphRef`
- `socialGraph._adjacency`
- `memory._simTime`
- `eventDispatcher._simTime`
- `neighbor._behavior`

For each access, document:

- file
- field
- purpose
- risk
- proposed public accessor
- whether it must be fixed before beta

Allowed implementation in this stage:

- add narrow read-only accessors if the replacement is low-risk
- replace private reads only when tests already cover behavior

Forbidden implementation in this stage:

- large Agent refactor
- large SocialGraph refactor
- psychology semantics changes
- hot-path rewrites

### Exit criteria

- custom minimal domain does not emit Chinese fallback text in runtime paths
- campus/tavern behavior preserved
- source-scan covers semantic profile boundaries
- private access debt is audited and beta-blocking items are either fixed or explicitly deferred
- validation matrix passes

---

## Stage beta.1: Public API Freeze Candidate

### Goal

Freeze the public API surface for v2.0.0 unless a critical bug is found.

### Required public paths

The following paths must be either stable or explicitly marked experimental:

```text
andy-engine
andy-engine/sdk
andy-engine/domain
andy-engine/domain/validate
andy-engine/domain/registry
andy-engine/store
andy-engine/facts
andy-engine/config/defaults
andy-engine/presets/campus
andy-engine/presets/tavern
```

### Work items

#### B1.1 Public API contract finalization

Update:

- `docs/PUBLIC_API_CONTRACT.md`
- `README.md`
- `index.d.ts`
- `src/sdk/types.d.ts`
- package-boundary tests

Every public export must declare:

- status: stable / experimental / compatibility
- main use case
- input contract
- output contract
- error behavior
- persistence implications

#### B1.2 Type surface hardening

Add type coverage for:

- `AgentPublic`
- `NarrativeResult`
- `Snapshot`
- `Store`
- `SQLiteStore`
- `DomainValidationResult`
- `ReasonTrace`
- `SelectedAction`
- `EffectResult`

Do not migrate JS to TS.

#### B1.3 Fresh consumer typecheck

Add a smoke script that:

- packs the package
- installs it in temp consumer
- installs TypeScript
- typechecks a CJS consumer

#### B1.4 AffectCompiler seam compatibility review

Before beta freezes public contracts, verify that the narrative/LLM edge can accept
a future AffectCompiler without breaking public API.

This review must confirm:

- `AffectFrame` or equivalent structured affect input can flow into narrative
  generation internally
- LLM-facing code can express structured affect without creating new world facts
- no public API is frozen in a shape that forces string parsing forever
- `docs/AFFECT_COMPILER_RFC.md` remains compatible with the current narrative seam

Do not implement AffectCompiler in beta. This is a compatibility review only.

### Exit criteria

- public API docs and `.d.ts` match runtime
- smoke-pack includes type smoke
- no known public type lie
- future AffectCompiler can attach to narrative/LLM edge without public API breakage
- validation matrix passes

---

## Stage beta.2: Persistence and Migration Freeze Candidate

### Goal

Stabilize what v2 worlds can save, load, and migrate.

### Work items

#### B2.1 World schema freeze review

Review:

- `docs/WORLD_SCHEMA.md`
- `docs/SERIALIZATION_CONTRACT.md`
- `src/store/world/validator.js`
- `src/store/world/WorldStateAdapter.js`
- `src/store/world/migration.js`

Classify:

- stable envelope
- opaque runtime snapshot
- experimental fields
- migration-only fields

#### B2.2 Save/load compatibility tests

Add fixtures:

- minimal world
- campus world
- tavern world
- custom mini-domain world
- world with facts enabled
- world with action selection enabled

Tests must prove:

- load -> tick works
- snapshot -> load -> snapshot preserves envelope
- unsupported schema version gives clear error

#### B2.3 SQLite optional path finalization

Document and test:

- no SQLite install path
- SQLite available path
- clear error path
- `sqlite:smoke`

### Exit criteria

- v2 save/load contract documented
- migration behavior explicit
- SQLite optional dependency story stable
- validation matrix passes

---

## Stage beta.3: Performance Truth Pass and Baseline Calibration

### Goal

Make performance checks reliable enough to be trusted during the v2 freeze.
This stage calibrates and documents performance truth. It does not authorize
large psychology, social, memory, or spatial hot-path rewrites.

### Work items

#### B3.1 Local baseline calibration

Add a local baseline workflow:

```bash
npm run perf:calibrate
npm run perf:check:local
```

Rules:

- CI/main-machine baseline remains strict
- local baseline compares a machine against itself
- docs explain that cross-machine perf numbers are not directly comparable

#### B3.2 Performance truth audit

Audit the performance reporting pipeline:

- benchmark configs
- baseline metadata
- median calculation
- local vs release-machine baseline distinction
- `perf:diagnose` output
- README and `docs/PERFORMANCE.md` claims

Forbidden in this stage:

- psychology-system rewrites
- memory retrieval rewrites
- social graph algorithm rewrites
- spatial engine rewrites
- benchmark threshold loosening without data

If a real P0 performance regression is found, create a separate bugfix task with
measured evidence instead of turning beta.3 into a broad optimization pass.

#### B3.3 Perf docs truth pass

Update:

- `docs/PERFORMANCE.md`
- README performance section

### Exit criteria

- perf failures are actionable, not machine-noise
- local baseline supported
- median perf check stable
- no psychology/spatial hot-path refactor was introduced under this stage
- validation matrix passes

---

## Stage beta.4: Security, License, and Dependency Audit

### Goal

Remove preventable release risk from dependencies and licensing.

### Work items

#### B4.1 npm audit review

Run:

```bash
npm audit
```

For each finding:

- package
- severity
- path
- whether it affects packed runtime
- fix strategy
- whether fix changes public behavior

Do not blindly run `npm audit fix` without reviewing the diff.

#### B4.2 Dependency surface finalization

Update:

- `docs/DEPENDENCY_SURFACE_AUDIT.md`

Confirm:

- production dependencies are minimal
- optional dependencies are documented
- dev dependencies do not leak into package runtime

#### B4.3 License verification

Confirm:

- package license is `AGPL-3.0-only`
- LICENSE text matches AGPL-3.0
- README commercial licensing section is present
- no custom legal terms are inserted into AGPL text

### Exit criteria

- no unreviewed high severity audit issue
- dependency story documented
- license story clear
- validation matrix passes

---

## Stage rc.1: Release Candidate Freeze

### Goal

Create the first v2.0.0 release candidate.

### Freeze rules

Allowed after rc.1:

- bug fixes
- docs truth fixes
- test fixes
- packaging fixes

Not allowed after rc.1:

- new runtime systems
- public API expansion
- schema expansion
- action semantics changes
- domain semantics migration
- large refactors

### Work items

#### RC1.1 Version update

Set:

```json
"version": "2.0.0-rc.1"
```

Update README status.

#### RC1.2 Full fresh install QA

On at least two machines:

- clean clone
- `npm ci`
- `npm test`
- `npm run smoke:pack`
- `npm run typecheck`
- `npm run release:check`
- `npm run perf:check -- --runs=3`

One machine should test no SQLite binding.
One machine should test SQLite available.

#### RC1.3 Package artifact QA

Run:

```bash
npm pack --dry-run
npm pack
```

Verify tarball:

- includes expected public files
- excludes tests
- excludes historical docs/archive
- includes native source files if native support remains official
- includes type declarations

### Exit criteria

- no known P0/P1 release blocker
- docs match package
- fresh consumer smoke passes
- validation matrix passes

---

## Stage rc.2: Bugfix Candidate

### Goal

Absorb issues found during rc.1 without restarting architecture work.

### Work items

- fix only rc.1 findings
- no planned feature work
- update changelog/release notes
- rerun full QA

### Exit criteria

- zero known P0/P1
- no new public API changes since rc.1 unless documented as bug fix
- validation matrix passes

---

## Stage v2.0.0: Stable Release

### Goal

Tag and publish the first **Foundation Stable Release** for v2.

This release stabilizes engine foundations. It is not the complete AI life
experience release.

### Pre-release checklist

1. `README.md` current and honest
2. `docs/PUBLIC_API_CONTRACT.md` current
3. `docs/WORLD_SCHEMA.md` current
4. `docs/PERFORMANCE.md` current
5. `docs/DEPENDENCY_SURFACE_AUDIT.md` current
6. `index.d.ts` and package exports aligned
7. `npm run release:check` passes
8. `npm run smoke:pack` passes
9. `npm run typecheck` passes
10. `npm run perf:check -- --runs=3` passes on release machine
11. package tarball inspected
12. GitHub release notes drafted
13. backup tarball created

### Publish gate

Only publish to npm if all are true:

- user explicitly approves npm publish
- version is final `2.0.0`
- no known P0/P1
- README install instructions tested from packed tarball
- license and commercial licensing wording reviewed

### Release commands

```bash
npm version 2.0.0 --no-git-tag-version
npm run release:check
npm run typecheck
npm run perf:check -- --runs=3
npm pack --dry-run
git add .
git commit -m "Release Andy Engine v2.0.0"
git tag v2.0.0
git push origin main --tags
```

Only after explicit approval:

```bash
npm publish
```

---

## v2.1 / v3 Aliveness Roadmap

After `v2.0.0`, create a separate aliveness roadmap for systems that make Andy
feel more like a persistent subject over time.

These items should not block the Foundation Stable Release unless they become
release bugs:

- AffectCompiler implementation
- Knowledge propagation runtime
- Grounding checker v2 implementation
- WorldObject spatial/perception/effect integration
- StoryArc runtime
- longitudinal demo / long-horizon alive-sense evaluation
- IntrinsicMotivation split
- PersonalMemory split
- full deterministic replay
- native prebuilt binary distribution
- ECS / SharedArrayBuffer / large-scale 100k-agent architecture

---

## Summary Timeline

```text
alpha.4  SDK and narrative contract hardening
alpha.5  Semantic profile migration and beta-readiness audit
beta.1   Public API freeze candidate
beta.2   Persistence and migration freeze candidate
beta.3   Performance truth pass and baseline calibration
beta.4   Security, license, and dependency audit
rc.1     Release candidate freeze
rc.2     Bugfix candidate
v2.0.0   Foundation Stable Release
v2.1/v3  Aliveness Roadmap
```

The engine should become stable by narrowing claims, hardening contracts, and
removing hidden ambiguity. Do not chase new expressive features until the release
surface is boring.
