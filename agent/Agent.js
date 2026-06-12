/**
 * Agent - 自主代理
 *
 * 核心约束：
 *   - Agent 不能直接修改其他 Agent 的内部状态
 *   - Agent 只能通过 Interaction 间接影响彼此
 *   - Agent 的行为受 personality 约束
 *
 * 每个 tick 执行：
 *   1. 感知环境 → 更新内部状态
 *   2. 检查日程 → 决定当前应该做什么
 *   3. 情绪演化 → 基于环境 + 内部状态推移
 *   4. 返回动作（位置变化、状态变化、情绪变化等）
 */

const Personality = require('./Personality');
const EmotionVector = process.env.ANDY_USE_NATIVE === '1'
  ? require('./EmotionVector.native')
  : require('./EmotionVector');
const { StateMachine, STATES } = require('./StateMachine');
const PersonalMemory = require('./PersonalMemory');
const Schedule = require('./Schedule');
const Appraisal = require('./Appraisal');
const ProceduralMemory = require('./ProceduralMemory');
const NeedsSystem = process.env.ANDY_USE_NATIVE === '1'
  ? require('./NeedsSystem.native')
  : require('./NeedsSystem');
const EmotionRegulation = require('./EmotionRegulation');
const IntrinsicMotivation = require('./IntrinsicMotivation');
const { BehaviorField } = require('./BehaviorField');
const { DIM_ACTIVITY, DIM_SOCIALITY, DIM_FOCUS, DIM_EXPRESSIVENESS } = require('./BehaviorLabeler');
const { EMOTION_DIMENSIONS, ANDY_DEFAULTS } = require('../config/defaults');
const { applyForbiddenTerms } = require('../core/WorldviewConstraints');

class Agent {
  /**
   * @param {Object} config
   * @param {string} config.id - 唯一标识
   * @param {string} config.name - 角色名
   * @param {Object} config.personality - 人格配置 { mbti, ocean, modifiers }
   * @param {Object} config.schedule - 日程配置
   * @param {Object[]} [config.seedMemories] - 种子记忆
   * @param {Object} [savedState] - 恢复的完整状态
   */
  constructor(config, savedState = null) {
    this.id = config.id;
    this.name = config.name;
    this._domain = config.domain || null;
    this._rng = config.rng || null;

    if (savedState) {
      this.personality = Personality.fromJSON(savedState.personality);
      this.emotion = new EmotionVector(this.personality, savedState.emotion, this._rng);
      this.stateMachine = new StateMachine(null, savedState.stateMachine, this._domain);
      this.memory = new PersonalMemory(this.id, [], savedState.memory, this._domain, this._rng);
      if (savedState.appraisalBiases) {
        this.memory.appraisalBiases = savedState.appraisalBiases;
      }
      this.proceduralMemory = new ProceduralMemory(savedState.proceduralMemory);
      this.needs = new NeedsSystem(this.personality, savedState.needs, this._domain);
      this.emotionRegulation = new EmotionRegulation(this.personality, savedState.emotionRegulation, this._rng);
      this.intrinsicMotivation = new IntrinsicMotivation(this.personality, savedState.intrinsicMotivation, this._domain, this._rng);
      this.schedule = new Schedule(config.schedule, savedState.schedule, this._rng);
      this.position = savedState.position;
      this.socialEnergy = savedState.socialEnergy ?? 0.7;
      this.health = savedState.health ?? 1.0;
      this.isOnline = savedState.isOnline ?? true;
      this.behaviorField = new BehaviorField(this.personality, savedState.behaviorField || null, {}, this._domain, this._rng);
      this._wireBehaviorFieldToStateMachine();
    } else {
      const personalityConfig = { ...(config.personality || {}) };
      if (config.mbti && !personalityConfig.mbti) {
        personalityConfig.mbti = config.mbti;
      }
      this.personality = new Personality(personalityConfig);
      this.emotion = new EmotionVector(this.personality, null, this._rng);
      this.stateMachine = new StateMachine(config.initialState || null, null, this._domain);
      this.memory = new PersonalMemory(this.id, config.seedMemories || [], null, this._domain, this._rng);
      this.proceduralMemory = new ProceduralMemory();
      this.needs = new NeedsSystem(this.personality, null, this._domain);
      this.emotionRegulation = new EmotionRegulation(this.personality, null, this._rng);
      this.intrinsicMotivation = new IntrinsicMotivation(this.personality, null, this._domain, this._rng);
      this.schedule = new Schedule(config.schedule || {}, null, this._rng);
      this.position = config.initialPosition || (this._domain ? this._domain.fallback.defaultRegion : '住处');
      this.socialEnergy = 0.7;
      this.health = 1.0;
      this.isOnline = true;
      this.behaviorField = new BehaviorField(this.personality, null, {}, this._domain, this._rng);

      const initState = config.initialState;
      if (initState) {
        const domain = this._domain || require('../domain/DomainRegistry').getDefaultDomain();
        const center = domain.stateCenters[initState];
        if (center) {
          this.behaviorField.B = [...center];
          this.behaviorField._lastLabel = initState;
          this.behaviorField._prevB = [...center];
        }
      }

      this._wireBehaviorFieldToStateMachine();
    }

    this._behavior = this.personality.behavior;
    this._socialGraphRef = null;
    this._ticksSinceReflection = 0;
    this._reflectionInterval = 12;
    this._recentEventTypes = new Set();
    this._ticksSinceDriftCheck = 0;
  }

  /**
   * 获取随机数（路由到 RNG 或回退 Math.random）
   * @private
   */
  _rand() {
    return this._rng ? this._rng.next() : Math.random();
  }

  /**
   * Phase 5: 将 stateMachine.currentState 替换为 BehaviorField 驱动的 getter
   *
   * 所有读取 `this.stateMachine.currentState` 的下游代码自动使用连续标签。
   * stateMachine 的其他属性（history, stateEnteredAt 等）保持不变。
   * @private
   */
  _wireBehaviorFieldToStateMachine() {
    const bf = this.behaviorField;
    Object.defineProperty(this.stateMachine, 'currentState', {
      get() { return bf.label; },
      set() { /* 忽略写入：currentState 由 BehaviorField 驱动 */ },
      configurable: true,
      enumerable: true,
    });
  }

  // ═══════════════════════════════════════════
  // 核心 Tick 逻辑
  // ═══════════════════════════════════════════

