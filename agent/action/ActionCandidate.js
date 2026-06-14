/**
 * ActionCandidate — 内部行为候选表示
 *
 * 设计原则：
 *   - 纯 JSON 数据，无 live object references
 *   - 无 Date.now() / Math.random() 用于 ID
 *   - ID 从 source/type/target 确定性生成
 *   - 用于 UtilitySelector 评分和选择
 */

// 允许的 action types
const ACTION_TYPES = [
  'continue', 'move', 'rest', 'work', 'socialize',
  'explore', 'consume', 'observe', 'reflect',
];

// 允许的 candidate sources
const CANDIDATE_SOURCES = [
  'behaviorField', 'need', 'schedule', 'memory', 'relationship',
  'habit', 'goal', 'worldPressure', 'object', 'intrinsic',
];

/**
 * 生成确定性候选 ID
 *
 * @param {string} source - 候选来源
 * @param {string} type - action type
 * @param {string} [target] - 目标（可选）
 * @returns {string}
 */
function makeCandidateId(source, type, target = '') {
  return `cand_${source}_${type}_${target}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * 创建 ActionCandidate
 *
 * @param {Object} params
 * @param {string} params.type - action type（必须在 ACTION_TYPES 中）
 * @param {string} params.source - candidate source（必须在 CANDIDATE_SOURCES 中）
 * @param {string} [params.target] - 目标标识（区域、角色、物体等）
 * @param {string} [params.label] - 人类可读标签
 * @param {Object} [params.constraints] - 约束条件
 * @param {Object} [params.metadata] - 额外元数据
 * @returns {Object} ActionCandidate（纯 JSON）
 */
function createCandidate({ type, source, target = '', label = '', constraints = {}, metadata = {} }) {
  if (!ACTION_TYPES.includes(type)) {
    throw new Error(`Invalid action type: ${type}. Must be one of: ${ACTION_TYPES.join(', ')}`);
  }
  if (!CANDIDATE_SOURCES.includes(source)) {
    throw new Error(`Invalid candidate source: ${source}. Must be one of: ${CANDIDATE_SOURCES.join(', ')}`);
  }

  return {
    id: makeCandidateId(source, type, target),
    type,
    source,
    target,
    label: label || `${source}:${type}${target ? `→${target}` : ''}`,
    constraints: JSON.parse(JSON.stringify(constraints)),
    metadata: JSON.parse(JSON.stringify(metadata)),
  };
}

module.exports = {
  ACTION_TYPES,
  CANDIDATE_SOURCES,
  makeCandidateId,
  createCandidate,
};
