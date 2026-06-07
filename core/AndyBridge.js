/**
 * AndyBridge — Andy 模拟 ↔ Bobby 对话 的桥梁
 *
 * 职责:
 *   1. 接收用户消息 → 情绪信号提取 → 缓冲
 *   2. Andy tick 时 → 消费缓冲 → 注入 Bobby agent 情绪
 *   3. 从 tick 结果生成故事 → 持久化
 *   4. Bobby 对话时 → 查询最近故事 → 注入 system prompt
 *
 * 数据流:
 *   用户消息 → push() → buffer → [等待 tick] → consume() → applyEffect
 *   Andy tick → tick() → stories → SimulationStore
 *   Bobby 对话 → getStoriesForBobby() → prompt 注入
 */

const { EmotionSignalBuffer } = require('./EmotionSignalBuffer');
const { StoryGenerator } = require('./StoryGenerator');
const { SimulationStore } = require('../store');

class AndyBridge {
  /**
   * @param {Object} options
   * @param {Object} options.andy - Andy 引擎实例（World 或 Simulator）
   * @param {string} options.dbPath - SQLite 数据库路径
   * @param {number} options.snapshotInterval - 快照间隔 (ticks)
   */
  constructor(options = {}) {
    this.andy = options.andy;
    this.agentId = options.agentId || 'bobby';

    // 核心模块
    this.signalBuffer = new EmotionSignalBuffer();
    this.storyGenerator = new StoryGenerator();
    this.store = new SimulationStore({
      dbPath: options.dbPath || ':memory:',
      snapshotInterval: options.snapshotInterval ?? 12,
    });

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
    const stories = [];

    // 1. 消费情绪信号缓冲 → 注入 Bobby agent
    const signal = this.signalBuffer.consume();
    if (signal) {
      this._applySignalToAgent(signal);
      const signalStory = this.storyGenerator.generateFromSignal(
        signal.storyText,
        signal.mergedEffect,
        this.store.tickCount,
      );
      if (signalStory) stories.push(signalStory);
    }

    // 2. 从 tick 结果生成故事
    const tickStories = this.storyGenerator.generateFromTick(tickResult, this.agentId);
    if (tickStories) stories.push(...tickStories);

    // 3. 交给 SimulationStore（缓冲 + 定期持久化）
    this.store.onTick(tickResult, stories);

    return { stories, signalConsumed: signal };
  }

  // ═══════════════════════════════════════════
  // Bobby 查询（对话时调用）
  // ═══════════════════════════════════════════

  /**
   * 获取 Bobby 最近的故事（供 system prompt 注入）
   *
   * @param {number} hours - 最近多少小时
   * @param {number} limit - 最多几条
   * @returns {Story[]}
   */
  getStoriesForBobby(hours = 72, limit = 5) {
    return this.store.getStoriesForBobby(this.agentId, hours, limit);
  }

  /**
   * 获取 Bobby 的当前情绪状态
   * @returns {Object|null} { current: Float64Array, stress: number }
   */
  getBobbyEmotion() {
    if (!this.andy || !this.andy.agents) return null;

    const bobby = this.andy.agents.get?.(this.agentId)
      || this.andy.getAgent?.(this.agentId);
    if (!bobby || !bobby.emotion) return null;

    return {
      current: [...bobby.emotion.current],
      stress: bobby.emotion.stress,
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
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
   * 将情绪信号注入 Bobby agent
   * @private
   */
  _applySignalToAgent(signal) {
    if (!this.andy || !signal.mergedEffect) return;

    const bobby = this.andy.agents?.get?.(this.agentId)
      || this.andy.getAgent?.(this.agentId);
    if (!bobby || !bobby.emotion) return;

    const effect = signal.mergedEffect;

    // 直接修改 current（简化版，跳过 applyEffect 的完整评估）
    for (const [dim, delta] of Object.entries(effect)) {
      if (bobby.emotion.current[dim] !== undefined) {
        bobby.emotion.current[dim] = Math.max(-1, Math.min(1,
          bobby.emotion.current[dim] + delta
        ));
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
        if (agent && agent.fromJSON) {
          Object.assign(agent, agent.fromJSON(state));
        }
      } catch {
        // 跳过损坏的条目
      }
    }
  }
}

module.exports = { AndyBridge };
