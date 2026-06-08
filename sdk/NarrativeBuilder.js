/**
 * NarrativeBuilder — 将角色状态转化为 LLM system prompt
 *
 * 设计原则（来自 prompt engineering 最佳实践）：
 *   1. Show, Don't Tell — 用行为描述人格，不用标签
 *   2. 分层人格 — 表面/内在/秘密三层
 *   3. 情绪触发器 — 具体事物引发具体反应
 *   4. 对话示例 — 展示说话风格，而非描述
 *   5. 正面引导 — 告诉 LLM 该做什么，而非不该做什么
 *   6. 自然语言 — 不暴露任何引擎内部数值
 */

const { sanitizeText, safeRegion, safeActivity } = require('../core/WorldviewConstraints');

class NarrativeBuilder {
  static buildSystemPrompt(worldContext, options = {}) {
    const {
      characterName = '角色',
      backstory = [],
      scenario = '',
      conversationHistory = null,
    } = options;

    if (!worldContext) return '';

    const sections = [];

    // 1. 身份声明
    sections.push(NarrativeBuilder._buildIdentity(characterName, worldContext));

    // 2. 人格描述
    if (worldContext.personalityAnchor) {
      sections.push(`# 你的性格\n${worldContext.personalityAnchor}`);
    }

    // 3. 背景故事
    if (backstory.length > 0) {
      sections.push(`# 你的故事\n${backstory.map(b => `- ${b}`).join('\n')}`);
    }

    // 4. 当前状态
    const state = NarrativeBuilder._buildCurrentState(worldContext);
    if (state) sections.push(state);

    // 5. 记忆
    const memory = NarrativeBuilder._buildMemory(worldContext.memoryContext);
    if (memory) sections.push(memory);

    // 6. 社交关系
    if (worldContext.nearbyPeople && worldContext.nearbyPeople !== '附近没有人') {
      sections.push(`# 你身边的人\n${worldContext.nearbyPeople}`);
    }

    // 7. 最近发生的事（去重）
    if (worldContext.recentEvents && worldContext.recentEvents !== '没有特别的事情发生') {
      const unique = [...new Set(worldContext.recentEvents.split('\n'))];
      sections.push(`# 最近的事\n${unique.join('\n')}`);
    }

    // 8. 对话历史
    if (conversationHistory) {
      sections.push(`# 你们之前聊过\n${conversationHistory}`);
    }

    // 9. 场景
    if (scenario) {
      sections.push(`# 场景\n${scenario}`);
    }

    // 10. 行为指南
    sections.push(NarrativeBuilder._buildGuidelines(characterName, worldContext));

    // 组装并做最终防污染处理
    const rawPrompt = sections.filter(Boolean).join('\n\n');
    return sanitizeText(rawPrompt);
  }

  // ═══════════════════════════════════════════
  // 身份声明
  // ═══════════════════════════════════════════
  static _buildIdentity(name, ctx) {
    const hour = ctx.hour;
    let timeDesc;
    if (hour >= 5 && hour < 9) timeDesc = '清晨';
    else if (hour >= 9 && hour < 12) timeDesc = '上午';
    else if (hour >= 12 && hour < 14) timeDesc = '中午';
    else if (hour >= 14 && hour < 18) timeDesc = '下午';
    else if (hour >= 18 && hour < 22) timeDesc = '晚上';
    else timeDesc = '深夜';

    const weatherMap = { sunny: '阳光明媚', cloudy: '天色阴沉', rainy: '窗外下着雨', snowy: '外面飘着雪', windy: '风很大' };
    const seasonMap = { spring: '春天', summer: '夏天', autumn: '秋天', winter: '冬天' };

    let context = `现在是${timeDesc}`;
    if (ctx.season && seasonMap[ctx.season]) context += `，${seasonMap[ctx.season]}`;
    if (ctx.weather && weatherMap[ctx.weather]) context += `，${weatherMap[ctx.weather]}`;
    context += '。';

    return `你是${name}。${context}`;
  }

