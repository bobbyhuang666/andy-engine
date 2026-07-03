/**
 * WorldPressure canonical module test
 *
 * Verifies that WorldPressure static methods work correctly.
 */

import { describe, it, expect } from 'vitest';
import { WorldPressure } from '../../src/pressure/WorldPressure.js';

describe('WorldPressure', () => {
  it('compute returns full pressure structure', () => {
    const pressure = WorldPressure.compute({
      world: { time: '2026-09-01T14:00:00Z' },
      agent: { position: 'library' },
      events: [],
    });

    expect(pressure).toHaveProperty('time');
    expect(pressure).toHaveProperty('location');
    expect(pressure).toHaveProperty('crowding');
    expect(pressure).toHaveProperty('event');
    expect(pressure).toHaveProperty('total');
  });

  it('computeTime delegates correctly', () => {
    const nightPressure = WorldPressure.computeTime({ time: '2026-09-01T02:00:00Z', hour: 2 });
    const dayPressure = WorldPressure.computeTime({ time: '2026-09-01T14:00:00Z', hour: 14 });
    expect(nightPressure).toBeGreaterThan(dayPressure);
  });

  it('computeLocation delegates correctly', () => {
    const pressure = WorldPressure.computeLocation({ position: 'any', locationPressure: 0.5 });
    expect(pressure).toBe(0.5);
  });

  it('computeCrowding delegates correctly', () => {
    const pressure = WorldPressure.computeCrowding({ position: 'library' });
    expect(typeof pressure).toBe('number');
  });

  it('computeEvent delegates correctly', () => {
    const events = [{ pressure: 0.3 }, { pressure: 0.2 }];
    const pressure = WorldPressure.computeEvent(events);
    expect(pressure).toBeCloseTo(0.5, 5);
  });

  it('all static methods are functions', () => {
    expect(typeof WorldPressure.compute).toBe('function');
    expect(typeof WorldPressure.computeTime).toBe('function');
    expect(typeof WorldPressure.computeLocation).toBe('function');
    expect(typeof WorldPressure.computeCrowding).toBe('function');
    expect(typeof WorldPressure.computeEvent).toBe('function');
  });
});
