/**
 * StateMachine - 外部事件驱动的状态机
 *
 * 与 Bobby 状态机的区别：
 *   - Bobby 的状态转移仅基于时间 + 随机
 *   - Andy 的状态转移还受外部事件驱动（其他 Agent 的行为、环境变化等）
 *
 * 设计参考：
 *   - Repast Statecharts（Harel 1987 子集）
 *   - 支持层次状态和事件驱动转移
 *   - 每个状态有合法时间和合法转移列表
 */

const { ANDY_DEFAULTS } = require('../config/defaults');
const cfg = ANDY_DEFAULTS.stateMachine;

// ═══════════════════════════════════════════
// 状态定义（42 个状态，与 Bobby 兼容）
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

  // ─── 负面行为状态（Negative Behavior States）───
  // 真实的生活不只是按部就班。Agent 也会翘课、赖床、拖延、生病。
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
// 时间段 → 默认初始状态
// ═══════════════════════════════════════════
const INITIAL_STATES = {
  lateNight: '还没睡呢',
  earlyMorning: '快睡了',
  morning: '在上课',
  afternoon: '在图书馆',
  evening: '刚下班',
  night: '在做饭',
};

// 事件类型到状态转移的映射（基于关键词匹配，而非精确字符串匹配）
const EVENT_STATE_MAP = {
  // 社交类事件
  social: {
    keywords: ['聊天', '朋友', '分享', '鼓励', '一起', '偶遇'],
    targetState: '在聊天',
  },
  // 天气类事件
  weather: {
    keywords: ['下雨', '大风', '降温'],
    targetState: '在路上', // 赶紧回室内
  },
  // 美食/吃饭
  food: {
    keywords: ['好吃', '新菜', '吃饭', '喝咖啡', '咖啡师'],
    targetState: '在食堂',
  },
  // 打扰/噪音类
  disturbance: {
    keywords: ['太吵', '打扰', '被叫', '点名'],
    targetState: '在休息',
  },
  // 学习/发现类
  discovery: {
    keywords: ['有趣的书', '有趣的话题', '老师讲'],
    targetState: '在自习',
  },
};

