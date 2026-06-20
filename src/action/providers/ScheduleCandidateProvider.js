/**
 * ScheduleCandidateProvider — generates candidates from schedule
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

class ScheduleCandidateProvider extends CandidateProvider {
  constructor() { super('ScheduleCandidateProvider'); }

  generate(context) {
    if (!context.schedule || !context.schedule.currentActivity) return [];
    const activity = context.schedule.currentActivity;
    if (!activity.type) return [];

    const allowedTypes = new Set([
      'continue', 'move', 'rest', 'work', 'socialize',
      'explore', 'consume', 'observe', 'reflect',
    ]);
    const declaredType = activity.actionType || activity.category || activity.type;
    const actionType = allowedTypes.has(declaredType) ? declaredType : 'continue';

    return [new ActionCandidate({
      type: actionType,
      source: 'schedule',
      target: activity.location || '',
      label: activity.label || 'scheduled action',
      metadata: { scheduleActivity: activity.type || null },
    })];
  }
}

module.exports = { ScheduleCandidateProvider };
