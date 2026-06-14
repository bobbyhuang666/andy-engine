/**
 * facts/ - 世界事实系统
 *
 * Phase W1: Fact Schema + WorldFactStore Foundation
 * Phase W8: WorldCanon - 失效/覆盖、地点意义、规则
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
const FactEmitter = require('./FactEmitter');
const FactFormatter = require('./FactFormatter');
const FactProvider = require('./FactProvider');
const FactConsistencyChecker = require('./FactConsistencyChecker');
const KnowledgeStore = require('./KnowledgeStore');
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
  FactEmitter,
  FactFormatter,
  FactProvider,
  FactConsistencyChecker,
  KnowledgeStore,
  CanonEventPipeline,
};
