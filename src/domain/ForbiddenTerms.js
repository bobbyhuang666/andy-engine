/**
 * ForbiddenTerms — domain-aware text filter utility
 *
 * Dependency leaf: no imports from core/, agent/, sdk/, or facts/.
 * Used by agent/ and core/WorldviewConstraints to apply forbidden term filtering.
 */

/**
 * Apply domain forbidden terms to text by replacing matches with '***'.
 *
 * @param {string} text - input text
 * @param {Object} domain - domain object with forbiddenTerms array
 * @returns {string} filtered text
 */
function applyForbiddenTerms(text, domain) {
  if (!text || typeof text !== 'string') return text;
  if (!domain || !domain.forbiddenTerms || domain.forbiddenTerms.length === 0) return text;

  let result = text;
  for (const term of domain.forbiddenTerms) {
    // R9 fix: escape regex special characters to prevent regex injection.
    // Without this, terms like "C++" or "vs." would be interpreted as
    // regex syntax rather than literal text.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), '***');
  }
  return result;
}

module.exports = { applyForbiddenTerms };
