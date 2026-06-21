# Candidate Provider Completion Plan

> Stage 30 RFC — documentation only, no implementation

## Background

Stage 26 audit identified 3 missing CandidateProviders. The existing `ActionCandidate` class already declares these sources in `CANDIDATE_SOURCES`:

```js
// src/action/ActionCandidate.js:18-21
const CANDIDATE_SOURCES = [
  'behaviorField', 'need', 'schedule', 'memory', 'relationship',
  'habit', 'goal', 'worldPressure', 'object', 'intrinsic',
];
```

Current providers cover: `behaviorField`, `need`, `schedule`, `intrinsic`, `relationship`.  
Missing: `memory`, `habit`, `worldPressure`.

---

## Existing Provider Pattern

All providers follow this contract:

```
class XxxCandidateProvider extends CandidateProvider {
  constructor() { super('XxxCandidateProvider'); }

  generate(context) {
    // 1. Guard: return [] if required context missing
    // 2. Read from context (never modify it)
    // 3. Return ActionCandidate[]
  }
}
```

**Invariants:**
- `generate()` is pure — no side effects, no state writes
- Returns plain `ActionCandidate` objects (JSON-serializable)
- Does not touch WorldObject, StoryArc, emotion, needs, position, or relationships
- Scoring is handled by `UtilityScorer` downstream
- Effects are handled by `EffectPipeline` downstream

---

## Provider 1: MemoryCandidateProvider

### Purpose

Generate action candidates triggered by high-activation memories. When an agent vividly remembers "I studied in the library yesterday," that memory can suggest a `work` candidate.

### Input (from context)

| Field | Source | Description |
|-------|--------|-------------|
| `context.memory` | `PersonalMemory.retrieve()` | Top-K memories by ACT-R activation |
| `context.currentRegion` | Agent snapshot | Current location |
| `context.behaviorField.label` | BehaviorField | Current behavior label |

### Output

`ActionCandidate[]` where each candidate represents a memory-suggested action.

### Mapping Logic

| Memory Semantic Category | Action Type | Example |
|--------------------------|-------------|---------|
| `study`, `work` | `work` | "I remember studying here → study candidate" |
| `social`, `conflict` | `socialize` | "I remember chatting with X → socialize candidate" |
| `meal`, `snack` | `consume` | "I remember eating here → eat candidate" |
| `rest`, `sleep` | `rest` | "I remember resting here → rest candidate" |
| `explore`, `discovery` | `explore` | "I remember exploring this area → explore candidate" |

### Priority Rule

- Only emit candidates when memory probability > 0.5 (high-activation)
- Priority = `memory.probability * memory.importance` (capped at 1.0)
- Limit: max 2 memory candidates per tick (avoid flooding)

### Boundary

- **Read-only** from `PersonalMemory`
- **Never writes** to memory, emotion, needs, position, or relationships
- Does not call `addExperience()` or `addAppraisalBias()`

### Key API Used

```js
// PersonalMemory.retrieve() — ACT-R retrieval
const memories = personalMemory.retrieve({
  keywords: [context.currentRegion, context.behaviorField?.label],
  emotion: context.emotion,
  region: context.currentRegion,
}, 5);
// Returns: { memory, activation, probability }[]
```

---

## Provider 2: HabitCandidateProvider

### Purpose

Generate action candidates based on habitual patterns detected by `ProceduralMemory`. When an agent's recent action sequence matches a known habit pattern (e.g., "I always eat after class"), emit the habitual action as a candidate.

### Input (from context)

| Field | Source | Description |
|-------|--------|-------------|
| `context.proceduralMemory` | `ProceduralMemory` instance | Pattern store |
| `context.currentHour` | World time | Hour of day |
| `context.dayOfWeek` | World time | Day of week |
| `context.currentPosition` | Agent snapshot | Current position string |
| `context.currentValence` | Emotion snapshot | Current emotional valence |

### Output

`ActionCandidate[]` — typically 0 or 1 candidate (the matched habit).

### Mapping Logic

```
habit = proceduralMemory.query({
  hour: context.currentHour,
  dayOfWeek: context.dayOfWeek,
  position: context.currentPosition,
  valence: context.currentValence,
});

if (habit && habit.confidence > 0.5) {
  // Map habit.action.state → ActionCandidate type
}
```

| Habit State Pattern | Action Type |
|---------------------|-------------|
| `eating`, `食堂` | `consume` |
| `sleeping`, `resting` | `rest` |
| `working`, `studying` | `work` |
| `socializing`, `chatting` | `socialize` |
| `walking`, `moving` | `move` |

### Priority Rule

- Priority = `habit.confidence` (already 0-1, product of match × strength)
- Only emit when `confidence > 0.5`

### Boundary

- **Read-only** from `ProceduralMemory`
- **Never writes** to patterns, recent actions, or any agent state
- Does not call `recordAction()` or `disrupt()`

### Key API Used

```js
// ProceduralMemory.query() — pattern matching
const habit = proceduralMemory.query({
  hour, dayOfWeek, position, valence
});
// Returns: { action: { region, state }, confidence, patternKey } | null
```

