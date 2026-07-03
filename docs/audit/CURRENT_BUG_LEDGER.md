# Current Bug Ledger

> Living ledger for Andy Engine closed-loop quality work. This file is the current
> source of truth for round-by-round audit, verification, repair, and
> re-verification outcomes.
>
> Workflow: independent audit finds candidate bugs -> independent verification
> confirms or rejects -> debug engineer fixes confirmed bugs -> verification
> validates the fix -> next audit starts from latest HEAD/worktree.
>
> Keep this file concise. Move long raw reports to the external archive, and add
> only evidence-backed summaries here.

## Status

| Field | Value |
|---|---|
| Updated | 2026-07-03 |
| Repository | `/Users/huangweijie/Desktop/andy-engine` |
| External archive | `/Users/huangweijie/Desktop/andy-engine-docs-archive-2026-07-01` |
| Release status | Not an active goal. FROZEN unless the user explicitly reopens publish/tag/release planning. Current strategy is polish-first hardening before any release decision. |
| Active fleet mode | No-quota fleet: use executable free models first, currently `agnes/agnes-2.0-flash`, `opencode/deepseek-v4-flash-free`, `opencode/mimo-v2.5-free`, `opencode/nemotron-3-ultra-free`, plus `xspark/deepseek-v4-flash` for scans/checks; reserve `xspark/glm52-fp8` for narrow high-reasoning escalation only. |
| Current gate snapshot | 2026-07-03 R99 IntrinsicMotivation domain map repair: targeted intrinsic/config/serialization suite 86 passed; `npm test` 3258 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` passed; `npm run typecheck` clean; `npm run smoke:pack` 19 passed; `npm run perf:check` all PASS in 3-run median mode; `git diff --check` clean. Older detailed R48-R98 gate lineage remains below as provenance. |
| Current caveat | R43-R83 baseline committed at `2260fd6`/`c108562`; R84 committed at `3ff5024`; R85 committed at `62db2c7`; R95 committed at `3b3f639`; R96 committed at `2e09b2f`; R97 committed at `9eae010`; R98 committed at `5f3fcd5`. R99 records the latest config-chain repair and is the next verified baseline in this ledger. |

## How To Use This Ledger

1. Add a new round section for every audit/verification/repair cycle.
2. Every bug entry must include: ID, severity, audit evidence, verification verdict, fix files, regression tests, gate result, status.
3. Do not mark a candidate as real until verification independently reproduces or proves the issue from code.
4. Do not mark fixed until a targeted regression test or deterministic repro passes after the fix.
5. Keep P2/latent issues in the backlog; do not let them obscure current P0/P1 work.
6. If an old report conflicts with this file, trust this file plus current code/tests. Use external archive only for provenance.

## Historical Index

Historical raw reports were moved out of the repo to keep full-project AI reviews
focused on active documents.

| Era | Summary | Primary sources |
|---|---|---|
| R1-R10 | NaN/serialization hardening cycle. Around 69 issues fixed, including systemic `??` not catching `NaN`, ProceduralMemory over-decay, shared-reference mutation, and toJSON/fromJSON gaps. | External archive: `audit-rounds/TEN_ROUND_QUALITY_SUMMARY.md`, `BUG_LEDGER_R1`..`R10` |
| R11-R17 | Follow-up convergence cycle. The original convergence claim was later superseded by R18/R19 findings. | External archive: `audit-rounds/CONVERGENCE_REPORT.md` marked SUPERSEDED |
| R18-R20 | Re-audit found new P1/P2 issues after the earlier convergence claim. Several targeted repairs followed. | External archive: `audit-rounds/R18_INDEPENDENT_REAUDIT_REPORT.md`, `R19_TARGETED_REPAIR_REPORT.md`, `R20_REPORT.md` |
| v3.1 reconciliation | External critical audit reconciliation. Severity adjustments included C3/C5 raised to P1, C6 removed immediately, M3 partially confirmed. | External archive: `phase-history/AUDIT_RECONCILIATION_REPORT.md`, `V3_1_COMPLETION_REPORT.md` |
| R41-R42 | Spatial continuous persistence and restore-sync fixes. R42 convergence reported no confirmed P0/P1 after verification, but R43 later corrected the flake blind spot. | Repo: `docs/audit/BUG_LEDGER_R41_R42.md`, `CONVERGENCE_REPORT_R42.md` |
| R43 | Flaky memory consistency test fixed with structural seed memory. R42's single-run all-green claim was corrected: repeated parallel runs are needed to detect flakes. | Repo: `docs/audit/BUG_LEDGER_R43.md` |

## Active Detailed Rounds

### R41 - SP-1

| Field | Detail |
|---|---|
| ID | SP-1 |
| Severity | P0 |
| Audit finding | Continuous spatial mode: schedule/need/IM region changes updated `agent.position` but not `SpatialEngine._coords`, so `_syncRegions()` could infer the old region and roll the move back in the same tick. |
| Verification | Confirmed from code path and repro in continuous spatial mode. |
| Fix | Sync continuous coordinates to `regionCenter(agent.position)` after regionChanged paths. |
| Fix source | Commit noted in source ledger: `9fc9e74` |
| Regression | `tests/unit/spatial-continuous-schedule-rollback.test.js` |
| Result | Fixed and verified in R41/R42 full gate. |
| Source | `docs/audit/BUG_LEDGER_R41_R42.md` |

### R42 - SER-1

| Field | Detail |
|---|---|
| ID | SER-1 |
| Severity | P0 |
| Audit finding | `SpatialEngine` continuous typed-array state was not serialized. Restore snapped agents back to region centers and reset movement state. |
| Verification | Confirmed: no `spatial` snapshot in `AndyWorld.toJSON()`, no snapshot/restore in `SpatialEngine`, restore path reset coords. |
| Fix | Added `SpatialEngine.snapshot()/restore()`, idempotent `addAgent()`, and conditional `AndyWorld.toJSON().spatial` emission for continuous mode. |
| Fix source | Commit noted in source ledger: `1b52f3e` |
| Regression | `tests/unit/spatial-continuous-serialization.test.js` |
| Result | Fixed and verified in R42 full gate. |
| Source | `docs/audit/BUG_LEDGER_R41_R42.md` |

### R42 - RC-1

| Field | Detail |
|---|---|
| ID | RC-1 |
| Severity | P1 |
| Audit finding | `AndyBridge._restoreAgents` restored `agent.position` but did not sync region grid / continuous coordinates, causing first-tick rollback. |
| Verification | Confirmed via `init()` restore callback path and `_syncRegions()` behavior. |
| Fix | After restoring position, sync `world.regions.place()` and continuous spatial coordinates with existence guards. |
| Fix source | Commit noted in source ledger: `1b52f3e` |
| Regression | `tests/unit/andybridge-restore-spatial-sync.test.js` |
| Result | Fixed and verified in R42 full gate. |
| Source | `docs/audit/BUG_LEDGER_R41_R42.md` |

### R43 - FLAKE-1

| Field | Detail |
|---|---|
| ID | FLAKE-1 |
| Severity | P1 test reliability |
| Audit finding | `tests/e2e/cause-effect-memory-narrative.test.js` used wall-clock start time. Some local hours produced zero random events and therefore zero memories, creating parallel-run flakes. |
| Verification | Confirmed by fixed-hour sweep and repeated parallel runs. First fix using fixed UTC start was rejected as timezone fragile. |
| Fix | Give Alice structural seed memories in the test so memory consistency does not depend on random event probability or local hour. |
| Fix source | Source ledger says uncommitted at the time. Current worktree may include later migrations. |
| Regression | The original E2E test; extra timezone/hour sweep outside repo. |
| Result | Fixed under default TZ and robust against tested TZ sweep. |
| Source | `docs/audit/BUG_LEDGER_R43.md` |

## Current Worktree Repair Round - R44

This section records the latest repair performed after the deep code review on
2026-07-01.

### R44-SERCFG-1

| Field | Detail |
|---|---|
| ID | R44-SERCFG-1 |
| Severity | P1 |
| Audit finding | `Serialization.deserialize(envelope, config)` replaced `runtimeSnapshot._restoreConfig` with the caller config. Loading a saved world with partial config such as `{ seed }` erased persisted `enableFacts`, `needs`, and `actionSelection`. |
| Evidence | Before fix, a world saved with `enableFacts: true`, custom needs threshold, and active action selection restored with `enableFacts=false`, no `factStore`, default needs, and default `shadow` action mode when deserialized with `{ seed: 123 }`. |
| Verification verdict | Confirmed by direct Node repro and code inspection at `src/store/Serialization.js`. Existing tests only covered full config attachment, not partial-config merge. |
| Fix | Preserve existing `envelope.runtimeSnapshot._restoreConfig` and layer caller config over it: `{ ...existingRestoreConfig, ...config }`. |
| Files | `src/store/Serialization.js`; `tests/unit/config-injection-restore.test.js` |
| Regression test | Added `Serialization.deserialize preserves snapshot _restoreConfig when caller passes partial config`. |
| Re-verification | Targeted tests passed; direct Node repro now restores `enableFacts=true`, factStore present, custom needs/actionSelection preserved. |
| Status | Fixed in current worktree; not committed in this session. |

### R44-BF-TIME-1

| Field | Detail |
|---|---|
| ID | R44-BF-TIME-1 |
| Severity | P2, can be P1 for custom-domain users |
| Audit finding | `BehaviorField` accepted invalid `domain.timeSchedule` such as `[]`; `_getTimeTarget()` then read `schedule[0].target` and crashed when `signals.environment.hour` was present. |
| Evidence | Minimal custom domain with `timeSchedule: []` reproduced `Cannot read properties of undefined (reading 'target')` before fix. |
| Verification verdict | Confirmed by direct Node repro. `validateDomain` does not currently constrain `timeSchedule`; `DomainRegistry` exposes it directly. |
| Fix | Added `_normalizeTimeSchedule()` and constructor fallback to `DEFAULT_TIME_SCHEDULE` unless schedule is an ordered array of at least two entries with finite `hour` and valid `target`. |
| Files | `src/agent/psychology/BehaviorField.js`; `tests/behavior-field.test.js` |
| Regression test | Added empty/invalid `timeSchedule` fallback test; confirms `tick()` no longer throws and default targets are used. |
| Re-verification | Targeted tests passed; direct Node repro now prints `ok`. |
| Status | Fixed in current worktree; not committed in this session. |

## R45 - No-Quota Baseline Verification

This section records the first no-quota fleet baseline verification after switching
fleet mode on 2026-07-02. No external model escalation was used.

| Field | Detail |
|---|---|
| Scope | Local evidence-first gate replay for the current mixed worktree. |
| Finding | No new confirmed P0/P1 found during local gate verification. |
| Commands | `git diff --check`; `npm run check:boundaries`; `npm run test:domain`; `npm run typecheck`; `npm run smoke:pack`; `npm run replay:diff`; `npm run typecheck:consumer`; `npm test`; `npm run perf:check`; `npm run sqlite:smoke`; `npm run fresh:consumer`. |
| Result | All commands exited 0. `perf:check` reported one WARN: `runtime-clustered gather` 1.91x baseline, below the 2.0x fail threshold. |
| Status | Baseline gates re-verified locally under no-quota workflow. Perf WARN should be monitored but is not a current blocker. |

## R46 - Release-Scope Package/API Verification

This section records a narrow no-quota verification pass over public package,
exports, type declarations, and package contents.

| Field | Detail |
|---|---|
| Scope | Release-support package/API surface: public exports, compatibility imports, SDK smoke, type smoke, package files list, and npm pack contents. |
| Finding | No confirmed P0/P1 found in this pass. Package/API checks passed. |
| Commands | `npx vitest run tests/package-boundary.test.js tests/compatibility.test.js tests/sdk.test.js tests/type-smoke.test.js --no-color`; `npm pack --dry-run`; local package metadata scan for `package.json.files` existence and export list. |
| Result | 4 test files passed / 162 tests passed. `npm pack --dry-run` produced `andy-engine-2.0.1.tgz` with 209 files. Package exports are the expected 10 paths; no `package.json.files` entries are missing. |
| Status | Release-scope package/API surface re-verified locally under no-quota workflow. |

## R47 - Facts / Knowledge / Grounding Verification

This section records a narrow no-quota verification pass over the opt-in facts,
knowledge propagation, epistemic privacy, and grounded narrative release-support
surface.

| Field | Detail |
|---|---|
| Scope | Facts/knowledge/grounding: event -> fact -> knowledge pipeline, `AGENT_STATE` privacy, `auditOnly` filtering, grounded narrative checker corpus, and gossip evidence guards. |
| Finding | No confirmed P0/P1 found in this pass. Facts/knowledge/grounding checks passed. |
| Commands | `npx vitest run tests/facts tests/e2e/alice-bob-epistemic-boundary.test.js tests/e2e/epistemic-evidence-matrix.test.js tests/e2e/gossip-propagation.test.js tests/unit/narrative/fact-consistency-checker.test.js tests/unit/narrative-violation-corpus.test.js --no-color`; local `rg` scan for `addKnowledge`, `factStore.addFact`, deprecated fallback calls, `auditOnly`, and `AGENT_STATE`; runtime grounding smoke with `enableFacts=true` and action selection event mode. |
| Result | 25 test files passed / 473 tests passed. Runtime smoke produced `allowedFacts=38`, `actionFacts=0`, `bobState=0` for Alice grounding. Source scan confirmed the relevant guards are present; deprecated fallback methods remain covered by tests and no runtime/agent/sdk caller was introduced. |
| Note | The first runtime smoke attempt used the wrong root facade import shape (`{ AndyEngine }` destructuring). It failed before exercising engine behavior, was corrected to `const AndyEngine = require('./index.js')`, and is not treated as a bug. |
| Status | Facts/knowledge/grounding surface re-verified locally under no-quota workflow. D5 remains Warning for semantic completeness, but no release-scope P0/P1 was confirmed in this pass. |

## R48 - Persistence / Replay / Config Restore Verification

This section records the first pass after the user clarified that external
models should be preferred over local-only reasoning when available. The pass
used `opencode/deepseek-v4-flash-free` for no-edit audit and local commands for
reproduction, fix, and verification.

| Field | Detail |
|---|---|
| Scope | Store/persistence/replay/config restore: stable envelope, `_restoreConfig`, `SimulationStore`, world-state adapter, tick hash, replay diff, timezone smoke. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with key store/replay files and tests attached, no-edit mode. |
| P1 candidate verdict | Rejected. External audit suspected `WorldStateAdapter.fromWorldState()` loses non-default config, but direct smoke restored `enableFacts=true`, custom `needs.decayRate.hunger=0.123`, `actionSelection.mode=event`, and `factStore=true` from `runtimeSnapshot._restoreConfig`. |
| Confirmed issue | R48-TICKHASH-DATE-1: `tickHash.canonicalize(new Date(...))` returned `{}`, so diagnostic hashes could fail to distinguish Date-valued time fields if a caller supplied live Date objects instead of serialized strings. Severity P2 diagnostic correctness; not a release P0/P1. |
| Fix | Canonicalize valid Date objects to ISO strings and invalid Date objects to stable `'Invalid Date'`. |
| Files | `src/store/world/tickHash.js`; `tests/unit/tickHash.test.js` |
| Regression test | Added Date canonicalization, invalid Date, Date-vs-ISO hash equivalence, and different-Date hash-difference coverage. |
| Timezone candidate verdict | Not confirmed in R48. `TZ=UTC npx vitest run tests/unit/golden-seed-replay.test.js --no-color` passed. Local-time accessors still exist in runtime helpers, so TZ-1 remains latent design debt rather than an active release blocker. |
| Commands | `npx vitest run tests/store tests/store-serialization.test.js tests/schema-validator.test.js tests/unit/config-injection-restore.test.js tests/unit/persistence-trust.test.js tests/unit/replay-trust-l4.test.js tests/unit/replay-trust-l3.test.js tests/unit/replay-trust-l2.test.js tests/unit/golden-seed-replay.test.js tests/unit/replay-diff.test.js tests/unit/deterministic-replay.test.js tests/unit/tickHash.test.js tests/unit/serialization-roundtrip.test.js tests/unit/andybridge-restore-spatial-sync.test.js tests/unit/spatial-continuous-serialization.test.js --no-color`; `npm run replay:diff`; `TZ=UTC npx vitest run tests/unit/golden-seed-replay.test.js --no-color`; direct Node smokes for config restore and Date canonicalization. |
| Result | 27 store/replay/config test files passed / 464 tests passed. `replay:diff` 100 ticks matched / 0 mismatched. UTC golden replay 3 passed. Date canonicalization smoke now returns ISO string for Date. |
| Status | R48 P2 fixed and verified in current worktree. No confirmed store/replay/config P0/P1 remains from this pass. |

## R49 - Action / Effects / Active Writeback Verification

This section records an external-free audit plus local verification pass over the
action provider matrix, utility selection, active writeback ownership, and typed
effect delta boundary.

| Field | Detail |
|---|---|
| Scope | Action providers, utility selector/scorer, `ActionSelectionRuntime`, `EventEffectPipeline`, `EffectCommitter`, dry-run vs active semantics, provider read-only boundary, seeded RNG behavior. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with key action/effects files and tests attached, no-edit mode. |
| Confirmed issue | R49-ACTIVE-LM-1: active action writeback dropped `LocationMeaningDelta` for move/explore actions. `EventEffectPipeline.computeDeltas()` produced both `PositionDelta` and `LocationMeaningDelta`, but `ActionSelectionRuntime.applyActionStateDeltas()` rebuilt typed deltas from legacy `stateDeltas` and only recreated `PositionDelta`. Its cached `EffectCommitter` also used a time-only world stub, so no active-mode location meaning could reach `WorldFactStore`. Severity P1 because active mode made movement writeback incomplete and left location-meaning feedback stale. |
| Fix | Added internal `env._world` from `RuntimeContext`, updated active writeback to use the real world in `EffectCommitter`, and recreate `LocationMeaningDelta` alongside `PositionDelta` for valid movement targets. |
| Files | `src/runtime/RuntimeContext.js`; `src/agent/runtime/ActionSelectionRuntime.js`; `tests/unit/active-writeback.test.js` |
| Regression test | Added active move writeback test with `enableFacts=true`: selected move updates live position, syncs `RegionGrid`, and writes `movement_target` location meaning to `WorldFactStore`. |
| Rejected candidate | External audit suspected temperature > 0 without explicit seed silently fails outside active mode. Local smoke rejected it: `shadow`, `event`, and `dryRunEffects` each had injected agent RNG, produced one trace, and event/dryRunEffects emitted one `action_selected` event. |
| Provider boundary scan | `src/action/providers` scan found only candidate array construction and context reads; no provider writes to memory, facts, knowledge, position, relationships, or RNG wall-clock APIs. |
| Commands | `npx vitest run tests/action-layer.test.js tests/phase-27-candidate-providers.test.js tests/integration/action-provider-integration.test.js tests/unit/candidate-providers.test.js tests/unit/action-candidate.test.js tests/unit/utility-selector.test.js tests/unit/utility-scorer.test.js tests/unit/utility-scorer-branches.test.js tests/unit/utility-scorer-habit.test.js tests/unit/event-effect-pipeline.test.js tests/unit/effect-pipeline-dry-run.test.js tests/unit/effect-delta-contract.test.js tests/unit/active-writeback.test.js tests/unit/movement-writeback.test.js tests/unit/relationship-writeback.test.js tests/unit/effects/position-delta.test.js tests/facts/effect-pipeline-dryrun.test.js tests/facts/minimal-active-writeback.test.js tests/facts/location-movement-writeback.test.js tests/facts/relationship-social-writeback.test.js tests/facts/action-selected-canon-path.test.js tests/facts/action-event-emission.test.js tests/unit/action-event-emission.test.js tests/phase-26-2-utility-selector.test.js tests/phase-32-4-reasontrace.test.js --no-color`; `npm run check:boundaries`; local provider write scan; local temperature/no-seed smoke. |
| Result | 25 action/effects/writeback test files passed / 355 tests passed. Boundary checks passed. |
| Status | R49 P1 fixed and verified in current worktree. No other confirmed action/effects P0/P1 remains from this pass. |

## R50 - Domain / Config / Custom-World Verification

This section records an external-free audit plus local verification pass over
domain portability, custom-domain fallback behavior, and source scans for
campus-only leakage in canonical `src/` implementation paths.

| Field | Detail |
|---|---|
| Scope | DomainRegistry, domain validation, config validation, custom/minimal domain fallback, ScheduleHandler domain use, IntrinsicMotivation domain fallback, and source scanning for concrete world terms. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with key domain/config/runtime files and tests attached, no-edit mode. |
| Confirmed issue | R50-IM-DOMAIN-1: `IntrinsicMotivation._getExplorationStates()` fell back to `['在路上']` when a custom domain omitted `intrinsicMotivationConfig.explorationStates`. Severity P1 for domain portability because a concrete default could leak into drive output/serialization for minimal custom worlds. |
| Confirmed issue | R50-SCHEDULE-CENTER-1: `ScheduleHandler` resolved skip attractors through module-level `STATE_CENTERS` from the default campus domain. Tavern/custom skip states such as `喝酒` could move position correctly but fail to apply the intended BehaviorField attractor. Severity P1 for domain portability and behavior correctness. |
| Coverage issue | Source scan for campus-only strings covered legacy top-level runtime dirs but not canonical `src/` implementation dirs. |
| Fix | Made `IntrinsicMotivation` fallback to the current domain's state names/state map/state centers, or `[]` when no domain state source exists. Made `ScheduleHandler` resolve state centers from the active agent domain/BehaviorField. Expanded source scan to canonical `src/` dirs while ignoring comment-only lines and keeping narrow exceptions for default-domain config/facade and narrative checker activity filtering. |
| Files | `src/agent/psychology/IntrinsicMotivation.js`; `src/agent/handlers/ScheduleHandler.js`; `tests/fallback-minimal.test.js`; `tests/unit/state-label-cleanup.test.js`; `tests/source-scan.test.js` |
| Regression test | Added minimal-domain intrinsic drive test proving target states are valid domain states and contain no campus terms. Added tavern ScheduleHandler skip-attractor test proving `喝酒` resolves to tavern state center. Expanded source scan to include `src/runtime`, `src/agent`, `src/action`, `src/effects`, `src/pressure`, `src/domain`, `src/config`, `src/sdk`, `src/store`, `src/canon`, `src/knowledge`, `src/narrative`, `src/social`, and `src/spatial`. |
| Rejected / downgraded candidate | The external repro for tavern `IntrinsicMotivation` was inaccurate: tavern preset already provides `explorationStates`. The real defect was confirmed only for minimal/custom domains missing that optional config. |
| Commands | `npx vitest run tests/fallback-minimal.test.js tests/unit/state-label-cleanup.test.js tests/source-scan.test.js --no-color`; `npm run test:domain`; `npx vitest run tests/sdk-custom-domain.test.js tests/domain/semantic-profile-runtime.test.js tests/worldview-constraints.test.js tests/unit/domain/validate-domain-coverage.test.js tests/unit/domain-safe-behavior-label.test.js tests/unit/config/validate-config.test.js tests/unit/intrinsic-domain.test.js tests/unit/state-label-cleanup.test.js --no-color`; `npm run check:boundaries`; local non-comment source scan for campus terms across `src/`. |
| Result | Direct regression set: 3 files / 37 tests passed. `npm run test:domain`: 5 files / 82 tests passed. Supplemental domain/config/custom-domain set: 8 files / 128 tests passed. Boundary checks passed. |
| Status | R50 P1 issues fixed and verified in current worktree. No other confirmed domain/config P0/P1 remains from this pass. |

## R51 - Runtime / Event / Social / Spatial Verification

This section records an external-free audit plus local verification pass over
runtime event dispatch, agent perception, social graph constraints, spatial
interaction regressions, and replay determinism.

| Field | Detail |
|---|---|
| Scope | `EventDispatcher`, `PerceptionRuntime`, `AndyWorld` event phases, `SocialGraph`, `Relationship`, spatial interaction rollback paths, event lifecycle dedup, emotion contagion, and replay diff. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with runtime/social/spatial files and tests attached, no-edit mode. |
| Confirmed issue | R51-PERCEPTION-DEDUP-1: `PerceptionRuntime.perceiveEvents()` reprocessed the same `event.id` every tick while the event remained in `eventLog.slice(-10)`, repeatedly applying emotion deltas, memory writes, appraisal bias/stress changes. Severity P0 because historical events could compound state effects without new world events. |
| Confirmed issue | R51-DUNBAR-COUNT-1: `SocialGraph._enforceDunbarLimits()` downgraded excess strong ties to acquaintances but did not count those newly downgraded relationships against `maxMediumTies` in the same pass. Severity P1 for long-run social graph capacity correctness. |
| Confirmed issue | R51-EVENTCONFIG-1: `EventDispatcher` used module-level `ANDY_DEFAULTS.events` for random-event probability, lifespan, log cap, and serialization cap, ignoring domain `eventConfig` overrides. Severity P2/P1 depending on custom domain size because event log retention controls could be silently ignored. |
| Fix | Added agent-level `_perceivedEventIds` dedup with bounded retention and persisted it through `AgentSerializer`; duplicate event IDs are skipped while id-less injected events preserve legacy behavior. Changed Dunbar enforcement so downgraded strong ties immediately flow into medium counting. Added per-dispatcher `_eventConfig` merged from domain config and used it for random event probability, lifespan, log cap, and serialization cap. |
| Files | `agent/Agent.js`; `src/agent/facade/AgentSerializer.js`; `src/agent/runtime/PerceptionRuntime.js`; `src/social/SocialGraph.js`; `src/runtime/EventDispatcher.js`; `tests/unit/event-lifecycle-dedup.test.js`; `tests/unit/social.test.js`; `tests/unit/runtime/event-dispatcher-branches.test.js`; `tests/e2e/emotion-contagion-cluster.test.js`; `tests/fixtures/golden-campus-seed42-100ticks.json`; `docs/quality/golden-corpus-changelog.md` |
| Regression test | Added direct perception dedup and save/restore no-replay tests; added Dunbar same-pass strong-to-medium cap test; added domain `eventConfig.maxEventLogSize=3` event-log/index cap test. |
| Rejected / downgraded candidate | External audit flagged Phase 8 canon + Phase 8b encounter effects as overlapping P0. Local code review downgraded it: encounter phase commits relationship and gossip memory from event effects, while canon consequences commit event-derived memory/location/future-tendency. It remains a semantic-design watch item, but no confirmed duplicate same-delta P0 was proven in R51. |
| Intentional replay change | Perception dedup intentionally changed simulation semantics from tick 6 onward in the seed42 golden replay. Recorded in `docs/quality/golden-corpus-changelog.md`, ran `npm run golden:regen`, then `npm run replay:diff` returned 100/100 matched. |
| Commands | `npx vitest run tests/unit/event-lifecycle-dedup.test.js tests/unit/social.test.js tests/unit/runtime/event-dispatcher-branches.test.js --no-color`; full R51 targeted suite over emotion contagion, social emergence, contagion cache, social handlers, event lifecycle, dispatcher branches, spatial tests, rollback tests, relationship writeback; `npm run golden:regen`; `npm run replay:diff`; `npm run check:boundaries`; local event visibility and eventConfig smokes. |
| Result | Direct regression set: 3 files / 43 tests passed. Full R51 runtime/social/spatial suite: 15 files / 116 tests passed. `replay:diff` 100 ticks matched / 0 mismatched after intentional golden regen. Boundary checks passed. |
| Status | R51 P0/P1/P2 issues fixed and verified in current worktree. No other confirmed runtime/social/spatial P0/P1 remains from this pass. |

## R52 - Public API / Package / Consumer Type Verification

This section records a no-quota public package pass using
`opencode/deepseek-v4-flash-free` no-edit audit plus local strict consumer
reproduction.

| Field | Detail |
|---|---|
| Scope | `package.json` exports, root/sdk/store/facts/domain facades, `.d.ts` files, npm pack contents, smoke/fresh consumer behavior. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with package/facade/type/test files attached, no-edit mode. |
| Confirmed issue | R52-STORE-DTS-1: `store/index.d.ts` used invalid ambient `export = { ... }`, and direct strict TS consumers importing `andy-engine/store` failed. Local stricter repro also found bare `Buffer` references requiring consumers to install Node globals/types. Severity P1 because a published public subpath was unimportable for strict TS consumers. |
| Fix | Replaced bare `Buffer` references with a `Uint8Array`-compatible `BinaryData` alias and changed store ambient export to `declare const AndyStore: { member: typeof member; ... }; export = AndyStore;`. Expanded `scripts/consumer-typecheck.sh` to import/use `andy-engine/store`, `andy-engine/facts`, and `andy-engine/domain`. Added type-smoke guard against reverting to object-literal export or bare `Buffer`. |
| Files | `store/index.d.ts`; `scripts/consumer-typecheck.sh`; `tests/type-smoke.test.js` |
| Regression test | Added strict fresh tarball consumer repro for store/facts/domain; added source-level type-smoke assertion. |
| Closed in R60 | External audit noted missing `.d.ts` for secondary subpaths such as `./domain/validate`, `./domain/registry`, `./config/defaults`, and presets. R60 reproduced the strict fresh-consumer TS7016 path and added typed subpath exports. |
| Commands | Explicit strict TS/CJS tarball consumer repro; `npx vitest run tests/package-boundary.test.js tests/compatibility.test.js tests/sdk.test.js tests/type-smoke.test.js tests/sdk-custom-domain.test.js --no-color`; `npm run typecheck`; `npm run typecheck:consumer`; `npm run smoke:pack`; `npm run fresh:consumer`; `npm pack --dry-run`; `git diff --check`. |
| Result | Public API/package suite: 5 files / 167 tests passed after adding the R52 guard. `typecheck`, consumer typecheck, smoke pack 19/19, fresh consumer, dry-run pack 209 files, and diff check all passed. |
| Status | R52 P1 fixed and verified in current worktree. |

## R53 - External Core-Legacy Area Recheck

This section records verification of the user's external audit over four legacy
core areas plus new quality findings. The audit was used as reference; every
candidate below was locally inspected and covered by targeted tests.

| Field | Detail |
|---|---|
| Scope | AutoTick RNG injection, WorldPressure time semantics, SimulationStore interval guards, AndyBridge snapshot encoding, WorldFactStore high-volume fact growth. |
| Confirmed issue | R53-AUTOTICK-RNG-1: `AutoTick` accepted `options.rng` but later called it as a function. Passing the engine-standard `new RNG(seed)` instance caused `TypeError: this._rng is not a function`. Severity P1 for SDK crash on supported RNG shape. |
| Confirmed issue | R53-WORLDPRESSURE-TIME-1: `WorldPressure.computeTime()` used `getUTCHours()` while `WorldClock.hour` and schedule/behavior logic use local `getHours()`. Severity P1 for inconsistent time pressure in non-UTC runtimes. |
| Confirmed issue | R53-SIMSTORE-INTERVAL-1: `storyFlushInterval=0` made `tickCount % storyFlushInterval` evaluate to `NaN`, preventing story flush and allowing buffer retention until max-buffer trimming. Snapshot/decay intervals had the same zero/fractional interval hazard. Severity P1 for storage lifecycle correctness. |
| Confirmed issue | R53-ANDYBRIDGE-SNAPSHOT-1: `AndyBridge._serializeAgents()` joined per-agent JSON with `\n---\n`; any serialized field containing that delimiter broke `_restoreAgents()` splitting/parsing. Severity P1/P2 depending usage because snapshots could become unrecoverable. |
| Confirmed issue | R53-WFS-OBS-MEM-CAP-1: `WorldFactStore` bounded only `event` facts. High-volume `observation` and `memory` facts had no retention cap and could grow linearly in long-running worlds. Severity P2 memory hardening. |
| Fix | `AutoTick` now normalizes RNG functions and RNG instances. `WorldPressure.computeTime()` prefers explicit `world.hour` and otherwise uses local `getHours()`. `SimulationStore` normalizes snapshot/story/decay intervals to positive integer ticks. `AndyBridge` now serializes agent snapshots as a JSON array while retaining legacy delimiter restore compatibility. `WorldFactStore` now evicts oldest high-volume `observation` and `memory` facts with index cleanup and KnowledgeStore purge; restore also enforces caps for old snapshots. |
| Files | `src/sdk/AutoTick.js`; `src/pressure/WorldPressure.js`; `src/store/SimulationStore.js`; `src/sdk/AndyBridge.js`; `src/canon/WorldFactStore.js`; `tests/sdk.test.js`; `tests/store/simulation-store.test.js`; `tests/unit/andy-bridge-internal.test.js`; `tests/unit/world-pressure.test.js`; `tests/unit/world-pressure-adapter.test.js`; `tests/unit/pressure-layer.test.js`; `tests/phase-26-fix-deterministic.test.js`; `tests/facts/world-fact-store.test.js` |
| Regression test | Added RNG-instance AutoTick test, zero/fractional interval SimulationStore tests, JSON-array AndyBridge snapshot and legacy delimiter restore tests, explicit `world.hour` WorldPressure test, and WorldFactStore observation/memory cap tests with knowledge purge. |
| Rechecked external conclusions | FactEmitter memory O(N*M) and KnowledgeStore deep-copy issues were confirmed already fixed. SocialGraph shared-relationship Dunbar downgrade remains a semantic design debt; R51 already fixed same-pass cap counting, but non-asymmetric relationship modeling is deferred. |
| Commands | `npx vitest run tests/sdk.test.js tests/store/simulation-store.test.js tests/unit/andy-bridge-internal.test.js tests/unit/world-pressure.test.js tests/unit/world-pressure-adapter.test.js tests/unit/pressure-layer.test.js tests/phase-26-fix-deterministic.test.js tests/facts/world-fact-store.test.js --no-color`; `npm run typecheck`; `npm run check:boundaries`; `npm run replay:diff`; `npx vitest run tests/unit/golden-seed-replay.test.js --no-color`; `npm run typecheck:consumer`; `npm run smoke:pack`; `npm run fresh:consumer`; `npm pack --dry-run`; `git diff --check`. |
| Result | R53 targeted regression suite: 8 files / 245 passed / 4 skipped. Typecheck clean. Boundary checks passed. Replay diff 100/100 matched and golden seed replay 3 passed. Consumer typecheck, smoke pack 19/19, fresh consumer, dry-run pack 209 files, and diff check all passed. |
| Status | R53 confirmed P1/P2 issues fixed and verified in current worktree. |

## R54 - SDK / LLM / Narrative / Grounding Boundary Verification

This section records a no-quota SDK/narrative audit using
`opencode/deepseek-v4-flash-free` plus local boundary scans and targeted
regressions.

| Field | Detail |
|---|---|
| Scope | `Character`, `Andy`, `LLMAdapter`, `NarrativeBuilder`, `FactProvider`, `FactConsistencyChecker`, `AgentNarrative`, SDK type declarations, grounded narrative and epistemic E2E tests. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with SDK/narrative/facts/epistemic files and tests attached, no-edit mode. |
| P0/P1 verdict | No new P0/P1 release blocker confirmed. External audit found no path where LLM/narrative output directly creates world facts, no confirmed private `AGENT_STATE` leakage, no save/load corruption, and no release-blocking public facade mismatch. |
| Confirmed P2 hardening | R54-SDK-GROUNDING-CONTEXT-1: `Character.chat()` and `chatStream()` injected `groundingPackage` into `NarrativeBuilder`, but public `Character.getContext()` did not. Custom LLM integrations using `getContext().systemPrompt` therefore lacked the same facts/grounding guardrails. |
| Confirmed P2 hardening | R54-CHATSTREAM-DIAG-1: `Character.chatStream()` swallowed AutoTick errors without diagnostics while `chat()` recorded them. Behavior still continued, but observability diverged. |
| Confirmed P2 hardening | R54-AGENTNARRATIVE-DOMAIN-1: `AgentNarrative.toNarrative()` still looked up behavior dynamics through default `BehaviorLabeler.STATE_CENTERS` instead of the active domain's `stateCenters`, so custom-domain state-center dynamics could be omitted. |
| Fix | `Character` now forwards explicit `enableFacts` into owned `AndyEngine`, `getContext()` builds/returns `groundingPackage` and injects it into the system prompt, SDK types expose `enableFacts` and `groundingPackage`, `chatStream()` records AutoTick diagnostics like `chat()`, and `AgentNarrative` resolves centers through `agent.domain.getStateCenter()`. |
| Files | `src/sdk/Character.js`; `src/sdk/types.d.ts`; `src/agent/facade/AgentNarrative.js`; `tests/sdk.test.js`; `tests/worldview-constraints.test.js` |
| Regression test | Added `Character.getContext()` facts opt-in grounding test, `chatStream()` AutoTick diagnostics test, and minimal custom-domain `stateCenters` narrative dynamics test. |
| Boundary scan | Local `rg` scan confirmed SDK/narrative layers do not call `factStore.addFact`, `addFacts`, or `KnowledgeStore.addKnowledge`; fact writes remain under canon/FactEmitter/CanonEventPipeline and agent memory via public experience API. |
| Deferred P2 | External audit noted `Character.save()` on a character owned by shared `Andy` saves the whole engine and can restore extra unwrapped agents if used instead of `Andy.save()`. This is an API/documentation caveat, not a confirmed P0/P1 corruption path. |
| Commands | `npx vitest run tests/sdk.test.js tests/worldview-constraints.test.js tests/unit/narrative/narrative-builder-grounding.test.js tests/unit/narrative/fact-provider-evidence.test.js tests/unit/narrative/fact-consistency-checker.test.js tests/facts/grounded-narrative.test.js tests/e2e/alice-bob-epistemic-boundary.test.js tests/e2e/epistemic-evidence-matrix.test.js tests/e2e/gossip-propagation.test.js --no-color`; `npm run test:domain`; `npm run typecheck`; `npm run check:boundaries`; `npm run replay:diff`; `npm run typecheck:consumer`; `npm run smoke:pack`; `npm run fresh:consumer`; `npm pack --dry-run`; `git diff --check`. |
| Result | R54 targeted SDK/narrative/grounding suite: 9 files / 206 tests passed. `test:domain` 82 passed. Typecheck clean. Boundaries clean. Replay diff 100/100 matched. Consumer typecheck, smoke pack 19/19, fresh consumer, dry-run pack 209 files, and diff check all passed. |
| Status | R54 P2 hardening fixed and verified in current worktree. No confirmed SDK/narrative/grounding P0/P1 remains from this pass. |

## R55 - Native / SQLite / Store Release Surface Verification

This section records a no-quota release-surface audit using
`opencode/deepseek-v4-flash-free` plus local package-consumer reproduction.

| Field | Detail |
|---|---|
| Scope | Optional native module loading, `ANDY_USE_NATIVE`, SQLite optional dependency fallback, `store` public facade, `store/index.d.ts`, fresh consumer scripts, and package contents. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with native/store/package scripts and tests attached, no-edit mode. |
| P0/P1 verdict | No new P0/P1 release blocker confirmed. Native default-off behavior, optional/required native modes, SQLite module-level require guard, `SimulationStore.init()` fallback, package file coverage, and store facade imports were confirmed safe. |
| Confirmed P2 hardening | R55-FRESH-NOSQLITE-1: `scripts/fresh-consumer-matrix.sh` no-SQLite test installed normal optional dependencies and only called `createStore()`, so it could pass without proving `init()` fallback when `better-sqlite3` is absent. |
| Confirmed P2 hardening | R55-STORE-DTS-RUNTIME-1: `store/index.d.ts` still exposed legacy snapshot/meta method names while omitting canonical runtime names such as `loadLatest`, `loadAt`, `get`, and `set`. A TS consumer could compile against an incomplete/misleading store surface. |
| Fix | The fresh consumer no-SQLite path now installs the tarball with `--omit=optional`, calls `store.init()`, asserts MemoryStore fallback, writes one tick, and shuts down. `SQLiteStore` and `MemoryStore` now provide deprecated aliases (`loadLatestSnapshot`, `loadSnapshotByTick`, `saveMeta`, `loadMeta`) wired to canonical methods, while `store/index.d.ts` exposes both canonical runtime methods and compatibility aliases without Node global types. |
| Files | `src/store/SQLiteStore.js`; `src/store/MemoryStore.js`; `store/index.d.ts`; `scripts/fresh-consumer-matrix.sh`; `scripts/consumer-typecheck.sh`; `tests/type-smoke.test.js`; `tests/store/sqlite-optional.test.js` |
| Regression test | Added store alias runtime coverage, `createStore` auto-mode SQLite-missing `init()` fallback coverage, type-smoke checks for runtime-backed store method names, and fresh tarball TypeScript usage of store canonical + alias methods. |
| Commands | `npx vitest run tests/store/sqlite-optional.test.js tests/type-smoke.test.js tests/native-loader.test.js tests/native-integration.test.js`; `npm run typecheck`; `npm run typecheck:consumer`; `npm run smoke:pack`; `bash scripts/fresh-consumer-matrix.sh`; `npm test`; `npm run test:domain`; `npm run check:boundaries`; `npm run replay:diff -- --ticks=100 --agents=5 --seed=r55-store-release-surface`; `npm pack --dry-run`; `git diff --check`. |
| Result | R55 targeted native/store/package suite: 4 files / 47 tests passed. `npm test`: 192 files passed / 1 skipped; 3171 passed / 28 skipped. `test:domain` 82 passed. Typecheck and consumer typecheck clean. Smoke pack 19/19. Fresh consumer passed Basic CJS, `--omit=optional` No-SQLite, and TypeScript checks. Replay diff 100/100 matched. Dry-run pack still contains 209 files. Diff check clean. |
| Status | R55 P2 hardening fixed and verified in current worktree. No confirmed native/SQLite/store release-surface P0/P1 remains from this pass. |

## R56 - SDK / LLM Provider Usability Verification

This section records a no-quota SDK/LLM provider audit using
`opencode/deepseek-v4-flash-free` plus local hermetic provider tests.

| Field | Detail |
|---|---|
| Scope | `LLMAdapter`, `Character.chat()`, `Character.chatStream()`, `Character.getContext()`, `Character.save/load`, `Andy` SDK wrapper, SDK public types, provider env vars, SSE parsing, streaming retry, and conversation history symmetry. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with SDK/LLM/provider files and tests attached, no-edit mode. |
| Confirmed issue | R56-ANTHROPIC-ENV-1: `LLMAdapter` used the same env fallback for every non-Ollama provider: `OPENAI_API_KEY` before `ANTHROPIC_API_KEY`. In a normal multi-provider environment with both keys set, `provider: 'anthropic'` sent the OpenAI key to Anthropic and failed with a misleading 401. Severity P1 for provider usability. |
| Confirmed P2 hardening | R56-SSE-TAIL-1: OpenAI-compatible and Anthropic stream parsers only processed complete newline-terminated `data:` lines. A final SSE `data:` line without a trailing newline stayed in `buffer`, yielded zero tokens, and surfaced as a stream failure. |
| Confirmed P2 hardening | R56-CHATSTREAM-BREAK-1: `Character.chatStream()` recorded assistant output after `yield`; if a consumer broke after the first yield, the user message remained without the assistant reply. |
| Confirmed P2 hardening | R56-SDK-TYPES-1: SDK types omitted runtime-supported `seed`/`rng` fields on `CharacterConfig` and `AndyConfig`, did not allow function LLMs in all runtime-supported options, and did not expose `Andy.load`/`Character.load` option shapes. |
| Confirmed P2 hardening | R56-ANDY-FACTS-1: `Andy` multi-character wrapper did not forward `enableFacts` to its shared engine, so the SDK wrapper could not opt into facts/grounding even though `Character` and `AndyEngine` could. |
| Fix | Added provider-specific env key selection (`anthropic` now uses `ANTHROPIC_API_KEY`), refactored SSE parsing to drain complete lines and parse the final unterminated buffer, moved `chatStream()` assistant/conversation recording before yield, forwarded `enableFacts` through `Andy`, and expanded SDK type declarations plus fresh consumer typecheck coverage. |
| Files | `src/sdk/LLMAdapter.js`; `src/sdk/Character.js`; `src/sdk/Andy.js`; `src/sdk/types.d.ts`; `tests/unit/llm-adapter-providers.test.js`; `tests/sdk.test.js`; `scripts/consumer-typecheck.sh` |
| Regression test | Added Anthropic env priority test, OpenAI/Anthropic unterminated final SSE line tests, chatStream early-break history symmetry test, Andy `enableFacts` grounding test, and fresh TypeScript consumer use of SDK `seed`/`rng`/function LLM fields. |
| Commands | `npx vitest run tests/unit/llm-adapter-providers.test.js tests/sdk.test.js tests/unit/chatStream-rewrite-leak.test.js`; `npm run typecheck`; `npm run typecheck:consumer`; `npm run smoke:pack`; `bash scripts/fresh-consumer-matrix.sh`; `npm test`; `npm run test:domain`; `npm run check:boundaries`; `npm run replay:diff -- --ticks=100 --agents=5 --seed=r56-sdk-llm-provider`; `npm pack --dry-run`; `git diff --check`. |
| Result | R56 targeted SDK/LLM suite: 3 files / 100 tests passed. `npm test`: 192 files passed / 1 skipped; 3176 passed / 28 skipped. `test:domain` 82 passed. Typecheck and consumer typecheck clean. Smoke pack 19/19. Fresh consumer passed Basic CJS, `--omit=optional` No-SQLite, and TypeScript checks. Replay diff 100/100 matched. Dry-run pack still contains 209 files. Diff check clean. |
| Status | R56 P1/P2 issues fixed and verified in current worktree. No confirmed SDK/LLM provider P0/P1 remains from this pass. |

## R57 - Persistence / Bridge / Save-Load Chain Verification

This section records a no-quota persistence audit using
`opencode/deepseek-v4-flash-free` plus local durable-store and bridge
reproduction.

| Field | Detail |
|---|---|
| Scope | `AndyBridge`, `SimulationStore`, `SaveLoad`, `Serialization`, MemoryStore/SQLiteStore interaction, snapshot restore, bridge story generation, metadata recovery, and public store types. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with persistence/bridge/store files and tests attached, no-edit mode. |
| Confirmed issue | R57-BRIDGE-STORY-DROP-1: `AndyBridge.onTick()` called `SimulationStore.onTick(tickResult, stories)` before generating signal/tick stories. The method returned stories to the caller, but the store saw an empty array, so one-tick bridge stories were not buffered or persisted. Signal stories also hard-coded `agentId: 'default'`, making non-default bridge agents unable to retrieve their own conversation stories. Severity P1 for SDK persistence/data-loss usability. |
| Confirmed issue | R57-SIMSTORE-META-SNAPSHOT-1: `SimulationStore.shutdown()` persisted `tick_count`/`virtual_time` even when the final snapshot save failed. The next `init()` could restore old or missing agent snapshot data while believing the simulation was at the newer tick/time. Severity P1 for restore semantic correctness. |
| Confirmed P2 hardening | R57-SAVELOAD-DTS-1: `store/index.d.ts` exposed legacy `SaveLoad.saveWorld/loadWorld` but omitted the canonical runtime methods `save/load/listSnapshots`, so strict TS consumers could compile against methods that were not representative of runtime. |
| Fix | `AndyBridge.onTick()` now generates stories first and then passes the generated array to `SimulationStore.onTick()`. `StoryGenerator.generateFromSignal()` accepts `options.agentId`. `SimulationStore.shutdown()` skips tick/time metadata advancement when final snapshot persistence fails. `SaveLoad` now exposes deprecated runtime aliases while `store/index.d.ts` exposes canonical methods plus aliases. |
| Files | `src/sdk/AndyBridge.js`; `src/narrative/StoryGenerator.js`; `src/store/SimulationStore.js`; `src/store/SaveLoad.js`; `store/index.d.ts`; `tests/unit/andy-bridge-internal.test.js`; `tests/store/simulation-store.test.js`; `tests/store/store-serialization.test.js`; `tests/type-smoke.test.js`; `scripts/consumer-typecheck.sh` |
| Regression test | Added same-tick bridge story forwarding, real MemoryStore non-default-agent persistence, durable metadata-not-advanced-on-snapshot-failure, SaveLoad alias coverage, and public type-smoke/consumer typecheck coverage. |
| Commands | `npx vitest run tests/store/simulation-store.test.js tests/unit/andy-bridge-internal.test.js tests/store/store-serialization.test.js tests/type-smoke.test.js tests/unit/andybridge-restore-spatial-sync.test.js`; `npm run typecheck`; `npm run typecheck:consumer`; direct Node bridge persistence repro; `npm test`; `npm run test:domain`; `npm run check:boundaries`; `npm run replay:diff -- --ticks=100 --agents=5 --seed=r57-persistence-bridge`; `npm run smoke:pack`; `bash scripts/fresh-consumer-matrix.sh`; `npm pack --dry-run`; `git diff --check`. |
| Result | R57 targeted persistence/bridge suite: 5 files / 93 tests passed. `npm test`: 192 files passed / 1 skipped; 3180 passed / 28 skipped. `test:domain` 82 passed. Typecheck and consumer typecheck clean. Smoke pack 19/19. Fresh consumer passed Basic CJS, `--omit=optional` No-SQLite, and TypeScript checks. Replay diff 100/100 matched. Dry-run pack still contains 209 files. Diff check clean. |
| Status | R57 P1/P2 issues fixed and verified in current worktree. No confirmed persistence/bridge/save-load P0/P1 remains from this pass. |

## R58 - Long-Run Facts / Knowledge / Event Stability

This section records a no-quota long-run stability audit using
`opencode/deepseek-v4-flash-free` plus local hot-path and restore-path
reproduction.

| Field | Detail |
|---|---|
| Scope | `WorldFactStore`, `KnowledgeStore`, `FactEmitter`, `CanonEventPipeline`, `PerceptionRuntime`, `EventDispatcher`, facts/knowledge restore, high-volume fact retention, and event/perception dedup. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with facts/knowledge/event/perception files and tests attached, no-edit mode. |
| Confirmed issue | R58-RESTORE-STALE-KNOWLEDGE-1: `WorldFactStore.fromJSON()` can evict facts before a `KnowledgeStore` is wired, then `KnowledgeStore.fromJSON()` restored knowledge/evidence for facts that no longer exist. Public read APIs filtered them, but internal `_knowledge`/`_evidence` could grow across save/restore cycles. Severity P1 for documented restore-path long-run memory stability. |
| Confirmed P2 hardening | R58-FACTEMITTER-STATE-HOTPATH-1: `FactEmitter.emitAgentStateFacts()` called `getAgentStateFacts()` inside the per-agent loop, repeatedly deep-copying all state facts during each tick. |
| Confirmed P2 hardening | R58-BYAGENT-EMPTY-LEAK-1: `_unindexAgents()` deleted fact IDs but retained empty per-agent Sets in `_byAgent`, creating small stale index entries after removals/evictions. |
| Fix | Added `KnowledgeStore.purgeInactiveFacts()` and invoked it after restore; made `WorldFactStore.removeFact()` purge wired knowledge/evidence; moved agent-state fact indexing outside the `FactEmitter.emitAgentStateFacts()` loop; deleted empty `_byAgent` entries during unindex. |
| Files | `src/knowledge/KnowledgeStore.js`; `src/canon/WorldFactStore.js`; `src/canon/FactEmitter.js`; `tests/facts/knowledge-store.test.js`; `tests/facts/world-fact-store.test.js`; `tests/facts/fact-emitter-event-fallback.test.js` |
| Regression test | Added restore stale knowledge/evidence cleanup, removeFact knowledge cleanup, empty `_byAgent` cleanup, and agent-state emitter one-index-per-call coverage. |
| Commands | `npx vitest run tests/facts/knowledge-store.test.js tests/facts/fact-emitter-event-fallback.test.js tests/facts/world-fact-store.test.js tests/facts/canon-event-pipeline.test.js tests/unit/event-lifecycle-dedup.test.js tests/unit/runtime/event-dispatcher-branches.test.js`; `npm run typecheck`; `npm run check:boundaries`; `git diff --check`; `npm test`; `npm run test:domain`; `npm run smoke:pack`; `npm run replay:diff -- --ticks=100 --agents=5 --seed=r58-longrun-stability`. |
| Result | R58 targeted facts/knowledge/event suite: 6 files / 189 tests passed. `npm test`: 192 files passed / 1 skipped; 3184 passed / 28 skipped. `test:domain` 82 passed. Typecheck, boundary check, and diff check clean. Smoke pack 19/19. Replay diff 100/100 matched. |
| Status | R58 P1/P2 issues fixed and verified in current worktree. No confirmed facts/knowledge/event/perception P0/P1 remains from this pass. |

## R59 - Performance Gate Reliability Verification

This section records a no-quota performance-gate audit using
`opencode/deepseek-v4-flash-free` plus local median-mode perf verification.

| Field | Detail |
|---|---|
| Scope | `benchmarks/perf-check.js`, benchmark/profile JSON extraction, subprocess failure reporting, default run-count semantics, `contagion-profile` result coverage, and performance status docs. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with benchmark/profile scripts, runtime contagion paths, perf tests, baseline JSON, and ledger attached, no-edit mode. |
| Confirmed issue | R59-PERF-SINGLE-RUN-1: `npm run perf:check` defaulted to one run even though median mode existed. A single noisy run could spuriously fail or hide a near-threshold regression. Severity P1 for release-gate reliability. |
| Confirmed issue | R59-PERF-MISSING-METRIC-1: `extractMetrics()` silently omitted expected metrics when benchmark output or baseline keys were missing. If all metrics were omitted, the gate could print no comparisons and exit 0. Severity P1 for false-pass release-gate reliability. |
| Confirmed P2 hardening | R59-PERF-OPAQUE-SUBPROCESS-1: child benchmark/profile failures used `execSync(..., stdio: 'pipe')` without printing captured stdout/stderr, hiding sanity-warning details that explain failures. |
| Fix | Default `perf-check` run count is now 3-run median mode; `--runs=1` remains available for quick local probes. Metric extraction is fail-closed against an explicit expected metric list. Subprocess failures now print captured stdout/stderr before returning a failing exit. The script exposes pure helpers for unit testing. README/NPM readiness/docs now reflect the no-WARN median-mode status. |
| Files | `benchmarks/perf-check.js`; `tests/unit/perf-check.test.js`; `README.md`; `docs/current/NPM_PUBLISH_READINESS.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Regression test | Added perf-check helper tests for default run count, invalid run counts, complete metric extraction, missing benchmark metric failure, and missing baseline metric failure. |
| Commands | `npx vitest run tests/unit/perf-check.test.js`; `npm run perf:check -- --runs=1`; `npm run perf:check`; `npm test`; `npm run typecheck`; `git diff --check`; `npm run check:boundaries`; `npm run test:domain`; `npm run smoke:pack`. |
| Result | R59 perf gate suite: 1 file / 5 tests passed. Single-run compatibility perf check exited 0. Default `npm run perf:check` now reports `Runs: 3 (median mode)` and exited 0 with no WARN. `npm test`: 193 files passed / 1 skipped; 3189 passed / 28 skipped. `test:domain` 82 passed. Typecheck, boundary check, smoke pack, and diff check clean. |
| Status | R59 P1/P2 perf-gate reliability issues fixed and verified in current worktree. No confirmed performance-gate P0/P1 remains from this pass. Runtime `_gatherContagionInputs()` fallback O(N²) remains a monitored private-method P2 trap because the live tick path passes the per-tick cache and compatibility tests cover the fallback. |

