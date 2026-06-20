/**
 * UtilityScorer — Compatibility wrapper
 *
 * All implementation migrated to src/action/UtilityScorer.js
 * This file re-exports for backward compatibility.
 */

const { scoreCandidate, scoreCandidates } = require('../../src/action/UtilityScorer');

module.exports = {
  scoreCandidate,
  scoreCandidates,
};
