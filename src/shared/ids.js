/**
 * src/shared/ids — ID Generation Utilities
 *
 * Shared ID generation helpers for the engine.
 */

let _counter = 0;

function generateId(prefix = 'id', rng = null) {
  _counter++;
  const randomValue = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
  return `${prefix}_${Date.now()}_${_counter}_${randomValue.toString(36).slice(2, 8)}`;
}

function isValidId(id) {
  return typeof id === 'string' && id.length > 0;
}

module.exports = { generateId, isValidId };
