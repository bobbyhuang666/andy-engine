# State Writeback Ownership

> Status: active governance document (Stage 9).
> Scope: every state mutation path in `src/`.
> Purpose: make mutation ownership explicit so new code follows the correct boundary.

---

## 1. Target Flow (World-Facing Consequences)

New world-facing state changes MUST follow this pipeline:

```
Action / CanonEvent
→ EffectResult
→ EffectDelta[]
→ EffectCommitter
→ State writeback
```

`src/effects/EffectCommitter.js` is the ONLY authorized applier of EffectResult deltas to live state. `src/effects/EventEffectPipeline.js` is the ONLY authorized producer of typed deltas from action/event inputs.

---

## 2. Mutation Path Audit

### 2.1 Memory (PersonalMemory)

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `memory.addExperience()` | `src/agent/runtime/PerceptionRuntime.js:80` | **owned by subsystem** | Tick-internal: event perception → memory storage |
| `memory.addExperience()` | `src/agent/handlers/ScheduleHandler.js:59` | **owned by subsystem** | Tick-internal: schedule skip → memory |
| `memory.addExperience()` | `src/agent/runtime/ReflectionRuntime.js` (via consolidate) | **owned by subsystem** | Tick-internal: reflection → consolidation |
| `memory.addExperience()` | `src/agent/runtime/ActionSelectionRuntime.js:191` | **owned by EffectCommitter** | Routed through EffectCommitter (Stage 22) |
| `memory.addExperience()` | `src/agent/facade/InteractionFacade.js:36` | **public API mutation** | SDK `recordExternalExperience` path |
| `memory.addExperience()` | `src/agent/facade/ExternalExperience.js:33` | **public API mutation** | SDK `injectExperience` path |
| `memory.addExperience()` | `src/effects/EffectCommitter.js:104` | **owned by EffectCommitter** | Canonical delta path |
| `memory.addAppraisalBias()` | `src/agent/runtime/PerceptionRuntime.js:58` | **owned by subsystem** | Tick-internal: appraisal → memory bias |
| `memory.setSimTime()` | `src/agent/AgentRuntime.js:84` | **owned by subsystem** | Tick setup: inject sim time |
| `memory.consolidate()` | `src/agent/runtime/ReflectionRuntime.js:17` | **owned by subsystem** | Tick-internal: periodic consolidation |
| `memory.tick()` | `src/agent/AgentRuntime.js:175` | **owned by subsystem** | Tick-internal: memory decay |
| `memory.tickAppraisalBiases()` | `src/agent/handlers/ReflectionHandler.js:25` | **owned by subsystem** | Tick-internal: bias decay |

### 2.2 Emotion (EmotionVector)

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `emotion.applyEffect()` | `src/agent/runtime/PerceptionRuntime.js:29,43` | **owned by subsystem** | Tick-internal: event → emotion reaction |
| `emotion.applyEffect()` | `src/agent/runtime/MindWanderRuntime.js:125` | **owned by subsystem** | Tick-internal: mind wander → emotion |
| `emotion.applyEffect()` | `src/agent/runtime/ReflectionRuntime.js:87` | **owned by subsystem** | Tick-internal: reflection → emotion |
| `emotion.applyEffect()` | `src/agent/runtime/PhysiologyRuntime.js:20,31,42,52,62,143` | **owned by subsystem** | Tick-internal: physiological needs → emotion |
| `emotion.applyEffect()` | `src/agent/psychology/EmotionRegulation.js:284,349,389` | **owned by subsystem** | Tick-internal: regulation strategies |
| `emotion.applyEffect()` | `src/agent/AgentRuntime.js:128` | **owned by subsystem** | Tick-internal: intrinsic motivation → emotion |
| `emotion.applyEffect()` | `src/agent/runtime/ActionSelectionRuntime.js:181` | **owned by EffectCommitter** | Routed through EffectCommitter (Stage 22) |
| `emotion.applyEffect()` | `src/agent/facade/InteractionFacade.js:34` | **public API mutation** | SDK interaction path |
| `emotion.setStress()` | `src/agent/runtime/ReflectionRuntime.js:44,47` | **owned by subsystem** | Tick-internal: reflection → stress |
| `emotion.setStress()` | `src/agent/runtime/PerceptionRuntime.js:86,88` | **owned by subsystem** | Tick-internal: event perception → stress |
| `emotion.setStress()` | `src/agent/psychology/EmotionRegulation.js:287` | **owned by subsystem** | Tick-internal: regulation → stress |
| `emotion.tick()` | `src/agent/AgentRuntime.js:169` | **owned by subsystem** | Tick-internal: 30-dim evolution pipeline |

