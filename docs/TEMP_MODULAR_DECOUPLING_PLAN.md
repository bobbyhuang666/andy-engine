# Andy Engine Temporary Modular Decoupling Plan

> **Historical document.**
> This temporary plan has been superseded by the completed Clean Architecture Pass.
> Current source of truth: `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md`,
> `docs/PUBLIC_FACADE_AUDIT.md`, and `docs/LEGACY_REMOVAL_REPORT.md`.
>
> Status: temporary planning document.
> Date: 2026-06-19.
> Scope: Andy Engine only.
> Purpose: guide the next decoupling and stabilization pass before any new feature expansion.
>
> This is not an API contract, not a release plan, and not permission to implement all listed modules.
> If this document conflicts with `LONG_TERM_EXECUTION_ROADMAP.md`, the roadmap wins unless this plan is explicitly accepted and merged into it.

---

## 1. Why This Temporary Plan Exists

Andy Engine has reached a dangerous but productive point.

It now contains the beginning of a real persistent-world engine:

```text
psychological state
  -> action tendency
  -> selected action / reasonTrace
  -> event
  -> world fact
  -> per-agent knowledge
  -> event consequences
  -> memory / relationship / location / future tendency
  -> grounded expression
```

At the same time, adjacent branches and backups show how easily the engine can grow into a mixed system:

```text
engine core
  + adventure/RPG layer
  + player system
  + quest system
  + item system
  + fantasy/cultivation domain logic
  + status board
  + presentation UX
```

Those upper-layer systems are useful, but not all of them belong in core.

The next phase should therefore be:

```text
decouple and stabilize before expanding
```

Not:

```text
add more gameplay systems
```

Not:

```text
rewrite Agent.tick
```

Not:

```text
move everything into packages immediately
```

The immediate goal is to freeze the conceptual boundaries so future work does not turn Andy Engine into a large, fragile, all-in-one RPG/chat/demo framework.

---

## 2. Current Framework Snapshot

Current Andy Engine can be grouped into six broad areas.

### 2.1 Simulation Core

Current files:

```text
core/World.js
core/Simulator.js
core/EventDispatcher.js
core/RNG.js
core/WorldPressure.js
domain/DomainRegistry.js
config/defaults.js
```

Responsibilities:

- simulation time
- tick scheduling
- world environment
- agent registry
- event dispatch
- seeded random source
- domain resolution
- runtime-level pressure computation

Risk:

- this layer can easily absorb upper-layer gameplay concepts if not guarded
- `Simulator` is becoming the integration hub for facts/effects/action flow
- any new branch must avoid turning `Simulator` into a hidden product layer

### 2.2 Agent Psychology

Current files:

```text
agent/Agent.js
agent/BehaviorField.js
agent/EmotionVector.js
agent/NeedsSystem.js
agent/PersonalMemory.js
agent/Personality.js
agent/Appraisal.js
agent/EmotionRegulation.js
agent/IntrinsicMotivation.js
agent/ProceduralMemory.js
agent/Schedule.js
agent/FutureTendencyTracker.js
agent/LocationMeaningInfluence.js
```

Responsibilities:

- internal psychological state
- needs, emotion, memory, appraisal, habit
- continuous behavior field
- location meaning influence
- future tendency vectors

Risk:

- `Agent.js` remains the most dangerous file because it coordinates too much
- new consequences must not be added as direct internal mutations
- new behavior must not bypass `BehaviorField`

### 2.3 Action And Intention Layer

Current files:

```text
agent/action/ActionCandidate.js
agent/action/UtilityScorer.js
agent/action/UtilitySelector.js
agent/action/GoalSystem.js
agent/action/WorldObject.js
agent/action/providers/*
```

Responsibilities:

- generate reasonable candidates
- score candidates from pressure/context
- sample among reasonable candidates with seeded RNG
- produce `ReasonTrace`
- model early goal/object concepts

Correct role:

```text
Action selection is an intention/pressure layer.
It is not the final world history authority.
```

Risk:

- UtilitySelector can accidentally become a second behavior engine
- WorldObject can accidentally become an RPG inventory system
- GoalSystem can accidentally become prompt-driven task logic

### 2.4 WorldCanon And Knowledge

Current files:

```text
facts/WorldFactStore.js
facts/FactSchema.js
facts/CanonEventPipeline.js
facts/KnowledgeStore.js
facts/FactProvider.js
facts/FactConsistencyChecker.js
facts/FactFormatter.js
facts/FactEmitter.js
```

