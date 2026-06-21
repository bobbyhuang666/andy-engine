# AI_README.md

Andy Engine is a WIP persistent life-world runtime for AI characters.

This file is a short orientation note for AI coding agents. For the full working rules, read `AGENTS.md`.

## Read in this order

1. `README.md` — public project framing and current architecture tree
2. `AGENTS.md` — active engineering rules and boundaries
3. `docs/CLEAN_ARCHITECTURE_FINAL_AUDIT.md` — current clean architecture status
4. `docs/PUBLIC_API_CONTRACT.md` — public entry points and compatibility policy

## Canonical implementation paths

Implementation lives under `src/`:

- `src/runtime/AndyWorld.js` — runtime world orchestration
- `src/canon/WorldFactStore.js` — world fact storage
- `src/knowledge/KnowledgeStore.js` — per-character knowledge
- `src/canon/CanonEventPipeline.js` — event → fact → knowledge pipeline
- `src/effects/EventEffectPipeline.js` — action/event consequences
- `src/effects/EffectCommitter.js` — typed delta writeback
- `src/action/UtilitySelector.js` — weighted action selection
- `src/action/providers/` — read-only candidate providers
- `src/agent/AgentRuntime.js` — agent tick pipeline driver

Top-level `index.js`, `agent/Agent.js`, `facts/index.js`, `domain/index.js`, `sdk/index.js`, and `store/index.js` are public facades/adapters. Do not add new implementation logic to old top-level folders.

## Do not assume

- Andy is not a chatbot framework.
- LLMs do not create world facts.
- Characters are not omniscient.
- Action providers must be read-only.
- New world-facing consequences should flow through typed deltas and committers.
- Concrete world vocabulary belongs in domain presets, not `src/` runtime logic.
- Seeded simulation uses the runtime RNG; do not add bare `Math.random()` to core simulation paths.

## Current priority

Maintain the clean architecture and semantic closure:

```text
WorldCanon
  → Observation / Knowledge
  → State & Pressure
  → Action Candidates / Utility Selection
  → CanonEvent
  → EventEffectPipeline / EffectCommitter
  → Memory / Relationship / LocationMeaning / FutureTendency
  → Grounded Narrative
```

## Key concepts

- **WorldCanon**: shared record of what happened in the world
- **Knowledge boundary**: each character only knows what it observed, was told, or can infer
- **CanonEvent**: an event recorded into WorldCanon
- **Grounded Narrative**: LLM output constrained by what the character actually knows
- **BehaviorField**: 4D continuous behavior space (activity, sociality, focus, expressiveness)
- **Domain preset**: world-specific config (regions, states, events, vocabulary)
