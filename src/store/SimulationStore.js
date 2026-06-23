/**
 * SimulationStore — Andy 模拟的持久化管理器
 *
 * 管理三个存储层的生命周期：
 *   1. 热数据 (内存): 当前 agent 状态、社交图、故事缓冲
 *   2. 温数据 (SQLite): 故事历史、快照、元数据
 *   3. 冷数据 (JSON/binary): 配置文件（启动时加载一次）
 *
 * 使用方式:
 *   const store = new SimulationStore({ dbPath: './data/andy.db' });
 *   await store.init(agents, graph);
 *
 *   // tick 循环中
 *   store.onTick(tickResult);
 *   const stories = store.getStoriesForAgent();
 *
 *   // 关闭时
 *   await store.shutdown();
 */

const { SQLiteStore } = require('./SQLiteStore');
const { diagnostics } = require('../shared/Diagnostics');

class SimulationStore {
  /**
   * @param {Object} options
   * @param {string} options.dbPath - SQLite 文件路径
   * @param {number} options.snapshotInterval - 每多少 tick 保存一次快照 (default: 12)
   * @param {number} options.storyFlushInterval - 每多少 tick 刷出故事缓冲 (default: 1)
   * @param {number} options.maxStoryBuffer - 内存中最多缓存多少条故事 (default: 200)
   * @param {number} options.snapshotKeepCount - 保留最近多少个快照 (default: 720)
   * @param {number} options.storyDecayInterval - 每多少 tick 做一次故事衰减 (default: 288, ~1天)
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || ':memory:';
    this.snapshotInterval = options.snapshotInterval ?? 12;
    this.storyFlushInterval = options.storyFlushInterval ?? 1;
    this.maxStoryBuffer = options.maxStoryBuffer ?? 200;
    this.snapshotKeepCount = options.snapshotKeepCount ?? 720;
    this.storyDecayInterval = options.storyDecayInterval ?? 288;

    /** @type {SQLiteStore} */
    this.db = null;

