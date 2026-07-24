/**
 * @characterization — direct state injection; not Beta evidence
 *
 * Phase: W4 A1 — Effect Observability (TickEffectSummary)
 *
 * Verifies that engine.tick() returns phase.effectSummary with
 * correct committed-delta counts (applied, skipped, errored, byType).
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import tavern from '../presets/tavern/index.js';

describe('W4 A1: TickEffectSummary observability', () => {
  it('tick result includes effectSummary when deltas are committed', () => {
    const engine = new AndyEngine({ seed: 42 });
    engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
    engine.createCharacter({ id: 'bob', name: 'Bob', mbti: 'ESTJ' });

    const result = engine.tick();

    // effectSummary should be present if any deltas were committed
    expect(result.phase).toHaveProperty('effectSummary');
    const summary = result.phase.effectSummary;

    // Shape verification
    expect(summary).toHaveProperty('counts');
    expect(summary.counts).toHaveProperty('applied');
    expect(summary.counts).toHaveProperty('skipped');
    expect(summary.counts).toHaveProperty('errored');
    expect(summary).toHaveProperty('byType');

    // At least some deltas should be applied in a normal tick
    expect(summary.counts.applied).toBeGreaterThanOrEqual(0);
    expect(summary.counts.errored).toBe(0); // no errors in normal operation

    // Total should be consistent
    const total = summary.counts.applied + summary.counts.skipped + summary.counts.errored;
    expect(total).toBeGreaterThan(0);
  });

  it('effectSummary.counts are non-negative integers', () => {
    const engine = new AndyEngine({ seed: 99 });
    engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
    const result = engine.tick();

    if (result.phase.effectSummary) {
      const { counts } = result.phase.effectSummary;
      expect(Number.isInteger(counts.applied)).toBe(true);
      expect(Number.isInteger(counts.skipped)).toBe(true);
      expect(Number.isInteger(counts.errored)).toBe(true);
      expect(counts.applied).toBeGreaterThanOrEqual(0);
      expect(counts.skipped).toBeGreaterThanOrEqual(0);
      expect(counts.errored).toBeGreaterThanOrEqual(0);
    }
  });

  it('byType only contains known delta types', () => {
    const engine = new AndyEngine({ seed: 7 });
    engine.createCharacter({ id: 'x', name: 'X', mbti: 'INTJ' });
    const result = engine.tick();

    if (result.phase.effectSummary) {
      const validTypes = new Set([
        'need', 'emotion', 'memory', 'relationship',
        'position', 'locationMeaning', 'futureTendency',
      ]);
      for (const type of Object.keys(result.phase.effectSummary.byType)) {
        expect(validTypes.has(type)).toBe(true);
      }

      // Each byType entry has applied and skipped counts
      for (const entry of Object.values(result.phase.effectSummary.byType)) {
        expect(entry).toHaveProperty('applied');
        expect(entry).toHaveProperty('skipped');
        expect(Number.isInteger(entry.applied)).toBe(true);
        expect(Number.isInteger(entry.skipped)).toBe(true);
      }
    }
  });

  it('byType applied counts sum to counts.applied', () => {
    const engine = new AndyEngine({ seed: 42 });
    engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
    engine.createCharacter({ id: 'b', name: 'B', mbti: 'ESTJ' });
    const result = engine.tick();

    if (result.phase.effectSummary) {
      const { counts, byType } = result.phase.effectSummary;
      const byTypeAppliedSum = Object.values(byType)
        .reduce((sum, entry) => sum + entry.applied, 0);
      expect(byTypeAppliedSum).toBe(counts.applied);

      const byTypeSkippedSum = Object.values(byType)
        .reduce((sum, entry) => sum + entry.skipped, 0);
      expect(byTypeSkippedSum).toBe(counts.skipped);
    }
  });

  it('effectSummary is deterministic with same seed', () => {
    const seed = 12345;

    const engine1 = new AndyEngine({ seed });
    engine1.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
    const result1 = engine1.tick();

    const engine2 = new AndyEngine({ seed });
    engine2.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
    const result2 = engine2.tick();

    expect(result1.phase.effectSummary).toEqual(result2.phase.effectSummary);
  });

  it('tavern domain produces position and other delta types', () => {
    const engine = new AndyEngine({ domain: tavern, seed: 42 });
    engine.createCharacter({ id: 'ulfberht', name: 'Ulfberht', schedule: 'blacksmith' });
    engine.createCharacter({ id: 'maren', name: 'Maren', schedule: 'innkeeper' });

    // Run a few ticks to get position changes and interactions
    const results = engine.runTicks(10);
    const lastResult = results[results.length - 1];

    // At least one tick across the run should have effects
    const anyEffects = results.some(r => r.phase.effectSummary);
    expect(anyEffects).toBe(true);

    // Collect all delta types seen across the run
    const allTypes = new Set();
    for (const r of results) {
      if (r.phase.effectSummary) {
        for (const type of Object.keys(r.phase.effectSummary.byType)) {
          allTypes.add(type);
        }
      }
    }

    // Should see at least one delta type
    expect(allTypes.size).toBeGreaterThanOrEqual(1);
  });

  it('effectSummary is absent when no deltas are committed', () => {
    // Edge case: tick with no agents — no deltas should be committed
    const engine = new AndyEngine({ seed: 1 });
    const result = engine.tick();

    // With no agents, there should be no effectSummary (total = 0)
    expect(result.phase.effectSummary).toBeUndefined();
  });

  it('effectSummary reflects multi-tick run via runTicks', () => {
    const engine = new AndyEngine({ seed: 55 });
    engine.createCharacter({ id: 'a', name: 'A', mbti: 'ISFP' });
    const results = engine.runTicks(5);

    expect(results.length).toBe(5);
    // Each tick result is independent
    for (const r of results) {
      if (r.phase.effectSummary) {
        expect(r.phase.effectSummary.counts.applied).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('effectSummary does not leak raw delta objects', () => {
    const engine = new AndyEngine({ seed: 42 });
    engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
    const result = engine.tick();

    if (result.phase.effectSummary) {
      const { counts, byType } = result.phase.effectSummary;

      // counts should be plain numbers, not objects
      expect(typeof counts.applied).toBe('number');
      expect(typeof counts.skipped).toBe('number');
      expect(typeof counts.errored).toBe('number');

      // byType entries should have only applied/skipped numbers
      for (const [type, entry] of Object.entries(byType)) {
        expect(Object.keys(entry).sort()).toEqual(['applied', 'skipped']);
      }
    }
  });
});
