/**
 * GroundingPackage Schema — Validation schema for grounding packages
 */

function validateGroundingPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return { valid: false, errors: ['must be object'] };
  return { valid: true, errors: [] };
}

module.exports = { validateGroundingPackage };