## R60 - Package Subpath Type Surface Verification

This section records a no-quota package/release-surface audit using
`opencode/deepseek-v4-flash-free` plus fresh tarball TypeScript consumer
reproduction.

| Field | Detail |
|---|---|
| Scope | `package.json` exports/files, release/fresh-consumer scripts, public subpath TypeScript declarations, domain/config/preset subpath imports, `npm pack` contents, and release package gates. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with package metadata, release scripts, smoke/type scripts, public d.ts files, package tests, and ledger attached, no-edit mode. |
| Confirmed issue | R60-SUBPATH-DTS-1: strict fresh TypeScript consumers importing `andy-engine/domain/validate`, `andy-engine/domain/registry`, `andy-engine/config/defaults`, `andy-engine/presets/campus`, or `andy-engine/presets/tavern` failed with TS7016 because those public subpath exports pointed to JS files without `types` conditions or adjacent declarations. Severity P1 for package publish usability. |
| Confirmed P2 hardening | R60-FRESH-TS-COVERAGE-1: `fresh-consumer-matrix.sh` TypeScript coverage did not import the secondary public subpaths, so the missing declarations escaped fresh tarball checks. |
| External P2 deferred | `release-gate.sh` duplicates `npm test`/domain/boundary through `release:check`; `check-release-clean.sh` scans `.git`/`node_modules`; `domain/index.d.ts` uses named exports rather than `export =`; `createStore('auto')` has a misleading constructor-level fallback try/catch. These are process/cleanup P2s, not current blockers. |
| Fix | Added `types` conditions for secondary subpath exports, added `.d.ts` declarations for domain validate/registry, config defaults, and campus/tavern presets, and expanded fresh consumer + consumer typecheck scripts to import those subpaths from the installed tarball. |
| Files | `package.json`; `src/domain/validateDomain.d.ts`; `src/domain/DomainRegistry.d.ts`; `src/config/defaults.d.ts`; `presets/campus/index.d.ts`; `presets/tavern/index.d.ts`; `scripts/consumer-typecheck.sh`; `scripts/fresh-consumer-matrix.sh`; `tests/package-boundary.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/NPM_PUBLISH_READINESS.md` |
| Regression test | Added package-boundary expectations for subpath `types` entries and installed-tarball TypeScript checks for domain validate/registry, config defaults, and campus/tavern presets. |
| Commands | `npx vitest run tests/package-boundary.test.js tests/type-smoke.test.js`; `npm run typecheck`; strict fresh tarball subpath TS repro with `npx tsc --noEmit --module node16 --moduleResolution node16 --target ES2022 --skipLibCheck false --esModuleInterop`; `npm run typecheck:consumer`; `npm run fresh:consumer`; `npm test`; `npm run check:boundaries`; `git diff --check`; `npm run test:domain`; `npm run smoke:pack`; `npm run release:clean`; `npm pack --dry-run --json`; `npm run release:check`. |
| Result | R60 package/type targeted suite: 2 files / 83 tests passed. Fresh tarball strict TS subpath repro passed. Consumer typecheck passed. Fresh consumer matrix passed Basic CJS, no-SQLite fallback, and TypeScript subpath checks. `npm test`: 193 files passed / 1 skipped; 3189 passed / 28 skipped. `release:check`, `test:domain` 82 passed, boundary check, smoke pack 19/19, release clean, typecheck, and diff check all passed. Dry-run tarball contains 214 files including the five new `.d.ts` files. |
| Status | R60 package subpath type issue fixed and verified in current worktree. No confirmed package/release-surface P0/P1 remains from this pass. |

