# WorldObject Integration — Deferred

**Date:** 2026-07-07
**Status:** Decision — Option 2 (Explicit Downgrade)

## Summary

`WorldObject` is modeled in Andy Engine but not runtime-integrated into `Agent.tick`.

The current codebase provides:

- `src/action/WorldObject.js` — data model for world objects
- `tests/facts/worldobject-integration.test.js` — model-level tests (passing)

WorldObject does NOT currently:

- Have an object registry or source
- Drive object affordance candidate providers
- Produce action candidates targeting object IDs
- Integrate with the event/effect pipeline
- Participate in serialization/deserialization

## Decision

WorldObject runtime integration is deferred. The current modeling layer is retained
for future integration but is not part of the active simulation loop.

This decision was made because D5 grounding, the semantic evaluation corpus, and
action/effect canonicalization are higher leverage than runtime object interaction.

## Future Integration Requirements

When resuming WorldObject work, the following would be needed:

1. WorldObject registry or source-of-objects
2. Object affordance candidate provider
3. Action candidates that can target object IDs
4. EventEffectPipeline handling for object interaction effects
5. Facts representing object state or object usage
6. Serialization preserving object state
7. Tests covering full object lifecycle

## References

- `src/action/WorldObject.js`
- `tests/facts/worldobject-integration.test.js`
- `README.md` — states "WorldObject is modeled but not fully integrated"
