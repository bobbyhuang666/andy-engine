/**
 * Personality - 人格参数
 *
 * 基于 Big Five (OCEAN) 模型 + 映射到行为参数
 *
 * 研究发现：
 *   - 大五人格与情绪动态高度相关（神经质→情绪惯性，外向性→表达性）
 *   - 可以通过 Cholesky 分解生成相关的人格向量
 *   - MBTI 可以映射到大五维度（用于兼容 MBTI 设定）
 */

const { personalityToBehavior } = require('../../config/defaults');

/**
 * MBTI → 大五近似映射
 * 基于 McCrae & Costa (1989) 研究
 */
const MBTI_TO_OCEAN = {
  INFP: { openness: 0.75, conscientiousness: 0.40, extraversion: 0.25, agreeableness: 0.75, neuroticism: 0.55 },
  INFJ: { openness: 0.80, conscientiousness: 0.55, extraversion: 0.30, agreeableness: 0.80, neuroticism: 0.50 },
  INTJ: { openness: 0.80, conscientiousness: 0.65, extraversion: 0.25, agreeableness: 0.35, neuroticism: 0.40 },
  INTP: { openness: 0.85, conscientiousness: 0.35, extraversion: 0.25, agreeableness: 0.40, neuroticism: 0.45 },
  ISFP: { openness: 0.55, conscientiousness: 0.40, extraversion: 0.30, agreeableness: 0.70, neuroticism: 0.50 },
  ISFJ: { openness: 0.40, conscientiousness: 0.70, extraversion: 0.30, agreeableness: 0.80, neuroticism: 0.45 },
  ISTJ: { openness: 0.30, conscientiousness: 0.80, extraversion: 0.30, agreeableness: 0.50, neuroticism: 0.35 },
  ISTP: { openness: 0.50, conscientiousness: 0.40, extraversion: 0.35, agreeableness: 0.40, neuroticism: 0.40 },
  ENFP: { openness: 0.80, conscientiousness: 0.35, extraversion: 0.75, agreeableness: 0.70, neuroticism: 0.55 },
  ENFJ: { openness: 0.70, conscientiousness: 0.60, extraversion: 0.75, agreeableness: 0.85, neuroticism: 0.50 },
  ENTJ: { openness: 0.70, conscientiousness: 0.75, extraversion: 0.70, agreeableness: 0.35, neuroticism: 0.40 },
  ENTP: { openness: 0.85, conscientiousness: 0.35, extraversion: 0.70, agreeableness: 0.40, neuroticism: 0.45 },
  ESFP: { openness: 0.55, conscientiousness: 0.30, extraversion: 0.80, agreeableness: 0.65, neuroticism: 0.50 },
  ESFJ: { openness: 0.40, conscientiousness: 0.65, extraversion: 0.75, agreeableness: 0.85, neuroticism: 0.45 },
  ESTJ: { openness: 0.35, conscientiousness: 0.80, extraversion: 0.70, agreeableness: 0.50, neuroticism: 0.35 },
  ESTP: { openness: 0.50, conscientiousness: 0.30, extraversion: 0.80, agreeableness: 0.45, neuroticism: 0.45 },
};

