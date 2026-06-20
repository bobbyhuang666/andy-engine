/**
 * src/action/ — Action Layer
 *
 * Pure, read-only action selection layer.
 *
 * Design invariants:
 *   - Does NOT modify memory, relationship, emotion, needs
 *   - Does NOT create facts or write to event log
 *   - CAN read agent snapshots, pressure context
 *   - Produces ActionCandidate, SelectedAction, ReasonTrace
 *   - Same seed + same world state = same action (deterministic)
 */

const { ActionCandidate, ACTION_TYPES, CANDIDATE_SOURCES, makeCandidateId } = require('./ActionCandidate');
const { SelectedAction } = require('./SelectedAction');
const { ReasonTrace } = require('./ReasonTrace');
const { scoreCandidate, scoreCandidates } = require('./UtilityScorer');
const { selectAction } = require('./UtilitySelector');
const { CandidateProvider } = require('./providers/CandidateProvider');
const { CandidateProviderManager } = require('./providers/CandidateProviderManager');

module.exports = {
  ActionCandidate,
  ACTION_TYPES,
  CANDIDATE_SOURCES,
  makeCandidateId,
  SelectedAction,
  ReasonTrace,
  scoreCandidate,
  scoreCandidates,
  selectAction,
  CandidateProvider,
  CandidateProviderManager,
};