### 2.3 Needs (NeedsSystem)

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `needs.tickWithBehavior()` | `src/agent/AgentRuntime.js:114` | **owned by subsystem** | Tick-internal: need depletion |
| `needs.needs[name] +=` | `src/agent/runtime/ActionSelectionRuntime.js:176` | **owned by EffectCommitter** | Routed through EffectCommitter (Stage 22) |
| `needs.needs[name] +=` | `src/effects/EffectCommitter.js:73` | **owned by EffectCommitter** | Canonical delta path |

### 2.4 Position

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `agent.position =` | `src/agent/handlers/ScheduleHandler.js:30` | **owned by subsystem** | Tick-internal: schedule-driven move |
| `agent.position =` | `src/agent/handlers/ScheduleHandler.js:67` | **owned by subsystem** | Tick-internal: needs-driven move |
| `agent.position =` | `src/agent/handlers/ScheduleHandler.js:84` | **owned by subsystem** | Tick-internal: IM-driven exploration |
| `agent.position =` | `src/agent/runtime/ActionSelectionRuntime.js:201` | **owned by EffectCommitter** | Routed through EffectCommitter via PositionDelta (Stage 22) |

### 2.5 BehaviorField

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `behaviorField.B =` | `src/agent/lifecycle/AgentSubsystemFactory.js:62` | **test-only mutation** | Agent initialization only |
| `behaviorField.B =` | `src/agent/handlers/ScheduleHandler.js:37` | **owned by subsystem** | Tick-internal: schedule skip → state snap |
| `behaviorField.velocity =` | `src/agent/handlers/ScheduleHandler.js:38` | **owned by subsystem** | Tick-internal: schedule skip → velocity reset |

### 2.6 StateMachine (History Only)

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `stateMachine.stateEnteredAt =` | `src/agent/AgentRuntime.js:151` | **owned by subsystem** | Tick-internal: label change tracking |
| `stateMachine.stateEnteredAt =` | `src/agent/handlers/ScheduleHandler.js:47` | **owned by subsystem** | Tick-internal: schedule skip tracking |
| `stateMachine.history.push/slice` | `src/agent/AgentRuntime.js:152,158` | **owned by subsystem** | Tick-internal: history maintenance |
| `stateMachine.history.push/slice` | `src/agent/handlers/ScheduleHandler.js:48` | **owned by subsystem** | Tick-internal: schedule skip history |

### 2.7 Health & SocialEnergy

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `agent.health =` | `src/agent/runtime/PhysiologyRuntime.js:138` | **owned by subsystem** | Tick-internal: health update |
| `agent.socialEnergy =` | `src/agent/runtime/PhysiologyRuntime.js:161,165` | **owned by subsystem** | Tick-internal: social energy update |

### 2.8 Relationship (SocialGraph)

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `relationship.recordInteraction()` | `src/runtime/EventDispatcher.js:278` | **owned by EffectCommitter** | Encounter effects routed through EffectCommitter in AndyWorld (Stage 22) |
| `relationship.recordInteraction()` | `src/agent/runtime/ActionSelectionRuntime.js:217` | **owned by EffectCommitter** | Routed through EffectCommitter (Stage 22) |
| `relationship.recordInteraction()` | `src/effects/EffectCommitter.js:122` | **owned by EffectCommitter** | Canonical delta path |

