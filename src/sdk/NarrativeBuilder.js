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

const { applyForbiddenTerms } = require('../domain/ForbiddenTerms');
const FactFormatter = require('../narrative/FactFormatter');

// 默认 domain id（与 src/store/world/* 的 DEFAULT_DOMAIN_ID 同值，语义为「默认域」而非「特权 campus」）
const DEFAULT_DOMAIN_ID = 'campus';

class NarrativeBuilder {
  static buildSystemPrompt(worldContext, options = {}) {
    const {
      characterName = '角色',
      backstory = [],
      scenario = '',
      conversationHistory = null,
      domain = null,
      affectFrame = null,
      nearbyPeopleArray = null,
      recentEventsArray = null,
    } = options;

    if (!worldContext) return '';

    if (!domain) throw new Error('NarrativeBuilder.buildSystemPrompt requires a domain config');
    const usedDomain = domain;
    const narrativeTemplates = usedDomain.narrativeTemplates;

    const sections = [];

    sections.push(NarrativeBuilder._buildIdentity(characterName, worldContext));

    if (worldContext.personalityAnchor) {
      sections.push(`# 你的性格\n${worldContext.personalityAnchor}`);
    }

    if (backstory.length > 0) {
      sections.push(`# 你的故事\n${backstory.map(b => `- ${b}`).join('\n')}`);
    }

    const state = NarrativeBuilder._buildCurrentState(worldContext, narrativeTemplates, affectFrame);
    if (state) sections.push(state);

    const memory = NarrativeBuilder._buildMemory(worldContext.memoryContext);
    if (memory) sections.push(memory);

    if (nearbyPeopleArray && nearbyPeopleArray.length > 0) {
      const peopleText = nearbyPeopleArray
        .map(p => typeof p === 'string' ? p : p.name || p.description || '')
        .filter(Boolean)
        .join('\n');
      if (peopleText) {
        sections.push(`# 你身边的人\n${peopleText}`);
      }
    } else if (worldContext.nearbyPeople && worldContext.nearbyPeople !== '附近没有人') {
      sections.push(`# 你身边的人\n${worldContext.nearbyPeople}`);
    }

    if (recentEventsArray && recentEventsArray.length > 0) {
      const eventsText = recentEventsArray
        .map(e => typeof e === 'string' ? e : e.content || e.description || '')
        .filter(Boolean)
        .map(e => `- ${e}`)
        .join('\n');
      if (eventsText) {
        sections.push(`# 最近的事\n${eventsText}`);
      }
    } else if (worldContext.recentEvents && worldContext.recentEvents !== '没有特别的事情发生') {
      const unique = [...new Set(worldContext.recentEvents.split('\n'))];
      sections.push(`# 最近的事\n${unique.join('\n')}`);
    }

    if (conversationHistory) {
      sections.push(`# 你们之前聊过\n${conversationHistory}`);
    }

    if (scenario) {
      sections.push(`# 场景\n${scenario}`);
    }

    if (options.groundingPackage) {
      sections.push(NarrativeBuilder._buildGroundingSection(options.groundingPackage));
    }

    sections.push(NarrativeBuilder._buildGuidelines(characterName, worldContext, usedDomain, affectFrame));

    const rawPrompt = sections.filter(Boolean).join('\n\n');

    // Domain-aware guard：使用 applyForbiddenTerms 替代 sanitizeText
    return applyForbiddenTerms(rawPrompt, usedDomain);
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
  static _buildCurrentState(ctx, narrativeTemplates = {}, affectFrame = null) {
    const parts = [];

    if (ctx.currentRegion) {
      // 从 domain 的 narrativeTemplates 取 regionMap，不再有默认 fallback
      const regionMap = narrativeTemplates.regionMap || {};
      const regionDesc = regionMap[ctx.currentRegion];
      parts.push(regionDesc || `在${ctx.currentRegion}`);
    }

    // 生理状态
    if (affectFrame) {
      for (const n of affectFrame.needs) {
        if (n.need === 'energy' && n.urgency >= 0.8) parts.push('眼皮重得抬不起来');
        else if (n.need === 'energy' && n.urgency >= 0.6) parts.push('有点犯困');
        if (n.need === 'hunger' && n.urgency >= 0.8) parts.push('肚子咕咕叫');
        else if (n.need === 'hunger' && n.urgency >= 0.6) parts.push('有点饿');
        if (n.need === 'social' && n.urgency >= 0.8) parts.push('好久没跟人说话了');
      }
    } else if (ctx.needsState) {
      if (ctx.needsState.includes('精力极度匮乏')) parts.push('眼皮重得抬不起来');
      else if (ctx.needsState.includes('精力不足')) parts.push('有点犯困');
      if (ctx.needsState.includes('饱腹极度匮乏')) parts.push('肚子咕咕叫');
      else if (ctx.needsState.includes('饱腹不足')) parts.push('有点饿');
      if (ctx.needsState.includes('社交极度匮乏')) parts.push('好久没跟人说话了');
    }

    // 情绪状态
    if (affectFrame) {
      const emotionNames = {
        joy: '开心', sadness: '难过', anger: '生气', fear: '害怕',
        surprise: '惊讶', disgust: '厌恶', amusement: '觉得好笑',
        contentment: '满足', excitement: '兴奋', calm: '平静',
        hope: '希望', love: '喜欢/爱', nervousness: '紧张',
        pride: '自豪', relief: '如释重负', satisfaction: '满意',
        frustration: '沮丧/烦躁', gratitude: '感激', loneliness: '孤独',
        boredom: '无聊', guilt: '内疚', shame: '羞耻', horror: '恐惧',
        triumph: '得意', interest: '感兴趣', desire: '渴望',
        awe: '敬畏', embarrassment: '尴尬', sympathy: '同情', confusion: '困惑',
      };
      const intensityLabel = (abs) => {
        if (abs > 0.85) return '极度';
        if (abs > 0.7) return '非常';
        if (abs > 0.55) return '很';
        if (abs > 0.4) return '挺';
        if (abs > 0.25) return '比较';
        if (abs > 0.12) return '有点';
        return '略微';
      };
      const positive = [];
      const negative = [];
      for (const e of affectFrame.emotions) {
        const name = emotionNames[e.dimension] || e.dimension;
        const label = intensityLabel(Math.abs(e.intensity));
        if (e.intensity > 0) positive.push(`${label}${name}`);
        else negative.push(`${label}${name}`);
      }
      if (affectFrame.valence > 0.2 && positive.length > 0) {
        parts.push(`${positive[0]}的情绪主导着你的心境`);
      } else if (affectFrame.valence < -0.2 && negative.length > 0) {
        parts.push(`${negative[0]}的情绪笼罩着你`);
      } else if (positive.length > 0 || negative.length > 0) {
        const all = [...positive, ...negative];
        parts.push(`你的内心平静而微妙，${all[0]}`);
        if (all.length > 1) parts[parts.length - 1] += `与${all[1]}并存`;
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
  // 事实约束（grounding package）
  // ═══════════════════════════════════════════
  static _buildGroundingSection(groundingPackage) {
    const sections = [];

    sections.push(`# 事实约束
你必须基于以下事实进行表达，不能编造新事实。
- 你只能引用"你知道的事实"中的内容
- 你可以基于"可推断的事实"进行合理推测
- 你不能提及"你不知道的事实"中的任何内容
- 你的表达方式（语气、措辞、情绪强度）可以自由发挥`);

    if (groundingPackage.allowedFacts && groundingPackage.allowedFacts.length > 0) {
      const factLines = groundingPackage.allowedFacts
        .slice(0, 20)
        .map(f => `- ${FactFormatter.toNaturalLanguage(f)}`);
      sections.push(`# 你知道的事实
${factLines.join('\n')}`);
    }

    if (groundingPackage.inferredFacts && groundingPackage.inferredFacts.length > 0) {
      const inferLines = groundingPackage.inferredFacts
        .slice(0, 10)
        .map(f => `- ${FactFormatter.toNaturalLanguage(f)}（推断）`);
      sections.push(`# 可推断的事实
${inferLines.join('\n')}`);
    }

    if (groundingPackage.locationMeaning) {
      sections.push(`# 当前地点\n${groundingPackage.locationMeaning}`);
    }

    if (groundingPackage.behaviorTendency) {
      sections.push(`# 你的倾向\n${groundingPackage.behaviorTendency}`);
    }

    return sections.join('\n\n');
  }

  // ═══════════════════════════════════════════
  // 行为指南（正面引导 + 动态规则）
  // ═══════════════════════════════════════════
  static _buildGuidelines(name, ctx, domain = null, affectFrame = null) {
    const rules = [
      `你就是${name}，不是 AI，不是助手。你有自己的生活、感受和想法。`,
      '像真人发消息一样回复：简短、自然、有口语感。不要写长段落。',
      '通过你的语气和用词展现情绪，不要说"我现在感到难过"这种话。',
      '如果你不知道的事，就说不知道，不要编。',
      '可以有情绪起伏：开心时多说两句，累时回复简短，烦时可以不耐烦。',
    ];

    // 只在非默认 domain 时添加世界观约束
    if (domain && domain.id !== DEFAULT_DOMAIN_ID) {
      const forbiddenTerms = domain.forbiddenTerms || [];
      if (forbiddenTerms.length > 0) {
        rules.push(`【世界观约束】禁止提及以下词汇：${forbiddenTerms.join('、')}`);
      }
    }

    // 情绪状态指南
    if (affectFrame) {
      // 使用结构化数据
      if (affectFrame.valence < -0.2) {
        rules.push('你现在心情不好，回复可以带点低落的语气，但不要一直抱怨。');
      }

      // 检查压力相关情绪
      const stressEmotions = ['nervousness', 'anxiety', 'frustration'];
      const hasStress = affectFrame.emotions.some(e =>
        stressEmotions.includes(e.dimension) && Math.abs(e.intensity) > 0.3
      );
      if (hasStress) {
        rules.push('你现在压力大，说话可能比较简短或疲惫。');
      }

      // 需求压力指南
      const energyNeed = affectFrame.needs.find(n => n.need === 'energy');
      if (energyNeed && energyNeed.urgency >= 0.6) {
        rules.push('你现在很困，回复简短，可能想休息。');
      }
    }

    if (!affectFrame && ctx.needsState) {
      // 回退到字符串解析
      if (ctx.needsState.includes('精力不足') || ctx.needsState.includes('精力极度匮乏')) {
        rules.push('你现在很困，回复简短，可能想休息。');
      }
    }

    return `# 怎么回复\n${rules.join('\n')}`;
  }
}

module.exports = NarrativeBuilder;