  /**
   * Agent 主循环 - 每个 tick 调用
   *
   * @param {Object} env - 环境状态 { hour, dayOfWeek, weather, minutesElapsed }
   * @param {Object[]} perceivedEvents - 本 tick 可感知的事件
   * @param {Object|null} contagionInputs - 社交传染输入
   * @returns {Object} Agent 动作 { stateChanged, regionChanged, newEvents, emotionSnapshot }
   */
  tick(env, perceivedEvents = [], contagionInputs = null) {
    const result = {
      stateChanged: false,
      regionChanged: false,
      newEvents: [],
      emotionSnapshot: null,
    };

    if (!this.isOnline) return result;

    // 防御性检查：env 必须是有效对象
    if (!env || typeof env !== 'object') {
      return result;
    }

    const hoursElapsed = Math.max(0, (env.minutesElapsed || 5) / 60);

    // 提前注入模拟时间（多个子系统依赖此时间）
    if (env.simTime) {
      this.memory.setSimTime(env.simTime);
      this.proceduralMemory.setSimTime(env.simTime);
    }

    // 防御性检查：确保 perceivedEvents 始终是数组
    const safeEvents = Array.isArray(perceivedEvents) ? perceivedEvents : [];

    // ─── 1. 感知环境 & 处理事件 ───
    this._perceiveEvents(safeEvents);

    // ─── 1.5 情绪调节（Gross 过程模型）───
    // 在事件感知后、情绪演化前进行主动调节
    const regulationResult = this.emotionRegulation.tryRegulate(this, safeEvents);
    if (regulationResult) {
      result.newEvents.push({
        type: 'regulation',
        strategy: regulationResult.strategy,
        time: env.simTime?.toISOString(),
      });
    }

    // ─── 2. 需求演化 ───
    // Phase 4: 使用连续行为向量替代离散状态查表
    this.needs.tickWithBehavior(hoursElapsed, this.behaviorField.B);

    // ─── 2.5 自发动机演化 ───
    // 在需求之后、日程之前计算自发动机（优先级：紧急需求 > 自发动机 > 日程）
    const imResult = this.intrinsicMotivation.tick({
      position: this.position,
      state: this.stateMachine.currentState,
      hour: env.hour,
      hoursElapsed,
      simTime: env.simTime,
      needsState: this.needs.needs,
    });

    // 自发动机的情绪效果
    if (imResult.emotionEffects) {
      this.emotion.applyEffect(imResult.emotionEffects);
    }

    // ─── 3. 检查日程，决定位置（需求驱力 > 自发动机 > 日程）───
    const needsDrive = this.needs.getDrive();
    const scheduleResult = this._checkSchedule(env.hour, env.dayOfWeek, env.simDate);
    if (scheduleResult.moved) {
      result.regionChanged = true;
      this.position = scheduleResult.region;

      // 处理跳过日程的替代行为
      if (scheduleResult.skipEvent) {
        // 强制转移到替代状态：将 BehaviorField B 向量设为目标状态的中心点
        // 这比写 stateMachine.currentState 更可靠（getter 已被 BehaviorField 驱动）
        if (scheduleResult.altState) {
          const { STATE_CENTERS } = require('./BehaviorLabeler');
          const targetCenter = STATE_CENTERS[scheduleResult.altState];
          if (targetCenter) {
            const prevLabel = this.behaviorField.label;
            this.behaviorField.B = [...targetCenter];
            this.behaviorField.velocity = [0, 0, 0, 0]; // 重置速度
            if (prevLabel !== scheduleResult.altState) {
              result.stateChanged = true;
              result.newEvents.push({
                type: 'state_change',
                from: prevLabel,
                to: scheduleResult.altState,
                time: env.simTime?.toISOString(),
              });
              this.stateMachine.stateEnteredAt = env.simTime || new Date();
              this.stateMachine.history.push({
                from: prevLabel,
                to: scheduleResult.altState,
                at: (env.simTime || new Date()).toISOString(),
              });
            }
          }
        }

        // 为跳过行为生成记忆事件
        const skipMemory = this._generateSkipMemory(scheduleResult.skipEvent, env);
        if (skipMemory) {
          this.memory.addExperience(skipMemory, this.emotion);
          result.newEvents.push(skipMemory);
        }
      }
    } else if (needsDrive && needsDrive.urgency > 0.05) {
      // 紧急需求覆盖日程：寻找能满足需求的区域
      const needRegion = this._findNeedRegion(needsDrive.need);
      if (needRegion && needRegion !== this.position) {
        result.regionChanged = true;
        this.position = needRegion;
      }
    } else if (imResult.drive && imResult.drive.urgency > 0.1) {
      // 自发动机驱动探索：在空闲时前往探索区域
      // 夜间（22点到次日6点）或睡觉状态时不应该探索
      const isNight = env.hour >= 22 || env.hour < 6;
      const stateDef = this._domain ? this._domain.states[this.stateMachine.currentState] : null;
      const isSleeping = stateDef ? stateDef.category === 'sleep' : (this.stateMachine.currentState === '睡了' || this.stateMachine.currentState === '睡觉' || this.stateMachine.currentState === '在睡觉');

      if (!isNight && !isSleeping) {
        const explorationRegions = imResult.drive.targetRegions;
        if (explorationRegions && explorationRegions.length > 0) {
          const target = explorationRegions[0]; // 最新奇的区域
          if (target !== this.position) {
            result.regionChanged = true;
            this.position = target;
          }
        }
      }
    }

    // ─── 4. 连续行为场（BehaviorField，唯一行为决策源）───
    const prevLabel = this.behaviorField.label;
    const behaviorSignals = this.buildBehaviorSignals(env);
    const behaviorResult = this.behaviorField.tick(behaviorSignals);
    result.behaviorField = behaviorResult;

    // 标签变化 → 生成状态转移事件（向下游兼容）
    if (behaviorResult.label !== prevLabel) {
      result.stateChanged = true;
      result.newEvents.push({
        type: 'state_change',
        from: prevLabel,
        to: behaviorResult.label,
        time: env.simTime?.toISOString(),
      });
      // 同步 StateMachine 的 stateEnteredAt（保持时间追踪）
      this.stateMachine.stateEnteredAt = env.simTime || new Date();
      this.stateMachine.history.push({
        from: prevLabel,
        to: behaviorResult.label,
        at: (env.simTime || new Date()).toISOString(),
      });
      if (this.stateMachine.history.length > 20) {
        this.stateMachine.history = this.stateMachine.history.slice(-20);
      }
    }

    // ─── 4.1 需求→情绪耦合 ───
    // 需求匮乏直接影响情绪（Maslow 1943: 低层需求未满足产生焦虑/烦躁）
    // 参考: 反刍思维理论 (Nolen-Hoeksema 1991): 饥饿/疲劳增加负面情绪敏感性
    this._applyNeedsToEmotion();

    // ─── 3.6 健康系统更新 ───
    // 身体健康状态受多种因素影响：睡眠不足、高压力、恶劣天气等
    this._updateHealth(hoursElapsed, env);

    // ─── 4. 情绪演化 ───
    this.emotion.tick(hoursElapsed, env.hour, contagionInputs);

    // ─── 4.5 情绪调节资源恢复 ───
    this.emotionRegulation.tick(hoursElapsed, this.stateMachine.currentState);

    // ─── 5. 记忆维护 ───
    this.memory.tick(hoursElapsed);

    // ─── 6. 社交能量更新 ───
    this._updateSocialEnergy(hoursElapsed);

    // ─── 7. 程序性记忆：记录行为 & 推进衰减 ───
    this.proceduralMemory.recordAction({
      hour: env.hour,
      dayOfWeek: env.dayOfWeek,
      position: this.position,
      state: this.stateMachine.currentState,
      valence: this.emotion.getValence(),
      region: this.position,
    });
    this.proceduralMemory.tick(hoursElapsed);

    // 意外事件打破习惯
    if (safeEvents.length > 0) {
      for (const event of safeEvents) {
        if (event.type === 'random' || event.type === 'causal') {
          this.proceduralMemory.disrupt(0.3);
          break;
        }
      }
    }

    // ─── 8. 定期反思 ───
    this._ticksSinceReflection++;
    if (this._ticksSinceReflection >= this._reflectionInterval) {
      this._reflect();
      this._ticksSinceReflection = 0;
    }

    // ─── 8.5 心智游移（Mind Wandering / Default Mode Network）───
    // 在空闲/安静状态下，Agent 会自发产生与当前任务无关的思绪
    // 参考: Raichle (2001) DMN, Killingsworth & Gilbert (2010), Buckner et al. (2008)
    // Phase 4: 使用连续行为向量替代离散状态列表
    // 低活跃 (activity < 0.3) + 低专注 (focus < 0.3) = 空闲状态
    const B = this.behaviorField.B;
    const isQuiet = B[DIM_ACTIVITY] < 0.3 && B[DIM_FOCUS] < 0.3;
    if (isQuiet) {
      // 空闲状态下概率发生心智游移（可配置）
      if (this._rand() < (ANDY_DEFAULTS.mindWander?.quietProbability || 0.25)) {
        const thought = this._mindWander();
        if (thought) {
          result.newEvents.push(thought);
        }
      }
    }

    // ─── 9. 人格漂移 & 评价偏移衰减 ───
    // 每 tick 推进 appraisal bias 衰减
    this.memory.tickAppraisalBiases();

    // 每 100 tick 检查人格漂移（基于累积事件统计）
    this._ticksSinceDriftCheck = (this._ticksSinceDriftCheck || 0) + 1;
    if (this._ticksSinceDriftCheck >= 100) {
      this.personality.drift();
      this._ticksSinceDriftCheck = 0;
    }

    // ─── 10. 情绪快照 ───
    result.emotionSnapshot = {
      valence: this.emotion.getValence(),
      arousal: this.emotion.getArousal(),
      dominant: this.emotion.getDominant(3),
      promptString: this.emotion.toPromptString(),
    };

    return result;
  }

