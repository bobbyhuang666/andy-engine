/**
 * ClaimExtractor — 从 LLM 输出中提取结构化 claim
 *
 * 第一阶段：确定性中文/英文混合启发式，不引入新 npm 依赖。
 * 提取的 claim 供 GroundingChecker 做结构化校验。
 *
 * 规则：
 *   - confidence < 0.65 的 claim 不进入 blocking violation，只供调试。
 *   - polarity === uncertain 的 claim 不按确定事实硬拦截。
 *   - 否定 claim 不能被当作正向 claim。
 */

const { diagnostics } = require('../shared/Diagnostics');

// ─── 情绪词库 ───
const EMOTION_WORDS = [
  '开心', '难过', '生气', '害怕', '惊讶', '紧张', '沮丧', '无聊', '孤独',
  '兴奋', '满足', '烦躁', '焦虑', '疲惫', '害羞', '尴尬', '内疚', '失落',
  '感动', '愤怒', '伤心', '心烦', '郁闷', '寂寞', '委屈', '痛苦',
  '快乐', '幸福', '感激', '后悔', '绝望', '崩溃', '喜悦', '欣慰',
  '平静', '冷静', '期待', '感兴趣', '厌恶', '恐惧', '渴望',
  '同情', '困惑', '得意', '敬畏',
];

// ─── 需求词库 ───
const NEEDS_WORDS = ['饿了', '困了', '累了', '想休息', '想吃', '想睡', '口渴', '头疼', '不舒服'];

// ─── 活动词库 ───
const ACTIVITY_WORDS = [
  '看书', '学习', '休息', '工作', '运动', '吃饭', '聊天', '散步', '睡觉',
  '跑步', '锻炼', '做饭', '打扫', '练琴', '画画', '上网', '打游戏',
];

// ─── 否定标记 ───
const NEGATION_MARKERS = ['不', '没', '没有', '没有在', '不在', '不是', '别', '并未', '未尝'];

// ─── 不确定标记 ───
const UNCERTAINTY_MARKERS = ['可能', '大概', '也许', '或许', '应该', '似乎', '看来', '想必', '八成', '十有八九'];

// ─── 来源标记 ───
const SOURCE_TOLD_MARKERS = ['听说', '告诉我', '告诉过', '说的', '跟我说的', '跟我讲', '说是', '据说', '风闻', '传闻'];
const SOURCE_INFERRED_MARKERS = ['推测', '估计', '猜测', '应该', '看来', '想必', '八成'];
const SOURCE_OBSERVED_MARKERS = ['我看到', '看到', '看见', '观察到', '注意到'];
const SOURCE_SELF_MARKERS = ['我觉得', '我认为', '我发现', '我知道'];

// ─── 时间词库 ───
const TIME_WORDS = ['凌晨', '早上', '上午', '中午', '下午', '傍晚', '晚上', '深夜', '昨天', '今天', '刚才', '刚刚'];

// ─── 常见非角色名 ───
const NON_AGENT_WORDS = ['大家', '别人', '对方', '朋友', '人们', '我们', '他们', '她们', '自己', '某人', '有人'];

// ─── 常见非地点词 ───
const NON_LOCATION_WORDS = ['这里', '那里', '哪里', '外面', '里面', '旁边', '对面', '上面', '下面', '附近'];

// ─── 活动后缀过滤 ───
const ACTIVITY_SUFFIXES = ['看书', '学习', '吃饭', '聊天', '休息', '睡觉', '工作', '运动', '跑步', '锻炼', '散步'];

// ─── 代词（不可解析为具体 agentId） ───
const PRONOUN_WORDS = ['他', '她', '它', '你', '他们', '她们', '它们', '你们', '咱', '咱们'];

class ClaimExtractor {
  /**
   * @param {string} agentId - 说话者 agentId
   * @param {Object} agentNames - agentId → displayName 映射
   */
  constructor(agentId, agentNames = {}) {
    this.selfId = agentId;
    this.agentNames = agentNames;
    this.nameToId = this._buildNameLookup(agentNames);
  }

  /**
   * Build lowercase displayName → agentId lookup.
   * @private
   */
  _buildNameLookup(agentNames) {
    const map = new Map();
    for (const [id, name] of Object.entries(agentNames)) {
      if (name) {
        map.set(name.toLowerCase(), id);
      }
      map.set(id.toLowerCase(), id);
    }
    return map;
  }

