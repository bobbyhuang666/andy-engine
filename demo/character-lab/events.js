/**
 * Event Pool — 自由事件输入
 *
 * 用户可以任意顺序点击，不再按路线。
 * 每个事件定义：
 *   - id, label, description — UI 展示
 *   - category — 引擎事件类型
 *   - emotionDelta — 30 维情绪影响
 *   - relationshipImpact — 关系影响
 *   - memoryTags — 引发的联想记忆标签
 *   - btResponse — 行为树版本的回复（用于对比）
 */

const EVENT_POOL = [
  {
    id: 'check_in',
    label: '关心她',
    description: '你主动问她今天过得怎样，认真听她说。',
    category: 'positive_social',
    emotionDelta: { joy: 0.35, gratitude: 0.5, calm: 0.3, hope: 0.2, love: 0.15 },
    relationshipImpact: { trust: 8, closeness: 5 },
    memoryTags: ['关心', '陪伴', '被在意'],
    btResponse: '你还记得问我……这让我感觉被在意着。',
  },
  {
    id: 'ignore_message',
    label: '忽略她的消息',
    description: '她发了一条消息，你没有回复。',
    category: 'negative_social',
    emotionDelta: { sadness: 0.45, loneliness: 0.4, shame: 0.25, frustration: 0.35 },
    relationshipImpact: { trust: -12, closeness: -7 },
    memoryTags: ['被忽视', '不重要', '失落'],
    btResponse: '你没回我。',
  },
  {
    id: 'late_arrival',
    label: '迟到',
    description: '你比约定时间晚了 30 分钟。',
    category: 'relationship',
    emotionDelta: { nervousness: 0.2, frustration: 0.15, sadness: 0.1, hope: 0.1, calm: 0.1 },
    relationshipImpact: { trust: -5, closeness: -3 },
    memoryTags: ['等待', '不可靠', '失望'],
    btResponse: '嗯，你来了。有点晚了。',
  },
  {
    id: 'specific_apology',
    label: '认真道歉',
    description: '你找到她，具体说了你错在哪里，以及为什么那件事让她受伤。',
    category: 'positive_social',
    emotionDelta: { hope: 0.3, gratitude: 0.25, calm: 0.2, sadness: -0.1 },
    relationshipImpact: { trust: 7, closeness: 4 },
    memoryTags: ['道歉', '被理解', '修复'],
    btResponse: '好吧，我接受。',
  },
  {
    id: 'criticize',
    label: '批评她',
    description: '她犯了一个错，你指出了问题，语气比较直接。',
    category: 'negative_social',
    emotionDelta: { sadness: 0.4, shame: 0.35, anger: 0.2, fear: 0.15 },
    relationshipImpact: { trust: -8, closeness: -5 },
    memoryTags: ['被否定', '不够好', '害怕'],
    btResponse: '嗯，我知道了。',
  },
  {
    id: 'complete_task',
    label: '陪她完成任务',
    description: '她有一件棘手的事。你没有只说「加油」，而是陪她一起做。',
    category: 'positive_social',
    emotionDelta: { joy: 0.3, gratitude: 0.4, pride: 0.25, calm: 0.2, love: 0.15 },
    relationshipImpact: { trust: 6, closeness: 6 },
    memoryTags: ['支持', '共同完成', '被帮助'],
    btResponse: '嗯，谢谢。',
  },
  {
    id: 'rest',
    label: '让她休息',
    description: '她说很累。你没有再提要求，而是说「今天别做了，休息吧」。',
    category: 'positive_social',
    emotionDelta: { relief: 0.35, gratitude: 0.3, calm: 0.25, contentment: 0.15 },
    relationshipImpact: { trust: 5, closeness: 3 },
    memoryTags: ['体贴', '被理解', '安全感'],
    btResponse: '嗯，好。',
  },
  {
    id: 'make_demand',
    label: '继续要求她帮忙',
    description: '她已经很累了，但你还是让她帮你做一件事。',
    category: 'negative_social',
    emotionDelta: { anger: 0.35, frustration: 0.45, sadness: 0.25, exhaustion: 0.2 },
    relationshipImpact: { trust: -7, closeness: -4 },
    memoryTags: ['被利用', '不被考虑', '疲惫'],
    btResponse: '我今天不太方便，下次吧。',
  },
];

module.exports = EVENT_POOL;
