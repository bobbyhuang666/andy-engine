/**
 * EmotionVector - 多维情绪系统
 *
 * 基于 Cowen & Keltner (2017) 的 30 维情绪空间
 * 每个维度范围 [-1, 1]
 *
 * 演化机制（10步，增加多 Agent 传染）：
 *   1. 时间衰减（向基线回归）
 *   2. 昼夜节律调制
 *   3. 1/f 粉噪声漂移
 *   4. 共激活传播
 *   5. 对立抑制
 *   6. 情绪惯性滤波
 *   7. 社交传染（来自相邻 Agent）
 *   8. 基线漂移（长期人格演化）
 *   9. 速度限制（约束社交传染+基线漂移的幅度）
 *   10. 边界截断 [-1, 1]
 */

const { EMOTION_DIMENSIONS, CO_ACTIVATION, EMOTION_OPPOSITES, ANDY_DEFAULTS } = require('../../config/defaults');
const cfg = ANDY_DEFAULTS.emotion;
const contagionCfgDefaults = ANDY_DEFAULTS.contagion;

const { RNG } = require('../../shared/rng');
const POSITIVE_DIMS = new Set(['joy', 'contentment', 'satisfaction', 'excitement',
  'calm', 'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement']);
const NEGATIVE_DIMS = new Set(['sadness', 'anger', 'fear', 'disgust',
  'nervousness', 'frustration', 'guilt', 'shame', 'horror', 'boredom', 'loneliness']);
const NON_NEGATIVE_DIMS = new Set(['loneliness', 'boredom', 'nervousness', 'guilt', 'shame', 'embarrassment']);

function mergeEmotionConfig(emotionConfig = null) {
  return {
    ...cfg,
    ...(emotionConfig || {}),
    circadian: {
      ...cfg.circadian,
      ...(emotionConfig?.circadian || {}),
    },
  };
}

class EmotionVector {
  /**
   * @param {Object} personality - Personality 实例，提供情绪基线和行为参数
   * @param {Object} [savedState] - 恢复的序列化状态
   * @param {Object} [rng] - RNG 实例（可选）
   * @param {Object} [emotionConfig] - 可选的情绪配置，覆盖 ANDY_DEFAULTS.emotion
   * @param {Object} [contagionConfig] - 可选的社交传染配置，覆盖 ANDY_DEFAULTS.contagion
   */
  constructor(personality, savedState = null, rng = null, emotionConfig = null, contagionConfig = null) {
    this.personality = personality;
    this._rng = rng || new RNG(0);
    this._cfg = mergeEmotionConfig(emotionConfig);
    this._contagionConfig = { ...contagionCfgDefaults, ...(contagionConfig || {}) };
    this.baseline = { ...personality.emotionBaseline };

    if (savedState) {
      // R32 P0-003 fix: validate savedState values for NaN.
      // NaN from corrupted save data is permanent — _clamp() uses Math.max/min
      // which returns NaN when given NaN, and mood reads lack || 0 fallback.
      this.current = {};
      this.mood = {};
      this.baseline = {};
      for (const dim of EMOTION_DIMENSIONS) {
        const base = Number.isFinite(savedState.baseline?.[dim]) ? savedState.baseline[dim] : (personality.emotionBaseline[dim] || 0);
        this.baseline[dim] = base;
        this.current[dim] = Number.isFinite(savedState.current?.[dim]) ? savedState.current[dim] : base;
        this.mood[dim] = Number.isFinite(savedState.mood?.[dim]) ? savedState.mood[dim] : base;
      }
      this.stress = Number.isFinite(savedState?.stress) ? savedState.stress : 2;
      this._pinkNoiseState = savedState._pinkNoiseState || new Array(16).fill(0);
    } else {
      this.current = {};
      this.mood = {};
      for (const dim of EMOTION_DIMENSIONS) {
        this.current[dim] = this.baseline[dim] || 0;
        this.mood[dim] = this.baseline[dim] || 0;
      }
      this.stress = 2;
      this._pinkNoiseState = new Array(16).fill(0);
    }

    // 预分配快照缓冲区（避免每 tick 创建新对象）
    this._preTickValues = {};
    for (const dim of EMOTION_DIMENSIONS) {
      this._preTickValues[dim] = 0;
    }
  }

  // ═══════════════════════════════════════════
  // 核心 Tick 演化
  // ═══════════════════════════════════════════

