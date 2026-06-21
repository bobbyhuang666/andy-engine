/**
 * StoryGenerator — 从 Andy tick 数据生成故事片段
 *
 * 设计原则:
 *   1. 不用 LLM，用程序化模板 + Andy 模拟数据
 *   2. 故事的多样性来自模拟本身的丰富性，而非生成模型
 *   3. 输出已脱敏：不包含用户内容，只包含 agent 的经历
 *   4. 与 SimulationStore 配合，自动持久化
 */

// 30 维情绪名
const POSITIVE_DIMS = ['joy', 'amusement', 'awe', 'contentment', 'desire', 'interest', 'love', 'pride', 'relief', 'satisfaction', 'sympathy', 'triumph', 'calm', 'excitement', 'gratitude', 'hope'];
const NEGATIVE_DIMS = ['sadness', 'anger', 'fear', 'disgust', 'embarrassment', 'guilt', 'horror', 'nervousness', 'shame', 'boredom', 'confusion', 'frustration', 'loneliness'];

// ═══════════════════════════════════════════
// 模板库（按类别分组）
// ═══════════════════════════════════════════

const TEMPLATES = {
  // ── 状态变化 ──
  stateChange: [
    '结束了{old}，开始{new}',
    '从{old}切换到了{new}',
    '{new}时间到了',
  ],

  // ── 社交互动 ──
  social: [
    '遇到{name}了，打了个招呼',
    '碰到了{name}，聊了几句',
    '和{name}说了几句话',
    '在{location}遇到了{name}',
  ],

  // ── 情绪极端 ──
  emotionHigh: [
    '今天心情特别好',
    '感觉一切都很顺利',
    '心情不错，做什么都有劲',
  ],
  emotionLow: [
    '心情有点低落',
    '感觉不太开心',
    '今天有点丧',
    '情绪有点down',
  ],

  // ── 心智游荡 ──
  mindWander: [
    '突然想起了{thought}',
    '脑子里一直在想{thought}',
    '不自觉地想起了{thought}',
  ],

  // ── 日常活动 ──
  activity: [
    '在{location}待了一会',
    '去了{location}',
    '今天大部分时间在{location}',
  ],

  // ── 无事发生 ──
  quiet: [
    '今天平平淡淡的',
    '没什么特别的事',
    '普通的一天',
  ],
};

// 状态中文映射
const STATE_NAMES = {
  idle: '休息',
  working: '工作',
  socializing: '社交',
  resting: '休息',
  eating: '吃饭',
  sleeping: '睡觉',
  learning: '学习',
  exercising: '运动',
  commuting: '通勤',
  entertaining: '娱乐',
  shopping: '购物',
  cooking: '做饭',
};

// 地点中文映射（中性，不依赖 campus）
const LOCATION_NAMES = {
  home: '家',
  office: '工作地',
  library: '阅览处',
  cafe: '咖啡馆',
  park: '公园',
  gym: '健身房',
  restaurant: '餐厅',
  street: '街上',
  school: '学堂',
};

class StoryGenerator {
  /**
   * 从 tick 结果生成故事
   *
   * @param {Object} tickResult - Simulator.tick() 返回的 agent 结果
   * @param {string} agentId - 目标 agent
   * @returns {Story|null} 故事对象，无事发生时返回 null
   */
  generateFromTick(tickResult, agentId = 'bobby') {
    if (!tickResult || !tickResult.phase?.agentThink?.results) return null;

    const agentResult = tickResult.phase.agentThink.results[agentId];
    if (!agentResult) return null;

    const stories = [];

    // 1. 状态变化
    if (agentResult.stateChanged) {
      stories.push(this._stateChangeStory(agentResult, tickResult));
    }

    // 2. 社交互动
    if (agentResult.interaction) {
      stories.push(this._socialStory(agentResult.interaction, tickResult));
    }

    // 3. 情绪极端
    const emotionStory = this._emotionExtremeStory(agentResult);
    if (emotionStory) stories.push(emotionStory);

    // 4. 心智游荡
    if (agentResult.mindWander) {
      stories.push(this._mindWanderStory(agentResult.mindWander));
    }

    // 5. 无事发生（低概率生成平淡故事，避免空白）
    if (stories.length === 0 && Math.random() < 0.1) {
      stories.push({
        category: 'daily_life',
        content: pickRandom(TEMPLATES.quiet),
        emotionTag: 'neutral',
        importance: 0.2,
      });
    }

    // 附加元数据
    return stories.map(s => ({
      ...s,
      tick: tickResult.tickNumber,
      timestamp: Date.now(),
      agentId,
      source: 'simulation',
    }));
  }

