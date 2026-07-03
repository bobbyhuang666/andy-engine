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
const { MemoryStore } = require('./MemoryStore');
const { diagnostics } = require('../shared/Diagnostics');

class SimulationStore {
  /**
   * @param {Object} options
   * @param {string} options.dbPath - SQLite 文件路径，':memory:' for in-memory
   * @param {string} [options.storeType] - 'memory' for pure MemoryStore, 'sqlite' or omitted for SQLiteStore
   * @param {number} options.snapshotInterval - 每多少 tick 保存一次快照 (default: 12)
   * @param {number} options.storyFlushInterval - 每多少 tick 刷出故事缓冲 (default: 1)
   * @param {number} options.maxStoryBuffer - 内存中最多缓存多少条故事 (default: 200)
   * @param {number} options.snapshotKeepCount - 保留最近多少个快照 (default: 720)
   * @param {number} options.storyDecayInterval - 每多少 tick 做一次故事衰减 (default: 288, ~1天)
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || ':memory:';
    this.storeType = options.storeType || 'sqlite';
    this.snapshotInterval = SimulationStore._positiveInterval(options.snapshotInterval, 12);
    this.storyFlushInterval = SimulationStore._positiveInterval(options.storyFlushInterval, 1);
    this.maxStoryBuffer = options.maxStoryBuffer ?? 200;
    this.snapshotKeepCount = options.snapshotKeepCount ?? 720;
    this.storyDecayInterval = SimulationStore._positiveInterval(options.storyDecayInterval, 288);

    /** @type {SQLiteStore} */
    this.db = null;

