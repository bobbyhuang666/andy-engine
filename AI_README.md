# AI_README.md

Andy Engine is a WIP persistent life-world runtime for AI characters.

## Read in this order

1. `README.md` — first screen only (WorldCanon + core problem example)
2. `facts/WorldFactStore.js` — world fact storage
3. `facts/KnowledgeStore.js` — per-character knowledge
4. `facts/CanonEventPipeline.js` — event → fact → knowledge pipeline
5. `core/EventEffectPipeline.js` — action/event consequences
6. `agent/action/UtilitySelector.js` — action selection

## Do not assume

- Andy is **not** a chatbot framework.
- LLMs do **not** create world facts.
- Characters are **not** omniscient.
- `Math.random()` in core simulation has been replaced by seeded RNG (`core/RNG.js`).

## Current priority

WorldCanon + partial knowledge + consequence closure + grounded narrative.

## Key concepts

- **WorldCanon**: shared record of what happened in the world
- **Knowledge boundary**: each character only knows what it observed or was told
- **CanonEvent**: an event that has been recorded into WorldCanon
- **Grounded Narrative**: LLM output constrained by what the character actually knows
- **BehaviorField**: 4D continuous behavior space (activity, sociality, focus, expressiveness)
- **Domain preset**: world-specific config (regions, states, events, vocabulary)
