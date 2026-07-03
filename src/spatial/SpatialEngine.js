/**
 * SpatialEngine - 连续坐标空间引擎
 *
 * 职责：
 *   1. 管理所有 agent 的连续坐标 (x, y)
 *   2. 空间哈希网格索引（O(N·k) 邻居查询）
 *   3. 基于距离的交互概率计算
 *   4. Schedule → 坐标的位置驱动
 *
 * 与 RegionGrid 的关系：
 *   - SpatialEngine 是可选的增强层
 *   - RegionGrid 保留用于向后兼容（状态机、叙事仍用区域名）
 *   - 两者同步：坐标变化时自动更新区域归属
 */

const SpatialHash = require('./SpatialHash');
const { WorldMap } = require('./WorldMap');

class SpatialEngine {
  /**
   * @param {Object} options
   * @param {number} options.worldWidth - 世界宽度（米）
   * @param {number} options.worldHeight - 世界高度（米）
   * @param {number} options.cellSize - 网格尺寸（米），默认 10
   * @param {number} options.interactionRadius - 交互半径（米），默认 5
   * @param {number} options.maxInteractionsPerTick - 每 agent 每 tick 最大交互数，默认 5
   * @param {number} options.baseProb - 基础交互概率，默认 0.3
   * @param {number} options.distanceDecay - 距离衰减系数，默认 0.3
   * @param {Object[]} options.regions - 区域定义
   * @param {Object} options.adjacency - 区域邻接关系
   */
  constructor(options = {}) {
    const {
      worldWidth = 500,
      worldHeight = 500,
      cellSize: rawCellSize = 25,
      interactionRadius = 25,
      interactionRadii = [3, 10, 25],
      interactionTierNames = ['conversation', 'awareness', 'presence'],
      tierProbabilities = [0.8, 0.3, 0.0],
      tierRelationDeltas = [0.05, 0.01, 0.0],
      maxInteractionsPerTick = 5,
      baseProb = 0.3,
      distanceDecay = 0.3,
      regions = [],
      adjacency = {},
      rng = null,
    } = options;

    // 最大交互半径用于网格查询
    const maxRadius = Math.max(...interactionRadii, interactionRadius);
    // 约束：cellSize 必须 ≥ 最大交互半径
    const cellSize = Math.max(rawCellSize, maxRadius);

    this.config = {
      worldWidth,
      worldHeight,
      cellSize,
      interactionRadius: maxRadius,
      interactionRadii: [...interactionRadii].sort((a, b) => a - b),
      interactionTierNames,
      tierProbabilities,
      tierRelationDeltas,
      maxInteractionsPerTick,
      baseProb,
      distanceDecay,
    };

    // 空间哈希网格
    this.grid = new SpatialHash({
      worldWidth,
      worldHeight,
      cellSize,
    });

    // 世界地图
    this.worldMap = new WorldMap({
      width: worldWidth,
      height: worldHeight,
      regions,
      rng,
    });
    if (Object.keys(adjacency).length > 0) {
      this.worldMap.setAdjacency(adjacency);
    }

    // Agent 坐标数据（SoA 布局，f32 精度足够）
    this._agentIds = [];           // agent ID 列表（与坐标数组对齐）
    this._agentIdToIdx = new Map(); // ID → 索引映射
    this._coords = null;           // Float32Array [x0, y0, x1, y1, ...]
    this._targets = null;          // Uint16Array - 目标区域索引
    this._speeds = null;           // Float32Array - 移动速度 (m/tick)
    this._moving = null;           // Uint8Array - 是否在移动
    this._regionNames = [];        // 区域名列表
    this._regionNameToIdx = new Map();

    // 交互结果缓冲
    this._encounters = [];

    this._initialized = false;
  }

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  /**
   * 注册所有 agent
   * @param {Map<string, Object>} agents - agentId → agent 对象
   */
  initialize(agents) {
    const n = agents.size;
    this._agentIds = new Array(n);
    this._agentIdToIdx.clear();
    this._coords = new Float32Array(n * 2);
    this._targets = new Int16Array(n).fill(-1);
    this._speeds = new Float32Array(n).fill(1.4); // 默认步行 1.4m/5min tick
    this._moving = new Uint8Array(n);

    // 收集区域名
    const regionSet = new Set();
    for (const [, agent] of agents) {
      if (agent.position) regionSet.add(agent.position);
    }
    this._regionNames = [...regionSet];
    this._regionNameToIdx.clear();
    this._regionNames.forEach((name, idx) => this._regionNameToIdx.set(name, idx));

    // 初始化坐标
    let idx = 0;
    for (const [agentId, agent] of agents) {
      this._agentIds[idx] = agentId;
      this._agentIdToIdx.set(agentId, idx);

      // 从 agent 的 position（区域名）推导初始坐标
      const region = agent.position || this._regionNames[0] || 'default';
      const coords = this.worldMap.regionToCoords(region);
      // R41 P1 fix: handle null from regionToCoords (unknown region).
      // Fall back to world centre to avoid placing agents at NaN/undefined.
      if (coords) {
        this._coords[idx * 2] = coords.x;
        this._coords[idx * 2 + 1] = coords.y;
      } else {
        this._coords[idx * 2] = this.config.worldWidth / 2;
        this._coords[idx * 2 + 1] = this.config.worldHeight / 2;
      }

      idx++;
    }

    this._initialized = true;

    // 立即重建网格，使 queryNearby 在 tick 之前就可用
    this.grid.rebuild(this._coords, this._agentIds.length);

    return this;
  }

