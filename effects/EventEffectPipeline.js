/**
 * EventEffectPipeline — 纯模块，不修改 live Agent/World
 *
 * 输入: { agentSnapshot, selectedCandidate, reasonTrace, simTime }
 * 输出: { event, stateDeltas, updatedReasonTrace }
 *
 * 设计原则:
 *   - 纯函数，不修改输入参数
 *   - 不使用 Date.now()，时间从 context.simTime 获取
 *   - 不直接修改 Agent/World 状态
 *   - 支持 need/emotion/memory/relationship/location/world delta shapes
 *
 * 职责边界：
 *   - action_selected 事件的 effect 计算（applyActionEffect）
 *   - canon event 的角色后果（applyEventConsequences）
 *   - 世界法则（event→fact→knowledge）由 CanonEventPipeline 负责
 *
 * Dependency leaf: this module must NOT import from core/, agent/, sdk/, or facts/.
 * It may only import from config/.
 */

/**
 * 生成结构化的 action_selected event
 *
 * @param {Object} params
 * @param {Object} params.agentSnapshot - agent 状态快照（只读）
 * @param {Object} params.selectedCandidate - UtilitySelector 选中的候选
 * @param {Object} params.reasonTrace - ReasonTrace（只读）
 * @param {Date|string} params.simTime - 模拟时间
 * @returns {{ event: Object, stateDeltas: Object, updatedReasonTrace: Object }}
 */
function applyActionEffect({ agentSnapshot, selectedCandidate, reasonTrace, simTime }) {
  const simTimeISO = simTime instanceof Date ? simTime.toISOString() : (simTime || null);

  // Defensive guard: if no selectedCandidate, return neutral structure
  if (!selectedCandidate) {
    const event = {
      type: 'action_none',
      time: simTimeISO,
      agentId: agentSnapshot?.id || 'unknown',
      action: null,
      reasonTraceSummary: {
        keyReasons: reasonTrace?.keyReasons || [],
        totalScore: reasonTrace?.scoreBreakdown?.total || 0,
      },
    };
    const stateDeltas = { need: {}, emotion: {}, memory: null, relationship: null, location: null, world: null };
    const updatedReasonTrace = reasonTrace ? { ...reasonTrace, stateDeltas } : { stateDeltas };
    return { event, stateDeltas, updatedReasonTrace };
  }

  // 构建结构化 event
  const event = {
    type: 'action_selected',
    time: simTimeISO,
    agentId: agentSnapshot?.id || 'unknown',
    action: {
      type: selectedCandidate.type,
      source: selectedCandidate.source,
      target: selectedCandidate.target || null,
      label: selectedCandidate.label || '',
    },
    reasonTraceSummary: {
      keyReasons: reasonTrace?.keyReasons || [],
      totalScore: reasonTrace?.scoreBreakdown?.total || 0,
    },
  };

  // 计算 stateDeltas（纯计算，不修改任何状态）
  const stateDeltas = computeStateDeltas(selectedCandidate, agentSnapshot);

  // 将 stateDeltas 写入 reasonTrace 副本
  const updatedReasonTrace = reasonTrace ? { ...reasonTrace, stateDeltas } : { stateDeltas };

  return { event, stateDeltas, updatedReasonTrace };
}

/**
 * 计算状态增量（纯计算）
 *
 * @param {Object} candidate - 选中的候选
 * @param {Object} agentSnapshot - agent 快照
 * @returns {Object} stateDeltas
 */
function computeStateDeltas(candidate, agentSnapshot) {
  const deltas = {
    need: {},
    emotion: {},
    memory: null,
    relationship: null,
    location: null,
    world: null,
  };

  // Phase 35/37/38 allowlist: rest, observe, reflect, move, socialize, continue/default.
  // Later phases may add object, consume, work effects behind gates.
  switch (candidate.type) {
    case 'rest':
      deltas.need = { energy: 0.4 };
      deltas.emotion = { calm: 0.1, joy: 0.05 };
      break;
    case 'observe':
      deltas.memory = {
        kind: 'candidate',
        type: 'observation',
        target: candidate.target || null,
        content: candidate.label || 'observe',
      };
      break;
    case 'reflect':
      deltas.memory = {
        kind: 'candidate',
        type: 'reflection',
        target: candidate.target || null,
        content: candidate.label || 'reflect',
      };
      deltas.emotion = { calm: 0.03 };
      break;
    case 'move':
      if (candidate.target) {
        deltas.location = {
          from: agentSnapshot?.agent?.position || null,
          to: candidate.target,
          reason: 'action_move',
        };
      }
      break;
    case 'socialize':
      if (candidate.target) {
        deltas.relationship = {
          targetAgentId: candidate.target,
          interactionType: 'action_socialize',
          valence: 0.3,
          content: candidate.label || 'socialize',
        };
      }
      break;
    case 'continue':
    default:
      break;
  }

  return deltas;
}

