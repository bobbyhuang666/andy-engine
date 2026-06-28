# Andy Engine Action Selection Execution Plan

> Status: execution guidance for the next architecture cycle.
> This document is an implementation plan, but it does not authorize a large rewrite.
> The executor should read this document before changing runtime code.

---

## 1. Role Split

This cycle changes the collaboration model:

- Execution AI owns architecture drafting and implementation details.
- Reviewer AI audits boundaries, tests, regressions, and architectural drift after implementation reports are complete.

The executor should not wait for step-by-step architecture instructions after every small change. Instead, it should:

1. Read this document fully.
2. Implement in the order below.
3. Keep each phase small and testable.
4. Report exact changed files, test results, semantic changes, and unresolved risks.
5. Avoid claiming completion when tests only cover the happy path.

---

## 2. Goal

Upgrade Andy Engine's behavior system toward:

```text
psychological field
  -> utility/action selection
  -> traceable event
  -> effect pipeline
  -> future behavior tendency
```

The goal is not more randomness.

The goal is **constrained unpredictability**:

- The world should evolve in ways that even the developer cannot fully predict in advance.
- Each outcome must still be explainable after the fact through agent psychology, relationships, memory, location pressure, world events, and seeded randomness.
- Randomness may only choose among reasonable candidates. It must not create arbitrary behavior from nowhere.

---

## 3. Current Architecture Assumptions

The current system already has the first half of the target architecture:

- `BehaviorField` is the continuous psychological tendency field.
- `NeedsSystem`, `EmotionVector`, `PersonalMemory`, `SocialGraph`, `ProceduralMemory`, `Schedule`, and `IntrinsicMotivation` already produce behavior-relevant signals.
- `EventDispatcher` already records events and supports effect payloads.
- `RNG` already supports seeded random numbers.
- `DomainRegistry` already separates domain semantics from core runtime.
- `WorldStateAdapter` already treats `runtimeSnapshot` as opaque.

The missing pieces are:

- a candidate action layer
- a utility scorer
- a weighted selector
- reason traces
- explicit world pressure
- unified event effect application
- deterministic replay hardening

---

## 4. Non-Negotiable Guardrails

The executor must preserve these constraints.

### 4.1 BehaviorField Remains Core

`BehaviorField` remains the psychological tendency core.

Do not replace it with a behavior tree.
Do not restore transition logic into `StateMachine`.
Do not directly set `stateMachine.currentState` as behavior selection.

Allowed:

- `UtilityScorer` reads `BehaviorField.B`, gradient, label, velocity, and confidence.
- `UtilitySelector` projects psychological tendency into a structured action event.
- The selected action may create events and effects.

Forbidden:

- Utility selector directly overwrites emotion, relationship, memory, or state without event/effect mediation.
- Utility selector becomes a giant if/else state machine.

### 4.2 Domain-Agnostic Core

Core must not hardcode campus, tavern, Oak Town, Bobby, or Andy Town semantics.

Actions must be abstract:

- `rest`
- `work`
- `move`
- `socialize`
- `explore`
- `consume`
- `observe`
- `reflect`

Concrete labels, regions, place types, and state centers must come from domain config or existing runtime state.

### 4.3 Randomness Is Routed

No new runtime `Math.random()` calls.

All new stochastic behavior must use the engine RNG:

- same seed + same world state + same tick count should produce the same action selection trace
- different seed should naturally diverge
- no-seed mode may fall back to existing behavior for backward compatibility

If deterministic replay is incomplete, report it honestly as a scoped limitation.

### 4.4 LLM Is Expression Only

LLM must not decide world facts.

Allowed:

- narrate existing events
- express existing reason traces
- summarize memory/relationship context

Forbidden:

- LLM invents location changes
- LLM creates relationship changes directly
- LLM chooses action selection result
- LLM writes unvalidated world facts

If LLM-generated interpretation is ever introduced later, it must be converted into a structured event and validated before entering world state.

### 4.5 Stable Envelope Is Not Extended Yet

Do not extend Stable World Envelope in this cycle.

`reasonTrace`, selected action, candidate alternatives, RNG state, and effect details should remain runtime/internal event data for now.

If future public schema expansion becomes necessary, document it as:

```text
Potential future Stable Envelope extension, not approved by this implementation.
```

---

## 5. Target Runtime Flow

The target flow should eventually look like this:

