/**
 * Canon time helpers (RFC W2 / Patch C)
 *
 * Single normalization point for event/fact timestamps. Previously the
 * `instanceof Date ? ... : new Date(...)` pattern and `FALLBACK_EPOCH` were
 * duplicated across CanonEventPipeline, WorldFactStore, and FactEmitter (8+
 * inline sites), and `_tryToldPropagation` used `Number.isFinite()` on an ISO
 * string, silently discarding valid timestamps.
 */

/** Default epoch used when event timestamps are invalid/missing. */
const FALLBACK_EPOCH = new Date('2024-01-01T00:00:00Z');
const FALLBACK_EPOCH_MS = FALLBACK_EPOCH.getTime();

/**
 * Normalize a timestamp value to a finite epoch millisecond number.
 *
 * Accepts Date, ISO/numeric string, or number. Returns `fallbackMs` when the
 * value is invalid (NaN, invalid Date, unparseable string) or missing.
 *
 * @param {Date|string|number|undefined|null} value
 * @param {number} [fallbackMs=FALLBACK_EPOCH_MS]
 * @returns {number} finite epoch milliseconds
 */
function normalizeEventTimeMs(value, fallbackMs = FALLBACK_EPOCH_MS) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : fallbackMs;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : fallbackMs;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallbackMs;
  }
  return fallbackMs;
}

module.exports = { FALLBACK_EPOCH, FALLBACK_EPOCH_MS, normalizeEventTimeMs };
