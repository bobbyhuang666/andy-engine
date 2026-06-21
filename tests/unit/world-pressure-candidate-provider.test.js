/**
 * WorldPressureCandidateProvider tests
 */

import { describe, it, expect } from 'vitest';
import { WorldPressureCandidateProvider } from '../../src/action/providers/WorldPressureCandidateProvider.js';
import { CandidateProviderManager } from '../../src/action/providers/CandidateProviderManager.js';

describe('WorldPressureCandidateProvider', () => {
  const provider = new WorldPressureCandidateProvider();

  describe('name', () => {
    it('has correct name', () => {
      expect(provider.name).toBe('WorldPressureCandidateProvider');
    });
  });

  describe('empty/missing context', () => {
    it('returns [] when worldPressure is undefined', () => {
      expect(provider.generate({})).toEqual([]);
    });

    it('returns [] when worldPressure is null', () => {
      expect(provider.generate({ worldPressure: null })).toEqual([]);
    });

    it('returns [] when worldPressure is empty object', () => {
      expect(provider.generate({ worldPressure: {} })).toEqual([]);
    });

    it('returns [] when all pressures are 0', () => {
      expect(provider.generate({
        worldPressure: { time: 0, location: 0, crowding: 0, event: 0, total: 0 },
      })).toEqual([]);
    });
  });

  describe('crowding pressure', () => {
    it('generates move candidate when crowding > 0.3', () => {
      const result = provider.generate({
        worldPressure: { crowding: 0.4, time: 0, location: 0, event: 0, total: 0.4 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('move');
      expect(result[0].source).toBe('worldPressure');
      expect(result[0].target).toBe('crowding');
      expect(result[0].priority).toBeCloseTo(0.2);
    });

    it('ignores crowding <= 0.3', () => {
      const result = provider.generate({
        worldPressure: { crowding: 0.2, time: 0, location: 0, event: 0, total: 0.2 },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('time pressure', () => {
    it('generates rest candidate when time > 0.5', () => {
      const result = provider.generate({
        worldPressure: { time: 0.6, crowding: 0, location: 0, event: 0, total: 0 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('rest');
      expect(result[0].target).toBe('time');
    });

    it('ignores time <= 0.5', () => {
      const result = provider.generate({
        worldPressure: { time: 0.3, crowding: 0, location: 0, event: 0, total: 0.3 },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('location pressure', () => {
    it('generates move candidate when location > 0.3', () => {
      const result = provider.generate({
        worldPressure: { location: 0.5, crowding: 0, time: 0, event: 0, total: 0.5 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('move');
      expect(result[0].target).toBe('location');
    });
  });

  describe('event pressure', () => {
    it('generates observe candidate when event > 0.3', () => {
      const result = provider.generate({
        worldPressure: { event: 0.5, crowding: 0, time: 0, location: 0, total: 0.5 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('observe');
      expect(result[0].target).toBe('event');
    });
  });

  describe('total pressure', () => {
    it('generates reflect candidate when total > 0.6', () => {
      const result = provider.generate({
        worldPressure: { total: 0.8, crowding: 0, time: 0, location: 0, event: 0 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('reflect');
      expect(result[0].target).toBe('total');
    });
  });

  describe('max 2 candidates', () => {
    it('caps at 2 candidates even with multiple high pressures', () => {
      const result = provider.generate({
        worldPressure: { crowding: 0.5, time: 0.6, location: 0.5, event: 0.5, total: 0.8 },
      });
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('returns exactly 2 when first 2 rules match', () => {
      const result = provider.generate({
        worldPressure: { crowding: 0.5, time: 0.6, location: 0, event: 0, total: 0 },
      });
      expect(result).toHaveLength(2);
      expect(result[0].target).toBe('crowding');
      expect(result[1].target).toBe('time');
    });
  });

  describe('priority', () => {
    it('priority = value / 2, capped at 1.0', () => {
      const result = provider.generate({
        worldPressure: { crowding: 0.8, time: 0, location: 0, event: 0, total: 0 },
      });
      expect(result[0].priority).toBeCloseTo(0.4);
    });

    it('priority capped at 1.0', () => {
      const result = provider.generate({
        worldPressure: { total: 2.5, crowding: 0, time: 0, location: 0, event: 0 },
      });
      expect(result[0].priority).toBe(1.0);
    });
  });

  describe('read-only (no mutation)', () => {
    it('does not modify context', () => {
      const ctx = {
        worldPressure: { crowding: 0.5, time: 0, location: 0, event: 0, total: 0.5 },
        currentRegion: 'library',
      };
      const before = JSON.stringify(ctx);
      provider.generate(ctx);
      expect(JSON.stringify(ctx)).toBe(before);
    });
  });

  describe('custom domain (no campus leakage)', () => {
    it('uses generic pressure keys, no campus-specific terms', () => {
      const result = provider.generate({
        worldPressure: { crowding: 0.4, time: 0, location: 0, event: 0, total: 0.4 },
      });
      const json = JSON.stringify(result);
      expect(json).not.toContain('campus');
      expect(json).not.toContain('dorm');
      expect(json).not.toContain('canteen');
    });
  });

  describe('non-numeric pressure values', () => {
    it('ignores non-numeric values', () => {
      const result = provider.generate({
        worldPressure: { crowding: 'high', time: null, location: undefined, event: NaN, total: 0 },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('integration with CandidateProviderManager', () => {
    it('manager includes WorldPressureCandidateProvider', () => {
      const manager = new CandidateProviderManager();
      const names = manager.providers.map(p => p.name);
      expect(names).toContain('WorldPressureCandidateProvider');
    });

    it('manager generates worldPressure candidates', () => {
      const manager = new CandidateProviderManager();
      const result = manager.generateAll({
        worldPressure: { crowding: 0.5, time: 0, location: 0, event: 0, total: 0.5 },
        behaviorField: { label: 'idle', B: [0.5, 0.5, 0.5, 0.5] },
        needs: { hunger: 0.5, energy: 0.5, social: 0.5, fun: 0.5, comfort: 0.5 },
        currentHour: 14,
        dayOfWeek: 1,
      });
      const wpCandidates = result.filter(c => c.source === 'worldPressure');
      expect(wpCandidates.length).toBeGreaterThan(0);
    });
  });
});
