/**
 * ActionCandidate — Compatibility wrapper
 *
 * All implementation migrated to src/action/ActionCandidate.js
 * This file re-exports for backward compatibility.
 *
 * Old API: createCandidate({ type, source, ... }) → plain object
 * New API: new ActionCandidate({ type, source, ... }) → class instance
 */

const {
  ACTION_TYPES,
  CANDIDATE_SOURCES,
  makeCandidateId,
  ActionCandidate,
} = require('../../src/action/ActionCandidate');

/**
 * Legacy factory function — returns a plain object (backward compatible)
 */
function createCandidate({ type, source, target = '', label = '', constraints = {}, metadata = {} }) {
  const candidate = new ActionCandidate({ type, source, target, label, constraints, metadata });
  return candidate.toJSON();
}

module.exports = {
  ACTION_TYPES,
  CANDIDATE_SOURCES,
  makeCandidateId,
  createCandidate,
  ActionCandidate,
};