  /**
   * 感知并处理事件（集成认知评价系统）
   *
   * 事件处理管线（参考 Sentipolis 2025 + CPM-RL）：
   *   1. 认知评价（Appraisal）— 快速、自动的过程
   *   2. 情绪反应 — 基于评价结果修正
   *   3. 记忆存储 — 带有评价标签的记忆
   *
   * @private
   */
  _perceiveEvents(events) {
    // P0 优化：每 tick 开始时重建最近事件类型集合（供 Appraisal._evalSuddenness O(1) 查表）
    this._recentEventTypes.clear();
    for (const event of events) {
      if (event.type) this._recentEventTypes.add(event.type);
    }

    for (const event of events) {
      // ─── Step 1: 认知评价 ───
      const appraisal = Appraisal.evaluate(event, this);

      // ─── Step 2: 带评价的情绪反应 ───
      for (const effect of event.effects) {
        if (effect.target === this.id && effect.type === 'emotion') {
          // 使用评价修正因子调制情绪效果
          this.emotion.applyEffect(effect.delta, 1, appraisal.emotionModifier);
        }
      }

      // 评价结果也会直接影响一些情绪
      if (appraisal.importance > 0.5) {
        // 高重要性事件本身产生情绪波动
        const importantDelta = {};
        if (appraisal.dimensions.suddenness > 0.6) {
          importantDelta.surprise = appraisal.dimensions.suddenness * 0.03;
        }
        if (appraisal.dimensions.copingPotential < 0.3) {
          importantDelta.nervousness = 0.02;
        }
        if (Object.keys(importantDelta).length > 0) {
          this.emotion.applyEffect(importantDelta);
        }
      }

      // ─── Step 3: 带评价标签的记忆存储 ───

      // 记录事件到人格漂移窗口（#3：基于累积统计，非单次事件）
      this.personality.recordEventForDrift({
        type: event.type || 'general',
        valence: appraisal.dimensions.pleasantness,
        isNegative: appraisal.dimensions.pleasantness < -0.15,
        highStress: this.emotion.stress > 6,
      });

      // 重大事件 → 创建 Appraisal Bias（#7：单次高重要性事件 → 即时偏移）
      if (appraisal.importance > 0.7 && appraisal.dimensions.pleasantness < -0.2) {
        const eventType = event.type || 'general';
        this.memory.addAppraisalBias({
          eventType: eventType === 'interaction' ? 'social' : eventType,
          valenceShift: appraisal.dimensions.pleasantness * 0.3, // 偏移量为事件效价的 30%
          decay: 0.0005,
          reason: (event.content || '').slice(0, 30),
        });
      }

      if (event.content) {
        // 将评价结果附加到记忆中，用于后续反思和检索
        const enrichedEvent = {
          ...event,
          _appraisal: {
            valence: appraisal.dimensions.pleasantness,
            suddenness: appraisal.dimensions.suddenness,
            goalRelevance: appraisal.dimensions.goalRelevance,
            copingPotential: appraisal.dimensions.copingPotential,
            agency: appraisal.dimensions.agency.label,
            importance: appraisal.importance,
          },
          // 空间-状态上下文（供记忆系统的语义分类和行为后果评估使用）
          _region: this.position,
          _currentState: this.stateMachine.currentState,
        };
        this.memory.addExperience(enrichedEvent, this.emotion, appraisal.importance);
      }

      // 压力更新：负面事件增加压力
      // 降低触发条件：任何略微不愉快的事件都会累积压力
      if (appraisal.dimensions.pleasantness < 0) {
        const stressIncrease = Math.abs(appraisal.dimensions.pleasantness) * appraisal.importance * 0.8;
        this.emotion.setStress(this.emotion.stress + Math.max(0.05, stressIncrease));
      } else if (appraisal.dimensions.pleasantness > 0.2) {
        // 正面事件减轻压力
        this.emotion.setStress(this.emotion.stress - 0.15);
      }
    }
  }

  /**
   * 检查日程，决定是否移动
   *
   * 行为决策优先级：
   *   1. 生病/身体不适 → 请假/休息
   *   2. 极端负面情绪 → 旷工/旷职
   *   3. 社交能量耗尽 → 回避社交
   *   4. 正常日程执行
   *   5. 习惯驱动（无日程时）
   *
   * @private
   */
  _checkSchedule(hour, dayOfWeek, simDate) {
    const activity = this.schedule.getCurrentActivity(hour, dayOfWeek, simDate);

    if (activity.inSchedule && activity.region && activity.region !== this.position) {
      const valence = this.emotion.getValence();

      // ─── 1. 生病/身体不适 → 请假机制 ───
      // 当健康值低于阈值时，Agent 可能请假不去工作
      if (this.health < 0.4) {
        const sickProb = (0.4 - this.health) * 2 * (1 - this.personality.ocean.conscientiousness * 0.3);
        if (this._rand() < Math.min(0.8, sickProb)) {
          const altState = this._getSkipAlternative('sick', hour);
          return { moved: true, region: this.position, skipEvent: 'sick', altState };
        }
      }

      // ─── 2. 高沮丧/低效价 → 旷工/旷职 ───
      // 灵感：情绪-行为耦合 (Gross 2014), 冲动性 (Dickman 2000)
      // 尽责性低 + 情绪差 → 更容易放弃计划
      //
      // 使用复合负面情绪指标而非纯 valence（getValence 归一化后范围很小）
      // 综合考虑：负面情绪强度 + 压力水平
      const sadness = this.emotion.current.sadness || 0;
      const frustration = this.emotion.current.frustration || 0;
      const nervousness = this.emotion.current.nervousness || 0;
      const negativeIntensity = (sadness + frustration + nervousness) / 3;
      const stressFactor = Math.min(1, (this.emotion.stress || 0) / 8);
      // 以负面情绪强度为主（0.6），压力为辅（0.4）
      const emotionalDistress = negativeIntensity * 0.6 + stressFactor * 0.4;

      if (emotionalDistress > 0.15) {
        const skipProb = emotionalDistress * 0.4 * (1 - this.personality.ocean.conscientiousness * 0.5);
        if (this._rand() < Math.min(0.5, skipProb)) {
          // 判断角色类型（基于日程活动，而非当前状态）
          // 使用 domain 的 placeTypes.work 判断是否是工作者
          const activityName = activity.activity || '';
          const workPlaces = this._domain ? (this._domain.placeTypes.work || []) : [];
          const isWorker = workPlaces.some(place => activityName.includes(place));
          const skipType = isWorker ? 'skipWork' : 'skipClass';
          const altState = this._getSkipAlternative(skipType, hour);
          const altRegion = this._getSkipRegion(skipType, hour);
          return { moved: true, region: altRegion || this.position, skipEvent: skipType, altState };
        }
      }

      // ─── 3. 社交能量耗尽 → 回避社交活动 ───
      if (this.socialEnergy < 0.2 && this._behavior.socialEnergyDrain > 0.5) {
        if (this._rand() > 0.3) {
          return { moved: false };
        }
      }

      // ─── 4. 社交事件特殊处理（从 domain 取社交区域）───
      const socialRegions = this._domain ? (this._domain.placeTypes.social || []) : [];
      if (socialRegions.includes(activity.region)) {
        if (this.socialEnergy < 0.3 && valence < 0) {
          if (this._rand() > 0.4) {
            return { moved: false };
          }
        }
      }

      // ─── 5. 深夜熬夜 → 不执行早间日程 ───
      if (hour < 8 && this.stateMachine.currentState === '熬夜了') {
        if (this._rand() > 0.2) {
          return { moved: false };
        }
      }

      return { moved: true, region: activity.region };
    }

    // ─── 无日程时检查程序性记忆（习惯驱动行为）───
    if (!activity.inSchedule) {
      const habit = this.proceduralMemory.query({
        hour: Math.floor(hour),
        dayOfWeek,
        position: this.position,
        valence: this.emotion.getValence(),
      });

      if (habit && habit.confidence > 0.5) {
        // 习惯行为：高度自信时直接执行，无需思考
        const habitRegion = habit.action.region;
        if (habitRegion && habitRegion !== this.position) {
          return { moved: true, region: habitRegion };
        }
      }
    }

    return { moved: false };
  }

  /**
   * 获取跳过日程后的替代状态
   *
   * 根据跳过原因和当前时间，选择一个合理的替代行为状态。
   * 不是简单地原地不动，而是转移到一个符合情境的状态。
   *
   * @param {string} skipType - 'sick' | 'skipClass' | 'skipWork'
   * @param {number} hour - 当前小时
   * @returns {string|null} 替代状态名
   * @private
   */
  _getSkipAlternative(skipType, hour) {
    // 从 domain 取跳过行为配置
    const skipBehavior = this._domain ? this._domain.skipBehavior : null;

    if (skipBehavior && skipBehavior[skipType]) {
      const states = skipBehavior[skipType].states || [];
      if (states.length > 0) {
        return states[Math.floor(this._rand() * states.length)];
      }
    }

    // fallback：通用状态
    switch (skipType) {
      case 'sick':
        return '生病了';
      case 'skipClass':
      case 'skipWork':
        return '在休息';
      default:
        return null;
    }
  }

