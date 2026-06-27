/**
 * GroundingPackage Schema — Validation schema for grounding packages (v2.5-W1)
 *
 * Validates structure including _evidence on allowedFacts and evidenceSummary.
 */

const VALID_EVIDENCE_SOURCES = ['direct', 'observed', 'overheard', 'told', 'inferred'];

function validateGroundingPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return { valid: false, errors: ['must be object'] };

  const errors = [];

  // Validate allowedFacts
  if (pkg.allowedFacts && Array.isArray(pkg.allowedFacts)) {
    for (let i = 0; i < pkg.allowedFacts.length; i++) {
      const fact = pkg.allowedFacts[i];
      if (fact._evidence) {
        if (!VALID_EVIDENCE_SOURCES.includes(fact._evidence.source)) {
          errors.push(`allowedFacts[${i}]._evidence.source invalid: ${fact._evidence.source}`);
        }
        if (typeof fact._evidence.confidence !== 'number' || fact._evidence.confidence < 0 || fact._evidence.confidence > 1) {
          errors.push(`allowedFacts[${i}]._evidence.confidence must be 0-1, got ${fact._evidence.confidence}`);
        }
      }
    }
  }

  // Validate inferredFacts (v2.5: should always be empty)
  if (pkg.inferredFacts && !Array.isArray(pkg.inferredFacts)) {
    errors.push('inferredFacts must be array');
  }

  // Validate metadata.evidenceSummary
  if (pkg.metadata && pkg.metadata.evidenceSummary) {
    const summary = pkg.metadata.evidenceSummary;
    if (typeof summary !== 'object') {
      errors.push('metadata.evidenceSummary must be object');
    } else {
      for (const [key, value] of Object.entries(summary)) {
        if (!VALID_EVIDENCE_SOURCES.includes(key)) {
          errors.push(`metadata.evidenceSummary has invalid source key: ${key}`);
        }
        if (typeof value !== 'number' || value < 0) {
          errors.push(`metadata.evidenceSummary.${key} must be non-negative number`);
        }
      }
    }
  }

  // Validate metadata.factCount.inferred (v2.5: should be 0)
  if (pkg.metadata && pkg.metadata.factCount && typeof pkg.metadata.factCount.inferred === 'number' && pkg.metadata.factCount.inferred !== 0) {
    errors.push(`metadata.factCount.inferred must be 0 (v2.5 B1 downgrade), got ${pkg.metadata.factCount.inferred}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = { validateGroundingPackage };