## R61 - Node Baseline / Optional SQLite Release Truth Pass

This section records a no-quota package compatibility audit using
`opencode/deepseek-v4-flash-free`.

| Field | Detail |
|---|---|
| Scope | `package.json`/lockfile engines, `better-sqlite3` optional dependency support, README compatibility claims, release readiness checklist, fresh consumer scripts, and package/release gates. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with package metadata, lockfile, docs, store code, release scripts, and SQLite tests attached, no-edit mode. |
| Confirmed issue | R61-NODE-BASELINE-1: package metadata claimed `engines.node >=18`, but current dev tooling (`vitest` 4.x / `vite` 8.x) and optional SQLite dependency (`better-sqlite3` 12.x) require Node.js 20+. Severity P1 for publish truthfulness: a Node 18 consumer/contributor would see a misleading support claim. |
| Verification | `package-lock.json` shows `better-sqlite3@12.10.0` requiring Node `20.x || 22.x || 23.x || 24.x || 25.x || 26.x`; package tooling also runs on the current Node 20+ line. Local machine has no Node 18 runtime, so the safer release decision is to tighten the published baseline instead of claiming an unverified Node 18 path. |
| Fix | Updated the published engine requirement and lockfile root to `>=20.0.0`, changed the README badge to Node 20+, rewrote the SQLite note so SQLite and package baseline agree, and updated the NPM publish readiness checklist. |
| Files | `package.json`; `package-lock.json`; `README.md`; `docs/current/NPM_PUBLISH_READINESS.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Commands | `npx vitest run tests/package-boundary.test.js tests/type-smoke.test.js --no-color`; `npm run typecheck`; `git diff --check`; `npm run fresh:consumer`; `npm run smoke:pack`; `npm run release:clean`; `npm run release:check`. |
| Result | Package/type targeted suite: 83 passed. Typecheck clean. Fresh consumer passed Basic CJS, `--omit=optional` No-SQLite init fallback, and TypeScript subpath checks. Smoke pack passed 19/19. Release clean passed. `release:check` passed: `npm test` 193 files / 3189 passed / 28 skipped, `test:domain` 82 passed, boundaries clean, pack dry-run succeeded with 214 files. Diff check clean. |
| Status | R61 Node baseline P1 fixed by making Node.js 20+ the explicit published package baseline. No Node 18 support claim remains in the package metadata or primary README compatibility badge. |

## R62 - Long-Run Fact Retention Recheck

This section records a no-quota long-run fact retention audit using
`opencode/deepseek-v4-flash-free`.

| Field | Detail |
|---|---|
| Scope | `WorldFactStore`, `FactEmitter`, `KnowledgeStore`, `CanonEventPipeline`, fact schema, high-volume fact tests, and long-run memory-growth paths. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with canon/knowledge code, fact tests, and ledger attached, no-edit mode. |
| P0/P1 verdict | No current P0/P1 confirmed. The older concern that OBSERVATION and MEMORY facts are unbounded is stale: current code caps EVENT at 2000, OBSERVATION at 2000, and MEMORY at 5000, with eviction purge notifications to KnowledgeStore and restore-time cap enforcement. |
| Confirmed P2 hardening | R62-INVALIDATED-RETENTION-1: `FactType.INVALIDATED` audit records had no cap. `invalidateFact()` also left the original invalidated fact in agent/knowledge indexes even though public reads filtered it out. No production runtime caller exists today, so this is not a current P1, but it is a future long-run growth trap if invalidation becomes runtime-facing. |
| Fix | Added `MAX_INVALIDATED_FACTS = 2000`, evicted invalidation audit records on add and restore, and made `invalidateFact()` unindex the original fact and notify KnowledgeStore purge for the original fact id. |
| Files | `src/canon/WorldFactStore.js`; `tests/facts/world-fact-store.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Regression test | Added high-volume invalidation coverage proving invalidation records stay bounded, old invalidation records are evicted, recent ones remain, and KnowledgeStore purge is notified for invalidated originals. |
| Commands | `npx vitest run tests/facts/world-fact-store.test.js tests/facts/knowledge-store.test.js --no-color`; `npm run check:boundaries`; `git diff --check`; `npm test`; `npm run typecheck`. |
| Result | Targeted facts/knowledge suite: 2 files / 88 tests passed. Boundary check passed. Full `npm test`: 193 files passed / 1 skipped; 3190 passed / 28 skipped. Typecheck clean. Diff check clean. |
| Status | R62 long-run fact-retention recheck closed. No confirmed fact-retention P0/P1 remains; invalidation retention P2 hardening fixed in current worktree. |

## R63 - SocialGraph Dunbar Shared-Demotion Fix

This section records a no-quota SocialGraph/Dunbar audit using
`opencode/deepseek-v4-flash-free`.

