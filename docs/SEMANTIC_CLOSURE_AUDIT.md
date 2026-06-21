# Semantic Closure Audit — Stage 33

> Updated to reflect resolutions from Stages 29, 31, 32.

---

## 1. action_selected Paths by Mode

### Source: `src/agent/runtime/ActionSelectionRuntime.js`

`runShadowActionSelection(agent, env)` is called by `ActionSelectionHandler.tick()` at `src/agent/handlers/ActionSelectionHandler.js:14`. The returned event is pushed to `context.result.newEvents`, which is collected by `AndyWorld.step()` Phase 4 (AGENT_THINK) into `allNewEvents`.

In Phase 7 (EVENT_DISPATCH), all new events are added to `eventDispatcher` via `createEvent()` and then `dispatch()` moves them from `pendingEvents` to `eventLog`.

In Phase 8 (CANON_PIPELINE), if `enableFacts=true`, ALL dispatched events (including `action_selected`) flow through `canonEventPipeline.processEvents()` → `WorldFactStore.addFact()` → `KnowledgeStore.addKnowledge()`.

#### Mode Trace Table

| Mode | action_selected emitted? | In EventDispatcher.eventLog? | Enters CanonEventPipeline? | Enters WorldFactStore? | Propagates to KnowledgeStore? | Goes through EffectCommitter? | World state changed? |
|------|--------------------------|------------------------------|----------------------------|------------------------|-------------------------------|-------------------------------|----------------------|
| **shadow** | No (returns null at line 133) | No | No | No | No | No | No |
| **event** | Yes (line 127-128) | Yes (scope: internal) | Yes (if enableFacts) | Yes (if enableFacts) | Yes (if enableFacts) | No | No |
| **dryRunEffects** | Yes (line 127-128) | Yes (scope: internal) | Yes (if enableFacts) | Yes (if enableFacts) | Yes (if enableFacts) | No | No |
| **active** | Yes (line 127-128) | Yes (scope: internal) | Yes (if enableFacts) | Yes (if enableFacts) | Yes (if enableFacts) | Yes (line 114-116) | **Yes** |

#### Detailed Path per Mode

**shadow** (`mode: 'shadow'`, default):
1. Candidates generated, scored, selected → trace recorded (line 119-124)
2. No stateDeltas computed (line 100 condition fails)
3. No event returned (line 127 condition fails)
4. **Trace-only**: only `agent._actionTraceHistory` is modified

**event** (`mode: 'event'`):
1. Candidates generated, scored, selected → trace recorded
2. No stateDeltas computed (line 100 condition: `mode !== 'dryRunEffects' && mode !== 'active'`)
3. `buildActionSelectedEvent()` returns event with `type: 'action_selected'`, `scope: 'internal'`
4. Event pushed to `context.result.newEvents` → AndyWorld Phase 7 → `eventDispatcher.eventLog`
5. If `enableFacts=true`: Phase 8 → `CanonEventPipeline.processEvent()` → `WorldFactStore.addFact()` → `KnowledgeStore.addKnowledge()`
6. **No world state mutation**

**dryRunEffects** (`mode: 'dryRunEffects'`):
1. Same as event, PLUS `applyActionEffect()` computes `stateDeltas` (line 100-111)
2. stateDeltas attached to trace AND event (line 110, 165-167)
3. stateDeltas are **not applied** — they are audit metadata only
4. **No world state mutation**

**active** (`mode: 'active'`):
1. Same as dryRunEffects, PLUS `applyActionStateDeltas()` called (line 114-116)
2. `applyActionStateDeltas()` builds typed deltas (NeedDelta, EmotionDelta, MemoryDelta, PositionDelta, RelationshipDelta) and commits through `EffectCommitter` (line 241-248)
3. **World state IS mutated** via EffectCommitter

#### Key Invariant
`action_selected` events have `scope: 'internal'` (line 152). In `EventDispatcher.filterEventsForAgent()`, internal events are only visible to participants/observers. Since `action_selected` has `participants: []` and `observers: []`, they are **never perceived** by agents on the next tick. This is confirmed by multiple tests (e.g., `tests/unit/action-event-emission.test.js:115`).

---

## 2. enableFacts Boundary

