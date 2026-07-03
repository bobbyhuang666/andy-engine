/**
 * NeedsSystem - 基于 Maslow 需求层级的内在驱动系统
 *
 * 灵感来源：
 *   - Maslow's Hierarchy of Needs (1943): 生理→安全→社交→尊重→自我实现
 *   - AgentSociety (2025): 需求驱动的行动生成
 *   - PSYA (2025): Cognitive Triangle (Feeling-Thought-Action)
 *   - Evolving Agents (2024): 需求-行为反馈循环
 *
 * 核心机制：
 *   - 每个需求是一个 [0, 1] 的标量，1 = 满足，0 = 极度匮乏
 *   - 需求随时间自然衰减（人格调节速率）
 *   - 特定行为恢复特定需求（吃饭→饥饿，睡觉→精力）
 *   - 需求匮乏产生"驱力"（drive），驱力影响状态选择
 *   - 最匮乏的需求具有最高优先级（类似注意力抢占）
 *
 * 与现有系统的关系：
 *   - 日程（Schedule）：提供基线行为框架
 *   - 情绪（Emotion）：影响行为偏好
 *   - 需求（Needs）：提供内在动机，可以覆盖日程
 *
 * 行为决策优先级：
 *   紧急需求 > 日程安排 > 情绪偏好 > 随机
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');

/**
 * R41 A1 fix (v2): deep-merge user needs config with defaults.
 * Returns a fresh object — does NOT mutate module-global state.
 */
function _mergeNeedsConfig(userConfig) {
  const base = ANDY_DEFAULTS.needs;
  if (!userConfig || typeof userConfig !== 'object') return base;
  const needsCfg = userConfig.needs || userConfig;
  if (typeof needsCfg !== 'object' || Object.keys(needsCfg).length === 0) return base;
  const merged = { ...base };
  for (const key of ['decayRate', 'recoveryRate', 'threshold']) {
    if (needsCfg[key] && typeof needsCfg[key] === 'object') {
      // R115-002: guard against NaN/Infinity in user-provided config values.
      const sanitized = {};
      for (const [need, val] of Object.entries(needsCfg[key])) {
        sanitized[need] = Number.isFinite(val) ? val : base[key]?.[need] ?? 0;
      }
      merged[key] = { ...base[key], ...sanitized };
    }
  }
  return merged;
}

// ─── 需求匮乏 → 4D 连续梯度目标 ───
/**
 * Need Deprivation Gradient Targets
 * 
 * When a need is depleted (e.g., hunger < 0.3), this target defines
 * the direction the behavior field should move toward.
 * 
 * Format: [activity, sociality, focus, expressiveness]
 */
const NEED_DEPRIVATION_GRADIENT_TARGETS = {
  hunger:      [0.35, 0.45, 0.20, 0.40],
  energy:      [0.08, 0.04, 0.05, 0.03],
  social:      [0.35, 0.85, 0.25, 0.80],
  comfort:     [0.15, 0.15, 0.20, 0.12],
  stimulation: [0.45, 0.35, 0.40, 0.40],
};

// ─── 需求满足 → 4D 连续满足中心 ───
const NEED_SATISFACTION_CENTERS = {
  hunger:      [0.35, 0.55, 0.15, 0.45],
  energy:      [0.06, 0.03, 0.05, 0.03],
  social:      [0.40, 0.90, 0.30, 0.85],
  comfort:     [0.15, 0.15, 0.25, 0.15],
  stimulation: [0.50, 0.40, 0.50, 0.50],
};

