# Integration Beta Roadmap

> **Status:** Wave 0 planning decisions recorded; P2 architecture package in progress
> **Current baseline:** Foundation Alpha / internal phase line v2.6, calibrated at `b0b5116` (`package.json` remains `2.0.1`)
> **Target:** Integration Beta
> **Scope:** Architecture and verification plan only; this document is not an execution card.
> **Canonical repository:** `/Users/huangweijie/Documents/andy-engine`

## 0. Executive decision

Andy Engine has completed the engine-foundation phase. Its next phase should not
be another broad core-feature expansion. The next phase should prove, through one
repeatable Reference Vertical Slice, that the existing persistent-world loop is
usable over a continuous multi-character run with real LLM output:

```text
WorldCanon
  → Observation / Knowledge
  → State & Pressure
  → Action Candidates / Utility Selection
  → CanonEvent
  → EventEffectPipeline / EffectCommitter
  → Memory / Relationship / LocationMeaning / FutureTendency
  → Grounded Narrative
```

The Integration Beta outcome is evidence, not feature count. The phase is
successful when an external-style host can use public APIs to run, interrupt,
save, resume, observe, and evaluate a small persistent world without reaching
into engine internals or manufacturing the state that the demonstration is
supposed to prove.

## 1. Stage judgment and evidence

### 1.1 Why the project is beyond a proof of concept

The Foundation Alpha baseline already has:

- a canonical `src/` implementation and guarded public facades
  (`AGENTS.md`, `docs/archive/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`,
  `tests/architecture/boundary-check.test.js`);
- stable public imports and a documented breaking-change policy
  (`docs/PUBLIC_API_CONTRACT.md`, `package.json#exports`,
  `scripts/smoke-pack.sh`);
- a typed action/effect writeback path
  (`docs/current/ACTION_EFFECT_CANONICALIZATION_NOTE.md`,
  `src/effects/EventEffectPipeline.js`, `src/effects/EffectCommitter.js`,
  `tests/unit/active-writeback.test.js`);
- opt-in canon, knowledge, grounding, and epistemic evidence
  (`index.js#getGroundingPackage`, `index.js#checkConsistency`,
  `src/canon/CanonEventPipeline.js`, `src/knowledge/KnowledgeStore.js`,
  `tests/e2e/alice-bob-epistemic-boundary.test.js`,
  `tests/e2e/epistemic-evidence-matrix.test.js`);
- persistence and replay trust through the current declared boundary
  (`docs/SERIALIZATION_CONTRACT.md`, `docs/WORLD_SCHEMA.md`,
  `tests/unit/persistence-trust.test.js`,
  `tests/unit/replay-trust-l4.test.js`,
  `scripts/replay-diff.js`);
- consolidated runtime and contract hardening that keeps invalid-region repair
  on the typed-delta path, makes RegionGrid/agent position updates atomic,
  distinguishes fail-open `auto` persistence from fail-closed explicit
  `sqlite`, awaits asynchronous restore, validates runtime feature switches,
  and aligns the public synchronous `SemanticVerifier` contract
  (`src/runtime/AndyWorld.js`, `src/effects/EffectCommitter.js`,
  `src/store/SimulationStore.js`, `src/store/SQLiteStore.js`,
  `src/narrative/grounding/GroundingVerifier.js`,
  `tests/unit/position-bypass-regression.test.js`,
  `tests/store/sqlite-optional.test.js`);
- social-emergence and domain-portability evidence
  (`tests/e2e/social-emergence.test.js`,
  `tests/e2e/gossip-propagation.test.js`,
  `tests/e2e/emotion-contagion-cluster.test.js`,
  `npm run test:domain`);
- a generated seven-dimension report and release gates
  (`docs/quality/aliveness-report.md`,
  `scripts/aliveness-report.js`, `scripts/release-gate.sh`).

This is sufficient to treat the engine kernel as an integration candidate.

### 1.2 Why the project is not yet Integration Beta

The current evidence is mostly subsystem and controlled-test evidence:

1. `examples/longitudinal-life-demo/README.md` says “24 simulated hours” but
   also says “~18 ticks (5 minutes each),” which is only about 90 simulated
   minutes. The example therefore cannot be used as long-horizon evidence.
2. `examples/longitudinal-life-demo/demo.js` reaches through the facade into
   `engine.world.regions`, `engine.world.socialGraph`, and
   `engine.world.eventDispatcher`. It is an internal demonstration, not proof
   that an early integrator can succeed through the documented public surface.
3. `tests/e2e/longitudinal-life-real-engine.test.js` directly calls
   `alice.memory.addExperience(...)` to make the memory assertion pass.
   `tests/e2e/cause-effect-memory-narrative.test.js` also contains direct
   relationship mutation and internal dispatch/effect orchestration. These are
   valuable characterization tests, but they do not prove an unassisted
   `CanonEvent → typed effects → memory/relationship → grounded narrative`
   production loop.
4. `src/sdk/LLMAdapter.js`, `src/sdk/Character.js`, and
   `src/sdk/NarrativeBuilder.js` provide a real LLM integration seam, but the
   public contract marks `LLMAdapter` and `NarrativeBuilder` experimental
   (`docs/PUBLIC_API_CONTRACT.md`). Public tests primarily use mocks or
   deterministic inputs (`tests/sdk.test.js`).
5. The public D5 smoke test
   (`tests/unit/narrative/grounding-smoke.test.js`) proves a small structured
   checker matrix, not behavior over representative real-model output. The
   generated `docs/quality/aliveness-report.md` previously labeled D5 “Pass,”
   while `CHANGELOG.md` described v2.6 D5 as “Warning.” Wave 0 resolves the
   terminology by reporting the public synthetic checker separately from the
   real-LLM outcome: a synthetic-checker pass is not a real-LLM outcome pass.
6. `docs/current/ALIVENESS_METRICS_v0_1.md` is an appropriate seed metric set,
   but it explicitly describes itself as small-scale, partially manual, and
   domain-specific. It is not yet a versioned Beta evaluation protocol.
