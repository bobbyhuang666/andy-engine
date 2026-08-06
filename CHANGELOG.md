# Changelog

All notable changes to Andy Engine will be documented in this file.

> **Package Status**: Foundation Alpha (v2.0.1). This package has not been published to npm. The public API surface, persistence contracts, and domain configuration are stable for downstream applications, but the package is still in alpha polish. Production use requires careful validation.

---

## Unreleased

### Changed

- CI workflows upgraded to actions/checkout and actions/setup-node v7.
- Repo community surface: CONTRIBUTING.md, PR template, bug/feature issue templates, README CI badge, social preview brand asset.

### Fixed

- Made the alias-path performance test median-of-7 to absorb shared-runner GC jitter.
- Performance gate now normalizes absolute-ms baselines by a version-independent machine reference (`meta.referenceMs`), and release comparison re-sealed as `benchmarks/baselines/v2.0.1.json` (v0.2.0 baseline kept for history).

## v2.0.1 (2026-08-06)

### Added

- **TickEffectSummary** (`TickResult.phase.effectSummary`) — additive, optional field providing committed-delta counts per tick (A1 effect/trace observability gap). Counts only; no raw delta objects or live references. See `docs/PUBLIC_API_CONTRACT.md` for the full contract.
- **Evaluation bundle** (`reference-host/src/evaluation-bundle.js`) — Host-owned blinded bundle assembly consuming only public API outputs (A4 evaluation-bundle capability gap). Not part of the npm package.

### Changed

- **Relicensed from AGPL-3.0-only to Apache-2.0** — permits embedding in proprietary commercial products (games, hosted services, enterprise apps). Added `NOTICE`; updated README, CLA, and packaging metadata. Snapshots previously obtained under AGPL-3.0-only remain governed by that license.
- Replaced the checked-in full narrative evaluation corpus with a small synthetic public grounding smoke matrix. Extended evaluation assets are maintained outside the public repository.
- Split D5 reporting into a public synthetic-checker status and a real-LLM outcome status; a synthetic Pass no longer upgrades the unevaluated real-LLM result.
- Refreshed public quality reports and clarified which documentation is bundled with the npm package.
- Clarified persistence modes: `auto` may degrade only for unavailable SQLite bindings, while explicit `sqlite` fails closed.

### Fixed

- Routed invalid-region recovery through `PositionDelta` and made RegionGrid placement atomic with agent position updates.
- Made asynchronous snapshot restoration observable and awaited before store initialization completes.
- Aligned the public synchronous semantic-verifier type with runtime behavior and accepted structural verifier objects.
- Preserved warning severity for malformed non-blocking structured-claim sidecars.
- Prevented invalidated relationship facts from blocking creation of their active replacements.
- Rejected non-boolean runtime feature switches instead of treating truthy strings as enabled.

### Removed

- Removed obsolete migration notes, stale semantic benchmark reports, and public corpus-generation tooling.

## v2.6 — Social Emergence (2026-06-27)

**D6 Multi-Agent Social Emergence: Warning → Pass**

### Added

- **Social emergence E2E test** — triadic closure, Dunbar differentiation, serialization fidelity (`tests/e2e/social-emergence.test.js`)
- **Gossip propagation E2E test** — 2-hop told propagation, evidence guard for told events (`tests/e2e/gossip-propagation.test.js`)
- **Emotion contagion cluster E2E test** — 3-agent extreme emotion convergence, deterministic-by-construction (`tests/e2e/emotion-contagion-cluster.test.js`)
- **D6 judgment unit tests** — 8 tests for aliveness-report D6 dimension judgment (`tests/unit/aliveness-report-d6-judgment.test.js`)

### Fixed

- **FactProvider evidence bug** — PUBLIC facts without KnowledgeStore entries no longer fabricate `direct` evidence; `told` events no longer justify `AGENT_STATE` claims
- **D6 judgment ordering (B1)** — D6 block moved before generic fallback path in `judgeDimension()`, preventing social-emergence pass from short-circuiting the 3-file D6 check
- **Gossip test controls** — activity negative controls use actual activity words; needs negative controls added; dead dummy event removed
- **Emotion contagion test** — value range validation [-1,1], co-presence comments clarified

