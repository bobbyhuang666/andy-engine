/**
 * Diagnostics — lightweight error observability utility
 *
 * Provides warnOnce (deduped warnings), warn, and collect (structured entries)
 * for catch blocks that previously swallowed errors silently.
 */

class Diagnostics {
  constructor() {
    this._warnedOnce = new Set();
    this._collected = [];
  }

  warnOnce(key, message) {
    if (this._warnedOnce.has(key)) return;
    this._warnedOnce.add(key);
    console.warn(`[andy-engine] ${message}`);
  }

  warn(message) {
    console.warn(`[andy-engine] ${message}`);
  }

  collect(entry) {
    this._collected.push({ ...entry, timestamp: Date.now() });
  }

  getCollected() {
    return [...this._collected];
  }

  clear() {
    this._collected = [];
  }

  resetWarnedOnce() {
    this._warnedOnce.clear();
  }
}

const _global = new Diagnostics();

module.exports = { Diagnostics, diagnostics: _global };
