/**
 * BehaviorLabeler — 连续行为空间 → 语义标签投影器
 *
 * 将 4 维连续行为向量 B ∈ [0,1]^4 投影回语义标签，
 * 用于 LLM prompt 注入、故事生成、记忆记录等下游系统。
 *
 * 维度定义：
 *   B[0] = activity      0=休息/睡觉  1=工作/运动
 *   B[1] = sociality     0=独处/发呆  1=聊天/社交
 *   B[2] = focus         0=漫无目的   1=高度专注
 *   B[3] = expressiveness 0=封闭退缩  1=外向表达
 *
 * 投影方法：加权最近邻 + 混合标签
 *   - 主标签：最近的状态中心点
 *   - 次标签：第二近的状态中心点（当距离比 < 1.5 时返回）
 *   - 置信度：主标签的相对距离优势
 */

const { getDefaultDomain } = require('../domain/DomainRegistry');

// ═══════════════════════════════════════════
// 维度索引常量
// ═══════════════════════════════════════════
const DIM_ACTIVITY = 0;
const DIM_SOCIALITY = 1;
const DIM_FOCUS = 2;
const DIM_EXPRESSIVENESS = 3;
const DIMS = 4;

// ═══════════════════════════════════════════
// 向后兼容：默认 STATE_CENTERS（从 campus domain 取）
// 新代码应使用 BehaviorLabeler.create(domain) 创建 domain-aware 实例
// ═══════════════════════════════════════════
const defaultDomain = getDefaultDomain();
const STATE_CENTERS = defaultDomain.stateCenters;
const STATE_NAMES = defaultDomain.getStateNames();
const STATE_VECTORS = defaultDomain.getStateVectors();

