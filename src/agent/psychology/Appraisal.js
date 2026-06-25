/**
 * Appraisal - 认知评价系统
 *
 * 基于以下理论框架：
 *   - Scherer's Component Process Model (CPM): 14 个评价检查维度
 *   - Lazarus's Appraisal Theory: 初级评价（目标相关性）+ 次级评价（应对能力）
 *   - Marsella & Gratch (2009) EMA: 快速/慢速双时间尺度推理
 *   - Zhang et al. (2025) CPM-RL: 突然性、目标相关性、目标促进性、控制力
 *   - Sentipolis (2025): 情绪-记忆耦合的评价动力学
 *
 * 在 Andy 引擎中，Appraisal 是事件与情绪之间的"认知中介层"：
 *   事件 → 评价（Appraisal）→ 情绪反应（Emotion）
 *
 * 这意味着同一个事件（如下雨）对不同 Agent（如悲观的 vs 乐观的）
 * 会产生不同的评价结果，从而产生不同的情绪反应。
 *
 * 评价维度：
 *   1. 突然性 (suddenness) - 事件有多出乎意料
 *   2. 愉悦性 (pleasantness) - 事件本身的正/负面倾向
 *   3. 目标相关性 (goalRelevance) - 事件与当前目标/活动的相关程度
 *   4. 目标促进性 (goalConduciveness) - 事件帮助还是阻碍了目标
 *   5. 兼容性 (compatibility) - 事件与自身价值观/标准的兼容度
 *   6. 代理性 (agency) - 谁引发了事件（自己/他人/环境/命运）
 *   7. 应对潜力 (copingPotential) - 自己是否有能力应对
 *   8. 标准一致性 (normConformity) - 事件是否符合社会规范
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');

class Appraisal {
  /**
   * 对事件进行认知评价
   *
   * @param {Object} event - 事件对象
   * @param {Object} agent - Agent 实例（提供人格、情绪、记忆等）
   * @returns {Object} 评价结果 { dimensions: {...}, emotionModifier: {...}, importance: number }
   */
  static evaluate(event, agent) {
    // 从 domain 取配置
    if (!agent.domain) throw new Error('Appraisal.evaluate requires agent.domain');
    const domain = agent.domain;
    const appraisalConfig = domain.appraisalConfig;

    const dims = {
      suddenness:         Appraisal._evalSuddenness(event, agent),
      pleasantness:       Appraisal._evalPleasantness(event, agent),
      goalRelevance:      Appraisal._evalGoalRelevance(event, agent, appraisalConfig),
      goalConduciveness:  Appraisal._evalGoalConduciveness(event, agent, appraisalConfig),
      compatibility:      Appraisal._evalCompatibility(event, agent),
      agency:             Appraisal._evalAgency(event, agent),
      copingPotential:    Appraisal._evalCopingPotential(event, agent),
      normConformity:     Appraisal._evalNormConformity(event, agent, domain),
    };

    const emotionModifier = Appraisal._appraisalToEmotion(dims, agent);
    const importance = Appraisal._computeImportance(dims);

    return {
      dimensions: dims,
      emotionModifier,
      importance,
    };
  }

  // ═══════════════════════════════════════════
  // 评价维度计算
  // ═══════════════════════════════════════════

  /**
   * 1. 突然性 - 事件有多出乎意料
   *
   * 基于 CPM-RL (Zhang et al., 2025):
   * 突然性 = 1 - 与近期事件模式的匹配度
   *
   * 如果最近经历过类似事件，突然性降低（适应效应）
   * 如果 Agent 处于类似状态/位置，突然性降低（预期效应）
   * @private
   */
  static _evalSuddenness(event, agent) {
    let suddenness = 0.5; // 基线

    // 事件类型稀有度
    const typeRarity = {
      weather: 0.2,      // 天气变化不突然
      social: 0.3,       // 社交偶遇有一定突然性
      random: 0.7,       // 随机事件通常比较突然
      state: 0.4,        // 状态变化中等突然
      causal: 0.6,       // 因果链事件较突然
      schedule: 0.1,     // 日程事件几乎不突然
    };
    suddenness = typeRarity[event.type] || 0.5;

    // 记忆中的类似事件会降低突然性（适应效应）
    // P0 优化：用 Agent 的 recentEventTypes Set 做 O(1) 查表，
    // 代替原先的 memory.retrieve()（O(500) 遍历）
    if (agent._recentEventTypes && agent._recentEventTypes.has(event.type)) {
      suddenness *= 0.5; // 最近经历过同类事件，突然性减半
    }

    // 神经质高的 Agent 对世界的预期更悲观，突然性感受更强烈
    suddenness *= (1 + agent.personality.ocean.neuroticism * 0.2);

    return Math.max(0, Math.min(1, suddenness));
  }

  /**
   * 2. 愉悦性 - 事件本身的正/负面
   *
   * 基于事件的 valence + Agent 当前情绪的调节
   * @private
   */
  static _evalPleasantness(event, agent) {
    // 从事件效果中提取总体效价
    let totalValence = 0;
    let effectCount = 0;

    for (const effect of event.effects || []) {
      if (effect.target === agent.id && effect.type === 'emotion' && effect.delta) {
        for (const [dim, value] of Object.entries(effect.delta)) {
          // 正面情绪维度
          const isPositive = ['joy', 'contentment', 'satisfaction', 'excitement',
            'calm', 'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement',
            'interest', 'awe', 'surprise', 'desire', 'sympathy'].includes(dim);
          totalValence += isPositive ? value : -value;
          effectCount++;
        }
      }
    }

    // 归一化到 [-1, 1]
    const rawPleasantness = effectCount > 0 ? totalValence / effectCount : 0;

    // 情绪一致性偏差（mood-congruent bias）：
    // 好心情时对事件的评价更正面，反之亦然
    const moodBias = agent.emotion.getValence() * 0.15;

    // 宜人性高的 Agent 对事件的评价偏正面（宽容偏差）
    const agreeablenessBias = agent.personality.ocean.agreeableness * 0.05;

    // Appraisal Bias：重大事件的持久评价偏移（#7 创伤机制）
    const eventCategory = event.type === 'interaction' ? 'social' : (event.type || 'general');
    const traumaBias = agent.memory.getAppraisalBias
      ? agent.memory.getAppraisalBias(eventCategory)
      : 0;

    return Math.max(-1, Math.min(1, rawPleasantness + moodBias + agreeablenessBias + traumaBias));
  }

  /**
   * 3. 目标相关性 - 事件与当前目标/活动的相关程度
   *
   * 基于 CPM-RL: 检查事件是否影响当前正在进行的目标
   * @private
   */
  static _evalGoalRelevance(event, agent, appraisalConfig = {}) {
    const currentState = agent.stateMachine.currentState;
    const currentPosition = agent.position;

    let relevance = 0.3;

    if (event.type === 'social') {
      // 从 domain 取社交状态，缺省时用当前状态（不 fallback 到 campus）
      const socialStates = appraisalConfig.socialStates || [];
      relevance += socialStates.includes(currentState) ? 0.3 : 0.1;

      if (event.participants && event.participants.includes(agent.id)) {
        relevance += 0.3;
      }
    }

    if (event.type === 'weather') {
      // 从 domain 取室外位置，缺省时用当前位置（不 fallback 到 campus）
      const outdoorPositions = appraisalConfig.outdoorPositions || [];
      relevance += outdoorPositions.includes(currentPosition) ? 0.3 : 0.1;
    }

    if (event.type === 'random') {
      relevance += 0.2;
    }

    relevance += agent.personality.ocean.openness * 0.1;

    if (agent.needs) {
      const drive = agent.needs.getDrive();
      if (drive && drive.urgency > 0.1) {
        // 从 domain 取 needKeywords，缺省时用空对象（不 fallback 到 campus）
        const needKeywords = appraisalConfig.needKeywords || {};
        const content = (event.content || '');
        const keywords = needKeywords[drive.need] || [];
        for (const kw of keywords) {
          if (content.includes(kw)) {
            relevance += drive.urgency * 0.3;
            break;
          }
        }
      }
    }

    return Math.max(0, Math.min(1, relevance));
  }

  /**
   * 4. 目标促进性 - 事件帮助还是阻碍了目标
   *
   * 基于 CPM-RL: 评估事件对目标进展的影响
   * @private
   */
  static _evalGoalConduciveness(event, agent, appraisalConfig = {}) {
    let conduciveness = 0;

    for (const effect of event.effects || []) {
      if (effect.target === agent.id && effect.type === 'emotion' && effect.delta) {
        for (const [dim, value] of Object.entries(effect.delta)) {
          const isPositive = ['joy', 'contentment', 'satisfaction', 'excitement',
            'calm', 'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'].includes(dim);
          conduciveness += isPositive ? value : -value;
        }
      }
    }

    // 从 domain 取 scheduledStates，缺省时用空数组（不 fallback 到 campus）
    const scheduledStates = appraisalConfig.scheduledStates || [];
    if (scheduledStates.includes(agent.stateMachine.currentState)) {
      conduciveness *= 1.2;
    }

    const selfEfficacy = agent.personality.ocean.conscientiousness * 0.3;
    if (conduciveness > 0) {
      conduciveness *= (1 + selfEfficacy);
    }

    return Math.max(-1, Math.min(1, conduciveness));
  }

  /**
   * 5. 兼容性 - 事件与自身价值观/标准的兼容度
   * @private
   */
  static _evalCompatibility(event, agent) {
    let compatibility = 0.5; // 中性基线

    // 基于人格特质推断价值观偏好
    const ocean = agent.personality.ocean;

    // 开放性高的 Agent 对新奇事件兼容度高
    if (event.type === 'random') {
      compatibility += ocean.openness * 0.2;
    }

    // 宜人性高的 Agent 对社交事件兼容度高
    if (event.type === 'social') {
      compatibility += ocean.agreeableness * 0.15;
    }

    // 尽责性高的 Agent 对计划外事件兼容度低
    if (event.type === 'random' || event.type === 'causal') {
      compatibility -= (1 - ocean.conscientiousness) * 0.1;
    }

    // 情绪一致性偏差
    const valence = agent.emotion.getValence();
    compatibility += valence * 0.1;

    return Math.max(0, Math.min(1, compatibility));
  }

  /**
   * 6. 代理性 - 谁引发了事件
   *
   * 返回值编码：
   *   0.0 = 环境/命运
   *   0.3 = 不确定
   *   0.5 = 自己
   *   0.8 = 认识的人
   *   1.0 = 亲密的人
   * @private
   */
  static _evalAgency(event, agent) {
    if (event.type === 'weather' || event.type === 'environment') {
      return { agent: null, score: 0.0, label: 'environment' };
    }

    if (event.type === 'random') {
      return { agent: null, score: 0.1, label: 'chance' };
    }

    if (event.type === 'social' && event.participants && event.participants.length > 0) {
      const otherId = event.participants.find(id => id !== agent.id);
      if (otherId) {
        // 检查关系强度
        const rel = agent.socialGraph?.getRelationship(agent.id, otherId);
        const strength = rel ? rel.strength : 0;
        return {
          agent: otherId,
          score: 0.3 + strength * 0.7, // 关系越近，代理性越高
          label: 'other', // 统一为 'other'（与 index.js Appraisal 注入约定一致）
        };
      }
    }

    if (event.type === 'schedule' || event.type === 'state') {
      return { agent: agent.id, score: 0.5, label: 'self' };
    }

    return { agent: null, score: 0.3, label: 'chance' };
  }

  /**
   * 7. 应对潜力 - 自己是否有能力应对
   *
   * 基于 EMA (Marsella & Gratch, 2009):
   * 应对潜力 = f(社交能量, 情绪状态, 人格)
   * @private
   */
  static _evalCopingPotential(event, agent) {
    let coping = 0.5; // 基线

    // 社交能量 → 社交应对能力
    coping += agent.socialEnergy * 0.2;

    // 情绪稳定性 → 情绪应对能力（低神经质 = 高稳定性）
    coping += (1 - agent.personality.ocean.neuroticism) * 0.2;

    // 尽责性 → 问题解决能力
    coping += agent.personality.ocean.conscientiousness * 0.1;

    // 开放性 → 认知重评能力
    coping += agent.personality.ocean.openness * 0.1;

    // 当前压力降低应对能力
    const stressPenalty = (agent.emotion.stress || 0) / 10 * 0.3;
    coping -= stressPenalty;

    // 需求匮乏降低应对能力（饥饿/疲惫时更难应对挑战）
    if (agent.needs) {
      const energyLevel = agent.needs.needs.energy || 0.5;
      const hungerLevel = agent.needs.needs.hunger || 0.5;
      // 精力不足严重影响应对能力
      coping -= (1 - energyLevel) * 0.15;
      // 饥饿降低应对能力
      coping -= (1 - hungerLevel) * 0.1;
    }

    // 外向性 → 社会支持感知
    coping += agent.personality.ocean.extraversion * 0.1;

    return Math.max(0, Math.min(1, coping));
  }

  /**
   * 8. 标准一致性 - 事件是否符合社会规范
   * @private
   */
  static _evalNormConformity(event, agent, domain) {
    let conformity = 0.5;

    // 社交事件的规范性基于关系类型
    if (event.type === 'social' && event.content) {
      const content = event.content;
      const normKeywords = (domain.appraisalConfig && domain.appraisalConfig.normConformityKeywords) || {};
      const sp = domain.semanticProfile;
      const positiveNorms = normKeywords.positive || (sp && sp.socialNormKeywords && sp.socialNormKeywords.positive) || ['打招呼', '聊天', '帮助'];
      const negativeNorms = normKeywords.negative || (sp && sp.socialNormKeywords && sp.socialNormKeywords.negative) || ['冲突', '吵架'];
      // 正面社交互动符合规范
      if (positiveNorms.some(k => content.includes(k))) {
        conformity = 0.8;
      }
      // 冲突不符合规范
      if (negativeNorms.some(k => content.includes(k))) {
        conformity = 0.2;
      }
    }

    // 宜人性高的 Agent 对规范更敏感
    conformity = 0.5 + (conformity - 0.5) * (0.5 + agent.personality.ocean.agreeableness * 0.5);

    return Math.max(0, Math.min(1, conformity));
  }

  // ═══════════════════════════════════════════
  // 评价 → 情绪映射
  // ═══════════════════════════════════════════

  /**
   * 基于评价结果计算情绪修正因子
   *
   * 核心逻辑（参考 Sentipolis + CPM-RL）：
   *   - 高突然性 + 负面 → 恐惧/惊讶
   *   - 高目标促进 → 快乐/满足
   *   - 高目标阻碍 → 沮丧/愤怒
   *   - 低应对潜力 + 负面 → 恐惧/焦虑
   *   - 外部代理 + 负面 → 愤怒（他人可控）
   *   - 环境/命运 + 负面 → 无奈/悲伤（不可控）
   *
   * @private
   * @returns {Object} 情绪修正倍率 { emotionName: multiplier }
   */
  static _appraisalToEmotion(dims, agent) {
    const modifiers = {};
    const p = dims.pleasantness;
    const s = dims.suddenness;
    const gr = dims.goalRelevance;
    const gc = dims.goalConduciveness;
    const cp = dims.copingPotential;
    const agencyScore = dims.agency.score;

    // ─── 核心映射规则 ───

    // 1. 目标促进性 → 正面情绪
    if (gc > 0.3 && gr > 0.3) {
      const joyBoost = gc * gr * 0.8;
      modifiers.joy = 1 + joyBoost;
      modifiers.satisfaction = 1 + joyBoost * 0.7;
      modifiers.contentment = 1 + joyBoost * 0.5;

      // 如果是有意为之（高代理性），增加自豪
      if (agencyScore > 0.4 && dims.compatibility > 0.5) {
        modifiers.pride = 1 + gc * 0.4;
      }
    }

    // 2. 目标阻碍 → 负面情绪
    if (gc < -0.2 && gr > 0.3) {
      const frustBoost = Math.abs(gc) * gr * 0.8;
      modifiers.frustration = 1 + frustBoost;

      // 低应对潜力 + 目标阻碍 → 焦虑/恐惧
      if (cp < 0.4) {
        modifiers.fear = 1 + frustBoost * 0.5;
        modifiers.nervousness = 1 + frustBoost * 0.6;
      }

      // 如果是他人造成的（高代理性）→ 愤怒
      if (agencyScore > 0.5 && dims.agency.label !== 'self' && dims.agency.label !== 'environment') {
        modifiers.anger = 1 + frustBoost * 0.6;
      }

      // 如果是环境/命运造成的（低代理性）→ 悲伤
      if (agencyScore < 0.2) {
        modifiers.sadness = 1 + frustBoost * 0.5;
        modifiers.loneliness = 1 + frustBoost * 0.3;
      }
    }

    // 3. 高突然性 → 惊讶/恐惧
    if (s > 0.6) {
      modifiers.surprise = 1 + s * 0.5;

      // 高突然性 + 负面 → 恐惧
      if (p < -0.1) {
        modifiers.fear = (modifiers.fear || 1) + s * Math.abs(p) * 0.3;
        modifiers.nervousness = (modifiers.nervousness || 1) + s * 0.3;
      }

      // 高突然性 + 正面 → 兴奋
      if (p > 0.1) {
        modifiers.excitement = 1 + s * p * 0.4;
      }
    }

    // 4. 低应对潜力 → 基础焦虑提升
    if (cp < 0.3) {
      modifiers.nervousness = (modifiers.nervousness || 1) + (1 - cp) * 0.3;
    }

    // 5. 高应对潜力 + 负面事件 → 缓冲（resilience）
    if (cp > 0.7 && p < -0.2) {
      // 高应对潜力减轻负面情绪的冲击
      modifiers.sadness = (modifiers.sadness || 1) * (1 - (cp - 0.7) * 0.5);
      modifiers.fear = (modifiers.fear || 1) * (1 - (cp - 0.7) * 0.3);
    }

    // 6. 兼容性调节
    if (dims.compatibility > 0.7) {
      // 高兼容性事件增强正面效果
      modifiers.joy = (modifiers.joy || 1) * 1.1;
    } else if (dims.compatibility < 0.3) {
      // 低兼容性事件增强负面效果
      modifiers.frustration = (modifiers.frustration || 1) * 1.2;
    }

    // 7. 标准一致性与情绪
    if (dims.normConformity < 0.3) {
      // 违反规范 → 羞耻/内疚（如果是自己做的）
      if (dims.agency.label === 'self') {
        modifiers.shame = 1 + (1 - dims.normConformity) * 0.4;
        modifiers.guilt = 1 + (1 - dims.normConformity) * 0.3;
      }
    }

    // 清理：将所有 modifier 限制在合理范围内
    for (const [key, val] of Object.entries(modifiers)) {
      modifiers[key] = Math.max(0.1, Math.min(2.5, val));
    }

    return modifiers;
  }

  /**
   * 计算事件的综合重要性
   * @private
   */
  static _computeImportance(dims) {
    // 重要性 = 目标相关性 × |目标促进性| × 突然性 × (1 + 应对困难)
    const goalWeight = dims.goalRelevance * Math.abs(dims.goalConduciveness);
    const surpriseWeight = dims.suddenness;
    const copingDifficulty = 1 + (1 - dims.copingPotential) * 0.5;

    return Math.max(0, Math.min(1, goalWeight * surpriseWeight * copingDifficulty));
  }
}

module.exports = Appraisal;
