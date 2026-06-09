/**
 * AndyWorld - 世界状态空间
 *
 * 包含：
 *   - Time: 全局时钟（分钟粒度）
 *   - Environment: 环境层（天气、昼夜、季节、公共事件）
 *   - Agent 集合管理
 *   - SocialGraph: 全局社交图谱
 *   - EventLog: 世界时间线
 */

const RegionGrid = require('../spatial/RegionGrid');
const SpatialEngine = require('../spatial/SpatialEngine');
const SocialGraph = require('../social/SocialGraph');
const EventDispatcher = require('./EventDispatcher');
const { ANDY_DEFAULTS } = require('../config/defaults');
const { getDefaultDomain } = require('../domain/DomainRegistry');

class AndyWorld {
  /**
   * @param {Object} config
   * @param {Date} [config.startTime] - 初始时间
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [domain] - DomainRegistry 实例
   */
  constructor(config = {}, savedState = null, domain = null) {
    // ─── Domain ───
    this.domain = domain || getDefaultDomain();

    // ─── 时间系统 ───
    this.time = savedState ? new Date(savedState.time) : (config.startTime || new Date());
    this.tickCount = savedState ? savedState.tickCount : 0;

    // ─── 环境层 ───
    this.environment = savedState ? savedState.environment : {
      weather: config.weather || 'sunny',
      weatherChangedAt: this.time,
      timeOfDay: this._calcTimeOfDay(this.time.getHours()),
      season: this._calcSeason(this.time.getMonth()),
    };

    // ─── 区域空间（从 domain 取）───
    this.regions = new RegionGrid(this.domain.regions);
    // 初始化区域邻接关系
    for (const [regionA, regionB, distance] of this.domain.adjacency || []) {
      this.regions.setAdjacent(regionA, regionB, distance);
    }

    // ─── 连续坐标空间（可选） ───
    this.spatial = null;
    if (config.spatial === 'continuous') {
      const spatialConfig = ANDY_DEFAULTS.spatial.continuous || {};
      const regionDefs = this._buildRegionDefs({
        regionCoords: this.domain.regionCoords,
        regions: this.domain.regions,
      });
      this.spatial = new SpatialEngine({
        worldWidth: spatialConfig.worldWidth || 500,
        worldHeight: spatialConfig.worldHeight || 500,
        cellSize: spatialConfig.cellSize || 25,
        interactionRadius: spatialConfig.interactionRadius || 25,
        interactionRadii: spatialConfig.interactionRadii || [3, 10, 25],
        interactionTierNames: spatialConfig.interactionTierNames || ['conversation', 'awareness', 'presence'],
        tierProbabilities: spatialConfig.tierProbabilities || [0.8, 0.3, 0.0],
        tierRelationDeltas: spatialConfig.tierRelationDeltas || [0.05, 0.01, 0.0],
        maxInteractionsPerTick: spatialConfig.maxInteractionsPerTick || 5,
        baseProb: spatialConfig.baseProb || 0.3,
        distanceDecay: spatialConfig.distanceDecay || 0.3,
        regions: regionDefs,
        adjacency: this._buildAdjacencyMap(this.domain.adjacency),
      });
    }

    // ─── Agent 集合 ───
    /** @type {Map<string, import('../agent/Agent')>} */
    this.agents = new Map();

    // ─── 社交图谱 ───
    this.socialGraph = new SocialGraph(
      savedState ? savedState.socialGraph : null
    );

    // ─── 事件系统 ───
    this.eventDispatcher = new EventDispatcher(this.domain);
    if (savedState && savedState.events) {
      // 恢复最近的事件
      for (const evt of savedState.events.eventLog || []) {
        this.eventDispatcher.eventLog.push(evt);
      }
    }
  }

  // ═══════════════════════════════════════════
  // Agent 管理
  // ═══════════════════════════════════════════

  /**
   * 添加 Agent 到世界
   * @param {import('../agent/Agent')} agent
   */
  addAgent(agent) {
    this.agents.set(agent.id, agent);
    this.socialGraph.addAgent(agent.id);
    this.regions.place(agent.id, agent.position);

    // 连续坐标注册
    if (this.spatial) {
      this.spatial.addAgent(agent.id, agent.position);
    }

    // 注入社交图谱引用（用于 Appraisal 代理性评估）
    if (agent.setSocialGraph) {
      agent.setSocialGraph(this.socialGraph);
    }

    // 不再预创建关系 — 关系在首次相遇时按需创建
    // 这允许社交网络自然涌现，而非一开始就是全连接图
  }