  /**
   * 从情绪信号生成故事（用户对话后）
   *
   * @param {string} storyText - EmotionSignalBuffer 生成的脱敏故事
   * @param {Object} emotionEffect - 情绪变化
   * @param {number} tick - 当前 tick
   * @returns {Story}
   */
  generateFromSignal(storyText, emotionEffect, tick) {
    // 根据情绪变化确定标签和重要性
    let emotionTag = 'neutral';
    let importance = 0.5;

    if (emotionEffect) {
      let posSum = 0, negSum = 0;
      for (const [dim, delta] of Object.entries(emotionEffect)) {
        if (POSITIVE_DIMS.includes(dim)) posSum += delta;
        if (NEGATIVE_DIMS.includes(dim)) negSum += Math.abs(delta);
      }

      if (negSum > 0.1) {
        emotionTag = 'sad';
        importance = 0.6 + Math.min(negSum, 0.3);
      } else if (posSum > 0.1) {
        emotionTag = 'happy';
        importance = 0.5 + Math.min(posSum, 0.3);
      }
    }

    return {
      tick,
      timestamp: Date.now(),
      agentId: 'bobby',
      category: 'conversation',
      content: storyText,
      emotionTag,
      importance: Math.min(importance, 0.9),
      source: 'user_signal',
    };
  }

  // ═══════════════════════════════════════════
  // 内部：各类故事生成
  // ═══════════════════════════════════════════

  _stateChangeStory(agentResult, tickResult) {
    const oldState = STATE_NAMES[agentResult.previousState] || agentResult.previousState || '休息';
    const newState = STATE_NAMES[agentResult.newState] || agentResult.newState || '休息';

    const content = pickRandom(TEMPLATES.stateChange)
      .replace('{old}', oldState)
      .replace('{new}', newState);

    return {
      category: 'daily_life',
      content,
      emotionTag: 'neutral',
      importance: 0.4,
    };
  }

  _socialStory(interaction, tickResult) {
    const name = interaction.otherAgentName || interaction.otherAgent || '某个人';
    const location = LOCATION_NAMES[interaction.location] || '';

    let content;
    if (location) {
      content = pickRandom(TEMPLATES.social)
        .replace('{name}', name)
        .replace('{location}', location);
    } else {
      content = `遇到${name}了`;
    }

    return {
      category: 'social',
      content,
      emotionTag: 'neutral',
      importance: 0.6,
    };
  }

  _emotionExtremeStory(agentResult) {
    if (!agentResult.emotion) return null;

    const emotion = agentResult.emotion;
    const valence = this._getValence(emotion);

    if (valence > 0.35) {
      return {
        category: 'emotion',
        content: pickRandom(TEMPLATES.emotionHigh),
        emotionTag: 'happy',
        importance: 0.6 + Math.min(valence - 0.35, 0.3),
      };
    }

    if (valence < -0.35) {
      return {
        category: 'emotion',
        content: pickRandom(TEMPLATES.emotionLow),
        emotionTag: 'sad',
        importance: 0.6 + Math.min(Math.abs(valence) - 0.35, 0.3),
      };
    }

    return null;
  }

  _mindWanderStory(mindWander) {
    const thought = mindWander.content || '一些事情';
    const content = pickRandom(TEMPLATES.mindWander).replace('{thought}', thought);

    let emotionTag = 'neutral';
    if (mindWander.type === 'worry') emotionTag = 'sad';
    if (mindWander.type === 'reminisce') emotionTag = 'neutral';

    return {
      category: 'thought',
      content,
      emotionTag,
      importance: 0.5,
    };
  }

  /**
   * 从 emotion 对象计算 valence（正负价）
   * @private
   */
  _getValence(emotion) {
    let pos = 0, neg = 0;
    for (const dim of POSITIVE_DIMS) {
      if (emotion[dim]) pos += emotion[dim];
    }
    for (const dim of NEGATIVE_DIMS) {
      if (emotion[dim]) neg += emotion[dim];
    }
    return pos + neg; // neg 本身是负值
  }
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = { StoryGenerator };
