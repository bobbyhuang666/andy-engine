/**
 * src/shared/time — Time Utilities
 *
 * Shared time helpers for the engine.
 */

const TICK_INTERVAL_MINUTES = 5;
const TICKS_PER_HOUR = 60 / TICK_INTERVAL_MINUTES;
const TICKS_PER_DAY = TICKS_PER_HOUR * 24;

function ticksToHours(ticks) {
  return ticks / TICKS_PER_HOUR;
}

function hoursToTicks(hours) {
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * TICKS_PER_HOUR);
}

function formatSimTime(date) {
  if (!date || !(date instanceof Date)) return '';
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = {
  TICK_INTERVAL_MINUTES,
  TICKS_PER_HOUR,
  TICKS_PER_DAY,
  ticksToHours,
  hoursToTicks,
  formatSimTime,
};
