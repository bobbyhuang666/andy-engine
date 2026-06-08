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

const { ANDY_DEFAULTS } = require('../config/defaults');
const cfg = ANDY_DEFAULTS.needs;

// ─── 需求 → 满足行为映射 ───
// 当 Agent 处于某个状态时，对应的需求得到恢复
const NEED_SATISFACTION = {
  hunger: {
    states: ['在食堂', '在吃饭', '在做饭', '做好了', '在便利店'],
    regions: ['食堂', '便利店'],
  },
  energy: {
    states: ['睡了', '在翻身', '快睡了', '在休息', '趴一会', '先躺一会'],
    regions: [], // R5: 去掉区域恢复（在家/宿舍≠在睡觉）
  },
  social: {
    states: ['在聊天', '在食堂', '在校园广场', '在咖啡店', '在开会'],
    regions: ['食堂', '校园广场', '咖啡店'],
  },
  comfort: {
    states: ['在家', '到家了', '在宿舍', '在休息', '在看剧', '在洗澡'],
    regions: ['家', '宿舍'],
  },
  stimulation: {
    states: ['在看剧', '在听歌', '在看书', '在咖啡店', '在看手机', '在打工'],
    regions: ['咖啡店', '操场', '公园'],
  },
};

// ─── 需求匮乏 → 目标状态映射 ───
// 当某个需求严重匮乏时，Agent 应该去满足它
const NEED_DRIVE_STATES = {
  hunger: ['在食堂', '在便利店'],
  energy: ['在休息', '睡了', '趴一会', '先躺一会'],
  social: ['在聊天', '在校园广场', '在咖啡店'],
  comfort: ['到家了', '在休息', '先躺一会'],
  stimulation: ['在看手机', '在看剧', '在操场', '在咖啡店', '在看书'],
};

// ─── 需求匮乏 → 4D 连续梯度目标 ───
// [activity, sociality, focus, expressiveness]
// 饥饿时应该去吃饭：中活跃、中社交、低专注
// 疲劳时应该休息：全面降低
const NEED_GRADIENT_TARGETS = {
  hunger:      [0.35, 0.45, 0.20, 0.40],
  energy:      [0.08, 0.04, 0.05, 0.03],
  social:      [0.35, 0.85, 0.25, 0.80],
  comfort:     [0.15, 0.15, 0.20, 0.12],
  stimulation: [0.45, 0.35, 0.40, 0.40],
};

// ─── 需求满足 → 4D 连续满足中心 ───
// 行为向量越接近这些中心点，对应需求恢复越快
// 与 NEED_SATISFACTION（离散状态列表）的连续替代
const NEED_SATISFACTION_CENTERS = {
  hunger:      [0.35, 0.50, 0.20, 0.45],   // 吃饭场景
  energy:      [0.06, 0.03, 0.05, 0.03],   // 休息/睡觉场景
  social:      [0.40, 0.90, 0.30, 0.85],   // 社交场景
  comfort:     [0.15, 0.15, 0.25, 0.15],   // 舒适/居家场景
  stimulation: [0.50, 0.40, 0.50, 0.50],   // 刺激/娱乐场景
};

class NeedsSystem {
  /**
   * @param {Object} personality - Personality 实例
   * @param {Object} [savedState] - 恢复状态
   */
  constructor(personality, savedState = null) {
    // 人格影响需求衰减速率
    const ocean = personality.ocean;

    if (savedState) {
      this.needs = { ...savedState.needs };
      this._decayRates = savedState._decayRates || NeedsSystem._calcDecayRates(ocean);
      this._recoveryMultipliers = savedState._recoveryMultipliers || NeedsSystem._calcRecoveryMultipliers(ocean);
    } else {
      this.needs = {
        hunger: 0.8,     // 饱腹感
        energy: 0.9,     // 精力
        social: 0.6,     // 社交满足
        comfort: 0.7,    // 舒适感
        stimulation: 0.5, // 刺激/兴趣满足
      };
      this._decayRates = NeedsSystem._calcDecayRates(ocean);
      this._recoveryMultipliers = NeedsSystem._calcRecoveryMultipliers(ocean);
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
  static _calcDecayRates(ocean) {
    const base = cfg.decayRate;
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
  static _calcRecoveryMultipliers(ocean) {
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
      // 指数衰减，但越低衰减越慢（接近 0 时不会完全归零）
      const effectiveRate = rate * (0.5 + current * 0.5);
      this.needs[need] = Math.max(0, current - effectiveRate * hoursElapsed);
    }

    // Step 2: 活动恢复需求（乘以人格恢复乘数）
    for (const [need, mapping] of Object.entries(NEED_SATISFACTION)) {
      let recovery = 0;

      // 当前状态满足需求
      if (mapping.states.includes(currentState)) {
        recovery += cfg.recoveryRate[need] || 0.3;
      }

      // 当前区域也满足需求（较低恢复量）
      if (mapping.regions.includes(currentRegion)) {
        recovery += (cfg.recoveryRate[need] || 0.3) * 0.3;
      }

      if (recovery > 0) {
        const multiplier = (this._recoveryMultipliers && this._recoveryMultipliers[need]) || 1.0;
        this.needs[need] = Math.min(1, this.needs[need] + recovery * multiplier * hoursElapsed);
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
      const effectiveRate = rate * (0.5 + current * 0.5);
      this.needs[need] = Math.max(0, current - effectiveRate * hoursElapsed);
    }

    // Step 2: 基于连续行为向量的恢复
    const rates = this.getRecoveryRatesForBehavior(behaviorVector);
    for (const [need, rate] of Object.entries(rates)) {
      if (rate > 0) {
        this.needs[need] = Math.min(1, this.needs[need] + rate * hoursElapsed);
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
   *   - getDrive() → 离散 targetStates: ['在食堂', '在便利店']
   *   - getDriveGradient() → 连续 gradientVector: [0.3, -0.2, -0.1, -0.1]
   *
   * @returns {Array<{ need: string, urgency: number, gradient: number[] }>}
   */
  getDriveGradient() {
    const drives = [];

    for (const [need, value] of Object.entries(this.needs)) {
      const threshold = cfg.threshold[need] || 0.3;
      if (value >= threshold) continue;

      const urgency = threshold - value;
      const target = NEED_GRADIENT_TARGETS[need];
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
      const factor = Math.max(0, 1 - distance / maxDist);
      const baseRate = cfg.recoveryRate[need] || 0.3;
      const multiplier = (this._recoveryMultipliers && this._recoveryMultipliers[need]) || 1.0;
      rates[need] = baseRate * factor * multiplier;
    }

    return rates;
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
}

module.exports = NeedsSystem;
