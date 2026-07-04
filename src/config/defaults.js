/**
 * Andy Engine - 全局默认配置
 *
 * 所有可调参数集中管理，方便调优
 */

const ANDY_DEFAULTS = {
  // ═══════════════════════════════════════════
  // 时间系统
  // ═══════════════════════════════════════════
  tick: {
    intervalMinutes: 5,        // 每 tick 推进的模拟时间（分钟）
    maxTicksPerRun: 288,       // 单次运行最多 tick 数（24h @ 5min）
  },

  // ═══════════════════════════════════════════
  // 情绪系统
  // ═══════════════════════════════════════════
  emotion: {
    dimensions: 30,            // 情绪维度数量
    decayLambda: 1.0,          // 指数衰减速率（每小时，适中衰减平衡事件效果）
    inertia: 0.5,              // 情绪惯性（0-1，越高越难改变）
    maxDeltaPerTick: 0.10,     // 单步最大变化量（防止情绪震荡，同时允许事件有合理影响）
    noiseAmplitude: 0.015,     // 1/f 粉噪声漂移幅度
    coActivationWeight: 0.3,   // 情绪间共激活传播权重
    baselineDriftRate: 0.0001, // 基线漂移速率（每次tick，非常小）
    // 昼夜节律参数
    circadian: {
      positiveAffectPeak: 14,  // 正面情绪峰值时间（小时）
      positiveAffectAmp: 0.15, // 正面情绪振幅
      negativeAffectPeak: 4,   // 负面情绪峰值时间
      negativeAffectAmp: 0.10, // 负面情绪振幅
    },
  },

  // ═══════════════════════════════════════════
  // 记忆系统
  // ═══════════════════════════════════════════
  memory: {
    maxMemories: 500,          // 每个 Agent 最大记忆条数
    maxPresentationsPerMemory: 50, // R7: cap presentations array to prevent unbounded growth
    decayRate: 0.5,            // ACT-R 衰减指数 d
    retrievalThreshold: -1.5,  // 检索阈值 tau
    retrievalNoise: 0.3,       // 检索噪声 s
    spreadingActivation: {
      W: 1.0,                  // 注意力权重
      S: 1.5,                  // 关联强度基准
    },
    importanceBoostOnAccess: 0.05, // 被回忆时的重要性提升
    consolidationThreshold: 0.7,  // 合并相似记忆的阈值
    pruneThreshold: 0.01,     // 删除阈值（重要性低于此值的记忆）
    // 情绪一致性检索（Mood-congruent recall, Bower 1981）
    // 杏仁核通路权重：情绪一致性在总激活度中的权重
    moodCongruenceWeight: 0.8,
    // 情绪一致性归一化标量
    moodCongruenceScale: 0.5,
    // 记忆回溯情绪反馈（回忆→情绪反向通路）
    // 检索出的记忆根据情绪标签直接产生情绪增量
    recallEmotionDelta: {
      happy: { joy: 0.018, calm: 0.008, sadness: -0.006 },
      sad: { sadness: 0.015, loneliness: 0.010, joy: -0.008 },
      neutral: { calm: 0.003 },
      // 重要性缩放因子：重要性越高的记忆，情绪反馈越强
      importanceScale: 1.5,
      // 负性反刍增强：Agent 当前为负性情绪时，悲伤记忆的情绪反馈 × 此系数
      ruminationMultiplier: 1.8,
    },
  },

  // ═══════════════════════════════════════════
  // 状态机
  // ═══════════════════════════════════════════
  stateMachine: {
    // 状态持续时间（分钟）
    duration: {
      active: { min: 3, extra: 8 },    // 活跃状态（工作、任务等）
      quiet: { min: 8, extra: 15 },    // 安静状态（阅读、发呆等）
      lateNight: { min: 6, extra: 12 }, // 深夜状态
      default: { min: 5, extra: 10 },  // 默认
    },
    // 外部事件驱动转移的额外概率加成
    eventDrivenBoost: 0.3,
  },

  // ═══════════════════════════════════════════
  // 社交关系
  // ═══════════════════════════════════════════
  relationship: {
    initialStrength: 0.08,      // 初始关系强度（陌生人级别，需要多次互动才能进入 acquaintance）
    strengthIncrement: 0.012,   // 每次正面交互增量（对数收益递减，略降速）
    strengthDecrement: 0.03,   // 每次负面交互减量
    decayRate: 0.012,          // 关系衰减速率（每小时，~2.4 天半衰期，配合冷却机制）
    threshold: {
      stranger: 0.0,
      acquaintance: 0.15,
      friend: 0.4,
      closeFriend: 0.65,       // R5: 从0.85降至0.65，配合对数增长修复，30天内可达
    },
    maxStrongTies: 7,           // 强关系上限（邓巴数）
    maxMediumTies: 15,          // 中关系上限
  },

  // ═══════════════════════════════════════════
  // 情绪传染
  // ═══════════════════════════════════════════
  contagion: {
    baseSusceptibility: 0.4,    // 基础易感性
    baseExpressiveness: 0.2,    // 基础表达性
    interactionRadius: 1,       // 交互半径（区域单位，同一区域=1）
    negativityBias: 1.4,        // 负面情绪传染加成系数
    baseContagionRate: 0.3,     // 基础传染率
  },

  // ═══════════════════════════════════════════
  // 需求系统（Maslow 需求层级）
  // ═══════════════════════════════════════════
  needs: {
    // 衰减速率（每小时减少量，基线值，被人格调节）
    decayRate: {
      hunger: 0.08,      // ~12 小时从 1.0 降到 0
      energy: 0.10,      // R5: 从 0.06 提升到 0.10，~10 小时。配合休息恢复 0.15，净恢复 +0.05/h（慢恢复）
      social: 0.04,      // ~25 小时
      comfort: 0.03,     // ~33 小时
      stimulation: 0.05, // ~20 小时
    },
    // 活动恢复速率（每小时恢复量）
    recoveryRate: {
      hunger: 0.5,       // 吃一顿饭 ~1 小时恢复满
      energy: 0.15,      // 睡一觉 ~6 小时恢复满
      social: 0.3,       // 一次社交 ~2 小时满足
      comfort: 0.2,      // 回家休息 ~3 小时
      stimulation: 0.25, // 看剧/娱乐 ~2.5 小时
    },
    // 需求匮乏阈值（低于此值产生驱力）
    threshold: {
      hunger: 0.3,
      energy: 0.25,
      social: 0.2,
      comfort: 0.2,
      stimulation: 0.15,
    },
  },

  // ═══════════════════════════════════════════
  // 自发动机系统（Intrinsic Motivation）
  // ═══════════════════════════════════════════
  intrinsicMotivation: {
    curiosityDecayRate: 0.03,      // 好奇心衰减速率（每小时，比 Maslow 需求慢）
    curiosityThreshold: 0.25,      // 好奇心阈值（高于此值产生探索驱力）
    needGateThreshold: 0.5,        // 需求门控阈值（需求饱和度低于此值时抑制好奇心）
    forgettingHours: 24,           // 区域遗忘时间常数（小时，Ebbinghaus 1885）
    goalGenerationInterval: 6,     // 目标生成检查间隔（ticks，~30 分钟）
    maxActiveGoals: 2,             // 最大同时活跃目标数
    goalDeadlineHours: 12,         // 目标截止时间（小时）
	    curiositySatisfyOnNovelty: 0.1,// 新奇体验满足好奇心的量
  },

  // ═══════════════════════════════════════════
  // 心智游移（Mind Wandering / DMN）
  // ═══════════════════════════════════════════
  mindWander: {
    // 空闲状态下心智游移概率
    quietProbability: 0.25,
    // 各思绪类型对情绪的影响量
    effects: {
      // 回忆型思绪（取决于记忆情绪标签，见 memory.recallEmotionDelta）
      recall: {},   // 实际效果由 recallEmotionDelta 驱动
      // 反刍型思绪（负性记忆 + 负性情绪状态）
      rumination: {
        sadness: 0.018,
        nervousness: 0.012,
        frustration: 0.008,
      },
      // 担忧型思绪（高压力状态）
      worry: {
        nervousness: 0.020,
        frustration: 0.012,
      },
      // 怀念型思绪（正面记忆）
      nostalgia: {
        joy: 0.018,
        calm: 0.008,
      },
      // 白日梦/展望型思绪（正性情绪 + 低压力时）
      daydream: {
        hope: 0.012,
        interest: 0.008,
        calm: 0.005,
      },
    },
  },

  // ═══════════════════════════════════════════
  // 事件系统
  // ═══════════════════════════════════════════
  events: {
    maxEventLogSize: 10000,     // 事件日志最大条数
    randomEventProbability: 0.08, // 每 tick 随机事件概率
    causalChainMaxLength: 5,    // 因果链最大长度
    eventLifespan: 7 * 24 * 60, // 事件保质期（分钟，7天）
  },

  // ═══════════════════════════════════════════
  // 天气系统
  // ═══════════════════════════════════════════
  // R41: extracted from hardcoded AndyWorld._maybeChangeWeather().
  // Each season maps weather values to their transition probability.
  // The transition is triggered at 40% probability per weather-check tick.
  weather: {
    transitionProb: 0.4, // probability a weather change is attempted
    seasonProbabilities: {
      spring: { sunny: 0.4, rain: 0.35, cold: 0.1, hot: 0.15 },
      summer: { sunny: 0.5, rain: 0.15, cold: 0.0, hot: 0.35 },
      autumn: { sunny: 0.3, rain: 0.3, cold: 0.25, hot: 0.15 },
      winter: { sunny: 0.2, rain: 0.15, cold: 0.55, hot: 0.1 },
    },
  },

  // ═══════════════════════════════════════════
  // 空间系统默认参数
  // 区域、邻接和坐标属于 domain preset，不属于全局 defaults。
  // ═══════════════════════════════════════════
  spatial: {
    // 连续坐标模式配置
    continuous: {
      worldWidth: 500,
      worldHeight: 500,
      cellSize: 25,
      // 三层交互半径（Hall 亲近距离学 + 社会力模型 + 行业标准）
      interactionRadii: [3, 10, 25],
      interactionTierNames: ['conversation', 'awareness', 'presence'],
      interactionRadius: 25,
      maxInteractionsPerTick: 5,
	      tierProbabilities: [0.8, 0.3, 0.0],
	      tierRelationDeltas: [0.05, 0.01, 0.0],
    },
  },

  // ═══════════════════════════════════════════
  // Action Selection (shadow mode)
  // ═══════════════════════════════════════════
  actionSelection: {
    enabled: false,
    mode: 'shadow',
    temperature: 0.35,
    recordTraces: true,
    maxTraceHistory: 100,
  },

  // ═══════════════════════════════════════════
  // 事件后果规则（domain-configurable）
  // ═══════════════════════════════════════════
  eventConsequenceRules: {
    eventMeaningRules: [
      { keywords: ['rest', 'sleep', 'nap', 'relax'], meaningType: 'rest', weight: 0.3 },
      { keywords: ['work', 'study', 'research', 'focus', 'task'], meaningType: 'work', weight: 0.3 },
      { keywords: ['chat', 'social', 'gathering', 'date', 'conversation'], meaningType: 'social', weight: 0.3 },
      { keywords: ['exercise', 'run', 'workout', 'fitness'], meaningType: 'exercise', weight: 0.2 },
      { keywords: ['eat', 'lunch', 'dinner', 'breakfast', 'meal', 'food'], meaningType: 'dining', weight: 0.2 },
      // Chinese equivalents (bridge fallback for domains without eventConsequenceRules)
      { keywords: ['休息', '睡觉', '午休', '睡眠', '放松'], meaningType: 'rest', weight: 0.3 },
      { keywords: ['工作', '学习', '研究', '专注', '任务'], meaningType: 'work', weight: 0.3 },
      { keywords: ['聊天', '社交', '聚会', '约会', '闲聊', '交流'], meaningType: 'social', weight: 0.3 },
      { keywords: ['运动', '跑步', '健身', '锻炼'], meaningType: 'exercise', weight: 0.2 },
      { keywords: ['吃饭', '午餐', '晚餐', '早餐', '餐饮', '美食'], meaningType: 'dining', weight: 0.2 },
    ],
    emotionKeywords: {
      happy: ['happy', 'glad', 'joyful', 'pleased', 'excited', 'delighted',
              '开心', '高兴', '快乐', '愉快', '兴奋', '喜悦'],
      sad: ['sad', 'sorrowful', 'gloomy', 'dejected', 'down',
            '难过', '伤心', '悲伤', '沮丧', '失落'],
      angry: ['angry', 'furious', 'irritated', 'annoyed',
              '生气', '愤怒', '恼火', '烦躁'],
      fear: ['afraid', 'scared', 'nervous', 'anxious', 'worried',
             '害怕', '恐惧', '紧张', '焦虑', '担忧'],
      surprise: ['surprised', 'astonished', 'shocked',
                 '惊讶', '意外', '震惊'],
      disgust: ['disgusted', 'nauseated', 'repulsed',
                '厌恶', '恶心', '反感'],
    },
    tendencyRules: [
      { keywords: ['rest', 'sleep', 'nap'], delta: [-0.3, -0.2, 0, 0] },
      { keywords: ['work', 'study', 'research'], delta: [0.3, 0, 0.4, 0] },
      { keywords: ['chat', 'social', 'gathering'], delta: [0, 0.4, 0, 0.3] },
      { keywords: ['exercise', 'run', 'workout'], delta: [0.4, 0, 0, 0.2] },
      { keywords: ['eat', 'lunch', 'dinner'], delta: [0.1, 0.2, 0, 0] },
      // Chinese equivalents
      { keywords: ['休息', '睡觉', '午休'], delta: [-0.3, -0.2, 0, 0] },
      { keywords: ['工作', '学习', '研究'], delta: [0.3, 0, 0.4, 0] },
      { keywords: ['聊天', '社交', '聚会'], delta: [0, 0.4, 0, 0.3] },
      { keywords: ['运动', '跑步', '健身'], delta: [0.4, 0, 0, 0.2] },
      { keywords: ['吃饭', '午餐', '晚餐'], delta: [0.1, 0.2, 0, 0] },
    ],
  },
};

