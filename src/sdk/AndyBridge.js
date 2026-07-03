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
      // R39 P1 fix: 用 storeType:'memory' 让 SimulationStore.init() 正确创建 MemoryStore,
      // 而不是手动覆盖 this.store.db。原实现手动覆盖 db 后,init() 会因 storeType 默认
      // 'sqlite' 而重新 new SQLiteStore,覆盖掉 MemoryStore,破坏 memory fallback 语义。
      // 构造期也同步创建 db,使构造后即可确认 memory 模式(无需等 init),且 init() 因
      // storeType='memory' 不会覆盖。
      this.store = new SimulationStore({
        storeType: 'memory',
        snapshotInterval: options.snapshotInterval ?? 12,
      });
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
            storeType: 'memory',
            snapshotInterval: options.snapshotInterval ?? 12,
          });
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

    if (this.store.tickCount > 0) {
      console.warn(
        '[AndyBridge] Restored from snapshot (tick=%d, time=%s). ' +
        'Bridge snapshots are partial: memory, personality, schedule, ' +
        'intrinsicMotivation, emotionRegulation, proceduralMemory, ' +
        'futureTendency, _actionTraceHistory, _perceivedEventIds, ' +
        'isOnline, name, and appraisalBiases are NOT restored. ' +
        'Use AndyEngine.fromJSON() for full state reconstruction.',
        this.store.tickCount,
        this.store.virtualTime ? new Date(this.store.virtualTime).toISOString() : 'N/A',
      );
    }

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
    const simTime = tickResult?.time
      ? new Date(tickResult.time)
      : (this.store.virtualTime ? new Date(this.store.virtualTime) : undefined);
    const options = { rng: this._rng, simTime };
    const currentTick = tickResult?.tickNumber ?? this.store.tickCount + 1;

    // 2. 消费情绪信号缓冲 → 注入 agent
    const signal = this.signalBuffer.consume();
    if (signal) {
      this._applySignalToAgent(signal);
      const signalStory = this.storyGenerator.generateFromSignal(
        signal.storyText,
        signal.mergedEffect,
        currentTick,
        { ...options, agentId: this.agentId },
      );
      if (signalStory) stories.push(signalStory);
    }

    // 3. 从 tick 结果生成故事
    const tickStories = this.storyGenerator.generateFromTick(tickResult, this.agentId, options);
    if (tickStories) stories.push(...tickStories);

    // 4. 交给 SimulationStore（缓冲 + 定期持久化）
    // Store must see the stories generated for this tick. Passing the empty
    // array before generation silently dropped one-tick bridge stories.
    this.store.onTick(tickResult, stories);

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

    const committer = this.andy.world?.effectCommitter || this.andy.effectCommitter || null;
    if (committer && typeof committer.commit === 'function') {
      committer.commit({
        deltas: [{
          type: 'emotion',
          target: 'agent',
          agentId: agent.id || this.agentId,
          changes: effect,
          multiplier: 1,
          appraisalModifiers: null,
          stress: null,
        }],
      });
      return;
    }

    // Fallback for isolated tests/non-standard SDK hosts without a world
    // EffectCommitter. Real engine-backed signals should take the path above.
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

    const snapshots = [];
    for (const [id, agent] of agents) {
      if (agent.toJSON) {
        snapshots.push({ id, ...agent.toJSON() });
      }
    }
    return Buffer.from(JSON.stringify(snapshots));
  }

  /**
   * 从快照恢复 agent 状态
   * R9 fix: expanded restore to cover more subsystems while respecting SDK→agent boundary.
   * Restores: emotion (current + stress + mood + baseline), needs, position, health,
   * socialEnergy, behaviorField (B + velocity + _prevB + _lastLabel + _lastLabelConfidence
   * + _tickCount), stateMachine (currentState), _ticksSinceReflection/DriftCheck.
   *
   * NOT restored (serialized by toJSON but skipped in _restoreAgents):
   * memory, personality, schedule, intrinsicMotivation, emotionRegulation,
   * proceduralMemory, futureTendency, _actionTraceHistory, _perceivedEventIds,
   * isOnline, name, appraisalBiases.
   *
   * These require full fromJSON reconstruction via AndyEngine.fromJSON()
   * (the canonical full restore path).
   * @private
   */
  _restoreAgents(data) {
    if (!this.andy || !data || data.length === 0) return;

    const text = data.toString();
    const chunks = this._parseAgentSnapshotChunks(text);

    for (const chunk of chunks) {
      try {
        const state = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
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
            // R94-BOUNDARY-1: clamp all emotion fields after raw restore
            if (agent.emotion._clamp) {
              agent.emotion._clamp();
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
              // R94-BOUNDARY-1: clamp needs after raw restore
              if (agent.needs._clamp) {
                agent.needs._clamp();
              }
          }
          // R35 P1 fix: validate position is a non-empty string. Invalid position
          // (number, object, empty string) breaks all region-based subsystems
          // (encounter detection, schedule, social interactions).
          if (typeof state.position === 'string' && state.position.length > 0) {
            agent.position = state.position;
            // RC-1 fix: sync SpatialEngine._coords + RegionGrid to the restored
            // region. AndyBridge 序列化每个 agent 时只携带 position（区域名），
            // 不携带连续坐标；恢复后 _coords 仍是 addAgent 时的区域中心默认值，
            // 与 agent.position 不一致。下一 tick Phase 5 _syncRegions() 用陈旧
            // _coords 反推旧区域 → emit regionChange → PositionDelta 把 agent.position
            // 回滚到旧区域。这里把 _coords 对齐到恢复区域的中心（R41 SP-1 模式，
            // regionCenter 不消费 RNG，不漂移 golden fixture），并同步 RegionGrid，
            // 使 _coords 与 agent.position 一致，消除回滚。全部用存在性检查守卫，
            // 离散模式（spatial 为 null）不崩溃。
            const world = this.andy && this.andy.world;
            if (world) {
              if (world.regions && typeof world.regions.place === 'function') {
                world.regions.place(agent.id, agent.position);
              }
              if (world.spatial && typeof world.spatial.setCoords === 'function' &&
                  world.spatial.worldMap && typeof world.spatial.worldMap.regionCenter === 'function') {
                const center = world.spatial.worldMap.regionCenter(agent.position);
                // R41 P1 fix: handle null from regionCenter (unknown region).
                if (center) {
                  world.spatial.setCoords(agent.id, center.x, center.y);
                }
              }
            }
          }
          // R34 P2 fix: validate health with Number.isFinite, matching the
          // pattern used for all other numeric fields in _restoreAgents.
          if (typeof state.health === 'number' && Number.isFinite(state.health)) {
            agent.health = state.health;
          }
          // R35 P2 fix: clamp socialEnergy to [0,1] at restore time. Out-of-range
          // values (e.g., 2.0) affect schedule decisions for one tick before
          // PhysiologyRuntime self-corrects.
          if (Number.isFinite(state.socialEnergy)) {
            agent.socialEnergy = Math.max(0, Math.min(1, state.socialEnergy));
          }
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
          // R35 P1 fix: validate currentState against domain states. An invalid
          // state (not in domain.states) causes wrong schedule, motivation, and
          // emotional decisions until the next BehaviorField label change.
          if (state.stateMachine && state.stateMachine.currentState && agent.stateMachine) {
            const domainStates = agent.domain?.states;
            if (!domainStates || domainStates[state.stateMachine.currentState]) {
              agent.stateMachine.currentState = state.stateMachine.currentState;
            }
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

  _parseAgentSnapshotChunks(text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && typeof parsed === 'object') {
        return [parsed];
      }
    } catch (_) {
      // Fall through to legacy delimiter format.
    }
    return text.split('\n---\n');
  }
}

module.exports = { AndyBridge };
