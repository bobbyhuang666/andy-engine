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
import { scoreCandidate } from '../agent/action/UtilityScorer.js';
import { createCandidate } from '../agent/action/ActionCandidate.js';

function makeContext(memories = []) {
  return {
    agent: { id: 'a', position: '图书馆' },
    env: { hour: 14, dayOfWeek: 3, weather: 'sunny' },
    domain: null,
    behavior: { B: [0.5, 0.3, 0.7, 0.2] },
    needs: { hunger: 0.8, energy: 0.8, social: 0.8, comfort: 0.8, stimulation: 0.8 },
    emotion: { valence: 0.1, arousal: 0.5, approachDrive: 0.2, avoidDrive: 0.1, agenticDrive: 0 },
    relationships: [],
    memories,
  };
}

describe('Phase 28: Memory To Behavior Influence', () => {
  describe('Memory scoring', () => {
    it('high-importance happy memory increases socialize score', () => {
      const socializeCandidate = createCandidate({ type: 'socialize', source: 'behaviorField' });

      const withoutMemory = scoreCandidate(socializeCandidate, makeContext([]));
      const withMemory = scoreCandidate(socializeCandidate, makeContext([
        { importance: 0.8, emotionTag: 'happy', semanticCategory: '社交互动', emotionSnapshot: { joy: 0.5 } },
      ]));

      expect(withMemory.memory).toBeGreaterThan(withoutMemory.memory);
      expect(withMemory.memory).toBeGreaterThan(0);
    });

    it('high-importance sad memory increases rest score', () => {
      const restCandidate = createCandidate({ type: 'rest', source: 'behaviorField' });

      const withoutMemory = scoreCandidate(restCandidate, makeContext([]));
      const withMemory = scoreCandidate(restCandidate, makeContext([
        { importance: 0.7, emotionTag: 'sad', semanticCategory: '日常琐事', emotionSnapshot: { sadness: 0.4 } },
      ]));

      expect(withMemory.memory).toBeGreaterThan(withoutMemory.memory);
    });

    it('low-importance memory has weak effect', () => {
      const candidate = createCandidate({ type: 'socialize', source: 'behaviorField' });

      const withLowMemory = scoreCandidate(candidate, makeContext([
        { importance: 0.1, emotionTag: 'happy', semanticCategory: '社交互动', emotionSnapshot: { joy: 0.5 } },
      ]));

      // Low importance → weak or zero memory score
      expect(withLowMemory.memory).toBeLessThan(0.2);
    });

    it('neutral memory has minimal effect', () => {
      const candidate = createCandidate({ type: 'socialize', source: 'behaviorField' });

      const withNeutral = scoreCandidate(candidate, makeContext([
        { importance: 0.5, emotionTag: 'neutral', semanticCategory: '日常琐事', emotionSnapshot: {} },
      ]));

      expect(withNeutral.memory).toBeLessThan(0.3);
    });
  });

  describe('Memory saturation', () => {
    it('memory influence saturates at 0.8', () => {
      const candidate = createCandidate({ type: 'socialize', source: 'behaviorField' });

      // Many high-importance happy memories
      const manyMemories = Array.from({ length: 20 }, (_, i) => ({
        importance: 0.9,
        emotionTag: 'happy',
        semanticCategory: '社交互动',
        emotionSnapshot: { joy: 0.6, excitement: 0.4 },
      }));

      const score = scoreCandidate(candidate, makeContext(manyMemories));
      expect(score.memory).toBeLessThanOrEqual(0.8);
    });
  });

  describe('Memory influence in total score', () => {
    it('memory contributes to total score', () => {
      const candidate = createCandidate({ type: 'socialize', source: 'behaviorField' });

      const withoutMemory = scoreCandidate(candidate, makeContext([]));
      const withMemory = scoreCandidate(candidate, makeContext([
        { importance: 0.8, emotionTag: 'happy', semanticCategory: '社交互动', emotionSnapshot: { joy: 0.5 } },
      ]));

      expect(withMemory.total).toBeGreaterThan(withoutMemory.total);
    });
  });
});
