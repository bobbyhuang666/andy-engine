/**
 * 合成数据生成 - 场景定义
 *
 * 每个场景定义：
 *   - 规模（agent 数量）
 *   - 人格分布（MBTI → OCEAN → 行为参数）
 *   - 社交图谱拓扑
 *   - 模拟时长
 *   - 采样频率
 *
 * 设计原则：
 *   - 场景覆盖多种社会结构（校园、职场、社区）
 *   - 人格分布尽量均匀，避免偏差
 *   - 社交图谱使用小世界网络 + Dunbar 层级
 */

// ═══════════════════════════════════════════
// MBTI → OCEAN 映射（基于 Costa & McCrae 1992）
// ═══════════════════════════════════════════
const MBTI_TO_OCEAN = {
  INFP: { openness: 0.82, conscientiousness: 0.42, extraversion: 0.28, agreeableness: 0.75, neuroticism: 0.65 },
  INFJ: { openness: 0.80, conscientiousness: 0.60, extraversion: 0.32, agreeableness: 0.78, neuroticism: 0.60 },
  INTJ: { openness: 0.78, conscientiousness: 0.72, extraversion: 0.25, agreeableness: 0.38, neuroticism: 0.45 },
  INTP: { openness: 0.85, conscientiousness: 0.35, extraversion: 0.22, agreeableness: 0.42, neuroticism: 0.50 },
  ISFP: { openness: 0.55, conscientiousness: 0.42, extraversion: 0.35, agreeableness: 0.72, neuroticism: 0.52 },
  ISFJ: { openness: 0.40, conscientiousness: 0.75, extraversion: 0.30, agreeableness: 0.80, neuroticism: 0.48 },
  ISTJ: { openness: 0.35, conscientiousness: 0.82, extraversion: 0.25, agreeableness: 0.50, neuroticism: 0.38 },
  ISTP: { openness: 0.52, conscientiousness: 0.45, extraversion: 0.30, agreeableness: 0.40, neuroticism: 0.42 },
  ENFP: { openness: 0.85, conscientiousness: 0.35, extraversion: 0.82, agreeableness: 0.72, neuroticism: 0.58 },
  ENFJ: { openness: 0.72, conscientiousness: 0.65, extraversion: 0.80, agreeableness: 0.85, neuroticism: 0.52 },
  ENTJ: { openness: 0.70, conscientiousness: 0.80, extraversion: 0.78, agreeableness: 0.35, neuroticism: 0.40 },
  ENTP: { openness: 0.88, conscientiousness: 0.38, extraversion: 0.75, agreeableness: 0.42, neuroticism: 0.48 },
  ESFP: { openness: 0.60, conscientiousness: 0.30, extraversion: 0.85, agreeableness: 0.70, neuroticism: 0.50 },
  ESFJ: { openness: 0.42, conscientiousness: 0.70, extraversion: 0.78, agreeableness: 0.82, neuroticism: 0.52 },
  ESTJ: { openness: 0.38, conscientiousness: 0.82, extraversion: 0.72, agreeableness: 0.45, neuroticism: 0.38 },
  ESTP: { openness: 0.55, conscientiousness: 0.35, extraversion: 0.82, agreeableness: 0.48, neuroticism: 0.45 },
};

const ALL_MBTI = Object.keys(MBTI_TO_OCEAN);

// ═══════════════════════════════════════════
// OCEAN → 行为参数（与 JS personalityToBehavior 一致）
// ═══════════════════════════════════════════
function oceanToBehavior(ocean) {
  const clamp = v => Math.max(0, Math.min(1, v));
  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = ocean;
  // snake_case 以匹配 Rust BehaviorParams serde Deserialize
  return {
    emotion_decay_rate: clamp(0.5 - 0.3 * neuroticism),
    emotional_inertia: clamp(0.3 + 0.4 * neuroticism),
    susceptibility: clamp(0.3 + 0.4 * agreeableness + 0.2 * extraversion),
    expressiveness: clamp(0.2 + 0.6 * extraversion),
  };
}

// ═══════════════════════════════════════════
// 场景配置
// ═══════════════════════════════════════════

