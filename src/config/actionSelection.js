/**
 * Action-selection configuration normalization and validation.
 *
 * Keeping this in config (rather than the Agent compatibility adapter) makes
 * the engine, runtime, and restored worlds agree on one executable shape.
 */

const ACTION_SELECTION_MODES = Object.freeze([
  'shadow',
  'event',
  'dryRunEffects',
  'active',
]);

/**
 * Normalize the historical `{ active: true }` shorthand into the documented
 * `{ enabled: true, mode: 'active' }` form. Explicit modern fields always win.
 * The input object is never mutated.
 */
function normalizeActionSelectionConfig(actionSelection, defaults) {
  const normalizedDefaults = { ...defaults };
  if (!actionSelection || typeof actionSelection !== 'object' || Array.isArray(actionSelection)) {
    return normalizedDefaults;
  }

  const overrides = { ...actionSelection };
  if (typeof overrides.active === 'boolean') {
    if (overrides.enabled === undefined) overrides.enabled = overrides.active;
    if (overrides.mode === undefined) overrides.mode = overrides.active ? 'active' : 'shadow';
  }
  delete overrides.active;

  return { ...normalizedDefaults, ...overrides };
}

function collectActionSelectionConfigErrors(actionSelection, errors) {
  if (actionSelection === undefined) return;
  if (!actionSelection || typeof actionSelection !== 'object' || Array.isArray(actionSelection)) {
    errors.push('actionSelection must be an object');
    return;
  }

  if (actionSelection.mode !== undefined && !ACTION_SELECTION_MODES.includes(actionSelection.mode)) {
    errors.push(`actionSelection.mode must be one of ${ACTION_SELECTION_MODES.join(', ')}, got ${actionSelection.mode}`);
  }
  if (actionSelection.temperature !== undefined && (
    typeof actionSelection.temperature !== 'number' ||
    !Number.isFinite(actionSelection.temperature) ||
    actionSelection.temperature < 0
  )) {
    errors.push(`actionSelection.temperature must be a non-negative finite number, got ${actionSelection.temperature}`);
  }
  if (actionSelection.maxTraceHistory !== undefined && (
    !Number.isInteger(actionSelection.maxTraceHistory) ||
    actionSelection.maxTraceHistory < 0
  )) {
    errors.push(`actionSelection.maxTraceHistory must be a non-negative integer, got ${actionSelection.maxTraceHistory}`);
  }
  if (actionSelection.active !== undefined && typeof actionSelection.active !== 'boolean') {
    errors.push(`actionSelection.active must be a boolean, got ${actionSelection.active === null ? 'null' : typeof actionSelection.active}`);
  }
  if (
    typeof actionSelection.active === 'boolean' &&
    typeof actionSelection.enabled === 'boolean' &&
    actionSelection.active !== actionSelection.enabled
  ) {
    errors.push('actionSelection.active conflicts with actionSelection.enabled');
  }
}

module.exports = {
  ACTION_SELECTION_MODES,
  normalizeActionSelectionConfig,
  collectActionSelectionConfigErrors,
};
