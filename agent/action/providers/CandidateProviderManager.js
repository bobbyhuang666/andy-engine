/**
 * CandidateProviderManager — Compatibility wrapper
 *
 * All implementation migrated to src/action/providers/CandidateProviderManager.js
 * This file re-exports for backward compatibility.
 */

const { CandidateProviderManager } = require('../../../src/action/providers/CandidateProviderManager');

module.exports = { CandidateProviderManager };
