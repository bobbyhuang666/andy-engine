/**
 * StateMachine — 状态定义 + 轻量状态追踪器
 *
 * 行为决策已迁移到 BehaviorField（连续行为空间 + 朗之万动力学）。
 * 本模块保留：
 *   - STATES 对象：42 个状态的元数据（类别、合法时间、转移列表）
 *     被 BehaviorLabeler、PersonalMemory、StoryGenerator 等引用
 *   - StateMachine 类：仅追踪 history 和 stateEnteredAt
 *     由 Agent._wireBehaviorFieldToStateMachine() 注入 getter
 *
 * 已移除（commit ccc26cf+）：
 *   - _tryNormalTransition (150 行 ad-hoc 权重)
 *   - _transitionToDefault、_doTransition 转移逻辑
 *   - EVENT_STATE_MAP、INITIAL_STATES
 *   - getTimePeriod 辅助函数
 */

// ═══════════════════════════════════════════
// 状态定义（42 个状态）
//
// 保留完整数据：hours、category、next 列表
// 被 BehaviorLabeler（标签投影）、PersonalMemory（语义分类）、
// EmotionRegulation（休息状态判断）等模块引用
// ═══════════════════════════════════════════
const STATES = {
  // ─── 深夜 23:00-03:00 ───
  '还没睡呢':    { next: ['在发呆', '在听歌', '在看窗外', '困了但睡不着', '在看手机', '熬夜了'], hours: [22, 23, 0, 1, 2, 3], category: 'lateNight' },
  '在发呆':      { next: ['在听歌', '在看窗外', '困了但睡不着', '在看手机'], hours: [22, 23, 0, 1, 2, 3], category: 'lateNight' },
  '在听歌':      { next: ['在发呆', '在看窗外', '困了但睡不着', '在看手机'], hours: [22, 23, 0, 1, 2, 3], category: 'lateNight' },
  '在看窗外':    { next: ['在发呆', '在听歌', '困了但睡不着', '在看手机'], hours: [22, 23, 0, 1, 2, 3], category: 'lateNight' },
  '困了但睡不着': { next: ['在发呆', '在看手机', '快睡了', '睡了', '熬夜了'], hours: [23, 0, 1, 2, 3], category: 'lateNight' },
  '快睡了':      { next: ['睡了'], hours: [23, 0, 1, 2, 3, 4], category: 'lateNight' },
  '睡了':        { next: ['刚醒', '在翻身'], hours: [0, 1, 2, 3, 4, 5, 6, 7], category: 'sleep' },
  '在翻身':      { next: ['睡了', '刚醒'], hours: [0, 1, 2, 3, 4, 5, 6], category: 'sleep' },

  // ─── 早晨 06:00-08:00 ───
  '刚醒':        { next: ['在洗漱', '先躺一会', '在看手机', '在宿舍躺着', '生病了'], hours: [6, 7, 8], category: 'morning' },
  '在洗漱':      { next: ['在换衣服', '刚出门'], hours: [6, 7, 8, 9], category: 'morning' },
  '在换衣服':    { next: ['刚出门'], hours: [6, 7, 8, 9], category: 'morning' },
  '刚出门':      { next: ['在路上', '在食堂', '在教学楼', '在办公室'], hours: [7, 8, 9], category: 'morning' },
  '在教学楼':    { next: ['在上课', '在走神', '下课了', '在路上'], hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16], category: 'active' },

  // ─── 白天 08:00-17:00 ───
  '在上课':      { next: ['在走神', '下课了', '有点困', '翘课了'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16], category: 'active' },
  '在走神':      { next: ['在上课', '下课了', '在看手机'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16], category: 'active' },
  '下课了':      { next: ['在食堂', '在图书馆', '在便利店', '在校园广场', '在打工'], hours: [9, 10, 11, 12, 13, 14, 15, 16, 17], category: 'break' },
  '在图书馆':    { next: ['在自习', '在发呆', '在看手机', '有点困', '趴一会', '下课了', '在拖延', '在食堂'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], category: 'quiet' },
  '在自习':      { next: ['在图书馆', '在发呆', '有点困', '在看手机', '在拖延', '在食堂'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], category: 'quiet' },
  '在打工':      { next: ['刚下班', '有点累'], hours: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], category: 'active' },
  '在食堂':      { next: ['吃完了', '在聊天'], hours: [7, 8, 11, 12, 13, 17, 18, 19], category: 'social' },
  '吃完了':      { next: ['在图书馆', '在校园广场', '在路上', '在上课', '在办公室'], hours: [8, 9, 12, 13, 14, 17, 18, 19], category: 'break' },
  '有点困':      { next: ['趴一会', '在休息', '在上课', '在图书馆', '在办公室'], hours: [10, 11, 12, 13, 14, 15, 16], category: 'quiet' },
  '趴一会':      { next: ['在上课', '在图书馆', '刚醒', '在工作'], hours: [10, 11, 12, 13, 14, 15, 16], category: 'quiet' },
  '在路上':      { next: ['在教学楼', '在食堂', '在图书馆', '在便利店', '到家了', '在办公室'], hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], category: 'transit' },

  // ─── 上班族状态 ───
  '在办公室':    { next: ['在工作', '在开会', '在休息', '在食堂', '在路上', '刚下班'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], category: 'active' },
  '在工作':      { next: ['在开会', '在休息', '有点困', '有点累', '在食堂', '刚下班', '在拖延', '请假了'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], category: 'active' },
  '在开会':      { next: ['在工作', '在休息', '在食堂', '有点累'], hours: [9, 10, 11, 13, 14, 15, 16, 17], category: 'active' },

  // ─── 傍晚 17:00-23:00 ───
  '刚下班':      { next: ['在回家路上', '在便利店', '在路上'], hours: [17, 18, 19, 20, 21, 22], category: 'transit' },
  '在回家路上':  { next: ['到家了', '在便利店'], hours: [17, 18, 19, 20, 21, 22], category: 'transit' },
  '在便利店':    { next: ['在回家路上', '到家了', '在路上', '在图书馆', '在校园广场', '在上课', '在办公室', '在自习', '在食堂'], hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'break' },
  '到家了':      { next: ['先躺一会', '在做饭', '在洗澡', '在看手机', '生病了'], hours: [17, 18, 19, 20, 21, 22, 23], category: 'home' },
  '先躺一会':    { next: ['在做饭', '在看手机', '在看剧', '在洗澡', '困了', '生病了', '在拖延'], hours: [17, 18, 19, 20, 21, 22, 23], category: 'home' },
  '在做饭':      { next: ['做好了'], hours: [17, 18, 19, 20], category: 'home' },
  '做好了':      { next: ['在吃饭'], hours: [17, 18, 19, 20, 21], category: 'home' },
  '在吃饭':      { next: ['吃完了晚饭', '在看剧'], hours: [17, 18, 19, 20, 21], category: 'home' },
  '吃完了晚饭':  { next: ['在洗碗', '在看剧', '在看手机', '在洗澡'], hours: [18, 19, 20, 21, 22], category: 'home' },
  '在洗碗':      { next: ['在看剧', '在看手机', '在洗澡'], hours: [18, 19, 20, 21, 22], category: 'home' },
  '在洗澡':      { next: ['洗完了'], hours: [19, 20, 21, 22, 23], category: 'home' },
  '洗完了':      { next: ['在吹头发', '在看剧', '在看手机', '困了'], hours: [19, 20, 21, 22, 23], category: 'home' },
  '在吹头发':    { next: ['在看剧', '在看手机', '困了'], hours: [19, 20, 21, 22, 23], category: 'home' },
  '在看剧':      { next: ['看完了', '困了', '在看手机'], hours: [18, 19, 20, 21, 22, 23], category: 'leisure' },
  '看完了':      { next: ['在收拾', '在看手机', '在洗澡', '困了'], hours: [19, 20, 21, 22, 23], category: 'home' },
  '在收拾':      { next: ['在看手机', '困了', '在洗澡'], hours: [19, 20, 21, 22, 23], category: 'home' },
  '在看手机':    { next: ['困了', '在看剧', '在听歌', '还没睡呢'], hours: [18, 19, 20, 21, 22, 23, 0, 1, 2, 3], category: 'leisure' },
  '困了':        { next: ['快睡了', '在看手机', '在发呆', '睡了'], hours: [21, 22, 23, 0, 1, 2, 3], category: 'lateNight' },

  // ─── 社交状态 ───
  '在聊天':      { next: ['在食堂', '在图书馆', '在路上', '在校园广场', '在办公室'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], category: 'social' },
  '在校园广场':  { next: ['在聊天', '在食堂', '在路上', '在图书馆', '在便利店'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], category: 'social' },
  '在咖啡店':    { next: ['在聊天', '在路上', '在看书'], hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], category: 'social' },
  '在看书':      { next: ['在咖啡店', '在路上', '在发呆'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], category: 'quiet' },

  // ─── 通用状态 ───
  '有点累':      { next: ['在休息', '先躺一会', '在发呆'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'rest' },
  '在休息':      { next: ['在看手机', '在发呆', '困了', '有点困', '在工作'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'rest' },

  // ─── 负面行为状态 ───
  '翘课了':      { next: ['在外面闲逛', '在网吧', '在发呆', '在看手机', '在宿舍躺着'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16], category: 'deviant' },
  '在外面闲逛':  { next: ['在校园广场', '在便利店', '在咖啡店', '在路上', '有点累', '在看手机'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], category: 'deviant' },
  '在网吧':      { next: ['有点累', '在看手机', '在路上', '在便利店'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2], category: 'deviant' },
  '在宿舍躺着':  { next: ['在看手机', '在发呆', '在听歌', '快睡了', '睡了', '在翻身', '有点困'], hours: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'deviant' },
  '在拖延':      { next: ['在看手机', '在看剧', '在发呆', '有点困', '有点累'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'deviant' },
  '生病了':      { next: ['在宿舍躺着', '在休息', '在看手机', '快睡了', '睡了'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'illness' },
  '请假了':      { next: ['在宿舍躺着', '在休息', '在看手机', '在发呆', '睡了'], hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], category: 'illness' },
  '熬夜了':      { next: ['在发呆', '在看手机', '在听歌', '快睡了', '睡了'], hours: [0, 1, 2, 3, 4, 5], category: 'deviant' },
};

// ═══════════════════════════════════════════
// 轻量状态追踪器
//
// 不做任何行为决策。仅追踪：
//   - currentState：由 Agent._wireBehaviorFieldToStateMachine() 劫持为 getter
//   - stateEnteredAt：由 Agent.tick() 在标签变化时更新
//   - history：由 Agent.tick() 在标签变化时追加
// ═══════════════════════════════════════════
class StateMachine {
  constructor(initialState = '在图书馆', savedState = null) {
    if (savedState) {
      this.currentState = savedState.currentState;
      this.stateEnteredAt = new Date(savedState.stateEnteredAt);
      this.history = savedState.history || [];
    } else {
      this.currentState = initialState;
      this.stateEnteredAt = new Date();
      this.history = [];
    }
  }

  /**
   * 获取当前状态信息（只读，不触发转移）
   * @param {Date} [simTime]
   * @returns {{ state, category, elapsed, validTransitions }}
   */
  getInfo(simTime) {
    const def = STATES[this.currentState];
    const elapsed = simTime
      ? Math.max(0, (simTime - this.stateEnteredAt) / (1000 * 60))
      : 0;
    return {
      state: this.currentState,
      category: def ? def.category : 'unknown',
      elapsed,
      validTransitions: def ? def.next : [],
    };
  }

  toJSON() {
    return {
      currentState: this.currentState,
      stateEnteredAt: this.stateEnteredAt.toISOString(),
      history: this.history.slice(-10),
    };
  }
}

module.exports = { StateMachine, STATES };
