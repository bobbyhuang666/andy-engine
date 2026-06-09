/**
 * DomainRegistry — Domain 解析和管理
 *
 * 职责：
 *   1. 解析 config.domain || campusDomain
 *   2. 提供统一的 domain 数据访问接口
 *   3. 缓存预计算数据（如 STATE_NAMES, STATE_VECTORS）
 */

const campusDomain = require('../presets/campus');

class DomainRegistry {
  /**
   * @param {Object} [domainConfig] - 自定义 domain 配置
   */
  constructor(domainConfig = null) {
    // 使用传入的 domain 或默认的 campus
    this.domain = domainConfig || campusDomain;

    // 预计算缓存
    this._stateNames = null;
    this._stateVectors = null;
    this._regionSet = null;
  }

  // ═══════════════════════════════════════════
  // 基础访问器
  // ═══════════════════════════════════════════

  get id() { return this.domain.id; }
  get name() { return this.domain.name; }
  get version() { return this.domain.version; }

  // ═══════════════════════════════════════════
  // 空间系统
  // ═══════════════════════════════════════════

  get regions() { return this.domain.regions || []; }
  get adjacency() { return this.domain.adjacency || []; }
  get regionCoords() { return this.domain.regionCoords || {}; }
  get placeTypes() { return this.domain.placeTypes || {}; }
  get placeMapping() { return this.domain.placeMapping || {}; }

  /**
   * 获取区域集合（O(1) 查找）
   * @returns {Set<string>}
   */
  getRegionSet() {
    if (!this._regionSet) {
      this._regionSet = new Set(this.regions);
    }
    return this._regionSet;
  }

  /**
   * 检查区域是否合法
   * @param {string} region
   * @returns {boolean}
   */
  isValidRegion(region) {
    return this.getRegionSet().has(region);
  }

  // ═══════════════════════════════════════════
  // 状态系统
  // ═══════════════════════════════════════════

  get states() { return this.domain.states || {}; }
  get stateCenters() { return this.domain.stateCenters || {}; }
  get labelTimePenalties() { return this.domain.labelTimePenalties || {}; }

  /**
   * 获取状态名称列表
   * @returns {string[]}
   */
  getStateNames() {
    if (!this._stateNames) {
      this._stateNames = Object.keys(this.stateCenters);
    }
    return this._stateNames;
  }

  /**
   * 获取状态向量列表（与 getStateNames() 顺序对应）
   * @returns {number[][]}
   */
  getStateVectors() {
    if (!this._stateVectors) {
      const names = this.getStateNames();
      this._stateVectors = names.map(name => this.stateCenters[name]);
    }
    return this._stateVectors;
  }

  // ═══════════════════════════════════════════
  // 需求系统
  // ═══════════════════════════════════════════

  get needSatisfactionMap() { return this.domain.needSatisfactionMap || {}; }
  get needDriveStates() { return this.domain.needDriveStates || {}; }

  // ═══════════════════════════════════════════
  // 事件系统
  // ═══════════════════════════════════════════

  get eventTemplates() { return this.domain.eventTemplates || {}; }

  // ═══════════════════════════════════════════
  // 记忆系统
  // ═══════════════════════════════════════════

  get memoryTemplates() { return this.domain.memoryTemplates || {}; }

  // ═══════════════════════════════════════════
  // Appraisal 配置
  // ═══════════════════════════════════════════

  get appraisalConfig() { return this.domain.appraisalConfig || {}; }

  // ═══════════════════════════════════════════
  // 自发动机配置
  // ═══════════════════════════════════════════

  get intrinsicMotivationConfig() { return this.domain.intrinsicMotivationConfig || {}; }

  // ═══════════════════════════════════════════
  // 日程预设
  // ═══════════════════════════════════════════

  get roleArchetypes() { return this.domain.roleArchetypes || {}; }

  // ═══════════════════════════════════════════
  // 叙事模板
  // ═══════════════════════════════════════════

  get narrativeTemplates() { return this.domain.narrativeTemplates || {}; }

  // ═══════════════════════════════════════════
  // 时间规则
  // ═══════════════════════════════════════════

  get timeRules() { return this.domain.timeRules || {}; }

  // ═══════════════════════════════════════════
  // Fallback
  // ═══════════════════════════════════════════

  get fallback() {
    // 从 domain 推导 fallback，不写死 campus
    if (this.domain.fallback) {
      return this.domain.fallback;
    }

    // 从 domain 的 regions 和 states 推导
    const regions = this.regions;
    const stateNames = this.getStateNames();

    return {
      defaultRegion: regions.length > 0 ? regions[0] : null,
      defaultState: stateNames.length > 0 ? stateNames[0] : null,
      unknownState: stateNames.length > 0 ? stateNames[0] : null,
      unknownRegion: regions.length > 0 ? regions[0] : null,
    };
  }

  // ═══════════════════════════════════════════
  // 禁止词
  // ═══════════════════════════════════════════

  get forbiddenTerms() { return this.domain.forbiddenTerms || []; }
}

// 单例
let _defaultInstance = null;

/**
 * 获取默认的 DomainRegistry 实例（campus preset）
 * @returns {DomainRegistry}
 */
function getDefaultDomain() {
  if (!_defaultInstance) {
    _defaultInstance = new DomainRegistry();
  }
  return _defaultInstance;
}

module.exports = {
  DomainRegistry,
  getDefaultDomain,
};
