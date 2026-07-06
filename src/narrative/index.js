/**
 * src/narrative/ — 受限表达 / LLM grounding 层
 *
 * 将事实转化为 LLM 可消费的表达。不拥有世界真理，只读取和格式化。
 */

const FactProvider = require('./FactProvider');
const FactConsistencyChecker = require('./FactConsistencyChecker');
const FactFormatter = require('./FactFormatter');
const GroundingChecker = require('./GroundingChecker');
const ClaimExtractor = require('./ClaimExtractor');

module.exports = {
  FactProvider,
  FactConsistencyChecker,
  FactFormatter,
  GroundingChecker,
  ClaimExtractor,
};