  /**
   * 推进情绪状态
   * @param {number} hoursElapsed - 经过的小时数
   * @param {number} hourOfDay - 当前时间（小时，0-23.99）
   * @param {Object|null} contagionInputs - 社交传染输入 { agentId: { emotion, weight } }
   */
  tick(hoursElapsed, hourOfDay, contagionInputs = null) {
    // Step 1: 时间衰减（向基线回归）
    this._timeDecay(hoursElapsed);

    // Step 2: 昼夜节律
    this._circadianModulation(hourOfDay);

    // Step 3: 1/f 粉噪声漂移
    this._pinkNoiseDrift();

    // Step 4: 共激活传播
    this._coActivationSpread();

    // Step 5: 对立抑制
    this._oppositionDamping();

    // Step 6: 情绪惯性滤波（在所有扰动之后）
    this._inertiaFilter();

    // 快照设置在惯性滤波之后、社交传染之前
    // 这确保自然衰减力（时间衰减 + 节律 + 惯性）不受速度限制阻碍
    // 速度限制只约束社交传染和基线漂移的幅度
    for (const dim of EMOTION_DIMENSIONS) {
      this._preTickValues[dim] = this.current[dim] || 0;
    }

    // Step 7: 社交传染
    if (contagionInputs) {
      this._socialContagion(contagionInputs);
    }

    // Step 8: 基线漂移（长期人格演化）
    this._baselineDrift();

    // Step 9: 速度限制（仅约束社交传染 + 基线漂移）
    this._velocityLimit();

    // Step 10: 边界截断
    this._clamp();
  }

  /**
   * Step 1: 时间衰减（三层架构）
   *
   * 参考 ALMA (Gebhard 2005) + PSYA (2025) 的情绪层次模型：
   *   - 瞬时情绪 (current): 事件驱动，快速变化（秒-分钟级）
   *   - 中期心境 (mood): 事件累积效应，缓慢变化（小时-天级）
   *   - 长期基线 (baseline): 人格决定，极慢变化（周-月级）
   *
   * 衰减链: current → mood → baseline
   *   current 快速衰减向 mood（半衰期 ~1 小时）
   *   mood 缓慢衰减向 baseline（半衰期 ~6 小时）
   *
   * 这产生了"余韵效应"：
   *   负面事件后，current 恢复快，但 mood 持续低落数小时
   *   多次正面事件后，mood 上升，让 Agent 整体更积极
   *
   * @private
   */
  _timeDecay(dt) {
    const lambda = this.personality.behavior.emotionDecayRate || this._cfg.decayLambda;

    // 享乐适应因子（Frederick & Loewenstein 1999）：
    // 正面情绪高于 mood 时衰减更快（~20% 加速）
    const hedonicAdaptFactor = 1.2;

    // 消极偏见因子（Baumeister et al. 2001: "Bad is stronger than good"）：
    // 负面情绪衰减更慢（0.7x），模拟负面情绪的持续效应
    const negativityBiasFactor = 0.7;

    // current 衰减向 mood（快速）
    for (const dim of EMOTION_DIMENSIONS) {
      const moodLevel = this.mood[dim] || 0;
      const current = this.current[dim] || 0;
      const excess = current - moodLevel;

      let effectiveLambda = lambda;
      if (excess > 0 && POSITIVE_DIMS.has(dim)) {
        // 正面情绪高于 mood → 享乐适应加速衰减
        effectiveLambda = lambda * hedonicAdaptFactor;
      } else if (excess < 0 && NEGATIVE_DIMS.has(dim)) {
        // 负面情绪低于 mood → 消极偏见减缓衰减
        effectiveLambda = lambda * negativityBiasFactor;
      }

      const currentFactor = Math.exp(-effectiveLambda * dt);
      this.current[dim] = moodLevel + (current - moodLevel) * currentFactor;
    }

    // mood 衰减向 baseline（缓慢，半衰期约为 current 的 6 倍）
    // 负面 mood 衰减更慢（消极偏见在心境层面也成立）
    const baseMoodLambda = lambda / 6;
    for (const dim of EMOTION_DIMENSIONS) {
      const base = this.baseline[dim] || 0;
      // R32 P0-001 fix: use || 0 fallback for mood reads (matching current reads).
      // Without this, NaN in mood is permanent — Math operations on NaN produce NaN,
      // and _clamp()'s Math.max/min cannot repair NaN values.
      const moodExcess = (this.mood[dim] || 0) - base;
      let moodLambda = baseMoodLambda;
      if (moodExcess < 0 && NEGATIVE_DIMS.has(dim)) {
        moodLambda *= negativityBiasFactor; // 负面心境衰减更慢
      }
      const moodFactor = Math.exp(-moodLambda * dt);
      this.mood[dim] = base + ((this.mood[dim] || 0) - base) * moodFactor;
    }

    // mood 截断：非负语义维度 + 常规 [-1, 1] 范围
    // R32 fix: repair NaN before clamping (Math.max/min with NaN returns NaN)
    for (const dim of EMOTION_DIMENSIONS) {
      if (this.mood[dim] !== undefined) {
        if (!Number.isFinite(this.mood[dim])) this.mood[dim] = this.baseline[dim] || 0;
        const lower = NON_NEGATIVE_DIMS.has(dim) ? 0 : -1;
        this.mood[dim] = Math.max(lower, Math.min(1, this.mood[dim]));
      }
    }

    // Stress homeostatic drift toward baseline 2.0
    // Above baseline: exponential decay (same half-life as emotion dimensions)
    // Below baseline: gradual drift so positive events can reduce stress
    if (this.stress > 2.0) {
      const stressDecayRate = 0.1;
      this.stress = 2.0 + (this.stress - 2.0) * Math.exp(-stressDecayRate * dt);
    } else if (this.stress < 2.0) {
      // Gradual drift (10% per hour toward 2.0) instead of hard reset,
      // so positive events can actually reduce stress below 2.0.
      this.stress += (2.0 - this.stress) * 0.1 * dt;
    }
  }

