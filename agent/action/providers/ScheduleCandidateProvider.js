/**
 * ScheduleCandidateProvider — 基于日程生成候选
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

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

    return [createCandidate({
      type: actionType,
      source: 'schedule',
      target: activity.location || '',
      label: activity.label || 'scheduled action',
      metadata: { scheduleActivity: activity.type || null },
    })];
  }
}

module.exports = { ScheduleCandidateProvider };