// ═══════════════════════════════════════════
// 情绪维度定义
// ═══════════════════════════════════════════
const EMOTION_DIMENSIONS = [
  // Ekman 基础 6
  'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
  // Keltner 扩展
  'amusement', 'awe', 'contentment', 'desire', 'embarrassment',
  'guilt', 'horror', 'interest', 'love', 'nervousness',
  'pride', 'relief', 'satisfaction', 'shame', 'sympathy', 'triumph',
  // 补充
  'boredom', 'calm', 'confusion', 'excitement', 'frustration',
  'gratitude', 'hope', 'loneliness',
];

// ═══════════════════════════════════════════
// 情绪共激活矩阵
// ═══════════════════════════════════════════
const CO_ACTIVATION = {
  joy:          ['contentment', 'satisfaction', 'excitement', 'pride', 'love'],
  sadness:      ['loneliness', 'frustration', 'guilt', 'shame'],
  anger:        ['frustration', 'disgust', 'nervousness'],
  fear:         ['nervousness', 'horror', 'confusion'],
  surprise:     ['confusion', 'interest', 'excitement'],
  contentment:  ['joy', 'calm', 'satisfaction'],
  loneliness:   ['sadness', 'boredom', 'hope'],
  boredom:      ['frustration', 'loneliness', 'calm'],
  excitement:   ['joy', 'interest', 'hope'],
  nervousness:  ['fear', 'confusion'],
  calm:         ['contentment', 'satisfaction'],
  interest:     ['excitement', 'hope'],
  frustration:  ['anger', 'sadness', 'boredom'],
  hope:         ['interest', 'excitement', 'joy'],
  gratitude:    ['joy', 'contentment', 'love'],
  // 补充缺失的情绪传播路径（心理学文献支持的共激活关系）
  love:         ['joy', 'contentment', 'gratitude', 'sympathy'],
  pride:        ['joy', 'satisfaction', 'excitement'],
  disgust:      ['anger', 'frustration'],
  shame:        ['sadness', 'embarrassment', 'guilt'],
  guilt:        ['sadness', 'shame', 'nervousness'],
  horror:       ['fear', 'disgust', 'nervousness'],
  embarrassment:['shame', 'nervousness'],
  awe:          ['interest', 'calm', 'excitement'],
  desire:       ['excitement', 'interest'],
  sympathy:     ['sadness', 'love', 'gratitude'],
  triumph:      ['joy', 'pride', 'excitement'],
  confusion:    ['nervousness', 'frustration'],
  relief:       ['calm', 'contentment'],
  amusement:    ['joy', 'excitement'],
};