### Aliveness Status

| Dimension | Status |
|---|---|
| D1 World Persistence | Pass |
| D2 Character Continuity | Pass |
| D3 Epistemic Correctness | Pass |
| D4 Causal Consequence Writeback | Pass |
| D5 Grounded Narrative Faithfulness | Warning |
| D6 Multi-Agent Social Emergence | **Pass** |
| D7 Domain Portability | Pass |

---

## v2.5 — Narrative Grounding Improvements (2026-06-26)

**D5 Grounded Narrative Faithfulness: Gap → Warning (design-level Warning, not deficiency)**

### Added

- **Evidence-aware grounding package** — `FactProvider._getInferredFacts` downgraded to not over-represent inferred knowledge; `_attachEvidence` now attaches epistemic evidence types
- **Narrative violation corpus** — 35 entries across 10 categories of narrative consistency violations (`tests/fixtures/narrative-violations/`)
- **Checker hardening** — expanded regex patterns and negative controls in `FactConsistencyChecker`

### Changed

- `_getInferredFacts` no longer surfaces inferred facts at the same confidence as observed/direct facts
- Evidence model now propagates through FactProvider correctly

### Note

D5 remains at **Warning** by design. The `FactConsistencyChecker` is regex-based and experimental. It detects hand-crafted violation patterns with 100% accuracy but has not been validated against real LLM-generated narrative output. A truthful Warning is better than a decorative Pass.

---

## v2.4 — Epistemic Integrity (2026-06-27)

**D3 Epistemic Correctness: Warning → Pass**

### Added

- **Epistemic evidence model** — `KnowledgeStore` stores evidence types (direct, observed, overheard, told, inferred) for each fact
- **CanonEventPipeline knowledge propagation** — events propagate knowledge with correct evidence types based on observation context
- **AGENT_STATE privacy guard** — `WorldFactStore` treats `AGENT_STATE` facts as private knowledge even with `public` scope; other agents need direct/observed/told/inferred evidence
- **Epistemic boundary E2E tests** — alice-bob epistemic boundary test, epistemic evidence matrix test

### Aliveness Status

D3 upgraded from Warning to Pass based on E2E evidence.

---

## v2.3 — Memory Consistency & Observability (2026-06-26)

### Fixed

- **PersonalMemory `_simTime` deterministic init** — fixed nondeterministic `_simTime` initialization that caused memory recall divergence across sessions
- **Replay observability diagnostic hashes** — added tick-level hashes for replay diff diagnostics

### Added

- **Memory characterization tests** — safety net for future memory system changes

### Changed

- Memory system consistency improved; deterministic replay baseline strengthened

---

## v2.2 — Persistence Fidelity / L4 Resume (2026-06-26)

**D1 World Persistence: Warning → Pass (L4 Replay Trust)**

### Fixed

Five-layer root cause chain for persistence fidelity, all resolved in commit `1de1176`:

| Layer | Root Cause | Fix |
|---|---|---|
| 1 | `EventDispatcher._nextId` not persisted | toJSON/fromJSON + best-effort inference |
| 2 | `Agent._ticksSinceReflection/_ticksSinceDriftCheck` not persisted | AgentSerializer output + best-effort defaults |
| 3 | `PersonalMemory.toJSON` presentations.slice(-20) truncation | Full presentations persistence |
| 4 | `PersonalMemory._touchMemory` runtime presentations truncation | Removed slice(-20), consistent with accessCount semantics |
| 5 | `memory.appraisal` not persisted | Added appraisal field to toJSON |

### Added

- **Replay-diff tool** — compares current replay output against golden fixture
- **Module guard scan** — R5 boundary enforcement tool
- **Golden corpus metadata upgrade** — tickHash + structured metadata
- **Aliveness report system** — dimension-level calibration and reporting

### Aliveness Status

D1 upgraded to Pass after L4 replay trust verification.