### 2.9 FutureTendency (FutureTendencyTracker)

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `futureTendency.updateTendency()` | `src/effects/EffectCommitter.js:152` | **owned by EffectCommitter** | Only write path — fully routed |

### 2.10 FactStore (WorldFactStore)

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `factStore.addFact()` | `src/canon/CanonEventPipeline.js:51` | **owned by subsystem** | Canonical: dispatched event → fact |
| `factStore.addFact()` | `src/canon/FactEmitter.js:58,74,130,169,212,263,316` | **legacy fallback (boundary-documented)** | Legacy emitter — new event-fact paths must NOT use this; guarded by boundary docs (Stage 22) |
| `factStore.invalidateFact()` | `src/canon/WorldFactStore.js:413` | **owned by subsystem** | Internal store operation |
| `factStore.updateLocationMeaning()` | `src/effects/EffectCommitter.js:140` | **owned by EffectCommitter** | Canonical delta path |

### 2.11 KnowledgeStore

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `knowledgeStore.addKnowledge()` | `src/canon/CanonEventPipeline.js:112,121,132` | **owned by subsystem** | Canonical: event → knowledge grant |
| `knowledgeStore.addKnowledge()` | `src/canon/FactEmitter.js:335,341,349` | **legacy fallback (boundary-documented)** | Legacy emitter path — guarded by boundary docs (Stage 22) |

### 2.12 ProceduralMemory

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `proceduralMemory.recordAction()` | `src/agent/AgentRuntime.js:181` | **owned by subsystem** | Tick-internal: habit recording |
| `proceduralMemory.tick()` | `src/agent/AgentRuntime.js:189` | **owned by subsystem** | Tick-internal: habit decay |
| `proceduralMemory.disrupt()` | `src/agent/AgentRuntime.js:195` | **owned by subsystem** | Tick-internal: surprise → habit break |
| `proceduralMemory.setSimTime()` | `src/agent/AgentRuntime.js:85` | **owned by subsystem** | Tick setup |

### 2.13 EmotionRegulation & IntrinsicMotivation

| Pattern | Location | Classification | Notes |
|---------|----------|---------------|-------|
| `emotionRegulation.tryRegulate()` | `src/agent/AgentRuntime.js:104` | **owned by subsystem** | Tick-internal: Gross regulation |
| `emotionRegulation.tick()` | `src/agent/AgentRuntime.js:172` | **owned by subsystem** | Tick-internal: resource recovery |
| `intrinsicMotivation.tick()` | `src/agent/AgentRuntime.js:117` | **owned by subsystem** | Tick-internal: curiosity drive |

---

## 3. Action Selector Verification

`src/action/` modules (UtilityScorer, UtilitySelector, ActionCandidate, GoalSystem, providers) are **read-only** with respect to agent state. They only consume context snapshots and produce candidates/scores. ✅ No violations found.

---

## 4. Intentionally NOT Routed Through EffectCommitter

The following mutation categories are **intentionally** owned by their respective subsystems and must NOT be routed through EffectCommitter:

### 4.1 Psychological Tick Mutations

These are internal to `Agent.tick()` and represent the continuous psychological evolution of the agent:

- **Emotion evolution**: `emotion.tick()` — 30-dimensional emotion pipeline (Cowen & Keltner 2017)
- **Emotion regulation**: `emotionRegulation.tryRegulate()` / `.tick()` — Gross process model
- **Emotion effects**: `emotion.applyEffect()` — perception, mind wander, reflection, physiology, intrinsic motivation
- **Emotion stress**: `emotion.setStress()` — perception, reflection, regulation
- **Need depletion**: `needs.tickWithBehavior()` — Maslow hierarchy continuous depletion
- **Memory decay**: `memory.tick()` — ACT-R activation decay
- **Memory consolidation**: `memory.consolidate()` — periodic consolidation during reflection
- **Memory appraisal bias**: `memory.addAppraisalBias()` / `.tickAppraisalBiases()` — Scherer CPM integration
- **Procedural memory**: `proceduralMemory.recordAction()` / `.tick()` / `.disrupt()` — habit formation
- **Health update**: `agent.health` — physiological health model
- **Social energy**: `agent.socialEnergy` — social energy based on behavior field
- **Intrinsic motivation**: `intrinsicMotivation.tick()` — SDT curiosity drive
- **Schedule-driven position**: `agent.position` — schedule/needs/IM driven location changes
- **Schedule-driven behavior snap**: `behaviorField.B` / `.velocity` — schedule skip state override
- **StateMachine history**: `stateMachine.stateEnteredAt` / `.history` — label change tracking

**Rationale**: These mutations represent the internal psychological dynamics of the agent. They are deterministic given the same inputs and follow established psychological theories. Routing them through EffectCommitter would add indirection without architectural benefit, since they are not "world-facing consequences" but rather "agent-internal evolution."

### 4.2 Tick Setup

- `memory.setSimTime()` / `proceduralMemory.setSimTime()` — time injection before tick begins

---

## 5. Legacy Direct Mutations (Resolved in Stage 22)

All previously documented legacy direct mutation paths have been resolved:

| Path | Location | Resolution |
|------|----------|------------|
| Action active mode: emotion writeback | `ActionSelectionRuntime.js` | Routed through EffectCommitter via EmotionDelta |
| Action active mode: need writeback | `ActionSelectionRuntime.js` | Routed through EffectCommitter via NeedDelta |
| Action active mode: memory writeback | `ActionSelectionRuntime.js` | Routed through EffectCommitter via MemoryDelta |
| Action active mode: position writeback | `ActionSelectionRuntime.js` | Routed through EffectCommitter via PositionDelta |
| Action active mode: relationship writeback | `ActionSelectionRuntime.js` | Routed through EffectCommitter via RelationshipDelta |
| EventDispatcher encounter → relationship | `EventDispatcher.js` | Removed direct write; effects applied through EffectCommitter in AndyWorld._applyEncounterEffects |
| EventDispatcher encounter → gossip memory | `EventDispatcher.js` | Removed direct write; deferred as event effect, applied through EffectCommitter |
| FactEmitter event facts | `FactEmitter.js` | Boundary-documented as legacy fallback; new code must use CanonEventPipeline |
| FactEmitter knowledge grants | `FactEmitter.js` | Boundary-documented as legacy fallback; new code must use CanonEventPipeline |

---

## 6. Classification Summary

| Classification | Count | Description |
|---------------|-------|-------------|
| **owned by subsystem** | ~35 | Psychological tick mutations — intentionally internal |
| **owned by EffectCommitter** | 11 | Canonical delta paths (need, emotion, memory, position, relationship, locationMeaning, futureTendency) |
| **legacy fallback (boundary-documented)** | 2 | FactEmitter event facts + knowledge grants — guarded, new code must use CanonEventPipeline |
| **test-only mutation** | 1 | Agent initialization (SubsystemFactory) |
| **public API mutation** | 3 | SDK seams (InteractionFacade, ExternalExperience) |

---

## 7. Enforcement

- `src/action/` modules must NOT mutate agent state (verified clean ✅).
- New world-facing consequences MUST use `EffectResult` → `EffectCommitter`.
- New dispatched-event → fact conversions MUST use `CanonEventPipeline`, not `FactEmitter`.
- `FactEmitter.emitEventFacts()` and `propagateEventKnowledge()` are legacy fallback paths — new code must NOT use them.
- Psychological tick mutations are exempt from EffectCommitter routing per this document.
