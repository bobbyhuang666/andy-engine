# Andy Engine Long-Term Execution Roadmap

> Status: authoritative execution roadmap for post-v0.2.1 architecture work.
> Audience: architect AI, execution AI, reviewer AI.
> Scope: Andy Engine only.
>
> This document exists to prevent direction drift. If an AI agent is unsure what to do next, it should read this file and continue from the next uncompleted phase instead of asking for a new product direction.

---

## 0. Current Baseline

Current repository baseline:

```text
Andy Engine v0.2.1
Domain-agnostic runtime foundation
Persistent-world internal tooling
Seeded RNG baseline
Performance baseline
Memory / Goal / WorldObject / StoryArc RFCs
Action-selection integrated (shadow/event/dryRunEffects/active modes)
EventEffectPipeline wired into action selection
Facts system opt-in (enableFacts flag)
```

Current stable expectations:

- `new AndyEngine()` defaults to campus preset for backward compatibility.
- `new AndyEngine({ domain })` supports custom domains.
- Core runtime should remain domain-agnostic.
- `BehaviorField` is the psychological tendency core.
- `StateMachine` is metadata/history only.
- `world/` tooling is internal ecosystem tooling, not a public stable API.
- `runtimeSnapshot` is opaque and must not leak private runtime structure into Stable World Envelope.
- Action selection is opt-in via `actionSelection` config (default: disabled).
- EventEffectPipeline is wired into action selection for dryRun/active modes.
- StoryArc runtime is not approved.

Current opt-in subsystem status:

```text
All action-selection, EventEffectPipeline, WorldPressure, and facts modules are tracked on main.
Shadow action-selection exists in Agent.tick() at step 9.5 and is test-backed.
ReasonTrace history exists in runtimeSnapshot.
CandidateProvider / UtilityScorer / UtilitySelector / GoalSystem / WorldObject pure modules exist.
EventEffectPipeline is wired into Agent._runShadowActionSelection() for dryRun/active modes.
WorldPressure is a pure read-only module available to action context.
Facts system is opt-in via enableFacts flag (default false).
```

Current accepted limitation:

```text
Action selection is integrated into Agent.tick() at step 9.5 with four modes:
  shadow       — records reasonTrace only, no event emission
  event        — emits action_selected event to EventDispatcher
  dryRunEffects — computes stateDeltas via EventEffectPipeline without mutation
  active       — applies allowed stateDeltas to live agent state
Default mode is shadow (no behavior change unless explicitly enabled).
EventEffectPipeline is wired into Agent._runShadowActionSelection().
WorldPressure is a pure read-only module available to action context but not directly imported by Agent.
Active writeback is gated and only applies allowlisted deltas (needs, emotion, memory).
WorldObject exists as a pure model but is not a perception/candidate/effect source.
StoryArc remains paused.
```

Therefore, the next architecture track is not "add more subsystems" and not
"make the behavior tree stronger".
It is:

```text
close the WorldCanon / Observation / Knowledge loop safely, one gate at a time
```

---

## 1. Project Identity

Andy Engine is a:

```text
psychology-driven multi-agent persistent world engine
```

It is not:

- a chatbot SDK
- a dating/companion app
- Bobby
- Andy Town
- a UI/map engine
- a prompt framework

Andy Engine owns:

- persistent world state
- agent psychological state
- behavior tendency
- memory
- relationships
- events
- domain rules
- world evolution
- reproducible simulation research infrastructure

Andy Engine does not own:

- Bobby human-feel product design
- romance/companionship UX
- Andy Town rendering/map/UI
- notification/chat bubble UX
- raw LLM personality performance

If a request belongs to Bobby, Andy Town, or UI/presentation, do not implement it in engine core.

---

## 2. Andy Engine Mother Architecture v0.1

Andy Engine's long-term architecture is no longer defined as "a behavior tree",
"a chat memory system", or "an AI character framework".

The mother architecture is:

```text
Andy Engine = World fact authority
            + event consequence sedimentation
            + local character knowledge
            + future tendency evolution
            + grounded expression
```

Andy Engine is a **computable living-world engine**. It maintains a world causal
layer where agents, places, objects, relationships, memories, rules, and world
structure are changed by events over time.

### 2.1 Two-Level Mother Architecture

Andy Engine uses a two-level mother architecture.

The first level is the **runtime pipeline architecture**. This guides current
engineering work:

```text
Reality Layer / WorldCanon
  -> Observation / Knowledge Layer
  -> State & Pressure Layer
  -> Intention / Action Selection Layer
  -> Canon Event + Event Effect Pipeline
  -> Grounded Expression Layer
```

The second level is the **world ontology extension table**. This prevents future
systems from having nowhere to live:

```text
Time
Fact / WorldCanon
Event
Agent
Place / Spatial
Object / Resource
Relation
Memory
Observation / Knowledge
Rule / Norm
Mutation
```

Current development prioritizes the first level. Future systems must map to the
second-level root abstractions, then pass through the first-level runtime pipeline
to produce consequences.

### 2.2 Runtime Pipeline Is A Loop

The runtime pipeline is not a one-way data pipe. It is a causal loop:

```text
WorldCanon
  -> Observation / Knowledge
  -> State & Pressure
  -> Intention / Action Selection
  -> CanonEvent
  -> EventEffectPipeline
  -> WorldCanon / Knowledge / Memory / Relationship / LocationMeaning / State
  -> next State & Pressure
```

If an event does not change the future, it is only narrative text. It is not an
Andy world event.

### 2.3 Layer Definitions

#### 2.3.1 Reality Layer / WorldCanon

Maintains what is true in the world.

This layer includes:

- static world facts
- dynamic state facts
- structured event facts
- relationship facts
- location facts
- rule facts
- invalidated or superseded facts

Current `facts/` is a foundation. It is a `WorldFactStore`, not yet the complete
WorldCanon.