7. `enableFacts` intentionally defaults to `false`
   (`index.js`, `tests/integration/action-provider-integration.test.js`).
   The Reference Vertical Slice must opt in explicitly and prove restore
   behavior without changing that default.
8. The repository has useful adjacent examples, but not a combined slice:
   `examples/multi-character.js` runs 288 ticks with three characters but does
   not prove facts-enabled grounding or save/resume; `examples/offline-demo.js`
   demonstrates mock-LLM conversation and SDK save/load but is single-character
   and not a long-running world.
9. “Offline life” is currently explicit simulation catch-up, not a background
   service. The supported controls are `index.js#runTicks` and
   `index.js#advanceTo`. `src/sdk/AutoTick.js` has a catch-up policy, but
   `src/sdk/Character.js#chat` and `chatStream` pass the current simulated time
   to it; that does not by itself measure real user absence. Integration Beta
   must choose a host scheduling model rather than assume background execution.
10. Long-run resource characterization and replay evidence cover different
    horizons. `tests/audit/deep-audit-supplemental.test.js` contains 5,000-tick
    and 5-agent/2,000-tick heap checks, while golden/replay trust is primarily
    100 ticks (`tests/unit/golden-seed-replay.test.js`,
    `tests/unit/replay-trust-l4.test.js`). Neither alone proves multi-day
    semantic quality.

**Stage judgment:** Foundation Alpha is technically credible; Integration Beta
requires integration evidence, longitudinal evidence, real-LLM D5 evidence, and
contract feedback from the Reference Vertical Slice.

### 1.3 Recalibrated execution baseline

The architecture handoff starts from the following verified state:

- `62f815c` introduced this roadmap and its active RFC index entry;
- `a8ac88b` consolidated only the Desktop line's current-architecture
  hardening; the old Desktop repository is no longer an active implementation
  source;
- `npm run release:gate` passes from a clean worktree with 3,770 passing
  tests, type checks, fresh packed consumers, domain tests, architecture
  boundaries, package smoke, performance checks, legacy-removal analysis, and
  SQLite smoke;
- the npm dry-run contains 195 files and no full semantic corpus, real-LLM
  output, holdout assignment, reviewer material, stale D5 report, or Phase 3
  execution report;
- complete historical/private Desktop material remains outside the canonical
  repository and must not be restored into Git or the npm package.

Current effect observability is narrower than effect correctness. Of the five
`EffectCommitter.commit()` call sites in `src/runtime/AndyWorld.js`, three
capture the result and inspect errors internally, while two fallback paths
discard the return value. None exposes committed results through the public
tick/API result. Integration Beta therefore tracks this as an evidence and
observability gap, not as a claim that canonical writeback is absent.

The following are baseline constraints, not open Integration Beta work items:

- invalid position fallback remains `PositionDelta → EffectCommitter`;
- RegionGrid placement and `agent.position` commit remain atomic;
- `createStore()` auto mode may degrade only for unavailable SQLite native
  bindings, while explicit `sqlite` fails closed;
- asynchronous restore completes before `SimulationStore.init()` resolves and
  restore failure remains observable without hiding snapshot existence;
- `enableFacts`, `actionSelection.enabled`, and
  `actionSelection.recordTraces` require actual booleans;
- `checkConsistency()` remains synchronous; structural semantic verifiers may
  implement synchronous `verifySync()` or `verify()`, and Promise results
  degrade to deterministic-only checking;
- invalidated relationship facts cannot block creation of their active
  replacement;
- full evaluation corpora, raw provider output, human labels, adjudication, and
  review manifests remain private.

Any proposal to revisit one of these constraints requires new regression
evidence or an explicit ADR. It must not be reopened merely because an older
Desktop commit implemented a different design.

## 2. Beta outcome and non-goals

### 2.1 Required Beta outcome

At Beta exit, a fresh host application must be able to:

1. install or consume a packed Andy Engine artifact;
2. configure one domain and 3–10 characters outside Engine Core;
3. run at least seven simulated days with explicit simulated-time semantics;
4. produce multi-character actions and canon events without test-only state
   injection;
5. observe causal writeback into memory, relationships, location meaning, and
   future tendency where the event contract calls for those consequences;
6. save at planned interruption points, start a fresh process, resume, and
   continue without continuity loss;
7. call at least two pinned real-LLM provider/model families through a bounded
   adapter seam;
8. expose only grounded final narrative, with violations, fallback, latency,
   and provenance observable;
9. generate an evaluation bundle that supports automated metrics and blinded
   human review without publishing the private corpus;
10. complete the slice using supported public APIs, or produce a reviewed API
    gap record before any public-surface change.

### 2.2 Non-goals

Integration Beta does **not** include:

- StoryArc Runtime;
- Andy Town, Bobby, UI, game-client, or product-specific orchestration;
- concrete reference-world vocabulary in `src/`;
- a general workflow/orchestration framework;
- narrative or LLM writes to `WorldFactStore` or `KnowledgeStore`;
- a new action provider that mutates state;
- changing the default `enableFacts=false`;
- full semantic NLI or a claim that hallucinations are solved;
- WorldObject runtime integration by default;
- deterministic replay of LLM output, SDK tooling, store migrations, or every
  non-simulation path by default;
- ESM support unless separately approved;
- breaking the Stable World Envelope, public imports, persistence contract, or
  domain config without an approved migration plan.

## 3. Reference Vertical Slice boundary

### 3.1 Relationship to the existing longitudinal demo

The slice should **inherit the intent but replace the evidence role** of
`examples/longitudinal-life-demo/`. The existing demo remains a useful
Foundation Alpha example until it is either corrected or superseded, but its
claims must not be cited as Beta proof.

### 3.2 Host boundary

Preferred placement is a separate reference-host repository or a repository
workspace that consumes the packed package exactly like an external user. If it
temporarily lives in this repository, it must:

- live outside `src/`;
- contain all world, character, prompt, and scenario semantics outside core;
- import only paths in `package.json#exports`;
- run against the produced package tarball, not relative `src/` paths;
- remain excluded from the npm package unless packaging is explicitly approved;
- never use `engine.world.*`, agent subsystem fields, internal constructors, or
  direct mutation to satisfy acceptance checks.

