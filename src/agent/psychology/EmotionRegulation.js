/**
 * EmotionRegulation - 情绪调节模块
 *
 * 基于 James J. Gross 的情绪调节过程模型 (Gross, 1998, 2008, 2015)
 *
 * 核心理念：情绪不仅会被动生成（Appraisal），还会被主动调节（Regulation）
 * Andy 引擎中，Appraisal 处理"事件如何产生情绪"，本模块处理"Agent 如何管理情绪"
 *
 * Gross 模型的四个阶段（按时间顺序）：
 *   1. 情境选择 (Situation Selection) — 选择进入/回避某些情境
 *      → 由 StateMachine + NeedsSystem 处理（Agent 已有）
 *   2. 注意部署 (Attentional Deployment) — 将注意力转向/转离情绪刺激
 *      → 通过记忆检索偏好实现（偏向正面记忆）
 *   3. 认知改变 (Cognitive Change) — 重新解释事件的意义
 *      → 通过修改 Appraisal 的评价结果实现（重评价 reappraisal）
 *   4. 反应调节 (Response Modulation) — 直接调节情绪反应
 *      → 通过情绪向量的衰减/增强实现
 *
 * 文献基础：
 *   - EMAD (2026): 多智能体情绪生成与调节架构
 *   - PSYA (2025): 认知三角模型中的情绪-思想-行动整合
 *   - Pico et al. (2024): 基于 Gross 模型的个性化情绪调节智能体
 *   - Sheppes (2025): 干扰 vs 重评价的计算模型
 *   - Bosse et al. (2010): Gross 过程模型的形式化
 *
 * 人格影响：
 *   - 高开放性 → 更擅长认知重评 (reappraisal)
 *   - 高神经质 → 重评效果较差，更容易陷入反刍
 *   - 高外向性 → 更倾向注意部署（转向社交/活动）
 *   - 高宜人性 → 更倾向情境修改（寻求社会支持）
 *   - 高尽责性 → 更倾向反应调节（自我控制）
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');

const { RNG } = require('../../shared/rng');

function commitStress(agent, stress, env = null) {
  const committer = env?.effectCommitter || null;
  if (committer && typeof committer.commit === 'function') {
    committer.commit({
      deltas: [{
        type: 'emotion',
        target: 'agent',
        agentId: agent.id,
        changes: {},
        multiplier: 1,
        appraisalModifiers: null,
        stress,
      }],
    });
    return;
  }
  agent.emotion.setStress(stress);
}

function commitEmotion(agent, changes, env = null) {
  const committer = env?.effectCommitter || null;
  if (committer && typeof committer.commit === 'function') {
    committer.commit({
      deltas: [{
        type: 'emotion',
        target: 'agent',
        agentId: agent.id,
        changes,
        multiplier: 1,
        appraisalModifiers: null,
        stress: null,
      }],
    });
    return;
  }
  agent.emotion.applyEffect(changes);
}

class EmotionRegulation {
  /**
   * @param {Object} personality - Personality 实例
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [rng] - RNG 实例（可选）
   */
  constructor(personality, savedState = null, rng = null) {
    this.personality = personality;
    this._rng = rng || new RNG(0);
    const ocean = personality.ocean;

    // ─── 策略偏好（基于人格特质）───
    // 每个策略的基础倾向性 [0, 1]
    this.strategyPreference = {
      // 认知重评：开放性促进，神经质抑制
      reappraisal: 0.3 + ocean.openness * 0.4 - ocean.neuroticism * 0.2,
      // 注意部署：外向性促进（转向活动/社交），低尽责性也有利（更容易分心）
      attentionDeployment: 0.2 + ocean.extraversion * 0.3 + (1 - ocean.conscientiousness) * 0.2,
      // 反应调节（抑制/表达控制）：尽责性促进（自我控制），外向性抑制（不愿压抑）
      responseModulation: 0.2 + ocean.conscientiousness * 0.3 - ocean.extraversion * 0.15,
    };

    // 归一化偏好到 [0, 1]
    for (const key of Object.keys(this.strategyPreference)) {
      this.strategyPreference[key] = Math.max(0, Math.min(1, this.strategyPreference[key]));
    }

    // ─── 调节能力参数 ───
    // 重评效力：高开放性的人更容易成功重评
    this.reappraisalPower = 0.3 + ocean.openness * 0.4 - ocean.neuroticism * 0.15;
    // 注意部署效力：高外向性的人更容易转移注意力
    this.attentionPower = 0.2 + ocean.extraversion * 0.35;
    // 抑制效力：高尽责性的人更能控制表达
    this.suppressionPower = 0.2 + ocean.conscientiousness * 0.3;

    // ─── 调节资源（自我损耗模型, Baumeister 1998）───
    // 频繁调节会消耗资源，导致后续调节效果下降
    this._regulationResource = Number.isFinite(savedState?._regulationResource) ? savedState._regulationResource : 1.0; // 1.0 = 充满, 0.0 = 枯竭
    this._regulationCount = Number.isFinite(savedState?._regulationCount) ? savedState._regulationCount : 0;

    // ─── 内部状态 ───
    this._regulationTickCounter = Number.isFinite(savedState?._regulationTickCounter) ? savedState._regulationTickCounter : 0;
    this._reappraisalHistory = savedState?._reappraisalHistory ?? []; // 近期重评记录
  }

  // ═══════════════════════════════════════════
  // 核心接口
  // ═══════════════════════════════════════════

  /**
   * 尝试调节情绪（在事件被感知后调用）
   *
   * 调用时机：Agent._perceiveEvents 之后，但在情绪 tick 之前
   *
   * @param {Object} agent - Agent 实例
   * @param {Object[]} recentEvents - 最近感知到的事件
   * @param {Object} [env] - runtime env with effectCommitter
   * @returns {Object|null} 调节动作 { strategy, effect, cost } 或 null（无需调节）
   */
  tryRegulate(agent, recentEvents = [], env = null) {
    const valence = agent.emotion.getValence();
    const arousal = agent.emotion.getArousal();
    const stress = agent.emotion.stress || 0;

    // NaN 保护：如果效价或唤醒度为 NaN，跳过调节
    if (!Number.isFinite(valence) || !Number.isFinite(arousal)) return null;

    // ─── 检查是否需要调节 ───
    // 触发条件：负面效价、高压力、或高唤醒
    const negativeIntensity = Math.max(0, -valence);
    const stressIntensity = stress / 10;
    const triggerLevel = Math.max(negativeIntensity, stressIntensity);

    // 神经质高的人触发阈值更低（更频繁调节）
    // 降低阈值使正常条件下的负面情绪也能触发调节
    // 参考 Gross (2015): 人们在日常生活中频繁使用情绪调节策略
    const threshold = 0.15 - this.personality.ocean.neuroticism * 0.05;
    if (triggerLevel < threshold) {
      return null; // 情绪尚可，不需要调节
    }

    // ─── 检查调节资源 ───
    if (this._regulationResource < 0.1) {
      return null; // 资源枯竭，无法调节
    }

    // ─── 选择调节策略 ───
    const strategy = this._selectStrategy(triggerLevel, valence, arousal, stress);

    // ─── 执行调节 ───
    const effect = this._executeStrategy(strategy, agent, triggerLevel, env);

    // ─── 更新资源 ───
    const cost = effect.cost || 0;
    this._regulationResource = Math.max(0, this._regulationResource - cost);
    this._regulationCount++;
    this._regulationTickCounter++;

    return {
      strategy,
      effect: effect.emotionDelta,
      cost,
      resourceRemaining: this._regulationResource,
    };
  }

  /**
   * 推进调节资源恢复
   * @param {number} hoursElapsed
   * @param {string} currentState - Agent 当前状态
   * @param {Object} [domain] - DomainRegistry 实例（用于状态分类查询）
   */
  tick(hoursElapsed, currentState, domain) {
    // 资源自然恢复（类似精力恢复）
    // 休息状态恢复更快：通过 domain 状态分类判断
    let isResting = false;
    if (domain && domain.states && currentState) {
      const stateDef = domain.states[currentState];
      if (stateDef) {
        isResting = stateDef.category === 'rest' || stateDef.category === 'sleep';
      }
    }

    const baseRecovery = 0.05; // 每小时恢复 5%
    const restBonus = isResting ? 0.1 : 0; // 休息时额外恢复 10%
    const recoveryRate = baseRecovery + restBonus;

    this._regulationResource = Math.min(1,
      this._regulationResource + recoveryRate * hoursElapsed
    );
    if (!Number.isFinite(this._regulationResource)) this._regulationResource = 1;

    // 定期衰减调节计数
    if (hoursElapsed > 0) {
      this._regulationCount = Math.max(0, this._regulationCount - hoursElapsed * 0.5);
    }

    // 清理旧的重评历史（保留最近 10 条）
    if (this._reappraisalHistory.length > 10) {
      this._reappraisalHistory = this._reappraisalHistory.slice(-10);
    }
  }

  // ═══════════════════════════════════════════
  // 策略选择
  // ═══════════════════════════════════════════

  /**
   * 选择最优调节策略
   *
   * 参考 Sheppes (2025): 刺激强度影响策略选择
   *   - 低强度负面 → 偏好认知重评（长期有效）
   *   - 高强度负面 → 偏好注意部署（即时缓解）
   *
   * @private
   * @param {number} triggerLevel - 情绪触发强度 [0, 1]
   * @param {number} valence - 当前效价
   * @param {number} arousal - 当前唤醒度
   * @param {number} stress - 当前压力
   * @returns {string} 策略名称
   */
  _selectStrategy(triggerLevel, valence, arousal, stress) {
    // 计算每个策略的效用值
    const utilities = {};

    // 认知重评：低-中强度时最有效，高强度时效果下降（Sheppes 2025）
    const reappraisalAffordance = triggerLevel < 0.6 ? 1.0 : 0.6;
    utilities.reappraisal = this.strategyPreference.reappraisal * reappraisalAffordance * this._regulationResource;

    // 注意部署：高强度时最有效（Sheppes 2025: 高强度偏好干扰）
    const attentionAffordance = triggerLevel > 0.4 ? 1.0 : 0.7;
    utilities.attentionDeployment = this.strategyPreference.attentionDeployment * attentionAffordance * this._regulationResource;

    // 反应调节（表达抑制）：高唤醒时可能被使用，但有副作用
    // Gross (2001): 抑制表达虽能减少外显情绪，但不减少主观感受且消耗更多资源
    const suppressionAffordance = arousal > 0.6 ? 0.8 : 0.4;
    utilities.responseModulation = this.strategyPreference.responseModulation * suppressionAffordance * this._regulationResource;

    // 加入少量随机性（人格并非完全决定策略选择）
    for (const key of Object.keys(utilities)) {
      utilities[key] *= (0.8 + this._rng.next() * 0.4);
    }

    // 选择最高效用的策略
    let bestStrategy = 'reappraisal';
    let bestUtility = 0;
    for (const [strategy, utility] of Object.entries(utilities)) {
      if (utility > bestUtility) {
        bestUtility = utility;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  }

  // ═══════════════════════════════════════════
  // 策略执行
  // ═══════════════════════════════════════════

  /**
   * 执行选定的调节策略
   * @private
   * @param {string} strategy
   * @param {Object} agent
   * @param {number} triggerLevel
   * @returns {Object} { emotionDelta, cost }
   */
  _executeStrategy(strategy, agent, triggerLevel, env = null) {
    switch (strategy) {
      case 'reappraisal':
        return this._execReappraisal(agent, triggerLevel, env);
      case 'attentionDeployment':
        return this._execAttentionDeployment(agent, triggerLevel, env);
      case 'responseModulation':
        return this._execResponseModulation(agent, triggerLevel, env);
      default:
        return { emotionDelta: {}, cost: 0 };
    }
  }

  /**
   * 认知重评 (Cognitive Reappraisal)
   *
   * 通过改变对事件的认知评价来调节情绪。
   * 例如："考核很难" → "这是一个学习的机会"
   *       "被拒绝了" → "也许是更好的安排"
   *
   * 效果：降低负面情绪，略微提升正面情绪
   * 副作用：最小（最健康的调节策略）
   *
   * @private
   */
  _execReappraisal(agent, triggerLevel, env = null) {
    const power = this.reappraisalPower * this._regulationResource;

    // 重评降低负面情绪
    const negativeReduction = triggerLevel * power * 0.15;

    const emotionDelta = {
      sadness: -negativeReduction * 0.8,
      frustration: -negativeReduction * 0.7,
      anger: -negativeReduction * 0.5,
      nervousness: -negativeReduction * 0.6,
      loneliness: -negativeReduction * 0.3,
      // 重评也可能带来正面感受（平静、满足）
      calm: negativeReduction * 0.4,
      hope: negativeReduction * 0.3,
      contentment: negativeReduction * 0.2,
    };

    // 记录重评历史
    this._reappraisalHistory.push({
      triggerLevel,
      success: power > 0.3,
      time: this._regulationTickCounter,
    });

    // 应用情绪变化
    commitEmotion(agent, emotionDelta, env);

    // 重评也略微降低压力
    commitStress(agent, agent.emotion.stress - triggerLevel * power * 0.3, env);

    // 成本：重评消耗认知资源（但比抑制少）
    const cost = 0.05 + triggerLevel * 0.05;

    return { emotionDelta, cost };
  }

  /**
   * 注意部署 (Attentional Deployment)
   *
   * 将注意力从负面刺激转移到中性或正面刺激。
   * 例如："不去想那件事了" → "想想别的"
   *
   * 在 Andy 引擎中的实现：
   *   - 通过记忆系统检索正面记忆（mood-incongruent recall）
   *   - 暂时降低负面情绪的强度
   *
   * 效果：快速降低负面情绪
   * 副作用：问题可能未被解决（只是暂时回避）
   *
   * @private
   */
  _execAttentionDeployment(agent, triggerLevel, env = null) {
    const power = this.attentionPower * this._regulationResource;

    // 注意部署的效果是暂时压制负面情绪（不解决根本原因）
    const suppression = triggerLevel * power * 0.12;

    const emotionDelta = {
      sadness: -suppression * 0.6,
      frustration: -suppression * 0.5,
      nervousness: -suppression * 0.4,
      boredom: suppression * 0.3, // 转移注意力可能带来无聊
      interest: suppression * 0.2, // 对新事物的兴趣
    };

    // 如果 Agent 有记忆系统，尝试检索正面记忆
    if (agent.memory) {
      // 注意部署的本质：将注意力转向正面线索
      // 这里通过情绪一致性偏差的反转来实现
      // （正常是 mood-congruent recall，注意部署是 mood-incongruent recall）
      const domain = agent.domain;
      const erConfig = domain && domain.emotionRegulationConfig;
      const positiveKeywords = (erConfig && erConfig.positiveMemoryKeywords)
        || (domain && domain.semanticProfile && domain.semanticProfile.emotionRegulationKeywords && domain.semanticProfile.emotionRegulationKeywords.positiveMemory)
        || ['开心', '高兴', '满意', '有趣', '朋友', '成功'];
      const { memories: positiveMemories, recallEmotionDelta } = agent.memory.retrieve({
        keywords: positiveKeywords,
        emotion: { joy: 0.5, contentment: 0.3 }, // 检索正面情绪的记忆
      }, 2);

      if (positiveMemories.length > 0) {
        // 使用 recallEmotionDelta 获取记忆驱动的情绪反馈
        // 比硬编码值更准确，因为考虑了记忆重要性和情绪标签
        if (recallEmotionDelta && Object.keys(recallEmotionDelta).length > 0) {
          for (const [dim, value] of Object.entries(recallEmotionDelta)) {
            if (Number.isFinite(value)) {
              emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
            }
          }
        } else {
          // 降级：如果没有 recallEmotionDelta，使用基础正面情绪增量
          emotionDelta.joy = (emotionDelta.joy || 0) + 0.02;
          emotionDelta.hope = (emotionDelta.hope || 0) + 0.02;
        }
      }
    }

    commitEmotion(agent, emotionDelta, env);

    // 成本：比重评略高（需要持续努力转移注意力）
    const cost = 0.08 + triggerLevel * 0.06;

    return { emotionDelta, cost };
  }

  /**
   * 反应调节 / 表达抑制 (Response Modulation / Expressive Suppression)
   *
   * 直接压制情绪的外在表达。
   * 例如："忍住不哭"、"保持冷静"
   *
   * 效果：降低外在唤醒度
   * 副作用（Gross, 2001）：
   *   - 不减少主观负面感受
   *   - 增加生理唤醒（更耗能）
   *   - 消耗更多认知资源
   *   - 长期使用损害社交关系
   *
   * @private
   */
  _execResponseModulation(agent, triggerLevel, env = null) {
    const power = this.suppressionPower * this._regulationResource;

    // 抑制主要影响高唤醒情绪
    const suppression = triggerLevel * power * 0.1;

    const emotionDelta = {
      // 抑制高唤醒负面情绪
      anger: -suppression * 0.3,
      fear: -suppression * 0.3,
      surprise: -suppression * 0.4,
      excitement: -suppression * 0.2,
      // 但增加内化负面情绪（Gross 2001 的副作用）
      nervousness: suppression * 0.2,
      frustration: suppression * 0.15,
    };

    commitEmotion(agent, emotionDelta, env);

    // 成本最高（抑制消耗大量认知资源）
    const cost = 0.12 + triggerLevel * 0.08;

    return { emotionDelta, cost };
  }

  // ═══════════════════════════════════════════
  // 查询接口
  // ═══════════════════════════════════════════

  /**
   * 获取当前调节状态（用于调试/提示注入）
   * @returns {string}
   */
  toPromptString() {
    const resourceDesc =
      this._regulationResource > 0.7 ? '调节能力充足' :
      this._regulationResource > 0.4 ? '调节能力一般' :
      this._regulationResource > 0.1 ? '调节能力不足' : '调节资源枯竭';

    const prefDesc = [];
    if (this.strategyPreference.reappraisal > 0.5) prefDesc.push('善于重评价');
    if (this.strategyPreference.attentionDeployment > 0.5) prefDesc.push('善于转移注意力');
    if (this.strategyPreference.responseModulation > 0.5) prefDesc.push('善于控制表达');

    return `情绪调节：${resourceDesc}。${prefDesc.length > 0 ? '擅长' + prefDesc.join('、') + '。' : ''}`;
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      _regulationResource: this._regulationResource,
      _regulationCount: this._regulationCount,
      _regulationTickCounter: this._regulationTickCounter,
      _reappraisalHistory: this._reappraisalHistory.slice(-10),
    };
  }

  /**
   * 从 toJSON 输出反序列化为 EmotionRegulation 实例。
   * 恢复路径中应传入真实 Personality 与 RNG；省略时构造桩，仅供 round-trip / 测试。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [personality] - Personality 实例
   * @param {Object} [rng] - RNG 实例
   * @returns {EmotionRegulation}
   */
  static fromJSON(json, personality = null, rng = null) {
    const p = personality || { ocean: { neuroticism: 0.5, extraversion: 0.5, openness: 0.5, conscientiousness: 0.5, agreeableness: 0.5 } };
    return new EmotionRegulation(p, json, rng);
  }
}

module.exports = EmotionRegulation;
