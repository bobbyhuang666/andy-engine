/**
 * WorldFact Schema — Validation schema for world facts
 */

function validateWorldFact(fact) {
  if (!fact || typeof fact !== 'object') return { valid: false, errors: ['must be object'] };
  const errors = [];
  if (!fact.id) errors.push('id is required');
  if (!fact.subject) errors.push('subject is required');
  if (!fact.predicate) errors.push('predicate is required');
  return { valid: errors.length === 0, errors };
}

module.exports = { validateWorldFact };
