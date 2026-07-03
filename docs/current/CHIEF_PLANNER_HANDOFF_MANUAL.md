# Chief Planner Handoff Manual

This document is the handoff manual for any AI acting as Chief Planner for Andy Engine.
It is not a task card and not an implementation plan. Its job is to preserve governance,
cost discipline, and quality-loop continuity when the Chief Planner role changes.

## Mission

Andy Engine is a psychology-driven persistent world / multi-agent simulation engine.
The Chief Planner does not optimize for a single green test run. The Chief Planner
optimizes for a trustworthy engine whose world state, replay, facts, knowledge,
behavior, memory, social emergence, and public API remain coherent over long-lived use.

Current operating decision as of 2026-07-03: the project is not rushing to publish
a v2.x package. The active target is polish-first hardening: keep the engine
unpublished and use the no-quota fleet to remove confirmed P0/P1 bugs, close
architecture boundary leaks, and perform low-risk internal refactors before any
future publish decision.

The current operating mode is a closed-loop debug and hardening fleet:

```text
Audit AI finds candidate bugs
→ Verification AI independently checks whether the bug is real
→ Debug AI fixes only confirmed bugs
→ Verification AI validates the fix
→ Audit AI searches for the next layer
→ repeat until the active polish scope has no confirmed P0/P1 bugs
```

The Chief Planner is responsible for orchestration and final judgment. Do not outsource
governance decisions to a single sub-agent report.

## Current Completion Assessment

Status as of 2026-07-03: Andy Engine is a Foundation Alpha candidate under
polish-first hardening, not a release-candidate push. The engine is usable for
local development and evaluation only after the current dirty worktree is frozen
into a verified baseline. Publication is intentionally deferred until the user
explicitly reopens a release decision.

High-level completion estimate:

| Area | Completion | Planning judgment |
|---|---:|---|
| Clean architecture and public facade boundaries | 85-90% | `src/` owns canonical implementation; top-level facades are defined and mostly guarded. |
| Runtime loop, action selection, and typed effect writeback | 80-85% | Core loop exists and major writeback paths use typed deltas; keep auditing adjacent action/effect paths when touched. |
| Persistence, snapshot/restore, and replay trust | 80-85% | L1-L4 replay trust is documented as achieved, but timezone-bound golden replay remains a release-engineering risk. |
| Domain portability | 80-85% | Campus/default/custom domain paths are mature; residual default-domain coupling is P2 unless it reaches core runtime behavior. |
| Facts, knowledge, and epistemic boundaries | 70-75% | Opt-in semantic layer is valuable and heavily tested, but propagation contracts and evidence semantics are still evolving. |
| Grounded narrative / D5 | 55-60% | Current checker is regex-based and remains Warning; it can support Alpha with clear caveats, but blocks any Stable claim. |
| Release engineering and documentation truth | 65-70% | Test gates are broad, but current docs contain drift and the worktree has large uncommitted changes that must be reconciled. |

Interpretation:

- Internal alpha / preview: plausible after baseline freeze and zero confirmed P0/P1 in the active supported scope.
- npm alpha tag: not an active goal; possible only if the user explicitly reopens release planning after hardening gates pass.
- Stable / latest tag: not ready while D5 remains Warning and the active polish scope still contains unresolved architecture debt.

## Non-Negotiable Project Rules

Always read `AGENTS.md` before directing work. The most important boundaries are:

- `src/` owns canonical implementation.
- Do not restore old top-level implementation directories.
- Do not put new core logic into `agent/Agent.js`.
- Action providers are read-only.
- Narrative / LLM must not create world facts.
- New randomness in simulation paths must use the seeded RNG system.
- Do not change Stable World Envelope / schemaVersion without an explicit migration plan.
- Do not publish npm unless the user explicitly asks.
- Do not optimize work sequencing around a near-term publish unless the user explicitly reopens that goal.

When a report conflicts with `AGENTS.md`, treat the report as a candidate claim, not truth.

