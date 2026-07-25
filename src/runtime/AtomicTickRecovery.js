/**
 * AtomicTickRecovery — fail-closed recovery for an aborted Engine tick.
 *
 * AndyWorld intentionally isolates errors so it can produce diagnostics. The
 * public AndyEngine boundary restores the pre-tick serialization afterwards,
 * ensuring a failed tick never remains as a partially-mutated live world.
 */

function capturePreTick(engine) {
  return {
    // The stable persistence boundary is JSON. Canonicalizing here both
    // prevents a mutable serialization object from leaking into the running
    // tick and makes recovery match an actual save/restore round trip.
    state: JSON.parse(JSON.stringify(engine.world.toJSON())),
    tickCallbacks: [...engine.world._tickCallbacks],
  };
}

function rollbackAbortedTick(engine, captured, result) {
  const restored = new engine.constructor({ atomicTicks: true }, captured.state);
  restored.world._tickCallbacks = captured.tickCallbacks;

  engine.config = restored.config;
  engine.rng = restored.rng;
  engine.domain = restored.domain;
  engine.world = restored.world;

  result.status = 'aborted';
  result.time = captured.state.time;
  result.tickNumber = captured.state.tickCount;
  delete result.committedAt;
  delete result.phase.effectSummary;
  result.phase.rollback = {
    restoredTo: captured.state.time,
    tickCount: captured.state.tickCount,
  };
  return result;
}

module.exports = { capturePreTick, rollbackAbortedTick };