    // 热数据
    this.tickCount = 0;
    this.virtualTime = null;
    this.storyBuffer = [];       // 待写入的故事
    this._snapshotFn = null;     // 外部提供的序列化函数
    this._restoreFn = null;      // 外部提供的反序列化函数
  }

  static _positiveInterval(value, fallback) {
    const interval = Number(value ?? fallback);
    return Number.isFinite(interval) && interval > 0 ? Math.max(1, Math.floor(interval)) : fallback;
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
    // R19: respect storeType='memory' — use MemoryStore instead of SQLiteStore
    // when user explicitly requests in-memory storage without SQLite dependency.
    if (this.storeType === 'memory') {
      this.db = new MemoryStore();
    } else {
      try {
        this.db = new SQLiteStore(this.dbPath);
      } catch (e) {
        if (e.message && e.message.includes('better-sqlite3')) {
          diagnostics.warn('SQLite not available, falling back to MemoryStore');
          this.db = new MemoryStore();
        } else {
          throw e;
        }
      }
    }

    // 从元数据恢复状态
    const savedTick = this.db.get('tick_count');
    const savedTime = this.db.get('virtual_time');

    // Guard corrupt meta: parseInt non-numeric strings → NaN, fall back to safe defaults
    if (savedTick != null) {
      const parsed = parseInt(savedTick, 10);
      this.tickCount = Number.isFinite(parsed) ? parsed : 0;
    }
    if (savedTime != null) {
      const parsed = parseInt(savedTime, 10);
      this.virtualTime = Number.isFinite(parsed) ? new Date(parsed) : null;
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
    // R24 P1 fix: use ?? instead of || to correctly handle tickNumber=0.
    // 0 || expr evaluates to expr; 0 ?? expr evaluates to 0.
    this.tickCount = tickResult.tickNumber ?? this.tickCount + 1;
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
    // 使用 virtualTime 进行过滤，支持快进模拟
    const now = this.virtualTime?.getTime() || Date.now();

    // 合并内存缓冲和数据库
    const buffered = this.storyBuffer
      .filter(s => s.agentId === agentId)
      .filter(s => now - s.timestamp < hours * 3600 * 1000);

    const persisted = this.db.getRecent(agentId, hours, limit, now);

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
    const now = this.virtualTime?.getTime() || Date.now();
    return this.db.getByEmotion(agentId, emotionTag, hours, limit, now);
  }

  /**
   * 获取统计信息
   */
  getStats(agentId) {
    const now = this.virtualTime?.getTime() || Date.now();
    return this.db.stats(agentId, now);
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

    // P0 fix: _flushStories() 可能 throw，必须确保 db.close() 在 finally 路径执行，
    // 避免连接泄漏。收集首个错误，close 后再 throw，不吞掉 shutdown 应暴露的错误。
    let firstError = null;
    let snapshotError = null;
    try {
      // 1. 刷出故事缓冲
      this._flushStories();
    } catch (e) {
      firstError = e;
    }

    // 2. 保存最终快照（flush 失败时仍尝试保存已有快照）
    if (!firstError || this._snapshotFn) {
      try {
        this._saveSnapshot({ throwOnFailure: true });
      } catch (e) {
        snapshotError = e;
      }
    }

    // 3. 保存元数据
    // If the final snapshot failed, do not advance tick/time metadata beyond
    // the latest durable snapshot. Otherwise the next init can restore old
    // agent state while believing it is at a newer tick.
    if (!snapshotError) {
      try {
        this.db.set('tick_count', String(this.tickCount));
        if (this.virtualTime) {
          this.db.set('virtual_time', String(this.virtualTime.getTime()));
        }
      } catch (e) {
        diagnostics.collect({ type: 'metadata-save-failed', error: e.message });
        snapshotError = e;
      }
    } else {
      diagnostics.collect({
        type: 'metadata-save-skipped',
        reason: 'snapshot-save-failed',
        tickCount: this.tickCount,
      });
    }

    // 4. 关闭数据库 (无论如何都要关闭,避免连接泄漏)
    try {
      this.db.close();
    } catch (e) {
      if (!firstError) firstError = e;
    }
    this.db = null;

    // 5. 传播错误 (flush > snapshot > metadata > close)
    if (firstError) throw firstError;
    if (snapshotError) throw snapshotError;
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /** 刷出故事缓冲到 SQLite */
  _flushStories() {
    if (this.storyBuffer.length === 0) return;

    // Copy first; only clear the buffer after a successful write.
    // The previous implementation did splice(0) before saveStories, so a DB
    // failure permanently lost the buffered stories with no recovery path.
    const stories = this.storyBuffer.slice();
    try {
      this.db.saveStories(stories);
    } catch (e) {
      diagnostics.collect({
        type: 'story-flush-failed',
        error: e.message,
        pendingCount: this.storyBuffer.length,
      });
      // Preserve the buffer (do not clear) and re-throw to maintain the
      // existing error-propagation semantics (shutdown/final save errors
      // must surface to the caller rather than being swallowed).
      throw e;
    }
    // Success: remove exactly the stories we just persisted.
    this.storyBuffer.splice(0, stories.length);
  }

  /** 保存当前快照
   * @param {Object} [opts]
   * @param {boolean} [opts.throwOnFailure=false] - R39 P1: final snapshot 失败时抛出,
   *   避免 shutdown() 吞掉落盘错误导致调用方误以为安全落盘。
   * @returns {boolean} 是否成功保存
   */
  _saveSnapshot(opts = {}) {
    if (!this._snapshotFn) return true;

    try {
      const data = this._snapshotFn();
      this.db.saveSnapshot(this.tickCount, this.virtualTime?.getTime() || Date.now(), data);
      this.db.prune(this.snapshotKeepCount);
      return true;
    } catch (e) {
      diagnostics.collect({ type: 'snapshot-save-failed', error: e.message });
      if (opts.throwOnFailure) {
        throw new Error(`SimulationStore snapshot save failed: ${e.message}`);
      }
      return false;
    }
  }

  /** 衰减老故事 */
  _decayStories() {
    const now = this.virtualTime?.getTime() || Date.now();
    this.db.decay(0.95, 0.05, 30, now);
  }
}

module.exports = { SimulationStore };
