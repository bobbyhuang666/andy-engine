/**
 * StoryGenerator RNG/simTime injection tests
 *
 * Verifies deterministic output with seeded RNG and simTime,
 * and backward compatibility when options are omitted.
 */

import { describe, it, expect } from 'vitest';
import { StoryGenerator } from '../../src/narrative/StoryGenerator.js';
import { RNG } from '../../src/shared/rng.js';

describe('StoryGenerator RNG/simTime injection', () => {
  const simTime = new Date('2026-06-21T14:00:00Z');

  const baseTickResult = {
    tickNumber: 42,
    phase: {
      agentThink: {
        results: {
          bobby: {
            stateChanged: true,
            previousState: 'idle',
            newState: 'working',
          },
        },
      },
    },
  };

  const socialTickResult = {
    tickNumber: 43,
    phase: {
      agentThink: {
        results: {
          bobby: {
            interaction: {
              otherAgentName: '小明',
              location: 'cafe',
            },
          },
        },
      },
    },
  };

  const emotionTickResult = {
    tickNumber: 44,
    phase: {
      agentThink: {
        results: {
          bobby: {
            emotion: {
              joy: 0.9,
              contentment: 0.8,
              satisfaction: 0.7,
              sadness: 0,
              anger: 0,
              fear: 0,
            },
          },
        },
      },
    },
  };

  const mindWanderTickResult = {
    tickNumber: 45,
    phase: {
      agentThink: {
        results: {
          bobby: {
            mindWander: {
              content: '明天的计划',
              type: 'reminisce',
            },
          },
        },
      },
    },
  };

  describe('generateFromTick determinism', () => {
    it('same seed + same simTime → identical output', () => {
      const gen = new StoryGenerator();
      const rng1 = new RNG('test-seed');
      const rng2 = new RNG('test-seed');

      const stories1 = gen.generateFromTick(baseTickResult, 'bobby', { rng: rng1, simTime });
      const stories2 = gen.generateFromTick(baseTickResult, 'bobby', { rng: rng2, simTime });

      expect(stories1).toEqual(stories2);
    });

    it('different seed → allowed different templates', () => {
      const gen = new StoryGenerator();
      const rng1 = new RNG('seed-alpha');
      const rng2 = new RNG('seed-beta');

      const stories1 = gen.generateFromTick(baseTickResult, 'bobby', { rng: rng1, simTime });
      const stories2 = gen.generateFromTick(baseTickResult, 'bobby', { rng: rng2, simTime });

      expect(stories1).toBeDefined();
      expect(stories2).toBeDefined();
      // Both should have valid stories (state change always produces exactly one)
      expect(stories1.length).toBe(1);
      expect(stories2.length).toBe(1);
      // Content might be same or different depending on seed — both are valid
    });

    it('timestamp uses simTime, not Date.now()', () => {
      const gen = new StoryGenerator();
      const rng = new RNG('test-seed');

      const before = Date.now();
      const stories = gen.generateFromTick(baseTickResult, 'bobby', { rng, simTime });
      const after = Date.now();

      const ts = stories[0].timestamp;
      expect(ts).toBe(simTime.getTime());
      // Verify it's not in the wall-clock range
      if (simTime.getTime() < before || simTime.getTime() > after) {
        expect(ts).not.toBeGreaterThanOrEqual(before);
      }
    });

    it('multiple calls with same seed + simTime produce identical arrays', () => {
      const gen = new StoryGenerator();
      const rng1 = new RNG('deterministic');
      const rng2 = new RNG('deterministic');

      const s1 = gen.generateFromTick(baseTickResult, 'bobby', { rng: rng1, simTime });
      const s2 = gen.generateFromTick(baseTickResult, 'bobby', { rng: rng2, simTime });

      expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
    });
  });

  describe('generateFromSignal simTime', () => {
    it('timestamp uses simTime when provided', () => {
      const gen = new StoryGenerator();
      const story = gen.generateFromSignal('test story', { joy: 0.5 }, 10, { simTime });

      expect(story.timestamp).toBe(simTime.getTime());
    });

    it('timestamp falls back to 0 without simTime (deterministic)', () => {
      const gen = new StoryGenerator();
      const story = gen.generateFromSignal('test story', null, 10);

      // Deterministic: no Date.now() fallback, uses 0 instead
      expect(story.timestamp).toBe(0);
    });

    it('same simTime → same timestamp', () => {
      const gen = new StoryGenerator();
      const s1 = gen.generateFromSignal('a', null, 1, { simTime });
      const s2 = gen.generateFromSignal('b', null, 1, { simTime });

      expect(s1.timestamp).toBe(s2.timestamp);
    });
  });

  describe('backward compatibility', () => {
    it('generateFromTick works without options', () => {
      const gen = new StoryGenerator();
      const stories = gen.generateFromTick(baseTickResult, 'bobby');
      expect(stories).toBeDefined();
      expect(stories.length).toBe(1);
      expect(stories[0].timestamp).toBeTypeOf('number');
    });

    it('generateFromSignal works without options', () => {
      const gen = new StoryGenerator();
      const story = gen.generateFromSignal('hello', null, 1);
      expect(story).toBeDefined();
      expect(story.timestamp).toBeTypeOf('number');
    });

    it('generateFromTick works with rng but no simTime', () => {
      const gen = new StoryGenerator();
      const rng = new RNG('test');
      const stories = gen.generateFromTick(baseTickResult, 'bobby', { rng });
      expect(stories).toBeDefined();
      expect(stories[0].timestamp).toBeTypeOf('number');
    });

    it('generateFromTick works with simTime but no rng', () => {
      const gen = new StoryGenerator();
      const stories = gen.generateFromTick(baseTickResult, 'bobby', { simTime });
      expect(stories).toBeDefined();
      expect(stories[0].timestamp).toBe(simTime.getTime());
    });
  });

  describe('social story with RNG', () => {
    it('social story with location uses rng for template selection', () => {
      const gen = new StoryGenerator();
      const rng1 = new RNG('social-seed');
      const rng2 = new RNG('social-seed');

      const s1 = gen.generateFromTick(socialTickResult, 'bobby', { rng: rng1, simTime });
      const s2 = gen.generateFromTick(socialTickResult, 'bobby', { rng: rng2, simTime });

      expect(s1).toEqual(s2);
      expect(s1[0].category).toBe('social');
    });
  });

  describe('emotion story with RNG', () => {
    it('emotion story determinism with seeded rng', () => {
      const gen = new StoryGenerator();
      const rng1 = new RNG('emotion-seed');
      const rng2 = new RNG('emotion-seed');

      const s1 = gen.generateFromTick(emotionTickResult, 'bobby', { rng: rng1, simTime });
      const s2 = gen.generateFromTick(emotionTickResult, 'bobby', { rng: rng2, simTime });

      expect(s1).toEqual(s2);
      expect(s1[0].emotionTag).toBe('happy');
    });
  });

  describe('mindWander story with RNG', () => {
    it('mindWander story determinism with seeded rng', () => {
      const gen = new StoryGenerator();
      const rng1 = new RNG('wander-seed');
      const rng2 = new RNG('wander-seed');

      const s1 = gen.generateFromTick(mindWanderTickResult, 'bobby', { rng: rng1, simTime });
      const s2 = gen.generateFromTick(mindWanderTickResult, 'bobby', { rng: rng2, simTime });

      expect(s1).toEqual(s2);
      expect(s1[0].category).toBe('thought');
    });
  });

  describe('full pipeline determinism', () => {
    it('state + social + emotion + mindWander all deterministic with same seed', () => {
      const gen = new StoryGenerator();
      const simTimeA = new Date('2026-06-21T14:00:00Z');

      const run = (seed) => {
        const rng = new RNG(seed);
        const results = [];
        results.push(...gen.generateFromTick(baseTickResult, 'bobby', { rng, simTime: simTimeA }));
        results.push(...gen.generateFromTick(socialTickResult, 'bobby', { rng, simTime: simTimeA }));
        results.push(...gen.generateFromTick(emotionTickResult, 'bobby', { rng, simTime: simTimeA }));
        results.push(...gen.generateFromTick(mindWanderTickResult, 'bobby', { rng, simTime: simTimeA }));
        return results;
      };

      const r1 = run('full-pipeline');
      const r2 = run('full-pipeline');

      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
      // All timestamps should be the simTime
      for (const s of r1) {
        expect(s.timestamp).toBe(simTimeA.getTime());
      }
    });
  });
});
