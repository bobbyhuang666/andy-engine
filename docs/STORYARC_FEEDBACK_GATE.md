# StoryArc Feedback Gate

> **Status: Active gate document. Controls StoryArc implementation authorization.**
> **StoryArc runtime implementation is NOT AUTHORIZED until all prerequisites below are met and explicitly approved by a human reviewer.**

---

## 1. Current Authorization Status

**StoryArc runtime: NOT AUTHORIZED**

StoryArc is a future architecture candidate only. No runtime implementation, no StoryArcManager, no StoryArcSystem, no EventDispatcher integration, no goal injection, no memory priming, no appraisal bias implementation is permitted under this gate.

---

## 2. Why This Gate Exists

StoryArc introduces systemic risk that requires explicit human approval:

| Risk | Description |
|------|-------------|
| **BehaviorField bypass** | StoryArc could directly manipulate B vectors or state labels, breaking Langevin dynamics |
| **Determinism violation** | Uncontrolled narrative randomness could destroy seed-level replay |
| **Domain/product leakage** | StoryArc templates could hardcode campus/tavern/Bobby semantics into core |
| **Stable Envelope expansion** | StoryArc data could leak into public schema without RFC approval |
| **LLM world-fact injection** | StoryArc could let LLM decide world facts instead of structured events |
| **Replay scope creep** | StoryArc replay guarantees are undefined and could conflict with core simulation replay |

---

## 3. Prerequisites for StoryArc Implementation

All of the following must be satisfied before StoryArc runtime is authorized:

### P1: EventEffectPipeline Stability
- `core/EventEffectPipeline.js` is stable and tested
- Pipeline writes `stateDeltas` into ReasonTrace
- Pipeline handles at least: emotion delta, need delta, memory add, relationship interaction

### P2: GoalSystem Integration Clarity
- GoalSystem is either:
  - Safely integrated into Agent action selection (via scorer), OR
  - Explicitly documented as scorer-only with no runtime injection
- Goal influence on behavior is visible in ReasonTrace

### P3: WorldObject Integration Clarity
- WorldObject is either:
  - Integrated into perception/candidate/event pipeline, OR
  - Explicitly documented as independent data model with no runtime coupling
- Object lifecycle changes are traceable

### P4: ReasonTrace Schema Stability
- ReasonTrace schema is finalized and versioned
- All action selection fields are deterministic under same seed/state
- ReasonTrace is JSON-serializable without live object references

### P5: Seeded RNG Replay Scope Defined
- Replay scope document exists: what is deterministic, what is not
- Core simulation tick path is deterministic under same seed
- SDK/tooling/store paths are explicitly excluded or separately approved

### P6: StoryArc Boundary RFC Approved
- A separate RFC defines whether StoryArc data belongs in Domain Config, World State, or runtimeSnapshot
- The RFC is reviewed and approved by a human architect
- Stable Envelope extension, if needed, has separate approval

---

## 4. Forbidden Actions

The following are explicitly forbidden until StoryArc runtime is authorized:

| Forbidden | Reason |
|-----------|--------|
| Directly set `emotion.current[dim]` | Bypasses Appraisal + emotion evolution pipeline |
| Directly set `needs.needs[key]` | Bypasses needs decay/tick system |
| Directly set `relationship.strength` | Bypasses interaction-based relationship evolution |
| Directly set `behaviorField.B[d]` | Bypasses Langevin dynamics |
| Directly set `behaviorField.label` | Bypasses BehaviorLabeler projection |
| Directly set `stateMachine.currentState` | Bypasses BehaviorField → label derivation |
| Write memory as "fact" without event | Bypasses Appraisal → memory encoding pipeline |
| LLM decides world facts | Bypasses EventDispatcher validation |
| Bypass `validateDomain()` | Bypasses domain config validation |

---

## 5. Allowed Future Influence Channels

When StoryArc runtime is eventually authorized, it may only influence through these indirect channels:

| Channel | Mechanism | Validation |
|---------|-----------|------------|
| **Event opportunity** | Inject structured events into EventDispatcher | Events must pass `validateDomain` and `createEvent` validation |
| **Goal pressure** | Inject goals into GoalSystem as `world_event` source | Goals must use structured predicates, not free-form commands |
| **Appraisal bias** | Modify Appraisal dimension scales/offsets | Bias must be bounded and visible in ReasonTrace |
| **Memory priming** | Add activation bonus to matching memories in ACT-R retrieval | Priming term must be deterministic and bounded |
| **World pressure** | Adjust WorldPressure scores | Pressure must be read-only input to UtilityScorer |

All influence channels must:
- Pass through EventEffectPipeline or ReasonTrace
- Be visible in `reasonTrace.stateDeltas` or `reasonTrace.keyReasons`
- Use seeded RNG for any stochastic behavior
- Be domain-agnostic (no hardcoded campus/tavern terms)

---

## 6. Required Test Plan (for future StoryArc implementation)

The following tests must pass before StoryArc runtime is approved:

| Test | Requirement |
|------|-------------|
| **Determinism** | Same seed + same StoryArc state → same next N action/event traces |
| **No direct state mutation** | StoryArc never directly writes to emotion/needs/relationship/B vector/state label |
| **ReasonTrace inclusion** | StoryArc influence appears in `reasonTrace.keyReasons` or `reasonTrace.stateDeltas` |
| **Domain safety** | Custom domain StoryArc templates contain no campus/modern terms |
| **Replay with same seed** | Full simulation with active StoryArc is replayable under same seed |
| **No Stable Envelope expansion** | StoryArc does not extend Stable World Envelope unless separately approved |
| **Validator integration** | StoryArc events/goals pass `validateDomain()` and `validateWorldState()` |

---

## 7. Non-Goals

This gate document does NOT:
- Implement StoryArc runtime
- Define StoryArc API
- Approve Stable Envelope extension
- Authorize LLM-based narrative control
- Replace `docs/STORY_ARC_FEEDBACK_RFC.md` (which remains as research RFC draft)

---

## 8. Next Step

The next step is **human review and approval**, not implementation.

A human architect must:
1. Review this gate document
2. Review `docs/STORY_ARC_FEEDBACK_RFC.md` as research reference
3. Confirm all prerequisites (P1-P6) are satisfied
4. Explicitly authorize StoryArc runtime implementation
5. Define the scope of the first StoryArc implementation phase

**Do not begin StoryArc runtime without explicit human authorization.**
