/**
 * BehaviorLabeler — 连续行为空间 → 语义标签投影器
 *
 * 将 4 维连续行为向量 B ∈ [0,1]^4 投影回语义标签，
 * 用于 LLM prompt 注入、故事生成、记忆记录等下游系统。
 *
 * 维度定义：
 *   B[0] = activity      0=休息/睡觉  1=上课/工作/运动
 *   B[1] = sociality     0=独处/发呆  1=聊天/社交
 *   B[2] = focus         0=漫无目的   1=高度专注
 *   B[3] = expressiveness 0=封闭退缩  1=外向表达
 *
 * 投影方法：加权最近邻 + 混合标签
 *   - 主标签：最近的状态中心点
 *   - 次标签：第二近的状态中心点（当距离比 < 1.5 时返回）
 *   - 置信度：主标签的相对距离优势
 */

// ═══════════════════════════════════════════
// 维度索引常量
// ═══════════════════════════════════════════
const DIM_ACTIVITY = 0;
const DIM_SOCIALITY = 1;
const DIM_FOCUS = 2;
const DIM_EXPRESSIVENESS = 3;
const DIMS = 4;

// ═══════════════════════════════════════════
// 状态中心点：每个原有状态在 4D 行为空间中的位置
//
// 坐标 [activity, sociality, focus, expressiveness]
// 基于状态语义分析确定，不是精确测量
// ═══════════════════════════════════════════
const STATE_CENTERS = {
  // ── 睡眠 ──
  '睡了':           [0.00, 0.00, 0.00, 0.00],
  '在翻身':         [0.05, 0.00, 0.00, 0.00],
  '快睡了':         [0.05, 0.00, 0.05, 0.00],
  '困了但睡不着':   [0.08, 0.00, 0.10, 0.05],

  // ── 深夜 ──
  '还没睡呢':       [0.12, 0.05, 0.15, 0.10],
  '在发呆':         [0.08, 0.05, 0.08, 0.05],
  '在听歌':         [0.10, 0.05, 0.20, 0.08],
  '在看窗外':       [0.06, 0.02, 0.10, 0.03],
  '熬夜了':         [0.15, 0.08, 0.12, 0.10],

  // ── 早晨 ──
  '刚醒':           [0.15, 0.05, 0.10, 0.08],
  '在洗漱':         [0.35, 0.02, 0.15, 0.05],
  '在换衣服':       [0.30, 0.02, 0.10, 0.05],
  '刚出门':         [0.50, 0.10, 0.15, 0.20],

  // ── 学习/工作 ──
  '在教学楼':       [0.55, 0.20, 0.50, 0.20],
  '在上课':         [0.75, 0.15, 0.85, 0.15],
  '在走神':         [0.35, 0.10, 0.12, 0.08],
  '下课了':         [0.40, 0.50, 0.20, 0.50],
  '在图书馆':       [0.20, 0.08, 0.70, 0.05],
  '在自习':         [0.25, 0.05, 0.80, 0.05],
  '在工作':         [0.70, 0.15, 0.80, 0.25],
  '在开会':         [0.50, 0.45, 0.65, 0.40],
  '在办公室':       [0.45, 0.15, 0.50, 0.20],

  // ── 餐饮 ──
  '在食堂':         [0.30, 0.55, 0.20, 0.50],
  '吃完了':         [0.25, 0.35, 0.15, 0.35],
  '在做饭':         [0.55, 0.15, 0.50, 0.15],
  '做好了':         [0.30, 0.20, 0.15, 0.20],
  '在吃饭':         [0.25, 0.30, 0.15, 0.30],
  '吃完了晚饭':     [0.20, 0.25, 0.10, 0.25],
  '在洗碗':         [0.40, 0.05, 0.25, 0.05],

  // ── 社交 ──
  '在聊天':         [0.30, 0.85, 0.30, 0.90],
  '在校园广场':     [0.35, 0.70, 0.25, 0.65],
  '在咖啡店':       [0.25, 0.55, 0.35, 0.50],
  '在看书':         [0.18, 0.05, 0.75, 0.05],

  // ── 娱乐/休闲 ──
  '在看剧':         [0.12, 0.15, 0.45, 0.10],
  '看完了':         [0.15, 0.10, 0.15, 0.10],
  '在收拾':         [0.35, 0.05, 0.30, 0.05],
  '在看手机':       [0.10, 0.10, 0.35, 0.10],
  '在听歌':         [0.10, 0.05, 0.20, 0.08],

  // ── 居家 ──
  '到家了':         [0.20, 0.10, 0.15, 0.15],
  '先躺一会':       [0.08, 0.05, 0.08, 0.05],
  '在洗澡':         [0.40, 0.00, 0.15, 0.02],
  '洗完了':         [0.20, 0.05, 0.10, 0.08],
  '在吹头发':       [0.25, 0.05, 0.15, 0.05],

  // ── 疲劳/休息 ──
  '有点困':         [0.15, 0.08, 0.15, 0.08],
  '趴一会':         [0.06, 0.03, 0.05, 0.03],
  '有点累':         [0.12, 0.10, 0.10, 0.10],
  '在休息':         [0.10, 0.08, 0.10, 0.08],
  '困了':           [0.08, 0.05, 0.08, 0.05],

  // ── 通勤 ──
  '在路上':         [0.55, 0.10, 0.15, 0.15],
  '刚下班':         [0.50, 0.15, 0.12, 0.20],
  '在回家路上':     [0.50, 0.08, 0.10, 0.10],

  // ── 购物/打工 ──
  '在便利店':       [0.50, 0.25, 0.45, 0.20],
  '在打工':         [0.65, 0.30, 0.60, 0.35],

  // ── 偏差行为 ──
  '翘课了':         [0.25, 0.15, 0.10, 0.20],
  '在外面闲逛':     [0.40, 0.20, 0.12, 0.30],
  '在网吧':         [0.35, 0.25, 0.50, 0.25],
  '在宿舍躺着':     [0.06, 0.05, 0.08, 0.05],
  '在拖延':         [0.15, 0.08, 0.08, 0.10],

  // ── 生病 ──
  '生病了':         [0.08, 0.02, 0.05, 0.05],
  '请假了':         [0.12, 0.05, 0.10, 0.08],
};