The host owns provider credentials, model routing, retry budgets, run
orchestration, artifact retention, and private evaluation hooks. Engine Core
owns simulation truth and supported APIs. A Relay-style boundary may be
specified for LLM adapter routing, but provider routing must not become Engine
Core product logic.

The host also owns the deployment scheduling choice: continuously running
worker, external job/queue, or explicit catch-up on user return. Integration
Beta must test the selected model and must not describe `AutoTick` as a
background executor.

### 3.3 Scenario envelope

Use one deliberately small world:

- 3–10 characters;
- at least three locations with meaningful co-presence separation;
- schedules and needs that create both solitary and social pressure;
- at least one observed event, one told/overheard knowledge path, one
  relationship-changing event, one location-changing event, and one
  save/resume boundary;
- at least one character who should **not** know a selected event, providing a
  negative epistemic control;
- a primary seven-day run and a shorter repeatable diagnostic run.

The scenario definition must be domain config and host data. It must not encode
expected outcomes by directly scheduling memories, relationship values, or
facts. Test fixtures may establish initial conditions, but every asserted
post-start consequence must arise through a supported runtime path.

### 3.4 Required evidence chain

Every sampled world-changing episode must be joinable by stable run-local
identifiers:

```text
selected action + ReasonTrace
  → CanonEvent
  → EffectResult / typed deltas
  → committed state change
  → knowledge/evidence visibility
  → grounding package
  → raw LLM output
  → checker decision
  → final exposed output or safe fallback
```

This trace is evidence metadata. It must not create a parallel source of world
truth.

## 4. Architecture guardrails for all workstreams

1. `src/` remains canonical. No retired top-level implementation directory is
   restored.
2. The host, domain, character content, and prompts do not enter Engine Core.
3. Canon owns truth; Knowledge owns awareness; Pressure produces inclination;
   Action proposes/scores/selects; Effects commit typed consequences; Narrative
   expresses permitted facts.
4. Candidate providers remain read-only.
5. New world-facing consequences use typed deltas plus `EffectCommitter`; no
   new direct memory, relationship, fact, position, emotion, or need writes.
6. LLM/narrative output cannot create facts or knowledge. A dialogue intent may
   request an engine action, but only a validated engine event may change truth.
7. `enableFacts=false` remains the default; the slice uses `enableFacts:true`
   explicitly and records that configuration.
8. New random sources in simulation paths use the runtime RNG context.
9. Stable APIs and schemas change only through additive-first design,
   deprecation, ADR, migration, and compatibility tests.
10. Private model output and human-review assets never enter public fixtures,
    reports, npm payloads, logs committed to Git, or example snapshots.

## 5. Workstream A — Host and Reference Vertical Slice

**Purpose:** prove the engine can be integrated at public boundaries.

### Deliverables

- an external-style host consuming a packed artifact;
- a versioned domain/scenario manifest with seed, simulated start time,
  tick size, characters, provider/model snapshot, and engine/package identity;
- an explicit host scheduling/catch-up model and idempotency boundary;
- a deterministic diagnostic run and a seven-day primary run;
- a public-API usage inventory and API-gap ledger;
- a one-command run entry that emits a redacted run manifest and evidence index;
- a replacement/upgrade recommendation for the existing longitudinal demo.

### Dependencies

- current package exports and type declarations;
- stable persistence path from `andy-engine/store`;
- Workstream D evidence schema;
- Workstream C LLM boundary.

### Acceptance

- no imports outside `package.json#exports`;
- no `engine.world.*` or subsystem mutation in host/runtime acceptance tests;
- post-start memories, relationships, facts, and positions used as evidence are
  attributable to actions/events and committed deltas;
- the primary run includes save, process exit, reload, and continued simulation;
- the scenario is runnable with a second domain config in a shorter portability
  check without changes to Engine Core.

### Principal risks

- public APIs may not expose safe host operations currently performed through
  internals;
- a scripted scenario may accidentally prove its script rather than emergence;
- seven-day evidence may be expensive or noisy without a diagnostic mode.

## 6. Workstream B — Long-horizon runtime and persistence

**Purpose:** show continuity beyond short tests without expanding the
determinism promise.

### Deliverables

- run controller with explicit simulated time, bounded tick count, checkpoint
  cadence, crash-safe run identity, and resumable progress;
- checkpoint and resume evidence using the Stable World Envelope;
- resource and state-growth measurements for event log, memories,
  relationships, facts, knowledge, and snapshot size;
- long-run invariant checks for finite/ranged psychology values, referential
  integrity, monotonic simulation time, valid positions, and unique event IDs;
- a replay-boundary statement that distinguishes simulation replay from LLM
  output and host/tooling nondeterminism.

### Dependencies

- `engine.tick()`, `runTicks()`, or `advanceTo()` from the public facade;
- `toWorldState()` / `fromWorldState()` and the domain-ref restore contract;
- current L1–L4 replay tests as regression evidence, not as proof of full-path
  determinism.

### Acceptance

- at least three seeded diagnostic runs complete;
- the primary seven-day run completes with at least two fresh-process resumes;
- no invariant violation or unhandled runtime error;
- pre-checkpoint and post-resume public state continuity is verified;
- the same engine-only seeded diagnostic trajectory remains within the existing
  declared replay boundary;
- LLM text is excluded from deterministic hashes and is correlated by trace ID.

### Principal risks

- snapshot/event/memory growth may become the limiting factor;
- retrying a non-idempotent host operation may duplicate external output;
- confusing wall-clock time with simulated time may invalidate duration claims.

## 7. Workstream C — Grounded LLM and D5

**Purpose:** evaluate actual model output while maintaining engine ownership of
truth.

### Deliverables

- a provider-neutral request/response envelope with model snapshot,
  temperature/seed where supported, prompt-template version, grounding-package
  hash, latency, retry count, and outcome;
- two pinned provider/model families exercised through the same boundary;
- pre-exposure consistency validation for non-streaming and streaming paths;
- an explicit disposition for `pass`, `rewrite`, `reject`, provider error,
  timeout, and empty output;
