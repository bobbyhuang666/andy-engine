/**
 * AndyBridge — Andy 模拟 ↔ Agent 对话 的桥梁
 *
 * 职责:
 *   1. 接收用户消息 → 情绪信号提取 → 缓冲
 *   2. Andy tick 时 → 消费缓冲 → 注入 agent 情绪
 *   3. 从 tick 结果生成故事 → 持久化
 *   4. Agent 对话时 → 查询最近故事 → 注入 system prompt
 *
 * 数据流:
 *   用户消息 → push() → buffer → [等待 tick] → consume() → applyEffect
 *   Andy tick → tick() → stories → SimulationStore
 *   Agent 对话 → getStoriesForAgent() → prompt 注入
 */

const { EmotionSignalBuffer } = require('./EmotionSignalBuffer');
const { StoryGenerator } = require('../narrative/StoryGenerator');
const { SimulationStore, MemoryStore } = require('../store');

class AndyBridge {
  /**
   * @param {Object} options
   * @param {Object} options.andy - Andy 引擎实例（World 或 Simulator）
   * @param {string} options.dbPath - SQLite 数据库路径
   * @param {number} options.snapshotInterval - 快照间隔 (ticks)
   * @param {Object} options.persistence - 持久化配置
   * @param {string} options.persistence.type - 'auto' | 'sqlite' | 'memory'
   * @param {string} options.persistence.path - 数据库路径
   */
  constructor(options = {}) {
    this.andy = options.andy;
    this.agentId = options.agentId || 'default';
    this._rng = options.rng || null;

    // 核心模块
    this.signalBuffer = new EmotionSignalBuffer({ rng: this._rng });
    this.storyGenerator = new StoryGenerator();

    // 支持内存存储
    const storeType = options.persistence?.type || 'auto';
    const storePath = options.persistence?.path || options.dbPath || ':memory:';

    if (storeType === 'memory') {
      // 直接使用 MemoryStore，不需要 SimulationStore
      this.store = new SimulationStore({
        dbPath: ':memory:',
        snapshotInterval: options.snapshotInterval ?? 12,
      });
      // 覆盖内部 db 为 MemoryStore
      this.store.db = new MemoryStore();
    } else {
      // 尝试使用 SQLite，如果失败则回退到 MemoryStore
      try {
        this.store = new SimulationStore({
          dbPath: storePath,
          snapshotInterval: options.snapshotInterval ?? 12,
        });
      } catch (e) {
        if (e.message && e.message.includes('better-sqlite3')) {
          console.warn('SQLite not available, using memory store');
          this.store = new SimulationStore({
            dbPath: ':memory:',
            snapshotInterval: options.snapshotInterval ?? 12,
          });
          this.store.db = new MemoryStore();
        } else {
          throw e;
        }
      }
    }

    this._initialized = false;
  }

  // ═══════════════════════════════════════════
  // 初始化 / 关闭
  // ═══════════════════════════════════════════

  /**
   * 初始化（启动时调用一次）
   * 从持久化恢复状态
   */
  async init() {
    if (this._initialized) return;

    await this.store.init({
      onSnapshot: () => this._serializeAgents(),
      onRestore: (data) => this._restoreAgents(data),
    });

    this._initialized = true;
    return {
      restoredTick: this.store.tickCount,
      restoredTime: this.store.virtualTime,
    };
  }

  /**
   * 关闭（进程退出时调用）
   */
  async shutdown() {
    await this.store.shutdown();
    this._initialized = false;
  }

  // ═══════════════════════════════════════════
  // 用户消息处理（秒级，每次对话调用）
  // ═══════════════════════════════════════════

  /**
   * 推入用户消息（不等待 tick，立即返回分类结果）
   *
   * @param {string} userText - 用户消息
   * @returns {{ effect: Object, intent: string }}
   */
  onUserMessage(userText) {
    this._requireInit('onUserMessage');
    const result = this.signalBuffer.push(userText);
    return {
      effect: result.effect,
      intent: result.intent,
      matchedKeywords: result.matchedKeywords,
    };
  }

  // ═══════════════════════════════════════════
  // Andy tick 处理（分钟级，每 tick 调用一次）
  // ═══════════════════════════════════════════

