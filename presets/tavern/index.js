/**
 * Tavern Domain — 中世纪酒馆世界观
 *
 * 用于验证 Andy Engine 的 domain-agnostic 架构。
 * 5 个区域、8 个状态，完全不包含校园内容。
 */

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

const tavernDomain = {
  id: 'tavern',
  name: '中世纪酒馆世界观',
  version: '1.0.0',

  // ═══════════════════════════════════════════
  // 空间系统
  // ═══════════════════════════════════════════
  regions: ['小屋', '广场', '酒馆', '铁匠铺', '森林'],

  adjacency: [
    ['小屋', '广场', 1],
    ['广场', '酒馆', 1],
    ['广场', '铁匠铺', 1],
    ['广场', '森林', 1],
    ['酒馆', '铁匠铺', 1],
  ],

  regionCoords: {
    '小屋':     { shape: 'rect', x: 50,  y: 50,  w: 60, h: 40 },
    '广场':     { shape: 'circle', cx: 200, cy: 150, radius: 50 },
    '酒馆':     { shape: 'rect', x: 300, y: 100, w: 80, h: 60 },
    '铁匠铺':   { shape: 'rect', x: 300, y: 250, w: 60, h: 40 },
    '森林':     { shape: 'circle', cx: 100, cy: 300, radius: 70 },
  },

  placeTypes: {
    food: ['酒馆'],
    rest: ['小屋'],
    social: ['酒馆', '广场'],
    work: ['铁匠铺'],
    sleep: ['小屋'],
    explore: ['森林'],
    outdoor: ['广场', '森林'],
  },

  placeMapping: {
    hunger: ['酒馆'],
    energy: ['小屋'],
    social: ['酒馆', '广场'],
    comfort: ['小屋'],
    stimulation: ['森林', '酒馆'],
    defaultRegion: '小屋',
    defaultState: '休息',
  },

  // ═══════════════════════════════════════════
  // 状态定义
  // ═══════════════════════════════════════════
  states: {
    '睡觉':   { next: ['醒来', '翻身'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8], category: 'sleep' },
    '翻身':   { next: ['睡觉', '醒来'], hours: [0, 1, 2, 3, 4, 5, 6], category: 'sleep' },
    '醒来':   { next: ['闲逛', '喝酒', '工作'], hours: [6, 7, 8, 9], category: 'morning' },
    '闲逛':   { next: ['喝酒', '聊天', '工作', '休息'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], category: 'social' },
    '喝酒':   { next: ['聊天', '闲逛', '休息', '睡觉'], hours: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'social' },
    '聊天':   { next: ['喝酒', '闲逛', '休息'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], category: 'social' },
    '工作':   { next: ['休息', '闲逛', '喝酒'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], category: 'active' },
    '休息':   { next: ['闲逛', '喝酒', '睡觉'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'rest' },
  },

  // ═══════════════════════════════════════════
  // 行为场状态中心点
  // ═══════════════════════════════════════════
  stateCenters: {
    '睡觉': [0.00, 0.00, 0.00, 0.00],
    '翻身': [0.05, 0.00, 0.00, 0.00],
    '醒来': [0.15, 0.05, 0.10, 0.08],
    '闲逛': [0.40, 0.60, 0.15, 0.50],
    '喝酒': [0.30, 0.80, 0.20, 0.70],
    '聊天': [0.25, 0.85, 0.30, 0.80],
    '工作': [0.70, 0.15, 0.75, 0.20],
    '休息': [0.10, 0.10, 0.10, 0.10],
  },

  // ═══════════════════════════════════════════
  // 标签时间惩罚
  // ═══════════════════════════════════════════
  labelTimePenalties: {
    '工作': { hours: [8,9,10,11,12,13,14,15,16,17], penalty: 0.4 },
    '喝酒': { hours: [10,11,12,13,14,15,16,17,18,19,20,21,22,23], penalty: 0.3 },
    '睡觉': { hours: [0,1,2,3,4,5,6,7,8,22,23], penalty: 0.5 },
  },

  // ═══════════════════════════════════════════
  // 需求满足映射
  // ═══════════════════════════════════════════
  needSatisfactionMap: {
    hunger: {
      states: ['喝酒'],
      regions: ['酒馆'],
    },
    energy: {
      states: ['睡觉', '休息'],
      regions: [],
    },
    social: {
      states: ['喝酒', '聊天'],
      regions: ['酒馆', '广场'],
    },
    comfort: {
      states: ['休息', '睡觉'],
      regions: ['小屋'],
    },
    stimulation: {
      states: ['闲逛', '喝酒'],
      regions: ['森林', '酒馆'],
    },
  },

  needDriveStates: {
    hunger: ['喝酒'],
    energy: ['休息', '睡觉'],
    social: ['喝酒', '聊天'],
    comfort: ['休息', '睡觉'],
    stimulation: ['闲逛', '喝酒'],
  },

  // ═══════════════════════════════════════════
  // 事件模板
  // ═══════════════════════════════════════════
  eventTemplates: {
    genericEvents: [
      { content: '路上捡到了一枚铜币', delta: { joy: 0.03, interest: 0.02 } },
      { content: '看到一只乌鸦飞过', delta: { calm: 0.02, interest: 0.02 } },
      { content: '闻到了面包的香味', delta: { joy: 0.03, contentment: 0.02 } },
      { content: '有人在远处吹笛子', delta: { calm: 0.03, interest: 0.02 } },
      { content: '突然想起家乡的事', delta: { sadness: 0.03, loneliness: 0.02 } },
    ],
    timeEvents: {
      lateNight: [
        { content: '深夜的酒馆格外安静', delta: { calm: 0.03, loneliness: 0.02 } },
        { content: '月光洒在广场上', delta: { calm: 0.04, awe: 0.02 } },
      ],
      morning: [
        { content: '公鸡打鸣了', delta: { calm: 0.02 } },
        { content: '清晨的露水很美', delta: { calm: 0.03, awe: 0.02 } },
      ],
      evening: [
        { content: '夕阳染红了天空', delta: { calm: 0.04, awe: 0.03 } },
        { content: '酒馆里开始热闹起来', delta: { interest: 0.03, excitement: 0.02 } },
      ],
    },
    weatherEvents: {
      rain: [
        { content: '下雨了，酒馆里更热闹了', delta: { calm: 0.02, interest: 0.02 } },
        { content: '雨水顺着屋檐流下', delta: { calm: 0.03 } },
      ],
      sunny: [
        { content: '阳光照在广场上', delta: { joy: 0.03, calm: 0.02 } },
        { content: '太阳太晒了，找个阴凉处歇歇', delta: { frustration: 0.02 } },
      ],
    },
    regionEvents: {
      '酒馆': [
        { content: '酒馆里来了个吟游诗人，唱得很好听', delta: { joy: 0.05, calm: 0.03 } },
        { content: '有人喝醉了在闹事', delta: { frustration: 0.04, anger: 0.02 } },
        { content: '今天的麦酒特别好喝', delta: { satisfaction: 0.04, joy: 0.03 } },
      ],
      '广场': [
        { content: '广场上有人在表演杂耍', delta: { interest: 0.04, amusement: 0.03 } },
        { content: '市场很热闹，人来人往', delta: { calm: 0.02, interest: 0.02 } },
      ],
      '森林': [
        { content: '在森林里发现了一只小鹿', delta: { calm: 0.04, awe: 0.03 } },
        { content: '森林里突然起了雾', delta: { nervousness: 0.03, surprise: 0.02 } },
      ],
      '铁匠铺': [
        { content: '打造出了一把好剑', delta: { pride: 0.05, satisfaction: 0.04 } },
        { content: '铁匠铺很热，汗流浃背', delta: { frustration: 0.02 } },
      ],
      '小屋': [
        { content: '小屋里很温暖，壁炉在燃烧', delta: { calm: 0.04, contentment: 0.03 } },
        { content: '屋顶漏水了', delta: { frustration: 0.04, anger: 0.02 } },
      ],
    },
  },

  // ═══════════════════════════════════════════
  // 记忆语义分类
  // ═══════════════════════════════════════════
  memoryTemplates: {
    semanticCategories: {
      typeMap: {
        social: '社交互动',
        weather: '环境天气',
        state_change: '行为转变',
        regulation: '情绪调节',
        mind_wander: '内心思绪',
        need_satisfied: '需求满足',
        intrinsic: '自我探索',
        gossip: '社交信息',
        encounter: '社交互动',
        general: '日常琐事',
        deviant: '偏离常规',
        illness: '身体不适',
      },
      keywordMap: {
        '酒馆': ['喝酒', '麦酒', '吟游诗人', '酒馆', '干杯'],
        '社交互动': ['聊天', '朋友', '一起', '偶遇', '打招呼'],
        '环境天气': ['下雨', '天气', '阳光', '冷', '热'],
        '工作劳动': ['打铁', '工作', '锻造', '铁匠'],
        '自然风光': ['森林', '小鹿', '花', '风景', '月亮'],
        '身体感受': ['困', '累', '热', '冷'],
        '内心反思': ['想起', '回忆', '思绪', '发呆'],
      },
      stateCategoryMap: {
        active: '工作劳动',
        social: '社交互动',
        quiet: '安静休息',
        rest: '安静休息',
        leisure: '休闲娱乐',
        home: '居家生活',
        lateNight: '深夜时刻',
        transit: '日常通勤',
        morning: '日常生活',
        break: '休息时间',
        sleep: '睡眠休息',
        deviant: '偏离常规',
        illness: '身体不适',
      },
    },
  },

  // ═══════════════════════════════════════════
  // Appraisal 关键词
  // ═══════════════════════════════════════════
  appraisalConfig: {
    needKeywords: {
      hunger: ['吃', '饭', '面包', '肉', '酒馆'],
      energy: ['睡', '休息', '累', '困'],
      social: ['聊天', '朋友', '一起', '酒馆'],
      comfort: ['小屋', '温暖', '壁炉'],
      stimulation: ['森林', '冒险', '有趣'],
    },
    socialStates: ['聊天', '喝酒', '闲逛'],
    outdoorPositions: ['广场', '森林'],
    scheduledStates: ['工作'],
    normConformityKeywords: {
      positive: ['打招呼', '聊天', '帮助'],
      negative: ['冲突', '吵架'],
    },
  },

  // ═══════════════════════════════════════════
  // 跳过日程行为配置
  // ═══════════════════════════════════════════
  skipBehavior: {
    skipClass: {
      states: ['休息', '闲逛', '喝酒'],
      regions: ['小屋', '酒馆', '广场'],
      memories: [
        '今天不想干活，在小屋休息',
        '偷懒去了酒馆喝酒',
        '在广场闲逛，消磨时间',
      ],
    },
    skipWork: {
      states: ['休息', '闲逛', '喝酒'],
      regions: ['小屋', '酒馆'],
      memories: [
        '今天不想打铁，在小屋休息',
        '去酒馆喝了一天酒',
      ],
    },
  },

  // ═══════════════════════════════════════════
  // 需求区域配置
  // ═══════════════════════════════════════════
  needRegionConfig: {
    hunger: { any: '酒馆' },
    energy: { any: '小屋' },
    social: { any: '酒馆' },
    comfort: { any: '小屋' },
    stimulation: { any: '森林' },
  },

  // ═══════════════════════════════════════════
  // 自发动机配置
  // ═══════════════════════════════════════════
  intrinsicMotivationConfig: {
    domainRegionMap: {
      '铁匠铺工作': '铁匠铺',
      '森林探索': '森林',
      '酒馆社交': '酒馆',
    },
    explorationStates: ['闲逛', '喝酒', '休息'],
  },

  // ═══════════════════════════════════════════
  // 日程预设
  // ═══════════════════════════════════════════
  roleArchetypes: {
    blacksmith: {
      entries: [
        { startHour: 7, endHour: 8, region: '小屋', activity: '醒来', days: [0,1,2,3,4,5,6], probability: 0.9, noise: 15 },
        { startHour: 8, endHour: 12, region: '铁匠铺', activity: '工作', days: [0,1,2,3,4,5,6], probability: 0.85, noise: 10 },
        { startHour: 12, endHour: 13, region: '酒馆', activity: '喝酒', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 20 },
        { startHour: 13, endHour: 18, region: '铁匠铺', activity: '工作', days: [0,1,2,3,4,5,6], probability: 0.8, noise: 10 },
        { startHour: 18, endHour: 22, region: '酒馆', activity: '喝酒', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 30 },
      ],
    },
    drunkard: {
      entries: [
        { startHour: 10, endHour: 12, region: '酒馆', activity: '喝酒', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 60 },
        { startHour: 14, endHour: 22, region: '酒馆', activity: '喝酒', days: [0,1,2,3,4,5,6], probability: 0.8, noise: 30 },
      ],
    },
    wanderer: {
      entries: [
        { startHour: 8, endHour: 12, region: '森林', activity: '闲逛', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 60 },
        { startHour: 14, endHour: 18, region: '广场', activity: '闲逛', days: [0,1,2,3,4,5,6], probability: 0.5, noise: 60 },
        { startHour: 18, endHour: 22, region: '酒馆', activity: '喝酒', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 30 },
      ],
    },
  },

  // ═══════════════════════════════════════════
  // 叙事模板
  // ═══════════════════════════════════════════
  narrativeTemplates: {
    statePositionMap: {
      '睡觉': '在睡觉',
      '闲逛': '在闲逛',
      '喝酒': '在喝酒',
      '聊天': '在聊天',
      '工作': '在工作',
      '休息': '在休息',
    },
    observationAction: {
      genericTemplates: ['在附近注意到有人', '在附近注意到有人，没什么特别的'],
      stateMap: {
        '睡觉': '睡觉',
        '闲逛': '闲逛',
        '喝酒': '喝酒',
        '聊天': '聊天',
        '工作': '工作',
        '休息': '休息',
      },
      withRegionTemplate: '正在{region}里{state}',
      template: '正在{state}',
      fallbackWithRegionTemplate: '正在{region}里{state}',
      fallbackTemplate: '正在{state}',
    },
    thirdPartyKnowledge: {
      unknown: '我不知道{target}的情况。',
      observation: '我观察到{target}{action}。',
      location: '我观察到{target}在{location}。',
      event: '我知道{event}。',
    },
    regionMap: {
      '小屋': '在小屋里，壁炉温暖',
      '广场': '在广场上，人来人往',
      '酒馆': '在酒馆里，热闹喧嚣',
      '铁匠铺': '在铁匠铺，炉火熊熊',
      '森林': '在森林里，寂静幽深',
    },
  },

  // ═══════════════════════════════════════════
  // 时间规则
  // ═══════════════════════════════════════════
  timeRules: {
    periods: {
      lateNight: { start: 23, end: 5 },
      morning: { start: 5, end: 9 },
      forenoon: { start: 9, end: 12 },
      noon: { start: 12, end: 14 },
      afternoon: { start: 14, end: 18 },
      evening: { start: 18, end: 22 },
    },
    activeHours: { start: 8, end: 17 },
  },

  // ═══════════════════════════════════════════
  // Fallback
  // ═══════════════════════════════════════════
  fallback: {
    defaultRegion: '小屋',
    defaultState: '休息',
    unknownState: '闲逛',
    unknownRegion: '广场',
  },

  // ═══════════════════════════════════════════
  // 事件后果规则
  // ═══════════════════════════════════════════
  eventConsequenceRules: {
    eventMeaningRules: [
      { keywords: ['休息', '睡觉', '午休', '睡眠', '放松'], meaningType: 'rest', weight: 0.4 },
      { keywords: ['工作', '锻造', '修理', '专注', '任务'], meaningType: 'work', weight: 0.3 },
      { keywords: ['聊天', '社交', '聚会', '喝酒', '闲聊', '交流', '吟游'], meaningType: 'social', weight: 0.4 },
      { keywords: ['狩猎', '冒险', '探索', '巡林'], meaningType: 'explore', weight: 0.3 },
      { keywords: ['吃饭', '午餐', '晚餐', '烤肉', '美食'], meaningType: 'dining', weight: 0.2 },
    ],
    emotionKeywords: {
      happy: ['开心', '高兴', '快乐', '愉快', '兴奋', '喜悦'],
      sad: ['难过', '伤心', '悲伤', '沮丧', '失落'],
      angry: ['生气', '愤怒', '恼火', '烦躁'],
      fear: ['害怕', '恐惧', '紧张', '焦虑', '担忧'],
      surprise: ['惊讶', '意外', '震惊'],
      disgust: ['厌恶', '恶心', '反感'],
    },
    tendencyRules: [
      { keywords: ['休息', '睡觉', '午休'], delta: [-0.3, -0.2, 0, 0] },
      { keywords: ['锻造', '修理', '工作'], delta: [0.4, 0, 0.5, 0] },
      { keywords: ['聊天', '喝酒', '社交'], delta: [0, 0.5, 0, 0.4] },
      { keywords: ['狩猎', '冒险', '探索'], delta: [0.4, 0, 0.3, 0] },
      { keywords: ['吃饭', '烤肉'], delta: [0.1, 0.2, 0, 0] },
    ],
  },

  // ═══════════════════════════════════════════
  // 禁止词（校园词）
  // ═══════════════════════════════════════════
  actionCandidateMappings: {
    memorySemanticCategoryActionMap: {
      '休息': { type: 'rest', source: 'memory' },
      '社交': { type: 'socialize', source: 'memory' },
      '工作': { type: 'work', source: 'memory' },
      '探索': { type: 'explore', source: 'memory' },
      '进食': { type: 'consume', source: 'memory' },
      '睡觉': { type: 'rest', source: 'memory' },
    },
  },

  // ═══════════════════════════════════════════
  // 社交交互文本
  // ═══════════════════════════════════════════
  socialInteractions: {
    positive: [
      '一起喝了杯酒，聊得很开心',
      '分享了最近的冒险故事，哈哈大笑',
      '在酒馆遇到，一起坐了一会',
      '聊到了共同感兴趣的话题',
      '互相敬了杯酒，心情变好了',
    ],
    neutral: [
      '打了个招呼',
      '简单聊了几句',
      '点头致意',
      '擦肩而过，互相看了一眼',
    ],
    negative: [
      '感觉对方态度有些冷淡',
      '聊天中有些小摩擦',
      '对方似乎不太想被打扰',
      '话不投机，气氛有点尴尬',
      '因为小事起了点争执',
    ],
    withGoodFriendTemplate: (region) => `和好朋友一起在${region}，聊得很开心`,
    strangerNotice: '在附近注意到有人',
    strangerBrief: '在附近注意到有人，没什么特别的',
  },

  // ═══════════════════════════════════════════
  // 情绪调节关键词
  // ═══════════════════════════════════════════
  emotionRegulationConfig: {
    positiveMemoryKeywords: ['开心', '高兴', '满意', '有趣', '朋友', '成功'],
  },

  // ═══════════════════════════════════════════
  // 语义配置（中文语言资源）
  // ═══════════════════════════════════════════
  semanticProfile: {
    language: 'zh-CN',

    mindWander: {
      negativeKeywords: ['难过', '不开心', '孤独', '压力'],
      positiveKeywords: ['开心', '有趣', '朋友', '喜欢'],
      thoughtTypes: {
        recall: '回忆',
        rumination: '反刍',
        nostalgia: '怀念',
        worry: '担忧',
        daydream: '白日梦',
      },
      daydreamContents: [
        '想想要去哪里冒险呢',
        '今天的天气很适合出行',
        '希望这样的日子能多一些',
        '突然想到了一个新的锻造方法',
      ],
      timeLabels: {
        justNow: '刚刚',
        hoursAgo: (h) => `${h}小时前`,
        daysAgo: (d) => `${d}天前`,
        weeksAgo: (w) => `${w}周前`,
      },
    },

    narrativeModifiers: {
      emotionLabels: {
        sadness: '心情不太好', loneliness: '有点孤独', frustration: '有点烦',
        nervousness: '有点焦虑', boredom: '好无聊', anger: '有点烦躁',
        fear: '有点不安',
        joy: '心情还不错', contentment: '挺满足的', excitement: '有点兴奋',
        calm: '挺平静的', hope: '有点期待',
      },
      needPhrases: {
        veryTired: '好困', tired: '有点困', veryHungry: '好饿', hungry: '有点饿',
        restless: '但有点坐不住',
      },
      cognitivePhrases: {
        highStress: '压力好大',
        distracted: '心思不太集中',
        wantsSocial: '有点想找人聊天',
        thinking: '在想一些事',
        unwell: '身体不太舒服',
      },
    },

    behaviorModifiers: {
      distracted: '有点心不在焉',
      lonely: '想找人说话',
      lazy: '不太想动',
      verbMap: {},
    },

    emotionKeywords: {
      happy: ['开心', '高兴', '快乐', '愉快', '兴奋', '喜悦'],
      sad: ['难过', '伤心', '悲伤', '沮丧', '失落'],
      angry: ['生气', '愤怒', '恼火', '烦躁'],
      fear: ['害怕', '恐惧', '紧张', '焦虑', '担忧'],
      surprise: ['惊讶', '意外', '震惊'],
      disgust: ['厌恶', '恶心', '反感'],
    },

    emotionRegulationKeywords: {
      positiveMemory: ['开心', '高兴', '满意', '有趣', '朋友', '成功'],
    },

    eventDefaults: {
      defaultSemanticCategory: '日常琐事',
      gossipSuffix: '还提到了',
      gossipVerb: '说',
    },

    socialNormKeywords: {
      positive: ['打招呼', '聊天', '帮助'],
      negative: ['冲突', '吵架'],
    },

    defaultSemanticCategories: {
      typeMap: {
        social: '社交互动',
        weather: '环境天气',
        state_change: '行为转变',
        regulation: '情绪调节',
        mind_wander: '内心思绪',
        need_satisfied: '需求满足',
        intrinsic: '自我探索',
        gossip: '社交信息',
        encounter: '社交互动',
        general: '日常琐事',
        deviant: '偏离常规',
        illness: '身体不适',
      },
      keywordMap: {
        '酒馆': ['喝酒', '麦酒', '吟游诗人', '酒馆', '干杯'],
        '社交互动': ['聊天', '朋友', '一起', '偶遇', '打招呼'],
        '环境天气': ['下雨', '天气', '阳光', '冷', '热'],
        '工作劳动': ['打铁', '工作', '锻造', '铁匠'],
        '自然风光': ['森林', '小鹿', '花', '风景', '月亮'],
        '身体感受': ['困', '累', '热', '冷'],
        '内心反思': ['想起', '回忆', '思绪', '发呆'],
      },
      eventMeaningRules: [
        { keywords: ['休息', '睡觉', '午休', '睡眠', '放松'], meaningType: 'rest', weight: 0.4 },
        { keywords: ['工作', '锻造', '修理', '专注', '任务'], meaningType: 'work', weight: 0.3 },
        { keywords: ['聊天', '社交', '聚会', '喝酒', '闲聊', '交流', '吟游'], meaningType: 'social', weight: 0.4 },
        { keywords: ['狩猎', '冒险', '探索', '巡林'], meaningType: 'explore', weight: 0.3 },
        { keywords: ['吃饭', '午餐', '晚餐', '烤肉', '美食'], meaningType: 'dining', weight: 0.2 },
      ],
    },
  },

  forbiddenTerms: [
    '教室', '图书馆', '宿舍', '食堂', '操场', '校园广场',
    '学生', '老师', '上课', '自习', '翘课', '考试', '作业',
  ],

  // ═══════════════════════════════════════════
  // 地点意义系统
  // ═══════════════════════════════════════════
  locationMeaningTypes: {
    rest:    { B_delta: [-0.3, -0.2, -0.1, -0.2], description: '适合休息' },
    work:    { B_delta: [0.5, 0, 0.6, 0], description: '适合工作' },
    social:  { B_delta: [0, 0.5, 0, 0.4], description: '适合社交' },
    explore: { B_delta: [0.3, 0, 0.3, 0], description: '适合探索' },
  },
};

deepFreeze(tavernDomain);

module.exports = tavernDomain;
