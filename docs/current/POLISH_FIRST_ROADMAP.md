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

1. Audit remaining classified direct emotion writes: `PhysiologyRuntime`
   continuous needs/health coupling, SDK restore/transient narrative exceptions,
   committer implementation, and direct-call fallbacks.
2. Consider behavior-preserving runtime extractions such as `ContagionGatherer`
   only if the audit stays clean.

## Guardrail

Do not start ECS, native expansion, or large AndyWorld decomposition while known
P0/P1 candidates remain in the active bug ledger.