  /**
   * 处理 Andy tick 结果
   *
   * @param {Object} tickResult - Simulator.tick() 返回值
   * @returns {{ stories: Story[], signalConsumed: Object|null }}
   */
  onTick(tickResult) {
    this._requireInit('onTick');
    const stories = [];
    const simTime = this.store.virtualTime ? new Date(this.store.virtualTime) : undefined;
    const options = { rng: this._rng, simTime };

    // R20 M13: call store.onTick BEFORE reading tickCount so stories are
    // tagged with the current tick, not the previous one. The old code read
    // tickCount before onTick, producing off-by-one labels.
    // 1. 交给 SimulationStore（缓冲 + 定期持久化）
    this.store.onTick(tickResult, stories);

    const currentTick = this.store.tickCount;

    // 2. 消费情绪信号缓冲 → 注入 agent
    const signal = this.signalBuffer.consume();
    if (signal) {
      this._applySignalToAgent(signal);
      const signalStory = this.storyGenerator.generateFromSignal(
        signal.storyText,
        signal.mergedEffect,
        currentTick,
        options,
      );
      if (signalStory) stories.push(signalStory);
    }

    // 3. 从 tick 结果生成故事
    const tickStories = this.storyGenerator.generateFromTick(tickResult, this.agentId, options);
    if (tickStories) stories.push(...tickStories);

    return { stories, signalConsumed: signal };
  }

  // ═══════════════════════════════════════════
  // Agent 查询（对话时调用）
  // ═══════════════════════════════════════════

  /**
   * 获取 agent 最近的故事（供 system prompt 注入）
   *
   * @param {number} hours - 最近多少小时
   * @param {number} limit - 最多几条
   * @returns {Story[]}
   */
  getStoriesForAgent(hours = 72, limit = 5) {
    this._requireInit('getStoriesForAgent');
    return this.store.getStoriesForAgent(this.agentId, hours, limit);
  }

  /**
   * @deprecated Use getStoriesForAgent instead
   */
  getStoriesForBobby(hours = 72, limit = 5) {
    return this.getStoriesForAgent(hours, limit);
  }

  /**
   * 获取 agent 的当前情绪状态
   * @returns {Object|null} { current: Float64Array, stress: number }
   */
  getAgentEmotion() {
    if (!this.andy || !this.andy.agents) return null;

    const agent = this.andy.agents.get?.(this.agentId)
      || this.andy.getAgent?.(this.agentId);
    if (!agent || !agent.emotion) return null;

    return {
      current: { ...agent.emotion.current },
      stress: agent.emotion.stress,
    };
  }