  /**
   * Step 2: 昼夜节律调制
   * 使用 alpha-Blend 而非累加，防止情绪持续积累
   * target = baseline + circadian_offset
   * current = (1-alpha) * current + alpha * target
   * @private
   */
  _circadianModulation(hour) {
    const { positiveAffectPeak, positiveAffectAmp, negativeAffectPeak, negativeAffectAmp } = this._cfg.circadian;
    // R110-NAN-2: guard against NaN/Infinity config values (defense-in-depth;
    // validate.js checkRange also catches these, but legacy save data may bypass validation).
    if (!Number.isFinite(positiveAffectPeak) || !Number.isFinite(positiveAffectAmp) ||
        !Number.isFinite(negativeAffectPeak) || !Number.isFinite(negativeAffectAmp)) {
      return;
    }
    const twoPiOver24 = 2 * Math.PI / 24;
    const alpha = 0.05; // 非常小的混合系数，防止累积

    // 正面情绪节律偏移
    const paOffset = positiveAffectAmp * Math.cos(twoPiOver24 * (hour - positiveAffectPeak));
    // 负面情绪节律偏移
    const naOffset = negativeAffectAmp * Math.cos(twoPiOver24 * (hour - negativeAffectPeak));

    const positiveEmotions = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm', 'hope'];
    const negativeEmotions = ['sadness', 'anger', 'fear', 'loneliness', 'nervousness', 'frustration'];

    for (const dim of positiveEmotions) {
      if (this.current[dim] !== undefined) {
        const target = (this.baseline[dim] || 0) + paOffset;
        this.current[dim] = (1 - alpha) * this.current[dim] + alpha * target;
      }
    }
    for (const dim of negativeEmotions) {
      if (this.current[dim] !== undefined) {
        const target = (this.baseline[dim] || 0) + naOffset;
        this.current[dim] = (1 - alpha) * this.current[dim] + alpha * target;
      }
    }

    // 深夜特殊调制（同样用微小 alpha blend）
    if (hour >= 23 || hour < 5) {
      this.current.calm = (1 - 0.02) * (this.current.calm || 0) + 0.02 * 0.4;
      this.current.loneliness = (1 - 0.02) * (this.current.loneliness || 0) + 0.02 * 0.2;
    }
  }