#### 2.3.2 Observation / Knowledge Layer

Maintains who knows what, who saw only part of an event, and who knows nothing.

This is a key distinction between Andy Engine and ordinary LLM character systems.
One CanonEvent must not automatically become identical knowledge for every
character.

Knowledge is not Memory:

- Knowledge means what a character knows as a fact.
- Memory means how the character remembers it and how it changes future behavior.

#### 2.3.3 State & Pressure Layer

Maintains behavior tendency sources, not direct actions.

Pressure sources include:

- needs
- emotion
- memory salience
- relationship gravity
- location meaning
- world pressure
- time pressure

These pressures shape future candidate generation and scoring. They do not own
world fact authority.

#### 2.3.4 Intention / Action Selection Layer

Utility Selector or behavior tree logic belongs here.

This layer chooses from reasonable candidates. It does not own world facts and it
must not directly rewrite the world.

It outputs:

- action candidate
- selected action
- reasonTrace

It does not output final world history. Final history begins at CanonEvent.

#### 2.3.5 Canon Event + Event Effect Pipeline

After an action is selected, it must first become a CanonEvent.

CanonEvent is the fact entry point. EventEffectPipeline is the consequence
propagator.

Required consequence path:

```text
CanonEvent
  -> agent state delta
  -> knowledge update
  -> memory update
  -> relationship update
  -> location meaning update
  -> world fact update
  -> future behavior tendency
```

Action Selection must not directly mutate these targets. It can only produce a
selected action and trace. Mutation flows through CanonEvent and the effect
pipeline.

#### 2.3.6 Grounded Expression Layer

LLM is expression only.

LLM may express:

- known facts
- observed facts
- memory summaries
- relationship state
- reason traces
- emotional tone

LLM may not create:

- new world facts
- new locations
- new characters
- new events
- new relationship changes
- facts the speaking character does not know

Principle:

```text
Facts are not invented.
Expression is flexible.
Inference must be traceable.
```

If LLM output proposes a world-affecting change, it must become a structured
proposal/event and pass validation before it can enter WorldCanon.

### 2.4 World Ontology Placement Rule

Future system proposals must answer these questions before implementation:

1. Which Facts does it add or invalidate?
2. Which Events does it generate?
3. Which Agents does it affect?
4. Which Places does it affect?
5. Which Objects or Resources does it involve?
6. Which Relations does it change?
7. Which Memories does it create or alter?
8. Who can Observe or Know it?
9. Which Rules or Norms constrain it?
10. Can it trigger a Mutation?
11. What is the minimum runnable slice?

If a proposal cannot answer these questions, it remains an RFC.

### 2.5 Current Runnable Slice

The current implementation target is not a broad life simulator. The next
runnable slice is:

```text
Bobby moves from tavern hall to back yard at 21:30 and stays there for 25 minutes.
Mira only sees Bobby leave the hall.
Leo does not know where Bobby went.
Bobby can say he went to the back yard.
Mira cannot claim she knows Bobby went to the back yard.
Leo cannot claim he knows the event.
This event changes Bobby's location meaning for hall/back yard.
Future pressure makes Bobby more likely to choose the back yard.
```

This slice validates:

- one world truth
- partial character knowledge
- grounded expression
- location meaning change
- event consequences
- future tendency change

Do not jump to birth/death, law systems, full object economy, large map import,
or StoryArc runtime before this slice is complete.

### 2.6 Immediate Track Rename

The current track should no longer be described only as "behavior system" work.

The current track is:

```text
WorldCanon / Observation / Knowledge Minimal Closure
```

The required closure is:

```text
selected action
  -> CanonEvent
  -> ObservationFacts
  -> KnowledgeFacts
  -> MemoryFacts
  -> LocationMeaning delta
  -> FutureTendency delta
  -> GroundedNarrative
```

Behavior selection remains necessary, but it is now a subordinate implementation
layer inside the larger world-fact loop.

### 2.7 Modular Boundary Framework

The next architectural direction is **decoupling**, not feature accumulation.

Andy Engine must not grow into a single package that mixes:

```text
core simulation
  + adventure/RPG mechanics
  + player inventory
  + quest systems
  + fantasy/cultivation semantics
  + status boards
  + presentation UX
```

Those are valid upper-layer uses of Andy Engine, but they are not all engine
core.

The future framework is organized around one clean core and four extension
surfaces:

```text
Andy Engine Ecosystem

1. andy-core
   Persistent world runtime and simulation authority.

2. andy-psychology-runtime
   Agent psychological state and behavior tendency systems.

3. andy-world-canon
   Facts, knowledge, observation, grounding, and consistency boundaries.

4. andy-domain-packs
   Domain configs, world presets, and world-specific vocabulary/rules.

5. andy-extensions
   Adventure, Bobby, Andy Town, RPG, fantasy/cultivation, and other upper layers.
```

This does not require an immediate monorepo/package split. It is first a
conceptual and review boundary. Directory moves should happen only after the
runtime seams are stable.

#### 2.7.1 Current Framework

Current Andy Engine can be understood as these blocks:

```text
Andy Engine Current Framework

1. Simulation Core
   - World
   - Simulator
   - EventDispatcher
   - RNG
   - DomainRegistry

2. Agent Psychology
   - BehaviorField
   - EmotionVector
   - NeedsSystem
   - PersonalMemory
   - Appraisal
   - Personality
   - IntrinsicMotivation
   - EmotionRegulation
   - ProceduralMemory
   - Schedule

3. Action / Pressure Layer
   - CandidateProvider
   - UtilityScorer
   - UtilitySelector
   - ReasonTrace
   - GoalSystem
   - WorldPressure
   - FutureTendencyTracker
   - LocationMeaningInfluence

4. WorldCanon / Knowledge
   - WorldFactStore
   - FactSchema
   - CanonEventPipeline
   - KnowledgeStore
   - FactProvider
   - FactConsistencyChecker
   - FactFormatter

5. Domain / World Data
   - presets/campus
   - presets/tavern
   - domain/validateDomain
   - world/WorldStateAdapter
   - world/validator
   - world/compiler
   - world/migration

6. Presentation / SDK / Storage
   - sdk/Character
   - sdk/NarrativeBuilder
   - sdk/Andy
   - store/SQLiteStore
   - examples
   - demo
```

