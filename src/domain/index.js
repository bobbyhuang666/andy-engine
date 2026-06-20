/**
 * src/domain — Domain Layer
 *
 * Domain configuration, validation, and forbidden terms.
 * Replaces domain/ as the canonical location.
 */

const { DomainRegistry, getDefaultDomain } = require('./DomainRegistry');
const { validateDomain } = require('./validateDomain');
const { applyForbiddenTerms } = require('./ForbiddenTerms');

module.exports = {
  DomainRegistry,
  getDefaultDomain,
  validateDomain,
  applyForbiddenTerms,
};
