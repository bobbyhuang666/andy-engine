/**
 * KnowledgeFact Schema — Validation schema for knowledge facts
 */

function validateKnowledgeFact(fact) {
  if (!fact || typeof fact !== 'object') return { valid: false, errors: ['must be object'] };
  const errors = [];
  if (!fact.subject) errors.push('subject is required');
  if (!fact.predicate) errors.push('predicate is required');
  return { valid: errors.length === 0, errors };
}

module.exports = { validateKnowledgeFact };
