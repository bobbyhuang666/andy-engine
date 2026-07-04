/**
 * EmotionDelta — typed delta for emotion-vector changes.
 *
 * Payload is a plain object mapping emotion dimension names to offsets:
 *   { calm: 0.1, joy: 0.05 }
 *
 * Optional metadata preserves the EmotionVector.applyEffect contract for
 * appraisal-modulated perception effects and absolute stress updates.
 */

const { StateDelta } = require('./StateDelta');

class EmotionDelta extends StateDelta {
  /**
   * @param {string} agentId
   * @param {Object<string, number>} changes — { dimension: deltaValue }
   * @param {Object} [options]
   * @param {number} [options.multiplier]
   * @param {Object<string, number>} [options.appraisalModifiers]
   * @param {number} [options.stress]
   */
  constructor(agentId, changes, options = {}) {
    super('emotion', 'agent', agentId);
    this.changes = (changes && typeof changes === 'object' && !Array.isArray(changes)) ? changes : {};
    // R150: validate per-value is finite — corrupted delta payloads (e.g., JSON
    // deserialization) could contain NaN/Infinity that passes the factory but
    // corrupts downstream arithmetic. Filter to finite numbers only.
    for (const [key, val] of Object.entries(this.changes)) {
      if (!Number.isFinite(val)) {
        delete this.changes[key];
      }
    }
    this.multiplier = Number.isFinite(options.multiplier) ? options.multiplier : 1;
    this.appraisalModifiers = options.appraisalModifiers && typeof options.appraisalModifiers === 'object'
      ? { ...options.appraisalModifiers }
      : null;
    this.stress = Number.isFinite(options.stress) ? options.stress : null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      changes: this.changes,
      multiplier: this.multiplier,
      appraisalModifiers: this.appraisalModifiers,
      stress: this.stress,
    };
  }
}

module.exports = { EmotionDelta };
