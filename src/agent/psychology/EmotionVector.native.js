/**
 * EmotionVector.native.js — Native-backed EmotionVector wrapper
 *
 * Drop-in replacement for EmotionVector.js using Rust via napi-rs.
 * Uses src/shared/nativeLoader.js for ANDY_USE_NATIVE semantics.
 *
 * Usage: replace `require('./EmotionVector')` with `require('./EmotionVector.native')`
 * or set ANDY_USE_NATIVE=1 and modify imports.
 *
 * The exported class has the same API as EmotionVector.js:
 *   new EmotionVector(personality, savedState?)
 *   .tick(dt, hour, contagion?)
 *   .applyEffect(effects, mult?, appraisal?)
 *   .getValence(), .getArousal(), .getDominant(n)
 *   .setStress(val), .getMoodString(), .toPromptString()
 *   .current, .mood, .baseline (plain objects)
 *   .toJSON()
 */

const { EMOTION_DIMENSIONS, CO_ACTIVATION, EMOTION_OPPOSITES, ANDY_DEFAULTS } = require('../../config/defaults');
const { loadNativeModule } = require('../../shared/nativeLoader');
const { diagnostics } = require('../../shared/Diagnostics');
const cfg = ANDY_DEFAULTS.emotion;

let _NativeCtor = null;
let _loadResult = null;

function _ensureNative() {
  if (_loadResult) return _loadResult.available;
  _loadResult = loadNativeModule();
  if (_loadResult.available) {
    _NativeCtor = _loadResult.native.EmotionVectorJs;
    if (!_NativeCtor) {
      const err = new Error(
        '[andy-engine] native module loaded but EmotionVectorJs export is missing'
      );
      if (_loadResult.mode === 'required') throw err;
      if (_loadResult.mode === 'optional') {
        diagnostics.warnOnce('emotionvector:missing-export', `${err.message}; falling back to JS.`);
        _loadResult.available = false;
        return false;
      }
    }
  }
  return _loadResult.available;
}

/**
 * Native-backed EmotionVector
 * Wraps the Rust EmotionVectorJs with JS-side mirror objects for .current/.mood/.baseline
 */
class EmotionVectorNative {
  constructor(personality, savedState = null) {
    this.personality = personality;
    this.baseline = { ...personality.emotionBaseline };

    const behaviorJson = JSON.stringify({
      emotionBaseline: personality.emotionBaseline || {},
      emotion_decay_rate: personality.behavior.emotionDecayRate || cfg.decayLambda,
      emotional_inertia: personality.behavior.emotionalInertia || cfg.inertia,
      susceptibility: personality.behavior.susceptibility || 0.5,
      expressiveness: personality.behavior.expressiveness || 0.6,
    });

    const configJson = JSON.stringify({
      decay_lambda: cfg.decayLambda,
      inertia: cfg.inertia,
      max_delta_per_tick: cfg.maxDeltaPerTick,
      noise_amplitude: cfg.noiseAmplitude,
      co_activation_weight: cfg.coActivationWeight,
      baseline_drift_rate: cfg.baselineDriftRate,
      circadian: {
        positive_affect_peak: cfg.circadian.positiveAffectPeak,
        positive_affect_amp: cfg.circadian.positiveAffectAmp,
        negative_affect_peak: cfg.circadian.negativeAffectPeak,
        negative_affect_amp: cfg.circadian.negativeAffectAmp,
      },
    });

    let savedJson = null;
    if (savedState) {
      savedJson = JSON.stringify({
        current: savedState.current,
        mood: savedState.mood,
        baseline: savedState.baseline,
        stress: savedState.stress,
        _pinkNoiseState: savedState._pinkNoiseState,
      });
      if (savedState.baseline) {
        this.baseline = { ...savedState.baseline };
      }
    }

    this._ev = new _NativeCtor(behaviorJson, configJson, savedJson, null);

    // JS mirror objects — kept in sync for fast property access
    this.current = {};
    this.mood = {};
    this.stress = Number.isFinite(savedState?.stress) ? savedState.stress : 2;
    this._pinkNoiseState = savedState?._pinkNoiseState || new Array(16).fill(0);

    // Initialize mirrors from native state
    for (const dim of EMOTION_DIMENSIONS) {
      this.current[dim] = this.baseline[dim] || 0;
      this.mood[dim] = this.baseline[dim] || 0;
    }

    if (savedState) {
      // R34 P1 fix: validate saved values with Number.isFinite, matching
      // the R32 fix in EmotionVector.js. `!== undefined` passes NaN through,
      // poisoning all emotion calculations.
      if (savedState.current) {
        for (const dim of EMOTION_DIMENSIONS) {
          if (typeof savedState.current[dim] === 'number' && Number.isFinite(savedState.current[dim])) {
            this.current[dim] = savedState.current[dim];
          }
        }
      }
      if (savedState.mood) {
        for (const dim of EMOTION_DIMENSIONS) {
          if (typeof savedState.mood[dim] === 'number' && Number.isFinite(savedState.mood[dim])) {
            this.mood[dim] = savedState.mood[dim];
          }
        }
      }
    }
  }

