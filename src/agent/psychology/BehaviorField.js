/**
 * BehaviorField — 连续行为场（核心模块）
 *
 * 将离散的 42-状态 StateMachine 替换为 4 维连续行为空间中的动力学系统。
 *
 * 行为空间 B ∈ [0,1]^4：
 *   B[0] = activity       0=休息/睡觉  1=工作/运动
 *   B[1] = sociality      0=独处/发呆  1=聊天/社交
 *   B[2] = focus          0=漫无目的   1=高度专注
 *   B[3] = expressiveness  0=封闭退缩  1=外向表达
 *
 * 动力学方程（欠阻尼朗之万动力学）：
 *   v(t+dt) = v(t)·(1 - γ·dt) - ∇U(B(t))·dt + σ·√dt·ξ
 *   B(t+dt) = B(t) + v(t+dt)·dt
 *
 * 势能函数：
 *   U(B) = Σ_k w_k(t) · ||B - B*_k||²
 *   其中 k ∈ {needs, emotion, schedule, intrinsic, habit}
 *
 * 人格调制：
 *   γ（摩擦）: 高神经质 → 高摩擦（行为惯性大，难改变）
 *   σ（噪声）: 高外向性 → 高噪声（行为更不可预测）
 *   各驱力权重: 由人格特质调制
 *
 * 参考：
 *   - Langevin dynamics: Lemieux et al. (2022) "Sampling from a log-concave distribution"
 *   - Behavioral dynamics: Warren (2006) "The dynamics of perception and action"
 *   - Potential fields: Khatib (1986) "Real-time obstacle avoidance for manipulators"
 */

const {
  BehaviorLabeler, DIM_ACTIVITY, DIM_SOCIALITY, DIM_FOCUS, DIM_EXPRESSIVENESS,
  DIMS, dist, getTimePenalty,
} = require('./BehaviorLabeler');

const { RNG } = require('../../shared/rng');