```text
World tick
  -> build environment context
  -> agent perceives events
  -> psychological systems update
  -> BehaviorField updates continuous tendency B
  -> CandidateProviders generate reasonable actions
  -> UtilityScorer scores candidates
  -> UtilitySelector samples among reasonable candidates
  -> selected action becomes structured event
  -> ReasonTrace records why this action happened
  -> EventEffectPipeline applies state deltas
  -> memory / relationship / habit / location / world pressure update
  -> future behavior tendency changes
```

Important: this is a gradual target. Do not rewrite `Agent.tick()` in one pass.

---

## 6. Recommended Directory Structure

Add new modules incrementally.

```text
agent/action/
  ActionCandidate.js
  CandidateProviders.js
  UtilityScorer.js
  UtilitySelector.js
  ReasonTrace.js

core/
  WorldPressure.js
  EventEffectPipeline.js

tests/
  action-candidate.test.js
  utility-selector.test.js
  reason-trace.test.js
  world-pressure.test.js
  event-effect-pipeline.test.js
  deterministic-action-selection.test.js
```

Do not add all files at once unless each has tests and real usage.

Preferred first batch:

```text
agent/action/ActionCandidate.js
agent/action/UtilitySelector.js
agent/action/ReasonTrace.js
tests/utility-selector.test.js
tests/reason-trace.test.js
tests/deterministic-action-selection.test.js
```

---

## 7. Core Interfaces

These are implementation targets, not public package contracts.

### 7.1 ActionCandidate

```js
/**
 * @typedef {Object} ActionCandidate
 * @property {string} id
 * @property {string} type
 * @property {string} source
 * @property {string} label
 * @property {string|null} targetRegion
 * @property {string|null} targetAgentId
 * @property {string|null} targetObjectId
 * @property {Object} constraints
 * @property {Object} expectedEffects
 * @property {Object} metadata
 */
```

Action type should remain generic:

- `continue`
- `move`
- `rest`
- `work`
- `socialize`
- `explore`
- `consume`
- `reflect`
- `observe`

Candidate source should explain where the action came from:

- `need`
- `schedule`
- `behaviorField`
- `memory`
- `relationship`
- `habit`
- `worldPressure`
- `intrinsic`

### 7.2 ActionContext

```js
/**
 * @typedef {Object} ActionContext
 * @property {Object} agent
 * @property {Object} env
 * @property {Object} domain
 * @property {Object} behavior
 * @property {Object} needs
 * @property {Object} emotion
 * @property {Object[]} memories
 * @property {Object[]} relationships
 * @property {Object} worldPressure
 * @property {Object} rng
 */
```

Do not pass the entire world if a smaller context is enough.

### 7.3 ScoreBreakdown

```js
/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} need
 * @property {number} emotion
 * @property {number} behavior
 * @property {number} memory
 * @property {number} relationship
 * @property {number} habit
 * @property {number} location
 * @property {number} world
 * @property {number} time
 * @property {number} constraint
 * @property {number} total
 */
```

The executor should keep scoring simple at first.

Avoid invented precision. A clear small formula is better than a complex unverifiable one.

### 7.4 UtilitySelector Result

```js
/**
 * @typedef {Object} SelectionResult
 * @property {ActionCandidate} selected
 * @property {Array<{candidate: ActionCandidate, score: ScoreBreakdown, weight: number}>} alternatives
 * @property {ReasonTrace} reasonTrace
 */
```

### 7.5 ReasonTrace

```js
/**
 * @typedef {Object} ReasonTrace
 * @property {string} traceId
 * @property {string} agentId
 * @property {string} tick
 * @property {string} selectedActionId
 * @property {string} selectedActionType
 * @property {Array<Object>} candidateAlternatives
 * @property {Object} scoreBreakdown
 * @property {string[]} keyReasons
 * @property {number|string|null} rngStateBefore
 * @property {number|string|null} rngStateAfter
 * @property {number|null} randomDraw
 * @property {number} temperature
 * @property {Object} stateDeltas
 */
```

ReasonTrace must be serializable plain JSON.

Do not store live object references.

### 7.6 WorldPressure

```js
/**
 * @typedef {Object} WorldPressure
 * @property {Object} global
 * @property {Object} location
 * @property {Object} social
 * @property {Object} time
 * @property {Object} event
 */
```

Initial pressure sources:

