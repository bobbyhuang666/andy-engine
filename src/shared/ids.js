/**
 * src/shared/ids — ID Generation Utilities
 *
 * Shared ID generation helpers for the engine.
 */

let _counter = 0;

function generateId(prefix = 'id') {
  _counter++;
  return `${prefix}_${Date.now()}_${_counter}_${Math.random().toString(36).slice(2, 8)}`;
}

function isValidId(id) {
  return typeof id === 'string' && id.length > 0;
}

module.exports = { generateId, isValidId };
