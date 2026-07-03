/**
 * AgentNarrative — Narrative generation facade
 *
 * Extracted from Agent.toNarrative.
 * Generates first-person Chinese narrative from agent state.
 */

const { DIM_FOCUS, DIM_SOCIALITY } = require('../psychology/BehaviorLabeler');
const { applyForbiddenTerms } = require('../../domain/ForbiddenTerms');
const { compile } = require('../psychology/AffectCompiler');

/**
 * Generate narrative text from agent state.
 * @param {Object} agent
 * @param {Object|null} externalState
 * @returns {string}
 */
function toNarrative(agent, externalState = null) {
  const parts = [];

  // Compile AffectFrame
  const affectFrame = compile({
    emotion: agent.emotion,
    needs: agent.needs,
    behaviorField: agent.behaviorField,
    socialGraph: agent.socialGraph,
    memory: agent.memory,
  });

  // 1. Current behavior
  const rawState = agent.stateMachine.currentState;
  const rawPos = agent.position;
  const info = agent.stateMachine.getInfo(agent.memory.getSimTime() || null);
  const elapsedMin = info.elapsed || 0;

  const narrativeTemplates = agent.domain ? agent.domain.narrativeTemplates : {};
  const statePositionMap = narrativeTemplates.statePositionMap || {};
  const sp = agent.domain && agent.domain.semanticProfile;
  const narrativeSp = sp && sp.narrativeModifiers;

  let stateDesc;
  if (externalState && externalState.scheduleActivity) {
    stateDesc = statePositionMap[externalState.scheduleActivity] || externalState.scheduleActivity;
  } else if (externalState && externalState.scheduleRegion) {
    const regionMap = narrativeTemplates.regionMap || {};
    stateDesc = regionMap[externalState.scheduleRegion] || `在${externalState.scheduleRegion}`;
  } else {
    stateDesc = statePositionMap[rawState] || `在${rawPos}`;
  }
  parts.push(stateDesc);

  // 2. Behavior quality (stayed too long → restless)
  const activeCategories = ['active', 'quiet'];
  const stateDef = agent.domain ? agent.domain.states[rawState] : null;
  const isActiveCategory = stateDef && activeCategories.includes(stateDef.category);
  if (elapsedMin > 60 && isActiveCategory) {
    parts.push((narrativeSp && narrativeSp.needPhrases && narrativeSp.needPhrases.restless) || '但有点坐不住');
  }

  // 3. Need deficits (only when obviously deficient)
  const needs = agent.needs.needs;
  const needPhrases = narrativeSp && narrativeSp.needPhrases;
  if (needs.energy < 0.25) {
    parts.push((needPhrases && needPhrases.veryTired) || '好困');
  } else if (needs.energy < 0.4 && agent.emotion.current.boredom > 0.15) {
    parts.push((needPhrases && needPhrases.tired) || '有点困');
  }
  if (needs.hunger < 0.25) {
    parts.push((needPhrases && needPhrases.veryHungry) || '好饿');
  } else if (needs.hunger < 0.4) {
    parts.push((needPhrases && needPhrases.hungry) || '有点饿');
  }

  // 4. Emotion tone (only when significantly off-neutral)
  const emotionLabels = (narrativeSp && narrativeSp.emotionLabels) || {};
  if (affectFrame.valenceBand === 'negative') {
    const topNegSrc = affectFrame.sourceSignals.emotion.find(e => {
      const val = parseFloat(e.split(':')[1]);
      return val < 0;
    });
    if (topNegSrc) {
      const dim = topNegSrc.split(':')[0];
      const negLabels = {
        sadness: '心情不太好', loneliness: '有点孤独', frustration: '有点烦',
        nervousness: '有点焦虑', boredom: '好无聊', anger: '有点烦躁',
        fear: '有点不安',
      };
      const label = emotionLabels[dim] || negLabels[dim] || null;
      if (label) parts.push(label);
    }
  } else if (affectFrame.valenceBand === 'positive') {
    const topPosSrc = affectFrame.sourceSignals.emotion.find(e => {
      const val = parseFloat(e.split(':')[1]);
      return val > 0;
    });
    if (topPosSrc) {
      const dim = topPosSrc.split(':')[0];
      const posLabels = {
        joy: '心情还不错', contentment: '挺满足的', excitement: '有点兴奋',
        calm: '挺平静的', hope: '有点期待',
      };
      const label = emotionLabels[dim] || posLabels[dim] || null;
      if (label) parts.push(label);
    }
  }
  if (agent.emotion.stress > 6) {
    parts.push((narrativeSp && narrativeSp.cognitivePhrases && narrativeSp.cognitivePhrases.highStress) || '压力好大');
  }

  // 5. Recent memory (most recent meaningful event)
  const recentMemories = agent.memory.memories;
  if (recentMemories && recentMemories.length > 0) {
    const simNow = agent.memory.getSimTime() || 0;
    for (let i = recentMemories.length - 1; i >= Math.max(0, recentMemories.length - 5); i--) {
      const mem = recentMemories[i];
      if (!mem || !mem.content) continue;
      const hoursAgo = mem.timestamp ? (simNow - mem.timestamp.getTime()) / 3600000 : 999;
      if (hoursAgo > 6) break;
      const snippet = mem.content.length > 20 ? mem.content.slice(0, 20) + '...' : mem.content;
      if (!snippet.includes(rawState) && !snippet.includes(rawPos)) {
        const timeLabel = hoursAgo < 0.5 ? '刚才' : hoursAgo < 2 ? '不久前' : '';
        const safeSnippet = applyForbiddenTerms(snippet, agent.domain);
        parts.push(`${timeLabel}${safeSnippet}`);
        break;
      }
    }
  }

  // 6. Cognitive state (mind wander / intrinsic motivation)
  if (agent.intrinsicMotivation && agent.intrinsicMotivation.curiosity > 0.6) {
    const imStatus = agent.intrinsicMotivation.getStatus();
    if (imStatus.activeGoals > 0) {
      parts.push((narrativeSp && narrativeSp.cognitivePhrases && narrativeSp.cognitivePhrases.thinking) || '在想一些事');
    }
  }
  if (agent.health < 0.5) {
    parts.push((narrativeSp && narrativeSp.cognitivePhrases && narrativeSp.cognitivePhrases.unwell) || '身体不太舒服');
  }

  // 7. BehaviorField dynamics
  const B = agent.behaviorField.B;
  const vel = agent.behaviorField.velocity;
  const speed = agent.behaviorField.speed;

  const center = agent.domain && typeof agent.domain.getStateCenter === 'function'
    ? agent.domain.getStateCenter(rawState)
    : null;
  const cognitiveSp = narrativeSp && narrativeSp.cognitivePhrases;
  if (center) {
    const focusDiff = center[DIM_FOCUS] - B[DIM_FOCUS];
    if (focusDiff > 0.25 && center[DIM_FOCUS] > 0.4) {
      parts.push((cognitiveSp && cognitiveSp.distracted) || '心思不太集中');
    }
    const socialVel = vel[DIM_SOCIALITY];
    if (socialVel > 0.3 && B[DIM_SOCIALITY] < 0.4) {
      parts.push((cognitiveSp && cognitiveSp.wantsSocial) || '有点想找人聊天');
    }
  }

  if (speed > 0.4) {
    const dimNames = ['活动程度', '社交倾向', '专注度', '表达欲'];
    let maxDim = 0;
    for (let d = 1; d < 4; d++) { if (Math.abs(vel[d]) > Math.abs(vel[maxDim])) maxDim = d; }
    const dir = vel[maxDim] > 0 ? '在上升' : '在下降';
    if (Math.abs(vel[maxDim]) > 0.3) {
      parts.push(`${dimNames[maxDim]}${dir}`);
    }
  }

  // Assemble
  if (parts.length === 0) return '';
  let narrative = parts[0];
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i++) {
      const sep = parts[i].length > 6 ? '。' : '，';
      narrative += sep + parts[i];
    }
  }

  return applyForbiddenTerms(narrative, agent.domain);
}

module.exports = { toNarrative };