  /**
   * 获取 Agent
   * @param {string} agentId
   * @returns {import('../agent/Agent')|undefined}
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有 Agent
   * @returns {import('../agent/Agent')[]}
   */
  getAllAgents() {
    return [...this.agents.values()];
  }

  // ═══════════════════════════════════════════
  // 环境管理
  // ═══════════════════════════════════════════

  /**
   * 设置天气
   * @param {string} weather
   */
  setWeather(weather) {
    this.environment.weather = weather;
    this.environment.weatherChangedAt = new Date(this.time);

    // 生成天气事件
    const agentIds = [...this.agents.keys()];
    this.eventDispatcher.generateEnvironmentEvent(weather, agentIds);
  }

  /**
   * 更新环境状态
   * @private
   */
  _syncEnvironment() {
    const hour = this.time.getHours();
    this.environment.timeOfDay = this._calcTimeOfDay(hour);
    this.environment.season = this._calcSeason(this.time.getMonth());
  }

  /**
   * 概率性天气变化
   * 基于季节和当前天气计算转移概率
   * @private
   */
  _maybeChangeWeather() {
    const season = this.environment.season;
    const current = this.environment.weather;

    // 季节决定天气转移概率
    const transitions = {
      spring: { sunny: 0.4, rain: 0.35, cold: 0.1, hot: 0.15 },
      summer: { sunny: 0.5, rain: 0.15, cold: 0.0, hot: 0.35 },
      autumn: { sunny: 0.3, rain: 0.3, cold: 0.25, hot: 0.15 },
      winter: { sunny: 0.2, rain: 0.15, cold: 0.55, hot: 0.1 },
    };

    const probs = transitions[season] || transitions.spring;

    // 40% 概率保持不变，60% 概率按季节分布变化
    if (Math.random() < 0.4) return; // 保持

    // 根据概率选择新天气
    const rand = Math.random();
    let cumulative = 0;
    let newWeather = current;
    for (const [weather, prob] of Object.entries(probs)) {
      cumulative += prob;
      if (rand < cumulative) {
        newWeather = weather;
        break;
      }
    }

    if (newWeather !== current) {
      this.setWeather(newWeather);
    }
  }

  /** @private */
  _calcTimeOfDay(hour) {
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 19) return 'dusk';
    if (hour >= 19 && hour < 22) return 'evening';
    return 'night';
  }

  /** @private */
  _calcSeason(month) {
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  }

  /**
   * 从 ANDY_DEFAULTS.spatial 构建区域几何定义
   * @private
   */
  _buildRegionDefs(spatialConfig) {
    const regionNames = spatialConfig.regions || [];
    const coords = spatialConfig.regionCoords || {};
    const defs = [];
    for (const name of regionNames) {
      const c = coords[name];
      if (c) {
        defs.push({ name, ...c });
      } else {
        defs.push({
          name, shape: 'rect',
          x: Math.random() * 400 + 50, y: Math.random() * 400 + 50,
          w: 60 + Math.random() * 40, h: 60 + Math.random() * 40,
        });
      }
    }
    return defs;
  }

  /**
   * 将邻接三元组转为邻接 Map
   * @private
   */
  _buildAdjacencyMap(adjacencyArr) {
    if (!adjacencyArr) return {};
    const map = {};
    for (const [a, b] of adjacencyArr) {
      if (!map[a]) map[a] = [];
      if (!map[b]) map[b] = [];
      map[a].push(b);
      map[b].push(a);
    }
    return map;
  }

  // ═══════════════════════════════════════════
  // 全局快照
  // ═══════════════════════════════════════════

  /**
   * 获取世界状态快照
   * @returns {Object}
   */
  snapshot() {
    return {
      time: this.time.toISOString(),
      tickCount: this.tickCount,
      environment: { ...this.environment },
      agents: Object.fromEntries(
        [...this.agents.entries()].map(([id, agent]) => [id, agent.getStatus()])
      ),
      regions: this.regions.snapshot(),
      socialGraph: this.socialGraph.snapshot(),
      recentEvents: this.eventDispatcher.eventLog.slice(-20),
    };
  }

  /**
   * 序列化（用于持久化）
   */
  toJSON() {
    return {
      time: this.time.toISOString(),
      tickCount: this.tickCount,
      environment: { ...this.environment },
      agents: Object.fromEntries(
        [...this.agents.entries()].map(([id, agent]) => [id, agent.toJSON()])
      ),
      socialGraph: this.socialGraph.toJSON(),
      events: this.eventDispatcher.toJSON(),
    };
  }
}

module.exports = AndyWorld;