  /**
   * 从 LLM 输出中提取所有 claim。
   * @param {string} llmOutput
   * @param {Object} [options]
   * @param {boolean} [options.includePronouns] - 当 true 时，代词 subject 也产出 claim（不 continue）。默认 false（v2 行为）。
   * @returns {Array<Object>} claim objects
   */
  extract(llmOutput, options = {}) {
    if (!llmOutput || typeof llmOutput !== 'string') return [];

    const includePronouns = options.includePronouns === true;

    const claims = [];
    claims.push(...this._extractLocationClaims(llmOutput, includePronouns));
    claims.push(...this._extractEventClaims(llmOutput));
    claims.push(...this._extractRelationshipClaims(llmOutput));
    claims.push(...this._extractStateClaims(llmOutput, includePronouns));
    claims.push(...this._extractSourceClaims(llmOutput));
    claims.push(...this._extractTimeClaims(llmOutput));

    return claims;
  }

  // ═══════════════════════════════════════════
  // Location claims
  // ═══════════════════════════════════════════

  _extractLocationClaims(text, includePronouns = false) {
    const claims = [];
    // 匹配模式：AgentName [在|去了|到过|到了] LocationName
    const pattern = /([一-龥]{2,4}|[A-Za-z]{2,10})\s*(在|去了|到过|到了)\s*([一-龥]{2,6})/g;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const agentName = match[1];
      const verb = match[2];
      const location = match[3];

      // Strip trailing negation/uncertainty markers that the regex
      // may have greedily consumed as part of the name.
      const { cleanedName, strippedNegation, strippedUncertainty, strippedSource } = this._stripTrailingMarkers(agentName);

      // 过滤常见非地点词
      if (NON_LOCATION_WORDS.includes(location)) continue;
      if (ACTIVITY_SUFFIXES.some(s => location.endsWith(s))) continue;
      // 过滤常见非角色词
      if (NON_AGENT_WORDS.includes(cleanedName)) continue;

      const canonicalId = this._resolveAgentName(cleanedName);
      // Self pronoun '我' is not in nameToId but represents the speaker
      const isSelf = cleanedName === '我' || cleanedName === this.selfId || canonicalId === this.selfId;
      const subject = isSelf ? this.selfId : (canonicalId || cleanedName);

      // Skip claims where subject is a pronoun that can't be resolved to an agentId
      // When includePronouns=true, emit as pronoun claim instead of skipping
      if (!isSelf && !canonicalId && PRONOUN_WORDS.includes(cleanedName)) {
        if (!includePronouns) continue;
        // Pronoun claim: subject = pronoun raw, id=null, extractionMethod='extractor-pronoun'
        const negation = strippedNegation || this._checkNegation(text, match.index);
        const polarity = negation ? 'negative' : 'affirmative';
        const uncertain = this._checkUncertainty(text, match.index) || strippedUncertainty;
        const predicate = verb === '在' ? 'is_at' : 'went_to';
        const sourceMarker = strippedSource ? 'told' : this._checkSourceMarker(text, match.index);

        let confidence = 0.5; // base low confidence for unresolved pronoun
        if (negation) confidence -= 0.1;
        if (uncertain) confidence -= 0.15;

        claims.push({
          type: 'location',
          subject: cleanedName, // pronoun raw string, no canonical id
          predicate,
          object: location,
          polarity: uncertain ? 'uncertain' : polarity,
          evidenceRequired: 'observed',
          confidence,
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
          sourceMarker,
          extractionMethod: 'extractor-pronoun',
        });
        continue;
      }

      // 检测否定 — primary from stripped marker, secondary from prefix check
      const negation = strippedNegation || this._checkNegation(text, match.index);
      const polarity = negation ? 'negative' : 'affirmative';

      // 检测不确定 — primary from stripped marker, secondary from prefix check
      const uncertain = this._checkUncertainty(text, match.index) || strippedUncertainty;

      // 动词 → predicate
      const predicate = verb === '在' ? 'is_at' : 'went_to';

      // 检测来源标记
      const sourceMarker = strippedSource ? 'told' : this._checkSourceMarker(text, match.index);

      // confidence: 已知角色 + 已知区域 → 高, 否则中等
      let confidence = 0.85;
      if (!canonicalId) confidence -= 0.15; // 未知角色降低置信度
      if (negation) confidence -= 0.1;
      if (uncertain) confidence -= 0.15;

      const evidenceRequired = isSelf ? 'self' : 'observed';

      claims.push({
        type: 'location',
        subject,
        predicate,
        object: location,
        polarity: uncertain ? 'uncertain' : polarity,
        evidenceRequired,
        confidence,
        sourceSpan: {
          start: match.index,
          end: match.index + match[0].length,
          raw: match[0],
        },
        sourceMarker,
      });
    }

