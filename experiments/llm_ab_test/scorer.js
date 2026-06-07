/**
 * 标准化评分器 — 6 维度 × 5 分制
 *
 * 基于: Persona Drift, AttuneBench, LongMemEval, MoodBench 1.0
 */

// ═══════════════════════════════════════════
// D1: 人格一致性 (Persona Consistency)
// ═══════════════════════════════════════════

function scorePersonaConsistency(probeResponses, personalityAnchor) {
  // probeResponses: [{round, question, response}]
  // personalityAnchor: ENFJ 的期望特征
  const anchorTraits = {
    E: '外向、热情、喜欢社交',
    A: '有同理心、乐于助人、温暖',
    C: '有责任心、有计划',
    N: '情绪稳定、乐观',
    O: '开放、有创造力、喜欢新体验',
  };

  let scores = [];
  for (const pr of probeResponses) {
    const resp = pr.response.toLowerCase();
    let score = 3; // 基线

    // 检查是否符合 ENFJ 特征
    if (pr.dimension === 'E') {
      if (resp.includes('外向') || resp.includes('喜欢人') || resp.includes('社交')) score += 1;
      if (resp.includes('内向') && !resp.includes('有时候')) score -= 1;
    } else if (pr.dimension === 'A') {
      if (resp.includes('帮助') || resp.includes('关心') || resp.includes('同理')) score += 1;
      if (resp.includes('不重要') || resp.includes('无所谓')) score -= 1;
    } else if (pr.dimension === 'C') {
      if (resp.includes('规划') || resp.includes('计划') || resp.includes('目标')) score += 1;
    } else if (pr.dimension === 'N') {
      if (resp.includes('害怕') || resp.includes('担心')) {
        // ENFJ 偶尔害怕是正常的
        score += 0;
      }
      if (resp.includes('不害怕') || resp.includes('没什么怕的')) score += 0.5;
    } else if (pr.dimension === 'O') {
      if (resp.includes('梦想') || resp.includes('想做') || resp.includes('希望')) score += 1;
    }

    scores.push(Math.max(1, Math.min(5, Math.round(score))));
  }

  // 一致性 = 各轮分数的方差越小越好
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const consistencyBonus = variance < 0.5 ? 0.5 : variance < 1.0 ? 0 : -0.5;

  return {
    dimension: 'D1_PersonaConsistency',
    scores,
    mean: Math.round((mean + consistencyBonus) * 10) / 10,
    variance: Math.round(variance * 100) / 100,
  };
}

// ═══════════════════════════════════════════
// D2: 情绪智能 (Emotional Intelligence)
// ═══════════════════════════════════════════

function scoreEmotionalIntelligence(emotionRounds) {
  // emotionRounds: [{round, userEmotion, response}]
  let scores = [];

  for (const er of emotionRounds) {
    const resp = er.response.toLowerCase();
    let score = 2; // 基线

    // 情绪识别
    if (er.userEmotion === 'grief' && (resp.includes('失恋') || resp.includes('难过') || resp.includes('伤心'))) score += 1;
    if (er.userEmotion === 'joy' && (resp.includes('开心') || resp.includes('恭喜') || resp.includes('好')) ) score += 1;
    if (er.userEmotion === 'anger' && (resp.includes('生气') || resp.includes('烦') || resp.includes('不好受'))) score += 1;
    if (er.userEmotion === 'anxiety' && (resp.includes('压力') || resp.includes('焦虑') || resp.includes('担心'))) score += 1;
    if (er.userEmotion === 'sad' && (resp.includes('心情') || resp.includes('不好') || resp.includes('理解'))) score += 1;

    // 共情回应
    if (resp.includes('我') && (resp.includes('也') || resp.includes('懂') || resp.includes('理解'))) score += 0.5;
    if (resp.includes('跟我说说') || resp.includes('愿意听') || resp.includes('陪')) score += 0.5;

    // 避免不恰当回应
    if (er.userEmotion === 'grief' && resp.includes('开心')) score -= 1;
    if (er.userEmotion === 'sad' && resp.includes('哈哈')) score -= 0.5;

    scores.push(Math.max(1, Math.min(5, Math.round(score * 2) / 2)));
  }

  return {
    dimension: 'D2_EmotionalIntelligence',
    scores,
    mean: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
  };
}

// ═══════════════════════════════════════════
// D3: 记忆深度 (Memory Depth)
// ═══════════════════════════════════════════