Responsibilities:

- store what is true
- turn dispatched events into facts
- track who knows which facts
- create perspective-safe grounding packages
- block unsupported grounded expression

Current important rule:

```text
AGENT_STATE is stored as world data, but read-time epistemic filtering treats other agents' state as private.
Only self agent_state enters allowedFacts by default.
```

Risk:

- `FactStore` contains truth, but `FactProvider` must filter perspective
- observer knowledge can leak destination/intent if event descriptions are too rich
- `FactConsistencyChecker` is regex-based and should stay a last defense, not the primary privacy mechanism

### 2.5 Domain And World Data

Current files:

```text
domain/DomainRegistry.js
domain/validateDomain.js
presets/campus/index.js
presets/tavern/index.js
world/WorldStateAdapter.js
world/validator.js
world/compiler.js
world/migration.js
```

Responsibilities:

- domain config contract
- domain-specific vocabulary and rules
- stable world envelope tooling
- runtime snapshot adapter
- migration/compiler tooling

Risk:

- domain packs can creep into core semantics
- `world/` tooling can accidentally become public API too early
- future fantasy/cultivation/oak-town content must stay domain pack or extension, not core

### 2.6 SDK / Presentation / Storage

Current files:

```text
sdk/Character.js
sdk/NarrativeBuilder.js
sdk/Andy.js
sdk/LLMAdapter.js
store/*
examples/*
demo/*
```

Responsibilities:

- high-level usage
- prompt construction
- LLM adapter
- persistence
- examples and demos

Risk:

- SDK can bypass core seams by mutating agent memory/relationship directly
- NarrativeBuilder can accidentally become a source of world facts
- presentation needs can pressure core into product-specific logic

---

## 3. Future Framework

The future framework should be understood as layered capabilities, even if the repository remains a single package for now.

```text
Presentation Apps
  -> Extensions
  -> Domain Packs
  -> Action / Effects / WorldCanon
  -> Core Runtime + Psychology
```

Lower layers must not import upper-layer concepts.

### 3.1 andy-core

Owns:

- time
- tick scheduling
- world state
- agent lifecycle
- event dispatch
- seedable RNG
- domain config loading
- serialization hooks

Does not own:

- player
- quest
- inventory
- status board
- fantasy race
- cultivation realm
- romance/companion UX
- Bobby
- Andy Town

### 3.2 andy-psychology-runtime

Owns:

- needs
- emotion
- memory
- relationship
- habit
- appraisal
- personality
- intrinsic motivation
- `BehaviorField`
- future tendency

Core idea:

```text
experiences change future tendencies through psychological state
```

### 3.3 andy-world-canon

Owns:

- facts
- events
- knowledge
- observation
- inference
- forbidden facts
- grounding package
- consistency checking

Core idea:

```text
what is true is not the same as who knows it
```

### 3.4 andy-action-intention

Owns:

- `ActionCandidate`
- candidate providers
- utility scoring
- weighted selection
- `ReasonTrace`
- selected action to canon event adapter

Does not own:

- world truth
- final event history
- direct state mutation

### 3.5 andy-effects

Owns:

- event consequence calculation
- state deltas
- memory deltas
- relationship deltas
- location meaning deltas
- future tendency deltas

Core idea:

```text
if an event does not change future behavior, it is only text
```

### 3.6 andy-domain-packs

Owns:

- region names
- state names
- state centers
- event templates
- narrative templates
- need mappings
- event consequence rules
- location meaning types
- domain-specific vocabulary

Examples:

```text
campus
tavern
future fantasy
future cultivation
future oak-town
```

Rule:

```text
domain-specific meaning lives in domain packs, not core
```

### 3.7 andy-extensions

Owns upper-layer systems such as:

- AdventureAdapter
- PlayerAgent
- ItemSystem
- QuestSystem
- WorldRuleSystem
- StatusBoard
- FantasyExtension

These are valid future modules, but they should not be core modules.

They should depend on engine seams:

- `CanonEventPipeline`
- `KnowledgeStore`
- `FactProvider`
- `EventEffectPipeline`
- domain config
- approved WorldObject / affordance APIs

### 3.8 Presentation Apps

Owns:

- Bobby
- Andy Town
- Character Lab
- Adventure UI
- chat UI
- map UI

They may read:

- grounding package
- world state snapshot
- event log
- reasonTrace
- narrative context

