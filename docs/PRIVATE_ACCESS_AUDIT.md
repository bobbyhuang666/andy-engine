# Private Access Beta-Readiness Audit (A5.4)

> **Date**: 2026-06-22
> **Scope**: All `src/` cross-module `_private` field reads
> **Goal**: Document every remaining private-field access across module boundaries, classify risk, and plan accessor additions before beta.

---

## Summary

| Risk | Count | Must fix before beta |
|------|-------|---------------------|
| HIGH | 7 patterns | Yes |
| MEDIUM | 5 patterns | Recommended |
| LOW | 3 patterns | Optional |

---

## HIGH RISK — Must fix before beta

### H1. `agent._domain` (7+ files, 25+ access sites)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/effects/EffectCommitter.js` | 163 | Read domain for effect commitment context |
| `src/agent/AgentRuntime.js` | 172 | Pass domain to emotionRegulation.tick |
| `src/agent/handlers/ScheduleHandler.js` | 70, 78, 135, 152, 162, 203, 213-214, 238, 258, 302, 307-308 | Read timeRules, states, placeTypes, skipBehavior, needRegionConfig |
| `src/agent/psychology/Appraisal.js` | 41 | Get domain for appraisal context |
| `src/agent/psychology/EmotionRegulation.js` | 335 | Read domain for emotion regulation |
| `src/agent/facade/AgentNarrative.js` | 26, 28, 44, 106, 163 | Read narrativeTemplates, semanticProfile, states, forbiddenTerms |
| `src/agent/runtime/ActionSelectionRuntime.js` | 80, 228-229 | Pass domain to action env, validate region |
| `src/agent/runtime/MindWanderRuntime.js` | 19, 157 | Read semanticProfile |
| `src/agent/runtime/PhysiologyRuntime.js` | 89 | Read placeTypes.outdoor |

**Risk**: HIGH — 25+ reads across 9 files spanning agent, effects, and runtime modules. Any refactor of domain storage breaks all callers.

**Proposed accessor**: `agent.getDomain()` or `Object.defineProperty(agent, 'domain', { get() { return this._domain; } })`

**Must fix before beta**: YES

---

### H2. `agent._socialGraphRef` (3 files, 8 access sites)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/effects/EffectCommitter.js` | 137 | Get social graph for relationship delta application |
| `src/agent/runtime/ActionSelectionRuntime.js` | 66-67, 244, 247-249 | Get relationships, validate agent existence in graph |
| `src/agent/psychology/Appraisal.js` | 291 | Look up relationship for appraisal |

**Risk**: HIGH — Cross-module access to a mutable reference. If social graph storage changes, all three modules break silently.

**Proposed accessor**: `agent.getSocialGraph()` or `agent.socialGraph` getter

**Must fix before beta**: YES

---

### H3. `socialGraph._adjacency` (1 external file)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/canon/FactEmitter.js` | 236 | Iterate all agents in social graph for fact propagation |

**Risk**: HIGH — FactEmitter reaches into SocialGraph internals. If adjacency representation changes (e.g., from Map to adjacency list), FactEmitter breaks.

**Proposed accessor**: `socialGraph.getAllAgentIds()` or `socialGraph.adjacency` getter returning a read-only view

**Must fix before beta**: YES

---

### H4. `agent._behavior` (3 files, 4 access sites)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/agent/handlers/ScheduleHandler.js` | 145 | Read socialEnergyDrain for schedule decisions |
| `src/agent/runtime/PhysiologyRuntime.js` | 163, 167 | Read socialEnergyDrain/Recharge for energy calc |
| `src/agent/psychology/IntrinsicMotivation.js` | 261 | Read noveltySeeking for motivation |

**Risk**: HIGH — Cross-module read of behavior parameters that affect runtime decisions. Breaks if behavior object shape changes.

**Proposed accessor**: `agent.getBehavior()` or `agent.behavior` getter

**Must fix before beta**: YES

---

### H5. `agent._rand` (3 files, 11 access sites)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/agent/handlers/ScheduleHandler.js` | 117, 133, 146, 155, 167, 208, 243, 272 | Seeded random for schedule decisions |
| `src/agent/handlers/MindWanderHandler.js` | 22 | Seeded random for mind wander probability |
| `src/agent/runtime/MindWanderRuntime.js` | 88, 95 | Seeded random for daydream content selection |

**Risk**: HIGH — Seeded RNG is critical for determinism. Accessing `_rand` directly bypasses any future RNG context changes.

**Proposed accessor**: `agent.rand()` or `agent.random()` public method

**Must fix before beta**: YES

---

### H6. `eventDispatcher._simTime` (1 external write)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/runtime/AndyWorld.js` | 356 | Directly sets `eventDispatcher._simTime = this.clock.time` |

**Risk**: HIGH — External write to private field. Breaks if EventDispatcher changes time storage format.

**Proposed accessor**: `eventDispatcher.setSimTime(time)` method

**Must fix before beta**: YES

---

### H7. `memory._simTime` (2 external files, 4 access sites)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/agent/facade/AgentNarrative.js` | 23, 97 | Read simTime for state info and narrative timestamp |
| `src/agent/runtime/MindWanderRuntime.js` | 144, 156 | Read simTime for daydream timestamp and time-since calc |

**Risk**: HIGH — Cross-module reads of memory internal time. PersonalMemory already has `setSimTime()` but no public getter.