- raw-output and final-output D5 measurements kept separate;
- a private, versioned real-LLM evaluation corpus and a public synthetic smoke
  projection containing no recoverable full samples;
- calibration of `ClaimExtractor`, `EvidenceBinder`, `GroundingChecker`, and
  compatibility fallback behavior against adjudicated labels.

### Dependencies

- `src/sdk/LLMAdapter.js`, `src/sdk/Character.js`,
  `src/sdk/NarrativeBuilder.js`;
- `index.js#getGroundingPackage` and `index.js#checkConsistency`;
- Workstream D evaluation and redaction pipeline;
- host-owned credentials and provider governance.

### Acceptance

- all user-visible outputs are validated before exposure;
- rejected or rewrite-required text is never partially streamed to the user;
- no LLM response writes facts, knowledge, memories, relationships, or
  positions directly;
- every accepted claim classified as world-facing has evidence traceability;
- D5 thresholds in Section 12 pass on held-out private samples;
- fallback rate and false-block rate are reported, not hidden by a high
  non-fabrication score;
- provider-specific behavior remains outside Engine Core.

### Principal risks

- a “silent fallback” can make safety scores look good while destroying utility;
- model or provider drift can invalidate prior results;
- private raw text may contain secrets or personal data;
- checker rules may overfit the evaluation corpus.

## 8. Workstream D — Observability and evaluation

**Purpose:** make Beta claims reproducible and falsifiable.

### Deliverables

- a versioned run-manifest schema and append-only event/evidence records;
- trace joins across action, canon, effect, knowledge, grounding, model, checker,
  and final output;
- automated longitudinal metrics derived from canonical state;
- a blinded human-review rubric, reviewer guide, disagreement adjudication,
  and audit sampling policy;
- redaction and export tooling that produces aggregate public reports without
  exporting private samples;
- failure bundles containing minimal reproducible state and IDs, with raw
  private content referenced by private artifact ID rather than copied.

### Dependencies

- stable identifiers from runtime and host;
- Workstream C model envelope;
- `docs/current/ALIVENESS_METRICS_v0_1.md` as a starting taxonomy;
- current generated report conventions in
  `scripts/aliveness-report.js`.

### Acceptance

- a reviewer can select any sampled final narrative and follow it back to the
  allowed evidence and state-changing events;
- metrics are regenerated from captured artifacts, not hand-entered;
- public export contains only aggregate metrics, synthetic cases, schemas, and
  redacted examples approved for release;
- missing evidence is scored as missing/fail, never inferred from prose;
- metric definitions include numerator, denominator, exclusions, confidence
  interval, and version.

### Principal risks

- observation code may become a second state mutation path;
- metrics may reward verbosity, silence, or scripted repetition;
- trace volume and private retention costs may grow rapidly.

## 9. Workstream E — Schema and API hardening

**Purpose:** turn integration pain into deliberate contracts without breaking
early integrators.

### Deliverables

- an API-gap ledger separating “host needs a public operation” from “host is
  trying to own engine internals”;
- contract tests for every public operation used by the slice;
- additive proposal(s) for any missing placement, event-intent, observation,
  checkpoint, or trace access;
- Fact/Knowledge schema stability classification and migration/deprecation plan;
- a reconciliation note for Serialization envelope version vs Stable World
  Envelope schema version;
- explicit classification of experimental SDK classes used by the slice;
- ADR decisions for WorldObject and full-path deterministic replay.

### Dependencies

- actual host integration evidence from Workstream A;
- current contracts in `docs/PUBLIC_API_CONTRACT.md`,
  `docs/SERIALIZATION_CONTRACT.md`, and `docs/WORLD_SCHEMA.md`;
- package-consumer and typecheck smoke tests.

### Acceptance

- the host no longer requires internal imports or mutation;
- every public API change is additive or has an approved deprecation/migration
  plan;
- package exports, types, public contract, examples, and consumer tests agree;
- previously valid Stable World Envelopes still load, or a versioned migration
  fixture proves the approved change;
- Fact/Knowledge experimental fields are clearly classified before Beta exit.

### Principal risks

- prematurely freezing a poor API;
- exposing internal types merely to make the demo convenient;
- confusing runtime-snapshot compatibility with Stable Envelope compatibility.

## 10. Workstream F — Documentation and onboarding

**Purpose:** allow a new technical integrator to reproduce the supported path.

### Deliverables

- a public-API-only quickstart for the Reference Vertical Slice;
- “simulation truth vs narrative wording” integration guidance;
- facts opt-in and grounding configuration guidance;
- save/resume, error recovery, provider credential, and privacy guidance;
- a limitations page distinguishing Alpha evidence, Beta evidence, and
  non-claims;
- corrected longitudinal-demo duration and link claims, or an explicit
  supersession notice;
- a generated evidence index linking public claims to test commands and
  aggregate reports.

### Dependencies

- settled public operations from Workstream E;
- evidence definitions from Workstream D;
- completed slice from Workstream A.

### Acceptance

- a clean-room integrator completes the diagnostic run without reading `src/`;
- every code sample passes against the packed artifact;
- no document calls synthetic D5 smoke a real-LLM D5 pass;
- docs state `enableFacts=false` by default and show explicit Beta configuration;
- no private evaluation sample, prompt transcript, reviewer note, or provider
  credential appears in public docs or package payload.

### Principal risks

- documentation may describe aspirational APIs;
- examples may silently drift back to internal access;
- metrics language may overstate what a small scenario proves.

## 11. Wave plan and milestone gates

No calendar dates are promised. A wave exits only when its gate is evidenced.

### Wave 0 — Baseline and decisions

Deliver:

- freeze the consolidated Foundation Alpha evidence snapshot at `a8ac88b`
  (**complete**);
- reconcile D5 “public synthetic pass” vs “real-LLM warning” terminology
  (**complete**: synthetic Pass, real-LLM Warning / not evaluated);
- calibrate the public test baseline (**complete**: 3,770 passing / 28 skipped);
- accept the run/evidence manifest schemas (**P2 draft produced; independent
  verification pending**);