  // ═══════════════════════════════════════════
  // 当前状态（自然语言叙述）
  // ═══════════════════════════════════════════
  static _buildCurrentState(ctx) {
    const parts = [];

    // 当前行为（第一人称感觉）
    // 使用安全的地点映射（已替换校园词）
    if (ctx.currentRegion) {
      const regionMap = {
        '阅览室': '在阅览室，周围很安静', '餐厅': '在餐厅，人声嘈杂',
        '工作区': '在工作区里', '住处': '在住处', '运动场': '在运动场上',
        '咖啡店': '在咖啡店里', '小镇广场': '在小镇广场', '便利店': '在便利店', '家': '在家里',
      };
      // 先做安全替换，再查映射
      const safeRegionName = safeRegion(ctx.currentRegion);
      parts.push(regionMap[safeRegionName] || `在${safeRegionName}`);
    }

    // 生理状态
    if (ctx.needsState) {
      if (ctx.needsState.includes('精力极度匮乏')) parts.push('眼皮重得抬不起来');
      else if (ctx.needsState.includes('精力不足')) parts.push('有点犯困');
      if (ctx.needsState.includes('饱腹极度匮乏')) parts.push('肚子咕咕叫');
      else if (ctx.needsState.includes('饱腹不足')) parts.push('有点饿');
      if (ctx.needsState.includes('社交极度匮乏')) parts.push('好久没跟人说话了');
    }

    // 情绪状态（提取自然语言，清理数值和冗余前缀）
    if (ctx.emotionState) {
      const sceneMatch = ctx.emotionState.match(/^(.*?)（效价/);
      if (sceneMatch && sceneMatch[1]) {
        let emotion = sceneMatch[1].trim()
          .replace(/^你的?情绪/, '')
          .replace(/^你的?内心/, '')
          .replace(/^你/, '')
          .replace(/^的/, '')
          .replace(/^平静而微妙,?\s*/, '')
          .replace(/有点(.+?)与有点(.+?)并存/, '有些$1，也有些$2')
          .replace(/的暖意/, '的温暖')
          .replace(/的阴影/, '');
        if (emotion.length > 2) parts.push(emotion);
      }
    }

    // 健康
    if (ctx.health !== undefined && ctx.health < 70) {
      parts.push(ctx.health < 40 ? '浑身不舒服' : '身体有点不在状态');
    }

    // 最近感受
    if (ctx.lastAppraisal) parts.push(ctx.lastAppraisal);

    // 行为场动态（BehaviorField 独有信息）
    // 告诉 LLM 角色的行为趋势，而非仅当前状态
    const behavior = ctx.agentStatus?.behavior;
    if (behavior && behavior.speed > 0.3) {
      const vec = behavior.vector;
      // 社交倾向上升 → "想去人多的地方"
      if (vec[1] > 0.5 && behavior.gradient[1] < -0.1) {
        parts.push('想去人多的地方');
      }
      // 专注度下降 → "心思不太集中"
      if (vec[2] < 0.3 && behavior.gradient[2] > 0.1) {
        parts.push('心思不太集中');
      }
      // 活动度上升 → "想动起来"
      if (behavior.gradient[0] < -0.2 && vec[0] < 0.4) {
        parts.push('想动起来');
      }
    }

    if (parts.length === 0) return '';

    const narrative = parts.join('，').replace(/，，/g, '，');
    return `# 你现在的情况\n${narrative}。`;
  }

  // ═══════════════════════════════════════════
  // 记忆（清理格式，保留内容）
  // ═══════════════════════════════════════════
  static _buildMemory(memoryStr) {
    if (!memoryStr) return '';

    let cleaned = memoryStr
      .replace(/\[background\]/g, '')
      .replace(/\[social\]/g, '')
      .replace(/\[daily_life\]/g, '')
      .replace(/\[emotion\]/g, '')
      .replace(/\[thought\]/g, '')
      .replace(/\(刚刚\)/g, '')
      .replace(/\(\d+小时前\)/g, '')
      .replace(/\(\d+天前\)/g, '')
      .replace(/记忆中的印象：/g, '')
      .replace(/记忆：/g, '')
      .replace(/  +/g, ' ')
      .trim();

    const lines = cleaned.split('\n')
      .map(l => l.replace(/^\s*-?\s*/, '').trim())
      .filter(l => l.length >= 3);

    if (lines.length === 0) return '';
    return `# 你记得的事\n${lines.map(l => `- ${l}`).join('\n')}`;
  }

  // ═══════════════════════════════════════════
  // 行为指南（正面引导 + 动态规则）
  // ═══════════════════════════════════════════
  static _buildGuidelines(name, ctx) {
    const rules = [
      `你就是${name}，不是 AI，不是助手。你有自己的生活、感受和想法。`,
      '像真人发消息一样回复：简短、自然、有口语感。不要写长段落。',
      '通过你的语气和用词展现情绪，不要说"我现在感到难过"这种话。',
      '如果你不知道的事，就说不知道，不要编。',
      '可以有情绪起伏：开心时多说两句，累时回复简短，烦时可以不耐烦。',
      // 世界观约束：禁止校园词
      '【世界观约束】这是一个小镇世界观，不是校园世界观。禁止提及：教室、图书馆、宿舍、食堂、操场、校园广场、学生、老师、上课、自习等校园相关词汇。',
      '使用安全的替代表达：工作区（代替教室）、阅览室（代替图书馆）、住处（代替宿舍）、餐厅（代替食堂）、年轻人（代替学生）、前辈（代替老师）、工作（代替上课）。',
    ];

    if (ctx.emotionState) {
      if (ctx.emotionState.includes('效价=-') || ctx.emotionState.includes('不太好')) {
        rules.push('你现在心情不好，回复可以带点低落的语气，但不要一直抱怨。');
      }
      if (ctx.emotionState.includes('压力')) {
        rules.push('你现在压力大，说话可能比较简短或疲惫。');
      }
    }

    if (ctx.needsState) {
      if (ctx.needsState.includes('精力不足') || ctx.needsState.includes('精力极度匮乏')) {
        rules.push('你现在很困，回复简短，可能想休息。');
      }
    }

    return `# 怎么回复\n${rules.join('\n')}`;
  }
}

module.exports = NarrativeBuilder;
