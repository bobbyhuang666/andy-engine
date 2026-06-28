/**
 * UtilityScorer — 行为效用评分器
 *
 * 读取 Agent 的心理状态，为每个 ActionCandidate 评分。
 * 评分维度：need / emotion / behavior / memory / relationship / habit / location / world / time / constraint
 *
 * 不修改任何 Agent/World 状态。纯读取 + 计算。
 */

/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} need - 需求匹配度
 * @property {number} emotion - 情绪倾向
 * @property {number} behavior - 行为场一致性
 * @property {number} memory - 记忆压力
 * @property {number} relationship - 社交关系
 * @property {number} habit - 习惯强度
 * @property {number} location - 位置便利性
 * @property {number} world - 世界压力
 * @property {number} time - 时间适宜性
 * @property {number} constraint - 约束惩罚
 * @property {number} total - 加权总分
 */

/**
 * 默认权重
 */
const DEFAULT_WEIGHTS = {
  need: 3.0,
  emotion: 2.0,
  behavior: 1.5,
  memory: 1.0,
  relationship: 0.8,
  goal: 0.5,
  location: 1.0,
  world: 0.8,
  time: 0.6,
  constraint: -2.0,
};

/**
 * 为候选评分
 *
 * @param {Object} candidate - ActionCandidate
 * @param {Object} context - 行为上下文
 * @param {Object} [weights] - 评分权重覆盖
 * @returns {ScoreBreakdown}
 */
function scoreCandidate(candidate, context, weights = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  const breakdown = {
    need: scoreNeed(candidate, context),
    emotion: scoreEmotion(candidate, context),
    behavior: scoreBehavior(candidate, context),
    memory: scoreMemory(candidate, context),
    relationship: scoreRelationship(candidate, context),
    goal: scoreGoal(candidate, context),
    location: scoreLocation(candidate, context),
    world: scoreWorld(candidate, context),
    time: scoreTime(candidate, context),
    constraint: scoreConstraint(candidate, context),
    total: 0,
  };

  // 加权总分
  breakdown.total =
    breakdown.need * w.need +
    breakdown.emotion * w.emotion +
    breakdown.behavior * w.behavior +
    breakdown.memory * w.memory +
    breakdown.relationship * w.relationship +
    breakdown.goal * w.goal +
    breakdown.location * w.location +
    breakdown.world * w.world +
    breakdown.time * w.time +
    breakdown.constraint * w.constraint;

  return breakdown;
}

/**
 * 需求匹配度：候选是否满足匮乏需求
 */
function scoreNeed(candidate, context) {
  if (!context.needs) return 0;

  const effects = candidate.expectedEffects;
  if (!effects.needDelta) return 0;

  let score = 0;
  for (const [need, delta] of Object.entries(effects.needDelta)) {
    const current = context.needs[need];
    if (current !== undefined && delta > 0) {
      // 需求越匮乏，满足价值越高（sigmoid）
      const deficit = 1 - current;
      const urgency = 1 / (1 + Math.exp(8 * (current - 0.25)));
      score += delta * urgency;
    }
  }

  return Math.min(1, score);
}

/**
 * 情绪倾向：候选是否符合当前情绪驱力
 */
function scoreEmotion(candidate, context) {
  if (!context.emotion) return 0;

  const { approachDrive = 0, avoidDrive = 0, agenticDrive = 0 } = context.emotion;
  const type = candidate.type;

  // 趋近驱力 → 社交/探索加分
  if (approachDrive > 0.1) {
    if (type === 'socialize' || type === 'explore') return approachDrive * 0.8;
    if (type === 'move' && candidate.targetRegion) return approachDrive * 0.5;
  }

  // 回避驱力 → 休息/独处加分
  if (avoidDrive > 0.1) {
    if (type === 'rest' || type === 'reflect') return avoidDrive * 0.8;
    if (type === 'continue') return avoidDrive * 0.3;
  }

  // 代理驱力 → 工作/行动加分
  if (agenticDrive > 0.1) {
    if (type === 'work' || type === 'move') return agenticDrive * 0.7;
  }

  return 0;
}

/**
 * 行为场一致性：候选是否与当前 B 向量倾向一致
 */