Current runtime direction:

```text
World / Simulator tick
  -> Agent psychological state updates
  -> BehaviorField evolves 4D behavior vector
  -> Action candidates / utility scoring / reasonTrace
  -> EventDispatcher
  -> CanonEventPipeline
  -> WorldFactStore + KnowledgeStore
  -> EventEffectPipeline
  -> Memory / LocationMeaning / FutureTendency
  -> FactProvider grounding
  -> NarrativeBuilder / LLM expression
```

#### 2.7.2 Future Framework

Future Andy Engine should separate engine core, extension layers, domain packs,
presentation apps, and tooling.

```text
Future Andy Framework

andy-core/
  - time
  - tick scheduling
  - world state
  - event dispatch
  - seedable RNG
  - domain config loading
  - runtime serialization hooks

andy-psychology-runtime/
  - needs
  - emotion
  - memory
  - relationship
  - habit
  - appraisal
  - personality
  - intrinsic motivation
  - BehaviorField
  - future tendency

andy-world-canon/
  - facts
  - events
  - knowledge
  - observation
  - inference
  - forbidden facts
  - grounding package
  - consistency check

andy-action-intention/
  - ActionCandidate
  - CandidateProvider
  - UtilityScorer
  - UtilitySelector
  - ReasonTrace
  - SelectedActionToCanonEvent

andy-effects/
  - EventEffectPipeline (dependency leaf at effects/)
  - state deltas
  - memory deltas
  - relationship deltas
  - location meaning deltas
  - future tendency deltas

andy-domain-packs/
  - campus
  - tavern
  - future fantasy/cultivation/Oak Town packs

andy-extensions/
  - adventure/RPG layer
  - player projection
  - item/inventory systems
  - quest/commitment systems
  - rule/lock systems
  - status board / GM view

presentation-apps/
  - Bobby
  - Andy Town
  - Character Lab
  - Adventure UI
```

The intended dependency direction is one-way:

```text
Presentation Apps
  -> Extensions
  -> Domain Packs
  -> Action / Effects / WorldCanon
  -> Core Runtime + Psychology
```

Lower layers must not import upper-layer concepts.

#### 2.7.3 Core Boundary Rules

Andy core must not know:

- player
- quest
- inventory
- cultivation
- fantasy race
- romance
- companion UX
- status board
- UI map
- Bobby
- Andy Town

Andy core may know:

- external actor
- controlled agent
- world object
- affordance
- commitment fact
- deadline pressure
- rule fact
- domain-defined attribute
- domain-defined pressure source

The difference matters:

```text
"quest" is an adventure-layer interpretation.
"commitment/deadline/obligation fact" can be core.

"inventory" is an RPG-layer interpretation.
"world object ownership / affordance / visibility" can be core.

"cultivation realm" is a domain-layer interpretation.
"domain-defined agent attribute" can be core.
```

#### 2.7.4 Extension Boundary Rules

Adventure/RPG systems are allowed as extensions, not core.

Extension candidates include:

- PlayerAgent
- ItemSystem
- QuestSystem
- WorldRuleSystem
- AdventureAdapter
- StatusBoard
- FantasyExtension
- cultivation/fantasy domain packs

These should depend on Andy Engine seams:

- CanonEventPipeline
- KnowledgeStore
- FactProvider
- EventEffectPipeline
- Domain config
- WorldObject / affordance APIs, once approved

They must not directly mutate:

- private agent psychological fields
- relationship internals
- memory internals
- BehaviorField labels
- world canon facts outside CanonEventPipeline / approved fact APIs

#### 2.7.5 Presentation Boundary Rules

Presentation apps consume engine output. They do not own world truth.

Allowed presentation inputs:

- grounding package
- world state snapshot
- event log
- reasonTrace
- narrative context
- public domain metadata

Forbidden presentation behavior:

- direct mutation of agent emotion/needs/memory/relationships
- inventing world facts through LLM prose
- treating UI/map state as engine truth
- bypassing EventDispatcher / CanonEventPipeline for canon-bearing changes

#### 2.7.6 Tooling Boundary Rules

World compiler, migration, domain builder, scenario runner, and benchmark runner
are tooling. They may create or transform structured data, but they are not the
runtime core.

Tooling outputs must be:

- structured
- validated
- versioned
- replayable when deterministic mode is declared

Tooling must not become hidden runtime logic.

#### 2.7.7 Near-Term Modular Boundary Phase

Before adding new Adventure/RPG/Fantasy systems, run a boundary split phase:

```text
Phase: Modular Boundary Split
```

Deliverables:

- `docs/MODULAR_BOUNDARY_PLAN.md`
- `docs/ARCHITECTURE_BOUNDARIES.md`
- `docs/KNOWN_BOUNDARY_VIOLATIONS.md`
- `scripts/check-boundaries.js`
- `tests/architecture/*`

Purpose:

- freeze current core boundaries
- document tolerated legacy debt
- prevent upper-layer concepts from re-entering core
- make future extensions possible without contaminating the engine

Do not use this phase to move files aggressively. Use it to establish review
rules first.

---

## 3. Long-Term Target

The long-term target is:

```text
Persistent World Engine
  + Persistent Subject Runtime
  + Traceable Psychological Action Selection
```

Legacy behavior-loop target:

```text
World state
  -> agent perception
  -> psychological state update
  -> BehaviorField continuous tendency
  -> action candidate generation
  -> utility scoring
  -> seeded weighted selection
  -> action event + reason trace
  -> effect pipeline
  -> memory / relationship / world / habit updates
  -> future behavior tendency
```

The intended effect is **constrained unpredictability**:

- The world can evolve in surprising ways.
- Randomness only chooses among reasonable candidates.
- Every result can be explained after the fact.
- Same seed + same world state can reproduce the same core evolution within the declared deterministic scope.

### 3.1 Engineering Subtarget: Behavior Closed-Loop Writeback

The final architecture target for the current track is:

```text
behavior closed-loop writeback
```

This means a selected action is not only a label, a narration hint, or a trace artifact. It must eventually become a structured world event whose effects feed back into the systems that shape future behavior:

```text
selected action
  -> action_selected event
  -> EventEffectPipeline
  -> needs / emotion / memory / relationship / location / world deltas
  -> validated state writeback
  -> updated future candidate scores and BehaviorField tendencies
  -> next selected action
```

The loop is only complete when all of these are true:

- the action was chosen from reasonable candidates, not hardcoded by core
- the selection is reproducible under the declared seeded scope
- the `ReasonTrace` explains why it was selected
- the event is written into the event log
- the effect pipeline returns explicit `stateDeltas`
- those deltas are applied through existing subsystem APIs, not by poking private fields
- the next tick can be influenced by the changed state
- disabling active action selection returns the engine to legacy behavior

This remains an important engineering subtarget. It is not the full mother
architecture. The higher target is WorldCanon / Observation / Knowledge Minimal
Closure.

Do not skip directly from shadow traces to large behavior rewrites. The loop must be closed in narrow, testable increments.

---

## 4. Non-Negotiable Architecture Guardrails

### 3.1 BehaviorField Remains Core

`BehaviorField` remains the psychological tendency core.

Allowed:

- candidate generation reads `BehaviorField.B`, gradient, velocity, label, confidence
- UtilitySelector projects tendencies into structured action events
- selected action creates traceable events

Forbidden:

- replacing `BehaviorField` with a behavior tree
- adding transition logic back into `StateMachine`
- directly setting `stateMachine.currentState` as decision logic
- UtilitySelector directly mutating agent state
- GoalSystem forcing behavior
- StoryArc forcing behavior

### 3.2 Domain-Agnostic Core

Core must not hardcode:

- campus
- tavern
- Oak Town
- Andy Town
- Bobby
- specific maps
- specific UI objects

Concrete regions, states, event templates, forbidden terms, need mappings, and place types must come from domain config or world state.

### 3.3 Stable Envelope Boundary

Do not extend Stable World Envelope casually.

Internal runtime fields such as:

- BehaviorField vectors
- emotion internals
- reason traces
- action candidates
- goal runtime internals
- object manager internals

should stay in `runtimeSnapshot` unless a separate public-schema RFC explicitly approves them.

### 3.4 Seeded Randomness

No new uncontrolled runtime randomness.

New runtime stochastic behavior must use the engine RNG.

Any feature claiming reproducibility must prove:

- RNG state before draw
- random draw value
- RNG state after draw
- full trace equality under same seed/state

Do not claim full deterministic replay if SDK/tooling/store/benchmark/presentation paths still use real time or uncontrolled randomness.

### 3.5 LLM Is Expression Layer

LLM may:

- express existing events
- summarize reason traces
- narrate memory/relationship state

LLM may not:

- decide world facts
- choose actions
- create unvalidated events
- mutate emotion/relationship/world state directly

Any LLM interpretation that enters the world must become a structured event and pass validation.

### 3.6 StoryArc Is High Risk

StoryArc must not be implemented automatically.

Until explicitly approved, StoryArc work may only:

- audit risks
- design safety tests
- document boundaries
- propose non-forcing feedback pathways

No active StoryArc runtime without human/reviewer approval.

---

## 5. Operating Rule For Architect AI

Do not ask:

```text
What do you want to do next?
```

Instead:

1. Read this roadmap.
2. Identify the first uncompleted phase.
3. Check working tree status.
4. Check tests.
5. Produce a short execution plan for the next phase.
6. Execute or assign execution.
7. Report using the required format.

Ask the user only when:

- a phase requires product-level approval
- a phase would change public API
- a phase would extend Stable World Envelope
- a phase would implement StoryArc runtime
- a phase requires destructive git operations
- tests cannot pass due to external dependency or environment blockage

---

## 6. Phase Gate Protocol

Every phase must pass these gates before the next phase starts:

- `npm test` passes.
- Focused tests for the phase pass.
- Domain tests pass if domain behavior is touched.
- Compatibility tests pass if SDK/public API is touched.
- No new uncontrolled runtime `Math.random()` or `Date.now()` in new core paths.
- Custom domain path does not leak campus-only terms.
- BehaviorField remains the behavior tendency core.
- Stable World Envelope is unchanged unless explicitly approved.
- Phase report is written.

If any gate fails, stop and write a blocking report. Do not continue to the next phase.

---

## 7. Required Report Format

Every phase report must include:

```text
Phase:
Status:
Changed files:
Tests run:
Test result:
Behavior semantics changed:
Replay/determinism status:
Domain-safety status:
Stable Envelope status:
ReasonTrace status:
Known limitations:
Not implemented:
Next recommended phase:
```

If behavior semantics changed, include:

```text
Old behavior:
New behavior:
Why acceptable:
Tests covering the change:
Rollback plan:
```

If a phase is only partially complete, say:

```text
Status: PARTIAL / BLOCKED
```

Do not report "complete" just because tests pass.

---

## 8. Phase 25.5: Preflight Cleanup

Goal: establish a clean baseline before large action-selection work.

Tasks:

- Inspect `git status`.
- Resolve any existing dirty working tree changes.
- If a change improves deterministic replay, add tests before committing.
- Verify package smoke and performance baseline if runtime files are touched.