function getTimePeriod(hour) {
  if (hour >= 23 || hour < 4) return 'lateNight';
  if (hour >= 4 && hour < 7) return 'earlyMorning';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

class StateMachine {
  /**
   * @param {string} initialState - 初始状态名
   * @param {Object} [savedState] - 恢复的序列化状态
   */
  constructor(initialState = '在图书馆', savedState = null) {
    if (savedState) {
      this.currentState = savedState.currentState;
      this.stateEnteredAt = new Date(savedState.stateEnteredAt);
      this.minDuration = savedState.minDuration;
      this.extraDuration = savedState.extraDuration;
      this.history = savedState.history || [];
      this._initialized = true; // 恢复的状态已经初始化过
    } else {
      this.currentState = initialState;
      this.stateEnteredAt = new Date(); // 会在首次 tick 时被 simTime 覆盖
      this.minDuration = 5;
      this.extraDuration = 10;
      this.history = [];
      this._initialized = false;
    }
  }

  /**
   * 推进状态机
   * @param {number} hour - 当前小时 (0-23)
   * @param {number} minutesSinceLastTick - 距上次 tick 的分钟数
   * @param {Object|null} externalEvent - 外部事件 { type, fromAgent, region }
   * @param {Date} [simTime] - 模拟时间
   * @param {Object} [emotionState] - 情绪状态 { valence, arousal, needsDrive }（用于情绪-行为耦合 + 需求驱动）
   * @returns {{ changed: boolean, newState: string|null, event: Object|null }}
   */
  tick(hour, minutesSinceLastTick, externalEvent = null, simTime = null, emotionState = null) {
    const now = simTime || new Date();

    // 首次 tick 时，用 simTime 初始化 stateEnteredAt
    // 修复：构造函数用 new Date()（真实时间），但模拟时间可能是不同的
    if (!this._initialized && simTime) {
      this.stateEnteredAt = simTime;
      this._initialized = true;
    }

    // 计算当前状态已持续时间
    const elapsed = (now - this.stateEnteredAt) / (1000 * 60); // 分钟

    // 检查时间约束：当前状态是否还适用于当前时间
    const stateDef = STATES[this.currentState];
    if (!stateDef) {
      return this._transitionToDefault(hour, now);
    }

    // ─── 外部事件驱动转移 ───
    if (externalEvent && externalEvent.type === 'interaction') {
      const eventTransition = this._tryEventDrivenTransition(externalEvent, hour, now);
      if (eventTransition.changed) return eventTransition;
    }

    // ─── 时间约束强制转移 ───
    if (!stateDef.hours.includes(hour)) {
      return this._transitionToDefault(hour, now);
    }

    // ─── 正常概率转移 ───
    if (elapsed >= this.minDuration + this.extraDuration) {
      return this._tryNormalTransition(hour, now, emotionState);
    }

    // 未到转移时间，保持当前状态
    return { changed: false, newState: null, event: null };
  }

  /**
   * 外部事件驱动的状态转移
   *
   * 使用关键词匹配而非精确字符串匹配：
   * EventDispatcher 生成的事件内容是完整句子（如"和好朋友一起吃饭，聊得很开心"），
   * 旧实现用精确匹配（如'遇到朋友'）永远匹配不上。
   *
   * @private
   */
  _tryEventDrivenTransition(externalEvent, hour, now) {
    const { region, fromAgent, eventContent } = externalEvent;
    if (!eventContent) return { changed: false, newState: null, event: null };

    // 基于关键词匹配事件类型
    let targetState = null;
    for (const [, rule] of Object.entries(EVENT_STATE_MAP)) {
      for (const keyword of rule.keywords) {
        if (eventContent.includes(keyword)) {
          targetState = rule.targetState;
          break;
        }
      }
      if (targetState) break;
    }

    if (!targetState) return { changed: false, newState: null, event: null };

    const targetDef = STATES[targetState];
    if (!targetDef) return { changed: false, newState: null, event: null };

    // 检查目标状态是否对当前时间合法
    if (!targetDef.hours.includes(hour)) return { changed: false, newState: null, event: null };

    // 检查是否从当前状态可达
    const currentDef = STATES[this.currentState];
    if (currentDef && !currentDef.next.includes(targetState)) {
      // 外部事件可以突破正常转移限制，但降低概率
      if (Math.random() > ANDY_DEFAULTS.stateMachine.eventDrivenBoost) {
        return { changed: false, newState: null, event: null };
      }
    }

    return this._doTransition(targetState, now);
  }

  /**
   * 时间约束强制转移
   *
   * 使用确定性策略：
   *   1. 优先使用当前状态的 next 列表中合法的状态
   *   2. 其次使用时间段默认状态
   *   3. 最后从同类别状态中选择
   * @private
   */
  _transitionToDefault(hour, now) {
    const period = getTimePeriod(hour);

    // 策略 1: 从当前状态的合法后继中选一个（保持连贯性）
    const currentDef = STATES[this.currentState];
    if (currentDef) {
      const validNext = currentDef.next.filter(s => {
        const def = STATES[s];
        return def && def.hours.includes(hour);
      });
      if (validNext.length > 0) {
        // 选择第一个合法后继（确定性，避免随机 Object.entries.find）
        return this._doTransition(validNext[0], now);
      }
    }

    // 策略 2: 使用时间段默认状态
    const defaultState = INITIAL_STATES[period];
    if (defaultState && STATES[defaultState] && defaultState !== this.currentState) {
      return this._doTransition(defaultState, now);
    }

    // 策略 3: 从所有合法状态中选择同类别或相关状态
    const currentCategory = currentDef ? currentDef.category : null;
    const fallback = Object.entries(STATES).find(
      ([name, def]) => def.hours.includes(hour) && name !== this.currentState &&
        (def.category === currentCategory || def.category === 'active' || def.category === 'quiet')
    );
    if (fallback) {
      return this._doTransition(fallback[0], now);
    }

    return { changed: false, newState: null, event: null };
  }

  /**
   * 正常概率转移
   *
   * 使用情绪状态调制转移权重：
   *   - 低效价（负面情绪）→ 倾向安静/休息状态
   *   - 高效价（正面情绪）→ 倾向社交/活跃状态
   *   - 低社交能量 → 避免社交状态
   *
   * @private
   * @param {number} hour
   * @param {Date} now
   * @param {Object} [emotionState] - { valence, arousal }
   */
  _tryNormalTransition(hour, now, emotionState = null) {
    const stateDef = STATES[this.currentState];
    if (!stateDef || stateDef.next.length === 0) {
      return { changed: false, newState: null, event: null };
    }

    // 过滤出当前时间合法的目标状态
    const validNext = stateDef.next.filter(s => {
      const def = STATES[s];
      return def && def.hours.includes(hour);
    });

    if (validNext.length === 0) {
      return this._transitionToDefault(hour, now);
    }

    // 加权随机选择（越靠前的选项权重越高，模拟自然偏好）
    let weights = validNext.map((_, i) => Math.pow(0.7, i));

    // 情绪-行为耦合：情绪状态影响状态选择偏好
    //
    // 设计原理（Frijda 1986 动作倾向理论 + 实验十四发现）：
    //   - 聚合效价（getValence()）信号太弱（30维平均→0.05~0.15），无法驱动行为
    //   - 改用原始情绪维度（joy, sadness, anger, fear等）直接计算行为倾向分数
    //   - 每个情绪维度映射到具体的行为类别倾向
    //   - 正面情绪 → approach motivation（社交/活跃/探索）
    //   - 负面情绪 → avoidance motivation（退缩/安静）或 aggression（deviant）
    //
    if (emotionState && emotionState.emotionDims) {
      const dims = emotionState.emotionDims;
      const arousal = emotionState.arousal || 0.5;

      // 计算行为类别倾向分数（基于原始情绪维度）
      // positiveDrive: 正面情绪驱力（→ social/active/leisure）
      // negativeDrive: 负面情绪驱力（→ quiet/rest）
      // agenticDrive: 愤怒/挫败驱力（→ deviant/active）
      const joy = (dims.joy || 0) + (dims.excitement || 0) * 0.7 + (dims.amusement || 0) * 0.5;
      const sadness = (dims.sadness || 0) + (dims.loneliness || 0) * 0.8 + (dims.boredom || 0) * 0.3;
      const anger = (dims.anger || 0) + (dims.frustration || 0) * 0.8 + (dims.disgust || 0) * 0.4;
      const fear = (dims.fear || 0) + (dims.nervousness || 0) * 0.7 + (dims.horror || 0) * 0.3;

      // approach/avoidance 倾向（0~1范围）
      const approachDrive = Math.min(1, Math.max(0, joy * 1.2));
      const avoidDrive = Math.min(1, Math.max(0, sadness * 0.8 + fear * 0.5));
      const agenticDrive = Math.min(1, Math.max(0, anger * 1.0));

      // 确定主导驱力
      const maxDrive = Math.max(approachDrive, avoidDrive, agenticDrive);

      if (maxDrive > 0.15) { // 只有情绪足够强时才影响行为
        // 人格调制系数：内向者开心时社交拉力减弱，外向者难过时更想找人
        const ocean = emotionState.ocean;
        const extFactor = ocean ? ocean.extraversion : 0.5; // 0=极度内向, 1=极度外向

        for (let i = 0; i < validNext.length; i++) {
          const def = STATES[validNext[i]];
          if (!def) continue;

          // approach drive → social/active/leisure
          // 内向者开心时社交拉力减弱（extFactor 调制），安静行为仍有吸引力
          if (approachDrive > 0.15 && approachDrive >= avoidDrive && approachDrive >= agenticDrive) {
            const intensity = 1 + approachDrive * 2.5;
            if (def.category === 'social') weights[i] *= intensity * (0.4 + extFactor * 0.6); // 内向者×0.4, 外向者×1.0
            if (def.category === 'active') weights[i] *= intensity * 0.7;
            if (def.category === 'leisure') weights[i] *= intensity * 0.5;
            if (def.category === 'quiet' || def.category === 'rest') weights[i] *= Math.max(0.3, 1 - approachDrive * 0.8 * extFactor); // 内向者安静偏好保留更多
          }

          // avoid drive → quiet/rest/home
          // 外向者难过时更想找人（社交惩罚减弱）
          if (avoidDrive > 0.15 && avoidDrive >= approachDrive && avoidDrive >= agenticDrive) {
            const intensity = 1 + avoidDrive * 2.5;
            if (def.category === 'quiet' || def.category === 'rest' || def.category === 'home') weights[i] *= intensity;
            if (def.category === 'social') weights[i] *= Math.max(0.2, 1 - avoidDrive * (0.5 + (1 - extFactor) * 0.5)); // 外向者社交惩罚更小
          }

          // agentic drive → deviant/active（愤怒导致反叛行为）
          if (agenticDrive > 0.15 && agenticDrive >= approachDrive && agenticDrive >= avoidDrive) {
            const intensity = 1 + agenticDrive * 2.0;
            if (def.category === 'deviant') weights[i] *= intensity;
            if (def.category === 'active') weights[i] *= intensity * 0.5;
            if (def.category === 'quiet') weights[i] *= Math.max(0.4, 1 - agenticDrive * 0.5);
          }

          // 唤醒度独立调制
          if (arousal > 0.65) {
            if (def.category === 'active' || def.category === 'social') weights[i] *= 1.2;
          }
          if (arousal < 0.35) {
            if (def.category === 'quiet' || def.category === 'rest') weights[i] *= 1.2;
          }
        }

        // 跨类别转移：当主导驱力足够强但当前合法目标中缺乏对应类别
        const desiredCategory = approachDrive === maxDrive ? 'social' :
                                agenticDrive === maxDrive ? 'deviant' : 'quiet';
        const hasDesiredCategory = validNext.some(s => STATES[s] && STATES[s].category === desiredCategory);

        if (!hasDesiredCategory && maxDrive > 0.25) {
          const emotionCandidates = Object.entries(STATES)
            .filter(([name, def]) =>
              def.category === desiredCategory &&
              def.hours.includes(hour) &&
              name !== this.currentState &&
              !validNext.includes(name)
            )
            .slice(0, 2);

          for (const [name] of emotionCandidates) {
            validNext.push(name);
            weights.push(maxDrive * 2.0); // 强情绪赋予较高权重
          }
        }
      }
    }

    // 需求驱力调制：匮乏需求大幅增加满足状态的权重
    if (emotionState && emotionState.needsDrive) {
      const drive = emotionState.needsDrive;
      for (let i = 0; i < validNext.length; i++) {
        if (drive.targetStates.includes(validNext[i])) {
          // 紧急度越高，权重修正越大（urgency=0.25 → ~2.25x）
          weights[i] *= (1 + drive.urgency * 5);
        }
      }

      // 需求驱动的跨类别转移：当需求紧急但目标状态不在合法列表中时，
      // 从所有时间合法状态中添加目标状态
      // 理论基础：Maslow 需求层次——匮乏需求会压倒其他行为倾向
      const hasTargetInValid = validNext.some(s => drive.targetStates.includes(s));
      if (!hasTargetInValid && drive.urgency > 0.08) {
        for (const targetState of drive.targetStates) {
          const def = STATES[targetState];
          if (def && def.hours.includes(hour) && !validNext.includes(targetState)) {
            validNext.push(targetState);
            // 紧急度越高，权重越高（urgency=0.25 → 权重1.25）
            weights.push(drive.urgency * 8);
          }
        }
      }
    }

    // 自发动机调制：好奇心驱力增加探索状态的权重
    // 参考 Deci & Ryan (1985, 2017) 自我决定论
    if (emotionState && emotionState.intrinsicDrive) {
      const imDrive = emotionState.intrinsicDrive;
      const explorationBoost = ANDY_DEFAULTS.intrinsicMotivation.explorationStateBoost;
      for (let i = 0; i < validNext.length; i++) {
        const def = STATES[validNext[i]];
        if (!def) continue;

        // 探索友好状态获得权重加成
        if (imDrive.targetStates && imDrive.targetStates.includes(validNext[i])) {
          weights[i] *= explorationBoost;
        }

        // 安静/休息状态在高好奇心时略微降低权重（想动起来）
        if (imDrive.urgency > 0.15) {
          if (def.category === 'rest' || def.category === 'lateNight') {
            weights[i] *= 0.8;
          }
        }
      }
    }

    // 健康状态调制：生病时偏好休息状态，避免高强度活动
    if (emotionState && emotionState.health !== undefined) {
      const health = emotionState.health;
      if (health < 0.5) {
        // 健康不佳：大幅偏好休息/生病状态，减少活跃状态
        const healthPenalty = (0.5 - health) * 2; // 0~1, 越不健康惩罚越大
        for (let i = 0; i < validNext.length; i++) {
          const def = STATES[validNext[i]];
          if (!def) continue;
          if (def.category === 'rest' || def.category === 'illness' || def.category === 'home') {
            weights[i] *= (1 + healthPenalty * 1.5);
          }
          if (def.category === 'active' || def.category === 'social') {
            weights[i] *= Math.max(0.2, 1 - healthPenalty * 0.8);
          }
        }
      }
    }

    // 行为后果预估调制：基于过往经验对行为选项加权
    // 理论基础：Wall & Hayes (2016) 运动前估值, Kahneman (2011) 经验自我
    // Agent 学会了"上次这样做感觉好/不好"，并据此调整行为倾向
    if (emotionState && emotionState.stateConsequences) {
      const consequences = emotionState.stateConsequences;
      const currentValence = emotionState.valence || 0;

      for (let i = 0; i < validNext.length; i++) {
        const stateName = validNext[i];
        if (!consequences[stateName]) continue;

        const { expectedValue, sampleSize } = consequences[stateName];

        // 信心因子：样本越多，权重影响越大（最大 1.0，2+ 样本即满信心）
        const confidence = Math.min(1, sampleSize / 2);

        // 根据当前情绪方向调整：
        // 心情好时（valence > 0），强化正面后果预期（继续做好事）
        // 心情差时（valence < 0），偏好正面后果状态（想改善心情）
        let consequenceWeight;
        if (currentValence < -0.1) {
          // 心情差：正面后果更有吸引力
          consequenceWeight = 1 + (expectedValue - currentValence) * 0.8 * confidence;
        } else if (currentValence > 0.1) {
          // 心情好：正面后果得到适度强化，负面后果得到适度抑制
          consequenceWeight = 1 + expectedValue * 0.4 * confidence;
        } else {
          // 中性：温和的后果引导
          consequenceWeight = 1 + expectedValue * 0.3 * confidence;
        }

        weights[i] *= Math.max(0.3, Math.min(2.5, consequenceWeight));
      }
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosen = validNext[0];

    for (let i = 0; i < validNext.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = validNext[i];
        break;
      }
    }

    if (chosen === this.currentState) {
      return { changed: false, newState: null, event: null };
    }

    return this._doTransition(chosen, now);
  }

  /**
   * 执行状态转移
   * @private
   */
  _doTransition(newState, now) {
    const oldState = this.currentState;

    // 记录历史
    this.history.push({
      from: oldState,
      to: newState,
      at: now.toISOString(),
    });

    // 保留最近 20 条历史
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }

    this.currentState = newState;
    this.stateEnteredAt = now;

    // 重新计算持续时间
    this._recalculateDuration(newState);

    return {
      changed: true,
      newState,
      event: {
        type: 'state_change',
        from: oldState,
        to: newState,
        time: now.toISOString(),
      },
    };
  }

  /**
   * 重新计算状态持续时间
   * @private
   */
  _recalculateDuration(stateName) {
    const def = STATES[stateName];
    if (!def) {
      this.minDuration = cfg.duration.default.min;
      this.extraDuration = cfg.duration.default.extra;
      return;
    }

    const cat = def.category;
    let dur;
    switch (cat) {
      case 'active':
      case 'social':
        dur = cfg.duration.active;
        break;
      case 'quiet':
      case 'rest':
      case 'illness':
        dur = cfg.duration.quiet;  // 生病和休息一样持续较长时间
        break;
      case 'deviant':
        dur = cfg.duration.default;  // 负面行为持续正常时长
        break;
      case 'lateNight':
      case 'sleep':
        dur = cfg.duration.lateNight;
        break;
      default:
        dur = cfg.duration.default;
    }

    this.minDuration = dur.min;
    this.extraDuration = Math.floor(Math.random() * dur.extra);
  }

  /**
   * 获取当前状态信息
   * @param {Date} [simTime] - 模拟时间（不传则用当前状态进入时间推算）
   */
  getInfo(simTime) {
    const def = STATES[this.currentState];
    // 注意：如果未传入 simTime，elapsed 无法正确计算（避免使用真实时间）
    // 调用方应传入模拟时间以获得准确的 elapsed
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

  /**
   * 序列化
   */
  toJSON() {
    return {
      currentState: this.currentState,
      stateEnteredAt: this.stateEnteredAt.toISOString(),
      minDuration: this.minDuration,
      extraDuration: this.extraDuration,
      history: this.history.slice(-10),
    };
  }
}

module.exports = { StateMachine, STATES, INITIAL_STATES, getTimePeriod };