  tick(hoursElapsed, hourOfDay, contagionInputs = null) {
    const inBuf = this._packState();
    if (contagionInputs && typeof contagionInputs === 'object') {
      const cBuf = this._packContagion(contagionInputs);
      const outBuf = this._ev.tickBinaryFull(inBuf, cBuf, hoursElapsed || 0, hourOfDay || 0);
      this._unpackResult(outBuf);
    } else {
      const outBuf = this._ev.tickBinary(inBuf, hoursElapsed || 0, hourOfDay || 0, null);
      this._unpackResult(outBuf);
    }
  }

  applyEffect(effects, multiplier = 1, appraisalModifiers = null) {
    const inBuf = this._packState();
    const eBuf = this._packEffects(effects);
    const aBuf = appraisalModifiers ? this._packEffects(appraisalModifiers) : null;
    const outBuf = this._ev.applyEffectPacked(inBuf, eBuf, multiplier || 1, aBuf);
    this._unpackResult(outBuf);
  }

  _packEffects(effects) {
    if (!effects || typeof effects !== 'object') return Buffer.alloc(0);
    const entries = Object.entries(effects);
    if (entries.length === 0) return Buffer.alloc(0);
    const dims = this._dimIdx || EMOTION_DIMENSIONS;
    if (!this._dimNameToIdx) {
      this._dimNameToIdx = {};
      for (let i = 0; i < dims.length; i++) this._dimNameToIdx[dims[i]] = i;
    }
    const buf = Buffer.alloc(entries.length * 16);
    let off = 0;
    for (const [dim, delta] of entries) {
      const idx = this._dimNameToIdx[dim];
      if (idx === undefined) continue;
      buf.writeDoubleLE(idx, off); off += 8;
      buf.writeDoubleLE(delta, off); off += 8;
    }
    return buf;
  }

  _packState() {
    if (!this._packBuf) {
      this._packBuf = new Float64Array(31);
      this._dimIdx = EMOTION_DIMENSIONS;
    }
    const arr = this._packBuf;
    const dims = this._dimIdx;
    for (let i = 0; i < dims.length; i++) arr[i] = this.current[dims[i]] || 0;
    arr[30] = this.stress;
    return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  }

  _packContagion(contagionInputs) {
    const entries = Object.values(contagionInputs);
    if (entries.length === 0) return null;
    const dims = EMOTION_DIMENSIONS;
    const buf = Buffer.alloc(entries.length * 32 * 8);
    let off = 0;
    for (const entry of entries) {
      const emotion = entry.emotion || {};
      for (let i = 0; i < dims.length; i++) {
        buf.writeDoubleLE(emotion[dims[i]] || 0, off); off += 8;
      }
      buf.writeDoubleLE(entry.weight || 0.3, off); off += 8;
      buf.writeDoubleLE(entry.expressiveness || 0.5, off); off += 8;
    }
    return buf;
  }

