/**
 * StateDelta Schema — Validation schema for state deltas
 */

function validateStateDelta(delta) {
  if (!delta || typeof delta !== 'object') return { valid: false, errors: ['must be object'] };
  return { valid: true, errors: [] };
}

module.exports = { validateStateDelta };