Current known possible preflight item:

```text
agent/PersonalMemory.js may contain a local deterministic memory-id patch.
```

Acceptance criteria:

- working tree is clean or all intentional changes are documented
- `npm test` passes
- `npm run test:domain` passes
- `npm run test:compat` passes
- `npm run smoke:pack` passes if package/runtime behavior changed

Do not start Phase 26 with an unexplained dirty worktree.

---

## 9. Phase 26: Action Selection Foundation

Goal: introduce traceable action selection without rewriting `Agent.tick()`.

This phase is the foundation for all later behavior work.

Current WIP status:

| Subphase | Status | Notes |
|---|---|---|
| 26.1 RNG Trace Hardening | Implemented | RNG state snapshot/restore and `traceDraw()` exist. |
| 26.2 ActionCandidate | Implemented | Plain JSON candidate representation exists. |
| 26.3 UtilityScorer | Implemented | Read-only scoring exists, including memory/goal dimensions. |
| 26.4 UtilitySelector | Implemented | Seeded weighted selection and ReasonTrace exist. |
| 26.5 Shadow Mode Integration | Implemented | `Agent.tick()` step 9.5 records shadow traces without behavior mutation. |
| 26.6 Shadow Config Hardening | Implemented | Action selection config is instance-level, not global. |
| 26.7 Action Event Emission | Implemented | `event`/`dryRunEffects`/`active` modes emit `action_selected` events to EventDispatcher. |
| 26.8 EventEffectPipeline Module | Implemented | Pure module at `effects/EventEffectPipeline.js` (dependency leaf), wired into Agent._runShadowActionSelection() for dryRun/active modes. `core/EventEffectPipeline.js` is a compatibility wrapper. |
| 26.9 WorldPressure Module | Implemented | Pure read-only module exists; available to action context but not directly imported by Agent. |

Important distinction:

```text
Implemented module + integrated in Agent.tick ≠ full behavior closed-loop writeback.
Shadow mode (default) remains behavior-invariant.
Event/dryRun/active modes are opt-in via actionSelection config.
Active writeback is limited to allowlisted deltas; full closed-loop writeback for all action types remains future work.
```

### 26.1 RNG Trace Hardening

Implement:

- RNG state in runtime snapshot if seeded.
- RNG state restore from snapshot.
- traceable draw helper:

```js
{
  rngStateBefore,
  randomDraw,
  rngStateAfter,
}
```

Tests:

- same seed creates same RNG sequence
- snapshot -> restore continues same sequence
- trace helper records before/draw/after correctly

Do not:

- claim full deterministic replay beyond declared scope
- add uncontrolled time/random in core runtime

### 26.2 ActionCandidate

Create internal action candidate representation.

Generic action types:

- `continue`
- `move`
- `rest`
- `work`
- `socialize`
- `explore`
- `consume`
- `observe`
- `reflect`

Candidate sources:

- `behaviorField`
- `need`
- `schedule`
- `memory`
- `relationship`
- `habit`
- `goal`
- `worldPressure`
- `object`
- `intrinsic`

Rules:

- candidates are plain JSON
- no live object references
- no `Date.now()` / `Math.random()` for IDs
- candidate IDs should be deterministic from source/type/target or generated by seeded RNG with trace

### 26.3 UtilityScorer

Create a scorer that reads context and returns a score breakdown.

Minimum dimensions:

- need
- emotion
- behavior
- memory
- relationship
- habit
- goal
- location
- world
- time
- constraint
- total

Rules:

- scorer is pure read-only logic
- no mutation
- no random
- no domain-specific terms in core
- goal score must not be hidden inside `habit`

### 26.4 UtilitySelector

Create weighted selector.

Requirements:

- filters invalid candidates
- supports temperature
- samples among reasonable candidates
- does not always select argmax when temperature > 0
- uses seeded RNG
- produces ReasonTrace

ReasonTrace must include:

- selected action
- candidate alternatives
- score breakdown
- key reasons
- rngStateBefore
- randomDraw
- rngStateAfter
- temperature
- stateDeltas placeholder

Tests:

- same seed + same candidates + same context -> full ReasonTrace equal
- different seed can diverge
- invalid candidates are never selected
- trace is JSON serializable

### 26.5 Shadow Mode Integration

Integrate into `Agent.tick()` as shadow mode first.

Rules:

- generate candidates after BehaviorField tick
- score/select candidate
- attach action selection result to tick result
- do not mutate agent/world state from selected action yet

Tests:

- actionSelection exists
- full reasonTrace is deterministic
- custom tavern domain traces contain no campus terms
- existing behavior remains stable under same seed

Important: do not create a fake baseline by comparing two engines that both run the new code and claiming one is old behavior.

### 26.7 Action Event Emission

Emit structured action event.

Requirements:

- selected action becomes `action_selected` event
- event contains reasonTrace or trace reference
- event is in EventDispatcher event log
- event does not yet force state mutation beyond declared effects

Tests:

- event log contains action_selected
- action_selected includes selected action
- action_selected includes reasonTrace
- event log remains bounded
- shadow mode still does not emit events
- action-event mode can be enabled independently from effect writeback

### 26.8 EventEffectPipeline Minimal

Create `effects/EventEffectPipeline.js` (dependency leaf). `core/EventEffectPipeline.js` is a compatibility wrapper that delegates to `effects/`.

Initial supported effects:

- emotion delta
- need delta
- memory add
- relationship interaction

Rules:

- pipeline applies effects and returns stateDeltas
- stateDeltas are written back into ReasonTrace
- do not migrate every legacy side effect at once

Tests:

- event effect changes at least one state through existing APIs
- stateDeltas are captured
- memory add works
- relationship interaction works if social graph context exists
- dry-run mode returns deltas but does not mutate state
- active mode mutates only explicitly allowlisted effects