const SCENARIOS = [
  // ─── 场景 1：大学校园 ───
  {
    id: 'campus_1000',
    name: '大学校园 (1000 agents, 30天)',
    numAgents: 1000,
    durationDays: 30,
    sampleIntervalTicks: 12,  // 每小时采样（12 ticks = 60min @ 5min/tick）
    groups: [
      { prefix: 'stu', count: 600, mbtiPool: ALL_MBTI, label: '学生' },
      { prefix: 'wrk', count: 250, mbtiPool: ALL_MBTI, label: '教职工' },
      { prefix: 'fre', count: 150, mbtiPool: ALL_MBTI, label: '周边居民' },
    ],
    graph: {
      type: 'small_world',
      k: 20,           // 每个节点初始连接 20 个近邻
      rewireProb: 0.15, // 15% 概率跨组重连
      // Dunbar 层级分配（基于连接排名）
      dunbarLevels: {
        closeFriend: 5,     // 最强的 5 条 → level 0 (每 tick 传染)
        friend: 10,          // 次强的 10 条 → level 1 (每 3 ticks)
        acquaintance: 15,    // 其余 → level 2 (每 12 ticks)
      },
    },
  },

  // ─── 场景 2：科技公司 ───
  {
    id: 'company_500',
    name: '科技公司 (500 agents, 60天)',
    numAgents: 500,
    durationDays: 60,
    sampleIntervalTicks: 12,
    groups: [
      { prefix: 'eng', count: 200, mbtiPool: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'ISTJ', 'ISTP'], label: '工程师' },
      { prefix: 'mkt', count: 100, mbtiPool: ['ENFP', 'ENFJ', 'ESFP', 'ESFJ', 'INFP', 'INFJ'], label: '市场' },
      { prefix: 'mgmt', count: 80, mbtiPool: ['ENTJ', 'ESTJ', 'ENFJ', 'INTJ', 'ISTJ'], label: '管理层' },
      { prefix: 'sup', count: 120, mbtiPool: ALL_MBTI, label: '支持部门' },
    ],
    graph: {
      type: 'small_world',
      k: 15,
      rewireProb: 0.10,
      // 职场层级结构：同部门连接更强
      departmentBias: 0.7, // 70% 的强关系在同一部门
      dunbarLevels: { closeFriend: 5, friend: 10, acquaintance: 15 },
    },
  },

  // ─── 场景 3：社区邻里 ───
  {
    id: 'community_2000',
    name: '社区邻里 (2000 agents, 30天)',
    numAgents: 2000,
    durationDays: 30,
    sampleIntervalTicks: 24,  // 每 2 小时采样（减少数据量）
    groups: [
      { prefix: 'fam', count: 800, mbtiPool: ALL_MBTI, label: '家庭住户' },
      { prefix: 'youth', count: 600, mbtiPool: ['INFP', 'ENFP', 'ISFP', 'ESFP', 'INTP', 'ENTP', 'INFJ', 'ENFJ'], label: '年轻人' },
      { prefix: 'elder', count: 400, mbtiPool: ['ISFJ', 'ISTJ', 'ESFJ', 'ESTJ', 'INFJ', 'INTJ'], label: '老年人' },
      { prefix: 'biz', count: 200, mbtiPool: ALL_MBTI, label: '商户' },
    ],
    graph: {
      type: 'small_world',
      k: 25,  // 社区连接更密
      rewireProb: 0.08,
      dunbarLevels: { closeFriend: 5, friend: 10, acquaintance: 15 },
    },
  },

  // ─── 场景 4：极端人格对比（小规模，高分辨率）───
  {
    id: 'personality_100',
    name: '极端人格对比 (100 agents, 15天)',
    numAgents: 100,
    durationDays: 15,
    sampleIntervalTicks: 4,  // 每 20 分钟采样（高分辨率）
    groups: [
      { prefix: 'highN', count: 25, mbtiPool: ['INFP', 'INFJ', 'ISFP', 'ENFP'], label: '高神经质组', oceanOverride: { neuroticism: [0.8, 0.99] } },
      { prefix: 'lowN', count: 25, mbtiPool: ['ISTJ', 'ESTJ', 'INTJ', 'ENTJ'], label: '低神经质组', oceanOverride: { neuroticism: [0.05, 0.25] } },
      { prefix: 'highE', count: 25, mbtiPool: ['ENFP', 'ENTP', 'ESFP', 'ESTP'], label: '高外向组', oceanOverride: { extraversion: [0.8, 0.99] } },
      { prefix: 'lowE', count: 25, mbtiPool: ['INFP', 'INTP', 'ISFP', 'ISTP'], label: '低外向组', oceanOverride: { extraversion: [0.05, 0.25] } },
    ],
    graph: {
      type: 'small_world',
      k: 15,
      rewireProb: 0.20, // 更多跨组连接以观察传染差异
      dunbarLevels: { closeFriend: 5, friend: 10, acquaintance: 15 },
    },
  },
];

// ═══════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════

module.exports = {
  MBTI_TO_OCEAN,
  ALL_MBTI,
  SCENARIOS,
  oceanToBehavior,
};
