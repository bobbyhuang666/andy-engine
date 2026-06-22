/**
 * src/shared — Shared Utilities Layer
 *
 * Cross-layer shared protocols: IDs, time, errors, RNG, schemas.
 */

const { generateId, isValidId } = require('./ids');
const { TICK_INTERVAL_MINUTES, TICKS_PER_HOUR, TICKS_PER_DAY, ticksToHours, hoursToTicks, formatSimTime } = require('./time');
const { AndyError, ConfigError, DomainError, AgentError } = require('./errors');
const { RNG } = require('./rng');
const { Diagnostics, diagnostics } = require('./Diagnostics');

module.exports = {
  // IDs
  generateId,
  isValidId,
  // Time
  TICK_INTERVAL_MINUTES,
  TICKS_PER_HOUR,
  TICKS_PER_DAY,
  ticksToHours,
  hoursToTicks,
  formatSimTime,
  // Errors
  AndyError,
  ConfigError,
  DomainError,
  AgentError,
  // RNG
  RNG,
  // Diagnostics
  Diagnostics,
  diagnostics,
};
