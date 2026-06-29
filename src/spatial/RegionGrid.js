/**
 * RegionGrid - 区域空间索引
 *
 * Andy 使用基于区域的空间模型（而非连续坐标）。
 * 每个 Agent 在某个 Region（区域标签），同一区域的 Agent 可以交互。
 *
 * 设计选择：
 *   小世界场景通常不需要连续坐标。
 *   区域标签语义清晰，符合人物设定。
 *   查询复杂度 O(k)，k = 同区域平均人数。
 */

class RegionGrid {
  constructor(regions = []) {
    /** @type {Map<string, Set<string>>} regionId → Set<agentId> */
    this._grid = new Map();
    /** @type {Map<string, string>} agentId → current region */
    this._agentRegions = new Map();
    /** @type {Map<string, Map<string, number>>} region → region → 基础距离 */
    this._distances = new Map();

    for (const region of regions) {
      this._grid.set(region, new Set());
    }
  }

  // ─────────────────────────────────────────
  // 基础操作
  // ─────────────────────────────────────────

  /**
   * 将 Agent 放入指定区域
   * R7 fix: Do NOT auto-create unknown regions. Only place agents into regions
   * that were declared in the domain configuration. Auto-creation masks bugs
   * in callers (e.g., ScheduleHandler using an unvalidated region name) and
   * creates phantom regions that diverge from domain configuration.
   * @param {string} agentId
   * @param {string} regionId
   * @returns {boolean} true if placed successfully, false if region doesn't exist
   */
  place(agentId, regionId) {
    // 从旧区域移除
    const oldRegion = this._agentRegions.get(agentId);
    if (oldRegion) {
      const oldSet = this._grid.get(oldRegion);
      if (oldSet) oldSet.delete(agentId);
    }

    // R7 fix: reject unknown regions instead of auto-creating them
    if (!this._grid.has(regionId)) {
      // Restore old region if agent had one, to avoid leaving agent in limbo
      if (oldRegion) {
        const oldSet = this._grid.get(oldRegion);
        if (oldSet) oldSet.add(agentId);
      }
      return false;
    }
    this._grid.get(regionId).add(agentId);
    this._agentRegions.set(agentId, regionId);
    return true;
  }

  /**
   * 获取 Agent 当前所在区域
   * @param {string} agentId
   * @returns {string|null}
   */
  getRegion(agentId) {
    return this._agentRegions.get(agentId) || null;
  }

  /**
   * 获取同一区域的所有 Agent
   * @param {string} regionId
   * @returns {string[]}
   */
  getAgentsInRegion(regionId) {
    const set = this._grid.get(regionId);
    return set ? [...set] : [];
  }

  /**
   * 获取某个 Agent 附近的 Agent（同一区域 + 相邻区域）
   * @param {string} agentId
   * @param {number} radius 区域跳数半径（0=仅同区域，1=同区域+直接相邻）
   * @returns {string[]}
   */
  getNeighbors(agentId, radius = 0) {
    const region = this._agentRegions.get(agentId);
    if (!region) return [];

    const result = [];
    const visited = new Set();

    // 同区域
    const sameRegion = this._grid.get(region);
    if (sameRegion) {
      for (const id of sameRegion) {
        if (id !== agentId) {
          result.push(id);
          visited.add(id);
        }
      }
    }

    // 如果 radius > 0，查找相邻区域的 Agent
    if (radius > 0) {
      const adjacentRegions = this._getAdjacentRegions(region, radius);
      for (const adjRegion of adjacentRegions) {
        const adjSet = this._grid.get(adjRegion);
        if (adjSet) {
          for (const id of adjSet) {
            if (!visited.has(id)) {
              result.push(id);
              visited.add(id);
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * 获取某个区域的当前人数
   * @param {string} regionId
   * @returns {number}
   */
  count(regionId) {
    const set = this._grid.get(regionId);
    return set ? set.size : 0;
  }

  /**
   * 获取所有有人的区域及其人数
   * @returns {Array<{region: string, count: number, agents: string[]}>}
   */
  getOccupiedRegions() {
    const result = [];
    for (const [region, agents] of this._grid) {
      if (agents.size > 0) {
        result.push({
          region,
          count: agents.size,
          agents: [...agents],
        });
      }
    }
    return result;
  }

  // ─────────────────────────────────────────
  // 区域邻接关系
  // ─────────────────────────────────────────

  /**
   * 设置区域间的邻接关系（可选，默认所有区域互不相邻）
   * @param {string} regionA
   * @param {string} regionB
   * @param {number} distance 跳数距离（默认1）
   */
  setAdjacent(regionA, regionB, distance = 1) {
    if (!this._distances.has(regionA)) {
      this._distances.set(regionA, new Map());
    }
    if (!this._distances.has(regionB)) {
      this._distances.set(regionB, new Map());
    }
    this._distances.get(regionA).set(regionB, distance);
    this._distances.get(regionB).set(regionA, distance);
  }

  /**
   * 获取指定跳数内的所有相邻区域
   * @private
   */
  // R23 P1 fix: respect stored distance values in BFS traversal.
  // Previously, _getAdjacentRegions did a pure hop-count BFS and ignored
  // the distance parameter from setAdjacent(). Now uses Dijkstra-style
  // cumulative distance to correctly weight edges.
  _getAdjacentRegions(region, maxHops) {
    const result = [];
    // dist map: region → cumulative distance from start
    const dist = new Map([[region, 0]]);
    // priority queue (simple array, sorted on extraction)
    const queue = [{ region, d: 0 }];

    while (queue.length > 0) {
      queue.sort((a, b) => a.d - b.d);
      const { region: current, d: currentDist } = queue.shift();

      if (currentDist > maxHops) continue;
      if (current !== region) result.push(current);

      const adjMap = this._distances.get(current);
      if (adjMap) {
        for (const [neighbor, distance] of adjMap) {
          const newDist = currentDist + distance;
          if (newDist <= maxHops && (!dist.has(neighbor) || newDist < dist.get(neighbor))) {
            dist.set(neighbor, newDist);
            queue.push({ region: neighbor, d: newDist });
          }
        }
      }
    }

    return result;
  }

  // ─────────────────────────────────────────
  // 统计与调试
  // ─────────────────────────────────────────

  /**
   * 获取全局快照
   * @returns {Object}
   */
  snapshot() {
    const occupancy = {};
    for (const [region, agents] of this._grid) {
      if (agents.size > 0) {
        occupancy[region] = [...agents];
      }
    }
    return occupancy;
  }
}

module.exports = RegionGrid;
