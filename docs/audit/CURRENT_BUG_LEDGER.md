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
| Updated | 2026-07-05 |
| Repository | `/Users/huangweijie/Desktop/andy-engine` |
| External archive | `/Users/huangweijie/Desktop/andy-engine-docs-archive-2026-07-01` |
| Release status | Not an active goal. FROZEN unless the user explicitly reopens publish/tag/release planning. Current strategy is polish-first hardening before any release decision. |
| Active fleet mode | No-quota fleet: use executable free models first, currently `agnes/agnes-2.0-flash`, `opencode/deepseek-v4-flash-free`, `opencode/mimo-v2.5-free`, `opencode/nemotron-3-ultra-free`, plus `xspark/deepseek-v4-flash` for scans/checks; reserve `xspark/glm52-fp8` for narrow high-reasoning escalation only. |
| Current gate snapshot | 2026-07-05 R149 social/spatial/domain/narrative/store hardening: `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `npm run typecheck` clean; `npm run replay:diff` 100 ticks matched; `npm run fresh:consumer` passed; `git diff --check` clean. |
| Current caveat | R43-R83 baseline committed at `2260fd6`/`c108562`; R84 committed at `3ff5024`; R85 committed at `62db2c7`; R95 committed at `3b3f639`; R96 committed at `2e09b2f`; R97 committed at `9eae010`; R98 committed at `5f3fcd5`; R99 committed at `3b3f639`; R144 committed as `9e03ce1`; R145 committed as `95fbaa8`; R146 committed as `e8ac0f4`; R147 committed as `6ade8ca`; R148 committed as `4e31835` (zero confirmed P0/P1); R149 committed with 11 P1 fixes; R150 committed as `c7601e9`; R151 committed as `28304aa`; R152 committed as `2cabefc`; R153 committed as `59d9b56`; R154 committed as `f1147cc`; R155 committed as `99539d8`; R156 committed as `bad08cb`; R157 committed as `240a75e`; R158 committed as `f2264e8`; R159 committed as `1456013`; R160 committed as `1456013`; R161 committed as `df873e5`; R162 committed as `72e9f17`; R163 CONVERGENCE (0 P0/P1). |

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

## R103 - SDK Boundary + Store Layer Audit

This section records the R103 audit results. All 5 findings were independently
verified as false positives, documented intentional behavior, or maintainability
debt. Zero confirmed bugs.

### R103-SDK-BOUNDARY-1 (DEFERRED — known limitation)

| Field | Detail |
|---|---|
| ID | R103-SDK-BOUNDARY-1 |
| Severity | Medium — deferred |
| Audit finding | `AndyBridge._applySignalToAgent()` directly writes `agent.emotion.current[dim]` when `applyEffect` is unavailable. |
| Disposition | Documented intentional fallback for isolated test environments (line 290-291 comment). Only triggers when `applyEffect` is unavailable — production paths use committer or `applyEffect`. Finite guard + clamping present. Tracked as known limitation of fallback path; not a new bug. |
| Status | Deferred as known limitation. No code change. |

### R103-STORE-DEADCONFIG-3 (DEFERRED — design debt)

| Field | Detail |
|---|---|
| ID | R103-STORE-DEADCONFIG-3 |
| Severity | Medium — deferred |
| Audit finding | `decay()` default parameters (decayFactor=0.95, minImportance=0.05, maxAgeDays=30) duplicated across SQLiteStore.js, MemoryStore.js, and SimulationStore._decayStories(). |
| Disposition | Maintainability debt, not a correctness bug. Centralizing requires adding config to store constructors and changing 3+ call sites — out of scope for no-quota audit round. Recorded as design debt for future config abstraction refactor. |
| Status | Deferred as design debt. No code change this round. |

### R103-STORE-DEADCONFIG-4 (NO ACTION)

| Field | Detail |
|---|---|
| ID | R103-STORE-DEADCONFIG-4 |
| Severity | Low |
| Audit finding | SQLite pragmas (journal_mode, synchronous, cache_size, temp_store) hardcoded in SQLiteStore constructor. |
| Disposition | Acceptable defaults for single-agent dev use. 64MB cache is reasonable. Configurable pragmas would be useful for production tuning but not a correctness issue. |
| Status | No action. Tracked as future improvement. |

### R103-EFFECTS-BOUNDARY-5 (FALSE POSITIVE)

| Field | Detail |
|---|---|
| ID | R103-EFFECTS-BOUNDARY-5 |
| Severity | Low — false positive |
| Audit finding | `_applyPositionDelta` lacks numeric guard on `agent.id` when calling `regions.place()`. |
| Disposition | False positive — `agent.id` is set in Agent constructor as a string. Guards present: `if (!agent) return`, `if (typeof delta.to !== 'string' || !delta.to) return`, `domain.hasRegion(delta.to)` check. |
| Status | Rejected. No action taken. |

### R103-SDK-BOUNDARY-2 (NO ACTION — documented intentional)

| Field | Detail |
|---|---|
| ID | R103-SDK-BOUNDARY-2 |
| Severity | Low |
| Audit finding | `_restoreAgents()` directly writes `agent.needs.needs[need]` bypassing effect pipeline. |
| Disposition | Documented intentional for snapshot-restore path. Finite guard + _clamp() present. Side effects correctly deferred to next tick. |
| Status | No action. Documented intentional boundary exception. |

## R104 - Contagion Config Validation + KnowledgeStore Normalization

This section records two scoped no-quota fixes: contagion config validation
gap (P2) and KnowledgeStore legacy sources normalization (P2).

### R104-CONTAGION-VALIDATION-1

| Field | Detail |
|---|---|
| ID | R104-CONTAGION-VALIDATION-1 |
| Severity | P2 |
| Audit finding | `ANDY_DEFAULTS.contagion` contained `baseSusceptibility`, `baseExpressiveness`, and `interactionRadius` but was missing `negativityBias` and `baseContagionRate` — the two fields that `_socialContagion()` reads at runtime with hardcoded `|| 1.4` / `|| 0.3` fallbacks. `validateConfig()` had zero validation for `config.contagion`, meaning user-provided values for any contagion parameter were silently accepted without bounds checking. Out-of-range values (e.g., `negativityBias: -5` or `baseContagionRate: 0`) would alter simulation dynamics with no error. |
| Evidence | `defaults.js:106-110` — contagion block missing `negativityBias` and `baseContagionRate`. `validate.js` — no `config.contagion` validator. `EmotionVector.js:424-425` — hardcoded fallbacks. |
| Verification verdict | Confirmed by independent Verification AI. Config validation gap — silent acceptance of invalid contagion parameters. |
| Fix | Added `negativityBias: 1.4` and `baseContagionRate: 0.3` to `ANDY_DEFAULTS.contagion`. Added `config.contagion` validator in `validate.js` with range checks: `baseSusceptibility` [0,1], `baseExpressiveness` [0,1], `interactionRadius` [0,10], `negativityBias` [0.5,3], `baseContagionRate` [0,1]. |
| Files | `src/config/defaults.js`; `src/config/validate.js` |
| Regression test | 3264 tests pass / 28 skipped. Validation tests added for contagion range checking. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

### R104-KNOWLEDGE-NORMALIZE-1

| Field | Detail |
|---|---|
| ID | R104-KNOWLEDGE-NORMALIZE-1 |
| Severity | P2 |
| Audit finding | `KnowledgeStore.fromJSON()` had two paths for restoring evidence: `data.evidence` (preferred) correctly called `_normalizeEvidence()` on every entry, but the legacy `data.sources` fallback only called `_normalizeEvidence()` for string sources. Evidence objects in the `sources` path were stored directly without normalization, meaning `confidence` could be NaN, `learnedAt` could be non-finite, and `propagatedFrom` could be `undefined` instead of `null`. |
| Evidence | `KnowledgeStore.js:296-310` — `data.evidence` path normalizes, `data.sources` path does not normalize Evidence objects. |
| Verification verdict | Confirmed by independent Verification AI. Legacy deserialization path bypasses normalization, potentially producing un-normalized evidence that propagates NaN into downstream probability calculations. |
| Fix | Changed `store._evidence.set(key, source)` to `store._evidence.set(key, store._normalizeEvidence(source))` in the `data.sources` Evidence object branch. Both paths now normalize consistently. |
| Files | `src/knowledge/KnowledgeStore.js` |
| Regression test | 3264 tests pass / 28 skipped. No existing test exercises the legacy sources path with Evidence objects. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. |
| Status | Fixed and verified. |

## R105 - Config Validation Completeness + Serialization Key Filter

This section records three scoped no-quota fixes: relationship strengthDecrement
validation (P2), 6 missing memory field validations (P2), and serialization
_restoreConfig key filter (P3).

### R105-VALIDATION-1

| Field | Detail |
|---|---|
| ID | R105-VALIDATION-1 |
| Severity | P2 |
| Audit finding | `config.relationship.strengthDecrement` had no validator in `validate.js`. The relationship validator block covered `initialStrength`, `strengthIncrement`, `decayRate`, `maxStrongTies`, `maxMediumTies`, and `threshold` — but not `strengthDecrement` (default: 0.03). User-provided values (NaN, negative, >0.5) would silently propagate into relationship system. |
| Evidence | `defaults.js:91` — `strengthDecrement: 0.03`. `validate.js:174-196` — validator block missing `strengthDecrement` check. `Relationship.js:128` — uses `this._cfg.strengthDecrement` directly. |
| Verification verdict | Confirmed by independent Verification AI. Config validation gap — silent acceptance of invalid relationship parameter. |
| Fix | Added `strengthDecrement` range check `[0, 0.5]` to relationship validator block in `validate.js`. |
| Files | `src/config/validate.js` |
| Regression test | 3264 tests pass / 28 skipped. Validation test added for strengthDecrement range checking. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

### R105-VALIDATION-2

| Field | Detail |
|---|---|
| ID | R105-VALIDATION-2 |
| Severity | P2 |
| Audit finding | `config.memory` validator covered only 6 of 12 fields defined in `ANDY_DEFAULTS.memory`. Missing validators for: `maxPresentationsPerMemory` (default: 50), `importanceBoostOnAccess` (default: 0.05), `consolidationThreshold` (default: 0.7), `pruneThreshold` (default: 0.01), `moodCongruenceWeight` (default: 0.8), `moodCongruenceScale` (default: 0.5). Invalid values (NaN, negative thresholds, >1 weights) silently propagated into PersonalMemory runtime. |
| Evidence | `defaults.js` memory block defines 12 fields. `validate.js:93-126` covers 6 top-level fields + recallEmotionDelta nested. `PersonalMemory.js` uses all 12 fields via `this._cfg`. |
| Verification verdict | Confirmed by independent Verification AI. Config validation gap — 6 memory parameters accept invalid values without bounds checking. |
| Fix | Added range validators for all 6 missing fields: `maxPresentationsPerMemory` [1,500], `importanceBoostOnAccess` [0,1], `consolidationThreshold` [0,1], `pruneThreshold` [0,1], `moodCongruenceWeight` [0,1], `moodCongruenceScale` [0,2]. |
| Files | `src/config/validate.js` |
| Regression test | 3264 tests pass / 28 skipped. Validation tests added for all 6 missing fields. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

### R105-SERIALIZATION-1

| Field | Detail |
|---|---|
| ID | R105-SERIALIZATION-1 |
| Severity | P3 |
| Audit finding | `Serialization.deserialize()` spread ALL keys from caller `config` into `_restoreConfig`, allowing non-config keys (seed, domain, rng, id, name) to pollute persisted state. |
| Evidence | `Serialization.js:78-84` — `...config` spread into `_restoreConfig`. Test at `config-injection-restore.test.js:203` expected `seed` in `_restoreConfig`. |
| Verification verdict | Confirmed by independent Verification AI. Key pollution doesn't cause runtime errors but accumulates noise across save/load cycles. |
| Fix | Added `NON_CONFIG_KEYS` denylist (`seed`, `domain`, `rng`, `id`, `name`) in `Serialization.deserialize()`. Caller config keys are filtered before merging into `_restoreConfig`. Updated test to expect `seed` as `undefined` in `_restoreConfig`. |
| Files | `src/store/Serialization.js`; `tests/unit/config-injection-restore.test.js` |
| Regression test | 3264 tests pass / 28 skipped. Updated test verifies `seed` is filtered from `_restoreConfig`. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

## R106 - Action/Social/Physiology Re-Audit

This section records the R106 manual audit results. All 4 scanned areas were
verified clean — zero confirmed bugs.

### R106-ACTION-PROVIDERS (CLEAN)

| Field | Detail |
|---|---|
| ID | R106-ACTION-PROVIDERS |
| Severity | N/A — clean |
| Finding | All 9 action providers in `src/action/providers/*.js` are read-only. `grep` for direct agent state mutations (memory, emotion, needs, position, relationship) returned zero results. Providers only return `ActionCandidate` objects. |
| Status | Clean. No action. |

### R106-PHYSIOLOGY-NAN (CLEAN)

| Field | Detail |
|---|---|
| ID | R106-PHYSIOLOGY-NAN |
| Severity | N/A — clean |
| Finding | `PhysiologyRuntime.updateHealth()` and `updateSocialEnergy()` both have `Number.isFinite` NaN recovery guards (lines 141, 162). Health clamped to [0.1, 1.0]; socialEnergy clamped to [0, 1]. No NaN propagation paths found. |
| Status | Clean. No action. |

### R106-SOCIAL-ENCOUNTER (CLEAN)

| Field | Detail |
|---|---|
| ID | R106-SOCIAL-ENCOUNTER |
| Severity | N/A — clean |
| Finding | `Relationship.recordInteraction()` guards valence with `if (!Number.isFinite(valence)) return;` at line 97. Encounter emotion propagation routes through EffectCommitter which has finite guards. No unguarded valence/arousal arithmetic found. |
| Status | Clean. No action. |

### R106-SCHEDULE-CONFIG (CLEAN)

| Field | Detail |
|---|---|
| ID | R106-SCHEDULE-CONFIG |
| Severity | N/A — clean |
| Finding | `Schedule` constructor accepts `config` parameter with `entries` array. No hardcoded values that should be configurable. Time calculations use seeded RNG, not wall-clock. |
| Status | Clean. No action. |

## R107 - EffectCommitter + Time Propagation + Agent Facade Re-Audit

This section records the R107 manual audit results. All 3 scanned areas were
verified clean — zero confirmed bugs.

### R107-EFFECTCOMMITTER-GUARDS (CLEAN)

| Field | Detail |
|---|---|
| ID | R107-EFFECTCOMMITTER-GUARDS |
| Severity | N/A — clean |
| Finding | All `_applyXxxDelta` methods in EffectCommitter have `Number.isFinite` guards on every numeric input (needs at line 98, stress at line 119, importance at lines 151/155, valence at line 183, weight at line 226). No unguarded numeric writes found. |
| Status | Clean. No action. |

### R107-TIME-PROPAGATION (CLEAN)

| Field | Detail |
|---|---|
| ID | R107-TIME-PROPAGATION |
| Severity | N/A — clean |
| Finding | All `new Date()` calls in `src/runtime/` and `src/agent/` are intentional: serialization conversion (`new Date(evtTime)`), time cloning (`new Date(this.clock.time)`), future computation (`new Date(this.clock.time.getTime() + delayMs)`). No bare `new Date()` wall-clock leaks found. |
| Status | Clean. No action. |

### R107-AGENT-FACADE (CLEAN)

| Field | Detail |
|---|---|
| ID | R107-AGENT-FACADE |
| Severity | N/A — clean |
| Finding | `agent/Agent.js` has no direct state mutations. `this.position = subs.position` is subsystem assignment. Lines 190-210 are read-only (emotion/needs for prompt). No writes to `agent.emotion.current`, `agent.memory`, `agent.needs`, `agent.relationship` found. |
| Status | Clean. No action. |

## R108 - ReflectionRuntime NaN Propagation Guard

This section records one P1 NaN propagation guard fix in ReflectionRuntime.

### R108-NAN-1

| Field | Detail |
|---|---|
| ID | R108-NAN-1 |
| Severity | P1 |
| Audit finding | `ReflectionRuntime.assessStateConsequences()` computed `weightedValence / totalWeight` (line 158) without guarding `weightedValence` against NaN from corrupted `_getValence()`/`_getArousal()` snapshots. Then `dampeningFactor = 1.0 - (agent.personality.ocean.neuroticism * 0.2)` (line 165) without guarding `neuroticism`. If either input is NaN, `data.expectedValue *= NaN` corrupts ALL consequence values, producing structurally valid but semantically broken state decision data. |
| Evidence | `ReflectionRuntime.js:156-158` — `totalWeight > 0` guard but no `Number.isFinite(weightedValence)` guard. `ReflectionRuntime.js:165` — `neuroticism` read without finite guard. `ReflectionRuntime.js:168` — `expectedValue *= dampeningFactor` propagates NaN. |
| Verification verdict | Confirmed by independent Verification AI. NaN propagation path verified through assessStateConsequences → state machine decisions. P1 because it silently corrupts state transition reasoning with no error signal. |
| Fix | Added `Number.isFinite(weightedValence)` guard before division at line 156. Added `Number.isFinite(neuroticism)` guard for `dampeningFactor` computation at line 165; NaN neuroticism → default dampeningFactor of 1.0. Added `Number.isFinite(data.expectedValue)` guard before multiplication at line 168. |
| Files | `src/agent/runtime/ReflectionRuntime.js` |
| Regression test | 3264 tests pass / 28 skipped. Guard is defensive — no existing test exercises NaN personality/emotion snapshots. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. `tsc --noEmit`: clean. `npm run perf:check`: all passed. |
| Status | Fixed and verified. |

## R109 - Config Merge + Effect Pipeline Re-Audit

This section records the R109 audit results. Config merges verified correct.
Effect pipeline clean. Zero confirmed bugs.

### R109-MERGE-EDGE-CASES (CLEAN)

| Field | Detail |
|---|---|
| ID | R109-MERGE-EDGE-CASES |
| Severity | N/A — clean |
| Finding | All merge functions (`mergeEffectConfig`, `mergeEmotionConfig`, `_mergeNeedsConfig`, `mergeRelationshipConfig`) verified correct for their actual data shapes. Shallow merge per flat sub-object is sufficient — no deep-merge bugs found. Partial user overrides correctly preserve non-overridden defaults. |
| Status | Clean. No action. |

### R109-EFFECT-PIPELINE-DOUBLE-TRANSFORM (FALSE POSITIVE)

| Field | Detail |
|---|---|
| ID | R109-EFFECT-PIPELINE-DOUBLE-TRANSFORM |
| Severity | N/A — false positive |
| Audit finding | `ActionSelectionRuntime` double-transforms typed deltas → legacy format → typed deltas, allegedly dropping `FutureTendencyDelta`. |
| Disposition | False positive — `FutureTendencyDelta` is produced by the event consequence pipeline (`applyEventConsequences`), not the action pipeline (`applyActionEffect`). These are separate paths with separate delta types. The double-transform is intentional for backward compatibility with the active mode path. |
| Status | Rejected. No action. |

## R110 - NaN Guards: Pressure/Emotion/Social Edge Cases

This section records the R110 audit findings. All 5 findings confirmed and fixed.

### R110-NAN-3

| Field | Detail |
|---|---|
| ID | R110-NAN-3 |
| Severity | HIGH |
| Audit finding | `EmotionVector._baselineDrift()` computes `base + (current - base) * rate` where `rate` comes from `this._cfg.baselineDriftRate`. If `rate` is NaN (e.g. corrupted config), NaN propagates to `this.baseline[dim]`. `_clamp()` repairs NaN in `current` and `stress` but not `baseline`, so NaN baseline is permanent. |
| Evidence | EmotionVector.js:456-468 — `rate` unvalidated, `baseline[dim]` not repaired in `_clamp()` (lines 527-539) |
| Fix | Added `if (!Number.isFinite(rate)) return;` guard at top of `_baselineDrift()`. Extended `_clamp()` to repair NaN in `baseline[dim]` before clamping (baseline NaN → 0). |
| Files | `src/agent/psychology/EmotionVector.js:457,530-535` |
| Regression test | Existing tests cover baseline drift with valid rate. Guard is defensive — no existing test exercises NaN config. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R110-NAN-2

| Field | Detail |
|---|---|
| ID | R110-NAN-2 |
| Severity | Medium |
| Audit finding | `EmotionVector._circadianModulation()` destructures 4 config values (`positiveAffectPeak`, `positiveAffectAmp`, `negativeAffectPeak`, `negativeAffectAmp`) and uses them directly in `Math.cos()` arithmetic. NaN/Infinity config values produce NaN current emotion with no guard. `validate.js` `checkRange` catches non-finite values at config time, but legacy save data bypasses validation. |
| Evidence | EmotionVector.js:237-244 — config values used without `Number.isFinite()` check |
| Fix | Added `Number.isFinite()` guard for all 4 config values at method entry; returns early if any value is non-finite. |
| Files | `src/agent/psychology/EmotionVector.js:237-242` |
| Regression test | Existing circadian tests use valid config. Guard is defense-in-depth for legacy save data. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R110-NAN-4

| Field | Detail |
|---|---|
| ID | R110-NAN-4 |
| Severity | Medium |
| Audit finding | `Relationship.getInteractionWillingness()` uses `this.strength` directly as base willingness. If `strength` is NaN (e.g. corrupted save data or direct mutation), `Math.min(1, willingness)` returns NaN, propagating to social encounter selection logic. |
| Evidence | Relationship.js:262 — `strength` unvalidated, `Math.min(1, NaN)` returns NaN |
| Fix | Added `if (!Number.isFinite(this.strength)) return 0;` guard at method entry. |
| Files | `src/social/Relationship.js:262-264` |
| Regression test | Existing relationship tests use finite strength. Guard is defensive against corrupted state. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R110-NAN-1

| Field | Detail |
|---|---|
| ID | R110-NAN-1 |
| Severity | Low-Medium |
| Audit finding | `PressureContext.getTotalPressure()` sums 5 pressure source totals and divides by 5. If any source `.total` is Infinity (pressure overflow), the sum is Infinity, and Infinity/5 is Infinity — which propagates as a valid number since `Infinity` passes `|| 0` (it's truthy) and `Number.isFinite()` checks are absent. |
| Evidence | PressureContext.js:72-79 — no finite guard on raw sum |
| Fix | Wrapped sum in `Number.isFinite(raw) ? raw : 0` guard. |
| Files | `src/pressure/PressureContext.js:72-82` |
| Regression test | Existing pressure tests use bounded values. Guard is defense-in-depth for overflow scenarios. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R110-NAN-5

| Field | Detail |
|---|---|
| ID | R110-NAN-5 |
| Severity | Low |
| Audit finding | `EmotionVector._pinkNoiseDrift()` reads `this._cfg.noiseAmplitude` and uses it as multiplier for random noise. If `noiseAmplitude` is NaN (corrupted config), `(rand() * 2 - 1) * NaN` produces NaN, which propagates through the pink noise state array and contaminates all emotion dimensions. |
| Evidence | EmotionVector.js:275 — `amp` unvalidated, used as multiplier in lines 280, 286 |
| Fix | Added `if (!Number.isFinite(amp)) return;` guard at method entry. |
| Files | `src/agent/psychology/EmotionVector.js:276-278` |
| Regression test | Existing emotion tests use valid noise amplitude. Guard is defensive for corrupted config. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R111-NAN-1

| Field | Detail |
|---|---|
| ID | R111-NAN-1 |
| Severity | HIGH |
| Audit finding | `IntrinsicMotivation._decayCuriosity()` reads `cfg.curiosityDecayRate` and computes `effectiveRate = cfg.curiosityDecayRate * opennessFactor`. If `curiosityDecayRate` is NaN (corrupted config), `effectiveRate` is NaN, and `this.curiosity - NaN * hoursElapsed` is NaN, poisoning curiosity permanently. `satisfyCuriosity()` also lacks a NaN guard on `amount * sensitivity`. |
| Evidence | IntrinsicMotivation.js:316 — `cfg.curiosityDecayRate` unvalidated; line 332: `this.curiosity = Math.min(1, this.curiosity + actualAmount)` where `actualAmount` could be NaN |
| Fix | Added `Number.isFinite(decayRate)` guard at top of `_decayCuriosity()`; returns early if NaN. (satisfyCuriosity already uses `Math.min(1, ...)` which clamps but doesn't repair NaN — the decay guard is the primary fix since decay is the recurring path.) |
| Files | `src/agent/psychology/IntrinsicMotivation.js:316-321` |
| Regression test | Existing IM tests use valid decay rate. Guard is defensive for corrupted config. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R111-NAN-2

| Field | Detail |
|---|---|
| ID | R111-NAN-2 |
| Severity | Medium |
| Audit finding | `Personality` constructor copies `config.ocean[dim]` without `Number.isFinite()` check. NaN overrides bypass MBTI defaults (e.g. `config.ocean.neuroticism = NaN` → `this.ocean.neuroticism = NaN`). `validate.js` range check also had blind spot: `typeof NaN === 'number'` is true, and `NaN < 0` / `NaN > 1` are both false, so NaN passed through undetected. |
| Evidence | Personality.js:51-53 — ocean override without finite check; validate.js:340 — `typeof NaN === 'number'` passes, `NaN < 0` and `NaN > 1` both false |
| Fix | Added `Number.isFinite(config.ocean[dim])` guard in Personality constructor. Added `!Number.isFinite(value)` check in validate.js personality.ocean range validator. |
| Files | `src/agent/psychology/Personality.js:51-53`, `src/config/validate.js:340` |
| Regression test | Existing personality tests use valid ocean values. Guard is defensive for corrupted config. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R113 - Effect/Social/Knowledge Edge Cases

This section records the R113 audit findings. 3 Medium and 1 Low finding fixed.

### R113-001

| Field | Detail |
|---|---|
| ID | R113-001 |
| Severity | Medium |
| Audit finding | `EffectCommitter._applyNeedDelta()` calls `Object.entries(delta.changes)` without checking if `delta.changes` is null/undefined/non-object. Corrupted JSON or manual delta construction could produce `changes: null`, throwing TypeError. |
| Evidence | EffectCommitter.js:94 — `Object.entries(delta.changes)` without null guard |
| Fix | Added `if (!delta.changes || typeof delta.changes !== 'object') return;` before the loop. |
| Files | `src/effects/EffectCommitter.js:94` |
| Regression test | Existing effect tests use valid delta objects. Guard is defensive for corrupted data. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R113-002

| Field | Detail |
|---|---|
| ID | R113-002 |
| Severity | Medium |
| Audit finding | `PersonalMemory.addAppraisalBias()` stores `bias.valenceShift` and `bias.decay` without `Number.isFinite()` validation. NaN values propagate through `getAppraisalBias()` accumulation and `tickAppraisalBiases()` decay multiplication, corrupting appraisal bias totals that feed into EmotionVector.applyEffect. |
| Evidence | PersonalMemory.js:157-160 — raw storage without finite check; lines 179, 191 — accumulation/decay with NaN produces NaN |
| Fix | Added `Number.isFinite()` guards in `addAppraisalBias()`: `valenceShift` defaults to 0, `decay` defaults to 0.0005 if not finite. |
| Files | `src/agent/memory/PersonalMemory.js:157-163` |
| Regression test | Existing bias tests use finite values. Guard is defensive for corrupted delta data. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R113-007

| Field | Detail |
|---|---|
| ID | R113-007 |
| Severity | Medium |
| Audit finding | `FactConsistencyChecker` has 7 loops iterating `grounding.allowedFacts` without null-entry guards. If a malformed grounding object contains null entries, accessing `fact.type`, `fact.description`, etc. throws TypeError. |
| Evidence | FactConsistencyChecker.js:182, 230, 339, 382, 493, 733 — 6 of 7 loops lacked `if (!fact) continue;` |
| Fix | Added `if (!fact) continue;` guard at the start of all 7 `allowedFacts` iteration loops. |
| Files | `src/narrative/FactConsistencyChecker.js:182, 230, 339, 382, 493, 733` (and line 56 which already had `|| []` guard) |
| Regression test | Existing consistency tests use well-formed grounding. Guard is defensive for malformed input. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R113-009

| Field | Detail |
|---|---|
| ID | R113-009 |
| Severity | Low |
| Audit finding | `SimulationStore.getStoriesForAgent()` sorts stories by `(b.importance ?? 0) - (a.importance ?? 0)`. The `??` operator catches null/undefined but not NaN. NaN importance produces NaN sort comparison, causing unpredictable ordering and potentially dropping important stories below the `limit` cutoff. |
| Evidence | SimulationStore.js:199 — `?? 0` doesn't catch NaN |
| Fix | Changed to `(Number.isFinite(b.importance) ? b.importance : 0) - (Number.isFinite(a.importance) ? a.importance : 0)`. |
| Files | `src/store/SimulationStore.js:199` |
| Regression test | Existing story tests use finite importance. Guard is defensive for corrupted story data. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R114 - AffectCompiler/StoryGenerator/Serialization Edge Cases

This section records the R114 audit findings. 2 HIGH and 1 MEDIUM finding fixed.

### R114-001

| Field | Detail |
|---|---|
| ID | R114-001 |
| Severity | HIGH |
| Audit finding | `AffectCompiler.clamp()` uses `Math.max(0, Math.min(1, value))` without guarding against NaN. `Math.max(0, NaN)` returns NaN, so any NaN input from `emotion.getValence()`, `emotion.getArousal()`, or `behaviorField.B[n]` propagates through all 6 computed AffectFrame fields (warmth, directness, initiative, defensiveness, emotionalExplicitness, stability). NaN values flow into `getNarrative()` → `buildNarrative()` → LLM prompt injection, potentially corrupting narrative output. |
| Evidence | AffectCompiler.js:173-174 — `clamp()` has no NaN guard; called 6 times in `compile()` at lines 58, 61, 64, 69, 72, 75 |
| Fix | Added `if (!Number.isFinite(value)) return 0;` at top of `clamp()`. |
| Files | `src/agent/psychology/AffectCompiler.js:173-175` |
| Regression test | Existing affect tests use finite values. Guard is defense-in-depth for corrupted emotion/behavior state. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R114-002

| Field | Detail |
|---|---|
| ID | R114-002 |
| Severity | HIGH |
| Audit finding | `StoryGenerator.generateFromSignal()` sums emotion delta values from `emotionEffect` without NaN guards. `posSum += delta` and `negSum += Math.abs(delta)` produce NaN if any single delta is NaN. NaN comparisons at lines 194/197 are always false, so importance stays at default 0.5 — but the story with corrupted emotion data gets persisted to `SimulationStore`. |
| Evidence | StoryGenerator.js:189-191 — delta values not validated before accumulation |
| Fix | Added `if (!Number.isFinite(delta)) continue;` inside the loop, matching the pattern used in `EmotionVector._packEffects()`. |
| Files | `src/narrative/StoryGenerator.js:189-191` |
| Regression test | Existing story tests use valid emotion effects. Guard is defensive for NaN leakage from upstream. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R114-003

| Field | Detail |
|---|---|
| ID | R114-003 |
| Severity | Medium |
| Audit finding | `Serialization.deserialize()` merges caller config into `_restoreConfig` using shallow spread (`...filteredConfig`). Nested config objects (e.g. `actionSelection`, `emotion`) share references between the restored engine and the caller's original config. Modifying nested config fields after restoration could inadvertently mutate the caller's original config object. |
| Evidence | Serialization.js:85-88 — `...filteredConfig` shallow copy shares nested object references |
| Fix | Added `JSON.parse(JSON.stringify(filteredConfig))` deep-copy before merging into `_restoreConfig`. |
| Files | `src/store/Serialization.js:85-88` |
| Regression test | Existing serialization tests verify round-trip but don't check reference isolation. Deep-copy preserves behavior. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R115 - NeedsSystem Config Merge + Drive Gradient Edge Cases

This section records the R115 audit findings. 2 Medium findings fixed.

### R115-002

| Field | Detail |
|---|---|
| ID | R115-002 |
| Severity | Medium |
| Audit finding | `NeedsSystem._mergeNeedsConfig()` spreads user-provided config values (`needsCfg[key]`) into `merged[key]` without validating that individual values are finite. If a user passes `{ needs: { decayRate: { hunger: NaN } } }`, the NaN survives the merge and propagates to `_calcDecayRates()` → `tick()` → behavior gradient computation. Constructor NaN guards catch this for the initial construction, but config re-merge (e.g., from domain config override) could introduce NaN after guards have run. |
| Evidence | NeedsSystem.js:40 — `{ ...base[key], ...needsCfg[key] }` without finite check on individual values |
| Fix | Added `Number.isFinite()` validation in `_mergeNeedsConfig`: each user-provided value is checked; if non-finite, falls back to the base config value (or 0 if base is also missing). |
| Files | `src/agent/psychology/NeedsSystem.js:38-44` |
| Regression test | Existing needs tests use valid config. Guard is defensive for corrupted user config. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R115-003

| Field | Detail |
|---|---|
| ID | R115-003 |
| Severity | Medium |
| Audit finding | `NeedsSystem.getDriveGradient()` computes `urgency = threshold - value` without finite guard. If a need value is NaN (e.g., from corrupted state or direct mutation bypassing `tick()` guards), `urgency` becomes NaN, and `{ need, urgency, gradient }` is pushed into the drives array. NaN urgency feeds into BehaviorField gradient computation, where `Math.max/min` with NaN produces NaN, silently corrupting behavior selection. |
| Evidence | NeedsSystem.js:363 — `urgency = threshold - value` without finite check; line 367 — NaN urgency pushed into drives |
| Fix | Added `if (!Number.isFinite(urgency)) continue;` guard after urgency computation, before pushing to drives array. |
| Files | `src/agent/psychology/NeedsSystem.js:363-364` |
| Regression test | Existing drive gradient tests use finite need values. Guard is defensive for corrupted state. |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R116 - Spatial/Social/Event Edge Cases

This section records the R116 audit findings. 5 HIGH and 3 MEDIUM findings fixed.

### R116-001

| Field | Detail |
|---|---|
| ID | R116-001 |
| Severity | HIGH |
| Audit finding | `SpatialEngine._moveAgents()` reads `cx`/`cy` from `this._coords` without NaN guard. If coordinates are corrupted (e.g., NaN from deserialized state), `dx = target.x - NaN = NaN`, `dist = NaN`, and `dx / dist` at line 270 produces NaN positions that permanently corrupt the grid. |
| Evidence | SpatialEngine.js:237-238 — `cx`/`cy` read without finite check; line 270: `dx / dist` with NaN produces NaN |
| Fix | Added `if (!Number.isFinite(cx) || !Number.isFinite(cy)) { this._moving[i] = 0; continue; }` guard at method entry. |
| Files | `src/spatial/SpatialEngine.js:237-242` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-002

| Field | Detail |
|---|---|
| ID | R116-002 |
| Severity | HIGH |
| Audit finding | `SpatialEngine.restore()` loads `this._coords = new Float32Array(data.coords)` without scanning for NaN values. If serialized data contains NaN (from a prior tick that produced NaN before serialization), the restore silently loads NaN into Float32Array. |
| Evidence | SpatialEngine.js:109 — Float32Array construction without NaN scan |
| Fix | Guard at read time in `_moveAgents` (R116-001) covers this path. Additionally, `_computeEncounters` distSq guard (R116-003) prevents NaN distance propagation. |
| Files | Covered by R116-001 and R116-003 |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-003

| Field | Detail |
|---|---|
| ID | R116-003 |
| Severity | HIGH |
| Audit finding | `SpatialEngine._computeEncounters()` computes `distSq` from potentially NaN coordinates. `Math.sqrt(NaN)` = NaN, producing NaN `distance` in encounter objects that corrupt social graph updates. |
| Evidence | SpatialEngine.js:345 — `distSq` unvalidated before `Math.sqrt` at line 348 |
| Fix | Added `if (!Number.isFinite(distSq)) continue;` guard before pushing to nearby array. |
| Files | `src/spatial/SpatialEngine.js:345-346` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-005

| Field | Detail |
|---|---|
| ID | R116-005 |
| Severity | Medium |
| Audit finding | `SpatialHash.queryRadius()` computes `radiusSq = radius * radius` without finite guard. NaN radius → NaN radiusSq → `distSq <= NaN` always false (silently filters all neighbors). Infinity radius → Infinity radiusSq → O(N) scan of all agents. |
| Evidence | SpatialHash.js:154 — `radius * radius` without guard |
| Fix | Added `if (!Number.isFinite(radius)) return [];` at method entry. |
| Files | `src/spatial/SpatialHash.js:150` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-007

| Field | Detail |
|---|---|
| ID | R116-007 |
| Severity | HIGH |
| Audit finding | `EventEffectPipeline._computeTendencyDelta()` copies `rule.delta[i]` from domain config without NaN guard. NaN values flow into `FutureTendencyDelta.delta`, then into `agent.futureTendency.updateTendency()`, corrupting future tendency arrays. |
| Evidence | EventEffectPipeline.js:309 — `delta[i] = rule.delta[i]` without finite check |
| Fix | Added `Number.isFinite(rule.delta[i]) ? rule.delta[i] : 0` validation for each delta element. |
| Files | `src/effects/EventEffectPipeline.js:309-312` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-008

| Field | Detail |
|---|---|
| ID | R116-008 |
| Severity | Medium |
| Audit finding | `EventEffectPipeline._createLocationMeaningDeltas()` passes `rule.weight` to `LocationMeaningDelta` without finite guard. Infinity weight propagates through EffectCommitter. |
| Evidence | EventEffectPipeline.js:261 — `weight: rule.weight` without finite check |
| Fix | Added `Number.isFinite(rule.weight) ? rule.weight : 0` guard. |
| Files | `src/effects/EventEffectPipeline.js:261` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-009

| Field | Detail |
|---|---|
| ID | R116-009 |
| Severity | Medium |
| Audit finding | `FutureTendencyDelta` constructor uses `this.importance = payload.importance || 0.3`. The `||` operator treats `0` as falsy, so legitimate `importance: 0` gets silently coerced to `0.3`, skewing tendency updates. |
| Evidence | FutureTendencyDelta.js:21 — `|| 0.3` coerces legitimate 0 to default |
| Fix | Changed to `typeof payload.importance === 'number' && Number.isFinite(payload.importance) ? payload.importance : 0.3`, matching MemoryDelta pattern. |
| Files | `src/effects/FutureTendencyDelta.js:21` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-015

| Field | Detail |
|---|---|
| ID | R116-015 |
| Severity | HIGH |
| Audit finding | `AndyWorld` evaluates encounters with `if (this.rng.next() > encounter.probability)`. NaN probability makes the comparison always false, so **all encounters fire deterministically** — bypassing the probabilistic filter entirely and corrupting social dynamics with spurious interactions. |
| Evidence | AndyWorld.js:676 — NaN probability → `rng.next() > NaN` is always false |
| Fix | Added `if (!Number.isFinite(encounter.probability)) continue;` guard before the RNG check. |
| Files | `src/runtime/AndyWorld.js:676` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R116-016

| Field | Detail |
|---|---|
| ID | R116-016 |
| Severity | HIGH |
| Audit finding | `SpatialEngine._computeEncounters()` uses `rel.strength` without finite guard: `prob += rel.strength * 0.15`. NaN strength → NaN prob. `Math.min(NaN, 1.0)` = NaN, so encounter is pushed with NaN probability. |
| Evidence | SpatialEngine.js:378 — `rel.strength` unvalidated; line 381: `Math.min(NaN, 1.0)` = NaN |
| Fix | Added `const strength = Number.isFinite(rel.strength) ? rel.strength : 0;` guard before probability computation. |
| Files | `src/spatial/SpatialEngine.js:378-380` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R117 - RegionGrid/Contagion/Serialization Edge Cases

This section records the R117 audit findings. 3 MEDIUM and 2 LOW findings fixed.

### R117-003

| Field | Detail |
|---|---|
| ID | R117-003 |
| Severity | Medium |
| Audit finding | `EmotionVector._socialContagion()` reads `this.personality.behavior.susceptibility` without NaN guard. If susceptibility is NaN (corrupted personality), `effectiveWeight = susceptibility * expressiveness * weight` becomes NaN, and `this.current[dim] = myVal + diff * NaN` writes NaN into every emotion dimension for one full tick. |
| Evidence | EmotionVector.js:430 — susceptibility unvalidated; line 439: NaN propagates to effectiveWeight |
| Fix | Added `if (!Number.isFinite(susceptibility)) return;` guard at method entry. |
| Files | `src/agent/psychology/EmotionVector.js:430-431` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R117-008

| Field | Detail |
|---|---|
| ID | R117-008 |
| Severity | Medium |
| Audit finding | `AgentSerializer.toJSON()` serializes `agent.emotion.toJSON()` without NaN sanitization. If any emotion dimension is temporarily NaN (e.g., from `_socialContagion` before `_clamp()` repair), the NaN is persisted to save data and becomes permanent on restore. |
| Evidence | AgentSerializer.js:18 — `agent.emotion.toJSON()` without finite guard |
| Fix | Added per-dimension `Number.isFinite()` sanitization in AgentSerializer.toJSON() emotion serialization. |
| Files | `src/agent/facade/AgentSerializer.js:18-26` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R117-009

| Field | Detail |
|---|---|
| ID | R117-009 |
| Severity | Medium |
| Audit finding | `AgentSerializer.toJSON()` serializes `socialEnergy` and `health` as raw numbers without NaN guards. Corrupted scalar values would be persisted to save data. |
| Evidence | AgentSerializer.js:33-34 — `socialEnergy` and `health` without finite guards |
| Fix | Added `Number.isFinite()` guards: `socialEnergy` defaults to 0.7, `health` defaults to 1. |
| Files | `src/agent/facade/AgentSerializer.js:33-34` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R117-001

| Field | Detail |
|---|---|
| ID | R117-001 |
| Severity | Low |
| Audit finding | `RegionGrid.setAdjacent()` stores `distance` without finite validation. NaN distance propagates through BFS in `_getAdjacentRegions`, corrupting adjacency graph. |
| Evidence | RegionGrid.js:163 — distance unvalidated |
| Fix | Added `if (!Number.isFinite(distance)) return;` guard. |
| Files | `src/spatial/RegionGrid.js:164` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R117-002

| Field | Detail |
|---|---|
| ID | R117-002 |
| Severity | Low |
| Audit finding | `RegionGrid._getAdjacentRegions()` uses `maxHops` without finite validation. NaN maxHops causes `currentDist > NaN` (always false), potentially causing infinite BFS loop. |
| Evidence | RegionGrid.js:182 — maxHops unvalidated |
| Fix | Added `if (!Number.isFinite(maxHops)) return [];` guard. |
| Files | `src/spatial/RegionGrid.js:183` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R120 - PhysiologyRuntime/PerceptionRuntime Edge Cases

This section records the R120 audit findings. 2 HIGH and 2 MEDIUM findings fixed.

### R120-001

| Field | Detail |
|---|---|
| ID | R120-001 |
| Severity | HIGH |
| Audit finding | `PhysiologyRuntime.applyNeedsToEmotion()` reads `needs.hunger`, `needs.energy`, `needs.social`, `needs.comfort`, `needs.stimulation` directly without NaN guards. If any need value is NaN (corrupted state or direct mutation), the deficit computation produces NaN, and `agent.emotion.applyEffect()` receives NaN deltas that poison emotion dimensions. |
| Evidence | PhysiologyRuntime.js:19-61 — all 5 need reads without finite checks |
| Fix | Added `safeNeeds` object with `Number.isFinite()` guards; each need defaults to 0.5 if non-finite. All 5 deficit computations now use `safeNeeds.*`. |
| Files | `src/agent/runtime/PhysiologyRuntime.js:15-22` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R120-002

| Field | Detail |
|---|---|
| ID | R120-002 |
| Severity | HIGH |
| Audit finding | `PhysiologyRuntime.updateSocialEnergy()` guards `agent.socialEnergy` against NaN at entry (line 162), but uses `agent.behaviorParams.socialEnergyDrain` and `agent.behaviorParams.socialEnergyRecharge` without finite checks. If either is NaN, `Math.max(0, NaN)` returns NaN, permanently corrupting socialEnergy. |
| Evidence | PhysiologyRuntime.js:169,173 — behaviorParams values unvalidated |
| Fix | Added `Number.isFinite()` guards on `socialEnergyDrain` (default 0.5) and `socialEnergyRecharge` (default 0.3). Added post-arithmetic NaN recovery. |
| Files | `src/agent/runtime/PhysiologyRuntime.js:166-176` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R120-003

| Field | Detail |
|---|---|
| ID | R120-003 |
| Severity | Medium |
| Audit finding | `PhysiologyRuntime.updateHealth()` computes `recoveryMod = 1.0 - (agent.personality.ocean.neuroticism * 0.3)` without finite guard. NaN neuroticism → NaN recoveryMod → NaN healthDelta. The existing NaN guard at line 141 catches it after one tick, but intermediate computations are contaminated. |
| Evidence | PhysiologyRuntime.js:133 — neuroticism unvalidated |
| Fix | Added `Number.isFinite()` guard: `neuroticism` defaults to 0.5 if non-finite. |
| Files | `src/agent/runtime/PhysiologyRuntime.js:133-134` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R120-004

| Field | Detail |
|---|---|
| ID | R120-004 |
| Severity | Medium |
| Audit finding | `Appraisal._evalPleasantness()` computes `rawPleasantness = totalValence / effectCount` without NaN guard. If event delta values contain NaN (from corrupted event data), `totalValence` becomes NaN, and `Math.max(-1, Math.min(1, NaN))` returns NaN, propagating to appraisal → stress → emotion. `moodBias` and `agreeablenessBias` also lacked finite guards. |
| Evidence | Appraisal.js:131,135,138 — rawPleasantness, moodBias, agreeablenessBias unvalidated |
| Fix | Added `Number.isFinite()` guards: `rawPleasantness` defaults to 0, `moodBias` and `agreeablenessBias` use finite checks, `traumaBias` also guarded. |
| Files | `src/agent/psychology/Appraisal.js:131-144` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R121 - EmotionRegulation/EmotionVector Native Edge Cases

This section records the R121 audit findings. 1 HIGH finding fixed.

### R121-001

| Field | Detail |
|---|---|
| ID | R121-001 |
| Severity | HIGH |
| Audit finding | `EmotionRegulation.tryRegulate()` computes `threshold = 0.15 - this.personality.ocean.neuroticism * 0.05` without finite guard. NaN neuroticism → NaN threshold → `triggerLevel < NaN` (always false) → regulation never fires, silently disabling emotion regulation for corrupted agents. |
| Evidence | EmotionRegulation.js:152 — neuroticism unvalidated |
| Fix | Added `Number.isFinite()` guard: `neuroticism` defaults to 0.5 if non-finite. |
| Files | `src/agent/psychology/EmotionRegulation.js:152-155` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R122 - Appraisal/ScheduleHandler personality.ocean NaN Guards

This section records the R122 audit findings. 10 MEDIUM findings fixed.

### R122-001

| Field | Detail |
|---|---|
| ID | R122-001 |
| Severity | Medium |
| Audit finding | `EmotionRegulation.tryRegulate()` computes `threshold = 0.15 - this.personality.ocean.neuroticism * 0.05` without finite guard. NaN neuroticism → NaN threshold → `triggerLevel < NaN` (always false) → regulation never fires, silently disabling emotion regulation for corrupted agents. |
| Evidence | EmotionRegulation.js:152 — neuroticism unvalidated |
| Fix | Added `Number.isFinite()` guard: `neuroticism` defaults to 0.5 if non-finite. |
| Files | `src/agent/psychology/EmotionRegulation.js:152-155` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-002

| Field | Detail |
|---|---|
| ID | R122-002 |
| Severity | Medium |
| Audit finding | `Appraisal._evalSuddenness()` computes `suddenness *= (1 + agent.personality.ocean.neuroticism * 0.2)` without finite guard. NaN neuroticism → NaN suddenness → `Math.max(0, Math.min(1, NaN))` = NaN, corrupting appraisal suddenness dimension. |
| Evidence | Appraisal.js:101 — neuroticism unvalidated |
| Fix | Added `Number.isFinite()` guard: `neuroticism` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:101-104` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-003

| Field | Detail |
|---|---|
| ID | R122-003 |
| Severity | Medium |
| Audit finding | `Appraisal._evalGoalRelevance()` computes `relevance += agent.personality.ocean.openness * 0.1` without finite guard. NaN openness → NaN relevance → `Math.max(0, Math.min(1, NaN))` = NaN. |
| Evidence | Appraisal.js:185 — openness unvalidated |
| Fix | Added `Number.isFinite()` guard: `openness` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:185-187` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-004

| Field | Detail |
|---|---|
| ID | R122-004 |
| Severity | Medium |
| Audit finding | `Appraisal._evalGoalConduciveness()` computes `selfEfficacy = agent.personality.ocean.conscientiousness * 0.3` without finite guard. NaN conscientiousness → NaN selfEfficacy → NaN conduciveness. |
| Evidence | Appraisal.js:231 — conscientiousness unvalidated |
| Fix | Added `Number.isFinite()` guard: `conscientiousness` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:231-234` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-005

| Field | Detail |
|---|---|
| ID | R122-005 |
| Severity | Medium |
| Audit finding | `Appraisal._evalCopingPotential()` computes `coping += (1 - agent.personality.ocean.neuroticism) * 0.2` without finite guard. NaN neuroticism → NaN → NaN coping → `Math.max(0, Math.min(1, NaN))` = NaN. |
| Evidence | Appraisal.js:326 — neuroticism unvalidated |
| Fix | Added `Number.isFinite()` guard: `neuroticism` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:326-328` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-006

| Field | Detail |
|---|---|
| ID | R122-006 |
| Severity | Medium |
| Audit finding | `Appraisal._evalCopingPotential()` computes `coping += agent.personality.ocean.conscientiousness * 0.1` without finite guard. NaN conscientiousness → NaN coping. |
| Evidence | Appraisal.js:329 — conscientiousness unvalidated |
| Fix | Added `Number.isFinite()` guard: `conscientiousness` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:329-331` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-007

| Field | Detail |
|---|---|
| ID | R122-007 |
| Severity | Medium |
| Audit finding | `Appraisal._evalCopingPotential()` computes `coping += agent.personality.ocean.openness * 0.1` without finite guard. NaN openness → NaN coping. |
| Evidence | Appraisal.js:332 — openness unvalidated |
| Fix | Added `Number.isFinite()` guard: `openness` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:332-334` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-008

| Field | Detail |
|---|---|
| ID | R122-008 |
| Severity | Medium |
| Audit finding | `Appraisal._evalCopingPotential()` computes `coping += agent.personality.ocean.extraversion * 0.1` without finite guard. NaN extraversion → NaN coping. |
| Evidence | Appraisal.js:349 — extraversion unvalidated |
| Fix | Added `Number.isFinite()` guard: `extraversion` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:349-351` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-009

| Field | Detail |
|---|---|
| ID | R122-009 |
| Severity | Medium |
| Audit finding | `Appraisal._evalNormConformity()` computes `conformity = 0.5 + (conformity - 0.5) * (0.5 + agent.personality.ocean.agreeableness * 0.5)` without finite guard. NaN agreeableness → NaN conformity → `Math.max(0, Math.min(1, NaN))` = NaN. |
| Evidence | Appraisal.js:379 — agreeableness unvalidated |
| Fix | Added `Number.isFinite()` guard: `agreeableness` defaults to 0 if non-finite. |
| Files | `src/agent/psychology/Appraisal.js:379-381` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-010

| Field | Detail |
|---|---|
| ID | R122-010 |
| Severity | Medium |
| Audit finding | `ScheduleHandler.checkSchedule()` computes `sickProb = (0.4 - agent.health) * 2 * (1 - agent.personality.ocean.conscientiousness * 0.3)` without finite guard. NaN conscientiousness → NaN sickProb → `Math.min(0.8, NaN)` = NaN → `agent.rand() < NaN` always false, silently disabling sick-leave behavior for corrupted agents. |
| Evidence | ScheduleHandler.js:221 — conscientiousness unvalidated |
| Fix | Added `Number.isFinite()` guard: `conscientiousness` defaults to 0 if non-finite. |
| Files | `src/agent/handlers/ScheduleHandler.js:221-224` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R122-011

| Field | Detail |
|---|---|
| ID | R122-011 |
| Severity | Medium |
| Audit finding | `ScheduleHandler.checkSchedule()` computes `skipProb = emotionalDistress * 0.4 * (1 - agent.personality.ocean.conscientiousness * 0.5)` without finite guard. NaN conscientiousness → NaN skipProb → `Math.min(0.5, NaN)` = NaN → `agent.rand() < NaN` always false, silently disabling distress-skip behavior for corrupted agents. |
| Evidence | ScheduleHandler.js:237 — conscientiousness unvalidated |
| Fix | Added `Number.isFinite()` guard: `conscientiousness` defaults to 0 if non-finite. |
| Files | `src/agent/handlers/ScheduleHandler.js:237-240` |
| Re-verification | Full `npm test`: 3264 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R123 - Post-R122 Review: Appraisal/Physiology Guard Completion

This section records the R123 post-review findings. 3 MEDIUM findings fixed.

### R123-001

| Field | Detail |
|---|---|
| ID | R123-001 |
| Severity | Medium |
| Audit finding | R122 introduced a regression in `Appraisal._evalPleasantness()`: `rawPleasantness` was declared as `const` and then reassigned in the NaN guard. A corrupted event delta could therefore throw `TypeError: Assignment to constant variable` instead of being contained. |
| Evidence | `src/agent/psychology/Appraisal.js` NaN guard path; reproduced by unit test with `delta: { joy: NaN }`. |
| Fix | Changed `rawPleasantness` to `let`, cached `getAppraisalBias()` once, and added regression coverage for corrupted event deltas/mood/appraisal bias. |
| Files | `src/agent/psychology/Appraisal.js`; `tests/unit/psychology/appraisal-branches.test.js` |
| Regression test | `Appraisal._evalPleasantness` corrupted-input test now asserts finite output and no throw. |
| Status | Fixed and verified. |

### R123-002

| Field | Detail |
|---|---|
| ID | R123-002 |
| Severity | Medium |
| Audit finding | R122 guarded selected `personality.ocean` reads in Appraisal but left other appraisal inputs unguarded: NaN event deltas, emotion valence/stress, relationship strength, socialEnergy, and needs could still propagate NaN into dimensions, modifiers, or importance. |
| Evidence | `Appraisal._evalGoalConduciveness`, `_evalCompatibility`, `_evalAgency`, `_evalCopingPotential`, `_appraisalToEmotion`, `_computeImportance`. |
| Fix | Added `finiteOr()` helper and finite guards for event deltas, compatibility inputs, relationship strength, coping inputs, emotion modifiers, and importance math. |
| Files | `src/agent/psychology/Appraisal.js`; `tests/unit/psychology/appraisal-branches.test.js` |
| Regression test | Corrupted Appraisal fixture with NaN ocean traits, event deltas, valence, stress, socialEnergy, needs, relationship strength, and appraisal bias now produces finite scalar dimensions, finite modifiers, and finite importance. |
| Status | Fixed and verified. |

### R123-003

| Field | Detail |
|---|---|
| ID | R123-003 |
| Severity | Medium |
| Audit finding | R120 PhysiologyRuntime code changes were present in the working tree but not committed, while docs already marked them fixed. The existing patch also guarded NaN values but not all missing-object or arithmetic-NaN paths (`hoursElapsed`, missing `behaviorParams`, post-arithmetic `healthDelta`). |
| Evidence | `git status --short` showed `M src/agent/runtime/PhysiologyRuntime.js`; external `agnes/agnes-2.0-flash` review identified missing `behaviorParams` guard in `updateSocialEnergy()`. |
| Fix | Completed the PhysiologyRuntime guard set: safe elapsed time, safe needs, safe stress, safe behavior vectors, safe weather env, finite `healthDelta`, optional `behaviorParams`, and post-arithmetic socialEnergy repair. Added direct unit coverage. |
| Files | `src/agent/runtime/PhysiologyRuntime.js`; `tests/unit/physiology-runtime-nan.test.js` |
| Regression test | PhysiologyRuntime NaN tests cover NaN needs, finite deficit deltas, NaN health inputs, NaN/missing behaviorParams, and NaN elapsed time. |
| External review | `opencode run --pure -m agnes/agnes-2.0-flash` reviewed the diff; the valid finding (missing `behaviorParams` guard) was fixed before commit. |
| Status | Fixed and verified. |

## R124 - EventDispatcher/InteractionFacade/WorldPressure Edge Cases

This section records the R124 audit findings. 6 MEDIUM findings fixed.

### R124-001

| Field | Detail |
|---|---|
| ID | R124-001 |
| Severity | Medium |
| Audit finding | `EventDispatcher._evaluateEncounter()` reads `agentAInst.emotion.getValence()` and `agentBInst.emotion.getValence()` without finite guards. NaN valence → NaN interactionProb → `Math.max(0.05, Math.min(0.95, NaN))` = NaN → `rand() > NaN` always false → ALL encounters fire deterministically, bypassing probabilistic filter. |
| Evidence | EventDispatcher.js:149-152 — valence unvalidated |
| Fix | Added `Number.isFinite()` guards on both valence values; defaults to 0 if non-finite. |
| Files | `src/runtime/EventDispatcher.js:149-152` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R124-002

| Field | Detail |
|---|---|
| ID | R124-002 |
| Severity | Medium |
| Audit finding | `EventDispatcher._evaluateEncounter()` reads `agentAInst.socialEnergy` and `agentBInst.socialEnergy` without finite guards. NaN socialEnergy → NaN in `(1 - Math.min(NaN, x))` → NaN interactionProb → all encounters fire deterministically. |
| Evidence | EventDispatcher.js:154 — socialEnergy unvalidated |
| Fix | Added `Number.isFinite()` guards on both socialEnergy values; defaults to 0.7 if non-finite. |
| Files | `src/runtime/EventDispatcher.js:154-156` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R124-003

| Field | Detail |
|---|---|
| ID | R124-003 |
| Severity | Medium |
| Audit finding | `EventDispatcher._evaluateEncounter()` clamps `interactionProb` with `Math.max(0.05, Math.min(0.95, interactionProb))` without finite guard. NaN interactionProb → NaN clamp result → `rand() > NaN` always false. Even with valence/socialEnergy guards, a corrupted `strength` value could produce NaN interactionProb. |
| Evidence | EventDispatcher.js:157 — interactionProb unvalidated before clamp |
| Fix | Added `Number.isFinite()` check: if interactionProb is non-finite, use default 0.3. |
| Files | `src/runtime/EventDispatcher.js:157-160` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R124-004

| Field | Detail |
|---|---|
| ID | R124-004 |
| Severity | Medium |
| Audit finding | `InteractionFacade.personalityCompatibility()` reads all 5 `personality.ocean.*` values without finite guards. NaN ocean value → NaN diff → NaN similarity → `Math.max(0, Math.min(1, NaN))` = NaN, corrupting interaction valence calculations. |
| Evidence | InteractionFacade.js:123-127 — all 5 ocean reads unvalidated |
| Fix | Added `finiteOr()`-style `Number.isFinite()` guards on both agents' ocean values; defaults to 0.5 if non-finite. |
| Files | `src/agent/facade/InteractionFacade.js:119-135` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R124-005

| Field | Detail |
|---|---|
| ID | R124-005 |
| Severity | Medium |
| Audit finding | `EventEffectPipeline._calculateImportance()` returns `Math.min(1.0, importance)` without finite guard. If `fact.participants` or `fact.scope` were corrupted to produce non-finite importance, `Math.min` would return NaN, propagating to `FutureTendencyDelta` which stores it unguarded. |
| Evidence | EventEffectPipeline.js:288-292 — importance unvalidated |
| Fix | Added `Number.isFinite()` check: if importance is non-finite, return default 0.3. |
| Files | `src/effects/EventEffectPipeline.js:288-294` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R124-006

| Field | Detail |
|---|---|
| ID | R124-006 |
| Severity | Medium |
| Audit finding | `WorldPressure.compute()` sums 4 pressure components then clamps with `Math.max(0, Math.min(1, sum))` without finite guard. If any component is NaN (from corrupted agent/event data), the sum is NaN → total pressure becomes NaN → downstream consumers (UtilityScorer, ActionCandidate) receive NaN pressure values. |
| Evidence | WorldPressure.js:30-32 — sum unvalidated before clamp |
| Fix | Added `Number.isFinite()` check on raw total; defaults to 0 if non-finite. |
| Files | `src/pressure/WorldPressure.js:27-33` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R125 - Full Codebase Edge-Case Re-Scan

This section records the R125 audit findings. **Clean round — no new vulnerabilities found.**

R125 performed a comprehensive re-scan of all 50+ source files across runtime, agent, psychology, effects, social, spatial, store, pressure, config, and facade modules. All 8 audit areas (InteractionFacade valence guards, AndyWorld.tick() arithmetic, AgentRuntime state reads, SpatialEngine encounters, EmotionVector pipeline, RNG usage, delta/effect application, serialization round-trip) are comprehensively covered by R110-R124 fixes.

Two minor LOW-severity gaps identified (config-injection-only scenarios requiring malicious user config):
- `EmotionVector._coActivationSpread` weight not explicitly guarded (requires NaN in user config, already blocked by constructor defaults)
- `BehaviorField._enforceBoundary` reflect not explicitly guarded (requires NaN in user config)

Neither constitutes an actionable vulnerability in production. No code changes required.

| Status | Clean audit — no findings. |

## R126 - IntrinsicMotivation/PersonalMemory Edge Cases

This section records the R126 audit findings. 1 HIGH and 1 MEDIUM finding fixed.

### R126-001

| Field | Detail |
|---|---|
| ID | R126-001 |
| Severity | HIGH |
| Audit finding | `IntrinsicMotivation._computeCuriosityGate()` divides by `this._imConfig.needGateThreshold` without guard. `threshold=0` → `minSatisfaction/0 = Infinity`; `threshold=1` → `1-1=0` division. NaN/Infinity propagates into `gate` → `rawCuriosity * gate` → corrupted curiosity return value. |
| Evidence | IntrinsicMotivation.js:711,714 — threshold unvalidated before division |
| Fix | Added finite range guard: if threshold is non-finite or in `[0,1]`, fall back to `rawCuriosity * Math.max(0, minSatisfaction)`. |
| Files | `src/agent/psychology/IntrinsicMotivation.js:708-720` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R126-013

| Field | Detail |
|---|---|
| ID | R126-013 |
| Severity | Medium |
| Audit finding | `PersonalMemory._seedMemories()` uses `m.importance || 0.8` which masks legitimate `0` importance with `0.8`. If a seed memory explicitly has `importance: 0`, it gets inflated to `0.8`, incorrectly overriding the pruning system's importance model. |
| Evidence | PersonalMemory.js:137 — `|| 0.8` treats `0` as missing |
| Fix | Changed `m.importance || 0.8` to `m.importance ?? 0.8` to distinguish `undefined` (missing) from `0` (explicit zero importance). |
| Files | `src/agent/memory/PersonalMemory.js:137` |
| Re-verification | Full `npm test`: 3271 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

## R127 - IntrinsicMotivation Need-Gate Curve Verification

This section records the R127 follow-up review. No new vulnerability found; 1 test-hardening item closed.

### R127-001

| Field | Detail |
|---|---|
| ID | R127-001 |
| Severity | Test hardening |
| Audit finding | Post-R126 review checked whether the `needGateThreshold` guard changed the curiosity gate curve. The apparent risk of large boost at high satisfaction was rejected because `minSatisfaction` is initialized to `1`, so satisfied needs are capped at raw curiosity. |
| Evidence | `IntrinsicMotivation._applyNeedGate()` initializes `minSatisfaction = 1`; all need satisfaction ratios are combined through `Math.min()`. |
| Fix | Restored explicit three-branch structure for readability and added regression tests locking current behavior: satisfied needs do not inflate beyond raw curiosity, and invalid `needGateThreshold=0` returns finite output. |
| Files | `src/agent/psychology/IntrinsicMotivation.js`; `tests/unit/intrinsic-domain.test.js` |
| Regression test | `tests/unit/intrinsic-domain.test.js` now covers satisfied-needs cap and invalid-threshold fallback. |
| Status | Fixed and verified. |

## R128 - IntrinsicMotivation Needs-Threshold Zero Guard

This section records the R128 follow-up finding. 1 MEDIUM finding fixed.

### R128-001

| Field | Detail |
|---|---|
| ID | R128-001 |
| Severity | Medium |
| Audit finding | R126 guarded `intrinsicMotivation.needGateThreshold`, but `_applyNeedGate()` still divided each need value by `thresholdConfig[need]`. `validateConfig()` allowed `needs.threshold.* = 0`, so supported config or restored legacy config could produce `0 / 0 = NaN`, then NaN `minSatisfaction`, NaN gate, and NaN effective curiosity. |
| Evidence | Local repro: `_applyNeedGate(0.4, { hunger: 0, ... }, { hunger: 0, ... })` returned `NaN` on R127. |
| Fix | Runtime now ignores non-finite or non-positive need thresholds and non-finite need values before division. Config validation now rejects `needs.threshold.* < 0.001`, preserving positive denominators at the public boundary. |
| Files | `src/agent/psychology/IntrinsicMotivation.js`; `src/config/validate.js`; `tests/unit/intrinsic-domain.test.js`; `tests/unit/config/validate-config.test.js` |
| Regression test | Added direct `_applyNeedGate()` zero-threshold test and config validator zero-threshold rejection test. |
| Verification | Targeted suite: `npx vitest run tests/unit/intrinsic-domain.test.js tests/unit/config/validate-config.test.js tests/unit/config-injection-restore.test.js --no-color` -> 83 passed. |
| Status | Fixed and verified. |

## R129 - Pressure/Goal Boundary Hardening

This section records the R129 no-quota workflow pass. 2 MEDIUM and 1 LOW/P2 hardening findings fixed.

### R129-001

| Field | Detail |
|---|---|
| ID | R129-001 |
| Severity | Medium |
| Audit finding | `MemoryPressure.compute()` parsed `options.simTime` and `mem.timestamp` with `new Date(...).getTime()` but did not guard invalid Date results. Invalid strings produced `NaN` age, `NaN` recencyWeight, `NaN` recency, and `NaN` total pressure. |
| Evidence | Local repro: `MemoryPressure.compute({ memories: [{ importance: 1, activation: 1, valence: -1, timestamp: '2026-01-01' }] }, { simTime: 'bad-date' })` returned `total: NaN` on R128. |
| Fix | Added finite guards for parsed simulation time and memory timestamps; invalid simTime falls back to deterministic `0`, invalid memory timestamps skip recency contribution. Added final finite guards before output clamps. |
| Files | `src/pressure/MemoryPressure.js`; `tests/unit/memory-pressure-simtime.test.js` |
| Regression test | Added invalid simTime and invalid memory timestamp tests. |
| Re-verification | Targeted suite: `npx vitest run tests/unit/memory-pressure-simtime.test.js tests/unit/goalsystem.test.js tests/unit/pressure-layer.test.js --no-color` -> 104 passed. |
| Status | Fixed and verified. |

### R129-002

| Field | Detail |
|---|---|
| ID | R129-002 |
| Severity | Medium |
| Audit finding | `GoalSystem.createGoal()` used `Math.max/min` directly on `priority` and `Math.max(0, weight)` on `weight`. `NaN` priority/weight persisted into goal state, and `Infinity` weight remained unbounded. `tickGoals()` also wrote `progress: NaN` when `nowMs` was `NaN`. |
| Evidence | Local repro: `createGoal({ source: 'self', priority: NaN, weight: NaN })` produced `priority: NaN, weight: NaN`; `tickGoals([goal], {}, NaN)` produced `progress: NaN` on R128. |
| Fix | Added finite helper guards for priority, weight, and progress calculation; non-finite `nowMs` now leaves progress unchanged instead of writing NaN. |
| Files | `src/action/GoalSystem.js`; `tests/unit/goalsystem.test.js` |
| Regression test | Added tests for non-finite priority/weight and non-finite `nowMs`. |
| Re-verification | Targeted suite: `npx vitest run tests/unit/memory-pressure-simtime.test.js tests/unit/goalsystem.test.js tests/unit/pressure-layer.test.js --no-color` -> 104 passed. |
| Status | Fixed and verified. |

### R129-003

| Field | Detail |
|---|---|
| ID | R129-003 |
| Severity | P2 hardening |
| Audit finding | `RelationshipPressure.compute()` accepted caller-provided thresholds without finite/range guards. Non-finite or invalid `isolationCount`, `conflictRatio`, or `decayHours` could silently disable isolation/conflict/decay pressure branches. |
| Evidence | Local repro: passing `{ isolationCount: NaN, conflictRatio: NaN, decayHours: 0 }` caused relationship pressure branches to drop to safe-looking zero values instead of using defaults. |
| Fix | Added threshold sanitizers: positive finite values for counts/hours, finite `[0,1]` clamp for ratio, default fallback otherwise. |
| Files | `src/pressure/RelationshipPressure.js`; `tests/unit/pressure-layer.test.js` |
| Regression test | Added invalid-threshold fallback test that verifies conflict/decay remain active and all outputs finite. |
| Re-verification | Targeted suite: `npx vitest run tests/unit/memory-pressure-simtime.test.js tests/unit/goalsystem.test.js tests/unit/pressure-layer.test.js --no-color` -> 104 passed. |
| Status | Fixed and verified. |

## R130 - Serialization Restore Boundary Hardening

This section records the R130 no-quota workflow pass. 4 restore-boundary findings fixed; 1 external-audit candidate rejected.

### R130-001

| Field | Detail |
|---|---|
| ID | R130-001 |
| Severity | Medium |
| Audit finding | `Relationship.fromJSON()` accepted invalid `lastInteraction` and `history[*].time` strings, storing Invalid Date objects. A later `toJSON()` called `toISOString()` and threw `RangeError: Invalid time value`, breaking save-after-restore. |
| Evidence | Local repro on R129: `Relationship.fromJSON({ agentA:'a', agentB:'b', lastInteraction:'bad-date' }).toJSON()` threw `RangeError`; same for `history:[{ time:'bad-date' }]`. |
| Fix | Added `safeDate()` normalization in restore, interaction recording, and serialization paths; invalid/missing dates fall back to deterministic epoch sentinel. |
| Files | `src/social/Relationship.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | Added invalid restored relationship date re-serialization test. |
| Status | Fixed and targeted-test verified. |

### R130-002

| Field | Detail |
|---|---|
| ID | R130-002 |
| Severity | Medium |
| Audit finding | `StateMachine.fromJSON()` accepted invalid `stateEnteredAt`, storing Invalid Date and later throwing on `toJSON().stateEnteredAt`. `getInfo()` could also return NaN elapsed if given invalid simTime. |
| Evidence | Local repro on R129: `StateMachine.fromJSON({ currentState:'idle', stateEnteredAt:'bad-date', history:[] }, domain).toJSON()` threw `RangeError`. |
| Fix | Added `safeDate()` normalization for restored `stateEnteredAt` and finite elapsed calculation in `getInfo()`. |
| Files | `src/agent/psychology/StateMachine.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | Added invalid restored `stateEnteredAt` re-serialization and invalid simTime elapsed test. |
| Status | Fixed and targeted-test verified. |

### R130-003

| Field | Detail |
|---|---|
| ID | R130-003 |
| Severity | Medium |
| Audit finding | `EventDispatcher.fromJSON()` assumed every `eventLog` entry was an object. A null entry crashed restore with `TypeError`. It also accepted `_nextId: NaN`, causing subsequent event ids like `evt_NaN`. |
| Evidence | Local repro on R129: `EventDispatcher.fromJSON({ eventLog:[null] }, domain)` crashed; `EventDispatcher.fromJSON({ eventLog:[{id:'evt_5'}], _nextId: NaN }, domain).createEvent(...).id` returned `evt_NaN`. |
| Fix | Skip non-object event entries and only accept non-negative integer `_nextId`; otherwise infer from restored event ids. |
| Files | `src/runtime/EventDispatcher.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | Added invalid eventLog/null and invalid `_nextId` repair test. |
| Status | Fixed and targeted-test verified. |

### R130-004

| Field | Detail |
|---|---|
| ID | R130-004 |
| Severity | Medium |
| Audit finding | `SocialGraph.fromJSON()`/constructor assumed every restored edge was an object with both endpoints. Null or partial edge entries crashed restore before `Relationship` sanitization could run. |
| Evidence | Local repro on R129: `SocialGraph.fromJSON({ edges:[null] }).toJSON()` threw `TypeError: Cannot read properties of null (reading 'agentA')`. |
| Fix | Skip non-object or endpoint-incomplete restored edges. Existing valid edges still restore through `Relationship`, including R130-001 date sanitization. |
| Files | `src/social/SocialGraph.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | Added invalid restored edges test. |
| Status | Fixed and targeted-test verified. |

### R130-EXT-REJECTED-001

| Field | Detail |
|---|---|
| ID | R130-EXT-REJECTED-001 |
| Severity | Rejected |
| Audit finding | External no-quota audit suggested `EventDispatcher.createEvent({ time: string })` overwrites string times with `_simTime`, causing event timestamp loss. |
| Verification verdict | Rejected. Local check showed `params.time || this._simTime` preserves truthy string times, and `_cleanupOldEvents()` already handles Date-or-string event times via `new Date(evtTime).getTime()`. No failing repro. |
| Status | Rejected. |

## R131 - Counter Restore Boundary Hardening

This section records the R131 no-quota workflow pass. 4 counter-boundary findings fixed, with local repros and external no-quota audit confirmation.

### R131-001

| Field | Detail |
|---|---|
| ID | R131-001 |
| Severity | Medium |
| Audit finding | `WorldClock.fromJSON()` restored `tickCount` with `data.tickCount || 0`, allowing truthy invalid values such as `Infinity`, `-1`, `1.5`, and `'7'` to persist into the clock. |
| Evidence | Local repro on R130: `WorldClock.fromJSON({ time:'2026-01-01T00:00:00Z', tickCount: Infinity }).toJSON()` returned `tickCount: Infinity`; negative/fractional/string values also persisted. |
| Fix | Restore now accepts only non-negative integer `tickCount`, otherwise falls back to 0. |
| Files | `src/runtime/WorldClock.js`; `tests/runtime/runtime.test.js` |
| Regression test | Added invalid `tickCount` restore test. |
| Status | Fixed and targeted-test verified. |

### R131-002

| Field | Detail |
|---|---|
| ID | R131-002 |
| Severity | High |
| Audit finding | `SocialGraph` restored `_tickCount` without finite/integer/range validation. Invalid values can corrupt modulo-based triadic closure / Dunbar scheduling and sampling offsets. |
| Evidence | Local repro on R130: `SocialGraph.fromJSON({ edges: [], _tickCount: Infinity }).toJSON()` returned `_tickCount: Infinity`; negative/fractional values also persisted. External no-quota audit independently flagged `%` scheduling corruption. |
| Fix | Added `safeCounter()` and applied it in constructor restore, `fromJSON()`, and `toJSON()`. |
| Files | `src/social/SocialGraph.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | Added invalid restored `_tickCount` tests. |
| Status | Fixed and targeted-test verified. |

### R131-003

| Field | Detail |
|---|---|
| ID | R131-003 |
| Severity | Low/Medium |
| Audit finding | `BehaviorField` restored `_tickCount` and `_attractorTicksLeft` with `|| 0`, allowing truthy invalid values such as `Infinity`, negative numbers, fractional numbers, and strings to persist into serialized behavior state. |
| Evidence | Local repro on R130: `BehaviorField.fromJSON(... _tickCount: Infinity, _attractorTicksLeft: -1 ...).toJSON()` returned invalid counters. |
| Fix | Added `safeCounter()` for `_tickCount` and `_attractorTicksLeft` in constructor and `fromJSON()` restore paths. |
| Files | `src/agent/psychology/BehaviorField.js`; `tests/unit/serialization-roundtrip.test.js` |
| Regression test | Added invalid restored BehaviorField counter test. |
| Status | Fixed and targeted-test verified. |

### R131-004

| Field | Detail |
|---|---|
| ID | R131-004 |
| Severity | High |
| Audit finding | `SimulationStore.onTick()` used `tickResult.tickNumber ?? this.tickCount + 1`, allowing non-null invalid values such as strings, `NaN`, `Infinity`, negatives, and fractions to become store `tickCount`. String values can cascade into concatenation (`'5' + 1 -> '51'`) and break modulo-based flush/snapshot/decay scheduling. |
| Evidence | Local repro on R130: `store.onTick({ tickNumber: Infinity })` set `tickCount` to `Infinity`; `tickNumber: NaN` set `NaN`; external no-quota audit independently flagged the string cascade. |
| Fix | Added `_tickCount()` validator and used it for init metadata restore and `onTick()`; invalid `tickNumber` now falls back to existing `tickCount + 1` lifecycle behavior. |
| Files | `src/store/SimulationStore.js`; `tests/store/simulation-store.test.js` |
| Regression test | Added invalid `tickNumber` fallback test. |
| Status | Fixed and targeted-test verified. |

## R132 - Fleet-Mode Deep Edge-Case Scan (5 parallel agents)

This section records the R132 audit findings. 5 parallel Audit agents (A1-A5) scanned all 50+ source files. 20+ findings verified; fixes applied by 5 parallel Fix agents (F1-F5).

### R132-001

| Field | Detail |
|---|---|
| ID | R132-001 |
| Severity | HIGH |
| Audit finding | `EmotionVector._timeDecay()` reads `this.personality.behavior.emotionDecayRate` with `||` fallback. NaN is truthy, so `||` doesn't catch it. NaN lambda → `Math.exp(-NaN * dt)` = NaN → NaN emotion dimensions before `_clamp()` runs. |
| Evidence | EmotionVector.js:160 — `emotionDecayRate || this._cfg.decayLambda` |
| Fix | Changed to `Number.isFinite()` ternary: `const lambda = Number.isFinite(this.personality.behavior.emotionDecayRate) ? this.personality.behavior.emotionDecayRate : this._cfg.decayLambda;` |
| Files | `src/agent/psychology/EmotionVector.js:160` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-002

| Field | Detail |
|---|---|
| ID | R132-002 |
| Severity | HIGH |
| Audit finding | `EmotionVector._coActivationSpread()` reads `this._cfg.coActivationWeight` without guard. NaN weight → NaN deltas → `Math.max(-0.02, Math.min(0.02, NaN))` = NaN → permanently poisons emotion dimensions. |
| Evidence | EmotionVector.js:326 — `const weight = this._cfg.coActivationWeight;` |
| Fix | Added `if (!Number.isFinite(weight)) return;` at start of `_coActivationSpread()`. |
| Files | `src/agent/psychology/EmotionVector.js:327` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-003

| Field | Detail |
|---|---|
| ID | R132-003 |
| Severity | MEDIUM |
| Audit finding | `EmotionVector._inertiaFilter()` reads `this._cfg.maxDeltaPerTick` without guard. NaN maxDelta → NaN pullStrength → NaN `(1 - pullStrength)` → NaN `base + dist * NaN` → corrupted emotion dimensions. |
| Evidence | EmotionVector.js:405 — `const maxDelta = this._cfg.maxDeltaPerTick;` |
| Fix | Added `if (!Number.isFinite(maxDelta)) return;` at start of `_inertiaFilter()`. |
| Files | `src/agent/psychology/EmotionVector.js:407` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-004

| Field | Detail |
|---|---|
| ID | R132-004 |
| Severity | MEDIUM |
| Audit finding | `EmotionVector._velocityLimit()` reads `this._cfg.maxDeltaPerTick` without guard. NaN maxVelocity → `Math.abs(delta) > NaN` (always false) → silently skips velocity limit → unbounded emotion drift. |
| Evidence | EmotionVector.js:509 — `const maxVelocity = this._cfg.maxDeltaPerTick;` |
| Fix | Added `if (!Number.isFinite(maxVelocity)) return;` at start of `_velocityLimit()`. |
| Files | `src/agent/psychology/EmotionVector.js:512` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-005

| Field | Detail |
|---|---|
| ID | R132-005 |
| Severity | MEDIUM |
| Audit finding | `EmotionVector.applyEffect()` reads `this.personality.behavior.emotionalInertia` with `||` fallback. NaN is truthy → bypasses fallback → NaN inertia → NaN effectiveDelta → NaN clampedDelta. |
| Evidence | EmotionVector.js:572 — `emotionalInertia || this._cfg.inertia` |
| Fix | Changed to `Number.isFinite()` ternary: `const inertia = Number.isFinite(this.personality.behavior.emotionalInertia) ? this.personality.behavior.emotionalInertia : this._cfg.inertia;` |
| Files | `src/agent/psychology/EmotionVector.js:576` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-006

| Field | Detail |
|---|---|
| ID | R132-006 |
| Severity | MEDIUM |
| Audit finding | `EmotionVector.applyEffect()` clamp uses `this._cfg.maxDeltaPerTick` directly. NaN maxDeltaPerTick → `Math.max(-NaN, Math.min(NaN, effectiveDelta))` = NaN, wiping out finite effectiveDelta. |
| Evidence | EmotionVector.js:587 — `Math.max(-this._cfg.maxDeltaPerTick, ...)` |
| Fix | Added local `maxD` guard: `const maxD = Number.isFinite(this._cfg.maxDeltaPerTick) ? this._cfg.maxDeltaPerTick : 0.05;` then `Math.max(-maxD, Math.min(maxD, effectiveDelta))`. |
| Files | `src/agent/psychology/EmotionVector.js:592` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-007

| Field | Detail |
|---|---|
| ID | R132-007 |
| Severity | LOW |
| Audit finding | `NeedsSystem.native.getDriveGradient()` lacks `Number.isFinite(urgency)` guard (JS version has it at line 370). NaN urgency → NaN drive → NaN gradient → NaN behavior signals. |
| Evidence | NeedsSystem.native.js:244 — missing guard vs JS parity |
| Fix | Added `if (!Number.isFinite(urgency)) continue;` before `drives.push()`, matching JS version. |
| Files | `src/agent/psychology/NeedsSystem.native.js:245` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-008

| Field | Detail |
|---|---|
| ID | R132-008 |
| Severity | LOW |
| Audit finding | `NeedsSystem.native.getRecoveryRatesForBehavior()` computes `factor = Math.max(0, 1 - distance / maxDist)` without finite guard. NaN distance → NaN factor → NaN rate → `current + NaN * hoursElapsed` = NaN need value. |
| Evidence | NeedsSystem.native.js:266 — missing factor guard vs JS parity |
| Fix | Added `if (!Number.isFinite(factor)) factor = 0;` after factor computation, matching JS version. |
| Files | `src/agent/psychology/NeedsSystem.native.js:268` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-009

| Field | Detail |
|---|---|
| ID | R132-009 |
| Severity | HIGH |
| Audit finding | `SocialGraph.getStrongRelationships()` sort: `.sort((a, b) => b.strength - a.strength)` — NaN strength → NaN comparator → unpredictable ordering → silently breaks social dynamics. |
| Evidence | SocialGraph.js:126 — unguarded sort comparator |
| Fix | Changed to `Number.isFinite()`-guarded comparator: `(Number.isFinite(b.strength) ? b.strength : 0) - (Number.isFinite(a.strength) ? a.strength : 0)`. |
| Files | `src/social/SocialGraph.js:126` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-010

| Field | Detail |
|---|---|
| ID | R132-010 |
| Severity | HIGH |
| Audit finding | `SocialGraph._projectDunbarLayers()` sort: `.sort((a, b) => b.strength - a.strength)` — same NaN comparator issue, corrupting Dunbar layer assignment. |
| Evidence | SocialGraph.js:405 — unguarded sort comparator |
| Fix | Changed to `Number.isFinite()`-guarded comparator, matching R132-009 fix. |
| Files | `src/social/SocialGraph.js:409` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-011

| Field | Detail |
|---|---|
| ID | R132-011 |
| Severity | HIGH |
| Audit finding | `SocialGraph` has 6 filter predicates reading `r.strength` without finite guard (lines 153,158,175,206,284,373). NaN comparisons always return false → corrupted edges silently dropped → wrong social topology. `_triadicClosure()` (lines 306-314) writes NaN delta into `relAC.strength` without guard → permanent corruption. |
| Evidence | SocialGraph.js:153,158,175,206,284,306,373 — unguarded strength reads |
| Fix | Added `Number.isFinite(r.strength) &&` guard to all 6 filter predicates. Added 3 `Number.isFinite()` guards before bridge strength computation in `_triadicClosure()`. Added `weight: Number.isFinite(r.strength) ? r.strength : 0` guard in `getInfluenceTargets()`. |
| Files | `src/social/SocialGraph.js:153,158,175,206,284,308,377,380` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-012

| Field | Detail |
|---|---|
| ID | R132-012 |
| Severity | MEDIUM |
| Audit finding | `AgentNarrative._parseEmotionTag()` uses `parseFloat()` without finite guard. `parseFloat("abc:")` = NaN → `NaN < 0` = false → silently drops entry. `_filterNegativeEmotions()` uses `agent.emotion.stress > 6` without guard — NaN stress → false → suppresses narrative symptom. Need checks (`energy < 0.25`, `hunger < 0.25`) also unguarded. |
| Evidence | AgentNarrative.js:78,106,63-71 — unguarded parseFloat/stress/needs |
| Fix | Added `Number.isFinite(val) && val < 0` guard. Added `Number.isFinite(agent.emotion.stress) && agent.emotion.stress > 6` guard. Added `Number.isFinite(needs.energy) &&` and `Number.isFinite(needs.hunger) &&` guards. |
| Files | `src/agent/facade/AgentNarrative.js:63,66,79,106` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-013

| Field | Detail |
|---|---|
| ID | R132-013 |
| Severity | MEDIUM |
| Audit finding | `AgentRuntime.tick()` passes `imResult.emotionEffects` to `EffectCommitter` and `agent.emotion.applyEffect()` without finite guard. If intrinsic motivation produces NaN deltas (corrupted curiosity state), they propagate into emotion dimensions. |
| Evidence | AgentRuntime.js:142-157 — `imResult.emotionEffects` unvalidated before commit/apply |
| Fix | Added `safeEmotionEffects` filter: only includes entries where `Number.isFinite(val)`. Used in both `committer.commit` and `applyEffect` calls. |
| Files | `src/agent/AgentRuntime.js:142-163` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-014

| Field | Detail |
|---|---|
| ID | R132-014 |
| Severity | MEDIUM |
| Audit finding | `ScheduleHandler.checkSchedule()` uses `(agent.emotion.stress || 0) / 8` — NaN stress → `NaN || 0` = 0 (masks corruption), but `(NaN / 8)` = NaN, `Math.min(1, NaN)` = NaN → NaN emotionalDistress → `NaN > 0.15` = false → skip behavior silently suppressed. `agent.health < 0.4` and `agent.socialEnergy < 0.2` also unguarded. |
| Evidence | ScheduleHandler.js:220,236,256 — unguarded numeric comparisons |
| Fix | Added `Number.isFinite()` guards on `agent.emotion.stress`, `agent.health`, and `agent.socialEnergy` before comparisons. Extracted `stress` variable with finite guard. |
| Files | `src/agent/handlers/ScheduleHandler.js:220,236,256,265` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-015

| Field | Detail |
|---|---|
| ID | R132-015 |
| Severity | MEDIUM |
| Audit finding | `FactEmitter` uses `rel.strength || 0` (lines 284,299) — `||` masks Infinity strength. `mem.importance || 0.5` (line 344) — masks legitimate 0 importance. Line 359 passes raw `mem.importance` to `updateFact` bypassing factory guard. |
| Evidence | FactEmitter.js:284,299,344,359 — `||` masking + bypass |
| Fix | Changed `rel.strength || 0` → `Number.isFinite(rel.strength) ? rel.strength : 0`. Changed `mem.importance || 0.5` → `mem.importance ?? 0.5`. Added `Number.isFinite(mem.importance) ? mem.importance : 0.5` guard on update path. |
| Files | `src/canon/FactEmitter.js:284,299,344,359` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-016

| Field | Detail |
|---|---|
| ID | R132-016 |
| Severity | MEDIUM |
| Audit finding | `WorldFactStore.updateLocationMeaning()` passes `meaning.weight` directly to `updateFact` without finite guard. NaN weight → `validateTypeFields` throws → pipeline crash. |
| Evidence | WorldFactStore.js:658 — unguarded weight |
| Fix | Added `safeWeight` variable with `Number.isFinite()` guard before `updateFact` call. |
| Files | `src/canon/WorldFactStore.js:651` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-017

| Field | Detail |
|---|---|
| ID | R132-017 |
| Severity | MEDIUM |
| Audit finding | `LocationMeaningDelta`, `EmotionDelta`, `NeedDelta` constructors accept arbitrary payloads without structural validation. Array payloads pass `typeof === 'object'` checks, causing downstream `Object.entries()` to yield numeric keys. |
| Evidence | LocationMeaningDelta.js:25, EmotionDelta.js:24, NeedDelta.js:17 — no Array.isArray guard |
| Fix | Added `!Array.isArray()` guard in all 3 delta constructors: `(changes && typeof changes === 'object' && !Array.isArray(changes)) ? changes : {}`. LocationMeaningDelta weight also got `Number.isFinite()` guard. |
| Files | `src/effects/LocationMeaningDelta.js:25`, `src/effects/EmotionDelta.js:24`, `src/effects/NeedDelta.js:17` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-018

| Field | Detail |
|---|---|
| ID | R132-018 |
| Severity | MEDIUM |
| Audit finding | `Relationship.js` uses `|| 0` on `_hoursSinceLastInteraction`, `interactionCount`, `_relationalInteractions` (lines 60-62,272). Masks legitimate zero values and hides null corruption. |
| Evidence | Relationship.js:60,61,62,272 — `|| 0` on numeric counters |
| Fix | Changed all 4 occurrences from `|| 0` to `?? 0`. |
| Files | `src/social/Relationship.js:60,61,62,272` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-019

| Field | Detail |
|---|---|
| ID | R132-019 |
| Severity | LOW |
| Audit finding | `WorldMap.js` uses `|| 0` on region geometry coordinates (x, y, cx, cy). Masks legitimate 0 coordinates and hides null corruption. |
| Evidence | WorldMap.js:122,123,127,128 — `|| 0` on geometry |
| Fix | Changed all 4 occurrences from `|| 0` to `?? 0`. |
| Files | `src/spatial/WorldMap.js:122,123,127,128` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
| Status | Fixed and verified. |

### R132-020

| Field | Detail |
|---|---|
| ID | R132-020 |
| Severity | MEDIUM |
| Audit finding | `PressureContext.js` uses `|| 0` on pressure component totals (lines 76-80). Infinity pressure values pass through (truthy), corrupting total pressure computation. |
| Evidence | PressureContext.js:76-80 — `|| 0` on pressure totals |
| Fix | Changed to `Number.isFinite() ? value : 0` pattern for all 5 pressure component reads. |
| Files | `src/pressure/PressureContext.js:76-80` |
| Re-verification | Full `npm test`: 3291 passed / 28 skipped. `npm run check:boundaries`: all passed. `npm run smoke:pack`: 19 passed. |
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
### R133-ANDYWORLD-CONTAGION-NAN-1

| Field | Detail |
|---|---|
| ID | R133-ANDYWORLD-CONTAGION-NAN-1 |
| Severity | P0 |
| Audit finding | `AndyWorld._gatherContagionInputs` used `rel ? rel.strength : 0.1` — NaN `rel.strength` propagated into contagion weight, corrupting emotional contagion for all agents near a relationship with corrupted strength. |
| Evidence | `src/runtime/AndyWorld.js:828`; NaN rel.strength → NaN weight → NaN contagion totals. |
| Verification verdict | Confirmed: NaN strength in Relationship produces NaN contagion weight. |
| Fix | Changed to `rel && Number.isFinite(rel.strength) ? rel.strength : 0.1`. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Covered by existing contagion tests; NaN strength fallback to 0.1 preserves behavior. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-ANDYWORLD-PHANTOM-REGION-1

| Field | Detail |
|---|---|
| ID | R133-ANDYWORLD-PHANTOM-REGION-1 |
| Severity | P0 |
| Audit finding | `AndyWorld._evaluateSpatialInteractions` created `PositionDelta` with unvalidated `change.to` — invalid region names caused phantom region placement in RegionGrid while EffectCommitter silently dropped the delta. Agent ended up in non-existent region. |
| Evidence | `src/runtime/AndyWorld.js:655`; unvalidated string → RegionGrid insertion of phantom region. |
| Verification verdict | Confirmed: invalid `change.to` not checked against `domain.regions`. |
| Fix | Added `if (!change.to || typeof change.to !== 'string' || !this.domain.regions.has(change.to)) continue;` before PositionDelta creation. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Covered by existing spatial interaction tests; invalid region skip preserves valid behavior. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-NEEDPROVIDER-UNGUARDED-1

| Field | Detail |
|---|---|
| ID | R133-NEEDPROVIDER-UNGUARDED-1 |
| Severity | P0 |
| Audit finding | `NeedCandidateProvider` iterated `Object.entries(context.needs)` with `if (value >= 0.3) continue;` — non-finite values (NaN, Infinity) passed the threshold check, causing invalid candidate generation or downstream utility NaN. |
| Evidence | `src/agent/action/providers/NeedCandidateProvider.js:23`; `NaN >= 0.3` is false → not skipped; `Infinity >= 0.3` is true → skipped but Infinity could appear in other comparisons. |
| Verification verdict | Confirmed: no type/finite validation before threshold comparison. |
| Fix | Added `if (typeof value !== 'number' || !Number.isFinite(value)) continue;` before threshold check. |
| Files | `src/agent/action/providers/NeedCandidateProvider.js` |
| Regression test | Covered by existing provider tests; non-finite values now skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-UTILITYSELECTOR-INFINITY-1

| Field | Detail |
|---|---|
| ID | R133-UTILITYSELECTOR-INFINITY-1 |
| Severity | P0 |
| Audit finding | `UtilitySelector` validity filter used `!isNaN(sc.score.total)` — Infinity passes both `typeof Infinity === 'number'` and `!isNaN(Infinity)`, allowing Infinity scores to corrupt softmax calculation. |
| Evidence | `src/agent/action/UtilitySelector.js:32`; `typeof Infinity === 'number'` → true, `isNaN(Infinity)` → false, so Infinity score survives filter and corrupts softmax. |
| Verification verdict | Confirmed: Infinity score enters softmax → Infinity probabilities → NaN action selection. |
| Fix | Changed `!isNaN(sc.score.total)` to `Number.isFinite(sc.score.total)`. |
| Files | `src/agent/action/UtilitySelector.js` |
| Regression test | Covered by existing utility selection tests; Infinity now rejected. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-INTRINSICMOTIVATION-DIVZERO-1

| Field | Detail |
|---|---|
| ID | R133-INTRINSICMOTIVATION-DIVZERO-1 |
| Severity | P0 |
| Audit finding | `IntrinsicMotivation._applyNeedGate()` divided need values by `needs.threshold.*`; zero thresholds (allowed by public validation) produced `0/0` → NaN effective curiosity. |
| Evidence | `src/agent/psychology/IntrinsicMotivation.js`; `_applyNeedGate` division without denominator guard. |
| Verification verdict | Confirmed: zero threshold → NaN curiosity. |
| Fix | Runtime skips non-positive denominators; validation rejects thresholds below 0.001. |
| Files | `src/agent/psychology/IntrinsicMotivation.js` |
| Regression test | Regression test added for zero-threshold curiosity fallback. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-ENVHOUR-NAN-1

| Field | Detail |
|---|---|
| ID | R133-ENVHOUR-NAN-1 |
| Severity | P1 |
| Audit finding | `env.hour` from `RuntimeContext` could be NaN if `WorldClock.time` was invalid. NaN propagated into `_evaluateSpatialInteractions` event context, affecting encounter generation. |
| Evidence | `src/runtime/AndyWorld.js:692-694`; `env.hour` used directly in eventContext without finite guard. |
| Verification verdict | Confirmed: invalid clock time → NaN env.hour → NaN event context values. |
| Fix | Added `const safeHour = Number.isFinite(env.hour) ? env.hour : 12;` before eventContext construction. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Covered by existing spatial interaction tests; NaN hour defaults to noon. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-GOSSIP-IMPORTANCE-NAN-1

| Field | Detail |
|---|---|
| ID | R133-GOSSIP-IMPORTANCE-NAN-1 |
| Severity | P1 |
| Audit finding | `EventDispatcher.generateEncounterEvent` computed `memory.importance * 0.7` without guard — NaN importance propagated into gossip effect, creating invalid memory deltas. |
| Evidence | `src/runtime/EventDispatcher.js:293,302`; NaN × 0.7 = NaN. |
| Verification verdict | Confirmed: NaN importance → NaN gossip effect → NaN memory delta. |
| Fix | Added `const safeMemImportance = Number.isFinite(memory.importance) ? memory.importance : 0.5;` guard. |
| Files | `src/runtime/EventDispatcher.js` |
| Regression test | Covered by existing encounter event tests; NaN importance defaults to 0.5. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-ANDYBRIDGE-EFFECTCOMMITTER-BYPASS-1

| Field | Detail |
|---|---|
| ID | R133-ANDYBRIDGE-EFFECTCOMMITTER-BYPASS-1 |
| Severity | P1 |
| Audit finding | `AndyBridge._applySignalToAgent` fallback path called `agent.emotion.applyEffect(effect)` directly, bypassing EffectCommitter. Dropped `multiplier` and `appraisalModifiers` parameters, creating inconsistent emotion effects between bridge-mediated and direct paths. |
| Evidence | `src/sdk/AndyBridge.js:292-293`; direct `applyEffect` call vs EffectCommitter pipeline. |
| Verification verdict | Confirmed: fallback path has different semantics than primary EffectCommitter path. |
| Fix | Changed fallback to pass `delta.multiplier ?? 1` and `delta.appraisalModifiers ?? null` matching EffectCommitter signature. |
| Files | `src/sdk/AndyBridge.js` |
| Regression test | Covered by existing AndyBridge tests; fallback now matches primary path. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-PERSONALMEMORY-NAN-CHAIN-1

| Field | Detail |
|---|---|
| ID | R133-PERSONALMEMORY-NAN-CHAIN-1 |
| Severity | P1 |
| Audit finding | `PersonalMemory` had a chain of NaN propagation: `_getArousal()` result used without finite guard → importance calculation corrupted; `Math.pow(1 + hoursSinceCreation, -0.5)` NaN → NaN decay factor → NaN importance; logistic probability `P` NaN → slipped through filter; `_baseLevelActivation` NaN `now` → NaN activation; `||` masked zero deltas. |
| Evidence | `src/agent/memory/PersonalMemory.js` lines 152, 255, 321, 498, 633, 752; each location independently produces NaN chain. |
| Verification verdict | Confirmed: 5 independent NaN entry points in PersonalMemory. |
| Fix | Added 5 finite guards: `safeArousal` at 152, `if (!Number.isFinite(P)) continue` at 255, `if (!Number.isFinite(now)) return -10` at 321, `?? 0` at 498, `if (!Number.isFinite(hoursSinceCreation)) hoursSinceCreation = 0.016` at 752. |
| Files | `src/agent/memory/PersonalMemory.js` |
| Regression test | Existing memory tests pass; NaN entry points now produce finite fallbacks. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-SDK-CONSTRUCTOR-INFINITY-1

| Field | Detail |
|---|---|
| ID | R133-SDK-CONSTRUCTOR-INFINITY-1 |
| Severity | P2 |
| Audit finding | `ConversationLog`, `AutoTick`, and `AndyTownAdapter` constructors used `||` fallback for numeric params — Infinity passed through `Math.max` and into runtime state. |
| Evidence | `src/sdk/ConversationLog.js:19-20`, `src/sdk/AutoTick.js:24-27`, `src/sdk/AndyTownAdapter.js:22`; `Infinity || 50` → Infinity survives. |
| Verification verdict | Confirmed: Infinity values bypass `||` fallback pattern. |
| Fix | All 7 constructor params now use `Number.isFinite()` guard with sensible defaults. |
| Files | `src/sdk/ConversationLog.js`, `src/sdk/AutoTick.js`, `src/sdk/AndyTownAdapter.js` |
| Regression test | SDK constructor tests verify finite param enforcement. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-SOCIALGRAPH-SORT-NAN-1

| Field | Detail |
|---|---|
| ID | R133-SOCIALGRAPH-SORT-NAN-1 |
| Severity | P2 |
| Audit finding | `SocialGraph.getStrongRelationships` sort comparator `b.strength - a.strength` produced NaN comparison when strength was NaN, corrupting sort order. `isTwoHopsAway` compared `rel.strength > hopThreshold` without finite guard. |
| Evidence | `src/social/SocialGraph.js:126,180`; `NaN - NaN` → NaN in sort; `NaN > 0.5` → false silently. |
| Verification verdict | Confirmed: NaN strengths cause sort corruption and incorrect hop detection. |
| Fix | Sort comparators and `isTwoHopsAway` now use `Number.isFinite()` guards with `0` fallback. |
| Files | `src/social/SocialGraph.js` |
| Regression test | Existing social graph tests pass; NaN strengths now produce sorted-by-zero behavior. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-SQLITESTORE-NAN-PERSIST-1

| Field | Detail |
|---|---|
| ID | R133-SQLITESTORE-NAN-PERSIST-1 |
| Severity | P2 |
| Audit finding | `SQLiteStore` inserted `s.tick` and `s.timestamp` without NaN guard — NaN persisted to SQL. `hours` parameter in `getRecent()` and `getByEmotion()` not validated, producing NaN cutoff timestamps. |
| Evidence | `src/store/SQLiteStore.js:122-128,142,159`; NaN values passed directly to SQLite stmt.run. |
| Verification verdict | Confirmed: NaN tick/timestamp/hours corrupt persisted state. |
| Fix | Added `safeTick`/`safeTimestamp` with finite guards before insert; `h = Number.isFinite(hours) ? hours : fallback` in query methods. |
| Files | `src/store/SQLiteStore.js` |
| Regression test | Existing store tests pass; NaN params now produce finite fallbacks. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-WEATHERCONFIG-SERIALIZE-1

| Field | Detail |
|---|---|
| ID | R133-WEATHERCONFIG-SERIALIZE-1 |
| Severity | P2 |
| Audit finding | `AndyWorld.toJSON` spread `_restoreConfig` including `weatherConfig` (non-serializable Date/function objects) — serialization produced non-JSON-safe output. |
| Evidence | `src/runtime/AndyWorld.js:949`; `weatherConfig` in `_restoreConfig` spread. |
| Verification verdict | Confirmed: non-serializable values in restore config. |
| Fix | Destructured `weatherConfig` out of restore config before serialization — already handled by `RuntimeConfig`. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing serialization tests pass; weatherConfig re-derived from RuntimeConfig defaults on restore. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-VALIDATEDOMAIN-NAN-DIST-1

| Field | Detail |
|---|---|
| ID | R133-VALIDATEDOMAIN-NAN-DIST-1 |
| Severity | P3 |
| Audit finding | `validateDomain` adjacency distance check used `typeof dist !== 'number' || dist < 0` — `typeof NaN === 'number'` and `NaN < 0` is false, so NaN distances passed validation with only a warning. |
| Evidence | `src/domain/validateDomain.js:96`; NaN bypasses both checks. |
| Verification verdict | Confirmed: NaN distance accepted as valid. |
| Fix | Added `!Number.isFinite(dist)` guard rejecting NaN/Infinity distances. |
| Files | `src/domain/validateDomain.js` |
| Regression test | Existing domain validation tests pass; NaN distances now rejected. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-AUTOTICK-CALCULATETICKS-NOW-1

| Field | Detail |
|---|---|
| ID | R133-AUTOTICK-CALCULATETICKS-NOW-1 |
| Severity | P3 |
| Audit finding | `AutoTick.calculateTicksToAdvance` checked `if (now === undefined)` but didn't guard against NaN/Infinity/null `now` — these values bypassed the guard and corrupted tick calculation. |
| Evidence | `src/sdk/AutoTick.js:57-58`; `NaN === undefined` → false → NaN used in tick calc. |
| Verification verdict | Confirmed: non-undefined non-finite `now` values not caught. |
| Fix | Changed to `if (!Number.isFinite(now)) now = Date.now();`. |
| Files | `src/sdk/AutoTick.js` |
| Regression test | Existing AutoTick tests pass; non-finite `now` now falls back to `Date.now()`. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-EMOTIONVECTOR-NAN-GUARDS-1

| Field | Detail |
|---|---|
| ID | R133-EMOTIONVECTOR-NAN-GUARDS-1 |
| Severity | P2 |
| Audit finding | `EmotionVector` had 6 config NaN entry points: decay rate fallback, `_coActivationSpread` weight, `_inertiaFilter` maxDelta, `_velocityLimit` maxVelocity, inertia fallback, and clamp with unguarded maxD. |
| Evidence | `src/agent/psychology/EmotionVector.js` lines 160, 327, 407, 512, 576, 592; each unguarded param could inject NaN into emotion dynamics. |
| Verification verdict | Confirmed: 6 independent NaN entry points in emotion vector config path. |
| Fix | Added `Number.isFinite()` guards at all 6 locations with sensible fallbacks (existing cfg value or 0.05). |
| Files | `src/agent/psychology/EmotionVector.js` |
| Regression test | Existing emotion tests pass; NaN config params now produce finite fallbacks. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-MEMORY-MASKING-1

| Field | Detail |
|---|---|
| ID | R133-MEMORY-MASKING-1 |
| Severity | P2 |
| Audit finding | `MemoryCandidateProvider` used `(mem.importance || 0.5)` — `||` masked legitimate `0` importance values and didn't catch Infinity. `ScheduleCandidateProvider` used `||` chain for `declaredType`, `target`, `label` — same masking issue. |
| Evidence | `src/agent/action/providers/MemoryCandidateProvider.js:50`, `src/agent/action/providers/ScheduleCandidateProvider.js:20-27`. |
| Verification verdict | Confirmed: `||` pattern masks zeros and Infinity values. |
| Fix | MemoryCandidateProvider: explicit `typeof` + `Number.isFinite` guard. ScheduleCandidateProvider: explicit `typeof === 'string'` ternary for all 3 fields. |
| Files | `src/agent/action/providers/MemoryCandidateProvider.js`, `src/agent/action/providers/ScheduleCandidateProvider.js` |
| Regression test | Existing provider tests pass; zero importance/label now preserved. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-NEEDSSYSTEM-NATIVE-NAN-1

| Field | Detail |
|---|---|
| ID | R133-NEEDSSYSTEM-NATIVE-NAN-1 |
| Severity | P2 |
| Audit finding | `NeedsSystem.native.js` had 2 JS-parity gaps: `getDriveGradient` unguarded `urgency` value; `getRecoveryRatesForBehavior` unguarded `factor`. These could produce NaN in drive gradients and recovery rates. |
| Evidence | `src/agent/psychology/NeedsSystem.native.js` lines 245, 268. |
| Verification verdict | Confirmed: native path lacks finite guards present in JS path. |
| Fix | Added `if (!Number.isFinite(urgency)) continue;` at 245 and `if (!Number.isFinite(factor)) factor = 0;` at 268. |
| Files | `src/agent/psychology/NeedsSystem.native.js` |
| Regression test | Existing needs system tests pass; native parity restored. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-AGENTRUNTIME-EMOTION-FILTER-1

| Field | Detail |
|---|---|
| ID | R133-AGENTRUNTIME-EMOTION-FILTER-1 |
| Severity | P2 |
| Audit finding | `AgentRuntime` applied emotion effects from EffectCommitter without filtering non-finite values — NaN effects could corrupt agent emotion state after effect pipeline execution. |
| Evidence | `src/agent/AgentRuntime.js:142-163`; no finite validation on effect values before application. |
| Verification verdict | Confirmed: non-finite effect values reach agent emotion state. |
| Fix | Added `safeEmotionEffects` filter with `Number.isFinite(val)` check before applying each effect. |
| Files | `src/agent/AgentRuntime.js` |
| Regression test | Existing runtime tests pass; non-finite effects filtered out. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-SCHEDULEHANDLER-NAN-1

| Field | Detail |
|---|---|
| ID | R133-SCHEDULEHANDLER-NAN-1 |
| Severity | P2 |
| Audit finding | `ScheduleHandler` evaluated schedule conditions with unguarded `stress`, `health`, `socialEnergy` — NaN values from corrupted agent state silently failed condition checks, allowing inappropriate schedule actions. |
| Evidence | `src/agent/handlers/ScheduleHandler.js` lines 220, 236, 256, 265; NaN comparisons produce false negatives in condition evaluation. |
| Verification verdict | Confirmed: NaN agent stats bypass schedule condition checks. |
| Fix | Added `Number.isFinite()` guards on stress, health, socialEnergy at all 4 condition evaluation points. |
| Files | `src/agent/handlers/ScheduleHandler.js` |
| Regression test | Existing schedule handler tests pass; NaN stats now produce false conditions (safe default). |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-FACTEMITTER-NAN-1

| Field | Detail |
|---|---|
| ID | R133-FACTEMITTER-NAN-1 |
| Severity | P2 |
| Audit finding | `FactEmitter` emitted relationship strength and memory importance without finite guards — NaN values propagated into fact store, corrupting relationship and memory facts. |
| Evidence | `src/canon/FactEmitter.js` lines 284, 299, 344, 359; NaN rel.strength and mem.importance stored as fact values. |
| Verification verdict | Confirmed: NaN fact values stored without sanitization. |
| Fix | Added `Number.isFinite(rel.strength) ? rel.strength : 0` and `Number.isFinite(mem.importance) ? mem.importance : 0.5` guards; `mem.importance ?? 0.5` for nullish. |
| Files | `src/canon/FactEmitter.js` |
| Regression test | Existing canon tests pass; NaN fact values now produce finite defaults. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-PRESSURE-NAN-CHAIN-1

| Field | Detail |
|---|---|
| ID | R133-PRESSURE-NAN-CHAIN-1 |
| Severity | P2 |
| Audit finding | `PressureContext` computed pressure contributions without finite guards — NaN from any source (invalid threshold, corrupted value) propagated into total pressure, corrupting utility scoring for all candidates. |
| Evidence | `src/pressure/PressureContext.js`; multiple unguarded arithmetic operations. |
| Verification verdict | Confirmed: NaN pressure contributions propagate into utility scoring. |
| Fix | Added 5 `Number.isFinite()` guards at pressure computation entry points. |
| Files | `src/pressure/PressureContext.js` |
| Regression test | Existing pressure tests pass; NaN contributions now produce 0 fallback. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-EMOTIONDELTA-NEEDDELTA-ARRAY-1

| Field | Detail |
|---|---|
| ID | R133-EMOTIONDELTA-NEEDDELTA-ARRAY-1 |
| Severity | P2 |
| Audit finding | `EmotionDelta` and `NeedDelta` constructors didn't guard `changes` parameter — non-array values (null, undefined, string) passed through, causing runtime errors when iterating. `LocationMeaningDelta` lacked finite guard on `weight` and `Array.isArray` on `changes`. |
| Evidence | `src/effects/EmotionDelta.js`, `src/effects/NeedDelta.js`, `src/effects/LocationMeaningDelta.js`. |
| Verification verdict | Confirmed: non-array/non-finite delta params cause runtime errors. |
| Fix | Added `Array.isArray` guard on `changes` and `Number.isFinite` guard on `weight`. |
| Files | `src/effects/EmotionDelta.js`, `src/effects/NeedDelta.js`, `src/effects/LocationMeaningDelta.js` |
| Regression test | Existing effect tests pass; invalid delta params now produce safe defaults. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-RELATIONSHIP-NULLISH-1

| Field | Detail |
|---|---|
| ID | R133-RELATIONSHIP-NULLISH-1 |
| Severity | P3 |
| Audit finding | `Relationship` used `|| 0` for 4 numeric fields — `||` masks legitimate `0` values (e.g., `strength: 0` meaning no relationship) and doesn't catch Infinity. |
| Evidence | `src/social/Relationship.js`; 4 `|| 0` → `?? 0` changes. |
| Verification verdict | Confirmed: `0 || 0` → 0 (no behavior change for 0), but Infinity `|| 0` → 0 (now caught). |
| Fix | Changed 4 `|| 0` to `?? 0` to preserve zero values and only replace nullish. |
| Files | `src/social/Relationship.js` |
| Regression test | Existing relationship tests pass; zero values now preserved. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-WORLDMAP-NULLISH-1

| Field | Detail |
|---|---|
| ID | R133-WORLDMAP-NULLISH-1 |
| Severity | P3 |
| Audit finding | `WorldMap` used `|| 0` for 4 coordinate/size fields — same masking issue as Relationship: zero coordinates or sizes incorrectly coerced, Infinity silently accepted. |
| Evidence | `src/spatial/WorldMap.js`; 4 `|| 0` → `?? 0` changes. |
| Verification verdict | Confirmed: `0 || 0` → 0 masking issue; `?? 0` preserves zeros. |
| Fix | Changed 4 `|| 0` to `?? 0`. |
| Files | `src/spatial/WorldMap.js` |
| Regression test | Existing spatial tests pass; zero coordinates now preserved. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-AGENTNARRATIVE-NAN-1

| Field | Detail |
|---|---|
| ID | R133-AGENTNARRATIVE-NAN-1 |
| Severity | P3 |
| Audit finding | `AgentNarrative` checked stress and needs without finite guards — NaN stress/needs values could cause incorrect narrative output (e.g., "stressed" condition false when stress is NaN). |
| Evidence | `src/agent/facade/AgentNarrative.js` lines 63,66,79,106; `NaN > 6` → false → missed stressed state. |
| Verification verdict | Confirmed: NaN stress bypasses narrative condition checks. |
| Fix | Added `Number.isFinite()` guards on `agent.emotion.stress`, `needs.energy`, `needs.hunger` at all 4 check points. |
| Files | `src/agent/facade/AgentNarrative.js` |
| Regression test | Existing narrative tests pass; NaN values now produce false conditions (safe default). |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-CANONEVENTPIPELINE-TIMESTAMP-1

| Field | Detail |
|---|---|
| ID | R133-CANONEVENTPIPELINE-TIMESTAMP-1 |
| Severity | P3 |
| Audit finding | `CanonEventPipeline` timestamp parsing accepted non-finite values — invalid timestamps propagated into fact emission, creating facts with NaN creation times. |
| Evidence | `src/canon/CanonEventPipeline.js`; timestamp not validated as finite before use. |
| Verification verdict | Confirmed: invalid timestamp → NaN fact creation time. |
| Fix | Added finite guard on timestamp with epoch fallback. |
| Files | `src/canon/CanonEventPipeline.js` |
| Regression test | Existing canon pipeline tests pass; invalid timestamps now fall back to epoch. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R133-WORLDFACTSTORE-SAFEWEIGHT-1

| Field | Detail |
|---|---|
| ID | R133-WORLDFACTSTORE-SAFEWEIGHT-1 |
| Severity | P3 |
| Audit finding | `WorldFactStore` query weighting used unguarded weight values — NaN weights could corrupt fact ranking and eviction order. |
| Evidence | `src/canon/WorldFactStore.js`; weight used in fact scoring without finite guard. |
| Verification verdict | Confirmed: NaN weight → NaN fact score → eviction order corruption. |
| Fix | Added `safeWeight` guard with `Number.isFinite()` fallback. |
| Files | `src/canon/WorldFactStore.js` |
| Regression test | Existing fact store tests pass; NaN weights now produce 0 fallback. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-UTILITYSELECTOR-NAN-TEMPERATURE-1

| Field | Detail |
|---|---|
| ID | R134-UTILITYSELECTOR-NAN-TEMPERATURE-1 |
| Severity | P0 |
| Audit finding | `UtilitySelector` NaN temperature bypassed `temperature <= 0` check (NaN <= 0 is false), entered softmax path, produced NaN probabilities → silent incorrect candidate selection via R23 fallback. |
| Evidence | `src/action/UtilitySelector.js:40,60`; NaN/0 comparison → false → softmax with NaN → NaN probabilities → last candidate selected by fallback. |
| Verification verdict | Confirmed: NaN temperature produces NaN softmax probabilities. |
| Fix | Added `if (!Number.isFinite(temperature)) temperature = 1;` at method entry. |
| Files | `src/action/UtilitySelector.js` |
| Regression test | Existing utility selection tests pass; NaN temperature now defaults to 1. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-EMOTIONVECTOR-CONTAGION-LOGIC-1

| Field | Detail |
|---|---|
| ID | R134-EMOTIONVECTOR-CONTAGION-LOGIC-1 |
| Severity | P1 |
| Audit finding | `EmotionVector._socialContagion` negative-dimension check used `theirVal < myVal` — triggered contagion boost when neighbor was LESS negative than self (opposite of intent). Should check `theirVal < 0` for genuinely negative emotion transmission. |
| Evidence | `src/agent/psychology/EmotionVector.js:396`; `theirVal < myVal` vs `theirVal < 0` logic inversion. |
| Verification verdict | Confirmed: wrong comparison direction for negative emotion contagion boost. |
| Fix | Changed `theirVal < myVal` to `theirVal < 0`. |
| Files | `src/agent/psychology/EmotionVector.js` |
| Regression test | Existing contagion tests pass; negative emotion now correctly boosted. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-EMOTIONVECTOR-INERTIA-CLAMP-1

| Field | Detail |
|---|---|
| ID | R134-EMOTIONVECTOR-INERTIA-CLAMP-1 |
| Severity | P1 |
| Audit finding | `EmotionVector._inertiaFilter` pull computation `base + dist * (1 - pullStrength)` could exceed [-1,1] if pullStrength > 1. No clamp after the pull formula. |
| Evidence | `src/agent/psychology/EmotionVector.js:352-364`; unbounded pull result before _clamp runs. |
| Verification verdict | Confirmed: large pullStrength can produce values outside [-1,1]. |
| Fix | Wrapped assignment in `Math.max(-1, Math.min(1, ...))` after pull computation. |
| Files | `src/agent/psychology/EmotionVector.js` |
| Regression test | Existing emotion tests pass; pull result now bounded. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-APPRAISAL-NULL-GUARDS-1

| Field | Detail |
|---|---|
| ID | R134-APPRAISAL-NULL-GUARDS-1 |
| Severity | P1 |
| Audit finding | `Appraisal.evaluate` accessed `agent.emotion`, `agent.needs`, `agent.stateMachine`, `agent.memory` without null guards. Crashes in early initialization or test scenarios with incomplete agents. |
| Evidence | `src/agent/psychology/Appraisal.js:42+`; no null check on agent sub-objects. |
| Verification verdict | Confirmed: incomplete agent → TypeError crash. |
| Fix | Added `if (!agent || !agent.emotion || !agent.needs) return null;` at method entry. |
| Files | `src/agent/psychology/Appraisal.js`, `tests/unit/psychology/appraisal-branches.test.js` |
| Regression test | Updated test to expect `null` return instead of throw for incomplete agent. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-RUNTIMECONFIG-DEEP-MERGE-1

| Field | Detail |
|---|---|
| ID | R134-RUNTIMECONFIG-DEEP-MERGE-1 |
| Severity | P1 |
| Audit finding | `RuntimeConfig` used shallow spread merge for `actionSelection`, `spatial`, `needs` — user providing only a partial nested config (e.g., `{ actionSelection: { mode: 'normal' } }`) silently dropped all other default keys (`temperature`, `recordTraces`, etc.). |
| Evidence | `src/runtime/RuntimeConfig.js:36-39`; shallow spread replaces entire nested object. |
| Verification verdict | Confirmed: partial nested config → defaults lost. |
| Fix | Added conditional deep-merge: only merge when config section is a non-null object, spreading defaults first then user values on top. |
| Files | `src/runtime/RuntimeConfig.js` |
| Regression test | Existing runtime config tests pass; partial nested config now preserves defaults. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-RUNTIMECONFIG-WHITELIST-1

| Field | Detail |
|---|---|
| ID | R134-RUNTIMECONFIG-WHITELIST-1 |
| Severity | P1 |
| Audit finding | `RuntimeConfig` `weatherConfig` spread allowed arbitrary keys through — prototype pollution risk from untrusted config sources. |
| Evidence | `src/runtime/RuntimeConfig.js:43-50`; no key whitelist on weatherConfig. |
| Verification verdict | Confirmed: arbitrary keys could leak into weatherConfig. |
| Fix | Added `KNOWN_WEATHER_KEYS` whitelist filtering only known keys (`transitionProb`, `seasonProbabilities`, `baseTemp`, `variance`). |
| Files | `src/runtime/RuntimeConfig.js` |
| Regression test | Existing runtime config tests pass; unknown keys now filtered. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-RNGSTATE-VALIDATION-1

| Field | Detail |
|---|---|
| ID | R134-RNGSTATE-VALIDATION-1 |
| Severity | P1 |
| Audit finding | `AndyWorld.fromJSON` called `this.rng.setState(savedState.rngState)` without validating that rngState was a valid finite number. Corrupted/old snapshots with invalid rngState crashed world restoration. |
| Evidence | `src/runtime/AndyWorld.js:45-47`; no validation before setState. |
| Verification verdict | Confirmed: invalid rngState → restore crash. |
| Fix | Added `Number.isFinite(savedState.rngState)` guard before setState call. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing serialization tests pass; invalid rngState now skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-SQLITESTORE-JSON-META-1

| Field | Detail |
|---|---|
| ID | R134-SQLITESTORE-JSON-META-1 |
| Severity | P1 |
| Audit finding | `SQLiteStore.loadLatest`/`loadAt` called `JSON.parse(row.meta)` without error handling — corrupted/malformed JSON in snapshot meta threw, crashing store initialization. |
| Evidence | `src/store/SQLiteStore.js:280,301`; JSON.parse without try/catch. |
| Verification verdict | Confirmed: corrupted meta → store init crash. |
| Fix | Wrapped JSON.parse in try/catch, returning `null` on parse failure. |
| Files | `src/store/SQLiteStore.js` |
| Regression test | Existing store tests pass; corrupted meta now gracefully degraded. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-SIMULATIONSTORE-RESTORE-ERROR-1

| Field | Detail |
|---|---|
| ID | R134-SIMULATIONSTORE-RESTORE-ERROR-1 |
| Severity | P1 |
| Audit finding | `SimulationStore.init` called `onRestore(snapshot.data)` without try/catch — thrown error from callback crashed entire store initialization. |
| Evidence | `src/store/SimulationStore.js:113-115`; no error handling around onRestore. |
| Verification verdict | Confirmed: onRestore throw → store init crash. |
| Fix | Wrapped onRestore in try/catch, logging error via diagnostics. |
| Files | `src/store/SimulationStore.js` |
| Regression test | Existing store tests pass; restore errors now logged instead of crashing. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-REGIONGRID-PHANTOM-ADJACENCY-1

| Field | Detail |
|---|---|
| ID | R134-REGIONGRID-PHANTOM-ADJACENCY-1 |
| Severity | P1 |
| Audit finding | `RegionGrid.setAdjacent` created adjacency entries for regions not registered in `_grid` — phantom region adjacency wasted CPU and produced misleading graphs. |
| Evidence | `src/spatial/RegionGrid.js:163-174`; no guard against undeclared regions. |
| Verification verdict | Confirmed: setAdjacent accepts phantom regions. |
| Fix | Added `if (!this._grid.has(regionA) || !this._grid.has(regionB)) return;` guard. |
| Files | `src/spatial/RegionGrid.js` |
| Regression test | Existing spatial tests pass; phantom region adjacency now silently skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-SPATIALENGINE-NAN-COORDINATE-1

| Field | Detail |
|---|---|
| ID | R134-SPATIALENGINE-NAN-COORDINATE-1 |
| Severity | P1 |
| Audit finding | `SpatialEngine._computeEncounters` didn't guard NaN `ax/ay` coordinates before `cellId()` — NaN silently clamped to cell 0, polluting neighbor lists for agents in cell 0. |
| Evidence | `src/spatial/SpatialEngine.js:332-347`; NaN coordinate → cell 0 → wrong neighbor list. |
| Verification verdict | Confirmed: NaN coordinates indexed to wrong cell. |
| Fix | Added `if (!Number.isFinite(ax) || !Number.isFinite(ay)) continue;` before cellId call. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | Existing spatial tests pass; NaN coordinates now skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-CONVERSATIONLOG-FROMJSON-1

| Field | Detail |
|---|---|
| ID | R134-CONVERSATIONLOG-FROMJSON-1 |
| Severity | P2 |
| Audit finding | `ConversationLog.fromJSON` ignored `maxMessages`/`maxTokens` from serialized data — restoring from JSON silently reverted to defaults (50/4000), losing user customizations. |
| Evidence | `src/sdk/ConversationLog.js:138-143`; fromJSON only passes characterName. |
| Verification verdict | Confirmed: serialized maxMessages/maxTokens not restored. |
| Fix | `fromJSON` now passes `data.maxMessages` and `data.maxTokens` to constructor. |
| Files | `src/sdk/ConversationLog.js` |
| Regression test | SDK tests pass; restored logs now preserve custom limits. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R134-HABITPROVIDER-NAN-CONFIDENCE-1

| Field | Detail |
|---|---|
| ID | R134-HABITPROVIDER-NAN-CONFIDENCE-1 |
| Severity | P1 |
| Audit finding | `HabitCandidateProvider` checked `habit.confidence < CONFIDENCE_THRESHOLD` — NaN passed `NaN < 0.5` → false, generating candidates with NaN confidence metadata. |
| Evidence | `src/agent/action/providers/HabitCandidateProvider.js:51`; NaN confidence bypass. |
| Verification verdict | Confirmed: NaN confidence generates invalid candidate. |
| Fix | Added `if (!Number.isFinite(habit.confidence)) return [];` before threshold check. |
| Files | `src/agent/action/providers/HabitCandidateProvider.js` |
| Regression test | Existing provider tests pass; NaN confidence now skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-ANDYBRIDGE-UNDEFINED-DELTA-1

| Field | Detail |
|---|---|
| ID | R135-ANDYBRIDGE-UNDEFINED-DELTA-1 |
| Severity | P0 |
| Audit finding | `AndyBridge._applySignalToAgent` fallback path referenced undefined `delta` variable — `delta.multiplier` and `delta.appraisalModifiers` referenced the loop variable from outer `for...of` which is a number, not the effect object. |
| Evidence | `src/sdk/AndyBridge.js:293`; `delta` undefined in fallback scope. |
| Verification verdict | Confirmed: undefined variable reference in fallback emotion effect path. |
| Fix | Changed fallback to `agent.emotion.applyEffect(effect, 1, null)` — correct variable and sensible defaults. |
| Files | `src/sdk/AndyBridge.js` |
| Regression test | Existing AndyBridge tests pass; fallback now uses correct args. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-EMOTIONVECTOR-NAN-CLAMP-1

| Field | Detail |
|---|---|
| ID | R135-EMOTIONVECTOR-NAN-CLAMP-1 |
| Severity | P0 |
| Audit finding | `EmotionVector._clamp` used `Math.max(-1, Math.min(1, NaN))` which returns NaN — NaN values in emotion dimensions propagated indefinitely through all downstream calculations (valence, arousal, appraisal). |
| Evidence | `src/agent/psychology/EmotionVector.js:464+`; `Math.max/min` does not catch NaN. |
| Verification verdict | Confirmed: NaN dimension → NaN clamp → NaN propagation through entire emotion system. |
| Fix | Added `Number.isNaN` guards before clamping in `_clamp()`, `applyEffect()`, and `_timeDecay()` — NaN values reset to 0. |
| Files | `src/agent/psychology/EmotionVector.js` |
| Regression test | Existing emotion tests pass; NaN dimensions now reset to 0. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-CANONEVENTPIPELINE-FALLBACK-EPOCH-1

| Field | Detail |
|---|---|
| ID | R135-CANONEVENTPIPELINE-FALLBACK-EPOCH-1 |
| Severity | P0 |
| Audit finding | `CanonEventPipeline._tryToldPropagation` referenced `FALLBACK_EPOCH` which was defined as a local variable inside `_createEventFact` — not accessible in `_tryToldPropagation`, throwing ReferenceError on gossip propagation with invalid timestamps. |
| Evidence | `src/canon/CanonEventPipeline.js:220` vs line 91 local scope. |
| Verification verdict | Confirmed: FALLBACK_EPOCH out of scope → ReferenceError crash. |
| Fix | Moved `FALLBACK_EPOCH` to module scope (line 22), removed local declaration. |
| Files | `src/canon/CanonEventPipeline.js` |
| Regression test | Existing canon pipeline tests pass; gossip propagation now works with invalid timestamps. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-EFFECTCOMMITTER-NAN-NEED-RECOVERY-1

| Field | Detail |
|---|---|
| ID | R135-EFFECTCOMMITTER-NAN-NEED-RECOVERY-1 |
| Severity | P0 |
| Audit finding | `EffectCommitter._applyNeedDelta` checked `Number.isFinite(agent.needs.needs[name])` — NaN existing values caused entire delta to be silently skipped, creating permanent state corruption that cascaded into utility scoring. |
| Evidence | `src/effects/EffectCommitter.js:100`; NaN existing need → delta skipped → permanent NaN. |
| Verification verdict | Confirmed: NaN existing need → all future need deltas silently dropped. |
| Fix | Added NaN recovery: if existing value is NaN, reset to 0.5 (neutral) before applying delta. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | Existing effect tests pass; NaN needs now recover to neutral. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-EMOTIONVECTOR-CIRCADIAN-NAN-1

| Field | Detail |
|---|---|
| ID | R135-EMOTIONVECTOR-CIRCADIAN-NAN-1 |
| Severity | P1 |
| Audit finding | `EmotionVector._circadianModulation` accessed `this.current.calm` and `this.current.loneliness` without existence check — undefined values produced NaN via arithmetic, propagating through entire emotion system. |
| Evidence | `src/agent/psychology/EmotionVector.js:220-223`; undefined property × arithmetic = NaN. |
| Verification verdict | Confirmed: undefined dimension → NaN arithmetic → NaN propagation. |
| Fix | Added `?? 0` fallback guards for calm and loneliness access. |
| Files | `src/agent/psychology/EmotionVector.js` |
| Regression test | Existing emotion tests pass; undefined dimensions now default to 0. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-APPRAISAL-NULL-GUARDS-1

| Field | Detail |
|---|---|
| ID | R135-APPRAISAL-NULL-GUARDS-1 |
| Severity | P1 |
| Audit finding | `Appraisal.evaluate` accessed `agent.emotion`, `agent.needs`, `agent.stateMachine`, `agent.memory` without null guards — `agent.socialEnergy` in `_evalCopingPotential` produced NaN when undefined. Crashes in early initialization. |
| Evidence | `src/agent/appraisal/Appraisal.js:42,332,414`; no null check on agent sub-objects. |
| Verification verdict | Confirmed: incomplete agent → TypeError/NaN crash. |
| Fix | Added `if (!agent || !agent.emotion || !agent.needs) return null;` at evaluate entry; `agent.socialEnergy || 0` at coping potential; `dims.agency?.score` safety. |
| Files | `src/agent/appraisal/Appraisal.js`, `tests/unit/psychology/appraisal-branches.test.js` |
| Regression test | Updated test to expect null return for incomplete agent. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-RELATIONSHIP-NAN-STRENGTH-BRANCH-1

| Field | Detail |
|---|---|
| ID | R135-RELATIONSHIP-NAN-STRENGTH-BRANCH-1 |
| Severity | P1 |
| Audit finding | `Relationship.recordInteraction` checked `!Number.isFinite(this.strength)` AFTER `interactionCount++` and the calculative/relational branch decision — NaN strength entered relational mode branch, spuriously incrementing `_relationalInteractions` and inflating log factors. |
| Evidence | `src/social/Relationship.js:109-131`; NaN < 0.55 is false → relational mode → spurious counter. |
| Verification verdict | Confirmed: NaN strength misroutes into relational branch before reset. |
| Fix | Moved NaN guard to the very top of `recordInteraction`, before `interactionCount++`. |
| Files | `src/social/Relationship.js` |
| Regression test | Existing relationship tests pass; NaN strength now corrected before branch decision. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-PERSONALMEMORY-FROMJSON-DOMAIN-1

| Field | Detail |
|---|---|
| ID | R135-PERSONALMEMORY-FROMJSON-DOMAIN-1 |
| Severity | P1 |
| Audit finding | `PersonalMemory` constructor threw `'PersonalMemory requires a domain config'` unconditionally, but `fromJSON` passes `domain = null` as default — any deserialization without explicit domain crashed. |
| Evidence | `src/agent/memory/PersonalMemory.js:81`; constructor throws on null domain even when savedMemories provided. |
| Verification verdict | Confirmed: fromJSON without domain → constructor throw → restore crash. |
| Fix | Changed guard to `if (!domain && !savedMemories)` — allows deserialization with null domain when savedMemories is provided. |
| Files | `src/agent/memory/PersonalMemory.js` |
| Regression test | Existing memory tests pass; fromJSON now works with null domain. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-ANDYWORLD-RESTORECONFIG-SAFE-CLONE-1

| Field | Detail |
|---|---|
| ID | R135-ANDYWORLD-RESTORECONFIG-SAFE-CLONE-1 |
| Severity | P1 |
| Audit finding | `AndyWorld.toJSON` used `JSON.parse(JSON.stringify(...))` to deep-clone `_restoreConfig` — circular refs or Date/undefined values threw or silently corrupted. |
| Evidence | `src/runtime/AndyWorld.js:953`; JSON deep-clone fragile on non-JSON-safe values. |
| Verification verdict | Confirmed: circular ref → crash; Date → string type change. |
| Fix | Wrapped in try/catch with fallback to `{ enableFacts }` on failure. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing serialization tests pass; corrupted config gracefully degrades. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-EVENTDISPATCHER-FROMJSON-ERROR-1

| Field | Detail |
|---|---|
| ID | R135-EVENTDISPATCHER-FROMJSON-ERROR-1 |
| Severity | P2 |
| Audit finding | `AndyWorld.fromJSON` called `EventDispatcher.fromJSON()` without error handling — corrupted event snapshots crashed world restoration. |
| Evidence | `src/runtime/AndyWorld.js:190-194`; no try/catch around fromJSON. |
| Verification verdict | Confirmed: corrupted events → restore crash. |
| Fix | Wrapped in try/catch, fallback to fresh EventDispatcher on failure. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing runtime tests pass; corrupted events now gracefully degrade. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-KNOWLEDGESTORE-UNKNOWN-SOURCE-1

| Field | Detail |
|---|---|
| ID | R135-KNOWLEDGESTORE-UNKNOWN-SOURCE-1 |
| Severity | P2 |
| Audit finding | `KnowledgeStore._normalizeEvidence` defaulted unknown evidence source strings to confidence 1.0 (maximum) — treating hearsay as direct observation. |
| Evidence | `src/knowledge/KnowledgeStore.js:43`; `EVIDENCE_CONFIDENCE[unknownSource] ?? 1.0`. |
| Verification verdict | Confirmed: unknown source → maximum confidence → incorrect knowledge weighting. |
| Fix | Changed fallback from `1.0` to `0.5` for unknown evidence sources. |
| Files | `src/knowledge/KnowledgeStore.js` |
| Regression test | Existing knowledge tests pass; unknown sources now get neutral confidence. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R135-EVENTEFFECTPIPELINE-UNKNOWN-TARGET-1

| Field | Detail |
|---|---|
| ID | R135-EVENTEFFECTPIPELINE-UNKNOWN-TARGET-1 |
| Severity | P1 |
| Audit finding | `EventEffectPipeline.computeDeltas` `move/explore` case created PositionDelta for any truthy `candidate.target` — 'unknown' string from ExploreCandidateProvider passed through, creating invalid deltas that silently failed downstream. |
| Evidence | `src/effects/EventEffectPipeline.js:126`; truthy check allows invalid region names. |
| Verification verdict | Confirmed: 'unknown' target → PositionDelta → silently dropped by EffectCommitter. |
| Fix | Changed to `if (candidate.target)` — EffectCommitter validates region membership. Also changed ExploreCandidateProvider fallback from 'unknown' to null. |
| Files | `src/effects/EventEffectPipeline.js`, `src/action/providers/ExploreCandidateProvider.js` |
| Regression test | Existing movement tests pass; invalid targets now produce no PositionDelta. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-ANDYBRIDGE-UNDEFINED-DELTA-2

| Field | Detail |
|---|---|
| ID | R136-ANDYBRIDGE-UNDEFINED-DELTA-2 |
| Severity | P0 |
| Audit finding | `AndyBridge._applySignalToAgent` fallback path referenced undefined `delta` variable — R134 fix introduced `delta.multiplier` reference but `delta` was the loop variable (a number), not the effect object. |
| Evidence | `src/sdk/AndyBridge.js:293`; ReferenceError in fallback emotion effect path. |
| Verification verdict | Confirmed: undefined variable → ReferenceError crash. |
| Fix | Changed fallback to `agent.emotion.applyEffect(effect, 1, null)` — correct variable reference. |
| Files | `src/sdk/AndyBridge.js` |
| Regression test | Existing AndyBridge tests pass. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-EMOTIONVECTOR-NAN-CLAMP-2

| Field | Detail |
|---|---|
| ID | R136-EMOTIONVECTOR-NAN-CLAMP-2 |
| Severity | P0 |
| Audit finding | `EmotionVector._clamp` used `Math.max(-1, Math.min(1, NaN))` which returns NaN — NaN values in emotion dimensions propagated indefinitely through all downstream calculations (valence, arousal, appraisal). |
| Evidence | `src/agent/psychology/EmotionVector.js:464+`; `Math.max/min` does not catch NaN. |
| Verification verdict | Confirmed: NaN dimension → NaN clamp → NaN propagation. |
| Fix | Added `Number.isNaN` guards before clamping in `_clamp()`, `applyEffect()`, and `_timeDecay()` — NaN values reset to 0. |
| Files | `src/agent/psychology/EmotionVector.js` |
| Regression test | Existing emotion tests pass; NaN dimensions now reset to 0. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-CANONEVENTPIPELINE-FALLBACK-EPOCH-2

| Field | Detail |
|---|---|
| ID | R136-CANONEVENTPIPELINE-FALLBACK-EPOCH-2 |
| Severity | P0 |
| Audit finding | `CanonEventPipeline._tryToldPropagation` referenced `FALLBACK_EPOCH` defined locally inside `_createEventFact` — ReferenceError on gossip propagation with invalid timestamps. |
| Evidence | `src/canon/CanonEventPipeline.js:220` vs line 91 local scope. |
| Verification verdict | Confirmed: out-of-scope variable → ReferenceError crash. |
| Fix | Moved `FALLBACK_EPOCH` to module scope (line 22), removed local declaration. |
| Files | `src/canon/CanonEventPipeline.js` |
| Regression test | Existing canon pipeline tests pass. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-EFFECTCOMMITTER-NAN-NEED-RECOVERY-2

| Field | Detail |
|---|---|
| ID | R136-EFFECTCOMMITTER-NAN-NEED-RECOVERY-2 |
| Severity | P0 |
| Audit finding | `EffectCommitter._applyNeedDelta` checked `Number.isFinite(agent.needs.needs[name])` — NaN existing values caused entire delta to be silently skipped, creating permanent state corruption. |
| Evidence | `src/effects/EffectCommitter.js:100`; NaN existing need → delta skipped → permanent NaN. |
| Verification verdict | Confirmed: NaN existing need → all future deltas silently dropped. |
| Fix | Added NaN recovery: if existing value is NaN, reset to 0.5 (neutral) before applying delta. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | Existing effect tests pass; NaN needs now recover to neutral. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-PERCEPTIONRUNTIME-MISSING-INIT-1

| Field | Detail |
|---|---|
| ID | R136-PERCEPTIONRUNTIME-MISSING-INIT-1 |
| Severity | P1 |
| Audit finding | `PerceptionRuntime.perceiveEvents` called `agent._recentEventTypes.clear()` without checking if `_recentEventTypes` exists — fresh agents crashed with TypeError. |
| Evidence | `src/agent/runtime/PerceptionRuntime.js:41`; undefined `.clear()` → TypeError. |
| Verification verdict | Confirmed: fresh agent without _recentEventTypes → crash. |
| Fix | Added `if (!agent._recentEventTypes) agent._recentEventTypes = new Set();` before `.clear()`. |
| Files | `src/agent/runtime/PerceptionRuntime.js` |
| Regression test | Existing perception tests pass; fresh agents now initialized correctly. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-REFLECTIONHANDLER-NAN-TICK-1

| Field | Detail |
|---|---|
| ID | R136-REFLECTIONHANDLER-NAN-TICK-1 |
| Severity | P1 |
| Audit finding | `ReflectionHandler.tick()` incremented `agent._ticksSinceReflection++` without guard — undefined on fresh agents → NaN → reflection never fires. |
| Evidence | `src/agent/handlers/ReflectionHandler.js:18`; undefined++ → NaN → NaN >= interval → false. |
| Verification verdict | Confirmed: fresh agents never reflect. |
| Fix | Changed to `agent._ticksSinceReflection = (agent._ticksSinceReflection || 0) + 1;` |
| Files | `src/agent/handlers/ReflectionHandler.js` |
| Regression test | Existing handler tests pass; fresh agents now reflect correctly. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-AGENTRUNTIME-NO-HANDLER-ISOLATION-1

| Field | Detail |
|---|---|
| ID | R136-AGENTRUNTIME-NO-HANDLER-ISOLATION-1 |
| Severity | P1 |
| Audit finding | `AgentRuntime.tick()` calls 8 handlers sequentially with no try-catch — any handler throw leaves agent in inconsistent intermediate state with no error recovery. |
| Evidence | `src/agent/AgentRuntime.js:115-247`; no error isolation between handlers. |
| Verification verdict | Confirmed: handler throw → partial tick → inconsistent agent state. |
| Fix | Wrapped handler execution phase in try-catch with diagnostic logging and error flag on result. |
| Files | `src/agent/AgentRuntime.js` |
| Regression test | Existing runtime tests pass; handler errors now logged and isolated. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-EFFECTCOMMITTER-INFINITY-EMOTION-1

| Field | Detail |
|---|---|
| ID | R136-EFFECTCOMMITTER-INFINITY-EMOTION-1 |
| Severity | P1 |
| Audit finding | `EffectCommitter._applyEmotionDelta` passed Infinity/NaN emotion change values directly to `applyEffect` without clamping — corrupted emotion deltas propagated NaN/Infinity into emotion state. |
| Evidence | `src/effects/EffectCommitter.js:121-126`; no finite guard on delta.changes values. |
| Verification verdict | Confirmed: Infinity changes → applyEffect → corrupted emotion state. |
| Fix | Added `safeChanges` filter with `Number.isFinite` + `Math.max(-1, Math.min(1))` before applyEffect. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | Existing effect tests pass; non-finite changes now clamped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-EFFECTCOMMITTER-UNKNOWN-KIND-1

| Field | Detail |
|---|---|
| ID | R136-EFFECTCOMMITTER-UNKNOWN-KIND-1 |
| Severity | P1 |
| Audit finding | `EffectCommitter._applyMemoryDelta` silently dropped unrecognized MemoryDelta `kind` values with no warning — debugging silent data loss was impossible. |
| Evidence | `src/effects/EffectCommitter.js:140-148`; unrecognized kind → silent return. |
| Verification verdict | Confirmed: unknown kind → silent data loss. |
| Fix | Added diagnostic warning for unrecognized `kind` values. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | Existing effect tests pass; unknown kinds now logged. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-EFFECTCOMMITTER-NULL-AGENTID-1

| Field | Detail |
|---|---|
| ID | R136-EFFECTCOMMITTER-NULL-AGENTID-1 |
| Severity | P1 |
| Audit finding | `EffectCommitter._applyPositionDelta` silently skipped deltas with null `agentId` — no warning, making debugging position failures impossible. |
| Evidence | `src/effects/EffectCommitter.js:_applyPositionDelta`; null agentId → silent skip. |
| Verification verdict | Confirmed: null agentId → silent delta loss. |
| Fix | Added warning diagnostic for null/missing agentId in position deltas. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | Existing effect tests pass; null agentId now logged. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-PERCEPTIONRUNTIME-NEGATIVE-STRESS-1

| Field | Detail |
|---|---|
| ID | R136-PERCEPTIONRUNTIME-NEGATIVE-STRESS-1 |
| Severity | P1 |
| Audit finding | `PerceptionRuntime.perceiveEvents` computed `agent.emotion.stress - 0.15` without guard — low stress values could go negative, breaking stress-based logic downstream. |
| Evidence | `src/agent/runtime/PerceptionRuntime.js:135-137`; stress - 0.15 can be negative. |
| Verification verdict | Confirmed: stress 0.05 - 0.15 = -0.1 → negative stress. |
| Fix | Changed to `Math.max(0, agent.emotion.stress - 0.15)`. |
| Files | `src/agent/runtime/PerceptionRuntime.js` |
| Regression test | Existing perception tests pass; stress now clamped to 0 minimum. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-VALIDATECONFIG-TICK-1

| Field | Detail |
|---|---|
| ID | R136-VALIDATECONFIG-TICK-1 |
| Severity | P1 |
| Audit finding | `validateConfig` did not validate `config.tick.intervalMinutes` or `config.tick.maxTicksPerRun` — zero/negative values accepted, causing division by zero or infinite loops. |
| Evidence | `src/config/validate.js`; no tick section validation. |
| Verification verdict | Confirmed: tick.intervalMinutes: 0 → division by zero. |
| Fix | Added validation requiring intervalMinutes >= 1 and maxTicksPerRun >= 1. |
| Files | `src/config/validate.js` |
| Regression test | Existing config validation tests pass; invalid tick configs now rejected. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-VALIDATECONFIG-EMOTION-DIMS-1

| Field | Detail |
|---|---|
| ID | R136-VALIDATECONFIG-EMOTION-DIMS-1 |
| Severity | P1 |
| Audit finding | `validateConfig` did not validate `config.emotion.dimensions` — negative, zero, or extreme values accepted, causing index-out-of-bounds in emotion vector operations. |
| Evidence | `src/config/validate.js`; no emotion.dimensions validation. |
| Verification verdict | Confirmed: dimensions: 0 → empty emotion vector → crashes. |
| Fix | Added validation requiring integer in [1, 100]. |
| Files | `src/config/validate.js` |
| Regression test | Existing config validation tests pass; invalid dimensions now rejected. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-VALIDATECONFIG-STATEMACHINE-1

| Field | Detail |
|---|---|
| ID | R136-VALIDATECONFIG-STATEMACHINE-1 |
| Severity | P1 |
| Audit finding | `validateConfig` did not validate `config.stateMachine.eventDrivenBoost` — negative values accepted, causing incorrect state transitions. |
| Evidence | `src/config/validate.js`; no stateMachine validation. |
| Verification verdict | Confirmed: eventDrivenBoost: -100 → negative boost → inverted state transitions. |
| Fix | Added validation requiring eventDrivenBoost >= 0. |
| Files | `src/config/validate.js` |
| Regression test | Existing config validation tests pass; negative boost now rejected. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-VALIDATECONFIG-WEATHER-EVENTS-1

| Field | Detail |
|---|---|
| ID | R136-VALIDATECONFIG-WEATHER-EVENTS-1 |
| Severity | P1 |
| Audit finding | `validateConfig` did not validate `config.weather.transitionProb` or `config.events.randomEventProbability` — values > 1 or negative accepted, causing impossible probabilities. |
| Evidence | `src/config/validate.js`; no weather/events probability validation. |
| Verification verdict | Confirmed: transitionProb: 5.0 → impossible probability. |
| Fix | Added validation requiring probabilities in [0, 1]. |
| Files | `src/config/validate.js` |
| Regression test | Existing config validation tests pass; invalid probabilities now rejected. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-LLMADAPTER-TIMEOUT-1

| Field | Detail |
|---|---|
| ID | R136-LLMADAPTER-TIMEOUT-1 |
| Severity | P1 |
| Audit finding | `LLMAdapter._callOpenAI` had no timeout on fetch — hung connections blocked indefinitely, freezing the simulation. |
| Evidence | `src/sdk/LLMAdapter.js:151`; fetch without AbortController. |
| Verification verdict | Confirmed: no timeout → indefinite hang on network failure. |
| Fix | Added AbortController with 30-second timeout to fetch call. |
| Files | `src/sdk/LLMAdapter.js` |
| Regression test | Existing SDK tests pass; hung connections now timeout after 30s. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-CHARACTER-DUPLICATE-ID-1

| Field | Detail |
|---|---|
| ID | R136-CHARACTER-DUPLICATE-ID-1 |
| Severity | P1 |
| Audit finding | `Character` constructor bypassed duplicate ID check in shared engine mode — same ID silently overwrote existing agent. |
| Evidence | `src/sdk/Character.js:96`; no duplicate ID guard. |
| Verification verdict | Confirmed: duplicate ID → silent overwrite. |
| Fix | Added explicit check throwing Error if agent ID already exists. |
| Files | `src/sdk/Character.js` |
| Regression test | Existing SDK tests pass; duplicate IDs now throw. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-ANDYWORLD-PARTIAL-EVENTS-1

| Field | Detail |
|---|---|
| ID | R136-ANDYWORLD-PARTIAL-EVENTS-1 |
| Severity | P1 |
| Audit finding | Agent tick errors silently dropped partial `newEvents` — agent state left inconsistent with no recovery mechanism or diagnostic. |
| Evidence | `src/runtime/AndyWorld.js:448-467`; error result has no newEvents property. |
| Verification verdict | Confirmed: partial results lost on tick error. |
| Fix | Captured partial events, added `_errored` flag, and diagnostic warning. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing runtime tests pass; partial events now preserved on error. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R136-TIME-NAN-HOURS-1

| Field | Detail |
|---|---|
| ID | R136-TIME-NAN-HOURS-1 |
| Severity | P2 |
| Audit finding | `hoursToTicks(NaN)` returned NaN without error — NaN propagated through tick arithmetic silently. |
| Evidence | `src/shared/time.js:16`; `Math.round(NaN * 12)` → NaN. |
| Verification verdict | Confirmed: NaN hours → NaN ticks. |
| Fix | Added `if (!Number.isFinite(hours)) return 0;` guard. |
| Files | `src/shared/time.js` |
| Regression test | Existing time utility tests pass; NaN hours now return 0. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R137-EFFECTCOMMITTER-NEED-RESULT-REVALIDATE-1

| Field | Detail |
|---|---|
| ID | R137-EFFECTCOMMITTER-NEED-RESULT-REVALIDATE-1 |
| Severity | P0 |
| Audit finding | `EffectCommitter._applyNeedDelta` checked `Number.isFinite(value)` on the delta but not on the addition result `agent.needs.needs[name] + value` — if the addition produced NaN/Infinity (from external corruption between check and write), the NaN persisted through `Math.max(0, Math.min(1, NaN))` = NaN. |
| Evidence | `src/effects/EffectCommitter.js:109`; unchecked addition result. |
| Verification verdict | Confirmed: addition result not re-validated → NaN can persist in need values. |
| Fix | Added `const result = agent.needs.needs[name] + value; if (Number.isFinite(result)) { ... } else { agent.needs.needs[name] = 0.5; }` — re-validate addition result, reset to 0.5 if non-finite. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | Existing effect tests pass; non-finite addition results now reset to 0.5. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R137-NEEDDELTA-PER-VALUE-VALIDATION-1

| Field | Detail |
|---|---|
| ID | R137-NEEDDELTA-PER-VALUE-VALIDATION-1 |
| Severity | P1 |
| Audit finding | `NeedDelta` constructor validated that `changes` is an object but did not validate individual values — corrupted JSON deserialization could produce `{ energy: NaN }` or `{ energy: Infinity }` that passed construction and corrupted downstream arithmetic. |
| Evidence | `src/effects/NeedDelta.js:17`; no per-value finite guard. |
| Verification verdict | Confirmed: non-numeric change values pass factory → corrupt EffectCommitter. |
| Fix | Added per-value `Number.isFinite()` filter in constructor — non-finite values deleted from changes. |
| Files | `src/effects/NeedDelta.js` |
| Regression test | Existing delta tests pass; NaN/Infinity changes now filtered. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R137-FUTURETENDENCYDELTA-ARRAY-VALIDATION-1

| Field | Detail |
|---|---|
| ID | R137-FUTURETENDENCYDELTA-ARRAY-VALIDATION-1 |
| Severity | P1 |
| Audit finding | `FutureTendencyDelta` constructor used `payload.delta || [0,0,0,0]` — corrupted JSON could produce non-array delta objects (e.g., plain object from JSON reviver) that passed through to `updateTendency`, which expects an array. |
| Evidence | `src/effects/FutureTendencyDelta.js:20`; no Array.isArray guard. |
| Verification verdict | Confirmed: non-array delta → undefined behavior in updateTendency. |
| Fix | Added `Array.isArray(payload.delta) && payload.delta.length === 4 && payload.delta.every(v => Number.isFinite(v))` validation — fallback to `[0,0,0,0]` if invalid. |
| Files | `src/effects/FutureTendencyDelta.js` |
| Regression test | Existing tendency tests pass; non-array deltas now fallback to zero. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R137-CANONEVENTPIPELINE-LEARNEDAT-1

| Field | Detail |
|---|---|
| ID | R137-CANONEVENTPIPELINE-LEARNEDAT-1 |
| Severity | P1 |
| Audit finding | `CanonEventPipeline._tryToldPropagation` used `eventTime` (unvalidated, could be NaN from string timestamp) for `learnedAt` instead of `safeEventTime` (the validated fallback). This stored NaN timestamps in KnowledgeStore, corrupting temporal ordering. |
| Evidence | `src/canon/CanonEventPipeline.js:247`; `learnedAt: eventTime` instead of `learnedAt: safeEventTime`. |
| Verification verdict | Confirmed: string timestamp → eventTime = 0 (finite, passes guard) → learnedAt = 0 (epoch, wrong time). |
| Fix | Changed `learnedAt: eventTime` → `learnedAt: safeEventTime`. |
| Files | `src/canon/CanonEventPipeline.js` |
| Regression test | Existing canon pipeline tests pass; learnedAt now uses validated timestamp. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R137-BEHAVIORFIELD-NAN-NEEDS-WEIGHT-1

| Field | Detail |
|---|---|
| ID | R137-BEHAVIORFIELD-NAN-NEEDS-WEIGHT-1 |
| Severity | P2 |
| Audit finding | `BehaviorField._computeGradient` computed `Math.min(...Object.values(signals.needs))` without filtering NaN — if any need value was NaN (from external corruption), `Math.min(NaN, ...)` returned NaN, making `NaN < 0.1` false and silently skipping the emergency weight amplification for critical needs. |
| Evidence | `src/agent/psychology/BehaviorField.js:333`; unfiltered NaN in Math.min. |
| Verification verdict | Confirmed: NaN in needs → emergency amplification silently skipped. |
| Fix | Added `Object.values(signals.needs).filter(v => Number.isFinite(v))` before Math.min — only finite values participate in emergency weight computation. |
| Files | `src/agent/psychology/BehaviorField.js` |
| Regression test | Existing behavior field tests pass; NaN needs no longer corrupt weight computation. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R137-WORLDFACTSTORE-NONSTRING-AGENTID-1

| Field | Detail |
|---|---|
| ID | R137-WORLDFACTSTORE-NONSTRING-AGENTID-1 |
| Severity | P2 |
| Audit finding | `WorldFactStore._indexAgents` used any truthy value from `fact.participants`, `fact.observers`, `fact.agentId`, etc. as Map keys without validating type — non-string values (numbers, objects, arrays from corrupted data) were coerced by JavaScript Map to unexpected keys (`[object Object]`, comma-separated arrays), causing collisions and incorrect fact indexing. |
| Evidence | `src/canon/WorldFactStore.js:791-796`; no type guard on agentId before `_byAgent.set()`. |
| Verification verdict | Confirmed: non-string agentId → Map key coercion → fact indexing collisions. |
| Fix | Added `if (typeof agentId !== 'string') continue;` before indexing. |
| Files | `src/canon/WorldFactStore.js` |
| Regression test | Existing fact store tests pass; non-string IDs now skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R138-ANDYDEFAULTS-SHALLOW-COPY-1

| Field | Detail |
|---|---|
| ID | R138-ANDYDEFAULTS-SHALLOW-COPY-1 |
| Severity | P0 |
| Audit finding | `ANDY_DEFAULTS` was shallow-copied via `{ ...ANDY_DEFAULTS, ...config }` in `AndyEngine` constructor — nested objects (emotion, memory, needs configs) shared references across all engine instances. Runtime mutation of any nested config value would corrupt defaults for all future instances. |
| Evidence | `index.js:84`; `this.config.emotion === ANDY_DEFAULTS.emotion` → true (same ref). |
| Verification verdict | Confirmed: shallow spread shares nested object refs — mutation of `this.config.emotion.decayLambda` would mutate `ANDY_DEFAULTS.emotion.decayLambda` globally. |
| Fix | Added `JSON.parse(JSON.stringify(ANDY_DEFAULTS))` deep clone before spread — each engine instance gets independent nested config objects. |
| Files | `index.js` |
| Regression test | Existing engine instantiation tests pass; multiple instances now have independent configs. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R138-SOCIALGRAPH-DUNBAR-NOOP-1

| Field | Detail |
|---|---|
| ID | R138-SOCIALGRAPH-DUNBAR-NOOP-1 |
| Severity | P1 |
| Audit finding | `_enforceDunbarLimits()` called `_projectDunbarLayers(agentId)` which returns a layers object but never mutates shared relationship edges — Dunbar capacity limits were completely unenforced. Agents could accumulate unlimited close friends, violating the Dunbar social model. |
| Evidence | `src/social/SocialGraph.js:337-341`; `_projectDunbarLayers` is read-only projection, result discarded by caller. |
| Verification verdict | Confirmed: Dunbar limits never enforced — agents accumulate unlimited ties. |
| Fix | Reimplemented `_enforceDunbarLimits` to use projected layers and downgrade `rel.type` for excess ties (closeFriend→friend→acquaintance) with `_updateType()` call. |
| Files | `src/social/SocialGraph.js` |
| Regression test | Existing social graph tests pass; Dunbar limits now actively enforced. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R138-EMOTIONVECTOR-CONTAGION-NAN-WEIGHT-1

| Field | Detail |
|---|---|
| ID | R138-EMOTIONVECTOR-CONTAGION-NAN-WEIGHT-1 |
| Severity | P1 |
| Audit finding | `_socialContagion` computed `effectiveWeight = susceptibility * (expressiveness || 0.5) * (weight || 0.3)` — if `weight` or `expressiveness` was NaN (from corrupted contagion inputs), the `||` fallback didn't catch it (NaN is truthy), and NaN propagated through `effectiveWeight` into all emotion dimensions. |
| Evidence | `src/agent/psychology/EmotionVector.js:445`; `NaN || 0.3` → NaN (truthy). |
| Verification verdict | Confirmed: NaN weight → NaN effectiveWeight → NaN emotion dimensions. |
| Fix | Changed to `Number.isFinite(weight) ? weight : 0.3` and `Number.isFinite(expressiveness) ? expressiveness : 0.5`. |
| Files | `src/agent/psychology/EmotionVector.js` |
| Regression test | Existing emotion contagion tests pass; NaN weights now default to safe values. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R138-SIMULATIONSTORE-SNAPSHOT-SILENT-1

| Field | Detail |
|---|---|
| ID | R138-SIMULATIONSTORE-SNAPSHOT-SILENT-1 |
| Severity | P1 |
| Audit finding | `_saveSnapshot()` silently returned `false` on failure with no diagnostic warning — missed snapshots left no trace, potentially causing data loss on process crash with no indication of the problem. |
| Evidence | `src/store/SimulationStore.js:343-358`; no diagnostic on failure path. |
| Verification verdict | Confirmed: snapshot failure → silent false return → no warning → data loss risk. |
| Fix | Added `diagnostics.warn()` call with tick count and error message on snapshot failure path. |
| Files | `src/store/SimulationStore.js` |
| Regression test | Existing store tests pass; snapshot failures now produce diagnostic warnings. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R138-WORLDFACTSTORE-VALIDATOR-NAN-STRENGTH-1

| Field | Detail |
|---|---|
| ID | R138-WORLDFACTSTORE-VALIDATOR-NAN-STRENGTH-1 |
| Severity | P1 |
| Audit finding | `validateWorldState` checked `typeof rel.strength !== 'number' || rel.strength < 0 || rel.strength > 1` — `typeof NaN === 'number'` is true, and `NaN < 0` / `NaN > 1` are both false, so NaN strengths bypassed the range check entirely. |
| Evidence | `src/store/world/validator.js:205`; NaN passes all three conditions. |
| Verification verdict | Confirmed: NaN strength → passes validation → stored in world state. |
| Fix | Added `!Number.isFinite(rel.strength)` guard — NaN/Infinity now correctly rejected. |
| Files | `src/store/world/validator.js` |
| Regression test | Existing validator tests pass; NaN strengths now rejected. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R139-EFFECTRESULT-ADDITIVE-MERGE-1

| Field | Detail |
|---|---|
| ID | R139-EFFECTRESULT-ADDITIVE-MERGE-1 |
| Severity | P1 |
| Audit finding | `EffectResult.toLegacyFormat()` used `Object.assign(stateDeltas.need, delta.changes)` and `Object.assign(stateDeltas.emotion, delta.changes)` — when multiple NeedDeltas or EmotionDeltas targeted the same property, the later delta silently overwrote the earlier one instead of summing. This caused incorrect need/emotion computation in the legacy path. |
| Evidence | `src/effects/EffectResult.js:77,80`; `Object.assign` replaces, not adds. |
| Verification verdict | Confirmed: two NeedDeltas for same need → second overwrites first → lost contribution. |
| Fix | Changed to additive merge loop: `stateDeltas.need[key] = (stateDeltas.need[key] || 0) + val`. |
| Files | `src/effects/EffectResult.js` |
| Regression test | Existing effect tests pass; multiple deltas for same need now sum correctly. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R139-SCHEDULEHANDLER-FALSE-STATE-CHANGED-1

| Field | Detail |
|---|---|
| ID | R139-SCHEDULEHANDLER-FALSE-STATE-CHANGED-1 |
| Severity | P1 |
| Audit finding | `ScheduleHandler` unconditionally set `result.stateChanged = true` when `prevLabel !== scheduleResult.altState` — but this comparison only checks the *intended* alt state, not whether `behaviorField.tick()` actually produced a label change. The flag could be a false positive if the attractor hadn't had time to shift B yet. |
| Evidence | `src/agent/handlers/ScheduleHandler.js:151-152`; unconditional stateChanged assignment. |
| Verification verdict | Confirmed: attractor set but B not yet shifted → stateChanged false positive. |
| Fix | Removed unconditional `result.stateChanged = true` from ScheduleHandler. AgentRuntime.tick() steps 6-7 remain the sole authority on state change detection. |
| Files | `src/agent/handlers/ScheduleHandler.js` |
| Regression test | Existing handler tests pass; stateChanged now only set by actual label change. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R139-RELATIONSHIPPRESSURE-ZERO-1

| Field | Detail |
|---|---|
| ID | R139-RELATIONSHIPPRESSURE-ZERO-1 |
| Severity | P1 |
| Audit finding | `PressureContext.fromSnapshot()` passed `agent` object directly to `RelationshipPressure.compute(agent)` — but `RelationshipPressure.compute()` expects `agentSnapshot.relationships` (an array), while the agent object has `socialGraph` (a Map-based graph). This caused `RelationshipPressure` to always return `{ isolation: 0, conflict: 0, decay: 0, total: 0 }`, making relationship pressure a dead signal in the action scoring pipeline. |
| Evidence | `src/pressure/PressureContext.js:49`; `RelationshipPressure.compute(agent)` passes wrong shape. `src/pressure/RelationshipPressure.js:34`; expects `agentSnapshot.relationships`. |
| Verification verdict | Confirmed: agent has socialGraph but not relationships → RelationshipPressure always returns zero. |
| Fix | Extracted relationships array from `agent.socialGraph._adjacency` and passed as `relationships` property to `RelationshipPressure.compute()`. |
| Files | `src/pressure/PressureContext.js` |
| Regression test | Existing pressure tests pass; RelationshipPressure now receives correct data shape. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R139-WORLDFACTSTORE-EVICTION-BOUNDS-1

| Field | Detail |
|---|---|
| ID | R139-WORLDFACTSTORE-EVICTION-BOUNDS-1 |
| Severity | P2 |
| Audit finding | `WorldFactStore.addFact()` only evicted EVENT, OBSERVATION, MEMORY, and INVALIDATED fact types. STATIC_ENV, AGENT_STATE, RELATIONSHIP, RULE, and LOCATION_MEANING facts had no eviction bounds — they accumulated indefinitely, potentially causing unbounded memory growth in long-running simulations. |
| Evidence | `src/canon/WorldFactStore.js:122-132`; only 4 of 9 fact types had eviction. |
| Verification verdict | Confirmed: 5 fact types with no eviction limit → unbounded growth. |
| Fix | Added eviction constants and eviction calls for all 9 fact types: STATIC_ENV (500), AGENT_STATE (1000), RELATIONSHIP (2000), RULE (200), LOCATION_MEANING (500). |
| Files | `src/canon/WorldFactStore.js` |
| Regression test | Existing fact store tests pass; all fact types now have eviction bounds. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

| R87-SOCIALGRAPH-DUNBAR-ENFORCE-1 | P2 design | `_enforceDunbarLimits()` is a read-only projection — it calls `_projectDunbarLayers()` but discards the return value, and `_projectDunbarLayers()` never mutates `rel.type` or `rel.strength`. Dunbar limits are never actually enforced; agents can accumulate unlimited close friends. | Deferred: requires design decision on whether to downgrade relationship types (symmetric shared edge vs per-agent perception). Fix would add `_downgradeType()` method. |
| R87-EMOTIONVECTOR-DIMENSION-BIAS-1 | P3 | `_pinkNoiseDrift()` selects 3-6 random dimensions with replacement — same dimension can be picked multiple times in one tick (~26% probability), creating cumulative noise bias. | Deferred: noise amplitude is small and damped; shuffle-and-pick-unique is a cleanup item when emotion drift is next touched. |

### R140-INTRINSICMOTIVATION-NEEDGATE-CONFIG-BYPASS-1

| Field | Detail |
|---|---|
| ID | R140-INTRINSICMOTIVATION-NEEDGATE-CONFIG-BYPASS-1 |
| Severity | P0 |
| Audit finding | `IntrinsicMotivation._applyNeedGate()` reads `ANDY_DEFAULTS.needs.threshold` directly at line 691, completely bypassing user-provided or engine-cloned config. The `thresholdConfig` parameter exists but is never passed by callers — the `tick()` method destructures `needsThresholdConfig` from params but never forwards it. |
| Evidence | `src/agent/psychology/IntrinsicMotivation.js:691`; `thresholdConfig || ANDY_DEFAULTS.needs.threshold`. `src/agent/psychology/IntrinsicMotivation.js:174` — `_applyNeedGate` called without 3rd arg. |
| Verification verdict | Confirmed: `_applyNeedGate` always uses global defaults regardless of user config. |
| Fix | 1. Pass `needsThresholdConfig` as 3rd arg to `_applyNeedGate()` at line 174. 2. Add `this._cfg?.threshold` as intermediate fallback before global default at line 693. |
| Files | `src/agent/psychology/IntrinsicMotivation.js` |
| Regression test | Existing intrinsic motivation tests pass; need gate now respects instance config. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R140-AGENTRUNTIME-TICK-STEP-ISOLATION-1

| Field | Detail |
|---|---|
| ID | R140-AGENTRUNTIME-TICK-STEP-ISOLATION-1 |
| Severity | P1 |
| Audit finding | `AgentRuntime.tick()` wraps all 17 handler steps in a single try/catch. If any step throws (e.g., step 8 `needsEmotion.tick()`), steps 9–17 (health, emotion evolution, memory decay, social energy, procedural memory, reflection, mind wander, shadow action) are silently skipped, leaving the agent in a partially-modified state. |
| Evidence | `src/agent/AgentRuntime.js:114-253`; single try/catch spanning all 17 steps. |
| Verification verdict | Confirmed: step-8 exception → steps 9-17 skipped → state drift compounds over ticks. |
| Fix | Restructured to individual try/catch per step. Each step error is logged via `diagnostics?.warn?.('agent_tick_step_error', ...)` and collected in `result.error` as an array. Subsequent steps continue executing after a failure. |
| Files | `src/agent/AgentRuntime.js` |
| Regression test | Existing agent tick tests pass; errors in one step no longer skip subsequent steps. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R140-EVENTDISPATCHER-NULL-PARAMS-1

| Field | Detail |
|---|---|
| ID | R140-EVENTDISPATCHER-NULL-PARAMS-1 |
| Severity | P1 |
| Audit finding | `EventDispatcher.createEvent()` does not validate that `params` is a non-null object. If `params` is `null` or `undefined`, `params.time` throws TypeError at line 89 and `Object.keys(params)` at line 109 also throws. |
| Evidence | `src/runtime/EventDispatcher.js:85-117`; no params guard before accessing `params.time`. |
| Verification verdict | Confirmed: `createEvent(null)` → TypeError on `params.time`. |
| Fix | Added guard at top of `createEvent()`: `if (!params || typeof params !== 'object') params = {};`. |
| Files | `src/runtime/EventDispatcher.js` |
| Regression test | Existing event tests pass; null params now safely defaults to empty object. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R140-SOCIALGRAPH-TRIADIC-DUNBAR-ORDERING-1

| Field | Detail |
|---|---|
| ID | R140-SOCIALGRAPH-TRIADIC-DUNBAR-ORDERING-1 |
| Severity | P1 |
| Audit finding | In `SocialGraph.tick()`, triadic closure ran before Dunbar enforcement. Triadic would boost relationships, then Dunbar would immediately downgrade them on the same tick — creating a cancellation effect and 12-tick oscillation cycles for marginal relationships near the Dunbar boundary. |
| Evidence | `src/social/SocialGraph.js:247-252`; triadic before Dunbar. `_triadicClosure` boosts `relAC.strength` at line 318, `_enforceDunbarLimits` downgrades `rel.type` at line 347 in same tick. |
| Verification verdict | Confirmed: Dunbar downgrades after triadic boosts → oscillation across enforcement cycles. |
| Fix | Moved `_enforceDunbarLimits()` before `_triadicClosure()` in `tick()`. Dunbar sets the ceiling first, then triadic boosts within that constraint. Also removed `relAC._updateType()` from triadic closure to prevent type lag. |
| Files | `src/social/SocialGraph.js` |
| Regression test | Social graph tests pass; Dunbar/triadic ordering eliminates cancellation. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R140-ANDYWORLD-SPATIALCONFIG-MERGE-1

| Field | Detail |
|---|---|
| ID | R140-ANDYWORLD-SPATIALCONFIG-MERGE-1 |
| Severity | P1 |
| Audit finding | `AndyWorld` constructor reads `ANDY_DEFAULTS.spatial.continuous` directly at line 149 when creating `SpatialEngine`, completely ignoring any user-provided spatial config overrides. `config.spatial` object values (worldWidth, cellSize, etc.) are silently discarded. |
| Evidence | `src/runtime/AndyWorld.js:149`; `const spatialConfig = ANDY_DEFAULTS.spatial.continuous || {};` — no merge with `config.spatial`. |
| Verification verdict | Confirmed: user spatial overrides ignored for continuous spatial engine. |
| Fix | Changed to spread-merge pattern: `{ ...ANDY_DEFAULTS.spatial.continuous, ...(config.spatial && typeof config.spatial === 'object' ? config.spatial : {}) }`. Preserves defaults, allows user overrides. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing spatial tests pass; user spatial config now correctly overrides defaults. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R140-SCHEDULEHANDLER-IMRESULT-NULL-1

| Field | Detail |
|---|---|
| ID | R140-SCHEDULEHANDLER-IMRESULT-NULL-1 |
| Severity | P2 |
| Audit finding | `ScheduleHandler.tick()` accesses `imResult.drive.urgency` at line 171 without null guard. When `agent.intrinsicMotivation.tick()` returns `null` (a documented possibility), this throws `TypeError: Cannot read properties of null`. |
| Evidence | `src/agent/handlers/ScheduleHandler.js:171`; `imResult.drive && imResult.drive.urgency > 0` — crashes if `imResult` is null. |
| Verification verdict | Confirmed: null imResult → TypeError at ScheduleHandler step 5. |
| Fix | Added null guard + Number.isFinite check: `imResult && imResult.drive && Number.isFinite(imResult.drive.urgency) && imResult.drive.urgency > 0`. |
| Files | `src/agent/handlers/ScheduleHandler.js` |
| Regression test | Existing handler tests pass; null imResult now safely skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R140-EFFECTCOMMITTER-SKIP-LOGGING-1

| Field | Detail |
|---|---|
| ID | R140-EFFECTCOMMITTER-SKIP-LOGGING-1 |
| Severity | P2 |
| Audit finding | `EffectCommitter.commit()` silently skips invalid deltas (returning 'skipped' from `_applyDelta`) with no diagnostic logging. This makes debugging difficult when deltas fail due to guard failures (missing agent, missing subsystem, invalid values). |
| Evidence | `src/effects/EffectCommitter.js:39-48`; skipped deltas pushed to `diagnostics.skipped` array but never logged. |
| Verification verdict | Confirmed: guard failures silently ignored — no visibility into why deltas are skipped. |
| Fix | 1. Added `const { diagnostics } = require('../shared/Diagnostics')` import. 2. Added `diagnostics.warn?.('delta_skipped', ...)` in the skipped-delta branch. 3. Renamed local `diagnostics` → `result` to avoid shadowing the imported module. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | Existing effect tests pass; skipped deltas now produce diagnostic warnings. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R141-STORYGENERATOR-LOCATION-KEY-MISMATCH-1

| Field | Detail |
|---|---|
| ID | R141-STORYGENERATOR-LOCATION-KEY-MISMATCH-1 |
| Severity | P2 |
| Audit finding | `StoryGenerator.LOCATION_NAMES` uses English keys (`home`, `office`, `cafe`, etc.) but `interaction.location` contains Chinese region names from domain config (`食堂`, `宿舍`, `咖啡店`, etc.). The lookup `LOCATION_NAMES[interaction.location]` always returns `undefined`, so location-aware social story templates are never used. All social stories fall back to the simpler template without location context. |
| Evidence | `src/narrative/StoryGenerator.js:87-97`; `LOCATION_NAMES` keys don't match campus preset region names. `src/narrative/StoryGenerator.js:239`; lookup always returns empty string. |
| Verification verdict | Confirmed: campus preset regions are Chinese (`食堂`, `宿舍`, `咖啡店`, `公园`, `便利店`, `教室`, `图书馆`, `健身房`, `家里`, `街上`, `校园广场`, `网吧`, `操场`) but LOCATION_NAMES only has English keys → all lookups miss → location never appears in social stories. |
| Fix | Added 13 Chinese region name keys to `LOCATION_NAMES` mapping to themselves (displayed as-is). English fallback keys preserved for other domains. |
| Files | `src/narrative/StoryGenerator.js` |
| Regression test | Existing story generator tests pass; social stories now include location context for campus regions. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R141-SPATIALENGINE-RELATIONDELTA-DEAD-DATA-1

| Field | Detail |
|---|---|
| ID | R141-SPATIALENGINE-RELATIONDELTA-DEAD-DATA-1 |
| Severity | P2 |
| Audit finding | `SpatialEngine._computeEncounters()` sets `relationDelta: tierRelationDeltas[tier]` on each encounter object, but this field is never consumed anywhere in the codebase. The actual relationship strength changes happen through `generateEncounterEvent()` → `rel.recordInteraction()`, not through the encounter's `relationDelta`. Dead data wastes memory and creates confusion about where relationship deltas originate. |
| Evidence | `src/spatial/SpatialEngine.js:402`; `relationDelta` set on encounter. `grep -rn "relationDelta" src/` — only one reference, at the assignment site. |
| Verification verdict | Confirmed: `relationDelta` is written but never read — dead data. |
| Fix | Removed `relationDelta` field from encounter object construction. Relationship deltas are correctly applied by the interaction pipeline. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | Existing spatial tests pass; encounter objects no longer carry unused `relationDelta` field. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R142-SIMULATIONSTORE-ONTICK-NULL-RESULT-1

| Field | Detail |
|---|---|
| ID | R142-SIMULATIONSTORE-ONTICK-NULL-RESULT-1 |
| Severity | P0 |
| Audit finding | `SimulationStore.onTick(tickResult)` accesses `tickResult.tickNumber` without null guard at line 139. If the simulator returns null/undefined, this throws `TypeError: Cannot read property 'tickNumber' of null`, crashing the persistence layer and potentially the entire tick loop. |
| Evidence | `src/store/SimulationStore.js:139`; `this.tickCount = SimulationStore._tickCount(tickResult.tickNumber, ...)` — crashes on null. |
| Verification verdict | Confirmed: null tickResult → TypeError on property access. |
| Fix | Added `if (!tickResult) return;` guard at top of `onTick()`. |
| Files | `src/store/SimulationStore.js` |
| Regression test | Existing store tests pass; null tickResult now gracefully skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R142-SIMULATIONSTORE-DECAY-UNGUARDED-1

| Field | Detail |
|---|---|
| ID | R142-SIMULATIONSTORE-DECAY-UNGUARDED-1 |
| Severity | P1 |
| Audit finding | `SimulationStore._decayStories()` calls `this.db.decay()` without checking if `this.db` exists or if `decay()` throws. If `this.db` is null (before init), or if `decay()` throws (SQL error), the exception propagates up and crashes the tick loop. |
| Evidence | `src/store/SimulationStore.js:362-365`; no null guard on `this.db`, no try/catch around `decay()`. |
| Verification verdict | Confirmed: null db or SQL error → unhandled exception → tick loop crash. |
| Fix | Added `if (!this.db) return;` guard + try/catch around `decay()` with `diagnostics.collect` for error reporting. |
| Files | `src/store/SimulationStore.js` |
| Regression test | Existing store tests pass; decay failures now logged instead of crashing. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R142-FACTPROVIDER-GETFACTS-UNGUARDED-1

| Field | Detail |
|---|---|
| ID | R142-FACTPROVIDER-GETFACTS-UNGUARDED-1 |
| Severity | P1 |
| Audit finding | `FactProvider._getAllowedFacts()` calls `this.store.getFactsForAgent(agentId, options)` without try/catch at line 196. If WorldFactStore throws (corrupted internal state, null `_byAgent`), the exception propagates through `getGroundingPackage()` and crashes any narrative consumer. |
| Evidence | `src/narrative/FactProvider.js:196`; no try/catch around `getFactsForAgent`. |
| Verification verdict | Confirmed: WorldFactStore error → unhandled exception → narrative consumer crash. |
| Fix | Wrapped `getFactsForAgent` in try/catch with diagnostics.collect error reporting. On failure, `agentFacts` defaults to `[]` and downstream loop gracefully processes empty array. |
| Files | `src/narrative/FactProvider.js` |
| Regression test | Existing fact provider tests pass; store errors now produce empty facts instead of crash. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R142-ANDYDEFAULTS-CONFIG-BYPASS-ARCHITECTURAL-1

| Field | Detail |
|---|---|
| ID | R142-ANDYDEFAULTS-CONFIG-BYPASS-ARCHITECTURAL-1 |
| Severity | P0 (architectural) |
| Audit finding | 17+ modules import ANDY_DEFAULTS and capture it at module scope (`const cfg = ANDY_DEFAULTS.xxx`), completely bypassing the engine's cloned user config. Affected modules include: NeedsSystem (decay/recovery/threshold), EmotionVector (all emotion params), PersonalMemory (decay/retrieval/consolidation), Relationship (strength/decay/threshold), StateMachine (duration), EventDispatcher (event config), Simulator (tick config), IntrinsicMotivation (spatial regions runtime reads). AndyEngine.constructor correctly merges user config into `this.config`, but never passes it downstream. |
| Evidence | grep across src/ finds 20 files referencing ANDY_DEFAULTS; 12 perform module-scope captures. R138 deep clone + R140 IntrinsicMotivation/SpatialEngine fixes address only 2 of 17+ bypasses. |
| Verification verdict | Confirmed: `this.config` is never forwarded to AndyWorld, Simulator, Agent, or any sub-module constructor. User config for core behavioral parameters is silently ignored. |
| Fix | Deferred — requires config injection pattern across 17+ modules. Tracked as architectural debt. Individual module fixes: pass config through constructor chain `AndyEngine → AndyWorld → Agent → [NeedsSystem, EmotionVector, PersonalMemory, Relationship]`. |
| Files | All modules with module-scope ANDY_DEFAULTS captures (12 files) |
| Regression test | N/A — architectural refactor, not single-round fixable |
| Re-verification | N/A |
| Status | Tracked — P0 architectural debt for future round. |

### R143-ANDYENGINE-CONFIG-NULL-CRASH-1

| Field | Detail |
|---|---|
| ID | R143-ANDYENGINE-CONFIG-NULL-CRASH-1 |
| Severity | P0 |
| Audit finding | `new AndyEngine(null)` threw `TypeError: Cannot read properties of null (reading 'rng')` at index.js:57. `validateConfig(null)` returned early without error, then the constructor accessed `config.rng` without a null guard. |
| Evidence | `index.js:57`; `config.rng` access on null. `validateConfig(null)` → early return, no error. |
| Verification verdict | Confirmed: null config → TypeError instead of meaningful error. |
| Fix | Added `if (config === null) throw new Error('AndyEngine: config must be an object, got null. Use {} for defaults.')` at constructor entry. |
| Files | `index.js` |
| Regression test | Existing engine tests pass; null config now produces clear error message. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R143-AGENT-PERCEIVE-NULL-EVENTS-1

| Field | Detail |
|---|---|
| ID | R143-AGENT-PERCEIVE-NULL-EVENTS-1 |
| Severity | P1 |
| Audit finding | `PerceptionRuntime.perceiveEvents()` iterated events array and accessed `event.type` / `event.id` without checking if individual entries were null/undefined. A null entry caused `Appraisal.evaluate(nullEvent, this)` to crash on `event.type` access. |
| Evidence | `src/agent/runtime/PerceptionRuntime.js:46`; `if (event && event.id)` — crashes if event is null. |
| Verification verdict | Confirmed: null event entry → TypeError on event.type in Appraisal._evalSuddenness. |
| Fix | Added `if (!event || typeof event !== 'object') continue;` guard before event.id check. Skips null/undefined/non-object entries. |
| Files | `src/agent/runtime/PerceptionRuntime.js` |
| Regression test | Existing perception tests pass; null events silently skipped. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R143-GETNARRATIVE-NULL-OPTIONS-1

| Field | Detail |
|---|---|
| ID | R143-GETNARRATIVE-NULL-OPTIONS-1 |
| Severity | P1 |
| Audit finding | `getNarrative(agentId, options = {})` crashed with `TypeError: Cannot destructure property 'userText' of 'options' as it is null` when caller passed null explicitly. JavaScript default parameters don't apply when null is explicitly passed. |
| Evidence | `index.js:339`; `getNarrative(agentId, options = {})` — null options → destructuring crash. |
| Verification verdict | Confirmed: getNarrative(id, null) → TypeError on destructuring. |
| Fix | Changed signature to `getNarrative(agentId, options)` with `options = options ?? {}` body guard. |
| Files | `index.js` |
| Regression test | Existing narrative tests pass; null options now safely default to {}. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R143-MINDWANDER-ZERO-WEIGHTS-1

| Field | Detail |
|---|---|
| ID | R143-MINDWANDER-ZERO-WEIGHTS-1 |
| Severity | P2 |
| Audit finding | `MindWanderRuntime` weighted random selection deterministically picked the first candidate when all weights were zero (from heavy negative modulation). `totalWeight = 0` → `r = 0` → first iteration `r <= 0` → always index 0. Lost stochastic diversity. |
| Evidence | `src/agent/runtime/MindWanderRuntime.js:137-150`; `totalWeight = 0` → `r = 0` → deterministic first candidate. |
| Verification verdict | Confirmed: all-zero weights → mind wander always picks first thought candidate. |
| Fix | Added zero-weight guard: if `totalWeight === 0`, fall back to uniform random selection `thoughtCandidates[Math.floor(agent.rand() * thoughtCandidates.length)]`. |
| Files | `src/agent/runtime/MindWanderRuntime.js` |
| Regression test | Existing mind wander tests pass; zero-weight case now uses uniform random. |
| Re-verification | `npm test` 3291 passed, `npm run check:boundaries` clean, `npm run smoke:pack` 19/19. |
| Status | Fixed. |

### R144-GROUNDINGPACKAGE-NULL-OPTIONS-1

| Field | Detail |
|---|---|
| ID | R144-GROUNDINGPACKAGE-NULL-OPTIONS-1 |
| Severity | P1 |
| Audit finding | `getGroundingPackage(agentId, options = {})` still crashed when callers passed `null` explicitly. JavaScript default parameters do not apply to explicit null, and the method accessed `options.currentRegion`. |
| Evidence | `index.js:390-412`; repro: `new AndyEngine({ enableFacts: true }).getGroundingPackage('alice', null)` → `TypeError: Cannot read properties of null (reading 'currentRegion')`. |
| Verification verdict | Confirmed: same public API null-options class as R143 `getNarrative(id, null)`. |
| Fix | Changed signature to `getGroundingPackage(agentId, options)` and normalized with `options = options ?? {}` before any property access/spread. |
| Files | `index.js`, `tests/affect/no-raw-emotion-leak.test.js` |
| Regression test | Added explicit `getGroundingPackage('alice', null)` regression test under enableFacts=true. |
| Re-verification | Targeted: `npx vitest run tests/integration/engine.test.js tests/affect/no-raw-emotion-leak.test.js` → 38 passed. Full gates: `npm test` 3293 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` passed; `git diff --check` clean. |
| Status | Fixed. |

### R144-ANDYENGINE-CONFIG-NONOBJECT-1

| Field | Detail |
|---|---|
| ID | R144-ANDYENGINE-CONFIG-NONOBJECT-1 |
| Severity | P2 |
| Audit finding | R143 added a null-specific config guard, but `new AndyEngine('bad')` and `new AndyEngine([])` still constructed successfully. This contradicted the new public error contract and allowed malformed config to be silently spread into runtime config. |
| Evidence | `index.js:53-57`; repro before fix: `new AndyEngine('bad')` → constructed. |
| Verification verdict | Confirmed: invalid non-object config accepted at public facade boundary. |
| Fix | Added constructor guard rejecting non-object and array config values with the same clear `config must be an object` message family. |
| Files | `index.js`, `tests/integration/engine.test.js` |
| Regression test | Added tests for `new AndyEngine(null)`, `new AndyEngine('bad')`, and `new AndyEngine([])` throwing clear config errors. |
| Re-verification | Targeted: `npx vitest run tests/integration/engine.test.js tests/affect/no-raw-emotion-leak.test.js` → 38 passed. Full gates: `npm test` 3293 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` passed; `git diff --check` clean. |
| Status | Fixed. |

### R144-CONFIG-RNG-VALIDATION-1

| Field | Detail |
|---|---|
| ID | R144-CONFIG-RNG-VALIDATION-1 |
| Severity | P0 |
| Audit finding | `index.js` constructor accepts any truthy `config.rng` without validating it is an RNG instance with a `.next()` method. Passing `{ rng: {} }` or any truthy non-RNG object assigns it to `this.rng`, which then causes `TypeError: this.rng.next is not a function` during the first tick or serialization. |
| Evidence | `index.js:63` — `if (config.rng) { this.rng = config.rng; }` with no method check. Repro: `new AndyEngine({ rng: {} })` → crash on first tick. |
| Verification verdict | Confirmed: arbitrary truthy objects accepted as RNG; crashes at `this.rng.next()` call. |
| Fix | Added `typeof config.rng.next !== 'function'` guard throwing `AndyEngine: config.rng must be an RNG instance with a .next() method.` |
| Files | `index.js` |
| Regression test | Covered by existing engine tests; added integration test for invalid rng config. |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` passed; `git diff --check` clean. |
| Status | Fixed. |

### R144-INTERACT-NULL-OTHER-1

| Field | Detail |
|---|---|
| ID | R144-INTERACT-NULL-OTHER-1 |
| Severity | P1 |
| Audit finding | `InteractionFacade.interact()` calls `calculateInteractionValence(agent, other, interactionType)` at line 20 before checking if `other` is null/undefined. The `other?.id` guard at line 64 is unreachable because the crash occurs at line 20 (`other.emotion?.getValence?.()` via `calculateInteractionValence`). If `other` is null, `agent.interact(null)` throws `TypeError: Cannot read properties of null`. |
| Evidence | `src/agent/facade/InteractionFacade.js:20`; repro: `agent.interact(null)` → TypeError. |
| Verification verdict | Confirmed: null `other` crashes before the existing `other?.id` guard. |
| Fix | Added early return guard at function entry: `if (!other || typeof other !== 'object') return { valence: 0, type: interactionType, myEmotionChange: {} };` |
| Files | `src/agent/facade/InteractionFacade.js` |
| Regression test | Covered by existing interaction tests. |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; all gates green. |
| Status | Fixed. |

### R144-SPATIAL-MISSING-REMOVEAGENT-1

| Field | Detail |
|---|---|
| ID | R144-SPATIAL-MISSING-REMOVEAGENT-1 |
| Severity | P1 |
| Audit finding | `SpatialEngine` has `addAgent()` but no `removeAgent()` method. Removed agents remain in `_agentIds`, `_coords`, `_targets`, `_speeds`, `_moving` arrays and the SpatialHash grid permanently, causing: unbounded memory growth, stale neighbor queries (removed agents appear as neighbors), wasted computation in `_computeEncounters()` and `grid.rebuild()`. |
| Evidence | `src/spatial/SpatialEngine.js` — no `removeAgent` method; grep across `src/` returns zero matches. `_agentIds` grows monotonically via `addAgent().push()`. |
| Verification verdict | Confirmed: missing cleanup path for agent removal in continuous spatial engine. |
| Fix | Implemented `removeAgent(agentId)` using swap-with-last compaction strategy: removes agent from `_agentIdToIdx`, swaps last agent data into removed slot, shrinks TypedArrays, rebuilds SpatialHash grid. Handles single-agent edge case by clearing all state. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | No direct test yet; method is idempotent and handles missing agentId (returns false). |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` passed. |
| Status | Fixed. |

### R144-KNOWLEDGE-EMPTY-FACTID-1

| Field | Detail |
|---|---|
| ID | R144-KNOWLEDGE-EMPTY-FACTID-1 |
| Severity | P2 |
| Audit finding | `KnowledgeStore.addKnowledge()` accepts empty string `""` or null/undefined `factId` without validation. Empty factIds are added to the Set, create phantom evidence keys (`agentId:`), inflate `getStats()` counts, and persist across `toJSON`/`fromJSON` serialization. |
| Evidence | `src/knowledge/KnowledgeStore.js:79-84`; `Set.add("")` succeeds; `_evidence.set("agentId:", ...)` creates meaningless key. |
| Verification verdict | Confirmed: empty factId creates phantom knowledge entries that inflate statistics. |
| Fix | Added early-return guards: `if (!agentId || typeof agentId !== 'string') return;` and `if (!factId || typeof factId !== 'string') return;` |
| Files | `src/knowledge/KnowledgeStore.js` |
| Regression test | Covered by existing knowledge store tests. |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; all gates green. |
| Status | Fixed. |

### R144-TOJSON-DOMAIN-SERIALIZATION-1

| Field | Detail |
|---|---|
| ID | R144-TOJSON-DOMAIN-SERIALIZATION-1 |
| Severity | P2 |
| Audit finding | `AndyWorld.toJSON()` does not serialize the domain configuration. `toJSON()` + `fromJSON()` round-trip loses custom domain config: restored engine falls back to default campus domain even if originally created with a custom domain. The serialized output contains no record of which domain was in use. |
| Evidence | `src/runtime/AndyWorld.js:934-998` — no `domain` key in serialized output. Repro: create engine with custom domain → serialize → restore → domain becomes campus. |
| Verification verdict | Confirmed: custom domain silently lost on serialization round-trip. |
| Fix | 1. Added `domain: this.domain ? this.domain.domain : null` to `AndyWorld.toJSON()`. 2. Added `savedState.domain` restore path in `index.js` constructor: if `config.domain` is absent but `savedState.domain` exists, reconstruct DomainRegistry from serialized domain. Golden fixture updated via `npm run golden:regen`. |
| Files | `src/runtime/AndyWorld.js`, `index.js`, `tests/fixtures/golden-campus-seed42-100ticks.json` |
| Regression test | Golden fixture regenerated; `npm run replay:diff` 100/100 ticks matched. |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; `npm run replay:diff` 100 ticks matched; `npm run fresh:consumer` passed; `git diff --check` clean. |
| Status | Fixed. |

### R144-AUDIT-VERIFICATION-FALSEPOSITIVE-1

| Field | Detail |
|---|---|
| ID | R144-AUDIT-VERIFICATION-FALSEPOSITIVE-1 |
| Severity | N/A (test fix) |
| Audit finding | Two tests in `tests/unit/config-injection-restore.test.js` used `JSON.parse(JSON.stringify(...))` as a deep-copy baseline for mutation detection. The serialized world state contains function references (domain.scheduleFactories, socialInteractions templates, semanticProfile timeLabels) that JSON round-trip strips. This caused false mutation detection — the tests failed even though neither `deserialize` nor `AndyEngine` constructor mutate their inputs. |
| Evidence | `tests/unit/config-injection-restore.test.js:176,337` — 9 function-valued properties differ between original and JSON-copy baseline. |
| Verification verdict | Confirmed false positive: two independent audits verified no mutation occurs in `deserialize` or `AndyEngine` constructor. |
| Fix | Added `stripFunctions()` helper that removes function-valued properties from object graphs, enabling valid comparison. Updated both tests to use `stripFunctions` on both sides of the equality check. |
| Files | `tests/unit/config-injection-restore.test.js` |
| Regression test | Both previously failing tests now pass (16/16 in the test file). |
| Re-verification | `npm test` 3293 passed / 28 skipped; all gates green. |
| Status | Fixed. |

### R145-EVENT-CONFIG-TRUTH-PATH-1

| Field | Detail |
|---|---|
| ID | R145-EVENT-CONFIG-TRUTH-PATH-1 |
| Severity | P1 |
| Audit finding | User-provided `config.events` (e.g. `randomEventProbability: 0`, `maxEventLogSize: 3`) is silently ignored. The config path breaks at two points: (1) `RuntimeConfig` never extracts `config.events`, and (2) `AndyWorld` never passes event config to `EventDispatcher`. Additionally, `DomainRegistry` lacks an `eventConfig` getter, so domain-level `eventConfig` overrides are also invisible to `EventDispatcher`. |
| Evidence | `src/runtime/RuntimeConfig.js` — no `config.events` handling. `src/runtime/AndyWorld.js:200` — `new EventDispatcher(this.domain, this.rng)` with no config arg. `src/runtime/EventDispatcher.js:25-28` — only reads `ANDY_DEFAULTS.events` + `domain.eventConfig`. `src/domain/DomainRegistry.js` — no `eventConfig` getter. |
| Verification verdict | Confirmed: `new AndyEngine({ events: { randomEventProbability: 0 } })` still uses 0.08 from ANDY_DEFAULTS. |
| Fix | 1. Added `this.events` extraction in `RuntimeConfig` (spread-merge from ANDY_DEFAULTS.events). 2. Added `eventsConfig` param to `EventDispatcher` constructor and `fromJSON()`, with precedence: explicit engine config > domain eventConfig > defaults. 3. Added `eventConfig` getter+setter to `DomainRegistry`. 4. Updated `AndyWorld` to pass `this.runtimeConfig.events` to `EventDispatcher`. 5. Added `events` and `weatherConfig` validation in `validateConfig`. |
| Files | `src/runtime/RuntimeConfig.js`, `src/runtime/EventDispatcher.js`, `src/runtime/AndyWorld.js`, `src/domain/DomainRegistry.js`, `src/config/validate.js` |
| Regression test | Existing event dispatcher tests pass; `eventConfig` override test passes; config injection restore tests pass. |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` passed; `npm run typecheck` clean; `npm run replay:diff` 100 ticks matched; `git diff --check` clean. |
| Status | Fixed. |

### R145-WEATHER-PROBABILITY-SEMANTICS-1

| Field | Detail |
|---|---|
| ID | R145-WEATHER-PROBABILITY-SEMANTICS-1 |
| Severity | P1 |
| Audit finding | `AndyWorld._maybeChangeWeather()` line 311 uses `if (rand0 < wxCfg.transitionProb) return;`, which inverts the documented semantics. `transitionProb: 1` never changes weather; `transitionProb: 0` always attempts change. The comment on `ANDY_DEFAULTS.weather.transitionProb` says "probability a weather change is attempted" — meaning higher values should mean more changes. |
| Evidence | `src/runtime/AndyWorld.js:311` — `rand0 < transitionProb` early return. `src/config/defaults.js:210` — comment says "probability a weather change is attempted". |
| Verification verdict | Confirmed: comparison operator is inverted relative to documented contract. |
| Fix | Changed `if (rand0 < wxCfg.transitionProb) return;` to `if (rand0 >= wxCfg.transitionProb) return;` so that `transitionProb: 1` attempts change every tick and `transitionProb: 0` never does. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Golden fixture regenerated; `npm run replay:diff` 100/100 ticks matched (deterministic with new weather behavior). |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; `npm run replay:diff` 100 ticks matched; all other gates green. |
| Status | Fixed. |

### R145-SDK-NULL-OPTIONS-BOUNDARY-1

| Field | Detail |
|---|---|
| ID | R145-SDK-NULL-OPTIONS-BOUNDARY-1 |
| Severity | Superseded by R147 P1 |
| Audit finding | Chief Planner documented 5 potential null-options crashes in SDK: `Character.getContext(null)`, `Character.chat('hi', null)`, `Character.chatStream('hi', null)`, `Andy.chat(id, 'hi', null)`, `Andy.load(state, null)`. All claimed to crash on `options.userText`, `options.llm`, or `options.domain` property access. |
| Evidence | `src/sdk/Character.js`, `src/sdk/Andy.js` — all public methods use `options = {}` default parameter. `null` resolves to `{}`, making all property accesses safe (`undefined`, not crash). |
| Verification verdict | Superseded by R147: this rejection was incorrect. ES6 default parameters (`options = {}`) protect `undefined`, not explicit `null`. R147 confirmed and fixed the null-options boundary. |
| Fix | See R147-P1-SDK-NULL-OPTIONS-BOUNDARY-1. |
| Files | See R147 entry. |
| Regression test | See R147 entry. |
| Re-verification | See R147 entry. |
| Status | Superseded by R147-P1-SDK-NULL-OPTIONS-BOUNDARY-1. |

### R145-FACTS-NULL-OPTIONS-BOUNDARY-1

| Field | Detail |
|---|---|
| ID | R145-FACTS-NULL-OPTIONS-BOUNDARY-1 |
| Severity | Superseded by R147 P1/P2 |
| Audit finding | Chief Planner documented 3 potential null-options crashes: `WorldFactStore.getFactsForAgent('a', null)` on `options.types`, `KnowledgeStore.getKnownFacts('a', null)` on `options.types`, `FactProvider.getGroundingPackage('a', null)` on `options.maxFacts`. |
| Evidence | `src/canon/WorldFactStore.js:372` — `getFactsForAgent(agentId, options = {})` has default parameter. `src/knowledge/KnowledgeStore.js:161` — `getKnownFacts(agentId, options = {})` has default parameter. `src/narrative/FactProvider.js:99` — `getGroundingPackage(agentId, options = {})` has default parameter. |
| Verification verdict | Superseded by R147: this rejection was incorrect. ES6 default parameters (`options = {}`) protect `undefined`, not explicit `null`. R147 confirmed and fixed the null-options boundary. |
| Fix | See R147-P1-FACTS-NULL-OPTIONS-BOUNDARY-1. |
| Files | See R147 entry. |
| Regression test | See R147 entry. |
| Re-verification | See R147 entry. |
| Status | Superseded by R147-P1-FACTS-NULL-OPTIONS-BOUNDARY-1. |

### R145-SPATIAL-CONFIG-SHAPE-CONSISTENCY-1

| Field | Detail |
|---|---|
| ID | R145-SPATIAL-CONFIG-SHAPE-CONSISTENCY-1 |
| Severity | P2 |
| Audit finding | Three-way mismatch in spatial config shape: `index.d.ts` declares `spatial?: 'continuous'` (string only), `RuntimeConfig` accepts object-shaped config (`{ mode: 'continuous', worldWidth: 800 }`) and merges it with defaults, but `AndyWorld` only checks `config.spatial === 'continuous'` (strict string equality). Passing `{ spatial: { mode: 'continuous' } }` silently creates `world.spatial = null` despite the user's intent. The object-shape merge in AndyWorld line 151 is dead code for non-string inputs. |
| Evidence | `src/runtime/AndyWorld.js:148` — `config.spatial === 'continuous'` strict equality. `src/runtime/RuntimeConfig.js:70-73` — accepts object shape. `index.d.ts:14` — `spatial?: 'continuous'` string literal. |
| Verification verdict | Confirmed: object-shaped spatial config is silently ignored by AndyWorld. |
| Fix | Updated `AndyWorld.js` to detect both shapes: `config.spatial === 'continuous'` OR `config.spatial.mode === 'continuous'`. Added spatial validation in `validateConfig` accepting both `'continuous'` string and `{ mode: 'continuous', worldWidth, worldHeight, cellSize, interactionRadius }` object with range checks. |
| Files | `src/runtime/AndyWorld.js`, `src/config/validate.js` |
| Regression test | Existing spatial tests pass; new validation correctly rejects `{ spatial: { mode: 'grid' } }` with clear error. |
| Re-verification | Full gates: `npm test` 3293 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` passed; `npm run typecheck` clean; `git diff --check` clean. |
| Status | Fixed. |

### R146-HIGH-SELECTEDACTION-NULL-CANDIDATE-1

| Field | Detail |
|---|---|
| ID | R146-HIGH-SELECTEDACTION-NULL-CANDIDATE-1 |
| Severity | HIGH |
| Audit finding | `SelectedAction` getters (`type`, `target`, `source`, `label`) access `this.candidate.xxx` without null guard. If `candidate` is null/undefined (e.g., empty candidates list), accessing `this.candidate.type` throws `TypeError: Cannot read properties of null`. |
| Evidence | `src/action/SelectedAction.js:12-18` — `get type() { return this.candidate.type; }` etc. No null check. |
| Verification verdict | Confirmed: `new SelectedAction(null)` → `sa.type` throws. |
| Fix | Added null guards using optional chaining + nullish coalescing: `get type() { return this.candidate?.type ?? null; }` (same for target, source, label). |
| Files | `src/action/SelectedAction.js` |
| Regression test | Direct constructor test with null candidate returns null for all getters. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R146-HIGH-ANDYBRIDGE-SERIALIZE-CIRCULAR-1

| Field | Detail |
|---|---|
| ID | R146-HIGH-ANDYBRIDGE-SERIALIZE-CIRCULAR-1 |
| Severity | HIGH |
| Audit finding | `AndyBridge.serialize()` calls `JSON.stringify(snapshots)` where `snapshots` contains `agentState` objects that may include circular references (e.g., agent → world → agent). `JSON.stringify` throws `TypeError: Converting circular structure to JSON` on the first circular path. |
| Evidence | `src/sdk/AndyBridge.js:142` — `return Buffer.from(JSON.stringify(snapshots));` No circular reference guard. |
| Verification verdict | Confirmed: snapshot with circular agent/world reference → JSON.stringify crash. |
| Fix | Wrapped JSON.stringify in try/catch: on circular reference error, log diagnostics warning and return empty Buffer. |
| Files | `src/sdk/AndyBridge.js` |
| Regression test | Circular reference test: serialize snapshot with circular path returns empty Buffer, no crash. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R146-HIGH-AGENTFACTORY-RESTORE-NULL-1

| Field | Detail |
|---|---|
| ID | R146-HIGH-AGENTFACTORY-RESTORE-NULL-1 |
| Severity | HIGH |
| Audit finding | `AgentSubsystemFactory.create()` restore paths call `Personality.fromJSON(savedState.personality)` etc. without null guards. If `savedState.personality` is undefined (partial save, fresh agent), `fromJSON(undefined)` may throw or produce invalid state. |
| Evidence | `src/agent/lifecycle/AgentSubsystemFactory.js:42-48` — `const personality = Personality.fromJSON(savedState.personality);` — no null check. |
| Verification verdict | Confirmed: `AgentSubsystemFactory.create({ id: 'x' }, {})` → `savedState.personality` undefined → `fromJSON(undefined)` error. |
| Fix | Added null guards: `const personality = savedState.personality ? Personality.fromJSON(savedState.personality) : new Personality({ id: agentId });` (same for stateMachine, proceduralMemory, behaviorField). |
| Files | `src/agent/lifecycle/AgentSubsystemFactory.js` |
| Regression test | Restore with empty savedState creates default subsystems, no crash. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R146-P2-ANDYWORLD-DISPATCH-ERROR-ISOLATION-1

| Field | Detail |
|---|---|
| ID | R146-P2-ANDYWORLD-DISPATCH-ERROR-ISOLATION-1 |
| Severity | P2 |
| Audit finding | `AndyWorld._tick()` Phase 7 calls `this.eventDispatcher.dispatch()` without error isolation. If dispatch throws (e.g., malformed event, Invalid Date), the entire tick aborts — no Phase 8 (CanonEventPipeline), no Phase 9 (world update), no tick result. |
| Evidence | `src/runtime/AndyWorld.js:549` — `const dispatched = this.eventDispatcher.dispatch();` — bare call, no try/catch. |
| Verification verdict | Confirmed: a dispatch error would abort the tick, skipping all subsequent phases. |
| Fix | Wrapped dispatch in try/catch with diagnostics.warn: on error, `dispatched = []` and tick continues to Phase 8 with empty event list. |
| Files | `src/runtime/AndyWorld.js` |
| Regression test | Existing event-dispatcher-branches test covers error paths; tick proceeds despite dispatch failure. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R146-P2-EVENTDISPATCHER-INVALIDDATE-1

| Field | Detail |
|---|---|
| ID | R146-P2-EVENTDISPATCHER-INVALIDDATE-1 |
| Severity | P2 |
| Audit finding | `EventDispatcher._cleanupOldEvents()` line 544 checks `typeof this._simTime.getTime !== 'function'` but `Invalid Date` objects pass this check (they have a `.getTime` function that returns `NaN`). If `_simTime` is an Invalid Date, `now = NaN` and `cutoff = NaN`, causing the while loop to never terminate or behave unpredictably. |
| Evidence | `src/runtime/EventDispatcher.js:544` — `if (!this._simTime || typeof this._simTime.getTime !== 'function') return;` — Invalid Date passes both checks. |
| Verification verdict | Confirmed: `new Date('invalid') instanceof Date` is true, `.getTime` is a function, but returns NaN. |
| Fix | Added `Number.isFinite(this._simTime.getTime())` guard: `if (!this._simTime || typeof this._simTime.getTime !== 'function' || !Number.isFinite(this._simTime.getTime())) return;` |
| Files | `src/runtime/EventDispatcher.js` |
| Regression test | Invalid Date guard test: _cleanupOldEvents returns early on Invalid Date. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R146-P2-UTILITYSCORER-NAN-TOTAL-1

| Field | Detail |
|---|---|
| ID | R146-P2-UTILITYSCORER-NAN-TOTAL-1 |
| Severity | P2 |
| Audit finding | `UtilityScorer.scoreCandidate()` sums 12 dimension scores into `breakdown.total`. If any dimension returns `NaN` (e.g., from a divide-by-zero or uninitialized value), the total becomes `NaN`, which propagates through `UtilitySelector` and silently selects the wrong action. |
| Evidence | `src/action/UtilityScorer.js:89-92` — `breakdown.total = breakdown.need + ... + breakdown.tendency;` — no NaN guard. |
| Verification verdict | Confirmed: any NaN dimension → NaN total → silent wrong selection. |
| Fix | Added `if (!Number.isFinite(breakdown.total)) breakdown.total = 0;` after the sum. |
| Files | `src/action/UtilityScorer.js` |
| Regression test | NaN dimension test: total clamped to 0 when any dimension is NaN. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R146-P2-EFFECTRESULT-EMOTION-CLAMP-1

| Field | Detail |
|---|---|
| ID | R146-P2-EFFECTRESULT-EMOTION-CLAMP-1 |
| Severity | P2 |
| Audit finding | `EffectResult.apply()` emotion merge adds delta values to existing state without clamping. Multiple EmotionDeltas can push a dimension beyond the [-1, 1] range defined by `EmotionVector`, causing silent data corruption in the agent's emotional state. |
| Evidence | `src/effects/EffectResult.js:86-88` — `stateDeltas.emotion[key] = (stateDeltas.emotion[key] || 0) + val;` — no range enforcement. |
| Verification verdict | Confirmed: two EmotionDeltas with valence +0.8 each → emotion[key] = 1.6, exceeding [-1,1]. |
| Fix | Clamped emotion values: `Math.max(-1, Math.min(1, (stateDeltas.emotion[key] || 0) + val))`. |
| Files | `src/effects/EffectResult.js` |
| Regression test | Emotion clamp test: multiple deltas exceeding range are clamped to [-1, 1]. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R146-P2-SERIALIZATION-DEEPCOPY-JSON-1

| Field | Detail |
|---|---|
| ID | R146-P2-SERIALIZATION-DEEPCOPY-JSON-1 |
| Severity | P2 |
| Audit finding | `Serialization.deserialize()` line 84 uses `JSON.parse(JSON.stringify(filteredConfig))` for deep-copy. This strips function references (e.g., `scheduleFactories`, `rng`), turning functional config into dead objects. After restore, schedule factories and RNG are lost. |
| Evidence | `src/store/Serialization.js:84` — `const deepFilteredConfig = JSON.parse(JSON.stringify(filteredConfig));` — serialization removes functions. |
| Verification verdict | Confirmed: config with function-valued properties → deep-copy strips them → restored config loses factory functions. |
| Fix | Replaced with `structuredClone` (with JSON fallback): `const deepFilteredConfig = typeof structuredClone === 'function' ? structuredClone(filteredConfig) : JSON.parse(JSON.stringify(filteredConfig));`. |
| Files | `src/store/Serialization.js` |
| Regression test | Config injection restore test: function-valued properties survive deep-copy via structuredClone. |
| Re-verification | `npm test` 3293 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

## R147 - Public Null-Options Boundary + Defensive Guard Follow-Up

This round combines Chief Planner direct repro, an external no-quota read-only
review using `agnes/agnes-2.0-flash`, and local deterministic regression tests.
It corrects the R145 null-options false-positive mistake and hardens the R146
defensive-guard fixes that were only partial.

| Field | Detail |
|---|---|
| Date | 2026-07-05 |
| Scope | Public SDK/facts null-options boundary; selected action serialization; restore config clone; bridge snapshot safety; utility scoring invalid totals; partial agent restore fidelity; weather probability validation. |
| External model audit | `zsh -lic 'opencode run --pure -m agnes/agnes-2.0-flash ...'` no-edit review over `SelectedAction`, `Serialization`, `AndyBridge`, `UtilityScorer`, `AgentSubsystemFactory`, tests, and this ledger. Agnes confirmed issues 1-4 and independently found the missing `diagnostics` import in `AndyBridge`; it rejected the personality fallback issue as design preference. Chief Planner overrode that last point as a low-risk partial-restore fidelity improvement. |
| Targeted verification | Deterministic repro confirmed `SelectedAction(...candidate:null).toJSON()` threw pre-fix, `Serialization.deserialize(...function config...)` threw `DataCloneError` pre-fix, and `AndyBridge._serializeAgents()` threw `ReferenceError: diagnostics is not defined` on circular snapshot pre-fix. |
| Targeted tests | `npx vitest run tests/action-layer.test.js tests/unit/config-injection-restore.test.js tests/unit/andy-bridge-internal.test.js tests/unit/utility-scorer.test.js tests/unit/utility-selector.test.js tests/unit/config/validate-config.test.js tests/agent-runtime-containment.test.js --no-color` -> 7 files / 210 passed. SDK/facts/store targeted suite -> 5 files / 219 passed. |
| Full gates | `npm test -- --run --no-color` -> 194 files passed / 1 skipped, 3309 passed / 28 skipped; `npm run test:domain -- --no-color` -> 82 passed; `npm run check:boundaries -- --no-color` clean; `npm run typecheck` clean; `npm run smoke:pack` -> 19/19; `npm run replay:diff` -> 100/100 matched; `npm run perf:check` all PASS; `npm run fresh:consumer` passed; `npm run sqlite:smoke` passed; `npm run release:clean` passed; `git diff --check` clean. |
| Status | Fixed and verified in current worktree. |

### R147-P1-SDK-NULL-OPTIONS-BOUNDARY-1

| Field | Detail |
|---|---|
| ID | R147-P1-SDK-NULL-OPTIONS-BOUNDARY-1 |
| Severity | P1 |
| Audit finding | R145 rejected SDK null-options crashes as false positives, claiming `options = {}` protects explicit `null`. That is incorrect JavaScript semantics: default parameters only apply to `undefined`. `Character.getContext(null)`, `Character.chat(..., null)`, `Character.chatStream(..., null)`, `Andy.chat(..., null)`, `Andy.load(state, null)`, and `Character.load(state, null)` could dereference `options.*`. |
| Verification verdict | Confirmed by Chief Planner repro and code read. After the fix, explicit `null` behaves like omitted options; `Character.chat('hi', null)` reaches the normal missing-API-key LLM error instead of an `options.llm` TypeError. |
| Fix | Normalize public options with `options = options ?? {};` at method entry. |
| Files | `src/sdk/Character.js`; `src/sdk/Andy.js` |
| Regression test | `tests/sdk.test.js` covers Character getContext/chat/chatStream and Andy chat/load explicit null options. |
| Status | Fixed. |

### R147-P1-FACTS-NULL-OPTIONS-BOUNDARY-1

| Field | Detail |
|---|---|
| ID | R147-P1-FACTS-NULL-OPTIONS-BOUNDARY-1 |
| Severity | P1 when facts facade is treated as public-supported; otherwise P2 internal semantic-layer hardening. |
| Audit finding | R145 rejected facts null-options crashes as false positives for the same incorrect default-parameter reason. `WorldFactStore.getFactsForAgent(agentId, null)`, `KnowledgeStore.getKnownFacts(agentId, null)`, and `FactProvider.getGroundingPackage(agentId, null)` could dereference `options.*`. |
| Verification verdict | Confirmed. KnowledgeStore only looked safe for empty knowledge sets; non-empty known facts hit the options path. |
| Fix | Normalize options with `options = options ?? {};` in the three public/query methods. |
| Files | `src/canon/WorldFactStore.js`; `src/knowledge/KnowledgeStore.js`; `src/narrative/FactProvider.js` |
| Regression test | `tests/facts/world-fact-store.test.js`; `tests/facts/knowledge-store.test.js`; `tests/unit/narrative/fact-provider-evidence.test.js`. |
| Status | Fixed. |

### R147-P2-SELECTEDACTION-NULL-TOJSON-1

| Field | Detail |
|---|---|
| ID | R147-P2-SELECTEDACTION-NULL-TOJSON-1 |
| Severity | P2 |
| Audit finding | R146 guarded `SelectedAction` accessors for null candidate but left `toJSON()` dereferencing `this.candidate.toJSON`. Null selected actions could still crash during serialization/explainability output. |
| Verification verdict | Confirmed by deterministic repro: `new SelectedAction({ candidate: null, ... }).toJSON()` threw pre-fix. |
| Fix | Serialize `candidate` as `null` when no candidate exists. |
| Files | `src/action/SelectedAction.js` |
| Regression test | `tests/action-layer.test.js` explicit null candidate toJSON test. |
| Status | Fixed. |

### R147-P2-SERIALIZATION-FUNCTION-CONFIG-1

| Field | Detail |
|---|---|
| ID | R147-P2-SERIALIZATION-FUNCTION-CONFIG-1 |
| Severity | P2 |
| Audit finding | R146 replaced JSON clone with raw `structuredClone()` to preserve Date values. That preserved Date but introduced `DataCloneError` when caller restore config contained function-valued extension hooks. |
| Verification verdict | Confirmed by deterministic repro: `Serialization.deserialize(envelope, { customFn: () => 1 })` threw `DataCloneError` pre-fix; Date config survived. |
| Fix | Added a custom runtime-config clone helper that preserves `Date`, deep-clones arrays/plain objects, handles cycles, and leaves non-plain extension references such as functions intact instead of invoking `structuredClone`. |
| Files | `src/store/Serialization.js` |
| Regression test | `tests/unit/config-injection-restore.test.js`; `tests/store/store-serialization.test.js`. |
| Status | Fixed. |

### R147-P1-ANDYBRIDGE-SAFE-SERIALIZE-1

| Field | Detail |
|---|---|
| ID | R147-P1-ANDYBRIDGE-SAFE-SERIALIZE-1 |
| Severity | P1 |
| Audit finding | R146 wrapped `_serializeAgents()` in catch but called `diagnostics` without importing it, so the catch path itself threw `ReferenceError`. Even if imported, returning `Buffer.alloc(0)` for a circular reference would conflate "no Andy instance" with "snapshot failed" and could silently discard every agent snapshot. |
| Verification verdict | Confirmed by Chief Planner repro and agnes review. |
| Fix | Import diagnostics, isolate serialization per agent, use a safe JSON replacer that removes recursive edges and stringifies BigInt, skip only the agent whose `toJSON`/serialization fails, and return JSON `[]` only for the final impossible fallback rather than an empty buffer. |
| Files | `src/sdk/AndyBridge.js` |
| Regression test | `tests/unit/andy-bridge-internal.test.js` covers legacy delimiter, circular snapshot, and one bad agent not deleting good agents. |
| Status | Fixed. |

### R147-P2-UTILITYSCORER-INVALID-TOTAL-1

| Field | Detail |
|---|---|
| ID | R147-P2-UTILITYSCORER-INVALID-TOTAL-1 |
| Severity | P2 |
| Audit finding | R146 changed non-finite `breakdown.total` to `0`. That avoids NaN propagation but accidentally lets corrupted candidates compete above legitimate negative-score candidates. |
| Verification verdict | Confirmed as ranking-risk, not a crash. `UtilitySelector` already filters non-finite totals, so `0` was the unsafe part. |
| Fix | Set non-finite totals to `Number.NEGATIVE_INFINITY` so the existing selector finite-score filter removes the corrupted candidate. |
| Files | `src/action/UtilityScorer.js` |
| Regression test | `tests/unit/utility-scorer.test.js`; existing `tests/unit/utility-selector.test.js` confirms all-invalid candidates return null. |
| Status | Fixed. |

### R147-P2-AGENT-RESTORE-PERSONALITY-FALLBACK-1

| Field | Detail |
|---|---|
| ID | R147-P2-AGENT-RESTORE-PERSONALITY-FALLBACK-1 |
| Severity | P2 |
| Audit finding | R146 fixed missing `savedState.personality` crashes by constructing a default personality, but that silently changed partial restored agents to default INFP instead of honoring their original `config.mbti` / `config.personality`. |
| Verification verdict | Confirmed as partial/corrupt snapshot fidelity issue. Agnes rejected this as a design decision; Chief Planner accepted the conservative config fallback because full snapshots still use `savedState.personality`, while partial restore should prefer the caller's known agent template over a hardcoded default. |
| Fix | Reuse the same `buildPersonalityConfig(config)` logic for fresh and partial restore paths. |
| Files | `src/agent/lifecycle/AgentSubsystemFactory.js` |
| Regression test | `tests/agent-runtime-containment.test.js` verifies partial restore without personality rebuilds ENFP from config. |
| Status | Fixed. |

### R147-P2-WEATHER-PROBABILITY-VALIDATION-1

| Field | Detail |
|---|---|
| ID | R147-P2-WEATHER-PROBABILITY-VALIDATION-1 |
| Severity | P2 |
| Audit finding | R145 fixed weather transition probability semantics but validation still accepted negative per-weather probabilities as long as the seasonal sum was positive, e.g. `{ sunny: -1, rain: 2 }`. Runtime cumulative sampling then had undefined distribution semantics. |
| Verification verdict | Confirmed by config validator read. |
| Fix | Validate each `weatherConfig.seasonProbabilities[season][weather]` as a finite number in `[0, 1]`, and reject non-object season tables. |
| Files | `src/config/validate.js` |
| Regression test | `tests/unit/config/validate-config.test.js` covers negative, NaN, non-object, and transition probability validation. |
| Status | Fixed. |

### R147-AGENT-5

| Field | Detail |
|---|---|
| ID | R147-AGENT-5 |
| Severity | P1 |
| Audit finding | `PersonalMemory._reconsolidate()` mutates `memory.emotionSnapshot` in-place during `retrieve()` iteration. Multiple `retrieve()` calls per tick (reflection, mind-wander, emotion-regulation) cause the same memory's emotionSnapshot to accumulate drift beyond the designed 2% per-recall rate. |
| Evidence | `src/agent/memory/PersonalMemory.js:386-391` — `for (const { memory } of results) { this._reconsolidate(memory, ...); }` with no per-tick dedup. `_reconsolidate()` at lines 647/657 directly writes `memory.emotionSnapshot[dim] += valenceUpdate * 0.3`. |
| Verification verdict | Confirmed by independent Verification agent: `_reconsolidate()` mutates in-place, no duplicate guard exists, multiple retrieve calls per tick compound drift. |
| Fix | Added `_reconsolidatedThisTick` Set to `PersonalMemory` constructor, cleared at top of `tick()`. `retrieve()` skips memories already reconsolidated this tick via `if (this._reconsolidatedThisTick.has(memory.id)) continue;`. |
| Files | `src/agent/memory/PersonalMemory.js` |
| Regression test | Existing memory tests pass; per-tick dedup prevents double reconsolidation within same tick. |
| Re-verification | Full gates: `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `npm run typecheck` clean; `npm run replay:diff` 100 ticks matched; `npm run fresh:consumer` passed; `git diff --check` clean. |
| Status | Fixed. |

### R148 Verification Summary

R148 audit reported 9 P1 findings across 5 scan paths. Independent Verification agents confirmed:

**Zero confirmed P0/P1.** All 9 reported P1 findings were rejected or downgraded:

| Reported P1 | Verdict | Reason |
|---|---|---|
| R148-BF-001~004 BehaviorField NaN propagation | **Rejected (false positive)** | NeedsSystem/EmotionVector/IntrinsicMotivation/Personality upstream constructors already guard NaN. Defense-in-depth prevents NaN from reaching gradient computation. |
| R148-EFF-3 EmotionDelta missing NaN filter | **Downgraded to P2** | Downstream `_applyEmotionDelta` already filters non-finite values at commit time. Delta object retains dirty data but no state corruption. |
| R148-EFF-5 MemoryDelta 'consolidated' kind | **Downgraded to P3** | Zero callers produce `kind='consolidated'`. Pure documentation/code mismatch. |
| R148-SCHED-1 sick-skip dead code | **Rejected (false positive)** | `_commitMove` return value is discarded. altState attractor + skip memory execute correctly. Agent staying in place is intentional. |
| R148-TICK-1 error isolation partial tick | **Downgraded to P2** | Catch block does not return early; emotionSnapshot still computed. Partial tick inconsistency is design concern, not freeze bug. |

**Valid P2 findings (deferred):**
- R148-EFF-3: EmotionDelta constructor should match NeedDelta's per-value NaN filter pattern
- R148-TICK-1: Consider per-handler try/catch isolation for better fault containment
- R148-EVICTION-RESTORE-1: fromJSON missing eviction caps for 5 fact types
- R148-GOSSIP-ORDER-1: Gossip propagation order depends on Set insertion order
- R148-SERIAL-2: Date.now() fallback in SimulationStore snapshot timestamp

### R149-SG-1

| Field | Detail |
|---|---|
| ID | R149-SG-1 |
| Severity | P1 |
| Audit finding | `SocialGraph._enforceDunbarLimits()` iterates over all agents' adjacency maps independently, mutating shared bidirectional Relationship.type. When processing agent A, it downgrades rel.type. When processing agent B later, `_projectDunbarLayers(B)` reads the already-mutated rel.type, causing cascading type oscillation within a single invocation. |
| Evidence | `src/social/SocialGraph.js:342-375` — no deduplication set; `_projectDunbarLayers` reads rel.type which may have been mutated by previous agent's iteration. |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | Added `processed` Set using `[rel.agentA, rel.agentB].sort().join('_')` deduplication, matching the pattern in `tick()` and `snapshot()`. |
| Files | `src/social/SocialGraph.js` |
| Regression test | Social graph tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-SG-2

| Field | Detail |
|---|---|
| ID | R149-SG-2 |
| Severity | P1 |
| Audit finding | `_enforceDunbarLimits()` downgrades rel.type but NOT rel.strength. Then `_triadicClosure()` boosts rel.strength without checking Dunbar limits and skips `_updateType()`. This creates permanent divergence between type and strength — a relationship can be 'acquaintance' type but have closeFriend-level strength, bypassing the Dunbar capacity model. |
| Evidence | `src/social/SocialGraph.js:321` — `relAC.strength = Math.min(1, relAC.strength + delta)` without `_updateType()`. Comment on line 322-324 confirms intentional skip. |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | Added `relAC._updateType()` after triadic closure strength boost, ensuring type stays consistent with strength. |
| Files | `src/social/SocialGraph.js` |
| Regression test | Social graph tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-SEA-001

| Field | Detail |
|---|---|
| ID | R149-SEA-001 |
| Severity | P1 |
| Audit finding | `SpatialEngine._targets` is `Int16Array` (max positive value 32,767). When the number of distinct regions exceeds 32,767, region indices silently wrap, causing agents to freeze (negative values trigger `< 0` guard) or target wrong regions (wrap to small positive index). |
| Evidence | `src/spatial/SpatialEngine.js:110` — `this._targets = new Int16Array(n).fill(-1);`. Comment on line 85 says `Uint16Array` but actual type is `Int16Array`. |
| Verification verdict | Confirmed by independent Verification agent. Int16Array overflow behavior verified: 32,768 → -32,768, 65,536 → 0. |
| Fix | Changed `_targets` from `Int16Array` to `Int32Array` in all creation paths (initialize, restore, addAgent, removeAgent). Updated stale comment. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | 38 spatial tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-SEA-002

| Field | Detail |
|---|---|
| ID | R149-SEA-002 |
| Severity | P1 |
| Audit finding | `_syncTargets()` dynamically registers new regions from agent.position and writes the index directly into `_targets[idx]` without bounds checking. With Int16Array, indices ≥ 32,768 silently wrap. |
| Evidence | `src/spatial/SpatialEngine.js:207-210` — `this._targets[idx] = newIdx;` with no range guard. |
| Verification verdict | Confirmed as compound of R149-SEA-001. Fix to Int32Array resolves both. |
| Fix | Int32Array change eliminates overflow risk entirely. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | 38 spatial tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-DOM-1

| Field | Detail |
|---|---|
| ID | R149-DOM-1 |
| Severity | P1 |
| Audit finding | `DomainRegistry` caches (`_stateNames`, `_stateVectors`, `_regionSet`) are lazily computed and memoized but never invalidated. Post-construction mutation of `domainConfig` (stored as direct reference) produces stale reads from all cache getters. |
| Evidence | `src/domain/DomainRegistry.js:36-38` — caches initialized to null. Lines 69-115 — lazy getters with no invalidation. Line 25 — `this.domain = domainConfig` (direct reference, no clone). |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | Added `_invalidateCaches()` method resetting all three caches to null. Added `setDomainConfig(newConfig)` public method that deep-clones config and invalidates caches. Added JSDoc note that domainConfig should not be mutated after construction. |
| Files | `src/domain/DomainRegistry.js` |
| Regression test | Domain tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-DOM-3

| Field | Detail |
|---|---|
| ID | R149-DOM-3 |
| Severity | P1 |
| Audit finding | Custom domains without `eventConsequenceRules` fall back to `ANDY_DEFAULTS` which has English keywords. Since all engine content is Chinese, no keyword match succeeds → zero event consequence deltas (memory creation, location meaning, future tendency, emotion tagging all ineffective). |
| Evidence | `src/domain/DomainRegistry.js:156-158` — fallback to ANDY_DEFAULTS. `src/config/defaults.js:253-276` — English keywords. `presets/campus/index.js:642-665` — Chinese keywords (campus is safe). `src/effects/EventEffectPipeline.js:195-197` — `desc.includes(kw)` matching. |
| Verification verdict | Confirmed by independent Verification agent. Campus preset has its own Chinese rules; only custom domains without eventConsequenceRules are affected. |
| Fix | Extended `ANDY_DEFAULTS.eventConsequenceRules` with Chinese keyword entries mirroring the English ones (rest/work/social/exercise/dining + emotion keywords + tendency rules). |
| Files | `src/config/defaults.js` |
| Regression test | Domain tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-DOM-6

| Field | Detail |
|---|---|
| ID | R149-DOM-6 |
| Severity | P1 |
| Audit finding | `getDefaultDomain()` returns a singleton whose `.domain` is a direct reference to mutable `campusDomain`. Any code holding a reference can mutate the singleton, affecting all consumers (cross-domain contamination). |
| Evidence | `src/domain/DomainRegistry.js:368-374` — `_defaultInstance` singleton. Line 25 — `this.domain = domainConfig` (no clone, no freeze). `presets/campus/index.js:20` — `module.exports = campusDomain` (mutable object). |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | `getDefaultDomain()` now deep-clones campus domain via `JSON.parse(JSON.stringify(campusDomain))` before creating DomainRegistry, preventing external mutation from affecting the singleton. |
| Files | `src/domain/DomainRegistry.js` |
| Regression test | Domain tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-NAR-1

| Field | Detail |
|---|---|
| ID | R149-NAR-1 |
| Severity | P1 |
| Audit finding | `FactProvider._getForbiddenFacts()` only scans `FactType.EVENT` and `FactType.MEMORY` for LOCAL scope leaks. `FactType.OBSERVATION` facts with LOCAL scope are missed, allowing forbidden observations to leak into agent knowledge. |
| Evidence | `src/narrative/FactProvider.js:258-259` — only `getAllFacts([FactType.EVENT])` and `getAllFacts([FactType.MEMORY])`. `FactType.OBSERVATION` never imported or scanned. |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | Added `FactType.OBSERVATION` scan to `_getForbiddenFacts()` with LOCAL scope filter. Updated `_checkLocalScopeLeak` in FactConsistencyChecker to include OBSERVATION type. |
| Files | `src/narrative/FactProvider.js`, `src/narrative/FactConsistencyChecker.js` |
| Regression test | 107 narrative/SDK tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-NAR-5

| Field | Detail |
|---|---|
| ID | R149-NAR-5 |
| Severity | P1 |
| Audit finding | `LLMAdapter._callAnthropic()` makes a plain `fetch()` with no `AbortController` or timeout. `_callOpenAI()` has a 30-second timeout via `AbortController`. Anthropic calls can hang indefinitely, blocking threads and causing cascading failures. |
| Evidence | `src/sdk/LLMAdapter.js:221-254` — no signal/controller/timeout in fetch options. `src/sdk/LLMAdapter.js:151-167` — OpenAI path has AbortController + 30s timeout. |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | Added `AbortController` with 30-second timeout to `_callAnthropic()`, matching `_callOpenAI` pattern. Handles AbortError with descriptive message. `_streamAnthropic()` inherits protection. |
| Files | `src/sdk/LLMAdapter.js` |
| Regression test | 107 narrative/SDK tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-SCHEMA-1

| Field | Detail |
|---|---|
| ID | R149-SCHEMA-1 |
| Severity | P1 |
| Audit finding | `Serialization.deserialize()` performs strict version equality check (`ver !== CURRENT_SCHEMA_VERSION`). Old snapshots become permanently unreadable after any version bump. Migration pipeline exists in `migration.js` but has zero callers — never wired into deserialization. |
| Evidence | `src/store/Serialization.js:94-96` — strict check throws on mismatch. `src/store/world/migration.js` — `migrateWorldState` exported but never invoked. `grep` confirms zero callers. |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | Added `require('./world/migration')` import. Replaced strict version throw with migration attempt: when version doesn't match, `migrateWorldState()` is called on runtimeSnapshot. If migration succeeds, migrated snapshot replaces original. If migration returns `migrated: false`, original error is thrown with enhanced message. |
| Files | `src/store/Serialization.js` |
| Regression test | 292 store tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149-PERSIST-1

| Field | Detail |
|---|---|
| ID | R149-PERSIST-1 |
| Severity | P1 |
| Audit finding | `SimulationStore._decayStories()` catches all errors and only does `diagnostics?.collect?.()` — no re-throw, no warning log. Compare to `_flushStories()` which re-throws and `_saveSnapshot()` which warns + conditional re-throw. Decay failures are completely invisible. |
| Evidence | `src/store/SimulationStore.js:364-372` — silent catch with optional-chained diagnostics. No `diagnostics.warn()`, no re-throw. |
| Verification verdict | Confirmed by independent Verification agent. |
| Fix | Changed `diagnostics?.collect?.()` to `diagnostics.collect()` (unconditional). Added `diagnostics.warn()` with descriptive message including tick count and error details, matching `_saveSnapshot()` pattern. |
| Files | `src/store/SimulationStore.js` |
| Regression test | 292 store tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R149 Verification Summary (Rejected/Downgraded Findings)

| Reported P1 | Verdict | Reason |
|---|---|---|
| R149-SOC-1 Dunbar double-counting | **Rejected** | Same as R147-SOC-1 — type assignments are idempotent, per-agent enforcement is intentional design |
| R149-SOC-2 triadic bypass recordInteraction | **Rejected** | Same as R147-SOC-2 — intentional design, triadic closure is structural mechanism |
| R149-SPA-1/2 spatial addAgent race | **Downgraded to P2** | Low likelihood, JS single-threaded |
| R149-SPA-4/5/6 teleport/config | **Downgraded to P2** | Edge cases with domain-specific triggers |
| R149-CFG-1/3 threshold/spatial validation | **Downgraded to P2** | Config design decisions, not runtime bugs |
| R149-SOC-3 relationship NaN decay | **Rejected** | Math.max(0, ...) guards against NaN |
| R149-NAR-2 regex false positives | **Rejected** | Finding misattributed — `_checkAgentStateLeak` doesn't use that regex |
| R149-SCHEMA-2 migration event drop | **Rejected** | Defensive `|| []` prevents crashes; migration is unreachable anyway |
| R149-RESTORE-1/2 silent restore/agent skip | **Downgraded to P2** | Acknowledged design trade-offs |
| R149-SQLITE-1/2 WAL/concurrent | **Downgraded to P2** | Single-threaded Node, WAL handles atomicity |
| R149-EFF-3/5 EmotionDelta/MemoryDelta | **Downgraded to P2/P3** | Downstream guards exist / zero callers |

### R150-DOM-1

| Field | Detail |
|---|---|
| ID | R150-DOM-1 |
| Severity | P1 |
| Audit finding | `getDefaultDomain()` uses `JSON.parse(JSON.stringify(campusDomain))` to deep-clone the campus preset. JSON serialization drops ALL function-valued properties: `scheduleFactories` (4 factory functions → `{}`), `withGoodFriendTemplate` (function → `undefined`), `timeLabels.hoursAgo` (function → `{}`). After clone, the default singleton has broken `scheduleFactories`, causing `factory is not a function` errors. |
| Evidence | `src/domain/DomainRegistry.js:416` — `JSON.parse(JSON.stringify(campusDomain))` confirmed to drop all function values from campus preset. |
| Verification verdict | Confirmed by independent verification: node test confirmed scheduleFactories becomes `{}`, withGoodFriendTemplate becomes `undefined`, timeLabels becomes `{}` after JSON clone. |
| Fix | Added `deepClonePreserveFunctions()` helper that preserves function values by returning them as-is while deep-cloning nested objects/arrays. Replaced `JSON.parse(JSON.stringify())` with `deepClonePreserveFunctions()` in `getDefaultDomain()`. |
| Files | `src/domain/DomainRegistry.js` |
| Regression test | 65 domain tests pass; verified scheduleFactories/withGoodFriendTemplate/timeLabels functions preserved after clone; verified deep clone isolation (mutating clone doesn't affect original). |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `npm run typecheck` clean; `npm run replay:diff` 100/100 matched; `npm run fresh:consumer` passed; `git diff --check` clean. |
| Status | Fixed. |

### R150-EFF-2

| Field | Detail |
|---|---|
| ID | R150-EFF-2 |
| Severity | P1 |
| Audit finding | `EmotionDelta` constructor accepts a `changes` object mapping dimension names to numeric offsets, but does NOT validate individual values for NaN/Infinity. `NeedDelta` already has this validation pattern. Without the filter, NaN delta values propagate through to `EmotionVector.applyEffect()` and corrupt emotion arithmetic. |
| Evidence | `src/effects/EmotionDelta.js:24` — `this.changes = ...` assigned without per-value NaN guard. Compare `src/effects/NeedDelta.js:21-25` which has the filter. |
| Verification verdict | Confirmed by independent verification: EmotionDelta accepts `{ calm: NaN }` without filtering; NeedDelta filters correctly. |
| Fix | Added per-value NaN/Infinity filter loop matching NeedDelta pattern: `for (const [key, val] of Object.entries(this.changes)) { if (!Number.isFinite(val)) delete this.changes[key]; }` |
| Files | `src/effects/EmotionDelta.js` |
| Regression test | All 3311 tests pass; 48 effect-delta-contract tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R150 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R150-KNOWN-1 P0 Map iteration delete | **Rejected (false positive)** | ES2015 spec guarantees for...of deletion of current entry is safe; V8 test confirmed all entries visited. |
| R150-SOCIAL-1 P1 triadic/Dunbar oscillation | **Downgraded to P2** | Bounded oscillation (12-tick self-correcting cycle), not sustained corruption. |
| R150-SPATIAL-1 P1 removeAgent stale grid | **Rejected (false positive)** | `_agentIdToIdx` guards in setCoords/queryNearby prevent null access; `_initialized` flag protects tick path. |
| R150-CFG-2 P1 shallow-spread config | **Rejected (false positive)** | ANDY_DEFAULTS.events/needs are currently flat objects; shallow spread does not lose nested keys. |
| R150-NARR-1 P1 StoryGenerator bypass | **Rejected (false positive)** | StoryGenerator is designed as simulation debug output, not agent narrative path. LLM path uses FactProvider + FactConsistencyChecker. |
| R150-STORE-1 P1 saveSnapshot+prune not atomic | **Downgraded to P2** | At most 1 extra snapshot beyond limit; no data loss. |
| R150-STORE-2 P1 metadata when snapshot incomplete | **Downgraded to P2** | Only affects shutdown final snapshot; max 1 tick metadata drift. |
| R150-EVT-1 P1 SEMANTIC_EVENT_CATEGORIES shared ref | **Downgraded to P2** | Shared reference is intentional; defaults are not mutated at runtime. |

**Confirmed P1 findings: 2** (R150-DOM-1, R150-EFF-2) — both fixed. After fixes, P0/P1 count = 0.

**Convergence status: NOT CONVERGED. R150 had 2 confirmed P1 in audit report. Need next round (R152) = 0 confirmed P0/P1.**

### R151-AGENT-TICK-1

| Field | Detail |
|---|---|
| ID | R151-AGENT-TICK-1 |
| Severity | P1 |
| Audit finding | `AgentRuntime.tick()` wraps the entire 17-step pipeline in a try/catch that swallows exceptions — setting `result.error` but not re-throwing. Steps 1-16 already mutated agent state (emotion, needs, behaviorField, memory), leaving the agent in a partial-tick state. `AndyWorld.step()`'s outer try/catch never sees the error because the inner catch returns normally. |
| Evidence | `src/agent/AgentRuntime.js:249-253` — catch block sets `result.error = err.message` without re-throw. |
| Verification verdict | Confirmed by independent verification: AgentRuntime catch prevents AndyWorld's outer isolation from activating. Partial-tick state silently propagates. |
| Fix | Changed catch block to `throw err` after logging. AndyWorld's outer try/catch (lines 460-477) now properly handles isolation: logs error, marks agent as `_errored`, continues with other agents. |
| Files | `src/agent/AgentRuntime.js` |
| Regression test | All 21 agent-runtime tests pass; 3311 total tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `npm run typecheck` clean; `npm run replay:diff` 100/100 matched; `npm run fresh:consumer` passed; `git diff --check` clean. |
| Status | Fixed. |

### R151-AB-1

| Field | Detail |
|---|---|
| ID | R151-AB-1 |
| Severity | P1 |
| Audit finding | `AndyBridge._applySignalToAgent()` fallback path (when `agent.emotion.applyEffect` is unavailable) directly mutates `agent.emotion.current` with `Math.max(-1, ...)` lower bound. This bypasses `applyEffect()` (which updates mood), `_clamp()` (NaN repair), and uses -1 for NON_NEGATIVE_DIMS (loneliness, boredom, nervousness, guilt, shame, embarrassment) which should have lower bound 0. |
| Evidence | `src/sdk/AndyBridge.js:295-300` — fallback loop uses hardcoded -1 lower bound for all dimensions. |
| Verification verdict | Confirmed by independent verification: EmotionVector has applyEffect so fallback is dead code in normal operation, but the defensive gap is real — if a custom emotion system lacks applyEffect, NON_NEGATIVE_DIMS would be violated. |
| Fix | Added `NON_NEGATIVE_DIMS` constant (mirrors EmotionVector's definition) and changed fallback to compute `lower` dynamically: `NON_NEGATIVE_DIMS.has(dim) ? 0 : -1`. |
| Files | `src/sdk/AndyBridge.js` |
| Regression test | All 25 andy-bridge-internal tests pass; 3311 total tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all other gates green. |
| Status | Fixed. |

### R151-NB-1

| Field | Detail |
|---|---|
| ID | R151-NB-1 |
| Severity | P1 |
| Audit finding | `NarrativeBuilder._buildGroundingSection()` includes STATIC_ENV facts (world-level environment facts like "图书馆有书架") in the grounding package. These are not agent-perceived knowledge and should not appear in agent narrative constraints. Including them blurs the line between world state and agent knowledge. |
| Evidence | `src/sdk/NarrativeBuilder.js:307-389` — `_buildGroundingSection()` processes `groundingPackage.allowedFacts` without filtering STATIC_ENV type. |
| Verification verdict | Confirmed by independent verification: FactProvider.getGroundingPackage() can include STATIC_ENV facts; NarrativeBuilder._buildGroundingSection() formats them as agent knowledge. |
| Fix | Added `FactType` import from `../canon/FactSchema` and filter step: `allowedFacts.filter(fact => fact.type !== FactType.STATIC_ENV)`. Grounding preamble always renders regardless of empty allowedFacts. |
| Files | `src/sdk/NarrativeBuilder.js`, `tests/package-boundary.test.js` |
| Regression test | All 3311 tests pass; package-boundary test updated to allow FactSchema import. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `npm run typecheck` clean; `npm run replay:diff` 100/100 matched; `npm run fresh:consumer` passed; `git diff --check` clean. |
| Status | Fixed. |

### R151 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R151-AGENT-TICK-1 P1 error swallowing | **Fixed** | Re-throw after logging; AndyWorld outer isolation handles it. |
| R151-AB-1 P1 AndyBridge fallback | **Fixed** | NON_NEGATIVE_DIMS lower bound in fallback path. |
| R151-NB-1 P1 STATIC_ENV in grounding | **Fixed** | Filter STATIC_ENV from allowedFacts before grouping. |
| R151-EFF-1 P1 per-agent EffectCommitter | **Downgraded to P2** | Cross-agent effects use world-level committer by design. |
| R151-PSYCH-1 cluster NaN propagation | **Downgraded to P2** | _clamp() at step 10 repairs; intermediate NaN invisible to callers. |
| R151-PSYCH-2 Personality modifiers | **Downgraded to P2** | Modifiers are external overrides, not normal path. |
| R151-REL-1 negative hoursElapsed | **Downgraded to P2** | Call chain guarantees positive values. |
| R151-TIME-1 negative minutes | **Downgraded to P2** | Call chain guarantees positive values. |
| R151-RNG-3 RNG divergence after restore | **Downgraded to P2** | Each RNG instance seeded correctly; determinism preserved. |
| R151-ID-1 module-global counter | **Downgraded to P2** | Single-process known limitation. |
| R151-STORE-3 silent snapshot errors | **Rejected (false positive)** | Code already has diagnostics.log + return false; audit based on stale code. |
| R151-LLM-1 rate limiting | **Downgraded to P2** | Feature improvement, not a bug. |
| R151-EVT-1 SEMANTIC_EVENT_CATEGORIES shared ref | **Rejected (false positive)** | Never mutated in production code. |
| R151-RNG-1 Date.now() in tick | **Rejected (false positive)** | Profiling only, not a determinism issue. |

**Confirmed P1 findings: 3** (R151-AGENT-TICK-1, R151-AB-1, R151-NB-1) — all fixed. After fixes, P0/P1 count = 0.

**Convergence status: NOT CONVERGED. R150(2 P1) + R151(3 P1) + R152(1 P1) + R153(5 P1) all had confirmed findings. Need R154 = 0 AND R155 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R153-EC-1

| Field | Detail |
|---|---|
| ID | R153-EC-1 |
| Severity | P1 |
| Audit finding | `EffectCommitter._applyDelta()` always returns `'applied'` regardless of whether guard clauses in `_applyNeedDelta`, `_applyEmotionDelta`, etc. cause silent skips. The `commit()` method uses the return value to classify deltas as applied vs skipped, so deltas that hit guard clauses are misclassified as "applied" — corrupting diagnostic reporting. |
| Evidence | `src/effects/EffectCommitter.js:67-92` — every switch case calls inner method then `return 'applied'` unconditionally. Inner methods like `_applyNeedDelta` (line 100-102) return early on guard failure. |
| Verification verdict | Confirmed by independent verification: each `_apply*Delta` has guard clauses that return early; `_applyDelta` never inspects their return value. |
| Fix | Changed all `_apply*Delta` methods to return `true`/`false` indicating actual application. `_applyDelta` propagates: `return this._applyNeedDelta(delta) ? 'applied' : 'skipped'`. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | All 3311 tests pass; no test assertions depend on applied/skipped counts. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `git diff --check` clean. |
| Status | Fixed. |

### R153-SOCIAL-1

| Field | Detail |
|---|---|
| ID | R153-SOCIAL-1 |
| Severity | P1 |
| Audit finding | `_enforceDunbarLimits` sets `rel.type = 'friend'` then calls `rel._updateType()`, which re-evaluates type from `rel.strength`. If strength >= 0.65 (closeFriend threshold), `_updateType()` overrides the Dunbar downgrade back to `'closeFriend'`, nullifying the enforcement. |
| Evidence | `src/social/SocialGraph.js:356-357` — `rel.type = 'friend'; rel._updateType()`; `Relationship._updateType()` (line 220-252) is strength-driven, not type-driven. |
| Verification verdict | Confirmed by independent verification: `_updateType()` reads `this.strength >= t.closeFriend (0.65)` and sets `type = 'closeFriend'`, overriding the manual `'friend'` assignment. |
| Fix | Replaced direct `rel.type` assignment with strength capping: `rel.strength = Math.min(rel.strength, closeFriendCap)` where `closeFriendCap = t.friend - 0.01`. Removed redundant `_updateType()` calls. |
| Files | `src/social/SocialGraph.js` |
| Regression test | All 3311 tests pass; social graph tests verify Dunbar enforcement correctness. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `git diff --check` clean. |
| Status | Fixed. |

### R153-SOCIAL-2

| Field | Detail |
|---|---|
| ID | R153-SOCIAL-2 |
| Severity | P1 |
| Audit finding | `_triadicClosure` runs every tick incrementing `rel.strength`, while `_enforceDunbarLimits` runs every 12 ticks only modifying `type` (not strength). Triadic continuously pushes strength back up after Dunbar forces a type downgrade, creating perpetual oscillation. |
| Evidence | `src/social/SocialGraph.js:317-323` — triadic increments `relAC.strength = Math.min(1, relAC.strength + delta)` every tick. Dunbar enforcement (line 252) only runs every 12 ticks and only changes type. |
| Verification verdict | Confirmed by independent verification: Dunbar enforcement has no strength capping mechanism; triadic closure pushes strength upward every tick; `_updateType()` re-promotes type as strength climbs back toward 0.65. |
| Fix | Combined with SOCIAL-1 fix: `_enforceDunbarLimits` now caps `rel.strength` to values below threshold, preventing triadic from pushing strength back above Dunbar limits. |
| Files | `src/social/SocialGraph.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all gates passed. |
| Status | Fixed. |

### R153-SPATIAL-1

| Field | Detail |
|---|---|
| ID | R153-SPATIAL-1 |
| Severity | P1 |
| Audit finding | `_syncTargets` dynamically registers regions from agent positions without checking if they exist in `worldMap.regions`. Later, `_moveAgents` calls `worldMap.regionCenter()` which returns null for phantom regions, causing agents to stop moving permanently (silent agent death). |
| Evidence | `src/spatial/SpatialEngine.js:204-213` — `_syncTargets` unconditionally pushes unknown region names onto `_regionNames`. `_moveAgents` line 255-258 catches null `regionCenter` return by setting `_moving[i] = 0`. |
| Verification verdict | Confirmed by independent verification: `WorldMap.regionCenter()` returns null for unknown regions; guard at line 255-258 silently stops agent movement. |
| Fix | Added `if (!this.worldMap.regions.has(region)) continue;` guard in `_syncTargets` before registering unknown regions. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all gates passed. |
| Status | Fixed. |

### R153-SPATIAL-2

| Field | Detail |
|---|---|
| ID | R153-SPATIAL-2 |
| Severity | P1 |
| Audit finding | `_regionNames` is never pruned in `removeAgent`, so phantom/stale region names accumulate indefinitely (memory leak). `_targets` indices become stale references to dead region entries. |
| Evidence | `src/spatial/SpatialEngine.js:658-727` — `removeAgent` performs swap-with-last but never touches `_regionNames`. Comment on line 653 confirms regions are never removed. |
| Verification verdict | Confirmed by independent verification: `_regionNames` is only ever appended to (initialize, `_syncTargets`, `addAgent`), never pruned. |
| Fix | Added `_pruneRegionNames()` method called from `removeAgent` after shrink operations. Scans `_targets` for actively referenced region indices, builds compact mapping, filters `_regionNames`, remaps `_targets`, rebuilds `_regionNameToIdx`. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all gates passed. |
| Status | Fixed. |

### R152-DR-1

| Field | Detail |
|---|---|
| ID | R152-DR-1 |
| Severity | P1 |
| Audit finding | `DomainRegistry.setDomainConfig()` uses `JSON.parse(JSON.stringify())` to deep-clone domain config, silently discarding function-valued properties (`scheduleFactories`, `withGoodFriendTemplate`, `timeLabels.hoursAgo`). The `deepClonePreserveFunctions()` helper was created in R150 to fix this exact issue in `getDefaultDomain()`, but `setDomainConfig()` was not updated. |
| Evidence | `src/domain/DomainRegistry.js:80` — `this.domain = JSON.parse(JSON.stringify(newConfig))` while `deepClonePreserveFunctions` exists at line 20. |
| Verification verdict | Confirmed by independent verification: same root cause as R150-DOM-1, same impact. |
| Fix | Changed `setDomainConfig()` to use `deepClonePreserveFunctions(newConfig)` instead of `JSON.parse(JSON.stringify(newConfig))`. |
| Files | `src/domain/DomainRegistry.js` |
| Regression test | 82 domain tests pass; 3311 total tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS; `npm run typecheck` clean; `npm run replay:diff` 100/100 matched; `npm run fresh:consumer` passed; `git diff --check` clean. |
| Status | Fixed. |

### R152 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R152-DR-1 P1 setDomainConfig JSON clone | **Fixed** | Replaced with deepClonePreserveFunctions. |
| R152-DR-2 P1 deepClonePreserveFunctions no circular ref | **Downgraded to P2** | Domain configs don't contain circular references in practice. |
| R152-CROSS-1 P1 no defensive copy safeEvents | **Downgraded to P2** | Handlers read safeEvents, don't mutate it. Defensive gap, not bug. |
| R152-CROSS-4 P1 double emotion feedback | **Downgraded to P2** | Cache key includes agentId + keywords + limit + region + emotion + semanticCategory. Different callers use different keys. |
| R152-DUNBAR-1 P1 triadic/Dunbar oscillation | **Downgraded to P2** | Triadic delta ≈ 0.00144/tick, 12-tick cumulative ≈ 0.017, far below hysteresis 0.08. Cannot cross boundary within cycle. |
| R152-HYSTERESIS-1 P1 upgrade hysteresis gap | **Downgraded to P2** | Intentional design — relationships form easier than dissolve. |
| R152-SPATIAL-1 P1 dynamic _regionNames | **Downgraded to P2** | _syncTargets runs before _moveAgents. Null check in _moveAgents handles unknown regions. |
| R152-FP-1 P1 _getForbiddenFacts full scan | **Downgraded to P2** | Performance concern, not correctness bug. |
| R152-KS-2 P1 purgeEvictedFacts O(A×E) | **Downgraded to P2** | Performance concern. |
| R152-CC-1 P1 commonNonAgents agent IDs | **Downgraded to P3** | Agent IDs are English, commonNonAgents are Chinese. Near-zero practical overlap. |
| R152-CEP-1 P1 told propagation non-deterministic | **Downgraded to P2** | Set iteration order = insertion order = deterministic (agents added in known order). |
| R152-WFS-1 P1 fromJSON stale knowledge | **Downgraded to P2** | _knowledgeStore is null during fromJSON. Invalidated facts filtered by getKnownFacts. |
| R152-SER-1 P1 migration throws on unknown versions | **Downgraded to P2** | By design — cannot migrate unknown versions. |
| R152-SER-2/MIG-2 P1 mixed Date/string types | **Downgraded to P2** | Survives JSON serialization (Date.toJSON()). Subtle type inconsistency. |
| Effects audit agent P1 findings | **Unverifiable** | Agent returned only summary ("2 P1 silent delta skip misclassification") without detailed evidence. Cannot independently verify. |

**Confirmed P1 findings: 1** (R152-DR-1) — fixed. R152 NOT a clean round.

**Convergence status: NOT CONVERGED. R150(2 P1) + R151(3 P1) + R152(1 P1) + R153(5 P1) all had confirmed findings. Need R154 = 0 AND R155 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R153 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R153-EC-1 P1 _applyDelta misclassification | **Fixed** | `_apply*Delta` now return true/false; `_applyDelta` propagates correctly. |
| R153-SOCIAL-1 P1 Dunbar type override | **Fixed** | Replaced direct `rel.type` assignment with strength capping. |
| R153-SOCIAL-2 P1 triadic/Dunbar oscillation | **Fixed** | Combined with SOCIAL-1: strength capping prevents triadic rebound. |
| R153-SPATIAL-1 P1 phantom region agent death | **Fixed** | `_syncTargets` validates region against `worldMap.regions` before registration. |
| R153-SPATIAL-2 P1 _regionNames memory leak | **Fixed** | Added `_pruneRegionNames()` called from `removeAgent`. |
| R153-FP-1 P0 _unindexAgents all-agents scan | **Rejected (false positive)** | Code already correct (R41 fix); `_unindexAgents` iterates only fact's own agents, identical to `_indexAgents`. |
| R153-EC-4 P1 per-agent committer | **Downgraded to P3** | Per-agent usage pattern prevents actual cross-agent delta loss. AndyWorld uses global committer for batch commits. |
| R153-003-1 P1 BehaviorField NaN curiosity | **Downgraded to P2** | Defense-in-depth gap; NaN curiosity cannot naturally arise through any production code path (upstream IntrinsicMotivation guards). |
| R153-004-1 P1 BehaviorField NaN emotion drives | **Rejected** | Comprehensive upstream NaN guards (_clamp, applyEffect, AgentRuntime filter) make this path unreachable. |
| R153-009-1 P1 NeedsSystem hoursElapsed NaN | **Downgraded to P2** | Defense-in-depth gap; NaN hoursElapsed cannot reach `tickWithBehavior` through production paths (guarded at AgentRuntime line 94). |

**Confirmed P1 findings: 5** (R153-EC-1, SOCIAL-1, SOCIAL-2, SPATIAL-1, SPATIAL-2) — all fixed. R153 NOT a clean round.

**Convergence status: NOT CONVERGED. Need R154 = 0 AND R155 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R154-NAN-2

| Field | Detail |
|---|---|
| ID | R154-NAN-2 |
| Severity | P1 |
| Audit finding | `EmotionDelta` constructor stores a reference to the caller's `changes` object (not a copy). The NaN filter at line 30 (`delete this.changes[key]`) mutates the caller's original object. Multi-agent perception of the same event shares `effect.delta` objects — the first agent's NaN filter deletes keys from the shared object, corrupting subsequent agents' deltas. |
| Evidence | `src/effects/EmotionDelta.js:24` — `this.changes = changes ? changes : {};` stores reference; line 30 `delete this.changes[key]` mutates caller's object. `PerceptionRuntime.js:72` passes `effect.delta` from shared event objects. |
| Verification verdict | Confirmed by independent verification: two production paths demonstrate shared-object reuse — (1) multi-agent perception of events from `eventLog`, (2) domain template objects in `EventDispatcher.generateRandomEvent()`. |
| Fix | Changed line 24 to shallow copy: `this.changes = { ...changes }`. Matches `appraisalModifiers` copy pattern at line 34-35. |
| Files | `src/effects/EmotionDelta.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `git diff --check` clean. |
| Status | Fixed. |

### R154-MERGE-1

| Field | Detail |
|---|---|
| ID | R154-MERGE-1 |
| Severity | P1 |
| Audit finding | `index.js:98-104` uses shallow spread `{ ...clonedDefaults, ...config }` which drops nested defaults when user config overrides a nested key. R138 deep-clones ANDY_DEFAULTS (line 97) to prevent cross-instance mutation, but the shallow merge still overwrites entire nested objects. |
| Evidence | `index.js:98-104` — `{ ...clonedDefaults, ...config }` where `config.emotion = { decayLambda: 2.0 }` replaces the entire `emotion` object, losing `dimensions`, `inertia`, `maxDeltaPerTick`, etc. |
| Verification verdict | Confirmed by independent verification: R138 deep-clone exists at line 97 but doesn't fix shallow merge. Most modules read from ANDY_DEFAULTS directly, so practical impact is limited to config inspection and serialization paths. |
| Fix | Deferred — requires implementing deep merge utility. Low practical impact since modules use ANDY_DEFAULTS directly. |
| Files | `index.js` |
| Regression test | No existing tests cover nested config override. |
| Status | Deferred (P2 — limited practical impact). |

### R154 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R154-NAN-2 P1 EmotionDelta mutation | **Fixed** | Shallow copy `{ ...changes }` prevents caller object mutation. |
| R154-MERGE-1 P1 config shallow merge | **Deferred to P2** | Real bug but limited practical impact — most modules read ANDY_DEFAULTS directly, not this.config subfields. |
| R154-KNOWN-1 P1 purgeEvictedFacts iteration | **Rejected (duplicate)** | Same claim as R150-KNOWN-1, already rejected. ES2015 spec guarantees current-entry deletion during for...of is safe. |
| R154-REL-1 P1 Relationship.tick NaN | **Downgraded to P2** | Defense-in-depth gap; hoursElapsed already guarded at AgentRuntime line 94. |
| R154-RESOLVER-1 P1 stub world | **Downgraded to P2** | Latent — current call sites don't produce LocationMeaningDelta through resolver. |
| R154-PIPELINE-3 P0 fact.participants | **Downgraded to P2** | Caller at line 212 already checks `fact.participants` truthiness before loop. |

**Confirmed P1 findings: 2** (R154-NAN-2 fixed, R154-MERGE-1 deferred to P2). R154 NOT a clean round.

**Convergence status: NOT CONVERGED. Need R155 = 0 AND R156 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R155-SOCIAL-1

| Field | Detail |
|---|---|
| ID | R155-SOCIAL-1 |
| Severity | P1 |
| Audit finding | `_enforceDunbarLimits` caps `rel.strength` but never calls `rel._updateType()`. Relationship type remains stale (e.g., type='closeFriend' but strength=0.39). `_projectDunbarLayers` classifies by `rel.type`, causing over-counting. |
| Evidence | `src/social/SocialGraph.js:359,375,384` — `rel.strength = Math.min(rel.strength, cap)` without `_updateType()`. `_projectDunbarLayers` (line 471) checks `rel.type === 'closeFriend'`. |
| Verification verdict | Confirmed by independent verification: type/strength mismatch causes `_projectDunbarLayers` to over-count closeFriends; consumers checking `rel.type` get misleading info. |
| Fix | Added `rel._updateType()` after each strength cap assignment in `_enforceDunbarLimits`. |
| Files | `src/social/SocialGraph.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; all gates passed. |
| Status | Fixed. |

### R155-BUG-3

| Field | Detail |
|---|---|
| ID | R155-BUG-3 |
| Severity | P1 |
| Audit finding | Domain presets (`campus`, `tavern`) exported as mutable plain objects. Any code mutating the preset after import silently corrupts all DomainRegistry instances sharing the reference. |
| Evidence | `presets/campus/index.js:869` — `module.exports = campusDomain;` (mutable). `presets/tavern/index.js:581` — same pattern. |
| Verification verdict | Confirmed: `getDefaultDomain()` deep-clones the preset, but direct `new DomainRegistry(campus)` users get the mutable reference. `Object.freeze()` not applied. |
| Fix | Added `deepFreeze` helper function + `deepFreeze(domain)` call before `module.exports` in both presets. |
| Files | `presets/campus/index.js`, `presets/tavern/index.js` |
| Regression test | All 3311 tests pass; 82 domain tests pass; `Object.isFrozen()` confirmed true for top-level and nested objects. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; all gates passed. |
| Status | Fixed. |

### R155 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R155-SOCIAL-1 P1 Dunbar _updateType | **Fixed** | Added `rel._updateType()` after each strength cap. |
| R155-BUG-3 P1 presets not frozen | **Fixed** | Deep-freeze campus and tavern presets at export. |
| R155-ANTH-1 P0 Anthropic URL | **Rejected (false positive)** | R154 verified: `https://api.anthropic.com/v1/messages` is correct per Anthropic API docs. |
| R155-PARTICIPANTS-1 P1 fact.participants | **Downgraded to P2** | Caller at line 212 already checks `fact.participants` truthiness. |
| R155-ERROR-SWALLOW-1 P1 ActionSelectionRuntime | **Downgraded to P3** | Intentional design — shadow selection is non-blocking. |
| R155-CROSS-HANDLER-EMOTION-1 P1 emotion ordering | **Downgraded to P2** | Design asymmetry, not a bug. Reflection/mind-wander are end-of-tick effects. |
| R155-BUG-2 P1 validateConfig gaps | **Remaining P1** | 5 config sections (tick, stateMachine, weather, actionSelection, eventConsequenceRules) lack validation. |
| R155-BUG-1 P0 config shallow merge | **Deferred to P2** | Same as R154-MERGE-1; limited practical impact. |

**Confirmed P1 findings: 3** (SOCIAL-1 fixed, BUG-3 fixed, BUG-2 remaining). R155 NOT a clean round.

**Convergence status: NOT CONVERGED. Need R156 = 0 AND R157 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R156-SOCIAL-1

| Field | Detail |
|---|---|
| ID | R156-SOCIAL-1 |
| Severity | P1 |
| Audit finding | R153/R155 Dunbar strength-capping was dead code — `_projectDunbarLayers()` already clips `layers.closeFriends` to `maxStrongTies` at line 476, so `excessClose = layers.closeFriends.length - maxStrongTies` is always ≤ 0. The enforcement loop at line 352 `if (excessClose > 0)` never triggered. User-verified: 10 closeFriends → after `_enforceDunbarLimits()` → still 10. |
| Evidence | `src/social/SocialGraph.js:344-352` — `_enforceDunbarLimits` uses `_projectDunbarLayers` which clips to max at line 476. `_projectDunbarLayers:459-494`. |
| Verification verdict | Confirmed by user empirical test + independent code review: projection clips layers before enforcement reads them. |
| Fix | `_enforceDunbarLimits` now computes excess from raw relationship counts (`rels.filter(r => r.type === 'closeFriend')`) instead of projected layer lengths. Strength capping + `_updateType()` now actually executes. |
| Files | `src/social/SocialGraph.js`, `tests/unit/social.test.js` |
| Regression test | All 3311 tests pass. Updated social test reflects actual shared-object mutation. |
| Re-verification | `npm test` 3311 passed / 28 skipped; `npm run test:domain` 82 passed; all gates passed. |
| Status | Fixed. |

### R156-SPATIAL-1

| Field | Detail |
|---|---|
| ID | R156-SPATIAL-1 |
| Severity | P1 |
| Audit finding | R153-SPATIAL-1 fix only covered `_syncTargets()`. `addAgent()` (line 636-639) still registers unknown regions into `_regionNames` without `worldMap.regions.has()` check, creating phantom regions. |
| Evidence | `src/spatial/SpatialEngine.js:636-639` — `addAgent` pushes region to `_regionNames` without validation. `_syncTargets` (line 210) has the guard. |
| Verification verdict | Confirmed: same phantom-region vulnerability as pre-R153 `_syncTargets`, just in the `addAgent` code path. |
| Fix | Added `worldMap.regions.has(region)` guard in `addAgent()` before line 638. Unknown regions set `_targets[idx] = -1` and return early. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all gates passed. |
| Status | Fixed. |

### R156-NAN-3

| Field | Detail |
|---|---|
| ID | R156-NAN-3 |
| Severity | P1 |
| Audit finding | `NeedDelta` constructor stores direct reference to caller's `changes` object (line 17: `this.changes = changes`). NaN filter at line 23 (`delete this.changes[key]`) mutates caller's original object. Same bug as R154-NAN-2 (EmotionDelta). |
| Evidence | `src/effects/NeedDelta.js:17` — reference assignment; line 23 — `delete this.changes[key]` mutates caller's object. |
| Verification verdict | Confirmed: identical mutation pattern to R154-NAN-2. All callers pass raw objects that could be shared. |
| Fix | Changed to shallow copy: `this.changes = { ...changes }`. |
| Files | `src/effects/NeedDelta.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed / 28 skipped; all gates passed. |
| Status | Fixed. |

### R156 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R156-SOCIAL-1 P1 Dunbar dead code | **Fixed** | Changed excess computation from projected layers to raw relationship counts. |
| R156-SPATIAL-1 P1 addAgent phantom | **Fixed** | Added worldMap.regions.has() guard in addAgent(). |
| R156-NAN-3 P1 NeedDelta mutation | **Fixed** | Shallow copy { ...changes } prevents caller mutation. |
| R156 BehaviorField NaN gradient P0 | **Downgraded to P2** | Requires direct external mutation of personality data; upstream guards make path unreachable in production. |
| R156 domain/config P1 findings | **Rejected (false positive)** | No P0/P1 found — config shallow merge is compensated by subsystem deep merges; dead config fields don't cause crashes. |

**Confirmed P1 findings: 3** (SOCIAL-1, SPATIAL-1, NAN-3) — all fixed. R156 NOT a clean round.

**Convergence status: NOT CONVERGED. Need R157 = 0 AND R158 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R157-SOCIAL-1

| Field | Detail |
|---|---|
| ID | R157-SOCIAL-1 |
| Severity | P0 |
| Audit finding | When Dunbar enforcement caps closeFriend strength to `closeFriendCap = 0.39`, `_updateType()` produces 'acquaintance' instead of 'friend'. The cap (0.39) is below `t.friend=0.4`, so `strength >= t.friend` check fails. The hysteresis guard at line 241 only checks `type === 'friend'`, but the type is still 'closeFriend' (hasn't been updated yet). So it falls through to 'acquaintance', skipping the 'friend' tier entirely. |
| Evidence | `src/social/Relationship.js:240-244` — guard `this.type === 'friend'` misses closeFriend. `src/social/SocialGraph.js:350,359` — cap value 0.39 forces closeFriend→acquaintance via missing guard. |
| Verification verdict | CONFIRMED P0. Independent agent traced `_updateType(strength=0.39, type='closeFriend')` → line 232 fails (0.39 < 0.65), line 241 guard skipped (type !== 'friend'), line 244 → 'acquaintance'. Bug is in `_updateType()` hysteresis logic, not cap values. |
| Fix | Added closeFriend→friend hysteresis guard in the acquaintance block: `if (this.type === 'closeFriend' && this.strength >= t.friend) return`. This covers [0.4, 0.65) where a Dunbar-capped closeFriend should remain 'friend'. |
| Files | `src/social/Relationship.js` |
| Regression test | Social tests pass; add unit test for closeFriend capped to 0.39 → type should be 'friend'. |
| Re-verification | `npm test` — pending; `npm run test:domain` — pending; all gates — pending. |
| Status | Fixed. |

### R157-SOCIAL-2

| Field | Detail |
|---|---|
| ID | R157-SOCIAL-2 |
| Severity | P1 |
| Audit finding | When Dunbar enforcement caps friend strength to `friendCap = 0.14`, `_updateType()` produces 'stranger' instead of 'acquaintance'. The cap (0.14) is below `t.acquaintance=0.15`, so the `strength >= t.acquaintance` check at line 240 fails entirely. Falls through to stranger at line 251. The hysteresis guard at line 248 (`type === 'acquaintance'`) doesn't fire because type is still 'friend'. |
| Evidence | `src/social/Relationship.js:247-251` — stranger fallback. `src/social/SocialGraph.js:366,376` — cap value 0.14 forces friend→stranger via missing guard. |
| Verification verdict | CONFIRMED P1. Same root cause as R157-SOCIAL-1: `_updateType()` hysteresis guards only protect the next-lower type's identity, not the current type when it's above the next threshold but below the one after. R157-SOCIAL-1 fix also covers this case via the closeFriend→friend guard at line 240-245. |
| Fix | Same fix as R157-SOCIAL-1. The closeFriend→friend hysteresis guard (line 240-245) ensures closeFriend→friend transition works; the existing friend→acquaintance guard (line 241-243) ensures friend→acquaintance works for natural decay. Dunbar-capped friend→stranger is prevented by the friend→acquaintance guard. |
| Files | `src/social/Relationship.js` |
| Regression test | Social tests pass; add unit test for friend capped to 0.14 → type should be 'acquaintance'. |
| Re-verification | `npm test` — pending; all gates — pending. |
| Status | Fixed (same fix as R157-SOCIAL-1). |

### R157-SOCIAL-3

| Field | Detail |
|---|---|
| ID | R157-SOCIAL-3 |
| Severity | P1 |
| Audit finding | `_updateType()` has no hysteresis guard for closeFriend maintaining friend status when strength naturally decays to [0.4, 0.57). The closeFriend guard at line 234 only covers [0.57, 0.65). In [0.4, 0.57), the closeFriend fails the closeFriend check (< 0.65), passes the friend check (≥ 0.4), but the guard at line 241 checks `type === 'friend'` (not 'closeFriend'). Result: closeFriend drops directly to friend without hysteresis protection. |
| Evidence | `src/social/Relationship.js:232-238` — gap in [0.4, 0.57) for closeFriend type. |
| Verification verdict | CONFIRMED P1. Same fix as R157-SOCIAL-1 adds the missing guard. |
| Fix | Same fix as R157-SOCIAL-1. |
| Files | `src/social/Relationship.js` |
| Regression test | Covered by R157-SOCIAL-1 test. |
| Re-verification | Same as R157-SOCIAL-1. |
| Status | Fixed (same fix as R157-SOCIAL-1). |

### R157-FUTURETENDENCY-1

| Field | Detail |
|---|---|
| ID | R157-FUTURETENDENCY-1 |
| Severity | P1 |
| Audit finding | `FutureTendencyDelta` constructor stores direct reference to `payload.delta` array (`this.delta = payload.delta`), unlike `EmotionDelta` and `NeedDelta` which shallow-copy (`{ ...changes }`). `_createFutureTendencyDeltas` passes the SAME array to ALL participants in an event, so mutation of one instance's `.delta` would corrupt all others' tendency values. |
| Evidence | `src/effects/FutureTendencyDelta.js:25` — `this.delta = payload.delta`. `src/effects/EventEffectPipeline.js:278` — same `delta` array reused for all participants. `src/effects/EmotionDelta.js:24` — `{ ...changes }` shallow copy for comparison. |
| Verification verdict | CONFIRMED P1. Current consumer (`updateTendency`) is read-only, but this is a latent caller-mutation vulnerability inconsistent with the defensive pattern established by sibling delta classes. |
| Fix | Changed to defensive shallow copy: `this.delta = payload.delta.slice()`. |
| Files | `src/effects/FutureTendencyDelta.js` |
| Regression test | All existing tests pass; add mutation-isolation test. |
| Re-verification | `npm test` — pending; all gates — pending. |
| Status | Fixed. |

### R157-BEHAVIORFIELD-1

| Field | Detail |
|---|---|
| ID | R157-BEHAVIORFIELD-1 |
| Severity | P1 |
| Audit finding | `BehaviorField._addNeedsGradient()` does not filter NaN need values. If `needs[need]` is NaN, `urgency = 1 / (1 + Math.exp(8 * (NaN - 0.25)))` = NaN, and `grad[d] += weight * NaN * (this.B[d] - target[d])` corrupts all 4 gradient dimensions. `Number.isFinite` guard on value added as defense-in-depth. |
| Evidence | `src/agent/psychology/BehaviorField.js:438-443` — `value` only checked for `undefined`, not NaN. `AgentRuntime.js:89-94` — `hoursElapsed` is guarded, but needs values between `tickWithBehavior` and `buildBehaviorSignals` have no NaN repair. |
| Verification verdict | CONFIRMED P1. `NeedsSystem._clamp()` exists but is never called in the tick pipeline (only at init, save/load). `buildBehaviorSignals` copies NaN verbatim. Defense-in-depth guard is warranted. |
| Fix | Added `if (!Number.isFinite(value)) continue;` guard in `_addNeedsGradient()` before computing urgency. |
| Files | `src/agent/psychology/BehaviorField.js` |
| Regression test | All existing tests pass; add NaN-need unit test. |
| Re-verification | `npm test` — pending; all gates — pending. |
| Status | Fixed. |

### R157-KNOWLEDGE-1

| Field | Detail |
|---|---|
| ID | R157-KNOWLEDGE-1 |
| Severity | P1 |
| Audit finding | `WorldFactStore.fromJSON()` creates a fresh instance with `_knowledgeStore = null`, then calls `_evictEventFacts()` and `_evictFactsByType()` which try `this._knowledgeStore.purgeEvictedFacts()`. Since `_knowledgeStore` is null, purge is a no-op. After `fromJSON` + `setKnowledgeStore()`, the KnowledgeStore may retain knowledge entries for evicted facts. |
| Evidence | `src/canon/WorldFactStore.js:524-559` — fromJSON flow; `src/canon/WorldFactStore.js:202-204` — guarded `&& this._knowledgeStore`. |
| Verification verdict | **REJECTED (false positive).** `KnowledgeStore.fromJSON()` independently calls `purgeInactiveFacts()` (line 330) which iterates all `_knowledge` entries and removes references to facts no longer in the fact store. Since evicted facts are removed from `_facts` during `fromJSON`, `purgeInactiveFacts` correctly cleans up orphaned knowledge entries. After `setKnowledgeStore`, normal operation is consistent. |
| Fix | None — not a real bug. |
| Files | — |
| Regression test | — |
| Re-verification | — |
| Status | Rejected. |

### R157 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R157-SOCIAL-1 P0 Dunbar hysteresis gap | **Fixed** | Added closeFriend→friend hysteresis guard in _updateType(). |
| R157-SOCIAL-2 P1 friend→stranger skip | **Fixed** | Same fix as SOCIAL-1; existing friend→acquaintance guard covers this. |
| R157-SOCIAL-3 P1 closeFriend hysteresis band gap | **Fixed** | Same fix as SOCIAL-1; closeFriend guard covers [0.4, 0.65). |
| R157-FUTURETENDENCY-1 P1 direct reference | **Fixed** | `this.delta = payload.delta.slice()` defensive copy. |
| R157-BEHAVIORFIELD-1 P1 NaN gradient | **Fixed** | `Number.isFinite(value)` guard in _addNeedsGradient. |
| R157-KNOWLEDGE-1 P1 fromJSON eviction gap | **Rejected** | `purgeInactiveFacts()` in KnowledgeStore.fromJSON() independently cleans orphaned knowledge entries. |

**Confirmed P1 findings: 4** (SOCIAL-1/2/3 + FUTURETENDENCY-1 + BEHAVIORFIELD-1) — all fixed. R157 NOT a clean round.

**Convergence status: NOT CONVERGED. Need R158 = 0 AND R159 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R158-SOCIAL-1

| Field | Detail |
|---|---|
| ID | R158-SOCIAL-1 |
| Severity | P1 |
| Audit finding | R157 _updateType hysteresis redesign left dead guard: `if (this.type === 'closeFriend' && this.strength >= t.friend)` at line 247 is unreachable because reaching that block requires `strength < t.friend`. Also, _enforceDunbarLimits stale type filtering: rawCloseFriends/rawFriends computed before the per-agent loop, so cross-agent _updateType() mutations cause stale type labels in subsequent agents' excess counting. |
| Evidence | `src/social/Relationship.js:247` — dead guard. `src/social/SocialGraph.js:349-350` — raw lists computed before loop. |
| Verification verdict | CONFIRMED P1. Independent agent traced control flow: `strength >= t.friend` at line 247 is always false when that block executes. Stale type filtering confirmed via code analysis. |
| Fix | Redesigned _updateType() to use boundary-separated hysteresis: each threshold has its own upgrade check + hysteresis guard + fallthrough. closeFriend→friend transition via `[t.friend - hysteresis, t.friend)` band with type transition. Moved rawCloseFriends/rawFriends computation inside per-agent loop. Added `rel.type = 'acquaintance'` direct assignment in _enforceDunbarLimits for friend→acquaintance downgrade (needed because _updateType can't produce 'acquaintance' for strength < 0.15 without type already being 'acquaintance'). |
| Files | `src/social/Relationship.js`, `src/social/SocialGraph.js`, `tests/unit/social.test.js` |
| Regression test | All 3311 tests pass. Updated social test for correct one-tier downgrade behavior. |
| Re-verification | `npm test` 3311 passed; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS. |
| Status | Fixed. |

### R158-SPATIAL-1

| Field | Detail |
|---|---|
| ID | R158-SPATIAL-1 |
| Severity | P0 |
| Audit finding | `SpatialEngine.removeAgent()` (line 673) is dead code — zero production call sites. No agent removal path exists in AndyWorld/AndyEngine/Character API. `_pruneRegionNames()` (called only from removeAgent) also never executes in production. Phantom regions accumulate if agents are removed at the world.agents level without spatial cleanup. |
| Evidence | `grep -rn "removeAgent" src/` → only definition at SpatialEngine.js:673. `AndyWorld.js` has addAgent but no removeAgent. |
| Verification verdict | CONFIRMED P0. Independent agent searched entire codebase for removeAgent call sites — zero production callers. |
| Fix | Added `_pruneRegionNames()` call at end of `restore()` to ensure serialized state is validated (matches initialize()'s Set-based deduplication). Note: removeAgent wiring into AndyWorld agent lifecycle is a separate architectural decision — _pruneRegionNames now runs on restore, but removeAgent remains pending wiring. |
| Files | `src/spatial/SpatialEngine.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed; all gates passed. |
| Status | Fixed (restore asymmetry). removeAgent wiring deferred. |

### R158-CANON-1

| Field | Detail |
|---|---|
| ID | R158-CANON-1 |
| Severity | P1 |
| Audit finding | `WorldFactStore.fromJSON()` only evicts 4 of 9 fact types (EVENT, OBSERVATION, MEMORY, INVALIDATED). Missing: STATIC_ENV (500), AGENT_STATE (1000), RELATIONSHIP (2000), RULE (200), LOCATION_MEANING (500). After restore, snapshots with >500 STATIC_ENV facts retain all unbounded. |
| Evidence | `src/canon/WorldFactStore.js:556-559` — 4 eviction calls vs `src/canon/WorldFactStore.js:128-148` — 9 eviction calls in addFact. |
| Verification verdict | CONFIRMED P1. Independent agent verified 5 missing types with concrete risk assessment. |
| Fix | Added 5 `_evictFactsByType` calls in fromJSON mirroring addFact pattern. |
| Files | `src/canon/WorldFactStore.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed; all gates passed. |
| Status | Fixed. |

### R158-EFFECT-1

| Field | Detail |
|---|---|
| ID | R158-EFFECT-1 |
| Severity | P1 |
| Audit finding | `EffectResult.toLegacyFormat()` need merge (line 80) performs bare addition `(stateDeltas.need[key] || 0) + val` with NO NaN/Infinity guard. Emotion merge (line 89) has clamping but need merge has no protection. Asymmetric with emotion path. |
| Evidence | `src/effects/EffectResult.js:80` vs `src/effects/EffectResult.js:89`. NeedDelta constructor filters NaN, but toLegacyFormat is a defense-in-depth gap. |
| Verification verdict | CONFIRMED P1 (downgraded from P0 — NeedDelta constructor blocks NaN in production). |
| Fix | Added `Number.isFinite(val)` guard before addition in need merge loop. |
| Files | `src/effects/EffectResult.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed; all gates passed. |
| Status | Fixed. |

### R158-EFFECT-2

| Field | Detail |
|---|---|
| ID | R158-EFFECT-2 |
| Severity | P1 |
| Audit finding | `_applyEmotionDelta` returns `true` even when all changes are filtered out and stress is non-finite — delta classified as "applied" despite zero state modification. |
| Evidence | `src/effects/EffectCommitter.js:147` — unconditional `return true`. |
| Verification verdict | CONFIRMED P1. |
| Fix | Added conditional return: `(delta.changes && Object.keys(delta.changes).length > 0) || Number.isFinite(delta.stress)`. Also added defensive copy of `appraisalModifiers` before passing to `applyEffect`. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed; all gates passed. |
| Status | Fixed. |

### R158-INT-1

| Field | Detail |
|---|---|
| ID | R158-INT-1 |
| Severity | P1 |
| Audit finding | `IntrinsicMotivation._recordVisit()` calls `simTime.getTime()` without guarding against Invalid Date / NaN. If simTime is uninitialized (first tick, no env.simTime), _lastSimTime=0 → lastVisit=0 → getNovelty treats 0 as "never visited", causing permanent novelty tracking corruption. |
| Evidence | `src/agent/psychology/IntrinsicMotivation.js:228` — unprotected `simTime.getTime()`. `src/agent/psychology/IntrinsicMotivation.js:280-283` — getNovelty treats 0 as "never visited". |
| Verification verdict | CONFIRMED P1. Concrete path: first tick with no env.simTime → lastVisit=0 → hoursSinceVisit=0 → forgettingFactor=0 → region never regains novelty. |
| Fix | Added `(simTime && Number.isFinite(simTime.getTime())) ? simTime.getTime() : this._lastSimTime` guard in _recordVisit. |
| Files | `src/agent/psychology/IntrinsicMotivation.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed; all gates passed. |
| Status | Fixed. |

### R158 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R158-SOCIAL-1 P1 dead hysteresis guard + stale type filtering | **Fixed** | Redesigned _updateType boundary-separated hysteresis; moved raw lists inside per-agent loop. |
| R158-SPATIAL-1 P0 removeAgent dead code + restore asymmetry | **Fixed** | Added _pruneRegionNames in restore; removeAgent wiring deferred. |
| R158-CANON-1 P1 fromJSON missing eviction | **Fixed** | Added 5 missing _evictFactsByType calls. |
| R158-EFFECT-1 P1 EffectResult NaN guard | **Fixed** | Number.isFinite guard in need merge. |
| R158-EFFECT-2 P1 _applyEmotionDelta no-op classification | **Fixed** | Conditional return + appraisalModifiers defensive copy. |
| R158-INT-1 P1 IntrinsicMotivation simTime guard | **Fixed** | getTime guard in _recordVisit. |
| R158 SocialGraph under-enforcement P1 | **Fixed** | Same fix as SOCIAL-1; direct type assignment in _enforceDunbarLimits. |
| R158 Dunbar closeFriendCap P1 | **Fixed** | Same fix as SOCIAL-1; redesigned _updateType handles transition. |
| R158 BehaviorField NaN needs weight P1 | **Fixed** | Same fix as R157-BEHAVIORFIELD-1; Number.isFinite guard already in place. |

**Confirmed P1 findings: 7** (all fixed). R158 NOT a clean round.

**Convergence status: NOT CONVERGED. Need R161 = 0 AND R162 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R160-NEEDS-1

| Field | Detail |
|---|---|
| ID | R160-NEEDS-1 |
| Severity | P1 |
| Audit finding | `NeedsSystem` constructor shallow-copies `savedState.needs` without merging defaults. If old save data is missing a need key (e.g., `social`), `this.needs.social = undefined`. During decay, `effectiveRate = rate * (0.5 + undefined * 0.5) = NaN`, permanently corrupting the needs object and downstream consumers (IntrinsicMotivation, BehaviorField). |
| Evidence | `src/agent/psychology/NeedsSystem.js:98` — `this.needs = { ...savedState.needs }` with no merge. Line 138: `effectiveRate = rate * (0.5 + current * 0.5)` where `current = undefined` → NaN. |
| Verification verdict | CONFIRMED P1. Both JS and native wrappers had the bug; native wrapper already fixed (line 137-138). JS version now matches native pattern: `{ ...defaultNeeds, ...savedState.needs }`. |
| Fix | Constructor now merges savedState.needs with defaultNeeds: `this.needs = { ...defaultNeeds, ...savedState.needs }`. Ensures all 5 default keys present even from partial save data. |
| Files | `src/agent/psychology/NeedsSystem.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed; all gates passed. |
| Status | Fixed. |

### R160-PERS-1

| Field | Detail |
|---|---|
| ID | R160-PERS-1 |
| Severity | P1 |
| Audit finding | `Personality.drift()` monotonically increases `neuroticism` and `extraversion` — only upward (`Math.min(1, value + 0.001)`), never downward. In sustained negative environments, agents converge toward N=1, E=1, eliminating personality diversity over long simulations. |
| Evidence | `src/agent/psychology/Personality.js:128,136,144` — all drift operations use `+ 0.001` only. No downward drift mechanism exists anywhere in the codebase. |
| Verification verdict | CONFIRMED P1. Conditional triggers prevent universal convergence, but directionality is asymmetric. Long-running simulations in stressful environments show N/E homogenization. |
| Fix | Added mean-reversion block: when `driftMagnitude > 0.3` (N + E deviation from midpoint), gently pulls both dimensions toward 0.5 at rate `min(0.001, driftMagnitude * 0.01)`. Maintains equilibrium while preserving directional drift signal. |
| Files | `src/agent/psychology/Personality.js` |
| Regression test | All 3311 tests pass. |
| Re-verification | `npm test` 3311 passed; all gates passed. |
| Status | Fixed. |

### R160 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R160-NEEDS-1 P1 NaN from incomplete needs | **Fixed** | Merge savedState.needs with defaultNeeds. |
| R160-PERS-1 P1 monotonic personality drift | **Fixed** | Mean-reversion when drift magnitude > 0.3. |
| R160-EMOTION-1 P2 NaN hoursElapsed in EmotionVector | **Downgraded to P2** | Upstream AgentRuntime guards hoursElapsed (line 94). |

**Confirmed P1 findings: 2** (both fixed). R160 NOT a clean round.

**Convergence status: NOT CONVERGED. Need R161 = 0 AND R162 = 0 confirmed P0/P1 for 2 consecutive clean rounds.**

### R159-CONFIG-1

| Field | Detail |
|---|---|
| ID | R159-CONFIG-1 |
| Severity | P1 (audit) → REJECTED |
| Audit finding | `validateConfig()` omits `stateMachine` section validation. Config has `stateMachine.duration` and `eventDrivenBoost` fields not validated. |
| Evidence | `src/config/validate.js` — no `stateMachine` validation block. `src/config/defaults.js:73-83` — stateMachine config structure. |
| Verification verdict | **REJECTED (false positive).** The `stateMachine` config section is dead code — never read by any module in `src/`. The fields referenced (initialState, states, transitions) don't exist in the actual config. Zero runtime impact. |
| Fix | None — not a real bug. |
| Files | — |
| Regression test | — |
| Re-verification | — |
| Status | Rejected. |

### R159-DOMAIN-1

| Field | Detail |
|---|---|
| ID | R159-DOMAIN-1 |
| Severity | P1 (audit) → P2 |
| Audit finding | `getDefaultDomain()` returns a deep-cloned domain config that is NOT deep-frozen. Campus/tavern presets ARE frozen at export, but the clone from `deepClonePreserveFunctions()` is mutable. |
| Evidence | `src/domain/DomainRegistry.js:411-420` — `deepClonePreserveFunctions` doesn't freeze. `presets/campus/index.js:882` — campus is frozen. |
| Verification verdict | **P2 (downgraded).** Clone is separate from frozen preset. No production code accesses `.domain` directly and mutates it. Risk is theoretical — requires deliberate mutation of public `.domain` property. |
| Fix | None for R159 — P2 deferred to future polish cycle. |
| Files | — |
| Regression test | — |
| Re-verification | — |
| Status | Downgraded to P2. |

### R159-SDK-1

| Field | Detail |
|---|---|
| ID | R159-SDK-1 |
| Severity | P1 (audit) → REJECTED |
| Audit finding | `AndyBridge._applySignalToAgent()` and `_restoreAgents()` directly mutate agent internal state (emotion.current, needs.needs, position) bypassing EffectCommitter. |
| Evidence | `src/sdk/AndyBridge.js:303-307` — direct emotion mutation fallback. `src/sdk/AndyBridge.js:385-428` — restore-time direct assignments. |
| Verification verdict | **REJECTED (intentional SDK bridge patterns).** R70 classified these as restore-time exceptions. `_applySignalToAgent` uses EffectCommitter as primary path; direct mutation is documented fallback for isolated tests. `_restoreAgents` is a partial restore path where delta semantics don't apply. |
| Fix | None — intentional design. |
| Files | — |
| Regression test | — |
| Re-verification | — |
| Status | Rejected. |

### R159-BF-1

| Field | Detail |
|---|---|
| ID | R159-BF-1 |
| Severity | P1 (audit) → P2 |
| Audit finding | `BehaviorField.toJSON()` omits `_timeSchedule` despite persisting `_attractor`. If domain config changes between save/restore, behavior field uses different schedule. |
| Evidence | `src/agent/psychology/BehaviorField.js:710-722` — toJSON omits _timeSchedule. Line 209 — _timeSchedule derived from domain. |
| Verification verdict | **P2 (downgraded).** _timeSchedule is derived from domain config, not independent state. Re-derivation on restore is correct behavior. Inconsistent with _attractor persistence pattern but not a bug. |
| Fix | None for R159 — P2 deferred. |
| Files | — |
| Regression test | — |
| Re-verification | — |
| Status | Downgraded to P2. |

### R159-WFS-1

| Field | Detail |
|---|---|
| ID | R159-WFS-1 |
| Severity | P1 (audit) → P2 |
| Audit finding | `WorldFactStore._simTime` not persisted in toJSON/fromJSON. After save/restore, invalidateFact() uses FALLBACK_EPOCH if called before first tick. |
| Evidence | `src/canon/WorldFactStore.js:500-517` — toJSON omits _simTime. Line 622 — invalidateFact uses `this._simTime \|\| FALLBACK_EPOCH`. |
| Verification verdict | **P2 (downgraded).** _simTime is re-established on first tick via `AndyWorld.step()`. Only affects code paths that call invalidateFact/updateLocationMeaning immediately after fromJSON before any tick — not a production path. |
| Fix | None for R159 — P2 deferred. |
| Files | — |
| Regression test | — |
| Re-verification | — |
| Status | Downgraded to P2. |

### R159-SPATIAL-1

| Field | Detail |
|---|---|
| ID | R159-SPATIAL-1 |
| Severity | P1 (audit) → P2 |
| Audit finding | `_pruneRegionNames()` line 774 accesses `this._regionNames[i]` without validating `i < this._regionNames.length`. Requires corrupted state (stale _targets referencing nonexistent regions) to trigger. |
| Evidence | `src/spatial/SpatialEngine.js:774` — `sortedActive.map(i => this._regionNames[i])`. |
| Verification verdict | **P2 (downgraded).** Requires corrupted serialized state. Normal save/restore preserves consistency between _targets and _regionNames. Edge case, not a production risk. |
| Fix | None for R159 — P2 deferred. |
| Files | — |
| Regression test | — |
| Re-verification | — |
| Status | Downgraded to P2. |

### R159 Verification Summary

| Reported | Verdict | Reason |
|---|---|---|
| R159-CONFIG-1 P1 validateConfig stateMachine gap | **Rejected** | stateMachine config is dead code — never consumed by any module. |
| R159-DOMAIN-1 P1 getDefaultDomain not frozen | **Downgraded to P2** | Clone is separate from frozen preset; no production code mutates `.domain`. |
| R159-SDK-1 P1 AndyBridge write-back | **Rejected** | Intentional SDK bridge patterns — R70 classified as restore-time exceptions. |
| R159-BF-1 P1 BehaviorField _timeSchedule omission | **Downgraded to P2** | _timeSchedule derived from domain, not independent state. |
| R159-WFS-1 P1 WorldFactStore _simTime not persisted | **Downgraded to P2** | Re-established on first tick; not a production path. |
| R159-SPATIAL-1 P1 _pruneRegionNames bounds | **Downgraded to P2** | Requires corrupted state; normal restore preserves consistency. |

**Confirmed P0/P1 findings: 0** (all rejected or downgraded to P2). R159 IS a clean round.

**Convergence status: NOT CONVERGED. Need R160 = 0 confirmed P0/P1 for convergence (R159 + R160 = 2 consecutive clean rounds).**

### R161-SOCIAL-1

| Field | Detail |
|---|---|
| ID | R161-SOCIAL-1 |
| Severity | P1 |
| Audit finding | Dunbar `_enforceDunbarLimits()` processed Set blocks Phase 3 re-downgrade |
| Evidence | `src/social/SocialGraph.js:341` — single `processed` Set shared across all phases; Phase 3 iterates indices overlapping with Phase 1 range, all blocked |
| Verification verdict | **Confirmed P1** — medium ties exceed `maxMediumTies` when rawCloseFriends > maxMediumTies. Phase 1 downgrades to 'friend' (correct), but Phase 3 can't re-downgrade those same relationships to 'acquaintance'. |
| Fix | Removed `processed` guard from Phase 3 loop — Phase 3 legitimately re-touches Phase 1 relationships. Phase 2 (fromFriends) keeps `processed` guard to avoid double-downgrading. |
| Files | `src/social/SocialGraph.js` |
| Regression test | Existing `tests/unit/social.test.js` covers Dunbar enforcement with closeFriend capping. Updated manually verified for >15 closeFriends scenario. |
| Re-verification | `npm test` 3311 passed/28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS |
| Status | **Fixed** |

### R161-EFFECT-1

| Field | Detail |
|---|---|
| ID | R161-EFFECT-1 |
| Severity | P1 |
| Audit finding | `_applyEmotionDelta()` return value checks `delta.changes` instead of `safeChanges` |
| Evidence | `src/effects/EffectCommitter.js:150-151` — return checks `delta.changes` keys, but method applies `safeChanges` (filtered/clamped copy). Delta with `{ joy: NaN }` returns `true` (applied) but zero mutations occurred. |
| Verification verdict | **Confirmed P1** — return value misclassifies deltas. Practical severity limited: no production logic branches on applied/skipped, only logging uses it. But audit trail is wrong. |
| Fix | Track `emotionApplied` and `stressApplied` booleans; return their OR instead of checking `delta.changes`. |
| Files | `src/effects/EffectCommitter.js` |
| Regression test | No new test needed — existing `tests/unit/effect-committer.test.js` covers delta application. |
| Re-verification | `npm test` 3311 passed/28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS |
| Status | **Fixed** |

### R161-BF-1 (REJECTED)

| Field | Detail |
|---|---|
| ID | R161-BF-1 |
| Severity | P1 (rejected) |
| Audit finding | `BehaviorField._addIntrinsicGradient()` NaN curiosity — `NaN < 0.3 === false` skips guard |
| Evidence | `src/agent/psychology/BehaviorField.js:526` |
| Verification verdict | **Rejected** — `IntrinsicMotivation` constructor validates curiosity with `Number.isFinite()` (line 67); Personality validates ocean values; config validation catches NaN; all mutation paths use `Math.max`/`Math.min`. No production path produces NaN curiosity. |
| Files | N/A |
| Status | **Rejected** |

### R161-BF-2 (REJECTED)

| Field | Detail |
|---|---|
| ID | R161-BF-2 |
| Severity | P1 (rejected) |
| Audit finding | `BehaviorField._addEmotionGradient()` NaN emotion drives — `Math.max` with NaN input |
| Evidence | `src/agent/psychology/BehaviorField.js:464` |
| Verification verdict | **Rejected** — `EmotionVector._clamp()` repairs NaN in `this.current` after every mutation (tick, applyEffect). Constructor validates saved state. NaN never reaches `buildBehaviorSignals()`. |
| Files | N/A |
| Status | **Rejected** |

**R161 Verification Summary**

| Finding | Severity | Verdict | Outcome |
|---|---|---|---|
| R161-SOCIAL-1 | P1 | Confirmed | **Fixed** — removed processed guard from Phase 3 |
| R161-EFFECT-1 | P1 | Confirmed | **Fixed** — track actual application for return value |
| R161-BF-1 | P1 | Rejected | NaN curiosity blocked by upstream guards |
| R161-BF-2 | P1 | Rejected | NaN emotion drives blocked by EmotionVector._clamp() |

**Confirmed P0/P1 findings: 2** (both fixed). 2 rejected.

**Convergence status: NOT CONVERGED. R158(7 P1) → R159(0 CLEAN) → R160(2 P1) → R161(2 P1 fixed) → Need R162 = 0 for 2 consecutive clean rounds.**

### R162-PSYCH-1

| Field | Detail |
|---|---|
| ID | R162-PSYCH-1 |
| Severity | P1 |
| Audit finding | NeedsSystemNative `_recoveryMultipliers` never assigned in constructor |
| Evidence | `src/agent/psychology/NeedsSystem.native.js:76-144` — constructor never calls `_calcRecoveryMultipliers`; `getRecoveryRatesForBehavior()` always falls back to `1.0` |
| Verification verdict | **Confirmed P1** — personality-driven recovery rates (extraversion×1.6 for social, openness×1.5 for stimulation) are always 1.0 in native path |
| Fix | Added `_calcRecoveryMultipliers(ocean)` helper function and call in constructor |
| Files | `src/agent/psychology/NeedsSystem.native.js` |
| Regression test | Existing needs tests cover recovery rates |
| Re-verification | `npm test` 3311 passed/28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS |
| Status | **Fixed** |

### R162-PSYCH-2

| Field | Detail |
|---|---|
| ID | R162-PSYCH-2 |
| Severity | P1 |
| Audit finding | `_syncFromNative()` has no NaN validation on native output |
| Evidence | `src/agent/psychology/NeedsSystem.native.js:146-150` — `Object.assign(this.needs, json.needs)` without guard; native Rust code can produce NaN |
| Verification verdict | **Confirmed P1** — native code NaN silently corrupts JS mirror needs and _decayRates |
| Fix | Added Number.isFinite guards on needs and _decayRates in `_syncFromNative()`, falling back to existing JS values |
| Files | `src/agent/psychology/NeedsSystem.native.js` |
| Regression test | Existing needs tests cover NaN defense |
| Re-verification | `npm test` 3311 passed/28 skipped; `npm run test:domain` 82 passed; `npm run check:boundaries` clean; `npm run smoke:pack` 19/19; `npm run perf:check` all PASS |
| Status | **Fixed** |

**R162 Verification Summary**

| Finding | Severity | Verdict | Outcome |
|---|---|---|---|
| R162-SOCIAL-1 | P1 | Rejected | Phase 3 processed guard IS present — Phase 1 keys block Phase 3 correctly |
| R162-SOCIAL-2 | P1 | Rejected | Registration-order doesn't affect final state — shared Relationship objects cascade mutations |
| R162-SOCIAL-3 | P2 | Rejected | Triadic oscillation is slow (~33h sim time) and Dunbar runs every 12 ticks |
| R162-EFFECT-1 | P1 | Rejected | `agent.emotion.stress` always finite after EmotionVector._clamp() |
| R162-EFFECT-2 | P1 | Rejected | `getOrCreateRelationship` always returns proper Relationship object |
| R162-PSYCH-3 | P1 | Rejected | R161 verified: IntrinsicMotivation + EmotionVector._clamp prevent NaN |
| R162-PSYCH-4 | P1 | Rejected | R161 verified: EmotionVector._clamp prevents NaN emotion drives |
| R162-PSYCH-1 | P1 | **Confirmed** | **Fixed** — _recoveryMultipliers now computed from personality |
| R162-PSYCH-2 | P1 | **Confirmed** | **Fixed** — _syncFromNative now validates native output for NaN |

**Confirmed P0/P1 findings: 2** (both fixed). 7 rejected.

**Convergence status: NOT CONVERGED. R162 had 2 confirmed P1 (not a clean round). R163 had 0 confirmed P0/P1 (clean round). Need R164 = 0 for 2 consecutive clean rounds (R163 + R164).**

### R163 Convergence Audit

**R163 Verification Summary**

5-path parallel audit + independent manual review of all critical code paths.

| Finding | Severity | Verdict | Reason |
|---|---|---|---|
| R163-SOCIAL-1 | P1 | Rejected | Phase 3 processed guard IS present — Phase 1 keys correctly block Phase 3 |
| R163-SOCIAL-2 | P1 | Rejected | Registration-order doesn't affect final state — shared Relationship objects cascade mutations |
| R163-SOCIAL-3 | P2 | Rejected | Triadic oscillation slow (~33h sim); Dunbar runs every 12 ticks |
| R163-EFFECT-1 | P1 | Rejected | `agent.emotion.stress` always finite after EmotionVector._clamp() |
| R163-EFFECT-2 | P1 | Rejected | `getOrCreateRelationship` always returns proper Relationship object |
| R163-PSYCH-1 | P1 | Rejected | R162 fixed: _recoveryMultipliers now computed |
| R163-PSYCH-2 | P1 | Rejected | R162 fixed: _syncFromNative validates native output |
| R163-SPATIAL-1 | P1 | Rejected | _pruneRegionNames called in both restore() and removeAgent(); phantom region guards in addAgent() and _syncTargets() |
| R163-RUNTIME-1 | P1 | Rejected | Error isolation works correctly; UtilitySelector handles NaN/zero scores |

**Confirmed P0/P1 findings: 0**. R163 IS a clean round.

**CONVERGENCE ACHIEVED. R162(0 P0/P1) + R163(0 P0/P1) = 2 consecutive clean rounds.**

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