// ═══════════════════════════════════════════
// 时间约束势能：根据小时惩罚不合理的高活跃/高社交行为
// 返回一个额外的势能惩罚（越高越不合理）
// ═══════════════════════════════════════════
function getTimePenalty(B, hour) {
  let penalty = 0;

  // 深夜 (23-5): 高活跃行为被惩罚
  if (hour >= 23 || hour < 5) {
    if (B[DIM_ACTIVITY] > 0.4) penalty += (B[DIM_ACTIVITY] - 0.4) * 2.0;
    if (B[DIM_SOCIALITY] > 0.3) penalty += (B[DIM_SOCIALITY] - 0.3) * 1.5;
  }
  // 清晨 (5-7): 中等活跃可接受
  else if (hour >= 5 && hour < 7) {
    if (B[DIM_ACTIVITY] > 0.7) penalty += (B[DIM_ACTIVITY] - 0.7) * 0.5;
  }
  // 工作时间 (8-12, 14-17): 完全不活跃被轻微惩罚（应该做事）
  else if ((hour >= 8 && hour < 12) || (hour >= 14 && hour < 17)) {
    if (B[DIM_ACTIVITY] < 0.2) penalty += (0.2 - B[DIM_ACTIVITY]) * 0.3;
  }

  return penalty;
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

/** 欧几里得距离的平方（避免 sqrt） */
function distSq(a, b) {
  let sum = 0;
  for (let i = 0; i < DIMS; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

/** 欧几里得距离 */
function dist(a, b) {
  return Math.sqrt(distSq(a, b));
}

class BehaviorLabeler {
  /**
   * 创建 domain-aware 的 BehaviorLabeler
   * @param {Object} domain - DomainRegistry 实例
   * @returns {BehaviorLabelerDomain}
   */
  static create(domain) {
    return new BehaviorLabelerDomain(domain);
  }

  /**
   * 将连续行为向量投影为语义标签（使用默认 domain）
   *
   * @param {number[]} B - 4 维行为向量 [activity, sociality, focus, expressiveness]
   * @param {Object} [options]
   * @param {number} [options.hour] - 当前小时（用于辅助标签生成）
   * @param {string} [options.region] - 当前区域（用于辅助标签生成）
   * @returns {{ primary: string, secondary: string|null, confidence: number }}
   */
  static project(B, options = {}) {
    if (!B || B.length < DIMS) {
      return { primary: '在发呆', secondary: null, confidence: 0.5 };
    }

    const hour = options.hour;

    // 计算到每个状态中心的距离（可选：时间惩罚）
    // 从 defaultDomain 获取 labelTimePenalties
    const labelTimePenalties = defaultDomain.labelTimePenalties || {};
    const distances = [];
    for (let i = 0; i < STATE_VECTORS.length; i++) {
      let d = dist(B, STATE_VECTORS[i]);

      // 时间惩罚：不合理的状态在距离上加罚
      if (hour !== undefined) {
        const rule = labelTimePenalties[STATE_NAMES[i]];
        if (rule && !rule.hours.includes(hour)) {
          d += rule.penalty;
        }
      }

      distances.push({
        name: STATE_NAMES[i],
        dist: d,
      });
    }

    // 按距离排序
    distances.sort((a, b) => a.dist - b.dist);

    const primary = distances[0];
    const secondary = distances[1];

    // 置信度：基于最近和次近的距离比
    // ratio → 1 表示两个状态几乎一样近（低置信度）
    // ratio → 0 表示主标签远优于次标签（高置信度）
    const ratio = primary.dist < 1e-10
      ? 0  // 精确匹配
      : (secondary.dist > 0 ? primary.dist / secondary.dist : 1);
    const confidence = primary.dist < 1e-10
      ? 1.0  // 精确匹配 → 最高置信度
      : Math.max(0.3, Math.min(1, 1 - ratio * 0.5));

    // 次标签：只在两个状态足够接近时返回（距离比 < 0.75）
    const secondaryLabel = ratio < 0.75 ? secondary.name : null;

    return {
      primary: primary.name,
      secondary: secondaryLabel,
      confidence,
    };
  }

  /**
   * 生成带修饰的行为描述（超越简单标签）
   *
   * 例如：不只是"在阅览处"，而是"在阅览处，但有点心不在焉"
   *
   * @param {number[]} B - 4 维行为向量
   * @param {Object} [options]
   * @returns {string} 自然语言行为描述
   */
  static describe(B, options = {}) {
    const { primary, secondary, confidence } = BehaviorLabeler.project(B, options);

    // 从 defaultDomain 获取配置
    const domain = defaultDomain;

    // 基础描述
    let desc = primary;

    // 低置信度时添加修饰
    if (secondary && confidence < 0.6) {
      desc = `${primary}，但也${_stateToVerb(secondary, domain)}`;
    }

    // 根据 B 向量维度添加情绪/状态修饰
    const modifiers = [];

    if (B[DIM_FOCUS] < 0.25 && _isHighFocusState(primary, domain)) {
      modifiers.push('有点心不在焉');
    }
    if (B[DIM_SOCIALITY] > 0.6 && !_isSocialState(primary, domain)) {
      modifiers.push('想找人说话');
    }
    if (B[DIM_ACTIVITY] < 0.15 && _isActiveState(primary, domain)) {
      modifiers.push('不太想动');
    }

    if (modifiers.length > 0) {
      desc += `，${modifiers[0]}`;
    }

    return desc;
  }

  /**
   * 获取所有状态中心点（用于可视化和调试）
   * @returns {Object} { stateName: [activity, sociality, focus, expressiveness] }
   */
  static getStateCenters() {
    return { ...STATE_CENTERS };
  }
}

// ═══════════════════════════════════════════
// Domain-aware BehaviorLabeler
// ═══════════════════════════════════════════
class BehaviorLabelerDomain {
  constructor(domain) {
    this.domain = domain;
    this.stateNames = domain.getStateNames();
    this.stateVectors = domain.getStateVectors();
    this.labelTimePenalties = domain.labelTimePenalties;
  }

  project(B, options = {}) {
    if (!B || B.length < DIMS) {
      return { primary: this.domain.fallback.unknownState, secondary: null, confidence: 0.5 };
    }

    const hour = options.hour;
    const distances = [];

    for (let i = 0; i < this.stateVectors.length; i++) {
      let d = dist(B, this.stateVectors[i]);

      if (hour !== undefined) {
        const penalty = this._getTimeLabelPenalty(this.stateNames[i], hour);
        d += penalty;
      }

      distances.push({
        name: this.stateNames[i],
        dist: d,
      });
    }

    distances.sort((a, b) => a.dist - b.dist);

    const primary = distances[0];
    const secondary = distances[1];

    const ratio = primary.dist < 1e-10
      ? 0
      : (secondary.dist > 0 ? primary.dist / secondary.dist : 1);
    const confidence = primary.dist < 1e-10
      ? 1.0
      : Math.max(0.3, Math.min(1, 1 - ratio * 0.5));

    const secondaryLabel = ratio < 0.75 ? secondary.name : null;

    return {
      primary: primary.name,
      secondary: secondaryLabel,
      confidence,
    };
  }

  _getTimeLabelPenalty(state, hour) {
    const rule = this.labelTimePenalties[state];
    if (!rule) return 0;
    if (rule.hours.includes(hour)) return 0;
    return rule.penalty;
  }
}

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════
// 辅助函数（从 domain 获取配置）
// ═══════════════════════════════════════════

function _stateToVerb(state, domain) {
  // 从 domain 的 narrativeTemplates 获取 verb map
  const verbMap = (domain && domain.narrativeTemplates && domain.narrativeTemplates.verbMap) || {};
  return verbMap[state] || `在${state.replace(/^在/, '')}`;
}

function _isHighFocusState(state, domain) {
  // 从 domain 的 states 获取高专注状态
  if (!domain || !domain.states) return false;
  const stateDef = domain.states[state];
  return stateDef && (stateDef.category === 'active' || stateDef.category === 'quiet');
}

function _isSocialState(state, domain) {
  // 从 domain 的 states 获取社交状态
  if (!domain || !domain.states) return false;
  const stateDef = domain.states[state];
  return stateDef && stateDef.category === 'social';
}

function _isActiveState(state, domain) {
  // 从 domain 的 states 获取活跃状态
  if (!domain || !domain.states) return false;
  const stateDef = domain.states[state];
  return stateDef && stateDef.category === 'active';
}

/**
 * 标签时间合理性惩罚（Campus Legacy）
 * 不合理的状态在投影距离上加罚（0 = 无惩罚，0.3 = 强惩罚）
 *
 * 设计：不是硬约束，而是软偏好。凌晨3点"在工作"的距离加 0.3，
 * 如果 B 确实非常接近"在工作"中心（距离 < 0.1），总距离 0.4
 * 仍然可能大于"还没睡呢"的距离 0.3 → 合理标签胜出。
 */
// LABEL_TIME_PENALTIES 已迁移到 domain.labelTimePenalties
// 保留空对象作为 fallback
const LABEL_TIME_PENALTIES = {};

module.exports = {
  BehaviorLabeler,
  STATE_CENTERS,
  STATE_NAMES,
  STATE_VECTORS,
  DIM_ACTIVITY,
  DIM_SOCIALITY,
  DIM_FOCUS,
  DIM_EXPRESSIVENESS,
  DIMS,
  dist,
  distSq,
  getTimePenalty,
};