    // 也匹配 "我在XX" 模式（self-only location）
    const selfPattern = /我\s*(在|去了|到过|到了)\s*([一-龥]{2,6})/g;
    while ((match = selfPattern.exec(text)) !== null) {
      // 避免与上面的通用模式重复
      const prevMatch = claims.find(c =>
        c.type === 'location' &&
        c.subject === this.selfId &&
        c.sourceSpan.start <= match.index + 5 &&
        c.sourceSpan.end >= match.index - 5
      );
      if (prevMatch) continue;

      const verb = match[1];
      const location = match[2];

      if (NON_LOCATION_WORDS.includes(location)) continue;
      if (ACTIVITY_SUFFIXES.some(s => location.endsWith(s))) continue;

      const negation = this._checkNegation(text, match.index);
      const polarity = negation ? 'negative' : 'affirmative';
      const uncertain = this._checkUncertainty(text, match.index);
      const predicate = verb === '在' ? 'is_at' : 'went_to';

      let confidence = 0.9;
      if (negation) confidence -= 0.1;
      if (uncertain) confidence -= 0.15;

      claims.push({
        type: 'location',
        subject: this.selfId,
        predicate,
        object: location,
        polarity: uncertain ? 'uncertain' : polarity,
        evidenceRequired: 'self',
        confidence,
        sourceSpan: {
          start: match.index,
          end: match.index + match[0].length,
          raw: match[0],
        },
      });
    }

    // 也匹配 "我没有/没/不/不在 在/去了XX" 模式（self-only negation location）
    const selfNegPattern = /我(?:没有|没|不|不在)\s*(在|去了|到过|到了)\s*([一-龥]{2,6})/g;
    while ((match = selfNegPattern.exec(text)) !== null) {
      // 避免与上面的通用/self模式重复
      const prevMatch = claims.find(c =>
        c.type === 'location' &&
        c.subject === this.selfId &&
        c.sourceSpan.start <= match.index + 5 &&
        c.sourceSpan.end >= match.index - 5
      );
      if (prevMatch) continue;

      const verb = match[1];
      const location = match[2];

      if (NON_LOCATION_WORDS.includes(location)) continue;
      if (ACTIVITY_SUFFIXES.some(s => location.endsWith(s))) continue;

      const polarity = 'negative';
      const uncertain = this._checkUncertainty(text, match.index);
      const predicate = verb === '在' ? 'is_at' : 'went_to';

      let confidence = 0.85;
      if (uncertain) confidence -= 0.15;

      claims.push({
        type: 'location',
        subject: this.selfId,
        predicate,
        object: location,
        polarity: uncertain ? 'uncertain' : polarity,
        evidenceRequired: 'self',
        confidence,
        sourceSpan: {
          start: match.index,
          end: match.index + match[0].length,
          raw: match[0],
        },
      });
    }

    // Source-attributed pronoun location: "X告诉我他/她/TA去了Y" →
    // extract location claim attributed to X (the source subject)
    const toldMarkersList = SOURCE_TOLD_MARKERS.filter(m => m.length <= 3);
    for (const agentName of Object.values(this.agentNames)) {
      const safeName = this._escapeRegex(agentName);
      for (const marker of toldMarkersList) {
        const safeMarker = this._escapeRegex(marker);
        const srcPattern = new RegExp(`${safeName}${safeMarker}(他|她|它|你|你们)\s*(去了|到了)\s*([一-龥]{2,6})`, 'g');
        while ((match = srcPattern.exec(text)) !== null) {
          const verb = match[2];
          const location = match[3];

          if (NON_LOCATION_WORDS.includes(location)) continue;
          if (ACTIVITY_SUFFIXES.some(s => location.endsWith(s))) continue;

          const agentId = this._resolveAgentName(agentName);
          const subject = agentId || agentName;
          const predicate = verb === '去了' ? 'went_to' : 'went_to';

          // Dedup: skip if this location was already extracted near this position
          const dup = claims.find(c =>
            c.type === 'location' &&
            c.object === location &&
            Math.abs(c.sourceSpan.start - match.index) < 8
          );
          if (dup) continue;

          claims.push({
            type: 'location',
            subject,
            predicate,
            object: location,
            polarity: 'affirmative',
            evidenceRequired: 'told',
            confidence: 0.75,
            sourceMarker: 'told',
            sourceSpan: {
              start: match.index,
              end: match.index + match[0].length,
              raw: match[0],
            },
          });
        }
      }
    }