class Personality {
  /**
   * @param {Object} config
   * @param {string} [config.mbti] - MBTI 类型（如 'INFP'）
   * @param {Object} [config.ocean] - 直接指定大五维度 { openness, conscientiousness, extraversion, agreeableness, neuroticism }
   * @param {Object} [config.modifiers] - 情绪基线修正 { calm, loneliness, boredom, ... }
   */
  constructor(config = {}) {
    if (config.mbti && MBTI_TO_OCEAN[config.mbti]) {
      // 以 MBTI 查表为基础
      this.ocean = { ...MBTI_TO_OCEAN[config.mbti] };
      // 如果同时显式指定了 ocean 参数，允许覆盖特定维度
      // R111-NAN-2: guard against NaN/Infinity overrides (defense-in-depth;
      // validate.js also catches these, but direct construction bypasses validation).
      if (config.ocean) {
        for (const dim of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) {
          if (config.ocean[dim] !== undefined && Number.isFinite(config.ocean[dim])) {
            this.ocean[dim] = config.ocean[dim];
          }
        }
      }
      this.mbti = config.mbti;
    } else if (config.ocean) {
      this.ocean = {
        openness: Number.isFinite(config.ocean.openness) ? config.ocean.openness : 0.5,
        conscientiousness: Number.isFinite(config.ocean.conscientiousness) ? config.ocean.conscientiousness : 0.5,
        extraversion: Number.isFinite(config.ocean.extraversion) ? config.ocean.extraversion : 0.5,
        agreeableness: Number.isFinite(config.ocean.agreeableness) ? config.ocean.agreeableness : 0.5,
        neuroticism: Number.isFinite(config.ocean.neuroticism) ? config.ocean.neuroticism : 0.5,
      };
      this.mbti = config.mbti || this._inferMBTI();
    } else {
      // 默认：INFP
      this.ocean = { ...MBTI_TO_OCEAN.INFP };
      this.mbti = 'INFP';
    }

    // 情绪基线修正（人格决定的长期情绪倾向）
    // 覆盖全部 30 维度，基于 OCEAN 特质的理论映射
    this.emotionBaseline = this._computeEmotionBaseline(config.modifiers);

    // 行为参数（从 OCEAN 派生）
    this.behavior = personalityToBehavior(this.ocean);

    // ── 人格漂移：事件窗口统计 ──
    // 不基于 avgValence（昼夜节律混淆），而是基于事件类型的累积统计
    this._driftWindow = {
      ticks: 0,
      totalSocialEvents: 0,      // 社交事件总数
      negativeSocialEvents: 0,   // 负面社交事件数
      totalStressTicks: 0,       // 高压力 tick 数
    };
  }

  /**
   * 记录一个事件到漂移窗口（由 Agent.tick() 调用）
   * @param {Object} eventInfo - { type: 'social'|..., valence: -0.5, isNegative: true }
   */
  recordEventForDrift(eventInfo) {
    this._driftWindow.ticks++;
    if (eventInfo.type === 'social') {
      this._driftWindow.totalSocialEvents++;
      if (eventInfo.isNegative) {
        this._driftWindow.negativeSocialEvents++;
      }
    }
    if (eventInfo.highStress) {
      this._driftWindow.totalStressTicks++;
    }
  }

  /**
   * 人格漂移：基于 100-tick 事件窗口的累积统计
   *
   * 触发条件（满足任一）：
   *   - 100 tick 内 20%+ 社交事件为负面 → neuroticism 微增
   *   - 100 tick 内 30%+ 时间处于高压力 → neuroticism 微增
   *   - 100 tick 内社交事件频率 > 40% → extraversion 微增
   *
   * 注意：OCEAN 变化后必须刷新行为缓存
   */
  drift() {
    const w = this._driftWindow;
    if (w.ticks < 50) return false; // 窗口不够大，不触发

    let changed = false;

    // 负面社交事件 → neuroticism 上升（但不超过上限）
    if (w.totalSocialEvents >= 5) {
      const negativeRate = w.negativeSocialEvents / w.totalSocialEvents;
      if (negativeRate >= 0.2) {
        this.ocean.neuroticism = Math.min(1, this.ocean.neuroticism + 0.001);
        changed = true;
      }
    }

    // 高压力累积 → neuroticism 上升
    const stressRate = w.totalStressTicks / w.ticks;
    if (stressRate >= 0.3) {
      this.ocean.neuroticism = Math.min(1, this.ocean.neuroticism + 0.001);
      changed = true;
    }

    // R160: 频繁社交 → extraversion 微增（但不超过上限）
    if (w.ticks >= 100) {
      const socialRate = w.totalSocialEvents / w.ticks;
      if (socialRate > 0.4) {
        this.ocean.extraversion = Math.min(1, this.ocean.extraversion + 0.001);
        changed = true;
      }
    }

    // R160: mean-reversion — prevent monotonic drift toward N=1, E=1.
    // Without downward drift, agents in sustained negative environments
    // converge toward neuroticism=1, extraversion=1, eliminating diversity.
    // Gentle pull toward midpoint (0.5) when drift has accumulated.
    if (w.ticks >= 100) {
      const driftMagnitude = (this.ocean.neuroticism - 0.5) + (this.ocean.extraversion - 0.5);
      if (driftMagnitude > 0.3) {
        const meanReversion = Math.min(0.001, driftMagnitude * 0.01);
        if (this.ocean.neuroticism > 0.5) {
          this.ocean.neuroticism = Math.max(0, this.ocean.neuroticism - meanReversion);
        }
        if (this.ocean.extraversion > 0.5) {
          this.ocean.extraversion = Math.max(0, this.ocean.extraversion - meanReversion);
        }
        changed = true;
      }
    }

    // 重置窗口（无论是否触发漂移）
    this._driftWindow = {
      ticks: 0,
      totalSocialEvents: 0,
      negativeSocialEvents: 0,
      totalStressTicks: 0,
    };

    // OCEAN 变化后必须刷新行为缓存 + 情绪基线
    if (changed) {
      this._refreshBehavior();
    }

    return changed;
  }