  /**
   * Step 3: 1/f 粉噪声漂移
   * 简化的 Voss-McCartney 近似
   * @private
   */
  _pinkNoiseDrift() {
    const amp = this._cfg.noiseAmplitude;
    // R110-NAN-5: guard against NaN/Infinity amplitude.
    if (!Number.isFinite(amp)) return;
    const n = this._pinkNoiseState.length;
    const rand = this._rng.next.bind(this._rng);

    // 白噪声源
    const white = (rand() * 2 - 1) * amp;

    // 更新粉色噪声状态
    let sum = white;
    for (let i = 0; i < n; i++) {
      if (rand() < 0.5) {
        this._pinkNoiseState[i] = (rand() * 2 - 1) * amp;
      }
      sum += this._pinkNoiseState[i];
    }
    const noise = sum / (n + 1);

    // 随机选择几个维度应用噪声
    const dims = EMOTION_DIMENSIONS;
    const numToDrift = 3 + Math.floor(rand() * 4); // 3-6 个维度
    for (let i = 0; i < numToDrift; i++) {
      const dim = dims[Math.floor(rand() * dims.length)];
      const current = this.current[dim] || 0;
      const base = this.baseline[dim] || 0;

      // 均值回归力：偏离基线越远，回归力越强
      // 这防止粉噪声导致情绪无限漂移（纯随机游走问题）
      // 回归系数随偏离距离线性增长，模拟情绪系统的自我稳定性
      // 参考：Ortony et al. (1988) 情绪衰减理论
      const deviation = current - base;
      const reversionStrength = Math.min(0.5, Math.abs(deviation) * 0.8 + 0.005);
      const reversion = -deviation * reversionStrength;

      this.current[dim] = current + noise + reversion;
    }
  }

  /**
   * Step 4: 共激活传播
   * 一个情绪激活时，会部分传播到相关情绪
   * @private
   */
  _coActivationSpread() {
    const weight = this._cfg.coActivationWeight;
    const deltas = {};

    // 使用快照防止读-写顺序问题
    const snapshot = {};
    for (const dim of EMOTION_DIMENSIONS) {
      snapshot[dim] = this.current[dim] || 0;
    }

    for (const [source, targets] of Object.entries(CO_ACTIVATION)) {
      // 从快照读取，使用低阈值（情绪通常在 baseline 附近（0.1-0.2），
      // 旧阈值 0.5 导致共激活几乎永不触发）
      const sourceIntensity = snapshot[source];
      if (sourceIntensity === undefined || Math.abs(sourceIntensity) < 0.15) continue;

      for (const target of targets) {
        if (snapshot[target] === undefined) continue; // 跳过不存在的维度（如 'anxiety'）
        if (source === target) continue; // 不自传播
        if (!deltas[target]) deltas[target] = 0;
        // 传播量：源情绪强度 × 共激活权重 × 传播系数
        // 增大 10 倍（0.005→0.05），但仍受 0.02 硬上限约束，防止过度传播
        deltas[target] += sourceIntensity * weight * 0.05;
      }
    }

    // 每个维度的总变化有硬上限
    for (const [dim, delta] of Object.entries(deltas)) {
      const clampedDelta = Math.max(-0.02, Math.min(0.02, delta));
      this.current[dim] = (this.current[dim] || 0) + clampedDelta;
    }
  }

  /**
   * Step 5: 对立抑制
   * 相反情绪相互削弱
   * @private
   */
  _oppositionDamping() {
    const alpha = 0.25; // 对立抑制强度
    const snapshot = {};
    for (const dim of EMOTION_DIMENSIONS) {
      snapshot[dim] = this.current[dim] || 0;
    }

    const processed = new Set();
    for (const [dimA, dimB] of Object.entries(EMOTION_OPPOSITES)) {
      const pairKey = [dimA, dimB].sort().join('_');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      if (snapshot[dimA] === undefined || snapshot[dimB] === undefined) continue;

      // 双向抑制：高值情绪压制对立情绪
      // 设计意图：正值情绪压制对立的正值（如高 joy 抑制高 sadness）
      // 不大幅压制对立的负值（避免推动情绪更极端）
      const valA = snapshot[dimA];
      const valB = snapshot[dimB];

      // A 压制 B：A 越高，B 被压低
      if (valA > 0.1) {
        this.current[dimB] -= alpha * valA * (valB > 0 ? 1 : 0.3);
      }
      // B 压制 A：B 越高，A 被压低
      if (valB > 0.1) {
        this.current[dimA] -= alpha * valB * (valA > 0 ? 1 : 0.3);
      }

      this.current[dimA] = Math.max(-1, Math.min(1, this.current[dimA]));
      this.current[dimB] = Math.max(-1, Math.min(1, this.current[dimB]));
    }
  }