---

## Provider 3: WorldPressureCandidateProvider

### Purpose

Generate action candidates in response to environmental pressure signals. When world pressure exceeds a threshold (e.g., crowded room, late night, negative events), suggest escape/mitigation actions.

### Input (from context)

| Field | Source | Description |
|-------|--------|-------------|
| `context.worldPressure` | `WorldPressure.compute()` | Pressure vector `{ time, location, crowding, event, total }` |
| `context.currentRegion` | Agent snapshot | Current location |
| `context.nearbyAgentCount` | World snapshot | Number of nearby agents |

### Output

`ActionCandidate[]` — pressure-response candidates.

### Mapping Logic

| Pressure Type | Threshold | Action Type | Rationale |
|---------------|-----------|-------------|-----------|
| `crowding > 0.3` | 0.3 | `move` | Leave crowded area |
| `time > 0.5` | 0.5 | `rest` | Late night → rest |
| `location > 0.3` | 0.3 | `move` | Unpleasant location → leave |
| `event > 0.3` | 0.3 | `observe` | Stressful event → observe/process |
| `total > 0.6` | 0.6 | `reflect` | High total pressure → reflect/cope |

### Priority Rule

- Priority = `pressureValue / 2` (capped at 1.0)
- Higher pressure → higher priority

### Boundary

- **Read-only** from `WorldPressure.compute()` result
- **Never writes** to world state, agent position, or events
- Does not call `WorldPressure.compute()` itself (reads pre-computed result from context)

### Key API Used

```js
// WorldPressure.compute() — pure static function
const pressure = WorldPressure.compute({
  world: context.world,
  agent: context.agent,
  events: context.events,
});
// Returns: { time, location, crowding, event, total }
```

---

## Architecture Rules (All 3 Providers)

1. **Generate-only**: Can only produce `ActionCandidate` plain objects
2. **No state writes**: Cannot modify memory, emotion, needs, position, relationships, or world
3. **No side effects**: `generate()` must be pure (same input → same output)
4. **Scoring delegation**: `UtilityScorer` handles all scoring — providers do not assign scores
5. **Effect delegation**: `EffectPipeline` handles all consequences — providers do not apply effects
6. **No WorldObject access**: Providers do not read or write WorldObject state
7. **No StoryArc access**: Providers do not read or write StoryArc state

---

## Integration Plan

### CandidateProviderManager Changes

```js
// src/action/providers/CandidateProviderManager.js
const { MemoryCandidateProvider } = require('./MemoryCandidateProvider');
const { HabitCandidateProvider } = require('./HabitCandidateProvider');
const { WorldPressureCandidateProvider } = require('./WorldPressureCandidateProvider');

class CandidateProviderManager {
  constructor() {
    this.providers = [
      new ContinueCandidateProvider(),
      new NeedCandidateProvider(),
      new ScheduleCandidateProvider(),
      new BehaviorFieldCandidateProvider(),
      new ExploreCandidateProvider(),
      new SocializeCandidateProvider(),
      // New providers:
      new MemoryCandidateProvider(),
      new HabitCandidateProvider(),
      new WorldPressureCandidateProvider(),
    ];
  }
  // ... generateAll() unchanged
}
```

### Context Enrichment

The caller (likely `Agent.tick()` or action selection pipeline) must populate these context fields before calling `generateAll()`:

```js
context.memory = personalMemory.retrieve(retrievalContext, 5);
context.proceduralMemory = proceduralMemory;
context.currentHour = world.getHour();
context.dayOfWeek = world.getDayOfWeek();
context.currentPosition = agent.position;
context.currentValence = emotion.getValence();
context.worldPressure = WorldPressure.compute(pressureContext);
context.currentRegion = agent.currentRegion;
context.nearbyAgentCount = world.getNearbyAgents(agent.id).length;
```

### No Changes Required To

- `UtilitySelector` — selection algorithm unchanged
- `UtilityScorer` — scores all candidates uniformly
- `EffectPipeline` — applies effects uniformly
- `ActionCandidate` — `memory`, `habit`, `worldPressure` sources already declared

---

## Testing Strategy

Each provider should have:

1. **Empty context test** — returns `[]` when required context missing
2. **Threshold test** — only emits candidates when signal exceeds threshold
3. **Priority test** — priority values are within [0, 1]
4. **Boundary test** — no state modification after `generate()` call
5. **Determinism test** — same context → same candidates (no randomness)

---

## Semantic Gaps Documented

| Gap | Description | Resolution |
|-----|-------------|------------|
| Memory → Action mapping | Semantic category → action type mapping is heuristic | May need domain-specific overrides |
| Habit state matching | `ProceduralMemory.query()` returns state strings, need mapping to `ACTION_TYPES` | Add mapping table or use BehaviorLabeler |
| Pressure threshold tuning | Thresholds (0.3, 0.5, 0.6) are initial guesses | Tune via experiments |
| Context field availability | Some context fields may not exist in current pipeline | Requires context enrichment in caller |

---

## Status

**COMPLETE** — RFC documented, no implementation. Semantic gaps identified for future resolution.
