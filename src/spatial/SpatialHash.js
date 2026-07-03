/**
 * SpatialHash - 空间哈希网格
 *
 * 把 2D 空间切成 cellSize × cellSize 的格子，
 * 每个 agent 只需和相邻 9 格内的人算距离。
 *
 * 查询复杂度：O(N·k)，k = 平均每格人数（通常 3-9）
 * 对比朴素 O(N²)：50K agent 时从 1.25B → ~250K 次计算
 */

class SpatialHash {
  /**
   * @param {Object} options
   * @param {number} options.worldWidth - 世界宽度（米）
   * @param {number} options.worldHeight - 世界高度（米）
   * @param {number} options.cellSize - 格子尺寸（米），应 ≥ 2 × interactionRadius
   */
  constructor({ worldWidth = 1000, worldHeight = 1000, cellSize = 10 }) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.totalCells = this.cols * this.rows;

    // 紧凑存储：所有 agent 索引连续存放
    // cellOffsets[i] = cells 中第 i 格的起始位置
    // cellCounts[i]  = 第 i 格有多少 agent
    this._cellCounts = new Uint32Array(this.totalCells);
    this._cellOffsets = new Uint32Array(this.totalCells + 1);

    // 排序后的 agent 索引
    this._sortedIndices = null;
  }

  // ─────────────────────────────────────────
  // 核心方法
  // ─────────────────────────────────────────

  /**
   * 计算坐标所在的格子 ID
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  cellId(x, y) {
    const cx = Number.isFinite(x) ? Math.max(0, Math.min(Math.floor(x / this.cellSize), this.cols - 1)) : 0;
    const cy = Number.isFinite(y) ? Math.max(0, Math.min(Math.floor(y / this.cellSize), this.rows - 1)) : 0;
    return cy * this.cols + cx;
  }

  /**
   * 重建网格索引
   * 时间复杂度：O(N)
   *
   * @param {Float32Array} coords - 扁平坐标数组 [x0, y0, x1, y1, ...]，长度 = N * 2
   * @param {number} agentCount - agent 数量
   * @returns {Uint32Array} 排序后的 agent 索引（可用于重排其他数组）
   */
  rebuild(coords, agentCount) {
    // 1. 清零计数
    this._cellCounts.fill(0);

    // 2. 计数每格人数（第一遍遍历）
    for (let i = 0; i < agentCount; i++) {
      const x = coords[i * 2];
      const y = coords[i * 2 + 1];
      const cid = this.cellId(x, y);
      this._cellCounts[cid]++;
    }

    // 3. 前缀和 → offsets
    let sum = 0;
    for (let i = 0; i < this.totalCells; i++) {
      this._cellOffsets[i] = sum;
      sum += this._cellCounts[i];
    }
    this._cellOffsets[this.totalCells] = sum;

    // 4. 填充排序索引（第二遍遍历）
    if (!this._sortedIndices || this._sortedIndices.length < agentCount) {
      this._sortedIndices = new Uint32Array(agentCount);
    }
    // 临时写入位置（必须独立分配，不能和 _cellOffsets 共享 buffer）
    const writePos = new Uint32Array(this.totalCells);
    for (let i = 0; i < this.totalCells; i++) {
      writePos[i] = this._cellOffsets[i];
    }

    for (let i = 0; i < agentCount; i++) {
      const x = coords[i * 2];
      const y = coords[i * 2 + 1];
      const cid = this.cellId(x, y);
      const wp = writePos[cid];
      this._sortedIndices[wp] = i;
      writePos[cid] = wp + 1;
    }

    return this._sortedIndices;
  }

  /**
   * 查询某个格子及周围 8 格的所有 agent 索引
   * @param {number} cellId - 格子 ID
   * @returns {number[]} 邻居 agent 索引（不含自身检查，调用方自行过滤）
   */
  queryNeighbors(cellId) {
    const cx = cellId % this.cols;
    const cy = (cellId - cx) / this.cols;

    const xMin = cx > 0 ? cx - 1 : 0;
    const xMax = cx < this.cols - 1 ? cx + 1 : this.cols - 1;
    const yMin = cy > 0 ? cy - 1 : 0;
    const yMax = cy < this.rows - 1 ? cy + 1 : this.rows - 1;

    // 估算邻居总数
    let totalCount = 0;
    for (let ny = yMin; ny <= yMax; ny++) {
      for (let nx = xMin; nx <= xMax; nx++) {
        const cid = ny * this.cols + nx;
        totalCount += this._cellCounts[cid];
      }
    }

    const result = new Array(totalCount);
    let offset = 0;

    for (let ny = yMin; ny <= yMax; ny++) {
      for (let nx = xMin; nx <= xMax; nx++) {
        const cid = ny * this.cols + nx;
        const start = this._cellOffsets[cid];
        const end = this._cellOffsets[cid + 1];
        for (let i = start; i < end; i++) {
          result[offset++] = this._sortedIndices[i];
        }
      }
    }

    return result;
  }

  /**
   * 查询某个坐标半径内的所有 agent
   * @param {Float32Array} coords - 坐标数组
   * @param {number} agentIdx - 查询的 agent 索引
   * @param {number} radius - 查询半径（米）
   * @returns {Array<{idx: number, distSq: number}>} 邻居列表（含距离平方）
   */
  queryRadius(coords, agentIdx, radius) {
    // R116-005: guard against NaN/Infinity radius.
    if (!Number.isFinite(radius)) return [];
    const ax = coords[agentIdx * 2];
    const ay = coords[agentIdx * 2 + 1];
    const cid = this.cellId(ax, ay);
    const neighbors = this.queryNeighbors(cid);
    const radiusSq = radius * radius;

    const result = [];
    for (const j of neighbors) {
      if (j === agentIdx) continue;
      const dx = ax - coords[j * 2];
      const dy = ay - coords[j * 2 + 1];
      const distSq = dx * dx + dy * dy;
      if (distSq <= radiusSq) {
        result.push({ idx: j, distSq });
      }
    }

    return result;
  }

  // ─────────────────────────────────────────
  // 统计
  // ─────────────────────────────────────────

  /**
   * 获取网格统计信息
   */
  stats() {
    let occupiedCells = 0;
    let maxOccupancy = 0;
    let totalAgents = 0;

    for (let i = 0; i < this.totalCells; i++) {
      const c = this._cellCounts[i];
      if (c > 0) occupiedCells++;
      if (c > maxOccupancy) maxOccupancy = c;
      totalAgents += c;
    }

    return {
      totalCells: this.totalCells,
      occupiedCells,
      maxOccupancy,
      totalAgents,
      avgOccupancy: occupiedCells > 0 ? (totalAgents / occupiedCells).toFixed(2) : 0,
      gridDimensions: `${this.cols} × ${this.rows}`,
    };
  }
}

module.exports = SpatialHash;
