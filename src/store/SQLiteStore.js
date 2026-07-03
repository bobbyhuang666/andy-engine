/**
 * SQLiteStore — 统一的 SQLite 持久化实现
 *
 * 实现 StoryStore、SnapshotStore、MetaStore 三个接口。
 * 使用 better-sqlite3（同步 API，比 async sqlite3 快 3-5x）。
 *
 * 注意: 接口定义为 async，但 SQLiteStore 是同步实现 (better-sqlite3)。
 * SimulationStore 调用时不加 await，这对同步实现是安全的。
 * 如果将来实现 PostgreSQLStore (async)，需要在 SimulationStore 中加 await。
 *
 * 将来迁移到 PostgreSQL 时，只需新建一个类实现相同接口，
 * 业务代码一行不动。
 *
 * 依赖: npm install better-sqlite3
 */

const path = require('path');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = null;
}

function sqliteUnavailableError(originalError) {
  const suffix = originalError && originalError.message
    ? ` Original error: ${originalError.message}`
    : '';
  return new Error(
    'SQLite persistence requires a working optional dependency better-sqlite3. ' +
    'Install or rebuild it with: npm install better-sqlite3 or npm rebuild better-sqlite3.' +
    suffix
  );
}

class SQLiteStore {
  /**
   * @param {string} dbPath - SQLite 文件路径，如 './data/andy.db'
   *   使用 ':memory:' 创建内存数据库（测试用）
   */
  constructor(dbPath = ':memory:') {
    if (!Database) {
      throw sqliteUnavailableError();
    }

    // 确保目录存在
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    try {
      this.db = new Database(dbPath);
    } catch (err) {
      throw sqliteUnavailableError(err);
    }
    this.db.pragma('journal_mode = WAL');      // 写入性能优化
    this.db.pragma('synchronous = NORMAL');     // 平衡安全和性能
    this.db.pragma('cache_size = -64000');      // 64MB 缓存
    this.db.pragma('temp_store = MEMORY');      // 临时表在内存中

    this._initTables();
    this._prepared = {}; // 缓存 prepared statements
  }

  // ═══════════════════════════════════════════
  // 表结构
  // ═══════════════════════════════════════════

