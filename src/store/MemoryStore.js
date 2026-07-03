/**
 * MemoryStore — 内存存储实现
 *
 * 实现 StoryStore、SnapshotStore、MetaStore 三个接口。
 * 使用内存存储，不需要 SQLite。
 *
 * 用于：
 * - 测试
 * - 无 SQLite 环境
 * - 临时演示
 */

class MemoryStore {
  constructor() {
    this.stories = [];
    this.snapshots = [];
    this.meta = {};
    this._nextStoryId = 1;
  }

  // ═══════════════════════════════════════════
  // StoryStore 接口
  // ═══════════════════════════════════════════

  /**
   * 批量保存故事
   * @param {Story[]} stories
   * @returns {number} 实际写入条数
   */
  saveStories(stories) {
    if (!stories || stories.length === 0) return 0;

    for (const s of stories) {
      this.stories.push({
        id: this._nextStoryId++,
        tick: s.tick,
        timestamp: s.timestamp,
        agentId: s.agentId,
        category: s.category || 'daily_life',
        content: s.content,
        emotionTag: s.emotionTag || null,
        importance: s.importance ?? 0.5,
        source: s.source || 'simulation',
      });
    }

    return stories.length;
  }

  /**
   * 查询某 agent 最近的故事（按重要性降序 + 时间降序）
   * @param {string} agentId
   * @param {number} hours - 最近多少小时
   * @param {number} limit - 最多返回几条
   * @param {number} [now] - 当前时间戳（默认 Date.now()）
   * @returns {Story[]}
   */
  getRecent(agentId, hours = 72, limit = 5, now) {
    const cutoff = (now ?? Date.now()) - hours * 3600 * 1000;

    return this.stories
      .filter(s => s.agentId === agentId && s.timestamp > cutoff)
      .sort((a, b) => {
        // 按重要性降序，然后时间降序
        if (b.importance !== a.importance) {
          return b.importance - a.importance;
        }
        return b.timestamp - a.timestamp;
      })
      .slice(0, limit);
  }

  /**
   * 按情绪标签查询
   * @param {string} agentId
   * @param {string} emotionTag
   * @param {number} hours
   * @param {number} limit
   * @param {number} [now] - 当前时间戳（默认 Date.now()）
   * @returns {Story[]}
   */
  getByEmotion(agentId, emotionTag, hours = 168, limit = 10, now) {
    const cutoff = (now ?? Date.now()) - hours * 3600 * 1000;

    return this.stories
      .filter(s => s.agentId === agentId && s.emotionTag === emotionTag && s.timestamp > cutoff)
      .sort((a, b) => {
        if (b.importance !== a.importance) {
          return b.importance - a.importance;
        }
        return b.timestamp - a.timestamp;
      })
      .slice(0, limit);
  }

  /**
   * 衰减老故事 + 清理过期故事
   * @param {number} decayFactor - 衰减系数
   * @param {number} minImportance - 最低重要性
   * @param {number} maxAgeDays - 最大天数
   * @param {number} [now] - 当前时间戳
   * @returns {{ decayed: number, deleted: number }}
   */
  decay(decayFactor = 0.95, minImportance = 0.05, maxAgeDays = 30, now) {
    now = now ?? Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const maxAge = now - maxAgeDays * 24 * 3600 * 1000;

    let decayed = 0;
    let deleted = 0;

    // 衰减: 超过 7 天的故事降低重要性
    for (const story of this.stories) {
      if (story.timestamp < weekAgo && story.importance > minImportance) {
        story.importance *= decayFactor;
        decayed++;
      }
    }

    // 删除: 重要性过低或过老的故事
    const initialLength = this.stories.length;
    this.stories = this.stories.filter(s => {
      if (s.importance < minImportance && s.timestamp < weekAgo) {
        return false;
      }
      if (s.timestamp < maxAge) {
        return false;
      }
      return true;
    });
    deleted = initialLength - this.stories.length;

    return { decayed, deleted };
  }

  /**
   * 故事统计
   * @param {string} agentId
   * @param {number} [now] - 当前时间戳
   * @returns {{ total: number, recentDay: number, recentWeek: number }}
   */
  stats(agentId, now) {
    now = now ?? Date.now();
    const dayAgo = now - 24 * 3600 * 1000;
    const weekAgo = now - 7 * 24 * 3600 * 1000;

    const agentStories = this.stories.filter(s => s.agentId === agentId);
    const total = agentStories.length;
    const recentDay = agentStories.filter(s => s.timestamp > dayAgo).length;
    const recentWeek = agentStories.filter(s => s.timestamp > weekAgo).length;

    return { total, recentDay, recentWeek };
  }

  // ═══════════════════════════════════════════
  // SnapshotStore 接口
  // ═══════════════════════════════════════════