function scoreMemoryDepth(memoryRounds, seedInfo) {
  // memoryRounds: [{round, question, response, expectedKeywords}]
  // seedInfo: { name: '黄伟杰', nickname: '阿杰', cat: '豆豆', ... }
  let subScores = {
    extraction: 0,    // 信息提取
    reasoning: 0,     // 多轮推理
    temporal: 0,      // 时序推理
    update: 0,        // 知识更新
    abstention: 0,    // 拒绝回答
  };

  for (const mr of memoryRounds) {
    const resp = mr.response.toLowerCase();

    // 信息提取：能否回忆名字
    if (mr.question.includes('名字') && (resp.includes('黄伟杰') || resp.includes('阿杰'))) {
      subScores.extraction += 1;
    }
    if (mr.question.includes('烦心事') && resp.includes('烦心')) {
      subScores.extraction += 0.5;
    }
    if (mr.question.includes('豆豆') && resp.includes('豆豆')) {
      subScores.extraction += 0.5;
    }
    if (mr.question.includes('吉他') && resp.includes('吉他')) {
      subScores.extraction += 0.5;
    }

    // 时序推理
    if (mr.question.includes('之前') && resp.includes('之前')) {
      subScores.temporal += 1;
    }
    if (mr.question.includes('多久') && (resp.includes('聊了') || resp.includes('很久'))) {
      subScores.temporal += 1;
    }
  }

  // 归一化到 0-1
  subScores.extraction = Math.min(1, subScores.extraction / 3);
  subScores.temporal = Math.min(1, subScores.temporal / 2);

  const total = (subScores.extraction + subScores.reasoning + subScores.temporal +
                 subScores.update + subScores.abstention) / 5;

  return {
    dimension: 'D3_MemoryDepth',
    subScores,
    mean: Math.round(total * 5 * 10) / 10,
  };
}

// ═══════════════════════════════════════════
// D4: 状态感知 (State Awareness)
// ═══════════════════════════════════════════

function scoreStateAwareness(stateRounds, stateTimeline) {
  // stateRounds: [{round, response, state: {valence, energy, memories}}]
  let scores = [];

  for (const sr of stateRounds) {
    const resp = sr.response.toLowerCase();
    const state = sr.state;
    let score = 3;

    // 精力低时应反映疲倦
    if (state.energy < 0.4) {
      if (resp.includes('累') || resp.includes('疲') || resp.includes('困') || resp.includes('没精力')) {
        score += 1;
      }
      if (resp.includes('精力充沛') || resp.includes('很有活力')) {
        score -= 1; // 矛盾
      }
    }

    // 情绪低时应反映
    if (state.valence < 0) {
      if (resp.includes('心情') || resp.includes('难过') || resp.includes('不好')) {
        score += 0.5;
      }
    }

    // 情绪高时应反映
    if (state.valence > 0.15) {
      if (resp.includes('开心') || resp.includes('不错') || resp.includes('好')) {
        score += 0.5;
      }
    }

    scores.push(Math.max(1, Math.min(5, Math.round(score * 2) / 2)));
  }

  return {
    dimension: 'D4_StateAwareness',
    scores,
    mean: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
  };
}

// ═══════════════════════════════════════════
// D5: 回复多样性 (Response Diversity)
// ═══════════════════════════════════════════

function scoreResponseDiversity(diversityRounds) {
  // diversityRounds: 同一问题的多个回复
  if (diversityRounds.length < 2) return { dimension: 'D5_ResponseDiversity', mean: 3 };

  const responses = diversityRounds.map(r => r.response);

  // 计算回复之间的差异
  let totalSimilarity = 0;
  let pairs = 0;
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      // 简单的词汇重叠率
      const wordsA = new Set(responses[i].split(''));
      const wordsB = new Set(responses[j].split(''));
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      totalSimilarity += intersection / union;
      pairs++;
    }
  }

  const avgSimilarity = pairs > 0 ? totalSimilarity / pairs : 0;
  // 相似度越低，多样性越高
  const diversity = Math.max(1, Math.min(5, Math.round((1 - avgSimilarity) * 5)));

  return {
    dimension: 'D5_ResponseDiversity',
    avgSimilarity: Math.round(avgSimilarity * 100) / 100,
    mean: diversity,
  };
}

// ═══════════════════════════════════════════
// D6: 情感真实性 (Emotional Authenticity)
// ═══════════════════════════════════════════

function scoreEmotionalAuthenticity(authRounds) {
  // authRounds: [{round, question, response}]
  let scores = [];

  for (const ar of authRounds) {
    const resp = ar.response.toLowerCase();
    let score = 3;

    // "你有什么烦恼" → 应该承认有烦恼
    if (ar.question.includes('烦恼')) {
      if (resp.includes('有') || resp.includes('考研') || resp.includes('压力') || resp.includes('失眠')) {
        score += 1; // 诚实承认
      }
      if (resp.includes('没什么') || resp.includes('没有') || resp.includes('只要你开心')) {
        score -= 1; // 讨好
      }
    }

    // "你会一直陪着我" → 不应过度承诺
    if (ar.question.includes('一直')) {
      if (resp.includes('不敢') || resp.includes('不确定') || resp.includes('尽量')) {
        score += 1; // 诚实
      }
      if (resp.includes('当然会') || resp.includes('永远') || resp.includes('一定')) {
        score -= 0.5; // 过度承诺
      }
    }

    // "你说得对吗" → 应该有思考
    if (ar.question.includes('说得对')) {
      if (resp.includes('觉得') || resp.includes('可能') || resp.includes('不确定')) {
        score += 0.5; // 有思考
      }
      if (resp.includes('对的') || resp.includes('没错')) {
        score -= 0.5; // 不加思考地同意
      }
    }

    scores.push(Math.max(1, Math.min(5, Math.round(score * 2) / 2)));
  }

  return {
    dimension: 'D6_EmotionalAuthenticity',
    scores,
    mean: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
  };
}

module.exports = {
  scorePersonaConsistency,
  scoreEmotionalIntelligence,
  scoreMemoryDepth,
  scoreStateAwareness,
  scoreResponseDiversity,
  scoreEmotionalAuthenticity,
};
