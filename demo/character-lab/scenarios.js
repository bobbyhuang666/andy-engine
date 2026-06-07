/**
 * Scenario Routes
 *
 * 三个预设路线，每个路线 5-8 个事件。
 * 每个事件定义包含：
 *   - id: 事件标识
 *   - label: 用户可见的事件描述
 *   - description: 事件上下文说明
 *   - category: 引擎事件类型
 *   - emotionDelta: 情绪影响（30 维度中的关键维度）
 *   - relationshipImpact: 关系影响
 */

const SCENARIOS = {
  // ═══════════════════════════════════════════
  // Route A: 信任建立
  // ═══════════════════════════════════════════
  trust_building: {
    id: 'trust_building',
    name: '信任建立',
    description: '通过持续的支持和真诚，让角色逐渐敞开心扉。',
    color: '#4CAF50',
    events: [
      {
        id: 'check_in',
        label: '在她难过的一天后来关心她',
        description: 'Maya 刚加完班回到家，看起来很疲惫。你主动发消息问她今天怎么样。',
        category: 'positive_social',
        emotionDelta: {
          joy: 0.3, gratitude: 0.5, calm: 0.3, hope: 0.2, love: 0.15,
        },
        relationshipImpact: { trust: 8, closeness: 5 },
      },
      {
        id: 'remember_detail',
        label: '记得她提过的一个小细节',
        description: '你记得 Maya 上周说过想喝某家的拿铁，顺路给她带了一杯。',
        category: 'positive_social',
        emotionDelta: {
          joy: 0.35, gratitude: 0.55, love: 0.25, surprise: 0.3, contentment: 0.2,
        },
        relationshipImpact: { trust: 10, closeness: 8 },
      },
      {
        id: 'encourage',
        label: '在她紧张之前鼓励她',
        description: 'Maya 明天要做一个重要的报告。你在她焦虑的时候鼓励了她。',
        category: 'positive_social',
        emotionDelta: {
          hope: 0.45, calm: 0.3, gratitude: 0.4, courage: 0.2, nervousness: -0.2,
        },
        relationshipImpact: { trust: 7, closeness: 4 },
      },
      {
        id: 'task_success',
        label: '她完成了报告',
        description: 'Maya 的报告得到了认可。虽然过程很紧张，但结果很好。',
        category: 'achievement',
        emotionDelta: {
          joy: 0.5, pride: 0.4, relief: 0.45, satisfaction: 0.4, excitement: 0.2,
        },
        relationshipImpact: { trust: 3, closeness: 2 },
      },
      {
        id: 'celebrate',
        label: '一起庆祝她的成果',
        description: '你主动为 Maya 的成功感到高兴，和她一起庆祝。',
        category: 'positive_social',
        emotionDelta: {
          joy: 0.4, love: 0.35, gratitude: 0.4, contentment: 0.3, hope: 0.2,
        },
        relationshipImpact: { trust: 8, closeness: 10 },
      },
      {
        id: 'show_up_on_time',
        label: '准时出现在约好的地方',
        description: '你们约好周末见面。你提前 5 分钟到了，还带了她喜欢的花。',
        category: 'positive_social',
        emotionDelta: {
          joy: 0.35, calm: 0.3, gratitude: 0.45, love: 0.3, trust: 0.2,
        },
        relationshipImpact: { trust: 12, closeness: 8 },
      },
      {
        id: 'late_arrival',
        label: '有一次迟到了 30 分钟',
        description: '因为交通问题，你比约定时间晚了 30 分钟才到。（观察在信任建立后，她如何回应。）',
        category: 'relationship',
        emotionDelta: {
          nervousness: 0.2, frustration: 0.15, sadness: 0.1,
          hope: 0.15, calm: 0.1,
        },
        relationshipImpact: { trust: -3, closeness: -1 },
      },
    ],
  },

  // ═══════════════════════════════════════════
  // Route B: 压力崩溃
  // ═══════════════════════════════════════════
  stress_breakdown: {
    id: 'stress_breakdown',
    name: '压力崩溃',
    description: '反复的负面事件让角色变得防备、疲惫、不再信任。',
    color: '#F44336',
    events: [
      {
        id: 'cancel_plan',
        label: '临时取消了和她的约定',
        description: '你们本来约好一起吃晚饭。你在最后一刻说有事来不了了。',
        category: 'negative_social',
        emotionDelta: {
          sadness: 0.4, frustration: 0.5, anger: 0.2, loneliness: 0.35,
        },
        relationshipImpact: { trust: -10, closeness: -5 },
      },
      {
        id: 'ignore_message',
        label: '忽略了她发来的一条脆弱消息',
        description: 'Maya 鼓起勇气发了一条很私人的消息，但你没有回复。',
        category: 'negative_social',
        emotionDelta: {
          sadness: 0.5, loneliness: 0.45, shame: 0.3, frustration: 0.35, anger: 0.15,
        },
        relationshipImpact: { trust: -12, closeness: -8 },
      },
      {
        id: 'criticize',
        label: '在她失败后批评了她',
        description: 'Maya 的报告没做好。你指出了她的问题，但语气有点严厉。',
        category: 'negative_social',
        emotionDelta: {
          sadness: 0.45, shame: 0.4, anger: 0.25, frustration: 0.3, fear: 0.2,
        },
        relationshipImpact: { trust: -10, closeness: -6 },
      },
      {
        id: 'lose_sleep',
        label: '她失眠了',
        description: 'Maya 整晚没睡好。工作压力和关系上的不安让她无法放松。',
        category: 'health',
        emotionDelta: {
          sadness: 0.3, frustration: 0.35, nervousness: 0.3, boredom: 0.15,
          loneliness: 0.25,
        },
        relationshipImpact: { trust: -2, closeness: -2 },
      },
      {
        id: 'make_demand',
        label: '又向她提了一个要求',
        description: '你在她已经很累的时候，让她帮你完成另一件事。',
        category: 'negative_social',
        emotionDelta: {
          anger: 0.4, frustration: 0.5, sadness: 0.3, exhaustion: 0.2,
        },
        relationshipImpact: { trust: -8, closeness: -4 },
      },
      {
        id: 'late_arrival_again',
        label: '又一次迟到',
        description: '你又迟到了。这次是 40 分钟。Maya 独自等了很久。',
        category: 'negative_social',
        emotionDelta: {
          sadness: 0.5, frustration: 0.45, loneliness: 0.4, anger: 0.3,
          hope: -0.2,
        },
        relationshipImpact: { trust: -12, closeness: -6 },
      },
    ],
  },

  // ═══════════════════════════════════════════
  // Route C: 关系修复
  // ═══════════════════════════════════════════
  relationship_repair: {
    id: 'relationship_repair',
    name: '关系修复',
    description: '负面历史可以修复，但不会瞬间消失。行动比语言更有力。',
    color: '#FF9800',
    events: [
      {
        id: 'cancel_plan',
        label: '错过了她的重要时刻',
        description: 'Maya 的生日聚会。你因为工作缺席了，没有提前说。',
        category: 'negative_social',
        emotionDelta: {
          sadness: 0.55, loneliness: 0.45, anger: 0.35, frustration: 0.4,
        },
        relationshipImpact: { trust: -15, closeness: -10 },
      },
      {
        id: 'shallow_apology',
        label: '发了一句「对不起」',
        description: '你发了一条简短的道歉消息："对不起啊，昨天没能来。"',
        category: 'social',
        emotionDelta: {
          hope: 0.1, frustration: -0.05, anger: -0.05, sadness: 0.05,
        },
        relationshipImpact: { trust: 2, closeness: 1 },
      },
      {
        id: 'ignore_message',
        label: '她的回复很冷淡',
        description: 'Maya 回了一个 "嗯"。你没有追问。（这里角色保持防备状态。）',
        category: 'social',
        emotionDelta: {
          sadness: 0.15, nervousness: 0.1, hope: -0.05,
        },
        relationshipImpact: { trust: -2, closeness: -1 },
      },
      {
        id: 'specific_apology',
        label: '认真解释并具体道歉',
        description: '你找 Maya 当面谈了。你具体说了你错在哪里，以及为什么那件事让她受伤。',
        category: 'positive_social',
        emotionDelta: {
          hope: 0.3, gratitude: 0.25, calm: 0.2, sadness: -0.1, anger: -0.15,
        },
        relationshipImpact: { trust: 8, closeness: 5 },
      },
      {
        id: 'concrete_action',
        label: '用行动弥补',
        description: '你主动帮 Maya 完成了一个她一直拖着的任务，没有要求任何回报。',
        category: 'positive_social',
        emotionDelta: {
          gratitude: 0.4, hope: 0.35, love: 0.2, calm: 0.25, joy: 0.15,
        },
        relationshipImpact: { trust: 10, closeness: 7 },
      },
      {
        id: 'consistency',
        label: '连续一个月都很可靠',
        description: '接下来的一个月，你说到做到，每次约好都在，再也没有缺席过。',
        category: 'positive_social',
        emotionDelta: {
          trust: 0.3, calm: 0.35, gratitude: 0.4, love: 0.3, hope: 0.3,
          contentment: 0.25,
        },
        relationshipImpact: { trust: 15, closeness: 12 },
      },
      {
        id: 'late_arrival',
        label: '有一次迟到了 30 分钟',
        description: '因为突发状况，你晚到了 30 分钟。（观察在关系修复后，她如何回应。）',
        category: 'relationship',
        emotionDelta: {
          nervousness: 0.2, frustration: 0.15, sadness: 0.1,
          hope: 0.15, calm: 0.1,
        },
        relationshipImpact: { trust: -3, closeness: -1 },
      },
    ],
  },
};

module.exports = SCENARIOS;