  /**
   * 获取跳过日程后的替代区域
   * @param {string} skipType
   * @param {number} hour
   * @returns {string} 替代区域名
   * @private
   */
  _getSkipRegion(skipType, hour) {
    // 从 domain 取跳过行为配置
    const skipBehavior = this._domain ? this._domain.skipBehavior : null;

    if (skipBehavior && skipBehavior[skipType]) {
      const regions = skipBehavior[skipType].regions || [];
      if (regions.length > 0) {
        return regions[Math.floor(this._rand() * regions.length)];
      }
    }

    // fallback：留在原地
    return this.position;
  }

  // ═══════════════════════════════════════════
  // 连续梯度接口（Phase 1: BehaviorField 集成）
  // ═══════════════════════════════════════════

  /**
   * 构建 BehaviorField 所需的完整信号对象
   *
   * 将各子系统的内部状态打包为 BehaviorField.tick(signals) 的输入格式。
   * 这是 Phase 2 集成时 Agent.tick() 调用的桥梁方法。
   *
   * @param {Object} env - 环境状态 { hour, dayOfWeek, weather, simTime, simDate }
   * @returns {Object} signals 对象
   */
  buildBehaviorSignals(env) {
    // 情绪驱力
    const emotionDims = this.emotion.current;
    const joy = (emotionDims.joy || 0) + (emotionDims.excitement || 0) * 0.7 + (emotionDims.amusement || 0) * 0.5;
    const sadness = (emotionDims.sadness || 0) + (emotionDims.loneliness || 0) * 0.8 + (emotionDims.boredom || 0) * 0.3;
    const anger = (emotionDims.anger || 0) + (emotionDims.frustration || 0) * 0.8 + (emotionDims.disgust || 0) * 0.4;
    const fear = (emotionDims.fear || 0) + (emotionDims.nervousness || 0) * 0.7;

    const approachDrive = Math.min(1, Math.max(0, joy * 1.2));
    const avoidDrive = Math.min(1, Math.max(0, sadness * 0.8 + fear * 0.5));
    const agenticDrive = Math.min(1, Math.max(0, anger * 1.0));

    // 需求状态
    const needsState = {};
    for (const [k, v] of Object.entries(this.needs.needs)) {
      needsState[k] = v;
    }

    // 日程
    const scheduleResult = this.schedule.getCurrentActivity(env.hour, env.dayOfWeek, env.simDate);

    // 自发动机
    const imStatus = this.intrinsicMotivation.getStatus();

    return {
      emotion: {
        valence: this.emotion.getValence(),
        arousal: this.emotion.getArousal(),
        approachDrive,
        avoidDrive,
        agenticDrive,
      },
      needs: needsState,
      intrinsic: {
        curiosity: this.intrinsicMotivation.curiosity,
        explorationTarget: null,
      },
      schedule: {
        targetActivity: scheduleResult.activity,
        targetRegion: scheduleResult.region,
        inSchedule: scheduleResult.inSchedule,
      },
      environment: {
        hour: env.hour,
        weather: env.weather,
      },
      health: this.health,
      socialEnergy: this.socialEnergy,
      ocean: this.personality.ocean,
    };
  }

  /**
   * 健康系统更新
   *
   * 身体健康受多种因素影响：
   *   - 睡眠不足（energy < 0.2）→ 健康下降
   *   - 高压力（stress > 6）→ 健康下降
   *   - 恶劣天气（cold/rain）→ 健康轻微下降
   *   - 营养不足（hunger < 0.2）→ 健康下降
   *   - 休息和睡眠 → 健康恢复
   *
   * 参考：
   *   - Cohen et al. (2012): 压力与免疫系统
   *   - Irwin (2015): 睡眠与免疫功能
   *
   * @param {number} hoursElapsed
   * @param {Object} env
   * @private
   */
  _updateHealth(hoursElapsed, env) {
    let healthDelta = 0;

    // ─── 健康下降因素 ───

    // 睡眠不足：能量低时身体抵抗力下降
    if (this.needs.needs.energy < 0.2) {
      healthDelta -= (0.2 - this.needs.needs.energy) * 0.04 * hoursElapsed;
    }

    // 高压力：慢性压力削弱免疫系统 (Cohen et al. 2012)
    if (this.emotion.stress > 6) {
      healthDelta -= (this.emotion.stress - 6) * 0.008 * hoursElapsed;
    }

    // 恶劣天气暴露
    if (env.weather === 'cold' || env.weather === 'rain') {
      // 从 domain 取室外区域
      const outdoorRegions = this._domain ? (this._domain.placeTypes.outdoor || []) : ['运动场', '小镇广场', '公园', '路上', '回家路上'];
      const isOutdoor = outdoorRegions.includes(this.position);

      if (env.weather === 'cold') {
        if (isOutdoor) {
          healthDelta -= 0.02 * hoursElapsed;
        } else {
          healthDelta -= 0.005 * hoursElapsed;
        }
      }
      if (env.weather === 'rain' && isOutdoor) {
        healthDelta -= 0.03 * hoursElapsed;
      }
    }

    // 营养不足
    if (this.needs.needs.hunger < 0.2) {
      healthDelta -= (0.2 - this.needs.needs.hunger) * 0.02 * hoursElapsed;
    }

    // ─── 健康恢复因素 ───

    // 休息和睡眠：低活动性时健康恢复（Phase 4: 连续化）
    // activity < 0.15 表示在休息/睡觉
    const activity = this.behaviorField.B[DIM_ACTIVITY];
    if (activity < 0.15) {
      healthDelta += 0.015 * hoursElapsed;
    }

    // 深度睡眠：activity 接近 0 + sociality 接近 0
    if (activity < 0.05 && this.behaviorField.B[DIM_SOCIALITY] < 0.05) {
      healthDelta += 0.025 * hoursElapsed;
    }

    // 吃饭后恢复
    if (this.needs.needs.hunger > 0.7) {
      healthDelta += 0.005 * hoursElapsed;
    }

    // R5 新增：压力缓解时身体自然修复（免疫系统恢复）
    // 梯度恢复：stress 越低恢复越快，stress=5 时开始缓慢恢复
    if (this.emotion.stress < 6 && this.health < 0.8) {
      const stressFactor = Math.max(0, (6 - this.emotion.stress) / 6); // 0~1, stress=0 → 1
      healthDelta += 0.012 * stressFactor * hoursElapsed;
      // stress=0: +0.012/h (~58h 恢复), stress=3: +0.006/h, stress=5: +0.002/h
    }

    // R5 新增：生存恢复 — 健康极低时身体启动保护机制
    // 模型：免疫系统在健康危急时会强制启动修复（发烧反应等）
    // 确保慢性压力场景下健康不会无限下降，有自然下限
    if (this.health < 0.3) {
      const survivalFactor = (0.3 - this.health) / 0.3; // 0~1, health=0 → 1
      healthDelta += 0.015 * survivalFactor * hoursElapsed;
      // health=0.1: +0.01/h, health=0.2: +0.005/h, health=0.25: +0.0025/h
    }

    // 人格因素：神经质高的个体健康恢复较慢（焦虑影响免疫）
    const recoveryMod = 1.0 - (this.personality.ocean.neuroticism * 0.3);
    if (healthDelta > 0) {
      healthDelta *= recoveryMod;
    }

    // 应用健康变化
    this.health = Math.max(0.1, Math.min(1.0, this.health + healthDelta));

    // ─── 生病事件生成 ───
    // 当健康首次跌破阈值时，生成生病记忆
    if (this.health < 0.35 && this.stateMachine.currentState !== '生病了' &&
        this.stateMachine.currentState !== '请假了') {
      // 增加转移到生病状态的权重（通过情绪效果）
      this.emotion.applyEffect({
        frustration: 0.02,
        calm: -0.03,
      });
    }
  }