  /**
   * Step 6: 情绪惯性滤波
   * 限制单步变化量，防止情绪剧变
   * 极端值有额外的回归力（越极端拉力越大）
   * @private
   */
  _inertiaFilter() {
    const maxDelta = this._cfg.maxDeltaPerTick;
    for (const dim of EMOTION_DIMENSIONS) {
      const val = this.current[dim] || 0;
      const base = this.baseline[dim] || 0;
      const dist = val - base;

      // 超过 0.6 开始有回归力，超过 0.9 有强力回归
      if (Math.abs(dist) > 0.6) {
        // R10: clamp pullStrength to [0,1] to prevent overshoot.
        // With current maxDeltaPerTick=0.10, pullStrength peaks at ~0.18,
        // but a future config change to maxDeltaPerTick > 0.56 could cause
        // pullStrength > 1.0, making (1-pullStrength) negative and flipping
        // the emotion past the baseline to the opposite side.
        const pullStrength = Math.min(1, maxDelta * (1 + (Math.abs(dist) - 0.6) * 2));
        this.current[dim] = base + dist * (1 - pullStrength);
      }
    }
  }

  /**
   * Step 7: 社交传染
   * E_i += susceptibility_i * expressiveness_j * w_ij * (E_j - E_i)
   * @private
   */
  _socialContagion(contagionInputs) {
    const susceptibility = this.personality.behavior.susceptibility;

    const negativityBias = this._contagionConfig.negativityBias || 1.4;
    const baseContagionRate = this._contagionConfig.baseContagionRate || 0.3;

    for (const [agentId, input] of Object.entries(contagionInputs)) {
      const { emotion, weight, expressiveness } = input;
      if (!emotion) continue;

      const effectiveWeight = susceptibility * (expressiveness || 0.5) * (weight || 0.3);

      for (const dim of EMOTION_DIMENSIONS) {
        const theirVal = emotion[dim] || 0;
        const myVal = this.current[dim] || 0;
        const diff = theirVal - myVal;

        // 只对显著差异产生传染
        // 基础传染率 30%（Hatfield 1993），负面情绪额外+40%
        // Negativity bias: when neighbor's negative emotion is HIGHER than mine,
        // the contagion rate is boosted (negative emotions spread faster).
        if (Math.abs(diff) > 0.05) {
          const isNegative = NEGATIVE_DIMS.has(dim) && theirVal > myVal;
          const contagionRate = isNegative ? baseContagionRate * negativityBias : baseContagionRate;
          this.current[dim] = myVal + diff * effectiveWeight * contagionRate;
        }
      }
    }
  }

  /**
   * Step 8: 基线漂移
   * 极端情绪会缓慢影响基线（长期人格演化）
   * @private
   */
  _baselineDrift() {
    const rate = this._cfg.baselineDriftRate;
    if (!Number.isFinite(rate)) return; // R110-NAN-3: guard against NaN/Infinity config
    for (const dim of EMOTION_DIMENSIONS) {
      const current = this.current[dim] || 0;
      const base = this.baseline[dim] || 0;
      if (Math.abs(current) > 0.5) {
        // R30 P1 fix: clamp baseline to [-1, 1] after drift.
        // Without clamp, sustained extreme emotion (e.g. joy=1.0 for thousands
        // of ticks) slowly creeps baseline above 1.0. adaptBaseline() already
        // clamps; _baselineDrift should be consistent.
        this.baseline[dim] = Math.max(-1, Math.min(1, base + (current - base) * rate));
      }
    }
  }

  /**
   * R28 P1-001 fix: Public API for reflection-driven baseline adaptation.
   * Previously, ReflectionRuntime directly wrote to emotion.baseline[dim],
   * bypassing EmotionVector's ownership and creating an undocumented dual
   * drift mechanism at 20x the designed rate. This method gives ReflectionRuntime
   * a proper seam while keeping EmotionVector in control of its internal state.
   *
   * @param {Object} driftMap - { dimension: driftAmount } where driftAmount is
   *   the absolute amount to add to baseline (NOT a delta relative to current).
   * @param {number} clampMax - maximum absolute baseline value after adaptation
   */
  adaptBaseline(driftMap, clampMax = 0.4) {
    if (!driftMap || typeof driftMap !== 'object') return;
    for (const [dim, drift] of Object.entries(driftMap)) {
      if (!Number.isFinite(drift)) continue;
      if (!(dim in this.baseline)) continue;
      this.baseline[dim] = Math.max(-clampMax, Math.min(clampMax, (this.baseline[dim] || 0) + drift));
    }
  }

