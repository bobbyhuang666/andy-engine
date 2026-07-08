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

// 地点显示名映射由 domain.semanticProfile.locationNames 提供（domain-driven）。
// core 不再硬编码 campus/tavern/Oak Town 等具体世界地点词；
// 未提供 profile 时直出原始 location（见 _socialStory）。

class StoryGenerator {
  /**
   * @param {Object} [options]
   * @param {Object<string, string>} [options.locationNames]
   *   region key → 显示名映射，来自 domain.semanticProfile.locationNames。
   *   缺省时社交故事直出 interaction.location 原值。
   */
  constructor(options = {}) {
    this._locationNames = options.locationNames || {};
  }

  /**
   * 从 tick 结果生成故事
   *
   * @param {Object} tickResult - Simulator.tick() 返回的 agent 结果
   * @param {string} agentId - 目标 agent
   * @returns {Story|null} 故事对象，无事发生时返回 null
   */
  generateFromTick(tickResult, agentId = 'default', options = {}) {
    if (!tickResult || !tickResult.phase?.agentThink?.results) return null;

    const agentResult = tickResult.phase.agentThink.results[agentId];
    if (!agentResult) return null;

    const { rng, simTime } = options;
    const timestamp = simTime ? simTime.getTime() : 0;
    const stories = [];

    // 1. 状态变化
    if (agentResult.stateChanged) {
      stories.push(this._stateChangeStory(agentResult, tickResult, rng));
    }

    // 2. 社交互动
    if (agentResult.interaction) {
      stories.push(this._socialStory(agentResult.interaction, tickResult, rng));
    }

    // 3. 情绪极端
    const emotionStory = this._emotionExtremeStory(agentResult, rng);
    if (emotionStory) stories.push(emotionStory);

    // 4. 心智游荡
    if (agentResult.mindWander) {
      stories.push(this._mindWanderStory(agentResult.mindWander, rng));
    }

   // 5. 无事发生（低概率生成平淡故事，避免空白）
    // Deterministic: rng is required for seeded simulation. Skip quiet story if no rng.
   const quietChance = rng ? rng.next() : 1;
    if (stories.length === 0 && quietChance < 0.1) {
      stories.push({
        category: 'daily_life',
        content: pickRandom(TEMPLATES.quiet, rng),
        emotionTag: 'neutral',
        importance: 0.2,
      });
    }

    // 附加元数据
    return stories.map(s => ({
      ...s,
      tick: tickResult.tickNumber,
      timestamp,
      agentId,
      source: 'simulation',
    }));
  }

  /**
   * 从世界 tick 结果生成故事（别名，明确输入来源）
   *
   * This is an alias for generateFromTick() that makes it clear
   * the input should come from AndyWorld.step() result.
   *
   * @param {Object} worldTickResult - AndyWorld.step() 返回的结果
   * @param {string} agentId - 目标 agent
   * @returns {Story|null} 故事对象，无事发生时返回 null
   */
  generateFromWorldTick(worldTickResult, agentId = 'default', options = {}) {
    return this.generateFromTick(worldTickResult, agentId, options);
  }

  /**
   * 从情绪信号生成故事（用户对话后）
   *
   * @param {string} storyText - EmotionSignalBuffer 生成的脱敏故事
   * @param {Object} emotionEffect - 情绪变化
   * @param {number} tick - 当前 tick
   * @returns {Story}
   */
  generateFromSignal(storyText, emotionEffect, tick, options = {}) {
    const { simTime, agentId = 'default' } = options;
    const timestamp = simTime ? simTime.getTime() : 0;
    // 根据情绪变化确定标签和重要性
    let emotionTag = 'neutral';
    let importance = 0.5;

    if (emotionEffect) {
      let posSum = 0, negSum = 0;
      for (const [dim, delta] of Object.entries(emotionEffect)) {
        // R114-002: guard against NaN/Infinity delta values.
        if (!Number.isFinite(delta)) continue;
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
      timestamp,
      agentId,
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

  _stateChangeStory(agentResult, tickResult, rng) {
    const oldState = STATE_NAMES[agentResult.previousState] || agentResult.previousState || '休息';
    const newState = STATE_NAMES[agentResult.newState] || agentResult.newState || '休息';

    const content = pickRandom(TEMPLATES.stateChange, rng)
      .replace('{old}', oldState)
      .replace('{new}', newState);

    return {
      category: 'daily_life',
      content,
      emotionTag: 'neutral',
      importance: 0.4,
    };
  }

  _socialStory(interaction, tickResult, rng) {
    const name = interaction.otherAgentName || interaction.otherAgent || '某个人';
    // Domain-driven: 优先用 semanticProfile.locationNames 映射显示名，
    // 没有映射时直出原始 location；location 缺失才退回无地点短语。
    const location = this._locationNames[interaction.location] || interaction.location || '';

    let content;
    if (location) {
      content = pickRandom(TEMPLATES.social, rng)
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

  _emotionExtremeStory(agentResult, rng) {
    if (!agentResult.emotion) return null;

    const emotion = agentResult.emotion;
    const valence = this._getValence(emotion);

    if (valence > 0.35) {
      return {
        category: 'emotion',
        content: pickRandom(TEMPLATES.emotionHigh, rng),
        emotionTag: 'happy',
        importance: 0.6 + Math.min(valence - 0.35, 0.3),
      };
    }

    if (valence < -0.35) {
      return {
        category: 'emotion',
        content: pickRandom(TEMPLATES.emotionLow, rng),
        emotionTag: 'sad',
        importance: 0.6 + Math.min(Math.abs(valence) - 0.35, 0.3),
      };
    }

    return null;
  }

  _mindWanderStory(mindWander, rng) {
    const thought = mindWander.content || '一些事情';
    const content = pickRandom(TEMPLATES.mindWander, rng).replace('{thought}', thought);

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
   * R20 M2: fix semantic inversion. Emotion dimensions are stored as
   * non-negative intensities (0-1), so neg is always >= 0. The old
   * `pos + neg` made valence always positive, making the `valence < -0.35`
   * branch dead code. Correct formula: `pos - neg`.
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
    return pos - neg;
  }
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function pickRandom(arr, rng) {
  // Deterministic: rng is required for seeded simulation. Fallback to first element if no rng.
  if (!rng) return arr[0];
  return arr[Math.floor(rng.next() * arr.length)];
}

module.exports = { StoryGenerator };