  // ═══════════════════════════════════════════
  // Tick 主流程
  // ═══════════════════════════════════════════

  /**
   * 执行一个空间 tick
   *
   * @param {Map<string, Object>} agents - agent 对象
   * @param {Object} socialGraph - 社交图（用于获取关系强度）
   * @returns {Object} { encounters, regionChanges }
   */
  tick(agents, socialGraph) {
    if (!this._initialized) return { encounters: [], regionChanges: [] };

    // ─── 1. 同步目标位置 ───
    this._syncTargets(agents);

    // ─── 2. 移动 agent ───
    this._moveAgents();

    // ─── 3. 重建空间索引 ───
    this.grid.rebuild(this._coords, this._agentIds.length);

    // ─── 4. 计算交互 ───
    this._computeEncounters(socialGraph);

    // ─── 5. 同步区域归属 ───
    const regionChanges = this._syncRegions(agents);

    return {
      encounters: this._encounters,
      regionChanges,
    };
  }

  // ═══════════════════════════════════════════
  // 位置同步
  // ═══════════════════════════════════════════

  /**
   * 将 agent 的 position（区域名）同步为移动目标
   * @private
   */
  _syncTargets(agents) {
    for (const [agentId, agent] of agents) {
      const idx = this._agentIdToIdx.get(agentId);
      if (idx === undefined) continue;

      const region = agent.position;
      if (!region) continue;

      const regionIdx = this._regionNameToIdx.get(region);
      if (regionIdx === undefined) {
        // 新区域，注册
        const newIdx = this._regionNames.length;
        this._regionNames.push(region);
        this._regionNameToIdx.set(region, newIdx);
        this._targets[idx] = newIdx;
      } else {
        this._targets[idx] = regionIdx;
      }
    }
  }

