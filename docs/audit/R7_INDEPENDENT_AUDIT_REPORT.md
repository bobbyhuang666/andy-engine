# R7 Independent Audit Report

**Date**: 2026-06-28
**Auditor**: Independent Auditor (R7 round)
**Scope**: LOW/MEDIUM issues, uncovered edge cases, cross-module interaction bugs, determinism invariants, memory/performance

---

## Methodology

5 parallel sub-AI agents scanned different dimensions:
1. **Edge cases & input validation** — psychology subsystems, canon, effects, knowledge
2. **Error handling & state management** — runtime lifecycle, agent lifecycle, store/persistence, SDK
3. **Cross-module interaction seams** — action→effects→state, canon→knowledge→narrative, social→psychology, spatial→agent, domain→config
4. **Determinism & invariants** — Math.random/Date.now audit, writeback ownership, facts system, BehaviorField invariants
5. **Memory & performance** — unbounded collections, event listener leaks, O(N²) patterns, serialization bloat

Each finding was independently verified against actual source code. Sub-AI claims that could not be verified were rejected.

---

## Verified Bugs Fixed in R7

### R7-1 (CRITICAL): addAgent() silently overwrites duplicate ID → ghost agent
- **File**: `src/runtime/AndyWorld.js:179`
- **Bug**: `addAgent(agent)` calls `agents.set(agent.id, agent)` without checking if the ID already exists. The old agent becomes a "ghost" — still in socialGraph, still ticked, but invisible to the API.
- **Fix**: Throw `Error` if `agents.has(agent.id)` is true.
- **Test impact**: Updated tests that relied on silent overwrite behavior.

### R7-2 (CRITICAL): addCharacter() duplicate ID → ghost agent in engine
- **File**: `src/sdk/Andy.js:66,73`
- **Bug**: `addCharacter(config)` with a duplicate `config.id` overwrites the Character in `_characters` but leaves the old agent in `engine.world.agents`. Two agents with the same concept but one is invisible.
- **Fix**: Throw `Error` if `_characters.has(id)` is true.

### R7-3 (HIGH): KnowledgeStore stale entries after WorldFactStore eviction
- **Files**: `src/canon/WorldFactStore.js`, `src/knowledge/KnowledgeStore.js`
- **Bug**: `_evictEventFacts()` removes facts from WorldFactStore but never notifies KnowledgeStore. `hasKnowledge()` returns true for evicted facts. `_knowledge` and `_evidence` Maps grow without bound proportional to event throughput.
- **Fix**: 
  - Added `KnowledgeStore.purgeEvictedFacts(evictedIds)` method
  - Added `WorldFactStore.setKnowledgeStore()` wiring
  - `_evictEventFacts()` now calls `purgeEvictedFacts()` with evicted IDs
  - `hasKnowledge()` now also checks `factStore.getFactById()` for existence
  - AndyWorld wires the stores together after construction

### R7-4 (HIGH): ScheduleHandler bypasses position validation
- **File**: `src/agent/handlers/ScheduleHandler.js:30,67,89`
- **Bug**: ScheduleHandler directly sets `agent.position` without calling `domain.hasRegion()`. If the region doesn't exist in the domain, it creates a phantom region in RegionGrid.
- **Fix**: Added `_isValidRegion(agent, targetRegion)` static method that checks `domain.hasRegion()`. All three position assignment points now validate before moving.

### R7-5 (HIGH): RegionGrid auto-creates phantom regions
- **File**: `src/spatial/RegionGrid.js:45-47`
- **Bug**: `place(agentId, regionId)` silently creates a new Map entry for any unknown regionId. This masks bugs in callers and creates phantom regions that diverge from domain configuration.
- **Fix**: `place()` now returns `false` for unknown regions instead of auto-creating them. Agent stays in original region if the target is invalid.

### R7-6 (HIGH): PersonalMemory presentations array unbounded growth
- **File**: `src/agent/memory/PersonalMemory.js:835`, consolidation at line 737
- **Bug**: `_touchMemory()` pushes a Date to `presentations` on every access. At 2000 ticks with frequent retrieval, a single memory can accumulate 1000+ presentations (~60KB each). Consolidation merges presentations from two memories, amplifying growth.
- **Fix**: 
  - Added `cfg.maxPresentationsPerMemory = 50` config
  - `_touchMemory()` caps presentations after push
  - Consolidation merge caps presentations after concatenation
  - Keeps most recent presentations (most relevant for ACT-R activation)

### R7-7 (MEDIUM): AndyBridge methods callable before init()
- **File**: `src/sdk/AndyBridge.js:116-161`
- **Bug**: Public methods (`onUserMessage`, `onTick`, `getStoriesForAgent`, `getStats`) don't check `_initialized`. Pre-init calls produce undefined behavior with no clear error.
- **Fix**: Added `_requireInit(methodName)` guard that throws descriptive Error. Applied to all four methods.

### R7-8 (MEDIUM): fromWorldState(null) crashes with unhelpful error
- **File**: `src/store/world/WorldStateAdapter.js:80`
- **Bug**: `fromWorldState(worldState)` accesses `worldState.domainRef` without null check. Null input causes `TypeError: Cannot read properties of null` instead of meaningful message.
- **Fix**: Added null/undefined guard with descriptive error message.

---

## Rejected Findings (False Positives)

### Sub-AI claimed A1: "Null domain silently propagates into subsystems"
- **Verdict**: FALSE. Code inspection shows `PersonalMemory:40`, `NeedsSystem:62`, `BehaviorField:119`, `IntrinsicMotivation:46`, `StateMachine:26` all throw `Error` if `!domain`. The sub-AI did not actually read these constructors.
- **Lesson**: Never trust sub-AI claims without verifying in source code.

### Sub-AI claimed S1: "Future-version migration passthrough is a bug"
- **Verdict**: NOT A BUG. This is a design choice — unknown future versions should not be guessed at during migration. The validator will catch incompatible states downstream.

---

## Test Results

```
Test Files:  183 passed | 1 skipped (184)
Tests:       2979 passed | 22 skipped (3001)
Domain:      81 passed
Boundaries:  All checks passed
Smoke pack:  19 passed
git diff --check: Clean
Memory (5 agents × 2000 ticks): 39.21 MB
```

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 (fixed) |
| HIGH | 4 (fixed) |
| MEDIUM | 2 (fixed) |
| False positives rejected | 2 |

R7 found 8 real bugs, 2 CRITICAL (ghost agent from duplicate IDs) and 4 HIGH (knowledge/facts consistency, position validation, memory growth). All fixed and verified.

Convergence trend: R6 had 0 CRITICAL, 2 HIGH. R7 has 2 CRITICAL (new category — duplicate ID protection was never audited before), 4 HIGH (deeper cross-module issues). The audit is still finding meaningful issues but they are increasingly at the seams between modules rather than within individual modules.