- decide Reference Host placement and data-retention authority (**complete for
  P2 planning; see `INTEGRATION_BETA_WAVE0_DECISIONS.md`**);
- decide the provisional thresholds in Section 12 (**complete; frozen before
  unblinding unless explicitly superseded**).

P0 repository mapping and P1 gap validation are complete. The owner has accepted
conservative planning defaults for Host location, domains, family-level provider
comparison, private-corpus governance, scheduling, and thresholds. P2 has a zero
provider-spend budget and may not collect real LLM output. Exact model IDs,
provider terms, W3 spend, and a reviewer allowlist remain mandatory operational
approvals before collection.

**Gate W0:** passed for P2 architecture planning. This is not authorization for
Core/API implementation or W3 data collection.

### Wave 1 — Public-boundary diagnostic slice

Deliver:

- packed-artifact host;
- short deterministic scenario;
- public API gap ledger;
- no-internal-access guard;
- trace skeleton through action, event, effect, and state.

**Gate W1:** the diagnostic slice runs only through exported paths and produces
an evidence bundle without direct post-start state injection.

### Wave 2 — Persistence and long-horizon evidence

Deliver:

- checkpoint/resume controller;
- three seeded diagnostics;
- seven-day primary run;
- invariants, resource-growth measurements, and failure bundles.

**Gate W2:** all long-run acceptance criteria in Workstream B pass; any growth
limit or continuity failure is resolved or formally blocks Beta.

### Wave 3 — Real LLM grounding and private D5 protocol

Deliver:

- two pinned provider/model families;
- raw/final output separation;
- held-out private evaluation;
- checker calibration;
- safe final-output policy.

**Gate W3:** D5 thresholds pass with confidence intervals and human
adjudication; no critical epistemic leak appears in the held-out high-risk
strata.

### Wave 4 — Contract hardening and onboarding

Deliver:

- approved additive API changes and contract tests;
- schema stability classifications and migrations where required;
- clean-room onboarding;
- corrected/superseded old demo;
- aggregate Beta evidence report.

**Gate W4:** packed consumer, type declarations, public docs, examples,
persistence fixtures, and Reference Host agree.

### Wave 5 — Integration Beta exit review

Run:

- repository release gates;
- Reference Host diagnostic and long-horizon suites;
- private D5 evaluation;
- independent acceptance audit;
- public/private asset-boundary scan.

**Gate W5:** every Integration Beta graduation condition in Section 18 is
PASS. `NOT_VERIFIED` is not a pass.

## 12. Metrics and provisional Beta thresholds

Thresholds below are proposed architecture gates. Wave 0 may revise them, but
must record the rationale before evaluation data is unblinded.

### 12.1 Runtime and continuity

| Metric | Definition | Provisional Beta gate |
|---|---|---|
| Run completion | completed primary runs / attempted primary runs, excluding documented provider-wide outages | 100% of required runs |
| Runtime integrity | unhandled engine errors or invariant violations | 0 |
| Resume fidelity | required public continuity assertions retained across fresh-process resume | 100%; at least 2 resumes in primary run |
| Trace completeness | sampled world-changing episodes with complete action→event→delta→state chain | 100% |
| State validity | finite and in-range psychology/state samples | 100% |
| Epistemic negative controls | assertions where a non-observer remains without unsupported knowledge | 100% |
| Snapshot growth | bytes and growth curve per simulated day | measured and reviewed; no unexplained superlinear growth |

### 12.2 Character and world quality

Adapt the five metrics in `docs/current/ALIVENESS_METRICS_v0_1.md`, but split
precision from recall and eliminate hand-wavy denominators:

| Metric | Provisional Beta gate |
|---|---|
| Continuity precision: referenced past events that are supported | ≥ 0.95 |
| Continuity coverage: eligible salient events later reflected in behavior/memory/narrative | ≥ 0.60, reported by event class |
| Causal writeback coverage for events whose contract requires effects | 1.00 |
| Epistemic boundary accuracy over positive and negative controls | ≥ 0.99 and 0 critical leaks |
| Affect-direction agreement under blinded review | ≥ 0.80 |
| Relationship continuity over save/resume samples | 1.00 |
| Action diversity | reported by character/day and provider; no single fallback action > 60% absent scenario justification |

These gates do not claim human realism. Qualitative review must also identify
repetition, incoherent motivation, brittle prompt dependence, and whether
characters remain distinguishable over time.

### 12.3 D5 private evaluation protocol

#### Sampling

- freeze prompt-template, checker, domain, engine, provider, and model versions
  before the held-out run;
- use at least two provider/model families, with at least one pinned model
  snapshot per family; **superseded by
  `IB_W3_CONTROLLED_MODEL_ALIAS_ADR.md` for W3: controlled aliases with
  frozen configuration, identity fingerprint checks, and epoch isolation
  replace pinned snapshot requirement;**
- evaluate at least 300 total generations;
- use stratified sampling with no fewer than 50 evaluated cases in each
  high-risk family: unsupported event, third-party state/location,
  source-attribution confusion, temporal conflict, and coreference/ambiguity;
- include both valid outputs and deliberately adversarial/unsupported outputs;
- keep a development set and a never-tuned held-out set separated by immutable
  private manifest IDs.

The counts above are minimum sampling floors, not proof that a statistical gate
is reachable. Before unblinding, the evaluator must compute the sample size
needed for each gate. If the observed denominator cannot support the required
conservative confidence bound, sampling continues; the result is not rounded
up to PASS.

#### Labels and review

- label claim spans, claim type, required evidence, evidence available,
  validity, severity, final disposition, and reviewer rationale;
- double-review at least 20% of cases, including every critical case;
  **superseded by `IB_W3_SINGLE_REVIEWER_PROTOCOL_ADR.md` for W3:**
  single reviewer 100% initial + 30% delayed blind re-review + 100%
  critical re-review;
- adjudicate all reviewer disagreements before computing the final gate;
  **superseded:** disagreements trigger third reconciliation review;
