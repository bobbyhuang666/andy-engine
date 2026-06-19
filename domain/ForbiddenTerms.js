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
    result = result.replace(new RegExp(term, 'g'), '***');
  }
  return result;
}

module.exports = { applyForbiddenTerms };