  /**
   * OCEAN 变化后刷新派生参数
   * @private
   */
  _refreshBehavior() {
    this.behavior = personalityToBehavior(this.ocean);
    this.emotionBaseline = this._computeEmotionBaseline();
  }

  /**
   * 从 OCEAN 特质计算情绪基线
   * @param {Object} [modifiers] - 可选的情绪基线修正
   * @returns {Object}
   * @private
   */
  _computeEmotionBaseline(modifiers) {
    const o = this.ocean;
    return {
      joy:          0.15 * o.extraversion + 0.05 * o.agreeableness,
      sadness:      0.12 * o.neuroticism - 0.05 * o.extraversion,
      anger:        0.10 * o.neuroticism - 0.08 * o.agreeableness,
      fear:         0.12 * o.neuroticism - 0.05 * (1 - o.neuroticism),
      surprise:     0.08 * o.openness,
      disgust:      0.06 * o.neuroticism - 0.04 * o.agreeableness,
      amusement:    0.10 * o.extraversion + 0.05 * o.openness,
      awe:          0.08 * o.openness,
      contentment:  0.15 * o.agreeableness + 0.05 * (1 - o.neuroticism),
      desire:       0.08 * o.extraversion + 0.05 * o.openness,
      embarrassment: 0.08 * o.neuroticism - 0.03 * o.extraversion,
      guilt:        0.10 * o.agreeableness + 0.05 * o.neuroticism,
      horror:       0.05 * o.neuroticism,
      interest:     0.12 * o.openness + 0.05 * o.extraversion,
      love:         0.10 * o.agreeableness + 0.05 * o.extraversion,
      nervousness:  0.15 * o.neuroticism - 0.05 * o.extraversion,
      pride:        0.08 * o.extraversion + 0.03 * o.conscientiousness,
      relief:       0.05 * (1 - o.neuroticism),
      satisfaction: 0.10 * o.conscientiousness + 0.05 * o.agreeableness,
      shame:        0.08 * o.neuroticism + 0.03 * o.agreeableness,
      sympathy:     0.10 * o.agreeableness + 0.05 * o.openness,
      triumph:      0.06 * o.extraversion + 0.04 * o.conscientiousness,
      boredom:      0.15 * (1 - o.openness) - 0.05 * o.extraversion,
      calm:         0.20 * (1 - o.neuroticism) + 0.05 * o.agreeableness,
      confusion:    0.05 * o.neuroticism - 0.03 * o.openness,
      excitement:   0.10 * o.extraversion + 0.08 * o.openness,
      frustration:  0.10 * o.neuroticism - 0.05 * o.conscientiousness,
      gratitude:    0.10 * o.agreeableness,
      hope:         0.10 * o.openness + 0.05 * (1 - o.neuroticism),
      loneliness:   0.20 * (1 - o.extraversion) + 0.05 * o.neuroticism,
      ...(modifiers || {}),
    };
  }

