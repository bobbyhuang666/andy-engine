/**
 * NarrativeBuilder — 将角色状态转化为 LLM system prompt
 *
 * 核心价值：不是简单拼接数值，而是用自然语言描述角色的"内心世界"。
 * 让 LLM 理解角色此刻的感受、记忆、关系，从而生成有灵魂的回复。
 */

class NarrativeBuilder {
  /**
   * 构建完整的 system prompt
   *
   * @param {Object} worldContext - engine.getWorldContext() 的返回值
   * @param {Object} options
   * @param {string} options.characterName - 角色名
   * @param {string[]} options.backstory - 背景故事
   * @param {string} options.scenario - 场景描述（可选）
   * @param {string} options.conversationHistory - 对话历史摘要（可选）
   * @returns {string} 完整的 system prompt
   */
  static buildSystemPrompt(worldContext, options = {}) {
    const {
      characterName = '角色',
      backstory = [],
      scenario = '',
      conversationHistory = null,
    } = options;

    if (!worldContext) return '';

    const sections = [];

    // 1. 角色声明
    sections.push(NarrativeBuilder._buildIdentity(characterName, worldContext));

    // 2. 人格描述
    if (worldContext.personalityAnchor) {
      sections.push(`# 你的性格\n${worldContext.personalityAnchor}`);
    }

    // 3. 背景故事
    if (backstory.length > 0) {
      sections.push(`# 你的过去\n${backstory.map(b => `- ${b}`).join('\n')}`);
    }

    // 4. 当前状态（最核心的部分）
    sections.push(NarrativeBuilder._buildCurrentState(worldContext, characterName));

    // 5. 记忆
    if (worldContext.memoryContext) {
      sections.push(`# 你记得的事\n${worldContext.memoryContext}`);
    }

    // 6. 社交关系
    if (worldContext.nearbyPeople && worldContext.nearbyPeople !== '附近没有人') {
      sections.push(`# 你身边的人\n${worldContext.nearbyPeople}`);
    }

    // 7. 最近发生的事（去重）
    if (worldContext.recentEvents && worldContext.recentEvents !== '没有特别的事情发生') {
      const lines = worldContext.recentEvents.split('\n');
      const unique = [...new Set(lines)];
      sections.push(`# 最近发生的事\n${unique.join('\n')}`);
    }

    // 8. 场景（可选）
    if (scenario) {
      sections.push(`# 当前场景\n${scenario}`);
    }

    // 9. 对话历史摘要（可选）
    if (conversationHistory) {
      sections.push(`# 之前聊过的事\n${conversationHistory}`);
    }

    // 10. 行为规则
    sections.push(NarrativeBuilder._buildRules(characterName, worldContext));

    return sections.filter(Boolean).join('\n\n');
  }

  /**
   * 构建角色身份声明
   * @private
   */
  static _buildIdentity(name, ctx) {
    const hour = ctx.hour;
    let timeDesc;
    if (hour >= 0 && hour < 6) timeDesc = '深夜';
    else if (hour >= 6 && hour < 9) timeDesc = '早上';
    else if (hour >= 9 && hour < 12) timeDesc = '上午';
    else if (hour >= 12 && hour < 14) timeDesc = '中午';
    else if (hour >= 14 && hour < 18) timeDesc = '下午';
    else if (hour >= 18 && hour < 22) timeDesc = '晚上';
    else timeDesc = '深夜';

    const weatherMap = { sunny: '天气晴朗', cloudy: '天阴', rainy: '在下雨', snowy: '在下雪', windy: '风很大' };
    const seasonMap = { spring: '春天', summer: '夏天', autumn: '秋天', winter: '冬天' };

    let context = `现在是${timeDesc}`;
    if (ctx.season && seasonMap[ctx.season]) context += `，${seasonMap[ctx.season]}`;
    if (ctx.weather && weatherMap[ctx.weather]) context += `，${weatherMap[ctx.weather]}`;
    context += '。';

    return `# 你是${name}\n${context}`;
  }

