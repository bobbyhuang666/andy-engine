# Characterization Test Inventory — Integration Beta

> **Status:** W1 classification
> **Purpose:** Tests that use direct state injection are classified as
> **characterization tests** — they verify internal component behavior
> but MUST NOT be cited as Integration Beta evidence because they bypass
> the public simulation loop.

## Classification rules

A test is marked **characterization** if it:

1. Directly assigns to `agent.position`, `agent.health`, `agent.socialEnergy`,
   `agent.needs.needs.*`, `agent.emotion.stress`, or `agent.behaviorField.B[*]`
2. Replaces `agent._candidateProviderManager` with a stub
3. Constructs mock/partial agent objects instead of using
   `engine.createCharacter()` + `engine.tick()`
4. Calls internal runtime functions directly (e.g., `applyNeedsToEmotion(agent)`,
   `updateHealth(agent, ...)`)
5. Spies on or wraps internal agent methods (`emotion.applyEffect`,
   `memory.addExperience`) instead of observing public API output

A test is **NOT** characterization if it:

1. Creates agents via `engine.createCharacter()`
2. Drives the simulation via `engine.tick()` or `engine.runTicks()`
3. Observes outcomes via `engine.getNarrative()`, `engine.getStats()`,
   `engine.snapshot()`, `agent.getStatus()`, or other public methods
4. Tests only the domain validation or config layer without agent state

## Category A — Heavy direct state injection (characterization)

These tests directly inject state into agent internals rather than
exercising the public simulation loop. They characterize internal
component contracts but cannot serve as Beta evidence.

| File | Injected state |
|---|---|
| `tests/unit/handlers/health-handler.test.js` | `health`, `needs.*`, `emotion.stress`, `position`, `behaviorField.B` |
| `tests/unit/handlers/schedule-handler.test.js` | `needs.hunger`, `position` |
| `tests/unit/handlers/needs-emotion-coupler.test.js` | All 5 `needs` dimensions |
| `tests/unit/handlers/social-handler.test.js` | `socialEnergy`, `behaviorField.B[1]` |
| `tests/unit/handlers/mind-wander-handler.test.js` | `behaviorField.B`, `rand`, spies on `emotion.applyEffect`, `memory.retrieve` |
| `tests/unit/handlers/reflection-handler.test.js` | `_ticksSinceReflection`, `_ticksSinceDriftCheck`, `memory.addAppraisalBias` |
| `tests/unit/handlers/agent-runtime.test.js` | `isOnline`, `needs.hunger`, spies on `emotion.applyEffect` |
| `tests/unit/handlers/schedule-handler-coverage.test.js` | Full mock agent factory |
| `tests/unit/state-label-cleanup.test.js` | `health`, `behaviorField.B[0]`, `_regulationResource`, `_rand` |
| `tests/unit/physiology-runtime-nan.test.js` | Full mock agent, direct runtime function calls |

## Category B — Moderate direct state injection (characterization)

| File | Injected state |
|---|---|
| `tests/unit/active-writeback.test.js` | `needs.energy`, `position`, `_candidateProviderManager` stubs |
| `tests/unit/effect-delta-contract.test.js` | Mock agents with pre-set state, `needs.energy`, `position` |
| `tests/unit/position-bypass-regression.test.js` | `position` (invalid value) |
| `tests/unit/movement-writeback.test.js` | `_candidateProviderManager` stubs |
| `tests/unit/spatial-continuous-active-rollback.test.js` | Handler mutation, `_candidateProviderManager` stubs |
| `tests/unit/event-lifecycle-dedup.test.js` | Spies on `emotion.applyEffect`, `memory.addExperience` |
| `tests/unit/build-narrative-emotion-safety.test.js` | `emotion._ev`, `personality=null`, `needs=null` |
| `tests/unit/andy-bridge-internal.test.js` | Fake agent objects with pre-set emotion |
| `tests/integration/action-provider-integration.test.js` | `needs.energy`, `_candidateProviderManager` stubs |
| `tests/unit/effect-pipeline-dry-run.test.js` | `_candidateProviderManager` stubs |
| `tests/domain.test.js` | `needs.hunger` |
| `tests/domain-deep.test.js` | `needs.hunger` |

## Not characterization (suitable as Beta evidence)

Tests that exercise the public simulation loop end-to-end:

- `tests/unit/persistence-trust.test.js` — save/restore round-trip
- `tests/unit/golden-seed-replay.test.js` — deterministic replay
- `tests/unit/serialization-roundtrip.test.js` — serialization fidelity
- `tests/e2e/alice-bob-epistemic-boundary.test.js` — epistemic correctness
- `tests/e2e/epistemic-evidence-matrix.test.js` — knowledge evidence
- `tests/e2e/social-emergence.test.js` — social dynamics
- `tests/e2e/gossip-propagation.test.js` — information flow
- `tests/e2e/emotion-contagion-cluster.test.js` — emotion contagion
- `tests/integration/engine.test.js` — engine lifecycle
- `tests/unit/narrative/grounding-smoke.test.js` — grounding checks

## Recommended inline markers

Add `// @characterization` comment to the `describe` block of each
Category A/B test file. This is a soft marker — it does not affect
test execution or Vitest configuration. Its purpose is to make the
classification discoverable by code review and audit tools.

Example:
```javascript
// @characterization — direct state injection; not Beta evidence
describe('HealthHandler', () => {
  // ...
});
```