- report inter-reviewer agreement without treating agreement alone as
  correctness; **superseded:** report intra-rater consistency instead;
  do not report inter-rater agreement (single reviewer);
- reviewers must be blind to provider identity when practical.

#### Required metrics

| Metric | Provisional Beta gate |
|---|---|
| Critical unsupported-claim recall | ≥ 0.98 |
| Overall unsupported-claim recall | ≥ 0.95 |
| Precision of blocking/rewrite decisions | ≥ 0.90 |
| False-block rate on adjudicated valid outputs | ≤ 0.05 |
| Post-guard final-output unsupported world claim rate | ≤ 0.01 |
| Post-guard critical epistemic leak count | 0 |
| Accepted world-facing claims with evidence trace | 1.00 |
| Silence/safe-fallback rate | ≤ 0.05 overall and reported by provider/stratum |
| Provider error/timeout rate | reported separately; never counted as a grounding pass |

Use a two-sided 95% Wilson score interval for binomial rates unless ADR-IB-006
approves and versions a different method before unblinding. Recall gates apply
to the interval's **lower bound**. Error/leak/false-block gates apply to the
interval's **upper bound**. Report the point estimate, numerator, denominator,
and both bounds. In particular, “critical recall ≥ 0.98” means its 95% lower
bound is at least 0.98, while “unsupported world claim rate ≤ 0.01” means its
95% upper bound is at most 0.01. The evaluator must expand the held-out sample
when the minimum floors cannot establish those bounds.

#### Anti-gaming rules

- score raw model output and final exposed output separately;
- a rejection may improve final safety but counts against utility/fallback rate;
- empty output, timeout, parse failure, and provider error cannot count as
  non-fabrication success;
- checker tuning may use only the development split;
- all exclusions require a reason code and remain visible in denominators.

## 13. Public/private asset boundary

### Public repository and package may contain

- synthetic grounding smoke cases;
- schemas, metric definitions, redaction rules, and evaluator code that do not
  reconstruct private samples;
- aggregate results with minimum-cell suppression where needed;
- fictional reference-domain configuration and approved redacted examples;
- hashes/opaque IDs that prove manifest identity without exposing contents.

### Private evaluation storage must contain

- full real-LLM inputs and outputs;
- full prompts and grounding packages used for model evaluation;
- model/provider metadata that could reveal private operational details;
- human labels, reviewer notes, adjudications, and holdout assignment;
- evaluation-generation scripts that encode the unreleased corpus;
- credentials, request IDs, and provider logs.

### Required controls

- private asset root lives outside the public repository;
- public Git and package scans reject known private paths and sample markers;
- logs default to metadata/redacted mode;
- raw retention has an owner, access policy, and deletion policy;
- a public report is generated from aggregate intermediates, not by copying the
  private report and manually deleting rows;
- provider comparisons use approved anonymous family IDs in public output;
  cells below the minimum reporting count are suppressed or combined;
- no complete evaluation sample may be reconstructed from public shards.

Personal contact information is outside this protocol unless separately
classified by the project owner; credentials and evaluation subjects remain
protected regardless.

## 14. Compatibility and migration strategy

### 14.1 Default policy

- additive public operations first;
- optional parameters with backward-compatible defaults;
- deprecate before removal;
- public export removal or stable-signature break requires a major version;
- domain config additions must preserve existing campus/default behavior;
- Stable World Envelope changes require schema versioning, migration fixtures,
  and round-trip/load tests;
- runtimeSnapshot remains opaque to the envelope layer;
- experimental SDK classes may evolve only with explicit release notes and
  Reference Host compatibility tests.

### 14.2 Facts and Knowledge

The slice opts into facts, but Beta does not silently promote every internal
Fact/Knowledge field to stable. Wave 4 must classify:

- fields required by public grounding consumers;
- fields that remain opaque/experimental;
- provenance needed for D5 evidence;
- serialization expectations;
- migration behavior for any changed representation.

### 14.3 API-gap decision test

Before adding a public API, answer:

1. Is the host asking for a legitimate world operation or for internal state
   ownership?
2. Can an existing public operation express the intent?
3. Does the operation preserve Canon/Knowledge/Action/Effects ownership?
4. Can it be additive and typed?
5. Can its persistence and domain behavior be tested?
6. Would exposing it force an internal representation to become stable?

If questions 3–5 cannot be satisfied, the API proposal does not proceed.

## 15. Risk register

| ID | Risk | Probability | Impact | Mitigation / gate | Owner workstream |
|---|---|---:|---:|---|---|
| R-01 | Reference Host relies on internals | High | High | exported-path scan and packed-consumer gate | A/E |
| R-02 | Scripted injections manufacture aliveness evidence | High | High | forbid post-start direct mutation in acceptance runs | A/D |
| R-03 | Real LLM fabricates facts or leaks private agent state | High | Critical | pre-exposure validation, held-out D5, zero critical leak gate | C/D |
| R-04 | Safety achieved mostly through silence | Medium | High | raw/final split and ≤5% fallback gate | C/D |
| R-05 | Seven-day state or snapshot growth is unbounded | Medium | High | growth telemetry and W2 review | B/D |
| R-06 | Save/resume duplicates external model operations | Medium | High | host idempotency key and checkpoint boundary design | A/B/C |
| R-07 | Provider/model drift invalidates evidence | High | Medium | pinned model/version manifest and rerun policy | C/D |
| R-08 | Private evaluation corpus leaks into Git/npm/logs | Medium | Critical | separate storage, automated scans, aggregate-only export | C/D |
| R-09 | API frozen around one demo’s accidental needs | Medium | High | gap ledger, clean-room integrator, additive-first ADR | E/F |
| R-10 | Fact/Knowledge schema change breaks saves | Medium | High | stability classification and migration fixtures | E |
| R-11 | D5 metrics overfit a single language/domain | Medium | High | stratified holdout and second-domain diagnostic | C/D |
| R-12 | Observability mutates or becomes truth | Low | Critical | append-only read path; boundary tests | D |
| R-13 | Long-horizon claim confuses wall time and sim time | Medium | Medium | manifest records tick size/start/end/tick count | A/B |
| R-14 | Existing D5 status language misleads users | High | Medium | distinguish synthetic checker pass from real-LLM outcome gate | D/F |
| R-15 | WorldObject scope expands the phase | Medium | Medium | ADR decision; default defer | E |
| R-16 | Full determinism promise expands accidentally | Medium | High | ADR and explicit replay boundary | B/E/F |
| R-17 | AutoTick is mistaken for real background execution | High | High | choose and test a host scheduling model; document current semantics | A/B/F |
| R-18 | Stable `getAgent()` exposes a live object and invites internal mutation | High | High | read-model/command API decision and no-mutation consumer tests | A/E |
| R-19 | No stable movement or external-event command exists | High | High | evidence-backed narrow command ADR; do not expose dispatcher/regions | A/E |
| R-20 | “True streaming” conflicts with validate-before-exposure | Medium | Medium | decide product latency requirement; preserve no-leak invariant | C/E |