  /**
   * 为跳过行为生成记忆事件
   *
   * Agent 需要记住自己翘过课、请过假——这些经历会影响未来的行为。
   *
   * @param {string} skipType - 'sick' | 'skipClass' | 'skipWork'
   * @param {Object} env
   * @returns {Object|null} 记忆事件
   * @private
   */
  _generateSkipMemory(skipType, env) {
    // 通用的生病记忆
    const sickMemories = [
      '身体不舒服，请了假在休息',
      '感觉浑身没力气，决定今天不去了',
      '头疼得厉害，还是休息一下吧',
    ];

    // 从 domain 取跳过行为记忆
    const skipBehavior = this._domain ? this._domain.skipBehavior : null;
    let contents;

    if (skipType === 'sick') {
      contents = sickMemories;
    } else if (skipBehavior && skipBehavior[skipType]) {
      contents = skipBehavior[skipType].memories || [];
    }

    if (!contents || contents.length === 0) return null;

    const content = contents[Math.floor(this._rand() * contents.length)];

    return {
      content,
      type: skipType === 'sick' ? 'illness' : 'deviant',
      scope: 'local',
      participants: [this.id],
      effects: [
        {
          target: this.id,
          type: 'emotion',
          delta: {
            // 旷工有轻微的内疚感，但也有解脱感
            guilt: skipType === 'skipClass' ? 0.02 : (skipType === 'skipWork' ? 0.03 : 0),
            relief: 0.03,
            calm: 0.02,
          },
        },
      ],
      _region: this.position,
      _currentState: this.stateMachine.currentState,
    };
  }

  /**
   * 根据匮乏需求找到合适的区域
   *
   * 考虑 Agent 当前位置和个人场景（劳动者 vs 上班族）
   * @private
   * @param {string} need - 需求类型
   * @returns {string|null} 目标区域
   */
  _findNeedRegion(need) {
    // 从 domain 取需求区域配置
    const needRegionConfig = this._domain ? this._domain.needRegionConfig : null;

    if (needRegionConfig && needRegionConfig[need]) {
      const config = needRegionConfig[need];

      // 判断角色类型
      const isWorker = this._domain && this._domain.placeTypes.work &&
        this._domain.placeTypes.work.some(r => this.schedule.entries.some(e => e.region === r));

      if (config.any) return config.any;
      if (isWorker && config.worker) return config.worker;
      if (!isWorker && config.student) return config.student;
    }

    // fallback：留在原地
    return null;
  }

  /**
   * 从感知到的事件中提取外部交互事件
   * @private
   */
  _buildExternalEvent(events) {
    for (const event of events) {
      if (event.type === 'social' && event.participants.includes(this.id)) {
        const otherAgent = event.participants.find(id => id !== this.id);
        return {
          type: 'interaction',
          fromAgent: otherAgent,
          region: this.position,
          eventContent: event.content,
        };
      }
    }
    return null;
  }

  /**
   * 需求→情绪耦合
   *
   * 需求匮乏直接产生负面情绪效果。
   * 参考：
   *   - Maslow (1943): 低层需求未满足产生焦虑
   *   - Nolen-Hoeksema (1991): 生理不适增加负面情绪敏感性
   *   - Hockey (2013): 认知资源耗竭模型（疲劳→烦躁）
   *
   * 效果量级参考：与随机事件的平均效果 (0.03-0.05) 相当
   * 只有当需求低于阈值时才产生效果（避免与 NeedsSystem 重复驱动行为）
   *
   * @private
   */
  _applyNeedsToEmotion() {
    const needs = this.needs.needs;

    // 饥饿（< 0.3）→ 烦躁 + 生气
    if (needs.hunger < 0.3) {
      const hungerDeficit = 0.3 - needs.hunger; // 0 ~ 0.3
      this.emotion.applyEffect({
        frustration: hungerDeficit * 0.10,
        anger: hungerDeficit * 0.04,
        calm: -hungerDeficit * 0.06,
        joy: -hungerDeficit * 0.04,
      });
    }

    // 疲劳（< 0.25）→ 低落 + 烦躁
    if (needs.energy < 0.25) {
      const energyDeficit = 0.25 - needs.energy; // 0 ~ 0.25
      this.emotion.applyEffect({
        sadness: energyDeficit * 0.10,
        frustration: energyDeficit * 0.05,
        calm: -energyDeficit * 0.06,
        joy: -energyDeficit * 0.05,
      });
    }

    // 社交匮乏（< 0.2）→ 孤独 + 悲伤
    if (needs.social < 0.2) {
      const socialDeficit = 0.2 - needs.social; // 0 ~ 0.2
      this.emotion.applyEffect({
        loneliness: socialDeficit * 0.12,
        sadness: socialDeficit * 0.05,
        joy: -socialDeficit * 0.04,
      });
    }

    // 舒适匮乏（< 0.2）→ 不安 + 烦躁
    if (needs.comfort < 0.2) {
      const comfortDeficit = 0.2 - needs.comfort; // 0 ~ 0.2
      this.emotion.applyEffect({
        nervousness: comfortDeficit * 0.08,
        frustration: comfortDeficit * 0.04,
        contentment: -comfortDeficit * 0.06,
      });
    }

    // 刺激匮乏（< 0.15）→ 无聊 + 烦躁
    if (needs.stimulation < 0.15) {
      const stimDeficit = 0.15 - needs.stimulation; // 0 ~ 0.15
      this.emotion.applyEffect({
        boredom: stimDeficit * 0.12,
        frustration: stimDeficit * 0.04,
        joy: -stimDeficit * 0.03,
      });
    }
  }

  /**
   * 更新社交能量
   * @private
   */
  _updateSocialEnergy(hoursElapsed) {
    // Phase 4: 使用连续行为向量的 sociality 维度，替代离散状态名检查
    // sociality > 0.4 表示正在社交相关活动
    const sociality = this.behaviorField.B[DIM_SOCIALITY];
    const isSocial = sociality > 0.4;

    if (isSocial) {
      // 社交消耗（强度随 sociality 连续变化）
      const intensity = Math.min(1, sociality / 0.8);
      this.socialEnergy = Math.max(0,
        this.socialEnergy - this._behavior.socialEnergyDrain * hoursElapsed * 0.1 * intensity
      );
    } else {
      // 社交恢复（独处时）
      this.socialEnergy = Math.min(1,
        this.socialEnergy + this._behavior.socialEnergyRecharge * hoursElapsed * 0.05
      );
    }
  }

  // ═══════════════════════════════════════════
  // 反思机制（Reflection）
  // ═══════════════════════════════════════════

  /**
   * 定期深度反思 - 整合近期记忆、生成洞察、调整基线
   *
   * 灵感来源：
   *   - Sentipolis (2025): 慢速推理（slow inference）整合更广泛的历史和累积经验
   *   - PIANO (Project Sid): Action Awareness 模块允许 Agent 评估自身状态
   *   - Zhang et al. (2025): 次级评价（secondary appraisal）基于反馈调整
   *
   * 反思内容：
   *   1. 记忆整合 — 巩固重要记忆，衰减无关记忆
   *   2. 情绪模式识别 — 检测情绪趋势，调整基线
   *   3. 社交关系评估 — 更新对他人的情感认知
   *   4. 压力重评 — 基于应对结果调整压力
   * @private
   */
  _reflect() {
    // ─── 1. 记忆整合 ───
    // 合并相似记忆，提升反复出现的模式的重要性
    if (this.memory.consolidate) {
      this.memory.consolidate();
    }

    // ─── 1.5 自发动机反思 ───
    // 高好奇心时产生"渴望探索"的心智事件
    if (this.intrinsicMotivation.curiosity > 0.6) {
      const imStatus = this.intrinsicMotivation.getStatus();
      if (imStatus.activeGoals > 0) {
        // 有活跃目标时，增强好奇心满足的效率
        this.intrinsicMotivation.satisfyCuriosity(0.02);
      }
    }

    // ─── 2. 情绪模式识别 ───
    const currentValence = this.emotion.getValence();
    const currentArousal = this.emotion.getArousal();

    // 如果长期处于某种情绪状态，基线会缓慢调整（适应效应）
    // 这是情绪惯性的互补机制：短期有惯性，长期会适应
    const adaptRate = 0.002; // 非常缓慢
    for (const dim of ['joy', 'sadness', 'anger', 'fear', 'calm', 'nervousness']) {
      const current = this.emotion.current[dim] || 0;
      const base = this.emotion.baseline[dim] || 0;
      const diff = current - base;

      // 只有持续的偏移才会导致基线调整
      if (Math.abs(diff) > 0.2) {
        this.emotion.baseline[dim] = base + diff * adaptRate;
      }
    }

    // ─── 3. 压力重评 ───
    // 如果当前情绪正面且社交能量充足，压力自然下降
    if (currentValence > 0.1 && this.socialEnergy > 0.3) {
      this.emotion.setStress(this.emotion.stress - 0.2);
    }
    // 深夜时压力上升（反刍效应）
    if (this.emotion.current.loneliness > 0.3 || this.emotion.current.sadness > 0.3) {
      this.emotion.setStress(this.emotion.stress + 0.1);
    }

    // ─── 4. 基线重置保护 ───
    // 确保基线不会漂移太远（人格稳定性）
    for (const dim of EMOTION_DIMENSIONS) {
      const base = this.emotion.baseline[dim] || 0;
      this.emotion.baseline[dim] = Math.max(-0.4, Math.min(0.4, base));
    }
  }

