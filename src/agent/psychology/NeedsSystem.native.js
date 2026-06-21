/**
 * NeedsSystem.native.js — Native-backed NeedsSystem wrapper
 *
 * Drop-in replacement for NeedsSystem.js using Rust via napi-rs.
 * Falls back to pure JS if native module unavailable or ANDY_USE_NATIVE!=1.
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');
const cfg = ANDY_DEFAULTS.needs;
const { getDefaultDomain } = require('../../domain/DomainRegistry');

// 从 domain 获取 NEED_DRIVE_STATES
const defaultDomain = getDefaultDomain();
const NEED_DRIVE_STATES = defaultDomain.needDriveStates || {};

let _NativeCtor = null;
let _loadAttempted = false;

function _ensureNative() {
  if (_loadAttempted) return !!_NativeCtor;
  _loadAttempted = true;
  try {
    const native = require('../../native');
    _NativeCtor = native.NeedsSystemJs;
    return true;
  } catch (_) {
    return false;
  }
}

class NeedsSystemNative {
  constructor(personality, savedState = null) {
    const ocean = personality.ocean;

    const oceanJson = JSON.stringify({
      neuroticism: ocean.neuroticism,
      extraversion: ocean.extraversion,
      openness: ocean.openness,
    });

    const configJson = JSON.stringify({
      decay_rate: {
        hunger: cfg.decayRate.hunger,
        energy: cfg.decayRate.energy,
        social: cfg.decayRate.social,
        comfort: cfg.decayRate.comfort,
        stimulation: cfg.decayRate.stimulation,
      },
      recovery_rate: {
        hunger: cfg.recoveryRate.hunger,
        energy: cfg.recoveryRate.energy,
        social: cfg.recoveryRate.social,
        comfort: cfg.recoveryRate.comfort,
        stimulation: cfg.recoveryRate.stimulation,
      },
      threshold: {
        hunger: cfg.threshold.hunger,
        energy: cfg.threshold.energy,
        social: cfg.threshold.social,
        comfort: cfg.threshold.comfort,
        stimulation: cfg.threshold.stimulation,
      },
    });

    let savedJson = null;
    if (savedState) {
      savedJson = JSON.stringify({
        needs: savedState.needs,
        _decayRates: savedState._decayRates,
      });
    }

    this._ns = new _NativeCtor(oceanJson, configJson, savedJson);

    // JS mirror
    this.needs = savedState ? { ...savedState.needs } : {
      hunger: 0.8, energy: 0.9, social: 0.6, comfort: 0.7, stimulation: 0.5,
    };
    // Sync _decayRates immediately (tests access it after construction)
    this._syncFromNative();
  }

  _syncFromNative() {
    const json = JSON.parse(this._ns.toJson());
    Object.assign(this.needs, json.needs);
    this._decayRates = json._decayRates;
  }

  tick(hoursElapsed, currentState, currentRegion) {
    this._ns.tick(hoursElapsed || 0, currentState || '', currentRegion || '');
    this._syncFromNative();
  }

  // Read-only queries: compute from JS mirror (.needs may be mutated externally)
  getDrive() {
    let maxUrgency = 0;
    let urgentNeed = null;
    for (const [need, value] of Object.entries(this.needs)) {
      const threshold = cfg.threshold[need] || 0.3;
      if (value < threshold) {
        const urgency = threshold - value;
        if (urgency > maxUrgency) {
          maxUrgency = urgency;
          urgentNeed = need;
        }
      }
    }
    if (!urgentNeed) return null;
    return {
      need: urgentNeed,
      urgency: maxUrgency,
      targetStates: NEED_DRIVE_STATES[urgentNeed] || [],
    };
  }

  getStateWeights(candidateStates) {
    const drive = this.getDrive();
    if (!drive) return candidateStates.map(() => 1);
    return candidateStates.map(state =>
      drive.targetStates.includes(state) ? 1 + drive.urgency * 3 : 1
    );
  }

  toPromptString() {
    const names = {
      hunger: '饱腹', energy: '精力', social: '社交',
      comfort: '舒适', stimulation: '兴趣',
    };
    const parts = [];
    for (const [need, value] of Object.entries(this.needs)) {
      const name = names[need] || need;
      if (value < 0.2) parts.push(`${name}极度匮乏`);
      else if (value < 0.4) parts.push(`${name}不足`);
      else if (value < 0.6) parts.push(`${name}一般`);
      else if (value < 0.8) parts.push(`${name}充足`);
      else parts.push(`${name}饱满`);
    }
    return `需求：${parts.join('，')}。`;
  }

  toJSON() {
    return {
      needs: { ...this.needs },
      _decayRates: this._decayRates ? { ...this._decayRates } : {},
    };
  }
}

// ═══════════════════════════════════════════
// Export: conditionally use native or pure JS
// ═══════════════════════════════════════════

const useNative = process.env.ANDY_USE_NATIVE === '1' && _ensureNative();

if (useNative) {
  module.exports = NeedsSystemNative;
} else {
  module.exports = require('./NeedsSystem');
}

module.exports._isNative = useNative;