They must not:

- invent world facts through prose
- directly mutate agent internals
- treat UI map state as engine truth
- bypass CanonEventPipeline for canon-bearing changes

---

## 4. Backup Comparison Lessons

The 2026-06-14 backup is useful as a warning and a reference.

It contains useful ideas:

- `SelectedActionToCanonEvent`
- architecture boundary docs
- known boundary violation registry
- boundary check script
- core-loop fixture tests
- observer/grounding privacy hardening ideas

It also contains modules that should not be absorbed into core as-is:

- `PlayerAgent`
- `ItemSystem`
- `QuestSystem`
- `WorldRuleSystem`
- `AdventureAdapter`
- `StatusBoard`
- `FantasyExtension`
- `presets/fantasy`
- `presets/cultivation`

Reason:

```text
They are extension/domain/presentation candidates, not persistent-world core.
```

The backup shows Andy Engine's expansion pressure. It wants to grow gameplay, UI, player systems, and fantasy semantics. That is promising, but dangerous if not separated.

---

## 5. Important Technical Gaps

These are the gaps to resolve before new expansion.

### 5.1 Event Target Metadata

Current risk:

```text
move event location may represent origin, while consequences should often apply to destination
```

Example:

```text
Bobby moves from 广场 to 酒馆

event.location = 广场
event._metadata.explicitTo = 酒馆
```

Correct consequence target:

```text
locationMeaning update -> 酒馆
futureTendency update -> 酒馆
```

Temporary guidance:

- preserve event metadata when converting event to EventFact
- apply move consequences to explicit destination when present
- keep event occurrence location and consequence target conceptually separate

Do not hardcode this only for tavern.

### 5.2 Observer Redaction

Current risk:

```text
observer gets full EventFact description and learns more than they could observe
```

Desired model:

```text
participant: full event knowledge
observer: observed partial knowledge
same-location public listener: overheard limited knowledge
non-observer: no knowledge
```

Temporary guidance:

- do not rely on checker after the prompt
- redaction must happen before grounding reaches NarrativeBuilder
- observer-only event facts may need perspective-specific copies or redacted views

### 5.3 Location Meaning Visibility

Current risk:

```text
location meaning facts may become public and leak meaning to agents who never experienced or learned that place
```

Desired model:

- current location meaning can be known by being there
- remote location meaning requires explicit knowledge or memory
- location meaning in grounding should be perspective-aware

### 5.4 FactEmitter Legacy Boundary

Current status:

```text
CanonEventPipeline is the main event -> fact -> knowledge path.
FactEmitter.emitEventFacts is legacy/fallback.
```

Temporary guidance:

- do not create new primary event fact paths through FactEmitter
- mark fallback behavior clearly
- future cleanup may deprecate or remove unused fallback methods

### 5.5 Action Selection Boundary

Current risk:

```text
UtilitySelector becomes a behavior engine and bypasses BehaviorField
```

Temporary guidance:

- selected action must become a canon event or pressure source
- it must not directly mutate agent state
- ReasonTrace must explain selection and random draw
- BehaviorField remains the continuous tendency core

### 5.6 Adventure Layer Pressure

Current risk:

```text
player / quest / item / status board concepts re-enter core
```

Temporary guidance:

- model core abstractions first:
  - external actor
  - commitment fact
  - world object
  - affordance
  - rule fact
  - deadline pressure
- map adventure semantics onto those abstractions in extensions

---

## 6. Proposed Temporary Phases

These phases are intentionally conservative.

### T0: Stabilize Current Main

**Status: ✅ COMPLETED**

Goal:

```text
ensure current main is a clean checkpoint before decoupling
```

Tasks:

- run full validation
- confirm no `.tgz`, coverage, database, or temporary artifacts are staged
- ensure README claims match code state
- ensure `ARCHITECTURE_SNAPSHOT.md` does not call WIP features stable if they are experimental

Commands:

```bash
npm test
npm run test:domain
npm run smoke:pack
npm run perf:check
git diff --check
```

Acceptance:

- all pass
- no blocking P0/P1 audit findings
- no npm publish

### T1: Boundary Governance

**Status: ✅ COMPLETED**

Goal:

```text
freeze old debt and block new boundary violations
```

Tasks:

- create or update `docs/ARCHITECTURE_BOUNDARIES.md`
- create or update `docs/KNOWN_BOUNDARY_VIOLATIONS.md`
- add `scripts/check-boundaries.js`
- add `tests/architecture/*`

