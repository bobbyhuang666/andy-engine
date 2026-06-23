/**
 * Compatibility adapter.
 * Canonical implementation: src/agent/AgentRuntime.js + src/agent/lifecycle/ + src/agent/runtime/ + src/agent/facade/
 * Reason retained: public API (index.js imports Agent), old test imports, Agent class wiring + tick delegation
 * Deletion condition: when all test imports migrate to src/agent/ and public API no longer exposes Agent directly
 */

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

const AgentRuntime = require('../src/agent/AgentRuntime');
const { ANDY_DEFAULTS } = require('../src/config/defaults');
const { createSubsystems, restoreSubsystems } = require('../src/agent/lifecycle/AgentSubsystemFactory');
const { wireAll } = require('../src/agent/lifecycle/AgentWiring');
const { AGENT_DEFAULTS } = require('../src/agent/lifecycle/AgentDefaults');

// Facade modules (extracted public/facade logic)
const { toNarrative: _toNarrativeImpl } = require('../src/agent/facade/AgentNarrative');
const { recordExternalExperience: _recordExternalExperienceImpl } = require('../src/agent/facade/ExternalExperience');
const { interact: _interactImpl, calculateInteractionValence: _calcValenceImpl, personalityCompatibility: _compatImpl } = require('../src/agent/facade/InteractionFacade');
const { toJSON: _toJSONImpl } = require('../src/agent/facade/AgentSerializer');
const { runShadowActionSelection, buildActionContext: _buildActionContextImpl, validateActionSelectionConfig } = require('../src/agent/runtime/ActionSelectionRuntime');
const { perceiveEvents } = require('../src/agent/runtime/PerceptionRuntime');
const ScheduleHandler = require('../src/agent/handlers/ScheduleHandler');
const { applyNeedsToEmotion, updateHealth, updateSocialEnergy } = require('../src/agent/runtime/PhysiologyRuntime');
const { reflect } = require('../src/agent/runtime/ReflectionRuntime');
const { mindWander } = require('../src/agent/runtime/MindWanderRuntime');

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
    this._actionSelectionConfig = {
      ...ANDY_DEFAULTS.actionSelection,
      ...(config.actionSelection || {}),
    };
    validateActionSelectionConfig(this._actionSelectionConfig, this._rng, this.id);

    // ─── Create or restore subsystems ───
    const subs = savedState
      ? restoreSubsystems(savedState, config, this.id, this._domain, this._rng)
      : createSubsystems(config, this.id, this._domain, this._rng);

    // Assign subsystem instances
    this.personality = subs.personality;
    this.emotion = subs.emotion;
    this.stateMachine = subs.stateMachine;
    this.memory = subs.memory;
    this.proceduralMemory = subs.proceduralMemory;
    this.needs = subs.needs;
    this.emotionRegulation = subs.emotionRegulation;
    this.intrinsicMotivation = subs.intrinsicMotivation;
    this.schedule = subs.schedule;
    this.behaviorField = subs.behaviorField;
    this.position = subs.position;
    this.socialEnergy = subs.socialEnergy;
    this.health = subs.health;
    this.isOnline = subs.isOnline;

    // ─── Wire subsystems together ───
    const wiring = wireAll(subs, config, this._domain);
    this.futureTendency = wiring.futureTendency;

    // ─── Runtime state ───
    this._behavior = this.personality.behavior;
    this._socialGraphRef = null;
    this._ticksSinceReflection = 0;
    this._reflectionInterval = AGENT_DEFAULTS.reflectionInterval;
    this._recentEventTypes = new Set();
    this._ticksSinceDriftCheck = 0;
    this._actionTraceHistory = savedState ? (savedState._actionTraceHistory || []) : [];
    this._candidateProviderManager = null; // lazy init
    this.runtime = new AgentRuntime(this);
  }

  /**
   * 获取随机数（路由到 RNG 或回退 Math.random）
   * @private
   */
  _rand() {
    return this._rng ? this._rng.next() : Math.random();
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
    return this.runtime.tick(env, perceivedEvents, contagionInputs);
  }

  // ═══════════════════════════════════════════
  // Private delegators (runtime / handlers)
  // ═══════════════════════════════════════════

  /** @private */
  _runShadowActionSelection(env) {
    return runShadowActionSelection(this, env);
  }

  /** @private */
  _buildActionContext(env) {
    return _buildActionContextImpl(this, env);
  }

  /** @private */
  _perceiveEvents(events) {
    perceiveEvents(this, events);
  }

  /** @private */
  _checkSchedule(hour, dayOfWeek, simDate) {
    return ScheduleHandler.checkSchedule(this, hour, dayOfWeek, simDate);
  }

  /** @private */
  _getSkipAlternative(skipType, hour) {
    return ScheduleHandler.getSkipAlternative(this, skipType, hour);
  }

  /** @private */
  _getSkipRegion(skipType, hour) {
    return ScheduleHandler.getSkipRegion(this, skipType, hour);
  }

  /** @private */
  _generateSkipMemory(skipType, env) {
    return ScheduleHandler.generateSkipMemory(this, skipType, env);
  }

  /** @private */
  _findNeedRegion(need) {
    return ScheduleHandler.findNeedRegion(this, need);
  }

  /** @private */
  _applyNeedsToEmotion() {
    applyNeedsToEmotion(this);
  }

  /** @private */
  _updateHealth(hoursElapsed, env) {
    updateHealth(this, hoursElapsed, env);
  }

  /** @private */
  _updateSocialEnergy(hoursElapsed) {
    updateSocialEnergy(this, hoursElapsed);
  }

  /** @private */
  _reflect() {
    reflect(this);
  }

  /** @private */
  _mindWander() {
    return mindWander(this);
  }

  // ═══════════════════════════════════════════
  // Public API (facade delegators)
  // ═══════════════════════════════════════════

  /**
   * 构建 BehaviorField 所需的完整信号对象
   * @param {Object} env
   * @returns {Object}
   */
  buildBehaviorSignals(env) {
    const emotionDims = this.emotion.current;
    const joy = (emotionDims.joy || 0) + (emotionDims.excitement || 0) * 0.7 + (emotionDims.amusement || 0) * 0.5;
    const sadness = (emotionDims.sadness || 0) + (emotionDims.loneliness || 0) * 0.8 + (emotionDims.boredom || 0) * 0.3;
    const anger = (emotionDims.anger || 0) + (emotionDims.frustration || 0) * 0.8 + (emotionDims.disgust || 0) * 0.4;
    const fear = (emotionDims.fear || 0) + (emotionDims.nervousness || 0) * 0.7;

    const approachDrive = Math.min(1, Math.max(0, joy * 1.2));
    const avoidDrive = Math.min(1, Math.max(0, sadness * 0.8 + fear * 0.5));
    const agenticDrive = Math.min(1, Math.max(0, anger * 1.0));

    const needsState = {};
    for (const [k, v] of Object.entries(this.needs.needs)) {
      needsState[k] = v;
    }

    const scheduleResult = this.schedule.getCurrentActivity(env.hour, env.dayOfWeek, env.simDate);

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

  /** 外部经验注入 */
  recordExternalExperience(event, options = {}) {
    return _recordExternalExperienceImpl(this, event, options);
  }

  /** 设置社交图谱引用（由 World 调用） */
  setSocialGraph(socialGraph) {
    this._socialGraphRef = socialGraph;
  }

  /** 交互 */
  interact(other, interactionType = 'talk') {
    return _interactImpl(this, other, interactionType);
  }

  /** @private */
  _calculateInteractionValence(other, type) {
    return _calcValenceImpl(this, other, type);
  }

  /** @private */
  _personalityCompatibility(other) {
    return _compatImpl(this, other);
  }

  /** 叙事合成 */
  toNarrative(externalState = null) {
    return _toNarrativeImpl(this, externalState);
  }

  // ═══════════════════════════════════════════
  // 查询接口
  // ═══════════════════════════════════════════

  /** 获取连续行为状态 */
  get behavior() {
    return {
      vector: this.behaviorField.current,
      label: this.behaviorField.label,
      confidence: 0,
      speed: this.behaviorField.speed,
      gradient: this.behaviorField.snapshot().gradient,
    };
  }

  /** 获取 domain 配置（只读） */
  get domain() {
    return this._domain;
  }

  /** 获取社交图谱引用（只读） */
  get socialGraph() {
    return this._socialGraphRef;
  }

  /** 获取行为参数（只读） */
  get behaviorParams() {
    return this._behavior;
  }

  /** 获取 Agent 的完整状态描述 */
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

  /** 序列化 */
  toJSON() {
    return _toJSONImpl(this);
  }
}

module.exports = Agent;
