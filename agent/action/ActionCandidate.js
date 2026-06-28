/**
 * ActionCandidate — 行为候选项
 *
 * 表示一个可供选择的行为。所有字段都是纯数据，不含运行时引用。
 * 来源可以是 need / schedule / behaviorField / memory / relationship / habit / worldPressure / intrinsic。
 */

/**
 * @typedef {Object} ActionCandidate
 * @property {string} id - 唯一标识
 * @property {string} type - 行为类型: continue | move | rest | work | socialize | explore | consume | reflect | observe
 * @property {string} source - 来源: need | schedule | behaviorField | memory | relationship | habit | worldPressure | intrinsic
 * @property {string} label - 人类可读标签
 * @property {string|null} targetRegion - 目标区域
 * @property {string|null} targetAgentId - 目标角色 ID
 * @property {string|null} targetObjectId - 目标物体 ID
 * @property {Object} constraints - 约束条件
 * @property {Object} expectedEffects - 预期效果
 * @property {Object} metadata - 元数据
 */

const ACTION_TYPES = [
  'continue', 'move', 'rest', 'work', 'socialize',
  'explore', 'consume', 'reflect', 'observe',
];

const CANDIDATE_SOURCES = [
  'need', 'schedule', 'behaviorField', 'memory',
  'relationship', 'habit', 'worldPressure', 'intrinsic',
];

/**
 * 创建 ActionCandidate
 * @param {Partial<ActionCandidate>} params
 * @returns {ActionCandidate}
 */
function createCandidate(params) {
  return {
    id: params.id || `cand_${params.type || 'continue'}_${params.source || 'behaviorField'}`,
    type: params.type || 'continue',
    source: params.source || 'behaviorField',
    label: params.label || params.type || 'continue',
    targetRegion: params.targetRegion || null,
    targetAgentId: params.targetAgentId || null,
    targetObjectId: params.targetObjectId || null,
    constraints: params.constraints || {},
    expectedEffects: params.expectedEffects || {},
    metadata: params.metadata || {},
  };
}

/**
 * 创建一个安全的 fallback continue 候选
 * @returns {ActionCandidate}
 */
function createFallbackCandidate() {
  return createCandidate({
    id: 'cand_fallback_continue',
    type: 'continue',
    source: 'behaviorField',
    label: '继续当前行为',
  });
}

module.exports = {
  createCandidate,
  createFallbackCandidate,
  ACTION_TYPES,
  CANDIDATE_SOURCES,
};