// 预计算：每个状态中心点的坐标数组（避免每次 Object.values 创建新数组）
const STATE_NAMES = Object.keys(STATE_CENTERS);
const STATE_VECTORS = STATE_NAMES.map(name => STATE_CENTERS[name]);

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
  // 上课时间 (8-12, 14-17): 完全不活跃被轻微惩罚（应该做事）
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
   * 将连续行为向量投影为语义标签
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
    const distances = [];
    for (let i = 0; i < STATE_VECTORS.length; i++) {
      let d = dist(B, STATE_VECTORS[i]);

      // 时间惩罚：不合理的状态在距离上加罚
      // 例如凌晨3点不应该投影到"在上课"
      if (hour !== undefined) {
        const penalty = _getTimeLabelPenalty(STATE_NAMES[i], hour);
        d += penalty;
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
   * 例如：不只是"在图书馆"，而是"在图书馆，但有点心不在焉"
   *
   * @param {number[]} B - 4 维行为向量
   * @param {Object} [options]
   * @returns {string} 自然语言行为描述
   */
  static describe(B, options = {}) {
    const { primary, secondary, confidence } = BehaviorLabeler.project(B, options);

    // 基础描述
    let desc = primary;

    // 低置信度时添加修饰
    if (secondary && confidence < 0.6) {
      desc = `${primary}，但也${_stateToVerb(secondary)}`;
    }

    // 根据 B 向量维度添加情绪/状态修饰
    const modifiers = [];

    if (B[DIM_FOCUS] < 0.25 && _isHighFocusState(primary)) {
      modifiers.push('有点心不在焉');
    }
    if (B[DIM_SOCIALITY] > 0.6 && !_isSocialState(primary)) {
      modifiers.push('想找人说话');
    }
    if (B[DIM_ACTIVITY] < 0.15 && _isActiveState(primary)) {
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
// 辅助函数
// ═══════════════════════════════════════════

function _stateToVerb(state) {
  const verbMap = {
    '在发呆': '在走神', '在看手机': '在刷手机', '在聊天': '想聊天',
    '在自习': '想学习', '在休息': '想休息', '在看剧': '想看剧',
    '在食堂': '想去吃饭', '在图书馆': '想去图书馆',
  };
  return verbMap[state] || `在${state.replace(/^在/, '')}`;
}

function _isHighFocusState(state) {
  return ['在上课', '在自习', '在图书馆', '在工作', '在开会', '在看书'].includes(state);
}

function _isSocialState(state) {
  return ['在聊天', '在食堂', '在校园广场', '在咖啡店', '在开会'].includes(state);
}

function _isActiveState(state) {
  return ['在上课', '在工作', '在开会', '在打工', '在运动'].includes(state);
}

/**
 * 标签时间合理性惩罚
 * 不合理的状态在投影距离上加罚（0 = 无惩罚，0.3 = 强惩罚）
 *
 * 设计：不是硬约束，而是软偏好。凌晨3点"在上课"的距离加 0.3，
 * 如果 B 确实非常接近"在上课"中心（距离 < 0.1），总距离 0.4
 * 仍然可能大于"还没睡呢"的距离 0.3 → 合理标签胜出。
 */
const LABEL_TIME_PENALTIES = {
  // 深夜不应该出现的标签
  '在上课': { hours: [8,9,10,11,12,13,14,15,16], penalty: 0.3 },
  '在工作': { hours: [8,9,10,11,12,13,14,15,16,17,18], penalty: 0.25 },
  '在开会': { hours: [9,10,11,13,14,15,16,17], penalty: 0.25 },
  '在打工': { hours: [10,11,12,13,14,15,16,17,18,19,20,21], penalty: 0.2 },
  '在自习': { hours: [8,9,10,11,12,13,14,15,16,17,18,19,20], penalty: 0.15 },
  '在图书馆': { hours: [8,9,10,11,12,13,14,15,16,17,18,19,20], penalty: 0.1 },
  '下课了': { hours: [9,10,11,12,13,14,15,16,17], penalty: 0.15 },
  '在食堂': { hours: [7,8,11,12,13,17,18,19], penalty: 0.1 },
  '刚出门': { hours: [7,8,9], penalty: 0.2 },
  '在洗漱': { hours: [6,7,8,9], penalty: 0.2 },
  // 深夜专属
  '还没睡呢': { hours: [22,23,0,1,2,3], penalty: 0.15 },
  '熬夜了': { hours: [0,1,2,3,4,5], penalty: 0.2 },
  '困了但睡不着': { hours: [23,0,1,2,3], penalty: 0.15 },
};

function _getTimeLabelPenalty(state, hour) {
  const rule = LABEL_TIME_PENALTIES[state];
  if (!rule) return 0; // 无规则 → 无惩罚
  if (rule.hours.includes(hour)) return 0; // 合理时间 → 无惩罚
  return rule.penalty;
}

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