class NeedsSystem {
  /**
   * @param {Object} personality - Personality 实例
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [needsConfig] - R41 A1: user needs config override
   */
  constructor(personality, savedState = null, domain = null, needsConfig = null) {
    if (!domain) throw new Error('NeedsSystem requires a domain config');
    this.domain = domain;
    // R41 A1 fix: instance-level config, not module-global
    this._cfg = _mergeNeedsConfig(needsConfig);

    // 从 domain 获取需求满足映射
    this._needSatisfaction = this.domain.needSatisfactionMap;
    this._needDriveStates = this.domain.needDriveStates;

    // 人格影响需求衰减速率
    const ocean = personality.ocean;

    if (savedState) {
      this.needs = { ...savedState.needs };
      this._decayRates = savedState._decayRates || this._calcDecayRates(ocean);
      this._recoveryMultipliers = savedState._recoveryMultipliers || this._calcRecoveryMultipliers(ocean);
    } else {
      this.needs = {
        hunger: 0.8,
        energy: 0.9,
        social: 0.6,
        comfort: 0.7,
        stimulation: 0.5,
      };
      this._decayRates = this._calcDecayRates(ocean);
      this._recoveryMultipliers = this._calcRecoveryMultipliers(ocean);
    }

    // NaN 防御：验证 needs、_decayRates 和 _recoveryMultipliers 内部值
    // R31 P1 fix: this.needs from corrupted save data can contain NaN,
    // and Math.max(0, NaN) = NaN propagates permanently through tick().
    const defaultNeeds = { hunger: 0.8, energy: 0.9, social: 0.6, comfort: 0.7, stimulation: 0.5 };
    for (const key of Object.keys(this.needs)) {
      if (!Number.isFinite(this.needs[key])) {
        this.needs[key] = defaultNeeds[key] || 0.5;
      }
    }
    const freshDecayRates = this._calcDecayRates(ocean);
    const freshRecoveryMultipliers = this._calcRecoveryMultipliers(ocean);
    for (const key of Object.keys(this._decayRates)) {
      if (!Number.isFinite(this._decayRates[key])) {
        this._decayRates[key] = freshDecayRates[key];
      }
    }
    for (const key of Object.keys(this._recoveryMultipliers)) {
      if (!Number.isFinite(this._recoveryMultipliers[key])) {
        this._recoveryMultipliers[key] = freshRecoveryMultipliers[key];
      }
    }
  }

  /**
   * 根据人格计算各需求的衰减速率
   *
   * 外向者社交需求衰减更快（更渴望社交）
   * 神经质者舒适需求衰减更快（更容易不安）
   * 开放者刺激需求衰减更快（更容易无聊）
   * @private
   */
  _calcDecayRates(ocean) {
    const base = this._cfg.decayRate;
    return {
      hunger: base.hunger,  // 生理需求不受人格影响
      energy: base.energy * (1 + ocean.neuroticism * 0.2),  // 神经质高→精力消耗更快
      social: base.social * (1 + ocean.extraversion * 0.5),  // 外向→社交需求衰减更快
      comfort: base.comfort * (1 + ocean.neuroticism * 0.3), // 神经质→更不安
      stimulation: base.stimulation * (1 + ocean.openness * 0.4), // 开放→更渴望新刺激
    };
  }

  /**
   * 根据人格计算各需求的恢复速率乘数
   *
   * 外向者在社交场景中恢复社交需求更快
   * 高开放者在刺激场景中恢复更快
   * 高神经质者在舒适场景中恢复更快（更需要安全感）
   * @private
   */
  _calcRecoveryMultipliers(ocean) {
    return {
      hunger: 1.0,  // 生理需求恢复不受人格影响
      energy: 1.0,
      social: 1.0 + ocean.extraversion * 0.6,     // 外向者社交恢复 ×1.6
      comfort: 1.0 + ocean.neuroticism * 0.4,      // 高神经质者舒适恢复 ×1.4（更需要安全感）
      stimulation: 1.0 + ocean.openness * 0.5,     // 高开放者刺激恢复 ×1.5
    };
  }