- time pressure: late night, work hours, meal windows
- location pressure: crowding, weather exposure, place valence
- event pressure: recent public/local events
- social pressure: nearby strong/tense relationships

Initial implementation may be read-only scoring input. Do not mutate world from `WorldPressure`.

### 7.7 EventEffectPipeline

```js
class EventEffectPipeline {
  apply(event, context) {
    return {
      emotionDelta: {},
      needDelta: {},
      memoryAdded: [],
      relationshipDelta: [],
      habitDelta: {},
      locationDelta: {},
      worldDelta: {},
    };
  }
}
```

This pipeline should become the long-term home for event side effects.

Initial implementation should be minimal and conservative.

---

## 8. Minimum Implementation Sequence

### Phase 26.1: RNG Trace Hardening

Goal: make future action selection traceable and replayable.

Tasks:

- Ensure the engine RNG state is included in legacy runtime snapshot.
- Ensure `fromJSON()` restores RNG state when present.
- Add a helper that records RNG state before and after a random draw.
- Do not claim complete deterministic replay if SDK/store/tooling still use time/random outside core simulation.

Suggested tests:

- same seed creates same RNG sequence
- restored RNG state continues the same sequence
- engine snapshot/restore preserves RNG state

Acceptance:

- No new runtime `Math.random()` in core simulation path.
- Existing tests pass.

### Phase 26.2: UtilitySelector Standalone

Goal: implement weighted selection without touching `Agent.tick()`.

Tasks:

- Add `UtilitySelector`.
- Input: scored candidates.
- Filter impossible candidates.
- Keep top reasonable candidates.
- Sample using softmax or normalized positive weights.
- Support `temperature`.
- Return `ReasonTrace`.

Rules:

- Temperature should affect only candidate weighting.
- If one candidate is valid, choose it deterministically.
- If all scores are invalid, fall back to a safe `continue` action.

Suggested tests:

- same RNG state selects same candidate
- different RNG state can diverge
- highest score is not always selected when temperature > 0
- invalid candidates are never selected
- zero/negative scores are handled safely

### Phase 26.3: ReasonTrace Shadow Mode

Goal: attach trace generation without changing runtime behavior.

Tasks:

- Generate action candidates after `BehaviorField.tick()`.
- Score and select in shadow mode.
- Store trace in `agentResult.reasonTrace` or `agentResult.actionSelection`.
- Do not use selected action to mutate state yet.
- Add selected trace to event metadata only if it does not change behavior.

Candidates for shadow mode:

- continue current behavior
- follow schedule
- satisfy urgent need
- rest
- socialize if sociality tendency is high
- explore if intrinsic drive is high

Acceptance:

- Existing behavior outputs remain compatible.
- Tests verify trace exists and is serializable.

### Phase 26.4: Action Event Emission

Goal: selected action becomes a structured internal event.

Tasks:

- Add action event type, for example `type: 'action_selected'`.
- Include selected action and reason trace in event metadata.
- Keep event content domain-neutral or generated from domain templates.
- Do not expose this as a public SDK contract yet.

Acceptance:

- Event log records action selection events.
- Custom domain traces contain no campus-only terms.
- Event log size limits still work.

### Phase 26.5: EventEffectPipeline Minimal Integration

Goal: start closing the event loop through one pipeline.

Tasks:

- Create `EventEffectPipeline`.
- Initially support a small set of generic effects:
  - emotion delta
  - need delta
  - memory add
  - relationship interaction
  - habit record
- Use it for newly created action events first.
- Do not migrate every legacy side effect in one pass.

Acceptance:

- selected action can create state deltas
- deltas are included in reason trace
- memory and relationship updates are testable
- no large behavior regression

### Phase 26.6: WorldPressure Read-Only Input

Goal: add world pressure as a scoring input, not as a controller.

Tasks:

- Add `WorldPressure.compute(world, agent, env)`.
- Feed output into `UtilityScorer`.
- Do not let pressure directly move agents.

Acceptance:

- pressure is deterministic under seed/world state
- pressure can change scores
- pressure does not bypass BehaviorField

---

## 9. What To Keep

Keep these systems:

- `BehaviorField`
- `BehaviorLabeler`
- `NeedsSystem`
- `EmotionVector`
- `PersonalMemory`
- `SocialGraph`
- `Relationship`
- `ProceduralMemory`
- `IntrinsicMotivation`
- `Schedule`
- `DomainRegistry`
- `EventDispatcher`
- `WorldStateAdapter`

