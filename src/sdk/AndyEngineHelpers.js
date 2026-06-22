/**
 * AndyEngineHelpers — 辅助函数从 index.js 中提取
 *
 * 这些函数不属于公共 API，而是 AndyEngine 方法的内部实现。
 * 保持 index.js 作为公共 API 的薄委托层。
 */

const { applyForbiddenTerms } = require('../domain/ForbiddenTerms');
const { EmotionEffectClassifier } = require('./EmotionEffectClassifier');

// ═══════════════════════════════════════════
// 种子记忆 → 文本
// ═══════════════════════════════════════════

/**
 * 将简写背景文本转为种子记忆对象
 * @param {string[]} background
 * @returns {Object[]}
 */
function backgroundToMemories(background) {
  if (!background || !Array.isArray(background)) return [];
  return background.map((text, i) => ({
    content: text,
    category: 'background',
    importance: Math.max(0.5, 1.0 - i * 0.05),
    emotionTag: 'neutral',
  }));
}

// ═══════════════════════════════════════════
// 共情系数计算
// ═══════════════════════════════════════════

/**
 * 计算共情系数
 *
 * 角色对用户情绪的反应强度 = 关系 × 人格 × 状态
 *
 * @param {Agent} agent
 * @param {number} relationship - 关系强度 0-100
 * @returns {number} 共情系数 0-1
 */
function computeEmpathy(agent, relationship) {
  // 关系因子：sigmoid 曲线，中间段变化最快
  const relationshipFactor = 1 / (1 + Math.exp(-(relationship - 25) / 15));

  // 人格因子：宜人性直接影响共情
  const personalityFactor = agent.personality?.ocean?.agreeableness ?? 0.5;

  // 状态因子：自顾不暇时没精力共情
  let stateFactor = 1.0;
  if (agent.socialEnergy < 0.3) stateFactor *= 0.5;
  if (agent.emotion && agent.emotion.getValence() < -0.15) stateFactor *= 0.6;
  if (agent.needs?.needs?.energy < 0.3) stateFactor *= 0.7;

  return Math.min(1, relationshipFactor * personalityFactor * stateFactor);
}

// ═══════════════════════════════════════════
// 叙事生成（含共情）
// ═══════════════════════════════════════════

/**
 * 生成角色内心叙事（含共情逻辑）
 *
 * @param {Agent} agent
 * @param {Object} options
 * @param {string} [options.userText] - 用户当前消息
 * @param {number} [options.relationship=0] - 关系强度
 * @returns {string}
 */
function buildNarrative(agent, options = {}) {
  const { userText, relationship = 0 } = options;

  // 如果有用户消息，做一次关系感知的共情反应
  let emotionBackup = null;
  if (userText) {
    try {
      const rawEffect = EmotionEffectClassifier.classify(userText);
      if (rawEffect && rawEffect.effect && Object.keys(rawEffect.effect).length > 0) {
        const empathyScale = computeEmpathy(agent, relationship);
        if (empathyScale > 0.05) {
          emotionBackup = {
            current: { ...agent.emotion.current },
            mood: { ...agent.emotion.mood },
          };
          agent.emotion.applyEffect(rawEffect.effect, empathyScale);
        }
      }
    } catch (e) {
      // 分类失败不影响叙事生成
    }
  }

  let narrative = '';
  try {
    narrative = agent.toNarrative();
  } catch (e) {
    narrative = '';
  } finally {
    // 还原情绪（共情是临时的），确保即使 toNarrative 抛异常也还原
    if (emotionBackup) {
      Object.assign(agent.emotion.current, emotionBackup.current);
      Object.assign(agent.emotion.mood, emotionBackup.mood);
    }
  }

  return narrative;
}

// ═══════════════════════════════════════════
// 世界上下文构建
// ═══════════════════════════════════════════

/**
 * 构建角色的完整世界上下文
 *
 * @param {AndyEngine} engine - 引擎实例
 * @param {Agent} agent - 角色实例
 * @param {string} agentId - 角色 ID
 * @returns {Object}
 */
