/**
 * domain/index.js — Domain 公共 API
 *
 * @module andy-engine/domain
 */

const { DomainRegistry, getDefaultDomain } = require('./DomainRegistry');
const { validateDomain } = require('./validateDomain');

module.exports = {
  DomainRegistry,
  getDefaultDomain,
  validateDomain,
};