## Release Scope Contract

Before any publish/readiness decision, the Chief Planner must freeze the supported
scope for that release. P0/P1 classification is evaluated against this frozen scope,
not against every experimental or future-facing capability in the repository.

Foundation Alpha supported scope:

- default `new AndyEngine()` campus runtime;
- custom domain initialization and domain validation;
- public package facades documented in `docs/PUBLIC_API_CONTRACT.md`;
- core tick loop, seeded RNG baseline, action selection, and effect commit paths;
- snapshot/restore through the documented persistence paths;
- package smoke installation, type definitions, and fresh consumer import paths;
- facts / knowledge only where explicitly enabled and documented as opt-in;
- grounded narrative only as a guarded experimental layer, not as semantic completeness.

Out of alpha scope unless the user explicitly expands scope:

- StoryArc runtime;
- Andy Town / Bobby / UI product logic inside Engine Core;
- native binding behavior when native mode is unavailable or disabled;
- full semantic correctness of arbitrary LLM output;
- cross-machine / cross-timezone deterministic replay beyond the documented boundary;
- unpublished external ecosystem integrations.

Release rule: never publish with a known confirmed P0/P1 inside the frozen supported
scope. Real bugs outside that scope should be recorded as P2/P3 or explicit caveats
unless they leak into supported/default behavior, data integrity, public API usability,
or release gates.

## Severity Policy

Use these categories consistently:

- P0: data corruption, replay determinism break, crash in default path, public API unusable, security/data-loss class issue.
- P1: high-probability silent correctness failure in supported/default or release-relevant path; persistence/restore fidelity break; action/world loop disconnect that affects real behavior.
- P2: real bug or serious inefficiency that is bounded, opt-in, long-horizon, or not in default path.
- P3: cleanup, confusing API shape, minor edge case, documentation mismatch.
- False positive: contradicted by code, tests, contract, or explicit governance decision.

Do not promote P2/P3 to P1 just because it is ugly. Do not demote P1 because tests are green.

Severity must be tied to the release scope contract:

- P0/P1 means the current release promise is broken.
- P2/P3 means the issue is real but bounded, opt-in, latent, experimental, or not release-relevant.
- "Would block Stable" is not automatically "blocks Alpha"; document it as a Warning unless it violates the frozen Alpha scope.

## Model Fleet

### Fleet Modes

Maintain two operating modes:

1. **Quota-rich fleet** — use when opencode paid quota is healthy. This is the
   default deep audit/debug mode.
2. **No-quota fleet** — use when paid opencode quota is unavailable or must be
   conserved. This mode relies on free opencode models plus `xspark/deepseek-v4-flash`,
   with `xspark/glm52-fp8` reserved for narrow high-reasoning escalation.

The Chief Planner must declare the active fleet mode at the start of a new audit
round and record it in the session ledger.

### Quota-Rich Routing

Follow the user's cost strategy exactly:

| Role | Primary model | Notes |
|---|---|---|
| Cheap scanner / broad sweep | `xspark/deepseek-v4-flash` | Lowest cost. Use for wide grep-backed candidate discovery and checklist scans. |
| Free quota scanner | strongest available free `opencode` model | Free quota is limited to 200 requests / 5 hours. Use for bounded read-only sweeps, not core judgment. |
| Main audit / verification / debug | `opencode-go/deepseek-v4-pro` | Default reliable model for serious code audit and confirmed fixes. |
| High-reasoning escalation | `xspark/glm52-fp8` | This is the required GLM 5.2 route. Treat it as equivalent to GLM 5.2 for planning purposes. |

Important: do not use `opencode-go/glm-5.2` as the GLM 5.2 fallback unless the user explicitly permits it.
If `xspark/glm52-fp8` fails because of provider/auth/certificate problems, report the failure and choose
another permitted model class, preferably `opencode-go/deepseek-v4-pro`, rather than silently switching to
`opencode-go/glm-5.2`.

### No-Quota Routing