## 16. ADR and decision backlog

The architecture committee should decide these before the named wave:

| ADR | Decision | Options / recommended default | Due |
|---|---|---|---|
| ADR-IB-001 | Reference Host location | **Accepted for P2:** in-repo `reference-host/` workspace for Beta, then a separate repo before Production Candidate | W0 |
| ADR-IB-002 | Public operation gaps | keep internal; add narrow typed public commands; expose internals. **Recommend narrow typed commands only when evidenced** | W1/W4 |
| ADR-IB-003 | D5 status vocabulary | **Accepted and implemented:** public synthetic checker and real-LLM outcome are reported separately | W0 |
| ADR-IB-004 | Private evaluation authority and retention | **Accepted for P2:** external reserved root, owner-only default, 30-day raw / 180-day label maximum; W3 reviewer allowlist still required | W0 |
| ADR-IB-005 | Facts in Reference Slice | **Accepted:** explicit opt-in and unchanged default | W0 |
| ADR-IB-006 | Provisional Beta metric thresholds | **Accepted provisionally:** Section 12 and Wilson method freeze before unblinding | W0 |
| ADR-IB-007 | WorldObject integration | integrate; defer; remove model. **Recommend defer unless the slice demonstrates a blocking need** | W2 |
| ADR-IB-008 | Determinism boundary | existing engine-path promise; full host/SDK/LLM replay. **Recommend retain existing boundary** | W2 |
| ADR-IB-009 | Experimental SDK promotion | promote all; promote evidence-backed subset; retain experimental. **Recommend evidence-backed subset only** | W4 |
| ADR-IB-010 | Fact/Knowledge public stability | freeze current shape; freeze projection; keep experimental. **Recommend freeze only the public projection needed by grounding** | W4 |
| ADR-IB-011 | LLM retry/idempotency ownership | Engine Core; host adapter. **Recommend host adapter** | W1 |
| ADR-IB-012 | Primary scenario and second-domain diagnostic | **Accepted:** tavern primary, campus secondary; semantics remain Host data | W0 |
| ADR-IB-013 | Host scheduling model | **Accepted:** explicit catch-up with Host-owned clock mapping, retry ledger, and idempotency | W0 |
| ADR-IB-014 | Public world-command seam | internal access; narrow move/event-intent commands. **Recommend narrow commands only after W1 gap evidence** | W1/W4 |
| ADR-IB-015 | Public read model | return live Agent; add immutable projections. **Recommend immutable projections for Beta evidence** | W1/W4 |
| ADR-IB-016 | Streaming semantics | buffered validation; incremental safe protocol. **Recommend retain buffered validation unless latency is a proven blocker** | W3 |

## 17. Sub-AI task packets and scheduling

These packets are handoff units for the architect AI. They describe bounded
outputs, not permission to implement outside the packet.

### Packet P0 — Atlas baseline map

**Role:** Atlas repository mapper (read-only).
**Inputs:** only the canonical repository at
`/Users/huangweijie/Documents/andy-engine`, starting from `a8ac88b`; current
source, contracts, examples, tests, and the recalibrated baseline in Section
1.3.
**Output:** public entry points, internal accesses in existing demos, event/effect
trace map, persistence/grounding test map, confirmed unknowns.
**Constraints:** do not inspect, restore, merge, or treat the retired Desktop
repository, Trash copy, private bundle, shadow/soak line, or full evaluation
corpus as implementation input.
**Done when:** every baseline claim has an exact current path/symbol/test and
every claimed gap is absent from the completed-constraint list in Section 1.3.

### Packet P1 — Audit gap validation

**Role:** Audit agent (read-only).
**Inputs:** P0 map and proposed Beta gaps.
**Output:** validity/severity/recommendation for each gap; reject speculative
work.
**Done when:** priorities in Waves 0–2 contain no unsupported gap and no
completed consolidation item has been reopened without regression evidence or
an explicit ADR.

### Packet P2 — Reference Host architecture

**Role:** architect-owned worker.
**Inputs:** approved ADR-IB-001/002/005/011/012.
**Output:** context boundary, public API inventory, scenario manifest, failure
model, task decomposition.
**Constraints:** no core implementation, no UI/product logic.

### Packet P3 — Long-horizon and persistence protocol

**Role:** runtime/store specialist.
**Inputs:** public persistence contracts, replay boundary, P2 scenario.
**Output:** checkpoint protocol, invariants, growth metrics, resume test matrix,
determinism non-claims.
**Constraints:** preserve explicit `auto`/`sqlite`/`memory` semantics and test
fresh-process restoration through the packed public store surface.

### Packet P4 — Grounded LLM/D5 protocol

**Role:** narrative/evaluation specialist; Relay may be consulted only for
adapter-boundary planning.
**Inputs:** current grounding pipeline, private-asset policy, Section 12.3.
**Output:** provider-neutral envelope, strata, rubrics, disposition matrix,
held-out protocol.
**Constraints:** no provider/product routing in core; no public full corpus;
do not redesign the synchronous verifier contract unless W1/W3 evidence proves
it blocks the Reference Host.

### Packet P5 — Observability schema