    // ── Standalone pronoun location claims (includePronouns only) ──
    // Main regex requires 2-4 Chinese chars for agent names, so single-char
    // pronouns like "他" won't match. Add a pronoun-specific pattern.
    if (includePronouns) {
      const pronounPattern = /((?:[他她它你]|你们|他们|她们|它们|咱|咱们)(?:们)?)\s*(在|去了|到过|到了)\s*([一-龥]{2,6})/g;
      let pMatch;
      while ((pMatch = pronounPattern.exec(text)) !== null) {
        const pronoun = pMatch[1];
        const verb = pMatch[2];
        const location = pMatch[3];

        if (NON_LOCATION_WORDS.includes(location)) continue;
        if (ACTIVITY_SUFFIXES.some(s => location.endsWith(s))) continue;

        // Dedup: skip if already extracted near this position
        const dup = claims.find(c =>
          c.type === 'location' &&
          c.sourceSpan &&
          Math.abs(c.sourceSpan.start - pMatch.index) < 3
        );
        if (dup) continue;

        const negation = this._checkNegation(text, pMatch.index);
        const polarity = negation ? 'negative' : 'affirmative';
        const uncertain = this._checkUncertainty(text, pMatch.index);
        const predicate = verb === '在' ? 'is_at' : 'went_to';
        const sourceMarker = this._checkSourceMarker(text, pMatch.index);

        let confidence = 0.5;
        if (negation) confidence -= 0.1;
        if (uncertain) confidence -= 0.15;

        claims.push({
          type: 'location',
          subject: pronoun,
          predicate,
          object: location,
          polarity: uncertain ? 'uncertain' : polarity,
          evidenceRequired: 'observed',
          confidence,
          sourceSpan: {
            start: pMatch.index,
            end: pMatch.index + pMatch[0].length,
            raw: pMatch[0],
          },
          sourceMarker,
          extractionMethod: 'extractor-pronoun',
        });
      }
    }