function safeCounter(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

// ═══════════════════════════════════════════
// 默认动力学参数
// ═══════════════════════════════════════════
const DEFAULTS = {
  // 摩擦系数 γ：控制行为惯性
  // 高 γ → 球快速停下来（行为惯性小，容易改变方向）
  // 低 γ → 球保持动量（行为惯性大，"忍着饿继续聊天"）
  gamma: 2.5,

  // 噪声幅度 σ：控制行为随机性
  sigma: 0.15,

  // 时间步长 dt（模拟中的一个 tick ≈ 5 分钟）
  dt: 0.1,

  // 边界反射系数（碰撞边界时速度衰减）
  boundaryReflection: 0.3,

  // 边界软势能强度（靠近边界时的排斥力）
  boundaryStrength: 2.0,

  // 驱力权重基线
  // 设计原则：各梯度源的典型输出量级应在同一数量级（~0.3-0.8），
  // 使任何单一来源都不至于完全压倒其他来源
  weights: {
    needs: 3.0,       // 紧急需求权重最高（确保饥饿时能压过其他梯度源）
    emotion: 2.0,     // 情绪驱力（maxDrive ~0.3, × 0.25偏移 = ~0.15，需要更高权重补偿）
    schedule: 1.8,    // 日程（距离 ~0.5, 直接乘权重，输出 ~0.9 — 最强驱力）
    intrinsic: 1.5,   // 好奇心（curiosity-0.3 ~0.3, × 0.3 = ~0.09，需要更高权重补偿）
    habit: 0.5,       // 习惯（弱弹性力，防止行为过于随机）
  },
};

function mergeBehaviorConfig(config = {}) {
  return {
    ...DEFAULTS,
    ...(config || {}),
    weights: {
      ...DEFAULTS.weights,
      ...(config?.weights || {}),
    },
  };
}

// ═══════════════════════════════════════════
// 每种驱力在 4D 空间中的"最优位置"
// 当某种驱力激活时，它把 B 向这些方向拉
// ═══════════════════════════════════════════

/** 需求满足的最优行为位置 */
/**
 * Need Satisfaction Targets
 * 
 * When a need is being satisfied (e.g., eating), this target defines
 * the optimal behavior position.
 * 
 * Format: [activity, sociality, focus, expressiveness]
 */
const NEED_SATISFACTION_TARGETS = {
  hunger:      [0.35, 0.55, 0.08, 0.45],  // 吃饭：中活跃, 中高社交(餐厅有人), 极低专注, 中表达
  energy:      [0.08, 0.04, 0.02, 0.03],  // 休息：全面降低
  social:      [0.35, 0.85, 0.25, 0.80],  // 社交：高社交, 高表达
  comfort:     [0.15, 0.15, 0.20, 0.12],  // 舒适：低活跃, 安静
  stimulation: [0.45, 0.35, 0.40, 0.40],  // 刺激：中活跃, 寻求兴趣
};

/** 情绪驱力映射：approach/avoid/agentic → 4D 目标偏移 */
const EMOTION_TARGETS = {
  approach: [0.20, 0.30, 0.05, 0.25],  // 趋近：增加社交和表达
  avoid:    [-0.15, -0.25, 0.10, -0.20], // 回避：退缩, 减少社交
  agentic:  [0.15, -0.10, -0.15, 0.20], // 代理（愤怒）：增加活跃和表达, 降低专注
};

/** 时间段的默认行为倾向（作为势能吸引子） */
const TIME_TARGETS = {
  sleep:      [0.02, 0.00, 0.02, 0.00],   // 23-6: 睡觉
  morning:    [0.45, 0.20, 0.30, 0.25],   // 6-9: 起床准备
  active:     [0.60, 0.25, 0.65, 0.25],   // 9-12, 14-17: 工作
  midday:     [0.35, 0.50, 0.20, 0.45],   // 12-14: 午饭/社交
  evening:    [0.30, 0.30, 0.25, 0.30],   // 17-21: 傍晚活动
  lateNight:  [0.10, 0.08, 0.12, 0.08],   // 21-23: 深夜放松
};

class BehaviorField {
  /**
   * @param {Object} personality - Personality 实例
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [config] - 覆盖默认参数
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [rng] - RNG 实例（可选）
  */
  constructor(personality, savedState = null, config = {}, domain = null, rng = null) {
    this.cfg = mergeBehaviorConfig(config);
    if (!domain) throw new Error('BehaviorField requires a domain config');
    this.domain = domain;
    this._rng = rng || new RNG(0);
    this._labeler = BehaviorLabeler.create(this.domain);
    this._stateCenters = this.domain.stateCenters;

    // 人格调制参数
    const ocean = personality ? personality.ocean : { neuroticism: 0.5, extraversion: 0.5, openness: 0.5, conscientiousness: 0.5, agreeableness: 0.5 };

    // γ（摩擦）：高神经质 → 高摩擦（行为难以改变）
    // 范围放大：neuroticism 0→γ×0.5, neuroticism 1→γ×1.5（3倍差异）
    this.gamma = this.cfg.gamma * (0.5 + ocean.neuroticism * 1.0);

    // σ（噪声）：高外向性 → 高噪声（行为更随机/探索性）
    // 范围放大：extraversion 0→σ×0.3, extraversion 1→σ×1.7（5.7倍差异）
    this.sigma = this.cfg.sigma * (0.3 + ocean.extraversion * 1.4);

    // 人格对驱力权重的调制（放大差异，让不同人格的行为轨迹可区分）
    this._weightModifiers = {
      needs:      0.8 + ocean.neuroticism * 0.6,           // N=0→0.8, N=1→1.4
      emotion:    0.3 + ocean.openness * 0.8 + ocean.extraversion * 0.9, // 外向者对情绪梯度响应3×更强
      schedule:   0.3 + ocean.conscientiousness * 1.4,     // C=0→0.3, C=1→1.7（5.7×差异）
      intrinsic:  0.2 + ocean.openness * 1.6,              // O=0→0.2, O=1→1.8（9×差异）
      habit:      0.3 + ocean.conscientiousness * 0.8,     // C=0→0.3, C=1→1.1
    };

    // Domain-driven fallback label
    const fallbackLabel = this.domain.fallback.defaultState
      || Object.keys(this.domain.states)[0]
      || 'idle';

    if (savedState) {
      this.B = savedState.B.map(v => Number.isFinite(v) ? v : 0.15);
      this.velocity = savedState.velocity.map(v => Number.isFinite(v) ? v : 0);
      this._prevB = savedState._prevB ? [...savedState._prevB] : [...this.B];
      // Validate saved _lastLabel exists in current domain states
      this._lastLabel = (savedState._lastLabel && this.domain.states[savedState._lastLabel])
        ? savedState._lastLabel
        : fallbackLabel;
      this._tickCount = safeCounter(savedState._tickCount);
      this._lastLabelConfidence = savedState._lastLabelConfidence ?? 0;

      // R18 AUDIT-001 fix: restore attractor state from savedState.
      // Previously only restored via fromJSON(), but restoreSubsystems
      // uses the constructor path, causing attractor loss on save/restore.
      this._attractor = (savedState._attractor && savedState._attractor.target)
        ? { target: [...savedState._attractor.target], strength: savedState._attractor.strength }
        : null;
      this._attractorTicksLeft = safeCounter(savedState._attractorTicksLeft);
    } else {
      // 初始位置：休息状态附近
      this.B = [0.15, 0.08, 0.15, 0.08];
      this.velocity = [0, 0, 0, 0];
      this._prevB = [...this.B];
      this._lastLabel = fallbackLabel;
      this._tickCount = 0;
      this._lastLabelConfidence = 0;

      this._attractor = null;
      this._attractorTicksLeft = 0;
    }

    // 缓存
    this._lastGradient = [0, 0, 0, 0];
    this._lastSignals = null;

    // 地点意义影响（延迟初始化）
    this._locationMeaningInfluence = null;
    this._currentRegion = null;

    // 未来行为倾向（延迟初始化）
    this._futureTendency = null;

    // P1 fix: 时间日程从 domain/config 读取；非法配置回退默认行为。
    this._timeSchedule = _normalizeTimeSchedule(this.domain && this.domain.timeSchedule);

    // attractor 状态已在 savedState 分支中恢复，此处不再无条件覆写
  }

  /**
   * 设置地点意义影响器
   * @param {Object} influence - LocationMeaningInfluence 实例
   */
  setLocationMeaningInfluence(influence) {
    this._locationMeaningInfluence = influence;
  }

  /**
   * 更新当前区域（由 Agent 在位置变化时调用）
   * @param {string} region
   */
  setCurrentRegion(region) {
    this._currentRegion = region;
  }

  /**
   * 设置未来行为倾向跟踪器
   * @param {Object} tracker - FutureTendencyTracker 实例
   */
  setFutureTendency(tracker) {
    this._futureTendency = tracker;
  }

  /**
   * R13 C2 fix: 设置外部吸引子
   *
   * ScheduleHandler 等外部模块通过此接口在行为场中施加一个临时吸引子，
   * 而非直接设置 B/velocity（那会绕过 Langevin 动力学，导致惯性断裂）。
   *
   * 吸引子作为势能项 U_attractor = strength * ||B - target||² 融入梯度计算，
   * 在 duration 个 tick 后自动失效。
   *
   * @param {number[]} target - 4D 目标行为位置 [activity, sociality, focus, expressiveness]
   * @param {number} strength - 吸引力强度（推荐 5-15，与 schedule 权重 ~1.8 的量级匹配）
   * @param {number} duration - 持续 tick 数（推荐 3-8，之后自然衰减）
   */
  setAttractor(target, strength, duration) {
    this._attractor = {
      target: [...target],
      strength: Number.isFinite(strength) ? strength : 10.0,
    };
    this._attractorTicksLeft = Number.isFinite(duration) ? Math.round(duration) : 5;
  }

  /**
   * 清除当前吸引子（可选，吸引子也会随 duration 自然失效）
   */
  clearAttractor() {
    this._attractor = null;
    this._attractorTicksLeft = 0;
  }

  // ═══════════════════════════════════════════
  // 主入口
  // ═══════════════════════════════════════════

  /**
   * 推进行为场一个时间步
   *
   * @param {Object} signals - 来自各子系统的信号（见 README 信号格式）
   * @returns {{ B, label, labelSecondary, labelConfidence, gradient, velocity }}
   */
  tick(signals) {
    this._tickCount++;
    this._lastSignals = signals;

    // 1. 计算总势能梯度
    const gradient = this._computeGradient(signals);
    this._lastGradient = [...gradient];

    // 2. 朗之万动力学更新
    this._updateDynamics(gradient);

    // 3. 边界处理
    this._enforceBoundary();

    // 4. 语义标签投影（使用 domain-aware labeler）
    const projection = this._labeler.project(this.B, { hour: signals.environment?.hour });

    // 缓存
    this._prevB = [...this.B];
    this._lastLabel = projection.primary;

    return {
      B: [...this.B],
      label: projection.primary,
      labelSecondary: projection.secondary,
      labelConfidence: projection.confidence,
      gradient: [...gradient],
      velocity: [...this.velocity],
    };
  }

  // ═══════════════════════════════════════════
  // 势能梯度计算
  // ═══════════════════════════════════════════

  /**
   * 计算总势能梯度 ∇U(B)
   *
   * 势能 U(B) = Σ_k w_k · ||B - B*_k||²
   * 梯度 ∇U = Σ_k 2·w_k · (B - B*_k)
   *
   * 正梯度 = 势能增加方向（远离目标）
   * 负梯度 = 势能减少方向（靠近目标）
   *
   * 动力学方程中 v += -∇U·dt，因此梯度指向目标时 B 会被吸引过去
   * @private
   */
  _computeGradient(signals) {
    const grad = [0, 0, 0, 0];
    const w = this.cfg.weights;

    // ── 1. 需求梯度 ──
    // 紧急需求放大：当任何需求极度匮乏（<0.1）时，需求权重翻倍
    // 这确保"快饿死了"能压过日程/时间/习惯等其他梯度源
    if (signals.needs) {
      let needsWeight = w.needs * this._weightModifiers.needs;
      // R137: filter NaN values before Math.min — corrupted need signals
      // could contain NaN, making Math.min(NaN, ...) return NaN and silently
      // skipping the emergency weight amplification.
      const needValues = Object.values(signals.needs).filter(v => Number.isFinite(v));
      if (needValues.length > 0) {
        const minNeed = Math.min(...needValues);
        if (minNeed < 0.1) {
          needsWeight *= 1 + (0.1 - minNeed) * 10;
        }
      }
      this._addNeedsGradient(grad, signals.needs, needsWeight);
    }

    // ── 2. 情绪梯度 ──
    if (signals.emotion) {
      this._addEmotionGradient(grad, signals.emotion, w.emotion * this._weightModifiers.emotion);
    }

    // ── 3. 日程梯度 ──
    if (signals.schedule) {
      this._addScheduleGradient(grad, signals.schedule, w.schedule * this._weightModifiers.schedule);
    }

    // ── 4. 自发动机梯度 ──
    if (signals.intrinsic) {
      this._addIntrinsicGradient(grad, signals.intrinsic, w.intrinsic * this._weightModifiers.intrinsic);
    }

    // ── 5. 习惯梯度 ──
    this._addHabitGradient(grad, w.habit * this._weightModifiers.habit);

    // ── 5.1 外部吸引子梯度（R13 C2 fix）──
    // ScheduleHandler 通过 setAttractor() 注入的临时吸引子，
    // 融入 Langevin 动力学而非直接设置 B/velocity
    if (this._attractor && this._attractorTicksLeft > 0) {
      const { target, strength } = this._attractor;
      for (let d = 0; d < DIMS; d++) {
        // 势能 U = w * ||B - target||²
        // 梯度 ∇U = 2w * (B - target)，但为与其他梯度源
        // (Needs/Schedule/Habit/Time 均使用 w 而非 2w) 保持一致，
        // 统一使用 w * (B - target)。AGENTS.md 中 `grad[d] += weight * ...` 是
        // 正确范式。吸引力仍强于其他源 (strength=1 vs weight=0.18)，
        // 但比例从 11x 降至 5.5x。
        grad[d] += strength * (this.B[d] - target[d]);
      }
      this._attractorTicksLeft--;
      if (this._attractorTicksLeft <= 0) {
        this._attractor = null;
      }
    }

    // ── 5.5 地点意义梯度 ──
    if (this._locationMeaningInfluence && this._currentRegion) {
      const locationGrad = this._locationMeaningInfluence.computeGradient(
        this._currentRegion, this.B
      );
      for (let d = 0; d < DIMS; d++) {
        grad[d] += locationGrad[d];
      }
    }

    // ── 5.6 未来行为倾向梯度 ──
    if (this._futureTendency && this._currentRegion) {
      const tendencyGrad = this._futureTendency.getTendencyGradient(this._currentRegion);
      for (let d = 0; d < DIMS; d++) {
        grad[d] += tendencyGrad[d];
      }
    }

    // ── 6. 时间约束 ──
    if (signals.environment?.hour !== undefined) {
      this._addTimeGradient(grad, signals.environment.hour);
    }

    // ── 7. 边界软势能 ──
    this._addBoundaryGradient(grad);

    // ── 8. 各向异性梯度裁剪 ──
    // 不同维度允许不同的最大变化速率：
    //   focus (1.2): 注意力可以快速转移（放下书本只需一念）
    //   sociality (0.7): 社交状态变化中等（需要走到餐厅）
    //   expressiveness (0.7): 表达方式变化中等
    //   activity (0.5): 身体活动变化最慢（需要实际移动）
    const dimLimits = [0.8, 0.7, 1.2, 0.7]; // [activity, sociality, focus, expressiveness]
    // 找到最小的缩放因子（保持方向，但按最紧的维度约束）
    let minScale = 1.0;
    for (let d = 0; d < DIMS; d++) {
      const absGrad = Math.abs(grad[d]);
      if (absGrad > dimLimits[d]) {
        minScale = Math.min(minScale, dimLimits[d] / absGrad);
      }
    }
    if (minScale < 1.0) {
      for (let d = 0; d < DIMS; d++) grad[d] *= minScale;
    }

    return grad;
  }

  /**
   * 需求梯度：匮乏需求把 B 拉向满足方向
   * @private
   */
  _addNeedsGradient(grad, needs, weight) {
    for (const [need, target] of Object.entries(NEED_SATISFACTION_TARGETS)) {
      const value = needs[need];
      if (value === undefined) continue;
      if (!Number.isFinite(value)) continue; // R157: guard against NaN/Infinity

      // 需求越匮乏，拉力越强（sigmoid 映射）
      // 更陡的 sigmoid (k=8)：极端饥饿(value≈0)时 urgency≈0.97
      const urgency = 1 / (1 + Math.exp(8 * (value - 0.25)));

      if (urgency < 0.05) continue;

      for (let d = 0; d < DIMS; d++) {
        // ∇U = 2·w·(B - target)：梯度指向远离目标的方向
        // 动力学 v += -∇U·dt 将 B 拉向目标
        grad[d] += weight * urgency * (this.B[d] - target[d]);
      }
    }
  }

  /**
   * 情绪梯度：情绪状态影响行为倾向
   * @private
   */
  _addEmotionGradient(grad, emotion, weight) {
    const { approachDrive = 0, avoidDrive = 0, agenticDrive = 0, arousal = 0.5 } = emotion;

    // 主导驱力决定方向
    const maxDrive = Math.max(approachDrive, avoidDrive, agenticDrive);
    if (maxDrive < 0.1) return;

    const effectiveWeight = weight * maxDrive;

    // R9 fix: compute emotion gradient into a separate array first, so that
    // arousal amplification only affects the emotion contribution — not the
    // needs gradient that was already added to `grad`.
    const emotionGrad = [0, 0, 0, 0];

    if (approachDrive >= avoidDrive && approachDrive >= agenticDrive) {
      // 趋近：增加社交和表达（梯度为负值，通过 -∇U·dt 增加维度）
      for (let d = 0; d < DIMS; d++) {
        emotionGrad[d] = -effectiveWeight * EMOTION_TARGETS.approach[d];
      }
    } else if (avoidDrive >= agenticDrive) {
      // 回避：退缩（梯度为正值，通过 -∇U·dt 减少维度）
      for (let d = 0; d < DIMS; d++) {
        emotionGrad[d] = -effectiveWeight * EMOTION_TARGETS.avoid[d];
      }
    } else {
      // 代理（愤怒/挫败）
      for (let d = 0; d < DIMS; d++) {
        emotionGrad[d] = -effectiveWeight * EMOTION_TARGETS.agentic[d];
      }
    }

    // 高唤醒度放大情绪梯度（仅情绪部分，不影响需求梯度）
    if (arousal > 0.6) {
      const amp = 1 + (arousal - 0.6) * 1.5;
      for (let d = 0; d < DIMS; d++) {
        emotionGrad[d] *= amp;
      }
    }

    // Add computed emotion gradient to accumulated gradient
    for (let d = 0; d < DIMS; d++) {
      grad[d] += emotionGrad[d];
    }
  }

  /**
   * 日程梯度：当前日程把 B 拉向目标行为
   * @private
   */
  _addScheduleGradient(grad, schedule, weight) {
    if (!schedule.inSchedule || !schedule.targetActivity) return;

    const target = this._activityToTarget(schedule.targetActivity);
    if (!target) return;

    for (let d = 0; d < DIMS; d++) {
      grad[d] += weight * (this.B[d] - target[d]);
    }
  }

  /**
   * 自发动机梯度：好奇心和探索目标
   * @private
   */
  _addIntrinsicGradient(grad, intrinsic, weight) {
    const { curiosity = 0 } = intrinsic;
    if (curiosity < 0.3) return;

    // 好奇心高 → 增加 activity 和 expressiveness，适度增加 sociality
    // 梯度为负值（势能下降方向），通过 -∇U·dt 增加这些维度
    const curiosityEffect = (curiosity - 0.3) * weight;
    grad[DIM_ACTIVITY] -= curiosityEffect * 0.3;
    grad[DIM_SOCIALITY] -= curiosityEffect * 0.15;
    grad[DIM_EXPRESSIVENESS] -= curiosityEffect * 0.2;
  }

  /**
   * 习惯梯度：惯性拉回上一次的行为位置
   * @private
   */
  _addHabitGradient(grad, weight) {
    // 拉回上一 tick 的位置（弱弹性力）
    // ∇U = 2w(B - prevB)，-∇U 指向 prevB
    for (let d = 0; d < DIMS; d++) {
      grad[d] += weight * (this.B[d] - this._prevB[d]) * 0.3;
    }
  }

  /**
   * 时间梯度：时间段对行为的软约束
   * @private
   */
  _addTimeGradient(grad, hour) {
    const target = this._getTimeTarget(hour);
    if (!target) return;

    // 时间引力（软约束，不应压过紧急需求）
    const timeWeight = 0.4;
    for (let d = 0; d < DIMS; d++) {
      grad[d] += timeWeight * (this.B[d] - target[d]);
    }
  }

  /**
   * 边界软势能：靠近 [0,1] 边界时增加向内排斥力
   * 形式：梯形势能（线性增长），比 log 势能更稳定
   * @private
   */
  _addBoundaryGradient(grad) {
    const margin = 0.08; // 边界缓冲区
    const strength = this.cfg.boundaryStrength;

    for (let d = 0; d < DIMS; d++) {
      if (this.B[d] < margin) {
        // 推向中心：梯度为负值（通过 -∇U·dt 增加 B）
        grad[d] -= strength * (margin - this.B[d]) / margin;
      } else if (this.B[d] > 1 - margin) {
        // 推向中心：梯度为正值（通过 -∇U·dt 减少 B）
        grad[d] += strength * (this.B[d] - (1 - margin)) / margin;
      }
    }
  }

  // ═══════════════════════════════════════════
  // 动力学更新（半隐式欧拉-丸山）
  // ═══════════════════════════════════════════

  /**
   * 欠阻尼朗之万动力学更新
   *
   * v(t+dt) = v(t)·(1 - γ·dt) - ∇U·dt + σ·√dt·ξ
   * B(t+dt) = B(t) + v(t+dt)·dt
   *
   * 半隐式：速度更新用旧位置的梯度，位置更新用新速度
   * （比全显式更稳定，比全隐式更简单）
   * @private
   */
  _updateDynamics(gradient) {
    const dt = this.cfg.dt;
    const sqrtDt = Math.sqrt(dt);
    const dampingFactor = Math.max(0, 1 - this.gamma * dt);

    for (let d = 0; d < DIMS; d++) {
      // 高斯白噪声
      const noise = this.sigma * sqrtDt * _gaussianRandom(this._rng);

      // 速度更新：阻尼 + 势能梯度（取负号：沿势能下降方向）+ 噪声
      this.velocity[d] = this.velocity[d] * dampingFactor
        - gradient[d] * dt
        + noise;

      // 位置更新
      this.B[d] = this.B[d] + this.velocity[d] * dt;
    }
  }

  /**
   * 边界处理：clamp + 速度反射 + NaN guard
   * @private
   */
  _enforceBoundary() {
    const reflect = this.cfg.boundaryReflection;

    for (let d = 0; d < DIMS; d++) {
      // R6 fix: NaN/Infinity guard. If B or velocity becomes NaN (e.g., from
      // gradient overflow), reset to safe defaults instead of propagating.
      if (!Number.isFinite(this.B[d])) {
        this.B[d] = 0.5;
        this.velocity[d] = 0;
        continue;
      }
      if (!Number.isFinite(this.velocity[d])) {
        this.velocity[d] = 0;
      }

      if (this.B[d] < 0) {
        this.B[d] = 0;
        this.velocity[d] = Math.abs(this.velocity[d]) * reflect;
      } else if (this.B[d] > 1) {
        this.B[d] = 1;
        this.velocity[d] = -Math.abs(this.velocity[d]) * reflect;
      }
    }
  }

  // ═══════════════════════════════════════════
  // 查询接口
  // ═══════════════════════════════════════════

  /** 获取当前行为向量 */
  get current() { return [...this.B]; }

  /** 获取当前标签 */
  get label() { return this._lastLabel; }

  /** 获取速度（行为变化趋势） */
  get speed() {
    let s = 0;
    for (let d = 0; d < DIMS; d++) s += this.velocity[d] ** 2;
    return Math.sqrt(s);
  }

  /**
   * 获取行为状态的自然语言描述
   * @param {Object} [options]
   * @returns {string}
   */
  describe(options = {}) {
    return this._labeler.describe(this.B, options);
  }

  /**
   * 活动名 → 4D 目标位置（domain-aware）
   * @private
   */
  _activityToTarget(activity) {
    const centers = this._stateCenters;
    if (centers[activity]) return centers[activity];

    // 从 domain 取 activityTargets（如果有）
    const activityTargets = this.domain.activityTargets || {};
    if (activityTargets[activity]) {
      const targetState = activityTargets[activity];
      if (centers[targetState]) return centers[targetState];
    }

    return null;
  }

  /**
   * 获取当前状态的详细快照（调试用）
   * @returns {Object}
   */
  snapshot() {
    return {
      B: [...this.B],
      velocity: [...this.velocity],
      speed: this.speed,
      label: this._lastLabel,
      gradient: [...this._lastGradient],
      gamma: this.gamma,
      sigma: this.sigma,
      tickCount: this._tickCount,
    };
  }

  // ═══════════════════════════════════════════
  // 序列化
  // ═══════════════════════════════════════════

  toJSON() {
    return {
      B: [...this.B],
      velocity: [...this.velocity],
      _prevB: [...this._prevB],
      _lastLabel: this._lastLabel,
      _lastLabelConfidence: this._lastLabelConfidence,
      _tickCount: this._tickCount,
      // R13 C2 fix: 持久化吸引子状态
      _attractor: this._attractor ? { target: [...this._attractor.target], strength: this._attractor.strength } : null,
      _attractorTicksLeft: this._attractorTicksLeft,
    };
  }

  static fromJSON(data, personality, domain, config = {}) {
    if (!domain) throw new Error('BehaviorField.fromJSON requires a domain config');
    const bf = new BehaviorField(personality, data, config, domain);
    // R13 C2 fix: 恢复吸引子状态
    if (data._attractor) {
      bf._attractor = { target: [...data._attractor.target], strength: data._attractor.strength };
      bf._attractorTicksLeft = safeCounter(data._attractorTicksLeft);
    }
    return bf;
  }

  /**
   * 时间段 → 目标行为位置（平滑插值版）
   * @param {number} hour - 当前小时 (0-24)
   * @returns {number[]|null} - 4D 目标位置
   * @private
   */
  _getTimeTarget(hour) {
    // 输入守卫：防止 NaN 从损坏的环境信号传播（如 signals.environment?.hour 缺失）
    if (!Number.isFinite(hour)) return TIME_TARGETS.sleep;
    const h = ((hour % 24) + 24) % 24;
    const schedule = this._timeSchedule;

    let lo = schedule[0], hi = schedule[1];
    for (let i = 0; i < schedule.length - 1; i++) {
      if (h >= schedule[i].hour && h < schedule[i + 1].hour) {
        lo = schedule[i];
        hi = schedule[i + 1];
        break;
      }
    }

    const loTarget = TIME_TARGETS[lo.target];
    const hiTarget = TIME_TARGETS[hi.target];
    if (!loTarget || !hiTarget) return TIME_TARGETS.sleep;

    const span = hi.hour - lo.hour;
    const t = span > 0 ? (h - lo.hour) / span : 0;
    const blend = Math.max(0, Math.min(1, t));

    const result = new Array(DIMS);
    for (let d = 0; d < DIMS; d++) {
      result[d] = loTarget[d] * (1 - blend) + hiTarget[d] * blend;
    }
    return result;
  }
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

/** Box-Muller 高斯随机数 */
function _gaussianRandom(rng = null) {
  // 模拟路径由 BehaviorField._rng（AndyWorld 注入的 seeded 流）传入；构造期 RNG(0) 兜底保证非空
  const rand = rng.next.bind(rng);
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * 默认时间段 → 目标行为标签映射 (9-to-5 工作制)。
 * domain 可通过 `timeSchedule` 覆盖 (shift-based, night-owl 等)。
 */
const DEFAULT_TIME_SCHEDULE = [
  { hour: 0,  target: 'sleep' },
  { hour: 6,  target: 'sleep' },
  { hour: 7,  target: 'morning' },
  { hour: 9,  target: 'active' },
  { hour: 12, target: 'midday' },    // 12-13:30 午饭窗口
  { hour: 13.5, target: 'active' },  // 13:30 回到学习/工作
  { hour: 17, target: 'evening' },
  { hour: 18, target: 'midday' },    // 18-19:30 晚饭窗口
  { hour: 19.5, target: 'evening' },
  { hour: 21, target: 'lateNight' },
  { hour: 23, target: 'sleep' },
  { hour: 24, target: 'sleep' },
];

function _normalizeTimeSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length < 2) {
    return DEFAULT_TIME_SCHEDULE;
  }

  let previousHour = -Infinity;
  for (const entry of schedule) {
    if (!entry || !Number.isFinite(entry.hour) || !TIME_TARGETS[entry.target]) {
      return DEFAULT_TIME_SCHEDULE;
    }
    if (entry.hour < previousHour) {
      return DEFAULT_TIME_SCHEDULE;
    }
    previousHour = entry.hour;
  }

  return schedule;
}

module.exports = {
  BehaviorField,
  DEFAULTS,
  mergeBehaviorConfig,
  NEED_SATISFACTION_TARGETS,
  EMOTION_TARGETS,
  TIME_TARGETS,
};
