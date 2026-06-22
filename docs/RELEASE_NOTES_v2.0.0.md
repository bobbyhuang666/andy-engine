# Andy Engine v2.0.0 — Foundation Stable Release

## Summary

Andy Engine v2.0.0 is the first stable release of a psychology-driven persistent world runtime for AI characters. The engine maintains a shared WorldCanon — what happened, who saw it, and what changed — so that LLMs only express what a character knows rather than inventing world facts. This release stabilizes the public API surface, persistence contracts, domain configuration, and package installation story for downstream applications.

---

## What's Stable

### Core Runtime
- `AndyEngine` class — world creation, agent management, tick loop, snapshot/restore
- `tick()` / `runTicks(count)` / `advanceTo(targetTime)` — simulation progression
- `getNarrative(agentId, options?)` — grounded inner narrative for LLM injection
- `getWorldContext(agentId)` — full world context for system prompts
- `getGroundingPackage(agentId, options?)` — fact-based grounding (when `enableFacts: true`)
- `checkConsistency(llmOutput, agentId)` — LLM output consistency checking
- `snapshot()` — world state capture
- `getSocialGraph()` — Dunbar social graph access
- `setWeather(weather)` — environment control
- `onTick(callback)` — tick event hooks

### SDK (`andy-engine/sdk`)
- `Character` class — single-character interaction with chat/chatStream
- `Andy` class — multi-character engine wrapper
- `create(config)` — quick character creation function
- `ConversationLog` — conversation history management
- `AndyEngine` — re-exported root engine class

### Domain System (`andy-engine/domain`)
- `DomainRegistry` — domain configuration registry
- `validateDomain(domain, opts?)` — domain validation
- `getDefaultDomain()` — campus default domain
- `applyForbiddenTerms` — narrative safety filtering
- Campus preset (`andy-engine/presets/campus`)
- Tavern preset (`andy-engine/presets/tavern`)

### Persistence (`andy-engine/store`)
- `Serialization` — Stable World Envelope serialize/deserialize
- `SaveLoad` — unified save/load interface
- `SQLiteStore` — SQLite persistence (optional dependency)
- `SimulationStore` — high-level simulation persistence manager
- `createStore()` / `createMemoryStore()` — store factory functions
- Stable World Envelope schema v0.1.0 with migration pipeline

### Facts & Knowledge (`andy-engine/facts`)
- `WorldFactStore` — canonical world fact storage
- `KnowledgeStore` — agent knowledge tracking (who knows what)
- `CanonEventPipeline` — event-to-fact pipeline
- `FactProvider` — grounding package generation
- `FactConsistencyChecker` — LLM output validation
- `FactEmitter` — fact emission from events
- Factory functions for all fact types (static_env, agent_state, relationship, event, observation, memory, rule, location_meaning, invalidated)

### Psychology Engine (internal, stable behavior)
- 30-dimensional emotion model (Cowen & Keltner 2017)
- Continuous 4D behavior field (Langevin dynamics)
- ACT-R memory with mood-congruent recall
- Maslow needs system with continuous gradient
- Social contagion with per-tick snapshot semantics
- Seeded RNG for core runtime simulation baseline

### Configuration (`andy-engine/config/defaults`)
- `ANDY_DEFAULTS` — all tunable engine parameters
- Action selection system (shadow/event/dryRunEffects/active modes)

---

## What's Experimental

The following are shipped but may change shape in minor versions:

- `NarrativeBuilder` — prompt construction (string parsing debt acknowledged)
- `LLMAdapter` — LLM provider abstraction
- `AutoTick` — automatic tick advancement
- `AffectFrame` type — structured affect snapshot (design only, not implemented as AffectCompiler)
- `events[].content` format — currently plain text, may evolve
- `relationships[].type` vocabulary — may expand
- `domainRef` cross-domain migration — not yet defined
- Action selection `active` mode — functional but evolving

---

## What's NOT in This Release

Explicitly deferred to v2.1 / v3:

- **AffectCompiler** — full structured affect state pipeline (RFC at `docs/AFFECT_COMPILER_RFC.md`, design only)
- **Knowledge propagation runtime** — how facts spread between agents beyond direct observation
- **Grounding checker v2** — enhanced LLM output validation
- **WorldObject spatial/perception/effect integration** — interactive world objects
- **StoryArc runtime** — long-horizon narrative arc management
- **Full deterministic replay** — seeded simulation baseline exists, not full replay
- **Native prebuilt binaries** — native acceleration source is included but not prebuilt
- **ECS / SharedArrayBuffer / large-scale architecture** — 100k+ agent optimization
- **Longitudinal demo** — long-horizon alive-sense evaluation
- **IntrinsicMotivation / PersonalMemory module splits**
- **Bobby / Andy Town / UI logic** — product layer, not engine core
- **npm publish** — requires explicit user approval

---

## Installation

```bash
npm install andy-engine
```

**Requirements**: Node.js >= 18.0.0

**Optional**: `better-sqlite3` for SQLite persistence. Install with `npm install better-sqlite3`. The engine works without it; only `SQLiteStore` requires it.

