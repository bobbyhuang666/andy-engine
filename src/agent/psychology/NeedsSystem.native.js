/**
 * NeedsSystem.native.js — Native-backed NeedsSystem wrapper
 *
 * Drop-in replacement for NeedsSystem.js using Rust via napi-rs.
 * Uses src/shared/nativeLoader.js for ANDY_USE_NATIVE semantics.
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');
const { getDefaultDomain } = require('../../domain/DomainRegistry');
const { loadNativeModule } = require('../../shared/nativeLoader');
const { diagnostics } = require('../../shared/Diagnostics');

/**
 * Merge user needs config with defaults. Mirrors NeedsSystem.js _mergeNeedsConfig
 * so native and JS paths share identical instance-level config resolution.
 * Returns a fresh object — does NOT touch module-global state.
 */
function _mergeNeedsConfig(userConfig) {
  const base = ANDY_DEFAULTS.needs;
  if (!userConfig || typeof userConfig !== 'object') return base;
  const needsCfg = userConfig.needs || userConfig;
  if (typeof needsCfg !== 'object' || Object.keys(needsCfg).length === 0) return base;
  const merged = { ...base };
  for (const key of ['decayRate', 'recoveryRate', 'threshold']) {
    if (needsCfg[key] && typeof needsCfg[key] === 'object') {
      merged[key] = { ...base[key], ...needsCfg[key] };
    }
  }
  return merged;
}

// R16 fix: constants needed by tickWithBehavior / getDriveGradient / getRecoveryRatesForBehavior
// Must match NeedsSystem.js exactly to ensure native/JS parity.
const NEED_DEPRIVATION_GRADIENT_TARGETS = {
  hunger:      [0.35, 0.45, 0.20, 0.40],
  energy:      [0.08, 0.04, 0.05, 0.03],
  social:      [0.35, 0.85, 0.25, 0.80],
  comfort:     [0.15, 0.15, 0.20, 0.12],
  stimulation: [0.45, 0.35, 0.40, 0.40],
};

