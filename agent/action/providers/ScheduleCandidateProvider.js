/**
 * ScheduleCandidateProvider — 日程驱动的候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class ScheduleCandidateProvider extends CandidateProvider {
  constructor() {
    super('schedule');
  }

  generate(context) {
    if (!context.schedule || !context.schedule.inSchedule) return [];
    if (!context.schedule.targetRegion) return [];

    return [createCandidate({
      id: 'cand_schedule',
      type: this._regionToActionType(context.schedule.targetRegion, context),
      source: 'schedule',
      label: `前往${context.schedule.targetRegion}`,
      targetRegion: context.schedule.targetRegion,
      metadata: { activity: context.schedule.targetActivity },
    })];
  }

  _regionToActionType(region, context) {
    if (!context.domain) return 'move';
    const placeTypes = context.domain.placeTypes || {};
    if ((placeTypes.food || []).includes(region)) return 'consume';
    if ((placeTypes.work || []).includes(region)) return 'work';
    if ((placeTypes.rest || []).includes(region)) return 'rest';
    if ((placeTypes.social || []).includes(region)) return 'socialize';
    if ((placeTypes.explore || []).includes(region)) return 'explore';
    return 'move';
  }
}

module.exports = { ScheduleCandidateProvider };
