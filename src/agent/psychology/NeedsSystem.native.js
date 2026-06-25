/**
 * NeedsSystem.native.js — Native-backed NeedsSystem wrapper
 *
 * Drop-in replacement for NeedsSystem.js using Rust via napi-rs.
 * Uses src/shared/nativeLoader.js for ANDY_USE_NATIVE semantics.
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');
const cfg = ANDY_DEFAULTS.needs;
const { getDefaultDomain } = require('../../domain/DomainRegistry');
const { loadNativeModule } = require('../../shared/nativeLoader');
const { diagnostics } = require('../../shared/Diagnostics');

// 不在模块顶层调用 getDefaultDomain()——改为惰性求值（Wave 3b-0）。

let _NativeCtor = null;
let _loadResult = null;

function _ensureNative() {
  if (_loadResult) return _loadResult.available;
  _loadResult = loadNativeModule();
  if (_loadResult.available) {
    _NativeCtor = _loadResult.native.NeedsSystemJs;
    if (!_NativeCtor) {
      const err = new Error(
        '[andy-engine] native module loaded but NeedsSystemJs export is missing'
      );
      if (_loadResult.mode === 'required') throw err;
      if (_loadResult.mode === 'optional') {
        diagnostics.warnOnce('needssystem:missing-export', `${err.message}; falling back to JS.`);
        _loadResult.available = false;
        return false;
      }
    }
  }
  return _loadResult.available;
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

  getDrive() {
    const NEED_DRIVE_STATES = getDefaultDomain().needDriveStates || {};
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

  /**
   * 从 toJSON 输出反序列化为 NeedsSystemNative 实例（native 路径）。
   * 恢复路径中应传入真实 Personality；省略时用 ocean 桩，仅供 round-trip / 测试。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [personality] - Personality 实例
   * @returns {NeedsSystemNative}
   */
  static fromJSON(json, personality = null) {
    const p = personality || { ocean: { neuroticism: 0.5, extraversion: 0.5, openness: 0.5 } };
    return new NeedsSystemNative(p, json);
  }
}

// ═══════════════════════════════════════════
// Export: conditionally use native or pure JS
// ═══════════════════════════════════════════

_ensureNative();
const useNative = _loadResult && _loadResult.available;

if (useNative) {
  module.exports = NeedsSystemNative;
} else {
  module.exports = require('./NeedsSystem');
}

module.exports._isNative = useNative;