  // ═══════════════════════════════════════════
  // 行为后果预估（Behavior Consequence Pre-estimation）
  // ═══════════════════════════════════════════

  /**
   * 基于过往经验评估潜在行为选项的情绪后果
   *
   * 理论基础：
   *   - Wall & Hayes (2016): 运动前估值（prospective valuation）
   *   - Bower (1981): 情绪一致性记忆检索
   *   - Kahneman (2011): 经验自我 vs 叙述自我
   *   - ACT-R: 基于实例的学习 (Instance-Based Learning)
   *
   * Agent 不是每次都"从零思考"，而是参考过往经验预估：
   *   - "上次在阅览处专注感觉很好" → 增加选择阅览处的倾向
   *   - "深夜看手机后总是更焦虑" → 减少选择看手机的倾向
   *
   * 这不是硬性决策，而是为 StateMachine 的加权随机选择提供额外信息。
   *
   * @returns {Object|null} { stateName: { expectedValue, sampleSize } } 或 null
   * @private
   */
  _assessStateConsequences() {
    const stateDef = STATES[this.stateMachine.currentState];
    if (!stateDef || !stateDef.next || stateDef.next.length === 0) return null;

    // 只评估从当前状态可达的状态
    const candidateStates = stateDef.next;
    const consequences = {};
    let hasData = false;

    // 批量检索优化：将所有候选状态的关键词合并为一次 retrieve 调用
    // 减少 N 次 retrieve（N=候选状态数）为 1 次
    const allKeywordsSet = new Set();
    const stateKeywordsMap = {};
    for (const nextState of candidateStates) {
      const kws = this._stateToKeywords(nextState);
      stateKeywordsMap[nextState] = kws;
      for (const kw of kws) allKeywordsSet.add(kw);
    }

    const batchContext = {
      keywords: [...allKeywordsSet],
      emotion: this.emotion.current,
      region: this.position,
    };

    const { memories: allMemories, recallEmotionDelta: consequenceRecallDelta } = this.memory.retrieve(batchContext, candidateStates.length * 3);

    // 回忆→情绪反向通路：评估后果时检索的记忆也会产生情绪反馈
    // 即使只是"想一想"某个状态，相关记忆的情绪色彩也会影响当前情绪
    if (consequenceRecallDelta && Object.keys(consequenceRecallDelta).length > 0) {
      this.emotion.applyEffect(consequenceRecallDelta, 0.5); // 半强度——评估不如直接回忆强烈
    }

    // 按候选状态过滤记忆并计算预期效价
    for (const nextState of candidateStates) {
      const nextStateDef = STATES[nextState];
      if (!nextStateDef) continue;

      const stateKws = stateKeywordsMap[nextState];
      // 过滤：记忆内容包含该状态的关键词
      const relevantMemories = allMemories.filter(mem => {
        const content = (mem.content || '').toLowerCase();
        return stateKws.some(kw => content.includes(kw.toLowerCase()));
      }).slice(0, 3);

      if (relevantMemories.length === 0) continue;

      // 计算该状态的预期情绪效价（加权平均）
      let totalWeight = 0;
      let weightedValence = 0;

      for (const mem of relevantMemories) {
        const memValence = this.memory._getValence(mem.emotionSnapshot);
        const weight = (mem.importance || 0.5) * (1 + this.memory._getArousal(mem.emotionSnapshot) * 0.3);
        weightedValence += memValence * weight;
        totalWeight += weight;
      }

      if (totalWeight > 0) {
        consequences[nextState] = {
          expectedValue: weightedValence / totalWeight,
          sampleSize: relevantMemories.length,
        };
        hasData = true;
      }
    }

    // 人格调制：神经质高的个体对负面后果更敏感（预期焦虑更高）
    const dampeningFactor = 1.0 - (this.personality.ocean.neuroticism * 0.2);
    if (hasData) {
      for (const [, data] of Object.entries(consequences)) {
        data.expectedValue *= dampeningFactor;
      }
    }

    return hasData ? consequences : null;
  }

  /**
   * 将状态名转换为检索关键词
   * @param {string} state - 状态名
   * @returns {string[]} 关键词列表
   * @private
   */
  _stateToKeywords(state) {
    // 提取状态名中的有意义词汇
    const keywords = [];
    const parts = state.replace(/^(在|刚|快|还没|困了)/, '').split(/[\s,，]+/);
    for (const p of parts) {
      if (p.length >= 2) keywords.push(p);
    }
    // 始终包含原始状态名
    keywords.push(state);
    return keywords;
  }