// ═══════════════════════════════════════════
// 情绪对立关系
// ═══════════════════════════════════════════
const EMOTION_OPPOSITES = {
  joy: 'sadness',
  sadness: 'joy',
  anger: 'calm',
  calm: 'anger',
  fear: 'triumph',
  triumph: 'fear',
  interest: 'boredom',
  boredom: 'interest',
  loneliness: 'contentment',
  contentment: 'loneliness',
  hope: 'frustration',
  frustration: 'hope',
  nervousness: 'relief',
  relief: 'nervousness',
  // R32 fix: excitement's opposite was boredom (asymmetric: boredom→interest).
  // Psychologically, excitement opposes calm (high-arousal positive vs
  // low-arousal neutral). This creates symmetric pairs:
  //   excitement ↔ calm, anger ↔ calm (shared opposite is valid —
  //   both anger and excitement are high-arousal, calm is low-arousal).
  excitement: 'calm',
};

// ═══════════════════════════════════════════
// Big Five → 行为参数映射
// ═══════════════════════════════════════════
function personalityToBehavior(ocean) {
  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = ocean;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return {
    emotionalInertia:      clamp(0.3 + 0.4 * neuroticism),
    emotionDecayRate:      clamp(0.5 - 0.3 * neuroticism),
    susceptibility:        clamp(0.3 + 0.4 * agreeableness + 0.2 * extraversion),
    expressiveness:        clamp(0.2 + 0.6 * extraversion),
    moodUpdateRate:        clamp(0.1 + 0.2 * openness),
    socialInitiative:      clamp(0.2 + 0.5 * extraversion - 0.2 * neuroticism),
    riskTolerance:         clamp(0.3 + 0.4 * openness + 0.2 * extraversion - 0.2 * neuroticism),
    socialEnergyDrain:     clamp(0.5 - 0.3 * extraversion + 0.2 * neuroticism),
    socialEnergyRecharge:  clamp(0.3 + 0.4 * extraversion),
    // 自发动机参数
    noveltySeeking:        clamp(0.3 + 0.5 * openness - 0.1 * neuroticism),    // 新奇寻求（开放性主导）
    competenceMotivation:  clamp(0.2 + 0.5 * conscientiousness + 0.2 * openness), // 胜任感动机（尽责性主导）
    explorationDrive:      clamp(0.2 + 0.4 * openness + 0.3 * extraversion - 0.2 * neuroticism), // 探索驱动
  };
}

