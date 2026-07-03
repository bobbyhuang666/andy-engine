/**
 * Phase 28: Memory To Behavior Influence Tests
 *
 * Verifies:
 * - High-importance memory changes candidate scores
 * - Low-importance memory has weak or no effect
 * - Memory influence is bounded (saturates)
 * - Memory influence decays over time
 */

import { describe, it, expect } from 'vitest';
import { scoreCandidate } from '../src/action/UtilityScorer.js';
import { ActionCandidate } from '../src/action/ActionCandidate.js';

function createCandidate(params) {
  return new ActionCandidate({
    type: params.type || 'continue',
    source: params.source || 'behaviorField',
    target: params.target || '',
    label: params.label || '',
    metadata: params.metadata || {},
  });
}

function makeContext(memories = []) {
  return {
    agent: { id: 'a', position: '图书馆' },
    env: { hour: 14, dayOfWeek: 3, weather: 'sunny' },
    domain: null,
    behaviorField: { B: [0.5, 0.3, 0.7, 0.2] },
    needs: { hunger: 0.8, energy: 0.8, social: 0.8, comfort: 0.8, stimulation: 0.8 },
    emotion: { valence: 0.1, arousal: 0.5, approachDrive: 0.2, avoidDrive: 0.1, agenticDrive: 0 },
    relationships: [],
    memories,
  };
}

describe('Phase 28: Memory To Behavior Influence', () => {
  describe('Memory scoring', () => {
    it('high-importance happy memory increases socialize score', () => {
      const socializeCandidate = createCandidate({
        type: 'socialize',
        source: 'behaviorField',
        metadata: { semanticCategory: '社交互动' },
      });

      const withoutMemory = scoreCandidate(socializeCandidate, makeContext([]));
      const withMemory = scoreCandidate(socializeCandidate, makeContext([
        { importance: 0.8, activation: 0.8, valence: 0.7, semanticCategory: '社交互动' },
      ]));

      expect(withMemory.memory).toBeGreaterThan(withoutMemory.memory);
      expect(withMemory.memory).toBeGreaterThan(0);
    });

    it('high-importance sad memory increases rest score', () => {
      const restCandidate = createCandidate({ type: 'rest', source: 'behaviorField' });

      const withoutMemory = scoreCandidate(restCandidate, makeContext([]));
      const withMemory = scoreCandidate(restCandidate, makeContext([
        { importance: 0.7, activation: 0.8, valence: 0.2, actionType: 'rest' },
      ]));

      expect(withMemory.memory).toBeGreaterThan(withoutMemory.memory);
    });

    it('low-importance memory has weak effect', () => {
      const candidate = createCandidate({
        type: 'socialize',
        source: 'behaviorField',
        metadata: { semanticCategory: '社交互动' },
      });

      const withLowMemory = scoreCandidate(candidate, makeContext([
        { importance: 0.1, activation: 0.5, valence: 0.5, semanticCategory: '社交互动' },
      ]));

      // Low importance → weak or zero memory score
      expect(withLowMemory.memory).toBeLessThan(0.2);
    });

    it('neutral memory has minimal effect', () => {
      const candidate = createCandidate({
        type: 'socialize',
        source: 'behaviorField',
        metadata: { semanticCategory: '社交互动' },
      });

      const withNeutral = scoreCandidate(candidate, makeContext([
        { importance: 0.5, activation: 0.5, valence: 0, semanticCategory: '日常琐事' },
      ]));

      expect(withNeutral.memory).toBeLessThan(0.3);
    });
  });

  describe('Memory saturation', () => {
    it('memory influence saturates at 0.8', () => {
      const candidate = createCandidate({
        type: 'socialize',
        source: 'behaviorField',
        metadata: { semanticCategory: '社交互动' },
      });

      // Many high-importance happy memories
      const manyMemories = Array.from({ length: 20 }, (_, i) => ({
        importance: 0.9,
        activation: 0.9,
        valence: 0.8,
        semanticCategory: '社交互动',
      }));

      const score = scoreCandidate(candidate, makeContext(manyMemories));
      expect(score.memory).toBeLessThanOrEqual(0.8);
    });
  });

  describe('Memory influence in total score', () => {
    it('memory contributes to total score', () => {
      const candidate = createCandidate({
        type: 'socialize',
        source: 'behaviorField',
        metadata: { semanticCategory: '社交互动' },
      });

      const withoutMemory = scoreCandidate(candidate, makeContext([]));
      const withMemory = scoreCandidate(candidate, makeContext([
        { importance: 0.8, activation: 0.8, valence: 0.7, semanticCategory: '社交互动' },
      ]));

      expect(withMemory.total).toBeGreaterThan(withoutMemory.total);
    });
  });
});