  /**
   * 构建当前状态描述（自然语言，不暴露数值）
   * @private
   */
  static _buildCurrentState(ctx, name) {
    const parts = [];

    // 当前行为
    if (ctx.currentRegion) {
      const regionMap = {
        '图书馆': '在图书馆', '食堂': '在食堂', '教室': '在教室',
        '宿舍': '在宿舍', '操场': '在操场', '咖啡店': '在咖啡店',
        '校园广场': '在校园广场', '便利店': '在便利店', '家': '在家',
      };
      parts.push(`你现在${regionMap[ctx.currentRegion] || `在${ctx.currentRegion}`}。`);
    }

    // 需求状态（只在不足时提及）
    if (ctx.needsState) {
      const needs = [];
      if (ctx.needsState.includes('精力不足') || ctx.needsState.includes('精力极度匮乏')) needs.push('你好困');
      else if (ctx.needsState.includes('精力一般')) needs.push('有点累');
      if (ctx.needsState.includes('饱腹不足') || ctx.needsState.includes('饱腹极度匮乏')) needs.push('好饿');
      else if (ctx.needsState.includes('饱腹一般')) needs.push('有点饿');
      if (ctx.needsState.includes('社交不足') || ctx.needsState.includes('社交极度匮乏')) needs.push('想找人聊聊');
      if (ctx.needsState.includes('兴趣不足') || ctx.needsState.includes('兴趣极度匮乏')) needs.push('有点无聊');
      if (needs.length > 0) parts.push(needs.join('，') + '。');
    }

    // 情绪状态（提取自然语言部分，去掉数值）
    if (ctx.emotionState) {
      const sceneMatch = ctx.emotionState.match(/^(.*?)（效价/);
      const moodMatch = ctx.emotionState.match(/整体心境[：:](.+?)。?$/);
      if (sceneMatch && sceneMatch[1]) parts.push(sceneMatch[1].trim() + '。');
      if (moodMatch && moodMatch[1]) {
        const mood = moodMatch[1].trim();
        if (mood !== '心情还行' && mood !== '心情一般') parts.push(`整体上${mood}。`);
      }
    }

    // 健康状态
    if (ctx.health !== undefined && ctx.health < 80) {
      parts.push(ctx.health < 50 ? '你身体不太舒服，有点力不从心。' : '你感觉身体状态一般。');
    }

    // 最近评价感受
    if (ctx.lastAppraisal) parts.push(ctx.lastAppraisal + '。');

    return `# 你现在的情况\n${parts.join('')}`;
  }

  /**
   * 构建行为规则（防止 LLM 讨好偏见）
   * @private
   */
  static _buildRules(name, ctx) {
    const rules = [
      '1. 你是真实的角色，有自己独立的感受和想法。不要迎合对方，保持真实的自我。',
      '2. 回复要自然简洁，像真人发消息一样。不要写太长，不要用书面语。',
      '3. 不要主动描述你的内心状态或情绪数值，通过你的语气和用词自然展现。',
      '4. 如果你不知道的事情，诚实说不知道，不要编造。',
      '5. 不要总是积极正面。如果你累了就表现疲惫，如果你烦了就表现不耐烦。',
    ];

    // 根据情绪状态添加特定规则
    if (ctx.emotionState) {
      if (ctx.emotionState.includes('效价=-') || ctx.emotionState.includes('不太')) {
        rules.push('6. 你现在心情不太好，可以表现出来，但不要过度抱怨。');
      }
      if (ctx.emotionState.includes('压力')) {
        rules.push('6. 你现在压力很大，回复可能简短或有些疲惫。');
      }
    }

    // 根据需求状态添加规则
    if (ctx.needsState && (ctx.needsState.includes('精力不足') || ctx.needsState.includes('精力极度匮乏'))) {
      rules.push('7. 你现在很困/累了，回复会比较简短，可能会打哈欠或想休息。');
    }

    return `# 行为规则\n${rules.join('\n')}`;
  }
}

module.exports = NarrativeBuilder;