  /**
   * @deprecated Use getAgentEmotion instead
   */
  getBobbyEmotion() {
    return this.getAgentEmotion();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    this._requireInit('getStats');
    return {
      tickCount: this.store.tickCount,
      virtualTime: this.store.virtualTime,
      pendingSignals: this.signalBuffer.pendingCount,
      storyStats: this.store.getStats(this.agentId),
    };
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /**
   * R7 fix: Guard against calling methods before init().
   * @param {string} methodName - for error message
   * @private
   */
  _requireInit(methodName) {
    if (!this._initialized) {
      throw new Error(`AndyBridge.${methodName}() called before init(). Call await bridge.init() first.`);
    }
  }

  /**
   * 将情绪信号注入 agent
   * @private
   */
  _applySignalToAgent(signal) {
    if (!this.andy || !signal.mergedEffect) return;

    const agent = this.andy.agents?.get?.(this.agentId)
      || this.andy.getAgent?.(this.agentId);
    if (!agent || !agent.emotion) return;

    const effect = signal.mergedEffect;

    // R9 fix: route emotion signals through applyEffect() instead of
    // directly writing to current. This ensures regulation strategies,
    // mood update, co-activation, and maxDeltaPerTick clamping are applied.
    // Fall back to direct scalar update if applyEffect is not available
    // (e.g., in test mocks or non-standard emotion objects).
    if (typeof agent.emotion.applyEffect === 'function') {
      agent.emotion.applyEffect(effect);
    } else {
      for (const [dim, delta] of Object.entries(effect)) {
        if (agent.emotion.current[dim] !== undefined && Number.isFinite(delta)) {
          agent.emotion.current[dim] = Math.max(-1, Math.min(1, agent.emotion.current[dim] + delta));
        }
      }
    }
  }

  /**
   * 序列化所有 agent 状态（快照用）
   * @private
   */
  _serializeAgents() {
    if (!this.andy) return Buffer.alloc(0);

    const agents = this.andy.agents?.entries?.()
      || Object.entries(this.andy.agents || {});

    const parts = [];
    for (const [id, agent] of agents) {
      if (agent.toJSON) {
        parts.push(JSON.stringify({ id, ...agent.toJSON() }));
      }
    }
    return Buffer.from(parts.join('\n---\n'));
  }

  /**
   * 从快照恢复 agent 状态
   * R9 fix: expanded restore to cover more subsystems while respecting SDK→agent boundary.
   * Restores: emotion (current + stress + mood), needs, position, health, socialEnergy,
   * behaviorField (B vector), stateMachine (currentState), _ticksSinceReflection/DriftCheck.
   * Memory, personality, schedule, intrinsicMotivation, emotionRegulation, and
   * proceduralMemory require full fromJSON reconstruction — those need
   * AndyEngine.fromJSON() (the canonical full restore path).
   * @private
   */
  _restoreAgents(data) {
    if (!this.andy || !data || data.length === 0) return;

    // 简单的 line-delimited JSON 恢复
    const text = data.toString();
    const chunks = text.split('\n---\n');

    for (const chunk of chunks) {
      try {
        const state = JSON.parse(chunk);
        const agent = this.andy.agents?.get?.(state.id)
          || this.andy.getAgent?.(state.id);
        if (agent) {
          // Emotion: restore current values and stress
          if (agent.emotion && state.emotion) {
            if (state.emotion.current && agent.emotion.current) {
              for (const [dim, val] of Object.entries(state.emotion.current)) {
                if (Number.isFinite(val)) agent.emotion.current[dim] = val;
              }
            }
            if (Number.isFinite(state.emotion.stress) && agent.emotion.setStress) {
              agent.emotion.setStress(state.emotion.stress);
            }
            // R9: restore mood (running average of emotion)
            if (state.emotion.mood && agent.emotion.mood) {
              for (const [dim, val] of Object.entries(state.emotion.mood)) {
                if (Number.isFinite(val)) agent.emotion.mood[dim] = val;
              }
            }
            // R10: restore baseline (long-term personality-derived anchor).
            // Without this, emotions regress toward the constructor default baseline
            // instead of the evolved one, producing systematically biased emotion dynamics.
            if (state.emotion.baseline && agent.emotion.baseline) {
              for (const [dim, val] of Object.entries(state.emotion.baseline)) {
                if (Number.isFinite(val)) agent.emotion.baseline[dim] = val;
              }
            }
          }
          // R9: restore needs
          if (agent.needs && state.needs && state.needs.needs) {
            for (const [need, val] of Object.entries(state.needs.needs)) {
              if (Number.isFinite(val) && agent.needs.needs[need] !== undefined) {
                agent.needs.needs[need] = val;
              }
            }
          }
          if (state.position !== undefined) agent.position = state.position;
          // R34 P2 fix: validate health with Number.isFinite, matching the
          // pattern used for all other numeric fields in _restoreAgents.
          if (typeof state.health === 'number' && Number.isFinite(state.health)) {
            agent.health = state.health;
          }
          if (Number.isFinite(state.socialEnergy)) agent.socialEnergy = state.socialEnergy;
          // R9: restore behaviorField B vector
          if (state.behaviorField && state.behaviorField.B && agent.behaviorField) {
            for (let i = 0; i < Math.min(state.behaviorField.B.length, agent.behaviorField.B.length); i++) {
              if (Number.isFinite(state.behaviorField.B[i])) {
                agent.behaviorField.B[i] = state.behaviorField.B[i];
              }
            }
            // R10: restore velocity (Langevin dynamics momentum).
            // Without this, agents lose momentum after bridge restore, producing
            // a discontinuity in behavioral trajectory (zero-velocity tick).
            if (state.behaviorField.velocity && agent.behaviorField.velocity) {
              for (let i = 0; i < Math.min(state.behaviorField.velocity.length, agent.behaviorField.velocity.length); i++) {
                if (Number.isFinite(state.behaviorField.velocity[i])) {
                  agent.behaviorField.velocity[i] = state.behaviorField.velocity[i];
                }
              }
            }
            // R10: restore _prevB, _lastLabel, _lastLabelConfidence, _tickCount
            // for full BehaviorField fidelity.
            if (state.behaviorField._prevB && agent.behaviorField._prevB) {
              for (let i = 0; i < Math.min(state.behaviorField._prevB.length, agent.behaviorField._prevB.length); i++) {
                if (Number.isFinite(state.behaviorField._prevB[i])) {
                  agent.behaviorField._prevB[i] = state.behaviorField._prevB[i];
                }
              }
            }
            if (typeof state.behaviorField._lastLabel === 'string') {
              agent.behaviorField._lastLabel = state.behaviorField._lastLabel;
            }
            if (Number.isFinite(state.behaviorField._lastLabelConfidence)) {
              agent.behaviorField._lastLabelConfidence = state.behaviorField._lastLabelConfidence;
            }
            if (Number.isFinite(state.behaviorField._tickCount)) {
              agent.behaviorField._tickCount = state.behaviorField._tickCount;
            }
          }
          // R9: restore stateMachine currentState
          if (state.stateMachine && state.stateMachine.currentState && agent.stateMachine) {
            agent.stateMachine.currentState = state.stateMachine.currentState;
          }
          // R9: restore tick counters
          if (Number.isFinite(state._ticksSinceReflection)) {
            agent._ticksSinceReflection = state._ticksSinceReflection;
          }
          if (Number.isFinite(state._ticksSinceDriftCheck)) {
            agent._ticksSinceDriftCheck = state._ticksSinceDriftCheck;
          }
        }
      } catch {
        // 跳过损坏的条目
      }
    }
  }
}

module.exports = { AndyBridge };