    // 热数据
    this.tickCount = 0;
    this.virtualTime = null;
    this.storyBuffer = [];       // 待写入的故事
    this._snapshotFn = null;     // 外部提供的序列化函数
    this._restoreFn = null;      // 外部提供的反序列化函数
  }

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  /**
   * 初始化存储
   * @param {Object} options
   * @param {Function} options.onSnapshot - 序列化 agent 状态的函数: () => Buffer
   * @param {Function} options.onRestore - 反序列化函数: (Buffer) => void
   */
  async init({ onSnapshot, onRestore } = {}) {
    this._snapshotFn = onSnapshot || (() => Buffer.alloc(0));
    this._restoreFn = onRestore || (() => {});

    // 打开数据库
    this.db = new SQLiteStore(this.dbPath);

    // 从元数据恢复状态
    const savedTick = this.db.get('tick_count');
    const savedTime = this.db.get('virtual_time');

    if (savedTick) {
      this.tickCount = parseInt(savedTick, 10);
    }
    if (savedTime) {
      this.virtualTime = new Date(parseInt(savedTime, 10));
    }

    // 尝试恢复最近快照
    const snapshot = this.db.loadLatest();
    if (snapshot && onRestore) {
      onRestore(snapshot.data);
    }

    // 加载故事缓冲
    this.storyBuffer = []
; // 重启后从空缓冲开始，历史故事从DB按需查询

    return {
      restoredTick: this.tickCount,
      restoredTime: this.virtualTime,
      hasSnapshot: !!snapshot,
    };
  }

  // ═══════════════════════════════════════════
  // Tick 生命周期
  // ═══════════════════════════════════════════

  /**
   * 每 tick 后调用
   * @param {Object} tickResult - Simulator.tick() 的返回值
   * @param {Story[]} newStories - 本 tick 产生的故事
   */
  onTick(tickResult, newStories = []) {
    this.tickCount = tickResult.tickNumber || this.tickCount + 1;
    this.virtualTime = tickResult.time ? new Date(tickResult.time) : this.virtualTime;

    // 追加故事到缓冲
    if (newStories.length > 0) {
      this.storyBuffer.push(...newStories);
    }

    // 缓冲溢出保护
    if (this.storyBuffer.length > this.maxStoryBuffer) {
      this.storyBuffer = this.storyBuffer.slice(-this.maxStoryBuffer);
    }

    // 定期刷出故事
    if (this.tickCount % this.storyFlushInterval === 0 && this.storyBuffer.length > 0) {
      this._flushStories();
    }

    // 定期保存快照
    if (this.tickCount % this.snapshotInterval === 0) {
      this._saveSnapshot();
    }

    // 定期衰减清理
    if (this.tickCount % this.storyDecayInterval === 0) {
      this._decayStories();
    }
  }

  // ═══════════════════════════════════════════
  // 查询接口（对话时使用）
  // ═══════════════════════════════════════════

  /**
   * 获取 agent 最近的故事（供 system prompt 注入）
   * @param {string} agentId - agent id
   * @param {number} hours - 最近多少小时
   * @param {number} limit - 最多几条
   * @returns {Story[]}
   */
  getStoriesForAgent(agentId = 'default', hours = 72, limit = 5) {
    // 合并内存缓冲和数据库
    const buffered = this.storyBuffer
      .filter(s => s.agentId === agentId)
      .filter(s => Date.now() - s.timestamp < hours * 3600 * 1000);

    const persisted = this.db.getRecent(agentId, hours, limit);

    // 合并去重（按 tick + content）
    const seen = new Set();
    const merged = [];
    for (const story of [...buffered, ...persisted]) {
      const key = `${story.tick}:${story.content}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(story);
      }
    }

    // 按重要性排序
    merged.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
    return merged.slice(0, limit);
  }

  /**
   * @deprecated Use getStoriesForAgent instead
   */
  getStoriesForBobby(agentId = 'default', hours = 72, limit = 5) {
    return this.getStoriesForAgent(agentId, hours, limit);
  }

  /**
   * 按情绪查询故事
   */
  getStoriesByEmotion(agentId, emotionTag, hours = 168, limit = 10) {
    return this.db.getByEmotion(agentId, emotionTag, hours, limit);
  }

  /**
   * 获取统计信息
   */
  getStats(agentId) {
    return this.db.stats(agentId);
  }

  // ═══════════════════════════════════════════
  // 元数据快捷方法
  // ═══════════════════════════════════════════

  getMeta(key) {
    return this.db.get(key);
  }

  setMeta(key, value) {
    this.db.set(key, value);
  }

  // ═══════════════════════════════════════════
  // 关闭
  // ═══════════════════════════════════════════

  /**
   * 优雅关闭：刷出缓冲、保存快照、关闭数据库
   */
  async shutdown() {
    if (!this.db) return;

    // 1. 刷出故事缓冲
    this._flushStories();

    // 2. 保存最终快照
    this._saveSnapshot();

    // 3. 保存元数据
    this.db.set('tick_count', String(this.tickCount));
    if (this.virtualTime) {
      this.db.set('virtual_time', String(this.virtualTime.getTime()));
    }

    // 4. 关闭数据库
    this.db.close();
    this.db = null;
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /** 刷出故事缓冲到 SQLite */
  _flushStories() {
    if (this.storyBuffer.length === 0) return;

    const stories = this.storyBuffer.splice(0); // 取出并清空缓冲
    this.db.saveStories(stories);
  }

  /** 保存当前快照 */
  _saveSnapshot() {
    if (!this._snapshotFn) return;

    try {
      const data = this._snapshotFn();
      this.db.saveSnapshot(this.tickCount, this.virtualTime?.getTime() || Date.now(), data);
      this.db.prune(this.snapshotKeepCount);
    } catch (e) {
      diagnostics.collect({ type: 'snapshot-save-failed', error: e.message });
    }
  }

  /** 衰减老故事 */
  _decayStories() {
    this.db.decay(0.95, 0.05, 30);
  }
}

module.exports = { SimulationStore };
