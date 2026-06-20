/**
 * src/canon/ — 世界事实权威层
 *
 * 决定世界里什么是真的。包含事实 schema、存储和事件管线。
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
} = require('./FactSchema');

const WorldFactStore = require('./WorldFactStore');
const CanonEventPipeline = require('./CanonEventPipeline');

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
  CanonEventPipeline,
};
