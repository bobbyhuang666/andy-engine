/**
 * WorldPressureCandidateProvider — generates action candidates from environmental pressure
 *
 * Reads pre-computed pressure from context.worldPressure.
 * Pure function: no state writes, no side effects.
 */

const { CandidateProvider } = require('./CandidateProvider');
const { ActionCandidate } = require('../ActionCandidate');

const PRESSURE_RULES = [
  { key: 'crowding', threshold: 0.3, type: 'move', label: 'leave crowded area' },
  { key: 'time', threshold: 0.5, type: 'rest', label: 'rest due to late hour' },
  { key: 'location', threshold: 0.3, type: 'move', label: 'leave unpleasant location' },
  { key: 'event', threshold: 0.3, type: 'observe', label: 'observe stressful event' },
  { key: 'total', threshold: 0.6, type: 'reflect', label: 'reflect on pressure' },
];

const MAX_CANDIDATES = 2;

class WorldPressureCandidateProvider extends CandidateProvider {
  constructor() { super('WorldPressureCandidateProvider'); }

  generate(context) {
    if (!context.worldPressure || typeof context.worldPressure !== 'object') return [];

    const wp = context.worldPressure;
    const candidates = [];

    for (const rule of PRESSURE_RULES) {
      if (candidates.length >= MAX_CANDIDATES) break;
      const value = wp[rule.key];
      if (!Number.isFinite(value) || value < rule.threshold) continue;

      candidates.push(new ActionCandidate({
        type: rule.type,
        source: 'worldPressure',
        target: rule.key,
        label: rule.label,
        priority: Math.min(1, value / 2),
        metadata: { pressureType: rule.key, pressureValue: value },
      }));
    }

    return candidates;
  }
}

module.exports = { WorldPressureCandidateProvider };
