/**
 * src/shared/ids — ID Generation Utilities
 *
 * Shared ID generation helpers for the engine.
 */

let _counter = 0;

function generateId(prefix = 'id', rng = null) {
  _counter++;
  // Deterministic: use RNG if available, otherwise use counter-only approach
  const randomPart = rng && typeof rng.next === 'function'
    ? rng.next().toString(36).slice(2, 8)
    : _counter.toString(36);
  return `${prefix}_${_counter}_${randomPart}`;
}

function isValidId(id) {
  return typeof id === 'string' && id.length > 0;
}

module.exports = { generateId, isValidId };