  /**
   * 心智游移（Mind Wandering / Default Mode Network）
   *
   * 在空闲状态下，Agent 的思绪会自发地从当前环境飘向记忆、幻想、担忧等。
   * 这是人类认知的核心特征（Raichle 2001, Killingsworth & Gilbert 2010）。
   *
   * 心智游移的内容受当前情绪状态调制（Bower 1981 情绪一致性偏差）：
   *   - 心情好时 → 更多回忆美好经历、展望未来
   *   - 心情差时 → 更多反刍负面事件、担忧未来
   *
   * 效果：
   *   - 生成"内心独白"事件（可注入 LLM prompt）
   *   - 轻微影响情绪（正面回忆→略微开心，负面反刍→略微焦虑）
   *
   * @private
   * @returns {Object|null} 内心事件或 null
   */
  _mindWander() {
    // 根据当前情绪选择思维内容类型
    const valence = this.emotion.getValence();
    const stress = this.emotion.stress || 0;

    // 情绪一致性检索：心情决定回忆偏向
    // 注意：getValence() 使用全维度归一化，实际值很小
    // 典型范围 [-0.15, +0.15]，极端情况 [-0.3, +0.3]
    const retrieveContext = valence < -0.04
      ? { emotion: { sadness: 0.3, loneliness: 0.2 }, keywords: ['难过', '不开心', '孤独', '压力'] }
      : valence > 0.04
        ? { emotion: { joy: 0.3, contentment: 0.2 }, keywords: ['开心', '有趣', '朋友', '喜欢'] }
        : { keywords: [] };

    // 从记忆中检索（ACT-R 自动按激活度排序）
    const { memories, recallEmotionDelta } = this.memory.retrieve(retrieveContext, 2);
    if (memories.length === 0) return null;

    const memory = memories[0];

    // 根据记忆和当前状态生成内心思绪（上下文加权选择）
    const thoughtCandidates = [];

    // 1. 回忆型思绪（基线权重）
    thoughtCandidates.push({
      type: '回忆',
      content: `想起了${this._timeAgoLabel(memory.timestamp)}的事：${memory.content}`,
      weight: 1.0,
    });

    // 2. 情绪反应型思绪
    if (memory.emotionTag === 'sad' && valence < -0.04) {
      // 负性情绪 + 负性记忆 → 反刍（权重随负面程度增加）
      // 阈值设为 -0.04：getValence() 使用 21 维归一化，实际值较小
      // _tagEmotion 的 'sad' 阈值为 -0.05，这里保持一致
      const ruminationWeight = 1.0 + Math.abs(valence) * 3 + (stress / 10);
      thoughtCandidates.push({
        type: '反刍',
        content: `又想起了${memory.content}，心里不太舒服`,
        weight: ruminationWeight,
      });
    } else if (memory.emotionTag === 'happy' && valence > 0.05) {
      // 正性情绪 + 正性记忆 → 怀念
      thoughtCandidates.push({
        type: '怀念',
        content: `想起了${memory.content}，嘴角不自觉上扬`,
        weight: 1.2,
      });
    }

    // 3. 压力状态下的担忧型思绪
    if (stress > 4) {
      thoughtCandidates.push({
        type: '担忧',
        content: '脑子里乱乱的，总觉得有什么事没做完',
        weight: 0.5 + stress / 10, // 压力越高越容易担忧
      });
    }

    // 4. 白日梦/展望型思绪（正性情绪 + 低压力时）
    if (valence > 0.04 && stress < 3) {
      const daydreamContents = [
        '想着等下做什么好呢',
        '今天天气不错，心情也挺好的',
        '希望这样的日子能多一些',
        '突然想到了一个有趣的想法',
      ];
      thoughtCandidates.push({
        type: '白日梦',
        content: daydreamContents[Math.floor(this._rand() * daydreamContents.length)],
        weight: 0.8,
      });
    }

    // 加权随机选择（而非均匀随机）
    const totalWeight = thoughtCandidates.reduce((sum, t) => sum + t.weight, 0);
    let r = this._rand() * totalWeight;
    let thought = thoughtCandidates[0];
    for (const candidate of thoughtCandidates) {
      r -= candidate.weight;
      if (r <= 0) { thought = candidate; break; }
    }

    // 思绪对情绪的影响（从 defaults.js 可配置参数读取）
    const mwCfg = ANDY_DEFAULTS.mindWander?.effects || {};
    const emotionDelta = {};

    // 回忆→情绪反向通路（Recall → Emotion Feedback）
    // 记忆检索本身就有情绪效应，不论选中什么思绪类型
    // 这是 Bower 1981 情绪一致性回忆的双向耦合：检索→情绪→进一步检索
    if (recallEmotionDelta && Object.keys(recallEmotionDelta).length > 0) {
      for (const [dim, value] of Object.entries(recallEmotionDelta)) {
        emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
      }
    }

    // 思绪类型特有效果（叠加在 recallEmotionDelta 之上）
    if (thought.type === '反刍') {
      const rum = mwCfg.rumination || { sadness: 0.018, nervousness: 0.012, frustration: 0.008 };
      for (const [dim, value] of Object.entries(rum)) {
        emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
      }
    } else if (thought.type === '担忧') {
      const worry = mwCfg.worry || { nervousness: 0.020, frustration: 0.012 };
      for (const [dim, value] of Object.entries(worry)) {
        emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
      }
    } else if (thought.type === '怀念') {
      const nost = mwCfg.nostalgia || { joy: 0.018, calm: 0.008 };
      for (const [dim, value] of Object.entries(nost)) {
        emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
      }
    } else if (thought.type === '白日梦') {
      // 白日梦：轻度正面情绪，增加希望和兴趣
      const daydream = mwCfg.daydream || { hope: 0.012, interest: 0.008, calm: 0.005 };
      for (const [dim, value] of Object.entries(daydream)) {
        emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
      }
    }

    if (Object.keys(emotionDelta).length > 0) {
      this.emotion.applyEffect(emotionDelta);
    }

    // 返回内心事件（可被记忆系统和 prompt 注入系统使用）
    return {
      type: 'mind_wander',
      thoughtType: thought.type,
      content: thought.content,
      time: new Date(this.memory._simTime || Date.now()).toISOString(),
    };
  }

  /**
   * 时间标签辅助
   * @private
   */
  _timeAgoLabel(date) {
    if (!date) return '';
    const hours = (this.memory._simTime - date.getTime()) / (1000 * 60 * 60);
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${Math.floor(hours)}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return `${Math.floor(days / 7)}周前`;
  }

  /**
   * 设置社交图谱引用（由 World 调用）
   * 用于 Appraisal 系统中的代理性评估
   * @param {Object} socialGraph
   */
  setSocialGraph(socialGraph) {
    this._socialGraphRef = socialGraph;
  }

  // ═══════════════════════════════════════════
  // 交互接口
  // ═══════════════════════════════════════════

  /**
   * 与另一个 Agent 交互（被动接收方）
   * @param {Agent} other
   * @param {string} interactionType
   * @returns {Object} 交互结果
   */
  interact(other, interactionType = 'talk') {
    const valence = this._calculateInteractionValence(other, interactionType);

    // 对方情绪对交互结果的影响
    const otherMood = other.emotion.getValence();
    const moodInfluence = otherMood * 0.3;

    // 实际应用情绪变化（之前只计算了但未生效）
    const emotionDelta = {
      joy: valence > 0 ? valence * 0.2 : 0,
      loneliness: -Math.abs(valence) * 0.1,
      interest: valence * 0.1,
    };

    // 对方心情好会增加自己的正面情绪，反之亦然
    if (moodInfluence > 0.05) {
      emotionDelta.joy += moodInfluence * 0.1;
      emotionDelta.contentment = moodInfluence * 0.05;
    } else if (moodInfluence < -0.05) {
      emotionDelta.sadness = Math.abs(moodInfluence) * 0.05;
      emotionDelta.nervousness = Math.abs(moodInfluence) * 0.03;
    }

    // 应用到情绪向量
    this.emotion.applyEffect(emotionDelta);

    // 更新社交记忆
    this.memory.addExperience({
      content: `和${other.name}${interactionType === 'talk' ? '聊了天' : interactionType === 'help' ? '互相帮助' : interactionType === 'conflict' ? '发生了冲突' : '擦肩而过'}`,
      type: 'social',
      effects: [],
      _region: this.position,
      _currentState: this.stateMachine.currentState,
    }, this.emotion);

    return {
      valence: valence + moodInfluence,
      type: interactionType,
      myEmotionChange: emotionDelta,
    };
  }

  /**
   * 计算交互效价
   * @private
   */
  _calculateInteractionValence(other, type) {
    const myValence = this.emotion.getValence();

    // 基础效价
    let baseValence = 0.3;

    // 情绪影响：好心情时交互更愉快
    baseValence += myValence * 0.2;

    // 人格相容性
    const compat = this._personalityCompatibility(other);
    baseValence += compat * 0.3;

    // 交互类型修正
    switch (type) {
      case 'talk': baseValence *= 1.0; break;
      case 'help': baseValence *= 1.3; break;
      case 'conflict': baseValence = -0.5; break;
      case 'ignore': baseValence = -0.1; break;
    }

    return Math.max(-1, Math.min(1, baseValence));
  }

  /**
   * 人格相容性计算
   * @private
   */
  _personalityCompatibility(other) {
    const myO = this.personality.ocean;
    const otherO = other.personality.ocean;

    // 全 5 维度加权相容性
    // 研究表明：开放性、宜人性相似度最重要，外向性互补也有吸引力
    const opennessDiff = Math.abs(myO.openness - otherO.openness);
    const agreeDiff = Math.abs(myO.agreeableness - otherO.agreeableness);
    const extraDiff = Math.abs(myO.extraversion - otherO.extraversion);
    const consDiff = Math.abs(myO.conscientiousness - otherO.conscientiousness);
    const neuroDiff = Math.abs(myO.neuroticism - otherO.neuroticism);

    // 加权：开放性+宜人性权重最高（相似好），外向性允许适度互补
    const similarity = 1 - (
      opennessDiff * 0.25 +
      agreeDiff * 0.25 +
      extraDiff * 0.15 +   // 外向性差异惩罚较低（互补可接受）
      consDiff * 0.15 +
      neuroDiff * 0.20
    );

    // 同 MBTI 类型加成
    const mbtiBonus = (this.personality.mbti === other.personality.mbti) ? 0.1 : 0;

    return Math.max(0, Math.min(1, similarity + mbtiBonus));
  }

  // ═══════════════════════════════════════════
  // 叙事合成（供 Bobby 对话层使用）
  // ═══════════════════════════════════════════

