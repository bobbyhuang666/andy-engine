/**
 * BehaviorField — 连续行为场（核心模块）
 *
 * 将离散的 42-状态 StateMachine 替换为 4 维连续行为空间中的动力学系统。
 *
 * 行为空间 B ∈ [0,1]^4：
 *   B[0] = activity       0=休息/睡觉  1=上课/工作/运动
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

// ═══════════════════════════════════════════
// 默认动力学参数
// ═══════════════════════════════════════════
const DEFAULTS = {
  // 摩擦系数 γ：控制行为惯性
  // 高 γ → 球快速停下来（行为惯性小，容易改变方向）
  // 低 γ → 球保持动量（行为惯性大，"忍着饿继续聊天"）
  gamma: 4.0,

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
    needs: 2.5,       // 紧急需求权重最高（urgency sigmoid 输出 ~0.7, × 0.3距离 = ~0.5）
    emotion: 2.0,     // 情绪驱力（maxDrive ~0.3, × 0.25偏移 = ~0.15，需要更高权重补偿）
    schedule: 1.8,    // 日程（距离 ~0.5, 直接乘权重，输出 ~0.9 — 最强驱力）
    intrinsic: 1.5,   // 好奇心（curiosity-0.3 ~0.3, × 0.3 = ~0.09，需要更高权重补偿）
    habit: 0.5,       // 习惯（弱弹性力，防止行为过于随机）
  },
};

// ═══════════════════════════════════════════
// 每种驱力在 4D 空间中的"最优位置"
// 当某种驱力激活时，它把 B 向这些方向拉
// ═══════════════════════════════════════════

/** 需求满足的最优行为位置 */
const NEED_TARGETS = {
  hunger:      [0.35, 0.45, 0.20, 0.40],  // 吃饭：中活跃, 中社交, 低专注
  energy:      [0.08, 0.04, 0.05, 0.03],  // 休息：全面降低
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
  active:     [0.60, 0.25, 0.65, 0.25],   // 9-12, 14-17: 上课/工作
  midday:     [0.35, 0.50, 0.20, 0.45],   // 12-14: 午饭/社交
  evening:    [0.30, 0.30, 0.25, 0.30],   // 17-21: 傍晚活动
  lateNight:  [0.10, 0.08, 0.12, 0.08],   // 21-23: 深夜放松
};

