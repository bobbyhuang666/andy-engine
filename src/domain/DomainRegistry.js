/**
 * DomainRegistry — Domain 解析和管理
 *
 * 职责：
 *   1. validate — 校验 domain 配置
 *   2. normalize — 归一化 domain 数据
 *   3. provide safe getters/fallbacks — 提供安全的访问接口
 */

const campusDomain = require('../../presets/campus');
const { validateDomain } = require('./validateDomain');

class DomainRegistry {
  /**
   * @param {Object} [domainConfig] - 自定义 domain 配置
   * @param {Object} [options] - 选项
   * @param {boolean} [options.validate=true] - 是否校验
   * @param {boolean} [options.strict=false] - 严格模式
   */
  constructor(domainConfig = null, options = {}) {
    const { validate = true, strict = false } = options;

    this.domain = domainConfig || campusDomain;

    // 校验（非默认 domain 时强制校验）
    if (validate && domainConfig) {
      const result = validateDomain(domainConfig, { strict, throwOnError: false });
      if (!result.valid) {
        throw new Error(`Invalid domain config:\n${result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n')}`);
      }
    }

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
  get version() { return this.domain.version || '0.0.0'; }

  // ═══════════════════════════════════════════
  // 空间系统
  // ═══════════════════════════════════════════

  get regions() { return this.domain.regions || []; }
  get adjacency() { return this.domain.adjacency || []; }
  get regionCoords() { return this.domain.regionCoords || {}; }
  get placeTypes() { return this.domain.placeTypes || {}; }
  get placeMapping() { return this.domain.placeMapping || {}; }

  /**
   * 获取区域列表
   * @returns {string[]}
   */
  getRegions() { return this.regions; }

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
  hasRegion(region) {
    return this.getRegionSet().has(region);
  }

  // ═══════════════════════════════════════════
  // 状态系统
  // ═══════════════════════════════════════════

  get states() { return this.domain.states || {}; }
  get stateCenters() { return this.domain.stateCenters || {}; }
  get labelTimePenalties() { return this.domain.labelTimePenalties || {}; }
  get activityTargets() { return this.domain.activityTargets || {}; }

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

  /**
   * 检查状态是否合法
   * @param {string} state
   * @returns {boolean}
   */
  hasState(state) {
    return state in this.states;
  }

  /**
   * 获取状态中心点
   * @param {string} state
   * @returns {number[]|null}
   */
  getStateCenter(state) {
    return this.stateCenters[state] || null;
  }

  // ═══════════════════════════════════════════
  // 需求系统
  // ═══════════════════════════════════════════

  get needSatisfactionMap() { return this.domain.needSatisfactionMap || {}; }
  get needDriveStates() { return this.domain.needDriveStates || {}; }
  get needRegionConfig() { return this.domain.needRegionConfig || {}; }

  // ═══════════════════════════════════════════
  // 地点意义系统
  // ═══════════════════════════════════════════

  get locationMeaningTypes() {
    return this.domain.locationMeaningTypes || {
      rest:    { B_delta: [-0.3, -0.2, -0.1, -0.2], description: '适合休息' },
      work:    { B_delta: [0.3, 0, 0.4, 0], description: '适合工作' },
      social:  { B_delta: [0, 0.4, 0, 0.3], description: '适合社交' },
      explore: { B_delta: [0.2, 0, 0.3, 0], description: '适合探索' },
    };
  }

  get eventConsequenceRules() {
    return this.domain.eventConsequenceRules || require('../config/defaults').ANDY_DEFAULTS.eventConsequenceRules;
  }

  // ═══════════════════════════════════════════
  // 事件系统
  // ═══════════════════════════════════════════

  get eventTemplates() { return this.domain.eventTemplates || {}; }

  /**
   * 获取事件模板
   * @param {string} type - 'genericEvents' | 'timeEvents' | 'weatherEvents' | 'regionEvents'
   * @returns {Object|Array}
   */
  getEventTemplates(type) {
    return this.eventTemplates[type] || {};
  }

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
  // 跳过行为配置
  // ═══════════════════════════════════════════

  get skipBehavior() { return this.domain.skipBehavior || {}; }

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
    if (this.domain.fallback) {
      return this.domain.fallback;
    }

    // 从 domain 推导 fallback
    const regions = this.regions;
    const stateNames = this.getStateNames();

    return {
      defaultRegion: regions.length > 0 ? regions[0] : null,
      defaultState: stateNames.length > 0 ? stateNames[0] : null,
      unknownState: stateNames.length > 0 ? stateNames[0] : null,
      unknownRegion: regions.length > 0 ? regions[0] : null,
    };
  }

  /**
   * 获取默认区域
   * @returns {string|null}
   */
  getFallbackRegion() {
    return this.fallback.defaultRegion || null;
  }

  /**
   * 获取默认状态
   * @returns {string|null}
   */
  getFallbackState() {
    return this.fallback.defaultState || null;
  }

  // ═══════════════════════════════════════════
  // 社交交互文本
  // ═══════════════════════════════════════════

  get socialInteractions() { return this.domain.socialInteractions || {}; }

  // ═══════════════════════════════════════════
  // 情绪调节配置
  // ═══════════════════════════════════════════

  get emotionRegulationConfig() { return this.domain.emotionRegulationConfig || {}; }

  get semanticProfile() { return this.domain.semanticProfile; }

  /**
   * 获取语义配置（安全访问）
   * @returns {Object}
   */
  getSemanticProfile() {
    return this.semanticProfile || {};
  }

  /**
   * 合并语义配置（domain 优先，defaults 补充）
   * 对嵌套对象进行深度合并，确保 domain 只覆盖已定义的键
   * @param {Object} defaults - 默认语义配置
   * @returns {Object}
   */
  mergeSemanticProfile(defaults = {}) {
    const profile = this.semanticProfile || {};
    return this._deepMergeSemantic(defaults, profile);
  }

  /**
   * 深度合并语义配置（内部方法）
   * domain 值优先，defaults 补充缺失的键
   * @param {Object} base - 基础配置（defaults）
   * @param {Object} override - 覆盖配置（domain）
   * @returns {Object}
   */
  _deepMergeSemantic(base, override) {
    const result = {};

    // 先复制 base 的所有键
    for (const key of Object.keys(base)) {
      const baseVal = base[key];
      const overrideVal = override[key];

      if (overrideVal === undefined) {
        // domain 没有这个键，使用 defaults
        result[key] = baseVal;
      } else if (
        baseVal !== null && typeof baseVal === 'object' && !Array.isArray(baseVal) &&
        overrideVal !== null && typeof overrideVal === 'object' && !Array.isArray(overrideVal)
      ) {
        // 两边都是对象，递归合并
        result[key] = this._deepMergeSemantic(baseVal, overrideVal);
      } else {
        // domain 有这个键，优先使用 domain 的值
        result[key] = overrideVal;
      }
    }

    // 添加 override 中有但 base 中没有的键
    for (const key of Object.keys(override)) {
      if (!(key in base)) {
        result[key] = override[key];
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════
  // 禁止词
  // ═══════════════════════════════════════════

  get forbiddenTerms() { return this.domain.forbiddenTerms || []; }

  /**
   * 获取禁止词列表
   * @returns {string[]}
   */
  getForbiddenTerms() {
    return this.forbiddenTerms;
  }
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
