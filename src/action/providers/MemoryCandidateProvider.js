/**
 * MemoryCandidateProvider — generates action candidates from high-activation memories
 *
 * Design invariants:
 *   - generate() is pure — no side effects, no state writes
 *   - Reads only from context.memories (pre-retrieved by PersonalMemory.retrieve())
 *   - Does NOT call memory.addExperience or any write method
 *   - Does NOT modify emotion/needs/relationship/position/facts
 *   - Maximum 2 memory candidates per tick
 *   - Uses domain memoryTemplates for semantic category mapping
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

const MAX_MEMORY_CANDIDATES = 2;

const DEFAULT_SEMANTIC_ACTION_MAP = {
  'study': { type: 'work', source: 'memory' },
  'social': { type: 'socialize', source: 'memory' },
  'rest': { type: 'rest', source: 'memory' },
  'work': { type: 'work', source: 'memory' },
  'explore': { type: 'explore', source: 'memory' },
  'eat': { type: 'consume', source: 'memory' },
  'sleep': { type: 'rest', source: 'memory' },
};

class MemoryCandidateProvider extends CandidateProvider {
  constructor() {
    super('MemoryCandidateProvider');
  }

  generate(context) {
    if (!context.memories || !Array.isArray(context.memories) || context.memories.length === 0) {
      return [];
    }

    const semanticCategoryMap = this._getSemanticCategoryMap(context.domain);
    const candidates = [];

    for (const mem of context.memories) {
      if (candidates.length >= MAX_MEMORY_CANDIDATES) break;

      const semanticCategory = mem.semanticCategory;
      if (!semanticCategory) continue;

      const mapping = semanticCategoryMap[semanticCategory];
      if (!mapping) continue;

      const importance = typeof mem.importance === 'number' && Number.isFinite(mem.importance) ? mem.importance : 0.5;
      const priority = Math.min(1, importance * 0.8);

      candidates.push(new ActionCandidate({
        type: mapping.type,
        source: mapping.source || 'memory',
        target: semanticCategory,
        label: `memory:${semanticCategory}`,
        priority,
        metadata: {
          memoryId: mem.id,
          semanticCategory,
          importance: mem.importance,
          emotionTag: mem.emotionTag,
          reasonTrace: `memory-influence:${semanticCategory}`,
        },
      }));
    }

    return candidates;
  }

  _getSemanticCategoryMap(domain) {
    if (!domain) throw new Error('MemoryCandidateProvider._getSemanticCategoryMap requires a domain config');
    return (domain.actionCandidateMappings && domain.actionCandidateMappings.memorySemanticCategoryActionMap)
      ? domain.actionCandidateMappings.memorySemanticCategoryActionMap
      : DEFAULT_SEMANTIC_ACTION_MAP;
  }
}

module.exports = { MemoryCandidateProvider, MAX_MEMORY_CANDIDATES };