  /**
   * Step 9: 速度限制
   * 限制每个维度在单个 tick 内的最大变化量
   * 但不阻碍向基线方向的自然衰减（允许惯性滤波和时间衰减生效）
   * @private
   */
  _velocityLimit() {
    const maxVelocity = this._cfg.maxDeltaPerTick; // 0.05
    if (!this._preTickValues) return;

    for (const dim of EMOTION_DIMENSIONS) {
      const prev = this._preTickValues[dim] || 0;
      const curr = this.current[dim] || 0;
      const base = this.baseline[dim] || 0;
      const delta = curr - prev;

      if (Math.abs(delta) > maxVelocity) {
        // 检查变化方向是否朝向基线（自然衰减）还是远离基线（扰动过冲）
        const prevDistFromBase = prev - base;
        const currDistFromBase = curr - base;

        // 如果变化使值更接近基线，这是自然衰减，不应限制
        if (Math.abs(currDistFromBase) < Math.abs(prevDistFromBase)) {
          continue; // 朝基线方向移动，允许
        }

        // 远离基线的变化需要限制
        this.current[dim] = prev + Math.sign(delta) * maxVelocity;
      }
    }
  }

  /**
   * Step 10: 边界截断
   * @private
   */
  _clamp() {
    // R32 P0-001 fix: Math.max/min with NaN returns NaN, so NaN values
    // in current/stress/mood were permanent. Now we repair NaN before clamping.
    // R110-NAN-3: also repair NaN in baseline (previously only current/stress were covered).
    for (const dim of EMOTION_DIMENSIONS) {
      if (this.baseline[dim] !== undefined) {
        if (!Number.isFinite(this.baseline[dim])) this.baseline[dim] = 0;
        this.baseline[dim] = Math.max(-1, Math.min(1, this.baseline[dim]));
      }
      if (this.current[dim] !== undefined) {
        if (!Number.isFinite(this.current[dim])) this.current[dim] = this.baseline[dim] || 0;
        const lower = NON_NEGATIVE_DIMS.has(dim) ? 0 : -1;
        this.current[dim] = Math.max(lower, Math.min(1, this.current[dim]));
      }
    }
    if (!Number.isFinite(this.stress)) this.stress = 2;
    this.stress = Math.max(0, Math.min(10, this.stress));
  }

  // ═══════════════════════════════════════════
  // 外部影响接口
  // ═══════════════════════════════════════════

  /**
   * 应用事件的情绪效果
   *
   * @param {Object} effects - { joy: 0.3, sadness: -0.1, ... }
   * @param {number} [multiplier=1] - 效果倍率
   * @param {Object} [appraisalModifiers=null] - 认知评价修正因子 { emotionName: multiplier }
   *   来自 Appraisal 模块，根据事件的突然性、目标相关性等维度调制情绪反应
   *   例如: { joy: 1.5, fear: 0.3 } 表示快乐效果增强 50%，恐惧效果减弱 70%
   */
  applyEffect(effects, multiplier = 1, appraisalModifiers = null) {
    if (!effects) return;
    const inertia = this.personality.behavior.emotionalInertia || this._cfg.inertia;

    for (const [dim, delta] of Object.entries(effects)) {
      // R32 P0-002 fix: typeof NaN === 'number' is true, so NaN deltas
      // were accepted and propagated to current/mood permanently.
      if (this.current[dim] !== undefined && typeof delta === 'number' && Number.isFinite(delta)) {
        // 认知评价调制：同一事件对不同情绪维度有不同影响
        let appraisalMult = 1;
        if (appraisalModifiers && appraisalModifiers[dim] !== undefined) {
          appraisalMult = appraisalModifiers[dim];
        }

        // 惯性调制：高惯性的角色对情绪变化有抵抗力
        const effectiveDelta = delta * multiplier * appraisalMult * (1 - inertia * 0.5);
        // 速度限制：单次效果不超过 maxDeltaPerTick
        const clampedDelta = Math.max(-this._cfg.maxDeltaPerTick, Math.min(this._cfg.maxDeltaPerTick, effectiveDelta));
        this.current[dim] += clampedDelta;

        // 事件也缓慢影响 mood（10% 的效果渗透到中期心境）
        // 这创造了"余韵效应"：强烈的事件会持续影响数小时
        this.mood[dim] = (this.mood[dim] || 0) + clampedDelta * 0.1;
      }
    }
    this._clamp();
    // mood 也需要边界截断（含非负下界）
    // R32 fix: repair NaN before clamping (consistent with _timeDecay mood clamp)
    for (const dim of EMOTION_DIMENSIONS) {
      if (this.mood[dim] !== undefined) {
        if (!Number.isFinite(this.mood[dim])) this.mood[dim] = this.baseline[dim] || 0;
        const lower = NON_NEGATIVE_DIMS.has(dim) ? 0 : -1;
        this.mood[dim] = Math.max(lower, Math.min(1, this.mood[dim]));
      }
    }
  }

