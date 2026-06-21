/**
 * src/effects — typed delta contract.
 *
 * Public API:
 *   - EffectResult: typed pipeline output container
 *   - StateDelta: base class
 *   - NeedDelta, EmotionDelta, MemoryDelta, RelationshipDelta,
 *     LocationMeaningDelta, FutureTendencyDelta, PositionDelta: concrete delta types
 *   - EffectCommitter: unified delta applier
 *   - applyActionEffect, computeDeltas, applyEventConsequences: pure pipeline functions
 */

const { StateDelta } = require('./StateDelta');
const { NeedDelta } = require('./NeedDelta');
const { EmotionDelta } = require('./EmotionDelta');
const { MemoryDelta } = require('./MemoryDelta');
const { RelationshipDelta } = require('./RelationshipDelta');
const { LocationMeaningDelta } = require('./LocationMeaningDelta');
const { FutureTendencyDelta } = require('./FutureTendencyDelta');
const { PositionDelta } = require('./PositionDelta');
const { EffectResult } = require('./EffectResult');
const { EffectCommitter } = require('./EffectCommitter');
const {
  applyActionEffect,
  computeDeltas,
  computeStateDeltas,
  applyEventConsequences,
} = require('./EventEffectPipeline');

module.exports = {
  // Types
  StateDelta,
  NeedDelta,
  EmotionDelta,
  MemoryDelta,
  RelationshipDelta,
  LocationMeaningDelta,
  FutureTendencyDelta,
  PositionDelta,
  EffectResult,
  // Committer
  EffectCommitter,
  // Pipeline functions
  applyActionEffect,
  computeDeltas,
  computeStateDeltas,
  applyEventConsequences,
};