---

## v2.1 — World Kernel Trust (2026-06-25)

### Added

- **Coverage infrastructure** — removed coverage thresholds, fixed test:coverage watch-mode bug
- **Module guard scan tool** — R5 boundary enforcement
- **Replay-diff tool** — golden corpus comparison with human review process
- **Golden corpus** — seed42/100ticks baseline with tick-level hashes
- **L2 multi-seed + L3 cross-process** replay trust verification

### Changed

- World kernel trust phase: L1-L4 replay trust levels established
- Replay observability infrastructure in place

---

## v2.0 — Architecture Preview Line (2026-06-24)

### Added

- **Domain-agnostic runtime** — core engine is world-agnostic; all world-specific semantics come from domain presets
- **Campus preset** (default, backward compatible)
- **Tavern preset** — medieval tavern world (5 regions, 8 states)
- **Custom domain support** — `new AndyEngine({ domain: customDomain })`
- **Continuous 4D BehaviorField** — Langevin dynamics with personality modulation, replacing discrete state machine
- **Seeded RNG baseline** — reproducible core runtime paths (not full deterministic replay)
- **9 read-only action candidate providers** — ContinueCandidate, NeedCandidate, ScheduleCandidate, BehaviorFieldCandidate, ExploreCandidate, SocializeCandidate, MemoryCandidate, HabitCandidate, WorldPressureCandidate
- **Action selection with ReasonTrace** — full audit trail of utility scoring and weighted selection
- **EventEffectPipeline** — typed deltas for action/event consequences
- **WorldCanon facts system** — WorldFactStore, CanonEventPipeline, KnowledgeStore, FactProvider
- **SDK facade** — Character, Andy, NarrativeBuilder, LLMAdapter, ConversationLog
- **Persistence facade** — SQLiteStore (optional), SimulationStore, createStore factory
- **AffectCompiler v0.2** — structured expression constraints from internal psychology state
- **Package infrastructure** — 10 subpath exports, .d.ts declarations for root and SDK, files whitelist
- **Type declarations** — `index.d.ts` and `sdk/index.d.ts` for TypeScript consumers
- **Performance baseline** — benchmarks, profiling, perf-check regression guard
- **Clean Architecture Pass** — `src/` owns implementation; old top-level runtime wrappers retired

### Changed

- Complete architectural rewrite from v1.x to persistent world engine
- StateMachine retired as behavior controller; BehaviorField is the core dynamics layer
- Narrative/LLM cannot create world facts; only express what characters know

### Removed

- Old top-level runtime implementation directories (core/, effects/, social/, spatial/, config/, world/, agent/action/)
- Discrete state machine as behavior controller

---

## Known Limitations (Foundation Alpha)

| Area | Limitation |
|---|---|
| D5 Narrative Faithfulness | `FactConsistencyChecker` is regex-based and experimental; detects hand-crafted patterns, not real LLM hallucinations. D5 remains Warning. |
| ESM Support | Package is CommonJS only; ESM support not guaranteed for alpha. |
| npm Publish | Package has not been published to npm. Infrastructure is ready; publish requires explicit human approval. |
| Fact/Knowledge Schema | Fact schema and Knowledge schema may still change before stable. |
| StoryArc Runtime | Paused; not implemented in engine core. |
| WorldObject | Modeled but not fully integrated into `Agent.tick`. |
| Deterministic Replay | Seeded RNG provides baseline for core paths only; not full deterministic replay. |
| External Production Users | Not yet established. |

---

## Version Convention

Andy Engine uses phase-based versioning during the Foundation Alpha period:

```text
v2.0  = Architecture preview line
v2.1  = World kernel trust
v2.2  = Persistence fidelity / L4 resume
v2.3  = Memory consistency & observability
v2.4  = Epistemic integrity
v2.5  = Narrative grounding improvements
v2.6  = Social emergence
v2.7+ = Release readiness evaluation
```

These are development phase labels, not semver. The `package.json` version remains `2.0.1` until an actual npm release is approved.