  /**
   * 设置压力值
   * @param {number} stress
   */
  setStress(stress) {
    if (!Number.isFinite(stress)) stress = 2;
    this.stress = Math.max(0, Math.min(10, stress));
  }

  // ═══════════════════════════════════════════
  // 查询接口
  // ═══════════════════════════════════════════

  /**
   * 获取最显著的 N 个情绪
   * @param {number} n
   * @returns {Array<{dimension: string, value: number}>}
   */
  getDominant(n = 3) {
    return EMOTION_DIMENSIONS
      .map(dim => ({ dimension: dim, value: this.current[dim] || 0 }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, n);
  }

  /**
   * 获取效价（正面/负面情绪平衡）
   * @returns {number} -1 到 +1
   */
  getValence() {
    const positive = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm',
                      'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'];
    const negative = ['sadness', 'anger', 'fear', 'disgust', 'loneliness',
                      'nervousness', 'frustration', 'guilt', 'shame', 'horror', 'boredom'];

    let sum = 0;
    let count = 0;
    for (const dim of positive) {
      if (this.current[dim] !== undefined) { sum += this.current[dim]; count++; }
    }
    for (const dim of negative) {
      if (this.current[dim] !== undefined) { sum -= this.current[dim]; count++; }
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * 获取唤醒度
   * @returns {number} 0 到 1
   */
  getArousal() {
    const highArousal = ['anger', 'fear', 'excitement', 'surprise', 'nervousness', 'horror', 'pride', 'love', 'triumph'];
    const lowArousal = ['calm', 'boredom', 'contentment', 'sadness'];

    let arousal = 0.5;
    for (const dim of highArousal) {
      if (this.current[dim] !== undefined) arousal += Math.abs(this.current[dim]) * 0.1;
    }
    for (const dim of lowArousal) {
      if (this.current[dim] !== undefined) arousal -= Math.abs(this.current[dim]) * 0.05;
    }
    return Math.max(0, Math.min(1, arousal));
  }

  /**
   * 生成情绪的中文描述（用于 LLM prompt 注入）
   *
   * 实验一结论：象征性场景描述 > 精确数值 > 当前格式
   * 实验三结论：7级描述 > 3级（当前） > 10分制
   *
   * 新格式：场景叙事 + 7级精度 + 关键数值
   * @returns {string}
   */
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

    // 7级强度描述（实验三结论）
    const intensityLabel = (abs) => {
      if (abs > 0.85) return '极度';
      if (abs > 0.7) return '非常';
      if (abs > 0.55) return '很';
      if (abs > 0.4) return '挺';
      if (abs > 0.25) return '比较';
      if (abs > 0.12) return '有点';
      return '略微';
    };

    // 分离正面和负面情绪
    const positiveEmotions = [];
    const negativeEmotions = [];
    for (const { dimension, value } of dominant) {
      if (Math.abs(value) < 0.12) continue;
      const name = emotionNames[dimension] || dimension;
      const label = intensityLabel(Math.abs(value));
      const negNames = {
        joy: '不开心', contentment: '不满足', calm: '不安',
        excitement: '低落', hope: '失望', satisfaction: '不满意',
      };
      if (value > 0) {
        positiveEmotions.push({ name, label, value, dim: dimension });
      } else {
        const displayName = negNames[dimension] || name;
        negativeEmotions.push({ name: displayName, label, value: -value, dim: dimension });
      }
    }

    // 生成场景叙事（实验一 C 组最佳方案）
    let scene = '';
    const hasAmbivalence = positiveEmotions.length > 0 && negativeEmotions.length > 0
      && positiveEmotions[0].value > 0.25 && negativeEmotions[0].value > 0.25;

    if (hasAmbivalence) {
      // 矛盾情绪：用对比隐喻
      const pos = positiveEmotions[0];
      const neg = negativeEmotions[0];
      scene = `你的内心处于矛盾之中——${pos.label}${pos.name}的暖意(${pos.value.toFixed(2)})与${neg.label}${neg.name}的阴影(-${neg.value.toFixed(2)})在拉锯`;
      if (positiveEmotions.length > 1) {
        scene += `，同时还夹杂着${positiveEmotions.slice(1, 3).map(e => `${e.label}${e.name}`).join('、')}`;
      }
    } else if (valence > 0.2) {
      // 偏正面
      const top = positiveEmotions[0] || { name: '平静', label: '' };
      scene = `${top.label}${top.name}的情绪主导着你的心境`;
      if (negativeEmotions.length > 0 && negativeEmotions[0].value > 0.15) {
        scene += `，但深处有一丝${negativeEmotions[0].label}${negativeEmotions[0].name}`;
      }
    } else if (valence < -0.2) {
      // 偏负面
      const top = negativeEmotions[0] || { name: '不安', label: '' };
      scene = `${top.label}${top.name}的情绪笼罩着你`;
      if (positiveEmotions.length > 0 && positiveEmotions[0].value > 0.15) {
        scene += `，心底还残留着一些${positiveEmotions[0].label}${positiveEmotions[0].name}`;
      }
    } else {
      // 中性
      const all = [...positiveEmotions, ...negativeEmotions].sort((a, b) => b.value - a.value);
      if (all.length > 0) {
        scene = `你的内心平静而微妙，${all[0].label}${all[0].name}`;
        if (all.length > 1) scene += `与${all[1].label}${all[1].name}并存`;
      } else {
        scene = '你的内心比较平静';
      }
    }

    // 附加关键指标
    const stressDesc = this.stress > 5 ? '压力很大' : this.stress > 3 ? '有点压力' : '';
    const energyDesc = arousal > 0.7 ? '精力充沛' : arousal > 0.4 ? '' : '有些疲倦';
    const overallMood = this.getMoodString();

    // 关键情绪维度数值标注（实验遗留：Top-N可能遗漏重要维度如joy）
    // 始终标注 joy 和 sadness（心理学中最基础的效价维度）
    const keyDims = [];
    const joyVal = this.current.joy || 0;
    const sadnessVal = this.current.sadness || 0;
    if (Math.abs(joyVal) > 0.15) keyDims.push(`开心=${joyVal.toFixed(2)}`);
    if (Math.abs(sadnessVal) > 0.15) keyDims.push(`难过=${sadnessVal.toFixed(2)}`);
    // 补充 Top-1 中未被 joy/sadness 覆盖的最高值
    if (dominant.length > 0) {
      const topDim = dominant[0].dimension;
      if (topDim !== 'joy' && topDim !== 'sadness' && Math.abs(dominant[0].value) > 0.3) {
        keyDims.push(`${emotionNames[topDim] || topDim}=${dominant[0].value.toFixed(2)}`);
      }
    }

    let suffix = '';
    if (keyDims.length > 0) suffix += `。关键维度：${keyDims.join(', ')}`;
    if (stressDesc || energyDesc) suffix += `。${[stressDesc, energyDesc].filter(Boolean).join('，')}`;

    return `${scene}（效价=${valence.toFixed(2)}, 唤醒=${arousal.toFixed(2)}）${suffix}。整体心境：${overallMood}。`;
  }

  // ═══════════════════════════════════════════
  // 序列化
  // ═══════════════════════════════════════════

  /**
   * 获取中期心境描述（用于调试/提示注入）
   * @returns {string}
   */
  getMoodString() {
    // 计算 mood 的效价
    const positive = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm', 'hope'];
    const negative = ['sadness', 'anger', 'fear', 'loneliness', 'nervousness', 'frustration', 'boredom'];

    let sum = 0;
    let count = 0;
    for (const dim of positive) {
      if (this.mood[dim] !== undefined) { sum += this.mood[dim]; count++; }
    }
    for (const dim of negative) {
      if (this.mood[dim] !== undefined) { sum -= this.mood[dim]; count++; }
    }
    const moodValence = count > 0 ? sum / count : 0;

    if (moodValence > 0.2) return '心情不错';
    if (moodValence > 0.05) return '心情还行';
    if (moodValence > -0.1) return '心情一般';
    if (moodValence > -0.2) return '有点低落';
    return '心情不太好';
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
   * 从 toJSON 输出反序列化为 EmotionVector 实例。
   * 恢复路径中应传入真实 Personality 与 RNG；省略时用 baseline 构造桩人格，
   * 仅供 round-trip / 测试场景使用（toJSON 不序列化人格派生字段）。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [personality] - Personality 实例
   * @param {Object} [rng] - RNG 实例
   * @returns {EmotionVector}
   */
  static fromJSON(json, personality = null, rng = null, emotionConfig = null, contagionConfig = null) {
    const p = personality || { emotionBaseline: (json && json.baseline) || {}, behavior: {} };
    return new EmotionVector(p, json, rng, emotionConfig, contagionConfig);
  }

  static mergeConfig(emotionConfig = null) {
    return mergeEmotionConfig(emotionConfig);
  }
}

module.exports = EmotionVector;
