/**
 * WorldviewConstraints — 世界观约束模块
 *
 * 职责：
 *   1. 定义禁止的校园词汇和地点
 *   2. 提供替换规则（校园词 → 安全文案）
 *   3. 对输出文本做校验和清洗
 *   4. 确保最终展示给用户的内容符合世界观
 *
 * 使用场景：
 *   - Agent.toNarrative() 输出校验
 *   - NarrativeBuilder 构建 prompt 时的约束
 *   - LLM 输出的后处理
 */

// 禁止的校园地点
const FORBIDDEN_CAMPUS_PLACES = new Set([
  '教室', '教学楼', '实验室', '自习室', '图书馆',
  '校园广场', '操场', '体育馆', '宿舍', '学生宿舍',
  '食堂', '学生食堂', '大学', '学院', '校区',
  '校门口', '校医院', '行政楼', '科研楼',
]);

// 禁止的校园身份/职业词
const FORBIDDEN_CAMPUS_IDENTITY = new Set([
  '学生', '大学生', '研究生', '博士生', '本科生',
  '老师', '教授', '讲师', '导师', '辅导员',
  '班长', '学长', '学姐', '学弟', '学妹',
  '同学', '室友', '舍友',
]);

// 禁止的校园活动/状态词
const FORBIDDEN_CAMPUS_ACTIVITIES = new Set([
  '上课', '下课', '自习', '翘课', '逃课',
  '考试', '期末', '期中', '论文', '作业',
  '选课', '补考', '挂科', '学分', '绩点',
  '社团', '学生会', '团委',
]);

// 地点替换映射（校园词 → 安全文案）
const PLACE_REPLACEMENTS = {
  '教室': '工作区',
  '教学楼': '办公楼',
  '实验室': '工作室',
  '自习室': '安静的角落',
  '图书馆': '阅览室',
  '校园广场': '小镇广场',
  '操场': '运动场',
  '体育馆': '健身房',
  '宿舍': '住处',
  '学生宿舍': '住处',
  '食堂': '餐厅',
  '学生食堂': '餐厅',
  '大学': '小镇',
  '学院': '社区',
  '校区': '镇上',
  '校门口': '镇口',
  '校医院': '诊所',
  '行政楼': '办公楼',
  '科研楼': '办公楼',
};

// 身份替换映射
const IDENTITY_REPLACEMENTS = {
  '学生': '年轻人',
  '大学生': '年轻人',
  '研究生': '研究员',
  '博士生': '研究员',
  '本科生': '年轻人',
  '老师': '前辈',
  '教授': '资深前辈',
  '讲师': '指导员',
  '导师': '师傅',
  '辅导员': '顾问',
  '班长': '组长',
  '学长': '前辈',
  '学姐': '前辈',
  '学弟': '后辈',
  '学妹': '后辈',
  '同学': '朋友',
  '室友': '同住的人',
  '舍友': '同住的人',
};

// 活动替换映射
const ACTIVITY_REPLACEMENTS = {
  '上课': '工作',
  '下课': '下班',
  '自习': '专注做事',
  '翘课': '偷懒',
  '逃课': '偷懒',
  '考试': '考核',
  '期末': '年底',
  '期中': '季度',
  '论文': '报告',
  '作业': '任务',
  '选课': '选择任务',
  '补考': '重试',
  '挂科': '失败',
  '学分': '积分',
  '绩点': '评分',
  '社团': '兴趣小组',
  '学生会': '社区委员会',
  '团委': '社区组织',
};

/**
 * 清洗文本中的校园词汇
 *
 * @param {string} text - 原始文本
 * @returns {string} 清洗后的文本
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // 替换地点（按 key 长度降序排列，防止短词先匹配长词的子串）
  // 例如：'学生宿舍' 应该先匹配 '学生宿舍' 而不是先匹配 '学生' 或 '宿舍'
  const placeEntries = Object.entries(PLACE_REPLACEMENTS).sort((a, b) => b[0].length - a[0].length);
  for (const [forbidden, replacement] of placeEntries) {
    result = result.replace(new RegExp(forbidden, 'g'), replacement);
  }

  // 替换身份（按 key 长度降序排列）
  const identityEntries = Object.entries(IDENTITY_REPLACEMENTS).sort((a, b) => b[0].length - a[0].length);
  for (const [forbidden, replacement] of identityEntries) {
    result = result.replace(new RegExp(forbidden, 'g'), replacement);
  }

  // 替换活动（按 key 长度降序排列）
  const activityEntries = Object.entries(ACTIVITY_REPLACEMENTS).sort((a, b) => b[0].length - a[0].length);
  for (const [forbidden, replacement] of activityEntries) {
    result = result.replace(new RegExp(forbidden, 'g'), replacement);
  }

  return result;
}

/**
 * 检查文本是否包含校园词汇
 *
 * @param {string} text - 待检查的文本
 * @returns {{ hasViolation: boolean, violations: string[] }}
 */
function checkViolations(text) {
  if (!text || typeof text !== 'string') {
    return { hasViolation: false, violations: [] };
  }

  const violations = [];

  for (const place of FORBIDDEN_CAMPUS_PLACES) {
    if (text.includes(place)) {
      violations.push(`地点: ${place}`);
    }
  }

  for (const identity of FORBIDDEN_CAMPUS_IDENTITY) {
    if (text.includes(identity)) {
      violations.push(`身份: ${identity}`);
    }
  }

  for (const activity of FORBIDDEN_CAMPUS_ACTIVITIES) {
    if (text.includes(activity)) {
      violations.push(`活动: ${activity}`);
    }
  }

  return {
    hasViolation: violations.length > 0,
    violations,
  };
}

/**
 * 安全地获取地点描述
 * 如果是校园地点，返回替换后的安全文案
 *
 * @param {string} region - 原始地点
 * @returns {string} 安全的地点描述
 */
function safeRegion(region) {
  if (!region) return '住处';
  return PLACE_REPLACEMENTS[region] || region;
}

/**
 * 安全地获取活动描述
 * 如果是校园活动，返回替换后的安全文案
 *
 * @param {string} activity - 原始活动
 * @returns {string} 安全的活动描述
 */
function safeActivity(activity) {
  if (!activity) return '在休息';
  return ACTIVITY_REPLACEMENTS[activity] || activity;
}

/**
 * 安全地获取状态描述
 * 综合处理地点和活动
 *
 * @param {Object} params
 * @param {string} params.region - 地点
 * @param {string} params.activity - 活动
 * @param {string} params.state - 状态
 * @returns {Object} 安全的描述
 */
function safeStateDescription({ region, activity, state }) {
  return {
    region: safeRegion(region),
    activity: safeActivity(activity),
    state: sanitizeText(state || ''),
  };
}

/**
 * Domain-aware guard：根据 domain 的 forbiddenTerms 替换文本
 * Delegates to domain/ForbiddenTerms (dependency leaf).
 *
 * @param {string} text - 原始文本
 * @param {Object} domain - DomainRegistry 实例
 * @returns {string} 处理后的文本
 */
const { applyForbiddenTerms } = require('../domain/ForbiddenTerms');

module.exports = {
  FORBIDDEN_CAMPUS_PLACES,
  FORBIDDEN_CAMPUS_IDENTITY,
  FORBIDDEN_CAMPUS_ACTIVITIES,
  PLACE_REPLACEMENTS,
  IDENTITY_REPLACEMENTS,
  ACTIVITY_REPLACEMENTS,
  sanitizeText,
  checkViolations,
  safeRegion,
  safeActivity,
  safeStateDescription,
  applyForbiddenTerms,
};