const NEED_SATISFACTION_CENTERS = {
  hunger:      [0.35, 0.55, 0.15, 0.45],
  energy:      [0.06, 0.03, 0.05, 0.03],
  social:      [0.40, 0.90, 0.30, 0.85],
  comfort:     [0.15, 0.15, 0.25, 0.15],
  stimulation: [0.50, 0.40, 0.50, 0.50],
};

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
  constructor(personality, savedState = null, domain = null, needsConfig = null) {
    // P1-1 fix: instance-level config, not module-global. Previously the
    // native wrapper read a module-level `cfg = ANDY_DEFAULTS.needs` and
    // ignored the needsConfig arg, so per-engine needs config never reached
    // the native path and multiple engines silently shared one config.
    this._cfg = _mergeNeedsConfig(needsConfig);
    this._domain = domain || getDefaultDomain();
    this._needDriveStates = this._domain.needDriveStates || {};

    const ocean = personality.ocean;

    const oceanJson = JSON.stringify({
      neuroticism: ocean.neuroticism,
      extraversion: ocean.extraversion,
      openness: ocean.openness,
    });

    const c = this._cfg;
    const configJson = JSON.stringify({
      decay_rate: {
        hunger: c.decayRate.hunger,
        energy: c.decayRate.energy,
        social: c.decayRate.social,
        comfort: c.decayRate.comfort,
        stimulation: c.decayRate.stimulation,
      },
      recovery_rate: {
        hunger: c.recoveryRate.hunger,
        energy: c.recoveryRate.energy,
        social: c.recoveryRate.social,
        comfort: c.recoveryRate.comfort,
        stimulation: c.recoveryRate.stimulation,
      },
      threshold: {
        hunger: c.threshold.hunger,
        energy: c.threshold.energy,
        social: c.threshold.social,
        comfort: c.threshold.comfort,
        stimulation: c.threshold.stimulation,
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
    // R33 P0 fix: validate savedState.needs for NaN (same as NeedsSystem.js)
    const defaultNeeds = { hunger: 0.8, energy: 0.9, social: 0.6, comfort: 0.7, stimulation: 0.5 };
    if (savedState) {
      this.needs = {};
      for (const [key, val] of Object.entries(savedState.needs || {})) {
        this.needs[key] = Number.isFinite(val) ? val : (defaultNeeds[key] || 0.5);
      }
      // Ensure all default needs are present
      for (const key of Object.keys(defaultNeeds)) {
        if (this.needs[key] === undefined) this.needs[key] = defaultNeeds[key];
      }
    } else {
      this.needs = { ...defaultNeeds };
    }
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
    let maxUrgency = 0;
    let urgentNeed = null;
    for (const [need, value] of Object.entries(this.needs)) {
      const threshold = this._cfg.threshold[need] || 0.3;
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
      targetStates: this._needDriveStates[urgentNeed] || [],
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

  /**
   * R16 fix: tick with continuous behavior vector for recovery rate calculation.
   * Must match NeedsSystem.tickWithBehavior() exactly for native/JS parity.
   * AgentRuntime.tick() calls this on every tick.
   */
  tickWithBehavior(hoursElapsed, behaviorVector) {
    // Step 1: natural decay (same as tick())
    for (const [need, rate] of Object.entries(this._decayRates)) {
      const current = this.needs[need];
      // R33 P0 fix: guard against NaN (Math.max(0, NaN) = NaN).
      // Same fix as NeedsSystem.js tickWithBehavior().
      if (!Number.isFinite(current)) {
        this.needs[need] = 0.5;
        continue;
      }
      const effectiveRate = rate * (0.5 + current * 0.5);
      this.needs[need] = Math.max(0, current - effectiveRate * hoursElapsed);
    }

    // Step 2: behavior-driven recovery
    const rates = this.getRecoveryRatesForBehavior(behaviorVector);
    for (const [need, rate] of Object.entries(rates)) {
      if (rate > 0) {
        const current = this.needs[need];
        // R33 fix: guard against NaN (Math.min(1, NaN) = NaN)
        if (Number.isFinite(current)) {
          this.needs[need] = Math.min(1, current + rate * hoursElapsed);
        }
      }
    }
  }

  /**
   * R16 fix: get need drive gradient for BehaviorField integration.
   * Must match NeedsSystem.getDriveGradient() exactly.
   */
  getDriveGradient() {
    const drives = [];
    for (const [need, value] of Object.entries(this.needs)) {
      const threshold = this._cfg.threshold[need] || 0.3;
      if (value >= threshold) continue;
      const urgency = threshold - value;
      const target = NEED_DEPRIVATION_GRADIENT_TARGETS[need];
      if (!target) continue;
      drives.push({ need, urgency, gradient: [...target] });
    }
    return drives;
  }

  /**
   * R16 fix: compute recovery rates from continuous behavior vector.
   * Must match NeedsSystem.getRecoveryRatesForBehavior() exactly.
   */
  getRecoveryRatesForBehavior(behaviorVector) {
    const rates = {};
    const maxDist = 0.8;
    for (const [need, target] of Object.entries(NEED_SATISFACTION_CENTERS)) {
      let distSq = 0;
      for (let d = 0; d < 4; d++) {
        const diff = behaviorVector[d] - target[d];
        distSq += diff * diff;
      }
      const distance = Math.sqrt(distSq);
      const factor = Math.max(0, 1 - distance / maxDist);
      const baseRate = this._cfg.recoveryRate[need] || 0.3;
      const multiplier = (this._recoveryMultipliers && this._recoveryMultipliers[need]) || 1.0;
      rates[need] = baseRate * factor * multiplier;
    }
    return rates;
  }

  toJSON() {
    return {
      needs: { ...this.needs },
      _decayRates: this._decayRates ? { ...this._decayRates } : {},
      // R16 fix: include _recoveryMultipliers for serialization parity with JS version
      _recoveryMultipliers: { ...(this._recoveryMultipliers || {}) },
    };
  }

  /**
   * 从 toJSON 输出反序列化为 NeedsSystemNative 实例（native 路径）。
   * 恢复路径中应传入真实 Personality 与 Domain；省略时用 ocean 桨，仅供 round-trip / 测试。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [personality] - Personality 实例
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [needsConfig] - user needs config override
   * @returns {NeedsSystemNative}
   */
  static fromJSON(json, personality = null, domain = null, needsConfig = null) {
    const p = personality || { ocean: { neuroticism: 0.5, extraversion: 0.5, openness: 0.5 } };
    return new NeedsSystemNative(p, json, domain, needsConfig);
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