  /**
   * 推进需求衰减
   * @param {number} hoursElapsed - 经过的模拟小时数
   * @param {string} currentState - 当前状态
   * @param {string} currentRegion - 当前区域
   */
  tick(hoursElapsed, currentState, currentRegion) {
    // Step 1: 自然衰减
    for (const [need, rate] of Object.entries(this._decayRates)) {
      const current = this.needs[need];
      // R32 fix: guard against NaN in current (Math.max(0, NaN) = NaN).
      // Constructor NaN defense only runs once; tick() can receive NaN from
      // EffectCommitter or external modification.
      if (!Number.isFinite(current)) {
        this.needs[need] = 0.5;
        continue;
      }
      // R102-NANO-1: guard rate against NaN. Corrupted _decayRates or
      // external modification can produce NaN rate, which permanently
      // corrupts the need via Math.max(0, NaN) = NaN propagation.
      if (!Number.isFinite(rate)) continue;
      const effectiveRate = rate * (0.5 + current * 0.5);
      this.needs[need] = Math.max(0, current - effectiveRate * hoursElapsed);
    }

    // Step 2: 活动恢复需求（从 domain 取映射）
    for (const [need, mapping] of Object.entries(this._needSatisfaction)) {
      let recovery = 0;

      if (mapping.states.includes(currentState)) {
        recovery += this._cfg.recoveryRate[need] || 0.3;
      }

      if (mapping.regions.includes(currentRegion)) {
        recovery += (this._cfg.recoveryRate[need] || 0.3) * 0.3;
      }

      if (recovery > 0) {
        const multiplier = (this._recoveryMultipliers && this._recoveryMultipliers[need]) || 1.0;
        const current = this.needs[need];
        // R32 fix: guard against NaN in current.
        // R41 H2 fix: also guard recovery, multiplier, hoursElapsed, and the result.
        // Number.isFinite(current) alone does not protect against a NaN
        // recovery or multiplier fed from a corrupted domain config.
        if (Number.isFinite(current) && Number.isFinite(recovery) && Number.isFinite(multiplier) && Number.isFinite(hoursElapsed)) {
          const result = current + recovery * multiplier * hoursElapsed;
          this.needs[need] = Number.isFinite(result) ? Math.min(1, result) : 0.5;
        }
      }
    }
  }

  /**
   * 连续行为版本的 tick（Phase 3）
   *
   * 与 tick() 的区别：
   *   - tick() 使用离散状态名查表（NEED_SATISFACTION）
   *   - tickWithBehavior() 使用连续行为向量计算恢复速率
   *
   * 衰减逻辑完全相同，只有恢复计算方式不同。
   *
   * @param {number} hoursElapsed - 经过的模拟小时数
   * @param {number[]} behaviorVector - 4D 连续行为向量 [activity, sociality, focus, expressiveness]
   */
  tickWithBehavior(hoursElapsed, behaviorVector) {
    // Step 1: 自然衰减（与 tick() 完全相同）
    for (const [need, rate] of Object.entries(this._decayRates)) {
      const current = this.needs[need];
      // R32 fix: guard against NaN (same as tick())
      if (!Number.isFinite(current)) {
        this.needs[need] = 0.5;
        continue;
      }
      // R102-NANO-1: guard rate against NaN (same defense-in-depth as tick())
      if (!Number.isFinite(rate)) continue;
      const effectiveRate = rate * (0.5 + current * 0.5);
      this.needs[need] = Math.max(0, current - effectiveRate * hoursElapsed);
    }

    // Step 2: 基于连续行为向量的恢复
    const rates = this.getRecoveryRatesForBehavior(behaviorVector);
    for (const [need, rate] of Object.entries(rates)) {
      if (rate > 0) {
        const current = this.needs[need];
        // R32 fix: guard against NaN (Math.min(1, NaN) = NaN)
        // R41 H2 fix: also guard rate and hoursElapsed, same as tick() above.
        if (Number.isFinite(current) && Number.isFinite(rate) && Number.isFinite(hoursElapsed)) {
          const result = current + rate * hoursElapsed;
          this.needs[need] = Number.isFinite(result) ? Math.min(1, result) : 0.5;
        }
      }
    }
  }

  /**
   * 获取需求驱力信号
   *
   * 当需求低于阈值时产生驱力，驱力强度 = 阈值 - 当前值
   * 驱力用于影响状态机的转移权重
   *
   * @returns {Object|null} { need, urgency, targetStates } 或 null（无紧急需求）
   */
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

  /**
   * 获取状态转移权重修正
   *
   * 用于 StateMachine 的转移决策。
   * 如果候选状态能满足匮乏需求，增加其权重。
   *
   * @param {string[]} candidateStates - 候选目标状态列表
   * @returns {number[]} 对应的权重修正倍率
   */
  getStateWeights(candidateStates) {
    const drive = this.getDrive();
    if (!drive) return candidateStates.map(() => 1);

    return candidateStates.map(state => {
      // 如果候选状态能满足最紧急的需求，大幅增加权重
      if (drive.targetStates.includes(state)) {
        return 1 + drive.urgency * 3; // 紧急度越高，权重修正越大
      }
      return 1;
    });
  }

