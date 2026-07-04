/**
 * WorldMap - 世界地图与区域几何
 *
 * 将离散的区域标签扩展为连续 2D 空间中的几何形状。
 * 保留区域标签的语义性，同时支持连续坐标。
 *
 * 设计：
 *   - 区域可以是矩形、圆形、多边形
 *   - 每个区域有中心点（agent 移动目标）和边界
*   - 区域间可定义路径距离（非欧几里得）
*/

const { RNG } = require('../shared/rng');
class WorldMap {
  /**
   * @param {Object} options
   * @param {number} options.width - 世界宽度（米）
   * @param {number} options.height - 世界高度（米）
   * @param {Object[]} options.regions - 区域定义列表
   */
  constructor({ width = 1000, height = 1000, regions = [], rng = null }) {
    this.width = width;
    this.height = height;
    this._rng = rng || new RNG(0);

    /** @type {Map<string, RegionDef>} */
    this.regions = new Map();

    for (const def of regions) {
      this.regions.set(def.name, new RegionDef(def, this._rng));
    }
  }

  /**
   * 将区域名映射到该区域内的随机坐标
   * 用于 Schedule 输出 region → agent 坐标
   *
   * @param {string} regionName
   * @returns {{x: number, y: number}} 区域内的随机坐标
   */
  regionToCoords(regionName) {
    const region = this.regions.get(regionName);
    if (!region) {
      // R41 P1 fix: return null for unknown regions instead of silently
      // returning a fake coordinate at world centre. Callers must validate.
      // Returning fake coordinates masks configuration errors (e.g. misspelled
      // region names) and places agents at incorrect positions.
      return null;
    }
    return region.randomPoint();
  }

  /**
   * 获取区域中心坐标
   * @param {string} regionName
   * @returns {{x: number, y: number}}
   */
  regionCenter(regionName) {
    const region = this.regions.get(regionName);
    if (!region) {
      // R41 P1 fix: return null for unknown regions instead of silently
      // returning world centre.
      return null;
    }
    return region.center();
  }

  /**
   * 判断坐标落在哪个区域
   * @param {number} x
   * @param {number} y
   * @returns {string|null} 区域名，或 null（不在任何区域内）
   */
  pointToRegion(x, y) {
    for (const [name, region] of this.regions) {
      if (region.contains(x, y)) return name;
    }
    return null;
  }

  /**
   * 设置区域邻接关系
   * @param {Object} adjacencyMap - { "区域A": ["区域B", "区域C"], ... }
   */
  setAdjacency(adjacencyMap) {
    for (const [region, neighbors] of Object.entries(adjacencyMap)) {
      const r = this.regions.get(region);
      if (r) {
        r.adjacentTo = neighbors.filter(n => this.regions.has(n));
      }
    }
  }
}

/**
 * 区域几何定义
 */
class RegionDef {
  /**
   * @param {Object} def
   * @param {string} def.name - 区域名
   * @param {string} [def.shape='rect'] - 形状：rect | circle
   * @param {number} [def.x] - 矩形左上角 x
   * @param {number} [def.y] - 矩形左上角 y
   * @param {number} [def.w] - 矩形宽度
   * @param {number} [def.h] - 矩形高度
   * @param {number} [def.cx] - 圆心 x
   * @param {number} [def.cy] - 圆心 y
   * @param {number} [def.radius] - 圆半径
   * @param {boolean} [def.indoor=true] - 是否室内
   * @param {number} [def.capacity] - 容量上限
   */
  constructor(def, rng = null) {
    this.name = def.name;
    this.shape = def.shape || 'rect';
    this.indoor = def.indoor !== false;
    this.capacity = def.capacity || null;
    this.adjacentTo = [];
    this._rng = rng || new RNG(0);

    if (this.shape === 'rect') {
      this.x = def.x ?? 0;
      this.y = def.y ?? 0;
      this.w = def.w || 100;
      this.h = def.h || 100;
    } else if (this.shape === 'circle') {
      this.cx = def.cx ?? 0;
      this.cy = def.cy ?? 0;
      this.radius = def.radius || 50;
    }
  }

  /**
   * 判断点是否在区域内
   */
  contains(px, py) {
    if (this.shape === 'rect') {
      return px >= this.x && px <= this.x + this.w &&
             py >= this.y && py <= this.y + this.h;
    }
    if (this.shape === 'circle') {
      const dx = px - this.cx;
      const dy = py - this.cy;
      return dx * dx + dy * dy <= this.radius * this.radius;
    }
    return false;
  }

  /**
   * 区域中心点
   */
  center() {
    if (this.shape === 'rect') {
      return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
    }
    return { x: this.cx, y: this.cy };
  }

  /**
   * 区域内随机点（带 padding 避免贴边）
   */
  randomPoint() {
    const padding = 2; // 2 米边距
    const rand = () => this._rng.next();
    if (this.shape === 'rect') {
      if (this.w - padding * 2 <= 0 || this.h - padding * 2 <= 0) return this.center();
      return {
        x: this.x + padding + rand() * (this.w - padding * 2),
        y: this.y + padding + rand() * (this.h - padding * 2),
      };
    }
    if (this.shape === 'circle') {
      if (this.radius - padding <= 0) return this.center();
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (this.radius - padding);
      return {
        x: this.cx + Math.cos(angle) * r,
        y: this.cy + Math.sin(angle) * r,
      };
    }
    return this.center();
  }

  /**
   * 区域面积
   */
  area() {
    if (this.shape === 'rect') return this.w * this.h;
    if (this.shape === 'circle') return Math.PI * this.radius * this.radius;
    return 0;
  }
}

module.exports = { WorldMap, RegionDef };