// ═══════════════════════════════════════════
// 语义事件分类（Semantic Event Hierarchy）
// ═══════════════════════════════════════════
// 基于事件内容和类型的多级分类系统
// 参考：认知心理学中的事件分类 (Rosch 1975, Mandler 1984)
const SEMANTIC_EVENT_CATEGORIES = {
  // 事件类型 → 语义分类映射
  typeMap: {
    social: 'social_interaction',
    weather: 'environment_weather',
    state_change: 'behavior_change',
    regulation: 'emotion_regulation',
    mind_wander: 'inner_thoughts',
    need_satisfied: 'need_satisfaction',
    intrinsic: 'self_exploration',
    gossip: 'social_information',
    encounter: 'social_interaction',
    general: 'daily_matters',
    deviant: 'deviation_from_norm',
    illness: 'physical_discomfort',
  },
  // 内容关键词 → 语义分类映射
  keywordMap: {
    'emotion_event': ['happy', 'sad', 'angry', 'afraid', 'surprised', 'moved', 'wronged', 'anxious', 'excited', 'down', 'empty', 'bitter', 'lonely', 'sorrowful', 'joyful', 'glad'],
    'learning_growth': ['interesting_book', 'interesting_topic', 'found', 'discovered', 'new_discovery', 'learning', 'learned'],
    'social_interaction': ['chat', 'friend', 'share', 'encourage', 'together', 'meet', 'greet', 'talk', 'mention', 'couple', 'argue'],
    'environment_weather': ['rain', 'weather', 'sunshine', 'cold', 'hot', 'sunny', 'wet', 'rain_sound'],
    'food_enjoyment': ['delicious', 'new_dish', 'eat', 'coffee', 'snack', 'taste', 'midnight_snack'],
    'work_labor': ['part_time', 'work', 'office', 'off_work', 'meeting'],
    'leisure_entertainment': ['watch_show', 'movie', 'game', 'music', 'song', 'tv', 'sing'],
    'nature_scenery': ['flower', 'scenery', 'sunrise', 'sunset', 'sky', 'moon', 'stars', 'fresh', 'park'],
    'daily_chores': ['phone', 'charge', 'wifi', 'task', 'push', 'battery'],
    'physical_feeling': ['sleepy', 'tired', 'itchy', 'mosquito', 'puddle', 'sunburn'],
    'inner_reflection': ['remember', 'recall', 'childhood', 'thoughts', 'daydream', 'past'],
    'late_night': ['midnight', 'dawn', 'night'],
    'embarrassment': ['embarrassed', 'ashamed', 'blushing'],
    'physical_discomfort': ['unwell', 'headache', 'cold', 'fever', 'sick', 'weak', 'take_break', 'rest'],
    'deviation_from_norm': ['skip_work', 'dont_want_work', 'wander', 'procrastinate', 'stay_up_late'],
  },
  // 状态类别 → 语义分类映射
  stateCategoryMap: {
    active: 'study_work',
    social: 'social_interaction',
    quiet: 'quiet_rest',
    rest: 'quiet_rest',
    leisure: 'leisure_entertainment',
    home: 'home_life',
    lateNight: 'late_night',
    transit: 'daily_commute',
    morning: 'daily_life',
    break: 'break_time',
    sleep: 'sleep_rest',
    deviant: 'deviation_from_norm',
    illness: 'physical_discomfort',
  },
};

/**
 * Default domain identifier.
 * Single source of truth — all src/ modules must read this instead of
 * hardcoding 'campus'.  The value matches the campus preset's domain.id
 * (presets/campus/index.js).
 */
const DEFAULT_DOMAIN_ID = 'campus';

module.exports = {
  ANDY_DEFAULTS,
  DEFAULT_DOMAIN_ID,
  EMOTION_DIMENSIONS,
  CO_ACTIVATION,
  EMOTION_OPPOSITES,
  personalityToBehavior,
  SEMANTIC_EVENT_CATEGORIES,
};