function scoreBehavior(candidate, context) {
  if (!context.behavior) return 0;

  const B = context.behavior.B;
  if (!B) return 0;

  const type = candidate.type;

  // 简化映射：行为类型 → 期望的 B 维度倾向
  const typeTendencies = {
    rest:     { activity: -1, sociality: -1, focus: -1, expressiveness: -1 },
    work:     { activity: 1, sociality: -1, focus: 1, expressiveness: -1 },
    socialize:{ activity: -1, sociality: 1, focus: -1, expressiveness: 1 },
    explore:  { activity: 1, sociality: 0, focus: -1, expressiveness: 1 },
    continue: { activity: 0, sociality: 0, focus: 0, expressiveness: 0 },
    move:     { activity: 1, sociality: -1, focus: -1, expressiveness: -1 },
    reflect:  { activity: -1, sociality: -1, focus: 1, expressiveness: -1 },
    observe:  { activity: -1, sociality: 0, focus: 1, expressiveness: -1 },
    consume:  { activity: -1, sociality: 0, focus: -1, expressiveness: 0 },
  };

  const tendency = typeTendencies[type];
  if (!tendency) return 0.5;

  // 计算 B 向量与倾向的一致性
  // B[0]=activity, B[1]=sociality, B[2]=focus, B[3]=expressiveness
  let alignment = 0;
  let count = 0;

  if (tendency.activity !== 0) {
    alignment += tendency.activity > 0 ? B[0] : (1 - B[0]);
    count++;
  }
  if (tendency.sociality !== 0) {
    alignment += tendency.sociality > 0 ? B[1] : (1 - B[1]);
    count++;
  }
  if (tendency.focus !== 0) {
    alignment += tendency.focus > 0 ? B[2] : (1 - B[2]);
    count++;
  }
  if (tendency.expressiveness !== 0) {
    alignment += tendency.expressiveness > 0 ? B[3] : (1 - B[3]);
    count++;
  }

  return count > 0 ? alignment / count : 0.5;
}

/**
 * 记忆压力：高重要性记忆是否与此候选相关
 *
 * 基于 ACT-R 记忆检索：
 * - 高重要性 + 高情绪唤醒的记忆对行为有更强影响
 * - 影响随时间衰减（复用 ACT-R 激活度）
 * - 影响有饱和上限，防止永久主导行为
 */
function scoreMemory(candidate, context) {
  if (!context.memories || context.memories.length === 0) return 0;

  let totalInfluence = 0;
  const type = candidate.type;

  for (const mem of context.memories) {
    if (!mem || mem.importance < 0.2) continue;

    // 记忆的情绪强度
    const arousal = mem.emotionSnapshot ? _getArousal(mem.emotionSnapshot) : 0.5;

    // 记忆→候选类型匹配
    const relevance = _memoryTypeRelevance(mem, type);
    if (relevance <= 0) continue;

    // 影响 = 重要性 × 情绪强度 × 相关性
    const influence = mem.importance * arousal * relevance;
    totalInfluence += influence;
  }

  // 饱和曲线：防止记忆永久主导行为
  return Math.min(0.8, totalInfluence * 0.3);
}

/**
 * 记忆与候选类型的相关性
 */
function _memoryTypeRelevance(mem, candidateType) {
  const tag = mem.emotionTag || 'neutral';
  const category = mem.semanticCategory || '';

  // 正面记忆 → 社交/探索加分
  if (tag === 'happy') {
    if (candidateType === 'socialize' || candidateType === 'explore') return 1.0;
    if (candidateType === 'continue') return 0.3;
  }

  // 负面记忆 → 回避/休息加分
  if (tag === 'sad') {
    if (candidateType === 'rest' || candidateType === 'reflect') return 1.0;
    if (candidateType === 'continue') return 0.5;
  }

  // 社交类记忆 → 社交候选加分
  if (category === '社交互动' && candidateType === 'socialize') return 0.8;

  // 工作类记忆 → 工作候选加分
  if (category === '学习工作' && candidateType === 'work') return 0.6;

  return 0.1; // 基础微弱影响
}

/**
 * 简化版唤醒度计算
 */