  /**
   * 保存快照
   * @param {number} tick
   * @param {number} virtualTime
   * @param {Buffer} data
   * @param {Object} [meta]
   */
  saveSnapshot(tick, virtualTime, data, meta = null) {
    // 删除同 tick 的旧快照（模拟 INSERT OR REPLACE）
    this.snapshots = this.snapshots.filter(s => s.tick !== tick);

    // R39 P1 fix: 拷贝 Buffer 防止共享引用污染。
    // 原实现直接存入 data 引用,保存后修改原 Buffer 会反向污染 store 内部快照。
    const dataCopy = Buffer.isBuffer(data) ? Buffer.from(data) : data;

    this.snapshots.push({
      tick,
      virtualTime,
      data: dataCopy,
      meta: meta ? JSON.stringify(meta) : null,
      createdAt: Date.now(),
    });
  }

  /**
   * 加载最新快照
   * @returns {Snapshot|null}
   */
  loadLatest() {
    if (this.snapshots.length === 0) return null;

    // 按 tick 降序排序，返回第一个
    const sorted = [...this.snapshots].sort((a, b) => b.tick - a.tick);
    const snapshot = sorted[0];

    // R39 P1 fix: 拷贝 Buffer 防止共享引用污染。
    // 原实现返回内部 data 引用,修改 load 出来的 Buffer 会污染 store。
    const dataCopy = Buffer.isBuffer(snapshot.data) ? Buffer.from(snapshot.data) : snapshot.data;

    return {
      tick: snapshot.tick,
      virtualTime: snapshot.virtualTime,
      data: dataCopy,
      meta: snapshot.meta ? JSON.parse(snapshot.meta) : null,
      createdAt: snapshot.createdAt,
    };
  }

  /**
   * 加载指定 tick 的快照
   * @param {number} tick
   * @returns {Snapshot|null}
   */
  loadAt(tick) {
    const snapshot = this.snapshots.find(s => s.tick === tick);
    if (!snapshot) return null;

    // R39 P1 fix: 拷贝 Buffer 防止共享引用污染。
    const dataCopy = Buffer.isBuffer(snapshot.data) ? Buffer.from(snapshot.data) : snapshot.data;

    return {
      tick: snapshot.tick,
      virtualTime: snapshot.virtualTime,
      data: dataCopy,
      meta: snapshot.meta ? JSON.parse(snapshot.meta) : null,
      createdAt: snapshot.createdAt,
    };
  }

  /**
   * @deprecated Use loadLatest().
   * Kept for compatibility with the public store type surface.
   */
  loadLatestSnapshot() {
    return this.loadLatest();
  }

  /**
   * @deprecated Use loadAt(tick).
   * Kept for compatibility with the public store type surface.
   */
  loadSnapshotByTick(tick) {
    return this.loadAt(tick);
  }

  /**
   * 保留最近 N 个快照
   * @param {number} keepCount
   * @returns {number} 删除的快照数
   */
  prune(keepCount = 720) {
    if (this.snapshots.length <= keepCount) return 0;

    // 按 tick 降序排序
    const sorted = [...this.snapshots].sort((a, b) => b.tick - a.tick);
    const keepTicks = new Set(sorted.slice(0, keepCount).map(s => s.tick));

    const initialLength = this.snapshots.length;
    this.snapshots = this.snapshots.filter(s => keepTicks.has(s.tick));

    return initialLength - this.snapshots.length;
  }

  /**
   * 列出快照元信息（不含 data）
   * @param {number} limit
   * @returns {SnapshotMeta[]}
   */
  list(limit = 20) {
    return [...this.snapshots]
      .sort((a, b) => b.tick - a.tick)
      .slice(0, limit)
      .map(s => ({
        tick: s.tick,
        virtualTime: s.virtualTime,
        createdAt: s.createdAt,
        dataSize: s.data ? s.data.length : 0,
      }));
  }

  // ═══════════════════════════════════════════
  // MetaStore 接口
  // ═══════════════════════════════════════════

  /**
   * 获取值
   * @param {string} key
   * @returns {string|null}
   */
  get(key) {
    return this.meta[key] ?? null;
  }

  /**
   * 设置值
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    this.meta[key] = String(value);
  }

  /**
   * @deprecated Use set(key, value).
   * Kept for compatibility with the public store type surface.
   */
  saveMeta(key, value) {
    return this.set(key, value);
  }

  /**
   * @deprecated Use get(key).
   * Kept for compatibility with the public store type surface.
   */
  loadMeta(key) {
    return this.get(key);
  }

  /**
   * 批量设置
   * @param {Object} entries
   */
  setMany(entries) {
    for (const [key, value] of Object.entries(entries)) {
      this.meta[key] = String(value);
    }
  }

  /**
   * 获取所有键值对
   * @returns {Object}
   */
  getAll() {
    return { ...this.meta };
  }

  /**
   * 删除键
   * @param {string} key
   */
  delete(key) {
    delete this.meta[key];
  }

  // ═══════════════════════════════════════════
  // 事务支持（内存实现为空操作）
  // ═══════════════════════════════════════════

  /**
   * 在事务中执行多个操作（内存实现直接执行）
   * @param {Function} fn
   * @returns {*}
   */
  transaction(fn) {
    return fn();
  }

  // ═══════════════════════════════════════════
  // 生命周期
  // ═══════════════════════════════════════════

  /**
   * 关闭存储（内存实现无需操作）
   */
  close() {
    // 内存存储不需要清理
  }
}

module.exports = { MemoryStore };