**Role:** evidence/telemetry specialist.
**Inputs:** P2–P4 identifiers and metrics.
**Output:** run manifest, trace-event schema, redaction policy, aggregate export
contract, reproducibility rules.

### Packet P6 — API/schema hardening proposals

**Role:** public-contract architect.
**Inputs:** demonstrated API-gap ledger from a running W1 slice.
**Output:** additive API proposals, stability classifications, migration plans,
contract test matrix.
**Constraint:** proposals unsupported by host evidence are deferred.

### Packet P7 — Onboarding and claim audit

**Role:** documentation architect.
**Inputs:** accepted contracts and completed evidence.
**Output:** clean-room guide, limitation language, demo supersession plan,
claim-to-evidence index.

### Packet P8 — Caliper exit verification

**Role:** Caliper independent verifier; must not be an implementation
participant.
**Inputs:** task packets, diffs, commands, evidence bundles, private evaluation
summary.
The verifier input bundle must include Section 1.3 of this roadmap verbatim;
completed baseline constraints must not become `NOT_VERIFIED` merely because
the orchestrator omitted their evidence from the packet.
**Output:** PASS/FAIL, blocking findings, command evidence, criterion-by-
criterion acceptance matrix.
**Rule:** unavailable evidence is `NOT_VERIFIED`, never PASS.

### Recommended orchestration

```text
P0 Atlas ─┐
          ├─→ P1 Audit ─→ Wave 0 decisions
          │
          └─────────────→ P2 Host architecture

P2 ─→ P3 Long horizon ─┐
 │                     ├─→ P5 Observability ─→ P6 Contract hardening
 └─→ P4 Grounded LLM ──┘                         │
                                                └─→ P7 Onboarding

P8 Caliper runs independently after each wave gate and at Beta exit.
```

The architect AI owns sequencing, resolves cross-packet conflicts, and prevents
workers from turning a roadmap task into unreviewed product implementation.
Ferrum, Lumen, Orbit, Porthole, and Dock are not assigned because their
specialties do not match this Node engine architecture phase.

## 18. Graduation criteria

### 18.1 Foundation Alpha → Integration Beta

All are required:

- Reference Host passes using the packed artifact and exported APIs only;
- 3–10 characters complete the seven-day scenario;
- at least two fresh-process save/resume cycles preserve required continuity;
- no post-start direct state injection is used as acceptance evidence;
- action→canon→typed effect→state traces are complete for sampled consequences;
- facts are explicitly enabled and epistemic negative controls pass;
- two pinned real-LLM provider/model families complete the private D5 protocol;
- Section 12 Beta gates pass, including zero critical held-out epistemic leaks;
- public/private asset scans pass;
- any public API/schema changes have compatibility and migration evidence;
- clean-room onboarding succeeds;
- Caliper recommends ACCEPT with no blocking or `NOT_VERIFIED` exit criterion.

### 18.2 Integration Beta → Production Candidate

This later graduation requires evidence not demanded for Integration Beta:

- at least one external integrator independent of the core authors;
- more than one sustained reference deployment or domain;
- an operational SLO/error-budget proposal backed by observed workloads;
- documented provider outage, retry, rate-limit, and recovery behavior;
- versioned migration evidence across an actual released schema/runtime change;
- expanded multilingual/domain D5 evaluation and ongoing drift monitoring;
- security/privacy threat review and incident response ownership;
- long-run capacity and compaction decisions backed by production-like data;
- stable support policy for the public API subset used by integrators;
- repeated independent release-candidate audits.

Production Candidate does not automatically require StoryArc, UI, WorldObject,
or full-path deterministic replay.

## 19. Decision status and remaining approvals

The original question numbers are retained for audit continuity.

1. **Resolved for P2:** Reference Host lives in `reference-host/`; migrate it to
   a separately owned repository before Production Candidate.
2. **Resolved for P2:** tavern is primary; campus is the portability diagnostic.
3. **Resolved provisionally:** Section 12 thresholds and Wilson method freeze
   before unblinding.
4. **Partially resolved:** compare OpenAI and Anthropic families. Exact model
   IDs, spend, request limits, and then-current provider retention terms require
   approval before W3 collection.
5. **Partially resolved:** the external private root, owner-only default,
   30-day raw limit, and 180-day label limit are set. The reviewer allowlist
   requires approval before W3 collection.
6. **P2 position:** retain safe silence; revisit only if W3 utility evidence
   justifies constrained rewrite.
7. **Open until W1 evidence:** identify legitimate narrow public operations
   through the API gap ledger.
8. **Open until W4 evidence:** decide the minimal stable Fact/Knowledge
   projection required by grounding consumers.
9. **P2 position:** fixed evaluated checkpoints are sufficient; real-time
   conversation is not required for the seven-day run.
10. **Open until W2 measurement:** set snapshot/event/memory growth budgets.
11. **Open until W1 Host evidence:** rewrite, archive, or disclaim the old
    longitudinal demo.
12. **Resolved for P2:** the repository owner is the aggregate D5 publication
    authority until explicitly delegated.
13. **Resolved:** use explicit catch-up scheduling.
14. **P2 position:** the slice uses immutable snapshots/projections and does not
    treat live `getAgent()` handles as evidence surfaces.
15. **Open until W1 evidence:** consider narrow movement/event-intent commands
    only after the API decision test.
16. **P2 position:** buffered validate-before-exposure is sufficient; true token
    streaming is not a Beta requirement absent blocker evidence.

## 20. Definition of roadmap completion

This roadmap is ready to become implementation execution cards only after:

- P0 and P1 confirm the `a8ac88b` baseline without reopening completed
  consolidation work (**complete**);
- the architecture committee resolves Wave 0 ADRs (**complete for P2 planning;
  operational W3 approvals remain**);
- each workstream has an accountable owner;
- the metric protocol is frozen before held-out data is unblinded;
- public/private storage locations are identified;
- the Reference Host boundary is approved;
- an independent reviewer confirms that the roadmap preserves the repository
  guardrails and does not smuggle StoryArc, UI, product content, WorldObject, or
  full deterministic replay into the Beta commitment.
