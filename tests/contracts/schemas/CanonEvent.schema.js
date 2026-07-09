/**
 * CanonEvent Schema — Validation schema for canon events
 */

function validateCanonEvent(event) {
  if (!event || typeof event !== 'object') return { valid: false, errors: ['must be object'] };
  const errors = [];
  if (!event.type) errors.push('type is required');
  if (!event.content) errors.push('content is required');
  return { valid: errors.length === 0, errors };
}

module.exports = { validateCanonEvent };
