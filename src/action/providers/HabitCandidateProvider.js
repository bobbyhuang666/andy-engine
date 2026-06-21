/**
 * HabitCandidateProvider — generates action candidates from procedural memory habits
 *
 * Design invariants:
 *   - generate() is pure — no side effects, no state writes
 *   - Reads only from context.proceduralMemory (ProceduralMemory instance)
 *   - Does NOT call recordAction() or disrupt()
 *   - Does NOT modify patterns, recent actions, or any agent state
 *   - Maximum 1 habit candidate per tick
 *   - Domain-agnostic: no campus-specific strings hardcoded
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

const MAX_HABIT_CANDIDATES = 1;
const CONFIDENCE_THRESHOLD = 0.5;

const DEFAULT_STATE_ACTION_MAP = {
  eating: 'consume',
  resting: 'rest',
  sleeping: 'rest',
  working: 'work',
  studying: 'work',
  socializing: 'socialize',
  chatting: 'socialize',
  walking: 'move',
  moving: 'move',
};

class HabitCandidateProvider extends CandidateProvider {
  constructor() {
    super('HabitCandidateProvider');
  }

  generate(context) {
    if (!context.proceduralMemory) return [];
    if (context.currentHour == null) return [];

    const proceduralMemory = context.proceduralMemory;
    const queryContext = {
      hour: context.currentHour,
      dayOfWeek: context.dayOfWeek,
      position: context.currentPosition,
      valence: context.currentValence,
    };

    const habit = proceduralMemory.query(queryContext);
    if (!habit) return [];
    if (!habit.action || !habit.action.state) return [];
    if (habit.confidence < CONFIDENCE_THRESHOLD) return [];

    const stateActionMap = this._getStateActionMap(context.domain);
    const actionType = stateActionMap[habit.action.state];
    if (!actionType) return [];

    return [new ActionCandidate({
      type: actionType,
      source: 'habit',
      target: habit.action.state,
      label: `habit:${habit.action.state}`,
      priority: Math.min(1, habit.confidence),
      metadata: {
        patternKey: habit.patternKey,
        confidence: habit.confidence,
        habitState: habit.action.state,
        habitRegion: habit.action.region,
        reasonTrace: `habit-pattern:${habit.patternKey}`,
      },
    })];
  }

  _getStateActionMap(domain) {
    if (!domain || !domain.habitStateActionMap) return DEFAULT_STATE_ACTION_MAP;
    return { ...DEFAULT_STATE_ACTION_MAP, ...domain.habitStateActionMap };
  }
}

module.exports = { HabitCandidateProvider, MAX_HABIT_CANDIDATES, DEFAULT_STATE_ACTION_MAP };
