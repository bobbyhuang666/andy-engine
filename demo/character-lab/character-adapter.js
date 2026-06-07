/**
 * Character Adapter
 *
 * 将 Andy Engine 的丰富内部状态映射为 Demo UI 友好的简化状态。
 * 核心职责：
 *   - 创建和管理引擎实例
 *   - 跟踪事件历史 + 情绪快照（before/after）
 *   - 生成因果解释：为什么这样反应
 *   - 生成行为树对比回复
 */

const AndyEngine = require('../../index');
const responseTemplates = require('./response-templates');

const MAYA_CONFIG = {
  id: 'maya',
  name: 'Maya',
  mbti: 'INFP',
  initialPosition: '宿舍',
  background: [
    '一个敏感而温暖的年轻女性',
    '最近工作压力很大，经常加班',
    '重视真诚和信任，讨厌虚伪',
    '倾向于把情绪藏在心里',
    '渴望被理解但害怕被伤害',
  ],
};

class CharacterAdapter {
  constructor() {
    this.engine = null;
    this.agent = null;
    this.userId = 'user';
    this.eventHistory = [];     // { id, label, timestamp, beforeState, afterState }
    this._emotionBefore = null; // 上一次事件后的情绪快照
    this._initEngine();
  }

  _initEngine() {
    this.engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'),
      weather: 'sunny',
    });
    this.agent = this.engine.createCharacter({ ...MAYA_CONFIG });

    const graph = this.engine.world.socialGraph;
    const rel = graph.getOrCreateRelationship('maya', this.userId);
    rel.strength = 0.35;
    rel.type = 'friend';

    this.eventHistory = [];
    this._emotionBefore = this._snapshotEmotion();
  }

  reset() {
    this._initEngine();
    return this.getState();
  }

  /**
   * 触发事件，返回：状态 + 回复 + 因为什么（因果解释）
   */
  triggerEvent(eventDef) {
    // 1. 记录事件前的情绪快照
    const beforeEmotion = this._snapshotEmotion();
    const beforeState = this.getState();

    // 2. 引擎处理事件
    this.engine.world.eventDispatcher.createEvent({
      type: eventDef.category || 'user_interaction',
      scope: 'local',
      participants: ['maya', this.userId],
      content: eventDef.label,
      effects: [{ target: 'maya', type: 'emotion', delta: eventDef.emotionDelta || {} }],
    });

    if (eventDef.relationshipImpact) {
      const rel = this.engine.world.socialGraph.getRelationship('maya', this.userId);
      if (rel) {
        const d = eventDef.relationshipImpact;
        if (d.trust) rel.strength = Math.max(0, Math.min(1, rel.strength + d.trust / 100));
        if (d.closeness) rel.strength = Math.max(0, Math.min(1, rel.strength + d.closeness / 200));
      }
    }

    this.engine.world.eventDispatcher.dispatch();
    this.engine.tick();
    for (let i = 0; i < 3; i++) this.engine.tick();

    // 3. 记录事件后的情绪
    const afterEmotion = this._snapshotEmotion();

    // 4. 获取状态
    const afterState = this.getState();

    // 5. 被激活的记忆
    const activatedMemories = this._getRecentMemories();

    // 6. 记录完整历史
    this.eventHistory.push({
      id: eventDef.id,
      label: eventDef.label,
      timestamp: Date.now(),
      before: beforeEmotion,
      after: afterEmotion,
    });

    // 7. 生成回复
    const response = responseTemplates.generateResponse(eventDef, afterState, this.eventHistory);

    // 8. 生成因果解释
    const explanation = this._buildExplanation(
      eventDef, beforeState, afterState, activatedMemories, beforeEmotion, afterEmotion
    );

    this._emotionBefore = afterEmotion;

    return {
      state: afterState,
      response,
      explanation,
      btResponse: eventDef.btResponse || response,
      memory: activatedMemories,
      eventLabel: eventDef.label,
    };
  }

  getState() {
    const agent = this.agent;
    const emotion = agent.emotion;
    const needs = agent.needs.needs;
    const personality = agent.personality;

    const graph = this.engine.world.socialGraph;
    const rel = graph.getRelationship('maya', this.userId);
    const relationshipStrength = rel ? rel.strength : 0.3;

    const trust = this._calcTrust(relationshipStrength, emotion);
    const stress = Math.round(Math.min(100, emotion.stress * 10));
    const energy = Math.round(needs.energy * 100);
    const closeness = Math.round(relationshipStrength * 100);
    const safetyNeed = Math.round((1 - needs.comfort) * 100);

    const valence = emotion.getValence();
    const arousal = emotion.getArousal();
    const dominant = emotion.getDominant(3);

    let moodDesc = '平静';
    if (valence > 0.15) moodDesc = '开心';
    else if (valence > 0.05) moodDesc = '还不错';
    else if (valence < -0.15) moodDesc = '难过';
    else if (valence < -0.05) moodDesc = '有些低落';
    if (stress > 70) moodDesc = '焦虑';
    if (stress > 85 && valence < 0) moodDesc = '崩溃边缘';

    const state = {
      trust, stress, energy, closeness, safetyNeed,
      mood: moodDesc,
      valence: Math.round(valence * 1000) / 1000,
      arousal: Math.round(arousal * 100) / 100,
      dominantEmotions: dominant.map(d => ({
        name: this._emotionNameCn(d.dimension),
        value: Math.round(d.value * 100),
      })),
      personality: {
        mbti: personality.mbti,
        openness: Math.round(personality.ocean.openness * 100),
        conscientiousness: Math.round(personality.ocean.conscientiousness * 100),
        extraversion: Math.round(personality.ocean.extraversion * 100),
        agreeableness: Math.round(personality.ocean.agreeableness * 100),
        neuroticism: Math.round(personality.ocean.neuroticism * 100),
      },
      needs: {
        hunger: Math.round(needs.hunger * 100),
        energy: Math.round(needs.energy * 100),
        social: Math.round(needs.social * 100),
        comfort: Math.round(needs.comfort * 100),
        stimulation: Math.round(needs.stimulation * 100),
      },
      eventCount: this.eventHistory.length,
    };
    state.narrative = this._getNarrative(emotion, state);
    return state;
  }

  // ═══════════════════════════════════════════
  // 因果解释生成
  // ═══════════════════════════════════════════

  _snapshotEmotion() {
    const e = this.agent.emotion;
    return {
      valence: e.getValence(),
      stress: e.stress,
      dominant: e.getDominant(3).map(d => d.dimension),
    };
  }

  /**
   * 构建因果解释：为什么 Maya 这样反应
   */
  _buildExplanation(eventDef, beforeState, afterState, memories, beforeSnap, afterSnap) {
    const factors = [];

    // 1. 信任水平的影响
    if (beforeState.trust > 65) {
      factors.push({ type: 'state', text: `信任较高（${beforeState.trust}），倾向给出善意解读` });
    } else if (beforeState.trust < 40) {
      factors.push({ type: 'state', text: `信任较低（${beforeState.trust}），更难接受新的负面信号` });
    }

    // 2. 压力/疲劳的影响
    if (beforeState.stress > 50) {
      factors.push({ type: 'state', text: `压力较高（${beforeState.stress}），情绪调节能力下降` });
    }
    if (beforeState.energy < 40) {
      factors.push({ type: 'state', text: `精力不足（${beforeState.energy}），容易感到疲惫` });
    }

    // 3. 安全感
    if (beforeState.safetyNeed > 50) {
      factors.push({ type: 'state', text: `安全感不足（${beforeState.safetyNeed}），需要更多稳定` });
    }

    // 4. 被激活的记忆
    if (memories.length > 0) {
      const recent = memories.slice(0, 3);
      const memoryTexts = recent.map(m => `"${m.content}"`);
      factors.push({ type: 'memory', text: `最近的记忆被激活：${memoryTexts.join('、')}` });
    }

    // 5. 人格影响
    const neuro = beforeState.personality.neuroticism;
    if (neuro > 55) {
      factors.push({ type: 'personality', text: `高敏感人格（N=${neuro}），更容易捕捉到负面信号` });
    }
    if (beforeState.personality.agreeableness > 60) {
      factors.push({ type: 'personality', text: `高亲和力（A=${beforeState.personality.agreeableness}），倾向于不直接表达不满` });
    }

    // 6. 情绪变化方向
    const vDiff = afterSnap.valence - beforeSnap.valence;
    if (Math.abs(vDiff) > 0.05) {
      const dir = vDiff > 0 ? '好转' : '下降';
      factors.push({ type: 'emotion', text: `情绪${dir}（效价 ${Math.round(vDiff * 100) > 0 ? '+' : ''}${Math.round(vDiff * 100)}）` });
    }

    // 7. 生成解释结论
    const conclusion = this._generateConclusion(eventDef, beforeState, memories);

    return { factors, conclusion };
  }

  _generateConclusion(eventDef, beforeState, memories) {
    const trust = beforeState.trust;
    const isPositive = (eventDef.emotionDelta.joy || 0) + (eventDef.emotionDelta.gratitude || 0) > 0.2;
    const relationshipDrop = eventDef.relationshipImpact?.trust || 0;
    const isNegative =
      (eventDef.emotionDelta.sadness || 0) + (eventDef.emotionDelta.frustration || 0) >= 0.25 ||
      relationshipDrop < 0;
    const hasNegativeHistory = memories.some(m => m.emotionTag === 'sad');

    if (isNegative && trust < 40 && hasNegativeHistory) {
      return `她没有把这次${eventDef.label}理解为孤立事件，而是和最近的经历联系在了一起。信任低时，同样的事会让她想起之前受过的伤。`;
    }
    if (isNegative && trust >= 60) {
      return `虽然这是一件负面的事，但之前的信任基础让她愿意给出善意解读。她没有立刻怀疑你的动机。`;
    }
    if (isPositive && trust < 40) {
      return `她注意到了你的善意，但低信任让她不太敢完全接受。她可能会想"这次是真的吗"。`;
    }
    if (isPositive && trust >= 60) {
      return `在信任较高的基础上，这次善意被放大了——不只是"你做了好事"，而是"你还在"。`;
    }
    if (isPositive) {
      return `当前状态比较稳定，她能够接收到善意。但这种接收不是自动的，而是受整体心理状态影响的。`;
    }
    if (isNegative) {
      return `她的反应不只取决于这次事件本身，而是它和之前经历的叠加。同样的事，在不同时刻会有完全不同的含义。`;
    }
    return `她的反应是当前情绪、记忆和人格共同作用的结果，不是单一因素决定的。`;
  }

  // ═══════════════════════════════════════════
  // 记忆
  // ═══════════════════════════════════════════

  _getRecentMemories() {
    const memories = this.agent.memory.memories;
    if (!memories || memories.length === 0) return [];
    const filtered = memories.filter(m =>
      m.category !== 'background' && m.category !== 'random' && m.category !== 'health'
    );
    const byContent = new Map();
    for (const m of filtered) {
      const existing = byContent.get(m.content);
      if (!existing || m.importance > existing.importance) byContent.set(m.content, m);
    }
    return Array.from(byContent.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 6)
      .map(m => ({
        content: m.content,
        category: m.category,
        emotionTag: m.emotionTag,
        importance: Math.round(m.importance * 100),
      }));
  }

  // ═══════════════════════════════════════════
  // 内心独白
  // ═══════════════════════════════════════════

  _getNarrative(emotion, state) {
    const valence = emotion.getValence();
    const stress = state.stress;
    const idx = state.eventCount % 3;

    if (stress > 70 && valence < -0.1) {
      return ['我好累……不知道还能撑多久。', '脑子停不下来。我想安静一下。', '为什么总是这样。'][idx];
    }
    if (valence > 0.2 && stress < 30) {
      return ['今天好像还不错。有你在，安心了一点。', '心里暖暖的。好久没有这种感觉了。', '我觉得……也许事情没有那么糟。'][idx];
    }
    if (valence > 0.05 && stress < 50) {
      return ['还好吧。没什么特别的。', '在想一些事情。没什么。', '今天过得还行。'][idx];
    }
    if (valence < -0.05 && stress < 50) {
      return ['有点闷。不知道该怎么说。', '我觉得不太开心，但不想表现出来。', '……算了，没什么。'][idx];
    }
    return ['在想事情。', '没什么，就是有点走神。', '嗯……'][idx];
  }

  _calcTrust(relationshipStrength, emotion) {
    const rel = relationshipStrength * 60;
    const valence = emotion.getValence();
    const emo = Math.max(0, (valence + 0.5)) * 25;
    const s = Math.max(0, (10 - emotion.stress)) * 1.5;
    return Math.round(Math.min(100, Math.max(0, rel + emo + s)));
  }

  _emotionNameCn(d) {
    const m = {
      joy: '喜悦', sadness: '悲伤', anger: '愤怒', fear: '恐惧',
      surprise: '惊讶', disgust: '厌恶', love: '爱意', nervousness: '紧张',
      pride: '自豪', relief: '释然', shame: '羞耻', calm: '平静',
      frustration: '沮丧', gratitude: '感激', hope: '希望', loneliness: '孤独',
      contentment: '满足', interest: '兴趣', guilt: '内疚', embarrassment: '尴尬',
    };
    return m[d] || d;
  }
}

module.exports = CharacterAdapter;