### 26.9 WorldPressure Read-Only

Create `core/WorldPressure.js`.

Pressure sources:

- time pressure
- weather pressure
- location pressure
- crowding pressure
- recent event pressure
- relationship/social pressure

Rules:

- read-only
- no mutation
- feeds UtilityScorer
- deterministic from world state

Tests:

- pressure changes candidate scores
- pressure does not mutate world/agent
- same world state produces same pressure

Phase 26 foundation acceptance requires:

- shadow mode remains behavior-invariant
- ActionCandidate / UtilityScorer / UtilitySelector modules have focused tests
- CandidateProviderManager is integrated into shadow mode
- ReasonTrace is deterministic under same seed and snapshot
- disabling action selection returns to legacy behavior
- same seed + same starting snapshot produces equal shadow traces under the declared deterministic scope
- no selected action mutates live state yet

If action modules exist but no event/writeback path exists, report:

```text
Status: FOUNDATION ACCEPTED / LOOP NOT CLOSED
Reason: action-selection shadow foundation exists, action event/effect/writeback gates remain ahead
```

---

## 10. Phase 27: Candidate Provider Consolidation

Goal: modularize candidate generation.

Current WIP status: implemented as provider modules and manager. Treat as foundation, not final behavior semantics.

Provider rules:

- produce candidates only
- no mutation
- no selection
- no side effects
- no domain-specific hardcoding

Initial providers:

- `ContinueCandidateProvider`
- `NeedCandidateProvider`
- `ScheduleCandidateProvider`
- `BehaviorFieldCandidateProvider`
- `ExploreCandidateProvider`
- `SocializeCandidateProvider`

Later providers:

- `MemoryCandidateProvider`
- `HabitCandidateProvider`
- `GoalCandidateProvider`
- `WorldPressureCandidateProvider`
- `WorldObjectCandidateProvider`

Do not add new providers until active writeback gates are stable, unless a provider is required to close the loop and remains read-only.

Acceptance:

- manager aggregates providers
- Agent shadow mode uses provider manager
- providers use domain config for regions/states/place types
- custom tavern candidates are clean

---

## 11. Phase 28: Memory To Behavior Influence

Goal: memory affects future behavior tendency indirectly.

Current WIP status: implemented through UtilityScorer memory scoring. The more invasive "memory gradient into BehaviorField" is not implemented and should remain later research.

Allowed:

- high-salience memory changes candidate score
- memory category/entity changes candidate priority
- memory influence is visible in ReasonTrace
- memory influence decays/saturates

Forbidden:

- memory directly sets state
- memory directly sets behavior label
- memory teleports agent
- memory hardcodes domain behavior

Preferred first implementation:

```text
Memory influence through UtilityScorer
```

Only later consider:

```text
Memory gradient into BehaviorField
```

Acceptance:

- high-importance memory changes score
- low-importance memory weak effect
- saturation test exists
- decay or boundedness test exists
- ReasonTrace key reasons mention memory when memory dominates

---

## 12. Phase 29: GoalSystem Minimal Runtime

Goal: goals become long-running pressure sources, not commands.

Current WIP status: minimal pure GoalSystem exists and goal score is separate from habit. It is not yet a complete goal emergence system.

Goal fields:

- id
- source
- description
- priority
- status
- createdAt
- updatedAt
- deadline
- completionCondition
- metadata

Allowed sources:

- background
- external structured input
- world_event
- self

Rules:

- goals influence scoring
- goals can complete/fail/expire/decay
- goals persist in runtime snapshot
- goals do not force action
- goals are not prompt-driven
- time uses simTime when available

Acceptance:

- goal score has independent `goal` dimension
- Agent integration passes real tick count and needs
- `need_above` completion works in integration
- goals survive save/restore
- goals appear in ReasonTrace

---

## 13. Phase 30: WorldObject Minimal Runtime

Goal: add domain-agnostic objects as affordance/perception/event sources.

Current WIP status: pure WorldObject / WorldObjectManager model exists. It is not integrated into Agent perception, candidate generation, event effects, or world state.

Minimum model:

- id
- type
- name
- location
- affordances
- visibility
- ownership
- lifecycle
- properties

Rules:

- WorldObject is not UI/map object
- no Andy Town-specific assumptions
- object types are domain/world data, not core hardcodes
- object use creates structured event
- object effects go through EventEffectPipeline

Subphases:

1. object data model
2. object manager
3. visibility query
4. affordance -> candidate provider
5. object interaction event
6. lifecycle/dangling reference tests

Acceptance:

- visible object can generate candidate
- object affordance affects score
- selected object action creates event
- consumed/broken/removed objects do not generate candidates
- object event stateDeltas are traceable

---

## 14. Phase 31: StoryArc Feedback Gate

Goal: guard against scripted narrative control.

Current WIP status: gate document exists. Runtime implementation is still blocked.

Allowed:

- audit StoryArc RFC
- write safety tests
- document allowed influence routes
- propose implementation plan

Forbidden:

- active StoryArc runtime
- forced actions
- direct emotion changes
- direct relationship override
- direct behavior label changes
- LLM world-fact creation

Acceptance:

- document exists
- tests are designed but not necessarily implemented
- implementation remains blocked pending approval

StoryArc runtime requires explicit human/reviewer approval.

---

## 15. Phase 32: Pre-Commit Audit And WIP Stabilization

Goal: stabilize the current WIP branch before deeper runtime integration.

This phase must happen before new feature work.

Tasks:

- inspect all dirty files and untracked files
- verify no accidental StoryArc runtime implementation exists
- verify no Stable World Envelope extension exists
- verify no uncontrolled `Math.random()` / `Date.now()` in new action modules
- verify action selection config is instance-level, not global mutable test state
- verify docs accurately distinguish `main` vs WIP branch status
- group changes into coherent commits or prepare a truthful merge report