### Default Value
`enableFacts` defaults to `false` in three places:
- `src/runtime/RuntimeConfig.js:16` — `config.enableFacts ?? false`
- `index.js:97` — `enableFacts: config.enableFacts ?? false`
- No `enableFacts` in `src/config/defaults.js` (it is NOT a defaults.js parameter — it's a runtime config flag)

### Why False by Default
The fact system is an **optional semantic layer** that adds:
1. **WorldFactStore** — per-event fact storage (append-only EventFact objects)
2. **KnowledgeStore** — per-agent knowledge graph (agentId → Set<factId>)
3. **FactEmitter** — state/observation/relationship fact emission
4. **CanonEventPipeline** — event→fact→knowledge propagation
5. **EffectCommitter for consequences** — memory creation, location meaning, future tendency from events

When `enableFacts=false`, all four are `null` (AndyWorld.js:74-89). The engine runs the core tick pipeline (emotion, needs, behavior field, memory, social) identically without the fact layer.

**This is an accepted boundary, not a bug.** The fact system adds overhead and complexity. Users should opt-in when they need the semantic layer.

### Extra Cost of enableFacts=true
Per tick with N agents and E dispatched events:
- **Storage**: O(E) EventFact objects per tick (append-only, never deleted)
- **Knowledge propagation**: O(E × P) where P = avg participants+observers per event
- **Event consequences**: O(E × A) memory deltas + location meaning + future tendency
- **State facts**: O(N) agent_state facts overwritten each tick
- **Relationship facts**: O(R) relationship facts updated each tick (R = relationship count)

The main cost is **EventFact accumulation** and **knowledge graph growth** over long simulations.

### Impact on smoke/benchmark/perf
- `enableFacts=false` (default): No measurable overhead — all fact code paths are gated by null checks
- `enableFacts=true`: Adds ~15-30% overhead per tick depending on event volume (see `tests/facts/performance-rebaseline.test.js`)

### Facts-on Profile
A `facts-on` profile can be safely provided without changing the default:
```js
const engine = new AndyEngine({ enableFacts: true, ...otherConfig });
```
This is already the pattern used by all fact system tests. No code changes needed — just documentation.

---

## 3. FactEmitter Current Responsibilities

### Methods and Usage

| Method | Called by runtime? | Called by tests? | Notes |
|--------|-------------------|------------------|-------|
| `emitStaticFacts(domain)` | Yes — AndyWorld Phase 3 (line 312) | Yes | One-time domain region/adjacency facts |
| `emitAgentStateFacts(agents)` | Yes — AndyWorld Phase 3 (line 313) | Yes | Per-tick agent state snapshot |
| `emitObservationFacts(events)` | Yes — AndyWorld Phase 9 (line 426) | Yes | From interaction events |
| `emitRelationshipFacts(graph)` | Yes — AndyWorld Phase 9 (line 427) | Yes | From SocialGraph |
| `emitMemoryFacts(agents)` | **No** — not called by any runtime code | Yes | Only in `tests/facts/fact-system-integration.test.js` |
| `emitEventFacts(events)` | **No** — CanonEventPipeline is the canonical path | Yes (2 tests) | BOUNDARY: fallback only, see JSDoc warning |
| `propagateEventKnowledge(fact, agents)` | **No** — CanonEventPipeline is the canonical path | Yes (2 tests) | BOUNDARY: fallback only, see JSDoc warning |

### emitEventFacts / propagateEventKnowledge Status

These methods are marked with `**BOUNDARY**` JSDoc comments (FactEmitter.js:141-146, 329-331) stating they are fallbacks for when CanonEventPipeline is not enabled.

**Runtime callers**: None. The only callers are in `tests/facts/fact-system-integration.test.js:111-112`, which tests deterministic ID generation.

**Can we add a boundary test?** Yes. A test could verify that `emitEventFacts` and `propagateEventKnowledge` are never called when `canonEventPipeline` is non-null:
```js
it('runtime never calls emitEventFacts when CanonEventPipeline is enabled', () => {
  const engine = new AndyEngine({ enableFacts: true });
  const spy = jest.spyOn(engine.world.factEmitter, 'emitEventFacts');
  engine.tick();
  expect(spy).not.toHaveBeenCalled();
});
```

### Boundary Violation Risk
Low. The JSDoc warnings are clear, and `AndyWorld.step()` uses `canonEventPipeline.processEvents()` exclusively for event→fact conversion (line 386). `emitEventFacts` is never called in the tick pipeline.

---

## 4. stateMachine.currentState Usage Classification

### Source of Truth
`currentState` is a **getter** wired to `behaviorField.label` via `Object.defineProperty` in `src/agent/lifecycle/AgentWiring.js:25`. Writing to it is a no-op (line 27).

### Classification

#### A. Pure Display/Narrative/Serialization — Can Keep

| File | Line | Usage |
|------|------|-------|
| `src/agent/facade/AgentNarrative.js` | 21 | `const rawState = agent.stateMachine.currentState` — narrative display |
| `src/agent/facade/InteractionFacade.js` | 41 | `_currentState: agent.stateMachine.currentState` — context snapshot |
| `src/agent/facade/ExternalExperience.js` | 27 | `normalized._currentState = agent.stateMachine.currentState` — event normalization |
| `src/canon/FactEmitter.js` | 97 | `agent.stateMachine?.currentState || '未知'` — agent_state fact label |
| `src/agent/runtime/ActionSelectionRuntime.js` | 31 | `state: agent.stateMachine.currentState` — action context snapshot |

#### B. Memory/Procedural Record — Can Keep

| File | Line | Usage |
|------|------|-------|
| `src/agent/AgentRuntime.js` | 185 | `state: agent.stateMachine.currentState` — proceduralMemory.recordAction |
| `src/agent/handlers/ScheduleHandler.js` | 275 | `_currentState: agent.stateMachine.currentState` — event context for memory (hardcoded sleep/night/sick resolved in Stage 32) |
| `src/agent/runtime/PerceptionRuntime.js` | 78 | `_currentState: agent.stateMachine.currentState` — event context for memory |
| `src/agent/memory/PersonalMemory.js` | 172, 884-885 | `event._currentState` — memory encoding context |

#### C. Domain Semantic Metadata Lookup — Keep with Caution

| File | Line | Usage | Risk |
|------|------|-------|------|
| `src/agent/handlers/ScheduleHandler.js` | 71 | `agent._domain.states[agent.stateMachine.currentState]` — state metadata for schedule | Low — metadata only |
| `src/agent/runtime/ReflectionRuntime.js` | 63 | `STATES[agent.stateMachine.currentState]` — state metadata for reflection | Low — metadata only |
| `src/agent/psychology/NeedsSystem.js` | 133, 145 | `tick(hoursElapsed, currentState, currentRegion)` — old interface, maps states to need recovery | Medium — couples needs to discrete states |
| `src/agent/psychology/NeedsSystem.native.js` | 89-90 | Same as above (native binding) | Medium |

#### D. Behavior/Health/Appraisal Control Logic — Should Migrate or Add Tests

| File | Line | Usage | Risk | Recommendation |
|------|------|-------|------|----------------|
| `src/agent/runtime/PhysiologyRuntime.js` | 141-142 | Threshold-based health check (Stage 29) | **LOW** | ✅ Resolved — no longer uses hardcoded state names |
| `src/agent/psychology/Appraisal.js` | 156, 164 | `socialStates.includes(currentState)` — goal relevance calculation | **MEDIUM** | Add test; domain-driven lookup is acceptable |
| `src/agent/psychology/Appraisal.js` | 223 | `scheduledStates.includes(agent.stateMachine.currentState)` — goal conduciveness | **MEDIUM** | Add test |
| `src/agent/psychology/EmotionRegulation.js` | 143, 147 | Domain category lookup (Stage 32) | **LOW** | ✅ Resolved — uses domain category, not hardcoded states |
| `src/agent/AgentRuntime.js` | 119 | `state: agent.stateMachine.currentState` — intrinsicMotivation input | **LOW** | IM uses it for context, not control |
| `src/agent/AgentRuntime.js` | 172 | `agent.emotionRegulation.tick(hoursElapsed, agent.stateMachine.currentState)` | **LOW** | See EmotionRegulation above |

### Summary
- **A (display)**: 5 usages — safe
- **B (memory)**: 4 usages — safe
- **C (metadata)**: 4 usages — low-medium risk, domain-driven
- **D (control)**: 6 usages — 2 resolved (Stage 29, 32), 4 remaining low-medium risk

The **highest risk** usages have been resolved:
- `PhysiologyRuntime.js:141-142` → now uses threshold-based health check (Stage 29)
- `EmotionRegulation.js:143,147` → now uses domain category lookup (Stage 32)

---

## 5. CandidateProvider Gaps

### Existing Providers (6)

| Provider | Source Signal | Candidates Generated |
|----------|-------------|---------------------|
| `ContinueCandidateProvider` | behaviorField.label | `continue` (always one) |
| `NeedCandidateProvider` | needs (hunger/energy/social/comfort/stimulation) | `consume`, `rest`, `socialize`, `explore`, `rest` |
| `ScheduleCandidateProvider` | schedule.currentActivity | `continue`, `move`, `rest`, `work`, `socialize`, `explore`, `consume`, `observe`, `reflect` |
| `BehaviorFieldCandidateProvider` | behaviorField.B (4D vector) | `rest`, `socialize`, `work`, `observe` |
| `ExploreCandidateProvider` | intrinsicMotivation.curiosity | `explore` |
| `SocializeCandidateProvider` | relationships (strength > 0.1) | `socialize` |

### Missing Providers

#### MemoryCandidateProvider (memory-driven candidates) — Stage 34
**Gap**: Agent memories (important, emotionally tagged, recent) do not generate action candidates.
**Example**: An agent with a strong memory of "上次在公园很开心" should generate an `explore` or `move` candidate targeting the park.
**Data available**: `context.memories` (last 10 memories, built in `buildActionContext` line 46)
**Impact**: Medium. Memory already influences behavior through emotion (mood-congruent recall) and appraisal, but does not directly propose actions.
**Status**: Planned for Stage 34

#### HabitCandidateProvider (procedural memory-driven candidates) — Stage 35
**Gap**: Procedural memory habits do not generate action candidates.
**Example**: An agent who always drinks coffee at 8am should generate a `consume` candidate at that time.
**Data available**: `agent.proceduralMemory` (habit strength, time patterns)
**Impact**: Medium-high. Procedural memory records actions (`AgentRuntime.js:181`) and has `getHabitStrength()`, but the action selection pipeline never queries it for candidates.
**Status**: Planned for Stage 35

#### WorldPressureCandidateProvider (world pressure-driven candidates) — Stage 36
**Gap**: Environmental pressures (weather, time of day, social density) do not generate candidates.
**Example**: Rain should generate a `move` candidate toward indoor locations. Late night should generate a `rest` candidate.
**Data available**: `context.environment` (hour, dayOfWeek, weather), `context.worldPressure` (currently `null`, line 51)
**Impact**: Low-medium. Weather effects are handled by the event system and health system, but do not directly propose shelter/rest actions.
**Status**: Planned for Stage 36

### Provider Coverage Matrix

| Signal Source | Has Provider? | Notes |
|--------------|---------------|-------|
| Needs (Maslow) | Yes | NeedCandidateProvider |
| Schedule | Yes | ScheduleCandidateProvider |
| Behavior field | Yes | BehaviorFieldCandidateProvider |
| Intrinsic curiosity | Yes | ExploreCandidateProvider |
| Relationships | Yes | SocializeCandidateProvider |
| Continue current | Yes | ContinueCandidateProvider |
| **Memories** | **No** | Gap |
| **Procedural habits** | **No** | Gap |
| **World pressure** | **No** | Gap |
| **Emotion-driven** | **No** | Indirect via BehaviorFieldCandidateProvider (emotion→B→candidates) |

---

## Semantic Closure Status

**COMPLETE with documented gaps**

### What is closed:
1. ✅ action_selected event paths are fully traced for all 4 modes
2. ✅ enableFacts boundary is clean (false by default, accepted boundary — not a bug)
3. ✅ FactEmitter responsibilities are documented; event fallback methods are boundary-marked
4. ✅ currentState usage is classified (A/B/C/D) with risk assessment
5. ✅ CandidateProvider gaps are documented with impact analysis

### Resolved (Stages 29, 31, 32):
1. ✅ **PhysiologyRuntime.js:141-142** — hardcoded Chinese state comparison → fixed in Stage 29 (threshold-based health check)
2. ✅ **BehaviorField.js _lastLabel = '在发呆'** → fixed in Stage 31 (domain-driven initial label)
3. ✅ **BehaviorLabeler.js fallback** → fixed in Stage 31 (domain-driven fallback)
4. ✅ **EmotionRegulation hardcoded restStates** → fixed in Stage 32 (domain category lookup)
5. ✅ **ScheduleHandler hardcoded sleep/night/sick** → fixed in Stage 32 (domain-driven schedule)

### Remaining gaps:

- **WorldObject spatial/perception/effect integration** — not implemented (out of scope for Semantic Closure Pass)
- **StoryArc runtime** — not implemented (out of scope)
- **enableFacts default false** — accepted boundary, not a bug
- **Full deterministic replay** — SDK/tooling paths not in replay scope
