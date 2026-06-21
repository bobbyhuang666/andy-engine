/**
 * facts/ — Compatibility wrapper
 *
 * 所有实现已迁移到 src/canon/, src/knowledge/, src/narrative/
 * 此文件保留向后兼容性，不要在此添加新功能。
 *
 * 迁移映射：
 *   - WorldFactStore, FactSchema, CanonEventPipeline → src/canon/
 *   - KnowledgeStore → src/knowledge/
 *   - FactProvider, FactConsistencyChecker, FactFormatter → src/narrative/
 *   - FactEmitter → src/canon/
 */

const {
  FactType,
  FACT_TYPES,
  FactSource,
  FACT_SOURCES,
  FactScope,
  FACT_SCOPES,
  validateFact,
  validateTypeFields,
  createBaseFact,
  createStaticEnvFact,
  createAgentStateFact,
  createRelationshipFact,
  createEventFact,
  createObservationFact,
  createMemoryFact,
  createRuleFact,
  createLocationMeaningFact,
  createInvalidatedFact,
} = require('../src/canon');

const WorldFactStore = require('../src/canon/WorldFactStore');
const FactEmitter = require('../src/canon/FactEmitter');
const FactFormatter = require('../src/narrative/FactFormatter');
const FactProvider = require('../src/narrative/FactProvider');
const FactConsistencyChecker = require('../src/narrative/FactConsistencyChecker');
const KnowledgeStore = require('../src/knowledge/KnowledgeStore');
const CanonEventPipeline = require('../src/canon/CanonEventPipeline');

module.exports = {
  FactType,
  FACT_TYPES,
  FactSource,
  FACT_SOURCES,
  FactScope,
  FACT_SCOPES,
  validateFact,
  validateTypeFields,
  createBaseFact,
  createStaticEnvFact,
  createAgentStateFact,
  createRelationshipFact,
  createEventFact,
  createObservationFact,
  createMemoryFact,
  createRuleFact,
  createLocationMeaningFact,
  createInvalidatedFact,
  WorldFactStore,
  FactEmitter,
  FactFormatter,
  FactProvider,
  FactConsistencyChecker,
  KnowledgeStore,
  CanonEventPipeline,
};