Required commands:

```bash
npm test
npm run test:domain
npm run test:compat
npm run smoke:pack
git diff --check
```

Acceptance:

- working tree changes are understood and grouped
- roadmap reflects the WIP reality
- tests pass
- no new runtime behavior is activated beyond shadow mode

Do not continue to active writeback with an unreviewed dirty worktree.

---

## 16. Phase 33: Shadow Trace Quality Gate

Goal: make shadow traces reliable enough to become the basis of future writeback.

This phase still must not mutate agent/world state from selected actions.

Tasks:

- add golden ReasonTrace tests for a small fixed scenario
- compare full trace shape, not only selected action id
- add custom-domain shadow trace tests
- add "no candidates" test with a real empty provider path, not a temperature trick
- ensure shadow trace history is bounded and serializable
- ensure restored engine continues trace recording deterministically
- ensure shadow-mode RNG uses a cloned RNG and never advances main simulation RNG

Acceptance:

- shadow enabled vs disabled produces identical legacy state under same seed
- same seed produces byte-equivalent ReasonTrace windows
- custom tavern domain trace contains no campus-only vocabulary
- trace history restore works
- trace schema is documented as runtime-private, not Stable Envelope

Report status as:

```text
Shadow trace foundation accepted.
No active behavior writeback yet.
```

---

## 17. Phase 34: Action Event Emission Gate

Goal: selected shadow action can become a structured event without applying state effects.

This is the first step from "trace artifact" to "world event".

Modes:

```js
actionSelection: {
  enabled: true,
  mode: 'event',      // shadow | event | dryRunEffects | active
  recordTraces: true
}
```

Rules:

- `mode: 'shadow'` records trace only
- `mode: 'event'` emits `action_selected` event
- event emission must not change needs/emotion/memory/relationship/location
- event must use simTime, not `Date.now()`
- event must be bounded by EventDispatcher limits
- event payload must avoid live object references

Minimum event shape:

```js
{
  type: 'action_selected',
  agentId,
  time,
  action: {
    type,
    source,
    target,
    label
  },
  reasonTrace
}
```

Acceptance:

- EventDispatcher event log contains action_selected only in event/dryRun/active modes
- shadow mode still emits no event
- event mode changes no legacy state compared with shadow mode
- event survives snapshot/restore if event log is serialized
- custom domain event payload has no forbidden terms

Do not apply effects in this phase.

---

## 18. Phase 35: Effect Pipeline Dry-Run Gate

Goal: compute action effects and attach stateDeltas to ReasonTrace without mutating live state.

This phase proves the writeback contract before any writeback occurs.

Tasks:

- route selected event through `EventEffectPipeline` in `mode: 'dryRunEffects'`
- compute stateDeltas for a narrow allowlist:
  - `rest` -> need/emotion candidate deltas
  - `observe` -> memory candidate delta
  - `reflect` -> memory/emotion candidate delta
  - `continue` -> no-op delta
- attach deltas to ReasonTrace
- attach deltas or a trace reference to `action_selected` event
- validate deltas are bounded and JSON-serializable

Rules:

- no mutation of live Agent/World state
- no direct private-field writes
- no broad migration of legacy side effects
- no object/social/work/consume effects yet unless covered by explicit tests

Acceptance:

- dry-run deltas are deterministic under same seed/state
- dry-run mode and event mode produce identical live state
- ReasonTrace includes stateDeltas
- invalid/unsupported effects are rejected or converted to no-op with reason

---

## 19. Phase 36: Minimal Active Writeback Gate

Goal: close the behavior loop for a very small set of low-risk actions.

This is the first real behavior closed-loop phase.

Allowed active actions:

- `continue`: no-op event and trace
- `observe`: adds bounded memory through `PersonalMemory.addExperience`
- `reflect`: adds bounded memory or tiny emotion delta through existing APIs
- `rest`: applies bounded need/emotion deltas through existing APIs

Forbidden in this phase:

- teleporting location
- schedule override
- forced relationship changes
- object consumption
- work/consume/socialize active effects
- replacing legacy movement logic
- direct writes to `stateMachine.currentState`
- direct writes to private arrays/maps unless no public API exists and reviewer approves

Rules:

- all active deltas must go through existing subsystem methods where possible
- applied deltas must be captured in ReasonTrace
- active writeback must be disableable by config
- active writeback must not alter Stable World Envelope
- legacy behavior remains fallback

Acceptance:

- at least one selected action changes future scoring through a real state update
- same seed + same snapshot produces same next N action/event/effect traces
- disabling active mode returns to event/dry-run behavior
- tests prove numerical bounds on needs/emotion changes
- tests prove memory count/salience changes only when expected

This phase is the first point where "behavior closed-loop writeback" can be claimed, but only for the allowed actions above.

---

## 20. Phase 37: Location And Movement Writeback Gate

Goal: let selected actions influence location without breaking schedule/needs/intrinsic legacy logic.

This phase is high risk because existing movement is scattered across needs, schedule, intrinsic motivation, and skip behavior.

Allowed:

- action-selected move intent may propose target region
- movement applies only if target region is valid in current domain
- movement must produce explicit location delta
- movement must preserve legacy schedule priority unless config enables active override

Forbidden:

- hardcoded campus/tavern regions
- moving to unknown region
- bypassing domain adjacency if movement rules require adjacency
- overwriting schedule skip behavior without a migration plan

Tasks:

- add movement effect dry-run tests first
- add active movement only behind `actionSelection.allowMovementWriteback`
- record `fromRegion`, `toRegion`, and reason in stateDeltas
- add custom-domain tests proving no campus leakage

Acceptance:

- valid move action can change future candidate scores through location
- invalid target is rejected safely
- schedule-driven movement tests still pass
- active movement can be disabled independently

---