Important:

- do not copy backup scripts blindly
- adapt checks to the current repository
- do not reference missing files like `AdventureAdapter.js` if they are not present

Acceptance:

- boundary script passes
- architecture tests pass
- package script added only after script is stable

### T1.1: Boundary Truth Fix

**Status: ✅ COMPLETED**

Goal:

```text
correct World Truth Authority documentation to match actual codebase
```

Tasks:

- update `docs/ARCHITECTURE_BOUNDARIES.md` §4.1 to list all authorized WorldFact writers
- clarify `CanonEventPipeline` is the primary dispatched event → fact entry point
- clarify `FactEmitter` event fallback is legacy and must not be extended
- move V5 (`facts/` Date.now fallback) from tolerated to resolved in `KNOWN_BOUNDARY_VIOLATIONS.md`
- add resolved violation section
- align `scripts/check-boundaries.js` allowed imports with `tests/architecture/boundary-check.test.js`

Acceptance:

- `npm run check:boundaries` passes
- `npm test` passes (architecture tests included)
- documentation matches actual codebase state

### T2: Event Metadata And Consequence Target

Goal:

```text
separate event occurrence location from consequence target
```

Tasks:

- preserve event `_metadata` in EventFact where safe
- support destination target for move-like events
- ensure EventEffectPipeline uses target location for location meaning and future tendency
- add tests for origin vs destination

Acceptance:

```text
Bobby moves 广场 -> 酒馆
EventFact.location = 广场
EventFact._metadata.explicitTo = 酒馆
LocationMeaning update = 酒馆
FutureTendency update = 酒馆
广场 is not incorrectly updated as the destination consequence
```

### T3: Perspective Redaction

Goal:

```text
grounding reveals only what the agent can know
```

Tasks:

- define redaction rules for observer-only facts
- ensure non-observers cannot infer hidden destination from public fields
- ensure forbiddenFacts are redacted before any prompt/debug surface
- keep full canonical fact in WorldFactStore
- make FactProvider responsible for perspective view

Acceptance:

- actor grounding includes full destination
- observer grounding includes partial observation only
- non-observer grounding includes neither actor event nor hidden destination
- NarrativeBuilder prompt does not contain forbidden destination
- checker rejects unsupported claims as last defense

### T4: SelectedActionToCanonEvent Seam

Goal:

```text
formalize selected action -> canon event conversion
```

Tasks:

- introduce a pure adapter only if needed
- input: selectedCandidate, agent, context
- output: canon-ready event
- no state mutation
- no LLM
- no direct world fact write

Acceptance:

- known action types map to events
- unknown action types return null or explicit unsupported result
- observers come from context, not hardcoded
- event metadata carries source action and trace ID

### T5: Extension Classification

Goal:

```text
prepare Adventure/Fantasy/Player systems without merging them into core
```

Tasks:

- classify backup modules:
  - extension candidate
  - domain pack candidate
  - core abstraction candidate
  - reject/defer
- write extension boundary notes
- do not copy modules into core

Acceptance:

- no `PlayerAgent`, `QuestSystem`, `ItemSystem`, `AdventureAdapter`, `StatusBoard`, `FantasyExtension` in core
- future extension plan exists

### T6: Documentation Alignment

Goal:

```text
make README and docs tell the same architecture story
```

Tasks:

- align English and Chinese README sections
- add Chinese architecture tree if missing
- remove or soften subjective benchmark claims
- describe facts/grounding as experimental opt-in
- mention npm package has not been published

Acceptance:

- README does not overclaim production maturity
- Chinese and English sections share the same core structure
- current architecture docs do not contradict roadmap

### T7: Legacy Debt Cleanup Preparation

**Status: ✅ COMPLETED (2026-06-19)**

Goal:

```text
prepare structured cleanup plan for tolerated legacy boundary debt before any new feature work
```

Context:

T0/T1/T1.1 stabilized the boundary governance layer. The next step is NOT feature expansion. It is systematic cleanup of the remaining legacy debt documented in `KNOWN_BOUNDARY_VIOLATIONS.md` and `TECHNICAL_DEBT.md`.

Tasks:

- create `docs/TEMP_LEGACY_DEBT_CLEANUP_PLAN.md`
- categorize each debt item as D1–D6
- for each item: document current location, risk, allowed cleanup, forbidden cleanup, tests required, stop condition
- explicitly forbid: StoryArc, Adventure, PlayerAgent, QuestSystem, ItemSystem, Fantasy/Cultivation, UI, Bobby, Andy Town, npm publish
- define verification commands for each cleanup phase

What was done:

- `docs/TEMP_LEGACY_DEBT_CLEANUP_PLAN.md` created with D1–D6 categorized.
- D1 (SDK direct memory mutation): ✅ resolved — `agent.recordExternalExperience()` seam added, boundary check enforces SDK no longer calls `agent.memory.addExperience` directly.
- D2 (campus legacy config in core): ✅ resolved — spatial config moved to `presets/campus/`, semantic categories made domain-agnostic.
- D3 (campus legacy schedule in Agent): ✅ resolved — schedule data moved to `presets/campus/schedules.js`, legacy wrappers remain for backward compat.
- D4 (World/SocialGraph boundary): ✅ accepted architecture exception — `social/` documented as peer-owned subsystem.
- D5 (deterministic replay debt): ✅ documentation-resolved / accepted boundary — seeded simulation baseline complete, non-seeded fallback and SDK/tooling Date.now() are scope exclusions.
- D6 (Agent.js complexity): ✅ preparation documented — handler extraction plan in TECHNICAL_DEBT.md, no code split in this phase.

Acceptance:

- cleanup plan document exists
- each debt item has a concrete resolution path with stop conditions
- forbidden scope is explicit
- plan does not introduce new features or expand Stable World Envelope

Important:

```text
T7 preparation is complete. D1–D6 are resolved/accepted/documented.
This does NOT mean all future debt is permanently eliminated.
Remaining legacy patterns (legacy Schedule wrappers, Agent.js complexity, non-seeded Date.now/Math.random fallback) are accepted boundaries with documented resolution paths.
The next phase after T7 is T2–T5 (WorldCanon / Observation / Knowledge Minimal Closure), not new feature implementation.
```

---

## 7. What Not To Do Next

Do not:

- merge backup wholesale
- add AdventureAdapter to core
- add PlayerAgent to core
- add QuestSystem to core
- add ItemSystem/inventory to core
- add fantasy/cultivation presets to main core preset set without explicit domain-pack status
- implement StoryArc runtime
- make FactConsistencyChecker the primary privacy mechanism
- let LLM write world truth
- replace BehaviorField with behavior tree logic
- start ECS/native/shared-memory refactors
- publish npm

The engine is strong enough to attract features now. That is exactly why feature restraint matters.

---

## 8. Reviewer Checklist

Reject a proposed change if:

- it imports extension/presentation concepts into core
- it introduces `Date.now()` or `Math.random()` in deterministic runtime paths
- it lets an LLM invent or commit world facts
- it mutates private agent state without structured deltas
- it bypasses CanonEventPipeline for canon-bearing events
- it places domain-specific vocabulary into core
- it exposes other agents' private `AGENT_STATE` in grounding
- it lets observer-only facts leak full destination/intent
- it calls something "closed loop" without showing future behavior tendency changed
- it calls something "domain-agnostic" while hardcoding a domain scenario
- it adds RPG/player/status-board semantics to core

---

## 9. Suggested Execution Message For Future AI

If an execution AI needs the next assignment, give it this:

```text
Read docs/LONG_TERM_EXECUTION_ROADMAP.md and docs/TEMP_MODULAR_DECOUPLING_PLAN.md.

Do not add new gameplay systems.
Do not merge backup modules wholesale.

Start with T0/T1:
1. Validate current main.
2. Add architecture boundary governance docs/tests/scripts adapted to the current repo.
3. Do not reference missing backup files.
4. Keep Adventure/RPG/Fantasy systems as extension candidates only.
5. Report exact files changed and tests run.
```

If T0/T1 is already done, continue to T2:

```text
Preserve CanonEvent metadata and make move-event consequences target explicitTo when present.
Add tests proving origin and destination are not confused.
```

---

## 10. Temporary Conclusion

Andy Engine's next strength will come from separation:

```text
Core remains small and universal.
WorldCanon becomes the truth/knowledge center.
Action selection remains a traceable intention layer.
Event effects sediment consequences into the future.
Adventure/Fantasy/Bobby/Andy Town grow above the engine, not inside it.
```

The current priority is not more intelligence.

The current priority is:

```text
clean boundaries, traceable loops, perspective-safe grounding
```