/**
 * Apply event consequences: memory creation, location meaning, future tendency.
 * This is the "write-back" half of event processing.
 * CanonEventPipeline handles event→fact→knowledge (world canon).
 * EventEffectPipeline handles event→memory/location/tendency (agent consequences).
 *
 * @param {Object} params
 * @param {Object} params.fact - EventFact from CanonEventPipeline
 * @param {Map<string, Object>} params.agents - agentId → Agent
 * @param {Object} params.factStore - WorldFactStore instance
 * @returns {{ memoryUpdates: Object[], locationMeaningUpdates: Object[], tendencyUpdates: Object[] }}
 */
function applyEventConsequences({ fact, agents, factStore, domain }) {
  const results = { memoryUpdates: [], locationMeaningUpdates: [], tendencyUpdates: [] };
  if (!fact) return results;

  const rules = domain
    ? domain.eventConsequenceRules
    : require('../config/defaults').ANDY_DEFAULTS.eventConsequenceRules;

  // Memory creation
  if (fact.participants || fact.observers) {
    results.memoryUpdates = _createMemoriesFromFact(fact, agents, rules);
  }

  // Location meaning update
  if (fact.location && factStore) {
    results.locationMeaningUpdates = _updateLocationMeaning(fact, factStore, rules);
  }

  // Future tendency update
  if (fact.location && fact.participants) {
    results.tendencyUpdates = _updateFutureTendency(fact, agents, rules);
  }

  return results;
}

function _createMemoriesFromFact(fact, agents, rules) {
  const updates = [];
  const seen = new Set();
  const allRelevant = [];
  if (fact.participants) {
    for (const id of fact.participants) {
      if (!seen.has(id)) { seen.add(id); allRelevant.push(id); }
    }
  }
  if (fact.observers) {
    for (const id of fact.observers) {
      if (!seen.has(id)) { seen.add(id); allRelevant.push(id); }
    }
  }
  for (const agentId of allRelevant) {
    const agent = agents.get(agentId);
    if (agent && agent.memory) {
      const memory = {
        content: fact.description,
        category: 'event',
        importance: _calculateImportance(fact),
        emotionTag: _inferEmotionTag(fact, rules),
      };
      agent.memory.addExperience(memory, agent.emotion);
      updates.push({ agentId, type: 'memory_add' });
    }
  }
  return updates;
}

function _calculateImportance(fact) {
  let importance = 0.3;
  if (fact.participants && fact.participants.length > 2) importance += 0.2;
  if (fact.scope === 'public') importance += 0.1;
  return Math.min(1.0, importance);
}

function _inferEmotionTag(fact, rules) {
  const desc = fact.description || '';
  const keywords = (rules && rules.emotionKeywords) || {};
  for (const [tag, kws] of Object.entries(keywords)) {
    if (kws.some(kw => desc.includes(kw))) return tag;
  }
  return 'neutral';
}

function _updateLocationMeaning(fact, factStore, rules) {
  const updates = [];
  const desc = fact.description || '';
  const meaningRules = (rules && rules.eventMeaningRules) || [];
  for (const rule of meaningRules) {
    if (rule.keywords.some(kw => desc.includes(kw))) {
      factStore.updateLocationMeaning(fact.location, {
        type: rule.meaningType,
        weight: rule.weight,
        reason: desc,
      });
      updates.push({ location: fact.location, meaningType: rule.meaningType, weight: rule.weight });
      break;
    }
  }
  return updates;
}

function _updateFutureTendency(fact, agents, rules) {
  const updates = [];
  const delta = _computeTendencyDelta(fact, rules);
  const importance = _calculateImportance(fact);
  for (const agentId of fact.participants) {
    const agent = agents.get(agentId);
    if (agent && agent.futureTendency) {
      agent.futureTendency.updateTendency(fact.location, delta, importance);
      updates.push({ agentId, location: fact.location, delta });
    }
  }
  return updates;
}

function _computeTendencyDelta(fact, rules) {
  const delta = [0, 0, 0, 0];
  const desc = fact.description || '';
  const tendencyRules = (rules && rules.tendencyRules) || [];
  for (const rule of tendencyRules) {
    if (rule.keywords.some(kw => desc.includes(kw))) {
      for (let i = 0; i < 4; i++) delta[i] = rule.delta[i];
      break;
    }
  }
  return delta;
}

module.exports = {
  applyActionEffect,
  computeStateDeltas,
  applyEventConsequences,
};