## 21. Phase 38: Relationship And Social Writeback Gate

Goal: let selected social actions update relationship state through existing social graph APIs.

Allowed:

- `socialize` action creates interaction event
- relationship delta uses SocialGraph/Relationship APIs
- memory of the interaction can be added

Forbidden:

- direct relationship strength assignment
- forced close-friend transitions
- StoryArc relationship override
- LLM-created relationship facts

Acceptance:

- relationship update is bounded
- relationship update appears in stateDeltas
- social action affects future social candidate score
- same seed replay matches action/event/effect trace

---

## 22. Phase 39: WorldObject Candidate And Effect Integration

Goal: connect WorldObject to perception, candidates, and effects after the core writeback path is proven.

Order:

1. object visibility query, read-only
2. affordance candidate provider, read-only
3. object score contribution, read-only
4. object interaction event, no writeback
5. object effect dry-run
6. object lifecycle active writeback

Rules:

- WorldObject is not a UI/map object
- no Andy Town assumptions
- object IDs remain stable even after destruction
- destroyed/consumed objects do not generate future candidates
- object effects must pass through EventEffectPipeline

Acceptance:

- visible affordance can create candidate
- selected object action emits event
- object lifecycle changes are traceable
- no dangling references in event/memory logs

---

## 23. Phase 40: Replay And Trace Audit

Goal: make the closed loop auditable and debuggable.

Implement:

- trace export for selected windows
- deterministic replay test harness
- event trace comparison helper
- reasonTrace diff helper
- compact trace summary for large runs

Scope:

- core simulation only
- no SDK/chat/store deterministic guarantee unless separately approved

Acceptance:

- same snapshot + same RNG state -> same next N action/event/effect traces
- trace diff clearly shows divergence point
- reasonTrace includes enough data to explain selected behavior after the fact
- performance overhead is measured

---

## 24. Phase 41: Performance Rebaseline

Goal: ensure closed-loop behavior does not regress runtime unacceptably.

Run:

```bash
npm run benchmark:quick
npm run profile:agent:quick
npm run profile:contagion:quick
npm run perf:check
```

Add profiles:

- action-selection profile
- candidate-provider profile
- utility-scorer profile
- effect-pipeline profile
- trace serialization profile

Acceptance:

- overhead is measured, not guessed
- no hidden O(N^2) candidate generation
- perf baseline updated only after review
- if overhead is high, disable-by-default mode remains acceptable

---

## 25. Phase 42: Persistent World Public API Review

Goal: decide whether any action/reason/world tooling becomes public.

Questions:

- Should `ReasonTrace` remain runtime-private?
- Should action traces be exposed through SDK?
- Should `world/` remain internal?
- Should there be `validateWorldState` public export?
- Should there be `WorldLoader`?
- Should WorldObject become part of Stable Envelope?
- Should active action selection be public config or internal experiment flag?

No implementation before API review.

Acceptance:

- API decision doc
- package boundary plan
- compatibility matrix
- migration policy
- public examples only for approved APIs

---

## 26. Phase 43+: Later Research Tracks

Only after WorldCanon / Observation / Knowledge Minimal Closure is stable:

- richer memory-to-BehaviorField gradient
- goal emergence and goal transformation
- object competition and ownership conflicts
- faction/world systems
- migration framework hardening
- partial ECS/data-oriented optimization
- native/WASM acceleration
- StoryArc runtime, if explicitly approved

Do not start these early.

---

## 27. Reviewer Checklist

A reviewer should reject a phase if:

- files claimed in report do not exist
- tests do not verify the claim
- deterministic trace compares only selected id, not full trace
- source scan excludes new directories
- implementation uses `Date.now()` / `Math.random()` in new deterministic runtime path
- BehaviorField is bypassed
- StateMachine regains decision logic
- Stable Envelope is extended casually
- LLM enters decision loop
- StoryArc becomes active without approval
- report says complete but code is only prototype
- active writeback mutates state without a matching ReasonTrace `stateDeltas`
- event/effect modes cannot be disabled independently
- shadow mode is no longer behavior-invariant
- action candidates contain live object references
- effect pipeline writes private subsystem fields instead of using existing APIs
- a phase claims "behavior closed-loop" before a selected action changes future tendency through an event/effect path
- a phase claims "world closure" before CanonEvent, ObservationFacts, KnowledgeFacts, MemoryFacts, location meaning, and grounded expression are all covered by tests

---

## 28. Git / Release Discipline

Do not push automatically unless instructed.

Recommended branch naming:

```text
codex/phase-26-action-selection-foundation
codex/phase-27-candidate-providers
codex/phase-32-action-wip-stabilization
codex/phase-36-minimal-active-writeback
```

Commit messages must be truthful:

Good:

```text
feat: add shadow action selection trace foundation
```

Bad:

```text
complete action intelligence system
```

Do not publish npm until:

- package boundary is reviewed
- smoke pack passes
- compatibility matrix passes
- release notes are accurate

---

## 29. Immediate Next Step

The next architect/executor should do:

```text
Phase 32: Pre-Commit Audit And WIP Stabilization
```

Then:

```text
WorldCanon / Observation / Knowledge Minimal Closure slice planning
```

Do not ask the user for a new direction.

The direction is already defined:

```text
Close the world-fact loop:
selected action
  -> CanonEvent
  -> ObservationFacts
  -> KnowledgeFacts
  -> MemoryFacts
  -> LocationMeaning delta
  -> FutureTendency delta
  -> GroundedNarrative
```

The current engineering sub-loop remains:

```text
behavior closed-loop writeback
```

But the higher roadmap target is:

```text
WorldCanon / Observation / Knowledge Minimal Closure
```

Do not start StoryArc runtime, public API expansion, ECS/native optimization, life-cycle systems, rule/law systems, large map import, or UI/product work before this minimal closure is complete.