Do not rewrite them.

Only add adapter methods or read-only context extraction where necessary.

---

## 10. What To Gradually Deprecate

Do not remove these immediately, but mark them as future consolidation targets:

- direct movement decisions inside `Agent.tick()`
- direct skip behavior state forcing
- scattered event side effects outside a common pipeline
- random choices without trace
- event effects with no state delta record
- LLM or narrative code that implies unrecorded world facts

Deprecation must happen after tests prove equivalent or improved behavior.

---

## 11. Testing Requirements

Every implementation phase must add focused tests.

Minimum test suite additions:

### RNG / Replay

- `same seed + same initial state -> same selected action trace`
- `different seed -> eventual divergence`
- `snapshot -> restore -> continue produces same next selection`

### UtilitySelector

- valid candidate filtering
- softmax/weighted sampling
- temperature behavior
- deterministic fallback
- trace includes random draw and RNG states

### ReasonTrace

- JSON serializable
- contains selected action
- contains candidate alternatives
- contains score breakdown
- contains key reasons
- contains state deltas after effect pipeline phase

### Domain Safety

- custom tavern domain action candidates use tavern regions/states only
- no campus-only terms in custom-domain action traces

### EventEffectPipeline

- action event writes memory
- action event can update relationship through `SocialGraph`
- action event can update needs/emotion through existing APIs
- state deltas are returned and recorded

### Regression

- `npm test`
- `npm run smoke:pack` if package exports are touched
- source-scan tests if any core strings are added

---