  /**
   * 从大五推断最接近的 MBTI
   * @private
   */
  _inferMBTI() {
    let best = 'INFP';
    let bestDist = Infinity;
    for (const [type, ocean] of Object.entries(MBTI_TO_OCEAN)) {
      const dist =
        (this.ocean.openness - ocean.openness) ** 2 +
        (this.ocean.conscientiousness - ocean.conscientiousness) ** 2 +
        (this.ocean.extraversion - ocean.extraversion) ** 2 +
        (this.ocean.agreeableness - ocean.agreeableness) ** 2 +
        (this.ocean.neuroticism - ocean.neuroticism) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = type;
      }
    }
    return best;
  }

  /**
   * 生成行为导向的人格描述（用于 LLM prompt 注入）
   *
   * 实验五结论：人格描述应以行为倾向形式呈现，而非仅 OCEAN 数值
   * @returns {string}
   */
  toPromptString() {
    const o = this.ocean;
    const parts = [];

    // 外向性 → 社交倾向（3级）
    if (o.extraversion > 0.6) parts.push('你性格外向，喜欢社交，话比较多');
    else if (o.extraversion < 0.35) parts.push('你性格内向，不太主动说话，更喜欢独处');
    else parts.push('你的社交倾向适中，既不特别外向也不特别内向');

    // 神经质 → 情绪稳定性（3级）
    if (o.neuroticism > 0.6) parts.push('你容易焦虑和想太多，情绪波动较大');
    else if (o.neuroticism < 0.35) parts.push('你情绪稳定，不太容易焦虑');
    else parts.push('你的情绪稳定性一般，偶尔会有些焦虑');

    // 宜人性 → 人际风格（3级）
    if (o.agreeableness > 0.6) parts.push('你待人友善温和，乐于助人');
    else if (o.agreeableness < 0.35) parts.push('你说话直接，不太在意别人的感受');
    else parts.push('你的人际态度取决于具体情况，有时温和有时直接');

    // 开放性 → 思维方式（3级）
    if (o.openness > 0.6) parts.push('你思维开放，对新事物充满好奇');
    else if (o.openness < 0.35) parts.push('你偏好熟悉的事物，不太喜欢变化');
    else parts.push('你对新事物持开放但审慎的态度');

    // 尽责性 → 行为风格（3级）
    if (o.conscientiousness > 0.6) parts.push('你做事有条理，计划性强');
    else if (o.conscientiousness < 0.35) parts.push('你比较随性，不太喜欢被计划束缚');
    else parts.push('你在需要时能有条理地做事，但也会灵活应变');

    // 添加行为约束（实验七结论：防止LLM讨好偏见）
    // 根据外向性和神经质推断回复风格
    if (o.extraversion < 0.4) {
      parts.push('你说话偏简短，不喜欢长篇大论');
    }
    if (o.neuroticism > 0.55) {
      parts.push('遇到不顺心的事你会表现出不安或犹豫');
    }
    if (o.extraversion > 0.65 && o.agreeableness > 0.6) {
      parts.push('你说话热情，喜欢用感叹和鼓励的语气');
    }

    return parts.join('。') + '。';
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      mbti: this.mbti,
      ocean: { ...this.ocean },
      emotionBaseline: { ...this.emotionBaseline },
      _driftWindow: { ...this._driftWindow },
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(data) {
    const p = new Personality({
      mbti: data.mbti,
      ocean: data.ocean,
      modifiers: data.emotionBaseline,
    });
    if (data._driftWindow) {
      p._driftWindow = { ...data._driftWindow };
    }
    return p;
  }
}

module.exports = Personality;