  _unpackResult(buf) {
    const arr = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);
    const dims = EMOTION_DIMENSIONS;
    let off = 0;
    for (let i = 0; i < dims.length; i++) this.current[dims[i]] = arr[off++];
    for (let i = 0; i < dims.length; i++) this.mood[dims[i]] = arr[off++];
    for (let i = 0; i < dims.length; i++) this.baseline[dims[i]] = arr[off++];
    this.stress = arr[off++];
    for (let i = 0; i < 16; i++) this._pinkNoiseState[i] = arr[off++];
  }

  setStress(stress) {
    // R34: match EmotionVector.js NaN guard
    if (!Number.isFinite(stress)) stress = 2;
    this.stress = Math.max(0, Math.min(10, stress));
    this._ev.setStress(this.stress);
  }

  getValence() {
    const positive = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm',
                      'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'];
    const negative = ['sadness', 'anger', 'fear', 'disgust', 'loneliness',
                      'nervousness', 'frustration', 'guilt', 'shame', 'horror'];
    let sum = 0, count = 0;
    for (const dim of positive) { if (this.current[dim] !== undefined) { sum += this.current[dim]; count++; } }
    for (const dim of negative) { if (this.current[dim] !== undefined) { sum -= this.current[dim]; count++; } }
    return count > 0 ? sum / count : 0;
  }

  getArousal() {
    const highArousal = ['anger', 'fear', 'excitement', 'surprise', 'nervousness', 'horror', 'pride', 'love', 'triumph'];
    const lowArousal = ['calm', 'boredom', 'contentment', 'sadness'];
    let arousal = 0.5;
    for (const dim of highArousal) { if (this.current[dim] !== undefined) arousal += Math.abs(this.current[dim]) * 0.1; }
    for (const dim of lowArousal) { if (this.current[dim] !== undefined) arousal -= Math.abs(this.current[dim]) * 0.05; }
    return Math.max(0, Math.min(1, arousal));
  }

  getDominant(n = 3) {
    return EMOTION_DIMENSIONS
      .map(dim => ({ dimension: dim, value: this.current[dim] || 0 }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, n);
  }

  getMoodString() {
    const positive = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm', 'hope'];
    const negative = ['sadness', 'anger', 'fear', 'loneliness', 'nervousness', 'frustration'];
    let sum = 0, count = 0;
    for (const dim of positive) { if (this.mood[dim] !== undefined) { sum += this.mood[dim]; count++; } }
    for (const dim of negative) { if (this.mood[dim] !== undefined) { sum -= this.mood[dim]; count++; } }
    const v = count > 0 ? sum / count : 0;
    if (v > 0.2) return '心情不错';
    if (v > 0.05) return '心情还行';
    if (v > -0.1) return '心情一般';
    if (v > -0.2) return '有点低落';
    return '心情不太好';
  }

  toPromptString() {
    const dominant = this.getDominant(8);
    const valence = this.getValence();
    const arousal = this.getArousal();
    const emotionNames = {
      joy: '开心', sadness: '难过', anger: '生气', fear: '害怕',
      surprise: '惊讶', disgust: '厌恶', amusement: '觉得好笑',
      awe: '敬畏', contentment: '满足', desire: '渴望',
      embarrassment: '尴尬', guilt: '内疚', horror: '恐惧',
      interest: '感兴趣', love: '喜欢/爱', nervousness: '紧张',
      pride: '自豪', relief: '如释重负', satisfaction: '满意',
      shame: '羞耻', sympathy: '同情', triumph: '得意',
      boredom: '无聊', calm: '平静', confusion: '困惑',
      excitement: '兴奋', frustration: '沮丧/烦躁', gratitude: '感激',
      hope: '希望', loneliness: '孤独',
    };
    const intensityLabel = (abs) => {
      if (abs > 0.85) return '极度'; if (abs > 0.7) return '非常';
      if (abs > 0.55) return '很'; if (abs > 0.4) return '挺';
      if (abs > 0.25) return '比较'; if (abs > 0.12) return '有点';
      return '略微';
    };
    const posE = [], negE = [];
    for (const { dimension, value } of dominant) {
      if (Math.abs(value) < 0.12) continue;
      const name = emotionNames[dimension] || dimension;
      const label = intensityLabel(Math.abs(value));
      const negNames = { joy: '不开心', contentment: '不满足', calm: '不安', excitement: '低落', hope: '失望', satisfaction: '不满意' };
      if (value > 0) { posE.push({ name, label, value, dim: dimension }); }
      else { negE.push({ name: negNames[dimension] || name, label, value: -value, dim: dimension }); }
    }
    let scene = '';
    const hasAmb = posE.length > 0 && negE.length > 0 && posE[0].value > 0.25 && negE[0].value > 0.25;
    if (hasAmb) {
      scene = `你的内心处于矛盾之中——${posE[0].label}${posE[0].name}的暖意(${posE[0].value.toFixed(2)})与${negE[0].label}${negE[0].name}的阴影(-${negE[0].value.toFixed(2)})在拉锯`;
      if (posE.length > 1) scene += `，同时还夹杂着${posE.slice(1, 3).map(e => `${e.label}${e.name}`).join('、')}`;
    } else if (valence > 0.2) {
      const top = posE[0] || { name: '平静', label: '' };
      scene = `${top.label}${top.name}的情绪主导着你的心境`;
      if (negE.length > 0 && negE[0].value > 0.15) scene += `，但深处有一丝${negE[0].label}${negE[0].name}`;
    } else if (valence < -0.2) {
      const top = negE[0] || { name: '不安', label: '' };
      scene = `${top.label}${top.name}的情绪笼罩着你`;
      if (posE.length > 0 && posE[0].value > 0.15) scene += `，心底还残留着一些${posE[0].label}${posE[0].name}`;
    } else {
      const all = [...posE, ...negE].sort((a, b) => b.value - a.value);
      if (all.length > 0) { scene = `你的内心平静而微妙，${all[0].label}${all[0].name}`; if (all.length > 1) scene += `与${all[1].label}${all[1].name}并存`; }
      else { scene = '你的内心比较平静'; }
    }
    const stressDesc = this.stress > 5 ? '压力很大' : this.stress > 3 ? '有点压力' : '';
    const energyDesc = arousal > 0.7 ? '精力充沛' : arousal > 0.4 ? '' : '有些疲倦';
    const overallMood = this.getMoodString();
    const keyDims = [];
    const joyVal = this.current.joy || 0, sadnessVal = this.current.sadness || 0;
    if (Math.abs(joyVal) > 0.15) keyDims.push(`开心=${joyVal.toFixed(2)}`);
    if (Math.abs(sadnessVal) > 0.15) keyDims.push(`难过=${sadnessVal.toFixed(2)}`);
    if (dominant.length > 0) { const t = dominant[0].dimension; if (t !== 'joy' && t !== 'sadness' && Math.abs(dominant[0].value) > 0.3) keyDims.push(`${emotionNames[t] || t}=${dominant[0].value.toFixed(2)}`); }
    let suffix = '';
    if (keyDims.length > 0) suffix += `。关键维度：${keyDims.join(', ')}`;
    if (stressDesc || energyDesc) suffix += `。${[stressDesc, energyDesc].filter(Boolean).join('，')}`;
    return `${scene}（效价=${valence.toFixed(2)}, 唤醒=${arousal.toFixed(2)}）${suffix}。整体心境：${overallMood}。`;
  }

  toJSON() {
    return {
      current: { ...this.current },
      mood: { ...this.mood },
      baseline: { ...this.baseline },
      stress: this.stress,
      _pinkNoiseState: [...this._pinkNoiseState],
    };
  }

  /**
   * 从 toJSON 输出反序列化为 EmotionVectorNative 实例（native 路径）。
   * 恢复路径中应传入真实 Personality；省略时用 baseline + behavior 桩，仅供 round-trip / 测试。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [personality] - Personality 实例
   * @returns {EmotionVectorNative}
   */
  static fromJSON(json, personality = null) {
    const p = personality || { emotionBaseline: (json && json.baseline) || {}, behavior: {} };
    return new EmotionVectorNative(p, json);
  }

  _timeDecay(dt) {
    const lambda = this.personality.behavior.emotionDecayRate || cfg.decayLambda;
    const hedonicAdaptFactor = 1.2;
    const negativityBiasFactor = 0.7;
    const positiveDims = new Set(['joy', 'contentment', 'satisfaction', 'excitement',
      'calm', 'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement']);
    const negativeDims = new Set(['sadness', 'anger', 'fear', 'disgust', 'loneliness',
      'nervousness', 'frustration', 'guilt', 'shame', 'horror', 'boredom']);

    for (const dim of EMOTION_DIMENSIONS) {
      const moodLevel = this.mood[dim] || 0;
      const current = this.current[dim] || 0;
      const excess = current - moodLevel;
      let effectiveLambda = lambda;
      if (excess > 0 && positiveDims.has(dim)) effectiveLambda = lambda * hedonicAdaptFactor;
      else if (excess < 0 && negativeDims.has(dim)) effectiveLambda = lambda * negativityBiasFactor;
      const currentFactor = Math.exp(-effectiveLambda * dt);
      this.current[dim] = moodLevel + (current - moodLevel) * currentFactor;
    }

    const baseMoodLambda = lambda / 6;
    for (const dim of EMOTION_DIMENSIONS) {
      const base = this.baseline[dim] || 0;
      const moodExcess = this.mood[dim] - base;
      let moodLambda = baseMoodLambda;
      if (moodExcess < 0 && negativeDims.has(dim)) moodLambda *= negativityBiasFactor;
      const moodFactor = Math.exp(-moodLambda * dt);
      this.mood[dim] = base + (this.mood[dim] - base) * moodFactor;
    }

    const nonNegative = new Set(['loneliness', 'boredom', 'nervousness', 'guilt', 'shame', 'embarrassment']);
    for (const dim of EMOTION_DIMENSIONS) {
      if (this.mood[dim] !== undefined) {
        const lower = nonNegative.has(dim) ? 0 : -1;
        this.mood[dim] = Math.max(lower, Math.min(1, this.mood[dim]));
      }
    }
  }

  _coActivationSpread() {
    const weight = cfg.coActivationWeight;
    const deltas = {};
    const snapshot = {};
    for (const dim of EMOTION_DIMENSIONS) snapshot[dim] = this.current[dim] || 0;

    for (const [source, targets] of Object.entries(CO_ACTIVATION)) {
      const sourceIntensity = snapshot[source];
      if (sourceIntensity === undefined || Math.abs(sourceIntensity) < 0.15) continue;
      for (const target of targets) {
        if (snapshot[target] === undefined) continue;
        if (source === target) continue;
        if (!deltas[target]) deltas[target] = 0;
        deltas[target] += sourceIntensity * weight * 0.05;
      }
    }
    for (const [dim, delta] of Object.entries(deltas)) {
      const clampedDelta = Math.max(-0.02, Math.min(0.02, delta));
      this.current[dim] = (this.current[dim] || 0) + clampedDelta;
    }
  }

  _clamp() {
    const nonNegative = new Set(['loneliness', 'boredom', 'nervousness', 'guilt', 'shame', 'embarrassment']);
    for (const dim of EMOTION_DIMENSIONS) {
      if (this.current[dim] !== undefined) {
        const lower = nonNegative.has(dim) ? 0 : -1;
        this.current[dim] = Math.max(lower, Math.min(1, this.current[dim]));
      }
    }
    this.stress = Math.max(0, Math.min(10, this.stress));
  }
}

// ═══════════════════════════════════════════
// Export: conditionally use native or pure JS
// ═══════════════════════════════════════════

_ensureNative();
const useNative = _loadResult && _loadResult.available;

if (useNative) {
  module.exports = EmotionVectorNative;
} else {
  module.exports = require('./EmotionVector');
}

module.exports._isNative = useNative;
