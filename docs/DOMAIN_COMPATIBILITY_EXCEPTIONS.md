# Domain Compatibility Exceptions

> Status: active governance document.
> Date: 2026-06-22.
> Purpose: document all remaining `bobby` and `campus` strings in `src/` that are allowed for backward compatibility.

---

## Bobby Exceptions

All `bobby` references in `src/` are backward-compatible aliases or comments. No new `bobby` references should be added.

| File | Line | What | Why Allowed |
|------|------|------|-------------|
| `src/store/SimulationStore.js` | 175 | `getStoriesForBobby()` method (deprecated alias) | Backward-compatible alias delegating to `getStoriesForAgent()` |
| `src/sdk/AndyBridge.js` | 149 | `getStoriesForBobby()` method (deprecated alias) | Backward-compatible alias delegating to `getStoriesForAgent()` |
| `src/sdk/AndyBridge.js` | 173 | `getBobbyEmotion()` method (deprecated alias) | Backward-compatible alias delegating to `getAgentEmotion()` |

---

## Campus Exceptions

`campus` references in `src/` fall into two categories: **backward compatibility defaults** and **preset references**. Both are allowed.

### Backward Compatibility Defaults

These ensure `new AndyEngine()` without explicit domain config still works (defaulting to campus preset).

| File | Line | What | Why Allowed |
|------|------|------|-------------|
| `src/domain/DomainRegistry.js` | 10 | `require('../../presets/campus')` | Default domain import |
| `src/domain/DomainRegistry.js` | 23 | `domainConfig \|\| campusDomain` | Fallback to campus when no domain provided |
| `src/domain/DomainRegistry.js` | 271 | JSDoc "获取默认的 DomainRegistry 实例（campus preset）" | Documentation |
| `src/store/world/migration.js` | 127 | `domainRef: 'campus'` | Legacy world state migration default |
| `src/store/world/compiler.js` | 19, 31-32 | `spec.domainRef !== 'campus'` check | Non-campus domains require explicit config |
| `src/store/world/WorldStateAdapter.js` | 85-86 | `worldState.domainRef !== 'campus'` check | Non-campus domains require explicit config |
| `src/sdk/Character.js` | 77, 82 | `domain.id === 'campus'` → default schedule 'student' | Campus-specific default schedule |
| `src/sdk/Character.js` | 303, 340-343 | `domainRef` default/validate against 'campus' | Serialization backward compatibility |
| `src/sdk/Andy.js` | 159, 180-183 | `domainRef` default/validate against 'campus' | Serialization backward compatibility |
| `src/sdk/NarrativeBuilder.js` | 256 | `domain.id !== 'campus'` check | Campus-specific narrative handling |

### Preset References

These load or reference the campus preset data files.

| File | Line | What | Why Allowed |
|------|------|------|-------------|
| `src/agent/schedule/Schedule.js` | 173, 178-182 | `require('../../../presets/campus/schedules')` | Loading preset data |
| `src/agent/schedule/Schedule.js` | 186-213 | Deprecated `createStudentSchedule` etc. | Deprecated methods pointing to preset |
| `src/agent/psychology/StateMachine.js` | 13 | Comment "从 campus domain 取" | Documentation |
| `src/agent/psychology/BehaviorLabeler.js` | 31, 342 | Comment about campus domain/legacy | Documentation |
| `src/agent/psychology/Appraisal.js` | 162, 172, 186, 221 | Comments "不 fallback 到 campus" | Documentation (anti-pattern warning) |

### Neutral Comments (No Action Needed)

These mention `campus` in a neutral or instructional context.

| File | Line | What | Why Allowed |
|------|------|------|-------------|
| `src/action/WorldObject.js` | 4 | "No campus terms" | Instruction comment |
| `src/action/providers/HabitCandidateProvider.js` | 10 | "no campus-specific strings hardcoded" | Instruction comment |
| `src/narrative/StoryGenerator.js` | 86 | "不依赖 campus" | Instruction comment |

---

## Rules

1. **No new `bobby` references** in `src/`. All existing are deprecated aliases.
2. **No new `campus` hardcoding** in `src/` runtime logic. Use domain config.
3. **New domain-specific defaults** must go through `DomainRegistry` or presets.
4. **Deprecated aliases** may be removed in the next major version.