  /**
   * 获取所有需求的描述（用于调试/提示注入）
   * @returns {string}
   */
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

  // ═══════════════════════════════════════════
  // 连续梯度接口（Phase 1: BehaviorField 集成）
  // ═══════════════════════════════════════════

  /**
   * 获取所有活跃需求驱力的连续梯度向量
   *
   * 每个匮乏需求返回在 4D 行为空间中的梯度方向：
   *   gradient = w · urgency · (B - target)
   * 其中 target 是该需求满足时的最优行为位置
   *
   * 与 getDrive() 的区别：
   *   - getDrive() → 离散 targetStates: ['在餐厅', '在打工处']
   *   - getDriveGradient() → 连续 gradientVector: [0.3, -0.2, -0.1, -0.1]
   *
   * @returns {Array<{ need: string, urgency: number, gradient: number[] }>}
   */
  getDriveGradient() {
    const drives = [];

    for (const [need, value] of Object.entries(this.needs)) {
      const threshold = this._cfg.threshold[need] || 0.3;
      if (value >= threshold) continue;

      const urgency = threshold - value;
      // R115-003: guard against NaN urgency (if value is NaN, urgency is NaN).
      if (!Number.isFinite(urgency)) continue;
      const target = NEED_DEPRIVATION_GRADIENT_TARGETS[need];
      if (!target) continue;

      drives.push({ need, urgency, gradient: [...target] });
    }

    return drives;
  }

  /**
   * 给定连续行为向量，计算每个需求的恢复速率
   *
   * 行为向量越接近该需求的"满足中心"，恢复越快。
   * 这是 NEED_SATISFACTION 的连续版本。
   *
   * @param {number[]} behaviorVector - 4D 行为向量 [activity, sociality, focus, expressiveness]
   * @returns {Object} { hunger: rate, energy: rate, ... }
   */
  getRecoveryRatesForBehavior(behaviorVector) {
    const rates = {};
    const maxDist = 0.8; // 超过此距离无恢复

    for (const [need, target] of Object.entries(NEED_SATISFACTION_CENTERS)) {
      let distSq = 0;
      for (let d = 0; d < 4; d++) {
        const diff = behaviorVector[d] - target[d];
        distSq += diff * diff;
      }
      const distance = Math.sqrt(distSq);
      // R102-NANO-2: guard factor against NaN from corrupted behaviorVector.
      // If any behaviorVector[d] is NaN, distance is NaN → factor is NaN.
      // While tickWithBehavior() guards rate downstream, preventing NaN
      // production here is defense-in-depth.
      const factor = Number.isFinite(distance) ? Math.max(0, 1 - distance / maxDist) : 0;
      const baseRate = this._cfg.recoveryRate[need] || 0.3;
      const multiplier = (this._recoveryMultipliers && this._recoveryMultipliers[need]) || 1.0;
      rates[need] = baseRate * factor * multiplier;
    }

    return rates;
  }

  /**
   * 边界截断与 NaN 修复
   * @private
   */
  _clamp() {
    for (const key of Object.keys(this.needs)) {
      if (!Number.isFinite(this.needs[key])) this.needs[key] = 0.5;
      this.needs[key] = Math.max(0, Math.min(1, this.needs[key]));
    }
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      needs: { ...this.needs },
      _decayRates: { ...this._decayRates },
      _recoveryMultipliers: { ...(this._recoveryMultipliers || {}) },
    };
  }

  /**
   * 从 toJSON 输出反序列化为 NeedsSystem 实例。
   * 恢复路径中应传入真实 Personality 与 Domain；省略时构造桩，仅供 round-trip / 测试。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [personality] - Personality 实例
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [needsConfig] - R41 A1: user needs config override
   * @returns {NeedsSystem}
   */
  static fromJSON(json, personality = null, domain = null, needsConfig = null) {
    const p = personality || { ocean: { neuroticism: 0.5, extraversion: 0.5, openness: 0.5, conscientiousness: 0.5, agreeableness: 0.5 } };
    return new NeedsSystem(p, json, domain, needsConfig);
  }
}

module.exports = NeedsSystem;