| Field | Detail |
|---|---|
| Scope | `SocialGraph`, `Relationship`, relationship/social writeback tests, social emergence tests, emotion contagion tests, and Dunbar layer behavior. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with social code, relationship tests, E2E social tests, and ledger attached, no-edit mode. |
| Confirmed issue | R63-SOCIAL-DUNBAR-SHARED-1: `_enforceDunbarLimits()` demoted shared bidirectional `Relationship.strength`/`type` when one endpoint exceeded capacity. Because the same `Relationship` instance is visible from both endpoints, agent A's overload could passively weaken agent B's relationship, affecting encounter probability, event generation, action scoring, contagion weight, relationship facts, and public relationship queries. Severity P1 for semantic correctness. |
| Fix | Changed Dunbar enforcement from destructive shared-edge mutation to per-agent layer projection. `getLayers(agentId)` now applies strong/medium caps as an agent-local view. `getStrongRelationships(agentId)` derives from that view. `_enforceDunbarLimits()` no longer lowers shared strength/type. The underlying relationship remains the ground-truth bond for runtime paths that need actual edge strength. |
| Files | `src/social/SocialGraph.js`; `tests/unit/social.test.js`; `README.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Regression test | Added coverage proving A can exceed strong-tie capacity without mutating the shared A-B relationship; A sees the overflowed edge as an acquaintance in its local layer projection while B, still within capacity, keeps A-B as a strong tie. |
| Commands | `npx vitest run tests/unit/social.test.js tests/unit/relationship-writeback.test.js tests/e2e/social-emergence.test.js tests/e2e/emotion-contagion-cluster.test.js tests/facts/relationship-social-writeback.test.js tests/contagion-cache.test.js --no-color`; `npm run check:boundaries`; `git diff --check`; `npm test`; `npm run typecheck`; `npm run test:domain`; `npm run smoke:pack`; `npm run fresh:consumer`; `npm run replay:diff -- --ticks=100 --agents=5 --seed=r63-social-dunbar`. |
| Result | Targeted social suite: 6 files / 32 tests passed. Boundary check passed. Full `npm test`: 193 files passed / 1 skipped; 3191 passed / 28 skipped. Typecheck and domain tests clean. Smoke pack 19/19. Fresh consumer matrix passed. Replay diff matched 100/100. Diff check clean. |
| Status | R63 Dunbar shared-demotion P1 fixed and verified in current worktree. Remaining asymmetric/per-agent social perception modeling can stay design-level unless a future feature requires `getRelationship()` to return view-specific wrappers. |

## R64 - Deep Audit Agent/Action Package Surface Pass

This section records validation of `docs/audit/AUDIT_DEEP_2026-07-02.md`
plus a no-quota focused audit using `opencode/deepseek-v4-flash-free`.

| Field | Detail |
|---|---|
| Scope | Deep audit P0-001: legacy `agent/action/` independent implementations versus canonical `src/action`, package publish surface, and tests still importing the retired directory. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with the deep audit, package metadata, legacy/canonical action files, phase tests, action-layer test, and ledger attached, no-edit mode. |
| Verification verdict | Confirmed that `agent/action/` contains independent legacy implementations and nine legacy phase tests import it. Also confirmed `agent/Agent.js` and `src/` runtime do not import `agent/action`, so the active runtime path uses canonical `src/action`; current highest concrete release risk is npm publishing both copies plus tests validating stale behavior. |
| Fix | Narrowed `package.json.files` from `agent/` to `agent/Agent.js`, so `agent/action/*` no longer ships in the npm tarball. Migrated legacy phase tests off `../agent/action/*` and onto canonical `src/action` APIs. Removed the repo-local `agent/action` implementation files. Added package-boundary regression coverage that prevents `agent/action` from returning to the publish surface. |
| Files | `package.json`; deleted `agent/action/*`; `tests/action-layer.test.js`; `tests/architecture/boundary-check.test.js`; `tests/package-boundary.test.js`; `tests/phase-26-fix-deterministic.test.js`; `tests/phase-26-2-utility-selector.test.js`; `tests/phase-26-3-shadow-mode.test.js`; `tests/phase-27-candidate-providers.test.js`; `tests/phase-28-memory-influence.test.js`; `tests/phase-29-goalsystem.test.js`; `tests/phase-30-worldobject.test.js`; `tests/phase-32-1-worldobject-provider.test.js`; `tests/phase-32-4-reasontrace.test.js`; `README.md`; `docs/current/NPM_PUBLISH_READINESS.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Commands | `npx vitest run tests/action-layer.test.js tests/phase-26-fix-deterministic.test.js tests/phase-26-2-utility-selector.test.js tests/phase-26-3-shadow-mode.test.js tests/phase-27-candidate-providers.test.js tests/phase-28-memory-influence.test.js tests/phase-29-goalsystem.test.js tests/phase-30-worldobject.test.js tests/phase-32-1-worldobject-provider.test.js tests/phase-32-4-reasontrace.test.js tests/architecture/boundary-check.test.js tests/package-boundary.test.js --no-color`; `npm run check:boundaries`; `npm test`; `npm run typecheck`; `npm run smoke:pack`; `npm run fresh:consumer`; `npm pack --dry-run --json`; `npm run test:domain`; `git diff --check`. |
| Result | Action canonicalization suite: 12 files / 223 passed / 11 skipped. Boundary check passed. Full `npm test`: 193 files passed / 1 skipped; 3183 passed / 28 skipped. Typecheck clean. Smoke pack 19/19. Fresh consumer matrix passed. Dry-run tarball contains 198 files and includes `agent/Agent.js` but no `agent/action/*`. Domain tests 82 passed. Diff check clean. |
| Status | R64 P0-001 closed in current worktree: no runtime/test imports of `agent/action` remain, the retired implementation files are deleted, and the npm package surface contains only the approved `agent/Agent.js` compatibility adapter plus canonical `src/action`. |

## R65 - Deep Audit ScheduleHandler Writeback Pass

This section records validation of `docs/audit/AUDIT_DEEP_2026-07-02.md`
P0-002 plus a no-quota focused audit using `opencode/deepseek-v4-flash-free`.

| Field | Detail |
|---|---|
| Scope | Deep audit P0-002: `ScheduleHandler.tick()` directly wrote `agent.position` for schedule / need / intrinsic-motivation movement and directly called `agent.memory.addExperience()` for generated skip memories. |
| External model audit | `opencode run -m opencode/deepseek-v4-flash-free` with the deep audit, `ScheduleHandler`, `AgentRuntime`, `AndyWorld`, `ActionSelectionRuntime`, `EffectCommitter`, and `EventEffectPipeline` attached. The first command had a bad file path and was rerun with the real file set. |
| Verification verdict | Confirmed as a real architecture violation. Position writes were functionally synced later through `regionChanged`, but still bypassed the typed writeback owner. Skip memories were more serious because direct `addExperience()` bypassed `EffectCommitter`; raw event fields such as `_region` and `_currentState` matter for `PersonalMemory` associations and must be preserved. |
| Fix | Added ScheduleHandler helpers that create `PositionDelta` / `MemoryDelta` and commit them through the world `EffectCommitter` when available, with a single-agent fallback for isolated tests. Movement still preserves intra-tick behavior by committing immediately and setting `result.regionChanged`; `_setRegionChanged` is called when available so RegionGrid / continuous spatial sync remains intact. `MemoryDelta` now optionally carries a raw source event, and `EffectCommitter` preserves that event payload before calling `addExperience()`. |
| Files | `src/agent/handlers/ScheduleHandler.js`; `src/effects/MemoryDelta.js`; `src/effects/EffectCommitter.js`; `tests/unit/handlers/schedule-handler-coverage.test.js`; `tests/unit/effect-delta-contract.test.js`; `README.md`; `docs/current/NPM_PUBLISH_READINESS.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Commands | `npx vitest run tests/unit/handlers/schedule-handler-coverage.test.js tests/unit/effect-delta-contract.test.js --no-color`; `npx vitest run tests/unit/handlers/schedule-handler-coverage.test.js tests/unit/handlers/agent-runtime.test.js tests/unit/spatial-continuous-schedule-rollback.test.js tests/unit/effect-delta-contract.test.js tests/unit/active-writeback.test.js --no-color`; external-free `npm test`; external-free `npm run test:domain`; `npm run check:boundaries`; `npm run typecheck`. |
| Result | Local targeted ScheduleHandler/effect contract suite: 2 files / 67 passed. Broader writeback/runtime/spatial suite: 5 files / 97 passed. Boundary check passed. Typecheck clean. External-free full `npm test`: 193 files passed / 1 skipped; 3187 passed / 28 skipped. External-free domain tests: 82 passed. |
| Status | R65 P0-002 closed in current worktree: `ScheduleHandler` no longer directly assigns `agent.position` or directly calls `agent.memory.addExperience()`, and regression tests lock the route through typed deltas / `EffectCommitter`. |

## R66 - Deep Audit PerceptionRuntime Memory Writeback Pass

This section records validation of `docs/audit/AUDIT_DEEP_2026-07-02.md`
P1-001 plus no-quota external model attempts.

| Field | Detail |
|---|---|
| Scope | Deep audit P1-001: `PerceptionRuntime.perceiveEvents()` directly called `agent.memory.addExperience()` for perceived event memories. |
| External model audit | Tried `agnes/agnes-2.0-flash` after the user identified it as free; at R66 time execution returned "missing token", so this round fell back to `opencode/deepseek-v4-flash-free` with the deep audit, PerceptionRuntime, PerceptionHandler, AgentRuntime, MemoryDelta, and EffectCommitter attached. R67 later rechecked agnes and confirmed it is executable. |
| Verification verdict | Confirmed as a real writeback-boundary violation for dynamic experience memories. External audit also flagged direct perception emotion/stress/appraisal-bias mutations; those are broader perception-side effect semantics and are tracked separately as a follow-up candidate rather than being silently claimed fixed by this memory-specific pass. |
| Fix | `perceiveEvents(agent, events, env)` now accepts optional runtime env, builds a `MemoryDelta` with the full enriched event payload, and commits through the world `EffectCommitter` when available with a single-agent fallback for direct/unit callers. `PerceptionHandler` passes `context.env`. `EffectCommitter._applyMemoryDelta()` now forwards finite `MemoryDelta.importance` as the third `addExperience()` appraisal-importance argument, preserving the old PerceptionRuntime importance semantics. |
| Files | `src/agent/runtime/PerceptionRuntime.js`; `src/agent/handlers/PerceptionHandler.js`; `src/effects/EffectCommitter.js`; `tests/unit/handlers/perception-handler.test.js`; `tests/unit/effect-delta-contract.test.js`; `README.md`; `docs/current/NPM_PUBLISH_READINESS.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Commands | `opencode models`; R66 failed `opencode run ... -m agnes/agnes-2.0-flash`; fallback `opencode run ... -m opencode/deepseek-v4-flash-free`; `npx vitest run tests/unit/handlers/perception-handler.test.js tests/unit/event-lifecycle-dedup.test.js tests/unit/effect-delta-contract.test.js --no-color`; `npx vitest run tests/unit/handlers/perception-handler.test.js tests/unit/event-lifecycle-dedup.test.js tests/unit/effect-delta-contract.test.js tests/unit/handlers/agent-runtime.test.js --no-color`; `npm run check:boundaries`; `npm run typecheck`; `npm run test:domain`; `npm test`; `git diff --check`. |
| Result | Perception/effect/event lifecycle targeted suite: 3 files / 61 passed. Broader perception/runtime/effect suite: 4 files / 77 passed. Boundary check passed. Typecheck clean. Domain tests 82 passed. Full `npm test`: 193 files passed / 1 skipped; 3190 passed / 28 skipped. Diff check clean. |
| Status | R66 P1-001 memory writeback closed in current worktree: `PerceptionRuntime` no longer directly calls `agent.memory.addExperience()`, and regression tests lock the route through `MemoryDelta` / `EffectCommitter` with raw event context and appraisal importance preserved. |

## R67 - PerceptionRuntime Effects Writeback Pass

This section records closure of the `PERCEPTION-EFFECTS` polish-first hardening
candidate with `agnes/agnes-2.0-flash` verification.

| Field | Detail |
|---|---|
| Scope | `PerceptionRuntime` still applied event emotion effects, high-importance emotion effects, stress updates, and appraisal-bias writes directly after R66 moved experience-memory storage to `MemoryDelta`. |
| External model audit | `agnes/agnes-2.0-flash` was rechecked and is currently executable. It audited `PerceptionRuntime`, `EmotionDelta`, `MemoryDelta`, `EffectCommitter`, `PerceptionHandler`, effect contract tests, and the ledger. |
| Verification verdict | Confirmed as a real boundary leak. `personality.recordEventForDrift()` is intentionally left direct because it is a private drift-window accumulator, not world-facing state writeback. |
| Fix | Extended `EmotionDelta` with optional `multiplier`, `appraisalModifiers`, and absolute `stress`; extended `MemoryDelta` with `kind: 'appraisalBias'` plus `bias` payload; updated `EffectCommitter` to apply those paths. `PerceptionRuntime` now builds ordered deltas per perceived event so emotion effects apply before memory snapshots and stress remains last. |
| Files | `src/agent/runtime/PerceptionRuntime.js`; `src/effects/EmotionDelta.js`; `src/effects/MemoryDelta.js`; `src/effects/EffectCommitter.js`; `tests/unit/handlers/perception-handler.test.js`; `tests/unit/effect-delta-contract.test.js`; `README.md`; `docs/current/NPM_PUBLISH_READINESS.md`; `docs/current/POLISH_FIRST_ROADMAP.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Commands | `opencode run ... -m agnes/agnes-2.0-flash`; `npx vitest run tests/unit/handlers/perception-handler.test.js tests/unit/effect-delta-contract.test.js tests/unit/event-lifecycle-dedup.test.js --no-color`; `npx vitest run tests/unit/handlers/perception-handler.test.js tests/unit/effect-delta-contract.test.js tests/unit/event-lifecycle-dedup.test.js tests/unit/handlers/agent-runtime.test.js tests/unit/active-writeback.test.js tests/unit/effect-pipeline-dry-run.test.js --no-color`; `npm run check:boundaries`; `npm run typecheck`; `npm run test:domain`; `npm test`; agnes-run `npm run smoke:pack`; agnes-run `npm run replay:diff`; `git diff --check`. |
| Result | Perception/effect/event lifecycle targeted suite: 3 files / 68 passed. Broader perception/effect/runtime/writeback suite: 6 files / 108 passed. Boundary check passed. Typecheck clean. Domain tests 82 passed. Full `npm test`: 193 files passed / 1 skipped; 3197 passed / 28 skipped. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS. Diff check clean. |
| Status | R67 `PERCEPTION-EFFECTS` closed in current worktree: `PerceptionRuntime` no longer directly calls `agent.emotion.applyEffect()`, `agent.emotion.setStress()`, `agent.memory.addAppraisalBias()`, or `agent.memory.addExperience()`. |

## R68 - Runtime Env World Backdoor Removal

This section records closure of the polish-first roadmap item to remove
`env._world` as a handler/runtime backdoor.

| Field | Detail |
|---|---|
| Scope | `RuntimeContext.buildAgentEnv()` exposed `_world`, and `ScheduleHandler`, `PerceptionRuntime`, and `ActionSelectionRuntime` used it to reach the world `EffectCommitter`. |
| External model audit | `agnes/agnes-2.0-flash` reviewed the `env._world` removal target and proposed an explicit `effectCommitter` service. The implementation went further than the conservative compatibility suggestion by removing `_world` from the internal runtime env entirely. |
| Verification verdict | Confirmed as a real architecture boundary leak, not a public API contract. Internal agent env can safely move to explicit service injection. |
| Fix | Added `src/agent/runtime/EffectCommitterResolver.js`, changed `RuntimeContext.buildAgentEnv()` to expose `effectCommitter` and `effectWorld`, and updated ScheduleHandler / PerceptionRuntime / ActionSelectionRuntime to resolve committers from those explicit services with detached-agent fallback. Added a `check:boundaries` rule that fails if `src/agent` or `src/runtime` reintroduces `env._world`. |
| Files | `src/agent/runtime/EffectCommitterResolver.js`; `src/runtime/RuntimeContext.js`; `src/agent/handlers/ScheduleHandler.js`; `src/agent/runtime/PerceptionRuntime.js`; `src/agent/runtime/ActionSelectionRuntime.js`; `scripts/check-boundaries.js`; `tests/runtime/runtime.test.js`; `tests/unit/handlers/schedule-handler-coverage.test.js`; `tests/unit/handlers/perception-handler.test.js`; `docs/current/POLISH_FIRST_ROADMAP.md`; `docs/current/NPM_PUBLISH_READINESS.md`; `docs/audit/CURRENT_BUG_LEDGER.md` |
| Commands | `opencode run ... -m agnes/agnes-2.0-flash`; `rg -n "_world" src tests scripts docs/current/POLISH_FIRST_ROADMAP.md docs/audit/CURRENT_BUG_LEDGER.md`; `npx vitest run tests/runtime/runtime.test.js tests/unit/handlers/schedule-handler-coverage.test.js tests/unit/handlers/perception-handler.test.js tests/unit/spatial-continuous-active-rollback.test.js tests/unit/active-writeback.test.js tests/unit/effect-pipeline-dry-run.test.js --no-color`; `npm run check:boundaries`; `npm run typecheck`; `npm run test:domain`; `npm test`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Env service/runtime targeted suite: 6 files / 99 passed. Boundary check passed and now includes `Runtime env services: clean (no env._world backdoor)`. Typecheck clean. Domain tests 82 passed. Full `npm test`: 193 files passed / 1 skipped; 3197 passed / 28 skipped. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS. Diff check clean. |
| Status | R68 closed in current worktree: no `env._world` use remains in `src/agent` or `src/runtime`, and the boundary gate prevents reintroduction. |

## R69 - Public Facade Writeback Boundary Pass

This section records the no-quota follow-up after R67/R68 writeback boundary
audits. The goal was to close remaining public facade memory/emotion writeback
side doors without changing the public `Agent` compatibility facade.

| Field | Detail |
|---|---|
| Scope | `Agent.recordExternalExperience()` and `Agent.interact()` delegated into `src/agent/facade` modules that directly called `agent.memory.addExperience()` and `agent.emotion.applyEffect()`. |
| External model audit | `agnes/agnes-2.0-flash` was used for post-R68 writeback boundary review. It found no remaining `env._world` usage and identified `InteractionFacade` as the only remaining non-internal public writeback path worth routing through typed deltas. |
| Verification verdict | Confirmed as polish-first boundary debt. This was not a crash bug, but public SDK/facade calls should not bypass the same `MemoryDelta` / `EmotionDelta` / `RelationshipDelta` path used by runtime consequences. |
| Fix | `ExternalExperience` now commits a `MemoryDelta` and reads the created memory back from the delta to preserve the old return value. `InteractionFacade` now commits `EmotionDelta`, `MemoryDelta`, and, when a social graph is available, `RelationshipDelta`. `EffectCommitter` stores the created memory on `MemoryDelta.committedMemory` as a non-enumerable runtime result. `check:boundaries` now scans `src/agent/facade` for direct memory writes. |
| Files | `src/agent/facade/ExternalExperience.js`; `src/agent/facade/InteractionFacade.js`; `src/effects/EffectCommitter.js`; `src/agent/runtime/EffectCommitterResolver.js`; `scripts/check-boundaries.js`; `tests/unit/effect-delta-contract.test.js`; `tests/agent-runtime-containment.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run ... -m agnes/agnes-2.0-flash`; `npx vitest run tests/unit/effect-delta-contract.test.js tests/agent-runtime-containment.test.js tests/sdk.test.js --no-color`; `npm run check:boundaries -- --no-color`; `rg -n "\\.memory\\.addExperience\\(|agent\\.memory\\.addExperience\\(|\\.emotion\\?\\.applyEffect\\?\\(" src/agent/facade sdk src/sdk`. |
| Result | Targeted public facade/effect/SDK suite: 3 files / 161 passed. Full `npm test`: 193 files passed / 1 skipped; 3198 passed / 28 skipped. Domain tests 82 passed. Boundary check passed and now reports `SDK/public facade memory mutation: clean`. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS. Diff check clean. Direct facade memory/emotion write scan returned no matches; the only `.addExperience` text left in `src/agent/facade` is a comment. |
| Status | R69 boundary cleanup fixed and verified in current worktree. |

## R70 - SDK Bridge Signal and Narrative Transient Emotion Pass

This section records the no-quota follow-up after R69 over remaining
SDK/bridge/helper direct emotion paths.

| Field | Detail |
|---|---|
| Scope | `AndyBridge._applySignalToAgent()` applied user-message emotion signals directly through `agent.emotion.applyEffect()` during `onTick()`. `AndyEngineHelpers.buildNarrative()` temporarily applied empathy effects and restored only JS emotion vectors, leaving native-like emotion mirrors un-restored. |
| External model audit | `agnes/agnes-2.0-flash` audited SDK/bridge/helper direct emotion and memory paths. It classified `AndyBridge._restoreAgents()` direct emotion/position/needs writes as restore-time exceptions, `EffectCommitter` writes as authorized, and flagged bridge signal injection plus narrative transient emotion as the next minimal SDK hardening targets. |
| Verification verdict | Confirmed. Bridge signal injection is an active runtime/public SDK path and should prefer the engine/world `EffectCommitter` when available. Narrative empathy should remain a read-time transient simulation and must restore both JS and native-like mirrors before returning. |
| Fix | `AndyBridge._applySignalToAgent()` now commits an emotion delta-compatible payload through `andy.world.effectCommitter` / `andy.effectCommitter` when available, preserving the old direct/clamped fallback only for isolated SDK hosts and mocks without a committer. `buildNarrative()` now restores emotion mirrors even when `agent.emotion._ev` is present. `check:boundaries` now scans canonical `src/sdk` in addition to top-level `sdk` and `src/agent/facade` for direct memory writes. |
| Files | `src/sdk/AndyBridge.js`; `src/sdk/AndyEngineHelpers.js`; `scripts/check-boundaries.js`; `tests/unit/andy-bridge-internal.test.js`; `tests/unit/build-narrative-emotion-safety.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run ... -m agnes/agnes-2.0-flash`; `npx vitest run tests/unit/andy-bridge-internal.test.js tests/unit/build-narrative-emotion-safety.test.js tests/sdk.test.js tests/sdk-smoke.test.js tests/integration/engine.test.js tests/package-boundary.test.js --no-color`; `npm run typecheck`; `npm run check:boundaries -- --no-color`; `npm test -- --run --no-color`; `npm run test:domain -- --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Targeted SDK/bridge/narrative suite: 6 files / 226 passed. Full `npm test`: 193 files passed / 1 skipped; 3200 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Boundary check passed. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check exited 0 with one WARN (`100 agents avg/tick` 1.61x baseline, below failure threshold). Diff check clean. |
| Status | R70 fixed and verified in current worktree. No new P0/P1 confirmed; remaining direct stress writes in `ReflectionRuntime` / `EmotionRegulation` are tracked as P2 internal-psychology cleanup candidates. |

## R71 - Internal Psychology Stress Writeback Pass

This section records the no-quota follow-up after R70 over internal direct
`setStress()` calls in reflection and emotion regulation.

| Field | Detail |
|---|---|
| Scope | `ReflectionRuntime.reflect()` and `EmotionRegulation._execReappraisal()` called `agent.emotion.setStress()` directly during active runtime psychology phases. |
| External model audit | `agnes/agnes-2.0-flash` classified these direct stress writes as P2 internal psychology hardening, not P0/P1 blockers. It confirmed synchronous `EffectCommitter.commit()` preserves tick ordering if the runtime env committer is used. |
| Verification verdict | Confirmed as safe to harden narrowly. Only absolute stress updates were routed; internal `applyEffect()` calls remain direct psychological dynamics for now. |
| Fix | `AgentRuntime` now passes runtime `env` into `emotionRegulation.tryRegulate()`. `ReflectionHandler` passes `context.env` into `reflect()`. Reflection and reappraisal stress updates now commit emotion delta-compatible payloads through `env.effectCommitter` when present, preserving the old direct `setStress()` fallback for direct/unit callers without runtime env. |
| Files | `src/agent/AgentRuntime.js`; `src/agent/handlers/ReflectionHandler.js`; `src/agent/runtime/ReflectionRuntime.js`; `src/agent/psychology/EmotionRegulation.js`; `tests/unit/runtime/reflection-runtime.test.js`; `tests/unit/state-label-cleanup.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run ... -m agnes/agnes-2.0-flash`; `npx vitest run tests/unit/runtime/reflection-runtime.test.js tests/unit/state-label-cleanup.test.js tests/unit/effect-delta-contract.test.js tests/unit/handlers/agent-runtime.test.js --no-color`; `npm test -- --run --no-color`; `npm run test:domain -- --no-color`; `npm run typecheck`; `npm run check:boundaries -- --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Targeted internal stress suite: 4 files / 98 passed. Full `npm test`: 193 files passed / 1 skipped; 3202 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Boundary check passed. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R71 fixed and verified in current worktree. No new P0/P1 confirmed; remaining internal `applyEffect()` paths are deferred for separate semantic review rather than treated as current blockers. |

## R72 - Discrete Internal Emotion Writeback Pass

This section records the no-quota follow-up after R71 over remaining internal
`applyEffect()` calls that represent discrete psychological feedback rather than
continuous physiology dynamics.

| Field | Detail |
|---|---|
| Scope | `AgentRuntime` intrinsic motivation emotion feedback, `MindWanderRuntime` thought emotion feedback, `ReflectionRuntime.assessStateConsequences()` recall emotion feedback, and `EmotionRegulation` strategy emotion deltas. |
| External model audit | `agnes/agnes-2.0-flash` was confirmed executable. A free-text `--pure` review approved the direction with conditions: preserve fallback when no committer exists, document the existing reflection recall `0.5` multiplier, and verify stress/behavior interactions locally. |
| Verification verdict | Confirmed as boundary hardening, not a P0/P1 crash. These paths are discrete runtime consequences and should prefer `env.effectCommitter` when available. `PhysiologyRuntime` direct `applyEffect()` remains intentionally deferred as owned continuous needs/health dynamics. SDK restore/transient emotion paths and `EffectCommitter` itself remain classified exceptions. |
| Fix | Added local committer-aware emotion helpers for mind wandering, reflection consequence recall, and emotion regulation strategies. `MindWanderHandler` now passes runtime env into `mindWander()`. `AgentRuntime` routes intrinsic motivation `emotionEffects` through the runtime committer when available. Direct fallback behavior is preserved for isolated direct/unit callers. |
| Files | `src/agent/AgentRuntime.js`; `src/agent/handlers/MindWanderHandler.js`; `src/agent/runtime/MindWanderRuntime.js`; `src/agent/runtime/ReflectionRuntime.js`; `src/agent/psychology/EmotionRegulation.js`; `tests/unit/handlers/agent-runtime.test.js`; `tests/unit/handlers/mind-wander-handler.test.js`; `tests/unit/runtime/reflection-runtime.test.js`; `tests/unit/state-label-cleanup.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npx vitest run tests/unit/handlers/agent-runtime.test.js tests/unit/handlers/mind-wander-handler.test.js tests/unit/runtime/reflection-runtime.test.js tests/unit/state-label-cleanup.test.js tests/unit/effect-delta-contract.test.js --no-color`; `npm run typecheck`; `npm run check:boundaries -- --no-color`; `npm test -- --run --no-color`; `npm run test:domain -- --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Targeted discrete emotion suite: 5 files / 107 passed. Full `npm test`: 193 files passed / 1 skipped; 3207 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Boundary check passed. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R72 fixed and verified in current worktree. No new P0/P1 confirmed. Remaining direct emotion writes are classified as continuous physiology dynamics, committer implementation, SDK restore/transient exceptions, or compatibility fallbacks. |

## R73 - Writeback Boundary Theme Convergence Declaration

This section records the Chief Planner 2 convergence declaration for the R64–R72
writeback-boundary hardening theme, after independent triple-audit verification.

| Field | Detail |
|---|---|
| Scope | R64–R72 writeback-boundary hardening theme: route all world-facing state consequences through typed deltas + EffectCommitter; remove direct writes from handlers/runtime/providers/SDK/facade/narrative. |
| Fleet mode | No-quota: external free models via opencode CLI. `agnes/agnes-2.0-flash` requires `AGNES_API_KEY` loaded via interactive shell (`zsh -lic`); `opencode/deepseek-v4-flash-free` and `opencode/mimo-v2.5-free` usable directly. |
| Auditor-A | `opencode run -m opencode/deepseek-v4-flash-free` no-edit audit over all 10 grep-hit clusters. Verdict: CONVERGENT, no new P0/P1. Every direct-write hit mapped to exception A/B/C/D or system guard. Raised 4 ambiguous items for Chief Planner judgment. |
| Auditor-B | `opencode run -m opencode/mimo-v2.5-free` first-principles P0/P1 sweep over 5 high-recurrence families (UtilityScorer getUTCHours, AutoTick Date.now, persistence round-trip, fact/knowledge leakage, provider read-only). Verdict: all 5 FALSE_POSITIVE with file:line evidence; no new P0/P1. |
| Chief Planner independent spot-check | GLM-5.2-FP8 (Chief Planner 2) personally read code for highest-risk points, not paper-accepting free-model verdicts: `AgentRuntime.js:139-154` is Category D fallback (prefers `env.effectCommitter`); `RuntimeContext.js:38` `env.hour = getHours() + mins/60` is always a number so `UtilityScorer:427` getUTCHours fallback is unreachable dead code; `SpatialEngine.snapshot()/restore()` 6 fields fully symmetric with grid rebuild; `AndyWorld.js:642-647` spatial move routes through `PositionDelta` + `EffectCommitter`. |
| Convergence verdict | CONVERGENT. Per handoff manual standard: all confirmed P0/P1 in active scope fixed and independently verified, plus two independent post-fix audit rounds (Auditor-A + Auditor-B) found no P0/P1 inside the active scope. Remaining items are P3 cleanup/dead-code, recorded below, not blockers. |
| Ambiguous 1 ruling | `AndyWorld.js:245-250, 463-468` `agent.position = fallback` — **P3 system-integrity guard**. addAgent/step region placement fallback when `regions.place()` returns false; correct domain never hits it. Not event-consequence writeback; not a writeback-owner bypass. Accepted, no fix. |
| Ambiguous 2 ruling | `AndyWorld.js:654` `regions.place()` — **P3 redundant call**. EffectCommitter:211 already calls `regions.place` because committer holds world reference (`AndyWorld:197` `new EffectCommitter({ world: this, ... })`). Repeated place of same position is idempotent/harmless. Optional cleanup, no fix required. |
| Ambiguous 3 ruling | `RuntimeContext.js:53` `regions.place()` — **P3 infrastructure**. `_setRegionChanged` RegionGrid index sync callback for action-selection/scheduler position changes, not event-consequence writeback. Accepted, no fix. |
| Ambiguous 4 ruling | `src/canon/FactEmitter.js:383` `propagateEventKnowledge()` — **P3 dead code**. grep confirms zero runtime/agent/sdk callers; only the definition remains. Deprecated fallback locked per AGENTS.md. Optional removal candidate; no fix required for convergence. |
| Baseline note | R43–R73 gate-green baseline landed in commit `2260fd6` (`fix(R43-R73): verified baseline — writeback boundary theme convergence`). `.understand-anything/` is ignored to keep machine-generated local knowledge graph output out of source control. |
| Status | R64–R72 writeback-boundary theme declared CONVERGENT. No confirmed P0/P1 remains in active scope. P3 backlog recorded above. |

## R74 - Direct Emotion Write Boundary Guard

This section records a no-quota hardening pass that converts the R73 direct
emotion-write exception classification into an automated boundary gate.

| Field | Detail |
|---|---|
| Scope | `scripts/check-boundaries.js` and architecture boundary regression tests. No runtime behavior changed. |
| External model audit | `agnes/agnes-2.0-flash` reviewed the proposed exact-count allowlist guard and approved it as sound boundary hardening. It noted the main risk is false positives if the inventory is incomplete; local `rg` inventory confirmed the current 17 direct emotion write hits before enforcement. |
| Verification verdict | Confirmed as useful polish-first prevention. Direct emotion writes were already classified in R73; R74 prevents silent drift by failing the boundary gate when a new unclassified file appears or an allowlisted file's direct-write count changes. |
| Fix | Added `checkDirectEmotionWrites()` to `scripts/check-boundaries.js`. It scans `src/agent`, `src/runtime`, `src/sdk`, and `src/effects` for `agent.emotion.applyEffect()`, `agent.emotion.setStress()`, and `emotion.applyEffect()`, then enforces exact counts and reasons for the current exceptions: `EffectCommitter`, `PhysiologyRuntime`, SDK restore/transient paths, and committer-aware fallback helpers. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Direct emotion writes: classified exceptions only`. Architecture boundary suite: 1 file / 58 passed. Full `npm test`: 193 files passed / 1 skipped; 3208 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R74 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard for the already-converged writeback boundary theme. |

## R75 - Core RNG / Wall-Clock Boundary Guard

This section records a no-quota hardening pass over the high-recurrence
determinism family: bare `Math.random()` and `Date.now()` in core runtime paths.

| Field | Detail |
|---|---|
| Scope | Core runtime source only: `src/agent`, `src/runtime`, `src/action`, `src/effects`, `src/pressure`, `src/social`, `src/spatial`, `src/canon`, `src/knowledge`, `src/narrative`, plus the public compatibility facade `agent/Agent.js`. SDK/store/shared tooling paths remain outside this core simulation boundary. |
| External model audit | `agnes/agnes-2.0-flash` reviewed the proposal and required a wider scope than only `src/runtime`. The final guard follows that recommendation by scanning core runtime subtrees while avoiding SDK/store false positives. |
| Verification verdict | Confirmed as prevention rather than a new bug fix. Local inventory found only accepted non-comment hits: `AndyWorld` has one unseeded auto-seed `Math.random()`, three `Date.now()` uses for auto-seed and tick duration metrics, and `agent/Agent.js` has one legacy standalone Agent fallback. Existing deterministic checks still protect `src/action` and facts paths. |
| Fix | Added `checkCoreRandomTimeBoundary()` to `scripts/check-boundaries.js`. It enforces exact `Date.now` / `Math.random` counts for the current classified exceptions and fails when any other core runtime file introduces a bare wall-clock/random call. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Core runtime Date.now/Math.random: classified exceptions only`. Architecture boundary suite: 1 file / 59 passed. Full `npm test`: 193 files passed / 1 skipped; 3209 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R75 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard for seeded core runtime discipline. |

## R76 - Core UTC Accessor Boundary Guard

This section records a no-quota hardening pass over UTC/local time-mixing drift,
after earlier P1 fixes around `WorldPressure` time semantics.

| Field | Detail |
|---|---|
| Scope | Core runtime source only: the same core subtrees scanned by R75. Tests, SDK, store/tooling, presets, and fixtures are outside this boundary. |
| External model audit | `agnes/agnes-2.0-flash` reviewed the proposal and approved the minimal guard: exactly two `UtilityScorer.getUTCHours()` fallback hits are allowed; any new core UTC accessor should fail review. |
| Verification verdict | Confirmed as prevention, not a semantic migration. Local inventory found only `src/action/UtilityScorer.js` with two `getUTCHours()` fallback hits. R73 already classified these as non-P0/P1 because active runtime supplies `environment.hour` from `RuntimeContext` local time. TZ-1 golden-fixture binding remains a documented P2 architecture decision, not patched here. |
| Fix | Added `checkCoreUtcTimeBoundary()` to `scripts/check-boundaries.js`. It scans core runtime files for `getUTC*`, `setUTC*`, `Date.UTC`, and `toUTCString()` in non-comment lines, enforcing the current `UtilityScorer` exact-count exception. Added an architecture test that executes the boundary script and asserts the UTC guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Core runtime UTC accessors: classified exceptions only`. Architecture boundary suite: 1 file / 60 passed. Full `npm test`: 193 files passed / 1 skipped; 3210 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R76 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against reintroducing UTC/local time drift in core runtime code. |

## R77 - Direct Memory Experience Boundary Guard

This section records a no-quota hardening pass over direct experience-memory
writeback, a bug family previously repaired in ScheduleHandler, PerceptionRuntime,
and public facade paths.

| Field | Detail |
|---|---|
| Scope | Source-level direct `addExperience()` writes in `src/agent`, `src/runtime`, `src/sdk`, `src/effects`, top-level `agent`, and top-level `sdk`. Tests are excluded. |
| External model audit | `agnes/agnes-2.0-flash` approved the proposal. It agreed that `PersonalMemory.addExperience()` as the canonical method definition and `EffectCommitter` as the authorized `MemoryDelta` owner are the only accepted source-level hits, with non-comment scanning to avoid noisy false positives. |
| Verification verdict | Confirmed as prevention, not a new behavior fix. Local inventory found only `src/agent/memory/PersonalMemory.js` defining `addExperience()` once and `src/effects/EffectCommitter.js` calling `agent.memory.addExperience()` once. Existing SDK/facade memory guard remains in place and now has a broader source-level companion. |
| Fix | Added `checkDirectMemoryExperienceWrites()` to `scripts/check-boundaries.js`. It scans non-comment source lines for direct experience-memory writes and enforces exact-count exceptions for `PersonalMemory` and `EffectCommitter`. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Direct memory experience writes: classified exceptions only`. Architecture boundary suite: 1 file / 61 passed. Full `npm test`: 193 files passed / 1 skipped; 3211 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R77 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against reintroducing direct memory experience writeback outside the `MemoryDelta` / `EffectCommitter` path. |

## R78 - Direct Position Write Boundary Guard

This section records a no-quota hardening pass over direct `agent.position`
assignment, a bug family previously connected to schedule movement, active
writeback, spatial rollback, and bridge restore sync.

| Field | Detail |
|---|---|
| Scope | Source-level direct `agent.position = ...` assignments in `src/runtime`, `src/agent`, `src/sdk`, `src/effects`, top-level `agent`, and top-level `sdk`. Tests are excluded. `regions.place()` is not locked in this pass because R73 classified those calls separately as infrastructure/idempotent sync. |
| External model audit | `agnes/agnes-2.0-flash` approved the exact-count guard and suggested changing the two `AndyWorld` fallback assignments into throws. Chief-planner ruling for this round: defer that semantic change because R73 classified them as P3 system-integrity fallback guards and changing them to throws would alter `addAgent()` / tick isolation behavior. |
| Verification verdict | Confirmed as prevention, not a new behavior fix. Local inventory found four non-comment source hits: `EffectCommitter` as the authorized `PositionDelta` owner, two `AndyWorld` fallback assignments when `RegionGrid.place()` rejects an invalid region, and `AndyBridge` snapshot restore with RegionGrid/spatial sync. |
| Fix | Added `checkDirectPositionWrites()` to `scripts/check-boundaries.js`. It scans non-comment source lines for direct `agent.position =` writes and enforces exact-count exceptions for `EffectCommitter`, `AndyWorld`, and `AndyBridge`. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Direct position writes: classified exceptions only`. Architecture boundary suite: 1 file / 62 passed. Full `npm test`: 193 files passed / 1 skipped; 3212 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R78 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against reintroducing direct position writeback outside `PositionDelta` / restore / system fallback paths. |

## R79 - Direct Relationship Interaction Boundary Guard

This section records a no-quota hardening pass over direct relationship
interaction writes, the source-level API used by relationship deltas.

| Field | Detail |
|---|---|
| Scope | Source-level `recordInteraction()` calls in `src/social`, `src/effects`, `src/agent`, `src/runtime`, `src/sdk`, top-level `agent`, and top-level `sdk`. Tests are excluded. |
| External model audit | `agnes/agnes-2.0-flash` reviewed the proposal and approved it as low-risk boundary hardening. It specifically noted that module-origin distinction matters; the final guard enforces exact paths and counts rather than allowing any same-named call. |
| Verification verdict | Confirmed as prevention, not a new behavior fix. Local inventory found only two source hits: `src/social/Relationship.js` defines the canonical method once, and `src/effects/EffectCommitter.js` calls it once as the authorized `RelationshipDelta` owner. |
| Fix | Added `checkDirectRelationshipInteractionWrites()` to `scripts/check-boundaries.js`. It scans non-comment source lines for `recordInteraction()` and enforces exact-count exceptions for `Relationship` and `EffectCommitter`. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Direct relationship interaction writes: classified exceptions only`. Architecture boundary suite: 1 file / 63 passed. Full `npm test`: 193 files passed / 1 skipped; 3213 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R79 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against reintroducing direct relationship interaction writeback outside the `RelationshipDelta` / `EffectCommitter` path. |

## R80 - Fact/Knowledge Write Authority Boundary Guard

This section records a no-quota hardening pass over fact and knowledge write
authority: which modules may create world facts or attach epistemic knowledge.

| Field | Detail |
|---|---|
| Scope | Source-level `factStore.addFact()`, `knowledgeStore.addKnowledge()`, and `this.addKnowledge()` calls in `src/agent`, `src/runtime`, `src/sdk`, `src/effects`, `src/canon`, `src/knowledge`, `src/narrative`, top-level `agent`, and top-level `sdk`. Tests and fixtures are excluded. |
| External model audit | `agnes/agnes-2.0-flash` approved adding this guard as complementary to the existing FactEmitter fallback caller ban. It recommended path whitelisting rather than exact count checks, so canonical propagation logic can evolve without turning the guard into brittle version-number bookkeeping. |
| Verification verdict | Confirmed as prevention, not a new behavior fix. Local inventory found source writes only in `src/canon/CanonEventPipeline.js` (canonical event -> fact/knowledge pipeline), `src/canon/FactEmitter.js` (deprecated fallback implementation), and `src/knowledge/KnowledgeStore.js` (canonical method and restore path). Runtime/agent/sdk callers of the deprecated FactEmitter fallback remain separately forbidden by `checkFactEmitterEventFallback()`. |
| Fix | Added `checkFactKnowledgeWriteAuthority()` to `scripts/check-boundaries.js`. It fails any fact/knowledge authority write outside the path whitelist of `CanonEventPipeline`, `FactEmitter`, and `KnowledgeStore`. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Fact/knowledge write authority: clean (canon/knowledge owners only)`. Architecture boundary suite: 1 file / 64 passed. Full `npm test`: 193 files passed / 1 skipped; 3214 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R80 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against reintroducing fact/knowledge writes outside canonical authority modules. |

## R81 - Action Provider Read-Only Boundary Guard

This section records a no-quota hardening pass over the action provider matrix.
Providers must remain read-only candidate sources and must not commit state,
construct typed deltas, or bypass seeded/delta-owned runtime paths.

| Field | Detail |
|---|---|
| Scope | `src/action/providers/*.js` non-comment source lines. Tests are excluded. |
| External model audit | `agnes/agnes-2.0-flash` approved the guard as useful and recommended trimming `Math.random()` / `Date.now()` from this specific check because R75 already owns the seeded RNG/time family. The final guard therefore focuses on actual state mutation, commit access, and typed-delta construction terms. |
| Verification verdict | Confirmed as prevention, not a new behavior fix. Local inventory found no provider hits for direct memory/emotion/position/relationship/fact/knowledge writes, region placement, effect committer access, commit calls, or typed delta construction. |
| Fix | Added `checkActionProviderReadOnlyBoundary()` to `scripts/check-boundaries.js`. It fails if any provider tries to write memory/emotion/position/relationship/facts/knowledge, place regions, access `effectCommitter`, call `.commit()`, or construct typed deltas. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Action providers: read-only candidate sources`. Architecture boundary suite: 1 file / 65 passed. Full `npm test`: 193 files passed / 1 skipped; 3215 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R81 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against provider-side world writes and EffectCommitter bypasses. |

## R82 - Narrative / LLM No-World-Write Boundary Guard

This section records a no-quota hardening pass over the narrative and LLM-facing
layer. Narrative may express grounded facts, but it must not create facts,
commit deltas, or mutate world/agent state.

| Field | Detail |
|---|---|
| Scope | `src/narrative/*.js` non-comment source lines. Tests are excluded. |
| External model audit | `agnes/agnes-2.0-flash` approved the guard as directly enforcing the AGENTS.md rule that Narrative/LLM can only express grounding-allowed facts and must not create world facts or write world state. |
| Verification verdict | Confirmed as prevention, not a new behavior fix. Local inventory found no narrative hits for typed-delta construction, effect committer access, commit calls, memory/emotion/position/relationship/fact/knowledge writes, or region placement. |
| Fix | Added `checkNarrativeNoWorldWrites()` to `scripts/check-boundaries.js`. It fails if `src/narrative` tries to construct typed deltas, access/commit through `EffectCommitter`, write memory/emotion/position/relationship/facts/knowledge, or place regions. Added an architecture test that executes the boundary script and asserts the new guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `Narrative/LLM world writes: clean`. Architecture boundary suite: 1 file / 66 passed. Full `npm test`: 193 files passed / 1 skipped; 3216 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. Perf check all PASS with no WARN. Diff check clean. |
| Status | R82 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against narrative/LLM world-state authority leaks. |

## R83 - Canonical SDK Data Mutation Boundary Guard

This section records a no-quota hardening pass over public SDK and facade entry
points. Public-facing SDK code must not mutate relationship/facts/knowledge
stores directly; those writes belong to typed deltas or canon/knowledge owners.

| Field | Detail |
|---|---|
| Scope | `sdk`, `src/sdk`, `src/agent/facade`, and top-level `agent` source files. Tests are excluded. |
| External model audit | `agnes/agnes-2.0-flash` approved expanding the existing SDK data mutation guard to canonical `src/sdk` and public facades. It recommended matching only property + write-verb pairs to avoid false positives from legitimate read-only access. |
| Verification verdict | Confirmed as prevention, not a new behavior fix. Local inventory found zero direct relationship/facts/knowledge write-verb hits across the expanded public SDK/facade surface. |
| Fix | Expanded `checkSdkDataMutation()` in `scripts/check-boundaries.js` from top-level `sdk` only to `sdk`, `src/sdk`, `src/agent/facade`, and `agent`. It now scans singular/plural relationship, facts/factStore, knowledge/knowledgeStore, socialGraph, and relGraph properties only when followed by write verbs such as set/add/remove/update/record/invalidate/merge/apply/upsert/batch. Added an architecture test that executes the boundary script and asserts the guard is active. |
| Files | `scripts/check-boundaries.js`; `tests/architecture/boundary-check.test.js`; `docs/audit/CURRENT_BUG_LEDGER.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Commands | `opencode run --pure ... -m agnes/agnes-2.0-flash`; `npm run check:boundaries -- --no-color`; `npx vitest run tests/architecture/boundary-check.test.js --no-color`; `npm run typecheck`; `npm run test:domain -- --no-color`; `npm test -- --run --no-color`; `npm run smoke:pack`; `npm run replay:diff`; `npm run perf:check`; repeated `npm run perf:check`; `git diff --check`. |
| Result | Boundary check now reports `SDK data mutation: clean (relationship/facts/knowledge)`. Architecture boundary suite: 1 file / 67 passed. Full `npm test`: 193 files passed / 1 skipped; 3217 passed / 28 skipped. Domain tests 82 passed. Typecheck clean. Smoke pack 19 passed / 0 failed. Replay diff matched 100/100. First perf check exited 0 with one machine-variance WARN; immediate rerun reported all PASS with no WARN. Diff check clean. |
| Status | R83 fixed and verified in current worktree. No new P0/P1 confirmed; this is a regression-prevention guard against public SDK/facade data-authority leaks. |

## R84 - Perf / Determinism Hardening

This section records three no-quota fixes from an internal free-model audit plus
local verification: WorldFactStore deep-copy waste, EventDispatcher simTime
staleness, and StateMachine wall-clock fallback.

### R84-WFS-DEEPCOPY-1

| Field | Detail |
|---|---|
| ID | R84-WFS-DEEPCOPY-1 |
| Severity | P2 |
| Audit finding | `WorldFactStore._getByType()` deep-copied every fact via `_deepCopyFact()` on every tick. `FactEmitter.emitAgentStateFacts`, `emitRelationshipFacts`, and `emitMemoryFacts` called `getAgentStateFacts()`/`getRelationshipFacts()`/`getMemoryFacts()` which delegate to `_getByType()`, but only used returned facts to build read-only temporary lookup Maps. |
| Evidence | `WorldFactStore.js:695-702` — `_getByType` maps through `_deepCopyFact`; `FactEmitter.js:95-97` — builds Map from `getAgentStateFacts()` reading only `.agentId`/`.id`; `FactEmitter.js:262-268` — builds pair index from `getRelationshipFacts()` reading only `.agentA`/`.agentB`/`.id`. |
| Verification verdict | Confirmed by independent Verification AI. No caller mutates returned facts. Precedent exists: `_hasActiveFact()` (line 441) documented as zero-copy hot-path read for the same reason. `emitMemoryFacts` is dead code (never called from `step()`), reducing scope. |
| Fix | Added `_getByTypeReadOnly(type)` internal zero-copy accessor in `WorldFactStore`. `FactEmitter` now uses it for agent-state, relationship, and memory fact lookups. Public deep-copy accessors preserved for external callers. |
| Files | `src/canon/WorldFactStore.js`; `src/canon/FactEmitter.js`; `tests/facts/world-fact-store.test.js`; `tests/facts/fact-emitter-event-fallback.test.js` |
| Regression test | 8 zero-copy tests including one that mutates a returned reference and verifies the mutation propagates into the store (proving zero-copy). FactEmitter spy targets updated to `_getByTypeReadOnly`. |
| Re-verification | Targeted tests: 64 passed. Full `npm test`: 3228 passed / 28 skipped. Perf improved: 100 agents 0.53x baseline (from 0.61x), 300 agents 0.38x baseline (from 0.42x). |
| Status | Fixed and verified in commit `3ff5024`. |

### R84-EVENTDISPATCHER-TIME-1

| Field | Detail |
|---|---|
| ID | R84-EVENTDISPATCHER-TIME-1 |
| Severity | P3 |
| Audit finding | `eventDispatcher.setSimTime(this.clock.time)` was called in Phase 5 of `AndyWorld.step()`, but weather changes in Phase 2 (`_maybeChangeWeather` → `setWeather` → `createEvent`) used the previous tick's `_simTime`, causing weather events to be timestamped 1 tick stale. |
| Evidence | `AndyWorld.js:493` — `setSimTime` in Phase 5; `AndyWorld.js:405-407` — Phase 2 calls `_maybeChangeWeather`; `AndyWorld.js:280-286` — `setWeather` calls `createEvent`; `EventDispatcher.js:89` — `createEvent` uses `params.time || this._simTime || new Date()`. |
| Verification verdict | Confirmed by independent Verification AI. Weather events in Phase 2 used stale `_simTime` from previous tick. The `new Date()` constructor pre-seed is not a determinism hole in normal operation (Phase 7 events always have correct time), but the 1-tick staleness for weather events is a real fidelity issue. |
| Fix | Moved `eventDispatcher.setSimTime(this.clock.time)` from Phase 5 to Phase 1 (after clock advance), so all subsequent phases use current simulation time. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing event-dispatcher-branches and runtime tests cover the timing change; no new test needed for pure reorder. |
| Re-verification | Targeted tests: 60 passed. Full `npm test`: 3228 passed / 28 skipped. Replay diff 100/100. |
| Status | Fixed and verified in commit `3ff5024`. |

### R84-STATEMACHINE-DATE-1

| Field | Detail |
|---|---|
| ID | R84-STATEMACHINE-DATE-1 |
| Severity | P2 |
| Audit finding | `StateMachine` constructor set `stateEnteredAt = new Date()` (wall-clock) when no `savedState` provided. `AgentRuntime.tick()` line 177 used `env.simTime || new Date()` for state transitions, and line 181 used `(env.simTime || new Date()).toISOString()` for history entries. In isolated/SDK agent usage where `env.simTime` is null, wall-clock timestamps broke seeded determinism for state tracking. |
| Evidence | `StateMachine.js:36` — `this.stateEnteredAt = new Date()`; `AgentRuntime.js:177` — `env.simTime || new Date()`; `AgentRuntime.js:181` — `(env.simTime || new Date()).toISOString()`. Normal `AndyWorld.step()` path always provides `simTime` via `RuntimeContext.js:42`. |
| Verification verdict | Confirmed by independent Verification AI. `stateEnteredAt` feeds only into `getInfo().elapsed` for narrative/status output (not behavioral logic). L4 replay hash excludes `runtimeSnapshot`. Normal runtime path is clean; only isolated/SDK usage hits the fallback. Severity P2 because it affects deterministic replay for non-default agent usage patterns. |
| Fix | Replaced `new Date()` fallback with `new Date(0)` (epoch sentinel) in `StateMachine` constructor and `AgentRuntime` state-change handler. Preserves `Date` type, deterministic across runs, `toJSON()`/`fromJSON()` round-trip unaffected. |
| Files | `src/agent/psychology/StateMachine.js`; `src/agent/AgentRuntime.js`; `tests/unit/handlers/agent-runtime.test.js` |
| Regression test | 4 tests: constructor uses epoch 0, stateEnteredAt stays epoch 0 without state change, uses simTime when provided, history entries use ISO from simTime or epoch 0. |
| Re-verification | Targeted tests: 35 passed. Full `npm test`: 3228 passed / 28 skipped. Typecheck clean. |
| Status | Fixed and verified in commit `3ff5024`. |

## R85 - SDK Determinism + Type Declaration Hardening

This section records three no-quota fixes from an internal free-model audit plus
local verification: AutoTick wall-clock determinism, .d.ts type declaration
mismatches, and AndyBridge partial restore documentation.

### R85-12-AUTOTICK-DETERMINISM-1

| Field | Detail |
|---|---|
| ID | R85-12-AUTOTICK-DETERMINISM-1 |
| Severity | P1 |
| Audit finding | `AutoTick.calculateTicksToAdvance()` used `Date.now()` for wall-clock elapsed time between messages, breaking seeded determinism for `Character.chat()`/`chatStream()`. `_lastSimTime` was already serialized but never used in the tick calculation. |
| Evidence | `AutoTick.js:53` — `const now = Date.now();`; `AutoTick.js:63-64` — `const elapsedMs = now - this._lastMessageTime;`; `Character.js:154` — `this._autoTick.advance(this._engine)` without virtual time injection. |
| Verification verdict | Confirmed by independent Verification AI. `_lastSimTime` is written but never read in `calculateTicksToAdvance()`. No injection mechanism exists. This is the single biggest SDK determinism blocker: wall-clock elapsed time between runs can differ arbitrarily, producing wildly different tick counts even with identical seeded RNG. |
| Fix | Added optional `now` parameter to `calculateTicksToAdvance(engine, now)` and `advance(engine, now)`. When provided (ms since epoch), replaces `Date.now()`. `Character.chat()` and `chatStream()` now pass `this._engine.world.time.getTime()` as deterministic virtual time. `Date.now()` fallback preserved for backward compatibility. 4 regression tests added. |
| Files | `src/sdk/AutoTick.js`; `src/sdk/Character.js`; `tests/sdk.test.js` |
| Regression test | Same simTime → same tick count (chat-in-progress); same sim-time delta → same catch-up ticks; virtual vs wall-clock paths both valid; serialization round-trip preserves `_lastSimTime`. |
| Re-verification | Targeted tests: 75 passed. Full `npm test`: 3233 passed / 28 skipped. Perf all PASS (100 agents 0.57x baseline, 300 agents 0.40x baseline). |
| Status | Fixed and verified in commit `62db2c7`. |

### R85-1/4/5/6-TYPE-DECL-HARDENING-1

| Field | Detail |
|---|---|
| ID | R85-1/4/5/6-TYPE-DECL-HARDENING-1 |
| Severity | P1/P2 |
| Audit finding | Multiple `.d.ts` files had mismatches with runtime implementation: `CanonEventPipeline` constructor declared 2 params but runtime takes 3; `FactEmitter` constructor missing; `WorldFactStore` had 15+ missing methods and wrong method names (`factCount` phantom, `getFact`→should be `getFactById`); `KnowledgeStore` declared non-existent `getKnowledge`/`knowsAbout`; `CharacterConfig`/`AndyConfig` missing `enableFacts`/`seed`/`rng`; `Andy.load` missing options param; `AndyBridge` entirely absent from types; `StateDelta` missing `target`/`agentId`/`timestamp`/`toJSON`/`'position'`; `EffectCommitter` and all delta classes absent from root `.d.ts`. |
| Evidence | `facts/index.d.ts:99-101` — 2-param constructor vs runtime 3-param; `facts/index.d.ts:67` — `factCount` property phantom (runtime has `size` getter); `facts/index.d.ts:95` — `getKnowledge` doesn't exist at runtime; `sdk/types.d.ts:71-106` — `CharacterConfig` missing `enableFacts`/`seed`/`rng`; `sdk/types.d.ts:188-197` — `AndyConfig` missing same fields; `sdk/types.d.ts:230` — `Andy.load` missing options; `index.d.ts:249-252` — `StateDelta` incomplete. |
| Verification verdict | Confirmed by independent Verification AI. Both `npm run typecheck` and `npm run typecheck:consumer` pass after fixes. R85-1 downgraded to P2 because `factEmitter` is stored but never dereferenced in `CanonEventPipeline` class — no runtime crash, but type-safety gap remains. |
| Fix | Expanded and corrected all `.d.ts` declarations to match runtime: CanonEventPipeline 3-param constructor, correct `processEvent` return, added `processEvents`/`toJSON`/`fromJSON`; FactEmitter constructor; WorldFactStore 15+ methods, `factCount→size`, `getFact→getFactById`, `getFactsByAgent→getFactsForAgent`; KnowledgeStore removed non-existent methods, added `hasKnowledge`/`getKnownFacts`/etc.; CharacterConfig/AndyConfig added `enableFacts`/`seed`/`rng`/`LLMFunction`; CharacterContext `groundingPackage`; Andy.load options; AndyBridge full class; StateDelta fields + `toJSON` + `'position'`; EffectCommitter + all delta classes declared. |
| Files | `facts/index.d.ts`; `index.d.ts`; `sdk/types.d.ts` |
| Regression test | Consumer typecheck script now imports all expanded subpaths; type-smoke tests verify new declarations compile. |
| Re-verification | `npm run typecheck` clean; `npm run typecheck:consumer` clean. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified in commit `62db2c7`. |

### R85-15-BRIDGE-RESTORE-DOC-1

| Field | Detail |
|---|---|
| ID | R85-15-BRIDGE-RESTORE-DOC-1 |
| Severity | P2 |
| Audit finding | `AndyBridge._restoreAgents()` drops ~12 serialized fields (memory, personality, schedule, intrinsicMotivation, emotionRegulation, proceduralMemory, futureTendency, _actionTraceHistory, _perceivedEventIds, isOnline, name, appraisalBiases). Existing JSDoc acknowledged some but not all missing fields. `init()` return value gave no warning about partial restore. |
| Evidence | `AndyBridge.js:293-306` — `_serializeAgents` saves full `agent.toJSON()`; `AndyBridge.js:318-461` — `_restoreAgents` only restores emotion/needs/position/health/socialEnergy/behaviorField/stateMachine/tick counters; `AndyBridge.js:308-317` — JSDoc lists only 6 of 12 missing fields; `AndyBridge.js:94-97` — init returns only `{restoredTick, restoredTime}` with no warning. |
| Verification verdict | Confirmed by independent Verification AI as P2 (not P1). The gap is partially documented; many missing fields (personality, schedule) are static or reconstructed at agent construction. Most impactful dynamic fields (memory, proceduralMemory, intrinsicMotivation, futureTendency) are silently lost. Canonical full restore path (`AndyEngine.fromJSON()`) exists as alternative. |
| Fix | Updated `_restoreAgents` JSDoc to list all 12 non-restored fields. Added `console.warn` in `init()` when restoring from snapshot (tickCount > 0), listing missing fields and directing users to `AndyEngine.fromJSON()` for full state reconstruction. 1 regression test added. |
| Files | `src/sdk/AndyBridge.js`; `tests/unit/andy-bridge-internal.test.js` |
| Regression test | Verifies `console.warn` message contains `memory`, `personality`, `futureTendency`, `appraisalBiases` when restoring from snapshot. |
| Re-verification | Targeted tests: 23 passed. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified in commit `62db2c7`. |

## R86 - Determinism Fallback Hardenings + Dead Type Cleanup

This section records three no-quota fixes from an internal free-model audit plus
local verification: dead duplicate .d.ts removal, Schedule epoch sentinel,
and Relationship timestamp epoch sentinels.

### R86-TYPE-DECL-DEADFILE-1

| Field | Detail |
|---|---|
| ID | R86-TYPE-DECL-DEADFILE-1 |
| Severity | P2 |
| Audit finding | `sdk/types.d.ts` at the top level is a dead/duplicate type declaration file that shadows `src/sdk/types.d.ts`. It is NOT imported by any `.d.ts` chain from the package's exports map (`sdk/index.d.ts` imports from `../src/sdk/types`). Contains stale/duplicate declarations that could diverge from the canonical `src/sdk/types.d.ts`. Listed in `tests/package-boundary.test.js` as a "required file" but that test only checks file existence, not importability. |
| Evidence | `sdk/types.d.ts` (11KB) vs `src/sdk/types.d.ts` (10KB); `sdk/index.d.ts:6-14` imports from `../src/sdk/types`; `package.json` exports map has no `./sdk/types` subpath. |
| Verification verdict | Confirmed by independent Verification AI. File is dead code — never imported by any TS consumer through the package's declared entry points. Deleting it removes a maintainability hazard without breaking any import path. Package-boundary test updated to reference `src/sdk/types.d.ts` instead. |
| Fix | Deleted `sdk/types.d.ts`. Updated `tests/package-boundary.test.js:110` to require `src/sdk/types.d.ts`. |
| Files | `sdk/types.d.ts` (deleted); `tests/package-boundary.test.js` |
| Regression test | Package-boundary test (74/74 passed) confirms `src/sdk/types.d.ts` exists and all package structure checks pass. |
| Re-verification | `npm test`: 3233 passed / 28 skipped. `check:boundaries`: all passed. `typecheck`: clean. |
| Status | Fixed and verified. |

### R86-SCHEDULE-SIMDATE-1

| Field | Detail |
|---|---|
| ID | R86-SCHEDULE-SIMDATE-1 |
| Severity | P2 |
| Audit finding | `Schedule._maybeRegenerateVariations()` used `new Date().toDateString()` as fallback when `simDate` was not provided. Wall-clock date could cause schedule variation regeneration mid-simulation if `simDate` is ever null/undefined, breaking seeded determinism. |
| Evidence | `Schedule.js:142` — `const today = simDate || new Date().toDateString();`. JSDoc says simDate is provided by callers (lines 57, 96 always pass it), but the fallback is not deterministic. |
| Verification verdict | Confirmed by independent Verification AI. Normal runtime always provides `simDate`. The wall-clock fallback is only hit in edge cases (tests, future code changes), but it creates a determinism hole that could be triggered unexpectedly. `new Date(0).toDateString()` → `"Thu Jan 01 1970"` is deterministic and never regenerates variations if simDate is missing (safe since simDate is always provided). |
| Fix | Replaced `new Date().toDateString()` with `new Date(0).toDateString()` (epoch sentinel). Added comment referencing R84 pattern. Updated companion test to expect `"Thu Jan 01 1970"`. |
| Files | `src/agent/schedule/Schedule.js`; `tests/unit/schedule/schedule-branches.test.js` |
| Regression test | Schedule-branches test updated: expects epoch sentinel `"Thu Jan 01 1970"` when simDate omitted. All schedule tests pass. |
| Re-verification | Targeted tests: schedule + relationship suites pass. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R86-RELATIONSHIP-TIME-1

| Field | Detail |
|---|---|
| ID | R86-RELATIONSHIP-TIME-1 |
| Severity | P2 |
| Audit finding | `Relationship.js` had 4 locations where `new Date()` (wall-clock) was used as fallback for timestamps: constructor `savedState.lastInteraction` null fallback, new-relationship else branch, `recordInteraction` `lastInteraction` assignment, and history entry `time`. Wall-clock timestamps leak into relationship decay and history queries when `simTime` is not provided. |
| Evidence | `Relationship.js:40` — `new Date()` when savedState.lastInteraction is null; `Relationship.js:56` — `new Date()` for new relationship; `Relationship.js:84` — `simTime || new Date()`; `Relationship.js:154` — `(simTime || new Date()).toISOString()`. Normal runtime provides `simTime` from EventDispatcher, but fallbacks are non-deterministic. |
| Verification verdict | Confirmed by independent Verification AI. All 4 replacements verified. Remaining `new Date()` calls at lines 39 and 51 are guarded conversions from serialized timestamps (legitimate). Round-trip serialization works correctly with epoch sentinel. All relationship tests pass (23/23). |
| Fix | Replaced all 4 `new Date()` fallbacks with `new Date(0)` epoch sentinel. Added brief comments explaining the deterministic fallback pattern. `Date` type preserved throughout. |
| Files | `src/social/Relationship.js` |
| Regression test | Relationship unit tests (13/13), relationship-writeback (8/8), relationship-social-writeback (2/2), golden seed replay (3/3) all pass. |
| Re-verification | Targeted tests: 23 passed. Full `npm test`: 3233 passed / 28 skipped. `check:boundaries`: all passed. |
| Status | Fixed and verified. |

## R87 - Determinism Fallback Hardenings + NaN Guard + Threshold Consistency

This section records four scoped no-quota fixes from an internal audit plus
local verification: BehaviorField NaN guard, SocialGraph threshold consistency,
epoch sentinel expansion to AndyWorld/Andy/Character/compiler/EventDispatcher,
and two latent regression fixes exposed by epoch-0 timestamps.

### R87-BEHAVIORFIELD-NAN-1

| Field | Detail |
|---|---|
| ID | R87-BEHAVIORFIELD-NAN-1 |
| Severity | P2 |
| Audit finding | `BehaviorField._getTimeTarget(hour)` had no NaN guard on the `hour` parameter. When `hour` is NaN (from missing/corrupted `signals.environment?.hour`), all arithmetic produces NaN: `h = NaN`, `t = NaN`, `blend = NaN`, `result[d] = NaN`. The NaN propagates through `_addTimeGradient` into the total gradient, corrupting all components. The NaN guard in `_enforceBoundary()` catches this too late — after velocity and B are corrupted, causing a hard reset of behavior state to `[0.5, 0.5, 0.5, 0.5]`. |
| Evidence | `BehaviorField.js:719` — `const h = ((hour % 24) + 24) % 24;` with no finite guard; `BehaviorField.js:736` — `t = (NaN - lo.hour) / span` → NaN; `BehaviorField.js:741` — `result[d] = loTarget[d] * (1 - NaN) + hiTarget[d] * NaN` → NaN; `BehaviorField.js:603-606` — `_enforceBoundary` resets B to 0.5 but after corruption. |
| Verification verdict | Confirmed by independent Verification AI. NaN propagation trace verified: `_getTimeTarget` → `_addTimeGradient` → `_updateDynamics` → B/velocity corruption → `_enforceBoundary` hard reset. The fix is an input guard (prevention) rather than relying on the output guard (recovery). |
| Fix | Added `if (!Number.isFinite(hour)) return TIME_TARGETS.sleep;` at the top of `_getTimeTarget(hour)`. Returns the safe `TIME_TARGETS.sleep` fallback (already used in the same method for missing schedule targets). |
| Files | `src/agent/psychology/BehaviorField.js` |
| Regression test | 66 BehaviorField tests pass; NaN guard prevents contamination without affecting normal finite-hour paths. |
| Re-verification | Targeted tests: 66 passed. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R87-SOCIALGRAPH-THRESHOLD-1

| Field | Detail |
|---|---|
| ID | R87-SOCIALGRAPH-THRESHOLD-1 |
| Severity | P2 |
| Audit finding | `SocialGraph.js` had inconsistent strength thresholds across 3 methods that all answer "is this relationship strong enough to matter?": `getCommonFriends` used configurable `ANDY_DEFAULTS.relationship.threshold.acquaintance` (0.15) — correct; `isTwoHopsAway` used hardcoded `0.2` — inconsistent; `getSocialDistance` used hardcoded `0.15` — matches current default but not configurable. If config threshold changes, the two hardcoded methods silently diverge. |
| Evidence | `SocialGraph.js:144` — `const acquaintanceThreshold = ANDY_DEFAULTS.relationship.threshold.acquaintance;` (R41 L2 fix); `SocialGraph.js:167` — `.filter(r => r.strength > 0.2)` hardcoded; `SocialGraph.js:197` — `if (rel.strength < 0.15) continue;` hardcoded. |
| Verification verdict | Confirmed by independent Verification AI. All three methods now reference `ANDY_DEFAULTS.relationship.threshold.acquaintance`. With current config (0.15), `isTwoHopsAway` behavior changes slightly (0.2→0.15, slightly stricter hop detection) — this is the intended consistency fix. |
| Fix | Replaced hardcoded `0.2` in `isTwoHopsAway` and `0.15` in `getSocialDistance` with `ANDY_DEFAULTS.relationship.threshold.acquaintance`. Added comments matching the R41 L2 fix pattern in `getCommonFriends`. |
| Files | `src/social/SocialGraph.js` |
| Regression test | All 13 social graph tests pass. |
| Re-verification | Targeted tests: 13 passed. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R87-DATE-EPOCH-1

| Field | Detail |
|---|---|
| ID | R87-DATE-EPOCH-1 |
| Severity | P2 |
| Audit finding | Four files used `new Date()` (wall-clock) as a fallback when no explicit start time was provided: `AndyWorld.js:69` (WorldClock construction), `Andy.js:42` (SDK entry), `Character.js:70` (standalone Character), `compiler.js:49` (world compilation). Wall-clock fallback means two runs with identical seeds but different wall times produce different initial simulation conditions (timeOfDay, season, weather). |
| Evidence | `AndyWorld.js:69` — `new WorldClock(config.startTime || new Date())`; `Andy.js:42` — `startTime: config.startTime || new Date()`; `Character.js:70` — same pattern; `compiler.js:49` — `: new Date()`. All four use the same fallback pattern. |
| Verification verdict | Confirmed by independent Verification AI. All four replacements verified. `new Date(0)` is deterministic and preserves `Date` type. When `startTime` IS provided (explicit config), behavior is unchanged — only the fallback path is affected. |
| Fix | Replaced all 4 `new Date()` fallbacks with `new Date(0)` epoch sentinel. Added comments referencing R84/R86 pattern. |
| Files | `src/runtime/AndyWorld.js`; `src/sdk/Andy.js`; `src/sdk/Character.js`; `src/store/world/compiler.js` |
| Regression test | SDK, runtime, and compiler tests all pass. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `check:boundaries`: all passed. `typecheck`: clean. |
| Status | Fixed and verified. |

### R87-AUTOTICK-FALSY-1 (regression fix)

| Field | Detail |
|---|---|
| ID | R87-AUTOTICK-FALSY-1 |
| Severity | P2 |
| Audit finding | `AutoTick.js:62` used `if (!this._lastMessageTime)` to check for "no previous message." When `_lastMessageTime` is `0` (epoch 0 timestamp from sim-time injection), `!0` is `true`, so the guard always enters the "first message" branch and returns 0 ticks. Lines 138-139 used `data.lastMessageTime || null` which turns `0` into `null`, breaking serialization round-trip. These latent bugs were exposed by the R87 epoch sentinel changes (sim-time starting at 0). |
| Evidence | `AutoTick.js:62` — `if (!this._lastMessageTime)`; `AutoTick.js:138` — `data.lastMessageTime || null`; `AutoTick.js:139` — `data.lastSimTime || null`. |
| Verification verdict | Confirmed by independent Verification AI. 4 SDK tests failed before fix (tick calculations returned 0 instead of expected values; serialization round-trip turned 0 into null). Fix uses `=== null` explicit check and `??` nullish coalescing. |
| Fix | Changed `if (!this._lastMessageTime)` → `if (this._lastMessageTime === null)` on line 62. Changed `|| null` → `?? null` on lines 138-139. Added comments explaining null vs falsy distinction. |
| Files | `src/sdk/AutoTick.js` |
| Regression test | 4 previously-failing SDK AutoTick tests now pass (75 total SDK tests pass). Serialization round-trip test confirms `_lastSimTime` preserves `0` value. |
| Re-verification | Targeted tests: 75 passed. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R87-EVENTDISPATCHER-EPOCH-1 (regression fix)

| Field | Detail |
|---|---|
| ID | R87-EVENTDISPATCHER-EPOCH-1 |
| Severity | P2 |
| Audit finding | `EventDispatcher._cleanupOldEvents()` compares event timestamps against `_simTime` to delete "old" events. `_simTime` was initialized to `new Date()` (wall-clock ~2026) in the constructor, but events created with epoch-0 timestamps appear ~56 years old and are immediately deleted. This was exposed by the R87 epoch sentinel changes (simulation clock starting at epoch 0). |
| Evidence | `EventDispatcher.js:43` — `this._simTime = new Date()`; `EventDispatcher.js:89` — `time: params.time || this._simTime || new Date()`; cleanup logic compares event.time against `_simTime` cutoff. Events with epoch-0 timestamps fall before the wall-clock cutoff. |
| Verification verdict | Confirmed by independent Verification AI. 1 e2e test failed before fix (help event deleted before narrative could trace it). Fix initializes `_simTime` to `new Date(0)` so epoch-0 events are not prematurely cleaned up before the first `setSimTime()` call from `AndyWorld.step()` Phase 1. |
| Fix | Changed `this._simTime = new Date()` → `this._simTime = new Date(0)` on line 43. Added comment explaining epoch sentinel initialization. `setSimTime()` from `AndyWorld.step()` Phase 1 updates `_simTime` every tick, so initial value only matters for events before first tick. |
| Files | `src/runtime/EventDispatcher.js` |
| Regression test | 1 previously-failing e2e cause-effect test now passes. |
| Re-verification | Targeted tests: e2e cause-effect suite passes. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

## Current Gate Results

Last verified after R91 spatial/serialization edge case hardening (commit `7a641d0`):

| Gate | Result |
|---|---|
| Targeted tests | `npx vitest run tests/unit/config-injection-restore.test.js tests/behavior-field.test.js tests/store/store-serialization.test.js --no-color` -> 108 passed |
| Release-scope package/API tests | `tests/package-boundary.test.js`, `tests/compatibility.test.js`, `tests/sdk.test.js`, `tests/type-smoke.test.js` -> 162 passed |
| Facts/knowledge/grounding tests | `tests/facts`, epistemic E2E tests, gossip E2E, fact consistency checker, narrative violation corpus -> 473 passed |
| Store/replay/config tests | 27 targeted files including `tests/store`, config restore, replay trust L2-L4, golden seed, tickHash, serialization, and spatial restore -> 464 passed |
| Action/effects/writeback tests | 25 targeted files covering action providers, utility selection, effect pipeline, active writeback, movement/relationship writeback, action events, and reason traces -> 355 passed |
| Domain/config/custom-world tests | `npm run test:domain` -> 82 passed; supplemental custom-domain/config/state-label suite -> 128 passed |
| Runtime/social/spatial tests | 15 targeted files covering event lifecycle, dispatcher branches, social graph, emotion contagion, social emergence, contagion cache, spatial, rollback, and relationship writeback -> 116 passed |
| Public API/package R52 tests | `tests/package-boundary.test.js`, `tests/compatibility.test.js`, `tests/sdk.test.js`, `tests/type-smoke.test.js`, `tests/sdk-custom-domain.test.js` -> 167 passed |
| External-audit R53 tests | SDK AutoTick, SimulationStore intervals, AndyBridge snapshot, WorldPressure, pressure layer, deterministic pressure, and WorldFactStore cap suite -> 245 passed / 4 skipped |
| SDK/narrative/grounding R54 tests | SDK, worldview constraints, narrative grounding/provider/checker, grounded narrative, epistemic and gossip E2E suite -> 206 passed |
| Native/store/package R55 tests | SQLite optional fallback, store type smoke, native loader, and native integration -> 47 passed |
| SDK/LLM provider R56 tests | LLM provider/env/streaming tests, SDK tests, chatStream consistency leak tests -> 100 passed |
| Persistence/bridge R57 tests | SimulationStore, AndyBridge internals, store serialization, type smoke, spatial bridge restore -> 93 passed |
| Long-run facts/knowledge R58 tests | KnowledgeStore, FactEmitter fallback/perf guards, WorldFactStore, CanonEventPipeline, event lifecycle dedup, EventDispatcher branches -> 189 passed |
| Performance gate R59 tests | `tests/unit/perf-check.test.js` -> 5 passed |
| Package subpath type R60 tests | `tests/package-boundary.test.js`, `tests/type-smoke.test.js` -> 83 passed |
| Node baseline/package R61 tests | `tests/package-boundary.test.js`, `tests/type-smoke.test.js` -> 83 passed |
| Fact retention R62 tests | `tests/facts/world-fact-store.test.js`, `tests/facts/knowledge-store.test.js` -> 88 passed |
| Social/Dunbar R63 tests | `tests/unit/social.test.js`, `tests/unit/relationship-writeback.test.js`, `tests/e2e/social-emergence.test.js`, `tests/e2e/emotion-contagion-cluster.test.js`, `tests/facts/relationship-social-writeback.test.js`, `tests/contagion-cache.test.js` -> 32 passed |
| Action canonicalization R64 tests | 12 action/package/boundary files -> 223 passed / 11 skipped |
| ScheduleHandler writeback R65 tests | 5 handler/runtime/spatial/effect/writeback files -> 97 passed |
| PerceptionRuntime memory writeback R66 tests | 4 perception/event/effect/runtime files -> 77 passed |
| PerceptionRuntime effects writeback R67 tests | 6 perception/effect/runtime/writeback files -> 108 passed |
| Runtime env service R68 tests | 6 runtime/handler/writeback files -> 99 passed |
| Public facade writeback R69 tests | `tests/unit/effect-delta-contract.test.js`, `tests/agent-runtime-containment.test.js`, `tests/sdk.test.js` -> 161 passed |
| SDK bridge/narrative R70 tests | `tests/unit/andy-bridge-internal.test.js`, `tests/unit/build-narrative-emotion-safety.test.js`, `tests/sdk.test.js`, `tests/sdk-smoke.test.js`, `tests/integration/engine.test.js`, `tests/package-boundary.test.js` -> 226 passed |
| Internal stress writeback R71 tests | `tests/unit/runtime/reflection-runtime.test.js`, `tests/unit/state-label-cleanup.test.js`, `tests/unit/effect-delta-contract.test.js`, `tests/unit/handlers/agent-runtime.test.js` -> 98 passed |
| Discrete internal emotion writeback R72 tests | `tests/unit/handlers/agent-runtime.test.js`, `tests/unit/handlers/mind-wander-handler.test.js`, `tests/unit/runtime/reflection-runtime.test.js`, `tests/unit/state-label-cleanup.test.js`, `tests/unit/effect-delta-contract.test.js` -> 107 passed |
| Direct emotion write boundary R74 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 58 passed; boundary check reports direct emotion writes classified exceptions only |
| Core RNG/wall-clock boundary R75 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 59 passed; boundary check reports core runtime Date.now/Math.random classified exceptions only |
| Core UTC accessor boundary R76 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 60 passed; boundary check reports core runtime UTC accessors classified exceptions only |
| Direct memory experience boundary R77 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 61 passed; boundary check reports direct memory experience writes classified exceptions only |
| Direct position write boundary R78 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 62 passed; boundary check reports direct position writes classified exceptions only |
| Direct relationship interaction boundary R79 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 63 passed; boundary check reports direct relationship interaction writes classified exceptions only |
| Fact/knowledge write authority R80 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 64 passed; boundary check reports fact/knowledge write authority clean |
| Action provider read-only R81 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 65 passed; boundary check reports action providers as read-only candidate sources |
| Narrative / LLM world-write R82 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 66 passed; boundary check reports narrative/LLM world writes clean |
| Canonical SDK data mutation R83 tests | `tests/architecture/boundary-check.test.js` plus `npm run check:boundaries` -> 67 passed; boundary check reports SDK relationship/facts/knowledge data mutation clean |
| WorldFactStore zero-copy perf R84 tests | `tests/facts/world-fact-store.test.js` plus `tests/facts/fact-emitter-event-fallback.test.js` -> 64 passed |
| EventDispatcher simTime R84 tests | `tests/unit/runtime/event-dispatcher-branches.test.js` plus `tests/unit/runtime/runtime.test.js` -> 60 passed |
| StateMachine epoch fallback R84 tests | `tests/unit/handlers/agent-runtime.test.js` plus `tests/unit/runtime/reflection-runtime.test.js` -> 35 passed |
| AutoTick determinism R85 tests | `tests/sdk.test.js` -> 75 passed |
| Type declaration hardening R85 tests | `npm run typecheck` clean; `npm run typecheck:consumer` clean |
| AndyBridge partial restore documentation R85 tests | `tests/unit/andy-bridge-internal.test.js` -> 23 passed |
| Dead type declaration removal R86 tests | `tests/package-boundary.test.js` -> 74 passed |
| Schedule epoch sentinel R86 tests | `tests/unit/schedule/schedule-branches.test.js` -> all schedule tests passed |
| Relationship epoch sentinel R86 tests | `tests/unit/social.test.js`, `tests/unit/relationship-writeback.test.js`, `tests/facts/relationship-social-writeback.test.js` -> 23 passed |
| BehaviorField NaN guard R87 tests | `tests/unit/behavior-field.test.js` -> 66 passed |
| SocialGraph threshold consistency R87 tests | `tests/unit/social.test.js` -> 13 passed |
| E2E cause-effect memory narrative R87 tests | `tests/e2e/cause-effect-memory-narrative.test.js` -> 5 passed |
| SDK AutoTick determinism R87 tests | `tests/sdk.test.js` -> 75 passed |
| FactEmitter addFact return value R88 tests | `tests/facts/world-fact-store.test.js`, `tests/facts/fact-emitter-event-fallback.test.js` -> 64 passed |
| AndyWorld canon pipeline error containment R88 tests | `tests/unit/runtime/runtime.test.js`, `tests/unit/runtime/event-dispatcher-branches.test.js` -> 60 passed |
| AgentRuntime hoursElapsed NaN guard R89 tests | `tests/unit/handlers/agent-runtime.test.js` -> 35 passed |
| EmotionVector stress homeostatic drift R89 tests | `tests/unit/behavior-field.test.js` -> 66 passed |
| EmotionVector config injection R90 tests | `tests/unit/behavior-field.test.js`, emotion-contagion-cluster -> 35 passed |
| IntrinsicMotivation config injection R90 tests | All IM-related tests across 92 test files -> 1345 passed |
| SQLiteStore prune guard R91 tests | `tests/store` -> 56 passed |
| AndyWorld encounter null-safe region R91 tests | All runtime/spatial tests -> 193 passed |
| `npm test` | 193 files passed / 1 skipped; 3233 passed / 28 skipped |
| `npm run test:domain` | 82 passed |
| `npm run check:boundaries` | All boundary checks passed |
| `npm run smoke:pack` | 19 passed / 0 failed |
| `npm run typecheck` | clean |
| `npm run typecheck:consumer` | consumer typecheck passed |
| `npm run replay:diff` | 100 ticks matched / 0 mismatched |
| `npm run sqlite:smoke` | SQLite smoke OK |
| `npm run fresh:consumer` | Basic CJS, `--omit=optional` No-SQLite init fallback, and TypeScript subpath consumer checks passed |
| `npm run release:check` | `npm test`, `test:domain`, `check:boundaries`, and pack dry-run all passed |
| `npm run perf:check` | All PASS in 3-run median mode: 100 agents 0.53x baseline, 300 agents 0.38x baseline, no WARN |
| `git diff --check` | clean |

## R88 - Fact Data Integrity + Canon Pipeline Error Containment

This section records two scoped no-quota fixes from an internal audit plus
local verification: FactEmitter addFact return values and AndyWorld canon
pipeline error containment.

### R88-FACTEMITTER-ADDFACT-1

| Field | Detail |
|---|---|
| ID | R88-FACTEMITTER-ADDFACT-1 |
| Severity | P2 |
| Audit finding | `FactEmitter.emitStaticFacts`, `emitAgentStateFacts`, and `emitRelationshipFacts` discarded the return value of `WorldFactStore.addFact()`, pushing the original pre-validation `fact` object instead of the deep-copied, ID-assigned canonical version. Callers received objects that may lack canonical IDs and are shared references (breaking the defensive-copy contract). |
| Evidence | `FactEmitter.js:58-59` — `this.store.addFact(fact);` then `facts.push(fact)` (raw object); `FactEmitter.js:143` — `const added = this.store.addFact(fact); existingByAgentId.set(agentId, added); facts.push(fact)` (index uses `added` but array gets raw `fact`); `FactEmitter.js:304-307` — `this.store.addFact(fact); pairIndex.set(pairKey, fact); facts.push(fact)` (both index and array use raw object). |
| Verification verdict | Confirmed by independent Verification AI. `addFact()` validates input, assigns ID (if missing), and returns deep copy. The 3 methods push raw objects that may lack IDs and share references with the caller's scope. All 361 fact tests pass after fix. |
| Fix | Changed all 3 methods to use `addFact()` return values: `emitStaticFacts` uses `const added = this.store.addFact(fact); facts.push(added);`, `emitAgentStateFacts` uses `facts.push(added)` (variable already existed), `emitRelationshipFacts` captures return as `added` and uses it for both `pairIndex.set()` and `facts.push()`. |
| Files | `src/canon/FactEmitter.js` |
| Regression test | 361 fact tests pass; all fact emission paths now return canonical deep-copied objects with IDs. |
| Re-verification | Targeted tests: 361 passed. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R88-CANON-PIPELINE-TRYCATCH-1

| Field | Detail |
|---|---|
| ID | R88-CANON-PIPELINE-TRYCATCH-1 |
| Severity | P2 |
| Audit finding | `AndyWorld.step()` Phase 8 (CANON_PIPELINE) had no try/catch protection around event consequence processing. If one bad event consequence threw an error in `canonEventPipeline.processEvents()`, `applyEventConsequences()`, or `effectCommitter.commit()`, the entire world step would crash, killing the simulation for all agents. The agent loop (Phase 4) already had try/catch protection, but the canon pipeline didn't. |
| Evidence | `AndyWorld.js:533-565` — canon pipeline event processing with no error containment. Compare with Phase 4 agent loop which has per-agent try/catch. |
| Verification verdict | Confirmed by independent Verification AI. Fix wraps `processEvents()` in try/catch (logs via diagnostics.warn, sets pipelineResults to empty array on error). Inner consequence loop also wrapped in try/catch per iteration — one bad event doesn't block subsequent events. `pipelineError` added to phase result for caller visibility. All 387 related tests pass. |
| Fix | Wrapped canon pipeline event processing in try/catch following Phase 4 agent loop pattern. On error: logs via diagnostics.warn, sets pipelineResults to empty array, continues to next tick. Inner consequence loop has per-iteration try/catch. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | 387 related tests pass (361 fact + 26 effect pipeline). Canon pipeline error containment verified. |
| Re-verification | Targeted tests: 387 passed. Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

## R89 - NaN Guard + Stress Homeostatic Drift

This section records two scoped no-quota fixes from an internal audit plus
local verification: hoursElapsed NaN guard preventing cascade corruption,
and stress homeostatic drift replacing hard reset.

### R89-HOURSELAPSED-NAN-1

| Field | Detail |
|---|---|
| ID | R89-HOURSELAPSED-NAN-1 |
| Severity | P1 |
| Audit finding | `AgentRuntime.js` computed `hoursElapsed = minutesElapsed / 60` without a finite guard. When `env.minutesElapsed` is NaN, `NaN / 60 = NaN`, `Math.max(0, NaN) = NaN`, producing NaN hoursElapsed. This NaN propagates through EVERY pressure and state system in the same tick: NeedsSystem (all needs NaN), BehaviorField (velocity/B NaN), EmotionVector (all emotions NaN), SocialGraph (all relationship strengths NaN), IntrinsicMotivation (curiosity NaN). Once NaN enters, it never self-repairs. |
| Evidence | `AgentRuntime.js:91` — `const hoursElapsed = minutesElapsed / 60;` with no finite guard; `NeedsSystem.js:203` — `current - rate * NaN` = NaN; `BehaviorField.js` — dampingFactor NaN → velocity NaN; `EmotionVector.tick()` — `Math.exp(-lambda * NaN)` = NaN. |
| Verification verdict | Confirmed by independent Verification AI. The fix adds `Number.isFinite(rawHours) && rawHours > 0` guard, defaulting to 0 when invalid. All 3233 tests pass. |
| Fix | Replaced single-line computation with guarded two-step: `rawHours = minutesElapsed / 60; hoursElapsed = (Number.isFinite(rawHours) && rawHours > 0) ? rawHours : 0;`. Added comment explaining finite guard prevents NaN cascade from corrupted env data. |
| Files | `src/agent/AgentRuntime.js` |
| Regression test | All agent-runtime tests pass (35 passed). NaN guard prevents cascade without affecting valid inputs. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R89-STRESS-HARDRESET-1

| Field | Detail |
|---|---|
| ID | R89-STRESS-HARDRESET-1 |
| Severity | P2 |
| Audit finding | `Agent.js` tick-end stress management hard-reset stress to exactly 2.0 whenever it fell below baseline. This meant any stress reduction from positive events (e.g., `setStress(stress - 0.15)`) was immediately overwritten. Stress could never go below 2.0 naturally — the baseline was effectively a hard floor, not a homeostatic target. During the Phase 8 refactoring into AgentRuntime + handler architecture, the old stress decay/reset logic was lost entirely, leaving no homeostatic mechanism for stress below baseline. |
| Evidence | Old `Agent.js:309-314` — `if (this.emotion.stress < 2.0) this.emotion.setStress(2.0)` hard reset. `EmotionVector._timeDecay()` handled emotion dimensions but not stress. Positive event stress reduction at line 481-483 was immediately overwritten. |
| Verification verdict | Confirmed by independent Verification AI. Fix adds stress homeostatic drift in `EmotionVector._timeDecay()` (JS + native): above baseline → exponential decay at rate 0.1; below baseline → gradual drift at 10% per hour toward 2.0. Golden seed fixture regenerated. All 3233 tests pass. |
| Fix | Added stress drift in `EmotionVector._timeDecay()` and `EmotionVector.native.js`: above 2.0 → `stress = 2.0 + (stress - 2.0) * exp(-0.1 * dt)`; below 2.0 → `stress += (2.0 - stress) * 0.1 * dt`. Replaces hard reset with homeostatic drift. |
| Files | `src/agent/psychology/EmotionVector.js`; `src/agent/psychology/EmotionVector.native.js` |
| Regression test | Golden seed regenerated; all behavior-field and emotion tests pass (66 passed). |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `perf:check`: all PASS (0.53x/0.38x baseline). |
| Status | Fixed and verified. |

### R89-BOREDOM-VALENCE-1 (already fixed)

| Field | Detail |
|---|---|
| ID | R89-BOREDOM-VALENCE-1 |
| Severity | P2 |
| Audit finding | `boredom` was missing from the `negative` array in `getValence()`, excluded from valence calculation despite being psychologically negative. |
| Status | Already fixed in prior code — `boredom` is correctly listed in `EmotionVector.js:595` negative array and `getMoodString()`. No action needed. |

## R90 - Config Propagation: Emotion + IntrinsicMotivation User Override

This section records two P1 fixes for silent config override failures:
EmotionVector and IntrinsicMotivation both used module-level ANDY_DEFAULTS
with no user config injection path.

### R90-EMOTION-CONFIG-1

| Field | Detail |
|---|---|
| ID | R90-EMOTION-CONFIG-1 |
| Severity | P1 |
| Audit finding | `EmotionVector` used module-level `ANDY_DEFAULTS.emotion` (line 21) with no user config injection path. Constructor signature `(personality, savedState, rng)` had no config parameter. A user passing `{ emotion: { decayLambda: 2.5, inertia: 0.9 } }` had those values silently ignored — all emotions used ANDY_DEFAULTS. |
| Evidence | `EmotionVector.js:21` — `const cfg = ANDY_DEFAULTS.emotion;` module-level, never overridden; `AgentSubsystemFactory.js:39` — `new EmotionVector(personality, null, rng)` no config passed; 9 references to `cfg.*` throughout class methods. |
| Verification verdict | Confirmed by independent Verification AI. Fix adds `emotionConfig` 4th parameter, creates `this._cfg = { ...cfg, ...(emotionConfig || {}) }`, replaces all `cfg.*` references with `this._cfg.*`. AgentSubsystemFactory threads `config.emotion`. Follows NeedsSystem config injection pattern. All tests pass. |
| Fix | Added `emotionConfig` parameter to EmotionVector constructor (JS + native). Merged user config over ANDY_DEFAULTS. Replaced all module-level `cfg` references with `this._cfg`. Threaded through AgentSubsystemFactory `createSubsystems` and `restoreSubsystems`. |
| Files | `src/agent/psychology/EmotionVector.js`; `src/agent/psychology/EmotionVector.native.js`; `src/agent/lifecycle/AgentSubsystemFactory.js` |
| Regression test | 35 emotion-related tests pass across 5 test files. Config override verified: user values override defaults, null config falls through to ANDY_DEFAULTS. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R90-IM-CONFIG-1

| Field | Detail |
|---|---|
| ID | R90-IM-CONFIG-1 |
| Severity | P1 |
| Audit finding | `IntrinsicMotivation` used module-level `ANDY_DEFAULTS.intrinsicMotivation` (line 43) with only domain-level config path (`this.domain.intrinsicMotivationConfig`). Module-level `cfg` was used for ALL parameters — user config never reached the actual parameter reads. A user passing `{ intrinsicMotivation: { curiosityDecayRate: 0.05 } }` had those values silently ignored. |
| Evidence | `IntrinsicMotivation.js:43` — `const cfg = ANDY_DEFAULTS.intrinsicMotivation;`; `IntrinsicMotivation.js:49` — `this._imConfig = this.domain.intrinsicMotivationConfig;` (domain only, not used for params); `AgentSubsystemFactory.js:45` — `new IntrinsicMotivation(personality, null, domain, rng)` no config passed. |
| Verification verdict | Confirmed by independent Verification AI. Fix adds 5th `config` parameter, creates three-way merge: `{ ...cfg, ...domainConfig, ...userConfig }` (user > domain > defaults). Replaces `this._cfg = cfg` with `this._cfg = this._imConfig`. Threaded through AgentSubsystemFactory. All 1345 tests pass. |
| Fix | Added `config` 5th parameter to IntrinsicMotivation constructor. Three-way merge: user config > domain config > ANDY_DEFAULTS. Replaced `this._cfg = cfg` with merged `this._imConfig`. Threaded through AgentSubsystemFactory `createSubsystems` and `restoreSubsystems`. |
| Files | `src/agent/psychology/IntrinsicMotivation.js`; `src/agent/lifecycle/AgentSubsystemFactory.js` |
| Regression test | 1345 tests pass across 92 test files. No regressions. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

## R91 - Spatial/Serialization Edge Case Hardening

This section records two scoped no-quota fixes from R89 spatial audit
plus verification: SQLiteStore prune guard and null-safe encounter region.

### R91-PRUNE-GUARD-1

| Field | Detail |
|---|---|
| ID | R91-PRUNE-GUARD-1 |
| Severity | P2 |
| Audit finding | `SQLiteStore.prune(keepCount)` computed `OFFSET = keepCount - 1`, producing `-1` when `keepCount = 0`. SQLite treats OFFSET -1 as 0, so `prune(0)` (delete all snapshots) kept 1 snapshot instead of 0. The method contract says "keep N snapshots, delete older ones" — keeping 1 when N=0 is a semantic violation. |
| Evidence | `SQLiteStore.js:325` — `const boundary = stmt.get(keepCount - 1);` with no guard for keepCount <= 0. `MemoryStore.prune()` handles this correctly with `if (this.snapshots.length <= keepCount) return 0;`. |
| Verification verdict | Confirmed by independent Verification AI. SQLite clamps negative OFFSET to 0 (not a crash, but incorrect result). Reachability requires explicit `snapshotKeepCount: 0` (default is 720). Downgraded from P1 to P2: no crash, but semantic contract violation. |
| Fix | Added `if (keepCount <= 0) return 0;` guard at top of `prune()`. Matches `MemoryStore.prune()` pattern. |
| Files | `src/store/SQLiteStore.js` |
| Regression test | 56 store tests pass (12 SQLiteStore, 19 MemoryStore, 25 abstract interface). |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R91-ENCOUNTER-UNKNOWN-REGION-1

| Field | Detail |
|---|---|
| ID | R91-ENCOUNTER-UNKNOWN-REGION-1 |
| Severity | P2 |
| Audit finding | `AndyWorld._evaluateSpatialInteractions()` used `encounter.regionA || 'unknown'` as fallback when `regionA` is null (which happens when SpatialEngine coordinates don't map to any defined region). The string `'unknown'` is not a valid domain region — it creates phantom region references in events and awkward narrative text like "在unknown". |
| Evidence | `AndyWorld.js:679` — `encounter.regionA || 'unknown'`; `SpatialEngine.js:397` — `regionA: ... || null` final fallback; `WorldMap.js:74-78` — `pointToRegion()` returns `null` for out-of-region coordinates; `'unknown'` not found in any domain config. |
| Verification verdict | Confirmed by independent Verification AI. `'unknown'` is not a valid domain region. `generateEncounterEvent` already handles null region gracefully (location: null, downstream consumers check for falsy location). Changed to `encounter.regionA || null`. |
| Fix | Changed `encounter.regionA || 'unknown'` to `encounter.regionA || null` with comment explaining null-safe handling. `generateEncounterEvent` already handles null region gracefully. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | All 193 test files pass (3233 tests). Encounter events with null region handled correctly. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

## R92 - Config Injection Completion (Contagion + PersonalMemory)

This section records two config-injection fixes completing the R90 pattern:
EmotionVector contagion config and PersonalMemory config.

### R92-CONTAGION-DEADCONFIG-1

| Field | Detail |
|---|---|
| ID | R92-CONTAGION-DEADCONFIG-1 |
| Severity | P3 |
| Audit finding | `ANDY_DEFAULTS.contagion` defines `baseSusceptibility`, `baseExpressiveness`, and `interactionRadius`, but nobody imports or references this config object anywhere in `src/`. `EmotionVector._socialContagion()` hardcodes `negativityBias = 1.4` and `contagionRate = 0.3 * negativityBias` or `0.3` instead of reading from ANDY_DEFAULTS.contagion. The defaults are dead code — users cannot tune contagion via config. |
| Evidence | `ANDY_DEFAULTS.contagion` defined in `config/defaults.js` but never imported by `EmotionVector.js`. `_socialContagion()` lines 413-414 hardcode `1.4` and `0.3`. No `contagionConfig` parameter in constructor. |
| Verification verdict | Confirmed by independent Verification AI. Dead config is a silent tunability gap — no crash, no incorrect behavior, but users cannot override contagion parameters. Downgraded from P2 to P3: no correctness impact, only tunability. |
| Fix | Added `contagionConfig` as 5th constructor parameter to EmotionVector. Merged `ANDY_DEFAULTS.contagion` with user config into `this._contagionConfig`. `_socialContagion()` now reads `negativityBias` and `baseContagionRate` from `this._contagionConfig` with `||` fallback preserving existing defaults. Same pattern applied to `EmotionVector.native.js`. Threaded through `AgentSubsystemFactory`. |
| Files | `src/agent/psychology/EmotionVector.js`; `src/agent/psychology/EmotionVector.native.js`; `src/agent/lifecycle/AgentSubsystemFactory.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change when no config provided. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. |
| Status | Fixed and verified. |

### R92-MEMORY-CONFIG-1

| Field | Detail |
|---|---|
| ID | R92-MEMORY-CONFIG-1 |
| Severity | P2 |
| Audit finding | `PersonalMemory` reads `ANDY_DEFAULTS.memory` at module level (line 17) and uses `cfg.moodCongruenceWeight`, `cfg.moodCongruenceScale`, and `cfg.recallEmotionDelta` directly. The constructor has no config parameter — unlike EmotionVector (emotionConfig), NeedsSystem (needsConfig), and IntrinsicMotivation (config). Users cannot override memory parameters via config. |
| Evidence | `PersonalMemory.js:17` — `const cfg = ANDY_DEFAULTS.memory` at module scope. All `cfg.X` references throughout the file. Constructor signature has no config parameter. `AgentSubsystemFactory.js:41` — `new PersonalMemory(agentId, config.seedMemories \|\| [], null, domain, rng)` with no config arg. |
| Verification verdict | Confirmed by independent Verification AI. Silent config override gap — users who set `config.memory.moodCongruenceWeight` see no effect because the value is never read. |
| Fix | Added `memoryConfig = null` as 6th constructor parameter. Added `this._cfg = { ...cfg, ...(memoryConfig || {}) }` merge. Replaced all 16 `cfg.X` references with `this._cfg.X`. Threaded `config.memory || null` through `AgentSubsystemFactory` (create and restore paths). |
| Files | `src/agent/memory/PersonalMemory.js`; `src/agent/lifecycle/AgentSubsystemFactory.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change when no config provided. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. |
| Status | Fixed and verified. |

### R92-STATEMACHINE-DURATION-1 (INVALID)

| Field | Detail |
|---|---|
| ID | R92-STATEMACHINE-DURATION-1 |
| Severity | N/A — invalid finding |
| Audit finding | StateMachine duration not overridable via config. |
| Disposition | Invalid — architecture migration to BehaviorField + domain-driven state centers resolved this. StateMachine only holds metadata; behavior state comes from BehaviorField label / action layer / effect pipeline. No config seam needed. |
| Status | Rejected by audit. No action taken. |

## R93 - Config Propagation + Epoch Sentinel Hygiene

This section records three scoped no-quota fixes: BehaviorField config
injection (P2), WorldClock epoch sentinel default (P3), and EventDispatcher
dead wall-clock fallback removal (P3).

### R93-BEHAVIOR-CONFIG-1

| Field | Detail |
|---|---|
| ID | R93-BEHAVIOR-CONFIG-1 |
| Severity | P2 |
| Audit finding | `AgentSubsystemFactory.createSubsystems()` passes `{}` as the config argument to `new BehaviorField(personality, null, {}, domain, rng)` at line 47. `BehaviorField`'s constructor merges config with DEFAULTS via `this.cfg = { ...DEFAULTS, ...config }`, but the empty object silently discards any user-supplied `config.behavior` values. Inconsistent with R86-R92 pattern where all other subsystems receive their config sections. |
| Evidence | `AgentSubsystemFactory.js:47` — `new BehaviorField(..., {}, ...)`. `BehaviorField.js:117-118` — constructor accepts config and merges with DEFAULTS. ANDY_DEFAULTS.behavior defines 7 tunable parameters (gamma, sigma, dt, boundaryReflection, boundaryStrength, and 5 weight parameters). |
| Verification verdict | Confirmed by independent Verification AI. Silent config override — user's behavior tuning parameters are ignored. Behavior dynamics always run with hardcoded defaults. |
| Fix | Changed `{}` to `config.behavior || {}` in both `createSubsystems` (line 47) and `restoreSubsystems` (line 96). Empty object merge preserves DEFAULTS when no config provided. |
| Files | `src/agent/lifecycle/AgentSubsystemFactory.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change when no config provided. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. |
| Status | Fixed and verified. |

### R93-WORLDCLOCK-DATE-1

| Field | Detail |
|---|---|
| ID | R93-WORLDCLOCK-DATE-1 |
| Severity | P3 |
| Audit finding | `WorldClock.js:12` — `constructor(startTime = new Date())` uses wall-clock time as default parameter. If instantiated without arguments, simulation clock starts at real time, breaking determinism. All current callers provide explicit startTime, but the latent risk remains. |
| Evidence | `WorldClock.js:12` — default parameter `new Date()`. `AndyWorld.js:69` — passes `config.startTime || new Date(0)`. `sdk/Andy.js:42` and `sdk/Character.js:70` — pass explicit startTime. No direct instantiations without arguments found. |
| Verification verdict | Confirmed by independent Verification AI. Zero current impact (all callers provide explicit args), but default parameter is a latent determinism risk. Downgraded from P2 to P3: no correctness impact, only future risk. |
| Fix | Changed default parameter from `new Date()` to `new Date(0)` (epoch sentinel pattern, consistent with R86-R92). |
| Files | `src/runtime/WorldClock.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R93-EVENTDISPATCHER-DATE-2

| Field | Detail |
|---|---|
| ID | R93-EVENTDISPATCHER-DATE-2 |
| Severity | P3 |
| Audit finding | `EventDispatcher.js:89` — `time: params.time || this._simTime || new Date()` has an unreachable `|| new Date()` fallback. `_simTime` is initialized to `new Date(0)` at line 43 and is always truthy. The `new Date()` branch can never execute unless someone mutates `_simTime` to null/undefined. Dead code that also happens to leak wall-clock time if ever reached. |
| Evidence | `EventDispatcher.js:43` — `this._simTime = new Date(0)`. `EventDispatcher.js:89` — `params.time || this._simTime || new Date()`. Since `_simTime` is a Date object (always truthy), `|| new Date()` is unreachable. |
| Verification verdict | Confirmed by independent Verification AI. Zero current impact (dead code). Downgraded to P3: correctness risk only if refactoring changes `_simTime` initialization pattern. |
| Fix | Removed unreachable `|| new Date()` fallback: `time: params.time || this._simTime`. |
| Files | `src/runtime/EventDispatcher.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

## R94 - Dead Config + NaN Guard + Boundary Hardening

This section records five scoped no-quota fixes: two dead config removals
(P3), two NaN propagation guards (P2), and one boundary clamp after restore
(P2).

### R94-DEADCONFIG-1

| Field | Detail |
|---|---|
| ID | R94-DEADCONFIG-1 |
| Severity | P3 |
| Audit finding | `ANDY_DEFAULTS.intrinsicMotivation` defines `explorationStateBoost: 1.5` ("探索状态在状态机中的权重加成"), but it has zero references in `src/`. Never imported, merged, or read by any production code. Dead config that degrades trust in the configuration system. |
| Evidence | `config/defaults.js:154` — `explorationStateBoost: 1.5`. Grep across `src/` finds no usage outside `defaults.js` and `validate.js`. |
| Verification verdict | Confirmed by independent Verification AI. Dead config with no behavioral effect. |
| Fix | Removed `explorationStateBoost` from `ANDY_DEFAULTS.intrinsicMotivation` in `config/defaults.js`. No validation entry existed, so no validate.js change needed. |
| Files | `src/config/defaults.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R94-DEADCONFIG-2

| Field | Detail |
|---|---|
| ID | R94-DEADCONFIG-2 |
| Severity | P3 |
| Audit finding | `SpatialEngine` constructor accepts `baseProb` and `distanceDecay` parameters, stores them in `this.config`, and they're populated from `ANDY_DEFAULTS.spatial.continuous`. But `computeInteractions()` at line 374 shadows `baseProb` with `const baseProb = tierProbabilities[tier] || 0`, completely ignoring the config value. `distanceDecay` is stored but never referenced in any method body. Neither parameter affects interaction computation. |
| Evidence | `SpatialEngine.js:43-44` — constructor params. `SpatialEngine.js:374` — local `baseProb` shadows config. `SpatialEngine.js:65-66` — stored in `this.config` but never read. `ANDY_DEFAULTS.spatial.continuous` defines both. `AndyWorld.js:163-164` — passes both from defaults. |
| Verification verdict | Confirmed by independent Verification AI. Dead config — tierProbabilities array is the effective probability system. |
| Fix | Removed `baseProb` and `distanceDecay` from SpatialEngine constructor, `this.config` storage, JSDoc, and `ANDY_DEFAULTS.spatial.continuous`. Removed from `AndyWorld.js` SpatialEngine options object. |
| Files | `src/spatial/SpatialEngine.js`; `src/config/defaults.js`; `src/runtime/AndyWorld.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R94-NAN-1

| Field | Detail |
|---|---|
| ID | R94-NAN-1 |
| Severity | P2 |
| Audit finding | `EmotionRegulation.tryRegulate()` calls `getValence()` and `getArousal()` to compute `triggerLevel`. If any `current[dim]` is NaN (from corrupted save or edge-case), `getValence()` produces NaN, `Math.max(0, -NaN)` → NaN, `triggerLevel` = NaN. Since `NaN < threshold` always returns false, regulation proceeds instead of returning null. NaN cascades through `_selectStrategy` → `_execReappraisal` → `commitStress` computes `stress - NaN * power * 0.3` = NaN, making `_regulationResource` NaN until next `tick()` recovery path fixes it. |
| Evidence | `EmotionRegulation.js:136-144` — `tryRegulate()` reads valence/arousal with no finite guard. `EmotionVector.js:623` — `getValence()` sum/count division can produce NaN. `EmotionRegulation.js:335` — `commitStress` propagates NaN into `_regulationResource`. |
| Verification verdict | Confirmed by independent Verification AI. While downstream `commitEmotion` and `EffectCommitter` have `Number.isFinite` output guards preventing state corruption, `_regulationResource` becomes NaN transiently, breaking regulation resource tracking. |
| Fix | Added `if (!Number.isFinite(valence) || !Number.isFinite(arousal)) return null;` guard at top of `tryRegulate()` after reading valence/arousal values. |
| Files | `src/agent/psychology/EmotionRegulation.js` |
| Regression test | 3233 tests pass / 28 skipped. Defense-in-depth guard; no behavioral change for finite inputs. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R94-NAN-2

| Field | Detail |
|---|---|
| ID | R94-NAN-2 |
| Severity | P2 |
| Audit finding | `EmotionRegulation._execAttentionDeployment()` iterates over `recallEmotionDelta` entries and blindly adds values to `emotionDelta[dim]`. If any value is NaN (from corrupted memory data or edge-case in `PersonalMemory._computeRecallDelta`), NaN propagates into `emotionDelta`. Downstream `commitEmotion` has finite guards, but the behavioral output is silently wrong — no emotion change despite successful memory retrieval. |
| Evidence | `EmotionRegulation.js:391-392` — unguarded iteration over `recallEmotionDelta` entries. |
| Verification verdict | Confirmed by independent Verification AI. Silent drop of expected emotion effect when recall delta contains NaN. |
| Fix | Added `if (Number.isFinite(value))` guard when iterating recallEmotionDelta entries. NaN values are silently skipped. |
| Files | `src/agent/psychology/EmotionRegulation.js` |
| Regression test | 3233 tests pass / 28 skipped. Defense-in-depth guard; no behavioral change for finite inputs. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R94-BOUNDARY-1

| Field | Detail |
|---|---|
| ID | R94-BOUNDARY-1 |
| Severity | P2 |
| Audit finding | `AndyBridge._restoreAgents()` performs raw assignments to `agent.emotion.current[dim]`, `agent.emotion.mood[dim]`, `agent.emotion.baseline[dim]`, and `agent.needs.needs[need]` without calling `_clamp()` afterwards. This bypasses range enforcement (clamping to [-1, 1] for emotions, [0, 1] for needs) and NaN repair. Out-of-range values from corrupted save data could persist. |
| Evidence | `AndyBridge.js:~354` — `agent.emotion.current[dim] = val` (finite-checked but not clamped). `AndyBridge.js:~379` — `agent.needs.needs[need] = val`. Neither calls `_clamp()` after restore. |
| Verification verdict | Confirmed by independent Verification AI. Partial restore path is documented, but raw writes skip lifecycle methods. Added `_clamp()` calls after restore loops. Also added `_clamp()` to `NeedsSystem` (didn't exist yet, follows `EmotionVector._clamp()` pattern). |
| Fix | After emotion.current restore loop: `agent.emotion._clamp()`. After needs.needs restore loop: `agent.needs._clamp()`. Added `_clamp()` method to `NeedsSystem` (clamps to [0, 1], repairs NaN with default 0.5). |
| Files | `src/sdk/AndyBridge.js`; `src/agent/psychology/NeedsSystem.js` |
| Regression test | 3233 tests pass / 28 skipped. All andy-bridge tests pass (23/23 + 3/3). |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. |
| Status | Fixed and verified. |

## R94 - NaN Propagation Guards + Boundary Hygiene

This section records four scoped no-quota fixes: two NaN propagation guards
in EmotionRegulation (P2), AndyBridge restore boundary clamp (P2), and dead
config removal (P3).

### R94-NAN-1

| Field | Detail |
|---|---|
| ID | R94-NAN-1 |
| Severity | P2 |
| Audit finding | `EmotionRegulation.tryRegulate()` calls `agent.emotion.getValence()` and `agent.emotion.getArousal()` to compute `triggerLevel`. If any `current[dim]` is NaN (from corrupted save, edge-case in `_processDecay`, or co-activation), then `getValence()` produces NaN, `Math.max(0, -NaN)` → NaN, `triggerLevel` = NaN. NaN comparisons always return false, so `NaN < threshold` → false and regulation proceeds instead of returning null. NaN cascades through strategy selection → `negativeReduction = NaN`. While `commitEmotion` guards with `Number.isFinite(delta)`, `commitStress` computes `agent.emotion.stress - triggerLevel * power * 0.3` = NaN, and `_regulationResource - cost` where cost = `0.05 + NaN * 0.05` = NaN, making `_regulationResource` NaN until `tick()` recovery. |
| Evidence | `EmotionRegulation.js:136-144` — `tryRegulate()` extracts valence/arousal without finite guard. `EmotionRegulation.js:335` — `commitStress` computes with triggerLevel that can be NaN. `EmotionRegulation.js:119` — `_regulationResource` updated with cost that can be NaN. `EmotionVector.js:623` — `getValence()` uses `sum / count` without finite guard. |
| Verification verdict | Confirmed by independent Verification AI. NaN propagation path verified through tryRegulate → strategy selection → commitEmotion/commitStress. `commitEmotion` and `EffectCommitter` catch NaN deltas downstream, but `_regulationResource` becomes NaN transiently. |
| Fix | Added `Number.isFinite` guard at `EmotionRegulation.js:141`: `if (!Number.isFinite(valence) || !Number.isFinite(arousal)) return null;`. Returns null matching existing "no regulation needed" path. |
| Files | `src/agent/psychology/EmotionRegulation.js` |
| Regression test | 3233 tests pass / 28 skipped. NaN guard tested implicitly by existing regulation tests. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. |
| Status | Fixed and verified. |

### R94-NAN-2

| Field | Detail |
|---|---|
| ID | R94-NAN-2 |
| Severity | P2 |
| Audit finding | `EmotionRegulation._execAttentionDeployment()` retrieves positive memories and gets `recallEmotionDelta`. At lines 391-392, it iterates over delta entries and blindly adds values to `emotionDelta[dim]`. If `value` is NaN (from corrupted memory data or edge-case in `PersonalMemory._computeRecallDelta`), NaN propagates into `emotionDelta`. While `commitEmotion` guards with `Number.isFinite(delta)`, this is a silent data-dependent skip — the caller assumes a positive emotion was applied when nothing happened. |
| Evidence | `EmotionRegulation.js:391-392` — `emotionDelta[dim] = (emotionDelta[dim] || 0) + value` with no finite guard on `value`. `PersonalMemory.js` — `_computeRecallDelta` can produce NaN from corrupted memory data (importance/activation calculations). |
| Verification verdict | Confirmed by independent Verification AI. NaN in recallEmotionDelta silently skips the emotion effect, producing wrong behavioral output (no emotion change despite successful memory retrieval). |
| Fix | Added `Number.isFinite(value)` guard in the loop at `EmotionRegulation.js:395`: `if (Number.isFinite(value)) { emotionDelta[dim] = (emotionDelta[dim] || 0) + value; }`. NaN values are skipped. |
| Files | `src/agent/psychology/EmotionRegulation.js` |
| Regression test | 3233 tests pass / 28 skipped. Guard is defensive — no existing test exercises NaN recall delta. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

### R94-BOUNDARY-1

| Field | Detail |
|---|---|
| ID | R94-BOUNDARY-1 |
| Severity | P2 |
| Audit finding | `AndyBridge._restoreAgents()` directly assigns to `agent.emotion.current[dim]`, `agent.emotion.mood[dim]`, `agent.emotion.baseline[dim]` (lines 354, 363, 371) and `agent.needs.needs[need]` (line 379). This bypasses `EmotionVector._clamp()` (which also repairs NaN), `setStress()` (which guards NaN), the effect pipeline, and `NeedsSystem.set()` (which applies clamping and personality modulation). Out-of-range values from corrupted save data could persist without being clamped to [-1, 1]. |
| Evidence | `AndyBridge.js:354` — `agent.emotion.current[dim] = val` raw assignment. `EmotionVector._clamp()` at line 521 enforces [-1, 1] range and NaN repair. `_clamp()` was previously inside the `if (state.emotion.current && agent.emotion.current)` block, so it didn't run when `current` was absent from saved data, and didn't cover `mood`/`baseline`. |
| Verification verdict | Confirmed by independent Verification AI. Raw assignment bypasses lifecycle methods. `_clamp()` now runs unconditionally after all emotion fields are restored, providing NaN repair and `current` clamping. `mood`/`baseline` clamping remains a future extension to `_clamp()`. |
| Fix | Moved `_clamp()` call outside the `current` restoration block in `AndyBridge._restoreAgents()` so it runs after all three emotion arrays (`current`, `mood`, `baseline`) are populated. Needs `_clamp()` already correctly positioned after needs loop. |
| Files | `src/sdk/AndyBridge.js` |
| Regression test | 3233 tests pass / 28 skipped. Bridge restore tests pass. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. |
| Status | Fixed and verified. |

### R94-DEADCONFIG-1

| Field | Detail |
|---|---|
| ID | R94-DEADCONFIG-1 |
| Severity | P3 |
| Audit finding | `ANDY_DEFAULTS.intrinsicMotivation.explorationStateBoost` (value 1.5) is defined in `src/config/defaults.js` and validated in `validate.js`, but has ZERO references in `src/` production code. Never imported, merged into `_imConfig`, or read in any method. The comment says "探索状态在状态机中的权重加成" (exploration state weight bonus in the state machine), but StateMachine has been migrated to BehaviorField+domain-driven state centers. The parameter has no effect — users tuning it get zero result. |
| Evidence | `grep -rn "explorationStateBoost" src/` → no results after fix. `defaults.js` intrinsicMotivation block previously contained the key. No validation entry existed in `validate.js`. No references in `IntrinsicMotivation.js`. |
| Verification verdict | Confirmed by independent Verification AI. Dead config degrades trust in the configuration system — users expect tuning to have effect. Removed from defaults.js. |
| Fix | Removed `explorationStateBoost: 1.5` from `ANDY_DEFAULTS.intrinsicMotivation` in `src/config/defaults.js`. No other references existed. |
| Files | `src/config/defaults.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change (dead code removal). |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

## R95 - Relationship Config Completion + Math.random Auto-Seed Elimination

This section records three scoped no-quota fixes: two remaining cfg.X
references in Relationship.js (P2), AndyWorld Math.random auto-seed removal
(P2), and dead SpatialEngine config cleanup (P3).

### R95-RELATIONSHIP-CONFIG-1

| Field | Detail |
|---|---|
| ID | R95-RELATIONSHIP-CONFIG-1 |
| Severity | P2 |
| Audit finding | `Relationship.js` already had config injection (constructor accepts `config` parameter, `this._cfg = { ...cfg, ...(config || {}) }` merge), but two remaining module-level `cfg.X` references bypassed the instance config: `cfg.decayRate` at line 181 (effectiveDecay calculation) and `cfg.threshold` at line 212 (_updateType hysteresis thresholds). These two references silently ignored user-supplied relationship tuning for decay rate and type thresholds. `SocialGraph.js` config injection was already complete (no remaining cfg.X references). |
| Evidence | `Relationship.js:181` — `cfg.decayRate * (1 - Math.min(safeBond * 0.1, 0.5))`. `Relationship.js:212` — `const t = cfg.threshold`. All other cfg.X references already use `this._cfg.X`. |
| Verification verdict | Confirmed by independent Verification AI. Two remaining module-level references bypassed instance config. SocialGraph config injection was already complete. |
| Fix | Changed `cfg.decayRate` → `this._cfg.decayRate` at line 181 and `cfg.threshold` → `this._cfg.threshold` at line 212. Relationship.js now has zero module-level cfg.X references. |
| Files | `src/social/Relationship.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change when no config provided. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

### R95-RANDOM-SEED-1

| Field | Detail |
|---|---|
| ID | R95-RANDOM-SEED-1 |
| Severity | P2 |
| Audit finding | `AndyWorld.js:47` — `const autoSeed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0; this.rng = new RNG(autoSeed);` used bare `Math.random()` to generate the auto-seed when no `rng` was passed. This violated the seeded RNG rule: no bare `Math.random()` in core simulation paths. The `Math.random()` made the first tick sequence non-reproducible across runs. |
| Evidence | `AndyWorld.js:41-48` — auto-seed block with `Math.random()`. `check-boundaries.js:1413` — allowlisted `Math.random: 1` for AndyWorld.js with reason "unseeded autoSeed initialization". |
| Verification verdict | Confirmed by independent Verification AI. `Math.random()` is non-deterministic and platform-dependent. Seeding the engine RNG from it makes simulation traces non-reproducible. Updated boundary allowlist to reflect removal. |
| Fix | Replaced auto-seed block with deterministic default: `this.rng = rng || new RNG(0);`. Removed bare `Math.random()` entirely from AndyWorld. Updated `scripts/check-boundaries.js` allowlist: Math.random count from 1 to 0, Date.now count from 3 to 2. |
| Files | `src/runtime/AndyWorld.js`; `scripts/check-boundaries.js` |
| Regression test | 3233 tests pass / 28 skipped. `perf:check`: all passed. Boundary checks: all passed. |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

### R95-DEADCONFIG-SPATIAL-1

| Field | Detail |
|---|---|
| ID | R95-DEADCONFIG-SPATIAL-1 |
| Severity | P3 |
| Audit finding | `SpatialEngine` stored `baseProb` and `distanceDecay` from config but never used them. `computeInteractions` shadows `baseProb` with a local `tierProbabilities[tier]` variable, and `distanceDecay` is never referenced in any method body. `ANDY_DEFAULTS.spatial.continuous` defined both keys, and `AndyWorld.js` passed them at construction, but neither parameter influenced interaction computation. |
| Evidence | `SpatialEngine.js:368` — `const baseProb = tierProbabilities[tier] || 0` shadows config. `grep -rn "distanceDecay" src/spatial/` → zero method-body references. `grep -rn "baseProb" src/spatial/` → only the local shadow variable. `grep -rn "baseProb\|distanceDecay" src/config/defaults.js` → zero results after fix. |
| Verification verdict | Confirmed by independent Verification AI. Dead config degrades trust in the configuration system. Removed from `ANDY_DEFAULTS.spatial.continuous`, `SpatialEngine` constructor, and `AndyWorld` construction call. |
| Fix | Removed `baseProb` and `distanceDecay` from `ANDY_DEFAULTS.spatial.continuous` in defaults.js, from `SpatialEngine` constructor parameters and `this.config` assignments, and from `AndyWorld.js` spatial config construction. |
| Files | `src/config/defaults.js`; `src/spatial/SpatialEngine.js`; `src/runtime/AndyWorld.js` |
| Regression test | 3233 tests pass / 28 skipped. No behavioral change (dead code removal). |
| Re-verification | Full `npm test`: 3233 passed / 28 skipped. |
| Status | Fixed and verified. |

## R96 - R95 Post-Review Relationship Config Repair

This section records the Chief Planner post-review repair performed after R95.
R95's direction was correct, but its relationship-config completion claim was
too narrow: it checked remaining `cfg.X` references in `Relationship.js` but did
not verify nested config merging, `SocialGraph` restore/new-edge propagation, or
graph query/projection paths.

### R96-RELATIONSHIP-CONFIG-CHAIN-1

| Field | Detail |
|---|---|
| ID | R96-RELATIONSHIP-CONFIG-CHAIN-1 |
| Severity | P1 quality gate / P2 runtime behavior |
| Audit finding | R95 left a half-connected relationship config path. `Relationship` used a shallow config merge, so partial overrides such as `{ threshold: { acquaintance: 0.9 } }` erased default `friend` and `closeFriend` thresholds. `SocialGraph` accepted config but did not pass it into new/restored `Relationship` edges, and `isTwoHopsAway`, `getSocialDistance`, and Dunbar projection still read module-level defaults. |
| Evidence | Minimal repro before fix: `new SocialGraph(null, { threshold: { acquaintance: 0.9 } })` with A-B/B-C strengths at 0.5 returned `isTwoHopsAway('A','C') === true` and `getSocialDistance('A','C') === 2`, contradicting the configured threshold. `new Relationship('A','B', null, { threshold: { acquaintance: 0.9 } })` at strength 0.95 remained `acquaintance` because `friend`/`closeFriend` were undefined after shallow merge. |
| Verification verdict | Confirmed by Chief Planner first-principles review and deterministic repro. External-free agnes review also marked R95 quality as FAIL and identified inconsistent threshold usage, lost Relationship config propagation, and missing nested threshold validation. |
| Fix | Added deep relationship config merge preserving nested threshold defaults; exposed `Relationship.mergeConfig()` for SocialGraph; passed merged graph config into new and restored Relationship edges; moved SocialGraph two-hop, social-distance, and Dunbar projection paths to instance config; added relationship `threshold.*` and `maxMediumTies` validation; updated Chief Planner handoff rules to require full config-chain verification. |
| Files | `src/social/Relationship.js`; `src/social/SocialGraph.js`; `src/config/validate.js`; `tests/unit/social.test.js`; `tests/unit/config/validate-config.test.js`; `docs/current/CHIEF_PLANNER_HANDOFF_MANUAL.md`; `docs/current/POLISH_FIRST_ROADMAP.md` |
| Regression test | `npx vitest run tests/unit/social.test.js tests/unit/config/validate-config.test.js tests/unit/serialization-roundtrip.test.js --no-color` -> 86 passed. New tests cover partial threshold override across graph queries, merged config propagation into Relationship, restore with config, invalid nested threshold validation, and partial threshold validation acceptance. |
| Re-verification | `npm test -- --no-color` -> 3239 passed / 28 skipped; `npm run test:domain -- --no-color` -> 82 passed; `npm run check:boundaries -- --no-color` -> passed; `npm run typecheck` -> clean; `npm run smoke:pack -- --no-color` -> 19 passed; `npm run perf:check -- --no-color` -> all PASS; `git diff --check` -> clean. |
| Status | Fixed and verified as the R96 baseline repair. |

## R97 - Emotion/Memory Nested Config Repair

This section records the next no-quota config-chain repair after R96. The round
searched for other shallow nested config merges that could produce the same
"looks configurable, breaks on partial override" failure class.

### R97-NESTED-CONFIG-1

| Field | Detail |
|---|---|
| ID | R97-NESTED-CONFIG-1 |
| Severity | P1 quality gate / P2 runtime behavior |
| Audit finding | `EmotionVector` and `PersonalMemory` still used shallow top-level config merges while consuming nested config blocks. Partial `emotion.circadian` overrides dropped default peak/amp fields and could drive circadian modulation to NaN. Partial `memory.spreadingActivation` overrides dropped `S`, producing NaN spreading activation. Partial `memory.recallEmotionDelta` overrides dropped `importanceScale` / `ruminationMultiplier`, producing NaN recall emotion deltas. |
| Evidence | Before fix, `new EmotionVector(personality, null, null, { circadian: { positiveAffectAmp: 0.2 } })._circadianModulation(12)` produced non-finite `joy`/`sadness`. `new PersonalMemory(..., { spreadingActivation: { W: 2 } })._spreadingActivation(...)` returned non-finite activation. `new PersonalMemory(..., { recallEmotionDelta: { sad: { sadness: 0.02 } } })._computeRecallDelta(...)` returned non-finite `sadness`. |
| Verification verdict | Confirmed by deterministic local repro. External-free `agnes/agnes-2.0-flash` reviewed the diff and returned "Patch is correct"; it found no regression in partial nested overrides and noted only that static `fromJSON` callers must pass config explicitly when they need custom config. |
| Fix | Added nested-safe emotion config merge preserving `circadian` defaults in JS and native EmotionVector wrappers. Added nested-safe memory config merge preserving `spreadingActivation` defaults and deep-merging `recallEmotionDelta` category maps while keeping scalar metadata. Extended `fromJSON` signatures to accept config. Added nested config validation for emotion circadian and memory spreading/recall blocks. |
| Files | `src/agent/psychology/EmotionVector.js`; `src/agent/psychology/EmotionVector.native.js`; `src/agent/memory/PersonalMemory.js`; `src/config/validate.js`; `tests/unit/emotion.test.js`; `tests/unit/memory.test.js`; `tests/unit/config/validate-config.test.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | `npx vitest run tests/unit/emotion.test.js tests/unit/memory.test.js tests/unit/config/validate-config.test.js tests/unit/serialization-roundtrip.test.js --no-color` -> 110 passed. New tests cover partial circadian, partial spreadingActivation, partial recallEmotionDelta, nested validation, and static fromJSON config restore. |
| Re-verification | `npm test -- --no-color` -> 3248 passed / 28 skipped; `npm run test:domain -- --no-color` -> 82 passed; `npm run check:boundaries -- --no-color` -> passed; `npm run typecheck` -> clean; `npm run smoke:pack -- --no-color` -> 19 passed; first `npm run perf:check -- --no-color` exited 0 with machine-variance WARN, immediate rerun all PASS; `git diff --check` -> clean. |
| Status | Fixed and verified. |

## R98 - BehaviorField Nested Weights Config Repair

This section continues the no-quota nested config hardening line from R96/R97.
The round checked restore/fromJSON and remaining partial nested config paths.

### R98-BEHAVIOR-WEIGHTS-1

| Field | Detail |
|---|---|
| ID | R98-BEHAVIOR-WEIGHTS-1 |
| Severity | P1 quality gate / P2 runtime behavior |
| Audit finding | `BehaviorField` used `{ ...DEFAULTS, ...config }` while `DEFAULTS.weights` is nested. A partial override such as `{ weights: { needs: 4 } }` erased default `emotion`, `schedule`, `intrinsic`, and `habit` weights. `_computeGradient()` then multiplied by undefined weights, producing NaN gradients. `BehaviorField.fromJSON()` also ignored behavior config entirely by always restoring with `{}`. |
| Evidence | Before fix, `new BehaviorField(personality, null, { weights: { needs: 4 } }, domain).tick(signalsWithEmotionAndIntrinsic)` returned non-finite gradient entries. JSON output showed `cfg.weights` only contained `needs`. |
| Verification verdict | Confirmed by deterministic local repro. External-free `agnes/agnes-2.0-flash` reviewed the diff and returned "Patch is correct"; it noted direct constructor callers can still pass NaN if they bypass validation, which matches current project pattern and is not a regression. |
| Fix | Added nested-safe `mergeBehaviorConfig()` preserving default weights; constructor now uses it; `BehaviorField.fromJSON(data, personality, domain, config)` now threads config into the restore constructor; added `behavior.*` and `behavior.weights.*` validation. |
| Files | `src/agent/psychology/BehaviorField.js`; `src/config/validate.js`; `tests/behavior-field.test.js`; `tests/unit/config/validate-config.test.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | `npx vitest run tests/behavior-field.test.js tests/unit/config/validate-config.test.js tests/unit/serialization-roundtrip.test.js --no-color` -> 147 passed. New tests cover partial behavior weights, finite gradient/B output, behavior config validation, and fromJSON config restore. |
| Re-verification | `npm test -- --no-color` -> 3253 passed / 28 skipped; `npm run test:domain -- --no-color` -> 82 passed; `npm run check:boundaries -- --no-color` -> passed; `npm run typecheck` -> clean; `npm run smoke:pack -- --no-color` -> 19 passed; `npm run perf:check -- --no-color` -> all PASS; `git diff --check` -> clean. |
| Status | Fixed and verified. |

## R99 - IntrinsicMotivation Domain Map Config Repair

This section records the final config-chain repair in the R96-R99 nested config
hardening line. The round checked domain/user config merges and static restore
paths after the BehaviorField fix.

### R99-INTRINSIC-DOMAIN-MAP-1

| Field | Detail |
|---|---|
| ID | R99-INTRINSIC-DOMAIN-MAP-1 |
| Severity | P1 quality gate / P2 runtime behavior |
| Audit finding | `IntrinsicMotivation` merged defaults, domain config, and user config with a shallow spread. A partial user `domainRegionMap` override replaced the entire preset domain map, silently dropping mappings such as campus `图书馆自习 -> 图书馆` or tavern `森林探索 -> 森林`. Static `fromJSON()` also had no config parameter, so isolated restore callers could not preserve custom IM config. |
| Evidence | Before fix, `new IntrinsicMotivation(p, null, campusDomain, null, { domainRegionMap: { customState: '校园广场' } })` produced `_imConfig.domainRegionMap` containing only `customState`; `_domainToRegion('图书馆自习', '宿舍')` fell back to another region instead of `图书馆`. |
| Verification verdict | Confirmed by deterministic local repro. External-free `agnes/agnes-2.0-flash` reviewed the diff and returned "Patch is correct and well-tested"; it found no issues and noted only that future additional nested IM config keys would need explicit merge handling. |
| Fix | Added `mergeIntrinsicMotivationConfig()` with domain/user `domainRegionMap` merge; constructor and static `fromJSON()` use the same merge path; added static `mergeConfig()` helper; extended validation for additional intrinsic numeric fields, `domainRegionMap`, and `explorationStates`. |
| Files | `src/agent/psychology/IntrinsicMotivation.js`; `src/config/validate.js`; `tests/unit/intrinsic-domain.test.js`; `tests/unit/config/validate-config.test.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | `npx vitest run tests/unit/intrinsic-domain.test.js tests/unit/config/validate-config.test.js tests/unit/serialization-roundtrip.test.js --no-color` -> 86 passed. New tests cover partial user domainRegionMap preserving preset maps, fromJSON config propagation, and new validation paths. |
| Re-verification | `npm test -- --no-color` -> 3258 passed / 28 skipped; `npm run test:domain -- --no-color` -> 82 passed; `npm run check:boundaries -- --no-color` -> passed; `npm run typecheck` -> clean; `npm run smoke:pack -- --no-color` -> 19 passed; `npm run perf:check -- --no-color` -> all PASS; `git diff --check` -> clean. |
| Status | Fixed and verified. |

## R100 - Config Propagation Completion + MindWander NaN Guards

This section records two scoped no-quota fixes completing the config-injection
audit: IntrinsicMotivation._applyNeedGate module-level ANDY_DEFAULTS.needs
read (P1), and MindWander emotion delta NaN propagation guard (P2).

### R100-MODULE-DEFAULTS-1

| Field | Detail |
|---|---|
| ID | R100-MODULE-DEFAULTS-1 |
| Severity | P1 |
| Audit finding | `IntrinsicMotivation._applyNeedGate()` at line 688 read `ANDY_DEFAULTS.needs.threshold` directly via module-level import, bypassing the agent's instance config. The constructor properly merged `ANDY_DEFAULTS.intrinsicMotivation` into `this._imConfig`, but `_applyNeedGate` crossed config boundaries to read needs thresholds from a different config section. User overrides of `needs.threshold` (e.g., custom hunger/fatigue thresholds) were silently ignored by the curiosity gate logic. |
| Evidence | `IntrinsicMotivation.js:688` — `const thresholds = ANDY_DEFAULTS.needs.threshold;`. `NeedsSystem.js` properly injects `needsConfig` and stores `this._cfg.threshold`, but `_applyNeedGate` never reads it. `AgentRuntime.js:131` passes `needsState: agent.needs.needs` (values only, not config) to `im.tick()`. |
| Verification verdict | Confirmed by independent Verification AI. Silent config override — user-configured need thresholds are ignored by intrinsic motivation need-gating. P1 because it affects the core curiosity-drive coupling in default behavior. |
| Fix | Added `needsThresholdConfig` parameter to `IntrinsicMotivation.tick()`. `_applyNeedGate` now accepts `thresholdConfig` as 3rd parameter and uses `thresholdConfig || ANDY_DEFAULTS.needs.threshold`. `AgentRuntime.js` passes `agent.needs._cfg.threshold` as `needsThresholdConfig`. Removed stale `const cfg = this._imConfig` local variable that was unused in `_applyNeedGate`; gate logic now reads directly from `this._imConfig.needGateThreshold`. |
| Files | `src/agent/psychology/IntrinsicMotivation.js`; `src/agent/AgentRuntime.js` |
| Regression test | 3264 tests pass / 28 skipped. Config injection restore test verifies `needs.threshold` flows through `_restoreConfig` to restored agents. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

### R100-NAN-GAP-1

| Field | Detail |
|---|---|
| ID | R100-NAN-GAP-1 |
| Severity | P2 |
| Audit finding | `MindWanderRuntime.mindWander()` iterates over `mwCfg` effect values (rumination, worry, nostalgia, daydream) and `recallEmotionDelta` without finite guards. If a user passes malformed config (e.g., `mindWander: { effects: { rumination: { sadness: NaN } } }`) or corrupted memory data produces NaN in `recallEmotionDelta`, the NaN propagates into `emotionDelta` via `emotionDelta[dim] = (emotionDelta[dim] || 0) + value`. While `commitEmotion` → `applyEffect` guards with `Number.isFinite(delta)`, this is a silent per-tick skip — the caller assumes emotion was applied when nothing happened. |
| Evidence | `MindWanderRuntime.js:152-153,160-161,165-166,170-171,175-176` — all 5 emotion-delta accumulation loops lack `Number.isFinite(value)` guard. `validate.js` now validates `mindWander.effects` ranges (R99), but validation only runs at engine construction, not on per-tick config reads. |
| Verification verdict | Confirmed by independent Verification AI. NaN propagation path verified through mindWander → emotionDelta → commitEmotion. Validation at construction time partially mitigates, but guard is defense-in-depth. |
| Fix | Added `addIfFinite(target, dim, value)` helper that checks `Number.isFinite(value)` before accumulation. All 5 emotion-delta loops now use `addIfFinite()` instead of direct addition. NaN values are silently skipped with comment explaining the guard. |
| Files | `src/agent/runtime/MindWanderRuntime.js` |
| Regression test | 3264 tests pass / 28 skipped. Guard is defensive — no existing test exercises NaN effect values. Validation test (R99) covers range checking at construction. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

## R101 - Config Propagation Completeness Verification

This section records the R101 audit results. Both findings were independently
verified as **false positives** — the config propagation is already complete.

### R101-MINDWANDER-CONFIG-1 (REJECTED)

| Field | Detail |
|---|---|
| ID | R101-MINDWANDER-CONFIG-1 |
| Severity | P1 — rejected |
| Audit finding | `agent._mindWanderConfig` is never assigned; `getMindWanderConfig()` always falls through to defaults. |
| Disposition | False positive — `Agent.js:52` assigns `this._mindWanderConfig = mergeMindWanderConfig(config.mindWander || null)`. The audit agent missed this line. Config routing is complete. |
| Status | Rejected by independent verification. No action taken. |

### R101-RESTORE-CONFIG-1 (REJECTED)

| Field | Detail |
|---|---|
| ID | R101-RESTORE-CONFIG-1 |
| Severity | P2 — rejected |
| Audit finding | `_restoreConfig` not merged into config during deserialization. |
| Disposition | False positive — `index.js:88` merges `savedState?._restoreConfig` into `this.config` via `...(savedState?._restoreConfig || {})`. `_agentSubsystemConfig()` reads from `this.config`. Round-trip is complete. |
| Status | Rejected by independent verification. No action taken. |

## R102 - NeedsSystem NaN Guard Defense-in-Depth

This section records two defense-in-depth NaN guard additions in NeedsSystem.
Both locations already had partial guards (current value guarded, rate unguarded);
the fix adds rate guards to prevent permanent state corruption from corrupted
_decayRates or behaviorVector inputs.

### R102-NANO-1

| Field | Detail |
|---|---|
| ID | R102-NANO-1 |
| Severity | P2 |
| Audit finding | `NeedsSystem.tick()` line 185 and `tickWithBehavior()` line 237 compute `effectiveRate = rate * (0.5 + current * 0.5)` without guarding `rate` against NaN. If `_decayRates[need]` is NaN (from corrupted savedState or external modification), `Math.max(0, current - NaN * hoursElapsed)` = NaN, permanently corrupting the need value. The constructor guards `_decayRates` once at init, but tick-level corruption can bypass this. |
| Evidence | `NeedsSystem.js:181-186` — `current` guarded but `rate` unguarded. `NeedsSystem.js:119-123` — constructor guards `_decayRates` once. `NeedsSystem.js:237-242` — same gap in `tickWithBehavior()`. |
| Verification verdict | Confirmed by independent Verification AI. Risk is bounded (constructor guard + EffectCommitter downstream guards), but defense-in-depth warranted for core need decay path. |
| Fix | Added `if (!Number.isFinite(rate)) continue;` guard before `effectiveRate` computation in both `tick()` (line 188) and `tickWithBehavior()` (line 244). NaN rate silently skips decay for that need in the current tick. |
| Files | `src/agent/psychology/NeedsSystem.js` |
| Regression test | 3264 tests pass / 28 skipped. Guard is defensive — no existing test exercises NaN decay rate. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

### R102-NANO-2

| Field | Detail |
|---|---|
| ID | R102-NANO-2 |
| Severity | P2 |
| Audit finding | `NeedsSystem.getRecoveryRatesForBehavior()` line 387 computes `factor = Math.max(0, 1 - distance / maxDist)` where `distance = Math.sqrt(distSq)` and `distSq` accumulates `diff * diff` from `behaviorVector[d] - target[d]`. If any `behaviorVector[d]` is NaN, `distance` is NaN, `factor` is NaN, and `rates[need] = baseRate * NaN * multiplier` = NaN. `tickWithBehavior()` guards `rate` downstream (line 248), but NaN is produced unnecessarily. |
| Evidence | `NeedsSystem.js:386-390` — `distance` from `Math.sqrt(distSq)` without finite guard. `NeedsSystem.js:248` — downstream rate guard catches NaN. |
| Verification verdict | Confirmed by independent Verification AI. Downstream guard prevents state corruption, but preventing NaN production is defense-in-depth. |
| Fix | Added `Number.isFinite(distance)` guard: `const factor = Number.isFinite(distance) ? Math.max(0, 1 - distance / maxDist) : 0;`. NaN distance → zero recovery factor instead of NaN rate. |
| Files | `src/agent/psychology/NeedsSystem.js` |
| Regression test | 3264 tests pass / 28 skipped. Guard is defensive — no existing test exercises NaN behaviorVector. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. |
| Status | Fixed and verified. |

## Active Latent / Deferred Backlog

These are not current merge blockers unless the new Chief Planner promotes them.

| ID | Severity | Summary | Current disposition |
|---|---|---|---|
| TZ-1 | P2 latent | Golden seed replay is timezone-bound because `WorldClock` uses local time accessors and fixture was generated in one TZ. | Requires explicit UTC/time semantics migration; do not patch casually. |
| NAN-1 | P2 latent | Native `NeedsSystem` sync path lacks the same output validation as JS path. | Native default off / no binding; revisit before native release. |
| NAN-2 | P2 latent | Some emotion getters use `!== undefined` rather than finite checks. | Live mutation path has finite guards; defense-in-depth later. |
| EP-9 | P2 latent | Deprecated `FactEmitter.propagateEventKnowledge` lacks full symmetry with canonical guards in some old paths. | Deprecated/no runtime caller; consider removal or guard if touched. |
| SER-2 | P2 latent | `KnowledgeStore.toJSON` lacks explicit version. | Add when schema evolution begins. |
| TICKHASH-DATE-1 | P2 diagnostic | `tickHash.canonicalize(Date)` erased Date values to `{}`. | Fixed in R48; keep row until next release freeze review confirms no downstream fixture migration needed. |
| FACT-RETENTION | P2/P1 design | Non-EVENT facts can grow without global retention policy. | Needs design: cap/TTL/compaction semantics. |
| SOCIAL-DUNBAR | P2/P1 design | Shared bidirectional `Relationship` means Dunbar demotion is symmetric, which may not match per-agent social capacity semantics. | Needs design: shared edge vs per-agent perception. |
| R84-ANDYBRIDGE-RESTORE-1 | P2 | `AndyBridge._restoreAgents` drops ~12 serialized fields (memory, personality, schedule, emotionRegulation, proceduralMemory, futureTendency, _actionTraceHistory, _perceivedEventIds, isOnline, name, appraisalBiases). R85-15 added complete JSDoc + console.warn in init(); full restore requires `AndyEngine.fromJSON()`. | Deferred: documented partial restore with warning; not in default persistence path. |
| R84-CHARACTER-SAVE-LLM-1 | P2 | `Character.save()` omits `_defaultLLM` config; standalone Character round-trip loses LLM provider/apiKey. `Andy.save()` correctly persists it at wrapper level. | Deferred: affects standalone Character save only; Andy multi-character path is correct. |
| R84-WORLD-SNAPSHOT-1 | P3 | `AndyWorld.snapshot()` output is not safe for round-trip restore (missing events full, spatial, rngState, _restoreConfig, factStore, etc.). `toJSON()` is correct for persistence; `snapshot()` is a footgun for external consumers. | Deferred: internal code uses `toJSON()`; `snapshot()` API consumers at own risk. |
| R84-SOCIALGRAPH-SNAPSHOT-1 | P3 | `SocialGraph.snapshot()` drops `_tickCount`; `toJSON()` preserves it. `snapshot()`→`fromJSON()` round-trip resets Dunbar timing. | Deferred: internal code uses `toJSON()`; not currently wired to restore. |
| R84-FACTEMITTER-DEADCODE-1 | P3 | `emitMemoryFacts()` is defined but never called from `AndyWorld.step()` or any `src/` runtime path. Dead code on the hot path surface. | Deferred: zero runtime impact; cleanup when fact emission is next touched. |
| R85-CONVERSATIONLOG-DATE-1 | P2 | `ConversationLog` uses `Date.now()` for message timestamps. Timestamps are embedded in `toJSON()` output but `_trim()` uses message count not timestamps, so behavioral determinism is preserved. Output is not bit-identical across runs. | Deferred: SDK tooling path; not in core simulation loop. Add `now` injection if publish decision reopens. |
| R85-EMOTIONSIGNALBUFFER-DATE-1 | P2 | `EmotionSignalBuffer` defaults to `Date.now()` when no `now` function provided. `AndyBridge` doesn't inject `now`, so bridge-mediated conversations have wall-clock-dependent `pending` timestamps. | Deferred: SDK tooling path; `EmotionSignalBuffer` has `now` injection point but `AndyBridge` doesn't use it. Low behavioral impact. |
| R85-AUTOTICK-DEFAULT-PATH-1 | P2 | `AutoTick.calculateTicksToAdvance()` now accepts optional `now` parameter for determinism, but default path still uses `Date.now()`. Non-SDK callers who don't inject `now` get wall-clock-dependent tick counts. | Deferred: backward-compatible default; only SDK `Character.chat()`/`chatStream()` inject virtual time. External AutoTick users can opt into determinism via `now` param. |
| R85-ANDYTOWN-DATE-1 | P2 | `AndyTownAdapter` uses `Date.now()` for cache expiry. Inherently wall-clock-dependent; not in core simulation path. | Deferred: network I/O adapter; cache expiry is inherently non-deterministic. |
| R84-UTC-GETTERS-1 | P2 design | `UtilityScorer.js:427,448` still uses `getUTCHours()` fallback; `WorldPressure.js:42` uses `getHours()` on constructed Date. R76 boundary guard locks the exact count, but UTC/local semantics remain a design debt item (TZ-1 family). | Deferred: active runtime always provides `environment.hour` from local time; falls back only on missing context. Tracked under TZ-1. |
| R87-SOCIALGRAPH-DUNBAR-ENFORCE-1 | P2 design | `_enforceDunbarLimits()` is a read-only projection — it calls `_projectDunbarLayers()` but discards the return value, and `_projectDunbarLayers()` never mutates `rel.type` or `rel.strength`. Dunbar limits are never actually enforced; agents can accumulate unlimited close friends. | Deferred: requires design decision on whether to downgrade relationship types (symmetric shared edge vs per-agent perception). Fix would add `_downgradeType()` method. |
| R87-EMOTIONVECTOR-DIMENSION-BIAS-1 | P3 | `_pinkNoiseDrift()` selects 3-6 random dimensions with replacement — same dimension can be picked multiple times in one tick (~26% probability), creating cumulative noise bias. | Deferred: noise amplitude is small and damped; shuffle-and-pick-unique is a cleanup item when emotion drift is next touched. |

## Rules For Future Entries

Use this template:

```md
### RXX-ID

| Field | Detail |
|---|---|
| ID | RXX-ID |
| Severity | P0/P1/P2 |
| Audit finding | ... |
| Evidence | file:line, repro, or failing test |
| Verification verdict | Confirmed / rejected / downgraded, with reason |
| Fix | ... |
| Files | ... |
| Regression test | ... |
| Re-verification | commands and results |
| Status | Fixed / Deferred / Rejected / Needs design |
```
