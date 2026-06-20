/**
 * UtilitySelector — Compatibility wrapper
 *
 * All implementation migrated to src/action/UtilitySelector.js
 * This file re-exports for backward compatibility.
 */

const { selectAction } = require('../../src/action/UtilitySelector');

module.exports = {
  selectAction,
};
