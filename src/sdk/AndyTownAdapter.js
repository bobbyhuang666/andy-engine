/**
 * AndyTownAdapter — Andy Town snapshot 适配层
 *
 * 职责：
 *   1. 从 Andy Town (localhost:3457) 获取 snapshot 数据
 *   2. 缓存 snapshot，避免频繁请求
 *   3. 提供干净的 scheduleRegion/scheduleActivity
 *   4. 处理连接失败的降级策略
 *
 * 数据流：
 *   Andy Town snapshot → AndyTownAdapter → Agent/NarrativeBuilder
 */

class AndyTownAdapter {
  /**
   * @param {Object} options
   * @param {string} options.townUrl - Andy Town 服务地址
   * @param {number} options.cacheTimeout - 缓存超时时间（毫秒）
   */
  constructor(options = {}) {
    this.townUrl = options.townUrl || 'http://localhost:3457';
    this.cacheTimeout = options.cacheTimeout || 5000; // 5 秒缓存

    this._cache = null;
    this._cacheTime = 0;
    this._connected = false;
    this._lastError = null;
  }

  /**
   * 获取 snapshot（带缓存）
   *
   * @returns {Promise<Object|null>} snapshot 数据或 null（连接失败时）
   */
  async getSnapshot() {
    const now = Date.now();

    // 缓存有效期内直接返回
    if (this._cache && (now - this._cacheTime) < this.cacheTimeout) {
      return this._cache;
    }

    try {
      const response = await fetch(`${this.townUrl}/api/snapshot`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000), // 3 秒超时
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this._cache = data;
      this._cacheTime = now;
      this._connected = true;
      this._lastError = null;

      return data;
    } catch (error) {
      this._lastError = error.message;
      this._connected = false;

      // 返回缓存（即使过期）
      if (this._cache) {
        return this._cache;
      }

      return null;
    }
  }

  /**
   * 获取指定角色的干净状态
   *
   * @param {string} agentId - 角色 ID
   * @returns {Promise<Object>} 干净的角色状态
   */
  async getCleanAgentState(agentId) {
    const snapshot = await this.getSnapshot();

    if (!snapshot || !snapshot.agents || !snapshot.agents[agentId]) {
      return null;
    }

    const agentData = snapshot.agents[agentId];

    return {
      // 使用 Andy Town 已经 sanitize 的字段
      scheduleRegion: agentData.scheduleRegion || agentData.displayPosition || null,
      scheduleActivity: agentData.scheduleActivity || agentData.displayState || null,

      // 其他干净的状态
      position: agentData.displayPosition || agentData.position || null,
      state: agentData.displayState || agentData.state || null,

      // 原始数据（用于调试）
      _raw: agentData,
    };
  }

  /**
   * 获取连接状态
   *
   * @returns {{ connected: boolean, lastError: string|null }}
   */
  getConnectionStatus() {
    return {
      connected: this._connected,
      lastError: this._lastError,
    };
  }

  /**
   * 强制刷新缓存
   */
  invalidateCache() {
    this._cache = null;
    this._cacheTime = 0;
  }
}

// 单例实例
let _instance = null;

/**
 * 获取 AndyTownAdapter 单例
 *
 * @param {Object} options - 配置选项（仅首次调用时生效）
 * @returns {AndyTownAdapter}
 */
function getAndyTownAdapter(options) {
  if (!_instance) {
    _instance = new AndyTownAdapter(options);
  }
  return _instance;
}

module.exports = {
  AndyTownAdapter,
  getAndyTownAdapter,
};
