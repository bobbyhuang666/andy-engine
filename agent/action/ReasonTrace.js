/**
 * ReasonTrace — 行为选择原因追踪
 *
 * 记录为什么某个行为被选择。
 * 纯 JSON 数据结构，不含运行时引用。
 * 可序列化、可持久化、可注入 LLM prompt。
 */

/**
 * 创建 ReasonTrace
 * @param {Object} params
 * @returns {Object} ReasonTrace
 */
function createTrace(params = {}) {
  return {
    traceId: params.traceId || null,
    agentId: params.agentId || null,
    tick: params.tick || null,
    selectedActionId: params.selectedActionId || null,
    selectedActionType: params.selectedActionType || 'continue',
    selectedActionLabel: params.selectedActionLabel || '继续当前行为',
    candidateAlternatives: params.candidateAlternatives || [],
    scoreBreakdown: params.scoreBreakdown || null,
    keyReasons: params.keyReasons || [],
    rngStateBefore: params.rngStateBefore ?? null,
    rngStateAfter: params.rngStateAfter ?? null,
    randomDraw: params.randomDraw ?? null,
    temperature: params.temperature ?? 0.3,
    stateDeltas: params.stateDeltas || null,
  };
}

/**
 * 将 ReasonTrace 转为人类可读的解释
 * @param {Object} trace
 * @returns {string}
 */
function explain(trace) {
  if (!trace) return '无追踪信息';

  const parts = [];
  parts.push(`选择了: ${trace.selectedActionLabel || trace.selectedActionType}`);

  if (trace.keyReasons && trace.keyReasons.length > 0) {
    parts.push(`原因: ${trace.keyReasons.join('、')}`);
  }

  if (trace.candidateAlternatives && trace.candidateAlternatives.length > 1) {
    const others = trace.candidateAlternatives
      .filter(a => a.id !== trace.selectedActionId)
      .slice(0, 3)
      .map(a => `${a.label}(${a.score.toFixed(2)})`);
    if (others.length > 0) {
      parts.push(`其他选项: ${others.join('、')}`);
    }
  }

  return parts.join('。');
}

/**
 * 验证 ReasonTrace 是否可序列化
 * @param {Object} trace
 * @returns {boolean}
 */
function isSerializable(trace) {
  try {
    JSON.stringify(trace);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  createTrace,
  explain,
  isSerializable,
};