    return claims;
  }

  // ═══════════════════════════════════════════
  // Event claims
  // ═══════════════════════════════════════════

  _extractEventClaims(text) {
    const claims = [];

    // "那次XX" / "上次XX" — 引用过去事件
    const refPatterns = [/那次(.{2,20})/g, /上次(.{2,20})/g];
    for (const pattern of refPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const eventRef = match[1];
        if (eventRef.length < 2) continue;

        claims.push({
          type: 'event',
          subject: null,
          predicate: 'refers_to',
          object: eventRef,
          polarity: 'affirmative',
          evidenceRequired: 'any',
          confidence: 0.7,
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
      }
    }

    // "刚刚XX了" / "刚才XX了" — 声称新事件
    const creationPatterns = [/刚刚(.{2,20})了/g, /刚才(.{2,20})了/g];
    for (const pattern of creationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const eventContent = match[1];
        if (eventContent.length < 2) continue;

        const negation = this._checkNegation(text, match.index);

        claims.push({
          type: 'event',
          subject: null,
          predicate: 'did',
          object: eventContent,
          polarity: negation ? 'negative' : 'affirmative',
          evidenceRequired: 'any',
          confidence: negation ? 0.5 : 0.8,
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
      }
    }

    return claims;
  }

  // ═══════════════════════════════════════════
  // Relationship claims
  // ═══════════════════════════════════════════

  _extractRelationshipClaims(text) {
    const claims = [];

    const patterns = [
      /成为(.{2,6}?朋友)/g,
      /变成(.{2,6}?关系)/g,
      /分手了/g,
      /在一起了/g,
      /结婚了/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let predicate, object;

        if (match[1]) {
          predicate = 'has_relationship';
          object = match[1];
        } else if (match[0] === '分手了') {
          predicate = 'has_relationship';
          object = '分手';
        } else if (match[0] === '在一起了') {
          predicate = 'has_relationship';
          object = '在一起';
        } else if (match[0] === '结婚了') {
          predicate = 'has_relationship';
          object = '婚姻';
        } else {
          predicate = 'has_relationship';
          object = match[0];
        }

        claims.push({
          type: 'relationship',
          subject: this.selfId,
          predicate,
          object,
          polarity: 'affirmative',
          evidenceRequired: 'any',
          confidence: 0.8,
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
      }
    }

    return claims;
  }

  // ═══════════════════════════════════════════
  // State claims (emotion / needs / activity)
  // ═══════════════════════════════════════════

  _extractStateClaims(text, includePronouns = false) {
    const claims = [];

    // 检查每个已知角色
    const allAgentNames = [this.selfId, ...Object.values(this.agentNames)];
    const checkedNames = new Set(); // 避免重复检查同一角色

    for (const name of allAgentNames) {
      if (checkedNames.has(name)) continue;
      checkedNames.add(name);

      const isSelf = name === this.selfId;
      const displayName = name; // preserve for rawSubject
      const subject = this._resolveToAgentId(name);

      // Strip trailing markers from name — markers may be embedded in the name itself
      const { cleanedName: strippedLoopName, strippedNegation: loopNegation, strippedUncertainty: loopUncertainty } = this._stripTrailingMarkers(name);
      const safeName = this._escapeRegex(strippedLoopName);

      // ── Emotion: Name + (很/有点/非常/挺/比较|感到|觉得) + emotion ──
      for (const emotion of EMOTION_WORDS) {
        const emotionPatterns = [
          new RegExp(`${safeName}(很|有点|非常|挺|比较|极度|特别|真)${emotion}`),
          new RegExp(`${safeName}感到${emotion}`),
          new RegExp(`${safeName}觉得${emotion}`),
        ];
        for (const pattern of emotionPatterns) {
          const match = pattern.exec(text);
          if (!match) continue;

          // Primary from stripped marker, secondary from prefix check
          const negation = loopNegation || this._checkNegation(text, match.index);
          const uncertain = loopUncertainty || this._checkUncertainty(text, match.index);

          let confidence = 0.85;
          if (!isSelf && !this.nameToId.has(name.toLowerCase())) confidence -= 0.1;
          if (negation) confidence -= 0.1;
          if (uncertain) confidence -= 0.15;

          claims.push({
            type: 'state',
            subject,
            rawSubject: displayName,
            predicate: 'feels',
            object: emotion,
            polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
            evidenceRequired: isSelf ? 'self' : 'observed',
            confidence,
            stateType: 'emotion',
            sourceSpan: {
              start: match.index,
              end: match.index + match[0].length,
              raw: match[0],
            },
          });
          break; // 每个角色+情绪只匹配一次
        }
      }

      // ── Needs: Name + (饿了|困了|累了|想XX) ──
      for (const need of NEEDS_WORDS) {
        const pattern = new RegExp(`${safeName}${need}`);
        const match = pattern.exec(text);
        if (!match) continue;

        // Primary from stripped marker, secondary from prefix check
        const negation = loopNegation || this._checkNegation(text, match.index);
        const uncertain = loopUncertainty || this._checkUncertainty(text, match.index);

        let confidence = 0.8;
        if (!isSelf && !this.nameToId.has(name.toLowerCase())) confidence -= 0.1;
        if (negation) confidence -= 0.1;
        if (uncertain) confidence -= 0.15;

        claims.push({
          type: 'state',
          subject,
          rawSubject: displayName,
          predicate: 'needs',
          object: need,
          polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
          evidenceRequired: isSelf ? 'self' : 'observed',
          confidence,
          stateType: 'needs',
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
        break; // 每个角色+需求只匹配一次
      }

      // ── Activity: Name + (正在|在) + activity ──
      for (const activity of ACTIVITY_WORDS) {
        const activityPatterns = [
          new RegExp(`${safeName}正在${activity}`),
          new RegExp(`${safeName}在${activity}`),
        ];
        for (const pattern of activityPatterns) {
          const match = pattern.exec(text);
          if (!match) continue;

          // Primary from stripped marker, secondary from prefix check
          const negation = loopNegation || this._checkNegation(text, match.index);
          const uncertain = loopUncertainty || this._checkUncertainty(text, match.index);

          let confidence = 0.8;
          if (!isSelf && !this.nameToId.has(name.toLowerCase())) confidence -= 0.1;
          if (negation) confidence -= 0.1;
          if (uncertain) confidence -= 0.15;

          claims.push({
            type: 'state',
            subject,
            rawSubject: displayName,
            predicate: 'activity',
            object: activity,
            polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
            evidenceRequired: isSelf ? 'self' : 'observed',
            confidence,
            stateType: 'activity',
            sourceSpan: {
              start: match.index,
              end: match.index + match[0].length,
              raw: match[0],
            },
          });
          break;
        }
      }
    }

    // ── First-person activity: 我 + (正在|在) + activity ──
    // "我" is the one pronoun with an unambiguous subject: the narrator. It
    // must therefore participate in the same grounding checks as named-agent
    // activity claims instead of silently bypassing extraction.
    for (const activity of ACTIVITY_WORDS) {
      const pattern = new RegExp(`我(?:正在|在)${activity}`);
      const match = pattern.exec(text);
      if (!match) continue;

      const negation = this._checkNegation(text, match.index);
      const uncertain = this._checkUncertainty(text, match.index);
      let confidence = 0.9;
      if (negation) confidence -= 0.1;
      if (uncertain) confidence -= 0.15;

      claims.push({
        type: 'state',
        subject: this.selfId,
        rawSubject: '我',
        predicate: 'activity',
        object: activity,
        polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
        evidenceRequired: 'self',
        confidence,
        stateType: 'activity',
        sourceSpan: {
          start: match.index,
          end: match.index + match[0].length,
          raw: match[0],
        },
      });
    }

    // ── First-person emotion: 我 + intensity/feeling marker + emotion ──
    // Unlike other pronouns, "我" is always the narrator. Extracting it is
    // necessary so GroundingChecker can bind it to AGENT_STATE.emotionSummary
    // instead of treating a self emotion claim as an unverified free pass.
    for (const emotion of EMOTION_WORDS) {
      const pattern = new RegExp(`我(?:现在)?(?:(?:很|有点|非常|挺|比较|极度|特别|真)${emotion}|(?:感到|感觉|觉得)${emotion}|心情(?:(?:很|有点|非常|挺|比较)?)${emotion})`);
      const match = pattern.exec(text);
      if (!match) continue;

      const negation = this._checkNegation(text, match.index);
      const uncertain = this._checkUncertainty(text, match.index);
      claims.push({
        type: 'state',
        subject: this.selfId,
        rawSubject: '我',
        predicate: 'feels',
        object: emotion,
        polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
        evidenceRequired: 'self',
        confidence: negation ? 0.8 : 0.9,
        stateType: 'emotion',
        sourceSpan: { start: match.index, end: match.index + match[0].length, raw: match[0] },
      });
    }

    // ── Pronoun state claims (includePronouns only) ──
    // Scan for pronoun + emotion/need/activity patterns
    if (includePronouns) {
      for (const pronoun of PRONOUN_WORDS) {
        const safePronoun = this._escapeRegex(pronoun);

        // Emotion: Pronoun + (很|有点|...) + emotion
        for (const emotion of EMOTION_WORDS) {
          const emotionPatterns = [
            new RegExp(`${safePronoun}(很|有点|非常|挺|比较|极度|特别|真)${emotion}`),
            new RegExp(`${safePronoun}感到${emotion}`),
            new RegExp(`${safePronoun}觉得${emotion}`),
          ];
          for (const pattern of emotionPatterns) {
            const match = pattern.exec(text);
            if (!match) continue;

            const negation = this._checkNegation(text, match.index);
            const uncertain = this._checkUncertainty(text, match.index);

            let confidence = 0.5; // low base for unresolved pronoun
            if (negation) confidence -= 0.1;
            if (uncertain) confidence -= 0.15;

            claims.push({
              type: 'state',
              subject: pronoun,
              predicate: 'feels',
              object: emotion,
              polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
              evidenceRequired: 'observed',
              confidence,
              stateType: 'emotion',
              sourceSpan: {
                start: match.index,
                end: match.index + match[0].length,
                raw: match[0],
              },
              extractionMethod: 'extractor-pronoun',
            });
            break;
          }
        }

        // Needs: Pronoun + need
        for (const need of NEEDS_WORDS) {
          const pattern = new RegExp(`${safePronoun}${need}`);
          const match = pattern.exec(text);
          if (!match) continue;

          const negation = this._checkNegation(text, match.index);
          const uncertain = this._checkUncertainty(text, match.index);

          let confidence = 0.5;
          if (negation) confidence -= 0.1;
          if (uncertain) confidence -= 0.15;

          claims.push({
            type: 'state',
            subject: pronoun,
            predicate: 'needs',
            object: need,
            polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
            evidenceRequired: 'observed',
            confidence,
            stateType: 'needs',
            sourceSpan: {
              start: match.index,
              end: match.index + match[0].length,
              raw: match[0],
            },
            extractionMethod: 'extractor-pronoun',
          });
          break;
        }

        // Activity: Pronoun + (正在|在) + activity
        for (const activity of ACTIVITY_WORDS) {
          const activityPatterns = [
            new RegExp(`${safePronoun}正在${activity}`),
            new RegExp(`${safePronoun}在${activity}`),
          ];
          for (const pattern of activityPatterns) {
            const match = pattern.exec(text);
            if (!match) continue;

            const negation = this._checkNegation(text, match.index);
            const uncertain = this._checkUncertainty(text, match.index);

            let confidence = 0.5;
            if (negation) confidence -= 0.1;
            if (uncertain) confidence -= 0.15;

            claims.push({
              type: 'state',
              subject: pronoun,
              predicate: 'activity',
              object: activity,
              polarity: uncertain ? 'uncertain' : (negation ? 'negative' : 'affirmative'),
              evidenceRequired: 'observed',
              confidence,
              stateType: 'activity',
              sourceSpan: {
                start: match.index,
                end: match.index + match[0].length,
                raw: match[0],
              },
              extractionMethod: 'extractor-pronoun',
            });
            break;
          }
        }
      }
    }

    return claims;
  }

  // ═══════════════════════════════════════════
  // Source attribution claims
  // ═══════════════════════════════════════════

  _extractSourceClaims(text) {
    const claims = [];

    // "听说 XX" / "XX告诉我" → told
    for (const marker of SOURCE_TOLD_MARKERS) {
      const pattern = new RegExp(`${this._escapeRegex(marker)}(.{2,40})`, 'g');
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const content = match[1].trim();

        claims.push({
          type: 'source_attribution',
          subject: this.selfId,
          predicate: 'heard',
          object: content,
          polarity: 'affirmative',
          evidenceRequired: 'self',
          confidence: 0.8,
          sourceMarker: 'told',
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
      }
    }

    // "我推测 XX" / "大概 XX" → inferred
    const inferredPatterns = [
      ...SOURCE_INFERRED_MARKERS.map(m => new RegExp(`${this._escapeRegex(m)}(.{2,40})`, 'g')),
      /我推测(.{2,40})/g,
    ];
    for (const pattern of inferredPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const content = match[1]?.trim();
        if (!content) continue;

        // 避免与 told 标记重复
        const isTold = SOURCE_TOLD_MARKERS.some(m => content.includes(m));
        if (isTold) continue;

        claims.push({
          type: 'source_attribution',
          subject: this.selfId,
          predicate: 'inferred',
          object: content,
          polarity: 'uncertain',
          evidenceRequired: 'self',
          confidence: 0.7,
          sourceMarker: 'inferred',
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
      }
    }

    // "我看到 XX" / "看到 XX" → observed (self-reported observation)
    for (const marker of SOURCE_OBSERVED_MARKERS) {
      const pattern = new RegExp(`${this._escapeRegex(marker)}(.{2,40})`, 'g');
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const content = match[1].trim();

        claims.push({
          type: 'source_attribution',
          subject: this.selfId,
          predicate: 'observed',
          object: content,
          polarity: 'affirmative',
          evidenceRequired: 'self',
          confidence: 0.85,
          sourceMarker: 'observed',
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
      }
    }

    return claims;
  }

  // ═══════════════════════════════════════════
  // Time claims
  // ═══════════════════════════════════════════

  _extractTimeClaims(text) {
    const claims = [];

    for (const timeWord of TIME_WORDS) {
      // Use word-boundary-like match to avoid substring mis-match
      const pattern = new RegExp(this._escapeRegex(timeWord), 'g');
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // 跳过已在其他 claim 中覆盖的时间词
        const alreadyCovered = claims.some(c =>
          c.type === 'time' &&
          match.index >= c.sourceSpan.start - 2 &&
          match.index <= c.sourceSpan.end + 2
        );
        if (alreadyCovered) continue;

        claims.push({
          type: 'time',
          subject: null,
          predicate: 'time_ref',
          object: timeWord,
          polarity: 'affirmative',
          evidenceRequired: 'any',
          confidence: 0.9,
          sourceSpan: {
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
          },
        });
      }
    }

    return claims;
  }

  // ═══════════════════════════════════════════
  // Negation / Uncertainty / Source detection
  // ═══════════════════════════════════════════

  /**
   * 在 matchStart 前 8 个字符范围内检测否定标记。
   * @private
   */
  _checkNegation(text, matchStart) {
    const prefix = text.substring(Math.max(0, matchStart - 8), matchStart);
    return NEGATION_MARKERS.some(marker => prefix.includes(marker));
  }

  /**
   * 在 matchStart 前 8 个字符范围内检测不确定标记。
   * @private
   */
  _checkUncertainty(text, matchStart) {
    const prefix = text.substring(Math.max(0, matchStart - 8), matchStart);
    return UNCERTAINTY_MARKERS.some(marker => prefix.includes(marker));
  }

  /**
   * 在 matchStart 前 10 个字符范围内检测来源标记。
   * @private
   */
  _checkSourceMarker(text, matchStart) {
    const prefix = text.substring(Math.max(0, matchStart - 10), matchStart);
    if (SOURCE_TOLD_MARKERS.some(m => prefix.includes(m))) return 'told';
    if (SOURCE_INFERRED_MARKERS.some(m => prefix.includes(m))) return 'inferred';
    if (SOURCE_OBSERVED_MARKERS.some(m => prefix.includes(m))) return 'observed';
    if (SOURCE_SELF_MARKERS.some(m => prefix.includes(m))) return 'self';
    return null;
  }

  /**
   * Resolve a name (display name or agentId) to canonical agentId.
   * @private
   */
  _resolveAgentName(name) {
    const lower = name.toLowerCase();
    return this.nameToId.get(lower) || null;
  }

  /**
   * Resolve a name to canonical agentId. If name === selfId return selfId;
   * else look up in nameToId map; if not found, return name as-is (unknown agent).
   * @private
   */
  _resolveToAgentId(name) {
    if (name === this.selfId) return this.selfId;
    const resolved = this._resolveAgentName(name);
    return resolved || name;
  }

  /**
   * Strip negation/uncertainty/source markers from agent name extracted by
   * the location regex. The regex greedily consumes adjacent Chinese characters,
   * so "鲍勃不在图书馆" yields agentName="鲍勃不" instead of "鲍勃".
   *
   * Returns { cleanedName, strippedNegation, strippedUncertainty, strippedSource }.
   *
   * @private
   */
  _stripTrailingMarkers(name) {
    let strippedNegation = false;
    let strippedUncertainty = false;
    let strippedSource = false;

    // Strip source markers from START (longest match first)
    const sortedSource = [...SOURCE_TOLD_MARKERS].sort((a, b) => b.length - a.length);
    for (const marker of sortedSource) {
      if (name.startsWith(marker)) {
        const rest = name.substring(marker.length);
        if (rest.length >= 1) {
          strippedSource = true;
          return { cleanedName: rest, strippedNegation, strippedUncertainty, strippedSource };
        }
      }
    }

    // Strip negation/uncertainty from END (longest match first)
    const sortedNegation = [...NEGATION_MARKERS].sort((a, b) => b.length - a.length);
    for (const marker of sortedNegation) {
      if (name.endsWith(marker)) {
        const rest = name.substring(0, name.length - marker.length);
        if (rest.length >= 1) {
          strippedNegation = true;
          return { cleanedName: rest, strippedNegation, strippedUncertainty, strippedSource };
        }
      }
    }

    const sortedUncertainty = [...UNCERTAINTY_MARKERS].sort((a, b) => b.length - a.length);
    for (const marker of sortedUncertainty) {
      if (name.endsWith(marker)) {
        const rest = name.substring(0, name.length - marker.length);
        if (rest.length >= 1) {
          strippedUncertainty = true;
          return { cleanedName: rest, strippedNegation, strippedUncertainty, strippedSource };
        }
      }
    }

    return { cleanedName: name, strippedNegation: false, strippedUncertainty: false, strippedSource: false };
  }

  /**
   * Escape regex special characters.
   * @private
   */
  _escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = ClaimExtractor;