Use this mode when paid opencode quota is exhausted, unavailable, or intentionally
conserved.

| Role | Primary model | Notes |
|---|---|---|
| Broad scanner | `xspark/deepseek-v4-flash` | Default for grep-backed sweeps, checklist scans, file triage, and candidate collection. |
| Independent checker | `opencode/deepseek-v4-flash-free`, `opencode/mimo-v2.5-free`, or `agnes/agnes-2.0-flash` (rotatable) | Verified-executable free models as of 2026-07-03. Rotate across auditors so two independent checks do not share the same model. `agnes` requires `AGNES_API_KEY`, which is only loaded in an interactive shell — invoke via `zsh -lic 'opencode run -m agnes/agnes-2.0-flash ...'`; a non-interactive Bash call fails with `未提供令牌`. |
| Verifier | `xspark/deepseek-v4-flash` + deterministic repro/tests | Verification must lean on code evidence and local commands, not model confidence. |
| Debug patcher | main Codex session or strongest available `opencode/free` model | Keep patches minimal; avoid broad refactors in no-quota mode. |
| High-reasoning escalation | `xspark/glm52-fp8` | Highest cost. Use only for narrow P0/P1 ambiguity, architecture-risk decisions, or fix design that touches replay/persistence/facts/action/effects/public API. The Chief Planner itself (when running as GLM-5.2-FP8) counts as this escalation tier — its own first-principles code reads satisfy the GLM-escalation requirement without a separate call. |

No-quota rules:

- Free/flash models may produce candidate bugs, but cannot alone issue final P0/P1
  judgment. Final classification requires code evidence, targeted repro, or GLM
  escalation for genuinely ambiguous cases.
- Prefer many cheap, narrow prompts over one huge prompt. Give scanners file lists,
  exact invariants, and grep results instead of the whole repository.
- Do not ask GLM to perform broad audits. Ask it one question at a time with the
  minimum code, contract excerpt, repro, and competing hypotheses.
- A GLM call must have an escalation reason recorded in the ledger or session notes:
  `classification`, `root-cause`, `patch-design`, or `fix-verification`.
- If a candidate cannot be reproduced and would require expensive reasoning to
  evaluate, downgrade it to `Needs evidence` instead of spending GLM by default.
- In no-quota mode, do not start speculative product feature work. Focus on
  verification, confirmed fixes, boundary hardening, and low-risk refactors that
  make the engine more coherent under the active polish scope.
- **Independent audit/verify sub-agents MUST be dispatched via the external
  `opencode run -m <model>` CLI, not via the main session's internal Agent/subagent
  tool.** An internal sub-agent runs on the same model as the Chief Planner, so it
  is not independent — it is the planner auditing itself and must not be weighted
  as an independent audit. The internal Agent tool may still be used for read-only
  search/fan-out (e.g. locating code), but its conclusions are candidate claims,
  not independent verdicts. This correction was added 2026-07-03 after Chief
  Planner 2 initially dispatched an internal Audit agent and had to redo the round
  through external opencode.

### Model Cost Discipline

Use cheaper models for:

- broad grep-backed scans;
- finding candidate suspicious files;
- checking documentation drift;
- confirming that a known pattern no longer appears.

Use stronger models for:

- root-cause analysis;
- deciding whether a candidate is P0/P1;
- patch design;
- reviewing fixes that touch replay, persistence, action selection, fact propagation, memory, social graph, or public API.

Do not let a cheap model make final P0/P1 classification alone.

In no-quota mode, also conserve context:

- Send contracts and source excerpts, not whole historical reports.
- Use `CURRENT_BUG_LEDGER.md` as the state summary instead of replaying all old rounds.
- Ask scanners for file/line/evidence only; ask verifiers for verdicts only.
- Summarize each round into the ledger before starting the next one.

## Session Reuse Policy

The Chief Planner should reuse existing opencode sessions whenever possible.

Why:

- preserves local conversational context;
- improves cache hit rate and reduces cost;
- prevents fragmented duplicate reasoning;
- makes the browser-side fleet easier for the user to inspect.

Rules:

1. Maintain a session ledger in the Chief Planner's working notes:

   ```text
   Role: Audit-A
   Model: opencode-go/deepseek-v4-pro
   Session: <session id/title>
   Current scope: runtime/action/facts audit
   Last verdict: no P0/P1 / found candidates / awaiting verification
   ```

2. Reuse a session when the same role continues the same investigation line.
3. Start a new session only when:
   - the role changes materially, for example audit → debug;
   - the previous session context is polluted by wrong assumptions;
   - the session is too long and the model is losing the thread;
   - a fresh independent audit is required.
4. When starting a new session, state why.
5. Never spawn many new sessions just to ask the same question with slightly different wording.

Recommended standing sessions:

| Standing role | Reuse behavior |
|---|---|
| Audit-A | Persistent broad auditor. Reuse until it produces a final report. |
| Audit-B | Independent second auditor. Keep separate from Audit-A for independence. |
| Verifier | Reuse for verifying candidate bugs and fixes. |
| Debug | Reuse for implementation work within one bug family. |
| Cheap Scanner | Reuse for low-cost pattern sweeps. |

## Knowledge Graph Policy

The local knowledge graph is useful but must not become stale.

Path:

```text
.understand-anything/knowledge-graph.json
```

Use it for:

- onboarding a new audit/debug AI;
- finding affected modules and cross-module dependencies;
- explaining architecture during handoff;
- reducing repeated file-discovery cost.

Refresh it when:

- a phase substantially changes module ownership or imports;
- large files are split/moved;
- public facades or package entry points change;
- after a major debug round that touches many modules.

Do not treat the graph as authoritative over current source code. Source files and tests are authoritative.

## Current Bug Ledger Policy

Start current quality-loop handoff from:

```text
docs/audit/CURRENT_BUG_LEDGER.md
```

This living ledger is the concise source of truth for current audit -> verification
-> repair -> re-verification rounds, including the latest gate snapshot and active
latent backlog. Older round ledgers and broad audit reports are provenance, not the
first planning authority.

When documents disagree:

1. current source code and fresh test output win;
2. `AGENTS.md` and active contracts win over old reports;
3. `docs/audit/CURRENT_BUG_LEDGER.md` wins over historical round ledgers;
4. raw reports in the external archive are evidence only.

## Standard Workflow

### 1. Intake

For every external report:

- treat each claim as untrusted;
- split into atomic candidate bugs;
- map each candidate to files/functions/tests;
- classify likely severity only after code evidence.

### 2. Audit

Audit A and Audit B should be independent:

- give them different scopes or ask them to verify from first principles;
- do not feed one auditor the other's conclusions until both have reported;
- require code line references and minimal repros for P0/P1 claims.

### 3. Verification

Verifier must not trust the audit report. It must:

- reproduce the claim or prove why it is false;
- inspect authoritative source;
- run targeted tests or scripts when useful;
- decide `CONFIRMED`, `PARTIAL`, `P2/P3`, or `FALSE_POSITIVE`.

Only confirmed P0/P1 should enter immediate debug unless the Chief Planner intentionally batches small P2 fixes.

### 4. Debug

Debug AI may modify code only for confirmed issues.

Patch rules:

- keep the patch minimal and local;
- prefer existing patterns;
- add regression tests that fail before the fix;
- avoid unrelated refactors;
- do not change stable contracts without migration.

### Configuration Injection Completion Rule

Configuration work is not complete just because a constructor accepts a config
parameter or one code path reads `this._cfg`. R95 exposed this failure mode:
`Relationship` and `SocialGraph` looked partially config-aware, but nested
threshold overrides were shallow-merged, restored/new relationship edges did not
all receive the graph config, and several graph queries still read
`ANDY_DEFAULTS` directly.

For any future config-injection, dead-config removal, or "config is already
complete" claim, the Chief Planner must require all of the following checks:

- Trace the config from public/runtime entry through factory/restore paths into
  every owned child object that consumes it.
- Check both creation and restore paths: constructor, `fromJSON`, saved-state
  restore, factory create/restore, and any compatibility adapter path.
- Deep-merge nested config blocks such as `threshold`, `weights`, `decayRate`,
  and mode maps. Partial user overrides must preserve unspecified defaults.
- Replace module-level default reads in runtime behavior, query helpers,
  projection/cache helpers, and tick/update paths, not only in obvious mutators.
- Add targeted regression tests for partial override behavior, restore behavior,
  and invalid value validation when the config is public.
- Treat broad green gates as insufficient evidence. The targeted test must
  demonstrate the specific override would have failed before the fix.

If an AI claims a config path is complete without these checks, classify that
claim as unverified documentation, not as engineering truth.

### 5. Fix Verification

After debug:

- run targeted tests for the bug family;
- run relevant gates;
- ask Verifier to review the diff and regression test;
- only then mark the item closed.

### 6. Convergence

The debug loop can pause only when:

- the active polish scope is frozen for the current milestone;
- all known confirmed P0/P1 bugs inside that scope are fixed and independently verified;
- two independent post-fix audit rounds find no P0/P1 bugs inside that scope;
- full gates pass, including repeated `npm test` runs when flake risk is suspected; or
- model quota is exhausted; or
- the user explicitly pauses.

If only P2/P3 remain, record them in backlog rather than keeping the P0/P1 loop alive forever.
Do not keep broadening the supported scope during a convergence run; that turns the
fleet into an infinite audit machine instead of a hardening system.

## No-Quota Workflow

When operating in no-quota mode, use a narrower evidence-first loop:

```text
Flash scanner finds candidate patterns
→ free-model checker reads only the relevant files
→ main session runs deterministic repro / targeted tests
→ if confirmed and simple: patch minimally
→ if confirmed but architecture-risky: escalate one narrow GLM question
→ verify with targeted tests and update CURRENT_BUG_LEDGER.md
```

Recommended no-quota prompts:

```text
Scanner:
Read AGENTS.md summary and this invariant: <invariant>.
Use only the supplied grep/file excerpts.
Return candidate file:line findings with why they might violate the invariant.
Do not classify severity.
```

```text
Checker:
Verify this one candidate from first principles using only these files.
Return CONFIRMED / REJECTED / NEEDS_REPRO.
Do not propose broad refactors.
```

```text
GLM escalation:
We have one ambiguous candidate. Decide only this question:
<classification/root-cause/patch-design/fix-verification>.
Here are the contract excerpt, source excerpt, repro output, and hypotheses.
Return a bounded verdict and the minimal next action.
```

No-quota stop rule: if a candidate lacks a deterministic repro, lacks clear contract
violation, and would require broad expensive reasoning, record it as `Needs evidence`
or P2 backlog. Do not spend GLM to chase every suspicious smell.

## Required Gates

