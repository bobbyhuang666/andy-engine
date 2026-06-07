/**
 * StoryStore — 故事持久化接口
 *
 * 存储 Andy 模拟产生的故事片段，供 Bobby system prompt 注入。
 * 当前实现: SQLite
 * 将来迁移: PostgreSQL / CockroachDB / 任何关系数据库
 *
 * 设计约束:
 *   - 写入: 每 tick 批量写入 (~5-10 条/tick)
 *   - 读取: Bobby 对话时按 agent_id + 时间范围查询
 *   - 清理: 定期衰减 + 删除过期故事
 */

/**
 * @interface StoryStore
 *
 * 所有实现必须遵守此接口。
 * 业务代码只依赖此接口，不直接访问底层存储。
 */
class StoryStore {
  /**
   * 批量保存故事
   * @param {Story[]} stories
   * @returns {number} 实际写入条数
   */
  async saveStories(stories) {
    throw new Error('Not implemented');
  }

  /**
   * 查询某 agent 最近的故事（按重要性 + 时间排序）
   * @param {string} agentId
   * @param {number} hours - 最近多少小时
   * @param {number} limit - 最多返回几条
   * @returns {Story[]}
   */
  async getRecent(agentId, hours = 72, limit = 5) {
    throw new Error('Not implemented');
  }

  /**
   * 按情绪标签查询故事
   * @param {string} agentId
   * @param {string} emotionTag - 'happy', 'sad', 'neutral' 等
   * @param {number} hours
   * @param {number} limit
   * @returns {Story[]}
   */
  async getByEmotion(agentId, emotionTag, hours = 168, limit = 10) {
    throw new Error('Not implemented');
  }

  /**
   * 衰减老故事的重要性，并删除过期故事
   * @param {number} decayFactor - 衰减系数 (0-1)，如 0.95
   * @param {number} minImportance - 低于此值的故事被删除
   * @param {number} maxAgeDays - 超过此天数的故事被删除
   * @returns {{ decayed: number, deleted: number }}
   */
  async decay(decayFactor = 0.95, minImportance = 0.05, maxAgeDays = 30) {
    throw new Error('Not implemented');
  }

  /**
   * 获取故事统计
   * @param {string} agentId
   * @returns {{ total: number, recentDay: number, recentWeek: number }}
   */
  async stats(agentId) {
    throw new Error('Not implemented');
  }

  async close() {
    throw new Error('Not implemented');
  }
}

/**
 * @typedef {Object} Story
 * @property {number} tick - Andy tick 序号
 * @property {number} timestamp - Unix ms
 * @property {string} agentId - 所属 agent
 * @property {string} category - 'conversation' | 'daily_life' | 'social' | 'emotion'
 * @property {string} content - 自然语言故事（已脱敏）
 * @property {string} [emotionTag] - 情绪标签
 * @property {number} importance - 初始重要性 [0, 1]
 * @property {string} source - 'user_signal' | 'simulation'
 */

module.exports = { StoryStore };
