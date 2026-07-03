# Polish-First Roadmap

This document records the current planning decision after reviewing the external
Andy Engine v3 roadmap on 2026-07-03.

## Operating Decision

Andy Engine is not rushing toward a v2.x npm publish. The current goal is to
keep the package frozen and harden the engine until the core simulation feels
trustworthy enough to release.

This changes sequencing:

- release packaging remains useful as a gate, but not as the main objective;
- confirmed P0/P1 correctness issues stay first;
- architecture boundary leaks can be promoted when they reduce future bug
  recurrence;
- speculative feature work, ECS migration, native expansion, and distributed
  runtime work remain deferred unless explicitly approved.

## Roadmap Items To Adopt Now

| Item | Disposition | Reason |
|---|---|---|
| Perception side effects | Closed in R67 | `PerceptionRuntime` emotion/stress/appraisal-bias mutations now route through typed deltas / `EffectCommitter`; personality drift bookkeeping remains a documented internal exception. |
| `env._world` removal | Closed in R68 | `RuntimeContext` now exposes explicit `effectCommitter` / `effectWorld` services; `ScheduleHandler`, `PerceptionRuntime`, and `ActionSelectionRuntime` no longer read the world backdoor. |
| Public facade writeback | Closed in R69 | `Agent.recordExternalExperience()` and `Agent.interact()` now route memory/emotion/relationship consequences through typed deltas / `EffectCommitter`; `check:boundaries` scans `src/agent/facade` for direct memory writes. |
| SDK bridge/helper emotion | Closed in R70 | `AndyBridge` user-message emotion signals now prefer world `EffectCommitter`; narrative empathy restores native-like emotion mirrors before returning; `check:boundaries` scans canonical `src/sdk` for direct memory writes. |
| Internal stress writeback | Closed in R71 | Reflection and reappraisal absolute stress updates now route through runtime `effectCommitter` when available, with direct-call fallback for isolated unit callers. |
| Discrete internal emotion feedback | Closed in R72 | Intrinsic motivation, mind wandering, reflection recall, and emotion regulation strategy deltas now prefer runtime `effectCommitter`; `PhysiologyRuntime` remains a tracked continuous-dynamics exception rather than a discrete writeback bug. |
| Direct emotion write guard | Closed in R74 | `check:boundaries` now locks the classified direct emotion write exceptions by file and count, so new unreviewed direct writes fail the boundary gate. |
| Core RNG/time guard | Closed in R75 | `check:boundaries` now locks classified core runtime `Date.now()` / `Math.random()` exceptions by file and count, preventing silent drift in seeded simulation paths. |
| Core UTC accessor guard | Closed in R76 | `check:boundaries` now locks classified core UTC time accessor exceptions by file and count, preventing silent reintroduction of UTC/local drift. |
| Direct memory write guard | Closed in R77 | `check:boundaries` now locks source-level `addExperience()` exceptions to `PersonalMemory` and `EffectCommitter`, preventing direct memory writeback from returning outside typed deltas. |
| Direct position write guard | Closed in R78 | `check:boundaries` now locks source-level `agent.position =` exceptions to `EffectCommitter`, `AndyWorld` system fallbacks, and `AndyBridge` restore, preventing direct movement writeback from returning outside typed deltas. |
| Direct relationship interaction guard | Closed in R79 | `check:boundaries` now locks source-level `recordInteraction()` exceptions to `Relationship` and `EffectCommitter`, preventing relationship writeback from bypassing typed `RelationshipDelta` ownership. |
| Fact/knowledge write authority guard | Closed in R80 | `check:boundaries` now limits source-level fact and knowledge writes to canonical canon/knowledge owners, while keeping deprecated FactEmitter fallback isolated from runtime/agent/sdk callers. |
| Action provider read-only guard | Closed in R81 | `check:boundaries` now prevents candidate providers from writing state, accessing `EffectCommitter`, committing deltas, or constructing typed deltas directly. |
| Narrative/LLM world-write guard | Closed in R82 | `check:boundaries` now prevents narrative code from writing facts, knowledge, agent state, regions, or effect deltas, preserving grounding as expression rather than world authority. |
| Canonical SDK data mutation guard | Closed in R83 | `check:boundaries` now scans canonical SDK, public facades, and compatibility agent entry points for relationship/facts/knowledge write verbs, keeping public APIs out of direct data authority. |
| WorldFactStore zero-copy perf | Closed in R84 | FactEmitter hot paths used `_getByType()` which deep-copied every fact per tick for read-only index building. Added `_getByTypeReadOnly()` zero-copy accessor; public deep-copy accessors preserved. 8 regression tests; perf improved to 0.53x/0.38x baseline. |
| EventDispatcher simTime ordering | Closed in R84 | `setSimTime()` was called in Phase 5, but Phase 2 weather changes used previous tick's `_simTime`. Moved to Phase 1 after clock advance so all phases use current simulation time. |
| StateMachine deterministic fallback | Closed in R84 | `StateMachine` constructor and `AgentRuntime` state-change handler used `new Date()` wall-clock fallback when `env.simTime` was null. Replaced with `new Date(0)` epoch sentinel for seeded determinism in isolated/SDK agent usage. 4 regression tests. |
| Testing red lines | Adopt now | Full gates, replay, perf, package smoke, and boundary checks remain mandatory after hardening work. |
| Small pure runtime extraction | Adopt selectively | `ContagionGatherer` and similar pure helpers can be extracted after P0/P1 debt drops, but only as behavior-preserving moves. |

## Roadmap Items To Defer

| Item | Disposition | Reason |
|---|---|---|
| AndyWorld line-count target | Defer | A 973-line stable coordinator is not itself a bug. Do not chase a 300-line target before correctness debt is lower. |
| Full AgentRuntime handlerization | Defer | Useful cleanup, but not urgent while direct side-effect boundaries remain open. |
| Contagion algorithm rewrite | Defer until perf target expands | Current gates pass. Rewrite only when 300+ agent scenarios become an explicit goal. |
| Native contagion / BehaviorField | Defer | Cross-language maintenance risk is too high before JS semantics are settled. |
| ECS / ComponentStore | Defer | Dual-read state synchronization is high risk and should wait until the engine has a stable hardening baseline. |
| Grammar-constrained narrative | Defer to RFC | Depends on target LLM backends and D5 strategy. |
| Distributed world sharding | Defer | Not relevant until scale goals exceed what local runtime can handle. |

## Near-Term Sequence

1. Consider behavior-preserving runtime extractions such as `ContagionGatherer`
   only if the audit stays clean.
2. Re-audit another high-recurrence bug family with no-quota external models
   before starting any large refactor.

## Guardrail

Do not start ECS, native expansion, or large AndyWorld decomposition while known
P0/P1 candidates remain in the active bug ledger.