function _getArousal(snapshot) {
  if (!snapshot) return 0.5;
  const highArousal = ['anger', 'fear', 'excitement', 'surprise', 'nervousness', 'horror', 'pride', 'love', 'triumph'];
  const lowArousal = ['calm', 'boredom', 'contentment', 'sadness'];
  let arousal = 0.5;
  for (const dim of highArousal) {
    if (snapshot[dim] !== undefined) arousal += Math.abs(snapshot[dim]) * 0.1;
  }
  for (const dim of lowArousal) {
    if (snapshot[dim] !== undefined) arousal -= Math.abs(snapshot[dim]) * 0.05;
  }
  return Math.max(0, Math.min(1, arousal));
}

/**
 * 社交关系：附近是否有强关系的 agent
 */
function scoreRelationship(candidate, context) {
  if (candidate.type !== 'socialize') return 0;
  if (!context.relationships || context.relationships.length === 0) return 0;

  // 附近有强关系 → 社交加分
  const maxStrength = Math.max(...context.relationships.map(r => r.strength || 0));
  return maxStrength * 0.5;
}

/**
 * 目标压力：活跃目标对候选的影响
 */
function scoreGoal(candidate, context) {
  // Goal influence
  if (context.goals && context.goals.length > 0) {
    let totalInfluence = 0;
    for (const goal of context.goals) {
      if (goal.priority < 0.1) continue;
      const relevance = _goalCandidateRelevance(goal, candidate);
      totalInfluence += goal.priority * relevance;
    }
    return Math.min(0.8, totalInfluence);
  }
  return 0;
}

/**
 * 目标与候选的相关性
 */
function _goalCandidateRelevance(goal, candidate) {
  const type = candidate.type;

  if (goal.source === 'self' && type === 'explore') return 0.8;
  if (goal.source === 'external') return 0.3;
  if (goal.source === 'background') {
    if (type === 'work' || type === 'socialize') return 0.5;
  }
  if (goal.source === 'world_event') {
    if (type === 'move' || type === 'consume') return 0.6;
  }

  return 0.1;
}

/**
 * 位置便利性：候选目标是否在当前位置附近
 */
function scoreLocation(candidate, context) {
  if (!candidate.targetRegion) return 0.5; // 无目标 → 中性
  if (!context.agent || !context.agent.position) return 0.5;

  // 目标就是当前位置 → 高分
  if (candidate.targetRegion === context.agent.position) return 1.0;

  // 不同位置 → 中等分（需要移动）
  return 0.3;
}

/**
 * 世界压力：外部环境对此候选的影响
 */
function scoreWorld(candidate, context) {
  if (!context.worldPressure) return 0.5;

  // 时间压力
  const timePressure = context.worldPressure.time || {};
  if (timePressure.isLateNight && (candidate.type === 'rest' || candidate.type === 'continue')) {
    return 0.8;
  }
  if (timePressure.isWorkHours && candidate.type === 'work') {
    return 0.7;
  }

  return 0.5;
}

/**
 * 时间适宜性：当前时间是否适合此候选
 */
function scoreTime(candidate, context) {
  if (!context.env) return 0.5;

  const hour = context.env.hour;
  const type = candidate.type;

  // 深夜（22-6）→ 休息/睡觉加分
  if ((hour >= 22 || hour < 6)) {
    if (type === 'rest' || type === 'continue') return 0.8;
    if (type === 'work' || type === 'socialize') return 0.2;
  }

  // 工作时间（9-17）→ 工作加分
  if (hour >= 9 && hour < 17) {
    if (type === 'work') return 0.7;
    if (type === 'rest') return 0.3;
  }

  return 0.5;
}

/**
 * 约束惩罚：候选是否违反约束
 */
function scoreConstraint(candidate, context) {
  // 约束惩罚是负分（通过负权重放大）
  let penalty = 0;

  // 不能去不存在的区域
  if (candidate.targetRegion && context.domain) {
    const regionSet = context.domain.getRegionSet ? context.domain.getRegionSet() : null;
    if (regionSet && !regionSet.has(candidate.targetRegion)) {
      penalty -= 1;
    }
  }

  // 不能与不存在的 agent 社交
  if (candidate.targetAgentId && context.agent) {
    // 简化检查：targetAgentId 应该不同于自己
    if (candidate.targetAgentId === context.agent.id) {
      penalty -= 0.5;
    }
  }

  return penalty;
}

module.exports = {
  scoreCandidate,
  DEFAULT_WEIGHTS,
};