  /**
   * 向目标区域移动
   *
   * 策略：
   *   - 已在目标区域内 → 不移动（避免同区域内无意义漂移）
   *   - 在目标区域外 → 向区域中心步行
   *   - 到达区域 → 随机停靠在区域内
   * @private
   */
  _moveAgents() {
    const n = this._agentIds.length;

    for (let i = 0; i < n; i++) {
      const targetIdx = this._targets[i];
      if (targetIdx < 0) {
        this._moving[i] = 0;
        continue;
      }

      const targetRegionName = this._regionNames[targetIdx];
      const cx = this._coords[i * 2];
      const cy = this._coords[i * 2 + 1];

      // 检查是否已在目标区域内
      if (this.worldMap.pointToRegion(cx, cy) === targetRegionName) {
        this._moving[i] = 0;
        continue;
      }

      // 不在目标区域 → 向区域中心移动
      const target = this.worldMap.regionCenter(targetRegionName);
      // R41 P1 fix: handle null from regionCenter (unknown region). Skip
      // movement if target is unknown — agent stays at current position.
      if (!target) {
        this._moving[i] = 0;
        continue;
      }
      const dx = target.x - cx;
      const dy = target.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 3.0) {
        // 接近目标 → 放入区域内随机位置
        const finalPos = this.worldMap.regionToCoords(targetRegionName);
        if (finalPos) {
          this._coords[i * 2] = finalPos.x;
          this._coords[i * 2 + 1] = finalPos.y;
        }
        this._moving[i] = 0;
      } else {
        // 向目标步行
        const speed = this._speeds[i];
        const step = Math.min(speed, dist);
        this._coords[i * 2] = cx + (dx / dist) * step;
        this._coords[i * 2 + 1] = cy + (dy / dist) * step;
        this._moving[i] = 1;
      }
    }
  }

  /**
   * 根据坐标更新区域归属
   * @private
   * @returns {Array<{agentId: string, from: string, to: string}>}
   */
  _syncRegions(agents) {
    const changes = [];

    for (const [agentId, agent] of agents) {
      const idx = this._agentIdToIdx.get(agentId);
      if (idx === undefined) continue;

      const x = this._coords[idx * 2];
      const y = this._coords[idx * 2 + 1];
      const newRegion = this.worldMap.pointToRegion(x, y);

      if (newRegion && newRegion !== agent.position) {
        changes.push({ agentId, from: agent.position, to: newRegion });
      }
    }

    return changes;
  }

  // ═══════════════════════════════════════════
  // 交互计算
  // ═══════════════════════════════════════════

  /**
   * 基于空间距离计算交互对（分层系统）
   *
   * 三层交互模型（基于 Hall 亲近距离学 + 社会力模型）：
   *   Tier 1 (3m):  对话 — 强交互，关系增长快
   *   Tier 2 (10m): 注意 — 弱交互，打招呼
   *   Tier 3 (25m): 在场 — 感知，不产生交互
   *
   * @private
   * @param {Object} socialGraph - 社交图
   */
  _computeEncounters(socialGraph) {
    this._encounters = [];
    const n = this._agentIds.length;
    const {
      interactionRadii, interactionTierNames,
      tierProbabilities, tierRelationDeltas,
      maxInteractionsPerTick,
    } = this.config;
    const maxRadius = interactionRadii[interactionRadii.length - 1];
    const maxRadiusSq = maxRadius * maxRadius;

    for (let i = 0; i < n; i++) {
      const ax = this._coords[i * 2];
      const ay = this._coords[i * 2 + 1];
      const cid = this.grid.cellId(ax, ay);
      const neighbors = this.grid.queryNeighbors(cid);

      // 收集范围内的邻居
      const nearby = [];
      for (const j of neighbors) {
        if (j <= i) continue; // 避免重复对

        const dx = ax - this._coords[j * 2];
        const dy = ay - this._coords[j * 2 + 1];
        const distSq = dx * dx + dy * dy;

        if (distSq <= maxRadiusSq) {
          nearby.push({ j, dist: Math.sqrt(distSq) });
        }
      }

      // 按距离排序，取最近的 maxInteractionsPerTick 个
      if (nearby.length > maxInteractionsPerTick) {
        nearby.sort((a, b) => a.dist - b.dist);
        nearby.length = maxInteractionsPerTick;
      }

      for (const { j, dist } of nearby) {
        const idA = this._agentIds[i];
        const idB = this._agentIds[j];

        // 确定交互层级（从近到远匹配）
        let tier = -1;
        for (let t = 0; t < interactionRadii.length; t++) {
          if (dist <= interactionRadii[t]) {
            tier = t;
            break;
          }
        }
        if (tier < 0) continue; // 超出最大半径

        const tierName = interactionTierNames[tier] || `tier_${tier}`;
        const baseProb = tierProbabilities[tier] || 0;

        // 层级 3（在场）不产生交互事件
        if (baseProb <= 0) continue;

        // 概率 = 层级基础概率 + 关系强度加成
        let prob = baseProb;
        if (socialGraph) {
          const rel = socialGraph.getRelationship(idA, idB);
          if (rel) {
            prob += rel.strength * 0.15;
          }
        }
        prob = Math.min(prob, 1.0);

        this._encounters.push({
          agentA: idA,
          agentB: idB,
          distance: Math.round(dist * 100) / 100,
          probability: Math.round(prob * 1000) / 1000,
          tier,
          tierName,
          relationDelta: tierRelationDeltas[tier] || 0,
          regionA: this.worldMap.pointToRegion(this._coords[i * 2], this._coords[i * 2 + 1]) || this._regionNames[this._targets[i]] || null,
          regionB: this.worldMap.pointToRegion(this._coords[j * 2], this._coords[j * 2 + 1]) || this._regionNames[this._targets[j]] || null,
        });
      }
    }
  }

  // ═══════════════════════════════════════════
  // 公共查询 API
  // ═══════════════════════════════════════════

  /**
   * 获取 agent 的坐标
   * @param {string} agentId
   * @returns {{x: number, y: number}|null}
   */
  getCoords(agentId) {
    const idx = this._agentIdToIdx.get(agentId);
    if (idx === undefined) return null;
    return {
      x: this._coords[idx * 2],
      y: this._coords[idx * 2 + 1],
    };
  }

  /**
   * 设置 agent 坐标（用于外部强制移动）
   * @param {string} agentId
   * @param {number} x
   * @param {number} y
   */
  setCoords(agentId, x, y) {
    const idx = this._agentIdToIdx.get(agentId);
    if (idx === undefined) return;
    // R32 fix: reject NaN coordinates — they permanently corrupt the spatial
    // index (NaN distances make agents invisible to the encounter system).
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this._coords[idx * 2] = x;
    this._coords[idx * 2 + 1] = y;
    // 重建网格使查询即时生效
    this.grid.rebuild(this._coords, this._agentIds.length);
  }

  /**
   * R41 fix: set coordinates WITHOUT rebuilding the grid.
   * Use this during the tick flow when many agents change region in a batch;
   * the caller is responsible for a single grid.rebuild() after all mutations.
   * (setCoords() still rebuilds for public API correctness.)
   */
  _setCoordRaw(agentId, x, y) {
    const idx = this._agentIdToIdx.get(agentId);
    if (idx === undefined) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this._coords[idx * 2] = x;
    this._coords[idx * 2 + 1] = y;
  }

  /**
   * 查询某个 agent 附近的 agent
   * @param {string} agentId
   * @param {number} [radius] - 查询半径，默认 interactionRadius
   * @returns {Array<{agentId: string, distance: number, region: string|null}>}
   */
  queryNearby(agentId, radius) {
    const idx = this._agentIdToIdx.get(agentId);
    if (idx === undefined) return [];

    const r = radius || this.config.interactionRadius;
    const results = this.grid.queryRadius(this._coords, idx, r);

    return results.map(({ idx: j, distSq }) => ({
      agentId: this._agentIds[j],
      distance: Math.round(Math.sqrt(distSq) * 100) / 100,
      region: this._regionNames[this._targets[j]] || null,
    }));
  }

  /**
   * 获取当前交互结果
   * @returns {Array}
   */
  getEncounters() {
    return this._encounters;
  }

  /**
   * 获取空间统计
   */
  getStats() {
    return {
      grid: this.grid.stats(),
      agents: this._agentIds.length,
      config: { ...this.config },
    };
  }

  // ═══════════════════════════════════════════
  // 序列化 / 恢复
  // ═══════════════════════════════════════════

  /**
   * 序列化连续坐标状态为纯 JSON 可序列化对象
   * （typed array → 普通 array，便于 JSON.stringify）。
   *
   * SER-1 fix: 此前 SpatialEngine 无任何序列化方法，AndyWorld.toJSON() 也不
   * 发射 spatial 键，导致连续坐标 (_coords/_speeds/_moving/_targets) 在
   * save/restore 后全部丢失，agent snap 到区域中心、速度被重置为默认。
   *
   * @returns {{agentIds:string[],coords:number[],targets:number[],speeds:number[],moving:number[],regionNames:string[]}|null}
   */
  snapshot() {
    if (!this._coords) return null;
    return {
      agentIds: [...this._agentIds],
      coords: Array.from(this._coords),
      targets: Array.from(this._targets),
      speeds: Array.from(this._speeds),
      moving: Array.from(this._moving),
      regionNames: [...this._regionNames],
    };
  }

  /**
   * 从快照恢复连续坐标状态（typed array 重建）。
   *
   * 守卫：data 缺失/null 时 no-op；长度不匹配时 no-op（不崩溃）。
   * 注意：必须在 addAgent 循环之前调用；addAgent 对已存在的 agentId 幂等，
   * 不会覆盖已恢复坐标。
   *
   * @param {Object} data - snapshot() 的输出
   */
  restore(data) {
    if (!data || !data.agentIds) return;
    const n = data.agentIds.length;
    // 长度校验：所有 typed array 长度必须与 agentIds 一致
    if (
      !Array.isArray(data.coords) || data.coords.length !== n * 2 ||
      !Array.isArray(data.targets) || data.targets.length !== n ||
      !Array.isArray(data.speeds) || data.speeds.length !== n ||
      !Array.isArray(data.moving) || data.moving.length !== n
    ) {
      // 长度不匹配 → 放弃恢复，回退到 addAgent-at-region-center 行为
      return;
    }

    this._agentIds = [...data.agentIds];
    this._agentIdToIdx.clear();
    this._agentIds.forEach((id, idx) => this._agentIdToIdx.set(id, idx));

    this._coords = new Float32Array(data.coords);
    this._targets = new Int16Array(data.targets);
    this._speeds = new Float32Array(data.speeds);
    this._moving = new Uint8Array(data.moving);

    this._regionNames = Array.isArray(data.regionNames) ? [...data.regionNames] : [];
    this._regionNameToIdx.clear();
    this._regionNames.forEach((name, idx) => this._regionNameToIdx.set(name, idx));

    this._initialized = n > 0;

    // 重建空间索引使查询即时生效
    if (this._coords) {
      this.grid.rebuild(this._coords, this._agentIds.length);
    }
  }

  /**
   * 新增 agent（动态注册）
   *
   * SER-1 fix: 幂等化 —— 若 agentId 已存在（restore 已放置该 agent），
   * 跳过重新放置（避免用 regionCenter 覆盖已恢复的连续坐标、用 1.4 覆盖已恢复
   * 的速度）。仅确保网格索引是最新的。
   *
   * @param {string} agentId
   * @param {string} region - 初始区域
   */
  addAgent(agentId, region) {
    // 幂等：restore 已放置该 agent → 不覆盖坐标/速度/目标
    if (this._agentIdToIdx.has(agentId)) {
      if (this._coords) {
        this.grid.rebuild(this._coords, this._agentIds.length);
      }
      return;
    }

    const idx = this._agentIds.length;
    this._agentIds.push(agentId);
    this._agentIdToIdx.set(agentId, idx);

    const coords = this.worldMap.regionToCoords(region);
    // R41 P1 fix: handle null from regionToCoords (unknown region).
    // Fall back to world centre.
    const cx = coords ? coords.x : this.config.worldWidth / 2;
    const cy = coords ? coords.y : this.config.worldHeight / 2;

    if (!this._coords) {
      // 首个 agent：直接创建数组
      this._coords = new Float32Array(2);
      this._coords[0] = cx;
      this._coords[1] = cy;
      this._targets = new Int16Array(1);
      this._speeds = new Float32Array(1);
      this._speeds[0] = 1.4;
      this._moving = new Uint8Array(1);
    } else {
      // 扩展已有数组
      const newCoords = new Float32Array((idx + 1) * 2);
      newCoords.set(this._coords);
      newCoords[idx * 2] = cx;
      newCoords[idx * 2 + 1] = cy;
      this._coords = newCoords;

      const newTargets = new Int16Array(idx + 1);
      newTargets.set(this._targets);
      this._targets = newTargets;

      const newSpeeds = new Float32Array(idx + 1);
      newSpeeds.set(this._speeds);
      newSpeeds[idx] = 1.4;
      this._speeds = newSpeeds;

      const newMoving = new Uint8Array(idx + 1);
      newMoving.set(this._moving);
      this._moving = newMoving;
    }

    // 注册区域
    const regionIdx = this._regionNameToIdx.get(region);
    if (regionIdx === undefined) {
      const newIdx = this._regionNames.length;
      this._regionNames.push(region);
      this._regionNameToIdx.set(region, newIdx);
      this._targets[idx] = newIdx;
    } else {
      this._targets[idx] = regionIdx;
    }

    // 标记已初始化（有 agent 即可运行）
    this._initialized = true;

    // 增量重建网格（使 queryNearby 即时可用）
    if (this._coords) {
      this.grid.rebuild(this._coords, this._agentIds.length);
    }
  }
}

module.exports = SpatialEngine;