**Proposed accessor**: `memory.getSimTime()` or `memory.simTime` getter

**Must fix before beta**: YES

---

## MEDIUM RISK — Should fix before beta

### M1. `rel._hoursSinceLastInteraction` (1 external file)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/pressure/RelationshipPressure.js` | 57-58 | Read hours since last interaction for pressure decay calc |

**Risk**: MEDIUM — Read-only access, but Relationship already uses this internally for decay. If storage changes, pressure calc breaks silently.

**Proposed accessor**: `rel.getHoursSinceLastInteraction()` or `rel.hoursSinceLastInteraction` getter

**Must fix before beta**: Recommended

---

### M2. `fact._invalidated` (2 external files)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/knowledge/KnowledgeStore.js` | 59 | Filter invalidated facts |
| `src/narrative/FactProvider.js` | 32 | Skip invalidated facts in narrative |

**Risk**: MEDIUM — Read-only, but if invalidation storage changes (e.g., to a Set), both callers break.

**Proposed accessor**: `fact.isInvalidated()` or `fact.invalidated` getter

**Must fix before beta**: Recommended

---

### M3. `fact._invalidationId` (1 file)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/canon/WorldFactStore.js` | 429 | Set invalidation id on fact (internal write, but fact crosses boundaries) |

**Risk**: MEDIUM — Fact objects cross module boundaries (KnowledgeStore, FactProvider). Private mutation fields should have controlled access.

**Proposed accessor**: `fact.invalidate(invalidationId)` method

**Must fix before beta**: Recommended

---

### M4. `neighbor._behavior.expressiveness` (1 file)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/runtime/AndyWorld.js` | 624 | Read neighbor's expressiveness for social contagion |

**Risk**: MEDIUM — AndyWorld reaches into agent internals for social contagion calc. Combined with H4 (agent._behavior), this compounds the coupling.

**Proposed accessor**: Use `agent.getBehavior().expressiveness` (depends on H4 fix)

**Must fix before beta**: Recommended

---

### M5. `store._knowledge`, `store._sources` (1 file, deserialization)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/knowledge/KnowledgeStore.js` | 124, 128 | Direct internal map writes during deserialization |

**Risk**: MEDIUM — Only in `fromJSON`, but if KnowledgeStore changes internal storage, deserialization breaks. Should use a factory method.

**Proposed accessor**: Already internal to KnowledgeStore module — refactor `fromJSON` to use `new KnowledgeStore()` + populate method

**Must fix before beta**: Recommended

---

## LOW RISK — Fix if time permits

### L1. `rel._updateType()` (within SocialGraph module)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/social/SocialGraph.js` | 295, 334, 341 | Called during strength updates to recalculate relationship type |

**Risk**: LOW — Same module access (SocialGraph calling Relationship). Strong coupling guarantee since both are in `src/social/`.

**Proposed accessor**: Could make `_updateType()` public as `updateType()` within the social module

**Must fix before beta**: Optional

---

### L2. `factStore._nextId`, `_facts`, `_byType`, `_eventIndex` (1 file, deserialization)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/canon/WorldFactStore.js` | 355, 361-363, 365 | Direct internal state writes during `fromJSON` |

**Risk**: LOW — Only in `fromJSON`, internal to WorldFactStore. Standard deserialization pattern.

**Proposed accessor**: Refactor `fromJSON` to use constructor + populate pattern

**Must fix before beta**: Optional

---

### L3. `character._engine`, `_ownsEngine`, `_agent`, `_llm`, etc. (SDK internal)

**Files and lines:**

| File | Lines | Purpose |
|------|-------|---------|
| `src/sdk/Character.js` | 362-367 | Internal assignment during `fromJSON` |
| `src/sdk/Andy.js` | 192-204 | Internal state restoration during `fromJSON` |

**Risk**: LOW — SDK-internal serialization. Same module boundary.

**Proposed accessor**: No change needed — standard SDK pattern

**Must fix before beta**: No

---

## Implementation Plan

### Phase 1: Add read-only accessors (LOW RISK, HIGH IMPACT)

These are simple getter additions that don't change behavior:

```js
// In AgentRuntime or Agent class:
get domain() { return this._domain; }
get socialGraph() { return this._socialGraphRef; }
get behavior() { return this._behavior; }
rand() { return this._rand(); }
```

```js
// In PersonalMemory:
get simTime() { return this._simTime; }
```

```js
// In EventDispatcher:
setSimTime(time) { this._simTime = time; }
```

```js
// In SocialGraph:
get adjacency() { return this._adjacency; }  // read-only view
// or:
getAllAgentIds() { return [...this._adjacency.keys()]; }
```

```js
// In Relationship:
get hoursSinceLastInteraction() { return this._hoursSinceLastInteraction; }
```

### Phase 2: Migrate callers (MEDIUM RISK)

Replace `_private` reads with new accessors one file at a time, running `npm test` after each file.

### Phase 3: Validate

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
```

---

## Forbidden in this stage

- Large Agent class refactor
- Large SocialGraph refactor
- Psychology semantics changes
- Hot-path rewrites
- Changing internal data structures

---

## Test coverage note

All proposed accessors are read-only getters or simple setters. They expose existing behavior without changing it. Tests that currently pass through the private fields will continue to pass; the accessors just provide a stable public API.
