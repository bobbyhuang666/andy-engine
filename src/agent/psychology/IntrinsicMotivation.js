/**
 * IntrinsicMotivation - 自发动机系统
 *
 * 心理学基础：
 *   - Deci & Ryan (1985, 2017) 自我决定论（SDT）：自主、胜任、关联三大内在需求
 *   - Berlyne (1960, 1966) 好奇心理论：新奇/复杂/不确定性触发探索动机
 *   - Csikszentmihalyi (1990) 心流理论：挑战=技能时进入最优体验
 *   - Oudeyer & Kaplan (2007) 学习进度理论：不是预测误差本身，而是误差的改善速率
 *   - Colas et al. (2022) 自生目标架构（Autotelic/IMGEP）：Agent 自主生成目标
 *
 * 核心理念：
 *   真正的生命不只是被动响应需求衰减和外部事件。
 *   即使所有 Maslow 需求都被满足，Agent 也会产生行动的欲望——
 *   好奇心、审美冲动、想搞明白某件事的渴望。这些驱动来自存在本身。
 *
 * 设计：
 *   - 作为平行于 NeedsSystem 的驱力系统（不扩展 Maslow 层级）
 *   - 好奇心驱力（curiosity）：类似需求，会衰减，被新奇体验满足
 *   - 新奇性追踪：记录每个区域/活动的熟悉度，熟悉的不再触发好奇
 *   - 自生目标：Agent 自主产生探索目标，受人格和学习进度驱动
 *   - 胜任感追踪：监控各活动领域的进步速率
 *   - 需求门控：基本需求匮乏时，自发动机被抑制
 *   - 情绪耦合：好奇心满足→interest/excitement↑，匮乏→boredom/frustration↑
 *
 * 人格调制：
 *   - 开放性 → 好奇心敏感度、新奇寻求
 *   - 外向性 → 社交探索偏好
 *   - 尽责性 → 胜任感动机、坚持性
 *   - 神经质 → 风险回避（抑制探索）
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');

const { RNG } = require('../../shared/rng');
class IntrinsicMotivation {
  /**
   * @param {Object} personality - Personality 实例
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [rng] - RNG 实例（可选）
   */
  constructor(personality, savedState = null, domain = null, rng = null) {
    const cfg = ANDY_DEFAULTS.intrinsicMotivation;
    const behavior = personality.behavior;

    if (!domain) throw new Error('IntrinsicMotivation requires a domain config');
    this.domain = domain;
    this._rng = rng || new RNG(0);
    this._imConfig = this.domain.intrinsicMotivationConfig;

    if (savedState) {
      this.curiosity = Number.isFinite(savedState.curiosity) ? savedState.curiosity : 0.5;
      this.familiarity = savedState.familiarity || {};
      // R10: restore activityFamiliarity (was missing from savedState branch,
      // causing undefined after round-trip despite being set in fresh branch).
      this.activityFamiliarity = savedState.activityFamiliarity || {};
      this.activeGoals = savedState.activeGoals || [];
      this.completedGoals = (savedState.completedGoals || []).slice(-20);
      this.competence = savedState.competence || {};
      this.explorationHistory = (savedState.explorationHistory || []).slice(-50);
      this._ticksSinceGoal = Number.isFinite(savedState._ticksSinceGoal) ? savedState._ticksSinceGoal : 0;
      this._lastGoalId = Number.isFinite(savedState._lastGoalId) ? savedState._lastGoalId : 0;
      this._lastSimTime = savedState._lastSimTime || 0;
    } else {
      this.curiosity = 0.5;
      this.familiarity = {};
      this.activityFamiliarity = {};
      this.activeGoals = [];
      this.completedGoals = [];
      this.competence = {};
      this.explorationHistory = [];
      this._ticksSinceGoal = 0;
      this._lastGoalId = 0;
      this._lastSimTime = 0;
    }

    this._behavior = behavior;
    this._cfg = cfg;
    this._noveltySensitivity = behavior.noveltySeeking;
    this._competenceSensitivity = behavior.competenceMotivation;
    this._explorationDrive = behavior.explorationDrive;
    this._noveltyCache = null;
    this._noveltyCacheTime = null;
  }

  // ═══════════════════════════════════════════
  // 核心 Tick
  // ═══════════════════════════════════════════

  /**
   * 每 tick 调用
   *
   * @param {Object} params
   * @param {string} params.position - 当前区域
   * @param {string} params.state - 当前状态
   * @param {number} params.hour - 当前小时 (0-23)
   * @param {number} params.hoursElapsed - 经过的小时数
   * @param {Date|null} params.simTime - 模拟时间
   * @param {Object} params.needsState - NeedsSystem.needs 快照
   * @returns {Object} { drive, newEvents, emotionEffects }
   */
  tick({ position, state, hour, hoursElapsed, simTime, needsState }) {
    // Store simTime for deterministic fallback in getNovelty()
    if (simTime) this._lastSimTime = simTime.getTime();
    const result = {
      drive: null,
      newEvents: [],
      emotionEffects: null,
    };

    // ─── 0. 清除上一 tick 的新奇性缓存 ───
    this._noveltyCache = {};

    // ─── 1. 记录当前位置访问 ───
    this._recordVisit(position, hoursElapsed, simTime);

    // ─── 2. 好奇心驱力衰减 ───
    this._decayCuriosity(hoursElapsed);

    // ─── 3. 更新目标进度 ───
    this._updateGoals(position, state, simTime);

    // ─── 4. 尝试生成新目标（周期性）───
    this._ticksSinceGoal++;
    if (this._ticksSinceGoal >= this._cfg.goalGenerationInterval) {
      this._maybeGenerateGoal(position, hour, simTime);
      this._ticksSinceGoal = 0;
    }

    // ─── 4.5 新奇体验满足好奇心 ───
    // 在当前位置有新奇感时，好奇心被持续满足
    // 这形成了正反馈循环：探索 → 好奇心满足 → 继续探索
    const currentNovelty = this.getNovelty(position, simTime);
    if (currentNovelty > 0.3) {
      const satisfyAmount = this._cfg.curiositySatisfyOnNovelty * currentNovelty * hoursElapsed;
      this.satisfyCuriosity(satisfyAmount);
    }

    // 活动多样性满足：如果最近访问了多个不同区域，额外满足好奇心
    const recentRegions = new Set(
      this.explorationHistory.slice(-6).map(e => e.region)
    );
    if (recentRegions.size >= 3) {
      this.satisfyCuriosity(0.01 * hoursElapsed);
    }

    // ─── 5. 计算有效好奇心驱力（需求门控）───
    const effectiveCuriosity = this._applyNeedGate(this.curiosity, needsState);

    // ─── 6. 生成驱力信号 ───
    if (effectiveCuriosity > this._cfg.curiosityThreshold) {
      const urgency = effectiveCuriosity - this._cfg.curiosityThreshold;
      result.drive = {
        type: 'curiosity',
        urgency,
        explorationDrive: this._explorationDrive,
        targetStates: this._getExplorationStates(),
        targetRegions: this._getExplorationRegions(position),
        // 连续梯度：好奇心高 → 增加活动性、社交性、表达性
        // [activity, sociality, focus, expressiveness]
        gradientVector: [
          urgency * 0.3 * this._explorationDrive,  // 轻微增加活跃
          urgency * 0.15 * this._explorationDrive,  // 轻微增加社交
          -urgency * 0.1,                            // 降低专注（探索=分散注意力）
          urgency * 0.2 * this._explorationDrive,  // 增加表达
        ],
      };
    }

    // ─── 7. 生成情绪效果 ───
    result.emotionEffects = this._computeEmotionEffects(effectiveCuriosity);

    return result;
  }

  // ═══════════════════════════════════════════
  // 新奇性追踪
  // ═══════════════════════════════════════════

  /**
   * 记录区域访问
   * @private
   */
  _recordVisit(position, hoursElapsed, simTime) {
    if (!this.familiarity[position]) {
      this.familiarity[position] = {
        visits: 0,
        lastVisit: simTime.getTime(),
        totalTime: 0,
      };
    }

    const fam = this.familiarity[position];
    fam.visits++;
    fam.lastVisit = simTime.getTime();
    fam.totalTime += hoursElapsed;

    // 记录探索历史
    if (this.explorationHistory.length === 0 ||
        this.explorationHistory[this.explorationHistory.length - 1].region !== position) {
      this.explorationHistory.push({
       region: position,
        time: simTime.getTime(),
     });
      if (this.explorationHistory.length > 50) {
        this.explorationHistory = this.explorationHistory.slice(-50);
      }
    }
  }

  /**
   * 计算区域的新奇性（0 = 完全熟悉，1 = 完全新奇）
   *
   * 使用对数衰减：前几次访问新奇性快速下降，之后趋于稳定
   * 这模拟了人类的"边际新奇递减"效应
   *
   * @param {string} region
   * @param {Date|null} [simTime] - 当前模拟时间（用于时间遗忘衰减）
   * @returns {number} 0-1
   */
  getNovelty(region, simTime = null) {
    // Tick 内缓存：同一 tick 内对同一区域的多次查询直接返回缓存值
    const cacheKey = region + (simTime ? simTime.getTime() : '');
    if (this._noveltyCache && this._noveltyCache[cacheKey] !== undefined) {
      return this._noveltyCache[cacheKey];
    }

    const fam = this.familiarity[region];
    if (!fam) return 1.0; // 从未去过 = 完全新奇

    // 基础新奇性：对数衰减
    const baseNovelty = 1 / (1 + Math.log2(1 + fam.visits));

    // 时间遗忘：很久没去的地方会重新变得新奇
    // 模拟记忆的指数衰减（Ebbinghaus 1885）
    const now = simTime ? simTime.getTime() : this._lastSimTime;
    const hoursSinceVisit = (now - fam.lastVisit) / (1000 * 60 * 60);
    const forgettingFactor = Math.min(1, hoursSinceVisit / this._cfg.forgettingHours);

    // 最终新奇性 = 基础新奇性 * (1 + 遗忘加成)
    // 遗忘加成让很久没去的地方恢复新奇感
    // forgettingFactor=1 (24h+) 时新奇性翻倍，模拟"故地重游"的新鲜感
    const result = Math.min(1, baseNovelty * (1 + forgettingFactor));

    // 存入缓存
    if (this._noveltyCache) {
      this._noveltyCache[cacheKey] = result;
    }

    return result;
  }

  // ═══════════════════════════════════════════
  // 好奇心驱力
  // ═══════════════════════════════════════════

  /**
   * 好奇心衰减（类似需求衰减）
   *
   * 好奇心不被满足时会"积压"——像饥饿一样，
   * 长期没有新奇体验会让 Agent 更渴望探索。
   * 但衰减率比 Maslow 需求慢得多（不是生存需求）。
   *
   * @private
   */
  _decayCuriosity(hoursElapsed) {
    const cfg = this._cfg;
    // 衰减率被人格调制：开放性高的 Agent 好奇心衰减更快（更快渴望新体验）
    const opennessFactor = 0.7 + this._behavior.noveltySeeking * 0.6;
    const effectiveRate = cfg.curiosityDecayRate * opennessFactor;

    // 好奇心缓慢下降（不像饥饿那样快速）
    // 保留 5% 的存在性基线：即使长期无新奇体验，也保留微弱的好奇火花
    // 这防止 Agent 陷入"习得性无助"（Seligman 1975）：完全失去探索欲望
    this.curiosity = Math.max(0.05, this.curiosity - effectiveRate * hoursElapsed);
  }

  /**
   * 满足好奇心（新奇体验后调用）
   *
   * @param {number} amount - 满足量（0-1）
   */
  satisfyCuriosity(amount) {
    const sensitivity = this._noveltySensitivity;
    const actualAmount = amount * sensitivity;
    this.curiosity = Math.min(1, this.curiosity + actualAmount);
  }

  // ═══════════════════════════════════════════
  // 目标生成
  // ═══════════════════════════════════════════

  /**
   * 尝试生成新的自主目标
   *
   * 基于 Autotelic/IMGEP 架构（Colas et al. 2022）：
   * Agent 自主生成目标，选择依据是"学习进度"——
   * 在哪些领域正在快速进步，就追求哪些目标。
   *
   * @private
   */
  _maybeGenerateGoal(position, hour, simTime) {
    // 不要同时追求太多目标
    if (this.activeGoals.length >= this._cfg.maxActiveGoals) return;

    // 生成概率被人格调制
    const generationProb = 0.3 * this._explorationDrive;
    if (this._rng.next() > generationProb) return;

    // 选择目标类型
    const goalType = this._selectGoalType(position);
    if (!goalType) return;

    // 生成具体目标
    const goal = this._generateGoal(goalType, position, hour, simTime);
    if (goal) {
      this.activeGoals.push(goal);
    }
  }

  /**
   * 选择目标类型（好奇驱动 vs 胜任驱动 vs 习惯突破）
   * @private
   */
  _selectGoalType(position) {
    const r = this._rng.next();

    // 好奇驱动：去没去过/很少去的地方
    if (r < 0.5) return 'explore_new';

    // 胜任驱动：在有学习进度的领域深入
    if (r < 0.8) return 'deepen_skill';

    // 习惯突破：打破常规，做不一样的事
    return 'break_routine';
  }

  /**
   * 生成具体目标
   * @private
   */
  _generateGoal(goalType, position, hour, simTime) {
    this._lastGoalId++;
    const id = this._lastGoalId;
    const now = simTime.getTime();
    const validRegions = new Set(this.domain.regions);

    switch (goalType) {
      case 'explore_new': {
        // 找到最不熟悉且当前时间可达的区域
        const target = this._findLeastFamiliarRegion(position);
        if (!target || !validRegions.has(target)) return null;

        return {
          id,
          type: 'explore_new',
          target,
          createdAt: now,
          deadline: now + this._cfg.goalDeadlineHours * 60 * 60 * 1000,
          status: 'active',
          description: `想去${target}看看`,
        };
      }

      case 'deepen_skill': {
        // 找到学习进度最高的活动领域（用作内部标记，不作为区域名）
        const domain = this._findBestLearningProgress();
        if (!domain) return null;

        // 深入技能目标：目标区域是与该活动相关的区域
        const relatedRegion = this._domainToRegion(domain, position);
        if (!relatedRegion || !validRegions.has(relatedRegion)) return null;

        return {
          id,
          type: 'deepen_skill',
          target: relatedRegion,
          domain, // 保留内部领域标记
          createdAt: now,
          deadline: now + this._cfg.goalDeadlineHours * 60 * 60 * 1000,
          status: 'active',
          description: `想去${relatedRegion}${domain}方面继续练习`,
        };
      }

      case 'break_routine': {
        // 找一个很久没去的地方
        const target = this._findForgottenRegion(position, simTime);
        if (!target || !validRegions.has(target)) return null;

        return {
          id,
          type: 'break_routine',
          target,
          createdAt: now,
          deadline: now + this._cfg.goalDeadlineHours * 60 * 60 * 1000,
          status: 'active',
          description: `想去${target}换个环境`,
        };
      }

      default:
        return null;
    }
  }

  /**
   * 将活动领域映射到相关区域
   * @private
   */
  _domainToRegion(domain, currentPosition) {
    const domainRegionMap = this._imConfig.domainRegionMap || {};

    if (domainRegionMap[domain]) return domainRegionMap[domain];

    return this._findLeastFamiliarRegion(currentPosition);
  }

  /**
   * 找到最不熟悉的区域
   * @private
   */
  _findLeastFamiliarRegion(currentPosition) {
    const regions = this.domain.regions;
    let bestRegion = null;
    let bestNovelty = -1;

    for (const region of regions) {
      if (region === currentPosition) continue;

      const novelty = this.getNovelty(region);
      if (novelty > bestNovelty) {
        bestNovelty = novelty;
        bestRegion = region;
      }
    }

    return bestNovelty > 0.3 ? bestRegion : null;
  }

  /**
   * 找到学习进度最高的活动领域
   * @private
   */
  _findBestLearningProgress() {
    let bestDomain = null;
    let bestProgress = -1;

    for (const [domain, data] of Object.entries(this.competence)) {
      if (data.attempts < 3) continue; // 需要足够的尝试次数
      const progress = data.progressRate || 0;
      if (progress > bestProgress) {
        bestProgress = progress;
        bestDomain = domain;
      }
    }

    return bestProgress > 0.01 ? bestDomain : null;
  }

  /**
   * 找到很久没去的区域（习惯突破）
   * @private
   */
  _findForgottenRegion(currentPosition, simTime) {
    const regions = this.domain.regions;
    const now = simTime.getTime();
    let bestRegion = null;
    let longestGap = 0;

    for (const region of regions) {
      if (region === currentPosition) continue;

      const fam = this.familiarity[region];
      if (!fam) continue;

      const gap = now - fam.lastVisit;
      if (gap > longestGap) {
        longestGap = gap;
        bestRegion = region;
      }
    }

    return longestGap > 24 * 60 * 60 * 1000 ? bestRegion : null;
  }

  // ═══════════════════════════════════════════
  // 目标进度
  // ═══════════════════════════════════════════

  /**
   * 更新所有活跃目标的进度
   * @private
   */
  _updateGoals(position, state, simTime) {
    const now = simTime.getTime();

    for (let i = this.activeGoals.length - 1; i >= 0; i--) {
      const goal = this.activeGoals[i];

      // 检查是否完成
      if (this._checkGoalCompletion(goal, position, state)) {
        goal.status = 'completed';
        goal.completedAt = now;
        this.completedGoals.push(goal);
        // R11: trim in-memory completedGoals to prevent unbounded growth
        if (this.completedGoals.length > 20) {
          this.completedGoals = this.completedGoals.slice(-20);
        }
        this.activeGoals.splice(i, 1);

        // 目标完成满足好奇心
        this.satisfyCuriosity(0.15);

        // 更新胜任感（使用目标 target 作为领域键，而非 goal.type）
        const domain = this._goalToCompetenceDomain(goal);
        if (domain) this._updateCompetence(domain, true);
        continue;
      }

      // 检查是否超时（使用模拟时间比较）
      if (now > goal.deadline) {
        goal.status = 'expired';
        this.activeGoals.splice(i, 1);

        const domain = this._goalToCompetenceDomain(goal);
        if (domain) this._updateCompetence(domain, false);
      }
    }
  }

  /**
   * 将目标映射到胜任感领域键
   * 探索类目标用目标区域名，技能类目标用活动领域
   * @private
   */
  _goalToCompetenceDomain(goal) {
    switch (goal.type) {
      case 'explore_new':
      case 'break_routine':
        return goal.target; // 使用区域名作为领域键
      case 'deepen_skill':
        return goal.domain || goal.target; // 使用活动领域
      default:
        return null;
    }
  }

  /**
   * 检查目标是否完成
   * @private
   */
  _checkGoalCompletion(goal, position, state) {
    switch (goal.type) {
      case 'explore_new':
      case 'break_routine':
        // 到达目标区域即完成
        return position === goal.target;

      case 'deepen_skill':
        // 在相关活动中有进步即完成（用 domain 而非 target 查找，target 是区域名，domain 才是胜任感键）
        const domain = goal.domain || goal.target;
        return this.competence[domain] &&
               this.competence[domain].progressRate > 0.02;

      default:
        return false;
    }
  }

  // ═══════════════════════════════════════════
  // 胜任感追踪
  // ═══════════════════════════════════════════

  /**
   * 更新胜任感（基于学习进度）
   *
   * 不是追踪原始成功率，而是追踪"进步速率"——
   * 正在快速进步的领域比已经达到高水平的领域更有趣。
   * （Oudeyer & Kaplan 2007: Learning Progress）
   *
   * @param {string} domain - 活动领域
   * @param {boolean} success - 是否成功
   */
  _updateCompetence(domain, success) {
    if (!this.competence[domain]) {
      // R11: prune least-recently-updated domains if over limit
      const MAX_COMPETENCE_DOMAINS = 30;
      const keys = Object.keys(this.competence);
      if (keys.length >= MAX_COMPETENCE_DOMAINS) {
        // Remove domain with lowest progressRate (least interesting)
        let worst = keys[0];
        for (const k of keys) {
          if (this.competence[k].progressRate < this.competence[worst].progressRate) {
            worst = k;
          }
        }
        delete this.competence[worst];
      }
      this.competence[domain] = {
        attempts: 0,
        successes: 0,
        ema: 0.5,        // 成功率的指数移动平均
        prevEma: 0.5,     // 上次的 EMA（用于计算进步速率）
        progressRate: 0,  // 进步速率（EMA 变化量）
      };
    }

    const comp = this.competence[domain];
    comp.attempts++;
    if (success) comp.successes++;

    // 更新 EMA（alpha = 0.3，中等平滑）
    const alpha = 0.3;
    comp.prevEma = comp.ema;
    comp.ema = alpha * (success ? 1 : 0) + (1 - alpha) * comp.ema;

    // 进步速率 = EMA 的变化量（正 = 在进步，负 = 在退步）
    comp.progressRate = comp.ema - comp.prevEma;
  }

  // ═══════════════════════════════════════════
  // 需求门控
  // ═══════════════════════════════════════════

  /**
   * 需求门控：基本需求匮乏时抑制自发动机
   *
   * 原理：Overjustification Effect（Deci 1971）
   * 当生存需求未满足时，好奇心等高阶动机被抑制。
   * 当基本需求满足后，自发动机略微增强（"饱暖思淫欲"效应）。
   *
   * @private
   * @param {number} rawCuriosity - 原始好奇心值
   * @param {Object} needsState - NeedsSystem.needs 快照
   * @returns {number} 有效好奇心值
   */
  _applyNeedGate(rawCuriosity, needsState) {
    if (!needsState) return rawCuriosity;

    const cfg = this._cfg;
    const thresholds = ANDY_DEFAULTS.needs.threshold;

    // 计算最低需求满足度（最匮乏的需求决定门控）
    let minSatisfaction = 1;
    for (const [need, threshold] of Object.entries(thresholds)) {
      const value = needsState[need];
      if (value !== undefined) {
        // 饱和度 = 当前值 / 阈值（> 1 表示满足，< 1 表示匮乏）
        const satisfaction = value / threshold;
        minSatisfaction = Math.min(minSatisfaction, satisfaction);
      }
    }

    // 门控函数：
    // satisfaction < 0.5: 严重匮乏，好奇心被强烈抑制
    // satisfaction 0.5-1.0: 线性恢复
    // satisfaction > 1.0: 基本需求满足，好奇心略微增强
    let gate;
    if (minSatisfaction < cfg.needGateThreshold) {
      // 严重匮乏：指数抑制
      gate = Math.pow(minSatisfaction / cfg.needGateThreshold, 2);
    } else if (minSatisfaction < 1) {
      // 轻度匮乏：线性恢复
      gate = (minSatisfaction - cfg.needGateThreshold) / (1 - cfg.needGateThreshold);
    } else {
      // 需求满足：略微增强（"饱暖思淫欲"效应）
      gate = 1 + Math.min(0.2, (minSatisfaction - 1) * 0.2);
    }

    return rawCuriosity * Math.max(0, gate);
  }

  // ═══════════════════════════════════════════
  // 情绪效果
  // ═══════════════════════════════════════════

  /**
   * 计算自发动机对情绪的影响
   *
   * 映射到现有 30 维情绪系统（不添加新维度）：
   *   - 好奇心满足 → interest↑, excitement↑, boredom↓
   *   - 好奇心匮乏 → boredom↑, frustration↑
   *   - 探索新地方 → awe↑, excitement↑
   *   - 目标完成 → pride↑, satisfaction↑, joy↑
   *   - 心流状态 → calm↑, contentment↑, excitement↑
   *
   * @private
   */
  _computeEmotionEffects(effectiveCuriosity) {
    const effects = {};
    const cfg = this._cfg;

    // 好奇心匮乏产生无聊和挫败
    if (effectiveCuriosity < 0.2) {
      const deficit = 0.2 - effectiveCuriosity;
      effects.boredom = deficit * 0.03;
      effects.frustration = deficit * 0.01;
      effects.interest = -deficit * 0.02;
    }

    // 高好奇心产生兴趣和兴奋
    if (effectiveCuriosity > 0.6) {
      const excess = effectiveCuriosity - 0.6;
      effects.interest = excess * 0.02;
      effects.excitement = excess * 0.015;
      effects.boredom = -excess * 0.02;
    }

    // 如果有活跃目标，产生轻微的期待感
    if (this.activeGoals.length > 0) {
      effects.hope = 0.005;
      effects.interest = (effects.interest || 0) + 0.005;
    }

    return Object.keys(effects).length > 0 ? effects : null;
  }

  // ═══════════════════════════════════════════
  // 区域推荐
  // ═══════════════════════════════════════════

  /**
   * 获取探索目标区域列表（用于状态机和位置决策）
   * @private
   */
  _getExplorationRegions(currentPosition) {
    const regions = [];

    for (const goal of this.activeGoals) {
      if (goal.target && goal.status === 'active') {
        regions.push(goal.target);
      }
    }

    const allRegions = this.domain.regions;
    const noveltyRanked = allRegions
      .filter(r => r !== currentPosition && !regions.includes(r))
      .map(r => ({ region: r, novelty: this.getNovelty(r) }))
      .sort((a, b) => b.novelty - a.novelty)
      .slice(0, 3);

    for (const { region } of noveltyRanked) {
      regions.push(region);
    }

    return regions;
  }

  /**
   * 获取探索相关的目标状态（用于状态机权重调制）
   * @private
   */
  _getExplorationStates() {
    return this._imConfig.explorationStates || ['在路上'];
  }

  // ═══════════════════════════════════════════
  // 查询接口
  // ═══════════════════════════════════════════

  /**
   * 获取自发动机的描述（用于调试/提示注入）
   * @returns {string}
   */
  toPromptString() {
    const parts = [];

    parts.push(`好奇心: ${Math.round(this.curiosity * 100)}%`);

    if (this.activeGoals.length > 0) {
      const goalDescs = this.activeGoals.map(g => g.description || g.type);
      parts.push(`当前想做的事: ${goalDescs.join('、')}`);
    }

    // 最近完成的目标
    if (this.completedGoals.length > 0) {
      const last = this.completedGoals[this.completedGoals.length - 1];
      parts.push(`最近完成了: ${last.description || last.type}`);
    }

    // 最有学习进步的领域
    const bestProgress = this._findBestLearningProgress();
    if (bestProgress) {
      const comp = this.competence[bestProgress];
      parts.push(`正在进步: ${bestProgress} (${Math.round(comp.ema * 100)}%)`);
    }

    return parts.join('\n');
  }

  /**
   * 获取状态快照
   */
  getStatus() {
    return {
      curiosity: Math.round(this.curiosity * 100),
      activeGoals: this.activeGoals.length,
      completedGoals: this.completedGoals.length,
      familiarRegions: Object.keys(this.familiarity).length,
    };
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      curiosity: this.curiosity,
      familiarity: this.familiarity,
      // R10: serialize activityFamiliarity for round-trip fidelity
      activityFamiliarity: this.activityFamiliarity || {},
      activeGoals: this.activeGoals.slice(-5), // 只保存最近 5 个
      completedGoals: this.completedGoals.slice(-10),
      competence: this.competence,
      explorationHistory: this.explorationHistory.slice(-50),
      _ticksSinceGoal: this._ticksSinceGoal,
      _lastGoalId: this._lastGoalId,
    };
  }

  /**
   * 从 toJSON 输出反序列化为 IntrinsicMotivation 实例。
   * 恢复路径中应传入真实 Personality / Domain / RNG；省略时构造桩，仅供 round-trip / 测试。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [personality] - Personality 实例
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [rng] - RNG 实例
   * @returns {IntrinsicMotivation}
   */
  static fromJSON(json, personality = null, domain = null, rng = null) {
    const p = personality || { behavior: { noveltySeeking: 0.5, competenceMotivation: 0.5, explorationDrive: 0.5 } };
    return new IntrinsicMotivation(p, json, domain, rng);
  }
}

module.exports = IntrinsicMotivation;