  _initTables() {
    this.db.exec(`
      -- 故事表
      CREATE TABLE IF NOT EXISTS stories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tick        INTEGER NOT NULL,
        timestamp   INTEGER NOT NULL,
        agent_id    TEXT    NOT NULL,
        category    TEXT    NOT NULL DEFAULT 'daily_life',
        content     TEXT    NOT NULL,
        emotion_tag TEXT,
        importance  REAL    NOT NULL DEFAULT 0.5,
        source      TEXT    NOT NULL DEFAULT 'simulation'
      );

      -- 故事查询索引
      CREATE INDEX IF NOT EXISTS idx_stories_agent_time
        ON stories(agent_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_stories_agent_importance
        ON stories(agent_id, importance DESC);
      CREATE INDEX IF NOT EXISTS idx_stories_agent_emotion
        ON stories(agent_id, emotion_tag, timestamp DESC);

      -- 快照表
      CREATE TABLE IF NOT EXISTS snapshots (
        tick         INTEGER PRIMARY KEY,
        virtual_time INTEGER NOT NULL,
        data         BLOB    NOT NULL,
        meta         TEXT,
        created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      -- 元数据表（简单 KV）
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // ═══════════════════════════════════════════
  // StoryStore 实现
  // ═══════════════════════════════════════════

  /**
   * 批量保存故事（事务内完成）
   */
  saveStories(stories) {
    if (!stories || stories.length === 0) return 0;

    const stmt = this._prepare('insertStory', `
      INSERT INTO stories (tick, timestamp, agent_id, category, content, emotion_tag, importance, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = this.db.transaction((items) => {
      for (const s of items) {
        stmt.run(
          s.tick,
          s.timestamp,
          s.agentId,
          s.category || 'daily_life',
          s.content,
          s.emotionTag || null,
          s.importance ?? 0.5,
          s.source || 'simulation',
        );
      }
      return items.length;
    });

    return insertAll(stories);
  }

  /**
   * 查询某 agent 最近的故事（按重要性降序 + 时间降序）
   * @param {number} [now] - 当前时间戳（默认 Date.now()），支持传入 virtualTime
   */
  getRecent(agentId, hours = 72, limit = 5, now) {
    const cutoff = (now ?? Date.now()) - hours * 3600 * 1000;

    const stmt = this._prepare('getRecent', `
      SELECT tick, timestamp, agent_id as agentId, category, content,
             emotion_tag as emotionTag, importance, source
      FROM stories
      WHERE agent_id = ? AND timestamp > ?
      ORDER BY importance DESC, timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agentId, cutoff, limit);
  }

  /**
   * 按情绪标签查询
   * @param {number} [now] - 当前时间戳（默认 Date.now()），支持传入 virtualTime
   */
  getByEmotion(agentId, emotionTag, hours = 168, limit = 10, now) {
    const cutoff = (now ?? Date.now()) - hours * 3600 * 1000;

    const stmt = this._prepare('getByEmotion', `
      SELECT tick, timestamp, agent_id as agentId, category, content,
             emotion_tag as emotionTag, importance, source
      FROM stories
      WHERE agent_id = ? AND emotion_tag = ? AND timestamp > ?
      ORDER BY importance DESC, timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agentId, emotionTag, cutoff, limit);
  }

  /**
   * 衰减老故事 + 清理过期故事
   * @param {number} [now] - 当前时间戳（默认 Date.now()），支持传入 virtualTime
   */
  decay(decayFactor = 0.95, minImportance = 0.05, maxAgeDays = 30, now) {
    now = now ?? Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const maxAge = now - maxAgeDays * 24 * 3600 * 1000;

    // 衰减: 超过 7 天的故事降低重要性
    const decayStmt = this._prepare('decayStories', `
      UPDATE stories
      SET importance = importance * ?
      WHERE timestamp < ? AND importance > ?
    `);
    const decayResult = decayStmt.run(decayFactor, weekAgo, minImportance);

    // 删除: 重要性过低或过老的故事
    const deleteStmt = this._prepare('deleteOldStories', `
      DELETE FROM stories
      WHERE (importance < ? AND timestamp < ?)
         OR timestamp < ?
    `);
    const deleteResult = deleteStmt.run(minImportance, weekAgo, maxAge);

    return {
      decayed: decayResult.changes,
      deleted: deleteResult.changes,
    };
  }

  /**
   * 故事统计
   * @param {number} [now] - 当前时间戳（默认 Date.now()），支持传入 virtualTime
   */
  stats(agentId, now) {
    now = now ?? Date.now();
    const dayAgo = now - 24 * 3600 * 1000;
    const weekAgo = now - 7 * 24 * 3600 * 1000;

    const stmt = this._prepare('storyStats', `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN timestamp > ? THEN 1 ELSE 0 END) as recentDay,
        SUM(CASE WHEN timestamp > ? THEN 1 ELSE 0 END) as recentWeek
      FROM stories
      WHERE agent_id = ?
    `);

    return stmt.get(dayAgo, weekAgo, agentId) || { total: 0, recentDay: 0, recentWeek: 0 };
  }

  // ═══════════════════════════════════════════
  // SnapshotStore 实现
  // ═══════════════════════════════════════════

  /**
   * 保存快照
   */
  saveSnapshot(tick, virtualTime, data, meta = null) {
    const stmt = this._prepare('insertSnapshot', `
      INSERT OR REPLACE INTO snapshots (tick, virtual_time, data, meta, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      tick,
      virtualTime,
      data,
      meta ? JSON.stringify(meta) : null,
      Date.now(),
    );
  }

  /**
   * 加载最新快照
   */
  loadLatest() {
    const stmt = this._prepare('loadLatestSnapshot', `
      SELECT tick, virtual_time as virtualTime, data, meta, created_at as createdAt
      FROM snapshots
      ORDER BY tick DESC
      LIMIT 1
    `);

    const row = stmt.get();
    if (!row) return null;

    return {
      ...row,
      meta: row.meta ? JSON.parse(row.meta) : null,
    };
  }

  /**
   * 加载指定 tick 的快照
   */
  loadAt(tick) {
    const stmt = this._prepare('loadSnapshotAt', `
      SELECT tick, virtual_time as virtualTime, data, meta, created_at as createdAt
      FROM snapshots
      WHERE tick = ?
    `);

    const row = stmt.get(tick);
    if (!row) return null;

    return {
      ...row,
      meta: row.meta ? JSON.parse(row.meta) : null,
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
   */
  prune(keepCount = 720) {
    // 找到第 keepCount 个快照的 tick（保留 keepCount 个最新的）
    const stmt = this._prepare('findPruneTick', `
      SELECT tick FROM snapshots
      ORDER BY tick DESC
      LIMIT 1 OFFSET ?
    `);
    const boundary = stmt.get(keepCount - 1); // -1: OFFSET 是 0-based

    if (!boundary) return 0; // 不够删除

    const deleteStmt = this._prepare('pruneSnapshots', `
      DELETE FROM snapshots WHERE tick < ?
    `);
    const result = deleteStmt.run(boundary.tick);
    return result.changes;
  }

  /**
   * 列出快照元信息（不含 data）
   */
  list(limit = 20) {
    const stmt = this._prepare('listSnapshots', `
      SELECT tick, virtual_time as virtualTime, created_at as createdAt,
             LENGTH(data) as dataSize
      FROM snapshots
      ORDER BY tick DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  // ═══════════════════════════════════════════
  // MetaStore 实现
  // ═══════════════════════════════════════════

  get(key) {
    const stmt = this._prepare('metaGet', `SELECT value FROM meta WHERE key = ?`);
    const row = stmt.get(key);
    return row ? row.value : null;
  }

  set(key, value) {
    const stmt = this._prepare('metaSet', `
      INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)
    `);
    stmt.run(key, String(value));
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

  setMany(entries) {
    const stmt = this._prepare('metaSet', `
      INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)
    `);
    const insertAll = this.db.transaction((items) => {
      for (const [key, value] of Object.entries(items)) {
        stmt.run(key, String(value));
      }
    });
    insertAll(entries);
  }

  getAll() {
    const rows = this.db.prepare('SELECT key, value FROM meta').all();
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  delete(key) {
    this.db.prepare('DELETE FROM meta WHERE key = ?').run(key);
  }

  // ═══════════════════════════════════════════
  // 事务支持
  // ═══════════════════════════════════════════

  /**
   * 在事务中执行多个操作
   * @param {Function} fn - 事务函数
   * @returns {*} fn 的返回值
   */
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  // ═══════════════════════════════════════════
  // 生命周期
  // ═══════════════════════════════════════════

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ═══════════════════════════════════════════
  // 内部工具
  // ═══════════════════════════════════════════

  /** 缓存 prepared statement */
  _prepare(name, sql) {
    if (!this._prepared[name]) {
      this._prepared[name] = this.db.prepare(sql);
    }
    return this._prepared[name];
  }
}

module.exports = { SQLiteStore };