```js
const AndyEngine = require('andy-engine');
const engine = new AndyEngine();
engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
engine.tick();
const narrative = engine.getNarrative('alice');
```

---

## Key Changes

### Architecture (Clean Architecture Pass)
- All implementation migrated to canonical `src/` tree
- Top-level directories (`index.js`, `agent/`, `facts/`, `domain/`, `store/`, `sdk/`) are public facades only
- Retired top-level implementation directories: `core/`, `effects/`, `social/`, `spatial/`, `config/`, `world/`
- Boundary enforcement via `scripts/check-boundaries.js` and source-scan tests

### Domain System
- Engine is fully domain-agnostic; no hardcoded campus/tavern semantics in `src/`
- Chinese semantic defaults migrated to presets
- Custom domain support with validation
- `DomainRegistry` with `validateDomain()` contract

### Action Selection
- 9 candidate providers: Continue, Need, Schedule, BehaviorField, Explore, Socialize, Memory, Habit, WorldPressure
- `UtilityScorer` / `UtilitySelector` with seeded RNG trace
- `ReasonTrace` for full audit trail of action decisions
- `EffectResult` with typed `StateDelta[]` for clean writeback
- Modes: `shadow` (default), `event`, `dryRunEffects`, `active`

### Facts & Grounding
- Opt-in semantic layer (`enableFacts: true`)
- `CanonEventPipeline` — dispatched event to fact conversion
- Epistemic boundaries: agents only know what they observe/infer/are told
- Grounding packages constrain LLM output to known facts

### Performance
- Social contagion cache optimization: ~13.7x faster (fixed-clustered), ~10x faster (runtime)
- Per-tick snapshot semantics (order-independent)
- Local baseline calibration support (`npm run perf:calibrate`)
- Subsystem profiling: agent, emotion, contagion

### Persistence
- Stable World Envelope (schema v0.1.0) with explicit field classification
- Runtime Snapshot Payload (opaque, version-specific)
- Migration pipeline (v0.0.0 → v0.1.0)
- `better-sqlite3` moved to optionalDependencies
- `express` moved to devDependencies
- `ws` removed (zero imports found)

### Types
- `index.d.ts` — root engine type declarations
- `sdk/index.d.ts` — SDK type declarations
- `src/sdk/types.d.ts` — canonical SDK types
- Consumer typecheck script (`npm run typecheck:consumer`)

### Testing
- 1918 tests passing
- Domain validation tests (campus, tavern, custom)
- Package boundary tests
- Source-scan tests for forbidden terms
- Compatibility tests
- Performance regression checks
- Core runtime and default package smoke tests do not require SQLite native bindings
- SQLite persistence is verified separately with `npm run sqlite:smoke` when `better-sqlite3` is available

---

## Known Limitations

### Acknowledged Technical Debt
- **NarrativeBuilder string parsing**: `src/sdk/NarrativeBuilder.js` parses formatted Chinese strings instead of consuming structured state. Documented in `docs/NARRATIVE_CONTRACT_AUDIT.md`.
- **SDK presentation RNG**: `EmotionSignalBuffer` uses `Math.random()` / `Date.now()` for presentation variance. SDK determinism is best-effort, not part of core seeded replay claim.
- **Personality restore semantics**: `Personality.fromJSON()` restores OCEAN values but not computed behavioral parameters. Documented in `docs/SERIALIZATION_CONTRACT.md`.
- **Private-field access**: Several cross-module private reads remain (documented in `docs/PRIVATE_ACCESS_AUDIT.md`). Low runtime risk but blocks clean module boundaries.
- **Knowledge propagation**: Currently limited to direct observation. RFC not implemented.
- **Grounding checker v1**: Current consistency checker is functional but simple. v2 RFC exists but is not implemented.

### Architecture Constraints
- **No full deterministic replay**: Seeded RNG provides a simulation baseline for core paths. SDK/presentation paths are not deterministic. Full replay requires future work.
- **Single-process only**: No multi-process or distributed simulation support.
- **SQLite optional**: `better-sqlite3` requires native compilation. `npm install` succeeds without it, but `SQLiteStore` throws a clear error.
- **Domain presets are examples**: Campus and tavern presets are reference implementations. Custom domains may need tuning.

### Performance
- **Cross-machine comparison unreliable**: Timing varies by CPU, OS, thermal state. Use `npm run perf:calibrate` for local baselines.
- **Single-run variance high**: Use `--runs=3` for stable results.
- **Social contagion scales with agent count**: 300 agents × 20 ticks takes ~4 seconds on reference hardware.

---

## License

AGPL-3.0-only

Commercial licensing available for proprietary use. Contact the maintainer for details.

---

## Links

- [README](../README.md)
- [Public API Contract](PUBLIC_API_CONTRACT.md)
- [World Schema](WORLD_SCHEMA.md)
- [Serialization Contract](SERIALIZATION_CONTRACT.md)
- [Performance](PERFORMANCE.md)
- [Domain Configuration](DOMAIN.md)
- [Architecture Audit](CLEAN_ARCHITECTURE_FINAL_AUDIT.md)
