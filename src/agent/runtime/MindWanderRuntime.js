/**
 * MindWanderRuntime — Mind wandering (Default Mode Network)
 *
 * Extracted from Agent._mindWander, _timeAgoLabel.
 * All functions take an `agent` instance as first argument.
 */

const { ANDY_DEFAULTS } = require('../../config/defaults');

/**
 * Mind wandering — spontaneous thought generation.
 * @param {Object} agent
 * @returns {Object|null}
 */
function mindWander(agent) {
  const valence = agent.emotion.getValence();
  const stress = agent.emotion.stress || 0;

  const sp = agent.domain && agent.domain.semanticProfile;
  const mwSp = sp && sp.mindWander;

  // Mood-congruent retrieval
  const negativeKeywords = (mwSp && mwSp.negativeKeywords) || ['难过', '不开心', '孤独', '压力'];
  const positiveKeywords = (mwSp && mwSp.positiveKeywords) || ['开心', '有趣', '朋友', '喜欢'];
  const retrieveContext = valence < -0.04
    ? { emotion: { sadness: 0.3, loneliness: 0.2 }, keywords: negativeKeywords }
    : valence > 0.04
      ? { emotion: { joy: 0.3, contentment: 0.2 }, keywords: positiveKeywords }
      : { keywords: [] };

  const { memories, recallEmotionDelta } = agent.memory.retrieve(retrieveContext, 2);
  if (memories.length === 0) return null;

  const memory = memories[0];

  // Generate thought candidates
  const thoughtCandidates = [];

  const thoughtTypes = (mwSp && mwSp.thoughtTypes) || {};
  const typeRecall = thoughtTypes.recall || '回忆';
  const typeRumination = thoughtTypes.rumination || '反刍';
  const typeNostalgia = thoughtTypes.nostalgia || '怀念';
  const typeWorry = thoughtTypes.worry || '担忧';
  const typeDaydream = thoughtTypes.daydream || '白日梦';

  // 1. Recall-type thought
  thoughtCandidates.push({
    type: typeRecall,
    content: `想起了${timeAgoLabel(agent, memory.timestamp)}的事：${memory.content}`,
    weight: 1.0,
  });

  // 2. Emotion reaction thought
  if (memory.emotionTag === 'sad' && valence < -0.04) {
    const ruminationWeight = 1.0 + Math.abs(valence) * 3 + (stress / 10);
    thoughtCandidates.push({
      type: typeRumination,
      content: `又想起了${memory.content}，心里不太舒服`,
      weight: ruminationWeight,
    });
  } else if (memory.emotionTag === 'happy' && valence > 0.05) {
    thoughtCandidates.push({
      type: typeNostalgia,
      content: `想起了${memory.content}，嘴角不自觉上扬`,
      weight: 1.2,
    });
  }

  // 3. Stress worry thoughts
  if (stress > 4) {
    thoughtCandidates.push({
      type: typeWorry,
      content: '脑子里乱乱的，总觉得有什么事没做完',
      weight: 0.5 + stress / 10,
    });
  }

  // 4. Daydream (positive mood + low stress)
  if (valence > 0.04 && stress < 3) {
    const daydreamContents = (mwSp && mwSp.daydreamContents) || [
      '想着等下做什么好呢',
      '今天天气不错，心情也挺好的',
      '希望这样的日子能多一些',
      '突然想到了一个有趣的想法',
    ];
    thoughtCandidates.push({
      type: typeDaydream,
      content: daydreamContents[Math.floor(agent._rand() * daydreamContents.length)],
      weight: 0.8,
    });
  }

  // Weighted random selection
  const totalWeight = thoughtCandidates.reduce((sum, t) => sum + t.weight, 0);
  let r = agent._rand() * totalWeight;
  let thought = thoughtCandidates[0];
  for (const candidate of thoughtCandidates) {
    r -= candidate.weight;
    if (r <= 0) { thought = candidate; break; }
  }

  // Emotion effects from thought
  const mwCfg = ANDY_DEFAULTS.mindWander?.effects || {};
  const emotionDelta = {};

  // Recall → emotion feedback
  if (recallEmotionDelta && Object.keys(recallEmotionDelta).length > 0) {
    for (const [dim, value] of Object.entries(recallEmotionDelta)) {
      emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
    }
  }

  // Thought-type specific effects
  if (thought.type === typeRumination) {
    const rum = mwCfg.rumination || { sadness: 0.018, nervousness: 0.012, frustration: 0.008 };
    for (const [dim, value] of Object.entries(rum)) {
      emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
    }
  } else if (thought.type === typeWorry) {
    const worry = mwCfg.worry || { nervousness: 0.020, frustration: 0.012 };
    for (const [dim, value] of Object.entries(worry)) {
      emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
    }
  } else if (thought.type === typeNostalgia) {
    const nost = mwCfg.nostalgia || { joy: 0.018, calm: 0.008 };
    for (const [dim, value] of Object.entries(nost)) {
      emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
    }
  } else if (thought.type === typeDaydream) {
    const daydream = mwCfg.daydream || { hope: 0.012, interest: 0.008, calm: 0.005 };
    for (const [dim, value] of Object.entries(daydream)) {
      emotionDelta[dim] = (emotionDelta[dim] || 0) + value;
    }
  }

  if (Object.keys(emotionDelta).length > 0) {
    agent.emotion.applyEffect(emotionDelta);
  }

  return {
    type: 'mind_wander',
    thoughtType: thought.type,
    content: thought.content,
    time: new Date(agent.memory._simTime || Date.now()).toISOString(),
  };
}

/**
 * Time-ago label helper.
 * @param {Object} agent
 * @param {Date} date
 * @returns {string}
 */
function timeAgoLabel(agent, date) {
  if (!date) return '';
  const hours = (agent.memory._simTime - date.getTime()) / (1000 * 60 * 60);
  const sp = agent.domain && agent.domain.semanticProfile;
  const tl = sp && sp.mindWander && sp.mindWander.timeLabels;
  if (hours < 1) return (tl && tl.justNow) || '刚刚';
  if (hours < 24) return (tl && tl.hoursAgo) ? tl.hoursAgo(Math.floor(hours)) : `${Math.floor(hours)}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return (tl && tl.daysAgo) ? tl.daysAgo(days) : `${days}天前`;
  return (tl && tl.weeksAgo) ? tl.weeksAgo(Math.floor(days / 7)) : `${Math.floor(days / 7)}周前`;
}

module.exports = { mindWander, timeAgoLabel };
