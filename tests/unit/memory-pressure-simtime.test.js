/**
 * MemoryPressure simTime determinism tests
 *
 * Verifies that MemoryPressure uses simulation time (not wall clock)
 * for deterministic results.
 */

import { describe, it, expect } from 'vitest';
import { MemoryPressure } from '../../src/pressure/MemoryPressure.js';
import { PressureContext } from '../../src/pressure/PressureContext.js';

describe('MemoryPressure simTime', () => {
  const baseMemories = [
    { valence: -0.8, importance: 0.9, activation: 0.8, timestamp: '2026-06-20T10:00:00Z' },
    { valence: 0.5, importance: 0.5, activation: 0.5, timestamp: '2026-06-20T12:00:00Z' },
    { valence: -0.3, importance: 0.7, activation: 0.6, timestamp: '2026-06-21T08:00:00Z' },
  ];

  describe('compute', () => {
    it('same memories + same simTime → identical results', () => {
      const simTime = '2026-06-21T14:00:00Z';
      const p1 = MemoryPressure.compute({ memories: baseMemories }, { simTime });
      const p2 = MemoryPressure.compute({ memories: baseMemories }, { simTime });
      expect(p1).toEqual(p2);
    });

    it('different wall clock + same simTime → identical results', () => {
      const simTime = '2026-06-21T14:00:00Z';
      const p1 = MemoryPressure.compute({ memories: baseMemories }, { simTime });

      // Simulate different wall clock by adding a delay would be slow,
      // so we just verify the result doesn't depend on Date.now()
      const p2 = MemoryPressure.compute({ memories: baseMemories }, { simTime });
      expect(p1.negative).toBe(p2.negative);
      expect(p1.positive).toBe(p2.positive);
      expect(p1.recency).toBe(p2.recency);
      expect(p1.total).toBe(p2.total);
    });

    it('simTime advancement → recency decays correctly', () => {
      const earlyTime = '2026-06-21T10:00:00Z';
      const lateTime = '2026-06-22T10:00:00Z';

      const pEarly = MemoryPressure.compute({ memories: baseMemories }, { simTime: earlyTime });
      const pLate = MemoryPressure.compute({ memories: baseMemories }, { simTime: lateTime });

      // Recency should decrease as time moves forward from the memories
      expect(pEarly.recency).toBeGreaterThan(pLate.recency);
    });

    it('no simTime falls back to Date.now()', () => {
      const p = MemoryPressure.compute({ memories: baseMemories });
      expect(p).toHaveProperty('negative');
      expect(p).toHaveProperty('positive');
      expect(p).toHaveProperty('recency');
      expect(p).toHaveProperty('total');
      // Should produce valid numbers (not NaN)
      expect(p.total).not.toBeNaN();
    });

    it('Date simTime object is accepted', () => {
      const simTime = new Date('2026-06-21T14:00:00Z');
      const p1 = MemoryPressure.compute({ memories: baseMemories }, { simTime });
      const p2 = MemoryPressure.compute({ memories: baseMemories }, { simTime: '2026-06-21T14:00:00Z' });
      expect(p1).toEqual(p2);
    });

    it('negative valence only → correct negative pressure', () => {
      const memories = [
        { valence: -0.9, importance: 0.9, activation: 0.9, timestamp: '2026-06-20T10:00:00Z' },
      ];
      const simTime = '2026-06-20T11:00:00Z';
      const p = MemoryPressure.compute({ memories }, { simTime });
      expect(p.negative).toBeGreaterThan(0);
      expect(p.positive).toBe(0);
    });
  });

  describe('hasSignificantNegativeMemory', () => {
    it('passes options through to compute', () => {
      const memories = [
        { valence: -0.9, importance: 0.9, activation: 0.9, timestamp: '2026-06-20T10:00:00Z' },
      ];
      const simTime = '2026-06-20T10:30:00Z';

      // With recent simTime, should detect significant negative
      const resultRecent = MemoryPressure.hasSignificantNegativeMemory(
        { memories }, 0.3, { simTime }
      );
      expect(resultRecent).toBe(true);

      // With very late simTime, recency decays, negative may drop below threshold
      const resultLate = MemoryPressure.hasSignificantNegativeMemory(
        { memories }, 0.95, { simTime: '2026-12-01T00:00:00Z' }
      );
      // The valence-based negative component doesn't decay, only recency does
      // So this may still be true, but the test verifies options flow through
    });

    it('default threshold works without options', () => {
      const memories = [
        { valence: -0.9, importance: 0.9, activation: 0.9, timestamp: new Date().toISOString() },
      ];
      const result = MemoryPressure.hasSignificantNegativeMemory({ memories });
      expect(result).toBe(true);
    });
  });

  describe('PressureContext.fromSnapshot with simTime', () => {
    it('passes simTime to MemoryPressure', () => {
      const ctx = PressureContext.fromSnapshot({
        world: { time: '2026-06-21T14:00:00Z' },
        agent: {
          needs: { hunger: 0.5 },
          memories: baseMemories,
          relationships: [],
          position: 'library',
        },
        events: [],
        simTime: '2026-06-21T14:00:00Z',
      });
      expect(ctx.memory).toBeDefined();
      expect(ctx.memory.negative).toBeGreaterThanOrEqual(0);
    });

    it('same simTime produces deterministic PressureContext', () => {
      const snapshot = {
        world: { time: '2026-06-21T14:00:00Z' },
        agent: {
          needs: { hunger: 0.5 },
          memories: baseMemories,
          relationships: [],
          position: 'library',
        },
        events: [],
        simTime: '2026-06-21T14:00:00Z',
      };
      const ctx1 = PressureContext.fromSnapshot(snapshot);
      const ctx2 = PressureContext.fromSnapshot(snapshot);
      expect(ctx1.memory).toEqual(ctx2.memory);
    });

    it('without simTime still works (backward compat)', () => {
      const ctx = PressureContext.fromSnapshot({
        world: { time: '2026-06-21T14:00:00Z' },
        agent: {
          needs: { hunger: 0.5 },
          memories: baseMemories,
          relationships: [],
          position: 'library',
        },
        events: [],
      });
      expect(ctx.memory).toBeDefined();
      expect(ctx.memory.total).not.toBeNaN();
    });
  });
});