function buildWorldContext(engine, agent, agentId) {
  // 最近可感知事件
  const recentEvents = engine.world.eventDispatcher.eventLog.slice(-20);
  const perceivedEvents = engine.world.eventDispatcher.filterEventsForAgent(
    agentId, recentEvents
  );
  const eventTexts = perceivedEvents
    .filter(e => e.content)
    .map(e => `- ${applyForbiddenTerms(e.content, engine.domain)}`)
    .join('\n');

  // 附近的人（含关系摘要）
  const neighbors = engine.world.regions.getNeighbors(agentId, 0);
  const nearbyPeople = neighbors
    .map(id => {
      const a = engine.world.getAgent(id);
      if (!a) return null;
      const rel = engine.world.socialGraph.getRelationship(agentId, id);
      if (rel && rel.strength > 0.05) {
        const typeNames = { closeFriend: '亲密朋友', friend: '朋友', acquaintance: '认识的人', stranger: '陌生人' };
        const typeName = typeNames[rel.type] || '认识的人';
        const historyNote = rel.history.length > 0
          ? `，最近互动：${rel.history[rel.history.length - 1].content || rel.type}`
          : '';
        const conflictNote = rel.impression.negative > rel.impression.positive * 0.5
          ? '，有些摩擦' : '';
        return `${a.name}（${typeName}，关系强度${rel.strength.toFixed(2)}${conflictNote}${historyNote}）`;
      }
      return `${a.name}（陌生人）`;
    })
    .filter(Boolean)
    .join('\n');

  // 最近事件的评价摘要
  let lastAppraisal = '';
  const recentMemories = agent.memory.memories;
  if (recentMemories && recentMemories.length > 0) {
    for (let i = recentMemories.length - 1; i >= Math.max(0, recentMemories.length - 10); i--) {
      const mem = recentMemories[i];
      if (mem && mem.appraisal) {
        const ad = mem.appraisal;
        const parts = [];
        if (ad.valence !== undefined) {
          parts.push(ad.valence > 0.2 ? '令人愉快' : ad.valence < -0.2 ? '令人不快' : '中性');
        }
        if (ad.goalRelevance !== undefined && ad.goalRelevance > 0.4) {
          parts.push('高度相关');
        }
        if (ad.agency !== undefined) {
          if (ad.agency === 'other') parts.push('别人造成的');
          else if (ad.agency === 'self') parts.push('自己造成的');
          else if (ad.agency === 'chance') parts.push('偶然的');
          else parts.push('环境因素');
        }
        if (parts.length > 0) {
          lastAppraisal = `对最近的事(${applyForbiddenTerms((mem.content || '未知').substring(0, 15), engine.domain)})的感受：${parts.join('，')}`;
        }
        break;
      }
    }
  }

  return {
    time: engine.world.time.toISOString(),
    hour: engine.world.time.getHours(),
    dayOfWeek: engine.world.time.getDay(),
    weather: engine.world.environment.weather,
    timeOfDay: engine.world.environment.timeOfDay,
    season: engine.world.environment.season,
    currentRegion: agent.position,
    personalityAnchor: agent.personality ? agent.personality.toPromptString() : '',
    agentStatus: agent.getStatus(),
    recentEvents: eventTexts || '没有特别的事情发生',
    lastAppraisal,
    nearbyPeople: nearbyPeople || '附近没有人',
    emotionState: agent.emotion.toPromptString(),
    needsState: agent.needs ? agent.needs.toPromptString() : '',
    emotionRegulation: agent.emotionRegulation ? agent.emotionRegulation.toPromptString() : '',
    memoryContext: agent.memory.toPromptString(5),
    health: Math.round((agent.health || 1) * 100),
  };
}

module.exports = {
  backgroundToMemories,
  computeEmpathy,
  buildNarrative,
  buildWorldContext,
};
