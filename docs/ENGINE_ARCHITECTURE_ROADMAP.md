# Andy Engine Architecture Roadmap

> This document is a lightweight architecture backlog.
> It is not an implementation plan, not an API contract, and not a product roadmap.

---

## 1. Context

Andy Engine is moving toward a **Persistent World Engine**.

Recent demo-side requests raised five future engine capabilities:

- Memory to behavior gradient
- GoalSystem
- WorldObject API
- StoryArc feedback API
- Seedable RNG

These directions are architecturally relevant, but they must not bypass the current persistent-world hardening work. Any feature that enters engine core must first preserve:

- domain-agnostic runtime behavior
- BehaviorField as the behavior decision core
- Stable World Envelope boundaries
- opaque runtime snapshot semantics
- reproducible testing

---

## 2. Current Gate

The current blocker is **Phase 20.1: Persistent World Hardening**.

Phase 20.1 must be completed before any new runtime capability begins.

Required hardening work:

- Fix `migrateWorldState()` so migration is non-mutating, including nested objects.
- Ensure `compile(spec)` cannot silently compile a non-campus `domainRef` using the default campus domain.
- Ensure `fromWorldState()` fails fast when `worldState.domainRef` does not match the provided domain.
- Make `npm test` fully green before claiming the persistent-world tooling is complete.
- Decide whether `world/` is internal-only or part of the public package boundary.

Until this gate passes, the persistent-world tooling should be described as **in hardening**, not completed.

---

## 3. Prioritized Roadmap

### Phase 21: Seedable RNG

Priority: highest.

Reason: reproducible simulation is the foundation for behavior experiments, alive-sense research, benchmark stability, and regression testing.

Scope:

- Add optional deterministic randomness through `config.seed` or RNG injection.
- Preserve current default behavior when no seed is provided.
- Gradually route major randomness sources through the seeded RNG:
  - BehaviorField noise
  - event generation
  - schedule variation
  - world/compiler generated IDs, if compiler remains internal
- Add tests proving:
  - same seed produces repeatable traces
  - different seeds diverge
  - no-seed behavior remains backward-compatible

Non-goals:

- Do not rewrite the simulation loop.
- Do not change behavior semantics.
- Do not introduce global hidden random state that breaks parallel tests.

---

### Phase 22: Memory to Behavior Gradient RFC

Priority: high, but RFC first.

This phase should design how high-importance memories can influence `BehaviorField` without bypassing it.

Questions to answer:

- Which memories are allowed to influence behavior?
- Does memory influence target a state, region, agent, object, or abstract behavior vector?
- How does memory influence decay over time?
- How does influence saturate so one memory cannot permanently dominate behavior?
- How does memory gradient combine with needs, schedule, emotion, and intrinsic motivation gradients?
- How is this kept domain-agnostic?

Non-goals:

- Do not directly set `stateMachine.currentState`.
- Do not directly set `behaviorField.label`.
- Do not implement the gradient before the RFC is accepted.

---

### Phase 23: GoalSystem Boundary RFC

Priority: high, after memory-gradient boundaries are clear.

GoalSystem should not duplicate `IntrinsicMotivation`, `Schedule`, or `NeedsSystem`. Its first task is to define boundaries.

Goal categories to distinguish:

- external goals
- background-derived goals
- self-generated goals
- world-event-derived goals

Questions to answer:

- What is a goal in engine terms?
- How does a goal affect behavior: gradient, event preference, memory salience, or schedule pressure?
- How do goals complete, fail, decay, or transform?
- How do goals become persistent world state without leaking runtime internals into Stable World Envelope?

Non-goals:

- Do not add a large goal subsystem directly to `Agent.tick()`.
- Do not let goals bypass BehaviorField.
- Do not make goals prompt-driven.

---

### Phase 24: WorldObject API RFC

Priority: medium-high.

WorldObject is central to a Persistent World Engine, but it touches world state, perception, memory, conflict, and event generation. It requires an RFC before implementation.

Concepts to define:

- object identity
- object type
- object location
- affordances
- visibility and perception rules
- ownership
- contention and competition
- durability or lifecycle
- memory encoding
- event effects

Architecture constraints:

- WorldObject must be domain-agnostic.
- WorldObject must not be a UI object.
- WorldObject must not be hardcoded to Andy Town maps.
- WorldObject should integrate through perception, events, memory, and behavior gradients.

Non-goals:

- Do not add map/UI concepts to engine core.
- Do not add object logic directly into presentation code.
- Do not finalize World State object schema before RFC review.

---

### Phase 25: StoryArc Feedback RFC

Priority: later, highest risk.

StoryArc feedback is useful, but it can easily turn Andy Engine into a scripted narrative system. It must remain an indirect influence layer.

Allowed direction:

- StoryArc may create events.
- StoryArc may introduce goals.
- StoryArc may adjust appraisal context.
- StoryArc may influence memory salience.

Forbidden direction:

- Do not directly set emotion values.
- Do not directly set behavior labels.
- Do not force relationships.
- Do not override `Agent.tick()`.
- Do not bypass BehaviorField.

Core principle:

StoryArc feedback should influence agents through existing psychological and world mechanisms, not replace them.

---

## 4. Architecture Guardrails

Before any roadmap item enters implementation, it must answer:

1. Does it serve Persistent World Engine rather than Bobby, Andy Town, UI, or chat experience?
2. Does it preserve domain-agnostic behavior?
3. Does it avoid leaking current runtime internals into Stable World Envelope?
4. Does it keep `runtimeSnapshot` opaque?
5. Does it preserve BehaviorField as the behavior decision core?
6. Does it avoid adding transition logic back into StateMachine?
7. Is it testable without real LLM calls?
8. Is it reproducible, or does it depend on uncontrolled randomness?
9. Does it avoid campus, tavern, Oak Town, or Bobby-specific semantics in core?
10. Does it have a clear rollback path if the research hypothesis fails?

If the answer to any of these is unclear, the phase remains an RFC.

---

## 5. Non-Goals

This roadmap does not authorize:

- immediate implementation of the five requested capabilities
- changes to `Agent.tick()`
- changes to Stable World Envelope
- changes to SDK public API
- storage-layer integration
- World Compiler public API expansion
- Bobby product work
- Andy Town UI or map work
- prompt-driven behavior
- ECS or SharedArrayBuffer rewrites

---

## 6. Operating Rule

Demo requirements may propose engine capabilities, but demo requirements do not directly drive engine core changes.

Every core capability must pass through:

```
need → architecture RFC → boundary review → tests → implementation
```

The next implementation phase remains blocked on Phase 20.1 hardening.