class BehaviorField {
  /**
   * @param {Object} personality - Personality 实例
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [config] - 覆盖默认参数
   */
  constructor(personality, savedState = null, config = {}) {
    this.cfg = { ...DEFAULTS, ...config };

    // 人格调制参数
    const ocean = personality ? personality.ocean : { neuroticism: 0.5, extraversion: 0.5, openness: 0.5, conscientiousness: 0.5, agreeableness: 0.5 };

    // γ（摩擦）：高神经质 → 高摩擦（行为难以改变）
    // 范围放大：neuroticism 0→γ×0.5, neuroticism 1→γ×1.5（3倍差异）
    this.gamma = this.cfg.gamma * (0.5 + ocean.neuroticism * 1.0);

    // σ（噪声）：高外向性 → 高噪声（行为更随机/探索性）
    // 范围放大：extraversion 0→σ×0.3, extraversion 1→σ×1.7（5.7倍差异）
    this.sigma = this.cfg.sigma * (0.3 + ocean.extraversion * 1.4);

    // 人格对驱力权重的调制（放大差异）
    this._weightModifiers = {
      needs:      0.8 + ocean.neuroticism * 0.6,           // N=0→0.8, N=1→1.4
      emotion:    0.4 + ocean.openness * 1.2,              // O=0→0.4, O=1→1.6（4倍差异）
      schedule:   0.3 + ocean.conscientiousness * 1.4,     // C=0→0.3, C=1→1.7（5.7倍差异）
      intrinsic:  0.2 + ocean.openness * 1.6,              // O=0→0.2, O=1→1.8（9倍差异）
      habit:      0.3 + ocean.conscientiousness * 0.8,     // C=0→0.3, C=1→1.1
    };

    if (savedState) {
      this.B = [...savedState.B];
      this.velocity = [...savedState.velocity];
      this._prevB = [...savedState.B];
      this._lastLabel = savedState._lastLabel || '在发呆';
      this._tickCount = savedState._tickCount || 0;
    } else {
      // 初始位置：休息状态附近
      this.B = [0.15, 0.08, 0.15, 0.08];
      this.velocity = [0, 0, 0, 0];
      this._prevB = [...this.B];
      this._lastLabel = '在发呆';
      this._tickCount = 0;
    }

    // 缓存
    this._lastGradient = [0, 0, 0, 0];
    this._lastSignals = null;
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

    // 4. 语义标签投影
    const projection = BehaviorLabeler.project(this.B, { hour: signals.environment?.hour });

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
    if (signals.needs) {
      this._addNeedsGradient(grad, signals.needs, w.needs * this._weightModifiers.needs);
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

    // ── 6. 时间约束 ──
    if (signals.environment?.hour !== undefined) {
      this._addTimeGradient(grad, signals.environment.hour);
    }

    // ── 7. 边界软势能 ──
    this._addBoundaryGradient(grad);

    // ── 8. 梯度裁剪 ──
    // 防止多个梯度源叠加后过大，导致 velocity 爆炸和收敛过慢
    // maxGradNorm = 0.8 意味着每 tick 最大位移约 0.8 * dt = 0.08（~3 tick 到达目标）
    const maxGradNorm = 0.8;
    let gradNorm = 0;
    for (let d = 0; d < DIMS; d++) gradNorm += grad[d] * grad[d];
    gradNorm = Math.sqrt(gradNorm);
    if (gradNorm > maxGradNorm) {
      const scale = maxGradNorm / gradNorm;
      for (let d = 0; d < DIMS; d++) grad[d] *= scale;
    }

    return grad;
  }

  /**
   * 需求梯度：匮乏需求把 B 拉向满足方向
   * @private
   */
  _addNeedsGradient(grad, needs, weight) {
    for (const [need, target] of Object.entries(NEED_TARGETS)) {
      const value = needs[need];
      if (value === undefined) continue;

      // 需求越匮乏，拉力越强（sigmoid 映射）
      // value=0 → urgency≈1, value=0.5 → urgency≈0.3, value=1 → urgency≈0
      const urgency = 1 / (1 + Math.exp(5 * (value - 0.3)));

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

    if (approachDrive >= avoidDrive && approachDrive >= agenticDrive) {
      // 趋近：增加社交和表达（梯度为负值，通过 -∇U·dt 增加维度）
      for (let d = 0; d < DIMS; d++) {
        grad[d] -= effectiveWeight * EMOTION_TARGETS.approach[d];
      }
    } else if (avoidDrive >= agenticDrive) {
      // 回避：退缩（梯度为正值，通过 -∇U·dt 减少维度）
      for (let d = 0; d < DIMS; d++) {
        grad[d] -= effectiveWeight * EMOTION_TARGETS.avoid[d];
      }
    } else {
      // 代理（愤怒/挫败）
      for (let d = 0; d < DIMS; d++) {
        grad[d] -= effectiveWeight * EMOTION_TARGETS.agentic[d];
      }
    }

    // 高唤醒度放大所有情绪梯度
    if (arousal > 0.6) {
      const amp = 1 + (arousal - 0.6) * 1.5;
      for (let d = 0; d < DIMS; d++) {
        grad[d] *= amp;
      }
    }
  }

  /**
   * 日程梯度：当前日程把 B 拉向目标行为
   * @private
   */
  _addScheduleGradient(grad, schedule, weight) {
    if (!schedule.inSchedule || !schedule.targetActivity) return;

    // 根据目标活动确定目标行为向量
    const target = _activityToTarget(schedule.targetActivity);
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
    const target = _getTimeTarget(hour);
    if (!target) return;

    // 时间引力较弱（软约束，不是硬覆盖）
    const timeWeight = 0.8;
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
      const noise = this.sigma * sqrtDt * _gaussianRandom();

      // 速度更新：阻尼 + 势能梯度（取负号：沿势能下降方向）+ 噪声
      this.velocity[d] = this.velocity[d] * dampingFactor
        - gradient[d] * dt
        + noise;

      // 位置更新
      this.B[d] = this.B[d] + this.velocity[d] * dt;
    }
  }

  /**
   * 边界处理：clamp + 速度反射
   * @private
   */
  _enforceBoundary() {
    const reflect = this.cfg.boundaryReflection;

    for (let d = 0; d < DIMS; d++) {
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
    return BehaviorLabeler.describe(this.B, options);
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
      _tickCount: this._tickCount,
    };
  }

  static fromJSON(data, personality) {
    return new BehaviorField(personality, data);
  }
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

/** Box-Muller 高斯随机数 */
function _gaussianRandom() {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** 活动名 → 4D 目标位置 */
function _activityToTarget(activity) {
  // 直接从 BehaviorLabeler 的状态中心查找
  const centers = require('./BehaviorLabeler').STATE_CENTERS;
  if (centers[activity]) return centers[activity];

  // 模糊匹配
  const fuzzyMap = {
    '上课': '在上课', '自习': '在自习', '工作': '在工作',
    '吃饭': '在食堂', '社交': '在聊天', '休息': '在休息',
    '睡觉': '睡了', '运动': '在路上', '打工': '在打工',
    '开会': '在开会', '做饭': '在做饭', '洗澡': '在洗澡',
  };
  for (const [key, state] of Object.entries(fuzzyMap)) {
    if (activity.includes(key)) return centers[state];
  }

  return null;
}

/**
 * 时间段 → 目标行为位置（平滑插值版）
 *
 * 在时间段边界附近做线性插值，避免硬跳变。
 * 例如 8:50 到 9:10 之间，从 morning 平滑过渡到 active。
 */
const TIME_SCHEDULE = [
  { hour: 0,  target: 'sleep' },
  { hour: 6,  target: 'sleep' },
  { hour: 7,  target: 'morning' },
  { hour: 9,  target: 'active' },
  { hour: 12, target: 'midday' },
  { hour: 14, target: 'active' },
  { hour: 17, target: 'evening' },
  { hour: 21, target: 'lateNight' },
  { hour: 23, target: 'sleep' },
  { hour: 24, target: 'sleep' },
];

function _getTimeTarget(hour) {
  const h = ((hour % 24) + 24) % 24; // 确保 0-24

  // 找到 h 两侧的 schedule 条目
  let lo = TIME_SCHEDULE[0], hi = TIME_SCHEDULE[1];
  for (let i = 0; i < TIME_SCHEDULE.length - 1; i++) {
    if (h >= TIME_SCHEDULE[i].hour && h < TIME_SCHEDULE[i + 1].hour) {
      lo = TIME_SCHEDULE[i];
      hi = TIME_SCHEDULE[i + 1];
      break;
    }
  }

  const loTarget = TIME_TARGETS[lo.target];
  const hiTarget = TIME_TARGETS[hi.target];
  if (!loTarget || !hiTarget) return TIME_TARGETS.sleep;

  // 在边界的 1 小时范围内做线性插值
  const span = hi.hour - lo.hour;
  const t = span > 0 ? (h - lo.hour) / span : 0;
  const blend = Math.max(0, Math.min(1, t)); // 0=完全lo, 1=完全hi

  const result = new Array(DIMS);
  for (let d = 0; d < DIMS; d++) {
    result[d] = loTarget[d] * (1 - blend) + hiTarget[d] * blend;
  }
  return result;
}

module.exports = {
  BehaviorField,
  DEFAULTS,
  NEED_TARGETS,
  EMOTION_TARGETS,
  TIME_TARGETS,
};