  /**
   * 将 Agent 当前全部内部状态合成为一段第一人称中文叙事
   *
   * 设计原则：
   *   - 只提及偏离基线的状态（正常时不废话）
   *   - 用自然的口语，像发微信，不是报告
   *   - 控制在 60-120 字，不膨胀 prompt
   *   - 不需要 LLM，纯模板 + 状态驱动
   *
   * @returns {string} 中文叙事文本
   */
  toNarrative(externalState = null) {
    const parts = [];

    // ─── 1. 当前行为 ───
    const rawState = this.stateMachine.currentState;
    const rawPos = this.position;
    const info = this.stateMachine.getInfo(this.memory._simTime || null);
    const elapsedMin = info.elapsed || 0;

    // 从 domain 取叙事模板
    const narrativeTemplates = this._domain ? this._domain.narrativeTemplates : {};
    const statePositionMap = narrativeTemplates.statePositionMap || {};

    // 优先使用 externalState（Andy Town 提供的干净数据）
    // 使用 domain 的 narrativeTemplates，不使用 campus replacement
    let stateDesc;
    if (externalState && externalState.scheduleActivity) {
      stateDesc = statePositionMap[externalState.scheduleActivity] || externalState.scheduleActivity;
    } else if (externalState && externalState.scheduleRegion) {
      const regionMap = narrativeTemplates.regionMap || {};
      stateDesc = regionMap[externalState.scheduleRegion] || `在${externalState.scheduleRegion}`;
    } else {
      stateDesc = statePositionMap[rawState] || `在${rawPos}`;
    }
    parts.push(stateDesc);

    // ─── 2. 行为质量（状态持续太久 → 坐不住/无聊）───
    // 从 domain 取活跃状态类别
    const activeCategories = ['active', 'quiet'];
    const stateDef = this._domain ? this._domain.states[rawState] : null;
    const isActiveCategory = stateDef && activeCategories.includes(stateDef.category);
    if (elapsedMin > 60 && isActiveCategory) {
      parts.push('但有点坐不住');
    }

    // ─── 3. 生理需求匮乏（只在明显不足时提及）───
    const needs = this.needs.needs;
    if (needs.energy < 0.25) {
      parts.push('好困');
    } else if (needs.energy < 0.4 && this.emotion.current.boredom > 0.15) {
      parts.push('有点困');
    }
    if (needs.hunger < 0.25) {
      parts.push('好饿');
    } else if (needs.hunger < 0.4) {
      parts.push('有点饿');
    }

    // ─── 4. 情绪基调（只在明显偏离中性时提及）───
    const valence = this.emotion.getValence();
    const dominant = this.emotion.getDominant(2);
    if (valence < -0.08) {
      const topNeg = dominant.find(d => d.value < 0);
      if (topNeg) {
        const negLabels = {
          sadness: '心情不太好', loneliness: '有点孤独', frustration: '有点烦',
          nervousness: '有点焦虑', boredom: '好无聊', anger: '有点烦躁',
          fear: '有点不安',
        };
        const label = negLabels[topNeg.dimension] || null;
        if (label) parts.push(label);
      }
    } else if (valence > 0.08) {
      const topPos = dominant.find(d => d.value > 0);
      if (topPos) {
        const posLabels = {
          joy: '心情还不错', contentment: '挺满足的', excitement: '有点兴奋',
          calm: '挺平静的', hope: '有点期待',
        };
        const label = posLabels[topPos.dimension] || null;
        if (label) parts.push(label);
      }
    }
    if (this.emotion.stress > 6) {
      parts.push('压力好大');
    }

    // ─── 5. 近期记忆（最近一条有意义的事件）───
    const recentMemories = this.memory.memories;
    if (recentMemories && recentMemories.length > 0) {
      const simNow = this.memory._simTime || Date.now();
      for (let i = recentMemories.length - 1; i >= Math.max(0, recentMemories.length - 5); i--) {
        const mem = recentMemories[i];
        if (!mem || !mem.content) continue;
        const hoursAgo = mem.timestamp ? (simNow - mem.timestamp.getTime()) / 3600000 : 999;
        if (hoursAgo > 6) break;
        const snippet = mem.content.length > 20 ? mem.content.slice(0, 20) + '...' : mem.content;
        if (!snippet.includes(rawState) && !snippet.includes(rawPos)) {
          const timeLabel = hoursAgo < 0.5 ? '刚才' : hoursAgo < 2 ? '不久前' : '';
          // 使用 domain-aware guard 处理记忆内容
          const safeSnippet = applyForbiddenTerms(snippet, this._domain);
          parts.push(`${timeLabel}${safeSnippet}`);
          break;
        }
      }
    }

    // ─── 6. 认知状态（心智游移 / 自发动机）───
    if (this.intrinsicMotivation && this.intrinsicMotivation.curiosity > 0.6) {
      const imStatus = this.intrinsicMotivation.getStatus();
      if (imStatus.activeGoals > 0) {
        parts.push('在想一些事');
      }
    }
    if (this.health < 0.5) {
      parts.push('身体不太舒服');
    }

    // ─── 7. 行为场动态（BehaviorField 独有信息）───
    // 当行为向量与标签"典型值"有显著偏差时，补充连续信息
    // 这让 LLM 知道"在阅览室但心不在焉"或"正在朝社交方向移动"
    const B = this.behaviorField.B;
    const vel = this.behaviorField.velocity;
    const speed = this.behaviorField.speed;

    // focus 偏差：标签期望高专注但实际很低 → "心不在焉"
    const { STATE_CENTERS } = require('./BehaviorLabeler');
    const center = STATE_CENTERS[rawState];
    if (center) {
      const focusDiff = center[DIM_FOCUS] - B[DIM_FOCUS];
      if (focusDiff > 0.25 && center[DIM_FOCUS] > 0.4) {
        parts.push('心思不太集中');
      }
      // sociality 偏差：标签期望低社交但实际在上升 → "想找人说话"
      const socialVel = vel[DIM_SOCIALITY];
      if (socialVel > 0.3 && B[DIM_SOCIALITY] < 0.4) {
        parts.push('有点想找人聊天');
      }
    }

    // 行为趋势：速度够快时说明正在变化
    if (speed > 0.4) {
      // 找到速度最大的维度
      const dimNames = ['活动程度', '社交倾向', '专注度', '表达欲'];
      let maxDim = 0;
      for (let d = 1; d < 4; d++) { if (Math.abs(vel[d]) > Math.abs(vel[maxDim])) maxDim = d; }
      const dir = vel[maxDim] > 0 ? '在上升' : '在下降';
      // 只在变化显著且方向明确时提及
      if (Math.abs(vel[maxDim]) > 0.3) {
        parts.push(`${dimNames[maxDim]}${dir}`);
      }
    }

    // ─── 组装 ───
    if (parts.length === 0) return '';
    let narrative = parts[0];
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        const sep = parts[i].length > 6 ? '。' : '，';
        narrative += sep + parts[i];
      }
    }

    // Domain-aware guard：确保输出不含 forbiddenTerms
    return applyForbiddenTerms(narrative, this._domain);
  }

  // ═══════════════════════════════════════════
  // 查询接口
  // ═══════════════════════════════════════════

  /**
   * 获取连续行为状态（Phase 2 新增）
   *
   * @returns {{ vector: number[], label: string, confidence: number, speed: number, gradient: number[] }}
   */
  get behavior() {
    return {
      vector: this.behaviorField.current,
      label: this.behaviorField.label,
      confidence: 0, // 由最近一次 tick 结果填充
      speed: this.behaviorField.speed,
      gradient: this.behaviorField.snapshot().gradient,
    };
  }

  /**
   * 获取 Agent 的完整状态描述（用于调试 / prompt 注入）
   * @returns {Object}
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      state: this.stateMachine.getInfo(this.memory._simTime || null),
      behavior: this.behavior,
      position: this.position,
      emotion: this.emotion.toPromptString(),
      intrinsicMotivation: this.intrinsicMotivation.toPromptString(),
      socialEnergy: Math.round(this.socialEnergy * 100),
      health: Math.round(this.health * 100),
      isOnline: this.isOnline,
    };
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      personality: this.personality.toJSON(),
      emotion: this.emotion.toJSON(),
      stateMachine: this.stateMachine.toJSON(),
      behaviorField: this.behaviorField.toJSON(),
      memory: this.memory.toJSON(),
      appraisalBiases: this.memory.biasesToJSON(),
      proceduralMemory: this.proceduralMemory.toJSON(),
      schedule: this.schedule.toJSON(),
      needs: this.needs.toJSON(),
      emotionRegulation: this.emotionRegulation.toJSON(),
      intrinsicMotivation: this.intrinsicMotivation.toJSON(),
      position: this.position,
      socialEnergy: this.socialEnergy,
      health: this.health,
      isOnline: this.isOnline,
    };
  }
}

module.exports = Agent;
