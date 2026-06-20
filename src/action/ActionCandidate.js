/**
 * ActionCandidate — formalized action candidate
 *
 * Pure JSON data object. No live references, no Date.now(), no Math.random().
 * Deterministic ID from source/type/target.
 *
 * Design invariants:
 *   - Immutable after construction
 *   - Serializable to JSON
 *   - No domain-specific terms
 */

const ACTION_TYPES = [
  'continue', 'move', 'rest', 'work', 'socialize',
  'explore', 'consume', 'observe', 'reflect',
];

const CANDIDATE_SOURCES = [
  'behaviorField', 'need', 'schedule', 'memory', 'relationship',
  'habit', 'goal', 'worldPressure', 'object', 'intrinsic',
];

function makeCandidateId(source, type, target = '') {
  return `cand_${source}_${type}_${target}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

class ActionCandidate {
  /**
   * @param {Object} params
   * @param {string} params.type - action type (must be in ACTION_TYPES)
   * @param {string} params.source - candidate source (must be in CANDIDATE_SOURCES)
   * @param {string} [params.target] - target identifier
   * @param {string} [params.label] - human-readable label
   * @param {number} [params.priority] - priority 0-1
   * @param {Object} [params.constraints] - constraints
   * @param {Object} [params.metadata] - extra metadata
   */
  constructor({ type, source, target = '', label = '', priority = 0, constraints = {}, metadata = {} }) {
    if (!ACTION_TYPES.includes(type)) {
      throw new Error(`Invalid action type: ${type}. Must be one of: ${ACTION_TYPES.join(', ')}`);
    }
    if (!CANDIDATE_SOURCES.includes(source)) {
      throw new Error(`Invalid candidate source: ${source}. Must be one of: ${CANDIDATE_SOURCES.join(', ')}`);
    }

    this.id = makeCandidateId(source, type, target);
    this.type = type;
    this.source = source;
    this.target = target || null;
    this.label = label || `${source}:${type}${target ? `→${target}` : ''}`;
    this.priority = priority;
    this.constraints = JSON.parse(JSON.stringify(constraints));
    this.metadata = JSON.parse(JSON.stringify(metadata));
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      source: this.source,
      target: this.target,
      label: this.label,
      priority: this.priority,
      constraints: JSON.parse(JSON.stringify(this.constraints)),
      metadata: JSON.parse(JSON.stringify(this.metadata)),
    };
  }
}

module.exports = {
  ACTION_TYPES,
  CANDIDATE_SOURCES,
  makeCandidateId,
  ActionCandidate,
};
