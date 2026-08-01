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
const { DEFAULT_DOMAIN_ID } = require('../config/defaults');
const { FactType } = require('../canon/FactSchema');

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

    // In grounded mode the grounding package is the authority for expressible
    // state. The legacy compiler also contains inferred mood/need guidance
    // that the checker cannot always verify, so do not mix the two sources.
    const state = options.groundingPackage
      ? ''
      : NarrativeBuilder._buildCurrentState(worldContext, narrativeTemplates, affectFrame);
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

    sections.push(NarrativeBuilder._buildGuidelines(
      characterName,
      worldContext,
      usedDomain,
      options.groundingPackage ? null : affectFrame,
      { grounded: Boolean(options.groundingPackage) },
    ));

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
      // R24 P1 fix: categorize emotions by dimension polarity (positive/negative valence),
      // NOT by intensity direction (above/below baseline). Previously, sadness with
      // intensity>0 went into positive[] and joy with intensity<0 went into negative[],
      // producing wrong narrative descriptions (e.g. "sadness dominates" when valence>0).
      const POSITIVE_DIMS = new Set(['joy', 'contentment', 'satisfaction', 'excitement',
        'calm', 'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement']);
      const NEGATIVE_DIMS = new Set(['sadness', 'anger', 'fear', 'disgust',
        'nervousness', 'frustration', 'guilt', 'shame', 'horror', 'boredom', 'loneliness']);
      // Negated names for positive-polarity emotions when below baseline
      const negEmotionNames = {
        joy: '不开心', contentment: '不满足', calm: '不安',
        excitement: '低落', hope: '失望', satisfaction: '不满意',
        love: '不喜欢', pride: '自卑', relief: '仍感压力',
        triumph: '挫败', interest: '无聊', amusement: '无趣',
        gratitude: '不满', awe: '麻木',
      };
      // Negated names for negative-polarity emotions when below baseline
      // (absence of negative → positive valence)
      const negNegEmotionNames = {
        sadness: '不再难过', anger: '不再生气', fear: '不再害怕',
        disgust: '不再厌恶', nervousness: '不再紧张',
        frustration: '不再烦躁', guilt: '不再内疚', shame: '不再羞耻',
        horror: '不再恐惧', boredom: '不再无聊', loneliness: '不再孤独',
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
        const label = intensityLabel(Math.abs(e.intensity));
        const isPositiveDim = POSITIVE_DIMS.has(e.dimension);
        const isNegativeDim = NEGATIVE_DIMS.has(e.dimension);

        if (isPositiveDim) {
          if (e.intensity > 0) {
            // Positive emotion above baseline → feels good
            positive.push(`${label}${emotionNames[e.dimension] || e.dimension}`);
          } else {
            // Positive emotion below baseline → feels bad (absence of positive)
            negative.push(`${label}${negEmotionNames[e.dimension] || emotionNames[e.dimension] || e.dimension}`);
          }
        } else if (isNegativeDim) {
          if (e.intensity > 0) {
            // Negative emotion above baseline → feels bad
            negative.push(`${label}${emotionNames[e.dimension] || e.dimension}`);
          } else {
            // Negative emotion below baseline → feels good (absence of negative)
            positive.push(`${label}${negNegEmotionNames[e.dimension] || emotionNames[e.dimension] || e.dimension}`);
          }
        } else {
          // Neutral/ambiguous dimension: use intensity direction
          if (e.intensity > 0) {
            positive.push(`${label}${emotionNames[e.dimension] || e.dimension}`);
          } else {
            negative.push(`${label}${emotionNames[e.dimension] || e.dimension}`);
          }
        }
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
  // 事实约束（grounding package）— v2.5 evidence-aware
  // ═══════════════════════════════════════════
  static _buildGroundingSection(groundingPackage) {
    const sections = [];

    sections.push(`# 事实约束
你必须基于以下事实进行表达，不能编造新事实。
- 你只能引用"你知道的事实"中的内容
- 你不能提及"你不知道的事实"中的任何内容
- 对于来源不同的事实，表达方式有约束：
  - 直接经历的事实：可以自由表达
  - 亲眼看到的事实：可以自由表达
  - 听闻的事实（标注"听闻"）：须用"听说"等表述
  - 别人告诉你的事实（标注来源）：须用"XX告诉我"等表述
  - 推断的事实（标注"推测"）：须用"我推测"或"大概"等表述
- 你的表达方式（语气、措辞、情绪强度）可以自由发挥`);

    // Filter out STATIC_ENV facts — world-level environment facts (e.g., "图书馆有书架")
    // are not agent-perceived knowledge and must not appear in grounding.
    const allowedFacts = (groundingPackage.allowedFacts || []).filter(
      fact => fact.type !== FactType.STATIC_ENV,
    );

    const safeStateLines = NarrativeBuilder._buildSafeStateExpressionFrame(allowedFacts);
    if (safeStateLines.length > 0) {
      sections.push(
        '# 可直接表达的当前事实\n' +
        '以下句子与当前事实逐项一致。优先用其中一条自然地回答用户；不要为了写得更长而补充未列事实。\n' +
        safeStateLines.map(line => `- ${line}`).join('\n'),
      );
    }

    if (allowedFacts.length > 0) {
      // v2.5: group by evidence source for clarity
      const grouped = NarrativeBuilder._groupFactsBySource(allowedFacts);
      const factLines = [];

      // direct/observed: no annotation needed
      if (grouped.direct.length > 0) {
        for (const f of grouped.direct.slice(0, 15)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }
      if (grouped.observed.length > 0) {
        for (const f of grouped.observed.slice(0, 10)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }

      // overheard: annotated
      if (grouped.overheard.length > 0) {
        for (const f of grouped.overheard.slice(0, 5)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguageWithSource(f)}`);
        }
      }

      // told: annotated with source
      if (grouped.told.length > 0) {
        for (const f of grouped.told.slice(0, 5)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguageWithSource(f)}`);
        }
      }

      // inferred: annotated as "推测"
      if (grouped.inferred.length > 0) {
        for (const f of grouped.inferred.slice(0, 5)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguageWithSource(f)}`);
        }
      }

      // Fallback for facts without _evidence (backward compat)
      if (grouped.unknown.length > 0) {
        for (const f of grouped.unknown.slice(0, 10)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }

      // If nothing was rendered (shouldn't happen but defensive), render all
      if (factLines.length === 0) {
        for (const f of allowedFacts.slice(0, 20)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }

      sections.push(`# 你知道的事实
${factLines.join('\n')}`);
    }

    // v2.5: inferredFacts is always empty (B1 downgrade), no section rendered

    if (groundingPackage.locationMeaning) {
      sections.push(`# 当前地点\n${groundingPackage.locationMeaning}`);
    }

    if (groundingPackage.behaviorTendency) {
      sections.push(`# 你的倾向\n${groundingPackage.behaviorTendency}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Build compact first-person state sentences supported by the same
   * AGENT_STATE fact the checker uses. Emotion and need prose are omitted:
   * today they are not fact-bound checker claims.
   *
   * @param {Object[]} facts
   * @returns {string[]}
   * @private
   */
  static _buildSafeStateExpressionFrame(facts) {
    const stateFact = facts.find(fact =>
      fact && fact.type === FactType.AGENT_STATE &&
      (fact.position || fact.region)
    );
    if (!stateFact) return [];

    const location = stateFact.position || stateFact.region;
    const lines = [`我在${location}。`];
    if (stateFact.state) lines.push(`我在${location}，正在${stateFact.state}。`);
    return lines;
  }

  /**
   * Group allowedFacts by evidence source
   * @param {Object[]} facts
   * @returns {Object} { direct, observed, overheard, told, inferred, unknown }
   * @private
   */
  static _groupFactsBySource(facts) {
    const groups = { direct: [], observed: [], overheard: [], told: [], inferred: [], unknown: [] };
    for (const f of facts) {
      const src = f._evidence?.source;
      if (!src) { groups.unknown.push(f); continue; }
      if (groups[src]) { groups[src].push(f); }
      else { groups.unknown.push(f); }
    }
    return groups;
  }


  // ═══════════════════════════════════════════
  // 行为指南（正面引导 + 动态规则）
  // ═══════════════════════════════════════════
  static _buildGuidelines(name, ctx, domain = null, affectFrame = null, options = {}) {
    const grounded = options.grounded === true;
    const rules = [
      `你就是${name}，不是 AI，不是助手。你有自己的生活、感受和想法。`,
      '像真人发消息一样回复：简短、自然、有口语感。直接回答用户的问题，不要写长段落。',
      grounded
        ? '只表达“你知道的事实”和“可直接表达的当前事实”中有依据的内容。'
        : '通过你的语气和用词展现情绪，不要说"我现在感到难过"这种话。',
      '如果你不知道的事，就说不知道，不要编。',
      grounded
        ? '如果事实不足以回答，就简短承认不知道；不要用臆测补全。'
        : '可以有情绪起伏：开心时多说两句，累时回复简短，烦时可以不耐烦。',
    ];

    // 只在非默认 domain 时添加世界观约束
    if (domain && domain.id !== DEFAULT_DOMAIN_ID) {
      const forbiddenTerms = domain.forbiddenTerms || [];
      if (forbiddenTerms.length > 0) {
        rules.push(`【世界观约束】禁止提及以下词汇：${forbiddenTerms.join('、')}`);
      }
    }

    // 情绪状态指南
    if (!options.grounded && affectFrame) {
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

    if (!options.grounded && !affectFrame && ctx.needsState) {
      // 回退到字符串解析
      if (ctx.needsState.includes('精力不足') || ctx.needsState.includes('精力极度匮乏')) {
        rules.push('你现在很困，回复简短，可能想休息。');
      }
    }

    return `# 怎么回复\n${rules.join('\n')}`;
  }
}

module.exports = NarrativeBuilder;