Before claiming a serious debug round is clean, run:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
git diff --check
```

For narrow fixes, targeted tests may run first, but full gates are required before a clean-round claim.

If `perf:check` fails once, rerun once. If it fails twice, treat it as a regression.

Before claiming release-candidate readiness, also run or explicitly record why these
were not run:

```bash
npm run typecheck
npm run typecheck:consumer
npm run replay:diff
npm run fresh:consumer
git diff --check
```

If a recent failure was flaky or wall-clock dependent, run `npm test` at least five
times under the intended release environment before declaring the gate stable.

## Common Judgment Traps

### Green Tests Do Not Prove Correctness

Many Andy bugs historically lived behind green tests:

- restore config reaching `engine.config` but not `world.runtimeConfig`;
- fact/knowledge leakage in edge propagation paths;
- serialization fields restored at one layer but bypassed at another;
- candidate providers disconnected by field-name mismatches.

Use tests as evidence, not as permission to stop thinking.

### Do Not Blindly Trust External Audits

External audits often mix true bugs with:

- already accepted compatibility decisions;
- opt-in path concerns;
- D5 regex limitations already recorded as Warning;
- architecture preferences mislabeled as P1.

Verify each claim.

### Do Not Let the Fleet Move the Finish Line

Fleet mode is for finding and verifying bugs relevant to the active polish scope,
not for proving the engine has no possible future defects. Once scope is frozen,
new findings must first answer: "Does this break the current hardening promise?"
If not, record it as backlog, caveat, or future RFC work.

### Beware Repeated Bug Families

Andy has repeatedly had bugs in these families:

- persistence restore only partially wired;
- runtimeSnapshot internal fields missing;
- public type declarations lagging runtime;
- fact/knowledge/narrative leakage across boundary layers;
- action selection context fields missing or mismatched;
- seeded determinism broken by time/RNG fallback;
- performance bombs from repeated deep copies.

When one bug in a family is fixed, audit adjacent paths.

## Current Backlog Pattern

If encountered again, these are likely P2 unless proven otherwise:

- `FactEmitter.emitMemoryFacts()` O(N*M) indexing inefficiency;
- `KnowledgeStore.hasKnowledge()` / `getKnownFactIds()` deep-copy waste;
- non-EVENT fact retention policy growth;
- SocialGraph Dunbar symmetric relationship degradation;
- regex false positives in D5 checker while D5 remains Warning.

Do not spend P0/P1 loop budget on these unless a minimal repro proves default-path failure, data loss, or crash.

## Prompt Template: Auditor

```text
You are an independent read-only auditor. Read AGENTS.md first.
Do not modify files. Do not trust existing reports.
Scope: <files/subsystems>.
Find P0/P1 bugs only. For each claim, provide:
- file/function/line evidence;
- why it violates current contract;
- minimal repro or targeted command;
- why severity is P0/P1 rather than P2/P3.
If no P0/P1, say so clearly and list P2 backlog separately.
Use .understand-anything/knowledge-graph.json when helpful, but source code is authoritative.
```

## Prompt Template: Verifier

```text
You are a read-only verifier. Read AGENTS.md first.
Do not trust the audit report. Do not modify files.
Verify candidate: <candidate>.
Inspect source and run minimal targeted reproduction if useful.
Return one of:
- CONFIRMED P0/P1
- CONFIRMED P2/P3
- PARTIAL
- FALSE_POSITIVE
Include exact code evidence and command output summary.
```

## Prompt Template: Debug AI

```text
You are Debug AI. Read AGENTS.md first.
You may modify code only for this confirmed bug: <bug>.
Do not fix unrelated issues.
Patch minimally, preserve architecture boundaries, add regression tests.
Run targeted tests. Report files changed, tests run, and residual risks.
```

## Prompt Template: Fix Verifier

```text
You are a read-only fix verifier. Read AGENTS.md first.
Verify the fix for <bug>. Do not modify files.
Check:
- root cause is actually removed;
- regression test would have failed before the fix;
- no boundary violation;
- no stable envelope/schemaVersion change unless approved;
- targeted tests pass.
Report PASS / FAIL with evidence.
```

## User Escalation Rules

Do not ask the user for routine P0/P1 debug-loop decisions if autonomous mode is active.

Escalate only when:

- a fix requires Stable World Envelope/schemaVersion migration;
- npm publish or release tagging is proposed;
- a product direction decision is needed;
- model/provider access is blocked and the routing policy forbids fallback;
- two strong auditors disagree on a P0/P1 and verification cannot resolve it.

## Known Correction From Fleet Operations

Two governance corrections are now mandatory:

1. Reuse opencode sessions for the same role/scope. Do not create fresh conversations for every prompt.
2. GLM 5.2 must route through `xspark/glm52-fp8`. Do not silently use `opencode-go/glm-5.2`.

These rules are part of cost control and must be followed by future Chief Planners.