## 12. Reporting Format For Execution AI

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
ReasonTrace status:
Known limitations:
Not implemented:
Next recommended phase:
```

If behavior semantics changed, include:

```text
Old behavior:
New behavior:
Why this is acceptable:
Tests covering the change:
```

---

## 13. Red Flags For Reviewer

The reviewer should reject the implementation if any of these happen:

- `StateMachine` becomes a decision system again.
- `UtilitySelector` directly mutates agent state.
- `ActionCandidate` contains campus/tavern-specific logic in core.
- New runtime `Math.random()` is introduced.
- ReasonTrace stores live class instances instead of JSON.
- LLM output creates world facts without structured events.
- Stable World Envelope is extended without explicit separate approval.
- `Agent.tick()` gets significantly larger without extracting modules.
- Tests only assert that code runs, not that traces are reproducible.
- Implementation claims complete deterministic replay while known non-core random/time sources remain.

---

## 14. Autonomous Continuation Plan

This section defines what the executor should do if the user is away and wants the work to continue beyond Phase 26.

The executor may continue sequentially only if the previous phase satisfies all of these gates:

- `npm test` passes.
- New focused tests for the phase pass.
- No new runtime `Math.random()` is introduced in core simulation paths.
- Custom domain tests do not leak campus-only terms.
- `BehaviorField` remains the psychological tendency core.
- Stable World Envelope is not extended.
- A phase report is written in the format required by Section 12.

If any gate fails, stop implementation and write a blocking report.

Do not push to GitHub.
Do not publish to npm.
Do not start unrelated refactors.
Do not implement Bobby, Andy Town, UI, map, chat-product, or presentation-layer work.

---

## 15. Extended Phase Sequence

The executor may work through the following phases in order.

### Phase 26: Action Selection Foundation

Goal: add traceable action selection without a large behavior rewrite.

Subphases:

- 26.1 RNG Trace Hardening
- 26.2 UtilitySelector Standalone
- 26.3 ReasonTrace Shadow Mode
- 26.4 Action Event Emission
- 26.5 EventEffectPipeline Minimal Integration
- 26.6 WorldPressure Read-Only Input

Completion criteria:

- selected actions are traceable
- action selection is reproducible under same RNG state
- action events carry reason traces
- effect pipeline can apply at least minimal state deltas
- world pressure can influence scores without directly mutating state

### Phase 27: Candidate Provider Consolidation

Goal: move action candidate generation into modular providers while preserving existing behavior semantics.

Add candidate providers gradually:

- `NeedCandidateProvider`
- `ScheduleCandidateProvider`
- `BehaviorFieldCandidateProvider`
- `RelationshipCandidateProvider`
- `MemoryCandidateProvider`
- `HabitCandidateProvider`
- `WorldPressureCandidateProvider`

Rules:

- Providers produce candidates only.
- Providers do not mutate agent/world state.
- Providers do not select actions.
- Providers do not hardcode domain-specific regions or states.

Initial active providers should be conservative:

- need
- schedule
- continue-current-behavior
- rest
- explore
- socialize

Do not migrate every direct `Agent.tick()` decision at once.

Completion criteria:

- candidate generation is separated from scoring
- tests prove providers are domain-agnostic
- custom tavern candidates contain only tavern-compatible regions/states
- existing integration tests still pass

### Phase 28: Memory To Behavior Influence

Goal: implement memory influence through candidate scoring or BehaviorField-compatible gradient inputs, not direct behavior commands.

Allowed:

- high-salience memories add score pressure toward compatible candidates
- memory tags/entities influence candidate priority
- memory recency/emotional intensity affect score
- memory influence decays and saturates

Forbidden:

- memory directly sets `stateMachine.currentState`
- memory directly sets `behaviorField.label`
- memory directly teleports agent location
- memory creates domain-specific hardcoded behavior

Implementation should start with utility scoring before modifying BehaviorField gradients.

Completion criteria:

- high-importance memory changes candidate scores
- low-importance memory has weak or no effect
- memory influence is visible in ReasonTrace
- influence is bounded and cannot permanently dominate behavior
- tests cover decay/saturation

### Phase 29: GoalSystem Minimal Runtime

Goal: add goals as long-running pressure sources, not commands.

Goal should be represented as:

- id
- source
- description
- priority
- status
- createdAt
- updatedAt
- decay/saturation metadata
- completion condition metadata

Allowed goal sources:

- background-derived
- external structured input
- world-event-derived
- self-generated/intrinsic

Rules:

- GoalSystem may affect candidate scores.
- GoalSystem may affect memory salience.
- GoalSystem may produce events.
- GoalSystem must not force an action.
- GoalSystem must not bypass BehaviorField.
- GoalSystem must not be prompt-driven.

Completion criteria:

- goals persist in runtime snapshot
- goals influence UtilityScorer
- goal influence appears in ReasonTrace
- goals can complete/fail/decay
- tests cover non-forcing behavior

### Phase 30: WorldObject Minimal Runtime

Goal: add domain-agnostic world objects as affordance and perception sources.

Start minimal:

- object id
- type
- name
- location
- affordances
- visibility
- ownership
- lifecycle state

Allowed:

- objects generate candidates through affordances
- objects can be perceived
- object interactions create events
- object events can update memory/relationship/world state through `EventEffectPipeline`

Forbidden:

- UI/map pixel logic
- Andy Town-specific object assumptions
- domain-specific object types in core
- direct object side effects outside the event pipeline

Completion criteria:

- object affordance can influence candidate scores
- object interaction creates structured event
- object lifecycle changes are traceable
- destroyed objects do not create dangling references
- tests cover visibility, ownership, and consumable/durable object behavior

### Phase 31: StoryArc Feedback Gate Only

StoryArc is high risk. Do not implement active StoryArc control automatically.

Allowed autonomous work:

- audit existing StoryArc RFC
- list required safeguards
- design tests that would prevent scripted control
- write a pre-implementation review document

Forbidden autonomous work:

- no active StoryArc runtime implementation
- no script that forces agent behavior
- no relationship override
- no direct emotion override
- no narrative engine controlling world facts

StoryArc implementation requires explicit human/reviewer approval after Phases 26-30 are reviewed.

---

## 16. Checkpoint Discipline

After each phase:

1. Run required tests.
2. Write a phase report.
3. Record changed files.
4. Record semantic changes.
5. Record limitations.
6. Continue only if all gates pass.

If the phase creates a large diff, the executor should organize changes by phase in the report so the reviewer can audit them independently.

Do not hide semantic changes inside "refactor" language.

---

## 17. Recommended First Task To Execute

Start with:

```text
Phase 26.1 + 26.2:
RNG Trace Hardening + standalone UtilitySelector.
```

Do not integrate into `Agent.tick()` until standalone selector tests pass.

The first implementation should prove:

- a list of scored candidates can be selected reproducibly
- selection is weighted, not always argmax
- reason trace records the random draw and score breakdown
- no existing runtime behavior changes yet

This gives the project a safe foundation before action selection touches live simulation.
